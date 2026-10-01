import { syncEmployment } from './employment';
import { emptyRequests } from './requests-types';
import { initializeHeritage } from './heritage';
import { initializeUrban } from './urban';
import { type WorldState, type NPC, type Tile, type Building } from './types';
import { createEconomy } from './economy';
import { initializeCivilization, populateSettlements } from './civilization';
import { random } from './random';

export function createWorld(seed = 42, population = 12): WorldState {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 4294967295) throw new Error('시드는 0~4294967295 정수여야 합니다.');
  if (!Number.isInteger(population) || population < 10 || population > 3000) throw new Error('주민 수는 10~3000명이어야 합니다.');
  const w: WorldState = { version: 9, observation: { watchIds: [] }, requests: emptyRequests(36), living: undefined as unknown as WorldState['living'], heritage: undefined as unknown as WorldState['heritage'], urban: undefined as unknown as WorldState['urban'], civilization: { settlements: [], journeys: [], focus: 'v0', detail: 'full' }, seed, rng: seed || 0x9e3779b9, tick: 36, nextId: 1, width: 48, height: 36,
    tiles: [], buildings: [], resources: [], npcs: [], storage: { food: 28, wood: 12 },
    market: { food: 20, wood: 0, coins: 180, foodPrice: 3, woodPrice: 2 }, weather: 'sunny', droughtUntil: 0,
    economy: undefined as unknown as WorldState['economy'], events: [], loans: [], llm: { enabled: true, queue: [], gateKeys: [], dailyByNpc: {}, dailyTotal: 0, requested: 0, completed: 0, rejected: 0, failed: 0 },
    stats: { foodSum: 0, samples: 0, deaths: 0, thefts: 0, shares: 0, conflicts: 0 } };
  for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) {
    const lx = x - 8, ly = y - 6;
    const riverX = 34 + Math.round(Math.sin(ly / 4));
    let tile: Tile = x >= riverX && x < riverX + 3 ? 'water' : 'grass';
    if ((ly === 11 || ly === 12) && x > 2 && x < 46) tile = 'path';
    if ((lx === 14 || lx === 15) && y > 2 && y < 34) tile = 'path';
    if (lx < 7 && ly < 10 && x > 1 && y > 1) tile = 'forest';
    if (lx > 18 && lx < 24 && ly > 4 && ly < 10) tile = 'farm';
    if (x > 43 && y < 5) tile = 'rock';
    w.tiles.push(tile);
  }
  const buildings: [Building['kind'], string, number, number][] = [
    ['storage', '공동 창고', 16, 10], ['farm', '동쪽 공동 농장', 21, 7], ['market', '느티나무 시장', 17, 14], ['well', '마을 우물', 12, 11],
    ['home', '노을집', 9, 6], ['home', '소나무집', 13, 5], ['home', '돌담집', 18, 4],
    ['home', '풀꽃집', 7, 16], ['home', '햇살집', 11, 18], ['home', '바람집', 20, 18],
  ];
  w.buildings = buildings.map(([kind, name, x, y], i) => ({ id: `b${i}`, kind, name, position: { x: x + 8, y: y + 6 }, level: 1, growth: kind === 'farm' ? 30 : 0 }));
  for (let i = 0; i < 18; i++) {
    const x = 2 + i % 5, y = 2 + Math.floor(i / 5) * 2;
    w.resources.push({ id: `r${i}`, position: { x: x + 8, y: y + 6 }, kind: i % 3 === 0 ? 'food' : 'wood', amount: i % 3 === 0 ? 3 : 10, capacity: 16 });
  }
  for (let i = 0; i < 5; i++) w.resources.push({ id: `berry${i}`, position: { x: 11 + i * 4, y: 27 }, kind: 'food', amount: 4, capacity: 20 });
  const names = ['하루', '서연', '도윤', '민서', '지호', '수아', '시우', '나은', '유준', '다은', '이안', '소율', '민재', '여울', '연우', '해솔'];
  const jobs: NPC['occupation'][] = ['farmer', 'gatherer', 'farmer', 'woodcutter', 'carpenter', 'farmer', 'merchant', 'gatherer', 'woodcutter', 'farmer', 'gatherer', 'carpenter'];
  for (let i = 0; i < population; i++) {
    const home = w.buildings[4 + i % 6];
    const personality = { diligence: random(w) * 100, greed: random(w) * 100, sociability: random(w) * 100, aggression: random(w) * 100, empathy: random(w) * 100, curiosity: random(w) * 100 };
    w.npcs.push({ id: `npc${i}`, identity: { name: `${names[i % names.length]}${i >= names.length ? Math.floor(i / names.length) + 1 : ''}`, age: 20 + Math.floor(random(w) * 44) },
      life: { bornTick: 0, parentIds: [], generation: 0, skill: 10, lastBirth: 0, lastMove: 0, estateSettled: false }, settlementId: 'v0',
      position: { x: home.position.x + i % 2, y: home.position.y + 1 }, homeId: home.id, occupation: jobs[i % jobs.length], alive: true,
      needs: { hunger: 20 + random(w) * 40, thirst: 15 + random(w) * 25, fatigue: 10 + random(w) * 20, health: 80 + random(w) * 20, safety: 90, social: 45 + random(w) * 40 }, personality,
      inventory: { food: 1 + Math.floor(random(w) * 3), wood: 0 }, wealth: 8 + Math.floor(random(w) * 22), relationships: [], memories: [],
      goals: [{ id: `initial${i}`, kind: i % 3 === 0 ? 'secure_food' : i % 3 === 1 ? 'help_neighbor' : 'earn_wealth', reason: '새로운 마을에서 삶의 기반을 만들고 싶다.', createdAt: w.tick }],
      decision: { reason: '아침의 첫 행동을 생각하고 있습니다.', candidates: [], tick: w.tick }, dailyTaken: 0, lastTalk: -100, knownRumors: [] });
  }
  // A village includes dependants and adults seeking a first job from its first day.
  for (let i = 0; i < w.npcs.length; i++) {
    const n = w.npcs[i];
    if (i % 12 === 9) { n.identity.age = 8; n.occupation = 'none'; }
    if (i % 12 === 10) n.identity.age = 70;
    if (i % 12 === 11) n.occupation = 'none';
  }
  initializeCivilization(w);
  populateSettlements(w);
  // Assign initial children to an actual household with an adult in the same village.
  for (const n of w.npcs.filter(n => n.identity.age < 18)) {
    if (w.npcs.some(p => p.homeId === n.homeId && p.identity.age >= 18)) continue;
    const guardian = w.npcs.find(p => p.identity.age >= 18 && p.identity.age < 65 && p.settlementId === n.settlementId && w.npcs.filter(q => q.homeId === p.homeId).length < 2 + w.buildings.find(b => b.id === p.homeId)!.level * 2);
    if (guardian) { for (const b of w.buildings) if (b.ownerIds) b.ownerIds = b.ownerIds.filter(id => id !== n.id); n.homeId = guardian.homeId; n.position = { ...w.buildings.find(b => b.id === n.homeId)!.position }; }
  }
  initializeUrban(w); initializeHeritage(w, true);
  for (const n of w.npcs) syncEmployment(w, n, false);
  w.economy = createEconomy(w);
  return w;
}
