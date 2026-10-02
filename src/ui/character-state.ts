import { ACTION_LABELS, type NPC, type WorldState } from '../sim/types';
import { activityStatus } from '../sim/activity-status';
export type CharacterVisual = { key: string; label: string; symbol: string; color: string; tired: boolean; sleeping: boolean; moving: boolean; working: boolean };
export function characterVisual(n: NPC, w?: WorldState): CharacterVisual {
  const body = w?.living.people[n.id]?.body, citizen = w?.urban.citizens[n.id], a = n.currentAction;
  const routine = !a && w ? activityStatus(w,n) : undefined;
  const moving = !!a?.path.length || !!routine?.moving, sleeping = !moving && a?.kind === 'Sleep', working = !moving && (a?.kind === 'Work' || a?.kind === 'Gather');
  const tired = n.needs.fatigue > 75 || (body?.stamina ?? 100) < 25;
  const base = { tired, sleeping, moving, working };
  if (!n.alive) return { ...base, sleeping: false, moving: false, working: false, key: 'departed', label: '세상을 떠남', symbol: '·', color: '#858b87' };
  if (n.needs.health < 35 || (body?.pain ?? 0) > 60 || (citizen?.disease ?? 0) > 50 || (citizen?.injury ?? 0) > 50) return { ...base, key: 'unwell', label: '몸이 불편해요', symbol: '+', color: '#b86e60' };
  if (sleeping) return { ...base, key: 'sleeping', label: '잠으로 회복 중', symbol: 'z', color: '#7c87af' };
  if (n.needs.thirst > 75) return { ...base, key: 'thirsty', label: '목이 말라요', symbol: '◒', color: '#598d9d' };
  if (n.needs.hunger > 75) return { ...base, key: 'hungry', label: '배가 고파요', symbol: '!', color: '#b18b49' };
  if (tired) return { ...base, key: 'tired', label: '쉬고 싶어요', symbol: '…', color: '#958778' };
  if ((body?.warmth ?? 100) < 30) return { ...base, key: 'cold', label: '몸이 추워요', symbol: '≈', color: '#729aa8' };
  if (moving) return { ...base, key: 'moving', label: a ? `이동 중 · ${ACTION_LABELS[a.kind]}` : routine!.label, symbol: '›', color: '#638b7d' };
  if (working) return { ...base, key: 'working', label: a!.kind === 'Gather' ? '자원 채집 중' : '열심히 일하는 중', symbol: '⌁', color: '#a17d4b' };
  if (a && ['Attend', 'Talk', 'Share', 'Trade', 'Borrow', 'Repay'].includes(a.kind)) return { ...base, key: 'social', label: ACTION_LABELS[a.kind], symbol: '••', color: '#a77a8b' };
  if (a && ['Eat', 'Drink', 'Wash'].includes(a.kind)) return { ...base, key: 'restoring', label: ACTION_LABELS[a.kind], symbol: a.kind === 'Eat' ? '●' : '◒', color: '#689699' };
  if (routine && n.identity.age < 18) return { ...base, key: 'care', label: routine.label, symbol: '⌂', color: '#6e926b' };
  return { ...base, key: 'calm', label: '평온한 일상', symbol: '·', color: '#6e926b' };
}
export function characterStatus(n: NPC, w: WorldState) {
  const v = characterVisual(n, w);
  return `<span class="character-status" data-state="${v.key}" style="--state-color:${v.color}"><i>${v.symbol}</i>${v.label}</span>`;
}
