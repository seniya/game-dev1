import assert from 'node:assert/strict';
import test from 'node:test';

import { GridMap } from '../src/core/GridMap.js';

test('유효한 크기의 그리드 맵을 만든다', () => {
  const gridMap = new GridMap({ width: 20, height: 20 });

  assert.equal(gridMap.width, 20);
  assert.equal(gridMap.height, 20);
});

test('양의 정수가 아닌 그리드 크기를 거부한다', () => {
  assert.throws(() => new GridMap({ width: 0, height: 20 }));
  assert.throws(() => new GridMap({ width: 20, height: 1.5 }));
});
