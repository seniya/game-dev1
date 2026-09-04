import { describe, expect, it } from 'vitest';
import { VILLAGE_MAP_HEIGHT, VILLAGE_MAP_WIDTH } from '../src/core/worldConfig';

describe('신규 마을 지도 규모', () => {
  it('건축과 탐험 여유를 위해 이전 32칸보다 넓은 48×48이다', () => {
    expect(VILLAGE_MAP_WIDTH).toBe(48);
    expect(VILLAGE_MAP_HEIGHT).toBe(48);
  });
});
