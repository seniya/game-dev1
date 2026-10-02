import type { NPC, WorldState } from './types';
import type { Gathering } from './gatherings-types';
import { appendEvent, eventById, remember } from './social';
import { urgentNeed } from './cognition';
import { distance } from './random';

/** A resident can learn about their own failed attempt; never infer another person's intent. */
export function learnFromPromise(w:WorldState,g:Gathering,n:NPC,cause:string) {
  if(!n.alive)return;
  const host=w.npcs.find(p=>p.id===g.hostId)!;
  const venue=w.buildings.find(b=>b.id===g.buildingId)!;
  const ownNeed=urgentNeed(n),arrived=g.arrivals.some(a=>a.npcId===n.id);
  const shortage=distance(n.position,venue.position)===0&&(g.kind==='meal'&&n.inventory.food<1||g.kind==='harvest'&&venue.growth<4||g.kind==='help'&&n.id===host.id&&n.inventory.food<2);
  const reason=ownNeed?'recovery':shortage?'supplies':!arrived?'travel':'unknown';
  const partner=n.id===host.id?undefined:host.id;
  const meaning={recovery:'자신의 식사·휴식·건강 회복을 먼저 하고 다음 약속을 잡기로 했다.',supplies:'현장에서 활동 재료가 부족함을 확인했다. 다음에는 식량과 작물을 먼저 확인한다.',travel:'자신이 제시간에 도착하지 못했다. 다음 약속에는 이동 여유를 한 시간 더 둔다.',unknown:'함께 활동을 마치지 못했다. 상대의 사정은 확인하지 못했으므로 책임을 단정하지 않는다.'}[reason];
  const e=appendEvent(w,{kind:'gathering',actorId:n.id,participants:[n.id],locationId:venue.id,causeId:cause,importance:50,
    description:`${n.identity.name}: ${meaning}`,data:{gatheringId:g.id,gatheringKind:g.kind,phase:'learning',reason,...(partner?{partner}:{}),...(g.conversationSource?{conversationSource:g.conversationSource}:{})}});
  remember(w,n,e);
}
export function promisePreparation(w:WorldState,n:NPC,other:NPC) {
  const lesson=n.memories.map(m=>eventById(w,m.sourceEventId)).filter(e=>e?.kind==='gathering'&&e.actorId===n.id&&e.data.phase==='learning'&&e.data.partner===other.id&&e.tick<=w.tick&&w.tick-e.tick<7*144).sort((a,b)=>b!.tick-a!.tick)[0];
  const travel=lesson?.data.reason==='travel';
  return {buffer:travel?6:0,preference:travel?-2*(1-(w.tick-lesson!.tick)/(7*144)):0,evidence:lesson?[lesson.id]:[],reason:travel?'지난 약속에서 늦은 경험으로 이동 여유 1시간을 더 확보한다.':lesson?.description??''};
}
