import { z } from 'zod';
import type { Candidate, NPC, WorldState } from './types';
import { appendEvent } from './social';
export const ambitionSchema = z.enum(['balanced', 'family', 'wealth', 'community']);
export type Ambition = z.infer<typeof ambitionSchema>;
export const AMBITION_LABELS: Record<Ambition, string> = { balanced: '균형 있는 삶', family: '가족과 관계', wealth: '재산 일구기', community: '마을에 기여하기' };
export const AMBITION_HINTS: Record<Ambition, string> = {
  balanced: '기존 성격과 필요에 따라 생활합니다.',
  family: '대화·함께하는 시간·가족 돌봄을 더 고려합니다. 관계와 주거가 갖춰져야 가족과 자녀가 생깁니다.',
  wealth: '생산·채집·판매를 더 고려합니다. 일하는 동안 관계를 쌓고 쉬는 시간은 줄 수 있습니다.',
  community: '나눔·공동 보관·시설 개선·현장 노동을 더 고려합니다. 개인 자원과 시간이 들어갑니다.',
};
export function applyAmbition(w: WorldState, n: NPC, list: Candidate[]) {
  const focus = n.life.ambition ?? 'balanced';
  if (focus === 'balanced' || n.needs.hunger >= 70 || n.needs.thirst >= 70 || n.needs.fatigue >= 70 || n.needs.health < 45) return;
  for (const c of list) {
    let bonus = 0;
    if (focus === 'family') {
      if (c.kind === 'Talk' || c.kind === 'Attend') bonus = 14;
      if (c.kind === 'Share' && w.npcs.some(p => p.id === c.targetId && (p.id === n.life.partnerId || p.life.parentIds.includes(n.id) || n.life.parentIds.includes(p.id)))) bonus = 18;
    }
    if (focus === 'wealth' && (c.kind === 'Work' || c.kind === 'Gather' || c.kind === 'Trade' && c.targetId === 'sell')) bonus = 14;
    if (focus === 'community' && (c.kind === 'Share' || c.kind === 'StoreItem' || c.kind === 'Work' && /^(construction:)|:(expand_farm|secure_storage|build_home)$/.test(c.targetId ?? ''))) bonus = 14;
    if (bonus) { c.score += bonus; c.reason += ` · 삶의 우선순위: ${AMBITION_LABELS[focus]}`; }
  }
}
export function setAmbition(w: WorldState, npcId: string, input: Ambition) {
  const focus = ambitionSchema.parse(input), n = w.npcs.find(n => n.id === npcId);
  if (!n?.alive) throw new Error('살아 있는 주민의 삶의 우선순위만 바꿀 수 있습니다.');
  if ((n.life.ambition ?? 'balanced') === focus) return;
  n.life.ambition = focus;
  appendEvent(w, { kind: 'goal', actorId: n.id, importance: 45, description: `${n.identity.name}의 삶의 우선순위를 ‘${AMBITION_LABELS[focus]}’으로 바꾸었다.`, data: { ambition: focus, observer: true } });
}
