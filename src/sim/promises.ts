import type { WorldState, WorldEvent } from './types';
import { GATHERING_LABELS } from './gatherings-types';
/** Direct records only: a distant guest never learns the host's private cancellation reason. */
export function knownPromiseEvent(w:WorldState,npcId:string,e:WorldEvent) {
 return e.kind==='gathering'&&typeof e.data.conversationSource==='string'&&e.participants.includes(npcId)&&e.tick<=w.tick;
}
export function promiseMemories(w:WorldState,npcId:string) {
 return w.events.filter(e=>knownPromiseEvent(w,npcId,e)&&['proposed','accepted','withdrawn','arrived','completed','cancelled','missed'].includes(String(e.data.phase)))
  .sort((a,b)=>b.tick-a.tick||Number(b.id.replace(/\D/g,''))-Number(a.id.replace(/\D/g,''))).slice(0,3)
  .map(e=>({id:e.id,text:e.description,hearsay:false}));
}
export function conversationPromises(w:WorldState,npcId:string) {
 return (w.gatherings?.items??[]).filter(g=>g.conversationSource&&(g.hostId===npcId||g.invitations.some(i=>i.npcId===npcId))).slice(-6).reverse().map(g=>({
  id:g.id,title:GATHERING_LABELS[g.kind],source:g.sourceEventId,conversation:g.conversationSource!,latest:g.lastEventId,
  status:g.status==='completed'?'완료':g.status==='cancelled'?'취소':g.progress?'함께 활동 중':g.arrivals.length?'약속 장소에 도착':g.invitations.some(i=>i.status==='accepted')?'참석 수락 · 이동 기다림':'제안 · 수락 기다림',
  detail:`수락 ${g.invitations.filter(i=>['accepted','attended'].includes(i.status)).length}명 · 실제 도착 ${g.arrivals.length}명 · 진행 ${g.progress}/6`,
 }));
}
