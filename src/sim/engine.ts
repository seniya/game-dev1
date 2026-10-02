import { knownPromiseEvent } from './promises';
import { growFarm, agricultureDay, recordHarvest } from './agriculture';
import { beginConstruction, constructionTick, assignConstruction, workConstruction } from './construction';
import { protectFarm, wildlifeDay, tradeLand } from './frontier';
import { proposeConversationGathering, proposeGatherings, updateGatherings, gatheringCandidate } from './gatherings';
import { respondToRequest, updateRequests } from './requests';
import type { RequestChoice } from './requests-types';
import { buildHouse } from './civilization';
import { attraction, signed } from './attraction';
import { canWork, syncEmployment } from './employment';
import { livingTick, livingDay, homeProfile, buyConsumerGood } from './living';
import type { Good } from './urban-types';
import { createCharacter } from './characters';
import type { CharacterInput } from './character-schema';
import { historyContext, validateHistorySelection, type HistoryTopic } from './history';
import { cropMultiplier, ecologyDay, societyDay, harvest, setCouncil } from './heritage';
import { indexPeople, updatePerson, person, neighbours } from './spatial';
import { initializeUrban, urbanDay, advanceFreight, industryWork, city, useTool, setPolicy } from './urban';
import type { Service } from './urban-types';
import { stocks, market, localBuilding, advanceJourneys, regionalDay, isTravelling } from './civilization';
import type { MotionTrace } from './motion';
import { lifeDay, careForChild, die } from './life';
import { sampleDay, balance, holdings } from './economy';
import { createWorld } from './world';
import { plan } from './decision';
import { urgentNeed } from './cognition';
import { retrieveMemories } from './memory-retrieval';
import { findPath, walkable } from './pathfinding';
import { random, clamp, distance, dayOf } from './random';
import { eventById, appendEvent, socialEvent, changeRelationship, decayMemories, relationship } from './social';
import { validateSave, validateInterpretation } from './validation';
import { type WorldState, type NPC, type WorldEvent, type NPCContext, TICKS_PER_DAY, GOAL_KINDS, GOAL_LABELS } from './types';

export class Simulation {
  private state: WorldState;
  constructor(seed = 42, population = 12) {
    this.state = createWorld(seed, population);
    appendEvent(this.state, { kind: 'weather', importance: 20, description: '봄의 첫 아침. 작은 마을의 하루가 시작되었습니다.' });
    updateRequests(this.state);
  }
  static load(json: string): Simulation {
    if (json.length > 150_000_000) throw new Error('저장 파일이 너무 큽니다.');
    const state = validateSave(JSON.parse(json));
    const sim = new Simulation(); sim.state = state; return sim;
  }
  respondToRequest(id: string, choice: RequestChoice) { respondToRequest(this.state, id, choice); }
  watchResident(id: string, enabled: boolean) {
    const ids = this.state.observation.watchIds;
    if (!this.state.npcs.some(n => n.id === id)) throw new Error('관심 주민을 찾을 수 없습니다.');
    if (enabled && !ids.includes(id)) {
      if (ids.length >= 12) throw new Error('관심 주민은 최대 12명입니다.');
      ids.push(id);
    }
    if (!enabled) this.state.observation.watchIds = ids.filter(value => value !== id);
  }
  snapshot(): WorldState { return structuredClone(this.state); }
  save(): string { return JSON.stringify(this.state); }
  get tick(): number { return this.state.tick; }
  get pending(): number { return this.state.llm.queue.length; }
  setDetail(focus: string, detail: 'full' | 'focused') {
    if (!this.state.civilization.settlements.some(v => v.id === focus)) throw new Error('관찰할 마을이 없습니다.');
    this.state.civilization.focus = focus; this.state.civilization.detail = detail;
  }
  createCharacter(input: CharacterInput, commandId?: string) { const n = createCharacter(this.state, input); if (commandId) n.profile!.commandId = commandId; return n.id; }
  setCouncil(id: string, enabled: boolean) { setCouncil(this.state, id, enabled); }
  setPolicy(id: string, taxRate: number, priority: Service) { setPolicy(this.state, id, taxRate, priority); }
  recordHistory(topic: HistoryTopic, evidence: string[], requestId: string, model: string): boolean {
    const context = historyContext(this.state.events.filter(e => evidence.includes(e.id)), topic);
    if (!validateHistorySelection({ evidence }, context)) return false;
    appendEvent(this.state, { kind: 'llm', importance: 55, description: `역사 관찰 · 모델이 고른 근거 ${evidence.length}건. 원문 사건을 함께 확인하세요.`, data: { history: true, topic, evidence, requestId, model } });
    return true;
  }
  setLLM(enabled: boolean) { this.state.llm.enabled = enabled; if (!enabled) this.state.llm.queue = []; }
  step(count = 1, motion?: MotionTrace) {
    if (!Number.isInteger(count) || count < 1 || count > 1_000_000) throw new Error('틱 수가 올바르지 않습니다.');
    for (let i = 0; i < count; i++) {
      this.tickOnce();
      if (motion) {
        motion.toTick = this.state.tick;
        for (const n of this.state.npcs) {
          const path = motion.paths[n.id];
          if (path && path.length <= 144) path.push([n.position.x, n.position.y]);
        }
      }
    }
  }
  private tickOnce() {
    const w = this.state; w.tick++;
    if (w.tick % TICKS_PER_DAY === 0) this.newDay();
    constructionTick(w);
    advanceJourneys(w);
    advanceFreight(w);
    indexPeople(w);
    proposeGatherings(w);
    for (const farm of w.buildings) if(farm.kind==='farm')growFarm(w,farm);
    for (let i = 0; i < w.npcs.length; i++) {
      const n = w.npcs[(i + w.tick) % w.npcs.length];
      if (!n.alive) continue;
      n.needs.hunger = clamp(n.needs.hunger + (n.identity.age < 18 ? .4 : .8));
      n.needs.thirst = clamp(n.needs.thirst + (w.weather === 'drought' ? .8 : .5));
      n.needs.fatigue = clamp(n.needs.fatigue + (n.currentAction?.kind === 'Sleep' ? 0 : .33));
      n.needs.social = clamp(n.needs.social - .18);
      n.needs.safety = clamp(n.needs.safety + .06);
      const u = w.urban.citizens[n.id];
      n.needs.fatigue = clamp(n.needs.fatigue + u.injury * .005);
      livingTick(w, n);
      const before = n.needs.health;
      if (n.needs.hunger > 92 || n.needs.thirst > 94 || n.needs.fatigue > 98) n.needs.health = clamp(n.needs.health - .7);
      else if (n.needs.hunger < 55 && n.needs.thirst < 65 && n.needs.fatigue < 70) n.needs.health = clamp(n.needs.health + .13);
      n.needs.health = clamp(n.needs.health - u.disease * .025 - u.injury * .012);
      if (before >= 50 && n.needs.health < 50) socialEvent(w, { kind: 'health', actorId: n.id, importance: 75, description: `${n.identity.name}의 건강이 악화되었다. 식량과 휴식이 필요하다.` });
      if (n.needs.health <= 0) {
        die(w, n, u.disease > 0 || u.injury > 0 ? 'illness' : 'needs'); continue;
      }
      syncEmployment(w, n);
      if (careForChild(w, n) || isTravelling(w, n)) { updatePerson(w, n); continue; }
      const appointment = gatheringCandidate(w, n);
      if (appointment && n.currentAction?.kind !== 'Attend' && !['Work', 'Gather'].includes(n.currentAction?.kind ?? '') && (n.currentAction?.score ?? 0) < appointment.score) delete n.currentAction;
      if (n.currentAction?.kind === 'Attend' && !appointment) delete n.currentAction;
      const a = n.currentAction;
      if (a && urgentNeed(n) && n.cognition?.plan?.interruption !== urgentNeed(n)) n.currentAction = undefined;
      if (a && ((n.needs.hunger > 88 && n.inventory.food > 0 && a.kind !== 'Eat') || (n.needs.thirst > 90 && a.kind !== 'Drink'))) n.currentAction = undefined;
      if (!n.currentAction) {
        const decision = plan(w, n); n.currentAction = decision.action; assignConstruction(w,n);
        n.decision = { reason: decision.action.reason, candidates: decision.candidates, tick: w.tick };
      }
      this.advance(n);
      updatePerson(w, n);
    }
    for (const loan of w.loans) {
      if (loan.status !== 'active' || w.tick < loan.due) continue;
      loan.status = 'defaulted'; w.stats.conflicts++;
      const lender = w.npcs.find(n => n.id === loan.lenderId)!, borrower = w.npcs.find(n => n.id === loan.borrowerId)!;
      const e = socialEvent(w, { kind: 'default', actorId: borrower.id, targetId: lender.id, importance: 75, causeId: loan.sourceEventId, description: `${borrower.identity.name}이 ${lender.identity.name}에게 빌린 남은 식량 ${loan.remaining}개를 기한 내 갚지 못했다.` });
      changeRelationship(w, lender, borrower.id, { trust: -18, resentment: 16 }, e, '빌려준 식량을 약속한 날 돌려받지 못했다.');
    }
    updateGatherings(w);
    updateRequests(w);
    w.stats.foodSum += this.totalFood(); w.stats.samples++;
  }
  private totalFood() { return holdings(this.state).food; }
  private newDay() {
    const w = this.state;
    w.llm.gateKeys = []; w.llm.dailyByNpc = {}; w.llm.dailyTotal = 0;
    const roll = random(w);
    w.weather = w.tick < w.droughtUntil ? 'drought' : roll < .24 ? 'rain' : roll < .55 ? 'cloudy' : 'sunny';
    const weatherName = { rain: '비', cloudy: '흐림', sunny: '맑음', drought: '가뭄' }[w.weather];
    appendEvent(w, { kind: 'weather', importance: 20, description: `${dayOf(w.tick)}일째 · ${weatherName}. ${w.weather === 'drought' ? '농장과 열매의 생산량이 감소한다.' : '새로운 하루가 시작되었다.'}` });
    agricultureDay(w);
    ecologyDay(w);
    wildlifeDay(w);
    sampleDay(w);
    for (const n of w.npcs) {
      n.dailyTaken = 0;
      if (n.alive && n.inventory.food === 0 && n.needs.hunger > 65) socialEvent(w, { kind: 'scarcity', actorId: n.id, importance: 70, description: `${n.identity.name}이 식량 부족을 겪고 있다. 공동 창고에 ${stocks(w, n.settlementId).food}개가 남아 있다.` });
    }
    lifeDay(w);
    regionalDay(w);
    urbanDay(w);
    initializeUrban(w);
    livingDay(w);
    societyDay(w);
    decayMemories(w);
  }
  private advance(n: NPC) {
    const w = this.state, a = n.currentAction!;
    if (w.tick - n.decision.tick > 144 && a.path.length > 0) { this.fail(n, '하루 동안 목적지에 도착하지 못해 경로와 목표를 다시 판단한다.'); return; }
    // Moving people invalidate the old destination; follow only while they remain nearby.
    if (['Share', 'Talk', 'Borrow', 'Repay'].includes(a.kind) || (a.kind === 'Trade' && a.targetId?.startsWith('peer:'))) {
      const targetId = a.kind === 'Repay' ? w.loans.find(l => l.id === a.targetId)?.lenderId : a.kind === 'Trade' ? a.targetId?.slice(5) : a.targetId;
      const target = person(w, targetId);
      if (!target?.alive || distance(target.position, n.position) > 12) { this.fail(n, '대상 주민과 만나지 못했다.'); return; }
      if (distance(target.position, a.target) > 0) {
        a.target = { ...target.position }; const path = findPath(w, n.position, a.target);
        if (!path) { this.fail(n, '대상에게 갈 수 있는 길이 없다.'); return; } a.path = path;
      }
    }
    if (a.path.length > 0) {
      const next = a.path.shift()!;
      if (!walkable(w, next) || distance(n.position, next) !== 1) { this.fail(n, '이동 경로가 막혔다.'); return; }
      n.position = next;
      if (a.path.length === 0) appendEvent(w, { kind: 'arrival', actorId: n.id, locationId: w.buildings.find(b => distance(b.position, a.target) === 0)?.id, importance: 5, description: `${n.identity.name}이 목적지에 도착했다.`, data: { action: a.kind } });
      return;
    }
    if (a.kind === 'Attend') { a.progress = this.state.gatherings?.items.find(g => g.id === a.targetId)?.progress ?? 0; return; }
    if (++a.progress < a.duration) return;
    this.execute(n); n.currentAction = undefined;
  }
  private fail(n: NPC, reason: string) { appendEvent(this.state, { kind: 'failure', actorId: n.id, importance: 5, description: `${n.identity.name}: ${reason}` }); n.currentAction = undefined; }
  private execute(n: NPC) {
    const w = this.state, a = n.currentAction!, stock = stocks(w, n.settlementId), localMarket = market(w, n.settlementId);
    if (distance(n.position, a.target) !== 0) { this.fail(n, '목적지에 도착하지 않았다.'); return; }
    const found = person(w, a.targetId), other = found?.alive ? found : undefined;
    const simple = (kind: WorldEvent['kind'], description: string, importance = 15, data: WorldEvent['data'] = {}) => appendEvent(w, { kind, actorId: n.id, locationId: w.buildings.find(b => b.id === a.targetId)?.id, description, importance, data: { ...data, action: a.kind } });
    switch (a.kind) {
      case 'Idle': n.needs.fatigue = clamp(n.needs.fatigue - 2); break;
      case 'Move': break;
      case 'Wash': w.living.people[n.id].body.cleanliness = clamp(w.living.people[n.id].body.cleanliness + 65); w.urban.citizens[n.id].stress = clamp(w.urban.citizens[n.id].stress - 3); simple('health', `${n.identity.name}이 우물에서 씻고 청결을 회복했다.`); break;
      case 'Eat':
        if (n.inventory.food < 1) { this.fail(n, '먹을 식량이 없다.'); break; }
        n.inventory.food--; w.economy.totals.consumedFood++; n.needs.hunger = clamp(n.needs.hunger - 38); simple('consumption', `${n.identity.name}이 식량 1개를 먹었다.`, 15, { resource: 'food', amount: 1 }); break;
      case 'Drink': n.needs.thirst = clamp(n.needs.thirst - 80); simple('consumption', `${n.identity.name}이 우물에서 물을 마셨다.`); break;
      case 'Sleep': n.needs.fatigue = clamp(n.needs.fatigue - (42 + homeProfile(w, n).comfort * .25 + w.living.people[n.id].furnishings * .08)); n.needs.health = clamp(n.needs.health + 3); simple('health', `${n.identity.name}이 잠을 자고 기운을 회복했다.`); break;
      case 'Gather': {
        if (!canWork(w, n)) break;
        const r = w.resources.find(r => r.id === a.targetId);
        if (!r || distance(r.position, n.position) !== 0 || r.amount < 1) { this.fail(n, '채집 자원이 소진되었다.'); break; }
        const amount = Math.min(3, r.amount); r.amount -= amount; n.inventory[r.kind] += amount; w.economy.totals[r.kind === 'food' ? 'producedFood' : 'producedWood'] += amount;
        simple('production', `${n.identity.name}이 ${r.kind === 'food' ? '열매' : '목재'} ${amount}개를 모았다.`, 20, { resource: r.kind, amount }); break;
      }
      case 'Work': {
        if (!canWork(w, n)) break;
        if (a.targetId?.startsWith('construction:')) { if(!workConstruction(w,n))this.fail(n,'공사·임금·생활 조건이 바뀌어 다시 판단한다.'); break; }
        if (a.targetId?.startsWith('industry:')) { if (!industryWork(w, n)) this.fail(n, '고용·재료·임금 또는 시설 조건이 바뀌었다.'); break; }
        if (a.targetId?.includes(':')) { this.project(n); break; }
        const farm = w.buildings.find(b => b.id === a.targetId && b.kind === 'farm' && !w.urban.enterprises.some(e => e.buildingId === b.id));
        if (!farm || farm.growth < 3) { this.fail(n, '작물이 아직 자라지 않았다.'); break; }
        n.life.skill = Math.min(100, n.life.skill + .02);
        const amount = Math.min(4 + Math.floor(n.life.skill / 25) + useTool(w, n), Math.floor(farm.growth)); farm.growth -= amount; harvest(w, farm.settlementId!, amount); recordHarvest(w,farm,amount); n.inventory.food += amount;
        w.economy.totals.producedFood += amount;
        const harvestEvent = simple('production', `${n.identity.name}이 농장에서 식량 ${amount}개를 수확했다.`, 25, { resource: 'food', amount, level: farm.level });
        // The market employs harvesters: one harvested unit enters its stock in exchange for a funded wage.
        const wage = Math.min(2, localMarket.coins);
        if (wage > 0) {
          n.inventory.food--; localMarket.food++; localMarket.coins -= wage; n.wealth += wage; w.urban.citizens[n.id].income += wage; w.economy.totals.wages += wage;
          appendEvent(w, { kind: 'wage', actorId: n.id, locationId: localBuilding(w, n, 'market').id, causeId: harvestEvent.id, importance: 30, description: `${n.identity.name}이 수확 식량 1개를 시장에 납품하고 공동 시장 기금에서 임금 ${wage}코인을 받았다.`, data: { employer: 'market', amount: wage, food: 1, fundRemaining: localMarket.coins } });
        }
        break;
      }
      case 'StoreItem': {
        const food = Math.max(0, n.inventory.food - (n.personality.greed > 65 ? 4 : 2)), wood = n.inventory.wood;
        n.inventory.food -= food; n.inventory.wood = 0; stock.food += food; stock.wood += wood;
        // A portion of food deposited at the market can be bought by other residents.
        const marketSupply = Math.min(Math.floor(food / 2), Math.max(0, 20 - localMarket.food)); stock.food -= marketSupply; localMarket.food += marketSupply;
        simple('storage', `${n.identity.name}이 식량 ${food}개·목재 ${wood}개를 공동 보관했다.`, 25, { food, wood, marketSupply }); break;
      }
      case 'TakeItem': {
        const amount = Math.min(stock.food, 3 - n.dailyTaken, 1 + Math.floor(n.personality.greed / 35));
        if (amount <= 0) { this.fail(n, '공동 식량 또는 오늘 인출 한도가 없다.'); break; }
        stock.food -= amount; n.inventory.food += amount; n.dailyTaken += amount;
        simple('storage', `${n.identity.name}이 공동 창고에서 식량 ${amount}개를 가져갔다.`, 25, { amount }); break;
      }
      case 'Theft': {
        if (stock.food < 1 || n.dailyTaken < 3) { this.fail(n, '절도 조건이 바뀌었다.'); break; }
        const amount = Math.min(stock.food, 2 + Math.floor(n.personality.greed / 40)); stock.food -= amount; n.inventory.food += amount; w.stats.thefts++;
        const e = socialEvent(w, { kind: 'theft', actorId: n.id, locationId: a.targetId, importance: 80, description: `${n.identity.name}이 인출 한도를 넘겨 공동 식량 ${amount}개를 몰래 가져갔다.`, data: { amount } });
        const nearby = neighbours(w, n, 4).filter(p => p.alive && p.id !== n.id);
        const witnesses = w.npcs.length > 400 ? nearby.sort((a, b) => distance(n.position, a.position) - distance(n.position, b.position)).slice(0, 12) : nearby;
        for (const witness of witnesses) {
          w.stats.conflicts++; witness.needs.safety = clamp(witness.needs.safety - 12);
          const seen = socialEvent(w, { kind: 'witness', actorId: witness.id, targetId: n.id, importance: 80, causeId: e.id, locationId: a.targetId, description: `${witness.identity.name}이 ${n.identity.name}의 식량 절도를 직접 목격했다.` });
          witness.knownRumors.push(seen.id);
          changeRelationship(w, witness, n.id, { trust: -20, resentment: 20, fear: 5 }, seen, '공동 식량을 몰래 가져가는 모습을 직접 보았다.');
        }
        break;
      }
      case 'Share': {
        if (!other || distance(n.position, other.position) > 1 || n.inventory.food <= 1 || other.inventory.food > 0) { this.fail(n, '식량 공유 조건이 바뀌었다.'); break; }
        n.inventory.food--; other.inventory.food++; w.stats.shares++;
        const e = socialEvent(w, { kind: 'share', actorId: n.id, targetId: other.id, importance: 75, data: { amount: 1, reason: a.reason, evidence: a.evidence ?? [] }, description: `${n.identity.name}이 배고픈 ${other.identity.name}에게 자신의 식량 1개를 나누었다.` });
        changeRelationship(w, other, n.id, { trust: 12, affection: 10, respect: 6 }, e, '힘들 때 자신의 식량을 나누어 준 사람이다.'); break;
      }
      case 'Talk': {
        if (!other || distance(n.position, other.position) > 1 || w.tick - other.lastTalk < 8) { this.fail(n, '대화 상대가 지금 바쁘다.'); break; }
        n.needs.social = clamp(n.needs.social + 32); other.needs.social = clamp(other.needs.social + 22); n.lastTalk = other.lastTalk = w.tick;
        for (const p of [n, other]) { const d = w.living.people[p.id].desires; d.belonging = clamp(d.belonging - 20); d.novelty = clamp(d.novelty - 10); }
        const forward = attraction(w, n, other), reverse = attraction(w, other, n);
        const e = socialEvent(w, { kind: 'talk', actorId: n.id, targetId: other.id, importance: 35, data: {
          reason: a.reason, evidence: a.evidence ?? [], impression: forward.value, reverseImpression: reverse.value,
          factors: forward.factors.map(f => `${f.label} ${signed(f.value)}: ${f.reason}`),
          reverseFactors: reverse.factors.map(f => `${f.label} ${signed(f.value)}: ${f.reason}`),
          affectionChange: forward.changes.affection, reverseAffectionChange: reverse.changes.affection,
        }, description: `${n.identity.name}과 ${other.identity.name}이 일상의 이야기를 나누었다.` });
        changeRelationship(w, n, other.id, forward.changes, e, `대화를 나누며 느낀 인상 ${signed(forward.value)} · ${forward.reason}`);
        changeRelationship(w, other, n.id, reverse.changes, e, `대화를 나누며 느낀 인상 ${signed(reverse.value)} · ${reverse.reason}`);
        const sourceById = { get: (id: string) => eventById(w, id) };
        const knownRoots = new Set(other.knownRumors.map(id => sourceById.get(id)?.causeId));
        const rumorId = n.knownRumors.find(id => {
          const seen = sourceById.get(id);
          return seen?.causeId && !knownRoots.has(seen.causeId) && seen.targetId !== other.id && w.tick - seen.tick < 144 * 7;
        });
        const source = rumorId ? eventById(w, rumorId) : undefined;
        if (source && source.targetId && source.targetId !== other.id && w.tick - source.tick < 144 * 7) {
          other.knownRumors.push(source.id);
          const rumor = socialEvent(w, { kind: 'rumor', actorId: n.id, targetId: other.id, importance: 60, causeId: source.id, description: `${n.identity.name}이 ${other.identity.name}에게 ${source.actorId === n.id ? '직접 목격한' : '전해 들은'} 절도 이야기를 전했다.`, data: { suspectId: source.targetId, rootEventId: source.causeId!, knowledge: 'hearsay', speakerSource: source.actorId === n.id ? 'direct' : 'hearsay' } });
          changeRelationship(w, other, source.targetId, { trust: -4, resentment: 3 }, rumor, `${n.identity.name}에게 절도 소문을 들었다. 직접 본 사실은 아니다.`);
        }
        break;
      }
      case 'Trade': {
        if (a.targetId?.startsWith('goods:')) { if (!buyConsumerGood(w, n, a.targetId.slice(6) as Good)) this.fail(n, '상품 재고·대금 또는 시장 위치가 바뀌었다.'); break; }
        const seller = a.targetId?.startsWith('peer:') ? w.npcs.find(p => p.id === a.targetId!.slice(5) && p.alive) : undefined;
        const buying = a.targetId === 'buy' || !!seller, resource = buying ? 'food' : 'wood';
        if (a.targetId?.startsWith('peer:') && (!seller || distance(n.position, seller.position) > 1 || (seller.relationships.find(r => r.npcId === n.id)?.trust ?? 35) < 20)) { this.fail(n, '판매자를 만나거나 거래 동의를 얻지 못했다.'); break; }
        const price = buying ? localMarket.foodPrice : localMarket.woodPrice;
        const stock = seller ? Math.max(0, seller.inventory.food - 3) : buying ? localMarket.food : n.inventory.wood;
        const amount = Math.min(buying ? 2 : 3, stock, Math.floor((buying ? n.wealth : localMarket.coins) / price));
        if (!amount) { this.fail(n, '거래 재고 또는 실제 자금이 부족하다.'); break; }
        const cost = amount * price;
        if (buying) {
          n.wealth -= cost; w.urban.citizens[n.id].expenses += cost; n.inventory.food += amount;
          if (seller) { seller.wealth += cost; w.urban.citizens[seller.id].income += cost; seller.inventory.food -= amount; }
          else { localMarket.coins += cost; localMarket.food -= amount; }
        } else { n.wealth += cost; w.urban.citizens[n.id].income += cost; localMarket.coins -= cost; n.inventory.wood -= amount; localMarket.wood += amount; }
        w.economy.totals.trades++; w.economy.totals.tradeVolume += amount;
        const e = socialEvent(w, { kind: 'trade', actorId: n.id, targetId: seller?.id, importance: seller ? 45 : 35,
          description: `${n.identity.name}이 ${seller?.identity.name ?? '공동 시장'}${buying ? '에게서' : '에'} ${buying ? '식량' : '목재'} ${amount}개를 ${cost}코인에 ${buying ? '구매' : '판매'}했다.`,
          data: { buyer: buying ? n.id : 'market', seller: seller?.id ?? (buying ? 'market' : n.id), resource, amount, price, cost, reason: a.reason, evidence: a.evidence ?? [] } });
        if (seller) {
          changeRelationship(w, n, seller.id, { trust: 2, respect: 1 }, e, '합의한 가격으로 물건을 거래했다.');
          changeRelationship(w, seller, n.id, { trust: 2, respect: 1 }, e, '물건값을 빠짐없이 지불한 이웃이다.');
        }
        break;
      }
      case 'Borrow': {
        if (!other || distance(n.position, other.position) > 1 || other.inventory.food < 3 || relationship(other, n.id).trust < 30 || w.loans.some(l => l.borrowerId === n.id && l.status !== 'repaid')) { this.fail(n, '식량 대여 조건을 충족하지 못했다.'); break; }
        other.inventory.food -= 2; n.inventory.food += 2;
        const e = socialEvent(w, { kind: 'loan', actorId: other.id, targetId: n.id, importance: 60, data: { amount: 2, reason: a.reason, evidence: a.evidence ?? [] }, description: `${other.identity.name}이 ${n.identity.name}에게 식량 2개를 이틀 동안 빌려주었다.` });
        w.loans.push({ id: `l${w.nextId++}`, lenderId: other.id, borrowerId: n.id, amount: 2, remaining: 2, due: w.tick + 288, status: 'active', sourceEventId: e.id }); break;
      }
      case 'Repay': {
        const loan = w.loans.find(l => l.id === a.targetId && l.borrowerId === n.id && l.status !== 'repaid'), lender = w.npcs.find(p => p.id === loan?.lenderId && p.alive);
        if (!loan || !lender || distance(n.position, lender.position) > 1 || n.inventory.food <= 1) { this.fail(n, '상환 조건을 충족하지 못했다.'); break; }
        const amount = Math.min(loan.remaining, n.inventory.food - 1), wasLate = loan.status === 'defaulted';
        n.inventory.food -= amount; lender.inventory.food += amount; loan.remaining -= amount;
        if (loan.remaining === 0) loan.status = 'repaid';
        const e = socialEvent(w, { kind: 'repayment', actorId: n.id, targetId: lender.id, importance: 60, causeId: loan.sourceEventId, description: `${n.identity.name}이 ${lender.identity.name}에게 식량 ${amount}개를 갚았다. 남은 빚 ${loan.remaining}개${wasLate ? ' · 연체 후 상환' : ''}.`, data: { loanId: loan.id, amount, remaining: loan.remaining, late: wasLate, reason: a.reason, evidence: a.evidence ?? [] } });
        changeRelationship(w, lender, n.id, { trust: loan.remaining === 0 ? (wasLate ? 12 : 8) : 2, respect: loan.remaining === 0 ? 5 : 1, resentment: wasLate ? (loan.remaining === 0 ? -10 : -2) : 0 }, e, loan.remaining === 0 ? '빌린 식량을 모두 갚아 약속을 해결했다.' : '형편에 맞게 빚을 조금씩 갚고 있다.'); break;
      }
    }
  }
  private project(n: NPC) {
    const w = this.state, stock = stocks(w, n.settlementId), [id, kind] = n.currentAction!.targetId!.split(':'), b = w.buildings.find(b => b.id === id);
    const goal = n.goals.find(g => g.kind === kind);
    if ((!goal && !(kind === 'expand_farm' && n.occupation === 'carpenter' && b?.kind === 'farm')) || !b || b.level >= 4 || n.inventory.wood + stock.wood < 8) { this.fail(n, '프로젝트에 필요한 목재나 목표가 없다.'); return; }
    const own = Math.min(n.inventory.wood, 8); n.inventory.wood -= own; stock.wood -= 8 - own; b.level++;
    w.economy.totals.investedWood += 8;
    n.goals = n.goals.filter(g => g.id !== goal?.id);
    socialEvent(w, { kind: 'project', actorId: n.id, locationId: b.id, importance: 75, description: `${n.identity.name}이 목재 8개로 ${b.name}을 개선했다. (단계 ${b.level})`, causeId: goal?.sourceEventId, data: { woodCost: 8, personalWood: own, communalWood: 8 - own, level: b.level, growthMultiplier: b.kind === 'farm' ? 1 + (b.level - 1) * .35 : 1 } });
  }
  proposeConversationGathering(npcId:string,kind:'meal'|'help'|'harvest',source:string) { return proposeConversationGathering(this.state,npcId,kind,source); }
  beginConstruction(settlementId:string,kind:'home'|'farm',position:{x:number;y:number}) { return beginConstruction(this.state,settlementId,kind,position); }
  protectFarm(buildingId:string) { protectFarm(this.state,buildingId); }
  tradeLand(buildingId:string,buyerId:string,price:number) { tradeLand(this.state,buildingId,buyerId,price); }
  build(settlementId: string, kind: 'home' | 'farm', position?:{x:number;y:number}) {
    if (kind !== 'home' && kind !== 'farm') throw new Error('지원하지 않는 건물입니다.');
    const v = this.state.civilization.settlements.find(v => v.id === settlementId);
    if (!v) throw new Error('마을을 찾을 수 없습니다.');
    const b = buildHouse(this.state, v, kind, true, position);
    if (!b) throw new Error('공동 목재가 부족하거나 연결된 빈 건설 부지가 없습니다.');
    return b.id;
  }
  experiment(kind: 'drought' | 'food') {
    const w = this.state;
    if (kind === 'drought') { w.droughtUntil = w.tick + 144 * 3; w.weather = 'drought'; }
    else if (kind === 'food') { w.storage.food += 24; w.economy.totals.externalFood += 24; }
    else throw new Error('알 수 없는 실험입니다.');
    appendEvent(w, { kind: 'experiment', importance: 50, description: kind === 'drought' ? '관찰 실험: 3일 동안 가뭄이 지속된다. 생산량이 감소한다.' : '관찰 실험: 공동 창고에 외부 식량 24개를 투입했다.', data: { command: kind, externalFood: kind === 'food' ? 24 : 0 } });
  }
  decisionContext(): { requestId: string; context: NPCContext } | null {
    const w = this.state, request = w.llm.queue[0]; if (!request || !w.llm.enabled) return null;
    const npc = w.npcs.find(n => n.id === request.npcId), event = eventById(w, request.eventId);
    if (!npc || !event) return null;
    const copy = structuredClone(npc); copy.memories = retrieveMemories(copy.memories, w.tick, { npcIds: event.participants.filter(id => id !== npc.id), locationIds: event.locationId ? [event.locationId] : [] }).map(h => h.memory); copy.relationships = copy.relationships.slice(-12);
    delete copy.cognition; // Internal plans and reflection history are not extra provider context.
    return { requestId: request.id, context: { npc: copy, event: structuredClone(event), allowedGoals: [...GOAL_KINDS], tick: w.tick } };
  }
  applyInterpretation(requestId: string, input: unknown, provenance?: { evidence: string[]; model: string }): boolean {
    const w = this.state, request = w.llm.queue.find(q => q.id === requestId);
    if (!request) return false;
    const npc = w.npcs.find(n => n.id === request.npcId)!;
    const result = validateInterpretation(input);
    const valid = result && npc.alive && result.relationshipInterpretations.every(r => npc.relationships.some(existing => existing.npcId === r.npcId)) && (!provenance || (provenance.evidence.includes(request.eventId) && provenance.evidence.every(id => eventById(w, id) && (id === request.eventId || npc.memories.some(m => m.sourceEventId === id)))));
    w.llm.queue = w.llm.queue.filter(q => q.id !== requestId);
    if (!valid || !result) {
      w.llm.rejected++; appendEvent(w, { kind: 'llm', actorId: npc.id, causeId: request.eventId, importance: 10, description: '허용되지 않은 LLM 응답을 거부했다.' }); return false;
    }
    for (const goal of result.newGoals) {
      if (npc.goals.some(g => g.kind === goal.kind)) continue;
      if (npc.goals.length >= 4) npc.goals.shift();
      npc.goals.push({ id: `g${w.nextId++}`, ...goal, createdAt: w.tick, sourceEventId: request.eventId });
      appendEvent(w, { kind: 'goal', actorId: npc.id, causeId: request.eventId, importance: 45, description: `${npc.identity.name}의 ${provenance?.model === 'chrome-built-in' ? 'Chrome AI가 제안한 목표' : '새 목표'}: ${GOAL_LABELS[goal.kind]}`, data: { kind: goal.kind, reason: goal.reason, ...(provenance ?? {}) } });
    }
    for (const meaning of result.relationshipInterpretations) {
      const relation = relationship(npc, meaning.npcId); relation.interpretation = meaning.meaning;
      if (!relation.evidence.includes(request.eventId)) relation.evidence.push(request.eventId);
    }
    w.llm.completed++;
    appendEvent(w, { kind: 'llm', actorId: npc.id, causeId: request.eventId, importance: 25, description: `${npc.identity.name}${provenance?.model === 'chrome-built-in' ? ': ' : '의 해석: '}${result.interpretation}`, data: { result: JSON.stringify(result), requestId, ...(provenance ?? {}) } });
    return true;
  }
  closeChromeRequests(ids: string[], reason: string, representative: string) {
    const w = this.state, requests = w.llm.queue.filter(q => ids.includes(q.id));
    if (!requests.length) return;
    w.llm.queue = w.llm.queue.filter(q => !ids.includes(q.id));
    appendEvent(w, { kind: 'llm', actorId: requests[0].npcId, causeId: requests[0].eventId, importance: 5,
      description: `Chrome 판단 ${reason === 'merged' ? '사건 묶음으로 처리' : '현재 상태에 따라 생략'}`,
      data: { reason, requestIds: requests.map(q => q.id), representative, evidence: requests.map(q => q.eventId) } });
  }
  recordDialogue(speakerId: string, listenerId: string, text: string, evidence: string[], requestId: string, model: string): boolean {
    const w = this.state, speaker = w.npcs.find(n => n.id === speakerId), listener = w.npcs.find(n => n.id === listenerId);
    if (!speaker?.alive || !listener?.alive || speakerId === listenerId || !text.trim() || text.length > 500 || !evidence.length || evidence.length > 8 || evidence.some(id => !eventById(w, id) || !speaker.memories.some(m => m.sourceEventId === id && m.relatedNpcIds.includes(listenerId)))) return false;
    appendEvent(w, { kind: 'llm', actorId: speakerId, targetId: listenerId, causeId: evidence[0], importance: 30,
      description: `${speaker.identity.name}가 ${listener.identity.name}에게 떠올린 말: ${text}`, data: { text, evidence, requestId, model, dialogue: true } });
    return true;
  }
  recordExpression(npcId:string,kind:'dialogue'|'reflection',text:string,evidence:string[],requestId:string,model:string,question:string) {
    const w=this.state,n=w.npcs.find(n=>n.id===npcId&&n.alive);
    if(!n||!text.trim()||text.length>500||!evidence.length||evidence.length>5||evidence.some(id=>!eventById(w,id)||!n.memories.some(m=>m.sourceEventId===id)&&!knownPromiseEvent(w,n.id,eventById(w,id)!)))return false;
    appendEvent(w,{kind:'llm',actorId:n.id,causeId:evidence[0],importance:35,description:`${n.identity.name}의 ${kind==='reflection'?'성찰':'답변'} (${model==='mock'?'규칙 기반 예시':'AI 표현'}): ${text}`,data:{expression:kind,text,evidence,requestId,model,question}});return true;
  }
  failDecision(requestId: string, reason: string, retry = true) {
    const w = this.state, request = w.llm.queue.find(q => q.id === requestId); if (!request) return;
    request.attempts++;
    if (!retry || request.attempts >= 3) { w.llm.failed++; w.llm.queue = w.llm.queue.filter(q => q.id !== requestId); }
    appendEvent(w, { kind: 'llm', actorId: request.npcId, causeId: request.eventId, importance: 5, description: `판단 처리 실패 (${request.attempts}/3): ${reason.slice(0, 160)}` });
  }
}

export function summarize(w: WorldState) {
  const pairs: { residents: string; score: number }[] = [];
  for (const n of w.npcs) for (const r of n.relationships) {
    if (n.id >= r.npcId) continue;
    const other = w.npcs.find(p => p.id === r.npcId)!, reverse = other.relationships.find(p => p.npcId === n.id);
    if (!reverse) continue;
    const score = (r.trust + r.affection - r.resentment + reverse.trust + reverse.affection - reverse.resentment) / 2;
    pairs.push({ residents: `${n.identity.name} ↔ ${other.identity.name}`, score });
  }
  pairs.sort((a, b) => b.score - a.score);
  return { settlements: w.civilization.settlements.length, births: w.npcs.filter(n => n.life.parentIds.length > 0).length, generations: Math.max(...w.npcs.map(n => n.life.generation)), journeys: w.civilization.journeys.length, seed: w.seed, day: dayOf(w.tick), elapsedDays: Number(((w.tick - 36) / 144).toFixed(2)), population: w.npcs.filter(n => n.alive).length, deaths: w.stats.deaths, averageFood: Number((w.stats.foodSum / Math.max(1, w.stats.samples)).toFixed(2)), storage: w.storage, conflicts: w.stats.conflicts, thefts: w.stats.thefts, shares: w.stats.shares, strongestRelationship: pairs[0] ?? null, weakestRelationship: pairs.at(-1) ?? null, events: w.events.length, economy: { ...w.economy.totals, balance: balance(w), foodPrice: w.market.foodPrice, outstandingDebt: w.loans.reduce((s, l) => s + l.remaining, 0), samples: w.economy.daily.length }, llm: { requested: w.llm.requested, completed: w.llm.completed, rejected: w.llm.rejected, failed: w.llm.failed, queued: w.llm.queue.length } };
}
