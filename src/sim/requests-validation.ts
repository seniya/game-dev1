import type { WorldState } from './types';
import { activeRequest } from './requests';
export function validateRequests(w: WorldState, ensure: (condition: unknown, message: string) => void, register: (id: string) => void) {
  const s = w.requests, events = new Map(w.events.map(e => [e.id, e]));
  ensure(s.since <= w.tick && s.lastOffered <= w.tick && s.offeredDay <= Math.floor(w.tick / 144) + 1, '부탁 시작/발생 시간');
  ensure(s.items.filter(activeRequest).length <= 2 && new Set(s.items.filter(activeRequest).map(r => r.npcId)).size === s.items.filter(activeRequest).length, '진행 중 부탁 상한/중복');
  ensure(Object.keys(s.cooldowns).length <= 64, '부탁 재요청 대기 상한');
  for (const [key, until] of Object.entries(s.cooldowns)) ensure(w.npcs.some(n => ['food', 'clothing', 'housing'].some(kind => key === `${n.id}:${kind}`)) && until <= w.tick + 1296, '부탁 대기 주민/시간');
  for (const r of s.items) {
    register(r.id);
    ensure(/^request-\d+$/.test(r.id) && Number(r.id.slice(8)) < w.nextId, '부탁 ID');
    ensure(w.npcs.some(n => n.id === r.npcId) && w.civilization.settlements.some(v => v.id === r.settlementId) && w.buildings.some(b => b.id === r.homeId && b.kind === 'home' && b.settlementId === r.settlementId), '부탁 주민/마을/주택');
    ensure(!r.buildingId || w.buildings.some(b => b.id === r.buildingId && b.settlementId === r.settlementId), '부탁 건물');
    const source = events.get(r.sourceEventId);
    ensure(source?.tick === r.createdAt && source.data.phase === 'offered' && r.createdAt >= s.since && r.createdAt <= w.tick && r.expiresAt === r.createdAt + 432, '부탁 출처/기한');
    for (const id of [r.sourceEventId, r.lastEventId, r.decisionEventId, r.resultEventId].filter(Boolean) as string[]) {
      const e = events.get(id); ensure(e?.kind === 'request' && e.actorId === r.npcId && e.data.requestId === r.id && e.data.requestKind === r.kind, '부탁 사건 참조');
    }
    if (r.context) {
      ensure(Object.entries(r.context.metrics).every(([key,value]) => source?.data[key] === value), '부탁 배경 수치');
      ensure(r.context.evidence.length === new Set(r.context.evidence).size, '부탁 배경 중복');
      for (const id of r.context.evidence) ensure(events.has(id) && events.get(id)!.tick <= r.createdAt, '부탁 배경 근거');
      ensure(JSON.stringify(source?.data.evidence) === JSON.stringify(r.context.evidence) && JSON.stringify(source?.data.conditions) === JSON.stringify(r.context.facts), '부탁 배경 기록 일치');
    }
    ensure((r.followups === undefined) === (r.followupSince === undefined), '부탁 장기 관찰 시작');
    if (r.followups) {
      ensure(!!r.decisionEventId && r.followupSince! <= w.tick && r.followupSince! >= r.reviewAt! - 12, '부탁 장기 관찰 지원');
      ensure(new Set(r.followups.map(f => f.days)).size === r.followups.length, '부탁 장기 관찰 중복');
      let previous = -1;
      for (const f of r.followups) {
        const e = events.get(f.eventId);
        ensure(f.tick >= r.reviewAt! - 12 + f.days * 144 && f.tick >= r.followupSince! && f.tick <= w.tick && f.days > previous, '부탁 장기 관찰 시간'); previous = f.days;
        ensure(e?.kind === 'request' && e.actorId === r.npcId && e.tick === f.tick && e.causeId === r.decisionEventId && e.data.requestId === r.id && e.data.phase === 'followup' && e.data.days === f.days && e.data.needRemains === f.needRemains, '부탁 장기 관찰 사건');
        ensure(Object.entries(f.metrics).every(([key,value]) => e?.data[key] === value) && JSON.stringify(e?.data.evidence) === JSON.stringify(f.evidence), '부탁 장기 관찰 수치');
        ensure(new Set(f.evidence).size === f.evidence.length && f.evidence.every(id => events.has(id) && events.get(id)!.tick <= f.tick && events.get(id)!.tick > r.reviewAt! - 12), '부탁 장기 관찰 근거');
      }
    }
    if (r.followupStopped) {
      const e = events.get(r.followupStopped);
      ensure(!!r.followups && e?.kind === 'request' && e.actorId === r.npcId && e.data.requestId === r.id && e.data.phase === 'followup-stopped' && e.causeId === r.decisionEventId, '부탁 장기 관찰 중단');
    }
    const supported = !!r.decisionEventId;
    ensure(!r.choice || (r.choice === 'decline' ? r.status === 'declined' : ({food:['food','farm'],clothing:['clothes','mend'],housing:['repair','expand']}[r.kind]).includes(r.choice)), '부탁 선택');
    ensure(supported === (!!r.choice && r.choice !== 'decline'), '부탁 선택/지원 상태');
    ensure(supported === !!r.immediate && supported === !!r.reviewAt && (!supported || r.choice && r.choice !== 'decline' && events.get(r.decisionEventId!)?.tick === r.reviewAt! - 12), '부탁 지원/관찰');
    ensure(r.deferredUntil === undefined || r.deferredUntil >= r.createdAt + 36 && r.deferredUntil <= w.tick + 36, '부탁 미루기 시간');
    ensure(r.status !== 'deferred' || r.deferredUntil !== undefined, '부탁 미루기 상태');
    ensure(r.status !== 'observing' && r.status !== 'completed' || supported, '부탁 관찰 상태');
    ensure(activeRequest(r) ? !r.closedAt && !r.after && !r.resultEventId : r.closedAt !== undefined && r.closedAt >= r.createdAt && r.closedAt <= w.tick && !!r.after && r.lastEventId === r.resultEventId && events.get(r.resultEventId!)?.data.phase === r.status, '부탁 종료 상태');
    ensure(r.status !== 'completed' || r.closedAt! >= r.reviewAt!, '부탁 결과 시간');
  }
}
