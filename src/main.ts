import { attractionProfile, attractionRelation, charmPreview } from './ui/attraction';
import { DEFAULT_POPULATION } from './sim/types';
import { occupationLabel } from './sim/employment';
import { livingPersonView } from './ui/living';
import { defaultCharacter, characterForm, readCharacter, greetingOptions, appearance, portrait } from './ui/characters';
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
interface AIStatus { chrome?: { schedule?: { hourlyCalls: number; hourlyLimit: number }; dailyLimit: number; usage: { calls: number }; jobs: { id: string; epoch: string; status: string; attempts: number; error: string | null }[] }; configured: boolean; model: string | null; day: string; dailyLimit: number; maxOutputTokens: number; usage: { calls: number; inputTokens: number; outputTokens: number }; jobs: { id: string; epoch: string; kind: string; status: string; attempts: number; error: string | null; model: string }[] }
let aiStatus: AIStatus | undefined;
let chromeRunner: ChromeRunner | undefined;
let journalKey = '', journalNext: number | null = null, journalEpoch = '', journalEvents: WorldEvent[] = [], journalRequest = 0;
let journalPage: EventPage | undefined;
let lifeKey = '', lifeNext: number | null = null, lifeEvents: WorldEvent[] = [], lifeRequest = 0;
let startupNote = '';
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && !cloudMode) { sim = Simulation.load(saved); coordinator = new DecisionCoordinator(sim, new MockLLMProvider()); startupNote = '이 기기에 저장된 작은 세계를 이어갑니다.'; }
} catch { startupNote = '기기의 저장을 읽지 못해 새 세계를 시작했습니다. JSON 파일로 불러올 수 있습니다.'; }
let state = sim.snapshot(), selectedId = state.npcs[0].id, playing = true, speed = 1, tab = 'overview', view = 'world', filter = 'important', search = '', selectedOnly = false, eventLimit = 40, lastSaveTick = sim.tick;
if (cloudMode) playing = false;
let metric = 'food', lifeLimit = 40;
let presentationMotion: MotionTrace | undefined;
const markupCache = new Map<string, string>();
function setHTML(id: string, html: string) { if (markupCache.get(id) !== html) { $(id).innerHTML = html; markupCache.set(id, html); } }
let noticeTimer: ReturnType<typeof setTimeout>;

$('app').innerHTML = `
  <aside class="sidebar">
    <a class="brand" href="#" aria-label="Living Small World 홈"><span class="brand-icon">${icon('leaf', 27)}</span><span>living<br><b>small world<span class="brand-dot">.</span></b></span></a>
    <div class="sidebar-caption">작은 세계 관측소</div>
    <nav aria-label="주 메뉴">
      <button class="nav-button active" data-view="world" aria-label="세계 관찰" title="세계 관찰">${icon('world')}<span>세계 관찰</span><span class="nav-dot"></span></button>
      <button class="nav-button" data-view="residents" aria-label="마을 주민" title="마을 주민">${icon('people')}<span>마을 주민</span><span id="nav-population" class="nav-number">100</span></button>
      <button class="nav-button" data-view="history" aria-label="세계의 기록" title="세계의 기록">${icon('book')}<span>세계의 기록</span></button>
      <button class="nav-button" data-view="economy" aria-label="마을 경제">${icon('food')}<span>마을 경제</span></button>
      <button class="nav-button" data-view="experiments" aria-label="관찰 실험실" title="관찰 실험실">${icon('flask')}<span>관찰 실험실</span></button>
    </nav>
    <div class="world-note"><span class="eyebrow">A WORLD OF THEIR OWN</span><div class="note-illustration">${icon('leaf', 38)}<span>·</span>${icon('food', 28)}</div><p>작은 선택들이 모여<br>하나의 세계가 됩니다.</p><span>이야기는 지금도 자라고 있어요.</span></div>
    <div class="sidebar-bottom"><div class="engine-indicator"><i></i> Deterministic engine <span>v0.9</span></div><button id="about-button" class="quiet">${icon('book', 15)} 이 세계에 대하여</button></div>
  </aside>
  <main>
    <header class="topbar"><div class="breadcrumb">관측소 <span>/</span> <b id="breadcrumb-view">세계 관찰</b></div><div class="topbar-actions"><button id="create-character" class="button dark">＋ NPC 만들기</button><span id="ai-badge" class="mock-badge">${icon('spark', 13)} Mock AI · API 없이 실행</span><button id="load-button" class="button">${icon('load', 16)} 불러오기</button><button id="save-button" class="button">${icon('save', 15)} 세계 저장</button></div></header>
    <div class="page-content">
      <section class="page-heading"><div><div class="eyebrow">LIVING SMALL WORLD</div><h1 id="page-title">이야기가 자라는 마을</h1><p id="page-subtitle">저마다의 하루가 만나, 이 세계만의 역사가 됩니다.</p></div><div class="world-status"><span id="running-dot" class="live-dot"></span><span id="running-status">세계가 살아가는 중</span><span class="seed-label">SEED <b id="seed-label">42</b></span></div></section>
      <section class="cloud-panel" aria-label="세계 저장 및 연결"><div><b>${cloudMode ? '서버에 이어지는 세계' : '이 기기의 세계'}</b><p id="cloud-status">${cloudMode ? '서버 세계를 불러오는 중…' : '이 기기에서만 진행하고 저장합니다.'}</p></div><div class="cloud-actions">${cloudMode ? '<label><input id="offline-toggle" type="checkbox" disabled/> 자리를 비워도 진행</label><button id="cloud-retry" class="button">연결 새로고침</button><a class="text-button" href="?local=1">기기 세계 관찰</a>' : '<a class="button" href="/">서버 세계로 돌아가기</a>'}</div>${cloudMode ? '<p class="cloud-policy">기본은 비접속 시 정지입니다. 켜면 재접속할 때 최대 게임 하루(144틱)만 반영합니다. 재생·정지·배속 설정은 모든 기기에 적용됩니다.</p>' : ''}</section><section class="stats-grid" aria-label="세계 현황" id="stats"></section>
      <div id="world-view" class="world-layout">
        <section class="panel map-panel"><div class="panel-heading"><div><span class="small-dot"></span><h2 id="village-title">느티나무 마을</h2><span class="muted location-caption">NEUTINAMU VILLAGE</span></div><div class="weather-info" id="weather"></div></div>
          <div class="map-controls"><div class="time-controls"><button id="play-button" class="play-button" aria-label="일시정지">${icon('pause', 17)}</button><button id="step-button" class="icon-button" aria-label="한 틱 진행">${icon('step', 17)}</button><span class="control-divider"></span><div class="speed-switch" aria-label="시뮬레이션 배속">${[1, 5, 20].map(s => `<button data-speed="${s}" class="${s === 1 ? 'active' : ''}" aria-pressed="${s === 1}">${s}×</button>`).join('')}</div></div><div class="game-clock" id="game-clock"></div></div><div class="map-navigation"><label>지도 범위 <select id="map-mode"><option value="city">정착지 전체</option><option value="region">세계 전체</option><option value="follow">선택 주민 따라보기</option></select></label><button id="follow-character" class="button">선택 주민 찾기</button><span id="map-scope" class="muted"></span></div><div class="map-wrap"><canvas id="world-map" aria-label="주민을 클릭해 자세히 볼 수 있는 마을 지도. 마을 주민 메뉴에서도 선택할 수 있습니다."></canvas><div class="map-badge"><i></i> 작은 세계 · <span id="map-size">32 × 24</span></div><button class="map-grid-button" id="grid-button" aria-label="지도 격자 표시" aria-pressed="false">${icon('grid', 17)}</button><div class="map-compass"><span>N</span>↑</div></div>
          <div id="character-watch" class="character-watch" aria-live="off"></div><div id="civilization-panel" class="civilization-panel"></div>
          <div class="map-footer"><span><i class="legend-dot citizen"></i> 주민</span><span><i class="legend-dot farm"></i> 농장</span><span><i class="legend-dot resource"></i> 자원</span><span class="map-tip">주민을 선택하면 마음을 들여다볼 수 있어요</span></div>
        </section>
        <aside class="panel inspector"><div class="inspector-title"><h2>주민 들여다보기</h2><span class="muted">AGENT INSPECTOR</span></div><div id="npc-header"></div><div class="inspector-tabs" role="tablist"><button role="tab" aria-selected="true" data-tab="overview" class="active">일상</button><button role="tab" aria-selected="false" data-tab="relationships">관계</button><button role="tab" aria-selected="false" data-tab="memories">기억</button><button role="tab" aria-selected="false" data-tab="life">생애</button></div><div id="npc-detail" class="inspector-content"></div></aside>
      </div>
      <section id="economy-view" class="panel alternate-view" hidden></section>
      <section id="residents-view" class="panel alternate-view" hidden><div class="panel-heading"><h2>마을의 모든 주민</h2><span class="muted">주민을 선택해 삶의 흔적을 확인하세요.</span></div><div class="resident-search"><label>주민 검색<input id="resident-search" type="search" placeholder="이름 또는 직업"/></label><label><input id="custom-residents" type="checkbox"/> 내가 만든 주민만</label><span id="resident-count"></span></div><div id="resident-grid" class="resident-grid"></div></section>
      <section id="experiments-view" class="panel alternate-view" hidden><div class="panel-heading"><h2>조건을 바꾸고, 변화를 관찰하세요</h2><span class="muted">모든 개입은 세계의 기록에 남습니다.</span></div><div class="experiment-grid"><article><span class="experiment-icon">${icon('sun', 28)}</span><h3>비가 오지 않는다면</h3><p>3일 동안 가뭄을 만듭니다. 농장과 열매의 생산이 줄고 갈증은 빨라집니다. 식량이 부족해지면 주민들은 어떤 선택을 할까요?</p><button id="drought-button" class="button dark">3일 가뭄 시작</button></article><article><span class="experiment-icon">${icon('food', 28)}</span><h3>작은 도움의 시작</h3><p>공동 창고에 식량 24개를 보탭니다. 식량을 가져가는 사람과 이웃에게 나누는 사람, 그 뒤에 남는 관계를 관찰하세요.</p><button id="food-button" class="button dark">식량 24개 투입</button></article><article><span class="experiment-icon">${icon('world', 28)}</span><h3>다른 세계의 첫 아침</h3><p>같은 시드와 명령은 같은 결과를 만듭니다. 현재 세계는 자동 저장한 뒤 새 세계를 시작합니다.</p><form id="seed-form"><label for="population-input">초기 주민 수</label><input id="population-input" type="number" min="10" max="3000" value="100" required/><p>기본 100명으로 시작합니다. 37명부터 여러 마을에 주거와 농업 기반을 갖추며, 401명부터 밀집 정착지로 시작합니다. 출생 포함 생존 인구는 최대 3,000명입니다.</p><label for="seed-input">월드 시드</label><div class="input-group"><input id="seed-input" type="number" min="0" max="4294967295" step="1" value="42" required/><button class="button dark" type="submit">새로 시작</button></div></form></article></div><div class="experiment-settings"><label ${cloudMode ? 'hidden' : ''}><input type="checkbox" id="llm-toggle" checked/> 중요한 사건의 Mock AI 해석 사용</label>${cloudMode ? '<div class="ai-settings"><label for="ai-mode">세계의 AI 방식</label><select id="ai-mode" disabled><option value="chrome">Chrome 내장 AI · 권장</option><option value="off">AI 끄기</option><option value="mock">Mock · 비용 없이 관찰</option><option value="remote" disabled>서버 모델 · 연결 설정 필요</option></select><div class="chrome-device"><b>이 기기의 Chrome AI</b><p id="chrome-status" role="status"></p><progress id="chrome-progress" max="100" value="0" hidden aria-label="Chrome 모델 다운로드 진행률"></progress><div class="cloud-actions"><button id="chrome-start" class="button" disabled>이 기기에서 다운로드·활성화</button><button id="chrome-stop" class="button" disabled>기기 실행 중단</button><button id="chrome-check" class="button">지원 다시 확인</button><button id="chrome-diagnostics" class="button">기기 진단 JSON 내보내기</button></div><p>Chrome 목표 선택은 영어 구조화 사건을 사용합니다. 한국어 이유는 서버가 구성하며 자유 대화는 지원하지 않습니다. 추론은 기기에서 실행하고 요청·승인 결과는 서버에 저장합니다. 탭을 숨기거나 닫으면 중단하며 외부 API로 자동 전환하지 않습니다.</p></div><p id="ai-status" role="status">모델 연결을 확인하고 있습니다.</p><div id="ai-usage" class="ai-usage"></div><details><summary>최근 모델 처리 기록</summary><div id="ai-audit"></div></details></div>' : ''}<p>끄더라도 주민의 생존·생산·사회 활동은 계속됩니다. AI는 목표와 해석만 제안합니다.</p><div id="llm-metrics"></div><button id="advance-day" class="button">하루 관찰 진행</button><button id="cancel-day" class="button" hidden>하루 진행 중단</button><p>144틱을 진행한 뒤 일시정지합니다. 서버의 401명 이상 세계는 나누어 저장하며 진행하고, 탭을 다시 열면 남은 진행을 이어갑니다. 경제 화면에서 생산·소비와 가격 변화를 확인하세요.</p></div></section>
      <section class="panel event-panel" id="event-panel"><div class="panel-heading"><div><h2>세계의 기록</h2><span class="record-badge">LIVE JOURNAL</span></div><button id="all-events-button" class="text-button">전체 기록 보기 ${icon('arrow', 14)}</button></div><div class="event-toolbar"><div class="event-filters">${[['important', '주요 사건'], ['social', '관계'], ['economy', '경제'], ['all', '모든 사건']].map(([value, text]) => `<button class="${value === 'important' ? 'active' : ''}" data-filter="${value}" aria-pressed="${value === 'important'}">${text}</button>`).join('')}</div><div class="event-search"><label><input id="selected-only" type="checkbox"/> 선택 주민</label><label class="search-box">${icon('search', 14)}<input id="event-search" placeholder="주민, 사건, ID 검색" aria-label="사건 검색"/></label></div></div><div class="journal-dates"><label>시작일 <input id="event-from" type="number" min="1" placeholder="전체" aria-label="기록 시작일"/></label><label>종료일 <input id="event-to" type="number" min="1" placeholder="전체" aria-label="기록 종료일"/></label></div><div id="events" class="event-list"></div><button id="more-events" class="more-button">이전 기록 더 보기</button></section>
      <footer class="page-footer"><span>${icon('leaf', 13)} 모든 이야기는 작은 선택에서 시작됩니다.</span><span id="save-status">자동 저장 대기 중 · 30초 간격</span></footer>
    </div>
  </main><input type="file" id="file-input" accept=".json,application/json" hidden/><div id="toast" class="toast" role="status" hidden></div><dialog id="detail-dialog"><button id="close-dialog" class="dialog-close" aria-label="닫기">×</button><div id="dialog-content"></div></dialog>`;

const map = new WorldMap($<HTMLCanvasElement>('world-map'), selectNPC);
function toast(message: string) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => $('toast').hidden = true, 4500); }
function selectedNPC() { return state.npcs.find(n => n.id === selectedId) ?? state.npcs[0]; }
function selectNPC(id: string) { selectedId = id; map.setMode('follow'); $<HTMLSelectElement>('map-mode').value = 'follow'; tab = 'overview'; lifeLimit = 40; setView('world'); render(); }
function actionText(n: NPC) { return !n.alive ? '세상을 떠남' : !n.currentAction ? '다음 행동을 생각하는 중' : `${n.currentAction.path.length ? '이동 중 · ' : ''}${ACTION_LABELS[n.currentAction.kind]}`; }
function render() {
  if (!cloudMode) state = sim.snapshot(); const living = state.npcs.filter(n => n.alive), socialCount = cloudMode ? cloud?.world?.meta.socialCount ?? 0 : state.events.filter(e => ['share', 'talk', 'witness', 'rumor'].includes(e.kind)).length;
  const averageHealth = Math.round(living.reduce((s, n) => s + n.needs.health, 0) / Math.max(1, living.length));
  setHTML('stats', [
    ['people', '함께 살아가는 주민', `${living.length}<small>명</small>`, `${state.npcs.length}개의 서로 다른 삶`, 'sage'],
    ['food', '모든 마을 공동 식량', `${state.civilization.settlements.reduce((s, v) => s + stocks(state, v.id).food, 0)}<small>개</small>`, `목재 ${state.civilization.settlements.reduce((s, v) => s + stocks(state, v.id).wood, 0)}개 · 시장 식량 ${state.civilization.settlements.reduce((s, v) => s + market(state, v.id).food, 0)}개`, 'wheat'],
    ['heart', '마을의 평균 건강', `${averageHealth}<small>/ 100</small>`, averageHealth > 75 ? '평온하게 이어지는 일상' : '주민들의 건강을 살펴보세요', 'rose'],
    ['book', '서로에게 남긴 이야기', `${socialCount}<small>건</small>`, `도움 ${state.stats.shares} · 갈등 ${state.stats.conflicts}`, 'blue'],
  ].map(([i, label, number, text, color]) => `<article class="stat-card"><span class="stat-icon ${color}">${icon(i, 21)}</span><div><div class="stat-label">${label}</div><div class="stat-number">${number}</div><div class="stat-note">${text}</div></div></article>`).join(''));
  $('nav-population').textContent = String(living.length); $('seed-label').textContent = String(state.seed); $('map-size').textContent = `${state.width} × ${state.height}`;
  const season = ['봄', '여름', '가을', '겨울'][Math.floor((dayOf(state.tick) - 1) / 3) % 4], weather = { sunny: '맑음', rain: '비', cloudy: '흐림', drought: '가뭄' }[state.weather];
  $('weather').innerHTML = `${icon('sun', 16)} ${season} <span>·</span> ${weather}`;
  $('game-clock').innerHTML = `<b>${dayOf(state.tick)}일째</b><span>${Math.floor((dayOf(state.tick) - 1) / 12) + 1}년</span><span>${timeLabel(state.tick)}</span><span class="muted">${season}</span>`;
  $('running-status').textContent = playing ? '세계가 살아가는 중' : '잠시 멈춘 세계'; $('running-dot').classList.toggle('paused', !playing);
  $('play-button').innerHTML = icon(playing ? 'pause' : 'play', 17); $('play-button').setAttribute('aria-label', playing ? '일시정지' : '재생');
  const openDetails = [...document.querySelectorAll<HTMLDetailsElement>('#npc-detail details[open]')].map(d => d.dataset.detailKey ?? d.className);
  const inspectorScroll = $('npc-detail').scrollTop;
  const heritageOpen = document.querySelector<HTMLDetailsElement>('#heritage-overview')?.open;
  const urbanOpen = document.querySelector<HTMLDetailsElement>('#urban-overview')?.open;
  const policyEditing = document.activeElement?.closest('#urban-policy');
  if (!policyEditing) { setHTML('civilization-panel', civilizationView(state)); if (urbanOpen) document.querySelector<HTMLDetailsElement>('#urban-overview')!.open = true; if (heritageOpen) document.querySelector<HTMLDetailsElement>('#heritage-overview')!.open = true; }
  $('village-title').textContent = map.viewMode === 'region' ? '세계 전체 · 정착지와 교역' : state.civilization.settlements.find(v => v.id === (map.viewMode === 'follow' ? selectedNPC().settlementId : state.civilization.focus))?.name ?? '정착지';
  map.update(state, selectedId, { playing, trace: presentationMotion, interval: cloudMode ? 2000 : 700 / speed, buffered: cloudMode }); presentationMotion = undefined; renderCharacterWatch(); renderInspector(); renderEvents();
  for (const detail of document.querySelectorAll<HTMLDetailsElement>('#npc-detail details')) detail.open = openDetails.includes(detail.dataset.detailKey ?? detail.className);
  $('npc-detail').scrollTop = inspectorScroll;
  if (view === 'residents') renderResidents();
  if (view === 'economy') $('economy-view').innerHTML = economyView(state, metric);
  $('llm-metrics').innerHTML = `<span>요청 ${state.llm.requested}</span><span>완료 ${state.llm.completed}</span><span>대기 ${state.llm.queue.length}</span><span>거부 ${state.llm.rejected}</span><span>실패 ${state.llm.failed}</span><span>게임 하루 요청 ${state.llm.dailyTotal} / 12</span>`;
  $('ai-badge').innerHTML = `${icon('spark', 13)} ${!state.llm.enabled ? '고차원 해석 꺼짐' : cloud?.world?.meta.aiMode === 'chrome' ? 'Chrome AI · 목표 선택' : cloud?.world?.meta.aiMode === 'remote' ? '서버 AI · 근거 있는 해석' : 'Mock AI · API 없이 실행'}`;
  $<HTMLInputElement>('llm-toggle').checked = state.llm.enabled;
  if (cloudMode) renderAI();
  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(b => { b.classList.toggle('active', b.dataset.tab === tab); b.setAttribute('aria-selected', String(b.dataset.tab === tab)); });
  // The summary is also available as a downloadable observational report.
  $('stats').title = `관측 ${Number(((state.tick - 36) / 144).toFixed(2))}일 · 전체 사건 ${cloudMode ? cloud?.world?.meta.eventCount ?? 0 : state.events.length}건`;
}
function renderInspector() {
  const n = selectedNPC();
  $('npc-header').innerHTML = `<div class="npc-profile"><div class="avatar" style="--person-color:${npcColor(n)}">${portrait(appearance(n))}<span class="avatar-dot ${n.alive ? '' : 'dead'}"></span></div><div><h3>${esc(n.identity.name)} <span>${n.identity.age}세${n.profile ? ' · 내 NPC' : ''}</span></h3><p>${occupationLabel(state, n)} <span>·</span> ${esc(state.buildings.find(b => b.id === n.homeId)?.name ?? '')}</p><span class="personality-tag">${n.personality.empathy > 60 ? '다정한 이웃' : n.personality.greed > 65 ? '야심 있는 수집가' : n.personality.diligence > 55 ? '성실한 일꾼' : '느긋한 생활자'}</span></div><button id="next-npc" class="icon-button" aria-label="다음 주민">${icon('arrow', 17)}</button></div>`;
  if (tab === 'life') { if (cloudMode) { renderCloudLife(); return; } $('npc-detail').innerHTML = lifeHistory(state, n, lifeLimit); return; }
  if (tab === 'relationships') {
    $('npc-detail').innerHTML = `${attractionProfile(state, n)}<div class="section-label">사건으로 이어진 관계 <span>${n.relationships.length}</span></div>${n.relationships.length ? [...n.relationships].sort((a, b) => b.trust - a.trust).map(r => `<article class="relationship-card"><div><button class="text-button" data-npc="${esc(r.npcId)}">${esc(state.npcs.find(p => p.id === r.npcId)?.identity.name ?? r.npcId)}</button><span>신뢰 <b>${Math.round(r.trust)}</b></span></div><p>${esc(r.interpretation)}</p>${attractionRelation(state, n, r.npcId)}<div class="relation-values">친밀 ${r.familiarity.toFixed(0)} · 애정 ${r.affection.toFixed(0)} · 존중 ${r.respect.toFixed(0)}<br>두려움 ${r.fear.toFixed(0)} · 불만 ${r.resentment.toFixed(0)}</div><button class="evidence-link" data-relation="${esc(r.npcId)}">관계의 근거 ${r.evidence.length}건 ${icon('arrow', 12)}</button>${cloudMode && cloud?.world?.meta.aiMode !== 'chrome' && n.alive && state.npcs.find(p => p.id === r.npcId)?.alive && n.memories.some(m => m.relatedNpcIds.includes(r.npcId)) ? `<button class="button dialogue-button" data-dialogue="${esc(r.npcId)}" ${!state.llm.enabled || cloud?.world?.meta.dialogue ? 'disabled' : ''}>기억에 근거한 말 듣기</button>${RECOLLECTION_TOPICS.filter(t => t !== 'shared' && recollections(n.memories, r.npcId, t).length).map(t => `<button class="button dialogue-button" data-dialogue="${esc(r.npcId)}" data-recall="${t}" ${!state.llm.enabled || cloud?.world?.meta.dialogue || cloud?.world?.meta.history ? 'disabled' : ''}>${RECOLLECTION_LABELS[t]}</button>`).join('')}` : ''}</article>`).join('') : '<div class="empty-state">아직 서로를 알아가는 중이에요.<br>대화와 도움이 쌓이면 관계가 생깁니다.</div>'}`;
    return;
  }
  if (tab === 'memories') {
    $('npc-detail').innerHTML = `<div class="section-label">마음에 남은 순간 <span>${n.memories.length} / 40</span></div>${n.memories.length ? [...n.memories].sort((a, b) => b.createdAt - a.createdAt).map(m => `<button class="memory-card" data-event="${esc(m.sourceEventId)}"><span class="memory-date">${dayOf(m.createdAt)}일째 · 중요도 ${Math.round(m.importance)}${m.repetitions > 1 ? ` · 반복 ${m.repetitions}회` : ''}</span><p>${esc(m.description)}</p><span class="evidence-link">실제 사건으로 돌아가기 ${icon('arrow', 12)}</span></button>`).join('') : '<div class="empty-state">아직 오래 간직할 기억이 없어요.<br>의미 있는 경험이 마음에 남습니다.</div>'}<p class="inspector-footnote">일상의 기억은 서서히 흐려집니다. 원래 사건은 세계의 기록에 남아 있습니다.</p>`;
    return;
  }
  const needLabels = [['hunger', '배고픔', false], ['thirst', '갈증', false], ['fatigue', '피로', false], ['health', '건강', true], ['social', '사회적 충족', true], ['safety', '안전감', true]] as const;
  $('npc-detail').innerHTML = `<div class="action-box"><span class="section-label">지금 하고 있는 일</span><div>${icon(n.currentAction?.path.length ? 'arrow' : 'leaf', 17)}<b>${actionText(n)}</b><span class="small-live-dot"></span></div></div>
    ${n.profile ? `<div class="character-background"><p>${esc(n.profile.background) || '이곳에서 새로운 삶을 시작한 주민입니다.'}</p><button class="evidence-link" data-event="${esc(n.profile.arrivalEventId)}">입주 기록 보기</button></div>` : ''}<div class="section-label needs-title">몸과 마음 <span>0 — 100</span></div><div class="needs-list">${needLabels.map(([key, label, positive]) => { const value = Math.round(n.needs[key]), danger = positive ? value < 35 : value > 75; return `<div class="need-row"><span>${label}</span><div class="need-track"><i style="width:${value}%;background:${danger ? '#c9826c' : positive ? '#7d9c86' : '#b7a275'}"></i></div><b>${value}</b></div>`; }).join('')}</div>
    <div class="section-label spaced">왜 이 행동을 할까요? ${icon('spark', 13)}</div><div class="reason-box">${esc(n.decision.reason)}<div class="reason-foot">Utility AI · ${timeLabel(n.decision.tick)} 판단</div></div>
    <details class="utility-details"><summary>행동 후보 점수 보기</summary><div>${n.decision.candidates.map(c => `<div class="utility-row"><span>${ACTION_LABELS[c.kind]}<small>${esc(c.reason)}</small>${(c.evidence ?? []).map(id => `<button class="evidence-link" data-event="${esc(id)}">${esc(id)}</button>`).join('')}</span><b>${c.score.toFixed(1)}</b></div>`).join('') || '<p>첫 틱이 지나면 판단을 확인할 수 있습니다.</p>'}</div></details>
    <div class="section-label spaced">지금의 바람</div>${n.goals.map(g => `<div class="goal-row">${icon('leaf', 14)}<div><b>${GOAL_LABELS[g.kind]}</b><p>${esc(g.reason)}</p>${g.sourceEventId ? `<button class="evidence-link" data-event="${esc(g.sourceEventId)}">계기가 된 사건 보기</button>` : ''}</div></div>`).join('')}
    <div class="inventory-strip"><span>${icon('food', 14)} 식량 <b>${n.inventory.food}</b></span><span>목재 <b>${n.inventory.wood}</b></span><span>재산 <b>${n.wealth}</b></span></div>
    ${attractionProfile(state, n)}${livingPersonView(state, n)}<details class="personality-details"><summary>성격과 생활 정보</summary><p>근면 ${n.personality.diligence.toFixed(0)} · 탐욕 ${n.personality.greed.toFixed(0)} · 사교 ${n.personality.sociability.toFixed(0)}<br>공격성 ${n.personality.aggression.toFixed(0)} · 공감 ${n.personality.empathy.toFixed(0)} · 호기심 ${n.personality.curiosity.toFixed(0)}</p><p>좌표 (${n.position.x}, ${n.position.y}) · 오늘 식량 인출 ${n.dailyTaken}/3<br>기억 ${n.memories.length} · 관계 ${n.relationships.length}</p></details>`;
}
let residentPage = 0, residentSearch = '', customResidents = false;
function renderResidents() {
  const residents = state.npcs.filter(n => (!customResidents || n.profile) && `${n.identity.name} ${occupationLabel(state, n)}`.includes(residentSearch));
  $('resident-count').textContent = `${residents.length}명`;
  residentPage = Math.min(residentPage, Math.max(0, Math.ceil(residents.length / 60) - 1));
  $('resident-grid').innerHTML = residents.slice(residentPage * 60, (residentPage + 1) * 60).map(n => `<button class="resident-card" data-npc="${esc(n.id)}"><span class="resident-dot">${portrait(appearance(n))}</span><div><h3>${esc(n.identity.name)}${n.profile ? ' <small>내 NPC</small>' : ''} <small>${occupationLabel(state, n)}</small></h3><p>${actionText(n)}</p><span>배고픔 ${n.needs.hunger.toFixed(0)} · 건강 ${n.needs.health.toFixed(0)} · 식량 ${n.inventory.food}</span></div>${icon('arrow', 16)}</button>`).join('') + (residents.length > 60 ? `<div class="resident-paging"><button class="button" data-resident-page="-1" ${residentPage === 0 ? 'disabled' : ''}>이전 주민</button><span>${residentPage + 1} / ${Math.ceil(residents.length / 60)}</span><button class="button" data-resident-page="1" ${(residentPage + 1) * 60 >= residents.length ? 'disabled' : ''}>다음 주민 목록</button></div>` : '');
}
const kindLabels: Partial<Record<WorldEvent['kind'], string>> = { ecology: '생태 변화', council: '주민 공동결정', diplomacy: '도시 관계', industry: '산업 생산', public_service: '공공서비스', tax: '세금·임대', urban: '도시 관측', policy: '정책 변경', freight: '물자 운송', family: '가족 형성', birth: '출생', coming_of_age: '성년', inheritance: '상속', education: '기술 전승', construction: '건설', settlement: '새 정착지', migration: '이주', caravan: '마을 교역', occupation: '직업 변화', price: '가격 산정', wage: '노동 보상', share: '따뜻한 도움', theft: '식량 절도', witness: '목격', rumor: '소문', talk: '이웃의 대화', relationship: '관계 변화', memory: '새로운 기억', goal: '새로운 바람', weather: '마을의 날씨', scarcity: '식량 부족', health: '건강', death: '마지막 인사', production: '생산', consumption: '생활', storage: '공동 창고', trade: '거래', loan: '대여', repayment: '상환', default: '연체', experiment: '관찰 실험', project: '목표 달성', llm: '사건 해석', arrival: '이동', failure: '계획 변경' };
function renderEvents() {
  if (cloudMode) { void loadJournal(); return; }
  const filtered = state.events.filter(e => {
    const from = Number($<HTMLInputElement>('event-from').value), to = Number($<HTMLInputElement>('event-to').value);
    if (from && dayOf(e.tick) < from || to && dayOf(e.tick) > to) return false;
    if (selectedOnly && !e.participants.includes(selectedId)) return false;
    if (search && !`${e.description} ${e.id} ${e.causeId ?? ''} ${JSON.stringify(e.data)}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'important') return e.importance >= 45 || e.kind === 'weather';
    if (filter === 'social') return ['share', 'talk', 'witness', 'rumor', 'relationship', 'memory', 'family', 'birth', 'coming_of_age', 'education', 'migration', 'death'].includes(e.kind);
    if (filter === 'economy') return ['production', 'storage', 'trade', 'loan', 'repayment', 'default', 'theft', 'scarcity', 'wage', 'price', 'project', 'consumption', 'experiment', 'inheritance', 'construction', 'settlement', 'caravan', 'occupation', 'industry', 'public_service', 'tax', 'urban', 'policy', 'freight', 'ecology', 'council', 'diplomacy'].includes(e.kind);
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
  view = next;
  const titles: Record<string, [string, string, string]> = { world: ['세계 관찰', '이야기가 자라는 마을', '저마다의 하루가 만나, 이 세계만의 역사가 됩니다.'], residents: ['마을 주민', '열두 빛깔의 하루', '각자의 욕구와 성격, 그리고 스스로 만들어 가는 삶.'], history: ['세계의 기록', '작은 세계의 긴 기억', '지금의 관계를 따라가면, 그날의 선택을 만날 수 있습니다.'], economy: ['마을 경제', '생활이 오가는 자리', '누가 생산하고, 누가 나누며, 무엇이 달라졌는지 살펴봅니다.'], experiments: ['관찰 실험실', '다른 조건, 새로운 이야기', '세계의 법칙 안에서 작은 변화를 관찰해 보세요.'] };
  const [label, title, subtitle] = titles[next]; $('breadcrumb-view').textContent = label; $('page-title').textContent = next === 'residents' ? `${state.npcs.length}개의 서로 다른 하루` : title; $('page-subtitle').textContent = subtitle;
  $('economy-view').hidden = next !== 'economy'; if (next === 'economy') $('economy-view').innerHTML = economyView(state, metric);
  $('world-view').hidden = next !== 'world'; $('residents-view').hidden = next !== 'residents'; $('experiments-view').hidden = next !== 'experiments'; $('event-panel').hidden = next === 'residents';
  $('event-panel').classList.toggle('full-journal', next === 'history'); $('all-events-button').hidden = next === 'history';
  document.querySelectorAll('[data-view]').forEach(el => el.classList.toggle('active', (el as HTMLElement).dataset.view === next));
  if (next === 'residents') renderResidents();
}
function replaceWorld(next: Simulation) { coordinator.dispose(); sim = next; coordinator = new DecisionCoordinator(sim, new MockLLMProvider()); state = sim.snapshot(); selectedId = state.npcs[0].id; lastSaveTick = sim.tick; map.reset(); accumulator = 0; eventLimit = 40; $<HTMLInputElement>('seed-input').value = String(state.seed); render(); }
function localSave(showNotice = false) {
  if (cloudMode) return false;
  try { localStorage.setItem(STORAGE_KEY, sim.save()); lastSaveTick = sim.tick; $('save-status').textContent = `${dayOf(sim.tick)}일째 ${timeLabel(sim.tick)} · 이 기기에 저장됨`; if (showNotice) toast('세계의 상태와 모든 사건을 이 기기에 저장했습니다.'); return true; }
  catch { $('save-status').textContent = '기기 저장 공간 부족 · JSON 내보내기를 이용하세요'; if (showNotice) toast('기기 저장 공간이 부족합니다. JSON 파일로 내보내세요.'); return false; }
}
function download(filename: string, value: string) { const url = URL.createObjectURL(new Blob([value], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

document.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLElement>('button'); if (!button) return;
  if (button.dataset.metric) { metric = button.dataset.metric; $('economy-view').innerHTML = economyView(state, metric); }
  if (button.id === 'more-life') { lifeLimit += 40; renderInspector(); }
  if (button.id === 'export-observations') download(`living-small-world-observations-${state.seed}.json`, JSON.stringify({ seed: state.seed, since: state.economy.since, daily: state.economy.daily, urban: state.urban.samples }, null, 2));
  if (button.dataset.view) setView(button.dataset.view);
  if (button.dataset.npc) { $<HTMLDialogElement>('detail-dialog').close(); selectNPC(button.dataset.npc); }
  if (button.dataset.tab) { tab = button.dataset.tab; render(); }
  if (button.dataset.speed) { speed = Number(button.dataset.speed); document.querySelectorAll<HTMLElement>('[data-speed]').forEach(b => { b.classList.toggle('active', Number(b.dataset.speed) === speed); b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === speed)); }); }
  if (button.dataset.filter) { filter = button.dataset.filter; eventLimit = 40; document.querySelectorAll<HTMLElement>('[data-filter]').forEach(b => { b.classList.toggle('active', b.dataset.filter === filter); b.setAttribute('aria-pressed', String(b.dataset.filter === filter)); }); renderEvents(); }
  if (button.dataset.event) showEvent(button.dataset.event);
  if (button.dataset.relation) {
    const n = selectedNPC(), r = n.relationships.find(r => r.npcId === button.dataset.relation)!;
    openDialog(`<div class="eyebrow">RELATIONSHIP HISTORY</div><h2>${esc(n.identity.name)}의 관계가 만들어진 순간들</h2><p>${esc(r.interpretation)}</p>${attractionRelation(state, n, r.npcId)}${r.evidence.map(id => `<button class="causal-button" data-event="${esc(id)}">${esc(state.events.find(e => e.id === id)?.description ?? id)} ${icon('arrow', 14)}</button>`).join('')}`);
  }
  if (button.id === 'next-npc') { const index = state.npcs.findIndex(n => n.id === selectedId); selectNPC(state.npcs[(index + 1) % state.npcs.length].id); }
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
$('about-button').onclick = () => openDialog(`<div class="eyebrow">LIVING SMALL WORLD · 0.9</div><h2>스토리가 발생하는 세계</h2><p class="dialog-story">주민은 자신만의 욕구, 성격, 관계, 기억을 가진 존재입니다. 세계의 기본 법칙과 그들의 선택이 만나 마을의 이야기를 만듭니다.</p><p>한 틱은 10분입니다. 생존과 이동, 생산과 관계는 시드 기반 엔진이 처리합니다. AI는 중요한 사건에서만 목표와 해석을 제안하며, 자원이나 관계 수치를 바꿀 수 없습니다.</p><p>여러 도시의 가족·세대·생산·생태·공동결정을 관찰합니다. 도시 연대기와 가계도에서 실제 사건을 따라갈 수 있으며, 모델 없이도 세계와 역사 조회가 동작합니다.</p><button id="export-report" class="button">관측 통계 JSON 내보내기</button>`);
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
window.addEventListener('pagehide', () => { if (sim.tick !== lastSaveTick) localSave(); });
setInterval(() => { if (sim.tick !== lastSaveTick) localSave(); }, 30000);
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
  const n = selectedNPC(), key = `${cloud?.world?.epoch}:${n.id}`;
  if (key !== lifeKey) { lifeKey = key; lifeEvents = []; lifeNext = null; void loadCloudLife(); }
  $('npc-detail').innerHTML = `${familyView(state, n)}<div class="section-label">삶의 기록 <span>서버 기록</span></div><p class="inspector-footnote">현재 재산 ${n.wealth}코인 · 식량 ${n.inventory.food}개</p>${lifeEvents.length ? lifeEvents.map(eventLink).join('') : '<p class="empty-state">생애 기록을 확인하고 있습니다.</p>'}${lifeNext !== null ? '<button class="more-button" id="more-life">이전 생애 기록 더 보기</button>' : ''}`;
}
async function loadCloudLife(more = false) {
  if (!cloud?.world) return;
  const key = lifeKey, request = ++lifeRequest;
  const params = new URLSearchParams({ epoch: cloud.world.epoch, npc: selectedId, filter: 'life' });
  if (more && lifeNext !== null) params.set('before', String(lifeNext));
  try {
    const result = await cloud.get<EventPage>(`events?${params}`);
    if (request !== lifeRequest || key !== lifeKey || result.epoch !== cloud.world.epoch) return;
    lifeEvents = (more ? [...lifeEvents, ...result.events] : result.events).slice(-400); lifeNext = result.next;
    if (tab === 'life') { renderCloudLife(); if (!lifeEvents.length) $('npc-detail').innerHTML = '<p class="empty-state">아직 기록된 생애 사건이 없습니다.</p>'; }
  } catch (e) { cloudFailure(e); }
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
    chromeRunner!.setWorld(world.epoch, world.meta.aiGeneration ?? 'legacy', world.meta.aiMode === 'chrome');
    state = world.state; playing = world.meta.running; speed = world.meta.speed;
    cloudReady = true; disable(false);
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
    if (newEvents && lifeEvents.length <= 40 && tab === 'life') lifeKey = '';
    if (changed) { lifeKey = ''; map.reset(); }
    $('save-status').textContent = `${dayOf(state.tick)}일째 ${timeLabel(state.tick)} · 서버에 저장됨`;
    render();
    const remaining = world.meta.pendingTicks ?? 0;
    $<HTMLButtonElement>('advance-day').disabled = remaining > 0;
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
    const intercept = ['more-events', 'more-life', 'save-button', 'load-button', 'load-local', 'load-backup', 'export-observations', 'export-report'];
    if (!intercept.includes(button.id)) return;
    event.stopImmediatePropagation();
    if (button.id === 'more-events') void loadJournal(true);
    if (button.id === 'more-life') void loadCloudLife(true);
    if (button.id === 'save-button') { const a = document.createElement('a'); a.href = '/api/export-stream'; a.download = ''; a.click(); }
    if (button.id === 'export-report') void cloudDownload('report', 'living-small-world-report.json');
    if (button.id === 'export-observations') void cloudDownload('observations', 'living-small-world-observations.json');
    if (button.id === 'load-button') openDialog(`<div class="eyebrow">CONTINUE A WORLD</div><h2>서버에 이어지는 작은 세계</h2><p>서버 세계는 같은 계정의 모든 기기에 반영됩니다. 교체 전 세계는 서버 백업으로 보관합니다.</p><div class="load-options"><button id="load-local" class="button">이 기기의 저장을 서버로 가져오기</button><button id="load-backup" class="button">서버의 교체 전 백업 복원</button><button id="load-file" class="button">JSON 파일에서 불러오기</button></div><p class="muted">서버 가져오기: 10MB 이하, 생존 주민 3,000명까지. 더 큰 파일은 기기 세계에서 열 수 있습니다.</p>`);
    if (button.id === 'load-local') { try { const save = localStorage.getItem(STORAGE_KEY); if (!save) throw new Error('이 기기에 저장된 세계가 없습니다.'); void cloud!.send({ type: 'import', save }).then(() => { $<HTMLDialogElement>('detail-dialog').close(); toast('기기의 저장을 서버 세계로 가져왔습니다.'); }).catch(cloudFailure); } catch (e) { cloudFailure(e); } }
    if (button.id === 'load-backup') void cloud!.get<WorldState>('export?backup=1').then(save => cloud!.send({ type: 'import', save: JSON.stringify(save) })).then(() => { $<HTMLDialogElement>('detail-dialog').close(); toast('서버 백업을 복원했습니다.'); }).catch(cloudFailure);
  }, true);
  $('seed-form').onsubmit = event => { event.preventDefault(); if (cloudReady) cloudCommand({ type: 'reset', seed: Number($<HTMLInputElement>('seed-input').value), population: Number($<HTMLInputElement>('population-input').value) }); };
  $('ai-mode').onchange = () => { void cloud!.send({ type: 'ai-mode', mode: $<HTMLSelectElement>('ai-mode').value as 'off' | 'mock' | 'remote' }).then(refreshAI).catch(e => { renderAI(); cloudFailure(e); }); };
  $('llm-toggle').onchange = () => cloudCommand({ type: 'llm', enabled: $<HTMLInputElement>('llm-toggle').checked });
  $('offline-toggle').onchange = () => cloudCommand({ type: 'offline', enabled: $<HTMLInputElement>('offline-toggle').checked });
  $('file-input').onchange = async () => {
    const input = $<HTMLInputElement>('file-input'), file = input.files?.[0]; if (!file) return;
    try { if (file.size > 10_000_000) throw new Error('서버 가져오기는 10MB까지 지원합니다.'); await cloud!.send({ type: 'import', save: await file.text() }); $<HTMLDialogElement>('detail-dialog').close(); toast('저장된 세계를 서버로 가져왔습니다.'); }
    catch (e) { cloudFailure(e); } finally { input.value = ''; }
  };
}
for (const id of ['event-from', 'event-to']) $(id).oninput = () => { eventLimit = 40; renderEvents(); };
if (cloudMode) startCloud();

async function focusVillage(focus: string, detail = state.civilization.detail) {
  try {
    if (cloudMode) await cloud!.send({ type: 'detail', focus, detail });
    else { sim.setDetail(focus, detail); render(); localSave(); }
  } catch (e) { toast((e as Error).message); }
}
document.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-village]');
  if (button) { map.setMode('city'); $<HTMLSelectElement>('map-mode').value = 'city'; void focusVillage(button.dataset.village!); }
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
  if (target.id === 'urban-district') { map.setMode('city'); $<HTMLSelectElement>('map-mode').value = 'city'; setDistrict(target.value); map.setDistrict(target.value); render(); }
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


function renderCharacterWatch() {
  const n = selectedNPC(), a = n.currentAction, target = state.npcs.find(p => p.id === a?.targetId?.replace('peer:', ''));
  const recent = state.events.filter(e => e.participants.includes(n.id) && ['talk','share','trade','loan','repayment','family','theft','relationship'].includes(e.kind)).slice(-3).reverse();
  $('map-scope').textContent = map.viewMode === 'region' ? `${state.civilization.settlements.length}개 정착지 · ${state.width}×${state.height}칸` : map.viewMode === 'follow' ? `${n.identity.name} · (${n.position.x}, ${n.position.y})` : '32×24칸 · 구역 확대 가능';
  $('character-watch').innerHTML = `<div class="watch-heading">${portrait(appearance(n))}<div><b>${esc(n.identity.name)}${n.profile ? ' · 내가 만든 주민' : ''}</b><p>${actionText(n)}${target ? ` · 상대 <button class="text-button" data-npc="${esc(target.id)}">${esc(target.identity.name)}</button>` : ''}</p></div><button class="button" data-tab="relationships">관계 살펴보기</button></div><p>${esc(n.decision.reason)}</p><div class="watch-events">${recent.length ? recent.map(e => `<button class="evidence-link" data-event="${esc(e.id)}">${esc(e.description)}</button>`).join('') : '<span class="muted">재생하면 이웃과의 실제 만남과 행동을 관찰할 수 있습니다. 관계·기억 탭과 선택 주민 기록에서 이전 사건도 확인하세요.</span>'}</div>`;
}
$('create-character').onclick = () => {
  if (creatingCharacter) { toast('주민의 입주를 저장하고 있습니다.'); return; }
  if (cloudMode && !cloudReady) { toast('서버 연결을 먼저 확인해 주세요.'); return; }
  openDialog(characterForm(state));
};
$('map-mode').onchange = () => { map.setMode($<HTMLSelectElement>('map-mode').value as 'city' | 'region' | 'follow'); render(); };
$('follow-character').onclick = () => { map.setMode('follow'); $<HTMLSelectElement>('map-mode').value = 'follow'; render(); };
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
  const a = { skin: String(data.get('skin')), hair: String(data.get('hair')), outfit: String(data.get('outfit')), hairstyle: data.get('hairstyle'), accessory: data.get('accessory') } as ReturnType<typeof appearance>;
  $('character-preview').innerHTML = portrait(a);
  const defaults = defaultCharmInputs(form);
  $('character-charms').innerHTML = charmPreview(defaults.personality, defaults.traits);
});
document.addEventListener('change', event => {
  const target = event.target as HTMLSelectElement;
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
