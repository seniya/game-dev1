function assertFinitePoint(point, label) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error(`${label} 좌표는 유한한 숫자여야 합니다.`);
  }
}

function assertPositiveNumber(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label}은(는) 0보다 큰 숫자여야 합니다.`);
  }
}

export function screenToWorld(screenPoint, camera) {
  assertFinitePoint(screenPoint, '화면');
  assertFinitePoint(camera, '카메라');
  assertPositiveNumber(camera.scale, '카메라 배율');

  return {
    x: (screenPoint.x - camera.x) / camera.scale,
    y: (screenPoint.y - camera.y) / camera.scale,
  };
}

export function worldToGrid(worldPoint, tileSize) {
  assertFinitePoint(worldPoint, '월드');
  assertPositiveNumber(tileSize, '타일 크기');

  return {
    col: Math.floor(worldPoint.x / tileSize),
    row: Math.floor(worldPoint.y / tileSize),
  };
}

export function gridToWorld(gridPoint, tileSize) {
  if (!Number.isInteger(gridPoint.col) || !Number.isInteger(gridPoint.row)) {
    throw new Error('그리드 좌표는 정수여야 합니다.');
  }

  assertPositiveNumber(tileSize, '타일 크기');

  return {
    x: gridPoint.col * tileSize,
    y: gridPoint.row * tileSize,
  };
}

export function screenToGrid(screenPoint, camera, tileSize) {
  return worldToGrid(screenToWorld(screenPoint, camera), tileSize);
}
