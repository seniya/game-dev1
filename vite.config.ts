import { defineConfig } from 'vitest/config';

/**
 * Vite + Vitest 설정.
 * 개발 서버와 프로덕션 빌드는 기본값을 쓰고, 테스트는 순수 로직만 다루므로
 * DOM 환경 없이 node 환경에서 돌린다(필요해지는 Phase에서 jsdom을 켠다).
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
