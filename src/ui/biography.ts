import { lifeIntroduction, lifeThreads, localBiography, type BiographyMode, type BiographyPage } from '../sim/biography';
import { GOAL_LABELS, type NPC, type WorldState } from '../sim/types';
import { dayOf } from '../sim/random';
import { storyEvent } from './story-event';
import { socialMotives } from '../sim/social-motives';
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const evidence=(id?:string)=>id?`<button class="text-button" data-event="${esc(id)}">원본 기록 ↗</button>`:'';
const person=(w:WorldState,id:string)=>`<button class="text-button" data-npc="${esc(id)}">${esc(w.npcs.find(n=>n.id===id)?.identity.name??id)}</button>`;
export function lifeIntroductionView(w:WorldState,n:NPC) {
  const intro=lifeIntroduction(w,n),threads=lifeThreads(w,n),children=w.npcs.filter(p=>p.life.parentIds.includes(n.id));
  return `<section class="life-introduction" aria-label="삶의 소개"><span class="eyebrow">${n.alive?'이 사람의 오늘':'남아 있는 삶의 흔적'}</span><h3>${esc(n.identity.name)}의 이야기</h3>${n.alive?`<p><b>바라는 것</b> ${n.goals.length?n.goals.map(g=>esc(GOAL_LABELS[g.kind])).join(' · '):'아직 정해진 장기 목표가 없습니다.'}</p><p><b>지금의 어려움</b> ${intro.challenges.length?intro.challenges.join(' · '):'현재 크게 높아진 생존 욕구는 없습니다.'}</p>`:`<p>${n.life.deathTick!==undefined?`${dayOf(n.life.deathTick)}일에 세상을 떠났습니다.`:'사망한 주민의 기록입니다.'} ${evidence(n.life.deathEventId)}</p><p><b>이어지는 가족</b> ${children.map(p=>person(w,p.id)).join(' · ')||'기록된 자녀가 없습니다.'}</p>`}
  <p><b>삶에 얽힌 사람</b> ${intro.people.map(p=>person(w,p.id)).join(' · ')||'아직 기록된 관계가 없습니다.'}</p>${intro.latest?`<p><b>최근 남은 기록</b> ${esc(intro.latest.description)} ${evidence(intro.latest.id)}</p>`:''}<div class="life-actions"><button class="button" data-biography="${esc(n.id)}">삶의 전환점</button><button class="button" data-biography="${esc(n.id)}" data-mode="threads">이어지는 일 ${threads.length}</button><button class="button" data-biography="${esc(n.id)}" data-mode="shared">함께 만든 역사</button></div></section>`;
}
export function lifeThreadsView(w:WorldState,n:NPC) {
  const threads=lifeThreads(w,n);
  return `<section class="life-threads"><h3>아직 이어지는 일</h3><p class="muted">현재 상태입니다. 목표의 달성 여부는 별도 기록이 있을 때만 확인할 수 있습니다.</p>${threads.map(t=>`<article class="life-thread" data-reading-key="thread-${esc(t.id)}"><small>${esc(t.status)}</small><h4>${esc(t.title)}</h4><p>${esc(t.detail)}</p>${t.source?`<button class="text-button" data-biography="${esc(n.id)}" data-mode="threads" data-root="${esc(t.source)}">시작부터 경과 보기 ↗</button>`:'<span class="muted">별도 시작 사건이 없는 목표입니다.</span>'}${t.latest&&t.latest!==t.source?evidence(t.latest):''}</article>`).join('')||`<p>${n.alive?'현재 이어지는 약속·부탁·빚·목표가 없습니다.':'사망 이후 새 계획은 진행하지 않습니다. 남긴 일은 아래 원본 기록에서 확인할 수 있습니다.'}</p>`}</section>`;
}
export function perspectivesView(w:WorldState,a:NPC,b:NPC) {
  return `<section class="life-perspectives"><h3>서로의 관점</h3><p class="muted">각자의 현재 관계 해석과 직접 보존한 기억입니다. 상대의 속마음을 알고 있다는 뜻은 아닙니다.</p><div class="perspective-grid">${[[a,b],[b,a]].map(([n,other])=>{
    const r=n.relationships.find(r=>r.npcId===other.id),memories=n.memories.filter(m=>m.relatedNpcIds.includes(other.id)).sort((x,y)=>y.createdAt-x.createdAt).slice(0,3),motives=socialMotives(w,n,other);
    return `<article><h4>${esc(n.identity.name)} → ${esc(other.identity.name)}</h4><p>${esc(r?.interpretation??'아직 관계 해석이 없습니다.')}</p>${r?`<small>신뢰 ${r.trust.toFixed(0)} · 불만 ${r.resentment.toFixed(0)} · 두려움 ${r.fear.toFixed(0)}</small>`:''}${memories.map(m=>`<p>${esc(m.description)} ${evidence(m.sourceEventId)}</p>`).join('')||'<p class="muted">현재 보존한 둘 사이의 기억이 없습니다. 원본 사건은 아래에서 확인할 수 있습니다.</p>'}${n.alive&&motives.reason?`<p class="life-motive">지금 선택에 남은 경험: ${esc(motives.reason)}</p>`:''}</article>`;
  }).join('')}</div></section>`;
}
interface Options {state:()=>WorldState;epoch:()=>string;cloud:()=>boolean;get:<T>(path:string)=>Promise<T>;open:(html:string)=>void;error:(s:string)=>void}
export class Biography {
  private generation=0;
  private page?:BiographyPage;
  private npc=''; private mode:BiographyMode='turns'; private root=''; private partner=''; private lastLink='';
  private openedEpoch='';
  constructor(private options:Options){}
  async open(npc:string,mode:BiographyMode='turns',root='',partner='',more=false) {
    const epoch=this.options.epoch(),n=this.options.state().npcs.find(n=>n.id===npc);
    if(!n){this.options.error('이야기의 주민을 찾을 수 없습니다.');return;}
    if(!['turns','threads','shared'].includes(mode)){this.options.error('이야기 종류를 확인해 주세요.');return;}
    const previous=more?this.page:undefined,token=++this.generation;
    this.openedEpoch=epoch;
    this.npc=npc;this.mode=mode;this.root=root;this.partner=partner;
    this.options.open(`<section id="biography" data-token="${token}"><h2>${esc(n.identity.name)}의 삶</h2><p role="status">기록을 불러오고 있습니다…</p></section>`);
    const valid=()=>token===this.generation&&epoch===this.options.epoch()&&document.querySelector<HTMLDialogElement>('#detail-dialog')?.open&&document.querySelector('#biography')?.getAttribute('data-token')===String(token);
    try {
      const p=new URLSearchParams({epoch,npc,mode});if(root)p.set('root',root);if(partner)p.set('partner',partner);
      if(previous){p.set('through',String(previous.through));if(previous.next!==null)p.set('before',String(previous.next));}
      const result=this.options.cloud()?await this.options.get<BiographyPage>(`biography?${p}`):localBiography(this.options.state(),epoch,npc,mode,previous?.through,previous?.next??undefined,root||undefined,partner||undefined);
      if(!valid()||result.epoch!==epoch)return;
      this.page={...result,chapters:previous?[...previous.chapters,...result.chapters].slice(0,120):result.chapters};
      this.render(token);
    } catch(error) {if(valid())document.querySelector('#biography')!.innerHTML=`<h2>이야기를 읽지 못했습니다.</h2><p role="alert">${esc((error as Error).message)}</p><button class="button" data-biography="${esc(npc)}" data-mode="${mode}" data-root="${esc(root)}" data-partner="${esc(partner)}">다시 불러오기</button>`;}
  }
  private render(token:number) {
    const w=this.options.state(),n=w.npcs.find(n=>n.id===this.npc)!,page=this.page!,p=w.npcs.find(p=>p.id===this.partner);
    const modes:Record<BiographyMode,string>={turns:'삶의 전환점',threads:'이어지는 일',shared:'함께 만든 역사'};
    const link=new URL(location.href);link.hash=`life?${new URLSearchParams({epoch:page.epoch,npc:this.npc,mode:this.mode,...(this.root?{root:this.root}:{}),...(this.partner?{partner:this.partner}:{})})}`;
    document.querySelector('#biography')!.innerHTML=`<h2>${esc(n.identity.name)}의 삶</h2><nav class="life-actions" aria-label="이야기 종류">${Object.entries(modes).map(([mode,label])=>`<button class="button" aria-pressed="${mode===this.mode}" data-biography="${esc(n.id)}" data-mode="${mode}">${label}</button>`).join('')}</nav>${this.mode==='threads'&&!this.root?lifeThreadsView(w,n):''}
    ${p?perspectivesView(w,n,p):''}<label class="life-partner">함께 살펴볼 주민<select id="biography-partner"><option value="">모든 관계</option>${w.npcs.filter(x=>x.id!==n.id&&(n.relationships.some(r=>r.npcId===x.id)||x.profile||n.life.parentIds.includes(x.id)||x.life.parentIds.includes(n.id))).map(x=>`<option value="${esc(x.id)}" ${x.id===this.partner?'selected':''}>${esc(x.identity.name)}</option>`).join('')}</select></label>
    <div class="life-share"><label for="biography-link">초대받은 사람과 같은 기록 보기</label><input id="biography-link" readonly value="${esc(link.href)}"/><button class="button" data-copy-life>링크 복사</button><span id="life-copy-status" role="status"></span></div>
    <h3>${this.root?'이 일에 남은 경과':this.mode==='threads'?'시작과 그 이후의 기록':modes[this.mode]}</h3><p class="muted">${this.mode==='shared'&&!this.root?'서로 다른 참여자가 만든 주민이 함께 등장한 실제 사건입니다. ':''}${page.local&&this.mode==='shared'?'기기 저장에는 계정별 생성자 정보가 없어 공동 역사를 구분하지 않습니다. ':''}최근 기록부터 표시합니다. ${this.root?'같은 일의 기록을 이전 페이지까지 이어 볼 수 있습니다.':'전후 기록은 명시된 원인이나 같은 약속·부탁으로 연결된 경우에만 표시합니다.'} 현재 상태와 당시 기록은 다를 수 있습니다.</p>
    <div class="life-chapters">${page.chapters.map(c=>`<article class="life-chapter" data-reading-key="chapter-${esc(c.event.id)}">${c.before?`<details><summary>기록된 계기</summary>${storyEvent(c.before)}</details>`:''}<div class="life-turn">${storyEvent(c.event)}</div>${c.after.length?`<details><summary>그 뒤에 남은 기록 ${c.after.length}건${c.more?' · 최근 일부':''}</summary>${c.after.map(storyEvent).join('')}</details>`:this.root?'':'<p class="muted">이 조회 시점에 연결된 후속 기록이 없습니다.</p>'}${!this.root?`<button class="text-button" data-biography="${esc(n.id)}" data-mode="${this.mode}" data-root="${esc(c.event.id)}">이 일의 경과와 링크 ↗</button>`:''}</article>`).join('')||'<p>조건에 맞는 기록이 아직 없습니다.</p>'}</div>${page.next!==null&&page.chapters.length<120?'<button class="button" data-life-more>이전 기록 더 보기</button>':''}${page.chapters.length>=120?'<p>한 화면에는 120건까지 표시합니다. 더 오래된 사건은 세계의 기록에서 조회하세요.</p>':''}<button class="button" data-biography="${esc(n.id)}" data-mode="${this.mode}" data-root="${esc(this.root)}" data-partner="${esc(this.partner)}">최신 기록으로 새로 보기</button>`;
    document.querySelector('#biography')!.setAttribute('data-token',String(token));
  }
  more(){if(this.page&&this.page.next!==null)void this.open(this.npc,this.mode,this.root,this.partner,true);}
  pair(partner:string){void this.open(this.npc,this.mode,'',partner);}
  async copy(){const field=document.querySelector<HTMLInputElement>('#biography-link');if(!field)return;try{await navigator.clipboard.writeText(field.value);const status=document.querySelector('#life-copy-status');if(status)status.textContent='링크를 복사했습니다.';}catch{field.focus();field.select();const status=document.querySelector('#life-copy-status');if(status)status.textContent='주소를 선택했습니다. 복사해 주세요.';}}
  readLink(){
    if(this.openedEpoch&&this.openedEpoch!==this.options.epoch()&&document.querySelector('#biography')){
      this.generation++;this.page=undefined;this.openedEpoch='';document.querySelector('#biography')!.innerHTML='<h2>세계가 바뀌었습니다.</h2><p>현재 세계에서 주민의 이야기를 다시 열어 주세요.</p>';
    }
    if(!location.hash.startsWith('#life?')||this.lastLink===location.hash)return;
    this.lastLink=location.hash;const p=new URLSearchParams(location.hash.slice(6));
    if(p.get('epoch')!==this.options.epoch()){this.options.error('현재 세계와 다른 세계의 이야기 링크입니다.');return;}
    void this.open(p.get('npc')??'',(p.get('mode')??'turns') as BiographyMode,p.get('root')??'',p.get('partner')??'');
  }
}
