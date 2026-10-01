import { GATHERING_LABELS, isPlanned, type Gathering } from './gatherings-types';
import { urgentNeed } from './cognition';
import { canWork } from './employment';
import { isTravelling } from './civilization';
import { findPath } from './pathfinding';
import { distance, clamp } from './random';
import { appendEvent, socialEvent, changeRelationship, eventById } from './social';
import { harvest } from './heritage';
import type { Candidate, NPC, WorldState } from './types';

const eligible = (w: WorldState, n: NPC) => n.alive && n.identity.age >= 18 && !isTravelling(w, n);
function interruptionReason(w: WorldState, n: NPC, settlementId: string) {
  if (!n.alive) return '세상을 떠나 약속에 참여할 수 없다.';
  if (n.settlementId !== settlementId || isTravelling(w, n)) return '거주지가 바뀌었거나 마을 사이를 이동하고 있다.';
  const urgent = urgentNeed(n);
  if (urgent) return `${{ hunger: '심한 배고픔', thirst: '심한 갈증', fatigue: '심한 피로', health: '건강 악화' }[urgent]} 때문에 생활 회복을 먼저 해야 한다.`;
  return '공동 활동에 참여할 생활 조건이 바뀌었다.';
}
const booked = (w: WorldState, id: string, except?: string) => w.gatherings?.items.some(g => isPlanned(g) && g.id !== except && (g.hostId === id || g.invitations.some(i => i.npcId === id && i.status === 'accepted')));
export function gatheringEvidence(g: Gathering) {
  return [g.sourceEventId, g.lastEventId, ...g.evidence, ...g.arrivals.map(a => a.eventId), ...g.invitations.flatMap(i => [i.invitationEventId, i.responseEventId])];
}
function record(w: WorldState, g: Gathering, phase: string, description: string, participants: string[], causeId = g.sourceEventId) {
  const e = socialEvent(w, { kind: 'gathering', actorId: participants[0], participants, locationId: g.buildingId, importance: 55, causeId,
    description, data: { gatheringId: g.id, gatheringKind: g.kind, phase } });
  g.lastEventId = e.id; return e;
}
/** One direct invitation per person, only while both are in speaking range. No global knowledge broadcast. */
export function deliverInvitations(w: WorldState, g: Gathering) {
  const host = w.npcs.find(n => n.id === g.hostId)!;
  if (!isPlanned(g) || w.tick >= g.startsAt - 6 || !eligible(w, host)) return;
  const nearby = w.npcs.filter(n => n.id !== host.id && eligible(w, n) && n.settlementId === g.settlementId && distance(host.position, n.position) <= 4 && !g.invitations.some(i => i.npcId === n.id))
    .sort((a, b) => bond(host, b) - bond(host, a) || a.id.localeCompare(b.id));
  for (const n of nearby.slice(0, 3 - g.invitations.length)) {
    const invitation = record(w, g, 'invited', `${host.identity.name}이 ${n.identity.name}에게 ${GATHERING_LABELS[g.kind]} 약속을 직접 전했다.`, [host.id, n.id]);
    invitation.data.distance = distance(host.position, n.position);
    const venue = w.buildings.find(b => b.id === g.buildingId)!;
    const path = findPath(w, n.position, venue.position);
    const reason = booked(w, n.id, g.id) ? '이미 다른 공동 활동 약속이 있다.' : urgentNeed(n) ? interruptionReason(w, n, g.settlementId)
      : path === null || path.length > g.endsAt - w.tick - 6 ? '약속 장소에 제시간에 도착하기 어렵다.'
      : g.kind === 'harvest' && !canWork(w, n) ? '지금은 노동하기 어려운 상태다.'
      : g.kind === 'meal' && n.inventory.food < 1 ? '함께 먹을 자신의 식량이 없다.'
      : bond(n, host) < 15 ? '지난 관계와 경험 때문에 이번 초대를 거절한다.' : '생활 일정에 여유가 있고 함께할 의사가 있어 약속한다.';
    const accepted = reason.startsWith('생활 일정');
    const response = record(w, g, accepted ? 'accepted' : 'declined', `${n.identity.name}: ${reason}`, [n.id, host.id], invitation.id);
    g.invitations.push({ npcId: n.id, deliveredAt: w.tick, invitationEventId: invitation.id, responseEventId: response.id, status: accepted ? 'accepted' : 'declined', reason });
  }
}
function bond(n: NPC, other: NPC) {
  const r = n.relationships.find(r => r.npcId === other.id);
  return (r?.trust ?? 35) + (r?.affection ?? 0) * .3 - (r?.resentment ?? 0) + n.personality.sociability * .1;
}
/** Called on a bounded daily cadence; proposals use personal memories and visible neighbours only. */
export function proposeGatherings(w: WorldState) {
  const state = w.gatherings ??= { items: [], lastProposalDay: -1 };
  const day = Math.floor(w.tick / 144);
  if (w.tick % 144 !== 60 || state.lastProposalDay === day) return;
  state.lastProposalDay = day;
  state.items = [...state.items.filter(isPlanned), ...state.items.filter(g => !isPlanned(g)).slice(-24)];
  for (const village of w.civilization.settlements) {
    if (state.items.some(g => isPlanned(g) && g.settlementId === village.id)) continue;
    const locals = w.npcs.filter(n => eligible(w, n) && n.settlementId === village.id && !urgentNeed(n) && !booked(w, n.id)
      && !state.items.some(g => g.hostId === n.id && w.tick - g.createdAt < 3 * 144));
    const ranked = locals.sort((a, b) => (b.personality.sociability + b.personality.empathy + (100 - b.needs.social)) - (a.personality.sociability + a.personality.empathy + (100 - a.needs.social)) || a.id.localeCompare(b.id));
    for (const host of ranked.slice(0, 24)) {
      const neighbours = w.npcs.filter(n => eligible(w, n) && n.id !== host.id && n.settlementId === village.id && distance(host.position, n.position) <= 4);
      if (!neighbours.length) continue;
      const evidence = host.memories.filter(m => m.type === 'social' && eventById(w, m.sourceEventId)?.participants.includes(host.id) && eventById(w, m.sourceEventId)?.kind !== 'rumor').slice(-4).map(m => m.sourceEventId);
      const needy = neighbours.find(n => n.inventory.food === 0 && n.needs.hunger > 55);
      const farm = w.buildings.find(b => b.kind === 'farm' && b.settlementId === village.id && b.growth >= 8 && !w.urban.enterprises.some(e => e.buildingId === b.id));
      const kind = needy && host.inventory.food >= 3 && host.personality.empathy >= 45 ? 'help'
        : farm && canWork(w, host) && host.inventory.food < 3 ? 'harvest'
        : host.inventory.food >= 2 && (host.needs.social < 75 || evidence.length > 0) ? 'meal' : undefined;
      if (!kind) continue;
      const venue = kind === 'harvest' ? farm! : w.buildings.find(b => b.kind === 'market' && b.settlementId === village.id)!;
      const path = findPath(w, host.position, venue.position); if (!path || path.length > 30) continue;
      const reason = kind === 'help' ? `눈앞의 ${needy!.identity.name}에게 식량이 없고 배고픔이 ${Math.round(needy!.needs.hunger)}이다. 내 식량 ${host.inventory.food}개 중 일부를 나누고 싶다.`
        : kind === 'harvest' ? `내 식량은 ${host.inventory.food}개이고 마을 농장에 익은 작물 ${Math.floor(farm!.growth)}개가 있다. 함께 수확하고 싶다.`
        : `내 식량 ${host.inventory.food}개와 교류 충족 ${Math.round(host.needs.social)}, 기억한 만남 ${evidence.length}건을 바탕으로 함께 식사하고 싶다.`;
      const g: Gathering = { id: `g${w.nextId++}`, kind, hostId: host.id, settlementId: village.id, buildingId: venue.id, createdAt: w.tick, startsAt: w.tick + 36, endsAt: w.tick + 60,
        status: 'planned', reason, evidence, sourceEventId: '', lastEventId: '', invitations: [], progress: 0, attendance: [], arrivals: [] };
      const e = appendEvent(w, { kind: 'gathering', actorId: host.id, locationId: venue.id, importance: 55, description: `${host.identity.name}이 ${GATHERING_LABELS[kind]} 약속을 제안했다. ${reason}`,
        data: { gatheringId: g.id, gatheringKind: kind, phase: 'proposed', startsAt: g.startsAt, endsAt: g.endsAt, evidence } });
      g.sourceEventId = e.id; g.lastEventId = e.id; state.items.push(g); deliverInvitations(w, g); break;
    }
  }
}
export function gatheringCandidate(w: WorldState, n: NPC): Candidate | undefined {
  if (!eligible(w, n) || urgentNeed(n)) return;
  const g = w.gatherings?.items.find(g => isPlanned(g) && w.tick >= g.startsAt - 24 && w.tick < g.endsAt && (g.hostId === n.id || g.invitations.some(i => i.npcId === n.id && i.status === 'accepted')));
  if (!g) return;
  const b = w.buildings.find(b => b.id === g.buildingId)!;
  if (w.tick < g.startsAt - Math.min(12, distance(n.position, b.position) + 3)) return;
  return { kind: 'Attend', score: 110, target: { ...b.position }, targetId: g.id, reason: `약속한 ${GATHERING_LABELS[g.kind]} · ${b.name}에서 만나기로 했다.`, evidence: [g.hostId === n.id ? g.sourceEventId : g.invitations.find(i => i.npcId === n.id)!.responseEventId] };
}
function clearActions(w: WorldState, g: Gathering) {
  for (const n of w.npcs) if (n.currentAction?.kind === 'Attend' && n.currentAction.targetId === g.id) delete n.currentAction;
}
function finish(w: WorldState, g: Gathering, reason: string, completed: NPC[] = []) {
  g.status = completed.length >= 2 ? 'completed' : 'cancelled'; g.finishedAt = w.tick;
  if (g.status === 'cancelled') { g.progress = 0; g.attendance = []; }
  const host = w.npcs.find(n => n.id === g.hostId)!;
  const accepted = g.invitations.filter(i => i.status === 'accepted');
  // Only actual participants know a successful outcome. Host learns its own cancellation, never private reasons at a distance.
  const e = record(w, g, g.status, `${GATHERING_LABELS[g.kind]} ${g.status === 'completed' ? '완료' : '취소'} · ${reason}`, completed.length ? completed.map(n => n.id) : [g.hostId]);
  for (const i of accepted) {
    const n = w.npcs.find(n => n.id === i.npcId)!;
    if (completed.includes(n)) {
      i.status = 'attended'; i.reason = '약속 장소에서 함께 활동을 마쳤다.'; i.responseEventId = e.id;
      changeRelationship(w, host, n.id, { trust: 3, affection: 2, familiarity: 3 }, e, '약속한 활동을 함께 마쳤다.');
      changeRelationship(w, n, host.id, { trust: 3, affection: 2, familiarity: 3 }, e, '약속한 활동을 함께 마쳤다.');
    } else {
      i.status = 'missed'; i.reason = '약속 시간 안에 공동 활동을 마치지 못했다.';
      const notice = record(w, g, 'missed', `${n.identity.name}이 약속 시간 안에 공동 활동을 마치지 못했다.`, [n.id], i.responseEventId);
      i.responseEventId = notice.id;
    }
  }
  clearActions(w, g);
}
/** Runs after all movement, so attendance is independent of NPC processing order. */
export function updateGatherings(w: WorldState) {
  for (const g of w.gatherings?.items.filter(isPlanned) ?? []) {
    const host = w.npcs.find(n => n.id === g.hostId)!;
    if (!eligible(w, host) || host.settlementId !== g.settlementId || urgentNeed(host)) { finish(w, g, `주최자: ${interruptionReason(w, host, g.settlementId)}`); continue; }
    for (const i of g.invitations.filter(i => i.status === 'accepted')) {
      const n = w.npcs.find(n => n.id === i.npcId)!;
      if (eligible(w, n) && n.settlementId === g.settlementId && !urgentNeed(n)) continue;
      i.status = 'withdrawn'; i.reason = interruptionReason(w, n, g.settlementId);
      const e = record(w, g, 'withdrawn', `${n.identity.name}: ${i.reason}`, [n.id], i.responseEventId); i.responseEventId = e.id;
      if (n.currentAction?.kind === 'Attend' && n.currentAction.targetId === g.id) delete n.currentAction;
    }
    deliverInvitations(w, g);
    if (w.tick >= g.endsAt) { finish(w, g, '약속 시간 안에 인원·장소·자원 조건을 함께 충족하지 못했다.'); continue; }
    const b = w.buildings.find(b => b.id === g.buildingId)!;
    const participants = [host, ...g.invitations.filter(i => i.status === 'accepted').map(i => w.npcs.find(n => n.id === i.npcId)!)];
    const present = participants.filter(n => n.currentAction?.kind === 'Attend' && n.currentAction.targetId === g.id && distance(n.position, b.position) === 0);
    for (const n of present) if (!g.arrivals.some(a => a.npcId === n.id)) {
      const e = appendEvent(w, { kind: 'gathering', actorId: n.id, locationId: b.id, importance: 20,
        causeId: n.id === g.hostId ? g.sourceEventId : g.invitations.find(i => i.npcId === n.id)!.responseEventId,
        description: `${n.identity.name}이 ${GATHERING_LABELS[g.kind]} 약속 장소에 실제로 도착했다.`, data: { gatheringId: g.id, gatheringKind: g.kind, phase: 'arrived' } });
      g.arrivals.push({ npcId: n.id, tick: w.tick, eventId: e.id }); g.lastEventId = e.id;
    }
    if (w.tick < g.startsAt) continue;
    const ready = present.includes(host) && present.length >= 2 && (g.kind === 'meal' ? present.every(n => n.inventory.food >= 1)
      : g.kind === 'help' ? host.inventory.food >= 2 && present.some(n => n.id !== host.id && n.inventory.food === 0)
      : present.every(n => canWork(w, n)) && b.growth >= present.length * 2);
    if (!ready) { g.progress = 0; g.attendance = []; continue; }
    const ids = present.map(n => n.id);
    if (JSON.stringify(ids) !== JSON.stringify(g.attendance)) { g.progress = 0; g.attendance = ids; }
    if (++g.progress < 6) continue;
    if (g.kind === 'meal') for (const n of present) { n.inventory.food--; w.economy.totals.consumedFood++; n.needs.hunger = clamp(n.needs.hunger - 38); }
    let helped: NPC | undefined;
    if (g.kind === 'help') {
      const target = present.find(n => n.id !== host.id && n.inventory.food === 0)!;
      host.inventory.food--; target.inventory.food++; w.stats.shares++; helped = target;
    }
    if (g.kind === 'harvest') {
      const amount = present.length * 2; b.growth -= amount; harvest(w, g.settlementId, amount); w.economy.totals.producedFood += amount;
      for (const n of present) n.inventory.food += 2;
    }
    for (const n of present) n.needs.social = clamp(n.needs.social + 20);
    finish(w, g, g.kind === 'meal' ? `${present.length}명이 각자 식량 1개를 먹었다.` : g.kind === 'help' ? `${host.identity.name}이 ${helped!.identity.name}에게 소지 식량 1개를 전달했다.` : `${present.length}명이 실제 작물에서 각자 식량 2개를 수확했다.`, present);
  }
}
