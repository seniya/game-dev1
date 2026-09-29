import { type WorldState, type NPC, type Position } from '../sim/types';

const COLORS = ['#e5a85f', '#d98175', '#76b4a3', '#a893c4', '#739eb7', '#d1b154', '#91a767', '#c6859f', '#71918d', '#b19a83', '#bb8b57', '#95a2c7'];
export const npcColor = (n: NPC) => COLORS[Number(n.id.replace('npc', '')) % COLORS.length] ?? COLORS[0];
const noise = (x: number, y: number, seed: number) => { const v = Math.sin(x * 127.1 + y * 311.7 + seed) * 43758.5453; return v - Math.floor(v); };

export class WorldMap {
  private terrain: HTMLCanvasElement = document.createElement('canvas');
  private world?: WorldState;
  private selected = 'npc0';
  private grid = false;
  private onSelect: (id: string) => void;
  private cell = 30;
  constructor(private canvas: HTMLCanvasElement, onSelect: (id: string) => void) {
    this.onSelect = onSelect;
    canvas.addEventListener('click', event => {
      if (!this.world) return;
      const rect = canvas.getBoundingClientRect(), x = (event.clientX - rect.left) / rect.width * this.world.width, y = (event.clientY - rect.top) / rect.height * this.world.height;
      const nearest = this.world.npcs.filter(n => n.alive).map(n => ({ n, d: Math.hypot(n.position.x + .5 - x, n.position.y + .5 - y) })).sort((a, b) => a.d - b.d)[0];
      if (nearest && nearest.d < 1.7) this.onSelect(nearest.n.id);
    });
  }
  setGrid(value: boolean) { this.grid = value; this.draw(); }
  update(world: WorldState, selected: string) {
    if (!this.world || this.world.seed !== world.seed || this.world.width !== world.width || this.world.height !== world.height) this.buildTerrain(world);
    this.world = world; this.selected = selected; this.draw();
  }
  reset() { this.world = undefined; }
  private buildTerrain(w: WorldState) {
    const c = this.cell; this.canvas.width = this.terrain.width = w.width * c; this.canvas.height = this.terrain.height = w.height * c;
    const ctx = this.terrain.getContext('2d')!;
    for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) {
      const t = w.tiles[y * w.width + x], v = noise(x, y, w.seed);
      ctx.fillStyle = t === 'water' ? ['#8bb7b9', '#87b2b4', '#8bb4b3'][Math.floor(v * 3)] : t === 'path' ? '#d7c4a1' : t === 'farm' ? '#ae9972' : t === 'forest' ? '#94a87b' : t === 'rock' ? '#a7aaa0' : ['#bcc29a', '#b7c098', '#b4bd93', '#bac299'][Math.floor(v * 4)];
      ctx.fillRect(x * c, y * c, c, c);
      if (t === 'water') {
        ctx.fillStyle = '#b5d1c9'; ctx.fillRect(x * c + 5 + v * 7, y * c + 13, 10, 2);
      } else if (t === 'farm') {
        ctx.fillStyle = '#7f7755'; for (let i = 0; i < 3; i++) ctx.fillRect(x * c + 3, y * c + i * 9 + 5, 25, 3);
        ctx.fillStyle = '#90975e'; for (let i = 0; i < 3; i++) ctx.fillRect(x * c + 5 + i * 9, y * c + 3, 3, 22);
      } else if (t === 'grass' || t === 'forest') {
        ctx.fillStyle = v > .75 ? '#dce0b7' : '#9fab81';
        ctx.fillRect(x * c + 7 + v * 9, y * c + 12, 2, 4); ctx.fillRect(x * c + 10 + v * 9, y * c + 10, 2, 5);
        if (v > .92) { ctx.fillStyle = '#eee5c4'; ctx.fillRect(x * c + 21, y * c + 20, 3, 3); }
      } else if (t === 'path') {
        ctx.fillStyle = '#c6b18f'; ctx.fillRect(x * c + v * 23, y * c + 7, 3, 2);
        if (x >= 25) { ctx.fillStyle = '#a48b67'; ctx.fillRect(x * c, y * c + 2, c, 3); ctx.fillRect(x * c + 2, y * c, 2, c); }
      }
    }
    // Outlying trees frame the village, while actual resource nodes are drawn separately.
    for (const [x, y] of [[1, 1], [8, 2], [3, 14], [1, 19], [23, 20], [24, 2], [30, 20], [29, 16], [17, 21], [9, 22], [22, 2]]) this.tree(ctx, x * c, y * c, .85);
    ctx.strokeStyle = '#847e5a'; ctx.lineWidth = 3;
    ctx.strokeRect(18.7 * c, 4.7 * c, 5.7 * c, 5.1 * c);
    for (let x = 19; x < 25; x++) { ctx.fillStyle = '#eee0b9'; ctx.fillRect(x * c, 4.6 * c, 4, 10); ctx.fillRect(x * c, 9.6 * c, 4, 10); }
  }
  private tree(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
    ctx.save(); ctx.translate(x + 15, y + 13); ctx.scale(scale, scale);
    ctx.fillStyle = '#45594230'; ctx.beginPath(); ctx.ellipse(5, 14, 19, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#887356'; ctx.fillRect(-3, -3, 7, 20);
    ctx.fillStyle = '#557c62'; ctx.beginPath(); ctx.arc(-7, -8, 13, 0, Math.PI * 2); ctx.arc(8, -9, 13, 0, Math.PI * 2); ctx.arc(0, -21, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6e9370'; ctx.beginPath(); ctx.arc(-4, -22, 10, 0, Math.PI * 2); ctx.arc(-10, -11, 8, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  private label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, dark = false) {
    ctx.font = '500 11px sans-serif'; const width = ctx.measureText(text).width + 14;
    ctx.fillStyle = dark ? '#31483d' : '#fffdf0dd'; ctx.beginPath(); ctx.roundRect(x - width / 2, y - 10, width, 19, 5); ctx.fill();
    ctx.fillStyle = dark ? '#fff8e8' : '#445548'; ctx.textAlign = 'center'; ctx.fillText(text, x, y + 3);
  }
  private draw() {
    const w = this.world; if (!w) return;
    const ctx = this.canvas.getContext('2d')!, c = this.cell;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); ctx.drawImage(this.terrain, 0, 0);
    for (const r of w.resources) {
      const x = r.position.x * c, y = r.position.y * c;
      if (r.kind === 'wood') this.tree(ctx, x, y, r.amount > 0 ? 1 : .35);
      else {
        ctx.fillStyle = r.amount > 0 ? '#7b9668' : '#99a57f'; ctx.beginPath(); ctx.ellipse(x + 15, y + 15, 13, 9, 0, 0, Math.PI * 2); ctx.fill();
        if (r.amount > 0) { ctx.fillStyle = '#bf7866'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + 8 + i * 6, y + 12 + i % 2 * 4, 2.5, 0, Math.PI * 2); ctx.fill(); } }
      }
    }
    for (const b of w.buildings) {
      const x = b.position.x * c + c / 2, y = b.position.y * c + c / 2;
      if (b.kind === 'farm') continue;
      ctx.fillStyle = '#4c594530'; ctx.beginPath(); ctx.ellipse(x + 8, y + 9, 31, 12, 0, 0, Math.PI * 2); ctx.fill();
      if (b.kind === 'well') {
        ctx.fillStyle = '#c5c0a7'; ctx.beginPath(); ctx.ellipse(x, y, 16, 10, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#6f9c9a'; ctx.beginPath(); ctx.ellipse(x, y - 3, 11, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#846f52'; ctx.fillRect(x - 15, y - 24, 4, 25); ctx.fillRect(x + 11, y - 24, 4, 25); ctx.fillRect(x - 17, y - 26, 34, 4);
      } else {
        const width = b.kind === 'storage' ? 60 : 48;
        ctx.fillStyle = '#eadbb8'; ctx.fillRect(x - width / 2, y - 28, width, 34);
        ctx.fillStyle = '#cabc96'; ctx.fillRect(x + width / 2 - 10, y - 28, 10, 34);
        ctx.fillStyle = b.kind === 'market' ? '#799183' : b.kind === 'storage' ? '#8a8771' : '#b88068';
        ctx.beginPath(); ctx.moveTo(x - width / 2 - 6, y - 23); ctx.lineTo(x, y - 50); ctx.lineTo(x + width / 2 + 6, y - 23); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#ffffff24'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 20, y - 27); ctx.lineTo(x + 20, y - 27); ctx.moveTo(x - 12, y - 35); ctx.lineTo(x + 12, y - 35); ctx.stroke();
        ctx.fillStyle = '#7a7058'; ctx.fillRect(x - 5, y - 11, 11, 17);
        ctx.fillStyle = '#94b2a9'; ctx.fillRect(x - 18, y - 17, 8, 9); ctx.fillRect(x + 11, y - 17, 8, 9);
        if (b.kind === 'market') {
          ctx.fillStyle = '#dad0af'; ctx.fillRect(x - 30, y + 3, 60, 9);
          for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#e9dfbd' : '#769582'; ctx.fillRect(x - 30 + i * 10, y - 1, 10, 10); }
        }
      }
      if (b.kind !== 'home') this.label(ctx, b.name, x, y + 25);
    }
    this.label(ctx, '공동 농장', 21.5 * c, 5 * c);
    const selected = w.npcs.find(n => n.id === this.selected);
    if (selected?.currentAction?.path.length) {
      ctx.strokeStyle = '#fff9d0bb'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo((selected.position.x + .5) * c, (selected.position.y + .5) * c);
      for (const p of selected.currentAction.path) ctx.lineTo((p.x + .5) * c, (p.y + .5) * c); ctx.stroke(); ctx.setLineDash([]);
      const target = selected.currentAction.target; ctx.strokeStyle = '#fff9d0'; ctx.strokeRect(target.x * c + 5, target.y * c + 5, 20, 20);
    }
    const occupants = new Map<string, number>();
    for (const n of [...w.npcs].sort((a, b) => a.position.y - b.position.y)) {
      if (!n.alive) continue;
      const key = `${n.position.x},${n.position.y}`, slot = occupants.get(key) ?? 0; occupants.set(key, slot + 1);
      const x = (n.position.x + .5) * c + (slot % 3 - (slot ? 1 : 0)) * 8, y = (n.position.y + .5) * c + Math.floor(slot / 3) * 5;
      if (n.id === this.selected) { ctx.strokeStyle = '#fff9de'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y + 5, 13, 7, 0, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = '#384f443a'; ctx.beginPath(); ctx.ellipse(x + 2, y + 6, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#48574b'; ctx.fillRect(x - 4, y + 2, 3, 6); ctx.fillRect(x + 1, y + 2, 3, 6);
      ctx.fillStyle = npcColor(n); ctx.beginPath(); ctx.roundRect(x - 6, y - 9, 12, 13, 3); ctx.fill();
      ctx.fillStyle = '#ebcba4'; ctx.beginPath(); ctx.arc(x, y - 13, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5d5345'; ctx.beginPath(); ctx.arc(x, y - 15, 5, Math.PI, Math.PI * 2); ctx.fill();
      if (n.id === this.selected) this.label(ctx, n.identity.name, x, y - 32, true);
      if (n.currentAction?.kind === 'Sleep' && !n.currentAction.path.length) { ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = '#fffde7'; ctx.fillText('z', x + 9, y - 20); }
    }
    const hour = (w.tick % 144) / 6;
    if (hour > 19 || hour < 6) { ctx.fillStyle = '#21334925'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); }
    if (w.weather === 'drought') { ctx.fillStyle = '#c3984220'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); }
    if (w.weather === 'rain') {
      ctx.strokeStyle = '#deeeee66'; ctx.lineWidth = 1;
      for (let i = 0; i < 75; i++) { const x = noise(i, 1, w.seed) * this.canvas.width, y = (noise(i, 2, w.seed) * this.canvas.height + w.tick * 8) % this.canvas.height; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 9); ctx.stroke(); }
    }
    if (this.grid) { ctx.strokeStyle = '#4a62452a'; ctx.lineWidth = 1; for (let x = 0; x <= w.width; x++) { ctx.beginPath(); ctx.moveTo(x * c, 0); ctx.lineTo(x * c, w.height * c); ctx.stroke(); } for (let y = 0; y <= w.height; y++) { ctx.beginPath(); ctx.moveTo(0, y * c); ctx.lineTo(w.width * c, y * c); ctx.stroke(); } }
  }
}
