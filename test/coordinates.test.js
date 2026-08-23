import assert from 'node:assert/strict';
import test from 'node:test';

import { gridToWorld, screenToGrid, screenToWorld, worldToGrid } from '../src/core/coordinates.js';

test('화면 좌표를 카메라 기준 월드 좌표로 변환한다', () => {
  const worldPoint = screenToWorld({ x: 130, y: 90 }, { x: 10, y: 20, scale: 2 });

  assert.deepEqual(worldPoint, { x: 60, y: 35 });
});

test('월드 좌표를 포함하는 그리드 타일로 변환한다', () => {
  assert.deepEqual(worldToGrid({ x: 71.9, y: 48 }, 24), { col: 2, row: 2 });
  assert.deepEqual(worldToGrid({ x: -0.1, y: 0 }, 24), { col: -1, row: 0 });
});

test('그리드와 월드 좌표를 타일 크기에 따라 변환한다', () => {
  assert.deepEqual(gridToWorld({ col: 3, row: 4 }, 24), { x: 72, y: 96 });
  assert.deepEqual(screenToGrid({ x: 154, y: 146 }, { x: 10, y: 2, scale: 2 }, 24), { col: 3, row: 3 });
});

test('유효하지 않은 좌표와 크기를 거부한다', () => {
  assert.throws(() => screenToWorld({ x: 0, y: 0 }, { x: 0, y: 0, scale: 0 }));
  assert.throws(() => worldToGrid({ x: Number.NaN, y: 0 }, 24));
  assert.throws(() => gridToWorld({ col: 1.5, row: 0 }, 24));
});
