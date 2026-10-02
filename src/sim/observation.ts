import type { WorldEvent, WorldState } from './types';
export const STORY_KINDS = ['gathering','consumption','share','talk','relationship','theft','witness','rumor','loan','repayment','default','family','birth','coming_of_age','education','inheritance','migration','death','request'];
export const DIGEST_GROUPS: Record<string, { label: string; kinds: string[] }> = {
  requests: { label: '부탁과 후속 관찰', kinds: ['request'] },
  relations: { label: '도움과 관계', kinds: ['gathering','share','talk','relationship','theft','witness','rumor','loan','repayment','default'] },
  family: { label: '가족과 삶', kinds: ['family','birth','coming_of_age','education','inheritance','migration','death'] },
  work: { label: '생산과 생활', kinds: ['production','industry','consumption','storage','trade','project','construction','freight'] },
  village: { label: '마을의 변화', kinds: ['weather','scarcity','health','ecology','council','diplomacy','policy','public_service'] },
};
export const DIGEST_KINDS = Object.values(DIGEST_GROUPS).flatMap(g => g.kinds);
export const RETURN_TOPICS = [
 {id:'family',label:'가족의 변화',kinds:['family','birth','coming_of_age','inheritance','death']},
 {id:'relations',label:'관계와 약속',kinds:['relationship','gathering','share','default','repayment']},
 {id:'homes',label:'주거와 공사',kinds:['construction','migration','trade']},
 {id:'nature',label:'농장과 생태',kinds:['ecology']},
];
export interface ReturnChange {topic:string;label:string;events:WorldEvent[]}
export interface ObserverPage {
  epoch: string; from: number; to: number; through: number; next: number | null;
  changes?:ReturnChange[]; events: WorldEvent[]; highlights: WorldEvent[]; counts: Record<string, number>; total: number;
}
export function involved(e: WorldEvent, ids: string[]) { return !ids.length || ids.some(id => e.actorId === id || e.targetId === id || e.participants.includes(id)); }
export function localObserver(w: WorldState, epoch: string, from: number, to: number, ids: string[] = [], story = false, before?: number, through = w.events.length, after = 0, partner?: string): ObserverPage {
  const rows = w.events.slice(0, through).map((e,i) => ({ e, seq:i+1 })).filter(({ e, seq }) => seq > after && e.tick >= from && e.tick <= to && involved(e, ids) && (!partner || involved(e,[partner])) && (story ? STORY_KINDS : DIGEST_KINDS).includes(e.kind) && (!story || e.kind !== 'consumption' || !!e.data.caregiver));
  const counts: Record<string,number> = {};
  rows.forEach(({e}) => counts[e.kind] = (counts[e.kind] ?? 0) + 1);
  const page = rows.filter(r => before === undefined || r.seq < before).reverse().slice(0,41);
  const highlights = rows.filter(({e})=>e.importance>=45).sort((a,b)=>b.e.importance-a.e.importance||b.seq-a.seq).slice(0,3).map(r=>r.e);
  const changes=RETURN_TOPICS.map(t=>({topic:t.id,label:t.label,events:rows.filter(({e})=>t.kinds.includes(e.kind)&&e.importance>=45).slice(-2).reverse().map(r=>r.e)}));
  return { changes, epoch, from, to, through, highlights, events: page.slice(0,40).map(r=>r.e), next: page.length > 40 ? page[39].seq : null, counts, total: rows.length };
}
