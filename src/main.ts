import { promisesView } from './ui/gatherings';
import { operationsHistory } from './ui/operations';
import { conversationGatherings } from './sim/gatherings';
import { landQuote } from './sim/frontier';
import { generateExpression } from './ui/expressions';
import { uploadSave, postJSON } from './ui/uploads';
import type { OperationsStatus } from './server/operations';
import { DiscoveryWalk } from './ui/discovery';
import { inspectSave } from './sim/save-inspection';
import { storageView, importPreview } from './ui/storage';
import type { StorageStatus } from './server/storage-status';
import { Biography, lifeIntroductionView } from './ui/biography';
import type { BiographyMode } from './sim/biography';
import { gatheringsView } from './ui/gatherings';
import { dailyPlanView, cognitionMemoryView } from './ui/cognition';
import { Observer } from './ui/observer';
import { activityView } from './ui/activity';
import { requestsView, requestPrompt } from './ui/requests';
import type { RequestChoice } from './sim/requests-types';
import { updateReadingPanel, withReadingPosition } from './ui/reading-panel';
import { observationView } from './ui/observation';
import { villageSize } from './sim/civilization';
import { objectInspector, objectName, type ObjectSelection } from './ui/objects';
import { characterStatus, characterVisual } from './ui/character-state';
import { attractionProfile, attractionRelation, charmPreview } from './ui/attraction';
import { DEFAULT_POPULATION } from './sim/types';
import { occupationLabel } from './sim/employment';
import { livingPersonView } from './ui/living';
import { LOOK_PRESETS, defaultCharacter, characterForm, readCharacter, greetingOptions, appearance, portrait } from './ui/characters';
import { RECOLLECTION_LABELS, RECOLLECTION_TOPICS, recollections, type RecollectionTopic } from './sim/recollection';
import { historyView, treeView, type HistoryPage } from './ui/heritage';
import { historyMatches, type HistoryTopic } from './sim/history';
import { setUrbanLayer, setDistrict } from './ui/urban';
import type { Service } from './sim/urban-types';
import { stocks, market } from './sim/civilization';
import { familyView, civilizationView } from './ui/civilization';
import { ChromeRunner } from './ui/chrome';
import { CloudClient, type CloudAction } from './ui/cloud';
import { eventLink } from './ui/observatory';
import './ui/styles.css';
import './ui/mobile.css';
import { setupResponsiveUI, revealInspector } from './ui/responsive';
import { Simulation, summarize } from './sim/engine';
import { ACTION_LABELS, OCCUPATIONS, GOAL_LABELS, type WorldState, type WorldEvent, type NPC } from './sim/types';
import { dayOf, timeLabel } from './sim/random';
import { DecisionCoordinator } from './llm/coordinator';
import { MockLLMProvider } from './llm/provider';
import { economyView, lifeHistory, timeline, knowledge } from './ui/observatory';
import { WorldMap, npcColor } from './ui/map';
import { motionTrace, type MotionTrace } from './sim/motion';
import { mergeLiveJournal, type EventPage } from './ui/journal';

const icon = (name: string, size = 18) => {
  const paths: Record<string, string> = {
    leaf: '<path d="M20 4C8 2 2 8 5 15c4 8 15 2 15-11Z"/><path d="m4 21 11-12M9 16v-5m0 5h5"/>',
    world: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"/>',
    book: '<path d="M4 4h6l2 2 2-2h6v16h-6l-2 2-2-2H4ZM12 6v16M7 8h2m6 0h2M7 12h2m6 0h2"/>',
    flask: '<path d="M9 3h6m-5 0v7L4 20h16l-6-10V3M8 14h8"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',
    food: '<path d="M12 22V5m0 7C6 13 4 9 5 5c4 0 7 3 7 7Zm0 5c6 1 8-3 7-7-4 0-7 3-7 7Zm0-10c-3-3-2-5 0-6 2 1 3 3 0 6Z"/>',
    heart: '<path d="M20 5c-3-3-7-1-8 2-1-3-5-5-8-2-6 6 8 16 8 16S26 11 20 5Z"/>',
    spark: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"/>',
    save: '<path d="M5 3h12l4 4v14H3V3Zm2 0v6h10V3M7 21v-7h10v7"/>',
    load: '<path d="M3 7h7l2 3h9l-3 10H3ZM3 7V4h7l2 3h7v3"/>',
    play: '<path d="m8 4 12 8-12 8Z"/>', pause: '<path d="M8 4v16M16 4v16"/>', step: '<path d="m5 5 10 7-10 7ZM19 5v14"/>',
    grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    arrow: '<path d="m9 5 7 7-7 7"/>', search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.spark}</svg>`;
};
const esc = (s: string) => s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const STORAGE_KEY = 'living-small-world-v1';
const BACKUP_KEY = 'living-small-world-before-reset-v1';
let sim = new Simulation(42, DEFAULT_POPULATION), coordinator = new DecisionCoordinator(sim, new MockLLMProvider());
const cloudMode = new URLSearchParams(location.search).get('local') !== '1';
let cloud: CloudClient | undefined;
let cloudReady = false;
let personalVillage: string | undefined;
const isOwner = () => !cloudMode || cloud?.session?.role === 'owner';
const isOwnNPC = (n: NPC) => cloudMode ? cloud?.session?.ownNpcIds.includes(n.id) ?? false : !!n.profile;
let requestBusy = false;
interface AIStatus { chrome?: { schedule?: { hourlyCalls: number; hourlyLimit: number }; dailyLimit: number; usage: { calls: number }; jobs: { id: string; epoch: string; status: string; attempts: number; error: string | null }[] }; configured: boolean; model: string | null; day: string; dailyLimit: number; maxOutputTokens: number; usage: { calls: number; inputTokens: number; outputTokens: number }; jobs: { id: string; epoch: string; kind: string; status: string; attempts: number; error: string | null; model: string }[] }
let aiStatus: AIStatus | undefined;
let chromeRunner: ChromeRunner | undefined;
let journalKey = '', journalNext: number | null = null, journalEpoch = '', journalEvents: WorldEvent[] = [], journalRequest = 0;
let journalPage: EventPage | undefined;
let lifeLoading = false, lifeLoaded = false;
let lifeKey = '', lifeNext: number | null = null, lifeEvents: WorldEvent[] = [], lifeRequest = 0;
let startupNote = '';
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && !cloudMode) { sim = Simulation.load(saved); coordinator = new DecisionCoordinator(sim, new MockLLMProvider()); startupNote = '이 기기에 저장된 작은 세계를 이어갑니다.'; }
} catch { startupNote = '기기의 저장을 읽지 못해 새 세계를 시작했습니다. JSON 파일로 불러올 수 있습니다.'; }
let localWorldKey = '';
try { localWorldKey = localStorage.getItem('lsw-local-world-key') ?? ''; } catch {}
if (!localWorldKey) { localWorldKey = crypto.randomUUID(); try { localStorage.setItem('lsw-local-world-key',localWorldKey); } catch {} }
let state = sim.snapshot(), selectedId = state.npcs[0].id, playing = true, speed = 1, tab = 'overview', view = 'world', filter = 'important', search = '', selectedOnly = false, eventLimit = 40, lastSaveTick = sim.tick;
if (cloudMode) playing = false;
let metric = 'food', lifeLimit = 40;
let presentationMotion: MotionTrace | undefined;
const observationEpoch = () => cloudMode ? cloud?.world?.epoch ?? 'loading' : `local:${localWorldKey}`;
const observer = new Observer({ state:()=>state, epoch:observationEpoch, cloud:()=>cloudMode, get:<T>(path:string)=>cloud!.get<T>(path), changed:()=>render(), ownIds:()=>cloudMode ? cloud?.session?.ownNpcIds.slice(-12) ?? [] : state.npcs.filter(n=>n.profile).slice(-12).map(n=>n.id), open:openDialog, error:toast });
const biography = new Biography({state:()=>state,epoch:observationEpoch,cloud:()=>cloudMode,get:<T>(path:string)=>cloud!.get<T>(path),open:openDialog,error:toast});
window.addEventListener('hashchange',()=>{if(!cloudMode||cloudReady)biography.readLink();});
const walk = new DiscoveryWalk({state:()=>state,epoch:observationEpoch,watched:()=>observer.watchIds(state)});
let immersive = false;
const markupCache = new Map<string, string>();
function setHTML(id: string, html: string) { if (markupCache.get(id) !== html) { $(id).innerHTML = html; markupCache.set(id, html); } }
let noticeTimer: ReturnType<typeof setTimeout>;

$('app').innerHTML = `
  <aside class="sidebar">
    <a class="brand" href="#" aria-label="Living Small World 홈"><span class="brand-icon">${icon('leaf', 27)}</span><span>living<br><b>small world<span class="brand-dot">.</span></b></span></a>
    <div class="sidebar-caption">작은 세계 관측소</div>
    <nav aria-label="주 메뉴">
      <button class="nav-button active" data-view="world" aria-current="page" aria-label="세계 관찰" title="세계 관찰">${icon('world')}<span>세계 관찰</span><span class="nav-dot"></span></button>
      <button class="nav-button" data-view="residents" aria-label="마을 주민" title="마을 주민">${icon('people')}<span>마을 주민</span><span id="nav-population" class="nav-number">100</span></button>
      <button class="nav-button" data-view="history" aria-label="세계의 기록" title="세계의 기록">${icon('book')}<span>세계의 기록</span></button>
      <button class="nav-button" data-view="economy" aria-label="마을 경제">${icon('food')}<span>마을 경제</span></button>
      <button class="nav-button" data-view="experiments" aria-label="관찰 실험실" title="관찰 실험실">${icon('flask')}<span>관찰 실험실</span></button>
    </nav>
    <div class="world-note"><span class="eyebrow">A WORLD OF THEIR OWN</span><div class="note-illustration">${icon('leaf', 38)}<span>·</span>${icon('food', 28)}</div><p>작은 선택들이 모여<br>하나의 세계가 됩니다.</p><span>이야기는 지금도 자라고 있어요.</span></div>
    <div class="sidebar-bottom"><div class="engine-indicator"><i></i> 작은 세계 관측소 <span>v0.25</span></div><button id="about-button" class="quiet">${icon('book', 15)} 이 세계에 대하여</button></div>
  </aside>
  <main>
    <header class="topbar"><div class="breadcrumb">관측소 <span>/</span> <b id="breadcrumb-view">세계 관찰</b></div><div class="topbar-actions"><button id="account-button" class="button">공동 세계 참여</button><button id="create-character" class="button dark">＋ NPC 만들기</button><details id="world-tools" class="world-tools"><summary>세계 관리</summary><div class="world-tools-content"><span id="ai-badge" class="mock-badge">${icon('spark', 13)} Mock AI · API 없이 실행</span><button id="load-button" class="button">${icon('load', 16)} 불러오기</button><button id="save-button" class="button">${icon('save', 15)} 세계 저장</button></div></details></div></header>
    <div class="page-content">
      <section class="page-heading"><div><div class="eyebrow">LIVING SMALL WORLD</div><h1 id="page-title">이야기가 자라는 마을</h1><p id="page-subtitle">저마다의 하루가 만나, 이 세계만의 역사가 됩니다.</p></div><div class="world-status"><span id="running-dot" class="live-dot"></span><span id="running-status">세계가 살아가는 중</span><span class="seed-label">SEED <b id="seed-label">42</b></span></div></section>
      <details class="cloud-panel" id="connection-details"><summary><div><b>${cloudMode ? '서버에 이어지는 세계' : '이 기기의 세계'}</b><p id="cloud-status">${cloudMode ? '서버 세계를 불러오는 중…' : '이 기기에서만 진행하고 저장합니다.'}</p></div><span class="disclosure-label">연결 설정</span></summary><div class="cloud-actions">${cloudMode ? '<label><input id="offline-toggle" type="checkbox" disabled/> 자리를 비워도 진행</label><button id="cloud-retry" class="button">연결 새로고침</button><a class="text-button" href="?local=1">기기 세계 관찰</a>' : '<a class="button" href="/">서버 세계로 돌아가기</a>'}</div>${cloudMode ? '<p class="cloud-policy">기본은 비접속 시 정지입니다. 켜면 재접속할 때 최대 게임 하루(144틱)만 반영합니다. 재생·정지·배속 설정은 모든 기기에 적용됩니다.</p>' : ''}</details>
      <div id="world-view" class="world-layout"><nav class="world-shortcuts" aria-label="관찰 바로가기"><button data-world-jump="map-panel">지도</button><button data-world-jump="resident-inspector">주민 상세</button><button data-world-jump="world-feed">마을 소식</button></nav>
        <div class="world-toolbar"><span>마을을 바라보는 시간</span><div><button class="text-button" data-walk-jump>이야기 산책 ↓</button><button class="text-button" data-walk-guide>처음 오셨나요?</button><button id="immersive-button" class="button" aria-pressed="false">몰입 보기 ⤢</button></div></div>
        <section class="panel map-panel" id="map-panel" tabindex="-1"><div class="panel-heading"><div><span class="small-dot"></span><h2 id="village-title">느티나무 마을</h2><span class="muted location-caption">NEUTINAMU VILLAGE</span></div><div class="weather-info" id="weather"></div></div>
          <div class="map-controls"><div class="time-controls"><button id="play-button" class="play-button" aria-label="일시정지">${icon('pause', 17)}</button><button id="step-button" class="icon-button" aria-label="한 틱 진행">${icon('step', 17)}</button><span class="control-divider"></span><div class="speed-switch" aria-label="시뮬레이션 배속">${[1, 5, 20].map(s => `<button data-speed="${s}" class="${s === 1 ? 'active' : ''}" aria-pressed="${s === 1}">${s}×</button>`).join('')}</div></div><div class="game-clock" id="game-clock"></div></div><details id="map-options" class="map-options"><summary>지도 범위·시설 찾기</summary><div class="map-navigation"><label>지도 범위 <select id="map-mode"><option value="city">정착지 전체</option><option value="region">세계 전체</option><option value="follow">선택 주민 따라보기</option></select></label><button id="follow-character" class="button">선택 주민 찾기</button><label>시설·자원 선택 <select id="object-picker" aria-label="시설·자원 선택"><option value="">지도에서 고르기</option></select></label><span id="map-scope" class="muted"></span></div></details><div class="map-wrap"><canvas id="world-map" aria-label="주민을 클릭해 자세히 볼 수 있는 마을 지도. 마을 주민 메뉴에서도 선택할 수 있습니다."></canvas><div class="map-badge"><i></i> 작은 세계 · <span id="map-size">48 × 36</span></div><button class="map-grid-button" id="grid-button" aria-label="지도 격자 표시" aria-pressed="false">${icon('grid', 17)}</button><div class="map-compass"><span>N</span>↑</div></div>
          <section class="stats-grid" aria-label="세계 현황" id="stats"></section><div id="requests-prompt" class="requests-prompt" aria-live="off"></div><section id="walk-guide" class="walk-guide" aria-label="첫 관찰 안내"></section><section id="story-walk" class="story-walk" aria-label="이야기 산책"></section><section class="observer-panel" aria-label="마을의 하루"><div id="observer-heading" class="observer-heading"></div><div id="watch-list" class="watch-list"></div><div id="observer-content"></div></section><section id="requests-panel" class="requests-panel" aria-label="주민의 부탁" aria-live="off"></section><section id="observation-board" class="observation-board" aria-label="마을 관찰 과제"></section><div id="character-watch" class="character-watch" aria-live="off"></div><div id="civilization-panel" class="civilization-panel"></div>
          <div class="map-footer"><span><i class="legend-dot citizen"></i> 주민</span><span><i class="legend-dot farm"></i> 농장</span><span><i class="legend-dot resource"></i> 자원</span><span class="map-tip">주민·건물·자원을 선택해 살펴보세요</span></div>
        </section>
        <aside class="panel inspector" id="resident-inspector" tabindex="-1"><div class="inspector-title"><h2 id="inspector-heading">주민 들여다보기</h2><span class="muted">AGENT INSPECTOR</span></div><div id="npc-header"></div><div class="inspector-tabs" role="tablist"><button role="tab" aria-selected="true" data-tab="overview" class="active">일상</button><button role="tab" aria-selected="false" data-tab="relationships">관계</button><button role="tab" aria-selected="false" data-tab="memories">기억</button><button role="tab" aria-selected="false" data-tab="life">생애</button></div><div id="npc-detail" class="inspector-content"></div></aside>
      </div>
      <section id="economy-view" class="panel alternate-view" hidden></section>
      <section id="residents-view" class="panel alternate-view" hidden><div class="panel-heading"><h2>마을의 모든 주민</h2><span class="muted">주민을 선택해 삶의 흔적을 확인하세요.</span></div><div class="resident-search"><label>주민 검색<input id="resident-search" type="search" placeholder="이름 또는 직업"/></label><label><input id="custom-residents" type="checkbox"/> 내가 만든 주민만</label><span id="resident-count"></span></div><div id="resident-grid" class="resident-grid"></div></section>
      <section id="experiments-view" class="panel alternate-view" hidden><div class="panel-heading"><h2>조건을 바꾸고, 변화를 관찰하세요</h2><span class="muted">모든 개입은 세계의 기록에 남습니다.</span></div><div class="experiment-grid"><article><span class="experiment-icon">${icon('sun', 28)}</span><h3>비가 오지 않는다면</h3><p>3일 동안 가뭄을 만듭니다. 농장과 열매의 생산이 줄고 갈증은 빨라집니다. 식량이 부족해지면 주민들은 어떤 선택을 할까요?</p><button id="drought-button" class="button dark">3일 가뭄 시작</button></article><article><span class="experiment-icon">${icon('food', 28)}</span><h3>작은 도움의 시작</h3><p>공동 창고에 식량 24개를 보탭니다. 식량을 가져가는 사람과 이웃에게 나누는 사람, 그 뒤에 남는 관계를 관찰하세요.</p><button id="food-button" class="button dark">식량 24개 투입</button></article><article><span class="experiment-icon">${icon('world', 28)}</span><h3>다른 세계의 첫 아침</h3><p>같은 시드와 명령은 같은 결과를 만듭니다. 현재 세계는 자동 저장한 뒤 새 세계를 시작합니다.</p><form id="seed-form"><label for="population-input">초기 주민 수</label><input id="population-input" type="number" min="10" max="3000" value="${DEFAULT_POPULATION}" required/><p>기본 12명이 48×36칸의 여유로운 마을에서 시작합니다. 37명부터 여러 마을에 주거와 농업 기반을 갖추며, 401명부터 밀집 정착지로 시작합니다. 출생 포함 생존 인구는 최대 3,000명입니다.</p><label for="seed-input">월드 시드</label><div class="input-group"><input id="seed-input" type="number" min="0" max="4294967295" step="1" value="42" required/><button class="button dark" type="submit">새로 시작</button></div></form></article></div><div class="experiment-settings"><label ${cloudMode ? 'hidden' : ''}><input type="checkbox" id="llm-toggle" checked/> 중요한 사건의 Mock AI 해석 사용</label>${cloudMode ? '<div class="ai-settings"><label for="ai-mode">세계의 AI 방식</label><select id="ai-mode" disabled><option value="chrome">Chrome 내장 AI · 권장</option><option value="off">AI 끄기</option><option value="mock">Mock · 비용 없이 관찰</option><option value="remote" disabled>서버 모델 · 연결 설정 필요</option></select><div class="chrome-device"><b>이 기기의 Chrome AI</b><p id="chrome-status" role="status"></p><progress id="chrome-progress" max="100" value="0" hidden aria-label="Chrome 모델 다운로드 진행률"></progress><div class="cloud-actions"><button id="chrome-start" class="button" disabled>이 기기에서 다운로드·활성화</button><button id="chrome-stop" class="button" disabled>기기 실행 중단</button><button id="chrome-check" class="button">지원 다시 확인</button><button id="chrome-diagnostics" class="button">기기 진단 JSON 내보내기</button></div><p>Chrome 목표 선택은 영어 구조화 사건을 사용합니다. 한국어 이유는 서버가 구성하며 자유 대화는 지원하지 않습니다. 추론은 기기에서 실행하고 요청·승인 결과는 서버에 저장합니다. 탭을 숨기거나 닫으면 중단하며 외부 API로 자동 전환하지 않습니다.</p></div><p id="ai-status" role="status">모델 연결을 확인하고 있습니다.</p><div id="ai-usage" class="ai-usage"></div><details><summary>최근 모델 처리 기록</summary><div id="ai-audit"></div></details></div>' : ''}<p>끄더라도 주민의 생존·생산·사회 활동은 계속됩니다. AI는 목표와 해석만 제안합니다.</p><div id="llm-metrics"></div><button id="advance-day" class="button">하루 관찰 진행</button><button id="cancel-day" class="button" hidden>하루 진행 중단</button><p>144틱을 진행한 뒤 일시정지합니다. 서버의 401명 이상 세계는 나누어 저장하며 진행하고, 탭을 다시 열면 남은 진행을 이어갑니다. 경제 화면에서 생산·소비와 가격 변화를 확인하세요.</p></div></section>
      <section class="panel event-panel" id="event-panel"><div class="panel-heading"><div><h2>세계의 기록</h2><span class="record-badge">LIVE JOURNAL</span></div><button id="all-events-button" class="text-button">전체 기록 보기 ${icon('arrow', 14)}</button></div><div class="event-toolbar"><div class="event-filters">${[['important', '주요 사건'], ['social', '관계'], ['economy', '경제'], ['all', '모든 사건']].map(([value, text]) => `<button class="${value === 'important' ? 'active' : ''}" data-filter="${value}" aria-pressed="${value === 'important'}">${text}</button>`).join('')}</div><div class="event-search"><label><input id="selected-only" type="checkbox"/> 선택 주민</label><label class="search-box">${icon('search', 14)}<input id="event-search" placeholder="주민, 사건, ID 검색" aria-label="사건 검색"/></label></div></div><div class="journal-dates"><label>시작일 <input id="event-from" type="number" min="1" placeholder="전체" aria-label="기록 시작일"/></label><label>종료일 <input id="event-to" type="number" min="1" placeholder="전체" aria-label="기록 종료일"/></label></div><div id="events" class="event-list"></div><button id="more-events" class="more-button">이전 기록 더 보기</button></section>
      <footer class="page-footer"><span>${icon('leaf', 13)} 모든 이야기는 작은 선택에서 시작됩니다.</span><span id="save-status">자동 저장 대기 중 · 30초 간격</span></footer>
    </div>
  </main><input type="file" id="file-input" accept=".json,application/json" hidden/><div id="toast" class="toast" role="status" hidden></div><dialog id="detail-dialog"><button id="close-dialog" class="dialog-close" aria-label="닫기">×</button><div id="dialog-content"></div></dialog>`;

setupResponsiveUI();

let selectedObject: ObjectSelection | undefined;
const map = new WorldMap($<HTMLCanvasElement>('world-map'), selectNPC, selectObject);
function selectObject(selection: ObjectSelection) {
  const object = selection.kind === 'building' ? state.buildings.find(b => b.id === selection.id) : state.resources.find(r => r.id === selection.id);
  if (!object) return;
  $('npc-detail').scrollTop = 0; selectedObject = selection; map.focusObject(object.position); $<HTMLSelectElement>('map-mode').value = 'city'; render();
  revealInspector();
}
function toast(message: string) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => $('toast').hidden = true, 4500); }
function selectedNPC() { return state.npcs.find(n => n.id === selectedId) ?? state.npcs[0]; }
function selectNPC(id: string) { if (!state.npcs.some(n=>n.id===id)) return; walk.mark('meet'); selectedObject = undefined; selectedId = id; map.setMode('follow'); $<HTMLSelectElement>('map-mode').value = 'follow'; tab = 'overview'; lifeLimit = 40; setView('world'); render(); revealInspector(); }
function actionText(n: NPC) { return !n.alive ? '세상을 떠남' : !n.currentAction ? '다음 행동을 생각하는 중' : `${n.currentAction.path.length ? '이동 중 · ' : ''}${ACTION_LABELS[n.currentAction.kind]}`; }
function render() {
  if (!cloudMode) state = sim.snapshot();
  if (!cloudMode || cloudReady) biography.readLink();
  if (!cloudMode || cloudReady) walk.update();
  if (selectedObject && !objectName(state, selectedObject)) selectedObject = undefined;
  const living = state.npcs.filter(n => n.alive), socialCount = cloudMode ? cloud?.world?.meta.socialCount ?? 0 : state.events.filter(e => ['gathering', 'share', 'talk', 'witness', 'rumor'].includes(e.kind)).length;
  const averageHealth = Math.round(living.reduce((s, n) => s + n.needs.health, 0) / Math.max(1, living.length));
  setHTML('stats', [
    ['people', '함께 살아가는 주민', `${living.length}<small>명</small>`, `${state.npcs.length}개의 서로 다른 삶`, 'sage'],
    ['food', '모든 마을 공동 식량', `${state.civilization.settlements.reduce((s, v) => s + stocks(state, v.id).food, 0)}<small>개</small>`, `목재 ${state.civilization.settlements.reduce((s, v) => s + stocks(state, v.id).wood, 0)}개 · 시장 식량 ${state.civilization.settlements.reduce((s, v) => s + market(state, v.id).food, 0)}개`, 'wheat'],
    ['heart', '마을의 평균 건강', `${averageHealth}<small>/ 100</small>`, averageHealth > 75 ? '평온하게 이어지는 일상' : '주민들의 건강을 살펴보세요', 'rose'],
    ['book', '서로에게 남긴 이야기', `${socialCount}<small>건</small>`, `도움 ${state.stats.shares} · 갈등 ${state.stats.conflicts}`, 'blue'],
  ].map(([i, label, number, text, color]) => `<article class="stat-card"><span class="stat-icon ${color}">${icon(i, 21)}</span><div><div class="stat-label">${label}</div><div class="stat-number">${number}</div><div class="stat-note">${text}</div></div></article>`).join(''));
  if (!cloudMode || cloudReady) observer.update(state, observationEpoch(), cloud?.world?.meta.eventCount ?? state.events.length);
  updateReadingPanel($('requests-prompt'), requestPrompt(state), `request-prompt:${state.seed}`);
  updateReadingPanel($('requests-panel'), requestsView(state, requestBusy || cloudMode && !cloudReady, playing), `requests:${cloud?.world?.epoch ?? state.seed}`);
  updateReadingPanel($('observation-board'), `<details id="observation-details"><summary>마을 관찰 과제와 건설</summary>${observationView(state)}</details>`, `observation:${state.seed}`);
  $('nav-population').textContent = String(living.length); $('seed-label').textContent = String(state.seed); $('map-size').textContent = `${state.width} × ${state.height}`;
  const season = ['봄', '여름', '가을', '겨울'][Math.floor((dayOf(state.tick) - 1) / 3) % 4], weather = { sunny: '맑음', rain: '비', cloudy: '흐림', drought: '가뭄' }[state.weather];
  const hour=(state.tick%144)/6;
  document.querySelector<HTMLElement>('.map-wrap')!.dataset.daylight=hour<5||hour>=20?'night':hour<7||hour>=17?'golden':'day';
  $('weather').innerHTML = `${icon('sun', 16)} ${season} <span>·</span> ${weather}`;
  $('game-clock').innerHTML = `<b>${dayOf(state.tick)}일째</b><span>${Math.floor((dayOf(state.tick) - 1) / 12) + 1}년</span><span>${timeLabel(state.tick)}</span><span class="muted">${season}</span>`;
  $('running-status').textContent = playing ? '세계가 살아가는 중' : '잠시 멈춘 세계'; $('running-dot').classList.toggle('paused', !playing);
  $('play-button').innerHTML = icon(playing ? 'pause' : 'play', 17); $('play-button').setAttribute('aria-label', playing ? '일시정지' : '재생');
  const policyEditing = document.activeElement?.closest('#urban-policy');
  if (!policyEditing) updateReadingPanel($('civilization-panel'), civilizationView(state), `civilization:${cloud?.world?.epoch ?? state.seed}`);
  const objectVillage = selectedObject?.kind === 'building' ? state.buildings.find(b => b.id === selectedObject?.id)?.settlementId : undefined;
  $('village-title').textContent = objectVillage ? state.civilization.settlements.find(v => v.id === objectVillage)?.name ?? '정착지' : map.viewMode === 'region' ? '세계 전체 · 정착지와 교역' : state.civilization.settlements.find(v => v.id === (map.viewMode === 'follow' ? selectedNPC().settlementId : state.civilization.focus))?.name ?? '정착지';
  map.update(state, selectedId, { playing, trace: presentationMotion, interval: cloudMode ? 2000 : 700 / speed, buffered: cloudMode, object: selectedObject }); presentationMotion = undefined; renderCharacterWatch(); renderInspector(); renderEvents();
  if (view === 'residents') renderResidents();
  if (view === 'economy') $('economy-view').innerHTML = economyView(state, metric);
  $('llm-metrics').innerHTML = `<span>요청 ${state.llm.requested}</span><span>완료 ${state.llm.completed}</span><span>대기 ${state.llm.queue.length}</span><span>거부 ${state.llm.rejected}</span><span>실패 ${state.llm.failed}</span><span>게임 하루 요청 ${state.llm.dailyTotal} / 12</span>`;
  $('ai-badge').innerHTML = `${icon('spark', 13)} ${!state.llm.enabled ? '고차원 해석 꺼짐' : cloud?.world?.meta.aiMode === 'chrome' ? 'Chrome AI · 목표 선택' : cloud?.world?.meta.aiMode === 'remote' ? '서버 AI · 근거 있는 해석' : 'Mock AI · API 없이 실행'}`;
  $<HTMLInputElement>('llm-toggle').checked = state.llm.enabled;
  if (cloudMode) renderAI();
  applyAccessUI();
  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(b => { b.classList.toggle('active', b.dataset.tab === tab); b.setAttribute('aria-selected', String(b.dataset.tab === tab)); });
  // The summary is also available as a downloadable observational report.
  $('stats').title = `관측 ${Number(((state.tick - 36) / 144).toFixed(2))}일 · 전체 사건 ${cloudMode ? cloud?.world?.meta.eventCount ?? 0 : state.events.length}건`;
}
let localInspectorEpoch = 0;
function inspectorIdentity(includeTab = true) {
  return `${cloudMode ? cloud?.world?.epoch ?? 'loading' : localInspectorEpoch}:${selectedObject ? `${selectedObject.kind}:${selectedObject.id}` : selectedId}:${includeTab ? tab : 'header'}`;
}
function setInspectorHTML(html: string) { if(cloudMode && !selectedObject && isOwner() && selectedNPC().alive) html += `<div class="expression-controls"><button class="button" data-expression="dialogue">주민에게 물어보기</button><button class="button" data-expression="reflection">기억 돌아보기</button></div>`; updateReadingPanel($('npc-detail'), html, inspectorIdentity()); }
function renderInspector() { withReadingPosition($('npc-detail'), renderInspectorContent); }
function renderInspectorContent() {
  if (selectedObject && !objectName(state, selectedObject)) selectedObject = undefined;
  $('inspector-heading').textContent = selectedObject ? '장소 들여다보기' : '주민 들여다보기';
  document.querySelector<HTMLElement>('.inspector-tabs')!.hidden = !!selectedObject;
  if (selectedObject) {
    updateReadingPanel($('npc-header'), `<div class="object-inspector-bar"><span>선택한 장소</span><button class="text-button" data-npc="${esc(selectedId)}">주민으로 돌아가기 ↗</button></div>`, inspectorIdentity(false));
    setInspectorHTML(objectInspector(state, selectedObject)); return;
  }
  const n = selectedNPC();
  updateReadingPanel($('npc-header'), `<div class="npc-profile"><div class="avatar" style="--person-color:${npcColor(n)}">${portrait(appearance(n), characterVisual(n, state))}<span class="avatar-dot ${n.alive ? '' : 'dead'}"></span></div><div><h3>${esc(n.identity.name)} <button class="watch-star" data-watch="${esc(n.id)}" aria-label="${observer.watchIds(state).includes(n.id) ? '관심 주민 해제' : '관심 주민 지정'}" aria-pressed="${observer.watchIds(state).includes(n.id)}">${observer.watchIds(state).includes(n.id) ? '★' : '☆'}</button><span>${n.identity.age}세${isOwnNPC(n) ? ' · 내 NPC' : n.profile ? ' · 참여자 NPC' : ''}</span></h3><p>${occupationLabel(state, n)} <span>·</span> ${esc(state.buildings.find(b => b.id === n.homeId)?.name ?? '')}</p>${characterStatus(n, state)}<span class="personality-tag">${n.personality.empathy > 60 ? '다정한 이웃' : n.personality.greed > 65 ? '야심 있는 수집가' : n.personality.diligence > 55 ? '성실한 일꾼' : '느긋한 생활자'}</span></div><button id="next-npc" class="icon-button" aria-label="다음 주민">${icon('arrow', 17)}</button></div>`, inspectorIdentity(false));
  if (tab === 'life') { if (cloudMode) { renderCloudLife(); return; } setInspectorHTML(lifeHistory(state, n, lifeLimit)); return; }
  if (tab === 'relationships') {
    setInspectorHTML(`<button class="button" data-story="${esc(n.id)}">관계와 가족의 이야기</button>${attractionProfile(state, n)}<div class="section-label">사건으로 이어진 관계 <span>${n.relationships.length}</span></div>${n.relationships.length ? [...n.relationships].sort((a, b) => b.trust - a.trust).map(r => `<article class="relationship-card" data-reading-key="relationship-${esc(r.npcId)}"><div><button class="text-button" data-npc="${esc(r.npcId)}">${esc(state.npcs.find(p => p.id === r.npcId)?.identity.name ?? r.npcId)}</button><span>신뢰 <b>${Math.round(r.trust)}</b></span></div><p>${esc(r.interpretation)}</p>${attractionRelation(state, n, r.npcId)}<div class="relation-values">친밀 ${r.familiarity.toFixed(0)} · 애정 ${r.affection.toFixed(0)} · 존중 ${r.respect.toFixed(0)}<br>두려움 ${r.fear.toFixed(0)} · 불만 ${r.resentment.toFixed(0)}</div><button class="evidence-link" data-relation="${esc(r.npcId)}">관계의 근거 ${r.evidence.length}건 ${icon('arrow', 12)}</button>${cloudMode && cloud?.world?.meta.aiMode !== 'chrome' && n.alive && state.npcs.find(p => p.id === r.npcId)?.alive && n.memories.some(m => m.relatedNpcIds.includes(r.npcId)) ? `<button class="button dialogue-button" data-dialogue="${esc(r.npcId)}" ${!state.llm.enabled || cloud?.world?.meta.dialogue ? 'disabled' : ''}>기억에 근거한 말 듣기</button>${RECOLLECTION_TOPICS.filter(t => t !== 'shared' && recollections(n.memories, r.npcId, t).length).map(t => `<button class="button dialogue-button" data-dialogue="${esc(r.npcId)}" data-recall="${t}" ${!state.llm.enabled || cloud?.world?.meta.dialogue || cloud?.world?.meta.history ? 'disabled' : ''}>${RECOLLECTION_LABELS[t]}</button>`).join('')}` : ''}</article>`).join('') : '<div class="empty-state">아직 서로를 알아가는 중이에요.<br>대화와 도움이 쌓이면 관계가 생깁니다.</div>'}`);
    return;
  }
  if (tab === 'memories') {
    setInspectorHTML(`${cognitionMemoryView(n)}<div class="section-label spaced">마음에 남은 순간 <span>${n.memories.length} / 40</span></div>${n.memories.length ? [...n.memories].sort((a, b) => b.createdAt - a.createdAt).map(m => `<button class="memory-card" data-event="${esc(m.sourceEventId)}"><span class="memory-date">${dayOf(m.createdAt)}일째 · 중요도 ${Math.round(m.importance)}${m.repetitions > 1 ? ` · 반복 ${m.repetitions}회` : ''}</span><p>${esc(m.description)}</p><span class="evidence-link">실제 사건으로 돌아가기 ${icon('arrow', 12)}</span></button>`).join('') : '<div class="empty-state">아직 오래 간직할 기억이 없어요.<br>의미 있는 경험이 마음에 남습니다.</div>'}<p class="inspector-footnote">일상의 기억은 서서히 흐려집니다. 원래 사건은 세계의 기록에 남아 있습니다.</p>`);
    return;
  }
  const needLabels = [['hunger', '배고픔', false], ['thirst', '갈증', false], ['fatigue', '피로', false], ['health', '건강', true], ['social', '사회적 충족', true], ['safety', '안전감', true]] as const;
  setInspectorHTML(`${lifeIntroductionView(state,n)}${activityView(state,n)}<div class="action-box"><span class="section-label">지금 하고 있는 일</span><div>${icon(n.currentAction?.path.length ? 'arrow' : 'leaf', 17)}<b>${actionText(n)}</b><span class="small-live-dot"></span></div></div>
    ${n.profile ? `<div class="character-background"><p>${esc(n.profile.background) || '이곳에서 새로운 삶을 시작한 주민입니다.'}</p><button class="evidence-link" data-event="${esc(n.profile.arrivalEventId)}">입주 기록 보기</button></div>` : ''}<div class="section-label needs-title">몸과 마음 <span>0 — 100</span></div><div class="needs-list">${needLabels.map(([key, label, positive]) => { const value = Math.round(n.needs[key]), danger = positive ? value < 35 : value > 75; return `<div class="need-row"><span>${label}</span><div class="need-track"><i style="width:${value}%;background:${danger ? '#c9826c' : positive ? '#7d9c86' : '#b7a275'}"></i></div><b>${value}</b></div>`; }).join('')}</div>
    <div class="section-label spaced">왜 이 행동을 할까요? ${icon('spark', 13)}</div><div class="reason-box">${esc(n.decision.reason)}<div class="reason-foot">Utility AI · ${timeLabel(n.decision.tick)} 판단</div></div>
    <details class="utility-details"><summary>행동 후보 점수 보기</summary><div>${n.decision.candidates.map(c => `<div class="utility-row"><span>${ACTION_LABELS[c.kind]}<small>${esc(c.reason)}</small>${(c.evidence ?? []).map(id => `<button class="evidence-link" data-event="${esc(id)}">${esc(id)}</button>`).join('')}</span><b>${c.score.toFixed(1)}</b></div>`).join('') || '<p>첫 틱이 지나면 판단을 확인할 수 있습니다.</p>'}</div></details>
    ${dailyPlanView(state, n)}${gatheringsView(state, n)}<div class="section-label spaced">지금의 바람</div>${n.goals.map(g => `<div class="goal-row" data-reading-key="goal-${esc(g.id)}">${icon('leaf', 14)}<div><b>${GOAL_LABELS[g.kind]}</b><p>${esc(g.reason)}</p>${g.sourceEventId ? `<button class="evidence-link" data-event="${esc(g.sourceEventId)}">계기가 된 사건 보기</button>` : ''}</div></div>`).join('')}
    <div class="inventory-strip"><span>${icon('food', 14)} 식량 <b>${n.inventory.food}</b></span><span>목재 <b>${n.inventory.wood}</b></span><span>재산 <b>${n.wealth}</b></span></div>
    ${attractionProfile(state, n)}${livingPersonView(state, n)}<details class="personality-details"><summary>성격과 생활 정보</summary><p>근면 ${n.personality.diligence.toFixed(0)} · 탐욕 ${n.personality.greed.toFixed(0)} · 사교 ${n.personality.sociability.toFixed(0)}<br>공격성 ${n.personality.aggression.toFixed(0)} · 공감 ${n.personality.empathy.toFixed(0)} · 호기심 ${n.personality.curiosity.toFixed(0)}</p><p>좌표 (${n.position.x}, ${n.position.y}) · 오늘 식량 인출 ${n.dailyTaken}/3<br>기억 ${n.memories.length} · 관계 ${n.relationships.length}</p></details>`);
}
let residentPage = 0, residentSearch = '', customResidents = false;
function renderResidents() {
  const residents = state.npcs.filter(n => (!customResidents || isOwnNPC(n)) && `${n.identity.name} ${occupationLabel(state, n)}`.includes(residentSearch));
  $('resident-count').textContent = `${residents.length}명`;
  residentPage = Math.min(residentPage, Math.max(0, Math.ceil(residents.length / 60) - 1));
  $('resident-grid').innerHTML = residents.slice(residentPage * 60, (residentPage + 1) * 60).map(n => `<button class="resident-card" data-npc="${esc(n.id)}"><span class="resident-dot">${portrait(appearance(n), characterVisual(n, state))}</span><div><h3>${esc(n.identity.name)}${isOwnNPC(n) ? ' <small>내 NPC</small>' : n.profile ? ' <small>참여자 NPC</small>' : ''} <small>${occupationLabel(state, n)}</small></h3><p>${actionText(n)}</p><span>배고픔 ${n.needs.hunger.toFixed(0)} · 건강 ${n.needs.health.toFixed(0)} · 식량 ${n.inventory.food}</span></div>${icon('arrow', 16)}</button>`).join('') + (residents.length > 60 ? `<div class="resident-paging"><button class="button" data-resident-page="-1" ${residentPage === 0 ? 'disabled' : ''}>이전 주민</button><span>${residentPage + 1} / ${Math.ceil(residents.length / 60)}</span><button class="button" data-resident-page="1" ${(residentPage + 1) * 60 >= residents.length ? 'disabled' : ''}>다음 주민 목록</button></div>` : '');
}
const kindLabels: Partial<Record<WorldEvent['kind'], string>> = { gathering: '함께하는 약속', request: '주민의 부탁', ecology: '생태 변화', council: '주민 공동결정', diplomacy: '도시 관계', industry: '산업 생산', public_service: '공공서비스', tax: '세금·임대', urban: '도시 관측', policy: '정책 변경', freight: '물자 운송', family: '가족 형성', birth: '출생', coming_of_age: '성년', inheritance: '상속', education: '기술 전승', construction: '건설', settlement: '새 정착지', migration: '이주', caravan: '마을 교역', occupation: '직업 변화', price: '가격 산정', wage: '노동 보상', share: '따뜻한 도움', theft: '식량 절도', witness: '목격', rumor: '소문', talk: '이웃의 대화', relationship: '관계 변화', memory: '새로운 기억', goal: '새로운 바람', weather: '마을의 날씨', scarcity: '식량 부족', health: '건강', death: '마지막 인사', production: '생산', consumption: '생활', storage: '공동 창고', trade: '거래', loan: '대여', repayment: '상환', default: '연체', experiment: '관찰 실험', project: '목표 달성', llm: '사건 해석', arrival: '이동', failure: '계획 변경' };
function renderEvents() {
  if (cloudMode) { void loadJournal(); return; }
  const filtered = state.events.filter(e => {
    const from = Number($<HTMLInputElement>('event-from').value), to = Number($<HTMLInputElement>('event-to').value);
    if (from && dayOf(e.tick) < from || to && dayOf(e.tick) > to) return false;
    if (selectedOnly && !e.participants.includes(selectedId)) return false;
    if (search && !`${e.description} ${e.id} ${e.causeId ?? ''} ${JSON.stringify(e.data)}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'important') return e.importance >= 45 || e.kind === 'weather';
    if (filter === 'social') return ['gathering', 'request', 'share', 'talk', 'witness', 'rumor', 'relationship', 'memory', 'family', 'birth', 'coming_of_age', 'education', 'migration', 'death'].includes(e.kind);
    if (filter === 'economy') return ['production', 'storage', 'trade', 'loan', 'repayment', 'default', 'theft', 'scarcity', 'wage', 'price', 'project', 'consumption', 'experiment', 'inheritance', 'construction', 'settlement', 'caravan', 'occupation', 'industry', 'public_service', 'tax', 'urban', 'policy', 'freight', 'ecology', 'request', 'council', 'diplomacy'].includes(e.kind);
    return true;
  });
  const shown = filtered.slice(-eventLimit).reverse();
  $('events').innerHTML = shown.length ? shown.map(e => `<button class="event-row" data-event="${esc(e.id)}"><span class="event-time"><b>${dayOf(e.tick)}일째</b> ${timeLabel(e.tick)}</span><span class="event-icon ${['share', 'goal', 'project'].includes(e.kind) ? 'sage' : ['theft', 'witness', 'default', 'death'].includes(e.kind) ? 'rose' : 'wheat'}">${icon(e.kind === 'share' ? 'heart' : e.kind === 'weather' ? 'sun' : e.kind === 'production' ? 'food' : 'leaf', 15)}</span><span class="event-description">${esc(e.description)}</span><span class="event-type">${kindLabels[e.kind] ?? e.kind}</span>${icon('arrow', 13)}</button>`).join('') : '<div class="empty-state journal-empty">아직 이 조건에 맞는 기록이 없습니다. 시간이 흐르면 작은 선택들이 기록으로 남습니다.</div>';
  $('more-events').hidden = filtered.length <= eventLimit;
  $('more-events').textContent = `이전 기록 더 보기 (${Math.min(eventLimit, filtered.length)} / ${filtered.length})`;
}
function openDialog(html: string) { $('dialog-content').innerHTML = html; const dialog = $<HTMLDialogElement>('detail-dialog'); if (!dialog.open) dialog.showModal(); }
function showEvent(id: string) {
  if (cloudMode) { void showCloudEvent(id); return; }
  const e = state.events.find(e => e.id === id); if (!e) { toast('이 사건을 찾을 수 없습니다.'); return; }
  openDialog(`<div class="eyebrow">A TRACE OF LIFE · ${esc(e.id)}</div><h2>${kindLabels[e.kind] ?? e.kind}</h2><p class="dialog-time">${dayOf(e.tick)}일째 ${timeLabel(e.tick)} · 중요도 ${e.importance}</p><span class="knowledge-badge">${knowledge(e)}</span>${timeline(state, e)}${Object.keys(e.data).length ? `<details class="event-data"><summary>실제 사건 수치와 판단 기록</summary><pre>${esc(JSON.stringify(e.data, null, 2))}</pre></details>` : ''}<div class="dialog-people">${e.participants.map(id => `<button class="button" data-npc="${esc(id)}">${esc(state.npcs.find(n => n.id === id)?.identity.name ?? id)} 살펴보기</button>`).join('')}</div>`);
}
function setView(next: string) {
  if (next !== 'world' && immersive) setImmersive(false);
  const changed = view !== next;
  view = next;
  const titles: Record<string, [string, string, string]> = { world: ['세계 관찰', '이야기가 자라는 마을', '저마다의 하루가 만나, 이 세계만의 역사가 됩니다.'], residents: ['마을 주민', '열두 빛깔의 하루', '각자의 욕구와 성격, 그리고 스스로 만들어 가는 삶.'], history: ['세계의 기록', '작은 세계의 긴 기억', '지금의 관계를 따라가면, 그날의 선택을 만날 수 있습니다.'], economy: ['마을 경제', '생활이 오가는 자리', '누가 생산하고, 누가 나누며, 무엇이 달라졌는지 살펴봅니다.'], experiments: ['관찰 실험실', '다른 조건, 새로운 이야기', '세계의 법칙 안에서 작은 변화를 관찰해 보세요.'] };
  const [label, title, subtitle] = titles[next]; $('breadcrumb-view').textContent = label; $('page-title').textContent = next === 'residents' ? `${state.npcs.length}개의 서로 다른 하루` : title; $('page-subtitle').textContent = subtitle;
  $('economy-view').hidden = next !== 'economy'; if (next === 'economy') $('economy-view').innerHTML = economyView(state, metric);
  $('world-view').hidden = next !== 'world'; $('residents-view').hidden = next !== 'residents'; $('experiments-view').hidden = next !== 'experiments'; $('event-panel').hidden = next === 'residents';
  $('event-panel').classList.toggle('full-journal', next === 'history'); $('all-events-button').hidden = next === 'history';
  document.querySelectorAll('[data-view]').forEach(el => { const active = (el as HTMLElement).dataset.view === next; el.classList.toggle('active', active); if (active) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
  if (changed && matchMedia('(max-width: 760px)').matches) window.scrollTo({ top: 0, behavior: 'instant' });
  if (next === 'residents') renderResidents();
}
function replaceWorld(next: Simulation) { observer.saveSeen(); localWorldKey = crypto.randomUUID(); try { localStorage.setItem('lsw-local-world-key',localWorldKey); } catch {} localInspectorEpoch++; coordinator.dispose(); sim = next; coordinator = new DecisionCoordinator(sim, new MockLLMProvider()); state = sim.snapshot(); selectedId = state.npcs[0].id; lastSaveTick = sim.tick; selectedObject = undefined; map.reset(); accumulator = 0; eventLimit = 40; $<HTMLInputElement>('seed-input').value = String(state.seed); render(); }
function localSave(showNotice = false) {
  if (cloudMode) return false;
  try { localStorage.setItem(STORAGE_KEY, sim.save()); lastSaveTick = sim.tick; $('save-status').textContent = `${dayOf(sim.tick)}일째 ${timeLabel(sim.tick)} · 이 기기에 저장됨`; if (showNotice) toast('세계의 상태와 모든 사건을 이 기기에 저장했습니다.'); return true; }
  catch { $('save-status').textContent = '기기 저장 공간 부족 · JSON 내보내기를 이용하세요'; if (showNotice) toast('기기 저장 공간이 부족합니다. JSON 파일로 내보내세요.'); return false; }
}
function download(filename: string, value: string) { const url = URL.createObjectURL(new Blob([value], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

document.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLElement>('button'); if (!button) return;
  if (button.dataset.place) { $<HTMLDialogElement>('detail-dialog').close(); selectObject({kind:'building',id:button.dataset.place}); }
  if (button.dataset.resource) selectObject({kind:'resource',id:button.dataset.resource});
  if (button.dataset.biography) void biography.open(button.dataset.biography,(button.dataset.mode??'turns') as BiographyMode,button.dataset.root??'',button.dataset.partner??'').then(()=>{if(document.querySelector('#biography .life-chapters'))walk.mark('read');});
  if (button.dataset.walkLens) walk.choose(button.dataset.walkLens);
  if (button.hasAttribute('data-walk-jump')) $('story-walk').scrollIntoView({block:'start',behavior:'instant'});
  if (button.hasAttribute('data-walk-refresh')) walk.refresh();
  if (button.hasAttribute('data-walk-next')) walk.next();
  if (button.hasAttribute('data-walk-dismiss')) {walk.guide(false);document.querySelector<HTMLButtonElement>('[data-walk-guide]')!.focus({preventScroll:true});}
  if (button.hasAttribute('data-walk-guide')) {walk.guide(true);$('walk-guide').scrollIntoView({block:'center',behavior:'instant'});}
  if (button.id === 'immersive-button') setImmersive(!immersive);
  if (button.hasAttribute('data-life-more')) biography.more();
  if (button.hasAttribute('data-copy-life')) void biography.copy();
  if (button.dataset.story) void observer.story(button.dataset.story);
  if (button.dataset.storyMore) void observer.story(button.dataset.storyMore,true);
  if (button.dataset.digest) void observer.show(button.dataset.digest as 'today'|'yesterday'|'since');
  if (button.hasAttribute('data-own-digest')) void observer.show('since',false,true);
  if (button.hasAttribute('data-watch-digest')) void observer.show('since',true);
  if (button.hasAttribute('data-digest-more')) void observer.load(true);
  if (button.dataset.watch) void toggleWatch(button.dataset.watch);
  if (button.dataset.metric) { metric = button.dataset.metric; $('economy-view').innerHTML = economyView(state, metric); }
  if (button.id === 'more-life') { lifeLimit += 40; renderInspector(); }
  if (button.id === 'export-observations') download(`living-small-world-observations-${state.seed}.json`, JSON.stringify({ seed: state.seed, since: state.economy.since, daily: state.economy.daily, urban: state.urban.samples }, null, 2));
  if (button.dataset.view) setView(button.dataset.view);
  if (button.dataset.npc) { $<HTMLDialogElement>('detail-dialog').close(); selectNPC(button.dataset.npc); if(button.closest('#story-walk'))$('world-map').scrollIntoView({block:'center',behavior:'instant'}); }
  if (button.dataset.tab) { selectedObject = undefined; tab = button.dataset.tab; render(); }
  if (button.dataset.speed) { speed = Number(button.dataset.speed); document.querySelectorAll<HTMLElement>('[data-speed]').forEach(b => { b.classList.toggle('active', Number(b.dataset.speed) === speed); b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === speed)); }); }
  if (button.dataset.filter) { filter = button.dataset.filter; eventLimit = 40; document.querySelectorAll<HTMLElement>('[data-filter]').forEach(b => { b.classList.toggle('active', b.dataset.filter === filter); b.setAttribute('aria-pressed', String(b.dataset.filter === filter)); }); renderEvents(); }
  if (button.dataset.event) showEvent(button.dataset.event);
  if (button.dataset.relation) {
    const n = selectedNPC(), r = n.relationships.find(r => r.npcId === button.dataset.relation)!;
    openDialog(`<div class="eyebrow">RELATIONSHIP HISTORY</div><h2>${esc(n.identity.name)}의 관계가 만들어진 순간들</h2><p>${esc(r.interpretation)}</p>${attractionRelation(state, n, r.npcId)}${r.evidence.map(id => `<button class="causal-button" data-event="${esc(id)}">${esc(state.events.find(e => e.id === id)?.description ?? id)} ${icon('arrow', 14)}</button>`).join('')}`);
  }
  if (button.id === 'next-npc') { const index = state.npcs.findIndex(n => n.id === selectedId); selectNPC(state.npcs[(index + 1) % state.npcs.length].id); }
});

function setImmersive(enabled: boolean) {
  immersive=enabled;
  document.body.classList.toggle('immersive',enabled);
  $('immersive-button').textContent=enabled?'일반 보기 · Esc':'몰입 보기 ⤢';
  $('immersive-button').setAttribute('aria-pressed',String(enabled));
  if(enabled)$('world-view').scrollIntoView({block:'start',behavior:'instant'});
  else $('immersive-button').focus({preventScroll:true});
}
document.addEventListener('keydown',event=>{
  if(event.key==='Escape' && immersive && !$<HTMLDialogElement>('detail-dialog').open) setImmersive(false);
});

$('play-button').onclick = () => { playing = !playing; accumulator = 0; render(); };
$('step-button').onclick = () => { playing = false; sim.step(); void coordinator.drain().then(render); render(); };
$('grid-button').onclick = () => { const button = $('grid-button'), value = button.getAttribute('aria-pressed') !== 'true'; button.setAttribute('aria-pressed', String(value)); button.classList.toggle('active', value); map.setGrid(value); };
$('all-events-button').onclick = () => { setView('history'); filter = 'all'; document.querySelector<HTMLButtonElement>('[data-filter="all"]')!.click(); $('event-panel').scrollIntoView({ behavior: 'smooth' }); };
$('more-events').onclick = () => { eventLimit += 40; renderEvents(); };
$('selected-only').onchange = () => { selectedOnly = $<HTMLInputElement>('selected-only').checked; renderEvents(); };
$('event-search').oninput = () => { search = $<HTMLInputElement>('event-search').value; renderEvents(); };
$('advance-day').onclick = async () => { playing = false; accumulator = 0; const button = $<HTMLButtonElement>('advance-day'); button.disabled = true; const observed = sim, decisions = coordinator; try { for (let i = 0; i < 144; i++) { if (sim !== observed) return; observed.step(); if (observed.pending) await decisions.drain(); } render(); localSave(); toast('하루 관찰을 마쳤습니다. 마을 경제에서 관측값을 확인하세요.'); } finally { button.disabled = false; } };
$('drought-button').onclick = () => { sim.experiment('drought'); render(); localSave(); toast('3일 가뭄 실험을 시작했습니다. 생산과 주민의 선택을 지켜보세요.'); };
$('food-button').onclick = () => { sim.experiment('food'); render(); localSave(); toast('공동 창고에 식량 24개를 보탰습니다.'); };
$('llm-toggle').onchange = () => { sim.setLLM($<HTMLInputElement>('llm-toggle').checked); render(); localSave(); };
$('seed-form').onsubmit = event => {
  event.preventDefault();
  try {
    const next = new Simulation(Number($<HTMLInputElement>('seed-input').value), Number($<HTMLInputElement>('population-input').value));
    try { localStorage.setItem(BACKUP_KEY, sim.save()); }
    catch { download(`living-small-world-before-reset.save.json`, sim.save()); }
    replaceWorld(next); localSave(); setView('world'); toast('새 세계를 시작했습니다. 이전 세계는 초기화 전 백업에서 불러오거나 내려받은 파일로 복원할 수 있습니다.');
  } catch (e) { toast((e as Error).message); }
};
$('save-button').onclick = () => { localSave(); download(`living-small-world-seed${state.seed}-day${dayOf(sim.tick)}.save.json`, sim.save()); toast('세계의 상태와 사건 이력을 JSON 파일로 내보냈습니다.'); };
$('load-button').onclick = () => openDialog(`<div class="eyebrow">CONTINUE A WORLD</div><h2>이어지는 작은 세계</h2><p>저장된 난수 상태와 행동, 관계, 모든 사건을 이어갑니다.</p><div class="load-options"><button id="load-local" class="button dark">이 기기의 마지막 저장 불러오기</button><button id="load-backup" class="button">초기화 전 세계 백업 불러오기</button><button id="load-file" class="button">JSON 파일에서 불러오기</button></div><p class="muted">불러오기는 현재 화면의 세계를 교체합니다. 보관하려면 먼저 ‘세계 저장’을 눌러 주세요.</p>`);
$('dialog-content').addEventListener('click', event => {
  const target = (event.target as HTMLElement).closest('button');
  if (target?.id === 'load-file') $<HTMLInputElement>('file-input').click();
  if (target?.id === 'load-local') { try { const data = localStorage.getItem(STORAGE_KEY); if (!data) throw new Error('이 기기에 저장된 세계가 없습니다.'); replaceWorld(Simulation.load(data)); $<HTMLDialogElement>('detail-dialog').close(); toast('기기에 저장된 세계를 이어갑니다.'); } catch (e) { toast((e as Error).message); } }
  if (target?.id === 'load-backup') { try { const data = localStorage.getItem(BACKUP_KEY); if (!data) throw new Error('초기화 전 백업이 없습니다.'); replaceWorld(Simulation.load(data)); $<HTMLDialogElement>('detail-dialog').close(); localSave(); toast('초기화 전 세계를 복원했습니다.'); } catch (e) { toast((e as Error).message); } }
});
$('file-input').onchange = async () => {
  const input = $<HTMLInputElement>('file-input'), file = input.files?.[0]; if (!file) return;
  try { if (file.size > 150_000_000) throw new Error('150MB 이하의 저장 파일을 사용해 주세요.'); const next = Simulation.load(await file.text()); replaceWorld(next); $<HTMLDialogElement>('detail-dialog').close(); toast('저장된 세계를 불러왔습니다.'); }
  catch (e) { toast((e as Error).message); } finally { input.value = ''; }
};
$('close-dialog').onclick = () => $<HTMLDialogElement>('detail-dialog').close();
$('detail-dialog').onclick = event => { if (event.target === $('detail-dialog')) $<HTMLDialogElement>('detail-dialog').close(); };
$('about-button').onclick = () => openDialog(`<div class="eyebrow">LIVING SMALL WORLD · 0.24</div><h2>스토리가 발생하는 세계</h2><p class="dialog-story">주민은 자신만의 욕구, 성격, 관계, 기억을 가진 존재입니다. 세계의 기본 법칙과 그들의 선택이 만나 마을의 이야기를 만듭니다.</p><p>한 틱은 10분입니다. 생존과 이동, 생산과 관계는 시드 기반 엔진이 처리합니다. AI는 중요한 사건에서만 목표와 해석을 제안하며, 자원이나 관계 수치를 바꿀 수 없습니다.</p><p>여러 도시의 가족·세대·생산·생태·공동결정을 관찰합니다. 도시 연대기와 가계도에서 실제 사건을 따라갈 수 있으며, 모델 없이도 세계와 역사 조회가 동작합니다.</p><button id="export-report" class="button">관측 통계 JSON 내보내기</button>`);
$('dialog-content').addEventListener('click', event => { if ((event.target as HTMLElement).closest('#export-report')) download('living-small-world-report.json', JSON.stringify(summarize(state), null, 2)); });
document.querySelector('.brand')!.addEventListener('click', event => { event.preventDefault(); setView('world'); });

let lastFrame = performance.now(), accumulator = 0, lastRender = 0;
function frame(now: number) {
  const elapsed = Math.min(250, now - lastFrame); lastFrame = now;
  if (!cloudMode && playing && !document.hidden) {
    accumulator += elapsed * speed; let steps = 0;
    while (accumulator >= 700 && steps < 12) { presentationMotion ??= motionTrace(state); sim.step(1, presentationMotion); accumulator -= 700; steps++; }
    if (steps) void coordinator.processOne();
    if (steps && now - lastRender > 180) { render(); lastRender = now; }
  }
  map.animate(now, view === 'world');
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => { accumulator = 0; lastFrame = performance.now(); if (document.hidden && sim.tick !== lastSaveTick) localSave(); });
window.addEventListener('pagehide', () => { observer.saveSeen(); if (sim.tick !== lastSaveTick) localSave(); });
setInterval(() => { if (!document.hidden) observer.saveSeen(); if (sim.tick !== lastSaveTick) localSave(); }, 30000);
document.addEventListener('visibilitychange', () => { if (document.hidden) observer.saveSeen(); });
render(); if (startupNote) toast(startupNote); requestAnimationFrame(frame);


function cloudFailure(error: unknown) {
  const message = error instanceof Error ? error.message : '서버에 연결하지 못했습니다.';
  $('cloud-status').textContent = `${message} 연결 새로고침으로 다시 시도할 수 있습니다.`;
  toast(message);
}
function cloudCommand(action: CloudAction) { void cloud!.send(action).catch(cloudFailure); }
function journalQuery() {
  const params = new URLSearchParams({ epoch: cloud!.world!.epoch, filter });
  if (selectedOnly) params.set('npc', selectedId);
  if (search) params.set('q', search);
  const from = Number($<HTMLInputElement>('event-from').value), to = Number($<HTMLInputElement>('event-to').value);
  if (from > 0) params.set('from', String((from - 1) * 144));
  if (to > 0) params.set('to', String(to * 144 - 1));
  return params;
}
async function loadJournal(more = false) {
  if (!cloud?.world) return;
  const params = journalQuery(), key = params.toString();
  if (!more && key === journalKey) return;
  if (more && journalNext !== null) params.set('before', String(journalNext));
  const request = ++journalRequest; journalKey = key;
  try {
    const result = await cloud.get<EventPage>(`events?${params}`);
    if (request !== journalRequest || result.epoch !== cloud.world.epoch || key !== journalQuery().toString()) return;
    journalEvents = more ? [...journalEvents, ...result.events] : result.events;
    // Only render paged data; no full journal is held by the browser.
    if (journalEvents.length > 400) journalEvents = journalEvents.slice(-400);
    journalNext = result.next; journalEpoch = result.epoch;
    journalPage = { ...result, events: journalEvents };
    renderJournal();
  } catch (error) { if (request === journalRequest) { journalKey = ''; $('events').textContent = '기록을 불러오지 못했습니다. 연결 새로고침으로 다시 시도해 주세요.'; cloudFailure(error); } }
}
function renderJournal() {
  $('events').innerHTML = journalEvents.length ? journalEvents.map(e => `<button class="event-row" data-event="${esc(e.id)}"><span class="event-time"><b>${dayOf(e.tick)}일째</b> ${timeLabel(e.tick)}</span><span class="event-icon sage">${icon('book', 15)}</span><span class="event-description">${esc(e.description)}</span><span class="event-type">${kindLabels[e.kind] ?? e.kind}</span>${icon('arrow', 13)}</button>`).join('') : '<div class="empty-state journal-empty">이 조건에 맞는 기록이 없습니다.</div>';
  $('more-events').hidden = journalNext === null;
  $('more-events').textContent = `이전 기록 더 보기 · 화면에 ${journalEvents.length}건`;
}
function renderCloudLife() {
  if (selectedObject) return;
  const n = selectedNPC(), key = `${cloud?.world?.epoch}:${n.id}`;
  if (key !== lifeKey) { lifeKey = key; lifeEvents = []; lifeNext = null; lifeLoaded = false; void loadCloudLife(); }
  setInspectorHTML(`${familyView(state, n)}<div class="section-label">삶의 기록 <span>서버 기록</span></div><p class="inspector-footnote">현재 재산 ${n.wealth}코인 · 식량 ${n.inventory.food}개</p>${lifeEvents.length ? lifeEvents.map(eventLink).join('') : `<p class="empty-state">${lifeLoaded ? '아직 기록된 생애 사건이 없습니다.' : '생애 기록을 확인하고 있습니다.'}</p>`}${lifeNext !== null ? '<button class="more-button" id="more-life">이전 생애 기록 더 보기</button>' : ''}`);
}
async function loadCloudLife(more = false) {
  if (!cloud?.world) return;
  const key = lifeKey, request = ++lifeRequest; lifeLoading = true;
  const params = new URLSearchParams({ epoch: cloud.world.epoch, npc: selectedId, filter: 'life' });
  if (more && lifeNext !== null) params.set('before', String(lifeNext));
  try {
    const result = await cloud.get<EventPage>(`events?${params}`);
    if (request !== lifeRequest || key !== lifeKey || result.epoch !== cloud.world.epoch) return;
    lifeEvents = (more ? [...lifeEvents, ...result.events] : result.events).slice(0, 400); lifeNext = lifeEvents.length < 400 ? result.next : null; lifeLoaded = true;
    if (tab === 'life' && !selectedObject) renderCloudLife();
  } catch (e) { cloudFailure(e); }
  finally { if (request === lifeRequest) lifeLoading = false; }
}
let detailRequest = 0;
async function showCloudEvent(id: string) {
  if (!cloud?.world) return;
  const request = ++detailRequest, epoch = cloud.world.epoch;
  openDialog('<p>사건의 원인과 이후 기록을 불러오는 중…</p>');
  try {
    const result = await cloud.get<{ epoch: string; event: WorldEvent; related: WorldEvent[] }>(`events/${encodeURIComponent(id)}?epoch=${encodeURIComponent(epoch)}`);
    if (request !== detailRequest || cloud.world.epoch !== epoch || !$<HTMLDialogElement>('detail-dialog').open) return;
    const e = result.event;
    openDialog(`<div class="eyebrow">A TRACE OF LIFE · ${esc(e.id)}</div><h2>${kindLabels[e.kind] ?? e.kind}</h2><p>${dayOf(e.tick)}일째 ${timeLabel(e.tick)}</p><span class="knowledge-badge">${knowledge(e)}</span>${timeline({ ...state, events: result.related }, e)}<details class="event-data"><summary>실제 사건 수치와 판단 기록</summary><pre>${esc(JSON.stringify(e.data, null, 2))}</pre></details>`);
  } catch (e) { cloudFailure(e); }
}
async function cloudDownload(path: string, name: string) {
  try { download(name, JSON.stringify(await cloud!.get(path))); toast('서버의 세계 기록을 파일로 내보냈습니다.'); } catch (e) { cloudFailure(e); }
}
const aiLabels: Record<string, string> = { skipped: '현재 상태에 따라 생략', pending: '사건 수집·처리 대기', running: '응답 대기', ready: '저장 대기', applied: '반영 완료', rejected: '근거 변경으로 거부', failed: '처리 실패', stale: '세계 변경으로 취소' };
function renderAI() {
  if (!cloudMode) return;
  const mode = cloud?.world?.meta.aiMode ?? (state.llm.enabled ? 'mock' : 'off');
  $<HTMLSelectElement>('ai-mode').value = mode;
  const option = document.querySelector<HTMLOptionElement>('#ai-mode option[value="remote"]')!;
  option.disabled = !aiStatus?.configured;
  option.textContent = aiStatus?.configured ? `서버 모델 · ${aiStatus.model}` : '서버 모델 · 연결 설정 필요';
  $('ai-status').textContent = !aiStatus ? '모델 연결을 확인하고 있습니다.' : !aiStatus.configured ? '외부 API: 서버 모델 미연결 · Chrome 지원은 기기별로 확인합니다.' : mode === 'remote' ? `외부 API · 서버 모델 ${aiStatus.model} 사용 중 · 응답을 기다리는 동안에도 세계는 계속됩니다.` : `서버 모델 ${aiStatus.model} 연결됨 · 현재 ${mode === 'mock' ? 'Mock' : mode === 'chrome' ? 'Chrome 목표 선택' : 'AI 끄기'} 모드`;
  renderChrome();
  if (!aiStatus) return;
  const { usage } = aiStatus;
  $('ai-usage').textContent = `외부 API · 실제 날짜 ${aiStatus.day} UTC · 호출 ${usage.calls} / ${aiStatus.dailyLimit}회 · 보고된 입력 ${usage.inputTokens} / 출력 ${usage.outputTokens}토큰 · 응답당 최대 ${aiStatus.maxOutputTokens}토큰${usage.calls >= aiStatus.dailyLimit ? ' · 오늘 상한 도달, 다음 UTC 날짜까지 대기' : ''}`;
  $('ai-usage').textContent += ` · Chrome 실행 시도 ${aiStatus.chrome?.usage.calls ?? 0} / ${aiStatus.chrome?.dailyLimit ?? 36}회 · 최근 1시간 ${aiStatus.chrome?.schedule?.hourlyCalls ?? 0} / ${aiStatus.chrome?.schedule?.hourlyLimit ?? 6}회 · 사건 수집 60초 · 실행 후 최소 60초 휴식. 외부 API를 선택하면 제한된 주민·사건 정보를 설정한 공급자에게 전송하며 요금이 발생할 수 있습니다.`;
  $('ai-audit').innerHTML = `<p class="inspector-footnote">세계 초기화에도 호출 예산은 유지됩니다. 실제 모델이 만든 해석과 말은 사실 자체가 아니며, 인용한 사건으로 근거를 확인할 수 있습니다.</p>${aiStatus.jobs.length ? aiStatus.jobs.map(j => `<button class="causal-button" data-ai-job="${esc(j.id)}"><b>${j.kind === 'history' ? '역사 근거 선택' : j.kind === 'dialogue' ? '기억에 근거한 말' : '중요 사건 해석'}</b><span>${esc(aiLabels[j.status] ?? j.status)} · ${j.attempts}/3회 · ${esc(j.model)}</span></button>`).join('') : '<p class="muted">외부 모델 호출 기록이 아직 없습니다.</p>'}${(aiStatus.chrome?.jobs ?? []).map(j => `<button class="causal-button" data-chrome-job="${esc(j.id)}"><b>Chrome 목표 선택</b><span>${esc(aiLabels[j.status] ?? j.status)} · ${j.attempts}/3회${j.error ? ` · ${esc(j.error)}` : ''}</span></button>`).join('')}`;
}
async function refreshAI() {
  try { aiStatus = await cloud!.get<AIStatus>('ai'); renderAI(); }
  catch { $('ai-status').textContent = '모델 상태를 불러오지 못했습니다. 연결 새로고침으로 다시 시도해 주세요.'; }
}
async function showAIJob(id: string, chrome = false) {
  try {
    const job = await cloud!.get<{ id: string; epoch: string; status: string; context: string; result: string | null; error: string | null }>(`${chrome ? 'chrome' : 'ai'}/jobs/${encodeURIComponent(id)}`);
    const result = job.result ? JSON.parse(job.result) : null;
    const evidence: string[] = result?.ok ? chrome ? [...new Set<string>(result.value.goals.flatMap((g: { evidence: string[] }) => g.evidence))] : result.value.evidence : [];
    openDialog(`<div class="eyebrow">MODEL AUDIT</div><h2>모델 처리 기록</h2><p>${esc(aiLabels[job.status] ?? job.status)}${job.error ? ` · ${esc(job.error)}` : ''}</p><p>${chrome ? 'Chrome AI가 제안한 목표입니다. 한국어 문구는 서버가 코드와 근거로 구성합니다. 실제 모델 실행 여부는 클라이언트 주장만으로 증명할 수 없습니다.' : '모델이 생성한 해석입니다. 인용한 원본 사건을 함께 확인하세요.'}</p>${job.epoch === cloud!.world!.epoch ? evidence.map(id => `<button class="causal-button" data-event="${esc(id)}">근거 사건 ${esc(id)}</button>`).join('') : '<p>이전 세계의 기록입니다. 해당 세계의 백업에서 근거 사건을 확인하세요.</p>'}<pre class="ai-result">${esc(JSON.stringify(result, null, 2))}</pre><button id="download-ai-job" class="button">판단 입력·결과 JSON 내보내기</button>`);
    $('download-ai-job').onclick = () => download(`living-small-world-ai-${job.id}.json`, JSON.stringify(job, null, 2));
  } catch (e) { cloudFailure(e); }
}
function renderChrome() {
  if (!chromeRunner) return;
  const device = chromeRunner.state, mode = cloud?.world?.meta.aiMode;
  $('chrome-status').textContent = `${mode === 'chrome' ? '세계: Chrome 목표 선택' : '세계: 다른 AI 방식'} · ${device.message}`;
  $<HTMLButtonElement>('chrome-start').disabled = mode !== 'chrome' || device.enabled || device.busy || !['available', 'downloadable', 'downloading', 'failed'].includes(device.availability);
  $<HTMLButtonElement>('chrome-stop').disabled = !device.enabled && !device.busy;
  const progress = $<HTMLProgressElement>('chrome-progress');
  progress.hidden = device.availability !== 'downloading' || !device.busy; progress.value = device.progress;
}
function startCloud() {
  chromeRunner = new ChromeRunner(() => renderChrome(), async () => { await cloud!.connect(); await refreshAI(); });
  $('chrome-start').onclick = () => { void chromeRunner!.activate(); };
  $('chrome-stop').onclick = () => chromeRunner!.stop();
  $('chrome-check').onclick = () => { void chromeRunner!.check(); };
  $('chrome-diagnostics').onclick = () => download('living-small-world-chrome-device.json', JSON.stringify(chromeRunner!.diagnostics(), null, 2));
  void chromeRunner.check();
  const controls = ['play-button', 'step-button', 'advance-day', 'drought-button', 'food-button', 'llm-toggle', 'ai-mode', 'offline-toggle', 'save-button', 'load-button', 'seed-input'];
  const disable = (value: boolean) => controls.forEach(id => ($<HTMLButtonElement>(id).disabled = value));
  disable(true);
  let displayedEpoch = '', displayedEvents = -1;
  cloud = new CloudClient(world => {
    const changed = displayedEpoch !== world.epoch, newEvents = displayedEvents !== world.meta.eventCount;
    displayedEpoch = world.epoch; displayedEvents = world.meta.eventCount;
    presentationMotion = world.motion;
    chromeRunner!.setWorld(world.epoch, world.meta.aiGeneration ?? 'legacy', world.meta.aiMode === 'chrome' && isOwner());
    state = personalVillage && world.state.civilization.settlements.some(v => v.id === personalVillage) ? { ...world.state, civilization: { ...world.state.civilization, focus: personalVillage } } : world.state; playing = world.meta.running; speed = world.meta.speed;
    cloudReady = true; disable(!isOwner());
    if (!state.npcs.some(n => n.id === selectedId)) selectedId = state.npcs[0].id;
    $<HTMLInputElement>('offline-toggle').checked = world.meta.offline;
    $<HTMLInputElement>('seed-input').value = String(state.seed);
    document.querySelectorAll<HTMLElement>('[data-speed]').forEach(b => { b.classList.toggle('active', Number(b.dataset.speed) === speed); b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === speed)); });
    if (changed) journalKey = '';
    else if (newEvents && journalEvents.length <= 40) {
      const query = journalQuery(), merged = journalPage && journalKey === query.toString() ? mergeLiveJournal(journalPage, world, query) : undefined;
      if (merged) { journalPage = merged; journalEvents = merged.events; journalNext = merged.next; renderJournal(); }
      else journalKey = '';
    }
    if (!changed && newEvents && lifeEvents.length <= 40 && tab === 'life' && !selectedObject && !lifeLoading && lifeKey === `${world.epoch}:${selectedId}`) void loadCloudLife();
    if (changed) { lifeKey = ''; selectedObject = undefined; map.reset(); }
    $('save-status').textContent = `${dayOf(state.tick)}일째 ${timeLabel(state.tick)} · ${world.live ? '진행 중 · 5분 자동 저장' : '서버에 저장됨'}`;
    render();
    const remaining = world.meta.pendingTicks ?? 0;
    $<HTMLButtonElement>('advance-day').disabled = !isOwner() || remaining > 0;
    $('advance-day').textContent = remaining ? `하루 진행 중 · 남은 ${remaining}틱` : '하루 관찰 진행';
    $('cancel-day').hidden = remaining === 0;
    if (world.meta.catchupTicks) toast(`자리를 비운 동안 ${world.meta.catchupTicks}틱을 반영했습니다.${world.meta.skippedTicks ? ' 하루 상한을 넘긴 시간은 진행하지 않았습니다.' : ''}`);
  }, message => { $('cloud-status').textContent = message; });
  let polling = false, lastAI = 0, refreshingAI = false;
  const refreshBackgroundAI = (force = false) => {
    if (refreshingAI || !force && (Date.now() - lastAI <= 10_000 || !(view === 'experiments' || chromeRunner!.state.enabled))) return;
    lastAI = Date.now(); refreshingAI = true;
    void refreshAI().finally(() => { refreshingAI = false; });
  };
  const connect = async () => {
    if (polling) return;
    polling = true;
    try { await cloud!.connect(); refreshBackgroundAI(true); }
    catch (e) { cloudFailure(e); }
    finally { polling = false; }
  };
  $('cloud-retry').onclick = () => { journalKey = ''; lifeKey = ''; void connect(); };
  void connect();
  const poll = async () => {
    if (document.hidden || polling) { setTimeout(poll, 2000); return; }
    const started = performance.now();
    polling = true;
    let failed = false;
    try { if (cloudReady && (cloud!.world!.meta.running || cloud!.world!.meta.pendingTicks)) await cloud!.send({ type: 'sync' }); else await cloud!.connect(); refreshBackgroundAI(); }
    catch (e) { failed = true; $('cloud-status').textContent = '연결이 끊겼습니다. 서버의 마지막 저장은 유지됩니다. 다시 연결하는 중…'; }
    finally {
      polling = false; void chromeRunner!.tick();
      // Keep the start-to-start cadence without losing a whole interval on slow responses.
      setTimeout(poll, failed ? 2000 : Math.max(100, 2000 - (performance.now() - started)));
    }
  };
  setTimeout(poll, 2000);
  let pendingImport: { save?: string; upload?: string; epoch: string; revision: number } | undefined;
  const previewImport = (save: string) => {
    const summary = inspectSave(save), world = cloud!.world!;
    pendingImport = { save, epoch: world.epoch, revision: world.revision };
    openDialog(importPreview(summary));
  };
  $('detail-dialog').addEventListener('close', () => { pendingImport = undefined; });
  const loadStorage = async () => {
    const target = document.getElementById('storage-status'); if (!target) return;
    target.textContent = '저장 상태를 확인하는 중…';
    try {
      const status = await cloud!.get<StorageStatus>('storage');
      if (!target.isConnected) return;
      target.innerHTML = storageView(status);
      const ops = await cloud!.get<OperationsStatus>('operations');
      if (target.isConnected) target.innerHTML += `<h3>운영 상태</h3><p>최근 요청 ${ops.samples}건 · 처리 시간 95백분위 ${ops.p95Ms ?? '측정 전'}ms · 서버 오류 ${ops.errors}건</p><p>물리 DB ${ops.databaseBytes === null ? '이 환경에서 제공하지 않음' : (ops.databaseBytes / 1_000_000).toFixed(2) + ' MB'} · DB 조회 ${ops.databaseQueryMs ?? '미제공'}ms</p>${ops.warnings.map(w => `<p role="alert">${esc(w)}</p>`).join('')}<p class="muted">현재 Worker의 최근 1시간·최대 256건 표본입니다. 재시작하면 표본이 초기화됩니다. CPU·메모리는 실행 환경에서 제공하지 않아 별도 운영 측정이 필요합니다.</p>${operationsHistory(ops)}<button id="replay-start" class="button">검증 기록 시작 · 이전 기록 교체</button><button id="replay-stop" class="button">검증 기록 중지</button><button id="replay-check" class="button">기록 재생 검증</button><button id="replay-export" class="button">검증 기록 내려받기</button><p id="replay-status" aria-live="polite"></p>`;
      const button = document.getElementById('load-backup') as HTMLButtonElement | null;
      if (button) { button.disabled = status.worlds.length < 2; button.dataset.epoch = status.worlds[1]?.epoch ?? ''; button.dataset.revision = String(status.revision); button.dataset.world = status.epoch; }
    } catch (e) { if (target.isConnected) target.textContent = (e as Error).message; }
  };
  document.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button) return;
    if (button.dataset.dialogue) {
      event.stopImmediatePropagation();
      void cloud!.send({ type: 'dialogue', speakerId: selectedId, listenerId: button.dataset.dialogue, ...(button.dataset.recall ? { topic: button.dataset.recall as RecollectionTopic } : {}) }).then(() => { toast(cloud!.world!.meta.aiMode === 'remote' ? '말을 준비하고 있습니다. 완료되면 세계의 기록에 남습니다.' : '기억에 근거한 말을 세계의 기록에 남겼습니다.'); }).catch(cloudFailure); return;
    }
    if (button.dataset.chromeJob) { event.stopImmediatePropagation(); void showAIJob(button.dataset.chromeJob, true); return; }
    if (button.dataset.aiJob) { event.stopImmediatePropagation(); void showAIJob(button.dataset.aiJob); return; }
    const actions: Record<string, CloudAction> = {
      'play-button': { type: 'play', running: !playing }, 'step-button': { type: 'step', ticks: 1 },
      'cancel-day': { type: 'play', running: false }, 'advance-day': { type: 'step', ticks: 144 }, 'drought-button': { type: 'experiment', kind: 'drought' }, 'food-button': { type: 'experiment', kind: 'food' },
    };
    if (actions[button.id] || button.dataset.speed) {
      event.stopImmediatePropagation(); if (!cloudReady) return;
      cloudCommand(button.dataset.speed ? { type: 'speed', speed: Number(button.dataset.speed) as 1 | 5 | 20 } : actions[button.id]); return;
    }
    const intercept = ['more-events', 'more-life', 'save-button', 'load-button', 'load-local', 'load-backup', 'storage-refresh', 'replay-start', 'replay-stop', 'replay-check', 'replay-export', 'apply-import', 'export-observations', 'export-report'];
    if (!intercept.includes(button.id)) return;
    event.stopImmediatePropagation();
    if (button.id === 'more-events') void loadJournal(true);
    if (button.id === 'more-life') void loadCloudLife(true);
    if (button.id === 'save-button') { void cloud!.send({ type: 'save' }).then(() => { const a = document.createElement('a'); a.href = '/api/export-stream'; a.download = ''; a.click(); }).catch(cloudFailure); }
    if (button.id === 'export-report') void cloudDownload('report', 'living-small-world-report.json');
    if (button.id === 'export-observations') void cloudDownload('observations', 'living-small-world-observations.json');
    if (button.id === 'load-button') {
      pendingImport = undefined;
      openDialog(`<div class="eyebrow">CONTINUE A WORLD</div><h2>저장과 복원</h2><p>서버 세계는 함께 관찰하는 모든 계정에 반영됩니다. 교체 전 세계는 직전 백업 1개로 보관합니다.</p><div class="load-options"><button id="load-local" class="button">이 기기의 저장을 서버로 가져오기</button><button id="load-backup" class="button" disabled>서버의 교체 전 백업 복원</button><button id="load-file" class="button">JSON 파일에서 불러오기</button></div><p class="muted">파일 가져오기: UTF-8 기준 24MB 이하, 생존 주민 3,000명까지. 10MB 초과 파일은 분할 전송하며 24시간 안에 같은 파일로 재개할 수 있습니다. 적용 전에 내용을 확인합니다.</p><section id="storage-status" aria-live="polite"></section><button id="storage-refresh" class="button">저장 상태 새로 확인</button>`);
      void loadStorage();
    }
    if (button.id.startsWith('replay-')) { void postJSON<{message:string}>('replay', {type:button.id.slice(7)}).then(r=>{ if(button.id==='replay-export') download('world-replay.json', JSON.stringify(r)); else {const el=document.getElementById('replay-status');if(el)el.textContent=r.message;} }).catch(cloudFailure); }
    if (button.id === 'storage-refresh') void loadStorage();
    if (button.id === 'load-local') { try { const save = localStorage.getItem(STORAGE_KEY); if (!save) throw new Error('이 기기에 저장된 세계가 없습니다.'); previewImport(save); } catch (e) { cloudFailure(e); } }
    if (button.id === 'apply-import' && pendingImport) {
      const pending = pendingImport; button.disabled = true;
      void cloud!.send(pending.upload ? { type: 'import-upload', upload: pending.upload } : { type: 'import', save: pending.save! }, crypto.randomUUID(), pending).then(() => { pendingImport = undefined; $<HTMLDialogElement>('detail-dialog').close(); toast('저장된 세계를 서버로 가져왔습니다.'); }).catch(e => { button.disabled = false; cloudFailure(e); });
    }
    if (button.id === 'load-backup' && button.dataset.epoch) {
      const expected = { epoch: button.dataset.world!, revision: Number(button.dataset.revision) }; button.disabled = true;
      void cloud!.send({ type: 'restore-backup', epoch: button.dataset.epoch }, crypto.randomUUID(), expected).then(() => { $<HTMLDialogElement>('detail-dialog').close(); toast('서버 백업을 복원했습니다. 방금 전 세계는 직전 백업으로 보관했습니다.'); }).catch(e => { cloudFailure(e); void loadStorage(); });
    }
  }, true);
  $('seed-form').onsubmit = event => { event.preventDefault(); if (cloudReady) cloudCommand({ type: 'reset', seed: Number($<HTMLInputElement>('seed-input').value), population: Number($<HTMLInputElement>('population-input').value) }); };
  $('ai-mode').onchange = () => { void cloud!.send({ type: 'ai-mode', mode: $<HTMLSelectElement>('ai-mode').value as 'off' | 'mock' | 'remote' }).then(refreshAI).catch(e => { renderAI(); cloudFailure(e); }); };
  $('llm-toggle').onchange = () => cloudCommand({ type: 'llm', enabled: $<HTMLInputElement>('llm-toggle').checked });
  $('offline-toggle').onchange = () => cloudCommand({ type: 'offline', enabled: $<HTMLInputElement>('offline-toggle').checked });
  $('file-input').onchange = async () => {
    const input = $<HTMLInputElement>('file-input'), file = input.files?.[0]; if (!file) return;
    try { if (file.size <= 10_000_000) previewImport(await file.text()); else { openDialog('<h2>큰 세계 가져오기</h2><p id="upload-progress" aria-live="polite">파일을 준비하고 있습니다…</p>'); const uploadTarget=document.getElementById('upload-progress'); const uploaded=await uploadSave(file,text=>{ const el=document.getElementById('upload-progress'); if(el)el.textContent=text; }); if(!uploadTarget?.isConnected || !$<HTMLDialogElement>('detail-dialog').open)return; pendingImport={upload:uploaded.id,epoch:uploaded.epoch,revision:uploaded.revision}; openDialog(importPreview(uploaded.summary)); } }
    catch (e) { cloudFailure(e); } finally { input.value = ''; }
  };
}
for (const id of ['event-from', 'event-to']) $(id).oninput = () => { eventLimit = 40; renderEvents(); };
if (cloudMode) startCloud();

async function focusVillage(focus: string, detail = state.civilization.detail) {
  try {
    if (cloudMode && !isOwner()) { personalVillage = focus; state = { ...state, civilization: { ...state.civilization, focus } }; render(); }
    else if (cloudMode) await cloud!.send({ type: 'detail', focus, detail });
    else { sim.setDetail(focus, detail); render(); localSave(); }
  } catch (e) { toast((e as Error).message); }
}
document.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-village]');
  if (button) { selectedObject = undefined; map.setMode('city'); $<HTMLSelectElement>('map-mode').value = 'city'; void focusVillage(button.dataset.village!); }
});
document.addEventListener('change', event => {
  const target = event.target as HTMLSelectElement;
  if (target.id === 'world-detail') void focusVillage(state.civilization.focus, target.value as 'full' | 'focused');
});

document.addEventListener('submit', async event => {
  if ((event.target as HTMLElement).id !== 'urban-policy') return;
  event.preventDefault();
  const taxRate = Number($<HTMLInputElement>('urban-tax').value), priority = $<HTMLSelectElement>('urban-priority').value as Service;
  try {
    if (cloudMode) await cloud!.send({ type: 'policy', settlementId: state.civilization.focus, taxRate, priority });
    else { sim.setPolicy(state.civilization.focus, taxRate, priority); render(); localSave(); }
    toast('도시 정책을 적용하고 사건에 기록했습니다.');
  } catch (e) { toast((e as Error).message); }
});
document.addEventListener('change', event => {
  const target = event.target as HTMLSelectElement;
  if (target.id === 'urban-layer') { setUrbanLayer(target.value); render(); }
  if (target.id === 'urban-district') { selectedObject = undefined; map.setMode('city'); $<HTMLSelectElement>('map-mode').value = 'city'; setDistrict(target.value); map.setDistrict(target.value); render(); }
});

document.addEventListener('click', event => { const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-resident-page]'); if (button) { residentPage += Number(button.dataset.residentPage); renderResidents(); } });

let historyTopic: HistoryTopic = 'population', historyNpc: string | undefined, historySettlement: string | undefined;
let localHistoryEvents: WorldEvent[] = [];
let historyFrom = '', historyTo = '', historyNext: number | null = null, historyRequest = 0, historyEpoch = '';
async function showHistory(older = false) {
  const request = ++historyRequest;
  try {
    const p = new URLSearchParams({ topic: historyTopic });
    if (historyNpc) p.set('npc', historyNpc);
    if (historySettlement) p.set('settlement', historySettlement);
    if (historyFrom) p.set('from', String((Number(historyFrom) - 1) * 144));
    if (historyTo) p.set('to', String(Number(historyTo) * 144 - 1));
    if (older && historyNext !== null) p.set('before', String(historyNext));
    let result: HistoryPage;
    if (cloudMode) { p.set('epoch', historyEpoch); result = await cloud!.get<HistoryPage>(`history?${p}`); }
    else {
      if (!older) localHistoryEvents = state.events.filter(e => historyMatches(state, e, historyTopic, historySettlement, historyNpc) && (!historyFrom || e.tick >= (Number(historyFrom) - 1) * 144) && (!historyTo || e.tick < Number(historyTo) * 144)).reverse();
      const all = localHistoryEvents;
      const start = older ? historyNext ?? 0 : 0; result = { events: all.slice(start, start + 40), next: all.length > start + 40 ? start + 40 : null };
      const samples = state.events.filter(e => !historyNpc && e.kind === 'urban' && e.data.settlementId === historySettlement && (!historyFrom || e.tick >= (Number(historyFrom) - 1) * 144) && (!historyTo || e.tick < Number(historyTo) * 144));
      if (samples.length) result.comparison = { first: samples[0], last: samples.at(-1)! };
    }
    if (request !== historyRequest) return;
    historyNext = result.next;
    openDialog(historyView(result, historyTopic, cloudMode && cloud?.world?.meta.aiMode === 'remote', !!historyNpc, historyFrom, historyTo));
  } catch (e) { toast((e as Error).message); }
}
document.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button) return;
  if (button.id === 'family-tree') openDialog(treeView(state, selectedId));
  if (button.id === 'city-history' || button.dataset.personHistory) {
    historyNpc = button.dataset.personHistory; historySettlement = historyNpc ? undefined : state.civilization.focus;
    historyTopic = historyNpc ? 'economy' : 'population'; historyFrom = ''; historyTo = ''; historyEpoch = cloud?.world?.epoch ?? ''; void showHistory();
  }
  if (button.id === 'history-more') void showHistory(true);
  if (button.id === 'history-ai' && cloudMode) { button.disabled = true; void cloud!.send({ type: 'history-ai', topic: historyTopic }).then(() => toast('최근 세계의 근거 선택을 요청했습니다. 결과는 세계의 기록과 AI 감사에 남습니다.')).catch(cloudFailure); }
});
document.addEventListener('submit', event => {
  if ((event.target as HTMLElement).id !== 'history-query') return; event.preventDefault();
  historyTopic = $<HTMLSelectElement>('history-topic').value as HistoryTopic;
  historyFrom = $<HTMLInputElement>('history-from').value; historyTo = $<HTMLInputElement>('history-to').value; void showHistory();
});
document.addEventListener('change', async event => {
  const input = event.target as HTMLInputElement; if (input.id !== 'council-enabled') return;
  try { if (cloudMode) await cloud!.send({ type: 'council', settlementId: state.civilization.focus, enabled: input.checked }); else { sim.setCouncil(state.civilization.focus, input.checked); render(); localSave(); } }
  catch (e) { toast((e as Error).message); render(); }
});


let watchBusy = false;
async function toggleWatch(npcId: string) {
  if (watchBusy || cloudMode && !cloudReady) return;
  watchBusy = true;
  try {
    const enabled = !observer.watchIds(state).includes(npcId);
    if (cloudMode) { await observer.watch(npcId,enabled); render(); }
    else { sim.watchResident(npcId,enabled); render(); localSave(); }
    if(enabled)walk.mark('watch');
    toast(enabled ? '관심 주민으로 기억합니다. 마을의 하루에서 다시 찾아보세요.' : '관심 주민에서 해제했습니다.');
  } catch(error) { toast((error as Error).message); }
  finally { watchBusy=false; }
}
function renderCharacterWatch() {
  const options = '<option value="">지도에서 고르기</option>' + state.civilization.settlements.map(v => `<optgroup label="${esc(v.name)}">${state.buildings.filter(b => b.settlementId === v.id).map(b => `<option value="building:${esc(b.id)}">${esc(b.name)} · ${b.position.x}, ${b.position.y}</option>`).join('')}</optgroup>`).join('') + `<optgroup label="자연 자원">${state.resources.map(r => `<option value="resource:${esc(r.id)}">${r.kind === 'wood' ? '목재 나무' : '열매 덤불'} · ${r.position.x}, ${r.position.y}</option>`).join('')}</optgroup>`;
  setHTML('object-picker', options);
  $<HTMLSelectElement>('object-picker').value = selectedObject ? `${selectedObject.kind}:${selectedObject.id}` : '';
  if (selectedObject) {
    $('map-scope').textContent = '선택한 장소 · 확대 관찰';
    $('character-watch').innerHTML = `<div class="object-watch"><div><span class="object-eyebrow">지금 살펴보는 장소</span><b>${esc(objectName(state, selectedObject) ?? '장소')}</b><p>정보 패널에서 현재 상태와 관련 주민을 확인하세요.</p></div><button class="button" data-npc="${esc(selectedId)}">주민으로 돌아가기</button></div>`; return;
  }
  const n = selectedNPC(), a = n.currentAction, target = state.npcs.find(p => p.id === a?.targetId?.replace('peer:', ''));
  const recent = state.events.filter(e => e.participants.includes(n.id) && ['talk','share','trade','loan','repayment','family','theft','relationship'].includes(e.kind)).slice(-3).reverse();
  $('map-scope').textContent = map.viewMode === 'region' ? `${state.civilization.settlements.length}개 정착지 · ${state.width}×${state.height}칸` : map.viewMode === 'follow' ? `${n.identity.name} · (${n.position.x}, ${n.position.y})` : `${villageSize(state).width}×${villageSize(state).height}칸 · 구역 확대 가능`;
  $('character-watch').innerHTML = `<div class="watch-heading">${portrait(appearance(n), characterVisual(n, state))}<div><b>${esc(n.identity.name)}${isOwnNPC(n) ? ' · 내가 만든 주민' : n.profile ? ' · 참여자가 만든 주민' : ''}</b>${characterStatus(n, state)}<p>${actionText(n)}${target ? ` · 상대 <button class="text-button" data-npc="${esc(target.id)}">${esc(target.identity.name)}</button>` : ''}</p></div><button class="button" data-tab="relationships">관계 살펴보기</button><button class="button" data-story="${esc(n.id)}">관계와 가족의 이야기</button><button class="button" data-biography="${esc(n.id)}">삶의 이야기</button></div>${activityView(state,n)}<p>${esc(n.decision.reason)}</p><div class="watch-events">${recent.length ? recent.map(e => `<button class="evidence-link" data-event="${esc(e.id)}">${esc(e.description)}</button>`).join('') : '<span class="muted">재생하면 이웃과의 실제 만남과 행동을 관찰할 수 있습니다. 관계·기억 탭과 선택 주민 기록에서 이전 사건도 확인하세요.</span>'}</div>`;
}
$('create-character').onclick = () => {
  if (creatingCharacter) { toast('주민의 입주를 저장하고 있습니다.'); return; }
  if (cloudMode && !cloudReady) { toast('서버 연결을 먼저 확인해 주세요.'); return; }
  openDialog(characterForm(state));
};
document.addEventListener('change',event=>{const target=event.target as HTMLSelectElement;if(target.id==='biography-partner')biography.pair(target.value);});
$('object-picker').onchange = () => { const [kind, id] = $<HTMLSelectElement>('object-picker').value.split(':'); if (id && (kind === 'building' || kind === 'resource')) selectObject({ kind, id }); else selectNPC(selectedId); };
$('map-mode').onchange = () => { selectedObject = undefined; map.setMode($<HTMLSelectElement>('map-mode').value as 'city' | 'region' | 'follow'); render(); };
$('follow-character').onclick = () => { selectedObject = undefined; map.setMode('follow'); $<HTMLSelectElement>('map-mode').value = 'follow'; render(); };
$('resident-search').oninput = () => { residentSearch = $<HTMLInputElement>('resident-search').value.trim(); residentPage = 0; renderResidents(); };
$('custom-residents').onchange = () => { customResidents = $<HTMLInputElement>('custom-residents').checked; residentPage = 0; renderResidents(); };
function defaultCharmInputs(form: HTMLFormElement) {
  const input = defaultCharacter(''), data = new FormData(form);
  for (const group of ['personality', 'traits'] as const) for (const key of Object.keys(input[group]!)) {
    const value = Number(data.get(`${group}.${key}`));
    (input[group] as Record<string, number>)[key] = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  }
  return { personality: input.personality, traits: input.traits! };
}
document.addEventListener('input', event => {
  const form = (event.target as HTMLElement).closest<HTMLFormElement>('#character-form'); if (!form) return;
  const data = new FormData(form);
  const a = Object.fromEntries(Object.keys(defaultCharacter('').appearance).map(k=>[k,String(data.get(k))])) as ReturnType<typeof appearance>;
  form.querySelectorAll<HTMLButtonElement>('[data-hair]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.hair===a.hairstyle)));
  $('character-preview').innerHTML = portrait(a);
  const defaults = defaultCharmInputs(form);
  $('character-charms').innerHTML = charmPreview(defaults.personality, defaults.traits);
});
document.addEventListener('change', event => {
  const target = event.target as HTMLSelectElement;
  if(target.id==='relationship-partner')void observer.story(target.dataset.storyPerson!,false,target.value);
  if (target.name === 'homeId' && target.closest('#character-form')) document.querySelector<HTMLSelectElement>('#character-form [name="greetId"]')!.innerHTML = greetingOptions(state, target.value);
});
let creatingCharacter = false;
document.addEventListener('submit', async event => {
  const form = event.target as HTMLFormElement; if (form.id !== 'character-form') return;
  event.preventDefault(); if (creatingCharacter) return;
  const submit = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
  try {
    const character = readCharacter(form); creatingCharacter = true; submit.disabled = true; $('character-error').textContent = '';
    let id: string;
    if (cloudMode) { const commandId = crypto.randomUUID(); await cloud!.send({ type: 'create-character', character }, commandId); const created = cloud!.world!.state.npcs.find(n => n.profile?.commandId === commandId); if (!created) throw new Error('세계가 교체되어 입주 결과를 찾을 수 없습니다. 주민 목록을 확인해 주세요.'); id = created.id; }
    else { id = sim.createCharacter(character); state = sim.snapshot(); localSave(); }
    $<HTMLDialogElement>('detail-dialog').close(); selectNPC(id);
    selectedOnly = true; $<HTMLInputElement>('selected-only').checked = true; renderEvents();
    toast(`${character.name}이 입주했습니다. 재생하여 새로운 삶을 관찰하세요.`);
  } catch (error) { const box = $('character-error'); if (box) box.textContent = (error as Error).message; else toast((error as Error).message); }
  finally { creatingCharacter = false; submit.disabled = false; }
});

// Delegated controls survive live board updates in local and server worlds.
$('observation-board').addEventListener('click', async event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!button || button.disabled) return;
  if (button.hasAttribute('data-small-world')) {
    $<HTMLInputElement>('population-input').value = String(DEFAULT_POPULATION);
    $<HTMLFormElement>('seed-form').requestSubmit();
    return;
  }
  const kind = button.dataset.build;
  if (kind !== 'home' && kind !== 'farm') return;
  button.disabled = true;
  try {
    if (cloudMode) {
      if (!cloudReady) throw new Error('서버 연결을 먼저 확인해 주세요.');
      await cloud!.send({ type: 'build', settlementId: state.civilization.focus, kind });
    } else { sim.build(state.civilization.focus, kind); render(); localSave(); }
    toast(`${kind === 'home' ? '새집' : '농장'}을 지었습니다. 시설 선택에서 살펴보세요.`);
  } catch (error) { toast(error instanceof Error ? error.message : '건설하지 못했습니다.'); }
  finally { render(); }
});

$('requests-panel').addEventListener('click', async event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!button || button.disabled || requestBusy) return;
  const id = button.dataset.request, observe = button.hasAttribute('data-observe-request'), pause = button.hasAttribute('data-request-pause');
  if (!id && !observe && !pause) return;
  requestBusy = true; render();
  try {
    if (cloudMode) {
      if (!cloudReady) throw new Error('서버 연결을 먼저 확인해 주세요.');
      await cloud!.send(pause ? { type: 'play', running: false } : observe ? { type: 'step', ticks: 12 } : { type: 'request', requestId: id!, choice: button.dataset.choice as RequestChoice });
    } else {
      if (pause) { playing = false; accumulator = 0; }
      else if (observe) {
        playing = false; accumulator = 0;
        const observed = sim, decisions = coordinator;
        for (let i = 0; i < 12; i++) { if (sim !== observed) return; observed.step(); if (observed.pending) await decisions.drain(); }
      } else sim.respondToRequest(id!, button.dataset.choice as RequestChoice);
      render(); localSave();
    }
    toast(pause ? '시간을 멈췄습니다. 천천히 읽고 선택하세요.' : observe ? (cloud?.world?.meta.pendingTicks ? '2시간 관찰을 진행 중입니다. 남은 진행은 나누어 저장합니다.' : '2시간의 생활을 관찰했습니다. 부탁의 결과를 살펴보세요.') : '선택을 기록했습니다. 부탁 카드에서 다음 변화를 확인하세요.');
  } catch (error) { toast(error instanceof Error ? error.message : '부탁을 처리하지 못했습니다.'); }
  finally { requestBusy = false; render(); }
});

$('requests-prompt').addEventListener('click', () => {
  $('requests-panel').scrollIntoView({ behavior: 'instant', block: 'start' });
  $('requests-panel').querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
});

function applyAccessUI() {
  const restricted = cloudMode && !!cloud?.session && !isOwner();
  for (const id of ['play-button','step-button','advance-day','cancel-day','drought-button','food-button','llm-toggle','ai-mode','offline-toggle','save-button','load-button','seed-input','population-input','chrome-start']) {
    const el = document.getElementById(id) as HTMLButtonElement | null;
    if (el && restricted) { el.disabled = true; el.title = '소유자가 관리하는 공동 세계 설정입니다.'; }
  }
  document.querySelectorAll<HTMLButtonElement>('button[data-protect-farm],button[data-speed],button[data-build],button[data-request],button[data-dialogue],#build-position,#land-market,#history-ai,#seed-form button,#urban-policy button').forEach(b => { if (restricted) b.disabled = true; });
  document.querySelectorAll<HTMLInputElement>('#urban-policy input,#urban-policy select,#world-detail,#council-toggle').forEach(e => { if (restricted) e.disabled = true; });
  const session = cloud?.session;
  $('account-button').hidden = !cloudMode;
  $('account-button').textContent = session ? `${session.role === 'owner' ? '소유자' : '참여자'} · 내 NPC ${session.ownNpcIds.length}` : '로그인 및 참여';
  $<HTMLButtonElement>('create-character').disabled = cloudMode && (!cloudReady || !!session?.npcLimit && session.ownNpcIds.length >= session.npcLimit);
}
async function showAccount() {
  if (!cloud?.session) {
    openDialog('<h2>초대받은 계정으로 참여하기</h2><p>소유자가 사이트 공유에서 초대한 계정으로 로그인해 주세요.</p><a class="button" href="/signin-with-chatgpt?return_to=%2F" target="_top">ChatGPT로 로그인</a>'); return;
  }
  const session = cloud.session;
  let members: { id: string; name: string; email: string; role: string; blocked: number }[] = [];
  if (isOwner()) members = (await cloud.get<{ members: typeof members }>('members')).members;
  const own = state.npcs.filter(isOwnNPC);
  openDialog(`<h2>함께 살펴보는 하나의 세계</h2><p>${esc(session.name)} · ${isOwner() ? '소유자' : '참여자'}</p>
    <p>초대받은 사람은 같은 마을을 관찰하고 NPC를 최대 3명 만들 수 있습니다. 시간·세계 설정·초기화는 소유자가 관리합니다.</p>
    <h3>내가 만든 NPC</h3>${own.map(n => `<button class="button" data-my-npc="${esc(n.id)}">${esc(n.identity.name)} · ${n.alive ? '살아가는 중' : '생애 기록'}</button>`).join('') || '<p>아직 만든 NPC가 없습니다. 상단의 NPC 만들기로 입주할 수 있습니다.</p>'}
    ${isOwner() ? `<h3>초대와 참여자 관리</h3><p>이 사이트의 ChatGPT 공유 메뉴에서 초대할 사람의 이메일을 추가하고 사이트 링크를 전달해 주세요. 초대받은 사람이 로그인하면 아래에 나타납니다. 초대를 완전히 취소하려면 공유 메뉴에서도 접근 권한을 제거하세요.</p><p>다른 참여자의 NPC와 기존 주민은 권한을 해제해도 세계에 남습니다.</p>${members.map(m => `<div class="member-row"><span>${esc(m.name)} · ${esc(m.email)} · ${m.role === 'owner' ? '소유자' : m.blocked ? '참여 중지' : '참여 가능'}</span>${m.role !== 'owner' ? `<button class="button" data-member="${esc(m.id)}" data-blocked="${m.blocked ? '0' : '1'}">${m.blocked ? '참여 재개' : '참여 중지'}</button>` : ''}</div>`).join('')}` : ''}
    ${session.local ? '<p class="muted">로컬 개발용 계정입니다.</p>' : '<a class="text-button" href="/signout-with-chatgpt?return_to=%2F" target="_top">로그아웃</a>'}`);
}
$('account-button').onclick = () => { void showAccount().catch(cloudFailure); };
document.addEventListener('click', async event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-my-npc],[data-member]'); if (!button) return;
  if (button.dataset.myNpc) { $<HTMLDialogElement>('detail-dialog').close(); selectNPC(button.dataset.myNpc); return; }
  button.disabled = true;
  try {
    const response = await fetch('/api/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: button.dataset.member, blocked: button.dataset.blocked === '1' }) });
    const body = await response.json(); if (!response.ok) throw new Error(body.error); await showAccount();
  } catch (error) { cloudFailure(error); button.disabled = false; }
});

document.addEventListener('click',event=>{
  const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-look],[data-hair]');
  const form=button?.closest<HTMLFormElement>('#character-form'); if(!button||!form)return;
  const values=button.dataset.look ? LOOK_PRESETS[button.dataset.look]?.appearance : {hairstyle:button.dataset.hair};
  for(const [key,value] of Object.entries(values ?? {})) { const field=form.elements.namedItem(key) as HTMLInputElement|HTMLSelectElement|null; if(field)field.value=String(value); }
  form.dispatchEvent(new Event('input',{bubbles:true}));
});

document.addEventListener('click',event=>{
  const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-expression]');if(!button||!cloudMode||!isOwner())return;
  const npc=selectedNPC(),kind=button.dataset.expression==='reflection'?'reflection':'dialogue',epoch=cloud!.world!.epoch;
  let previous:string|undefined;
  openDialog(`<h2>${esc(npc.identity.name)}의 ${kind==='reflection'?'기억 돌아보기':'이야기'}</h2><p>최근 4회 대화를 이어갑니다. 이전 답변은 대화 맥락이며, 사실의 근거는 주민이 아는 원본 기억입니다.</p><div id="conversation-history"></div><form id="expression-form"><label>어떤 이야기가 궁금한가요?<textarea id="expression-question" maxlength="200" required>${kind==='reflection'?'최근의 기억을 돌아보면 어떤 생각이 들어?':'마음에 남아 있는 일이 있어?'}</textarea></label><button class="button primary" type="submit">${cloud?.world?.meta.aiMode==='chrome'?'Chrome에서 한국어 표현 만들기':cloud?.world?.meta.aiMode==='remote'?'선택한 외부 API로 만들기':'기억으로 예시 만들기'}</button><button class="button" id="conversation-reset" type="button">새 대화</button><p id="expression-status" aria-live="polite"></p></form><div id="conversation-plans"></div><div id="conversation-outcomes">${promisesView(state,npc.id)}<button class="button" id="refresh-promises">약속 경과 새로 보기</button></div>`);
  const form=$<HTMLFormElement>('expression-form'),history=$('conversation-history'),status=$('expression-status'),plans=$('conversation-plans');
  const refreshPromises=async()=>{await cloud!.connect();if(form.isConnected&&cloud!.world!.epoch===epoch){$('conversation-outcomes').innerHTML=promisesView(state,npc.id)+'<button class="button" id="refresh-promises">약속 경과 새로 보기</button>';$('refresh-promises').onclick=()=>void refreshPromises().catch(e=>status.textContent=e.message);}};
  $('refresh-promises').onclick=()=>void refreshPromises().catch(e=>status.textContent=e.message);
  $('conversation-reset').onclick=()=>{previous=undefined;history.innerHTML='';plans.innerHTML='';status.textContent='새 대화를 시작합니다.';};
  form.onsubmit=async e=>{e.preventDefault();const submit=form.querySelector('button')!,reset=$<HTMLButtonElement>('conversation-reset'),question=$<HTMLTextAreaElement>('expression-question').value;submit.disabled=true;reset.disabled=true;
    try {
      if(cloud!.world!.epoch!==epoch)throw new Error('세계가 바뀌었습니다. 새 대화를 열어 주세요.');
      const response=await generateExpression({npcId:npc.id,kind,question,...(previous?{previous}:{})},cloud!.world!.meta.aiMode??'off',text=>{if(form.isConnected)status.textContent=text;});
      await cloud!.connect();if(!form.isConnected)return;
      if(cloud!.world!.epoch!==epoch)throw new Error('세계가 바뀌었습니다. 새 대화를 열어 주세요.');
      previous=response.id;
      history.insertAdjacentHTML('beforeend',`<article><p><b>나:</b> ${esc(question)}</p><blockquote>${esc(response.result.text)}</blockquote>${response.result.evidence.map(id=>`<button type="button" class="evidence-link" data-event="${esc(id)}">근거 사건 ${esc(id)}</button>`).join('')}</article>`);
      while(history.children.length>4)history.firstElementChild!.remove();
      status.textContent='표현을 세계 기록에 저장했습니다. 이어서 질문할 수 있습니다. AI 문장의 사실성을 자동으로 증명하지는 않습니다.';
      const source=state.events.find(e=>e.data.requestId===response.id);
      const choices=conversationGatherings(state,npc.id);
      plans.innerHTML=source?`<h3>대화에서 함께할 일로</h3><p>현재 생활 조건으로 가능한 모임입니다. 제안 후 초대·수락·이동·실제 활동을 거칩니다.</p>${choices.length?choices.map(c=>`<button class="button" data-plan="${c.kind}">${esc(c.label)} 제안</button>`).join(''):'<p>지금은 식량·일정·가까운 이웃 조건을 충족하는 모임이 없습니다.</p>'}`:'';
      plans.querySelectorAll<HTMLButtonElement>('[data-plan]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await cloud!.send({type:'gathering-proposal',npcId:npc.id,kind:b.dataset.plan as 'meal'|'help'|'harvest',source:source!.id});plans.textContent='모임을 제안했습니다. 아래에서 수락과 참석 경과를 확인하세요.';await refreshPromises();}catch(error){status.textContent=(error as Error).message;b.disabled=false;}});
    }catch(error){if(form.isConnected)status.textContent=(error as Error).message;}
    finally{submit.disabled=false;reset.disabled=false;}
  };
});

document.addEventListener('click',event=>{
  const button=(event.target as HTMLElement).closest<HTMLButtonElement>('#build-position,#land-market');if(!button||cloudMode&&!isOwner())return;
  const v=state.civilization.settlements.find(v=>v.id===state.civilization.focus)!;
  if(button.id==='build-position') {
    openDialog(`<h2>위치를 골라 건설하기</h2><p>${esc(v.name)} 중심 (${v.center.x}, ${v.center.y})에서 24칸 이내의 연결된 빈 풀밭에 건설합니다. 공동 목재를 실제로 사용합니다. 현장 노동은 40분마다 시장 기금 1코인을 지급하며 이동·휴식·비로 완공이 늦어질 수 있습니다.</p><form id="placed-build"><label>건물<select name="kind"><option value="home">주택 · 목재 12</option><option value="farm">농장 · 목재 16</option></select></label><label>공사 방식<select name="timed"><option value="yes">주민 현장 노동 · 주택 6인시 / 농장 12인시</option><option value="no">즉시 완공</option></select></label><label>가로 좌표<input name="x" type="number" min="0" max="${state.width-1}" required value="${v.center.x}"/></label><label>세로 좌표<input name="y" type="number" min="0" max="${state.height-1}" required value="${v.center.y}"/></label><button class="button primary">이 위치에 건설</button><p id="frontier-status" role="status"></p></form>`);
    $<HTMLFormElement>('placed-build').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget as HTMLFormElement,data=new FormData(form),submit=form.querySelector('button')!;submit.disabled=true;try{const kind=data.get('kind') as 'home'|'farm',position={x:Number(data.get('x')),y:Number(data.get('y'))};const timed=data.get('timed')==='yes';if(cloudMode)await cloud!.send({type:timed?'construction':'build',settlementId:v.id,kind,position});else {if(timed)sim.beginConstruction(v.id,kind,position);else sim.build(v.id,kind,position);render();localSave();}$<HTMLDialogElement>('detail-dialog').close();toast(timed?'공사를 시작했습니다. 마을 공사에서 진행을 확인하세요.':'선택한 위치에 건설했습니다.');}catch(error){$('frontier-status').textContent=(error as Error).message;}finally{submit.disabled=false;}};
  } else {
    const homes=state.buildings.filter(b=>b.kind==='home'&&b.settlementId===v.id&&landQuote(state,b.id).available);
    const people=state.npcs.filter(n=>n.alive&&n.identity.age>=18&&n.settlementId===v.id);
    openDialog(`<h2>주택 부지 거래</h2><p>공동체 소유 또는 소유자가 살고 있지 않은 주택의 부지와 건물을 거래합니다. 가격은 단계당 20코인이며 대금은 공동 시장 또는 기존 소유자에게 이전합니다. 기존 거주자를 퇴거시키지 않습니다.</p>${homes.length?`<form id="land-trade"><label>매물<select name="building">${homes.map(b=>`<option value="${esc(b.id)}">${esc(b.name)} (${b.position.x}, ${b.position.y}) · ${landQuote(state,b.id).price}코인</option>`).join('')}</select></label><label>매수 주민<select name="buyer">${people.map(n=>`<option value="${esc(n.id)}">${esc(n.identity.name)} · 보유 ${n.wealth}코인</option>`).join('')}</select></label><button class="button primary">소유권과 대금 이전</button><p id="frontier-status" role="status"></p></form>`:'<p>지금 거래할 수 있는 주택이 없습니다. 새집을 건설하면 공동체 소유의 매물이 생깁니다.</p>'}`);
    const form=document.getElementById('land-trade') as HTMLFormElement|null;
    if(form) { const updateBuyer=()=>{const select=form.querySelector<HTMLSelectElement>('[name=buyer]')!,building=form.querySelector<HTMLSelectElement>('[name=building]')!.value,quote=landQuote(state,building);for(const option of select.options){const n=state.npcs.find(n=>n.id===option.value)!;option.disabled=n.wealth<quote.price||quote.sellers.includes(n.id);}if(select.selectedOptions[0]?.disabled)select.value=[...select.options].find(o=>!o.disabled)?.value??'';form.querySelector('button')!.disabled=!select.value;};form.querySelector<HTMLSelectElement>('[name=building]')!.onchange=updateBuyer;updateBuyer(); }
    if(form)form.onsubmit=async e=>{e.preventDefault();const data=new FormData(form),buildingId=String(data.get('building')),buyerId=String(data.get('buyer')),price=landQuote(state,buildingId).price,submit=form.querySelector('button')!;submit.disabled=true;try{if(cloudMode)await cloud!.send({type:'land-trade',buildingId,buyerId,price});else{sim.tradeLand(buildingId,buyerId,price);render();localSave();}$<HTMLDialogElement>('detail-dialog').close();toast('부지 소유권과 대금을 이전했습니다.');}catch(error){$('frontier-status').textContent=(error as Error).message;}finally{submit.disabled=false;}};
  }
});

document.addEventListener('click',event=>{
 const b=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-protect-farm]');if(!b||cloudMode&&!isOwner())return;b.disabled=true;
 const id=b.dataset.protectFarm!;
 if(cloudMode)void cloud!.send({type:'farm-protection',buildingId:id}).then(()=>toast('농장 울타리를 설치했습니다.')).catch(cloudFailure).finally(()=>{b.disabled=false;});
 else {try{sim.protectFarm(id);render();localSave();toast('농장 울타리를 설치했습니다.');}catch(e){toast((e as Error).message);}finally{b.disabled=false;}}
});
