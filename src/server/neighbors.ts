import { descendants } from '../sim/dynasty';
import { groupGoals, legacyGoals, neighborPeople, type NeighborView } from '../sim/neighbors';
import type { WorldEvent } from '../sim/types';
import type { WorldStore } from './store';
import type { StoredWorld } from './world';
import { AccessError, type Member } from './access';

const body = (r: { body: string } | null): WorldEvent | undefined => r ? JSON.parse(r.body) : undefined;
export async function readNeighbors(store: WorldStore, member: Member, w: StoredWorld, params = new URLSearchParams()): Promise<NeighborView> {
  if (params.has('epoch') && params.get('epoch') !== w.epoch) throw new AccessError('세계가 바뀌었습니다. 내 이웃을 다시 열어 주세요.',409);
  const through = params.has('through') ? Number(params.get('through')) : w.meta.eventCount;
  const before = params.has('before') ? Number(params.get('before')) : through + 1;
  if (![through,before].every(n=>Number.isSafeInteger(n)&&n>=0) || through>w.meta.eventCount || before>through+1) throw new AccessError('관계 기록의 조회 범위를 확인해 주세요.',400);
  const own = await store.db.prepare('SELECT npc FROM npc_creators WHERE epoch=? AND member=?').bind(w.epoch,member.id).all<{npc:string}>();
  const ids = new Set(own.results.map(r=>r.npc)), encoded=JSON.stringify([...ids]), archive=store.archive();
  const people=neighborPeople(w.state,ids);
  if (!ids.size) return {epoch:w.epoch,tick:w.state.tick,people,goals:groupGoals([],0),turns:[],next:null,through};
  const together = `(SELECT COUNT(DISTINCT value) FROM json_each(e.body,'$.participants') WHERE value IN (SELECT value FROM json_each(?)))>=2`;
  const first = (condition: string, values: (string|number)[]) => archive.prepare(`SELECT e.body FROM events e WHERE e.epoch=? AND e.seq<=? AND ${condition} ORDER BY e.seq LIMIT 1`).bind(w.epoch,through,...values).first<{body:string}>();
  const [meals, construction, turns] = await Promise.all([
    Promise.all(['meal','harvest'].map(kind=>first(`e.kind='gathering' AND json_extract(e.body,'$.data.phase')='completed' AND json_extract(e.body,'$.data.gatheringKind')=? AND ${together}`,[kind,encoded]))),
    first(`e.kind='construction' AND json_extract(e.body,'$.data.phase')='completed' AND (SELECT COUNT(DISTINCT json_extract(a.body,'$.actorId')) FROM events a WHERE a.epoch=e.epoch AND a.seq<=e.seq AND a.kind='construction' AND json_extract(a.body,'$.data.phase')='worked' AND json_extract(a.body,'$.data.projectId')=json_extract(e.body,'$.data.projectId') AND json_extract(a.body,'$.actorId') IN (SELECT value FROM json_each(?)))>=2`,[encoded]),
    archive.prepare(`SELECT e.body,e.seq FROM events e WHERE e.epoch=? AND e.seq<=? AND e.seq<? AND e.kind='relationship' AND json_extract(e.body,'$.data.turn') IN ('close','conflict','reconciled') AND json_extract(e.body,'$.actorId') IN (SELECT value FROM json_each(?)) AND json_extract(e.body,'$.targetId') IN (SELECT value FROM json_each(?)) ORDER BY e.seq DESC LIMIT 21`).bind(w.epoch,through,before,encoded,encoded).all<{body:string;seq:number}>(),
  ]);
  return {epoch:w.epoch,tick:w.state.tick,people,goals:groupGoals([body(meals[0]),body(meals[1]),body(construction)],people.filter(p=>p.alive).length),turns:turns.results.slice(0,20).map(r=>JSON.parse(r.body)),next:turns.results.length>20?turns.results[19].seq:null,through};
}
export async function readLegacyGoals(store: WorldStore, w: StoredWorld, root: string) {
  const ids=JSON.stringify([...descendants(w.state,root).keys()]), archive=store.archive();
  const owns=`EXISTS(SELECT 1 FROM json_each(e.body,'$.data.owners') WHERE value IN (SELECT value FROM json_each(?)))`;
  const clauses = [
    {sql:`e.kind='industry' AND ((json_extract(e.body,'$.data.phase')='production' AND json_extract(e.body,'$.data.profit')>0 AND ${owns}) OR (json_extract(e.body,'$.data.phase')='dividend' AND json_extract(e.body,'$.data.coins')>0 AND EXISTS(SELECT 1 FROM json_each(e.body,'$.participants') WHERE value IN (SELECT value FROM json_each(?)))))`,args:[ids,ids]},
    {sql:`e.kind='inheritance' AND json_extract(e.body,'$.data.phase')='shares-inherited' AND json_array_length(e.body,'$.data.owners')>=2 AND ${owns}`,args:[ids]},
    {sql:`e.kind='industry' AND json_extract(e.body,'$.data.phase')='production' AND json_extract(e.body,'$.data.tradeSuccessor')=1 AND json_extract(e.body,'$.actorId')<>? AND json_extract(e.body,'$.actorId') IN (SELECT value FROM json_each(?))`,args:[root,ids]},
  ];
  const rows=await Promise.all(clauses.map(c=>archive.prepare(`SELECT e.body FROM events e WHERE e.epoch=? AND e.seq<=? AND ${c.sql} ORDER BY e.seq LIMIT 1`).bind(w.epoch,w.meta.eventCount,...c.args).first<{body:string}>()));
  return legacyGoals(rows.map(body),w.state,root);
}
