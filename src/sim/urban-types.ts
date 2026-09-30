export const GOODS = ['grain', 'stone', 'ore', 'tools', 'herbs', 'fiber', 'cloth', 'clothes', 'meals', 'furniture'] as const;
export type Good = typeof GOODS[number];
export type Goods = Record<Good, number>;
export const INDUSTRIES = ['field', 'quarry', 'mine', 'mill', 'smith', 'garden', 'weaving', 'tailoring', 'kitchen', 'joinery'] as const;
export type Industry = typeof INDUSTRIES[number];
export const SERVICES = ['road', 'water', 'sanitation', 'clinic', 'school'] as const;
export type Service = typeof SERVICES[number];
export interface Citizen {
  education: number; nutrition: number; stress: number; housing: number; trust: number;
  disease: number; injury: number; preference: number; skills: Record<'field' | 'quarry' | 'mine' | 'mill' | 'smith', number>;
  employer?: string; healthEventId?: string; income: number; expenses: number;
}
export interface Enterprise { id: string; settlementId: string; buildingId: string; kind: Industry; capacity: number; wage: number; workers: string[]; output: number; sourceEventId?: string }
export interface City {
  settlementId: string; fertility: number; deposits: { stone: number; ore: number }; initialDeposits: { stone: number; ore: number };
  goods: Goods; treasury: number; taxRate: number; priority: Service;
  services: Record<Service, number>; active: Record<Service, number>;
  pollution: number; collected: number; spent: number; policyEventId?: string; lastEventId?: string;
}
export interface Freight { id: string; from: string; to: string; good: Good; amount: number; coins: number; fee: number; path: { x: number; y: number }[]; progress: number; sourceEventId: string }
export interface UrbanSample { tick: number; settlementId: string; population: number; employed: number; housing: number; food: number; treasury: number; stress: number; sick: number; eventId: string }
export interface UrbanState {
  since: number; citizens: Record<string, Citizen>; cities: City[]; enterprises: Enterprise[]; freight: Freight[];
  buildings: Record<string, { condition: number; maintenance: number }>;
  ledger: { opening: Goods; produced: Goods; consumed: Goods }; samples: UrbanSample[];
}
export const emptyGoods = (): Goods => ({ grain: 0, stone: 0, ore: 0, tools: 0, herbs: 0, fiber: 0, cloth: 0, clothes: 0, meals: 0, furniture: 0 });
export const GOOD_LABELS: Record<Good, string> = { grain: '곡물', stone: '석재', ore: '광석', tools: '도구', herbs: '약초', fiber: '섬유', cloth: '직물', clothes: '옷', meals: '요리', furniture: '가구' };
export const INDUSTRY_LABELS: Record<Industry, string> = { field: '곡물 농장', quarry: '채석장', mine: '광산', mill: '제분소', smith: '도구 공방', garden: '약초·섬유밭', weaving: '직조소', tailoring: '재봉소', kitchen: '공동 부엌', joinery: '가구 공방' };
export const SERVICE_LABELS: Record<Service, string> = { road: '도로', water: '급수', sanitation: '위생', clinic: '진료', school: '교육' };

// Related crafts share transferable skills; each workplace still has a distinct recipe and profession.
export const INDUSTRY_SKILL: Record<Industry, keyof Citizen['skills']> = { field: 'field', quarry: 'quarry', mine: 'mine', mill: 'mill', smith: 'smith', garden: 'field', weaving: 'mill', tailoring: 'mill', kitchen: 'mill', joinery: 'smith' };
export const INDUSTRY_JOB: Record<Industry, import('./types').NPC['occupation']> = { field: 'farmer', quarry: 'mason', mine: 'miner', mill: 'miller', smith: 'smith', garden: 'gardener', weaving: 'weaver', tailoring: 'tailor', kitchen: 'cook', joinery: 'furniture_maker' };
export const GOOD_PRICES: Record<Good, number> = { grain: 2, stone: 2, ore: 2, tools: 4, herbs: 2, fiber: 2, cloth: 3, clothes: 5, meals: 3, furniture: 6 };
