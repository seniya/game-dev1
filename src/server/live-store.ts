import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import { Simulation } from '../sim/engine';
import { DecisionCoordinator } from '../llm/coordinator';
import { MockLLMProvider } from '../llm/provider';
import type { WorldEvent } from '../sim/types';
import { applyCommand, compactWorld, type ClockState, type Command, type StoredWorld } from './world';
import { Conflict, WorldStore, type CommandInput } from './store';

declare const __SIMULATION_BUILD__: string;
const BUILD = typeof __SIMULATION_BUILD__ === 'string' ? __SIMULATION_BUILD__ : 'test';
export const AUTOSAVE_MS = 300_000;
const DAY = 86_400_000;
interface Head { revision: number; sequence: number; body: string }
interface Progress { build: string; epoch: string; ticks: number; meta: ClockState; started: number; id: string }
interface Cached { revision: number; sequence: number; world: StoredWorld; events: WorldEvent[] }
const cache = new WeakMap<object, Cached>();

/** Only a small, replaceable clock row is written between full saves. It is not a
 * durable save format: a different engine build discards it and loads the last
 * checkpoint (at most five minutes old). No event is archived before that save. */
export class LiveWorldStore extends WorldStore {
  private saved!: StoredWorld;
  private current!: StoredWorld;
  private head: Head | null = null;
  private pending: WorldEvent[] = [];
  constructor(db: D1Database, private build = BUILD) { super(db); }

  override async read(): Promise<StoredWorld> {
    const saved = await super.read();
    const head = await this.db.prepare('SELECT revision,sequence,body FROM world_live WHERE id=1').first<Head>();
    this.saved = saved; this.current = saved; this.head = head; this.pending = [];
    if (!head || head.revision !== saved.revision) return saved;
    const progress = JSON.parse(head.body) as Progress;
    if (progress.epoch !== saved.epoch) return saved;
    if (progress.build !== this.build) {
      // Jobs may cite events from the discarded interval. Invalidate their leases
      // before any model response can reuse a regenerated request/event ID.
      saved.meta = { ...saved.meta, aiGeneration: this.build };
      return saved;
    }
    const cached = cache.get(this.db);
    if (cached && cached.revision === saved.revision && cached.sequence === head.sequence) {
      this.pending = structuredClone(cached.events); this.current = structuredClone(cached.world); return this.current;
    }
    const sim = Simulation.load(JSON.stringify(saved.state)), ids = new Set(saved.state.events.map(e => e.id));
    const decisions = new DecisionCoordinator(sim, new MockLLMProvider());
    const mock = saved.meta.aiMode !== 'remote' && saved.meta.aiMode !== 'chrome';
    for (let i = 0; i < progress.ticks; i++) { sim.step(); if (mock && sim.pending) await decisions.drain(); }
    const state = sim.snapshot();
    this.pending = state.events.filter(e => !ids.has(e.id));
    if (saved.meta.eventCount + this.pending.length !== progress.meta.eventCount) throw new Error('저장 대기 중인 세계의 진행 기록이 일치하지 않습니다.');
    const world = { ...saved, state: compactWorld(state), meta: progress.meta,
      live: { sequence: head.sequence, savedAt: progress.started, observedAt: progress.meta.lastSeen } };
    cache.set(this.db, { revision: saved.revision, sequence: head.sequence, world: structuredClone(world), events: structuredClone(this.pending) });
    this.current = world; return world;
  }

  private guard(): D1PreparedStatement[] {
    // A SELECT cannot be used with changes(); use a scalar CHECK in the same transaction.
    return [this.head
      ? this.db.prepare('INSERT INTO commit_guard SELECT EXISTS(SELECT 1 FROM world_live WHERE id=1 AND revision=? AND sequence=?)').bind(this.head.revision, this.head.sequence)
      : this.db.prepare('INSERT INTO commit_guard SELECT NOT EXISTS(SELECT 1 FROM world_live WHERE id=1)'),
      this.db.prepare('DELETE FROM commit_guard')];
  }

  async sync(command: Command, now: number) {
    const current = await this.read();
    if (command.revision !== current.revision) throw new Conflict('다른 기기에서 세계가 변경되었습니다. 최신 상태를 불러옵니다.');
    if (this.head && JSON.parse(this.head.body).id === command.id) return { world: current, motion: undefined };
    const next = await applyCommand(current, command, now);
    const started = current.live?.savedAt ?? current.meta.savedAt ?? now;
    const events = [...this.pending, ...next.events];
    // Bound cold replay and the query overlay for large populations / fast-forward.
    const replayBudget = Math.max(1, Math.floor(6000 / Math.max(12, next.world.state.npcs.length)));
    const ticks = next.world.state.tick - this.saved.state.tick;
    if (this.head && JSON.parse(this.head.body).build !== this.build || now - started >= AUTOSAVE_MS || ticks >= replayBudget || JSON.stringify(events).length >= 200_000 || current.meta.pendingTicks) {
      await this.commit(next.world, next.events, command.id, command.id, [], { action: command.action, at: now });
      return next;
    }
    const sequence = (this.head?.sequence ?? 0) + 1;
    const progress: Progress = { build: this.build, epoch: current.epoch, ticks, meta: next.world.meta, started, id: command.id };
    try {
      await this.db.batch([
        this.db.prepare('INSERT INTO commit_guard SELECT EXISTS(SELECT 1 FROM world WHERE id=1 AND revision=? AND epoch=?)').bind(current.revision, current.epoch),
        this.db.prepare('DELETE FROM commit_guard'), ...this.guard(),
        this.db.prepare('INSERT INTO world_live VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,sequence=excluded.sequence,body=excluded.body').bind(current.revision, sequence, JSON.stringify(progress)),
      ]);
    } catch (e) { if (/CHECK constraint/.test(String(e))) throw new Conflict('다른 기기의 진행을 반영합니다.'); throw e; }
    const world: StoredWorld = { ...next.world, revision: current.revision, live: { sequence, savedAt: started, observedAt: now } };
    this.pending = events; this.head = { revision: current.revision, sequence, body: JSON.stringify(progress) };
    cache.set(this.db, { revision: current.revision, sequence, world: structuredClone(world), events: structuredClone(events) });
    this.current = world; return { ...next, world };
  }

  override async commit(w: StoredWorld, events: WorldEvent[], request: string, id: string, extra: D1PreparedStatement[] = [], input?: CommandInput) {
    if (!this.saved) await this.read();
    const now = input?.at ?? Date.now();
    const replaced = w.epoch !== this.saved.epoch;
    if (replaced) w.meta.backupEventCount = this.current.meta.eventCount;
    // A reset must first preserve the complete previous world as its one backup.
    const backup: D1PreparedStatement[] = replaced && this.current.live ? [
      this.db.prepare('DELETE FROM snapshots WHERE epoch=?').bind(this.saved.epoch),
      ...this.snapshotStatements(this.saved.epoch, this.current.state),
      this.db.prepare('DELETE FROM world_changes WHERE epoch=?').bind(this.saved.epoch),
      this.db.prepare('UPDATE world_checkpoints SET revision=?,head_revision=? WHERE epoch=?').bind(this.saved.revision, this.saved.revision, this.saved.epoch),
      ...this.eventStatements(this.saved.epoch, this.pending, this.saved.meta.eventCount),
    ] : [];
    const allEvents = replaced ? events : [...this.pending, ...events];
    w.meta.savedAt = now; delete w.live;
    await super.commit(w, allEvents, request, id, [
      ...this.guard(), this.db.prepare('DELETE FROM world_live'), ...backup, ...extra, ...this.retention(w, now),
    ], { action: input?.action ?? { type: 'save' }, at: now, checkpoint: true });
    this.pending = []; this.head = null; this.saved = structuredClone(w); cache.delete(this.db);
  }

  async restoreBackup(current: StoredWorld, command: Command, now: number): Promise<StoredWorld> {
    if (command.action.type !== 'restore-backup' || command.action.epoch !== current.meta.backupEpoch || command.action.epoch === current.epoch) throw new Error('저장된 백업이 변경되었습니다. 다시 확인해 주세요.');
    const epoch = command.action.epoch;
    const state = Simulation.load(JSON.stringify(await this.checkpoint(epoch))).snapshot();
    const stats = await this.db.prepare("SELECT count(*) AS n,count(DISTINCT seq) AS uniqueSeq,coalesce(min(seq),1) AS first,coalesce(max(seq),0) AS last,sum(CASE WHEN kind IN ('gathering','share','talk','witness','rumor') THEN 1 ELSE 0 END) AS social FROM events WHERE epoch=?").bind(epoch).first<{ n: number; uniqueSeq: number; first: number; last: number; social: number }>();
    if (!stats || stats.n !== stats.last || stats.uniqueSeq !== stats.n || stats.first !== 1 || current.meta.backupEventCount !== undefined && stats.n !== current.meta.backupEventCount) throw new Error('저장된 백업의 사건 기록이 누락되었습니다.');
    const missing = await this.db.prepare('SELECT id FROM events e WHERE e.epoch=? AND e.cause IS NOT NULL AND NOT EXISTS(SELECT 1 FROM events p WHERE p.epoch=e.epoch AND p.id=e.cause) LIMIT 1').bind(epoch).first();
    const missingRef = await this.db.prepare('SELECT source FROM event_refs r WHERE r.epoch=? AND (NOT EXISTS(SELECT 1 FROM events e WHERE e.epoch=r.epoch AND e.id=r.source) OR NOT EXISTS(SELECT 1 FROM events e WHERE e.epoch=r.epoch AND e.id=r.target)) LIMIT 1').bind(epoch).first();
    if (missing || missingRef) throw new Error('저장된 백업의 원인 기록이 누락되었습니다.');
    // Required engine evidence, including the end of the archive, must still exist.
    for (let i = 0; i < state.events.length; i += 100) {
      const ids = state.events.slice(i, i + 100).map(e => e.id);
      const found = await this.db.prepare('SELECT count(*) AS n FROM events WHERE epoch=? AND id IN (SELECT value FROM json_each(?))').bind(epoch, JSON.stringify(ids)).first<{ n: number }>();
      if (found?.n !== ids.length) throw new Error('저장된 백업의 근거 사건이 누락되었습니다.');
    }
    return { epoch, revision: current.revision + 1, state: compactWorld(state), meta: {
      running: false, speed: current.meta.speed, offline: current.meta.offline, clock: now, lastSeen: now,
      eventCount: stats.n, socialCount: stats.social ?? 0, catchupTicks: 0, skippedTicks: 0, pendingTicks: 0,
      backupEpoch: current.epoch, aiMode: state.llm.enabled ? 'mock' : 'off', aiGeneration: command.id,
    } };
  }

  override async export(epoch: string) {
    const world = await this.read();
    if (epoch !== world.epoch) return super.export(epoch);
    const rows = await this.archive().prepare('SELECT body FROM events WHERE epoch=? AND seq<=? ORDER BY seq').bind(epoch, world.meta.eventCount).all<{ body: string }>();
    if (rows.results.length !== world.meta.eventCount) throw new Error('저장할 사건 아카이브가 누락되었습니다.');
    return { ...world.state, events: rows.results.map(row => JSON.parse(row.body) as WorldEvent) };
  }

  private retention(w: StoredWorld, now: number) {
    const db = this.db, result: D1PreparedStatement[] = [];
    // Delete bounded batches inside an already necessary save transaction.
    const oldCommands = "SELECT id FROM command_inputs WHERE accepted<? OR json_extract(input,'$.type')='sync' LIMIT 1000";
    result.push(db.prepare(`DELETE FROM commands WHERE id IN (${oldCommands})`).bind(now - 30 * DAY),
      db.prepare(`DELETE FROM command_inputs WHERE id IN (${oldCommands})`).bind(now - 30 * DAY));
    const backup = w.meta.backupEpoch ?? w.epoch;
    for (const table of ['snapshots', 'world_changes', 'world_checkpoints', 'events', 'participants', 'event_refs', 'npc_creators', 'personal_observations']) {
      result.push(db.prepare(`DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE epoch NOT IN (?,?) LIMIT 1000)`).bind(w.epoch, backup));
    }
    for (const table of ['ai_jobs', 'chrome_jobs']) {
      const old = `SELECT id FROM ${table} WHERE updated<? AND status NOT IN ('pending','running','ready') LIMIT 100`;
      if (table === 'chrome_jobs') result.push(db.prepare(`DELETE FROM chrome_batches WHERE job IN (${old})`).bind(now - 7 * DAY));
      result.push(db.prepare(`DELETE FROM ${table} WHERE id IN (${old})`).bind(now - 7 * DAY));
    }
    for (const table of ['ai_calls', 'chrome_calls']) result.push(db.prepare(`DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE started<? LIMIT 1000)`).bind(now - 7 * DAY));
    return result;
  }

  /** Pending events participate in the same indexed query semantics without being
   * inserted into the archive. Every query is pinned to this store's read. */
  override archive(): D1Database {
    if (!this.pending.length) return this.db;
    const events = this.pending.map((event, i) => ({ epoch: this.saved.epoch, seq: this.saved.meta.eventCount + i + 1, event,
      people: [...new Set([...event.participants, event.actorId, event.targetId].filter(Boolean))] }));
    const chunks: string[] = [];
    let group: typeof events = [], size = 0;
    for (const event of events) {
      const length = new TextEncoder().encode(JSON.stringify(event)).length;
      if (size + length > 70_000 && group.length) { chunks.push(JSON.stringify(group)); group = []; size = 0; }
      group.push(event); size += length;
    }
    if (group.length) chunks.push(JSON.stringify(group));
    const db = this.db;
    const prefix = `WITH pending_events AS (${chunks.map(() => 'SELECT value FROM json_each(?)').join(' UNION ALL ')}),
      live_events AS (SELECT * FROM events WHERE epoch<>? OR seq<=? UNION ALL SELECT json_extract(value,'$.epoch'),json_extract(value,'$.event.id'),json_extract(value,'$.seq'),json_extract(value,'$.event.tick'),json_extract(value,'$.event.kind'),json_extract(value,'$.event.causeId'),json_extract(value,'$.event') FROM pending_events),
      live_participants AS (SELECT * FROM participants WHERE epoch<>? OR seq<=? UNION ALL SELECT json_extract(e.value,'$.epoch'),p.value,json_extract(e.value,'$.event.id'),json_extract(e.value,'$.seq') FROM pending_events e,json_each(json_extract(e.value,'$.people')) p),
      live_event_refs AS (SELECT * FROM event_refs WHERE epoch<>? OR target IN (SELECT id FROM events WHERE epoch=? AND seq<=?) UNION ALL SELECT json_extract(e.value,'$.epoch'),p.value,json_extract(e.value,'$.event.id') FROM pending_events e,json_each(json_extract(e.value,'$.event.data.evidence')) p) `;
    const watermark = [this.saved.epoch, this.saved.meta.eventCount];
    return {
      prepare(sql: string) {
        if (!/\b(events|participants|event_refs)\b/.test(sql)) return db.prepare(sql);
        if (!/^SELECT\b/i.test(sql)) throw new Error('진행 중인 사건 조회는 읽기만 지원합니다.');
        const statement = db.prepare(prefix + sql.replace(/\b(events|participants|event_refs)\b/g, 'live_$1'));
        const pre = [...chunks, ...watermark, ...watermark, watermark[0], ...watermark];
        return { bind: (...args: unknown[]) => statement.bind(...pre, ...args), all: () => statement.bind(...pre).all(), first: () => statement.bind(...pre).first() } as D1PreparedStatement;
      },
      batch: db.batch.bind(db),
    } as unknown as D1Database;
  }
}
