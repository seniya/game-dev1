import { newPhysique, physiologyDay } from './physiology';
import { chooseGrownCareer, rememberGrowth } from './growth';
import { occupationAllowed } from './development';
import { inheritBusinesses } from './family-enterprise';
import { learnFamilyTrade, chooseFamilyTrade } from './legacy-learning';
import { household } from './spatial';
import { syncEmployment } from './employment';
import { newLivingPerson } from './living';
import { newCitizen } from './urban';
import { findPath } from './pathfinding';
import { type WorldState, type NPC, YEAR_TICKS, MAX_POPULATION } from './types';
import { appendEvent, socialEvent, relationship, eventById } from './social';
import { clamp, distance } from './random';
import { stocks, market, capacity, isTravelling } from './civilization';

export function related(w: WorldState, a: NPC, b: NPC): boolean {
  const ancestors = (n: NPC) => {
    const ids = new Set([n.id]), queue = [...n.life.parentIds];
    for (let i = 0; i < queue.length; i++) if (!ids.has(queue[i])) { ids.add(queue[i]); queue.push(...(w.npcs.find(p => p.id === queue[i])?.life.parentIds ?? [])); }
    return ids;
  };
  const aa = ancestors(a); return [...ancestors(b)].some(id => aa.has(id));
}
export function mutualAffection(a: NPC, b: NPC): boolean {
  return [a.relationships.find(r=>r.npcId===b.id),b.relationships.find(r=>r.npcId===a.id)].every(r=>r && r.trust>=60 && r.affection>=60 && r.fear<25 && r.resentment<25);
}
export function romanticPair(w: WorldState, a: NPC, b: NPC): boolean {
  return a.alive && b.alive && a.id!==b.id && a.identity.age>=18 && b.identity.age>=18 &&
    !!a.physique && !!b.physique && a.physique.sex!==b.physique.sex &&
    (!a.life.partnerId || a.life.partnerId===b.id) && (!b.life.partnerId || b.life.partnerId===a.id) &&
    a.settlementId===b.settlementId && !isTravelling(w,a) && !isTravelling(w,b) && !related(w,a,b) && mutualAffection(a,b);
}
export function shareAffection(w: WorldState, a: NPC, b: NPC) {
  if (!romanticPair(w,a,b)) return;
  const bond=relationship(a,b.id), reverse=relationship(b,a.id);
  const previous=[...bond.evidence].reverse().map(id=>eventById(w,id)).find(e=>e?.data.romanticAffection===true && e.participants.includes(b.id));
  if(previous && w.tick-previous.tick<144*3)return previous;
  const e=socialEvent(w,{kind:'relationship',actorId:a.id,targetId:b.id,importance:55,
    description:`${a.identity.name}과 ${b.identity.name}이 서로의 마음을 확인하고 손을 잡으며 애정을 나누었다.`,
    data:{romanticAffection:true,affection:bond.affection,reverseAffection:reverse.affection,trust:bond.trust,reverseTrust:reverse.trust,evidence:[...new Set([...bond.evidence.slice(-3),...reverse.evidence.slice(-3)])]}});
  bond.evidence.push(e.id);reverse.evidence.push(e.id);
  a.needs.social=clamp(a.needs.social+8);b.needs.social=clamp(b.needs.social+8);
  return e;
}
export function formFamily(w: WorldState, a: NPC, b: NPC): boolean {
  if (a.life.partnerId || b.life.partnerId || !romanticPair(w,a,b)) return false;
  const bond = relationship(a, b.id), reverse = relationship(b, a.id);
  const occupancy = new Map<string, number>();
  for (const n of w.npcs) if (n.alive && n.id !== a.id && n.id !== b.id) occupancy.set(n.homeId, (occupancy.get(n.homeId) ?? 0) + 1);
  const home = w.buildings.filter(h => h.kind === 'home' && h.settlementId === a.settlementId).sort((h, j) => (occupancy.get(h.id) ?? 0) - (occupancy.get(j.id) ?? 0)).find(h => (occupancy.get(h.id) ?? 0) + 2 <= capacity(h));
  if (!home) return false;
  const affection = shareAffection(w,a,b)!;
  a.life.partnerId = b.id; b.life.partnerId = a.id;
  a.homeId = b.homeId = home.id; a.currentAction = b.currentAction = undefined;
  home.ownerIds = [...new Set([...(home.ownerIds ?? []), a.id, b.id])]; bond.family = reverse.family = true;
  const e = socialEvent(w, { kind: 'family', causeId: affection.id, actorId: a.id, targetId: b.id, locationId: home.id, importance: 60, description: `${a.identity.name}과 ${b.identity.name}이 서로의 신뢰와 애정을 바탕으로 가족을 이루었다.`, data: { homeId: home.id, trust: bond.trust, affection: bond.affection, reverseTrust: reverse.trust, reverseAffection: reverse.affection, evidence: [...new Set([...bond.evidence.slice(-4), ...reverse.evidence.slice(-4)])] } });
  bond.evidence.push(e.id); reverse.evidence.push(e.id); return true;
}
export function giveBirth(w: WorldState, a: NPC, b: NPC): NPC | undefined {
  if (!romanticPair(w,a,b) || a.life.partnerId !== b.id || b.life.partnerId !== a.id || a.homeId !== b.homeId || a.settlementId !== b.settlementId || [a, b].some(n => n.identity.age < 18 || n.identity.age > 45 || n.needs.health < 65 || n.needs.hunger > 60 || w.tick - n.life.lastBirth < YEAR_TICKS * 2 || isTravelling(w, n))) return;
  if (w.npcs.filter(n => n.alive).length >= MAX_POPULATION || w.npcs.length >= 30000) return;
  const home = w.buildings.find(h => h.id === a.homeId)!, family = w.npcs.filter(n => n.alive && n.homeId === home.id), stock = stocks(w, a.settlementId);
  if (family.length >= capacity(home) || stock.food + a.inventory.food + b.inventory.food < (family.length + 1) * 4) return;
  // Birth consumes actual food; the child starts with no minted property or currency.
  let cost = 2;
  for (const inv of [a.inventory, b.inventory, stock]) { const take = Math.min(cost, inv.food); inv.food -= take; cost -= take; }
  w.economy.totals.consumedFood += 2;
  const id = `npc-born-${w.nextId++}`;
  const personality = { ...a.personality }; for (const key of Object.keys(personality) as (keyof typeof personality)[]) personality[key] = (a.personality[key] + b.personality[key]) / 2;
  const physique = newPhysique(w.seed,id,0);
  physique.diseaseResistance = Math.round((a.physique!.diseaseResistance+b.physique!.diseaseResistance+physique.diseaseResistance)/3);
  physique.adultHeightCm = Math.round((a.physique!.adultHeightCm+b.physique!.adultHeightCm+physique.adultHeightCm)/3);
  const child: NPC = {
    physique: newPhysique(w.seed,id,0,{sex:physique.sex,adultHeightCm:physique.adultHeightCm,diseaseResistance:physique.diseaseResistance}),
    id, identity: { name: `새봄${w.nextId}`, age: 0 }, position: { ...home.position }, homeId: home.id, settlementId: a.settlementId,
    life: { bornTick: w.tick, parentIds: [a.id, b.id], generation: Math.max(a.life.generation, b.life.generation) + 1, skill: 0, lastBirth: w.tick, lastMove: w.tick, estateSettled: false },
    occupation: 'none', alive: true, needs: { hunger: 10, thirst: 0, fatigue: 0, health: 100, safety: 90, social: 80 }, personality,
    inventory: { food: 0, wood: 0 }, wealth: 0, relationships: [], memories: [], goals: [], decision: { reason: '가족의 돌봄을 받으며 자란다.', candidates: [], tick: w.tick }, dailyTaken: 0, lastTalk: -100, knownRumors: []
  };
  w.npcs.push(child); w.living.people[child.id] = newLivingPerson(child);
  for (const key of Object.keys(w.living.people[child.id].traits) as (keyof typeof w.living.people[string]['traits'])[]) w.living.people[child.id].traits[key] = (w.living.people[a.id].traits[key] + w.living.people[b.id].traits[key]) / 2;
  w.urban.citizens[child.id] = newCitizen(child); a.life.lastBirth = b.life.lastBirth = w.tick;
  const familyEvent = [...relationship(a, b.id).evidence].reverse().find(id => eventById(w,id)?.kind === 'family');
  const e = socialEvent(w, { kind: 'birth', causeId: familyEvent, actorId: child.id, participants: [child.id, a.id, b.id], locationId: home.id, importance: 60, description: `${a.identity.name}과 ${b.identity.name}의 가족에 ${child.identity.name}이 태어났다.`, data: { parents: [a.id, b.id], generation: child.life.generation, consumedFood: 2 } }); child.life.birthEventId = e.id;
  for (const parent of [a, b]) { const r = relationship(parent, child.id), reverse = relationship(child, parent.id); r.family = reverse.family = true; r.trust = reverse.trust = 80; r.affection = reverse.affection = 70; r.evidence.push(e.id); reverse.evidence.push(e.id); }
  return child;
}
export function careForChild(w: WorldState, n: NPC) {
  if (n.identity.age >= 18 || isTravelling(w, n)) return false;
  const caregivers = household(w,n.homeId).filter(p => p.alive && p.identity.age >= 18 && p.homeId === n.homeId && !isTravelling(w, p));
  const home = w.buildings.find(h => h.id === n.homeId)!;
  // Children remain at home; no adult work, debt, theft or market actions.
  const route = findPath(w, n.position, home.position);
  if (route?.length) n.position = { ...route[0] };
  n.currentAction = undefined;
  if (!route || route.length > 1) return true;
  if (caregivers.length) {
    n.needs.thirst = clamp(n.needs.thirst - 2); n.needs.fatigue = clamp(n.needs.fatigue - 2); n.needs.social = clamp(n.needs.social + .5);
    if (n.needs.hunger > 38) {
      const donor = caregivers.find(p => p.inventory.food > 1), stock = stocks(w, n.settlementId), own = n.inventory.food > 0;
      const inventory = own ? n.inventory : donor?.inventory ?? stock;
      if (inventory.food > 0) {
        inventory.food--; w.economy.totals.consumedFood++; n.needs.hunger = clamp(n.needs.hunger - 38);
        appendEvent(w, { kind: 'consumption', actorId: n.id, targetId: donor?.id, causeId: n.life.birthEventId, importance: 20, description: `${n.identity.name}이 가족의 돌봄으로 식량 1개를 먹었다.`, data: { amount: 1, resource: 'food', caregiver: donor?.id ?? caregivers[0].id } });
      }
    }
  }
  n.decision = { reason: caregivers.length ? '같은 집의 어른이 식사·물·휴식을 돌본다.' : '함께 사는 보호자가 없어 돌봄이 필요하다.', candidates: [], tick: w.tick };
  return true;
}
export function settleEstate(w: WorldState, n: NPC, causeId: string) {
  if (n.life.estateSettled) return;
  n.life.estateSettled = true;
  const children = w.npcs.filter(p => p.alive && p.life.parentIds.includes(n.id));
  const partner = w.npcs.find(p => p.alive && p.id === n.life.partnerId);
  const heirs = [...children, ...(partner ? [partner] : [])].sort((a, b) => a.id.localeCompare(b.id));
  const recipient = heirs[0];
  inheritBusinesses(w,n,heirs,causeId);
  // Pay food-denominated liabilities from the estate first; record unpaid debt explicitly.
  for (const loan of w.loans.filter(l => l.status !== 'repaid' && (l.borrowerId === n.id || l.lenderId === n.id))) {
    if (loan.borrowerId === n.id) {
      const lender = w.npcs.find(p => p.id === loan.lenderId)!, paid = Math.min(n.inventory.food, loan.remaining), forgiven = loan.remaining - paid;
      n.inventory.food -= paid; (lender.alive ? lender.inventory : stocks(w, lender.settlementId)).food += paid;
      loan.remaining = 0; loan.status = 'repaid';
      appendEvent(w, { kind: 'inheritance', actorId: n.id, targetId: lender.id, causeId, importance: 45, description: `유산에서 식량 채무 ${paid}개를 상환하고 남은 ${forgiven}개는 사망으로 종결했다.`, data: { loanId: loan.id, paid, forgiven } });
    } else if (recipient && recipient.id !== loan.borrowerId) loan.lenderId = recipient.id;
    else { loan.remaining = 0; loan.status = 'repaid'; }
  }
  const food = n.inventory.food, wood = n.inventory.wood, coins = n.wealth;
  if (heirs.length) {
    for (const [i, heir] of heirs.entries()) {
      heir.inventory.food += Math.floor(food / heirs.length) + (i < food % heirs.length ? 1 : 0);
      heir.inventory.wood += Math.floor(wood / heirs.length) + (i < wood % heirs.length ? 1 : 0);
      heir.wealth += Math.floor(coins / heirs.length) + (i < coins % heirs.length ? 1 : 0);
    }
  } else { const stock = stocks(w, n.settlementId); stock.food += food; stock.wood += wood; market(w, n.settlementId).coins += coins; }
  n.inventory = { food: 0, wood: 0 }; n.wealth = 0;
  for (const b of w.buildings) if (b.ownerIds?.includes(n.id)) b.ownerIds = [...new Set([...b.ownerIds.filter(id => id !== n.id), ...heirs.map(h => h.id)])];
  appendEvent(w, { kind: 'inheritance', actorId: n.id, participants: [n.id, ...heirs.map(h => h.id)], causeId, importance: 60, description: `${n.identity.name}의 재산과 주택 소유권을 ${heirs.length ? heirs.map(h => h.identity.name).join(', ') : '마을 공동체'}에 계승했다.`, data: { food, wood, coins, heirs: heirs.map(h => h.id) } });
  if (partner) delete partner.life.partnerId;
  delete n.life.partnerId;
}
export function die(w: WorldState, n: NPC, reason: 'age' | 'needs' | 'illness') {
  if (!n.alive) return;
  for (const e of w.urban.enterprises) e.workers = e.workers.filter(id => id !== n.id);
  delete w.urban.citizens[n.id].employer;
  if(w.villageLife)delete w.villageLife.activities[n.id];
  n.alive = false; n.needs.health = 0; delete n.currentAction; n.life.deathTick = w.tick; w.stats.deaths++;
  const e = socialEvent(w, { kind: 'death', actorId: n.id, causeId: reason === 'illness' ? w.urban.citizens[n.id].healthEventId : undefined, participants: [n.id, ...w.npcs.filter(p => p.alive && (p.life.parentIds.includes(n.id) || p.id === n.life.partnerId)).map(p => p.id)], importance: 100, description: `${n.identity.name}이 ${reason === 'age' ? '노화' : reason === 'illness' ? '질병·부상과 건강 악화' : '생존 자원 부족'}로 ${n.identity.age}세에 세상을 떠났다.`, data: { reason, disease: w.urban.citizens[n.id].disease, injury: w.urban.citizens[n.id].injury, age: n.identity.age, hunger: n.needs.hunger, thirst: n.needs.thirst, fatigue: n.needs.fatigue, food: n.inventory.food, storageFood: stocks(w, n.settlementId).food, weather: w.weather } });
  n.life.deathEventId = e.id; settleEstate(w, n, e.id);
}
export function lifeDay(w: WorldState) {
  for (const n of [...w.npcs]) {
    if (!n.alive) continue;
    const previous = n.identity.age; n.identity.age = Math.max(0, Math.floor((w.tick - n.life.bornTick) / YEAR_TICKS));
    physiologyDay(w,n);
    if (n.identity.age >= 85) { die(w, n, 'age'); continue; }
    if (n.identity.age >= 65) n.needs.health = Math.max(1, n.needs.health - (n.identity.age - 64) * .1);
    if (previous < 18 && n.identity.age >= 18) {
      if(w.villageLife){
        const a=w.villageLife.activities[n.id];if(a&&['play','return','learn','domestic'].includes(a.kind))delete w.villageLife.activities[n.id];
        for(const [id,a] of Object.entries(w.villageLife.activities))if(a.partner===n.id&&['escort','supervise','return'].includes(a.kind)){const next=Object.entries(w.villageLife.activities).find(([childId,x])=>childId!==n.id&&x.guardian===id);if(next)a.partner=next[0];else delete w.villageLife.activities[id];}
      }
      const mentor = w.npcs.filter(p => p.alive && n.life.parentIds.includes(p.id)).sort((a, b) => b.life.skill - a.life.skill)[0];
      if (!chooseGrownCareer(w,n) && !chooseFamilyTrade(w,n)) n.occupation = mentor?.previousOccupation ?? mentor?.occupation ?? 'none';
      if (!occupationAllowed(w,n.settlementId,n.occupation)) n.occupation = 'homemaker';
      delete n.previousOccupation;
      socialEvent(w, { kind: 'coming_of_age', actorId: n.id, targetId: mentor?.id, importance: 60, description: `${n.identity.name}이 성인이 되어 ${n.occupation === 'none' ? '일자리를 찾기 시작한다' : '배운 기술로 일을 시작한다'}.`, data: { skill: n.life.skill, occupation: n.occupation }, causeId: n.life.birthEventId });
    }
    syncEmployment(w, n);
    if (n.identity.age < 18) {
      learnFamilyTrade(w,n);
      const mentor = w.npcs.filter(p => p.alive && p.homeId === n.homeId && p.identity.age >= 18).sort((a, b) => b.life.skill - a.life.skill)[0];
      if (mentor && n.needs.health > 50 && distance(n.position,mentor.position)<=1) {
        n.life.skill = Math.min(mentor.life.skill, n.life.skill + .1);
        if (previous !== n.identity.age) { const lesson=appendEvent(w, { kind: 'education', actorId: n.id, targetId: mentor.id, importance: 40, description: `${n.identity.name}이 ${mentor.identity.name}에게 생활 기술을 배웠다.`, data: { skill: n.life.skill, occupation: mentor.occupation } });rememberGrowth(w,n,mentor,'lesson',lesson); }
      }
      // Orphans can join a local household with a living adult and space.
      if (!mentor) {
        const foster = w.npcs.find(p => p.alive && p.identity.age >= 18 && p.settlementId === n.settlementId && w.npcs.filter(q => q.alive && q.homeId === p.homeId).length < capacity(w.buildings.find(b => b.id === p.homeId)!));
        if (foster && n.homeId !== foster.homeId) { n.homeId = foster.homeId; appendEvent(w, { kind: 'family', actorId: n.id, targetId: foster.id, importance: 60, description: `${foster.identity.name}의 집이 보호자가 없는 ${n.identity.name}의 양육을 맡았다.`, data: { homeId: n.homeId, foster: true } }); }
      }
    } else if (!n.life.partnerId) {
      const candidates = n.relationships.filter(r=>r.affection>=60 && r.trust>=60).sort((a,b)=>b.affection-a.affection);
      for(const r of candidates){const p=w.npcs.find(p=>p.id===r.npcId);if(p && formFamily(w,n,p))break;}
    } else if (n.id < n.life.partnerId) {
      const partner = w.npcs.find(p => p.id === n.life.partnerId); if (partner) { if(distance(n.position,partner.position)<=1)shareAffection(w,n,partner); giveBirth(w, n, partner); }
    }
  }
}
