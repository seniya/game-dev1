import { villageActivityStatus } from './village-actions';
import { ACTION_LABELS, type NPC, type WorldState } from './types';
import { isTravelling, stocks } from './civilization';
import { household } from './spatial';
import { findPath } from './pathfinding';

// A missing currentAction also represents childhood care and regional migration.
// Derive their status from the same conditions as the engine, without changing it.
export function activityStatus(w: WorldState, n: NPC) {
  if (!n.alive) return { label: '세상을 떠남', reason: '남겨진 생애 기록을 읽을 수 있습니다.', moving: false };
  const journey = w.civilization.journeys.find(j => j.kind === 'migration' && j.npcIds.includes(n.id));
  if (journey) {
    const destination = w.civilization.settlements.find(v => v.id === journey.to)?.name ?? '새 마을';
    return { label: '새 마을로 이주 중', reason: `${destination}의 집으로 이동합니다. 남은 길 ${Math.max(0, journey.path.length - journey.progress)}칸.`, moving: journey.progress < journey.path.length };
  }
  const village = villageActivityStatus(w,n); if(village) return village;
  if (n.currentAction) return { label: ACTION_LABELS[n.currentAction.kind], reason: n.currentAction.reason, moving: !!n.currentAction.path.length };
  if (n.identity.age < 18) {
    const age = w.villageLife ? `${n.identity.age}세 · 4세부터 바깥놀이를 하고 18세부터 생업을 선택합니다.` : `${n.identity.age}세 · 18세 전에는 집에서 돌봄을 받으며 자랍니다. 성인이 되면 스스로 일과 생활 행동을 선택합니다.`;
    const home = w.buildings.find(b => b.id === n.homeId);
    if (!home) return { label: '돌봄을 받을 집 필요', reason: age, moving: false };
    const path = findPath(w, n.position, home.position);
    if (!path) return { label: '집으로 돌아갈 길이 막힘', reason: `${home.name}까지 연결된 길이 필요합니다. ${age}`, moving: false };
    if (path.length) return { label: '돌봄을 받으러 귀가 중', reason: `${home.name}까지 ${path.length}칸 남았습니다. ${age}`, moving: true };
    const caregivers = household(w, n.homeId).filter(p => p.alive && p.identity.age >= 18 && p.homeId === n.homeId && !isTravelling(w, p));
    if (!caregivers.length) return { label: '보호자의 돌봄 필요', reason: `같은 집에 돌봐 줄 어른이 없습니다. 하루가 바뀔 때 마을의 보호 가능한 가정을 찾습니다. ${age}`, moving: false };
    const food = n.inventory.food > 0 || caregivers.some(p => p.inventory.food > 1) || stocks(w, n.settlementId).food > 0;
    if (n.needs.hunger > 38 && !food) return { label: '돌봄 식량 필요', reason: `집과 마을에 먹을 식량이 부족합니다. ${age}`, moving: false };
    return { label: w.villageLife && n.identity.age >= 4 ? '집에서 놀이와 배움 준비' : '집에서 돌봄을 받는 중', reason: `같은 집의 어른이 식사·물·휴식을 돌봅니다. ${age}`, moving: false };
  }
  return { label: '다음 생활 행동 준비 중', reason: '현재 행동 사이의 짧은 준비 시간입니다. 다음 세계 진행 때 생활 상태에 맞는 행동을 선택합니다.', moving: false };
}
