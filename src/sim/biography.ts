import { ACTION_LABELS, GOAL_LABELS, type NPC, type WorldEvent, type WorldState } from './types';
import { GATHERING_LABELS } from './gatherings-types';
import { REQUEST_LABELS } from './requests-types';
import { pendingFollowup } from './requests';

export const TURN_KINDS = ['arrival','coming_of_age','occupation','migration','family','birth','death','inheritance','education','goal','project','share','default','repayment'];
export const isTurningPoint = (e:WorldEvent) => TURN_KINDS.includes(e.kind)&&(e.kind!=='arrival'||e.importance>=45);
export type BiographyMode = 'turns' | 'threads' | 'shared';
export interface LifeChapter { event: WorldEvent; before?: WorldEvent; after: WorldEvent[]; more: boolean }
export interface BiographyPage { epoch: string; npc: string; mode: BiographyMode; through: number; next: number | null; chapters: LifeChapter[]; local?: boolean }
export interface LifeThread { id: string; title: string; status: string; detail: string; source?: string; latest?: string }
export function lifeThreads(w: WorldState, n: NPC): LifeThread[] {
  if (!n.alive) return [];
  const threads: LifeThread[] = n.goals.map(g => ({ id:g.id,title:GOAL_LABELS[g.kind],status:'현재 목표',detail:g.reason,source:g.sourceEventId }));
  for (const g of w.gatherings?.items ?? []) {
    const invitation=g.invitations.find(i=>i.npcId===n.id);
    if (g.status!=='planned' || (g.hostId!==n.id && invitation?.status!=='accepted')) continue;
    threads.push({id:g.id,title:GATHERING_LABELS[g.kind],status:g.arrivals.some(a=>a.npcId===n.id)?'도착 · 함께할 이웃을 기다리는 중':'수락한 약속',detail:`${Math.floor(g.startsAt/144)+1}일 ${String(Math.floor(g.startsAt%144/6)).padStart(2,'0')}:${String(g.startsAt%6*10).padStart(2,'0')} · ${g.hostId===n.id?g.reason:invitation!.reason}`,source:g.sourceEventId,latest:g.lastEventId});
  }
  for (const r of w.requests.items.filter(r=>r.npcId===n.id && (['open','deferred','observing'].includes(r.status)||pendingFollowup(r)))) {
    threads.push({id:r.id,title:REQUEST_LABELS[r.kind],status:r.status==='open'?'답을 기다리는 부탁':r.status==='deferred'?'다시 살펴볼 부탁':'도움 이후의 생활 관찰',detail:r.followups?.at(-1)?`${r.followups.at(-1)!.days}일 뒤 관찰: ${r.followups.at(-1)!.needRemains?'필요가 남아 있음':'해당 필요가 완화됨'}`:'실제 응답과 후속 생활을 이 기록에서 이어 봅니다.',source:r.sourceEventId,latest:r.lastEventId});
  }
  for (const l of w.loans.filter(l=>l.status!=='repaid'&&(l.borrowerId===n.id||l.lenderId===n.id))) {
    const borrower=l.borrowerId===n.id,other=w.npcs.find(p=>p.id===(borrower?l.lenderId:l.borrowerId));
    threads.push({id:l.id,title:borrower?'갚아야 할 빚':'돌려받을 식량',status:l.status==='defaulted'?'연체 · 상환 기록 기다리는 중':'상환을 기다리는 중',detail:`${other?.identity.name ?? '이웃'} · 남은 식량 ${l.remaining}개 · ${Math.floor(l.due/144)+1}일 기한`,source:l.sourceEventId});
  }
  return threads;
}
export function lifeIntroduction(w: WorldState, n: NPC) {
  const challenges: string[]=[];
  if(n.alive) {
    if(n.needs.hunger>65)challenges.push(`배고픔 ${Math.round(n.needs.hunger)}`);
    if(n.needs.thirst>65)challenges.push(`갈증 ${Math.round(n.needs.thirst)}`);
    if(n.needs.health<55)challenges.push(`건강 ${Math.round(n.needs.health)}`);
    if(n.needs.fatigue>75)challenges.push(`피로 ${Math.round(n.needs.fatigue)}`);
    if(n.needs.social<30)challenges.push('교류가 필요한 상태');
  }
  const people=n.relationships.slice().sort((a,b)=>(Number(b.family)*100+b.familiarity+Math.abs(b.affection)+b.resentment)-(Number(a.family)*100+a.familiarity+Math.abs(a.affection)+a.resentment)).slice(0,3).map(r=>({id:r.npcId,meaning:r.interpretation,evidence:r.evidence.slice(-2)}));
  const latest=w.events.filter(e=>(e.actorId===n.id||e.targetId===n.id||e.participants.includes(n.id))&&isTurningPoint(e)).at(-1);
  return { challenges, people, latest, action:n.alive&&n.currentAction?`${ACTION_LABELS[n.currentAction.kind]} · ${n.currentAction.reason}`:undefined };
}
export const threadRoot = (e:WorldEvent) => e.kind==='loan'||e.kind==='goal'||e.kind==='request'&&e.data.phase==='offered'||e.kind==='gathering'&&e.data.phase==='proposed';
export const follows = (root:WorldEvent,e:WorldEvent) => e.id!==root.id && (e.causeId===root.id || ['requestId','gatheringId'].some(k=>typeof root.data[k]==='string'&&e.data[k]===root.data[k]));
export function localBiography(w:WorldState,epoch:string,npc:string,mode:BiographyMode,through=w.events.length,before=through+1,root?:string,partner?:string):BiographyPage {
  const events=w.events.slice(0,through), involved=(e:WorldEvent,id:string)=>e.actorId===id||e.targetId===id||e.participants.includes(id);
  // Local saves have no authenticated creator ownership. Do not invent different participants.
  const source=root?events.find(e=>e.id===root):undefined;
  if(root&&(!source||!events.some(e=>involved(e,npc)&&(e.id===root||follows(source,e)))))throw new Error('이 주민의 시작 기록을 찾을 수 없습니다.');
  const participated=(e:WorldEvent)=>involved(e,npc)||mode==='threads'&&e.kind==='gathering'&&events.some(x=>follows(e,x)&&involved(x,npc));
  const rows=events.map((e,i)=>({e,seq:i+1})).filter(({e,seq})=>seq<before&&(source||participated(e))&&(!partner||involved(e,partner))&&(source?e.id===root||follows(source,e):mode==='turns'?isTurningPoint(e):mode==='threads'?threadRoot(e):false)).reverse().slice(0,13);
  return {epoch,npc,mode,through,next:rows.length>12?rows[11].seq:null,local:true,chapters:rows.slice(0,12).map(({e})=>{const after=root?[]:events.filter(x=>follows(e,x));return {event:e,...(!root&&e.causeId?{before:events.find(x=>x.id===e.causeId)}:{}),after:after.slice(-6),more:after.length>6};})};
}
