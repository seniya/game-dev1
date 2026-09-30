import { Simulation } from '../sim/engine';
import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type { WorldEvent, WorldState } from '../sim/types';
import { initialWorld, type Command, type StoredWorld } from './world';
import { restoreChange, stateChange, type StateChange } from './journal';

export const CHECKPOINT_COMMITS = 30;
export const CHECKPOINT_INTERVAL_MS = 60_000;
export const JOURNAL_BYTE_LIMIT = 1_000_000;
interface Checkpoint { revision: number; created: number; head_revision: number }
interface ChangeRow { revision: number; part: number; body: string }
interface CommandInput { action: Command['action']; at: number }

const schema = [
  'CREATE TABLE IF NOT EXISTS world_checkpoints (epoch TEXT PRIMARY KEY, revision INTEGER NOT NULL, created INTEGER NOT NULL, head_revision INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS world_changes (epoch TEXT NOT NULL, revision INTEGER NOT NULL, part INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(epoch,revision,part))',
  'CREATE TABLE IF NOT EXISTS command_inputs (id TEXT PRIMARY KEY, input TEXT NOT NULL, accepted INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS chrome_jobs (id TEXT PRIMARY KEY, epoch TEXT NOT NULL, generation TEXT NOT NULL, request TEXT NOT NULL, context TEXT NOT NULL, hash TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, token TEXT, expires INTEGER NOT NULL DEFAULT 0, result TEXT, error TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL, UNIQUE(epoch,generation,request))',
  'CREATE INDEX IF NOT EXISTS chrome_jobs_recent ON chrome_jobs(created DESC)',
  'CREATE TABLE IF NOT EXISTS chrome_calls (token TEXT PRIMARY KEY, job TEXT NOT NULL, day TEXT NOT NULL, started INTEGER NOT NULL, outcome TEXT)',
  'CREATE INDEX IF NOT EXISTS chrome_calls_day ON chrome_calls(day)',
  'CREATE INDEX IF NOT EXISTS chrome_calls_started ON chrome_calls(started)',
  'CREATE TABLE IF NOT EXISTS chrome_schedule (id INTEGER PRIMARY KEY CHECK(id=1), next_after INTEGER NOT NULL)',
  'INSERT OR IGNORE INTO chrome_schedule VALUES(1,0)',
  'CREATE TABLE IF NOT EXISTS chrome_batches (job TEXT PRIMARY KEY, requests TEXT NOT NULL, npc TEXT NOT NULL, topic TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS chrome_lock (id INTEGER PRIMARY KEY CHECK(id=1), token TEXT NOT NULL, expires INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS world (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, epoch TEXT NOT NULL, meta TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS snapshots (epoch TEXT NOT NULL, part INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(epoch,part))',
  'CREATE TABLE IF NOT EXISTS events (epoch TEXT NOT NULL, id TEXT NOT NULL, seq INTEGER NOT NULL, tick INTEGER NOT NULL, kind TEXT NOT NULL, cause TEXT, body TEXT NOT NULL, PRIMARY KEY(epoch,id))',
  'CREATE INDEX IF NOT EXISTS events_time ON events(epoch,tick,seq)',
  'CREATE INDEX IF NOT EXISTS events_order ON events(epoch,seq)',
  "CREATE INDEX IF NOT EXISTS events_kind_order ON events(epoch,kind,seq)",
  "CREATE INDEX IF NOT EXISTS events_region_order ON events(epoch,json_extract(body,'$.data.settlementId'),kind,seq)",
  'CREATE INDEX IF NOT EXISTS events_cause ON events(epoch,cause)',
  'CREATE TABLE IF NOT EXISTS participants (epoch TEXT NOT NULL, npc TEXT NOT NULL, event TEXT NOT NULL, seq INTEGER NOT NULL, PRIMARY KEY(epoch,npc,event))',
  'CREATE INDEX IF NOT EXISTS participants_order ON participants(epoch,npc,seq)',
  'CREATE TABLE IF NOT EXISTS event_refs (epoch TEXT NOT NULL, source TEXT NOT NULL, target TEXT NOT NULL, PRIMARY KEY(epoch,source,target))',
  'CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, body TEXT NOT NULL, revision INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS commit_guard (ok INTEGER CHECK(ok=1))',
  'CREATE TABLE IF NOT EXISTS ai_jobs (id TEXT PRIMARY KEY, epoch TEXT NOT NULL, generation TEXT NOT NULL, request TEXT NOT NULL, kind TEXT NOT NULL, context TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0, result TEXT, error TEXT, model TEXT NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL, UNIQUE(epoch,generation,request))',
  'CREATE INDEX IF NOT EXISTS ai_jobs_recent ON ai_jobs(created DESC)',
  'CREATE TABLE IF NOT EXISTS ai_calls (id TEXT PRIMARY KEY, job TEXT NOT NULL, day TEXT NOT NULL, started INTEGER NOT NULL, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, outcome TEXT)',
  'CREATE INDEX IF NOT EXISTS ai_calls_day ON ai_calls(day)',
  'CREATE TABLE IF NOT EXISTS ai_lock (id INTEGER PRIMARY KEY CHECK(id=1), token TEXT NOT NULL, expires INTEGER NOT NULL)',
];
// Cache only completed initialization. Pending D1 I/O belongs to its Worker request;
// sharing that promise can strand later requests when the first client disconnects.
const ready = new WeakSet<object>();
export class Conflict extends Error {}
export class WorldStore {
  private baseline?: { world: StoredWorld; checkpoint: Checkpoint; journalBytes: number; upgraded?: boolean };
  constructor(readonly db: D1Database) {}
  async init(now: number) {
    if (ready.has(this.db)) return;
    await this.initialize(now);
    ready.add(this.db);
  }
  private async initialize(now: number) {
    await this.db.batch(schema.map(s => this.db.prepare(s)));
    // Upgrade development checkpoints created before per-attempt outcomes were added.
    const columns = await this.db.prepare('PRAGMA table_info(ai_calls)').all<{ name: string }>();
    if (!columns.results.some(c => c.name === 'outcome')) {
      try { await this.db.batch([this.db.prepare('ALTER TABLE ai_calls ADD COLUMN outcome TEXT')]); }
      catch (error) { if (!/duplicate column name/i.test(String(error))) throw error; }
    }
    if (!await this.db.prepare('SELECT id FROM world WHERE id=1').first()) {
      const w = initialWorld(now);
      try {
        await this.db.batch([
          this.db.prepare('INSERT INTO world VALUES(1,0,?,?)').bind(w.epoch, JSON.stringify(w.meta)),
          ...this.snapshotStatements(w.epoch, w.state), ...this.eventStatements(w.epoch, w.state.events),
        ]);
      } catch (error) {
        // Another cold Worker may initialize first. Never append initial snapshot chunks to its world.
        if (!/UNIQUE constraint failed: world.id/.test(String(error))) throw error;
      }
    }
    // Existing snapshots already contain the latest committed state. Adopt them without rewriting.
    await this.db.batch([this.db.prepare('INSERT OR IGNORE INTO world_checkpoints SELECT epoch,revision,?,revision FROM world WHERE id=1').bind(now)]);
  }

  snapshotStatements(epoch: string, state: WorldState, ignore = false): D1PreparedStatement[] {
    const json = JSON.stringify(state), statements = [];
    for (let i = 0, part = 0; i < json.length; part++) {
      let end = Math.min(json.length, i + 24_000);
      if (end < json.length && /[\uD800-\uDBFF]/.test(json[end - 1])) end--;
      statements.push(this.db.prepare(`INSERT ${ignore ? 'OR IGNORE' : ''} INTO snapshots VALUES(?,?,?)`).bind(epoch, part, json.slice(i, end)));
      i = end;
    }
    return statements;
  }
  eventStatements(epoch: string, events: WorldEvent[], offset = 0): D1PreparedStatement[] {
    const statements = [];
    for (let i = 0; i < events.length; i += 100) {
      const body = JSON.stringify(events.slice(i, i + 100).map((event, j) => ({ event, seq: offset + i + j + 1, people: [...new Set([...event.participants, event.actorId, event.targetId].filter(Boolean))] })));
      statements.push(this.db.prepare(`INSERT OR IGNORE INTO events SELECT ?, json_extract(value,'$.event.id'), json_extract(value,'$.seq'), json_extract(value,'$.event.tick'), json_extract(value,'$.event.kind'), json_extract(value,'$.event.causeId'), json_extract(value,'$.event') FROM json_each(?)`).bind(epoch, body));
      statements.push(this.db.prepare(`INSERT OR IGNORE INTO participants SELECT ?, p.value, json_extract(e.value,'$.event.id'), json_extract(e.value,'$.seq') FROM json_each(?) e, json_each(json_extract(e.value,'$.people')) p`).bind(epoch, body));
      statements.push(this.db.prepare(`INSERT OR IGNORE INTO event_refs SELECT ?, p.value, json_extract(e.value,'$.event.id') FROM json_each(?) e, json_each(json_extract(e.value,'$.event.data.evidence')) p`).bind(epoch, body));
    }
    return statements;
  }
  private restore(parts: { body: string }[], checkpoint: Checkpoint, changes: ChangeRow[], expected?: number, onUpgrade?: () => void): WorldState {
    if (!parts.length) throw new Error('저장된 세계가 없습니다.');
    let state = JSON.parse(parts.map(r => r.body).join('')) as WorldState, revision = checkpoint.revision;
    for (let i = 0; i < changes.length;) {
      const next = changes[i].revision;
      if (next !== revision + 1) throw new Error('세계 변경 기록이 누락되었습니다.');
      let body = '', part = 0;
      while (i < changes.length && changes[i].revision === next) {
        if (changes[i].part !== part++) throw new Error('세계 변경 기록 조각이 누락되었습니다.');
        body += changes[i++].body;
      }
      state = restoreChange(state, JSON.parse(body) as StateChange); revision = next;
    }
    if (expected !== undefined && revision !== expected) throw new Error('세계 체크포인트와 변경 기록의 버전이 다릅니다.');
    if ((state.version as number) !== 6) onUpgrade?.();
    return this.upgrade(state);
  }
  async read(): Promise<StoredWorld> {
    // Metadata, checkpoint and its journal are read in one consistent transaction.
    const result = await this.db.batch([
      this.db.prepare('SELECT revision,epoch,meta FROM world WHERE id=1'),
      this.db.prepare('SELECT body FROM snapshots WHERE epoch=(SELECT epoch FROM world WHERE id=1) ORDER BY part'),
      this.db.prepare('SELECT revision,created,head_revision FROM world_checkpoints WHERE epoch=(SELECT epoch FROM world WHERE id=1)'),
      this.db.prepare('SELECT revision,part,body FROM world_changes WHERE epoch=(SELECT epoch FROM world WHERE id=1) ORDER BY revision,part'),
    ]);
    const row = result[0].results[0] as unknown as { revision: number; epoch: string; meta: string };
    const checkpoint = result[2].results[0] as unknown as Checkpoint;
    if (!checkpoint) throw new Error('세계 체크포인트 정보가 없습니다.');
    const changes = result[3].results as unknown as ChangeRow[];
    let upgraded = false;
    const world = { revision: row.revision, epoch: row.epoch, meta: JSON.parse(row.meta), state: this.restore(result[1].results as unknown as { body: string }[], checkpoint, changes, row.revision, () => { upgraded = true; }) };
    this.baseline = { world: structuredClone(world), checkpoint, upgraded, journalBytes: changes.reduce((n, r) => n + new TextEncoder().encode(r.body).length, 0) };
    return world;
  }
  private upgrade(state: WorldState): WorldState { return state.version === 6 ? state : Simulation.load(JSON.stringify(state)).snapshot(); }
  async command(id: string) { return this.db.prepare('SELECT body FROM commands WHERE id=?').bind(id).first<{ body: string }>(); }
  async commit(w: StoredWorld, events: WorldEvent[], request: string, id: string, extra: D1PreparedStatement[] = [], input?: CommandInput) {
    if (this.baseline?.world.revision !== w.revision - 1) await this.read();
    const base = this.baseline!;
    if (base.world.revision !== w.revision - 1) throw new Conflict('다른 기기에서 세계가 변경되었습니다. 최신 상태를 불러옵니다.');
    const now = input?.at ?? Date.now(), replaced = base.world.epoch !== w.epoch;
    const body = replaced ? '' : JSON.stringify(stateChange(base.world.state, w.state));
    const bytes = new TextEncoder().encode(body).length;
    const checkpoint = base.upgraded || replaced || w.revision - base.checkpoint.revision >= CHECKPOINT_COMMITS || now - base.checkpoint.created >= CHECKPOINT_INTERVAL_MS || base.journalBytes + bytes >= JOURNAL_BYTE_LIMIT;
    const persistence: D1PreparedStatement[] = [];
    if (checkpoint) {
      persistence.push(this.db.prepare('DELETE FROM snapshots WHERE epoch=?').bind(w.epoch), ...this.snapshotStatements(w.epoch, w.state),
        this.db.prepare('INSERT INTO world_checkpoints VALUES(?,?,?,?) ON CONFLICT(epoch) DO UPDATE SET revision=excluded.revision,created=excluded.created,head_revision=excluded.head_revision').bind(w.epoch, w.revision, now, w.revision),
        this.db.prepare('DELETE FROM world_changes WHERE epoch=?').bind(w.epoch));
    } else {
      persistence.push(this.db.prepare('UPDATE world_checkpoints SET head_revision=? WHERE epoch=?').bind(w.revision, w.epoch));
      // D1 bindings have a size limit; keep UTF-8 chunks below 100KB, including Korean text.
      let start = 0, part = 0;
      while (start < body.length) {
        let end = Math.min(body.length, start + 24_000);
        if (end < body.length && /[\uD800-\uDBFF]/.test(body[end - 1])) end--;
        persistence.push(this.db.prepare('INSERT INTO world_changes VALUES(?,?,?,?)').bind(w.epoch, w.revision, part++, body.slice(start, end)));
        start = end;
      }
    }
    // The imported save is already captured by the new checkpoint; avoid storing it twice.
    const action = input?.action.type === 'import' ? { type: 'import' } : input?.action ?? { type: 'internal', source: request };
    try {
      await this.db.batch([
        this.db.prepare('UPDATE world SET revision=?,epoch=?,meta=? WHERE id=1 AND revision=?').bind(w.revision, w.epoch, JSON.stringify(w.meta), w.revision - 1),
        this.db.prepare('INSERT INTO commit_guard VALUES(changes())'),
        this.db.prepare('DELETE FROM commit_guard'),
        ...persistence, ...this.eventStatements(w.epoch, events, w.meta.eventCount - events.length),
        this.db.prepare('INSERT INTO commands VALUES(?,?,?)').bind(id, request, w.revision),
        this.db.prepare('INSERT INTO command_inputs VALUES(?,?,?)').bind(id, JSON.stringify(action), now),
        ...extra,
      ]);
      this.baseline = { world: structuredClone(w), checkpoint: checkpoint ? { revision: w.revision, created: now, head_revision: w.revision } : { ...base.checkpoint, head_revision: w.revision }, journalBytes: checkpoint ? 0 : base.journalBytes + bytes };
    } catch (e) {
      this.baseline = undefined;
      if (/CHECK constraint|UNIQUE constraint/.test(String(e))) throw new Conflict('다른 기기에서 세계가 변경되었습니다. 최신 상태를 불러옵니다.');
      throw e;
    }
  }
  async export(epoch: string): Promise<WorldState> {
    const result = await this.db.batch<{ body: string }>([
      this.db.prepare('SELECT body FROM snapshots WHERE epoch=? ORDER BY part').bind(epoch),
      this.db.prepare('SELECT body FROM events WHERE epoch=? ORDER BY seq').bind(epoch),
      this.db.prepare('SELECT revision,created,head_revision FROM world_checkpoints WHERE epoch=?').bind(epoch),
      this.db.prepare('SELECT revision,part,body FROM world_changes WHERE epoch=? ORDER BY revision,part').bind(epoch),
    ]);
    if (!result[0].results.length) throw new Error('저장된 세계가 없습니다.');
    const checkpoint = result[2].results[0] as unknown as Checkpoint | undefined;
    const state = this.restore(result[0].results, checkpoint ?? { revision: 0, created: 0, head_revision: 0 }, result[3].results as unknown as ChangeRow[], checkpoint?.head_revision);
    state.events = result[1].results.map(r => JSON.parse(r.body as string));
    return state;
  }
}
