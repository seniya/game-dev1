import { type WorldState, type NPC, type Position } from '../sim/types';
import type { MotionTrace } from '../sim/motion';
import { MotionPlayback } from './motion';

const COLORS = ['#e5a85f', '#d98175', '#76b4a3', '#a893c4', '#739eb7', '#d1b154', '#91a767', '#c6859f', '#71918d', '#b19a83', '#bb8b57', '#95a2c7'];
export const npcColor = (n: NPC) => COLORS[Number(n.id.replace('npc', '')) % COLORS.length] ?? COLORS[0];
const noise = (x: number, y: number, seed: number) => { const v = Math.sin(x * 127.1 + y * 311.7 + seed) * 43758.5453; return v - Math.floor(v); };

export class WorldMap {
  private terrain: HTMLCanvasElement = document.createElement('canvas');
  private scene = document.createElement('canvas');
  private sceneKey = '';
  private motion = new MotionPlayback();
  private displayed = new Map<string, Position>();
  private residents: NPC[] = [];
  private lastUpdate = 0;
  private animating = false;
  private dirty = false;
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  private world?: WorldState;
  private selected = 'npc0';
  private grid = false;
  private onSelect: (id: string) => void;
  private cell = 30;
  private district = 'all';
  private get zoom() { return this.district === 'all' ? 1 : 2; }
  setDistrict(value: string) { this.district = ['nw', 'ne', 'sw', 'se'].includes(value) ? value : 'all'; this.sceneKey = ''; this.motion.finish(); }
  private origin = { x: 0, y: 0 };
  private terrainBuildings = 0;
  constructor(private canvas: HTMLCanvasElement, onSelect: (id: string) => void) {
    this.onSelect = onSelect;
    canvas.addEventListener('click', event => {
      if (!this.world) return;
      const rect = canvas.getBoundingClientRect(), x = (event.clientX - rect.left) / rect.width * (32 / this.zoom) + this.origin.x, y = (event.clientY - rect.top) / rect.height * (24 / this.zoom) + this.origin.y;
      let nearest: string | undefined, distance = 1.7;
      for (const [id, p] of this.displayed) { const d = Math.hypot(p.x - x, p.y - y); if (d < distance) { nearest = id; distance = d; } }
      if (nearest) this.onSelect(nearest);
    });
  }
  setGrid(value: boolean) { this.grid = value; this.draw(); }
  update(world: WorldState, selected: string, options: { playing?: boolean; trace?: MotionTrace; interval?: number } = {}) {
    const now = performance.now(), previous = this.world;
    const rebuilt = !previous || previous.seed !== world.seed || previous.width !== world.width || previous.height !== world.height || this.terrainBuildings !== world.buildings.length;
    if (rebuilt) this.buildTerrain(world);
    const focus = world.civilization.settlements.find(v => v.id === world.civilization.focus)!;
    const changedFocus = previous?.civilization.focus !== world.civilization.focus;
    this.origin = { x: Math.max(0, focus.center.x - 16), y: Math.max(0, focus.center.y - 12) };
    if (this.district.endsWith('e')) this.origin.x += 16;
    if (this.district.startsWith('s')) this.origin.y += 12;
    this.canvas.setAttribute('aria-label', this.district === 'all' ? '마을 지도' : `${this.district === 'nw' ? '북서' : this.district === 'ne' ? '북동' : this.district === 'sw' ? '남서' : '남동'} 구역 지도`);
    const advanced = !previous || previous.tick !== world.tick;
    const snap = rebuilt || changedFocus || !options.playing || this.reducedMotion.matches || document.hidden;
    if (advanced || snap) {
      const gap = now - this.lastUpdate;
      const duration = snap || gap > 5000 ? 0 : Math.min(2500, Math.max(50, this.lastUpdate ? gap : options.interval ?? 700));
      const trace = options.trace?.fromTick === previous?.tick && options.trace?.toTick === world.tick ? options.trace : undefined;
      this.motion.update(previous?.npcs ?? [], world.npcs, trace, now, duration);
      if (advanced) this.lastUpdate = now;
    }
    this.world = world; this.selected = selected; this.residents = world.npcs.filter(n => n.alive);
    const key = JSON.stringify([world.seed, world.width, world.height, this.origin, this.zoom, world.buildings.map(b => [b.id, b.kind, b.name, b.position]), world.resources.map(r => [r.id, r.kind, r.position, r.amount > 0])]);
    if (rebuilt || key !== this.sceneKey) { this.buildScene(world); this.sceneKey = key; }
    this.animating = this.motion.active(now); this.draw(now);
  }
  animate(now: number, visible = true) {
    if (!visible || document.hidden) { this.motion.finish(); this.animating = false; this.dirty = true; return; }
    if (this.reducedMotion.matches) this.motion.finish();
    const active = this.motion.active(now);
    if (active || this.animating || this.dirty) this.draw(now);
    this.animating = active; this.dirty = false;
  }
  reset() { this.world = undefined; this.motion.clear(); this.lastUpdate = 0; this.sceneKey = ''; }
  private buildTerrain(w: WorldState) {
    const c = this.cell; this.canvas.width = 32 * c; this.canvas.height = 24 * c; this.terrain.width = w.width * c; this.terrain.height = w.height * c; this.terrainBuildings = w.buildings.length;
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
  private buildScene(w: WorldState) {
    this.scene.width = this.canvas.width; this.scene.height = this.canvas.height;
    const ctx = this.scene.getContext('2d')!, c = this.cell;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save(); ctx.scale(this.zoom, this.zoom); ctx.translate(-this.origin.x * c, -this.origin.y * c); ctx.drawImage(this.terrain, 0, 0);
    for (const r of w.resources) {
      if (!this.inView(r.position, 2)) continue;
      const x = r.position.x * c, y = r.position.y * c;
      if (r.kind === 'wood') this.tree(ctx, x, y, r.amount > 0 ? 1 : .35);
      else {
        ctx.fillStyle = r.amount > 0 ? '#7b9668' : '#99a57f'; ctx.beginPath(); ctx.ellipse(x + 15, y + 15, 13, 9, 0, 0, Math.PI * 2); ctx.fill();
        if (r.amount > 0) { ctx.fillStyle = '#bf7866'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + 8 + i * 6, y + 12 + i % 2 * 4, 2.5, 0, Math.PI * 2); ctx.fill(); } }
      }
    }
    for (const b of w.buildings) {
      if (!this.inView(b.position, 3)) continue;
      const x = b.position.x * c + c / 2, y = b.position.y * c + c / 2;
      if (b.kind === 'farm') { this.label(ctx, b.name, x, y - 10); continue; }
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
    ctx.restore();
  }
  private inView(p: Position, padding = 0) { return p.x >= this.origin.x - padding && p.x < this.origin.x + 32 / this.zoom + padding && p.y >= this.origin.y - padding && p.y < this.origin.y + 24 / this.zoom + padding; }
  private draw(now = performance.now()) {
    const w = this.world; if (!w) return;
    const ctx = this.canvas.getContext('2d')!, c = this.cell;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.scene, 0, 0);
    ctx.save(); ctx.scale(this.zoom, this.zoom); ctx.translate(-this.origin.x * c, -this.origin.y * c);
    const selected = w.npcs.find(n => n.id === this.selected);
    if (selected?.currentAction?.path.length) {
      ctx.strokeStyle = '#fff9d0bb'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.beginPath(); const position = this.motion.position(selected.id, now) ?? selected.position; ctx.moveTo((position.x + .5) * c, (position.y + .5) * c);
      for (const p of selected.currentAction.path) ctx.lineTo((p.x + .5) * c, (p.y + .5) * c); ctx.stroke(); ctx.setLineDash([]);
      const target = selected.currentAction.target; ctx.strokeStyle = '#fff9d0'; ctx.strokeRect(target.x * c + 5, target.y * c + 5, 20, 20);
    }
    const occupants = new Map<string, number>();
    this.displayed.clear();
    const visible = this.residents.map(n => ({ n, p: this.motion.position(n.id, now) ?? n.position })).filter(({ p }) => this.inView(p)).sort((a, b) => a.p.y - b.p.y);
    for (const { n, p } of visible) {
      const key = `${p.x.toFixed(2)},${p.y.toFixed(2)}`, slot = occupants.get(key) ?? 0; occupants.set(key, slot + 1);
      const x = (p.x + .5) * c + (slot % 3 - (slot ? 1 : 0)) * 8, y = (p.y + .5) * c + Math.floor(slot / 3) * 5;
      this.displayed.set(n.id, { x: x / c, y: y / c });
      if (n.id === this.selected) { ctx.strokeStyle = '#fff9de'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y + 5, 13, 7, 0, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = '#384f443a'; ctx.beginPath(); ctx.ellipse(x + 2, y + 6, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#48574b'; ctx.fillRect(x - 4, y + 2, 3, 6); ctx.fillRect(x + 1, y + 2, 3, 6);
      ctx.fillStyle = npcColor(n); ctx.beginPath(); ctx.roundRect(x - 6, y - 9, 12, 13, 3); ctx.fill();
      ctx.fillStyle = '#ebcba4'; ctx.beginPath(); ctx.arc(x, y - 13, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5d5345'; ctx.beginPath(); ctx.arc(x, y - 15, 5, Math.PI, Math.PI * 2); ctx.fill();
      if (n.id === this.selected) this.label(ctx, n.identity.name, x, y - 32, true);
      if (n.currentAction?.kind === 'Sleep' && !n.currentAction.path.length) { ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = '#fffde7'; ctx.fillText('z', x + 9, y - 20); }
    }
    ctx.restore();
    const hour = (w.tick % 144) / 6;
    if (hour > 19 || hour < 6) { ctx.fillStyle = '#21334925'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); }
    if (w.weather === 'drought') { ctx.fillStyle = '#c3984220'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); }
    if (w.weather === 'rain') {
      ctx.strokeStyle = '#deeeee66'; ctx.lineWidth = 1;
      for (let i = 0; i < 75; i++) { const x = noise(i, 1, w.seed) * this.canvas.width, y = (noise(i, 2, w.seed) * this.canvas.height + w.tick * 8) % this.canvas.height; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 9); ctx.stroke(); }
    }
    if (this.grid) { ctx.save(); ctx.scale(this.zoom, this.zoom); ctx.strokeStyle = '#4a62452a'; ctx.lineWidth = 1; for (let x = 0; x <= 32; x++) { ctx.beginPath(); ctx.moveTo(x * c, 0); ctx.lineTo(x * c, 24 * c); ctx.stroke(); } for (let y = 0; y <= 24; y++) { ctx.beginPath(); ctx.moveTo(0, y * c); ctx.lineTo(32 * c, y * c); ctx.stroke(); } ctx.restore(); }
  }
}
