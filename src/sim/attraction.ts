import type { NPC, WorldState, Personality } from './types';
import { OCCUPATIONS } from './types';
import type { LivingPerson } from './living-types';
import { appearance } from './appearance';

const round = (v: number) => Math.round(v * 10) / 10;
const bounded = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const signed = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
function charmProfile(p: Personality, t: LivingPerson['traits']) {
  return [
    { label: '다정한 배려', strength: p.empathy, taste: p.empathy },
    { label: '꾸준한 성실함', strength: p.diligence, taste: p.diligence },
    { label: '편안한 친화력', strength: p.sociability, taste: p.sociability },
    { label: '흥미로운 호기심', strength: p.curiosity, taste: p.curiosity },
    { label: '차분한 태도', strength: 100 - p.aggression, taste: 100 - p.aggression },
    { label: '넉넉한 마음', strength: 100 - p.greed, taste: p.empathy },
    { label: '끈기 있는 경청', strength: t.patience, taste: t.patience },
    { label: '밝은 낙관성', strength: t.optimism, taste: t.optimism },
    { label: '알뜰한 생활력', strength: t.frugality, taste: t.frugality },
    { label: '자립적인 태도', strength: t.independence, taste: t.independence },
  ];
}

export function charmPoints(p: Personality, t: LivingPerson['traits']) {
  return charmProfile(p, t).sort((a, b) => b.strength - a.strength).slice(0, 3);
}

// A bounded, directional impression. Reading this never creates a relationship,
// memory, event or random draw. Existing saves derive it from their current state.
export function attraction(w: WorldState, observer: NPC, target: NPC) {
  const p = observer.personality, q = target.personality;
  const own = w.living.people[observer.id], other = w.living.people[target.id];
  const factors: { key: string; label: string; value: number; reason: string }[] = [];
  const add = (key: string, label: string, value: number, reason: string) => factors.push({ key, label, value: round(value), reason });
  const sameJob = observer.occupation !== 'none' && observer.occupation === target.occupation;
  add('occupation', '직업', target.occupation === 'none' ? 0 : sameJob ? 1 + p.diligence / 100 : p.curiosity / 100,
    target.occupation === 'none' ? '일하지 않는 상태는 직업 가산 없음' : sameJob ? `${OCCUPATIONS[target.occupation]} 동료의 공감대` : `${OCCUPATIONS[target.occupation]}의 다른 일상에 대한 호기심`);
  const gap = Math.abs(observer.identity.age - target.identity.age);
  add('age', '나이', Math.max(0, 1 - gap / 30) * (1 - p.curiosity / 200), `${gap}세 차이 · 가까운 생애 경험의 공감대`);
  add('health', '건강', (target.needs.health / 100 * (100 - other.body.pain) / 100) * p.sociability / 100
    + (1 - target.needs.health / 100) * p.empathy / 100,
    `건강 ${Math.round(target.needs.health)} · 활력에 끌림과 아픈 이웃에 대한 배려`);
  const a = appearance(observer), b = appearance(target);
  const similarity = (Number(a.hairstyle === b.hairstyle) + Number(a.accessory === b.accessory) + Number(a.outfit.toLowerCase() === b.outfit.toLowerCase())) / 3;
  const style = similarity * (1 - p.curiosity / 100) + (1 - similarity) * p.curiosity / 100;
  add('appearance', '외모 취향', style + (other.body.cleanliness - 50) / 100,
    `${p.curiosity >= 50 ? '새로운' : '익숙한'} 머리·소품·옷차림 선호 · 청결 ${Math.round(other.body.cleanliness)}`);
  const assets = target.wealth + target.inventory.food * 2 + target.inventory.wood * 2;
  add('assets', '자산', Math.min(1, assets / 200) * (p.greed / 100 + own.traits.frugality / 100),
    `코인 ${target.wealth} · 식량 ${target.inventory.food} · 목재 ${target.inventory.wood} · 생활 여유에 대한 관심`);
  const mismatch = Math.abs(p.sociability - q.sociability) / 100 * own.traits.independence / 100;
  const friction = q.aggression / 100 * (1 - own.traits.patience / 200) * 3 + q.greed / 100 * p.empathy / 100;
  add('personality', '성격 궁합', (q.empathy - 50) / 50 * (0.5 + p.empathy / 100) - friction - mismatch,
    '배려에 대한 호응 · 공격성·탐욕과 대화 속도 차이의 마찰');
  const targetCharms = charmPoints(q, other.traits);
  const tastes = new Map(charmProfile(p, own.traits).map(c => [c.label, c.taste]));
  const charms = targetCharms.map(c => ({ label: c.label, strength: c.strength,
    value: round(c.strength / 100 * (tastes.get(c.label) ?? 0) / 100) }));
  add('charm', '매력 포인트', charms.reduce((s, c) => s + c.value, 0), charms.map(c => `${c.label} ${signed(c.value)}`).join(' · '));
  const value = round(bounded(factors.reduce((s, f) => s + f.value, 0), -8, 12));
  // Trust comes from conversational conduct, never from looks, wealth or job title.
  const conduct = (q.empathy + other.traits.patience - q.aggression - q.greed) / 200;
  const changes = { familiarity: 5, affection: round(bounded(1 + value * .35, -2, 5)),
    trust: round(bounded(conduct, -1, 1)), resentment: round(Math.max(0, -factors.find(f => f.key === 'personality')!.value - 2) * .3) };
  return { value, factors, charms, changes,
    reason: factors.map(f => `${f.label} ${signed(f.value)}`).join(' · ') };
}

