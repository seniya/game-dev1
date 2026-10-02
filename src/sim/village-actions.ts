import type { NPC, WorldState, Position } from './types';
import type { VillageActivity } from './village-types';
import { VILLAGE_ACTIVITY_LABELS } from './village-types';
import { findPath, walkable } from './pathfinding';
import { distance } from './random';
import { appendEvent } from './social';
import { isTravelling } from './civilization';

export function reserved(w: WorldState, n: NPC) {
  return !!w.villageLife && (!!w.villageLife.activities[n.id] || w.villageLife.conflicts.some(c=>c.a===n.id||c.b===n.id));
}
export function available(w: WorldState, n: NPC) {
  return n.alive && !isTravelling(w,n) && !reserved(w,n) && n.needs.hunger<70 && n.needs.thirst<75 && n.needs.fatigue<75 && n.needs.health>=40 && w.urban.citizens[n.id].injury<20;
}
export function reserve(w: WorldState, n: NPC, kind: VillageActivity['kind'], target: Position, reason: string, options: { source?: string; partner?: string; guardian?: string; duration?: number } = {}) {
  const path=findPath(w,n.position,target);if(!path || !w.villageLife)return false;
  const source=options.source??appendEvent(w,{kind:kind==='care'||kind==='recover'?'health':'gathering',actorId:n.id,targetId:options.partner,importance:35,description:`${n.identity.name}: ${reason}`,data:{phase:kind==='play'?'outing':kind, villageLife:true}}).id;
  const id=`va${w.nextId++}`;
  w.villageLife.activities[n.id]={id,kind,source,since:w.tick,until:w.tick+(options.duration??72),target:{...target},path,partner:options.partner,guardian:options.guardian,progress:0,reason};
  delete n.currentAction;n.decision={reason,candidates:[],tick:w.tick};return true;
}
export function release(w: WorldState, n: NPC) { if(w.villageLife)delete w.villageLife.activities[n.id]; }
export function advanceActivity(w: WorldState,n:NPC) {
  const a=w.villageLife?.activities[n.id];if(!a)return false;
  if(w.urban.citizens[n.id].injury>=20 && w.tick%2===0)return false;
  if ((!a.path.length && distance(n.position,a.target)>0) || a.path.length && (!walkable(w,a.path[0]) || distance(n.position,a.path[0])!==1)) {
    const path=findPath(w,n.position,a.target);
    if(!path){a.reason='길이 막혀 현장에서 도움을 기다립니다.';a.path=[];return false;}
    a.path=path;
  }
  if(a.path.length){n.position=a.path.shift()!;return false;}
  if(distance(n.position,a.target)!==0)return false;
  a.progress++;return true;
}
export function villageActivityStatus(w:WorldState,n:NPC) {
  if(!n.alive)return;
  const conflict=w.villageLife?.conflicts.find(c=>c.a===n.id||c.b===n.id);
  if(conflict)return {label:conflict.phase==='aftermath'?'다툼 뒤 마음 정리':'말다툼과 중재',reason:n.decision.reason,moving:false};
  const a=w.villageLife?.activities[n.id];
  if(a)return {label:VILLAGE_ACTIVITY_LABELS[a.kind],reason:a.reason,moving:!!a.path.length};
}
