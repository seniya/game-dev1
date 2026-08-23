export class CanvasRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
  }

  render(gameState) {
    const { context, canvas } = this;
    const { gridMap } = gameState;

    context.fillStyle = '#18352e';
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = '#f3f0df';
    context.font = '600 28px system-ui, sans-serif';
    context.fillText('Project MicroVillage', 40, 64);

    context.fillStyle = '#a9c9a8';
    context.font = '16px system-ui, sans-serif';
    context.fillText(`${gridMap.width} × ${gridMap.height} 타일 맵 준비 중`, 40, 96);

    context.strokeStyle = 'rgba(225, 239, 217, 0.16)';
    context.lineWidth = 1;
    const cellSize = 24;
    const startX = 40;
    const startY = 132;

    for (let column = 0; column <= gridMap.width; column += 1) {
      const x = startX + column * cellSize;
      context.beginPath();
      context.moveTo(x, startY);
      context.lineTo(x, startY + gridMap.height * cellSize);
      context.stroke();
    }

    for (let row = 0; row <= gridMap.height; row += 1) {
      const y = startY + row * cellSize;
      context.beginPath();
      context.moveTo(startX, y);
      context.lineTo(startX + gridMap.width * cellSize, y);
      context.stroke();
    }
  }
}
