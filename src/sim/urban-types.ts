export const GOODS = ['grain', 'stone', 'ore', 'tools', 'herbs', 'fiber', 'cloth', 'clothes', 'meals', 'furniture', 'vegetables', 'fruit', 'fish', 'meat', 'milk', 'wool', 'clay', 'salt', 'bread', 'dried_fish', 'cheese', 'pottery', 'blankets', 'medicine', 'stew'] as const;
export type Good = typeof GOODS[number];
export type Goods = Record<Good, number>;
export const INDUSTRIES = ['field', 'quarry', 'mine', 'mill', 'smith', 'garden', 'weaving', 'tailoring', 'kitchen', 'joinery', 'vegetable_farm', 'orchard', 'fishery', 'pasture', 'clay_pit', 'saltworks', 'bakery', 'preserving', 'dairy', 'pottery', 'blanket_workshop', 'apothecary', 'cookhouse'] as const;
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
  settlementId: string; fertility: number; deposits: Record<Mineral, number>; initialDeposits: Record<Mineral, number>;
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
export const emptyGoods = (): Goods => Object.fromEntries(GOODS.map(g => [g, 0])) as Goods;
export const GOOD_LABELS: Record<Good, string> = { grain: '곡물', stone: '석재', ore: '광석', tools: '도구', herbs: '약초', fiber: '섬유', cloth: '직물', clothes: '옷', meals: '요리', furniture: '가구', vegetables: '채소', fruit: '과일', fish: '생선', meat: '고기', milk: '우유', wool: '양모', clay: '점토', salt: '소금', bread: '빵', dried_fish: '건어물', cheese: '치즈', pottery: '도자기', blankets: '담요', medicine: '약품', stew: '스튜' };
export const INDUSTRY_LABELS: Record<Industry, string> = { field: '곡물 농장', quarry: '채석장', mine: '광산', mill: '제분소', smith: '도구 공방', garden: '약초·섬유밭', weaving: '직조소', tailoring: '재봉소', kitchen: '공동 부엌', joinery: '가구 공방', vegetable_farm: '채소밭', orchard: '과수원', fishery: '양어장', pasture: '목축장', clay_pit: '점토 채굴장', saltworks: '암염 채굴장', bakery: '제빵소', preserving: '식품 보존소', dairy: '유제품 공방', pottery: '도자기 공방', blanket_workshop: '담요 공방', cookhouse: '스튜 부엌', apothecary: '약방' };
export const SERVICE_LABELS: Record<Service, string> = { road: '도로', water: '급수', sanitation: '위생', clinic: '진료', school: '교육' };

// Related crafts share transferable skills; each workplace still has a distinct recipe and profession.
export const INDUSTRY_SKILL: Record<Industry, keyof Citizen['skills']> = { field: 'field', quarry: 'quarry', mine: 'mine', mill: 'mill', smith: 'smith', garden: 'field', weaving: 'mill', tailoring: 'mill', kitchen: 'mill', joinery: 'smith', vegetable_farm: 'field', orchard: 'field', fishery: 'field', pasture: 'field', clay_pit: 'quarry', saltworks: 'mine', bakery: 'mill', preserving: 'mill', dairy: 'mill', pottery: 'smith', blanket_workshop: 'mill', cookhouse: 'mill', apothecary: 'mill' };
export const INDUSTRY_JOB: Record<Industry, import('./types').NPC['occupation']> = { field: 'farmer', quarry: 'mason', mine: 'miner', mill: 'miller', smith: 'smith', garden: 'gardener', weaving: 'weaver', tailoring: 'tailor', kitchen: 'cook', joinery: 'furniture_maker', vegetable_farm: 'vegetable_grower', orchard: 'orchardist', fishery: 'fisher', pasture: 'herder', clay_pit: 'clay_digger', saltworks: 'salt_worker', bakery: 'baker', preserving: 'preserver', dairy: 'cheesemaker', pottery: 'potter', blanket_workshop: 'blanket_maker', cookhouse: 'cook', apothecary: 'herbalist' };
export const GOOD_PRICES: Record<Good, number> = { grain: 2, stone: 2, ore: 2, tools: 4, herbs: 2, fiber: 2, cloth: 3, clothes: 5, meals: 3, furniture: 6, vegetables: 2, fruit: 2, fish: 2, meat: 2, milk: 2, wool: 2, clay: 2, salt: 2, bread: 4, dried_fish: 4, cheese: 4, pottery: 4, blankets: 4, medicine: 4, stew: 4 };

// Raw materials have their own production, inventory and ledger entries. Legacy food is a prepared ration.
export const RAW_GOODS = ['grain', 'stone', 'ore', 'herbs', 'fiber', 'vegetables', 'fruit', 'fish', 'meat', 'milk', 'wool', 'clay', 'salt'] as const;
export const BASIC_RESOURCE_LABELS = { wood: '목재', ...Object.fromEntries(RAW_GOODS.map(g => [g, GOOD_LABELS[g]])) };
export const PRODUCTS = GOODS.filter(g => !(RAW_GOODS as readonly string[]).includes(g));
export const MINERALS = ['stone', 'ore', 'clay', 'salt'] as const;
export type Mineral = typeof MINERALS[number];
export interface Recipe { inputs: Partial<Goods>; outputs: Partial<Goods>; growth?: number; deposit?: Mineral; wood?: number }
export const EXTRA_RECIPES: Partial<Record<Industry, Recipe>> = {
  vegetable_farm: { inputs: {}, outputs: { vegetables: 3 }, growth: 3 },
  orchard: { inputs: {}, outputs: { fruit: 3 }, growth: 3 },
  fishery: { inputs: {}, outputs: { fish: 2 }, growth: 2 },
  pasture: { inputs: { grain: 2 }, outputs: { meat: 1, milk: 2, wool: 1 }, growth: 2 },
  clay_pit: { inputs: {}, outputs: { clay: 2 }, deposit: 'clay' },
  saltworks: { inputs: {}, outputs: { salt: 2 }, deposit: 'salt' },
  bakery: { inputs: { grain: 2, milk: 1 }, outputs: { bread: 3 }, wood: 1 },
  preserving: { inputs: { fish: 2, salt: 1 }, outputs: { dried_fish: 2 } },
  dairy: { inputs: { milk: 2, salt: 1 }, outputs: { cheese: 2 } },
  pottery: { inputs: { clay: 3 }, outputs: { pottery: 2 }, wood: 1 },
  blanket_workshop: { inputs: { wool: 2, cloth: 1 }, outputs: { blankets: 1 } },
  cookhouse: { inputs: { meat: 1, vegetables: 2, salt: 1 }, outputs: { stew: 3 }, wood: 1 },
  apothecary: { inputs: { herbs: 2, pottery: 1 }, outputs: { medicine: 2 } },
};
export const isGrowingIndustry = (kind: Industry) => kind === 'field' || kind === 'garden' || !!EXTRA_RECIPES[kind]?.growth;
