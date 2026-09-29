import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type { WorldEvent, WorldState } from '../sim/types';
import { initialWorld, type StoredWorld } from './world';

const schema = [
  'CREATE TABLE IF NOT EXISTS world (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, epoch TEXT NOT NULL, meta TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS snapshots (epoch TEXT NOT NULL, part INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(epoch,part))',
  'CREATE TABLE IF NOT EXISTS events (epoch TEXT NOT NULL, id TEXT NOT NULL, seq INTEGER NOT NULL, tick INTEGER NOT NULL, kind TEXT NOT NULL, cause TEXT, body TEXT NOT NULL, PRIMARY KEY(epoch,id))',
  'CREATE INDEX IF NOT EXISTS events_time ON events(epoch,tick,seq)',
  'CREATE INDEX IF NOT EXISTS events_order ON events(epoch,seq)',
  'CREATE INDEX IF NOT EXISTS events_cause ON events(epoch,cause)',
  'CREATE TABLE IF NOT EXISTS participants (epoch TEXT NOT NULL, npc TEXT NOT NULL, event TEXT NOT NULL, seq INTEGER NOT NULL, PRIMARY KEY(epoch,npc,event))',
  'CREATE INDEX IF NOT EXISTS participants_order ON participants(epoch,npc,seq)',
  'CREATE TABLE IF NOT EXISTS event_refs (epoch TEXT NOT NULL, source TEXT NOT NULL, target TEXT NOT NULL, PRIMARY KEY(epoch,source,target))',
  'CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, body TEXT NOT NULL, revision INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS commit_guard (ok INTEGER CHECK(ok=1))',
];
const ready = new WeakMap<object, Promise<void>>();
export class Conflict extends Error {}
export class WorldStore {
  constructor(readonly db: D1Database) {}
  async init(now: number) {
    let promise = ready.get(this.db);
    if (!promise) { promise = this.initialize(now); ready.set(this.db, promise); }
    try { await promise; } catch (e) { ready.delete(this.db); throw e; }
  }
  private async initialize(now: number) {
    await this.db.batch(schema.map(s => this.db.prepare(s)));
    const w = initialWorld(now);
    await this.db.batch([
      this.db.prepare('INSERT OR IGNORE INTO world VALUES(1,0,?,?)').bind(w.epoch, JSON.stringify(w.meta)),
      ...this.snapshotStatements(w.epoch, w.state, true), ...this.eventStatements(w.epoch, w.state.events),
    ]);
  }
  snapshotStatements(epoch: string, state: WorldState, ignore = false): D1PreparedStatement[] {
    const json = JSON.stringify(state), statements = [];
    for (let i = 0, part = 0; i < json.length; part++) {
      let end = Math.min(json.length, i + 100_000);
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
  async read(): Promise<StoredWorld> {
    // A batch gives metadata and snapshot one consistent transaction, even during another device's reset.
    const result = await this.db.batch<{ body: string }>([
      this.db.prepare('SELECT revision,epoch,meta FROM world WHERE id=1'),
      this.db.prepare('SELECT body FROM snapshots WHERE epoch=(SELECT epoch FROM world WHERE id=1) ORDER BY part'),
    ]);
    const row = result[0].results[0] as unknown as { revision: number; epoch: string; meta: string };
    return { revision: row.revision, epoch: row.epoch, meta: JSON.parse(row.meta), state: JSON.parse(result[1].results.map(r => r.body).join('')) };
  }
  async command(id: string) { return this.db.prepare('SELECT body FROM commands WHERE id=?').bind(id).first<{ body: string }>(); }
  async commit(w: StoredWorld, events: WorldEvent[], request: string, id: string) {
    try {
      await this.db.batch([
        this.db.prepare('UPDATE world SET revision=?,epoch=?,meta=? WHERE id=1 AND revision=?').bind(w.revision, w.epoch, JSON.stringify(w.meta), w.revision - 1),
        this.db.prepare('INSERT INTO commit_guard VALUES(changes())'),
        this.db.prepare('DELETE FROM commit_guard'),
        this.db.prepare('DELETE FROM snapshots WHERE epoch=?').bind(w.epoch),
        ...this.snapshotStatements(w.epoch, w.state), ...this.eventStatements(w.epoch, events, w.meta.eventCount - events.length),
        this.db.prepare('INSERT INTO commands VALUES(?,?,?)').bind(id, request, w.revision),
      ]);
    } catch (e) {
      if (/CHECK constraint|UNIQUE constraint/.test(String(e))) throw new Conflict('다른 기기에서 세계가 변경되었습니다. 최신 상태를 불러옵니다.');
      throw e;
    }
  }
  async export(epoch: string): Promise<WorldState> {
    const result = await this.db.batch<{ body: string }>([
      this.db.prepare('SELECT body FROM snapshots WHERE epoch=? ORDER BY part').bind(epoch),
      this.db.prepare('SELECT body FROM events WHERE epoch=? ORDER BY seq').bind(epoch),
    ]);
    if (!result[0].results.length) throw new Error('저장된 세계가 없습니다.');
    const state = JSON.parse(result[0].results.map(r => r.body).join('')) as WorldState;
    state.events = result[1].results.map(r => JSON.parse(r.body as string));
    return state;
  }
}
