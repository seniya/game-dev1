import { reserved } from './village-actions';
import { learnFromPromise, promisePreparation } from './promise-learning';
import { recordHarvest } from './agriculture';
import { GATHERING_LABELS, isPlanned, type Gathering } from './gatherings-types';
import { urgentNeed } from './cognition';
import { canWork } from './employment';
import { isTravelling } from './civilization';
import { findPath } from './pathfinding';
import { distance, clamp } from './random';
import { appendEvent, socialEvent, changeRelationship, eventById } from './social';
import { harvest } from './heritage';
import type { Candidate, NPC, WorldState } from './types';

const eligible = (w: WorldState, n: NPC) => n.alive && n.identity.age >= 18 && !isTravelling(w, n) && !reserved(w,n);
function interruptionReason(w: WorldState, n: NPC, settlementId: string) {
  if (!n.alive) return '세상을 떠나 약속에 참여할 수 없다.';
  if (n.settlementId !== settlementId || isTravelling(w, n)) return '거주지가 바뀌었거나 마을 사이를 이동하고 있다.';
  const urgent = urgentNeed(n);
  if (urgent) return `${{ hunger: '심한 배고픔', thirst: '심한 갈증', fatigue: '심한 피로', health: '건강 악화' }[urgent]} 때문에 생활 회복을 먼저 해야 한다.`;
  return '공동 활동에 참여할 생활 조건이 바뀌었다.';
}
const booked = (w: WorldState, id: string, except?: string) => w.gatherings?.items.some(g => isPlanned(g) && g.id !== except && (g.hostId === id || g.invitations.some(i => i.npcId === id && i.status === 'accepted')));
export function gatheringEvidence(g: Gathering) {
  return [g.sourceEventId, g.lastEventId, ...g.evidence, ...(g.recurring?.evidence ?? []), ...(g.schedule ? [g.schedule.eventId, g.schedule.requestEventId] : []), ...g.arrivals.map(a => a.eventId), ...g.invitations.flatMap(i => [i.invitationEventId, i.responseEventId, ...(i.scheduleEventId ? [i.scheduleEventId, i.scheduleResponseId!] : [])])];
}
function record(w: WorldState, g: Gathering, phase: string, description: string, participants: string[], causeId = g.sourceEventId) {
  const e = socialEvent(w, { kind: 'gathering', actorId: participants[0], participants, locationId: g.buildingId, importance: 55, causeId,
    description, data: { gatheringId: g.id, gatheringKind: g.kind, phase, ...(g.conversationSource?{conversationSource:g.conversationSource}:{}) } });
  g.lastEventId = e.id; return e;
}
const informed = (g: Gathering, i: Gathering['invitations'][number]) => !g.schedule || !!i.scheduleEventId;
function responseReason(w: WorldState, g: Gathering, n: NPC) {
  const host = w.npcs.find(p => p.id === g.hostId)!;
  const path = findPath(w, n.position, w.buildings.find(b => b.id === g.buildingId)!.position);
  const work = n.currentAction && ['Work', 'Gather'].includes(n.currentAction.kind) ? n.currentAction.duration - n.currentAction.progress + n.currentAction.path.length : 0;
  return booked(w, n.id, g.id) ? '이미 다른 공동 활동 약속이 있다.' : urgentNeed(n) ? interruptionReason(w, n, g.settlementId)
    : path === null || path.length + work + promisePreparation(w,n,host).buffer > g.startsAt - w.tick - 6 ? '이동과 남은 작업 때문에 약속 시간에 도착하기 어렵다.'
    : g.kind === 'harvest' && !canWork(w, n) ? '지금은 노동하기 어려운 상태다.'
    : g.kind === 'meal' && n.inventory.food < 1 ? '함께 먹을 자신의 식량이 없다.'
    : bond(n, host) < 15 ? '지난 관계와 경험 때문에 이번 초대를 거절한다.' : '생활 일정에 여유가 있고 함께할 의사가 있어 약속한다.';
}
/** A single bounded request, heard by the host in person; a new time never implies guest consent. */
export function rescheduleGathering(w: WorldState, g: Gathering, requester: NPC, reason: string) {
  const host = w.npcs.find(n => n.id === g.hostId)!;
  if (!isPlanned(g) || g.schedule || w.tick >= g.startsAt - 12 || requester.id === host.id || !eligible(w, requester)
    || !g.invitations.some(i => i.npcId === requester.id) || distance(host.position, requester.position) > 4) return false;
  const request = record(w, g, 'reschedule-requested', `${requester.identity.name}이 시간을 늦추자고 직접 제안했다. ${reason}`, [requester.id, host.id]);
  request.data.distance = distance(host.position, requester.position);
  const previousStart = g.startsAt; g.startsAt += 18; g.endsAt += 18; g.progress = 0; g.attendance = [];
  const event = record(w, g, 'rescheduled', `${host.identity.name}이 약속을 3시간 늦췄다. 새 시간은 다시 전달하고 수락받아야 한다.`, [host.id], request.id);
  event.data.startsAt = g.startsAt; event.data.endsAt = g.endsAt;
  g.schedule = { eventId: event.id, requestEventId: request.id, requestedBy: requester.id, tick: w.tick, previousStart };
  if (host.currentAction?.kind === 'Attend' && host.currentAction.targetId === g.id) delete host.currentAction;
  return true;
}
/** Only informed, consenting invitees may relay once. Every edge is a real encounter. */
export function deliverInvitations(w: WorldState, g: Gathering) {
  const host = w.npcs.find(n => n.id === g.hostId)!;
  if (!isPlanned(g) || w.tick >= g.startsAt - 6 || !eligible(w, host)) return;
  const senders = [host, ...g.invitations.filter(i => i.status === 'accepted' && (i.depth ?? 1) === 1 && informed(g, i)).map(i => w.npcs.find(n => n.id === i.npcId)!)];
  for (const sender of senders) {
    if (!eligible(w, sender) || urgentNeed(sender) || sender.settlementId !== g.settlementId) continue;
    const parent = g.invitations.find(i => i.npcId === sender.id);
    if (parent && !informed(g, parent)) continue;
    const nearby = w.npcs.filter(n => n.id !== host.id && n.id !== sender.id && eligible(w, n) && n.settlementId === g.settlementId && distance(sender.position, n.position) <= 4 && !g.invitations.some(i => i.npcId === n.id))
      .sort((a, b) => (sender.id===g.hostId ? Number(b.id===g.recurring?.partnerId)-Number(a.id===g.recurring?.partnerId) : 0) || invitationPreference(w, sender, b, g.kind) - invitationPreference(w, sender, a, g.kind) || a.id.localeCompare(b.id));
    for (const n of nearby.slice(0, 3 - g.invitations.length)) {
      const invitation = record(w, g, 'invited', `${sender.identity.name}이 ${n.identity.name}에게 ${host.identity.name}의 ${GATHERING_LABELS[g.kind]} 약속을 직접 전했다.`, [sender.id, n.id], parent?.invitationEventId ?? g.sourceEventId);
      const circle = w.gatherings?.circles?.find(c => c.hostId === sender.id && c.partnerId === n.id && c.kind === g.kind);
      invitation.data.evidence = [...(parent ? [parent.responseEventId] : []), ...(circle?.evidence ?? []), ...promisePreparation(w,sender,n).evidence];
      invitation.data.preference = invitationPreference(w, sender, n, g.kind);
      if (circle) invitation.description += ` 이전에 함께 완료한 ${circle.meetings}번의 경험을 다음 초대에 참고했다.`;
      invitation.data.distance = distance(sender.position, n.position); invitation.data.depth = parent ? 2 : 1;
      const reason = responseReason(w, g, n), accepted = reason.startsWith('생활 일정');
      const preparation=promisePreparation(w,n,host);
      const response = record(w, g, accepted ? 'accepted' : 'declined', `${n.identity.name}: ${reason}`, [n.id, sender.id], invitation.id);
      if(preparation.evidence.length){response.data.evidence=preparation.evidence;response.description+=` ${preparation.reason}`;}
      g.invitations.push({ npcId: n.id, senderId: sender.id, depth: parent ? 2 : 1, deliveredAt: w.tick, invitationEventId: invitation.id, responseEventId: response.id, status: accepted ? 'accepted' : 'declined', reason });
      if (g.schedule) { const i = g.invitations.at(-1)!; i.scheduleEventId = invitation.id; i.scheduleResponseId = response.id; invitation.data.schedule = g.schedule.eventId; }
      if (!accepted && /이동|작업|생활 회복/.test(reason)) rescheduleGathering(w, g, n, reason);
    }
  }
  if (g.schedule) for (const i of g.invitations.filter(i => !i.scheduleEventId && ['accepted', 'declined'].includes(i.status))) {
    const n = w.npcs.find(n => n.id === i.npcId)!;
    const sender = [host, ...g.invitations.filter(j => j.status === 'accepted' && !!j.scheduleEventId).map(j => w.npcs.find(n => n.id === j.npcId)!)].find(s => eligible(w, s) && s.settlementId === g.settlementId && s.id !== n.id && distance(s.position, n.position) <= 4);
    if (!eligible(w, n) || n.settlementId !== g.settlementId || !sender) continue;
    const notice = record(w, g, 'schedule-delivered', `${sender.identity.name}이 ${n.identity.name}에게 변경된 약속 시간을 직접 전했다.`, [sender.id, n.id], g.schedule.eventId);
    notice.data.distance = distance(sender.position, n.position); notice.data.schedule = g.schedule.eventId;
    const reason = responseReason(w, g, n), accepted = reason.startsWith('생활 일정');
    const response = record(w, g, accepted ? 'accepted' : 'declined', `${n.identity.name}이 새 시간에 ${accepted ? '다시 약속했다' : '참여하지 않기로 했다'}. ${reason}`, [n.id, sender.id], notice.id);
    i.scheduleEventId = notice.id; i.scheduleResponseId = response.id; i.responseEventId = response.id; i.status = accepted ? 'accepted' : 'declined'; i.reason = reason;
    if (n.currentAction?.kind === 'Attend' && n.currentAction.targetId === g.id) delete n.currentAction;
  }
}
export function invitationPreference(w: WorldState, n: NPC, other: NPC, kind: Gathering['kind']) {
  const circle = w.gatherings?.circles?.find(c => c.hostId === n.id && c.partnerId === other.id && c.kind === kind);
  return bond(n, other) + (circle ? Math.max(0, circle.meetings * 4 - Math.floor((w.tick - circle.lastAt) / 144)) : 0) + promisePreparation(w,n,other).preference;
}
function rememberCircle(w: WorldState, g: Gathering, host: NPC, guest: NPC, eventId: string) {
  const evidence = host.memories.map(m => eventById(w, m.sourceEventId)).filter(e => e?.kind === 'gathering' && e.data.phase === 'completed' && e.data.gatheringKind === g.kind && e.participants.includes(guest.id)).map(e => e!.id);
  const ids = [...new Set(evidence.filter(id => id !== eventId))].sort((a, b) => eventById(w, a)!.tick - eventById(w, b)!.tick).slice(-2).concat(eventId); if (ids.length < 2) return;
  const circles = w.gatherings!.circles ??= [];
  const existing = circles.find(c => c.hostId === host.id && c.partnerId === guest.id && c.kind === g.kind);
  if (existing) { existing.evidence = ids; existing.meetings = ids.length; existing.lastAt = w.tick; }
  else circles.push({ hostId: host.id, partnerId: guest.id, kind: g.kind, meetings: ids.length, evidence: ids, lastAt: w.tick });
  if (circles.length > 48) circles.splice(0, circles.length - 48);
}
function bond(n: NPC, other: NPC) {
  const r = n.relationships.find(r => r.npcId === other.id);
  return (r?.trust ?? 35) + (r?.affection ?? 0) * .3 - (r?.resentment ?? 0) + n.personality.sociability * .1;
}
/** A recurring proposal still needs a visible neighbour, resources and fresh consent. */
export function recurringCircle(w: WorldState, host: NPC) {
  return (w.gatherings?.circles ?? []).filter(c => c.hostId === host.id && w.tick-c.lastAt >= 3*144 && w.tick-c.lastAt <= 14*144)
    .sort((a,b)=>a.lastAt-b.lastAt || a.partnerId.localeCompare(b.partnerId)).find(c=>{
      const partner=w.npcs.find(n=>n.id===c.partnerId);
      return partner && eligible(w,partner) && partner.settlementId===host.settlementId && distance(host.position,partner.position)<=4
        && bond(host,partner)>=25 && !booked(w,partner.id)
        && !w.gatherings?.items.some(g=>g.hostId===host.id && g.recurring?.partnerId===partner.id && w.tick-g.createdAt<3*144);
    });
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
    const due = new Map(locals.map(n=>[n.id,recurringCircle(w,n)]));
    const ranked = locals.sort((a, b) => (due.get(b.id)?60:0)-(due.get(a.id)?60:0) + (b.personality.sociability + b.personality.empathy + (100 - b.needs.social)) - (a.personality.sociability + a.personality.empathy + (100 - a.needs.social)) || a.id.localeCompare(b.id));
    for (const host of ranked.slice(0, 24)) {
      const neighbours = w.npcs.filter(n => eligible(w, n) && n.id !== host.id && n.settlementId === village.id && distance(host.position, n.position) <= 4);
      if (!neighbours.length) continue;
      let evidence = host.memories.filter(m => m.type === 'social' && eventById(w, m.sourceEventId)?.participants.includes(host.id) && eventById(w, m.sourceEventId)?.kind !== 'rumor').slice(-4).map(m => m.sourceEventId);
      const needy = neighbours.find(n => n.inventory.food === 0 && n.needs.hunger > 55);
      const farm = w.buildings.find(b => b.kind === 'farm' && b.settlementId === village.id && b.growth >= 8 && !w.urban.enterprises.some(e => e.buildingId === b.id));
      const circle = due.get(host.id);
      const repeat = circle && (circle.kind === 'meal' ? host.inventory.food >= 2 : circle.kind === 'harvest' ? !!farm && canWork(w,host) : !!needy && host.inventory.food >= 3 && host.personality.empathy >= 45) ? circle : undefined;
      if(repeat) evidence=[...repeat.evidence];
      const kind = repeat?.kind ?? (needy && host.inventory.food >= 3 && host.personality.empathy >= 45 ? 'help'
        : farm && canWork(w, host) && host.inventory.food < 3 ? 'harvest'
        : host.inventory.food >= 2 && (host.needs.social < 75 || evidence.length > 0) ? 'meal' : undefined);
      if (!kind) continue;
      const venue = kind === 'harvest' ? farm! : w.buildings.find(b => b.kind === 'market' && b.settlementId === village.id)!;
      const path = findPath(w, host.position, venue.position); if (!path || path.length > 30) continue;
      let reason = kind === 'help' ? `눈앞의 ${needy!.identity.name}에게 식량이 없고 배고픔이 ${Math.round(needy!.needs.hunger)}이다. 내 식량 ${host.inventory.food}개 중 일부를 나누고 싶다.`
        : kind === 'harvest' ? `내 식량은 ${host.inventory.food}개이고 마을 농장에 익은 작물 ${Math.floor(farm!.growth)}개가 있다. 함께 수확하고 싶다.`
        : `내 식량 ${host.inventory.food}개와 교류 충족 ${Math.round(host.needs.social)}, 기억한 만남 ${evidence.length}건을 바탕으로 함께 식사하고 싶다.`;
      if(repeat) reason=`${w.npcs.find(n=>n.id===repeat.partnerId)!.identity.name}과 실제로 함께한 ${repeat.meetings}번의 경험을 바탕으로 정기 모임을 다시 제안한다. 매번 직접 초대하고 새로 수락받는다. ${reason}`;
      const g: Gathering = { id: `g${w.nextId++}`, kind, hostId: host.id, settlementId: village.id, buildingId: venue.id, createdAt: w.tick, startsAt: w.tick + 36, endsAt: w.tick + 60,
        status: 'planned', ...(repeat ? {recurring:{partnerId:repeat.partnerId,evidence:[...repeat.evidence]}} : {}), reason, evidence, sourceEventId: '', lastEventId: '', invitations: [], progress: 0, attendance: [], arrivals: [] };
      const e = appendEvent(w, { kind: 'gathering', actorId: host.id, locationId: venue.id, importance: 55, description: `${host.identity.name}이 ${GATHERING_LABELS[kind]} 약속을 제안했다. ${reason}`,
        data: { gatheringId: g.id, gatheringKind: kind, phase: 'proposed', ...(repeat ? {recurringPartner:repeat.partnerId} : {}), startsAt: g.startsAt, endsAt: g.endsAt, evidence } });
      g.sourceEventId = e.id; g.lastEventId = e.id; state.items.push(g); deliverInvitations(w, g); break;
    }
  }
}
export function gatheringCandidate(w: WorldState, n: NPC): Candidate | undefined {
  if (!eligible(w, n) || urgentNeed(n)) return;
  const g = w.gatherings?.items.find(g => isPlanned(g) && w.tick >= (g.schedule?.previousStart ?? g.startsAt) - 24 && w.tick < g.endsAt && (g.hostId === n.id || g.invitations.some(i => i.npcId === n.id && i.status === 'accepted')));
  if (!g) return;
  const b = w.buildings.find(b => b.id === g.buildingId)!;
  const invitation = g.invitations.find(i => i.npcId === n.id);
  const knownStart = invitation && !informed(g, invitation) ? g.schedule!.previousStart : g.startsAt;
  if (w.tick >= knownStart + 24 || w.tick < knownStart - Math.min(12, distance(n.position, b.position) + 3)) return;
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
      rememberCircle(w, g, host, n, e.id); rememberCircle(w, g, n, host, e.id);
      i.status = 'attended'; i.reason = '약속 장소에서 함께 활동을 마쳤다.'; i.responseEventId = e.id;
      changeRelationship(w, host, n.id, { trust: 3, affection: 2, familiarity: 3 }, e, '약속한 활동을 함께 마쳤다.');
      changeRelationship(w, n, host.id, { trust: 3, affection: 2, familiarity: 3 }, e, '약속한 활동을 함께 마쳤다.');
    } else {
      i.status = 'missed'; i.reason = '약속 시간 안에 공동 활동을 마치지 못했다.';
      const notice = record(w, g, 'missed', `${n.identity.name}이 약속 시간 안에 공동 활동을 마치지 못했다.`, [n.id], i.responseEventId);
      i.responseEventId = notice.id;
      learnFromPromise(w,g,n,notice.id);
    }
  }
  if(g.status==='cancelled')learnFromPromise(w,g,host,e.id);
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
      learnFromPromise(w,g,n,e.id);
      if (n.currentAction?.kind === 'Attend' && n.currentAction.targetId === g.id) delete n.currentAction;
    }
    deliverInvitations(w, g);
    if (w.tick >= g.endsAt) { finish(w, g, '약속 시간 안에 인원·장소·자원 조건을 함께 충족하지 못했다.'); continue; }
    const b = w.buildings.find(b => b.id === g.buildingId)!;
    const participants = [host, ...g.invitations.filter(i => i.status === 'accepted' && informed(g, i)).map(i => w.npcs.find(n => n.id === i.npcId)!)];
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
      const amount = present.length * 2; b.growth -= amount; harvest(w, g.settlementId, amount); recordHarvest(w,b,amount); w.economy.totals.producedFood += amount;
      for (const n of present) n.inventory.food += 2;
    }
    for (const n of present) n.needs.social = clamp(n.needs.social + 20);
    finish(w, g, g.kind === 'meal' ? `${present.length}명이 각자 식량 1개를 먹었다.` : g.kind === 'help' ? `${host.identity.name}이 ${helped!.identity.name}에게 소지 식량 1개를 전달했다.` : `${present.length}명이 실제 작물에서 각자 식량 2개를 수확했다.`, present);
  }
}

/** Only physically possible activities are offered; a model's prose never grants attendance. */
export function conversationGatherings(w:WorldState,npcId:string) {
  const host=w.npcs.find(n=>n.id===npcId);
  if(!host || !eligible(w,host) || urgentNeed(host) || booked(w,host.id) || w.gatherings?.items.some(g=>g.settlementId===host.settlementId&&isPlanned(g) || g.hostId===host.id&&w.tick-g.createdAt<3*144))return [];
  const nearby=w.npcs.filter(n=>n.id!==host.id&&eligible(w,n)&&n.settlementId===host.settlementId&&distance(n.position,host.position)<=4);
  if(!nearby.length)return [];
  const market=w.buildings.find(b=>b.kind==='market'&&b.settlementId===host.settlementId);
  const farm=w.buildings.find(b=>b.kind==='farm'&&b.settlementId===host.settlementId&&b.growth>=8&&!w.urban.enterprises.some(e=>e.buildingId===b.id));
  const choices:{kind:Gathering['kind'];buildingId:string;label:string}[]=[];
  for(const kind of ['meal','help','harvest'] as const) {
    const venue=kind==='harvest'?farm:market;
    if(!venue || kind==='meal'&&host.inventory.food<2 || kind==='help'&&(host.inventory.food<3||host.personality.empathy<45||!nearby.some(n=>n.inventory.food===0&&n.needs.hunger>55)) || kind==='harvest'&&!canWork(w,host))continue;
    const path=findPath(w,host.position,venue.position);if(!path||path.length>30)continue;
    choices.push({kind,buildingId:venue.id,label:GATHERING_LABELS[kind]});
  }
  return choices;
}
export function proposeConversationGathering(w:WorldState,npcId:string,kind:Gathering['kind'],source:string) {
  const event=eventById(w,source),choice=conversationGatherings(w,npcId).find(c=>c.kind===kind),host=w.npcs.find(n=>n.id===npcId);
  if(!choice||!host||event?.actorId!==npcId||!event.data.expression||w.tick-event.tick>144)throw new Error('주민 모임의 생활 조건 또는 대화 근거가 바뀌었습니다.');
  const state=w.gatherings??={items:[],lastProposalDay:-1};
  state.items=[...state.items.filter(isPlanned),...state.items.filter(g=>!isPlanned(g)).slice(-23)];
  if(state.items.length>=36)throw new Error('주민 모임이 너무 많습니다.');
  const reason='관찰자와 나눈 대화 이후, 현재 생활 조건을 확인하여 제안했다. 참석 여부는 각 주민이 새로 결정한다.';
  const g:Gathering={conversationSource:source,id:`g${w.nextId++}`,kind,hostId:npcId,settlementId:host.settlementId,buildingId:choice.buildingId,createdAt:w.tick,startsAt:w.tick+36,endsAt:w.tick+60,status:'planned',reason,evidence:[source],sourceEventId:'',lastEventId:'',invitations:[],progress:0,attendance:[],arrivals:[]};
  const e=appendEvent(w,{kind:'gathering',actorId:npcId,locationId:g.buildingId,causeId:source,importance:55,description:`${host.identity.name}이 대화 후 ${choice.label} 모임을 제안했다. ${reason}`,data:{gatheringId:g.id,gatheringKind:kind,phase:'proposed',startsAt:g.startsAt,endsAt:g.endsAt,evidence:[source],observer:true,conversationSource:source}});
  g.sourceEventId=e.id;g.lastEventId=e.id;state.items.push(g);deliverInvitations(w,g);return g.id;
}
