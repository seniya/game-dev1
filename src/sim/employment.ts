import { GOODS } from './urban-types';
import { OCCUPATIONS, type NPC, type WorldState } from './types';
import { appendEvent } from './social';

export const WORK_STATUS_LABELS = { child: '무직 · 아동·학생', retired: '무직 · 은퇴', recovering: '무직 · 요양', seeking: '무직 · 구직 중', employed: '사업체 근무', independent: '자영 생계 활동', deceased: '사망' };
export function workRestriction(w: WorldState, n: NPC): 'child' | 'retired' | 'recovering' | undefined {
  if (n.identity.age < 18) return 'child';
  if (n.identity.age >= 65) return 'retired';
  const u = w.urban?.citizens[n.id];
  if (n.needs.health < 40 || (u?.injury ?? 0) >= 60 || (u?.disease ?? 0) >= 60) return 'recovering';
}
export function canWork(w: WorldState, n: NPC) { return n.alive && !workRestriction(w, n); }
export function workStatus(w: WorldState, n: NPC): keyof typeof WORK_STATUS_LABELS {
  return !n.alive ? 'deceased' : workRestriction(w, n) ?? (w.urban.citizens[n.id]?.employer ? 'employed' : n.occupation === 'none' ? 'seeking' : 'independent');
}
export function occupationLabel(w: WorldState, n: NPC) {
  const state = workStatus(w, n);
  return ['child', 'retired', 'recovering', 'seeking'].includes(state) ? WORK_STATUS_LABELS[state] : OCCUPATIONS[n.occupation];
}
export function syncEmployment(w: WorldState, n: NPC, record = true) {
  const restricted = workRestriction(w, n), previous = n.occupation;
  if (!restricted && n.alive && n.occupation !== 'none') return;
  if (restricted || !n.alive) {
    if (n.occupation !== 'none') { n.previousOccupation = n.occupation; n.occupation = 'none'; }
    for (const e of w.urban.enterprises) if (e.workers.includes(n.id)) e.workers = e.workers.filter(id => id !== n.id);
    delete w.urban.citizens[n.id].employer;
    if (n.currentAction?.kind === 'Work' || n.currentAction?.kind === 'Gather') n.currentAction = undefined;
  } else if (n.occupation === 'none' && n.previousOccupation && n.previousOccupation !== 'none') {
    n.occupation = n.previousOccupation; delete n.previousOccupation;
  }
  if (record && n.alive && n.occupation !== previous) appendEvent(w, { kind: 'occupation', actorId: n.id, importance: 45, description: `${n.identity.name}: ${OCCUPATIONS[previous]} → ${occupationLabel(w, n)}.`, data: { previous, occupation: n.occupation, status: workStatus(w, n) } });
}
export function migrateResources(w: WorldState) {
  for (const goods of [w.urban.ledger.opening, w.urban.ledger.produced, w.urban.ledger.consumed, ...w.urban.cities.map(c => c.goods)]) for (const good of GOODS.slice(10)) goods[good] ??= 0;
  for (const c of w.urban.cities) for (const key of ['clay', 'salt'] as const) {
    c.deposits[key] ??= key === 'clay' ? 1200 : 800;
    c.initialDeposits[key] ??= c.deposits[key];
  }
  for (const n of w.npcs) syncEmployment(w, n, false);
}
