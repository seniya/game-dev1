import { eventById } from './social';
import type { NPC, WorldState } from './types';

// Only the deciding resident's retained, direct experiences contribute. Bounded
// bonuses never create actions or resources, and resentment/fear still apply.
export function socialMotives(w:WorldState,n:NPC,other:NPC) {
  const relationship=n.relationships.find(r=>r.npcId===other.id);
  const recent=n.memories.filter(m=>m.relatedNpcIds.includes(other.id)&&w.tick>=m.createdAt&&w.tick-m.createdAt<=7*144)
    .map(m=>({m,e:eventById(w,m.sourceEventId)}))
    .filter(({e})=>e && e.participants.includes(n.id)&&e.participants.includes(other.id));
  const help=recent.filter(({e})=>e!.kind==='share'&&e!.actorId===other.id&&e!.targetId===n.id).sort((a,b)=>b.m.createdAt-a.m.createdAt)[0];
  const kept=recent.filter(({e})=>e!.kind==='repayment'&&e!.actorId===other.id&&e!.targetId===n.id).sort((a,b)=>b.m.createdAt-a.m.createdAt)[0];
  const wary=(relationship?.resentment??0)>=50||(relationship?.fear??0)>=50;
  const strength=(at:number)=>Math.max(0,1-(w.tick-at)/(7*144));
  const gratitude=help&&!wary?Number(((2+n.personality.empathy/25)*strength(help.m.createdAt)).toFixed(2)):0;
  const reliability=kept&&!wary?Number(((2+n.personality.sociability/50)*strength(kept.m.createdAt)).toFixed(2)):0;
  return {share:gratitude,talk:reliability,borrow:gratitude,
    evidence:[...(gratitude?[help!.e!.id]:[]),...(reliability?[kept!.e!.id]:[])],
    reason:[...(gratitude?[`직접 받은 식량 도움을 기억해 보답·도움 요청 선호 +${gratitude.toFixed(1)}`]:[]),...(reliability?[`상환 약속을 지킨 경험으로 대화 선호 +${reliability.toFixed(1)}`]:[])].join(' · ')};
}
