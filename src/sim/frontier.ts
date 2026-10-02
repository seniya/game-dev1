import { z } from 'zod';
import type { WorldState, Position } from './types';
import { appendEvent } from './social';
import { findPath, walkable } from './pathfinding';
import { distance } from './random';
import { market, stocks } from './civilization';
const id = z.string().min(1).max(100),
  nat = z.number().int().nonnegative();
export const frontierSchema = z
  .object({
    protections: z.array(z.object({buildingId:id,sourceEventId:id,until:nat}).strict()).max(128).optional(),
    impact: z.array(z.object({settlementId:id,berries:nat,crops:nat,protectedDays:nat,since:nat}).strict()).max(12).optional(),
    animals: z
      .array(
        z
          .object({
            id,
            settlementId: id,
            species: z.enum(['hare', 'deer']),
            position: z.object({ x: nat, y: nat }).strict(),
            age: nat.max(30),
            hunger: nat.max(4),
          })
          .strict(),
      )
      .max(96),
    habitats: z
      .array(z.object({ settlementId: id, opening: nat, born: nat, lost: nat, lastEventId: id }).strict())
      .max(12),
  })
  .strict();
export type Frontier = z.infer<typeof frontierSchema>;
export function wildlifeDay(w: WorldState) {
  w.frontier ??= { animals: [], habitats: [] };
  const f = w.frontier;
  for (const v of w.civilization.settlements) {
    let h = f.habitats.find((h) => h.settlementId === v.id);
    if (!h) {
      const origin =
        w.resources.find((r) => r.kind === 'food' && distance(r.position, v.center) <= 25)?.position ?? v.center;
      for (const species of ['hare', 'deer'] as const)
        f.animals.push({
          id: `wild-${w.nextId++}`,
          settlementId: v.id,
          species,
          position: { ...origin },
          age: 0,
          hunger: 0,
        });
      const e = appendEvent(w, {
        kind: 'ecology',
        importance: 35,
        description: `${v.name} 주변에서 토끼와 사슴 두 마리의 관찰을 시작했다.`,
        data: { wildlife: true, settlementId: v.id, opening: 2 },
      });
      h = { settlementId: v.id, opening: 2, born: 0, lost: 0, lastEventId: e.id };
      f.habitats.push(h);
    }
    const residents = f.animals.filter((a) => a.settlementId === v.id),
      dead = new Set<string>();
    let consumed = 0,
      cropLoss = 0,
      born = 0;
    for (const a of residents) {
      a.age++;
      const food = w.resources
        .filter((r) => r.kind === 'food' && r.amount > 0 && distance(r.position, a.position) <= 16)
        .sort((a1, b) => distance(a1.position, a.position) - distance(b.position, a.position))[0];
      const farm = !food
        ? w.buildings
            .filter((b) => b.kind === 'farm' && b.settlementId === v.id && b.growth >= 1 && !f.protections?.some(p=>p.buildingId===b.id&&p.until>w.tick))
            .sort((a1, b) => distance(a1.position, a.position) - distance(b.position, a.position))[0]
        : undefined;
      const target = food ?? farm;
      let ate = false;
      if (target) {
        const path = findPath(w, a.position, target.position);
        if (path?.length) a.position = path[Math.min(path.length - 1, 2)];
        if (distance(a.position, target.position) === 0) {
          if (food) {
            food.amount--;
            consumed++;
          } else if (farm) {
            farm.growth--;
            cropLoss++;
          }
          ate = true;
        }
      }
      a.hunger = ate ? 0 : a.hunger + 1;
      if (a.hunger >= 4 || a.age >= 30) {
        dead.add(a.id);
        continue;
      }
      if (ate && a.age >= 3 && w.tick % (6 * 144) === 0 && residents.length + born < 8 && f.animals.length < 96) {
        f.animals.push({
          id: `wild-${w.nextId++}`,
          settlementId: v.id,
          species: a.species,
          position: { ...a.position },
          age: 0,
          hunger: 0,
        });
        born++;
      }
    }
    f.animals = f.animals.filter((a) => !dead.has(a.id));
    const impact=f.impact??=[];
    let total=impact.find(i=>i.settlementId===v.id);if(!total){total={settlementId:v.id,berries:0,crops:0,protectedDays:0,since:w.tick};impact.push(total);}
    total.berries+=consumed;total.crops+=cropLoss;total.protectedDays+=(f.protections??[]).filter(p=>p.until>w.tick&&w.buildings.some(b=>b.id===p.buildingId&&b.settlementId===v.id)).length;
    h.born += born;
    h.lost += dead.size;
    h.lastEventId = appendEvent(w, {
      kind: 'ecology',
      importance: born || dead.size || cropLoss ? 45 : 15,
      description: `${v.name} 야생동물 ${f.animals.filter((a) => a.settlementId === v.id).length}마리 · 출생 ${born}, 사망 ${dead.size}, 야생 열매 ${consumed}개와 미수확 작물 ${cropLoss}개를 먹었다.`,
      data: { wildlife: true, settlementId: v.id, born, lost: dead.size, consumed, cropLoss },
    }).id;
  }
}
export function validateFrontier(w: WorldState, ensure: (value: unknown, message: string) => void) {
  const f = w.frontier;
  if (!f) return;
  ensure(new Set((f.protections??[]).map(p=>p.buildingId)).size===(f.protections??[]).length,'야생동물 보호 중복');
  for(const p of f.protections??[])ensure(w.buildings.some(b=>b.id===p.buildingId&&b.kind==='farm')&&w.events.some(e=>e.id===p.sourceEventId&&e.locationId===p.buildingId),'야생동물 보호 근거');
  ensure(new Set((f.impact??[]).map(i=>i.settlementId)).size===(f.impact??[]).length,'야생동물 영향 중복');
  for(const i of f.impact??[])ensure(i.since<=w.tick&&w.civilization.settlements.some(v=>v.id===i.settlementId),'야생동물 영향 마을');
  const villages = new Set(w.civilization.settlements.map((v) => v.id));
  ensure(new Set(f.animals.map((a) => a.id)).size === f.animals.length, '야생동물 중복');
  ensure(
    f.animals.every((a) => /^wild-\d+$/.test(a.id) && Number(a.id.slice(5)) < w.nextId),
    '야생동물 ID',
  );
  ensure(
    f.habitats.every((h) => f.animals.filter((a) => a.settlementId === h.settlementId).length <= 8),
    '야생동물 지역 상한',
  );
  ensure(new Set(f.habitats.map((h) => h.settlementId)).size === f.habitats.length, '야생 서식지 중복');
  for (const a of f.animals)
    ensure(
      villages.has(a.settlementId) &&
        f.habitats.some((h) => h.settlementId === a.settlementId) &&
        walkable(w, a.position),
      '야생동물 위치·마을',
    );
  for (const h of f.habitats)
    ensure(
      villages.has(h.settlementId) &&
        h.opening + h.born - h.lost === f.animals.filter((a) => a.settlementId === h.settlementId).length &&
        w.events.some((e) => e.id === h.lastEventId && e.kind === 'ecology'),
      '야생동물 보존·근거',
    );
}
export function landQuote(w: WorldState, buildingId: string) {
  const b = w.buildings.find((b) => b.id === buildingId && b.kind === 'home');
  if (!b) throw new Error('마을 주택 부지를 찾을 수 없습니다.');
  const sellers = (b.ownerIds ?? []).map((id) => w.npcs.find((n) => n.id === id));
  const available = sellers.every((n) => n?.alive && n.identity.age >= 18 && n.homeId !== b.id);
  return { price: 20 * b.level, available, sellers: sellers.map((n) => n!.id) };
}
export function tradeLand(w: WorldState, buildingId: string, buyerId: string, price: number) {
  const b = w.buildings.find((b) => b.id === buildingId),
    buyer = w.npcs.find((n) => n.id === buyerId && n.alive),
    quote = landQuote(w, buildingId);
  if (
    !b ||
    !buyer ||
    buyer.identity.age < 18 ||
    buyer.settlementId !== b.settlementId ||
    !quote.available ||
    quote.sellers.includes(buyerId) ||
    price !== quote.price ||
    buyer.wealth < price
  )
    throw new Error('마을 부지 거래의 소유권·가격·자금 조건이 바뀌었습니다.');
  buyer.wealth -= price;
  w.urban.citizens[buyer.id].expenses += price;
  if (!quote.sellers.length) market(w, b.settlementId!).coins += price;
  else
    quote.sellers.forEach((id, i) => {
      const n = w.npcs.find((n) => n.id === id)!;
      const paid = Math.floor(price / quote.sellers.length) + (i < price % quote.sellers.length ? 1 : 0);
      n.wealth += paid;
      w.urban.citizens[n.id].income += paid;
    });
  b.ownerIds = [buyerId];
  appendEvent(w, {
    kind: 'trade',
    actorId: buyerId,
    participants: [buyerId, ...quote.sellers],
    locationId: b.id,
    importance: 60,
    description: `${buyer.identity.name}이 ${b.name}의 부지와 주택 소유권을 ${price}코인에 매입했다. 기존 거주자는 계속 거주한다.`,
    data: { land: true, price, sellers: quote.sellers, settlementId: b.settlementId! },
  });
}
export function buildPosition(w: WorldState, villageId: string, p: Position, projectId?:string) {
  const v = w.civilization.settlements.find((v) => v.id === villageId);
  return (
    !!v &&
    Number.isInteger(p.x) &&
    Number.isInteger(p.y) &&
    walkable(w, p) &&
    w.tiles[p.y * w.width + p.x] === 'grass' &&
    distance(v.center, p) <= 24 &&
    !w.buildings.some((b) => distance(b.position, p) === 0) &&
    !w.resources.some((r) => distance(r.position, p) === 0) &&
    !(w.construction?.projects.some(site=>!site.buildingId&&site.id!==projectId&&distance(site.position,p)===0)) &&
    !!findPath(w, v.center, p) &&
    w.civilization.settlements.every((other) => other.id === v.id || distance(v.center, p) <= distance(other.center, p))
  );
}

export function protectFarm(w:WorldState,buildingId:string) {
 const b=w.buildings.find(b=>b.id===buildingId&&b.kind==='farm');if(!b)throw new Error('마을 농장을 찾을 수 없습니다.');
 w.frontier??={animals:[],habitats:[]};const f=w.frontier,stock=stocks(w,b.settlementId!);
 if(stock.wood<4 || f.protections?.some(p=>p.buildingId===b.id&&p.until>w.tick))throw new Error('마을 농장 울타리의 목재가 부족하거나 아직 보호 중입니다.');
 f.protections=(f.protections??[]).filter(p=>p.until>w.tick);if(f.protections.length>=128)throw new Error('마을 울타리 상한입니다.');
 stock.wood-=4;w.economy.totals.investedWood+=4;
 const e=appendEvent(w,{kind:'ecology',locationId:b.id,importance:45,description:`${b.name}에 공동 목재 4개로 울타리를 설치했다. 30일 동안 야생동물이 이 농장의 미수확 작물을 먹지 못한다.`,data:{protection:true,wood:4,until:w.tick+30*144,settlementId:b.settlementId!}});
 f.protections.push({buildingId:b.id,sourceEventId:e.id,until:w.tick+30*144});
}
