import { z } from 'zod';
import type { Member } from './access';
import { AccessError } from './access';
import { Conflict, type WorldStore } from './store';
import type { StoredWorld } from './world';
import { descendants, dynastyStats, successorIds, succeed, type Dynasty, type DynastyView, type Deeds } from '../sim/dynasty';
import type { WorldEvent } from '../sim/types';
const id = z.string().min(1).max(100);
const inputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('found'), epoch: id, root: id }).strict(),
  z.object({ type: z.literal('succeed'), epoch: id, root: id, npc: id, revision: z.number().int().nonnegative() }).strict(),
]);
interface Row { root: string; active: string; revision: number; chain: string }
export async function dynastyAPI(store: WorldStore, member: Member, world: StoredWorld, root?: string, input?: unknown): Promise<DynastyView> {
  const db = store.db;
  const owned = await db.prepare('SELECT npc FROM npc_creators WHERE epoch=? AND member=?').bind(world.epoch, member.id).all<{ npc: string }>();
  const ownIds = new Set(owned.results.map(r => r.npc));
  const roots = world.state.npcs.filter(n => ownIds.has(n.id)).map(n => ({ id: n.id, name: n.identity.name, alive: n.alive }));
  if (input !== undefined) {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) throw new AccessError('가문 요청 형식을 확인해 주세요.', 400);
    const change = parsed.data;
    if (change.epoch !== world.epoch) throw new Conflict('세계가 바뀌었습니다. 내 가문을 다시 열어 주세요.');
    root = change.root;
    if (!ownIds.has(root)) throw new AccessError('자신이 만든 주민의 가문만 선택할 수 있습니다.');
    const statements = [
      db.prepare('INSERT INTO commit_guard(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM world WHERE epoch=? AND revision=?) AND EXISTS(SELECT 1 FROM world_members WHERE id=? AND blocked=0) THEN 1 ELSE 0 END').bind(world.epoch, world.revision + (change.type === 'succeed' ? 1 : 0), member.id),
    ];
    if (change.type === 'found') {
      if (!world.state.npcs.some(n => n.id === root)) throw new Conflict('시조 주민을 찾을 수 없습니다.');
      statements.push(db.prepare('INSERT OR IGNORE INTO dynasties(epoch,member,root,active,revision,chain) VALUES(?,?,?,?,0,?)').bind(world.epoch, member.id, root, root, JSON.stringify([{ npc: root, tick: world.state.tick }])));
    } else {
      const row = await db.prepare('SELECT * FROM dynasties WHERE epoch=? AND member=? AND root=?').bind(world.epoch, member.id, root).first<Row>();
      if (!row || row.revision !== change.revision) throw new Conflict('가문 계승 상태가 바뀌었습니다. 다시 열어 주세요.');
      let next: Dynasty;
      try { next = succeed(world.state, { ...row, chain: JSON.parse(row.chain) }, change.npc); }
      catch (e) { throw new AccessError((e as Error).message, 400); }
      statements.push(db.prepare('INSERT INTO commit_guard(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM dynasties WHERE epoch=? AND member=? AND root=? AND revision=?) THEN 1 ELSE 0 END').bind(world.epoch, member.id, root, change.revision));
      statements.push(db.prepare('UPDATE dynasties SET active=?,revision=?,chain=? WHERE epoch=? AND member=? AND root=?').bind(next.active, next.revision, JSON.stringify(next.chain), world.epoch, member.id, root));
    }
    statements.push(db.prepare('INSERT INTO dynasty_selection(epoch,member,root) VALUES(?,?,?) ON CONFLICT(epoch,member) DO UPDATE SET root=excluded.root').bind(world.epoch, member.id, root), db.prepare('DELETE FROM commit_guard'));
    try {
      if (change.type === 'succeed') {
        // A chosen child and the death that enabled succession must survive loss of the pending clock.
        const confirmed = { ...world, meta: { ...world.meta }, revision: world.revision + 1 };
        await store.commit(confirmed, [], 'dynasty-succession', crypto.randomUUID(), statements);
        world = confirmed;
      } else await db.batch(statements);
    } catch (e) { if (/CHECK|constraint/i.test(String(e))) throw new Conflict('세계나 가문이 바뀌었습니다. 내 가문을 다시 열어 주세요.'); throw e; }
  }
  if (!root) root = (await db.prepare('SELECT root FROM dynasty_selection WHERE epoch=? AND member=?').bind(world.epoch, member.id).first<{ root: string }>())?.root;
  const result: DynastyView = { epoch: world.epoch, tick: world.state.tick, roots, dynasty: null };
  if (!root) return result;
  if (!ownIds.has(root)) throw new AccessError('자신의 가문만 조회할 수 있습니다.');
  const row = await db.prepare('SELECT * FROM dynasties WHERE epoch=? AND member=? AND root=?').bind(world.epoch, member.id, root).first<Row>();
  if (!row || !world.state.npcs.some(n => n.id === row.active)) return result;
  const dynasty: Dynasty = { root: row.root, active: row.active, revision: row.revision, chain: JSON.parse(row.chain) };
  const family = descendants(world.state, root), archive = store.archive(), active = world.state.npcs.find(n => n.id === row.active)!;
  const metrics = async (ids: string[]) => (await archive.prepare(`SELECT
    COALESCE(SUM(CASE WHEN e.kind='share' AND json_extract(e.body,'$.actorId') IN (SELECT value FROM json_each(?)) THEN 1 ELSE 0 END),0) AS shares,
    COALESCE(SUM(CASE WHEN e.kind='education' AND json_extract(e.body,'$.targetId') IN (SELECT value FROM json_each(?)) THEN 1 ELSE 0 END),0) AS teaching,
    COALESCE(SUM(CASE WHEN e.kind='project' AND json_extract(e.body,'$.actorId') IN (SELECT value FROM json_each(?)) THEN 1 ELSE 0 END),0) AS improvements,
    COALESCE(SUM(CASE WHEN e.kind='construction' AND json_extract(e.body,'$.data.phase')='worked' AND json_extract(e.body,'$.actorId') IN (SELECT value FROM json_each(?)) THEN 1 ELSE 0 END),0) AS labor
    FROM events e WHERE e.epoch=? AND e.seq<=? AND e.kind IN ('share','education','project','construction') AND COALESCE(json_extract(e.body,'$.data.observer'),0)<>1`).bind(...Array(4).fill(JSON.stringify(ids)), world.epoch, world.meta.eventCount).first<Deeds>())!;
  const [deeds, activeDeeds, history, arrival, estate] = await Promise.all([
    metrics([...family.keys()]), metrics([active.id]),
    archive.prepare("SELECT e.body FROM events e WHERE e.epoch=? AND e.seq<=? AND e.kind IN ('birth','family','death','inheritance','share','education','project','construction','migration') AND EXISTS(SELECT 1 FROM participants p WHERE p.epoch=e.epoch AND p.event=e.id AND p.npc=?) AND (e.kind<>'construction' OR json_extract(e.body,'$.data.phase')='worked') ORDER BY e.seq DESC LIMIT 12").bind(world.epoch, world.meta.eventCount, active.id).all<{ body: string }>(),
    active.profile ? archive.prepare('SELECT body FROM events WHERE epoch=? AND id=? AND seq<=?').bind(world.epoch, active.profile.arrivalEventId, world.meta.eventCount).first<{ body: string }>() : null,
    archive.prepare("SELECT body FROM events WHERE epoch=? AND kind='inheritance' AND seq<=? AND json_extract(body,'$.actorId')=? AND json_type(body,'$.data.heirs')='array' ORDER BY seq DESC LIMIT 1").bind(world.epoch, world.meta.eventCount, active.id).first<{ body: string }>(),
  ]);
  return { ...result, dynasty, stats: dynastyStats(world.state, root, active.id), active: { id: active.id, identity: active.identity, alive: active.alive, life: active.life }, successors: successorIds(world.state, dynasty), deeds, activeDeeds, history: history.results.map(r => JSON.parse(r.body) as WorldEvent), openingCoins: arrival ? JSON.parse(arrival.body).data.coins : active.life.parentIds.length ? 0 : null, estateCoins: estate ? JSON.parse(estate.body).data.coins : null };
}
