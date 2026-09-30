import type { WorldState } from './types';
import { activeRequest } from './requests';
export function validateRequests(w: WorldState, ensure: (condition: unknown, message: string) => void, register: (id: string) => void) {
  const s = w.requests, events = new Map(w.events.map(e => [e.id, e]));
  ensure(s.since <= w.tick && s.lastOffered <= w.tick && s.offeredDay <= Math.floor(w.tick / 144) + 1, '부탁 시작/발생 시간');
  ensure(s.items.filter(activeRequest).length <= 2 && new Set(s.items.filter(activeRequest).map(r => r.npcId)).size === s.items.filter(activeRequest).length, '진행 중 부탁 상한/중복');
  ensure(Object.keys(s.cooldowns).length <= 64, '부탁 재요청 대기 상한');
  for (const [key, until] of Object.entries(s.cooldowns)) ensure(w.npcs.some(n => ['food', 'clothing', 'housing'].some(kind => key === `${n.id}:${kind}`)) && until <= w.tick + 432, '부탁 대기 주민/시간');
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
