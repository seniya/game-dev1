import { villageSize } from '../sim/civilization';
import { layoutMapLabels, type MapLabel, type LabelRect } from './map-labels';
import { characterVisual } from './character-state';
import { buildingBounds, drawBuilding, objectName, resourceStage, type ObjectSelection } from './objects';
import { type WorldState, type NPC, type Position } from '../sim/types';
import type { MotionTrace } from '../sim/motion';
import { MotionBuffer, MotionPlayback } from './motion';

import { appearance, drawPerson } from './characters';
import { ACTION_LABELS } from '../sim/types';
import { SERVICE_LABELS, INDUSTRY_LABELS } from '../sim/urban-types';
export const npcColor = (n: NPC) => appearance(n).outfit;
const noise = (x: number, y: number, seed: number) => { const v = Math.sin(x * 127.1 + y * 311.7 + seed) * 43758.5453; return v - Math.floor(v); };

export class WorldMap {
  private terrain: HTMLCanvasElement = document.createElement('canvas');
  private scene = document.createElement('canvas');
  private sceneKey = '';
  private buildingLabels: MapLabel[] = [];
  private labels: MapLabel[] = [];
  private labelScale = { x: 1, y: 1 };
  private labelWidths = new Map<string, number>();
  private motion = new MotionPlayback();
  private motionBuffer = new MotionBuffer();
  private displayed = new Map<string, Position>();
  private residents: NPC[] = [];
  private lastUpdate = 0;
  private animating = false;
  private dirty = false;
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  private world?: WorldState;
  private selected = 'npc0';
  private grid = false;
  private selectedObject?: ObjectSelection;
  private hovered?: ObjectSelection;
  private onSelect: (id: string) => void;
  private cell = 30;
  private district = 'all';
  private mode: 'city' | 'region' | 'follow' = 'city';
  private zoom = 1;
  private objectFocus?: Position;
  focusObject(position: Position) { this.objectFocus = position; this.mode = 'city'; this.sceneKey = ''; this.motion.finish(); }
  setMode(mode: 'city' | 'region' | 'follow') { this.objectFocus = undefined; this.mode = mode; this.sceneKey = ''; this.motion.finish(); }
  get viewMode() { return this.mode; }
  setDistrict(value: string) { this.objectFocus = undefined; this.district = ['nw', 'ne', 'sw', 'se'].includes(value) ? value : 'all'; this.sceneKey = ''; this.motion.finish(); }
  private origin = { x: 0, y: 0 };
  private terrainBuildings = 0;
  constructor(private canvas: HTMLCanvasElement, onSelect: (id: string) => void, private onObject: (selection: ObjectSelection) => void = () => {}) {
    this.onSelect = onSelect;
    new ResizeObserver(() => this.draw()).observe(canvas);
    const point = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: (event.clientX - rect.left) / rect.width * (32 / this.zoom) + this.origin.x, y: (event.clientY - rect.top) / rect.height * (24 / this.zoom) + this.origin.y };
    };
    canvas.addEventListener('click', event => {
      if (!this.world) return;
      const p = point(event), npc = this.hitPerson(p);
      if (npc) this.onSelect(npc);
      else { const object = this.hitObject(p); if (object) this.onObject(object); }
    });
    canvas.addEventListener('mousemove', event => {
      const p = point(event), npc = this.hitPerson(p), object = npc ? undefined : this.hitObject(p);
      canvas.style.cursor = npc || object ? 'pointer' : 'default';
      const person = npc ? this.world?.npcs.find(n => n.id === npc) : undefined;
      canvas.title = person ? `${person.identity.name} · ${characterVisual(person, this.world).label}` : object && this.world ? `${objectName(this.world, object)} · 클릭해서 살펴보기` : '';
      if (object?.id !== this.hovered?.id) { this.hovered = object; this.draw(); }
    });
    canvas.addEventListener('mouseleave', () => { this.hovered = undefined; this.draw(); });
  }
  private hitPerson(p: Position) {
    let nearest: string | undefined, distance = Infinity;
    for (const [id, at] of this.displayed) {
      const dx = (p.x - at.x) * this.cell, dy = (p.y - at.y) * this.cell;
      if (Math.abs(dx) <= 11 && dy >= -27 && dy <= 9) { const d = Math.hypot(dx, dy + 10); if (d < distance) { nearest = id; distance = d; } }
    }
    return nearest;
  }
  private hitObject(p: Position): ObjectSelection | undefined {
    if (!this.world) return;
    for (const b of [...this.world.buildings].sort((a,b) => a.position.y - b.position.y).reverse()) {
      const bounds = buildingBounds(b), dx = (p.x - b.position.x - .5) * this.cell, dy = (p.y - b.position.y - .5) * this.cell;
      if (Math.abs(dx) <= bounds.width / 2 && dy >= -bounds.height && dy <= 15) return { kind: 'building', id: b.id };
    }
    for (const r of [...this.world.resources].reverse()) {
      const dx = (p.x - r.position.x - .5) * this.cell, dy = (p.y - r.position.y - .5) * this.cell;
      if (Math.abs(dx) <= (r.kind === 'wood' ? 22 : 15) && dy >= (r.kind === 'wood' ? -38 : -14) && dy <= 16) return { kind: 'resource', id: r.id };
    }
  }
  setGrid(value: boolean) { this.grid = value; this.draw(); }
  update(world: WorldState, selected: string, options: { playing?: boolean; trace?: MotionTrace; interval?: number; buffered?: boolean; object?: ObjectSelection } = {}) {
    const now = performance.now(), previous = this.world;
    this.selectedObject = options.object;
    const rebuilt = !previous || previous.seed !== world.seed || previous.width !== world.width || previous.height !== world.height || this.terrainBuildings !== world.buildings.length;
    if (rebuilt) this.buildTerrain(world);
    const focus = world.civilization.settlements.find(v => v.id === world.civilization.focus)!;
    const changedFocus = previous?.civilization.focus !== world.civilization.focus;
    const chosen = world.npcs.find(n => n.id === selected);
    const size = villageSize(world);
    this.zoom = this.mode === 'region' ? Math.min(32 / world.width, 24 / world.height) : this.objectFocus || this.mode === 'follow' ? 2 : this.district !== 'all' ? 64 / size.width : 32 / size.width;
    this.origin = { x: Math.max(0, focus.center.x - size.width / 2), y: Math.max(0, focus.center.y - size.height / 2) };
    if (this.mode === 'region') this.origin = { x: -(32 / this.zoom - world.width) / 2, y: -(24 / this.zoom - world.height) / 2 };
    else if (this.mode === 'follow' && chosen) this.origin = { x: Math.max(0, Math.min(world.width - 16, chosen.position.x - 8)), y: Math.max(0, Math.min(world.height - 12, chosen.position.y - 6)) };
    else {
      if (this.district.endsWith('e')) this.origin.x += size.width / 2;
      if (this.district.startsWith('s')) this.origin.y += size.height / 2;
    }
    if (this.objectFocus) this.origin = { x: Math.max(0, Math.min(world.width - 16, this.objectFocus.x - 8)), y: Math.max(0, Math.min(world.height - 12, this.objectFocus.y - 6)) };
    this.canvas.setAttribute('aria-label', this.mode === 'region' ? '세계 전체 지도' : this.mode === 'follow' ? `${chosen?.identity.name ?? ''} 따라보기 지도` : this.district === 'all' ? '마을 지도' : `${this.district === 'nw' ? '북서' : this.district === 'ne' ? '북동' : this.district === 'sw' ? '남서' : '남동'} 구역 지도`);
    this.canvas.dataset.mode = this.mode;
    this.canvas.dataset.selected = selected;
    this.canvas.dataset.object = options.object?.id ?? '';
    const advanced = !previous || previous.tick !== world.tick;
    const snap = rebuilt || changedFocus || !options.playing || this.reducedMotion.matches || document.hidden;
    if (snap) this.motionBuffer.reset();
    if (advanced || snap) {
      const gap = now - this.lastUpdate;
      const duration = snap ? 0 : options.buffered ? this.motionBuffer.duration(now, options.interval ?? 2000)
        : gap > 5000 ? 0 : Math.min(2500, Math.max(50, this.lastUpdate ? gap : options.interval ?? 700));
      const trace = options.trace?.fromTick === previous?.tick && options.trace?.toTick === world.tick ? options.trace : undefined;
      this.motion.update(previous?.npcs ?? [], world.npcs, trace, now, duration);
      if (advanced) this.lastUpdate = now;
    }
    this.world = world; this.selected = selected; this.residents = world.npcs.filter(n => n.alive);
    const key = JSON.stringify([world.seed, world.width, world.height, this.origin, this.zoom, selected, this.selectedObject, world.urban.cities.map(c => [c.services, c.active]), world.urban.enterprises.map(e => [e.buildingId, e.kind]), world.buildings.map(b => [b.id, b.kind, b.name, b.position, b.level, b.growth >= 20, world.living.homes[b.id]]), world.resources.map(r => [r.id, r.kind, r.position, resourceStage(r)])]);
    if (rebuilt || key !== this.sceneKey) { this.buildScene(world); this.sceneKey = key; }
    this.animating = this.motion.active(now); this.draw(now);
  }
  animate(now: number, visible = true) {
    if (!visible || document.hidden) { this.motion.finish(); this.motionBuffer.reset(); this.animating = false; this.dirty = true; return; }
    if (this.reducedMotion.matches) this.motion.finish();
    const active = this.motion.active(now);
    if (active || this.animating || this.dirty) this.draw(now);
    this.animating = active; this.dirty = false;
  }
  reset() { this.world = undefined; this.motion.clear(); this.motionBuffer.reset(); this.lastUpdate = 0; this.sceneKey = ''; this.objectFocus = undefined; this.selectedObject = undefined; this.hovered = undefined; this.displayed.clear(); }
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
    const offset = villageSize(w).width === 48 ? { x: 8, y: 6 } : { x: 0, y: 0 };
    ctx.save(); ctx.translate(offset.x * c, offset.y * c);
    for (const [x, y] of [[1, 1], [8, 2], [3, 14], [1, 19], [23, 20], [24, 2], [30, 20], [29, 16], [17, 21], [9, 22], [22, 2]]) this.tree(ctx, x * c, y * c, .85);
    ctx.strokeStyle = '#847e5a'; ctx.lineWidth = 3;
    ctx.strokeRect(18.7 * c, 4.7 * c, 5.7 * c, 5.1 * c);
    for (let x = 19; x < 25; x++) { ctx.fillStyle = '#eee0b9'; ctx.fillRect(x * c, 4.6 * c, 4, 10); ctx.fillRect(x * c, 9.6 * c, 4, 10); }
    ctx.restore();
    for (let y = 2; y < w.height - 2; y += 3) for (let x = 2; x < w.width - 2; x += 3) {
      if (w.tiles[y * w.width + x] === 'forest' && noise(x, y, w.seed) > .55 && !w.resources.some(r => Math.abs(r.position.x - x) + Math.abs(r.position.y - y) < 2)) this.tree(ctx, x*c, y*c, .8);
    }
  }
  private tree(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
    ctx.save(); ctx.translate(x + 15, y + 13); ctx.scale(scale, scale);
    ctx.fillStyle = '#45594230'; ctx.beginPath(); ctx.ellipse(5, 14, 19, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#887356'; ctx.fillRect(-3, -3, 7, 20);
    ctx.fillStyle = '#557c62'; ctx.beginPath(); ctx.arc(-7, -8, 13, 0, Math.PI * 2); ctx.arc(8, -9, 13, 0, Math.PI * 2); ctx.arc(0, -21, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6e9370'; ctx.beginPath(); ctx.arc(-4, -22, 10, 0, Math.PI * 2); ctx.arc(-10, -11, 8, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  private label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, dark = false, priority = 10, id = text, color?: string, compact = false) {
    const p = ctx.getTransform().transformPoint({ x, y });
    this.labels.push({ id, text, x: p.x / this.labelScale.x, y: p.y / this.labelScale.y, dark, priority, color, compact });
  }
  private drawLabels(ctx: CanvasRenderingContext2D) {
    const width = this.canvas.width / this.labelScale.x, height = this.canvas.height / this.labelScale.y;
    const bounds = this.canvas.getBoundingClientRect();
    const reserved: LabelRect[] = [...(this.canvas.parentElement?.querySelectorAll<HTMLElement>('.map-badge, .map-grid-button, .map-compass') ?? [])].map(el => {
      const r = el.getBoundingClientRect(); return { x: r.left - bounds.left, y: r.top - bounds.top, width: r.width, height: r.height };
    });
    ctx.save(); ctx.scale(this.labelScale.x, this.labelScale.y); ctx.font = '500 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const measure = (text: string) => {
      let value = this.labelWidths.get(text);
      if (value === undefined) { value = ctx.measureText(text).width; if (this.labelWidths.size > 2000) this.labelWidths.clear(); this.labelWidths.set(text, value); }
      return value;
    };
    const labels = layoutMapLabels(this.labels, width, height, measure, reserved);
    // Draw leaders first, so a displaced name can still be traced to its original anchor.
    for (const l of labels) {
      const r = l.rect, x = Math.max(r.x, Math.min(r.x + r.width, l.x)), y = Math.max(r.y, Math.min(r.y + r.height, l.y));
      if (Math.hypot(x - l.x, y - l.y) < 5) continue;
      ctx.strokeStyle = l.dark ? '#31483d' : '#fffdf0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(x, y); ctx.stroke();
    }
    for (const l of labels) {
      const r = l.rect;
      ctx.fillStyle = l.dark ? '#31483d' : '#fffdf0f2'; ctx.beginPath(); ctx.roundRect(r.x, r.y, r.width, r.height, 5); ctx.fill();
      ctx.fillStyle = l.color ?? (l.dark ? '#fff8e8' : '#445548'); ctx.fillText(l.text, r.x + r.width / 2, r.y + r.height / 2);
    }
    ctx.restore();
  }
  private buildScene(w: WorldState) {
    this.scene.width = this.canvas.width; this.scene.height = this.canvas.height;
    const ctx = this.scene.getContext('2d')!, c = this.cell;
    ctx.fillStyle = '#e7e5d5'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save(); ctx.scale(this.zoom, this.zoom); ctx.translate(-this.origin.x * c, -this.origin.y * c); ctx.drawImage(this.terrain, 0, 0);
    for (const r of w.resources) {
      if (!this.inView(r.position, 2)) continue;
      const x = r.position.x * c, y = r.position.y * c;
      if (r.kind === 'wood') {
        if (r.amount > 0) this.tree(ctx, x, y, resourceStage(r) === 1 ? .75 : 1);
        else { ctx.fillStyle = '#8c7557'; ctx.fillRect(x+10,y+10,11,10); ctx.fillStyle = '#d7bd8c'; ctx.beginPath(); ctx.ellipse(x+15.5,y+10,5.5,3,0,0,Math.PI*2); ctx.fill(); }
      }
      else {
        ctx.fillStyle = r.amount > 0 ? '#7b9668' : '#99a57f'; ctx.beginPath(); ctx.ellipse(x + 15, y + 15, 13, 9, 0, 0, Math.PI * 2); ctx.fill();
        if (r.amount > 0) { ctx.fillStyle = '#bf7866'; for (let i = 0; i < (resourceStage(r) === 1 ? 1 : 3); i++) { ctx.beginPath(); ctx.arc(x + 8 + i * 6, y + 12 + i % 2 * 4, 2.5, 0, Math.PI * 2); ctx.fill(); } }
      }
    }
    for (const city of w.urban.cities) if (city.services.road > 0) {
      const v = w.civilization.settlements.find(v => v.id === city.settlementId)!;
      for (let y = Math.max(0, v.center.y - 12); y < Math.min(w.height, v.center.y + 12); y++) for (let x = Math.max(0, v.center.x - 16); x < Math.min(w.width, v.center.x + 16); x++) {
        if (w.tiles[y * w.width + x] !== 'path' || !this.inView({x,y})) continue;
        ctx.fillStyle = '#b0b3a5'; ctx.fillRect(x*c+2,y*c+2,c-4,c-4);
        ctx.fillStyle = '#e1dec5'; ctx.fillRect(x*c+14,y*c+11,2,8);
      }
    }
    this.buildingLabels = [];
    const industries = new Map(w.urban.enterprises.map(e => [e.buildingId, e.kind]));
    for (const b of [...w.buildings].sort((a,b) => a.position.y - b.position.y)) {
      if (!this.inView(b.position, 3)) continue;
      const x = b.position.x * c + c / 2, y = b.position.y * c + c / 2;
      const industry = industries.get(b.id);
      drawBuilding(ctx, b, w, industry);
      if (this.mode !== 'region' && b.kind !== 'home') this.buildingLabels.push({ id: `object:${b.id}`, text: industry ? INDUSTRY_LABELS[industry] : b.name, x, y: y + 27, priority: 10 });
    }
    ctx.restore();
  }
  private inView(p: Position, padding = 0) { return p.x >= this.origin.x - padding && p.x < this.origin.x + 32 / this.zoom + padding && p.y >= this.origin.y - padding && p.y < this.origin.y + 24 / this.zoom + padding; }
  private draw(now = performance.now()) {
    const w = this.world; if (!w) return;
    const ctx = this.canvas.getContext('2d')!, c = this.cell;
    const bounds = this.canvas.getBoundingClientRect();
    this.labelScale = { x: this.canvas.width / (bounds.width || this.canvas.width), y: this.canvas.height / (bounds.height || this.canvas.height) };
    this.labels = [];
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.scene, 0, 0);
    ctx.save(); ctx.scale(this.zoom, this.zoom); ctx.translate(-this.origin.x * c, -this.origin.y * c);
    for (const l of this.buildingLabels) this.label(ctx, l.text, l.x, l.y, false, l.priority, l.id);
    const selected = w.npcs.find(n => n.id === this.selected);
    if (!this.selectedObject && selected?.currentAction?.path.length) {
      ctx.strokeStyle = '#fff9d0bb'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.beginPath(); const position = this.motion.position(selected.id, now) ?? selected.position; ctx.moveTo((position.x + .5) * c, (position.y + .5) * c);
      for (const p of selected.currentAction.path) ctx.lineTo((p.x + .5) * c, (p.y + .5) * c); ctx.stroke(); ctx.setLineDash([]);
      const target = selected.currentAction.target; ctx.strokeStyle = '#fff9d0'; ctx.strokeRect(target.x * c + 5, target.y * c + 5, 20, 20);
    }
    for (const target of [this.hovered, this.selectedObject]) {
      if (!target) continue;
      const obj = target.kind === 'building' ? w.buildings.find(b => b.id === target.id) : w.resources.find(r => r.id === target.id);
      if (!obj || !this.inView(obj.position, 3)) continue;
      const x = (obj.position.x + .5) * c, y = (obj.position.y + .5) * c;
      ctx.strokeStyle = target === this.selectedObject ? '#fff7ce' : '#fffdf099'; ctx.lineWidth = 3 / this.zoom;
      ctx.beginPath(); ctx.ellipse(x, y + 8, target.kind === 'building' ? 34 : 23, 13, 0, 0, Math.PI * 2); ctx.stroke();
      this.label(ctx, objectName(w, target) ?? '', x, y - (target.kind === 'building' ? buildingBounds(obj as WorldState['buildings'][number]).height + 15 : 52), true, target === this.selectedObject ? 100 : 90, `object:${target.id}`);
    }
    const occupants = new Map<string, number>();
    this.displayed.clear();
    const visible = this.residents.map(n => ({ n, p: this.motion.position(n.id, now) ?? n.position })).filter(({ p }) => this.inView(p)).sort((a, b) => a.n.id === this.selected ? 1 : b.n.id === this.selected ? -1 : a.p.y - b.p.y);
    for (const { n, p } of visible) {
      const key = `${p.x.toFixed(2)},${p.y.toFixed(2)}`, slot = occupants.get(key) ?? 0; occupants.set(key, slot + 1);
      const x = (p.x + .5) * c + (slot % 3 - (slot ? 1 : 0)) * 8, y = (p.y + .5) * c + Math.floor(slot / 3) * 5;
      this.displayed.set(n.id, { x: x / c, y: y / c });
      if (!this.selectedObject && n.id === this.selected) { ctx.strokeStyle = '#fff9de'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y + 5, 13, 7, 0, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = '#384f443a'; ctx.beginPath(); ctx.ellipse(x + 2, y + 6, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
      drawPerson(ctx, n, x, y, w, this.reducedMotion.matches ? 0 : (p.x + p.y) * Math.PI * 2, false);
      const status = characterVisual(n, w);
      if (this.zoom >= 1 && status.key !== 'calm' && status.key !== 'moving') this.label(ctx, status.symbol, x + 15, y - 27, false, 5, `status:${n.id}`, status.color, true);
      if (!this.selectedObject && n.id === this.selected) this.label(ctx, `${n.identity.name} · ${n.currentAction ? ACTION_LABELS[n.currentAction.kind] : '관찰 중'}`, x, y - 45, true, 100, `npc:${n.id}`);

    }
    if (!this.selectedObject && selected?.currentAction?.targetId && ['Talk', 'Share', 'Borrow', 'Trade'].includes(selected.currentAction.kind)) {
      const other = w.npcs.find(n => n.id === selected.currentAction!.targetId?.replace('peer:', ''));
      if (other && this.inView(selected.position) && this.inView(other.position)) {
        ctx.strokeStyle = '#fff1af'; ctx.lineWidth = 2 / this.zoom; ctx.setLineDash([4,4]); ctx.beginPath();
        ctx.moveTo((selected.position.x+.5)*c,(selected.position.y+.5)*c); ctx.lineTo((other.position.x+.5)*c,(other.position.y+.5)*c); ctx.stroke(); ctx.setLineDash([]);
        this.label(ctx, `${other.identity.name} · ${selected.currentAction.path.length ? '만나러 가는 중' : '상호작용 중'}`, (other.position.x+.5)*c, (other.position.y+.5)*c-34, true, 70, `npc:${other.id}`);
      }
    }
    for (const f of [...w.urban.freight, ...w.civilization.journeys.filter(j => j.kind === 'trade')]) {
      const p = f.path[Math.min(f.progress, f.path.length - 1)]; if (!p || !this.inView(p)) continue;
      ctx.fillStyle = '#bf9650'; ctx.fillRect(p.x*c+7,p.y*c+7,16,10); ctx.fillStyle = '#5b6255'; ctx.fillRect(p.x*c+8,p.y*c+17,4,4); ctx.fillRect(p.x*c+18,p.y*c+17,4,4);
    }
    if (this.mode === 'region') for (const v of w.civilization.settlements) {
      ctx.save(); ctx.translate((v.center.x)*c,(v.center.y-10)*c); ctx.scale(1/this.zoom,1/this.zoom);
      this.label(ctx, `${v.name} · ${w.npcs.filter(n => n.alive && n.settlementId === v.id).length}명`,0,0,true,60,`settlement:${v.id}`); ctx.restore();
    }
    ctx.restore();
    const objectVillage = this.selectedObject?.kind === 'building' ? w.buildings.find(b => b.id === this.selectedObject?.id)?.settlementId : undefined;
    const focusId = objectVillage ?? (this.mode === 'follow' ? selected?.settlementId : w.civilization.focus);
    const city = w.urban.cities.find(c => c.settlementId === focusId);
    if (city && this.mode !== 'region') {
      const serviceText = Object.entries(city.services).filter(([,level]) => level > 0).map(([key,level]) => `${SERVICE_LABELS[key as keyof typeof SERVICE_LABELS]} ${level}`).join(' · ');
      if (serviceText) this.label(ctx, `지역 시설 · ${serviceText}`, this.canvas.width/2, this.canvas.height-18, true, 50, 'services');
    }
    const hour = (w.tick % 144) / 6;
    if (hour > 19 || hour < 6) { ctx.fillStyle = '#21334925'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); }
    if (w.weather === 'drought') { ctx.fillStyle = '#c3984220'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); }
    if (w.weather === 'rain') {
      ctx.strokeStyle = '#deeeee66'; ctx.lineWidth = 1;
      for (let i = 0; i < 75; i++) { const x = noise(i, 1, w.seed) * this.canvas.width, y = (noise(i, 2, w.seed) * this.canvas.height + w.tick * 8) % this.canvas.height; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 9); ctx.stroke(); }
    }
    if (this.grid) {
      ctx.save(); ctx.scale(this.zoom,this.zoom); ctx.translate(-this.origin.x*c,-this.origin.y*c); ctx.strokeStyle='#4a62452a'; ctx.lineWidth=1/this.zoom;
      for (let x=0;x<=w.width;x++) { ctx.beginPath(); ctx.moveTo(x*c,0); ctx.lineTo(x*c,w.height*c); ctx.stroke(); }
      for (let y=0;y<=w.height;y++) { ctx.beginPath(); ctx.moveTo(0,y*c); ctx.lineTo(w.width*c,y*c); ctx.stroke(); } ctx.restore();
    }
    this.drawLabels(ctx);
  }
}
