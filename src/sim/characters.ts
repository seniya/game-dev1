import { syncEmployment } from './employment';
import { newLivingPerson } from './living';
import { characterSchema, CREATION_DEFAULTS, type CharacterInput } from './character-schema';
import { capacity, isTravelling } from './civilization';
import { findPath } from './pathfinding';
import { socialEvent, changeRelationship } from './social';
import { newCitizen } from './urban';
import { indexPeople } from './spatial';
import { GOAL_LABELS, MAX_POPULATION, YEAR_TICKS, type NPC, type WorldState } from './types';

export function availableHomes(w: WorldState) {
  const occupied = new Map<string, number>();
  for (const n of w.npcs) if (n.alive) occupied.set(n.homeId, (occupied.get(n.homeId) ?? 0) + 1);
  for (const j of w.civilization.journeys) if (j.kind === 'migration' && j.homeId) occupied.set(j.homeId, (occupied.get(j.homeId) ?? 0) + j.npcIds.length);
  return w.buildings.filter(b => b.kind === 'home').map(b => ({ home: b, vacant: Math.max(0, capacity(b) - (occupied.get(b.id) ?? 0)) }));
}
export function createCharacter(w: WorldState, input: CharacterInput): NPC {
  const parsed = characterSchema.safeParse(input);
  if (!parsed.success) throw new Error(`캐릭터 설정을 확인해 주세요: ${parsed.error.issues[0].message} (${parsed.error.issues[0].path.join('.')})`);
  const a = parsed.data;
  if (w.npcs.filter(n => n.alive).length >= MAX_POPULATION || w.npcs.length >= 30000) throw new Error('주민 수 상한에 도달했습니다.');
  const slot = availableHomes(w).find(b => b.home.id === a.homeId);
  if (!slot?.vacant) throw new Error('선택한 집에 빈자리가 없습니다. 다른 집을 선택해 주세요.');
  const home = slot.home;
  const other = a.greetId ? w.npcs.find(n => n.id === a.greetId && n.alive && n.settlementId === home.settlementId && !isTravelling(w, n)) : undefined;
  if (a.greetId && !other) throw new Error('인사할 주민이 같은 정착지에 있는지 확인해 주세요.');
  const path = other ? findPath(w, home.position, other.position) : undefined;
  if (other && path === null) throw new Error('인사할 주민에게 갈 수 있는 길이 없습니다.');
  const bonds = (a.bonds ?? []).map(b => ({ ...b, npc: w.npcs.find(n => n.id === b.npcId) }));
  if (bonds.some(b => !b.npc?.alive || !b.npc.profile)) throw new Error('시작 친밀도는 살아 있는 직접 생성 주민에게만 설정할 수 있습니다.');
  // All fallible input checks precede mutation, including local-mode calls.
  let id: string;
  do { id = `npc-created-${w.nextId++}`; } while (w.npcs.some(n => n.id === id));
  const n: NPC = {
    id, identity: { name: a.name, age: a.age }, position: { ...home.position }, homeId: home.id, settlementId: home.settlementId!,
    life: { ...(a.ambition ? { ambition: a.ambition } : {}), bornTick: w.tick - a.age * YEAR_TICKS, parentIds: [], generation: 0, skill: a.skill, lastBirth: w.tick, lastMove: w.tick, estateSettled: false },
    occupation: a.occupation, alive: true, needs: { ...a.needs }, personality: { ...a.personality },
    inventory: { food: a.food, wood: a.wood }, wealth: a.wealth, relationships: [], memories: [], goals: [],
    decision: { reason: '새로운 이웃으로 이곳에서 삶을 시작합니다.', candidates: [], tick: w.tick }, dailyTaken: 0, lastTalk: -100, knownRumors: [],
  };
  w.npcs.push(n); indexPeople(w);
  w.living.people[id] = { ...newLivingPerson(n), traits: { ...(a.traits ?? CREATION_DEFAULTS.traits) }, desires: { ...(a.desires ?? CREATION_DEFAULTS.desires) }, body: { ...(a.body ?? CREATION_DEFAULTS.body) } };
  w.urban.citizens[id] = { ...newCitizen(n), education: a.education, skills: { ...a.skills } };
  syncEmployment(w, n, false);
  if (a.age < 18) delete n.previousOccupation;
  const assets = w.economy.arrivals ??= { food: 0, wood: 0, coins: 0 };
  assets.food += a.food; assets.wood += a.wood; assets.coins += a.wealth;
  const event = socialEvent(w, { kind: 'arrival', actorId: id, locationId: home.id, importance: 60,
    description: `${a.name}이 ${home.name}에 입주했다. 시작 자산: 식량 ${a.food}개, 목재 ${a.wood}개, ${a.wealth}코인.`,
    data: { createdCharacter: true, food: a.food, wood: a.wood, coins: a.wealth } });
  n.profile = { background: a.background, appearance: { ...a.appearance }, createdAt: w.tick, arrivalEventId: event.id };
  n.goals.push({ id: `g${w.nextId++}`, kind: a.goal, reason: `새 삶의 바람: ${GOAL_LABELS[a.goal]}`, createdAt: w.tick, sourceEventId: event.id });
  for (const b of bonds.filter(b => b.familiarity > 0)) {
    const meaning = `${a.name}과 ${b.npc!.identity.name}은 입주 전부터 알고 지낸 사이다. 시작 친밀도 ${b.familiarity}.`;
    const history = socialEvent(w, { kind: 'relationship', actorId: id, targetId: b.npcId, causeId: event.id, importance: 55, description: meaning, data: { initialBond: true, familiarity: b.familiarity } });
    const changes = { familiarity: b.familiarity, trust: Math.floor(b.familiarity / 3), affection: Math.floor(b.familiarity / 2) };
    changeRelationship(w, n, b.npcId, changes, history, meaning);
    changeRelationship(w, b.npc!, id, changes, history, meaning);
  }
  if (other && path) {
    n.currentAction = { kind: 'Talk', score: 100, reason: `${other.identity.name}에게 첫 인사를 건네러 간다.`, target: { ...other.position }, targetId: other.id, path, progress: 0, duration: 2, evidence: [event.id] };
    n.decision.reason = n.currentAction.reason;
  }
  return n;
}
