export const TICKS_PER_DAY = 144;
export type Position = { x: number; y: number };
export type Resources = { food: number; wood: number };
export type Tile = 'grass' | 'water' | 'path' | 'forest' | 'rock' | 'farm';
export type BuildingKind = 'home' | 'storage' | 'farm' | 'market' | 'well';
export interface Building { id: string; kind: BuildingKind; name: string; position: Position; level: number; growth: number }
export interface ResourceNode { id: string; position: Position; kind: 'food' | 'wood'; amount: number; capacity: number }
export interface Needs { hunger: number; thirst: number; fatigue: number; health: number; safety: number; social: number }
export interface Personality { diligence: number; greed: number; sociability: number; aggression: number; empathy: number; curiosity: number }
export type GoalKind = 'secure_food' | 'help_neighbor' | 'earn_wealth' | 'expand_farm' | 'secure_storage' | 'build_home' | 'make_friend';
export const GOAL_KINDS: GoalKind[] = ['secure_food', 'help_neighbor', 'earn_wealth', 'expand_farm', 'secure_storage', 'build_home', 'make_friend'];
export const GOAL_LABELS: Record<GoalKind, string> = { secure_food: '충분한 식량 확보', help_neighbor: '어려운 이웃 돕기', earn_wealth: '재산 모으기', expand_farm: '농장 확장하기', secure_storage: '창고 보안 강화', build_home: '집 개선하기', make_friend: '믿을 만한 친구 만들기' };
export interface Goal { id: string; kind: GoalKind; reason: string; createdAt: number; sourceEventId?: string }
export type ActionKind = 'Idle' | 'Move' | 'Sleep' | 'Eat' | 'Drink' | 'Gather' | 'Work' | 'Talk' | 'StoreItem' | 'TakeItem' | 'Share' | 'Theft' | 'Trade' | 'Borrow' | 'Repay';
export const ACTION_LABELS: Record<ActionKind, string> = { Idle: '쉬기', Move: '이동', Sleep: '잠자기', Eat: '식사', Drink: '물 마시기', Gather: '채집', Work: '일하기', Talk: '대화', StoreItem: '자원 보관', TakeItem: '식량 인출', Share: '식량 나누기', Theft: '식량 훔치기', Trade: '거래', Borrow: '식량 빌리기', Repay: '빚 갚기' };
export interface Candidate { kind: ActionKind; score: number; reason: string; target: Position; targetId?: string }
export interface Action extends Candidate { path: Position[]; progress: number; duration: number }
export interface Relationship { npcId: string; familiarity: number; trust: number; affection: number; fear: number; resentment: number; respect: number; family: boolean; interpretation: string; evidence: string[] }
export interface Memory { id: string; type: 'personal' | 'social' | 'event' | 'economic' | 'trauma' | 'achievement'; description: string; importance: number; emotionalImpact: number; createdAt: number; relatedNpcIds: string[]; relatedLocationIds: string[]; sourceEventId: string; repetitions: number }
export interface NPC {
  id: string; identity: { name: string; age: number }; position: Position; homeId: string;
  occupation: 'farmer' | 'gatherer' | 'woodcutter' | 'carpenter' | 'merchant'; alive: boolean;
  needs: Needs; personality: Personality; inventory: Resources; wealth: number;
  relationships: Relationship[]; memories: Memory[]; goals: Goal[];
  currentAction?: Action; decision: { reason: string; candidates: Candidate[]; tick: number };
  dailyTaken: number; lastTalk: number; knownRumors: string[];
}
export const OCCUPATIONS: Record<NPC['occupation'], string> = { farmer: '농부', gatherer: '채집가', woodcutter: '나무꾼', carpenter: '목수', merchant: '상인' };
export type EventKind = 'arrival' | 'production' | 'consumption' | 'storage' | 'trade' | 'loan' | 'repayment' | 'default' | 'share' | 'theft' | 'witness' | 'rumor' | 'talk' | 'scarcity' | 'health' | 'death' | 'weather' | 'relationship' | 'memory' | 'goal' | 'llm' | 'experiment' | 'failure' | 'project';
export interface WorldEvent { id: string; tick: number; kind: EventKind; actorId?: string; targetId?: string; locationId?: string; participants: string[]; importance: number; description: string; causeId?: string; data: Record<string, string | number | boolean | string[]> }
export interface Loan { id: string; lenderId: string; borrowerId: string; amount: number; due: number; status: 'active' | 'repaid' | 'defaulted'; sourceEventId: string }
export interface DecisionRequest { id: string; npcId: string; eventId: string; tick: number; attempts: number }
export interface LLMState { enabled: boolean; queue: DecisionRequest[]; gateKeys: string[]; dailyByNpc: Record<string, number>; dailyTotal: number; requested: number; completed: number; rejected: number; failed: number }
export interface WorldState {
  version: 1; seed: number; rng: number; tick: number; nextId: number; width: number; height: number;
  tiles: Tile[]; buildings: Building[]; resources: ResourceNode[]; npcs: NPC[];
  storage: Resources; market: Resources & { coins: number; foodPrice: number; woodPrice: number };
  weather: 'sunny' | 'rain' | 'cloudy' | 'drought'; droughtUntil: number;
  events: WorldEvent[]; loans: Loan[]; llm: LLMState;
  stats: { foodSum: number; samples: number; deaths: number; thefts: number; shares: number; conflicts: number };
}
export interface Interpretation { newGoals: { kind: GoalKind; reason: string }[]; interpretation: string; relationshipInterpretations: { npcId: string; meaning: string }[] }
export interface NPCContext { npc: NPC; event: WorldEvent; allowedGoals: GoalKind[]; tick: number }
export interface DialogueContext { speaker: NPC; listener: NPC; memories: Memory[] }
export interface DialogueResult { text: string }
