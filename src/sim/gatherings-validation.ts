import { gatheringsSchema, isPlanned } from './gatherings-types';
import { distance } from './random';
import type { WorldState } from './types';
export { gatheringsSchema };
export function validateGatherings(w: WorldState, ensure: (v: unknown, message: string) => void, register: (id: string) => void) {
  if (!w.gatherings) { ensure(w.npcs.every(n => n.currentAction?.kind !== 'Attend'), '약속 없는 공동 활동'); return; }
  const events = new Map(w.events.map(e => [e.id, e])), people = new Map(w.npcs.map(n => [n.id, n]));
  ensure(w.gatherings.lastProposalDay <= Math.floor(w.tick / 144), '공동 활동 제안 날짜');
  const booked = new Set<string>(), villages = new Set<string>();
  for (const g of w.gatherings.items) {
    register(g.id);
    const source = events.get(g.sourceEventId), last = events.get(g.lastEventId), b = w.buildings.find(b => b.id === g.buildingId);
    ensure(people.has(g.hostId) && b?.settlementId === g.settlementId && b.kind === (g.kind === 'harvest' ? 'farm' : 'market'), '공동 활동 장소/주최자');
    ensure(g.createdAt <= w.tick && g.startsAt === g.createdAt + (g.schedule ? 54 : 36) && g.endsAt === g.startsAt + 24, '공동 활동 시간');
    ensure(source?.kind === 'gathering' && source.actorId === g.hostId && source.tick === g.createdAt && source.data.phase === 'proposed' && source.data.gatheringId === g.id && source.data.gatheringKind === g.kind && source.locationId === g.buildingId, '공동 활동 제안 출처');
    ensure(JSON.stringify(source?.data.evidence) === JSON.stringify(g.evidence) && g.evidence.every(id => { const e = events.get(id); return e && e.tick <= g.createdAt && e.participants.includes(g.hostId) && e.kind !== 'rumor'; }), '공동 활동 개인 근거');
    ensure(last?.kind === 'gathering' && last.data.gatheringId === g.id && last.tick <= w.tick, '공동 활동 마지막 기록');
    if (g.recurring) {
      ensure(g.recurring.partnerId!==g.hostId && people.has(g.recurring.partnerId) && source?.data.recurringPartner===g.recurring.partnerId && JSON.stringify(g.evidence)===JSON.stringify(g.recurring.evidence), '정기 모임 제안 연결');
      ensure(new Set(g.recurring.evidence).size===g.recurring.evidence.length && g.recurring.evidence.every(id=>{
        const e=events.get(id); return e?.kind==='gathering' && e.data.phase==='completed' && e.data.gatheringKind===g.kind && e.participants.includes(g.hostId) && e.participants.includes(g.recurring!.partnerId) && e.tick<=g.createdAt-3*144;
      }), '정기 모임 실제 완료 근거');
    }
    if (g.schedule) {
      const change = events.get(g.schedule.eventId), request = events.get(g.schedule.requestEventId);
      ensure(g.schedule.previousStart === g.createdAt + 36 && g.schedule.tick >= g.createdAt && g.schedule.tick < g.schedule.previousStart - 12 && g.schedule.tick <= w.tick, '약속 변경 시간');
      ensure(request?.kind === 'gathering' && request.data.phase === 'reschedule-requested' && request.data.gatheringId === g.id && request.actorId === g.schedule.requestedBy && request.participants.includes(g.hostId) && typeof request.data.distance === 'number' && request.data.distance <= 4 && request.data.distance >= 0, '약속 조율 요청');
      ensure(change?.kind === 'gathering' && change.data.phase === 'rescheduled' && change.causeId === request?.id && change.data.gatheringId === g.id && change.actorId === g.hostId && change.tick === g.schedule.tick && change.data.startsAt === g.startsAt && change.data.endsAt === g.endsAt, '약속 변경 출처');
    }
    ensure(new Set(g.invitations.map(i => i.npcId)).size === g.invitations.length, '중복 초대');
    ensure(new Set(g.arrivals.map(a => a.npcId)).size === g.arrivals.length && g.arrivals.every(a => {
      const e = events.get(a.eventId);
      return (a.npcId === g.hostId || g.invitations.some(i => i.npcId === a.npcId && i.deliveredAt <= a.tick)) && a.tick >= g.createdAt && a.tick < g.endsAt && a.tick <= w.tick
        && e?.kind === 'gathering' && e.data.phase === 'arrived' && e.data.gatheringId === g.id && e.actorId === a.npcId && e.tick === a.tick && e.locationId === g.buildingId;
    }), '공동 활동 실제 도착 근거');
    for (const i of g.invitations) {
      const invitation = events.get(i.invitationEventId), response = events.get(i.responseEventId);
      ensure(i.npcId !== g.hostId && people.has(i.npcId) && i.deliveredAt >= g.createdAt && i.deliveredAt < g.startsAt - 6 && i.deliveredAt <= w.tick, '초대 대상/시간');
      ensure(invitation?.kind === 'gathering' && invitation.data.phase === 'invited' && invitation.data.gatheringId === g.id && invitation.tick === i.deliveredAt && typeof invitation.data.distance === 'number' && invitation.data.distance <= 4 && invitation.data.distance >= 0 && invitation.participants.includes(i.npcId) && invitation.actorId === (i.senderId ?? g.hostId), '초대 전달 근거');
      const sender = i.senderId ?? g.hostId;
      if (sender !== g.hostId) {
        const parent = g.invitations.find(j => j.npcId === sender);
        const consent = Array.isArray(invitation?.data.evidence) ? events.get(invitation.data.evidence[0]) : undefined;
        ensure(consent?.kind === 'gathering' && consent.data.gatheringId === g.id && consent.data.phase === 'accepted' && consent.actorId === sender && consent.tick <= i.deliveredAt, '초대 전달자의 수락 근거');
        ensure(i.depth === 2 && parent && (parent.depth ?? 1) === 1 && parent.deliveredAt <= i.deliveredAt && invitation?.causeId === parent.invitationEventId, '초대 전달 경로');
      } else ensure((i.depth ?? 1) === 1, '초대 전달 깊이');
      if (i.scheduleEventId) {
        const notice = events.get(i.scheduleEventId), consent = events.get(i.scheduleResponseId!);
        ensure(g.schedule && notice?.kind === 'gathering' && notice.data.gatheringId === g.id && notice.data.schedule === g.schedule.eventId && notice.participants.includes(i.npcId) && notice.tick >= g.schedule.tick && notice.tick <= w.tick && typeof notice.data.distance === 'number' && notice.data.distance >= 0 && notice.data.distance <= 4, '약속 변경 전달');
        ensure(consent?.kind === 'gathering' && consent.causeId === notice?.id && consent.actorId === i.npcId && ['accepted','declined'].includes(String(consent.data.phase)) && consent.tick === notice?.tick, '약속 변경 재수락');
      } else ensure(!i.scheduleResponseId, '약속 변경 전달 없는 응답');
      ensure(response?.kind === 'gathering' && response.data.gatheringId === g.id && response.participants.includes(i.npcId) && response.tick >= i.deliveredAt && response.tick <= w.tick && response.data.phase === ({ attended: 'completed' }[i.status as 'attended'] ?? i.status), '초대 응답 근거');
      if (isPlanned(g) && i.status === 'accepted') { ensure(!booked.has(i.npcId), '주민 약속 중복'); booked.add(i.npcId); }
      ensure(!isPlanned(g) || !['attended', 'missed'].includes(i.status), '종료 전 참석 결과');
      ensure(isPlanned(g) || i.status !== 'accepted', '종료 후 미처리 약속');
    }
    ensure(new Set(g.attendance).size === g.attendance.length && g.attendance.every(id => g.arrivals.some(a => a.npcId === id) && (id === g.hostId || g.invitations.some(i => i.npcId === id && ['accepted', 'attended'].includes(i.status) && (!g.schedule || !!i.scheduleEventId)))), '초대 없는 참석');
    ensure(g.progress === 0 ? g.attendance.length === 0 : g.attendance.length >= 2 && g.attendance.includes(g.hostId), '공동 활동 진행 인원');
    if (isPlanned(g)) {
      ensure(!booked.has(g.hostId) && !villages.has(g.settlementId) && g.endsAt > w.tick && g.finishedAt === undefined && g.progress < 6, '진행 중 약속 상한/종료 시간');
      booked.add(g.hostId); villages.add(g.settlementId);
      if (g.progress > 0) ensure(g.attendance.every(id => { const n = people.get(id)!; return n.alive && distance(n.position, b!.position) === 0 && n.currentAction?.kind === 'Attend' && n.currentAction.targetId === g.id; }), '실제 참석 위치');
    } else {
      ensure(g.finishedAt !== undefined && g.finishedAt >= g.createdAt && g.finishedAt <= w.tick, '공동 활동 종료 시간');
      ensure(g.status !== 'completed' || g.progress === 6 && g.invitations.some(i => i.status === 'attended'), '공동 활동 완료 근거');
    }
  }
  const circleKeys = new Set<string>();
  for (const c of w.gatherings.circles ?? []) {
    const key = `${c.hostId}:${c.partnerId}:${c.kind}`;
    ensure(!circleKeys.has(key) && c.hostId !== c.partnerId && people.has(c.hostId) && people.has(c.partnerId) && c.meetings === c.evidence.length && new Set(c.evidence).size === c.evidence.length, '친교 모임 인원/중복'); circleKeys.add(key);
    ensure(c.evidence.every(id => { const e = events.get(id); return e?.kind === 'gathering' && e.data.phase === 'completed' && e.data.gatheringKind === c.kind && e.participants.includes(c.hostId) && e.participants.includes(c.partnerId) && e.tick <= c.lastAt; }) && events.get(c.evidence.at(-1)!)?.tick === c.lastAt && c.lastAt <= w.tick, '친교 모임 실제 공동 경험');
  }
  for (const n of w.npcs) if (n.currentAction?.kind === 'Attend') {
    const g = w.gatherings.items.find(g => g.id === n.currentAction!.targetId);
    ensure(g && isPlanned(g) && (g.hostId === n.id || g.invitations.some(i => i.npcId === n.id && i.status === 'accepted')) && distance(n.currentAction.target, w.buildings.find(b => b.id === g.buildingId)!.position) === 0, '공동 활동 행동 권한');
  }
}
