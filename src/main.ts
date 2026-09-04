import { gridToWorld } from './core/coordinates';
import { clockLabel, phaseLabel } from './core/daycycle';
import { DEFAULT_STEP_MS } from './core/fixedTimestep';
import { pickSurfaceTile } from './core/picking';
import { generateTerrain } from './core/terrainGen';
import { BlockType } from './core/blocks';
import { itemColor, itemLabel } from './core/items';
import { mapLabel } from './core/maps';
import { zoneAt, zoneLabel } from './core/zones';
import { VILLAGE_MAP_HEIGHT, VILLAGE_MAP_WIDTH } from './core/worldConfig';
import { ResourceField } from './sim/ResourceField';
import { CanvasRenderer } from './render/CanvasRenderer';
import { Camera, boundsForMap } from './render/Camera';
import { WorldRenderer, type ZoneOverlay } from './render/WorldRenderer';
import { createSpriteSet } from './render/sprites';
import { GameLoop } from './sim/GameLoop';
import { GameState } from './sim/GameState';
import { Game } from './sim/Game';
import { AudioPlayer, VOLUME_STEPS } from './audio/AudioPlayer';
import { SoundId } from './audio/sounds';
import { Effects } from './render/Effects';
import { SaveSession } from './sim/SaveSession';
import { SettingsStore } from './sim/SettingsStore';
import { SaveStore } from './sim/SaveStore';
import { BuildPanel } from './ui/BuildPanel';
import { DebugOverlay } from './ui/DebugOverlay';
import { InventoryBar } from './ui/InventoryBar';
import { HelpPanel } from './ui/HelpPanel';
import { InputRouter } from './ui/InputRouter';
import { JournalPanel } from './ui/JournalPanel';
import { KeyboardControls } from './ui/KeyboardControls';
import { PointerControls } from './ui/PointerControls';
import { describeFailure } from './ui/messages';
import { RequestList } from './ui/RequestList';
import { SaveMenu } from './ui/SaveMenu';
import { Toasts } from './ui/Toasts';
import { VillageHud } from './ui/VillageHud';

/** 맵 크기(타일). */
/** 지형 생성 시드. 고정해 두면 실행마다 같은 맵이 나와 확인이 쉽다. */
const TERRAIN_SEED = 20260901;

/** 시작 확대율. */
const INITIAL_ZOOM = 1.15;

/**
 * 카메라가 한 스텝에 플레이어 쪽으로 좁히는 거리 비율.
 * 값이 크면 딱딱하게 따라붙고, 작으면 뒤늦게 끌려온다.
 */
const CAMERA_FOLLOW_FACTOR = 0.12;

/** 자동 저장 간격(게임 시간, ms). */
const AUTOSAVE_INTERVAL_MS = 30_000;

/**
 * 필수 DOM 엘리먼트를 찾아온다. 없으면 조용히 넘기지 않고 즉시 실패시킨다 —
 * index.html과 코드가 어긋난 상태로 빈 화면을 보는 것이 더 찾기 어렵다.
 *
 * @param id 찾을 엘리먼트 id.
 * @returns 해당 엘리먼트.
 * @throws 엘리먼트가 없으면 예외를 던진다.
 */
function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`#${id} 엘리먼트를 찾을 수 없다.`);
  }
  return element as T;
}

/** 게임을 초기화하고 루프를 시작한다. */
function bootstrap(): void {
  const canvas = requireElement<HTMLCanvasElement>('game');
  const surface = new CanvasRenderer(canvas);
  const overlay = new DebugOverlay(
    requireElement('fps'),
    requireElement('info'),
    requireElement('stash'),
  );
  const state = new GameState();

  const store = new SaveStore();

  // 저장이 있으면 이어서 시작한다. 손상된 저장은 지우지 않고 새 게임으로 떨어진다 —
  // 사용자의 마을이 담긴 유일한 사본일 수 있다.
  const loaded = store.load();
  const restored = loaded.ok ? Game.fromSave(loaded.data) : null;
  const loadFailed = loaded.ok ? restored === null : loaded.reason === 'corrupt';

  const game = restored ?? createNewGame();
  const bar = new InventoryBar(requireElement('bar'), game.inventory.slotCount);
  const panel = new BuildPanel(requireElement('panel'));
  const saveMenu = new SaveMenu(requireElement('save'));
  const help = new HelpPanel(requireElement('help'));
  const journalPanel = new JournalPanel(requireElement('journal'));

  const settingsStore = new SettingsStore();
  const audio = new AudioPlayer();
  audio.setVolumeStep(settingsStore.load().volumeStep);

  const effects = new Effects();
  const toasts = new Toasts(requireElement('toasts'));
  const requestList = new RequestList(requireElement('requests'));
  const villageHud = new VillageHud(requireElement('village'));

  const camera = new Camera();
  camera.setViewport(surface.size.width, surface.size.height);
  camera.setZoom(INITIAL_ZOOM);
  // 맵 밖으로 한없이 나가면 검은 화면만 남고 되돌아올 단서가 없다.
  camera.setBounds(boundsForMap(game.terrain.width, game.terrain.height));
  const world = new WorldRenderer(surface.context, camera, game.terrain);
  // 스프라이트를 만들 수 없는 환경이면 null이 오고, 렌더러는 도형으로 그린다.
  world.setSprites(createSpriteSet());

  // 시작 시점에 플레이어가 화면 가운데 오도록 카메라를 맞춘다.
  const start = game.player.position;
  const startWorld = gridToWorld(start.x, start.y, 0);
  camera.lookAt(startWorld.x, startWorld.y);

  // 지형 높이를 아는 피커를 넘겨 언덕 윗면을 정확히 집어내게 한다.
  // 피킹은 "지금 있는 맵"의 지형을 본다. 맵이 바뀌면 이 함수가 곧바로 새 지형을 쓴다.
  const pointer = new PointerControls(canvas, camera, (worldX, worldY) =>
    pickSurfaceTile(game.terrain, worldX, worldY),
  );
  /**
   * 행동 결과를 보고 소리·연출·안내를 낸다.
   *
   * 규칙(`Game`)은 무슨 일이 있었는지 값으로만 돌려주고, 그것을 무엇으로 보여줄지는
   * 여기서 정한다.
   *
   * @param result 행동 결과.
   * @param target 행동 대상 칸. 연출 위치로 쓴다.
   */
  function report(result: ReturnType<typeof game.actAt>, target?: { x: number; y: number }): void {
    if (!result.ok) {
      const message = describeFailure(result.reason, result.placement);
      if (message) {
        toasts.show(message, 'bad');
        audio.play(SoundId.DENY);
      }
      return;
    }

    const spot = target ?? game.player.position;
    const z = Math.max(0, game.terrain.columnHeight(spot.x, spot.y) - 1);

    if (result.node !== undefined) {
      audio.play(result.node === 'tree' ? SoundId.CHOP : SoundId.DIG_STONE);
      effects.burst(spot.x, spot.y, z, result.node === 'tree' ? '#5c8f4f' : '#9aa1a9', 5);
      if (result.destroyed) audio.play(SoundId.NODE_BREAK);
    } else if (result.block !== undefined) {
      audio.play(result.block === BlockType.DIRT ? SoundId.DIG_DIRT : SoundId.DIG_STONE);
      effects.burst(spot.x, spot.y, z, result.block === BlockType.DIRT ? '#6b4b2f' : '#8b8f96', 4);
    }

    if (result.building !== undefined) audio.play(SoundId.BUILD_START);

    if (result.gained) {
      effects.float(
        spot.x,
        spot.y,
        z,
        `+${result.gained.amount} ${itemLabel(result.gained.item)}`,
        itemColor(result.gained.item),
      );
    }
  }

  /**
   * 알림 종류를 소리로 옮긴다.
   *
   * @param cue 알림 종류.
   * @returns 낼 소리. 소리를 내지 않을 종류면 null.
   */
  function soundForCue(cue: string | undefined): SoundId | null {
    switch (cue) {
      case 'migration':
        return SoundId.MIGRATION;
      case 'levelUp':
        return SoundId.LEVEL_UP;
      case 'buildDone':
        return SoundId.BUILD_DONE;
      case 'requestNew':
        return SoundId.REQUEST_NEW;
      case 'requestDone':
        return SoundId.REQUEST_DONE;
      case 'raid':
        return SoundId.RAID;
      case 'damage':
        return SoundId.DAMAGE;
      default:
        return null;
    }
  }

  pointer.setTileClickHandler((tile, button) => {
    // 브라우저는 사용자 입력이 있기 전에는 오디오를 켜 주지 않는다.
    audio.unlock();

    if (button !== 'primary') {
      const placed = game.placeAt(tile);
      if (placed.ok) audio.play(SoundId.PLACE);
      report(placed, tile);
      return;
    }

    // 건축 모드에서는 좌클릭이 배치 확정이다.
    report(game.buildMode ? game.buildAt(tile) : game.actAt(tile), tile);
  });
  pointer.attach();

  const keyboard = new KeyboardControls();

  /**
   * 카메라가 플레이어를 따라가는지 여부.
   *
   * 걷기 시작하면 켜고, 시야를 드래그하면 끈다. 이렇게 하면 주변을 둘러보는
   * 조작과 플레이어 추적이 서로 싸우지 않는다 — 둘러보다가 걸으면 다시 따라온다.
   */
  let followPlayer = true;

  /** 화면이 지금 그리고 있는 맵. 이 값이 실제 맵과 어긋나면 지형을 갈아 끼운다. */
  let shownMap = game.currentMap;

  // 키 입력을 게임 행동으로 옮기는 곳은 여기 하나다. 겨냥 커서도 여기 있다.
  const router = new InputRouter(game, keyboard, {
    unlock: () => audio.unlock(),
    report,
    toast: (message, tone) => toasts.show(message, tone),
    play: (sound) => audio.play(sound),
    burst: (x, y, color, count) => {
      effects.burst(x, y, Math.max(0, game.terrain.columnHeight(x, y) - 1), color, count);
    },
    // 키보드 줌은 화면 가운데를 고정한다. 마우스 휠과 달리 기준으로 삼을 커서가 없다.
    zoomBy: (factor) => camera.zoomAt(surface.size.width / 2, surface.size.height / 2, factor),
    follow: () => {
      followPlayer = true;
    },
  });
  router.bind();
  // 조작 안내 한 줄에 담지 못한 키들이 여기 모인다.
  keyboard.bind('KeyH', () => help.toggle());
  bar.setModeHandler(() => router.toggleBuildMode());
  // 마우스로도 끝까지 되게 한다(로드맵 05 Phase 1). 키보드 경로는 그대로 둔다.
  bar.setToolHandler(() => {
    audio.unlock();
    const player = game.player;
    player.selectTool((player.selectedSlot + 1) % player.slotCount);
  });
  panel.setSelectHandler((id) => {
    audio.unlock();
    game.selectBlueprint(id);
  });
  requestList.setFulfillHandler(() => {
    audio.unlock();
    if (game.fulfillRequest()) return;
    toasts.show('낼 수 있는 요청이 없습니다', 'bad');
    audio.play(SoundId.DENY);
  });
  keyboard.attach();

  /** 조작 안내를 담는 엘리먼트와 마지막으로 그린 문구. */
  const hintElement = requireElement('hint');
  let lastControlHint = '';

  const session = new SaveSession(store, {
    intervalMs: AUTOSAVE_INTERVAL_MS,
    lastSavedAt: loaded.ok ? loaded.data.savedAt : null,
  });

  /**
   * 지금 상태를 저장하고 결과를 알린다.
   *
   * @param announce 결과를 토스트로 알릴지 여부. 자동 저장은 조용히 지나간다.
   */
  function saveNow(announce: boolean): void {
    const result = session.save(() => game.toSave());

    if (result.ok) {
      if (announce) toasts.show('저장했습니다', 'good');
      return;
    }

    if (announce) {
      toasts.show(
        result.reason === 'quota' ? '저장 공간이 부족합니다' : '브라우저 저장소를 쓸 수 없습니다',
        'bad',
      );
    }
  }

  // 소리 켜고 끄기. 로드맵 03에서 입력 연결을 InputRouter로 옮기며 이 줄이 함께
  // 지워졌고, 그때부터 소리 버튼이 아무 일도 하지 않고 있었다 — 화면에서 잡지 못한
  // 종류의 결함이라 기록해 둔다.
  saveMenu.setVolumeHandler(() => {
    audio.unlock();
    audio.cycleVolume();
    settingsStore.save({ volumeStep: audio.volumeStep });
  });

  // 기록은 브라우저 밖으로 저절로 나가지 않는다. 사람이 눌러 복사할 때만 나간다.
  saveMenu.setJournalHandler(() => {
    const text = game.journal.summary;
    // 화면에 먼저 띄운다. 클립보드가 막혀도 눈으로 읽고 직접 고를 수 있어야 한다.
    journalPanel.show(text);

    const clipboard = navigator.clipboard;
    if (!clipboard?.writeText) {
      toasts.show('기록을 화면에 띄웠습니다 — 직접 선택해 복사하세요', 'neutral');
      return;
    }

    clipboard.writeText(text).then(
      () => toasts.show('플레이 기록을 복사했습니다', 'good'),
      () => toasts.show('기록을 화면에 띄웠습니다 — 직접 선택해 복사하세요', 'neutral'),
    );
  });

  saveMenu.setHandlers({
    save: () => saveNow(true),
    // 되돌리기와 새로 시작은 세계를 통째로 다시 만드는 일이라 페이지를 다시 연다.
    // 부분 재조립보다 확실하고, 저장에서 시작하는 경로를 한 곳으로 모은다.
    //
    // 다시 열기 전에 저장을 멈추는 것이 중요하다. 그러지 않으면 탭이 닫히며 현재 상태가
    // 한 번 더 저장돼, 방금 지우거나 되돌린 것이 즉시 취소된다.
    load: () => {
      if (!store.hasSave) {
        toasts.show('되돌릴 저장이 없습니다', 'bad');
        return;
      }
      session.suspend();
      location.reload();
    },
    reset: () => {
      session.suspend();
      store.clear();
      location.reload();
    },
  });

  if (loadFailed) toasts.show('저장을 읽을 수 없어 새로 시작합니다', 'bad');
  else if (restored) toasts.show('이어서 시작합니다', 'good');

  // 탭을 닫거나 가릴 때 마지막 상태를 남긴다. 새로고침으로 잃는 일이 없어야 한다.
  window.addEventListener('pagehide', () => saveNow(false));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveNow(false);
  });

  /**
   * 지형에 얹을 표시를 만든다.
   *
   * 건축 모드에서만 놓을 수 있는 자리를 함께 넘긴다. 매 프레임 다시 세지만 반경이
   * 좁아(플레이어 주변 여덟 칸) 값이 싸다.
   *
   * @returns 렌더러에 넘길 표시.
   */
  function buildOverlay(): ZoneOverlay {
    const locked = (x: number, y: number): boolean => game.isZoneLocked(x, y);
    if (!game.buildMode) return { locked };

    const spots = game.buildableSpots();
    const width = game.terrain.width;

    return { locked, buildable: (x, y) => spots.has(y * width + x) };
  }

  const loop = new GameLoop(
    {
      update: (stepMs) => {
        state.step(stepMs);

        // 마우스가 가리키는 칸을 커서에 알린다. 마우스가 움직였을 때만 겨냥을
        // 가져가므로, 마우스를 책상에 둔 채 키보드로 플레이할 수 있다.
        router.setPointerTile(pointer.hovered);

        // 걷기·겨냥·연속 채집은 키 이벤트가 아니라 눌린 상태를 보고 고정 간격으로 처리한다.
        router.update(stepMs, pointer.heldTile);

        // 맵이 바뀌었으면 렌더러와 카메라가 새 지형을 따라간다.
        if (game.currentMap !== shownMap) {
          shownMap = game.currentMap;
          world.setTerrain(game.terrain);
          camera.setBounds(boundsForMap(game.terrain.width, game.terrain.height));
          const arrival = gridToWorld(game.player.position.x, game.player.position.y, 0);
          camera.lookAt(arrival.x, arrival.y);
        }

        game.update(stepMs);
        toasts.update(stepMs);
        effects.update(stepMs);
        audio.update(stepMs);

        session.tick(stepMs, () => game.toSave());

        for (const notice of game.drainNotices()) {
          toasts.show(notice.message, notice.tone);
          const sound = soundForCue(notice.cue);
          if (sound) audio.play(sound);
        }

        // 드래그로 시야를 옮기는 동안에는 추적을 멈춘다.
        if (pointer.dragging) followPlayer = false;

        if (followPlayer) {
          const pose = game.player.pose(game.terrain);
          const target = gridToWorld(pose.x, pose.y, pose.z);
          camera.moveToward(target.x, target.y, CAMERA_FOLLOW_FACTOR);
        }
      },
      render: (_alpha, frameTimeMs) => {
        const size = surface.beginFrame();
        camera.setViewport(size.width, size.height);

        // 화면에 강조할 칸은 마우스가 아니라 커서가 정한다 — 키보드로 겨냥한
        // 칸도 똑같이 보여야 무엇에 대고 행동하는지 알 수 있다.
        const hovered = router.target;
        // 건축 먼지처럼 시간에 따라 움직이는 연출을 위해 시뮬레이션 시각을 넘긴다.
        // 어디가 왜 어두운지는 규칙이 정한다. 렌더러는 색조와 빛의 중심만 받는다.
        const stats = world.render(
          hovered,
          game.entities(),
          game.ghost(hovered),
          state.elapsedMs,
          buildOverlay(),
          game.atmosphere(),
        );
        // 파편과 글자는 지형·오브젝트를 모두 그린 뒤에 얹는다.
        effects.draw(surface.context, camera);

        overlay.update(
          frameTimeMs,
          {
            hovered,
            hoveredHeight: hovered ? game.terrain.columnHeight(hovered.x, hovered.y) : 0,
            hoveredSurface: hovered
              ? game.terrain.surfaceBlock(hovered.x, hovered.y)
              : BlockType.EMPTY,
            drawnColumns: stats.drawnColumns,
            drawnWalls: stats.drawnWalls,
            zoom: camera.zoom,
            playerTile: game.player.position,
            tool: game.player.tool,
            // 구역은 지상의 개념이다. 동굴에서는 맵 이름을 보여준다.
            place: game.inVillage
              ? zoneLabel(zoneAt(game.terrain, hovered?.x ?? 0, hovered?.y ?? 0))
              : mapLabel(game.currentMap),
            target: hovered ? game.describeTile(hovered) : null,
          },
          game.inventory,
        );

        const guidanceState = game.guidanceState();

        villageHud.update({
          level: game.villageLevel,
          goalLevel: game.goalLevel,
          score: game.villageScore,
          nextScore: game.nextLevelScore,
          progress: game.levelProgress,
          residents: game.population.count,
          buildings: game.buildings.completedCount,
          damaged: game.buildings.damagedCount,
          objective: game.guidance.objective(guidanceState),
          day: game.dayCount,
          clock: clockLabel(game.timeOfDay),
          phase: phaseLabel(game.dayPhase),
          jobsAssigned: game.jobSlots.assigned,
          jobsTotal: game.jobSlots.total,
        });

        // 조작 안내는 상황에 맞는 것만 보여준다. 모든 키를 늘 늘어놓으면 지금 쓸 키가 묻힌다.
        const controls = game.guidance.controls(guidanceState);
        if (controls !== lastControlHint) {
          lastControlHint = controls;
          hintElement.textContent = controls;
        }

        requestList.update(
          game.requests.requests.map((request) => ({
            request,
            payable: game.canFulfill(request),
          })),
        );

        panel.update(
          game.availableBlueprints.map((blueprint) => ({
            blueprint,
            missing: game.missingMaterials(blueprint),
            selected: game.blueprint?.id === blueprint.id,
          })),
          game.buildMode,
        );

        saveMenu.update(
          { ...session.status, volumeStep: audio.volumeStep, volumeSteps: VOLUME_STEPS.length },
          frameTimeMs,
        );

        bar.update({
          inventory: game.inventory,
          storage: game.storage,
          nearStorage: game.nearStorage,
          tool: game.player.tool,
          toolSlot: game.player.selectedSlot,
          toolCount: game.player.slotCount,
          buildMode: game.buildMode,
        });
      },
    },
    { stepMs: DEFAULT_STEP_MS },
  );

  // 개발 모드에서만 게임 상태를 창에 노출한다.
  //
  // 밤·침입·손상처럼 **한참 키워야 나오는 화면**을 확인하려면 상태를 직접 옮길 수 있어야
  // 한다. 프로덕션 빌드에서는 `import.meta.env.DEV`가 false로 치환돼 이 블록이 사라진다.
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__town = {
      game,
      camera,
      world,
      effects,
      toasts,
      router,
      help,
    };
  }

  loop.start();
}

/**
 * 새 게임을 만든다. 저장이 없거나 읽을 수 없을 때 쓴다.
 *
 * @returns 새 게임.
 */
function createNewGame(): Game {
  const terrain = generateTerrain(VILLAGE_MAP_WIDTH, VILLAGE_MAP_HEIGHT, { seed: TERRAIN_SEED });
  const resources = new ResourceField(terrain, { seed: TERRAIN_SEED });
  const game = new Game(terrain, resources);
  game.setWorldSeed(TERRAIN_SEED);

  return game;
}

bootstrap();
