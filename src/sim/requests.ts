import type { NPC, WorldState } from './types';
import { REQUEST_CHOICES, REQUEST_LABELS, type RequestChoice, type ResidentRequest, type RequestMetrics } from './requests-types';
import { buildHouse, capacity, isTravelling, stocks } from './civilization';
import { appendEvent, remember, changeRelationship } from './social';
import { clamp, dayOf } from './random';

export const activeRequest = (r: ResidentRequest) => ['open', 'deferred', 'observing'].includes(r.status);
export function requestMetrics(w: WorldState, n: NPC): RequestMetrics {
  const l = w.living.people[n.id], home = w.buildings.find(b => b.id === n.homeId)!;
  return { hunger: n.needs.hunger, health: n.needs.health, food: n.inventory.food, clothing: l.clothing, warmth: l.body.warmth,
    condition: w.urban.buildings[home.id].condition, capacity: capacity(home), trust: w.urban.citizens[n.id].trust };
}
function need(w: WorldState, n: NPC, kind: ResidentRequest['kind'], ongoing = false) {
  if (!n.alive || isTravelling(w, n)) return false;
  const l = w.living.people[n.id], home = w.buildings.find(b => b.id === n.homeId)!;
  if (kind === 'food') return ongoing ? n.inventory.food < 3 : n.inventory.food <= 1 && n.needs.hunger >= 35;
  if (kind === 'clothing') return l.clothing < 30 && (ongoing || l.body.warmth < 65);
  return w.urban.buildings[home.id].condition < 65 || w.npcs.filter(p => p.alive && p.homeId === home.id).length > capacity(home);
}
export function requestReason(w: WorldState, r: ResidentRequest) {
  const n = w.npcs.find(n => n.id === r.npcId)!;
  const m = r.before;
  return r.kind === 'food' ? `${n.identity.name}의 손에 남은 식량은 ${m.food}개, 배고픔은 ${Math.round(m.hunger)}입니다. 다음 끼니를 확보하고 싶어 합니다.`
    : r.kind === 'clothing' ? `옷 상태 ${Math.round(m.clothing)}, 온기 ${Math.round(m.warmth)}. ${n.identity.name}에게 몸을 따뜻하게 할 옷이 필요합니다.`
    : `집의 내구도 ${Math.round(m.condition)}, 정원 ${m.capacity}명. ${n.identity.name}이 낡거나 비좁은 집의 개선을 부탁했습니다.`;
}
export interface RequestOption { choice: RequestChoice; label: string; cost: string; effect: string; disabled?: string }
export function requestOptions(w: WorldState, r: ResidentRequest): RequestOption[] {
  const s = stocks(w, r.settlementId), city = w.urban.cities.find(c => c.settlementId === r.settlementId)!;
  const home = w.buildings.find(b => b.id === r.homeId)!;
  const wood = (amount: number) => s.wood < amount ? `공동 목재 ${amount - s.wood}개 부족` : undefined;
  const options: RequestOption[] = r.kind === 'food' ? [
    { choice: 'food', label: '지금 식량 보내기', cost: '공동 식량 2개', effect: '주민의 소지 식량 +2 · 마을에 대한 신뢰 +4. 먹는 시점은 주민이 결정합니다.', disabled: s.food < 2 ? '공동 식량이 부족합니다' : undefined },
    { choice: 'farm', label: '앞으로의 식량 준비', cost: '공동 목재 16개', effect: '농장 1곳 신설 · 신뢰 +4. 당장 끼니를 주지는 않으며 성장과 주민의 수확이 필요합니다.', disabled: wood(16) },
  ] : r.kind === 'clothing' ? [
    { choice: 'clothes', label: '새 옷 건네기', cost: '마을 옷 재고 1개', effect: '옷 상태 100 · 신뢰 +4. 온기는 날씨와 활동에 따라 서서히 변합니다.', disabled: city.goods.clothes < 1 ? '마을에 옷 재고가 없습니다' : undefined },
    { choice: 'mend', label: '옷 기워주기', cost: '마을 직물 재고 1개', effect: '옷 상태 65 · 신뢰 +4. 새 옷보다 적은 재료로 추위에 대비합니다.', disabled: city.goods.cloth < 1 ? '마을에 직물 재고가 없습니다' : undefined },
  ] : [
    { choice: 'repair', label: '집 수리하기', cost: '공동 목재 6개', effect: '집 내구도 +40 (최대 100) · 신뢰 +4. 동거인도 함께 혜택을 받습니다.', disabled: w.urban.buildings[home.id].condition >= 100 ? '이미 튼튼한 집입니다' : wood(6) },
    { choice: 'expand', label: '방 늘리기', cost: '공동 목재 8개', effect: '집 단계 +1 · 정원 +2명 · 신뢰 +4. 새 주민이 즉시 생기지는 않습니다.', disabled: home.level >= 4 ? '이미 최대 크기의 집입니다' : wood(8) },
  ];
  options.push({ choice: 'later', label: '조금 뒤에 결정', cost: '자원 소모 없음', effect: '게임 6시간 뒤 다시 표시합니다. 한 번만 미룰 수 있습니다.', disabled: r.deferredUntil !== undefined ? '이미 한 번 미룬 부탁입니다' : undefined },
    { choice: 'decline', label: '이번에는 거절', cost: '자원 소모 없음', effect: '이번 부탁을 지원 없이 마칩니다. 마을에 대한 신뢰는 유지됩니다.' });
  return options;
}
function closeRequest(w: WorldState, r: ResidentRequest, status: ResidentRequest['status'], description: string) {
  const n = w.npcs.find(n => n.id === r.npcId)!;
  r.status = status; r.closedAt = w.tick; r.after = requestMetrics(w, n);
  const e = appendEvent(w, { kind: 'request', actorId: n.id, importance: 50, causeId: r.lastEventId, description,
    data: { requestId: r.id, phase: status, requestKind: r.kind, settlementId: r.settlementId, ...(r.choice ? { choice: r.choice } : {}), hungerBefore: r.before.hunger, hungerAfter: r.after.hunger, trustBefore: r.before.trust, trustAfter: r.after.trust } });
  r.lastEventId = r.resultEventId = e.id;
  if (status === 'completed' || status === 'declined') remember(w, n, e);
}
export function respondToRequest(w: WorldState, id: string, choice: RequestChoice) {
  const r = w.requests.items.find(r => r.id === id);
  if (!r || !['open', 'deferred'].includes(r.status)) throw new Error('부탁이 이미 처리되었거나 찾을 수 없습니다.');
  if (!REQUEST_CHOICES.includes(choice)) throw new Error('부탁의 선택이 올바르지 않습니다.');
  const n = w.npcs.find(n => n.id === r.npcId)!;
  if (!n.alive || n.settlementId !== r.settlementId || n.homeId !== r.homeId || isTravelling(w, n) || w.tick >= r.expiresAt) throw new Error('부탁의 상황이 바뀌었습니다. 최신 상태를 확인해 주세요.');
  const option = requestOptions(w, r).find(o => o.choice === choice);
  if (!option || option.disabled) throw new Error(`부탁을 진행할 수 없습니다: ${option?.disabled ?? '이 부탁에 없는 선택'}`);
  if (!need(w, n, r.kind, true)) { closeRequest(w, r, 'resolved', `${n.identity.name}의 부탁은 주민의 생활 속에서 이미 해결되어 자원을 사용하지 않았다.`); return; }
  if (choice === 'later') {
    r.status = 'deferred'; r.deferredUntil = w.tick + 36;
    const e = appendEvent(w, { kind: 'request', actorId: n.id, importance: 35, causeId: r.lastEventId, description: `${n.identity.name}의 부탁을 게임 6시간 뒤 다시 살펴보기로 했다.`, data: { requestId: r.id, phase: 'deferred', requestKind: r.kind } }); r.lastEventId = e.id; return;
  }
  const before = requestMetrics(w, n);
  if (choice === 'decline') { r.before = before; r.choice = choice; closeRequest(w, r, 'declined', `${n.identity.name}의 부탁에 이번에는 지원하지 않기로 했다. 자원과 신뢰는 변경하지 않았다.`); return; }
  const stock = stocks(w, r.settlementId), c = w.urban.cities.find(c => c.settlementId === r.settlementId)!, home = w.buildings.find(b => b.id === r.homeId)!;
  // A failed site search must leave the request and all resources untouched.
  if (choice === 'farm') {
    const b = buildHouse(w, w.civilization.settlements.find(v => v.id === r.settlementId)!, 'farm', true);
    if (!b) throw new Error('부탁을 진행할 연결된 빈 농장 부지가 없습니다.');
    r.buildingId = b.id;
  }
  r.before = before;
  if (choice === 'food') { stock.food -= 2; n.inventory.food += 2; }
  if (choice === 'clothes' || choice === 'mend') {
    const good = choice === 'clothes' ? 'clothes' : 'cloth'; c.goods[good]--; w.urban.ledger.consumed[good]++;
    w.living.people[n.id].clothing = choice === 'clothes' ? 100 : 65;
  }
  if (choice === 'repair' || choice === 'expand') {
    const cost = choice === 'repair' ? 6 : 8; stock.wood -= cost; w.economy.totals.investedWood += cost;
    if (choice === 'repair') w.urban.buildings[home.id].condition = Math.min(100, w.urban.buildings[home.id].condition + 40);
    else home.level++;
    r.buildingId = home.id;
  }
  w.urban.citizens[n.id].trust = clamp(w.urban.citizens[n.id].trust + 4);
  r.choice = choice; r.status = 'observing'; r.reviewAt = w.tick + 12; r.immediate = requestMetrics(w, n);
  const e = appendEvent(w, { kind: 'request', actorId: n.id, locationId: r.buildingId, importance: 55, causeId: r.lastEventId,
    description: `${n.identity.name}의 부탁에 ‘${option.label}’로 응답했다. ${option.cost}를 사용했다.`,
    data: { requestId: r.id, phase: 'supported', requestKind: r.kind, choice, cost: option.cost, trustBefore: r.before.trust, trustAfter: r.immediate.trust } });
  r.lastEventId = r.decisionEventId = e.id; remember(w, n, e);
  if (r.kind === 'housing') for (const other of w.npcs.filter(p => p.alive && p.id !== n.id && p.homeId === home.id)) {
    remember(w, other, e, `${n.identity.name}이 부탁한 집 개선으로 우리 집의 여건이 나아졌다.`);
    changeRelationship(w, other, n.id, { trust: 2, affection: 1 }, e, '함께 사는 집의 개선을 요청해 준 이웃이다.');
  }
}
export function updateRequests(w: WorldState) {
  const state = w.requests;
  for (const r of state.items.filter(activeRequest)) {
    const n = w.npcs.find(n => n.id === r.npcId)!;
    if (!n.alive || n.settlementId !== r.settlementId || n.homeId !== r.homeId || isTravelling(w, n)) { closeRequest(w, r, 'cancelled', `${n.identity.name}의 생애·거주 상황이 바뀌어 부탁 관찰을 마쳤다.`); continue; }
    if (r.status === 'observing') {
      if (w.tick >= r.reviewAt!) closeRequest(w, r, 'completed', `${n.identity.name}을 지원한 뒤 게임 2시간의 생활을 관찰했다. 수치는 그동안의 활동과 날씨가 함께 반영된 결과다.`);
      continue;
    }
    if (w.tick >= r.expiresAt) { closeRequest(w, r, 'expired', `${n.identity.name}의 부탁을 더 기다리지 않고 기록에 남겼다. 지원 자원은 사용하지 않았다.`); continue; }
    if (w.tick > r.createdAt && !need(w, n, r.kind, true)) { closeRequest(w, r, 'resolved', `${n.identity.name}이 생활을 이어가며 부탁의 어려움을 스스로 해결했다.`); continue; }
    if (r.status === 'deferred' && w.tick >= r.deferredUntil!) r.status = 'open';
  }
  if (w.tick % 12 !== 0 || w.tick - state.lastOffered < 36 || state.items.filter(activeRequest).length >= 2) return;
  const day = dayOf(w.tick);
  if (state.offeredDay !== day) { state.offeredDay = day; state.offeredToday = 0; }
  if (state.offeredToday >= 2) return;
  for (const [key, until] of Object.entries(state.cooldowns)) if (until <= w.tick) delete state.cooldowns[key];
  const candidates = w.npcs.filter(n => n.alive && !state.items.some(r => activeRequest(r) && r.npcId === n.id))
    .flatMap(n => (['food', 'clothing', 'housing'] as const).filter(kind => !state.cooldowns[`${n.id}:${kind}`] && need(w, n, kind)).map(kind => ({ n, kind, urgency: kind === 'food' ? n.needs.hunger + 20 : kind === 'clothing' ? 100 - w.living.people[n.id].body.warmth : 100 - w.urban.buildings[n.homeId].condition })))
    .sort((a, b) => b.urgency - a.urgency || a.n.id.localeCompare(b.n.id));
  const pick = candidates[0]; if (!pick) return;
  const { n, kind } = pick, id = `request-${w.nextId++}`, before = requestMetrics(w, n);
  const e = appendEvent(w, { kind: 'request', actorId: n.id, locationId: n.homeId, importance: 50, description: `${n.identity.name}의 부탁: ${REQUEST_LABELS[kind]}`, data: { requestId: id, phase: 'offered', requestKind: kind, hunger: before.hunger, food: before.food, clothing: before.clothing, warmth: before.warmth, condition: before.condition, capacity: before.capacity } });
  if (state.items.length >= 32) state.items.splice(state.items.findIndex(r => !activeRequest(r)), 1);
  state.items.push({ id, npcId: n.id, settlementId: n.settlementId, homeId: n.homeId, kind, status: 'open', createdAt: w.tick, expiresAt: w.tick + 432, sourceEventId: e.id, lastEventId: e.id, before });
  state.cooldowns[`${n.id}:${kind}`] = w.tick + 432; state.lastOffered = w.tick; state.offeredToday++;
}
