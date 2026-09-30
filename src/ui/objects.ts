import type { Building, ResourceNode, WorldState } from '../sim/types';
import { capacity, stocks, market } from '../sim/civilization';
import { HOMES } from '../sim/living-types';
import { INDUSTRY_LABELS, type Industry } from '../sim/urban-types';

export type ObjectSelection = { kind: 'building' | 'resource'; id: string };
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const names = { home: '주거', storage: '공동 창고', farm: '농장', market: '시장', well: '우물' };
export function objectName(w: WorldState, selection: ObjectSelection) {
  return selection.kind === 'building' ? w.buildings.find(b => b.id === selection.id)?.name : w.resources.find(r => r.id === selection.id)?.kind === 'wood' ? '목재 나무' : w.resources.some(r => r.id === selection.id) ? '열매 덤불' : undefined;
}
export function buildingBounds(b: Building) {
  return { width: b.kind === 'storage' ? 66 : b.kind === 'farm' ? 54 : b.kind === 'well' ? 40 : 58, height: b.kind === 'home' ? 52 + Math.min(4, b.level - 1) * 10 : b.kind === 'farm' ? 26 : 58 };
}
export function drawBuilding(ctx: CanvasRenderingContext2D, b: Building, w: WorldState, industry?: Industry) {
  const x = (b.position.x + .5) * 30, y = (b.position.y + .5) * 30;
  const rect = (x: number, y: number, width: number, height: number, color: string) => { ctx.fillStyle = color; ctx.fillRect(x, y, width, height); };
  const ellipse = (x: number, y: number, rx: number, ry: number, color: string) => { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); };
  ctx.save(); ctx.translate(x, y);
  ellipse(5, 7, b.kind === 'well' ? 22 : 32, 11, '#344b3b30');
  if (b.kind === 'farm') {
    rect(-26, -20, 52, 35, '#82684c'); rect(-24, -18, 48, 30, '#a48a5d');
    for (let row = 0; row < 3; row++) for (let col = 0; col < 6; col++) {
      const px = -20 + col * 8, py = -12 + row * 10, grown = b.growth >= 20;
      rect(px, py, 2, grown ? 8 : 4, '#546e43');
      ellipse(px - 1, py + 1, 3, 2, grown ? '#dfbc68' : '#91ab65');
      if (grown) ellipse(px + 3, py + 3, 3, 2, industry === 'vegetable_farm' ? '#80a858' : '#e8cb7c');
    }
    rect(22, -24, 3, 40, '#dbc79c'); rect(-27, -24, 3, 40, '#dbc79c'); rect(-27, 9, 52, 3, '#e4d3aa');
    if (industry === 'orchard') { ellipse(0, -20, 16, 15, '#64895d'); for (const dx of [-8, 2, 10]) ellipse(dx, -21 + dx % 3, 3, 3, '#c98460'); }
  } else if (b.kind === 'well') {
    ellipse(0, 0, 18, 12, '#989e8e'); rect(-18, -9, 36, 10, '#bbc1af'); ellipse(0, -9, 18, 10, '#d8d4bb'); ellipse(0, -10, 12, 6, '#619aab'); ellipse(-3, -11, 7, 2, '#a6d1cb');
    rect(-17, -37, 4, 30, '#81674f'); rect(13, -37, 4, 30, '#81674f'); rect(-20, -38, 40, 5, '#a17b56'); rect(-1, -34, 2, 20, '#e0c393'); rect(-5, -18, 10, 7, '#8a7358');
    ctx.fillStyle = '#698c82'; ctx.beginPath(); ctx.moveTo(-23, -38); ctx.lineTo(0, -53); ctx.lineTo(23, -38); ctx.fill();
  } else if (b.kind === 'market' && !industry) {
    rect(-25, -32, 4, 41, '#79634c'); rect(21, -32, 4, 41, '#79634c'); rect(-26, -3, 52, 14, '#bd9668'); rect(-23, 0, 46, 3, '#e1be86');
    for (let i = 0; i < 6; i++) { rect(-30 + i * 10, -36, 10, 17, i % 2 ? '#f5e7c6' : '#b36d52'); ellipse(-25 + i * 10, -19, 5, 4, i % 2 ? '#f5e7c6' : '#b36d52'); }
    for (let i = 0; i < 7; i++) ellipse(-20 + i * 6, -5, 3, 4, ['#ce8b58', '#7e9a58', '#d8b96d'][i % 3]);
    rect(27, 1, 9, 12, '#8eaa91');
  } else if (b.kind === 'storage') {
    rect(-29, -32, 58, 40, '#ae8862'); rect(-25, -28, 50, 32, '#c39c70');
    ctx.fillStyle = '#707e74'; ctx.beginPath(); ctx.moveTo(-34, -30); ctx.lineTo(-20, -51); ctx.lineTo(20, -51); ctx.lineTo(34, -30); ctx.fill();
    rect(-14, -24, 28, 32, '#80644c'); rect(-1, -24, 2, 32, '#d4b68a');
    ctx.strokeStyle = '#cbae80'; ctx.lineWidth = 2; ctx.strokeRect(-13, -23, 26, 30); ctx.beginPath(); ctx.moveTo(-13, -23); ctx.lineTo(13, 7); ctx.moveTo(13, -23); ctx.lineTo(-13, 7); ctx.stroke();
    rect(22, -5, 13, 13, '#d5b16f'); rect(24, -3, 9, 2, '#a18153'); ellipse(-29, 4, 7, 9, '#ddc59b');
  } else {
    const height = b.kind === 'home' ? buildingBounds(b).height - 20 : 34;
    const home = w.living.homes[b.id], roof = industry ? '#607f7d' : home === 'insulated' ? '#657d96' : home === 'courtyard' ? '#83915f' : home === 'shared' ? '#ab8663' : '#b97158';
    rect(-23, -height, 46, height + 7, industry ? '#c4d0bf' : '#eedbb5'); rect(15, -height, 8, height + 7, '#c5b393');
    ctx.fillStyle = roof; ctx.beginPath(); ctx.moveTo(-29, -height + 1); ctx.lineTo(0, -height - 20); ctx.lineTo(29, -height + 1); ctx.fill();
    ctx.strokeStyle = '#fff1d94a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-17, -height - 5); ctx.lineTo(17, -height - 5); ctx.stroke();
    rect(12, -height - 21, 6, 13, '#8d7966'); rect(-5, -11, 10, 18, '#796b53'); rect(2, -3, 2, 2, '#ecd5a1');
    for (let row = 0; row < Math.max(1, Math.floor(height / 15)); row++) for (const dx of [-17, 9]) {
      rect(dx, -height + 6 + row * 14, 8, 8, '#709c9e'); rect(dx + 3, -height + 6 + row * 14, 1, 8, '#f4e3bf');
    }
    if (!industry) { rect(-23, 7, 13, 5, '#826a50'); for (const dx of [-20, -15]) { rect(dx, 3, 2, 4, '#62804b'); ellipse(dx, 2, 2, 2, '#d49a83'); } }
    if (industry === 'mill') {
      ctx.strokeStyle = '#eee0bc'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-13, -48); ctx.lineTo(13, -22); ctx.moveTo(13, -48); ctx.lineTo(-13, -22); ctx.stroke(); ellipse(0, -35, 3, 3, '#786c55');
    } else if (industry === 'smith' || industry === 'pottery' || industry === 'bakery') {
      rect(17, -52, 8, 25, '#857d70'); rect(16, -54, 10, 3, '#62695e'); ellipse(16, 0, 5, 7, '#daab60');
    } else if (industry === 'mine' || industry === 'quarry' || industry === 'clay_pit' || industry === 'saltworks') {
      ellipse(-15, 5, 12, 7, '#8e9b91'); ellipse(-5, 8, 8, 5, '#aab1a0');
    } else if (industry === 'fishery') { ellipse(-15, 5, 17, 8, '#79aeb3'); ellipse(-16, 4, 6, 2, '#d1e1c8'); }
    else if (industry === 'weaving' || industry === 'tailoring' || industry === 'blanket_workshop') {
      rect(-29, -14, 15, 20, '#b17f8f'); rect(-27, -14, 3, 20, '#edcfaa'); rect(-20, -14, 2, 20, '#edcfaa');
      rect(-30, -16, 17, 3, '#79694d'); ellipse(20, 4, 6, 8, '#d8be8e');
    } else if (industry === 'apothecary') {
      rect(-20, -29, 14, 14, '#f8f1d7'); rect(-15, -27, 4, 10, '#72997b'); rect(-18, -24, 10, 4, '#72997b');
      rect(18, 1, 9, 7, '#9c7c5d'); ellipse(21, -1, 6, 5, '#76995e');
    } else if (industry === 'joinery') {
      rect(-28, -4, 24, 5, '#a38157'); rect(-26, 1, 3, 9, '#705e44'); rect(-9, 1, 3, 9, '#705e44'); rect(-21, -10, 13, 6, '#dabc84');
    } else if (industry === 'kitchen' || industry === 'cookhouse' || industry === 'preserving' || industry === 'dairy') {
      ellipse(-20, 1, 9, 7, '#707c71'); rect(-29, -4, 18, 4, '#8f9c8c'); rect(-23, -9, 6, 3, '#59685d');
      rect(18, -5, 7, 12, '#e7d7af'); ellipse(21.5, -5, 3.5, 2, '#fcf2d2');
    } else if (industry === 'pasture') {
      ellipse(-17, 3, 10, 6, '#f0e7cb'); ellipse(-8, 3, 4, 4, '#8e8168'); rect(-23, 6, 2, 5, '#71654f'); rect(-13, 6, 2, 5, '#71654f');
    }
  }
  ctx.restore();
}
export function resourceStage(r: ResourceNode) { return r.amount <= 0 ? 0 : r.amount / Math.max(1, r.capacity) < .35 ? 1 : 2; }
export function objectInspector(w: WorldState, s: ObjectSelection) {
  const b = s.kind === 'building' ? w.buildings.find(b => b.id === s.id) : undefined;
  const r = s.kind === 'resource' ? w.resources.find(r => r.id === s.id) : undefined;
  if (!b && !r) return '<p class="empty-state">이 대상은 현재 세계에 없습니다.</p>';
  const title = objectName(w, s)!;
  const enterprise = b && w.urban.enterprises.find(e => e.buildingId === b.id);
  const type = b ? enterprise ? INDUSTRY_LABELS[enterprise.kind] : names[b.kind] : r!.kind === 'wood' ? '자연 자원 · 목재' : '자연 자원 · 식량';
  const p = (b ?? r)!.position;
  const metric = (label: string, value: string | number) => `<div><span>${label}</span><b>${esc(String(value))}</b></div>`;
  const people = (ids: string[]) => ids.map(id => w.npcs.find(n => n.id === id)).filter(n => n && n.alive).map(n => `<button class="object-person" data-npc="${esc(n!.id)}">${esc(n!.identity.name)} <span>주민 보기 ↗</span></button>`).join('') || '<p class="muted">현재 등록된 주민이 없습니다.</p>';
  let description = '', metrics = '', extra = '';
  if (b) {
    const settlement = w.civilization.settlements.find(v => v.id === b.settlementId);
    metrics = metric('시설 단계', `Lv. ${b.level}`) + metric('건물 상태', `${Math.round(w.urban.buildings[b.id]?.condition ?? 100)} / 100`);
    extra = `<p class="object-location">${esc(settlement?.name ?? '정착지')} · 좌표 ${p.x}, ${p.y}</p>`;
    if (enterprise) {
      description = '주민들이 재료를 가공하거나 자원을 생산하는 일터입니다. 생산품은 이 정착지의 물자에 반영됩니다.';
      metrics += metric('고용 인원', `${enterprise.workers.length} / ${enterprise.capacity}명`) + metric('작업 임금', `${enterprise.wage}코인`) + metric('누적 생산', enterprise.output);
      if (b.kind === 'farm') metrics += metric('작물 생장량', Math.round(b.growth));
      extra += `<h3>이곳에서 일하는 주민</h3>${people(enterprise.workers)}`;
    } else if (b.kind === 'home') {
      const occupants = w.npcs.filter(n => n.alive && n.homeId === b.id), home = HOMES[w.living.homes[b.id] ?? 'shared'];
      description = `${home.label}. 주민이 잠을 자고 일상을 회복하는 생활 공간입니다.`;
      metrics += metric('거주 인원', `${occupants.length} / ${capacity(b)}명`) + metric('안락 / 단열', `${home.comfort} / ${home.insulation}`);
      extra += `<h3>함께 사는 주민</h3>${people(occupants.map(n => n.id))}<h3>소유 주민</h3>${people(b.ownerIds ?? [])}`;
    } else if (b.kind === 'storage' && settlement) {
      const stock = stocks(w, settlement.id); description = '정착지 주민이 식량과 목재를 함께 보관합니다. 아래 재고는 이 정착지의 공동 물자입니다.';
      metrics += metric('공동 식량', `${stock.food}개`) + metric('공동 목재', `${stock.wood}개`);
    } else if (b.kind === 'market' && settlement) {
      const m = market(w, settlement.id); description = '주민들이 식량과 목재를 사고파는 장소입니다. 아래 재고와 가격은 이 정착지 시장의 현재 값입니다.';
      metrics += metric('식량 재고', m.food) + metric('목재 재고', m.wood) + metric('식량 가격', `${m.foodPrice}코인`) + metric('목재 가격', `${m.woodPrice}코인`);
    } else if (b.kind === 'farm') { description = '주민의 노동과 작물의 생장이 식량 생산으로 이어지는 공동 농장입니다.'; metrics += metric('작물 생장량', Math.round(b.growth)); }
    else if (b.kind === 'well') { description = '주민들이 물을 마시고 몸을 씻는 공동 우물입니다. 갈증과 청결을 돌보는 일상의 장소입니다.'; }
    const visitors = w.npcs.filter(n => n.alive && n.currentAction?.targetId === b.id && n.currentAction.path.length === 0);
    if (visitors.length) extra += `<h3>현재 이용 중</h3>${people(visitors.map(n => n.id))}`;
  } else if (r) {
    description = r.kind === 'wood' ? '나무꾼과 채집가가 목재를 얻는 자원입니다. 남은 자원량에 따라 수목의 모습이 달라집니다.' : '식량을 채집할 수 있는 야생 덤불입니다. 남은 열매와 고갈 여부가 지도에 표시됩니다.';
    metrics = metric('남은 자원', `${r.amount} / ${r.capacity}`) + metric('채집 상태', r.amount > 0 ? '채집 가능' : '고갈');
    extra = `<div class="object-stock-track" role="meter" aria-label="남은 자원 비율" aria-valuemin="0" aria-valuemax="${r.capacity}" aria-valuenow="${r.amount}"><i style="width:${Math.min(100, r.amount / Math.max(1, r.capacity) * 100)}%"></i></div><p class="object-location">좌표 ${p.x}, ${p.y}</p>`;
  }
  return `<div class="object-hero" data-object-id="${esc(s.id)}"><span class="object-eyebrow">${esc(type)}</span><h3>${esc(title)}</h3><p>${description}</p></div><div class="object-metrics">${metrics}</div><div class="object-content">${extra}</div>`;
}
