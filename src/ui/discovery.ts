import { ACTION_LABELS, GOAL_LABELS, type NPC, type WorldState } from '../sim/types';
import { REQUEST_LABELS } from '../sim/requests-types';
import { GATHERING_LABELS, type Gathering } from '../sim/gatherings-types';
import { dayOf, timeLabel } from '../sim/random';
import { occupationLabel } from '../sim/employment';
import { appearance, portrait } from './characters';
import { characterVisual } from './character-state';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const LENSES = { all: '모든 이야기', watched: '관심 주민', help: '도움이 필요한 날', social: '함께하는 사이' };
export type Lens = keyof typeof LENSES;
export interface Discovery { npc: NPC; category: 'help'|'social'|'daily'; label: string; title: string; detail: string; source?: string; score: number }
// A bounded, read-only index over the current snapshot. No invented dialogue or outcomes.
export function discover(w: WorldState, lens: Lens, watched: string[]): Discovery[] {
  const people = new Map(w.npcs.map(n => [n.id, n]));
  const requests = new Map(w.requests.items.filter(r => ['open','deferred','observing'].includes(r.status)).map(r => [r.npcId, r]));
  const gatherings = new Map<string, Gathering>();
  for (const g of (w.gatherings?.items ?? []).filter(g => g.status === 'planned')) {
    gatherings.set(g.hostId, g);
    for (const i of g.invitations) if (i.status === 'accepted') gatherings.set(i.npcId, g);
  }
  const cards: Discovery[] = [];
  for (const n of w.npcs) {
    if (lens === 'watched' && !watched.includes(n.id)) continue;
    const r = requests.get(n.id), g = gatherings.get(n.id);
    const relationship = n.relationships.filter(r => people.has(r.npcId) && r.evidence.length).sort((a,b) => b.familiarity - a.familiarity || a.npcId.localeCompare(b.npcId))[0];
    let card: Discovery;
    if (!n.alive) card = {npc:n,category:'daily',label:'남겨진 삶',title:'마을에 남은 발자취',detail:'이 주민이 남긴 만남과 선택을 삶의 기록에서 다시 읽어 보세요.',source:n.life.deathEventId,score:0};
    else if (r && lens !== 'social') card = {npc:n,category:'help',label:r.status==='observing'?'도움 이후의 생활':'주민의 부탁',title:REQUEST_LABELS[r.kind],detail:r.status==='observing'?'도움 이후 생활이 어떻게 달라지는지 기록에서 이어 보세요.':r.status==='deferred'?'다시 살펴보기로 한 부탁입니다. 지금의 생활과 이후 경과를 확인해 보세요.':'아직 답을 기다리는 부탁입니다. 이 주민의 생활을 먼저 살펴보세요.',source:r.lastEventId,score:100};
    else if (g && lens !== 'help') card = {npc:n,category:'social',label:'다가오는 약속',title:GATHERING_LABELS[g.kind],detail:`${dayOf(g.startsAt)}일 ${timeLabel(g.startsAt)} · ${g.hostId===n.id?'이웃을 초대한 주민입니다.':'초대를 수락한 주민입니다.'} ${g.reason}`,source:g.lastEventId,score:85};
    else if (lens !== 'social' && (n.needs.hunger>65 || n.needs.health<55)) card = {npc:n,category:'help',label:'지금의 생활',title:n.needs.hunger>65?'다음 끼니가 필요한 하루':'쉬어 갈 시간이 필요한 하루',detail:`현재 배고픔 ${Math.round(n.needs.hunger)} · 건강 ${Math.round(n.needs.health)}. 지금 하는 일과 생활의 변화를 따라가 보세요.`,score:70};
    else if (relationship && lens !== 'help') card = {npc:n,category:'social',label:'기록으로 이어진 사이',title:`${people.get(relationship.npcId)!.identity.name}와의 관계`,detail:relationship.interpretation,source:relationship.evidence.at(-1),score:60};
    else card = {npc:n,category:'daily',label:'저마다의 하루',title:n.goals[0]?GOAL_LABELS[n.goals[0].kind]:'오늘은 어떤 하루일까요',detail:n.currentAction?`${ACTION_LABELS[n.currentAction.kind]} · ${n.currentAction.reason}`:'아직 다음 행동을 정하는 중입니다. 시간이 흐르면 이웃과의 만남이 기록됩니다.',source:n.goals[0]?.sourceEventId,score:10};
    if (lens === 'help' && card.category !== 'help' || lens === 'social' && card.category !== 'social') continue;
    if (!n.alive && lens !== 'watched') continue;
    cards.push(card);
  }
  return cards.sort((a,b) => b.score-a.score || a.npc.id.localeCompare(b.npc.id));
}

export class DiscoveryWalk {
  private epoch = '';
  private lens: Lens = 'all';
  private cards: Discovery[] = [];
  private snapshot?: WorldState;
  private offset = 0;
  private watched = '';
  private steps: string[] = [];
  private dismissed = false;
  constructor(private options: { state:()=>WorldState; epoch:()=>string; watched:()=>string[] }) {}
  update() {
    const epoch = this.options.epoch();
    if (epoch !== this.epoch) {
      this.epoch=epoch;this.lens='all';this.steps=[];this.dismissed=false;
      try { const saved=JSON.parse(localStorage.getItem(`lsw-walk:${epoch}`)??'null');
        if (saved) {this.steps=Array.isArray(saved.steps)?saved.steps.filter((s:unknown)=>['meet','watch','read'].includes(String(s))):[];this.dismissed=saved.dismissed===true;}
      } catch { /* Observation remains available without device storage. */ }
      this.refresh();
    }
    const watched=this.options.watched().join('|');
    if (watched !== this.watched) {this.watched=watched; if(this.lens==='watched')this.refresh();}
  }
  refresh() {this.snapshot=this.options.state();this.cards=discover(this.snapshot,this.lens,this.options.watched());this.offset=0;this.render();}
  choose(lens: string) {if(Object.hasOwn(LENSES,lens)){this.lens=lens as Lens;this.refresh();}}
  next() {this.offset=this.offset+3>=this.cards.length?0:this.offset+3;this.render();}
  mark(step: 'meet'|'watch'|'read') {if(!this.steps.includes(step)){this.steps.push(step);this.save();this.renderGuide();}}
  guide(show: boolean) {this.dismissed=!show;this.save();this.renderGuide();}
  private save() {try{localStorage.setItem(`lsw-walk:${this.epoch}`,JSON.stringify({steps:this.steps,dismissed:this.dismissed}));}catch{}}
  private renderGuide() {
    const node=document.getElementById('walk-guide');if(!node)return;
    const complete=this.steps.length===3;
    node.hidden=this.dismissed;
    node.innerHTML=`<div><span class="eyebrow">${complete?'작은 인연의 시작':'처음이라면, 이렇게 산책해 보세요'}</span><h3>${complete?'이제, 이 사람의 내일도 만나 보세요.':'한 사람을 알게 되면 마을이 달라 보입니다.'}</h3><p>${complete?'관심 주민의 새 소식은 ‘마을의 하루’에서 이어 볼 수 있어요.':'주민을 따라가고, 별로 기억하고, 그 사람이 남긴 이야기를 읽어 보세요.'}</p></div><ol>${[['meet','주민 따라보기'],['watch','관심 주민에 별 달기'],['read','삶의 이야기 읽기']].map(([id,label],i)=>`<li class="${this.steps.includes(id)?'done':''}"><span>${this.steps.includes(id)?'✓':i+1}</span>${label}</li>`).join('')}</ol><button class="text-button" data-walk-dismiss aria-label="첫 관찰 안내 접기">접어 두기 ×</button>`;
  }
  private render() {
    const node=document.getElementById('story-walk');if(!node||!this.snapshot)return;
    const active=document.activeElement as HTMLElement | null;
    const focusKey=active && node.contains(active) ? ['data-walk-lens','data-walk-refresh','data-walk-next'].find(k=>active.hasAttribute(k)) : undefined;
    const focusValue=focusKey?active!.getAttribute(focusKey):null;
    const w=this.snapshot;
    node.innerHTML=`<div class="walk-heading"><div><span class="eyebrow">SMALL MOMENTS, GROWING STORIES</span><h2>오늘은 누구의 하루를 따라갈까요?</h2><p>작은 부탁 하나, 함께 먹는 한 끼. 마을의 이야기는 사람에게서 시작됩니다.</p></div><button class="button" data-walk-refresh>새 이야기 찾기 ↻</button></div><div class="walk-filters" role="group" aria-label="이야기 주제">${Object.entries(LENSES).map(([key,label])=>`<button data-walk-lens="${key}" aria-pressed="${key===this.lens}">${label}</button>`).join('')}</div><div class="walk-cards">${this.cards.slice(this.offset,this.offset+3).map(c=>`<article class="walk-card ${c.category}" data-walk-person="${esc(c.npc.id)}"><div class="walk-person">${portrait(appearance(c.npc),characterVisual(c.npc,w))}<div><span class="walk-category">${esc(c.label)}</span><h3>${esc(c.npc.identity.name)} <small>${esc(occupationLabel(w,c.npc))}</small></h3></div></div><h4>${esc(c.title)}</h4><p>${esc(c.detail)}</p><div class="walk-links"><button class="button dark" data-npc="${esc(c.npc.id)}">하루 따라보기 ↗</button><button class="text-button" data-biography="${esc(c.npc.id)}">삶의 이야기</button>${c.source?`<button class="text-button" data-event="${esc(c.source)}">근거 기록</button>`:''}</div></article>`).join('')||`<div class="walk-empty"><span>잎이 돋기를 기다리듯</span><h3>${this.lens==='watched'?'아직 기억해 둔 주민이 없어요.':'이 주제에 해당하는 주민이 아직 없어요.'}</h3><p>${this.lens==='watched'?'주민 정보의 ☆를 누르면 이곳에서 다시 만날 수 있어요.':'다른 이야기를 둘러보거나 시간이 흐른 뒤 새 이야기를 찾아보세요.'}</p><button class="button" data-walk-lens="all">모든 이야기 둘러보기</button></div>`}</div><div class="walk-foot"><span>${dayOf(w.tick)}일 ${timeLabel(w.tick)}에 살펴본 모습 · 읽는 동안 카드는 유지됩니다.</span>${this.cards.length>3?`<button class="text-button" data-walk-next>다른 주민 만나기 · ${Math.floor(this.offset/3)+1}/${Math.ceil(this.cards.length/3)} →</button>`:''}</div>`;
    this.renderGuide();
    if(focusKey) Array.from(node.querySelectorAll<HTMLButtonElement>(`[${focusKey}]`)).find(b=>b.getAttribute(focusKey)===focusValue)?.focus({preventScroll:true});
  }
}
