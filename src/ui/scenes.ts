import type { WorldState, NPC, Position } from '../sim/types';
import { ACTION_LABELS } from '../sim/types';
import { GATHERING_LABELS } from '../sim/gatherings-types';
import { constructionStatus } from '../sim/construction';
import { farmOutlook } from '../sim/agriculture';
import { stocks, market } from '../sim/civilization';
import { appearance, portrait } from './characters';
import { characterVisual } from './character-state';
import { activity } from './activity';
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export type SceneLens='all'|'work'|'social'|'life';
export interface Scene {id:string;kind:Exclude<SceneLens,'all'>;symbol:string;title:string;status:string;detail:string;position:Position;npc?:string;source?:string;progress?:number}
export function liveScenes(w:WorldState,settlementId:string):Scene[] {
  const scenes:Scene[]=[];
  for(const g of w.gatherings?.items??[])if(g.settlementId===settlementId&&g.status==='planned') {
    const host=w.npcs.find(n=>n.id===g.hostId)!;
    scenes.push({id:g.id,kind:'social',symbol:'◎',title:GATHERING_LABELS[g.kind],status:g.progress?'함께하는 중':g.arrivals.length?'약속 장소에 도착':'만남을 준비해요',detail:`${host.identity.name}의 초대 · 수락 ${g.invitations.filter(i=>i.status==='accepted').length}명 · 도착 ${g.arrivals.length}명`,position:w.buildings.find(b=>b.id===g.buildingId)!.position,npc:g.hostId,source:g.lastEventId,progress:Math.round(g.progress/6*100)});
  }
  for(const p of w.construction?.projects??[])if(p.settlementId===settlementId&&!p.buildingId)scenes.push({id:p.id,kind:'work',symbol:'⌂',title:p.kind==='home'?'새집이 자라는 자리':'새 농장을 만드는 중',status:constructionStatus(w,p),detail:`공정 ${Math.floor(p.progress/p.required*100)}% · 실제 지급 임금 ${p.labor?.paid??0}코인`,position:p.position,npc:p.labor?.workerId,source:p.lastEventId,progress:Math.floor(p.progress/p.required*100)});
  for(const p of w.cooperation?.projects??[])if(p.settlementId===settlementId&&p.status==='collecting')scenes.push({id:p.id,kind:'work',symbol:'◇',title:p.kind==='home'?'이웃들이 준비하는 새집':'함께 준비하는 농장',status:'자재와 일손을 모아요',detail:`목재 ${stocks(w,settlementId).wood}/${p.kind==='home'?12:16} · 임금 기금 ${market(w,settlementId).coins}/${p.kind==='home'?18:36}코인`,position:w.civilization.settlements.find(v=>v.id===settlementId)!.center,npc:p.proposerId,source:p.latest});
  for(const n of w.npcs.filter(n=>n.alive&&n.settlementId===settlementId&&n.currentAction&&!n.currentAction.targetId?.startsWith('construction:')&&n.currentAction.kind!=='Attend').sort((a,b)=>Number(['Talk','Share'].includes(b.currentAction!.kind))-Number(['Talk','Share'].includes(a.currentAction!.kind))||a.id.localeCompare(b.id)).slice(0,8)) {
    const a=n.currentAction!;
    const kind=['Talk','Share','Borrow','Repay'].includes(a.kind)?'social':['Work','Gather','StoreItem','Trade'].includes(a.kind)?'work':'life';
    const task=activity(w,n);
    scenes.push({id:n.id,kind,symbol:kind==='social'?'♡':kind==='work'?'✦':'◌',title:`${n.identity.name}의 ${ACTION_LABELS[a.kind]}`,status:task.moving?`${task.steps}칸을 더 걸어요`:task.label,detail:a.reason,position:n.position,npc:n.id,source:a.evidence?.[0],progress:task.moving?undefined:task.progress});
  }
  return scenes;
}
export function scenesView(w:WorldState,lens:SceneLens,settlementId:string) {
  const all=liveScenes(w,settlementId),scenes=all.filter(s=>lens==='all'||s.kind===lens).slice(0,4);
  const plan=w.cooperation?.provisions.find(p=>p.settlementId===settlementId);
  return `<header class="scene-heading"><div><span class="eyebrow">마을의 지금</span><h2>작은 순간을 가까이</h2></div><span class="scene-hint">현장을 누르면 지도로 이동해요</span></header><div class="scene-tabs" role="group" aria-label="현장 관찰 주제">${Object.entries({all:'모든 순간',work:'일과 준비',social:'함께하는 사이',life:'저마다의 생활'}).map(([key,label])=>`<button data-scene-lens="${key}" aria-pressed="${lens===key}">${label}</button>`).join('')}</div><div class="scene-cards">${scenes.map(s=>`<article class="scene-card ${s.kind}" data-reading-key="scene-${esc(s.id)}"><div class="scene-label"><span class="scene-symbol">${s.symbol}</span><span>${esc(s.status)}</span></div><h3>${esc(s.title)}</h3><p>${esc(s.detail)}</p>${s.progress!==undefined?`<div class="scene-progress"><progress max="100" value="${s.progress}" aria-label="${esc(s.title)} 진행률"></progress><b>${s.progress}%</b></div>`:''}<div class="scene-actions"><button class="button dark" data-scene="${esc(s.id)}">현장 보기 ↗</button>${s.source?`<button class="text-button" data-event="${esc(s.source)}">이유 읽기</button>`:''}</div></article>`).join('')||'<p class="scene-empty">아직 이 주제의 활동이 없습니다. 시간이 흐르면 실제 행동이 이곳에 나타납니다.</p>'}</div>${plan?`<div class="provision-strip"><span>${plan.risk?'◒ 준비 중':'● 비축 충족'}</span><b>${esc(plan.season)}을 살아갈 식량</b><span>하루 필요량 약 ${plan.demand}개 · 기록 시점 식량 ${plan.food}/${plan.target}개</span><button class="text-button" data-event="${esc(plan.source)}">준비와 결과 ↗</button></div>`:''}`;
}
export function focusView(w:WorldState,n:NPC) {
  const task=activity(w,n),a=n.currentAction;
  const destination=a?w.buildings.find(b=>b.id===a.targetId):undefined;
  return `<div class="focus-portrait">${portrait(appearance(n),characterVisual(n,w))}</div><div class="focus-copy"><span>지금 바라보는 주민</span><h3>${esc(n.identity.name)} <small>${n.alive?task.moving?'이동 중':task.label:'남겨진 삶'}</small></h3><p>${esc(!n.alive?'이 주민의 삶과 관계는 기록에 남아 있습니다.':a?task.moving?`${destination?.name??'목적지'}까지 ${task.steps}칸 · ${a.reason}`:a.reason:task.reason)}</p></div><button class="button" data-focus-follow="${esc(n.id)}">가까이 보기</button>`;
}
