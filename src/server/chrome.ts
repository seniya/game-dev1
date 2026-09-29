import { z } from 'zod';
import { Simulation } from '../sim/engine';
import { CHROME_CONTEXT_VERSION, CHROME_DAILY_LIMIT, CHROME_LEASE_MS, CHROME_MODEL, CHROME_OUTPUT_LIMIT, chromeContext, renderChromeResult, validateChromeResult, type ChromeContext, type ChromeLease, type ChromeResult } from '../llm/chrome-contract';
import { Conflict, WorldStore } from './store';
import { compactWorld, type StoredWorld } from './world';
import { utcDay } from './ai';

interface Job {
  id: string; epoch: string; generation: string; request: string; context: string; hash: string;
  status: string; attempts: number; token: string | null; expires: number; result: string | null; error: string | null;
}
type Outcome = { ok: true; value: ChromeResult } | { ok: false; error: string };
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
    if (outcome.ok) {
      const context = JSON.parse(job.context) as ChromeContext;
      // Recheck persisted codes and evidence, then the engine verifies current life/memory/request validity.
      const value = validateChromeResult(JSON.stringify(outcome.value), context);
      const evidence = [...new Set(value.goals.flatMap(g => g.evidence))];
      status = sim.applyInterpretation(job.request, renderChromeResult(value, context), { evidence, model: CHROME_MODEL }) ? 'applied' : 'rejected';
    } else sim.failDecision(job.request, `chrome:${outcome.error}`, false);
    const state = sim.snapshot(), events = state.events.filter(e => !before.has(e.id));
    try {
      await store.commit({ ...current, revision: current.revision + 1, state: compactWorld(state), meta: { ...current.meta, eventCount: current.meta.eventCount + events.length } }, events, `chrome:${job.id}`, `chrome:${job.id}`, [
        store.db.prepare("UPDATE chrome_jobs SET status=?,updated=? WHERE id=? AND status='ready'").bind(status, now, job.id), ...guard(store),
      ]); return;
    } catch (error) { if (!(error instanceof Conflict)) throw error; }
  }
}
/** Bounded maintenance runs even without any active browser. No provider is called here. */
export async function processChrome(store: WorldStore, now = Date.now()): Promise<Job | null> {
  const current = await store.read();
  await store.db.batch([store.db.prepare("UPDATE chrome_jobs SET status='stale',updated=? WHERE status IN ('pending','running','ready') AND (epoch<>? OR generation<>?)").bind(now, current.epoch, generation(current))]);
  if (current.meta.aiMode !== 'chrome' || !current.state.llm.enabled) return null;
  const request = current.state.llm.queue[0]; if (!request) return null;
  const context = chromeContext(current.state, request.id), body = JSON.stringify(context), hash = await digest(body);
  await store.db.batch([store.db.prepare("INSERT OR IGNORE INTO chrome_jobs(id,epoch,generation,request,context,hash,status,result,error,created,updated) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM world WHERE epoch=? AND revision=?)")
    .bind(crypto.randomUUID(), current.epoch, generation(current), request.id, body, hash, context ? 'pending' : 'ready', context ? null : JSON.stringify({ ok: false, error: 'unsupported_context' }), context ? null : 'unsupported_context', now, now, current.epoch, current.revision)]);
  let job = await store.db.prepare('SELECT * FROM chrome_jobs WHERE epoch=? AND generation=? AND request=?').bind(current.epoch, generation(current), request.id).first<Job>();
  if (!job) return null;
  if (job.status === 'running' && job.expires <= now && job.attempts >= 3) {
    await store.db.batch([
      store.db.prepare("UPDATE chrome_jobs SET status='ready',result=?,error='lease_expired',updated=? WHERE id=? AND status='running' AND expires<=? AND attempts>=3").bind(JSON.stringify({ ok: false, error: 'lease_expired' }), now, job.id, now),
      store.db.prepare("UPDATE chrome_calls SET outcome='lease_expired' WHERE token=? AND outcome IS NULL").bind(job.token),
    ]);
    job = (await store.db.prepare('SELECT * FROM chrome_jobs WHERE id=?').bind(job.id).first<Job>())!;
  }
  if (job.status === 'ready') { await applyReady(store, job, now); return null; }
  return job;
}
export async function claimChrome(store: WorldStore, now = Date.now()): Promise<ChromeLease | null> {
  const job = await processChrome(store, now); if (!job || !['pending', 'running'].includes(job.status) || job.expires > now || job.attempts >= 3) return null;
  const token = crypto.randomUUID(), expires = now + CHROME_LEASE_MS;
  try {
    await store.db.batch([
      store.db.prepare('INSERT INTO chrome_lock VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,expires=excluded.expires WHERE chrome_lock.expires<=?').bind(token, expires, now), ...guard(store),
      store.db.prepare('INSERT INTO chrome_calls(token,job,day,started) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM chrome_calls WHERE day=?)<?').bind(token, job.id, utcDay(now), now, utcDay(now), CHROME_DAILY_LIMIT), ...guard(store),
      store.db.prepare("UPDATE chrome_calls SET outcome='lease_expired' WHERE job=? AND token<>? AND outcome IS NULL").bind(job.id, token),
      store.db.prepare("UPDATE chrome_jobs SET status='running',token=?,expires=?,attempts=attempts+1,updated=? WHERE id=? AND status IN ('pending','running') AND expires<=? AND attempts<3 AND EXISTS(SELECT 1 FROM world WHERE epoch=? AND json_extract(meta,'$.aiGeneration')=? AND json_extract(meta,'$.aiMode')='chrome')")
        .bind(token, expires, now, job.id, now, job.epoch, job.generation), ...guard(store),
    ]);
  } catch (e) { if (/CHECK constraint/.test(String(e))) return null; throw e; }
  return { id: job.id, epoch: job.epoch, generation: job.generation, hash: job.hash, version: CHROME_CONTEXT_VERSION, token, expires, context: JSON.parse(job.context) };
}
const envelope = { id: z.string().uuid(), epoch: z.string().max(100), generation: z.string().max(100), hash: z.string().length(64), version: z.literal(CHROME_CONTEXT_VERSION), token: z.string().uuid() };
export const chromeSubmissionSchema = z.union([
  z.object({ ...envelope, output: z.string().max(CHROME_OUTPUT_LIMIT) }).strict(),
  z.object({ ...envelope, error: z.enum(['timeout', 'cancelled', 'device_error', 'output_too_large', 'context_limit']) }).strict(),
]);
export async function submitChrome(store: WorldStore, input: z.infer<typeof chromeSubmissionSchema>, now = Date.now()): Promise<{ status: number; state: string }> {
  const job = await store.db.prepare('SELECT * FROM chrome_jobs WHERE id=?').bind(input.id).first<Job>();
  if (!job || job.token !== input.token || job.epoch !== input.epoch || job.generation !== input.generation || job.hash !== input.hash || job.expires <= now || !activeMode(await store.read(), job)) return { status: 409, state: 'stale_lease' };
  let outcome: Outcome;
  if ('error' in input) outcome = { ok: false, error: input.error };
  else {
    try { outcome = { ok: true, value: validateChromeResult(input.output, JSON.parse(job.context)) }; }
    catch { outcome = { ok: false, error: 'invalid_output' }; }
  }
  const result = JSON.stringify(outcome);
  if (job.status !== 'running') {
    if (job.result !== result || !['ready', 'applied', 'failed', 'rejected'].includes(job.status)) return { status: 409, state: 'stale_lease' };
  } else {
    try {
      await store.db.batch([
        store.db.prepare("UPDATE chrome_jobs SET status='ready',result=?,error=?,updated=? WHERE id=? AND token=? AND expires>? AND status='running' AND EXISTS(SELECT 1 FROM world WHERE epoch=? AND json_extract(meta,'$.aiGeneration')=? AND json_extract(meta,'$.aiMode')='chrome')")
          .bind(result, outcome.ok ? null : outcome.error, now, job.id, input.token, now, job.epoch, job.generation), ...guard(store),
        store.db.prepare('UPDATE chrome_calls SET outcome=? WHERE token=?').bind(result, input.token),
        store.db.prepare('UPDATE chrome_lock SET expires=? WHERE token=?').bind(now, input.token),
      ]);
    } catch (e) { if (/CHECK constraint/.test(String(e))) return { status: 409, state: 'stale_lease' }; throw e; }
  }
  const saved = (await store.db.prepare('SELECT * FROM chrome_jobs WHERE id=?').bind(job.id).first<Job>())!;
  if (saved.status === 'ready') await applyReady(store, saved, now);
  const final = (await store.db.prepare('SELECT status FROM chrome_jobs WHERE id=?').bind(job.id).first<{ status: string }>())!;
  return { status: !outcome.ok && outcome.error === 'invalid_output' ? 422 : 200, state: final.status };
}
