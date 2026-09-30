import type { RecollectionTopic } from './recollection';
import type { Heritage } from './heritage';
import type { UrbanState } from './urban-types';
export const DEFAULT_POPULATION = 12;
export const TICKS_PER_DAY = 144;
export type Position = { x: number; y: number };
export type Resources = { food: number; wood: number };
export type Tile = 'grass' | 'water' | 'path' | 'forest' | 'rock' | 'farm';
export type BuildingKind = 'home' | 'storage' | 'farm' | 'market' | 'well';
export interface Building { id: string; kind: BuildingKind; name: string; position: Position; level: number; growth: number; settlementId?: string; ownerIds?: string[] }
export interface ResourceNode { id: string; position: Position; kind: 'food' | 'wood'; amount: number; capacity: number }
export interface Needs { hunger: number; thirst: number; fatigue: number; health: number; safety: number; social: number }
export interface Personality { diligence: number; greed: number; sociability: number; aggression: number; empathy: number; curiosity: number }
export type GoalKind = 'secure_food' | 'help_neighbor' | 'earn_wealth' | 'expand_farm' | 'secure_storage' | 'build_home' | 'make_friend';
export const GOAL_KINDS: GoalKind[] = ['secure_food', 'help_neighbor', 'earn_wealth', 'expand_farm', 'secure_storage', 'build_home', 'make_friend'];
export const GOAL_LABELS: Record<GoalKind, string> = { secure_food: '충분한 식량 확보', help_neighbor: '어려운 이웃 돕기', earn_wealth: '재산 모으기', expand_farm: '농장 확장하기', secure_storage: '창고 보안 강화', build_home: '집 개선하기', make_friend: '믿을 만한 친구 만들기' };
export interface Goal { id: string; kind: GoalKind; reason: string; createdAt: number; sourceEventId?: string }
export type ActionKind = 'Wash' | 'Idle' | 'Move' | 'Sleep' | 'Eat' | 'Drink' | 'Gather' | 'Work' | 'Talk' | 'StoreItem' | 'TakeItem' | 'Share' | 'Theft' | 'Trade' | 'Borrow' | 'Repay';
export const ACTION_LABELS: Record<ActionKind, string> = { Wash: '씻기', Idle: '쉬기', Move: '이동', Sleep: '잠자기', Eat: '식사', Drink: '물 마시기', Gather: '채집', Work: '일하기', Talk: '대화', StoreItem: '자원 보관', TakeItem: '식량 인출', Share: '식량 나누기', Theft: '식량 훔치기', Trade: '거래', Borrow: '식량 빌리기', Repay: '빚 갚기' };
export interface Candidate { kind: ActionKind; score: number; reason: string; target: Position; targetId?: string; evidence?: string[] }
export interface Action extends Candidate { path: Position[]; progress: number; duration: number }
export interface Relationship { npcId: string; familiarity: number; trust: number; affection: number; fear: number; resentment: number; respect: number; family: boolean; interpretation: string; evidence: string[] }
export interface Memory { id: string; type: 'personal' | 'social' | 'event' | 'economic' | 'trauma' | 'achievement'; description: string; importance: number; emotionalImpact: number; createdAt: number; relatedNpcIds: string[]; relatedLocationIds: string[]; sourceEventId: string; repetitions: number }
export interface NPC {
  profile?: { commandId?: string; background: string; appearance: import('./character-schema').Appearance; createdAt: number; arrivalEventId: string };
  id: string; identity: { name: string; age: number }; position: Position; homeId: string;
  life: Life; settlementId: string;
  occupation: Occupation; previousOccupation?: Occupation; alive: boolean;
  needs: Needs; personality: Personality; inventory: Resources; wealth: number;
  relationships: Relationship[]; memories: Memory[]; goals: Goal[];
  currentAction?: Action; decision: { reason: string; candidates: Candidate[]; tick: number };
  dailyTaken: number; lastTalk: number; knownRumors: string[];
}
export type Occupation = 'farmer' | 'gatherer' | 'woodcutter' | 'carpenter' | 'merchant' | 'miner' | 'mason' | 'miller' | 'smith' | 'gardener' | 'weaver' | 'tailor' | 'cook' | 'furniture_maker' | 'vegetable_grower' | 'orchardist' | 'fisher' | 'herder' | 'clay_digger' | 'salt_worker' | 'baker' | 'preserver' | 'cheesemaker' | 'potter' | 'blanket_maker' | 'herbalist' | 'none';
export const OCCUPATIONS: Record<NPC['occupation'], string> = { farmer: '농부', gatherer: '채집가', woodcutter: '나무꾼', carpenter: '목수', merchant: '상인', miner: '광부', mason: '석공', miller: '제분사', smith: '대장장이', gardener: '원예사', weaver: '직조공', tailor: '재봉사', cook: '요리사', furniture_maker: '가구장인', vegetable_grower: '채소농부', orchardist: '과수농부', fisher: '어부', herder: '목축업자', clay_digger: '점토채굴공', salt_worker: '소금채굴공', baker: '제빵사', preserver: '식품가공사', cheesemaker: '치즈장인', potter: '도공', blanket_maker: '담요장인', herbalist: '약제사', none: '무직' };
export type EventKind = 'arrival' | 'production' | 'consumption' | 'storage' | 'trade' | 'loan' | 'repayment' | 'default' | 'share' | 'theft' | 'witness' | 'rumor' | 'talk' | 'scarcity' | 'health' | 'death' | 'weather' | 'relationship' | 'memory' | 'goal' | 'llm' | 'experiment' | 'failure' | 'project' | 'wage' | 'price' | 'family' | 'birth' | 'coming_of_age' | 'inheritance' | 'education' | 'construction' | 'settlement' | 'migration' | 'caravan' | 'occupation' | 'industry' | 'public_service' | 'tax' | 'urban' | 'policy' | 'freight' | 'ecology' | 'council' | 'diplomacy';
export interface WorldEvent { id: string; tick: number; kind: EventKind; actorId?: string; targetId?: string; locationId?: string; participants: string[]; importance: number; description: string; causeId?: string; data: Record<string, string | number | boolean | string[]> }
export interface Loan { id: string; lenderId: string; borrowerId: string; amount: number; remaining: number; due: number; status: 'active' | 'repaid' | 'defaulted'; sourceEventId: string }
export interface DecisionRequest { id: string; npcId: string; eventId: string; tick: number; attempts: number }
export interface LLMState { enabled: boolean; queue: DecisionRequest[]; gateKeys: string[]; dailyByNpc: Record<string, number>; dailyTotal: number; requested: number; completed: number; rejected: number; failed: number }
export interface WorldState {
  version: 7; living: import('./living-types').LivingState; heritage: Heritage; urban: UrbanState; civilization: Civilization; seed: number; rng: number; tick: number; nextId: number; width: number; height: number;
  tiles: Tile[]; buildings: Building[]; resources: ResourceNode[]; npcs: NPC[];
  storage: Resources; market: Resources & { coins: number; foodPrice: number; woodPrice: number };
  weather: 'sunny' | 'rain' | 'cloudy' | 'drought'; droughtUntil: number;
  economy: Economy;
  events: WorldEvent[]; loans: Loan[]; llm: LLMState;
  stats: { foodSum: number; samples: number; deaths: number; thefts: number; shares: number; conflicts: number };
}
export interface Interpretation { newGoals: { kind: GoalKind; reason: string }[]; interpretation: string; relationshipInterpretations: { npcId: string; meaning: string }[] }
export interface NPCContext { npc: NPC; event: WorldEvent; allowedGoals: GoalKind[]; tick: number }
export interface DialogueContext { topic?: RecollectionTopic; speaker: NPC; listener: NPC; memories: Memory[] }
export interface DialogueResult { text: string }

export interface EconomyFlow { producedFood: number; producedWood: number; consumedFood: number; investedWood: number; externalFood: number; trades: number; tradeVolume: number; wages: number }
export interface DailySample extends EconomyFlow { day: number; tick: number; population: number; food: number; storageFood: number; foodPrice: number; coins: number; poorest: number; median: number; richest: number; shares: number; conflicts: number; eventId: string }
export interface Economy { arrivals?: { food: number; wood: number; coins: number }; since: number; openingFood: number; openingWood: number; openingCoins: number; totals: EconomyFlow; daily: DailySample[]; last: EconomyFlow & { shares: number; conflicts: number } }

export const DAYS_PER_YEAR = 12;
export const YEAR_TICKS = DAYS_PER_YEAR * TICKS_PER_DAY;
export const MAX_POPULATION = 3000;
export interface Life {
  bornTick: number; parentIds: string[]; partnerId?: string; generation: number;
  skill: number; lastBirth: number; lastMove: number; deathTick?: number;
  birthEventId?: string; deathEventId?: string; estateSettled: boolean;
}
export interface Settlement {
  id: string; name: string; center: Position; foundedAt: number; sourceEventId?: string;
  storage: Resources; market: WorldState['market'];
}
export interface Journey {
  id: string; kind: 'migration' | 'trade'; from: string; to: string;
  npcIds: string[]; path: Position[]; progress: number; food: number; coins: number;
  sourceEventId: string; homeId?: string;
}
export interface Civilization {
  settlements: Settlement[]; journeys: Journey[]; focus: string; detail: 'full' | 'focused';
}
