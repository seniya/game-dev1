import { defineConfig } from 'vitest/config';

/**
 * GitHub Pages에서 게임이 놓이는 경로.
 *
 * 프로젝트 페이지는 `https://<사용자>.github.io/<저장소>/` 아래에 놓이므로 저장소
 * 이름이 경로에 들어간다. 기본값(`/`)으로 빌드하면 자산을 루트에서 찾다가 404가 난다.
 */
const PAGES_BASE = '/game-dev1/';

/**
 * Vite + Vitest 설정.
 *
 * 개발 서버는 루트에서 돌리고 빌드만 Pages 경로를 쓴다 — 로컬에서 `/game-dev1/`을
 * 붙여 들어가야 하는 불편을 만들지 않기 위해서다. 테스트는 순수 로직만 다루므로
 * DOM 환경 없이 node 환경에서 돌린다(필요해지는 Phase에서 jsdom을 켠다).
 */
export default defineConfig(({ command }) => ({
  base: command === 'build' ? PAGES_BASE : '/',
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    /*
     * 통과 플레이는 마을 레벨 20까지 시뮬레이션을 돌리므로 기본 5초로는 모자란다.
     * 이 테스트가 밸런스의 유일한 측정 수단이라 시간을 주고 돌린다.
     */
    testTimeout: 60_000,
  },
}));
