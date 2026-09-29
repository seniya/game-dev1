import { z } from 'zod';
import { Simulation } from '../sim/engine';
import { CHROME_CONTEXT_VERSION, CHROME_COLLECT_MS, CHROME_REST_MS, CHROME_HOURLY_LIMIT, CHROME_DAILY_LIMIT, ChromeValidationError, relevantChromeContext, CHROME_LEASE_MS, CHROME_MODEL, CHROME_OUTPUT_LIMIT, chromeContext, renderChromeResult, validateChromeResult, type ChromeContext, type ChromeLease, type ChromeResult } from '../llm/chrome-contract';
import { Conflict, WorldStore } from './store';
import { compactWorld, type StoredWorld } from './world';
import { utcDay } from './ai';
import { chromeSchedule } from './chrome-schedule';

interface Job {
  id: string; epoch: string; generation: string; request: string; context: string; hash: string;
  batchRequests?: string; created: number; updated: number; status: string; attempts: number; token: string | null; expires: number; result: string | null; error: string | null;
}
type Outcome = { ok: true; value: ChromeResult } | { ok: false; error: string; reason?: string };
interface Batch { requests: string; npc: string; topic: string }
const members = async (store: WorldStore, job: Job) => JSON.parse((await store.db.prepare('SELECT requests FROM chrome_batches WHERE job=?').bind(job.id).first<Batch>())?.requests ?? JSON.stringify([job.request])) as string[];
const generation = (w: StoredWorld) => w.meta.aiGeneration ?? 'legacy';
const activeMode = (w: StoredWorld, j: Job) => w.epoch === j.epoch && generation(w) === j.generation && w.meta.aiMode === 'chrome' && w.state.llm.enabled;
const guard = (store: WorldStore) => [store.db.prepare('INSERT INTO commit_guard VALUES(changes())'), store.db.prepare('DELETE FROM commit_guard')];
const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(b => b.toString(16).padStart(2, '0')).join('');
async function applyReady(store: WorldStore, job: Job, now: number) {
  const outcome = JSON.parse(job.result!) as Outcome;
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await store.read();
    if (!activeMode(current, job) || !current.state.llm.queue.some(q => q.id === job.request)) {
      await store.db.batch([store.db.prepare("UPDATE chrome_jobs SET status='stale',updated=? WHERE id=? AND status='ready'").bind(now, job.id)]); return;
    }
    const sim = Simulation.load(JSON.stringify(current.state)), before = new Set(current.state.events.map(e => e.id));
    let status = 'failed';
    const ids = await members(store, job);
    if (outcome.ok) {
      const context = JSON.parse(job.context) as ChromeContext;
      // Recheck persisted codes and evidence, then the engine verifies current life/memory/request validity.
      const value = validateChromeResult(JSON.stringify(outcome.value), context);
      const evidence = [...new Set(value.goals.flatMap(g => g.evidence))];
      const relevant = relevantChromeContext(current.state, context);
      if (value.goals.some(g => !relevant.allowedGoals.includes(g.kind))) {
        status = 'skipped'; sim.closeChromeRequests(ids, 'no_longer_needed', job.request);
      } else status = sim.applyInterpretation(job.request, renderChromeResult(value, context), { evidence, model: CHROME_MODEL }) ? 'applied' : 'rejected';
    } else if (outcome.error === 'no_longer_needed') {
      status = 'skipped'; sim.closeChromeRequests(ids, outcome.error, job.request);
    } else sim.failDecision(job.request, `chrome:${outcome.reason ?? outcome.error}`, false);
    sim.closeChromeRequests(ids.filter(id => id !== job.request), 'merged', job.request);
    const state = sim.snapshot(), events = state.events.filter(e => !before.has(e.id));
    try {
      await store.commit({ ...current, revision: current.revision + 1, state: compactWorld(state), meta: { ...current.meta, eventCount: current.meta.eventCount + events.length } }, events, `chrome:${job.id}`, `chrome:${job.id}`, [
        store.db.prepare("UPDATE chrome_jobs SET status=?,updated=? WHERE id=? AND status='ready'").bind(status, now, job.id), ...guard(store),
      ]); return;
    } catch (error) { if (!(error instanceof Conflict)) throw error; }
  }
}
/** Reconcile at most the bounded 24-request queue. No model calls or wall clock in the engine. */
export async function processChrome(store: WorldStore, now = Date.now()): Promise<Job | null> {
  const current = await store.read();
  await store.db.batch([store.db.prepare("UPDATE chrome_jobs SET status='stale',updated=? WHERE status IN ('pending','running','ready') AND (epoch<>? OR generation<>?)").bind(now, current.epoch, generation(current))]);
  if (current.meta.aiMode !== 'chrome' || !current.state.llm.enabled) return null;
  const existing = (await store.db.prepare("SELECT j.*, b.requests AS batchRequests FROM chrome_jobs j LEFT JOIN chrome_batches b ON b.job=j.id WHERE j.epoch=? AND j.generation=? AND j.status IN ('pending','running','ready') ORDER BY j.created,j.id").bind(current.epoch, generation(current)).all<Job>()).results;
  const frozen = new Set<string>();
  for (const job of existing) {
    if (job.status === 'ready') { await applyReady(store, job, now); return null; }
    if (job.attempts > 0) {
      (await members(store, job)).forEach(id => frozen.add(id));
      if (job.status === 'running' && job.expires <= now && job.attempts >= 3) {
        await store.db.batch([
          store.db.prepare("UPDATE chrome_jobs SET status='ready',result=?,error='lease_expired',updated=? WHERE id=? AND status='running' AND expires<=? AND attempts>=3").bind(JSON.stringify({ ok: false, error: 'lease_expired' }), now, job.id, now),
          store.db.prepare("UPDATE chrome_calls SET outcome='lease_expired' WHERE token=? AND outcome IS NULL").bind(job.token),
        ]);
        const saved = (await store.db.prepare('SELECT * FROM chrome_jobs WHERE id=?').bind(job.id).first<Job>())!;
        if (saved.status === 'ready') await applyReady(store, saved, now);
        return null;
      }
    }
  }
  const groups = new Map<string, { requests: string[]; events: string[]; npc: string; topic: string }>();
  for (const q of current.state.llm.queue) {
    if (frozen.has(q.id)) continue;
    const context = chromeContext(current.state, q.id);
    const topic = context?.choices[0]?.reasonCode ?? `unsupported:${q.id}`, key = `${q.npcId}:${topic}`;
    let group = groups.get(key);
    if (!group) { group = { requests: [], events: [], npc: q.npcId, topic }; groups.set(key, group); }
    group.requests.push(q.id); group.events.push(q.eventId);
  }
  const candidates: Job[] = existing.filter(j => j.attempts > 0 && j.expires <= now);
  for (const group of groups.values()) {
    const request = group.requests[0], raw = chromeContext(current.state, request, group.events);
    const context = raw ? relevantChromeContext(current.state, raw) : null;
    const error = !context ? 'unsupported_context' : !context.choices.length ? 'no_longer_needed' : null;
    const previous = existing.find(j => j.request === request && j.status === 'pending' && j.attempts === 0);
    if (!error && previous?.batchRequests === JSON.stringify(group.requests)) {
      // Avoid rewriting all waiting contexts on every observation tick. The chosen
      // job is refreshed against current state immediately before reservation.
      candidates.push(previous); continue;
    }
    const body = JSON.stringify(context), hash = await digest(JSON.stringify({ context, requests: group.requests })), id = crypto.randomUUID();
    try {
      await store.db.batch([
        store.db.prepare("INSERT OR IGNORE INTO chrome_jobs(id,epoch,generation,request,context,hash,status,created,updated) SELECT ?,?,?,?,?,?,'pending',?,? WHERE EXISTS(SELECT 1 FROM world WHERE epoch=? AND revision=?)").bind(id, current.epoch, generation(current), request, body, hash, now, now, current.epoch, current.revision),
        store.db.prepare("UPDATE chrome_jobs SET context=?,hash=?,status=?,result=?,error=?,updated=? WHERE epoch=? AND generation=? AND request=? AND status='pending' AND attempts=0 AND EXISTS(SELECT 1 FROM world WHERE epoch=? AND revision=?)").bind(body, hash, error ? 'ready' : 'pending', error ? JSON.stringify({ ok: false, error }) : null, error, now, current.epoch, generation(current), request, current.epoch, current.revision), ...guard(store),
        store.db.prepare("INSERT INTO chrome_batches(job,requests,npc,topic) SELECT id,?,?,? FROM chrome_jobs WHERE epoch=? AND generation=? AND request=? ON CONFLICT(job) DO UPDATE SET requests=excluded.requests,npc=excluded.npc,topic=excluded.topic").bind(JSON.stringify(group.requests), group.npc, group.topic, current.epoch, generation(current), request),
      ]);
    } catch (e) { if (/CHECK constraint/.test(String(e))) return null; throw e; }
    const job = await store.db.prepare('SELECT * FROM chrome_jobs WHERE epoch=? AND generation=? AND request=?').bind(current.epoch, generation(current), request).first<Job>();
    if (!job) continue;
    if (job.status === 'ready') { await applyReady(store, job, now); return null; }
    if (job.status === 'pending') candidates.push(job);
  }
  // Waiting time prevents starvation; recent service reduces one resident's dominance.
  const served = (await store.db.prepare('SELECT b.npc, MAX(c.started) AS last FROM chrome_calls c JOIN chrome_batches b ON b.job=c.job WHERE c.started>? GROUP BY b.npc').bind(now - 1_800_000).all<{ npc: string; last: number }>()).results;
  const score = (j: Job) => {
    const c = JSON.parse(j.context) as ChromeContext;
    const importance = current.state.events.find(e => e.id === c.trigger.id)?.importance ?? 0;
    const sinceService = now - (served.find(s => s.npc === c.npcId)?.last ?? 0);
    const recency = Math.max(0, 10 - (current.state.tick - c.trigger.tick) / 144);
    return importance + recency + (now - j.created) / 60_000 + Math.min(30, sinceService / 60_000);
  };
  return candidates.filter(j => j.created + CHROME_COLLECT_MS <= now).sort((a, b) => score(b) - score(a) || a.created - b.created || a.id.localeCompare(b.id))[0] ?? null;
}
export async function claimChrome(store: WorldStore, now = Date.now()): Promise<ChromeLease | null> {
  let job = await processChrome(store, now);
  if (!job || job.attempts >= 3 || job.expires > now || (await chromeSchedule(store.db, now)).nextAt > now) return null;
  if (job.attempts === 0) {
    const current = await store.read(), ids = await members(store, job);
    const raw = chromeContext(current.state, job.request, current.state.llm.queue.filter(q => ids.includes(q.id)).map(q => q.eventId));
    if (!raw || !activeMode(current, job)) return null;
    const context = relevantChromeContext(current.state, raw);
    if (!context.choices.length) return null;
    const body = JSON.stringify(context), hash = await digest(JSON.stringify({ context, requests: ids }));
    try {
      await store.db.batch([
        store.db.prepare("UPDATE chrome_jobs SET context=?,hash=? WHERE id=? AND hash=? AND attempts=0 AND status='pending' AND EXISTS(SELECT 1 FROM world WHERE epoch=? AND revision=?)").bind(body, hash, job.id, job.hash, current.epoch, current.revision), ...guard(store),
      ]);
    } catch (e) { if (/CHECK constraint/.test(String(e))) return null; throw e; }
    job = { ...job, context: body, hash };
  }
  const token = crypto.randomUUID(), expires = now + CHROME_LEASE_MS;
  try {
    await store.db.batch([
      store.db.prepare('UPDATE chrome_schedule SET next_after=? WHERE id=1 AND next_after<=?').bind(expires + CHROME_REST_MS, now), ...guard(store),
      store.db.prepare('INSERT INTO chrome_lock VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,expires=excluded.expires WHERE chrome_lock.expires<=?').bind(token, expires, now), ...guard(store),
      store.db.prepare('INSERT INTO chrome_calls(token,job,day,started) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM chrome_calls WHERE day=?)<? AND (SELECT COUNT(*) FROM chrome_calls WHERE started>?)<?').bind(token, job.id, utcDay(now), now, utcDay(now), CHROME_DAILY_LIMIT, now - 3_600_000, CHROME_HOURLY_LIMIT), ...guard(store),
      store.db.prepare("UPDATE chrome_calls SET outcome='lease_expired' WHERE job=? AND token<>? AND outcome IS NULL").bind(job.id, token),
      store.db.prepare("UPDATE chrome_jobs SET status='running',token=?,expires=?,attempts=attempts+1,updated=? WHERE id=? AND hash=? AND status IN ('pending','running') AND expires<=? AND attempts<3 AND EXISTS(SELECT 1 FROM world WHERE epoch=? AND json_extract(meta,'$.aiGeneration')=? AND json_extract(meta,'$.aiMode')='chrome')")
        .bind(token, expires, now, job.id, job.hash, now, job.epoch, job.generation), ...guard(store),
    ]);
  } catch (e) { if (/CHECK constraint/.test(String(e))) return null; throw e; }
  return { id: job.id, epoch: job.epoch, generation: job.generation, hash: job.hash, version: CHROME_CONTEXT_VERSION, token, expires, context: JSON.parse(job.context) };
}
const envelope = { id: z.string().uuid(), epoch: z.string().max(100), generation: z.string().max(100), hash: z.string().length(64), version: z.literal(CHROME_CONTEXT_VERSION), token: z.string().uuid() };
export const chromeSubmissionSchema = z.union([
  z.object({ ...envelope, output: z.string().max(CHROME_OUTPUT_LIMIT) }).strict(),
  z.object({ ...envelope, error: z.enum(['timeout', 'cancelled', 'device_error', 'output_too_large', 'context_limit']) }).strict(),
]);
export async function submitChrome(store: WorldStore, input: z.infer<typeof chromeSubmissionSchema>, now = Date.now()): Promise<{ status: number; state: string; reason?: string }> {
  const job = await store.db.prepare('SELECT * FROM chrome_jobs WHERE id=?').bind(input.id).first<Job>();
  if (!job || job.token !== input.token || job.epoch !== input.epoch || job.generation !== input.generation || job.hash !== input.hash || job.expires <= now || !activeMode(await store.read(), job)) return { status: 409, state: 'stale_lease' };
  let outcome: Outcome;
  if ('error' in input) outcome = { ok: false, error: input.error };
  else {
    try { outcome = { ok: true, value: validateChromeResult(input.output, JSON.parse(job.context)) }; }
    catch (error) { outcome = { ok: false, error: 'invalid_output', reason: error instanceof ChromeValidationError ? error.code : 'invalid_shape' }; }
  }
  const result = JSON.stringify(outcome);
  if (job.status !== 'running') {
    if (job.result !== result || !['ready', 'applied', 'failed', 'rejected', 'skipped'].includes(job.status)) return { status: 409, state: 'stale_lease' };
  } else {
    try {
      await store.db.batch([
        store.db.prepare("UPDATE chrome_jobs SET status='ready',result=?,error=?,updated=? WHERE id=? AND token=? AND expires>? AND status='running' AND EXISTS(SELECT 1 FROM world WHERE epoch=? AND json_extract(meta,'$.aiGeneration')=? AND json_extract(meta,'$.aiMode')='chrome')")
          .bind(result, outcome.ok ? null : outcome.error, now, job.id, input.token, now, job.epoch, job.generation), ...guard(store),
        store.db.prepare('UPDATE chrome_calls SET outcome=? WHERE token=?').bind(result, input.token),
        store.db.prepare('UPDATE chrome_lock SET expires=? WHERE token=?').bind(now, input.token),
        store.db.prepare('UPDATE chrome_schedule SET next_after=? WHERE id=1 AND EXISTS(SELECT 1 FROM chrome_lock WHERE token=?)').bind(now + CHROME_REST_MS, input.token),
      ]);
    } catch (e) { if (/CHECK constraint/.test(String(e))) return { status: 409, state: 'stale_lease' }; throw e; }
  }
  const saved = (await store.db.prepare('SELECT * FROM chrome_jobs WHERE id=?').bind(job.id).first<Job>())!;
  if (saved.status === 'ready') await applyReady(store, saved, now);
  const final = (await store.db.prepare('SELECT status FROM chrome_jobs WHERE id=?').bind(job.id).first<{ status: string }>())!;
  return { status: !outcome.ok && outcome.error === 'invalid_output' ? 422 : 200, state: final.status, ...(!outcome.ok && outcome.reason ? { reason: outcome.reason } : {}) };
}
