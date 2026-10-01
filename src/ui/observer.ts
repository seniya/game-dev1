import { storyEvent } from './story-event';
import { DIGEST_GROUPS, localObserver, type ObserverPage } from '../sim/observation';
import { dayOf, timeLabel } from '../sim/random';
import type { WorldState } from '../sim/types';
import { updateReadingPanel } from './reading-panel';
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
interface ObserverOptions { state:()=>WorldState; epoch:()=>string; cloud:()=>boolean; get:(path:string)=>Promise<ObserverPage>; open:(html:string)=>void; error:(message:string)=>void }
export class Observer {
  private epoch = '';
  private returnTick = 0;
  private returnSeq = 0;
  private latest = { tick:0, through:0 };
  private page?: ObserverPage;
  private mode: 'today'|'yesterday'|'since' = 'today';
  private onlyWatched = false;
  private request = 0;
  private storyRequest = 0;
  private busy = false;
  constructor(private options: ObserverOptions) {}
  update(w: WorldState, epoch: string, through: number) {
    if (epoch !== this.epoch) {
      this.onlyWatched = false; this.epoch = epoch; this.page = undefined; this.request++; this.storyRequest++; this.busy = false;
      this.returnTick = Math.floor(w.tick/144)*144; this.returnSeq = 0;
      try {
        const saved = JSON.parse(localStorage.getItem(`lsw-observed:${epoch}`) ?? 'null');
        if (saved && Number.isSafeInteger(saved.tick) && saved.tick>=0 && saved.tick<=w.tick && Number.isSafeInteger(saved.through) && saved.through>=0 && saved.through<=through) { this.returnTick=saved.tick; this.returnSeq=saved.through; this.mode='since'; }
        else this.mode='today';
      } catch { this.mode='today'; }
    }
    this.latest={ tick:w.tick, through };
    const n = w.npcs.find(n=>n.id===w.observation.watchIds[0]);
    updateReadingPanel(document.getElementById('observer-heading')!, `<div><span class="eyebrow">다시 만나는 작은 세계</span><h2>마을의 하루</h2><p>관심 주민 ${w.observation.watchIds.length}/12명${n ? ` · ${esc(n.identity.name)}${w.observation.watchIds.length>1?' 외':''}` : ' · 주민의 별을 눌러 기억해 두세요'}</p></div><div class="observer-actions"><button class="button" data-digest="since">지난 관찰 이후</button><button class="button" data-digest="today">오늘</button><button class="button" data-digest="yesterday">어제</button><button class="text-button" data-watch-digest>관심 주민 이야기</button></div>`,epoch);
    updateReadingPanel(document.getElementById('watch-list')!, w.observation.watchIds.map(id=>{const n=w.npcs.find(n=>n.id===id)!;return `<button class="watch-chip" data-npc="${esc(id)}">★ ${esc(n.identity.name)}${n.alive?'':' · 추모'}</button>`;}).join(''),epoch);
    if (!this.page && !this.busy) void this.load();
  }
  saveSeen() {
    if (!this.epoch) return;
    try { localStorage.setItem(`lsw-observed:${this.epoch}`,JSON.stringify(this.latest)); } catch { /* Read-only observation still works if storage is unavailable. */ }
  }
  async show(mode: 'today'|'yesterday'|'since', watched=false) { this.mode=mode; this.onlyWatched=watched; this.page=undefined; await this.load(); }
  async load(more=false) {
    if (more && (!this.page?.next || this.busy)) return;
    const id=++this.request, epoch=this.epoch, w=this.options.state(); this.busy=true;
    const dayStart=Math.floor(w.tick/144)*144;
    const from=more ? this.page!.from : this.mode==='since'?this.returnTick:this.mode==='yesterday'?Math.max(0,dayStart-144):dayStart;
    const to=more ? this.page!.to : this.mode==='yesterday'?Math.max(0,dayStart-1):w.tick;
    const through=more ? this.page!.through : this.latest.through;
    const ids=this.onlyWatched ? w.observation.watchIds : [];
    const label=this.onlyWatched?'관심 주민 · ':'';
    const shell=document.getElementById('observer-content')!;
    if (!more) updateReadingPanel(shell,'<p role="status">실제 기록을 모으고 있습니다…</p>',`${epoch}:${this.mode}:${this.onlyWatched}`);
    try {
      let result: ObserverPage;
      const after=this.mode==='since'?this.returnSeq:0;
      if (this.onlyWatched && !ids.length) result={epoch,from,to,through,events:[],highlights:[],counts:{},total:0,next:null};
      else if (this.options.cloud()) {
        const params=new URLSearchParams({epoch,from:String(from),to:String(to),through:String(through),after:String(after)});
        ids.forEach(n=>params.append('npc',n)); if(more&&this.page?.next) params.set('before',String(this.page.next));
        result=await this.options.get(`observer?${params}`);
      } else result=localObserver(w,epoch,from,to,ids,false,more?this.page?.next??undefined:undefined,through,after);
      if(id!==this.request || epoch!==this.options.epoch() || result.epoch!==epoch) return;
      this.page={...result,events:more?[...this.page!.events,...result.events].slice(0,400):result.events};
      const page=this.page;
      updateReadingPanel(shell,`<p class="observer-period">${label}${dayOf(from)}일 ${timeLabel(from)} ~ ${dayOf(to)}일 ${timeLabel(to)} · 기록 ${page.total}건</p><div class="digest-counts">${Object.values(DIGEST_GROUPS).map(g=>`<span>${g.label} <b>${g.kinds.reduce((sum,k)=>sum+(page.counts[k]??0),0)}</b></span>`).join('')}</div>${page.highlights.length?`<div class="digest-highlights"><b>주요 변화</b>${page.highlights.map(storyEvent).join('')}</div>`:''}<details id="digest-events"><summary>기록 펼치기 · 최근 사건부터 ${page.events.length}건</summary>${page.events.map(storyEvent).join('') || `<p>${this.onlyWatched&&!ids.length?'관심 주민을 먼저 지정해 주세요.':'이 기간에 해당하는 기록이 없습니다.'}</p>`}${page.events.length>=400 ? '<p>화면에는 최근 400건까지 펼칩니다. 더 오래된 사건은 세계의 기록에서 날짜로 찾을 수 있습니다.</p>' : ''}${page.next!==null&&page.events.length<400?'<button class="button" data-digest-more>이 기간의 이전 기록 더 보기</button>':''}</details><p class="request-note">이 기기에서 마지막으로 관찰한 시점과 비교합니다. 관심 주민은 세계 저장과 다른 기기에도 이어집니다. 진행 중 최신 변화는 위 기간 버튼으로 다시 확인하세요.</p>`,`${epoch}:${this.mode}:${this.onlyWatched}`);
    } catch(error) { if(id===this.request) updateReadingPanel(shell,`<p role="status">${esc((error as Error).message)}</p><button class="button" data-digest="${this.mode}">다시 불러오기</button>`,epoch); }
    finally { if(id===this.request)this.busy=false; }
  }
  async story(npcId: string, more=false) {
    const id=++this.storyRequest, epoch=this.epoch, w=this.options.state(), n=w.npcs.find(n=>n.id===npcId); if(!n)return;
    const old=this.storyPage, through=more&&old?old.through:this.latest.through, to=more&&old?old.to:w.tick;
    if (!more) this.options.open('<h2>관계와 가족의 이야기</h2><p role="status">근거 기록을 불러오고 있습니다…</p>');
    try {
      const params=new URLSearchParams({epoch,npc:npcId,mode:'story',from:'0',to:String(to),through:String(through)});
      if(more&&old?.next)params.set('before',String(old.next));
      const result=this.options.cloud()?await this.options.get(`observer?${params}`):localObserver(w,epoch,0,to,[npcId],true,more?old?.next??undefined:undefined,through);
      if(id!==this.storyRequest || epoch!==this.options.epoch() || !document.querySelector<HTMLDialogElement>('#detail-dialog')?.open || !document.querySelector('#dialog-content')?.textContent?.includes('관계와 가족의 이야기'))return;
      this.storyPage={...result,events:more?[...old!.events,...result.events].slice(0,400):result.events};
      const family=w.npcs.filter(p=>p.id!==n.id&&(p.id===n.life.partnerId||n.life.parentIds.includes(p.id)||p.life.parentIds.includes(n.id)||p.alive&&n.alive&&p.homeId===n.homeId));
      updateReadingPanel(document.getElementById('dialog-content')!,`<h2>관계와 가족의 이야기 · ${esc(n.identity.name)}</h2><p>함께 살거나 가족으로 이어진 주민</p><div class="observer-actions">${family.map(p=>`<button class="watch-chip" data-npc="${esc(p.id)}">${esc(p.identity.name)} · ${p.id===n.life.partnerId?'동반자':n.life.parentIds.includes(p.id)?'부모':p.life.parentIds.includes(n.id)?'자녀':'동거인'}</button>`).join('')||'<span>현재 연결된 가족·동거인이 없습니다.</span>'}</div><p class="request-note">도움·갈등 이후의 만남과 가족생활을 실제 기록으로 따라갑니다. 원인과 판단 근거가 기록된 경우에만 연결하며, 소문과 주민의 해석을 구분합니다.</p>${this.storyPage.events.map(storyEvent).join('')||'<p>아직 관계와 가족의 기록이 없습니다.</p>'}${this.storyPage.events.length>=400?'<p>더 오래된 사건은 주민 생애나 세계의 기록에서 확인하세요.</p>':''}${result.next!==null&&this.storyPage.events.length<400?`<button class="button" data-story-more="${esc(npcId)}">이전 이야기 더 보기</button>`:''}`,`${epoch}:${npcId}:story`);
    } catch(error) { if(id===this.storyRequest)this.options.error((error as Error).message); }
  }
  private storyPage?: ObserverPage;
}
