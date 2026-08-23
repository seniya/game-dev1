export class GridMap {
  constructor({ width, height }) {
    if (!Number.isInteger(width) || width <= 0) {
      throw new Error('GridMap 너비는 양의 정수여야 합니다.');
    }

    if (!Number.isInteger(height) || height <= 0) {
      throw new Error('GridMap 높이는 양의 정수여야 합니다.');
    }

    this.width = width;
    this.height = height;
  }
}
