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
    ensure(g.createdAt <= w.tick && g.startsAt === g.createdAt + 36 && g.endsAt === g.startsAt + 24, '공동 활동 시간');
    ensure(source?.kind === 'gathering' && source.actorId === g.hostId && source.tick === g.createdAt && source.data.phase === 'proposed' && source.data.gatheringId === g.id && source.data.gatheringKind === g.kind && source.locationId === g.buildingId, '공동 활동 제안 출처');
    ensure(JSON.stringify(source?.data.evidence) === JSON.stringify(g.evidence) && g.evidence.every(id => { const e = events.get(id); return e && e.tick <= g.createdAt && e.participants.includes(g.hostId) && e.kind !== 'rumor'; }), '공동 활동 개인 근거');
    ensure(last?.kind === 'gathering' && last.data.gatheringId === g.id && last.tick <= w.tick, '공동 활동 마지막 기록');
    ensure(new Set(g.invitations.map(i => i.npcId)).size === g.invitations.length, '중복 초대');
    ensure(new Set(g.arrivals.map(a => a.npcId)).size === g.arrivals.length && g.arrivals.every(a => {
      const e = events.get(a.eventId);
      return (a.npcId === g.hostId || g.invitations.some(i => i.npcId === a.npcId && i.deliveredAt <= a.tick)) && a.tick >= g.createdAt && a.tick < g.endsAt && a.tick <= w.tick
        && e?.kind === 'gathering' && e.data.phase === 'arrived' && e.data.gatheringId === g.id && e.actorId === a.npcId && e.tick === a.tick && e.locationId === g.buildingId;
    }), '공동 활동 실제 도착 근거');
    for (const i of g.invitations) {
      const invitation = events.get(i.invitationEventId), response = events.get(i.responseEventId);
      ensure(i.npcId !== g.hostId && people.has(i.npcId) && i.deliveredAt >= g.createdAt && i.deliveredAt < g.startsAt - 6 && i.deliveredAt <= w.tick, '초대 대상/시간');
      ensure(invitation?.kind === 'gathering' && invitation.data.phase === 'invited' && invitation.data.gatheringId === g.id && invitation.tick === i.deliveredAt && typeof invitation.data.distance === 'number' && invitation.data.distance <= 4 && invitation.data.distance >= 0 && invitation.participants.includes(i.npcId) && invitation.actorId === g.hostId, '초대 전달 근거');
      ensure(response?.kind === 'gathering' && response.data.gatheringId === g.id && response.participants.includes(i.npcId) && response.tick >= i.deliveredAt && response.tick <= w.tick && response.data.phase === ({ attended: 'completed' }[i.status as 'attended'] ?? i.status), '초대 응답 근거');
      if (isPlanned(g) && i.status === 'accepted') { ensure(!booked.has(i.npcId), '주민 약속 중복'); booked.add(i.npcId); }
      ensure(!isPlanned(g) || !['attended', 'missed'].includes(i.status), '종료 전 참석 결과');
      ensure(isPlanned(g) || i.status !== 'accepted', '종료 후 미처리 약속');
    }
    ensure(new Set(g.attendance).size === g.attendance.length && g.attendance.every(id => g.arrivals.some(a => a.npcId === id) && (id === g.hostId || g.invitations.some(i => i.npcId === id && ['accepted', 'attended'].includes(i.status)))), '초대 없는 참석');
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
  for (const n of w.npcs) if (n.currentAction?.kind === 'Attend') {
    const g = w.gatherings.items.find(g => g.id === n.currentAction!.targetId);
    ensure(g && isPlanned(g) && (g.hostId === n.id || g.invitations.some(i => i.npcId === n.id && i.status === 'accepted')) && distance(n.currentAction.target, w.buildings.find(b => b.id === g.buildingId)!.position) === 0, '공동 활동 행동 권한');
  }
}
