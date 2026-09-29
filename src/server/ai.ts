import { chromeSchedule } from './chrome-schedule';
import { CHROME_DAILY_LIMIT } from '../llm/chrome-contract';
import type { D1Database } from '@cloudflare/workers-types';
import { Simulation } from '../sim/engine';
import type { DialogueContext, NPCContext } from '../sim/types';
import { compactWorld, type StoredWorld } from './world';
import { Conflict, WorldStore } from './store';
import { ModelError, ServerModelProvider, modelConfig, MODEL_OUTPUT_LIMIT, type ModelEnv, type GroundedDialogue, type GroundedInterpretation } from './model';

interface Job {
  id: string; epoch: string; generation: string; request: string; kind: 'interpretation' | 'dialogue';
  context: string; status: string; attempts: number; next_attempt: number; result: string | null;
  error: string | null; model: string; created: number; updated: number;
}
type Outcome = { ok: true; value: GroundedInterpretation | GroundedDialogue } | { ok: false; error: string; retryable: boolean };
export const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);
const generation = (w: StoredWorld) => w.meta.aiGeneration ?? 'legacy';
function active(w: StoredWorld, job: Job) {
  return w.epoch === job.epoch && generation(w) === job.generation && w.meta.aiMode === 'remote' && w.state.llm.enabled &&
    (job.kind === 'dialogue' ? w.meta.dialogue?.id === job.request : w.state.llm.queue.some(q => q.id === job.request));
}
export async function aiStatus(db: D1Database, env: ModelEnv, now = Date.now()) {
  const config = modelConfig(env), day = utcDay(now);
  const usage = await db.prepare('SELECT COUNT(*) AS calls, COALESCE(SUM(input_tokens),0) AS inputTokens, COALESCE(SUM(output_tokens),0) AS outputTokens FROM ai_calls WHERE day=?').bind(day).first();
  const jobs = await db.prepare('SELECT id,epoch,request,kind,status,attempts,error,model,created,updated FROM ai_jobs ORDER BY created DESC,id DESC LIMIT 20').all();
  const chromeUsage = await db.prepare('SELECT COUNT(*) AS calls FROM chrome_calls WHERE day=?').bind(day).first();
  const chromeJobs = await db.prepare('SELECT id,epoch,status,attempts,error,created,updated FROM chrome_jobs ORDER BY created DESC,id DESC LIMIT 20').all();
  return { chrome: { schedule: await chromeSchedule(db, now), dailyLimit: CHROME_DAILY_LIMIT, usage: chromeUsage, jobs: chromeJobs.results }, configured: !!config, model: config?.model ?? null, day, dailyLimit: config?.dailyLimit ?? 24, maxOutputTokens: MODEL_OUTPUT_LIMIT, usage, jobs: jobs.results };
}

async function ensureJob(store: WorldStore, w: StoredWorld, model: string, now: number): Promise<Job | null> {
  let context: NPCContext | DialogueContext, request: string, kind: Job['kind'];
  if (w.meta.dialogue) {
    const d = w.meta.dialogue, speaker = w.state.npcs.find(n => n.id === d.speakerId), listener = w.state.npcs.find(n => n.id === d.listenerId);
    if (!speaker || !listener) return null;
    context = { speaker, listener, memories: speaker.memories.filter(m => m.relatedNpcIds.includes(listener.id)).slice(-8) }; request = d.id; kind = 'dialogue';
  } else {
    const next = Simulation.load(JSON.stringify(w.state)).decisionContext(); if (!next) return null;
    context = next.context; request = next.requestId; kind = 'interpretation';
  }
  await store.db.batch([store.db.prepare("INSERT OR IGNORE INTO ai_jobs(id,epoch,generation,request,kind,context,status,model,created,updated) VALUES(?,?,?,?,?,?,'pending',?,?,?)")
    .bind(crypto.randomUUID(), w.epoch, generation(w), request, kind, JSON.stringify(context), model, now, now)]);
  return store.db.prepare('SELECT * FROM ai_jobs WHERE epoch=? AND generation=? AND request=?').bind(w.epoch, generation(w), request).first<Job>();
}

// The global lease, UTC budget reservation and attempt are one transaction across Worker instances.
async function reserve(store: WorldStore, job: Job, limit: number, now: number): Promise<string | null> {
  const token = crypto.randomUUID(), db = store.db;
  try {
    await db.batch([
      db.prepare('INSERT INTO ai_lock VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,expires=excluded.expires WHERE ai_lock.expires<=?').bind(token, now + 20_000, now),
      db.prepare('INSERT INTO commit_guard VALUES(changes())'), db.prepare('DELETE FROM commit_guard'),
      db.prepare('INSERT INTO ai_calls(id,job,day,started) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM ai_calls WHERE day=?)<?').bind(token, job.id, utcDay(now), now, utcDay(now), limit),
      db.prepare('INSERT INTO commit_guard VALUES(changes())'), db.prepare('DELETE FROM commit_guard'),
      db.prepare("UPDATE ai_jobs SET status='running',attempts=attempts+1,next_attempt=?,updated=? WHERE id=? AND status IN ('pending','running') AND attempts<3 AND next_attempt<=? AND EXISTS(SELECT 1 FROM world WHERE epoch=? AND json_extract(meta,'$.aiGeneration')=? AND json_extract(meta,'$.aiMode')='remote')").bind(now + 20_000, now, job.id, now, job.epoch, job.generation),
      db.prepare('INSERT INTO commit_guard VALUES(changes())'), db.prepare('DELETE FROM commit_guard'),
    ]);
    return token;
  } catch (error) { if (/CHECK constraint/.test(String(error))) return null; throw error; }
}

async function applyReady(store: WorldStore, job: Job, now: number) {
  const outcome = JSON.parse(job.result!) as Outcome, db = store.db;
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await store.read();
    if (!active(current, job)) {
      await db.batch([db.prepare("UPDATE ai_jobs SET status='stale',updated=? WHERE id=? AND status='ready'").bind(now, job.id)]); return;
    }
    const sim = Simulation.load(JSON.stringify(current.state)), before = new Set(current.state.events.map(e => e.id));
    const meta = { ...current.meta }; let status = 'failed';
    if (outcome.ok) {
      if (job.kind === 'interpretation') {
        const { evidence, ...result } = outcome.value as GroundedInterpretation;
        status = sim.applyInterpretation(job.request, result, { evidence, model: job.model }) ? 'applied' : 'rejected';
      } else {
        const c = JSON.parse(job.context) as DialogueContext, result = outcome.value as GroundedDialogue;
        status = sim.recordDialogue(c.speaker.id, c.listener.id, result.text, result.evidence, job.request, job.model) ? 'applied' : 'rejected';
      }
    } else {
      const retry = outcome.retryable && job.attempts < 3;
      status = retry ? 'pending' : 'failed';
      if (job.kind === 'interpretation') {
        sim.failDecision(job.request, outcome.error, retry);
      }
    }
    if (job.kind === 'dialogue' && status !== 'pending') delete meta.dialogue;
    const state = sim.snapshot(), events = state.events.filter(e => !before.has(e.id));
    meta.eventCount += events.length;
    const next = status === 'pending' ? now + 30_000 * 2 ** (job.attempts - 1) : 0;
    try {
      await store.commit({ ...current, revision: current.revision + 1, state: compactWorld(state), meta }, events, `ai:${job.id}:${job.attempts}`, `ai:${job.id}:${job.attempts}`, [
        db.prepare("UPDATE ai_jobs SET status=?,next_attempt=?,error=?,updated=? WHERE id=? AND status='ready'").bind(status, next, outcome.ok ? status === 'rejected' ? 'stale_evidence' : null : outcome.error, now, job.id),
        db.prepare('INSERT INTO commit_guard VALUES(changes())'), db.prepare('DELETE FROM commit_guard'),
      ]); return;
    } catch (error) { if (!(error instanceof Conflict)) throw error; }
  }
  // Keep the saved result ready. A later heartbeat retries committing, without another model call.
}

/** One bounded call per wakeup. Caller uses waitUntil, so simulation requests never await the model. */
export async function processAI(store: WorldStore, env: ModelEnv, transport: typeof fetch = fetch, now = Date.now()) {
  const current = await store.read();
  // Cancel audit entries from resets/mode changes, including a crashed old Worker.
  await store.db.batch([store.db.prepare("UPDATE ai_jobs SET status='stale',updated=? WHERE status IN ('pending','running','ready') AND (epoch<>? OR generation<>?)").bind(now, current.epoch, generation(current))]);
  const config = modelConfig(env); if (!config || current.meta.aiMode !== 'remote' || !current.state.llm.enabled) return;
  let job = await ensureJob(store, current, config.model, now); if (!job) return;
  if (job.status === 'ready') { await applyReady(store, job, now); return; }
  if (!['pending', 'running'].includes(job.status) || job.next_attempt > now) return;
  if (job.attempts >= 3) {
    const result = JSON.stringify({ ok: false, error: 'interrupted', retryable: false });
    await store.db.batch([store.db.prepare("UPDATE ai_jobs SET status='ready',result=?,updated=? WHERE id=? AND status='running' AND next_attempt<=?").bind(result, now, job.id, now)]);
    job = (await store.db.prepare('SELECT * FROM ai_jobs WHERE id=?').bind(job.id).first<Job>())!;
    if (job.status === 'ready') await applyReady(store, job, now); return;
  }
  const token = await reserve(store, job, config.dailyLimit, now); if (!token) return;
  const provider = new ServerModelProvider({ ...config, model: job.model }, transport); let outcome: Outcome;
  try {
    outcome = { ok: true, value: job.kind === 'dialogue' ? await provider.generateDialogue(JSON.parse(job.context)) : await provider.interpretEvent(JSON.parse(job.context)) };
  } catch (error) {
    const failure = error instanceof ModelError ? error : new ModelError('provider_error', false);
    outcome = { ok: false, error: failure.code, retryable: failure.retryable };
  }
  const finished = Math.max(now, Date.now());
  await store.db.batch([
    store.db.prepare("UPDATE ai_jobs SET status='ready',result=?,error=?,updated=? WHERE id=? AND status='running' AND EXISTS(SELECT 1 FROM ai_lock WHERE token=?)").bind(JSON.stringify(outcome), outcome.ok ? null : outcome.error, finished, job.id, token),
    store.db.prepare('UPDATE ai_calls SET input_tokens=?,output_tokens=?,outcome=? WHERE id=?').bind(provider.usage.inputTokens, provider.usage.outputTokens, JSON.stringify(outcome), token),
    store.db.prepare('UPDATE ai_lock SET expires=? WHERE token=?').bind(finished + 10_000, token),
  ]);
  job = (await store.db.prepare('SELECT * FROM ai_jobs WHERE id=?').bind(job.id).first<Job>())!;
  if (job.status === 'ready') await applyReady(store, job, finished);
}
