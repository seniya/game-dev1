import { createWorld } from './world';
import { plan } from './decision';
import { findPath, walkable } from './pathfinding';
import { random, clamp, distance, dayOf } from './random';
import { appendEvent, socialEvent, changeRelationship, decayMemories, relationship } from './social';
import { validateSave, validateInterpretation } from './validation';
import { type WorldState, type NPC, type WorldEvent, type NPCContext, TICKS_PER_DAY, GOAL_KINDS, GOAL_LABELS } from './types';

export class Simulation {
  private state: WorldState;
  constructor(seed = 42, population = 12) {
    this.state = createWorld(seed, population);
    appendEvent(this.state, { kind: 'weather', importance: 20, description: '봄의 첫 아침. 작은 마을의 하루가 시작되었습니다.' });
  }
  static load(json: string): Simulation {
    if (json.length > 150_000_000) throw new Error('저장 파일이 너무 큽니다.');
    const state = validateSave(JSON.parse(json));
    const sim = new Simulation(); sim.state = state; return sim;
  }
  snapshot(): WorldState { return structuredClone(this.state); }
  save(): string { return JSON.stringify(this.state); }
  get tick(): number { return this.state.tick; }
  get pending(): number { return this.state.llm.queue.length; }
  setLLM(enabled: boolean) { this.state.llm.enabled = enabled; if (!enabled) this.state.llm.queue = []; }
  step(count = 1) {
    if (!Number.isInteger(count) || count < 1 || count > 1_000_000) throw new Error('틱 수가 올바르지 않습니다.');
    for (let i = 0; i < count; i++) this.tickOnce();
  }
  private tickOnce() {
    const w = this.state; w.tick++;
    if (w.tick % TICKS_PER_DAY === 0) this.newDay();
    const farm = w.buildings.find(b => b.kind === 'farm')!;
    farm.growth = Math.min(120, farm.growth + (w.weather === 'drought' ? .025 : w.weather === 'rain' ? .24 : .14) * (1 + (farm.level - 1) * .35));
    for (let i = 0; i < w.npcs.length; i++) {
      const n = w.npcs[(i + w.tick) % w.npcs.length];
      if (!n.alive) continue;
      n.needs.hunger = clamp(n.needs.hunger + .8);
      n.needs.thirst = clamp(n.needs.thirst + (w.weather === 'drought' ? .8 : .5));
      n.needs.fatigue = clamp(n.needs.fatigue + (n.currentAction?.kind === 'Sleep' ? 0 : .33));
      n.needs.social = clamp(n.needs.social - .18);
      n.needs.safety = clamp(n.needs.safety + .06);
      const before = n.needs.health;
      if (n.needs.hunger > 92 || n.needs.thirst > 94 || n.needs.fatigue > 98) n.needs.health = clamp(n.needs.health - .7);
      else if (n.needs.hunger < 55 && n.needs.thirst < 65 && n.needs.fatigue < 70) n.needs.health = clamp(n.needs.health + .13);
      if (before >= 50 && n.needs.health < 50) socialEvent(w, { kind: 'health', actorId: n.id, importance: 75, description: `${n.identity.name}의 건강이 악화되었다. 식량과 휴식이 필요하다.` });
      if (n.needs.health <= 0) {
        n.alive = false; n.currentAction = undefined; w.stats.deaths++;
        socialEvent(w, { kind: 'death', actorId: n.id, participants: w.npcs.filter(p => p.alive && distance(p.position, n.position) < 6).map(p => p.id), importance: 100, description: `${n.identity.name}이 생존 자원 부족으로 세상을 떠났다.` }); continue;
      }
      const a = n.currentAction;
      if (a && ((n.needs.hunger > 88 && n.inventory.food > 0 && a.kind !== 'Eat') || (n.needs.thirst > 90 && a.kind !== 'Drink'))) n.currentAction = undefined;
      if (!n.currentAction) {
        const decision = plan(w, n); n.currentAction = decision.action;
        n.decision = { reason: decision.action.reason, candidates: decision.candidates, tick: w.tick };
      }
      this.advance(n);
    }
    for (const loan of w.loans) {
      if (loan.status !== 'active' || w.tick < loan.due) continue;
      loan.status = 'defaulted'; w.stats.conflicts++;
      const lender = w.npcs.find(n => n.id === loan.lenderId)!, borrower = w.npcs.find(n => n.id === loan.borrowerId)!;
      const e = socialEvent(w, { kind: 'default', actorId: borrower.id, targetId: lender.id, importance: 75, causeId: loan.sourceEventId, description: `${borrower.identity.name}이 ${lender.identity.name}에게 빌린 식량 ${loan.amount}을 기한 내 갚지 못했다.` });
      changeRelationship(w, lender, borrower.id, { trust: -18, resentment: 16 }, e, '빌려준 식량을 약속한 날 돌려받지 못했다.');
    }
    w.stats.foodSum += this.totalFood(); w.stats.samples++;
  }
  private totalFood() { const w = this.state; return w.storage.food + w.market.food + w.npcs.reduce((s, n) => s + n.inventory.food, 0); }
  private newDay() {
    const w = this.state;
    w.llm.gateKeys = []; w.llm.dailyByNpc = {}; w.llm.dailyTotal = 0;
    const roll = random(w);
    w.weather = w.tick < w.droughtUntil ? 'drought' : roll < .24 ? 'rain' : roll < .55 ? 'cloudy' : 'sunny';
    const weatherName = { rain: '비', cloudy: '흐림', sunny: '맑음', drought: '가뭄' }[w.weather];
    appendEvent(w, { kind: 'weather', importance: 20, description: `${dayOf(w.tick)}일째 · ${weatherName}. ${w.weather === 'drought' ? '농장과 열매의 생산량이 감소한다.' : '새로운 하루가 시작되었다.'}` });
    for (const r of w.resources) r.amount = Math.min(r.capacity, r.amount + (r.kind === 'wood' ? 3 : w.weather === 'drought' ? 0 : w.weather === 'rain' ? 2 : 1));
    w.market.foodPrice = w.storage.food < w.npcs.length ? 5 : 3;
    for (const n of w.npcs) {
      n.dailyTaken = 0;
      if (n.alive && n.inventory.food === 0 && n.needs.hunger > 65) socialEvent(w, { kind: 'scarcity', actorId: n.id, importance: 70, description: `${n.identity.name}이 식량 부족을 겪고 있다. 공동 창고에 ${w.storage.food}개가 남아 있다.` });
    }
    decayMemories(w);
  }
  private advance(n: NPC) {
    const w = this.state, a = n.currentAction!;
    // Moving people invalidate the old destination; follow only while they remain nearby.
    if (['Share', 'Talk', 'Borrow', 'Repay'].includes(a.kind)) {
      const targetId = a.kind === 'Repay' ? w.loans.find(l => l.id === a.targetId)?.lenderId : a.targetId;
      const target = w.npcs.find(p => p.id === targetId);
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
    if (++a.progress < a.duration) return;
    this.execute(n); n.currentAction = undefined;
  }
  private fail(n: NPC, reason: string) { appendEvent(this.state, { kind: 'failure', actorId: n.id, importance: 5, description: `${n.identity.name}: ${reason}` }); n.currentAction = undefined; }
  private execute(n: NPC) {
    const w = this.state, a = n.currentAction!;
    if (distance(n.position, a.target) !== 0) { this.fail(n, '목적지에 도착하지 않았다.'); return; }
    const other = w.npcs.find(p => p.id === a.targetId && p.alive);
    const simple = (kind: WorldEvent['kind'], description: string, importance = 15, data: WorldEvent['data'] = {}) => appendEvent(w, { kind, actorId: n.id, description, importance, data });
    switch (a.kind) {
      case 'Idle': n.needs.fatigue = clamp(n.needs.fatigue - 2); break;
      case 'Move': break;
      case 'Eat':
        if (n.inventory.food < 1) { this.fail(n, '먹을 식량이 없다.'); break; }
        n.inventory.food--; n.needs.hunger = clamp(n.needs.hunger - 38); simple('consumption', `${n.identity.name}이 식량 1개를 먹었다.`); break;
      case 'Drink': n.needs.thirst = clamp(n.needs.thirst - 80); simple('consumption', `${n.identity.name}이 우물에서 물을 마셨다.`); break;
      case 'Sleep': n.needs.fatigue = clamp(n.needs.fatigue - 62); n.needs.health = clamp(n.needs.health + 3); simple('health', `${n.identity.name}이 잠을 자고 기운을 회복했다.`); break;
      case 'Gather': {
        const r = w.resources.find(r => r.id === a.targetId);
        if (!r || distance(r.position, n.position) !== 0 || r.amount < 1) { this.fail(n, '채집 자원이 소진되었다.'); break; }
        const amount = Math.min(3, r.amount); r.amount -= amount; n.inventory[r.kind] += amount;
        simple('production', `${n.identity.name}이 ${r.kind === 'food' ? '열매' : '목재'} ${amount}개를 모았다.`, 20, { resource: r.kind, amount }); break;
      }
      case 'Work': {
        if (a.targetId?.includes(':')) { this.project(n); break; }
        const farm = w.buildings.find(b => b.id === a.targetId && b.kind === 'farm');
        if (!farm || farm.growth < 3) { this.fail(n, '작물이 아직 자라지 않았다.'); break; }
        const amount = Math.min(4, Math.floor(farm.growth)); farm.growth -= amount; n.inventory.food += amount;
        simple('production', `${n.identity.name}이 농장에서 식량 ${amount}개를 수확했다.`, 25, { resource: 'food', amount }); break;
      }
      case 'StoreItem': {
        const food = Math.max(0, n.inventory.food - (n.personality.greed > 65 ? 4 : 2)), wood = n.inventory.wood;
        n.inventory.food -= food; n.inventory.wood = 0; w.storage.food += food; w.storage.wood += wood;
        // A portion of food deposited at the market can be bought by other residents.
        const marketSupply = Math.min(Math.floor(food / 2), Math.max(0, 20 - w.market.food)); w.storage.food -= marketSupply; w.market.food += marketSupply;
        simple('storage', `${n.identity.name}이 식량 ${food}개·목재 ${wood}개를 공동 보관했다.`, 25, { food, wood, marketSupply }); break;
      }
      case 'TakeItem': {
        const amount = Math.min(w.storage.food, 3 - n.dailyTaken, 1 + Math.floor(n.personality.greed / 35));
        if (amount <= 0) { this.fail(n, '공동 식량 또는 오늘 인출 한도가 없다.'); break; }
        w.storage.food -= amount; n.inventory.food += amount; n.dailyTaken += amount;
        simple('storage', `${n.identity.name}이 공동 창고에서 식량 ${amount}개를 가져갔다.`, 25, { amount }); break;
      }
      case 'Theft': {
        if (w.storage.food < 1 || n.dailyTaken < 3) { this.fail(n, '절도 조건이 바뀌었다.'); break; }
        const amount = Math.min(w.storage.food, 2 + Math.floor(n.personality.greed / 40)); w.storage.food -= amount; n.inventory.food += amount; w.stats.thefts++;
        const e = socialEvent(w, { kind: 'theft', actorId: n.id, locationId: a.targetId, importance: 80, description: `${n.identity.name}이 인출 한도를 넘겨 공동 식량 ${amount}개를 몰래 가져갔다.`, data: { amount } });
        const witnesses = w.npcs.filter(p => p.alive && p.id !== n.id && distance(p.position, n.position) <= 4);
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
        const e = socialEvent(w, { kind: 'share', actorId: n.id, targetId: other.id, importance: 75, description: `${n.identity.name}이 배고픈 ${other.identity.name}에게 자신의 식량 1개를 나누었다.` });
        changeRelationship(w, other, n.id, { trust: 12, affection: 10, respect: 6 }, e, '힘들 때 자신의 식량을 나누어 준 사람이다.'); break;
      }
      case 'Talk': {
        if (!other || distance(n.position, other.position) > 1 || w.tick - other.lastTalk < 8) { this.fail(n, '대화 상대가 지금 바쁘다.'); break; }
        n.needs.social = clamp(n.needs.social + 32); other.needs.social = clamp(other.needs.social + 22); n.lastTalk = other.lastTalk = w.tick;
        const e = socialEvent(w, { kind: 'talk', actorId: n.id, targetId: other.id, importance: 35, description: `${n.identity.name}과 ${other.identity.name}이 일상의 이야기를 나누었다.` });
        changeRelationship(w, n, other.id, { familiarity: 5, affection: 2 }, e, '함께 이야기를 나눈 이웃이다.');
        changeRelationship(w, other, n.id, { familiarity: 5, affection: 2 }, e, '함께 이야기를 나눈 이웃이다.');
        const rumorId = n.knownRumors.find(id => !other.knownRumors.includes(id));
        const source = rumorId ? w.events.find(ev => ev.id === rumorId) : undefined;
        if (source && source.targetId && source.targetId !== other.id && w.tick - source.tick < 144 * 7) {
          other.knownRumors.push(source.id);
          const rumor = socialEvent(w, { kind: 'rumor', actorId: n.id, targetId: other.id, importance: 60, causeId: source.id, description: `${n.identity.name}이 ${other.identity.name}에게 목격한 절도 이야기를 전했다.`, data: { suspectId: source.targetId } });
          changeRelationship(w, other, source.targetId, { trust: -4, resentment: 3 }, rumor, `${n.identity.name}에게 절도 소문을 들었다. 직접 본 사실은 아니다.`);
        }
        break;
      }
      case 'Trade': {
        if (a.targetId === 'buy') {
          const amount = Math.min(2, w.market.food, Math.floor(n.wealth / w.market.foodPrice));
          if (!amount) { this.fail(n, '시장 재고 또는 돈이 부족하다.'); break; }
          const cost = amount * w.market.foodPrice; n.wealth -= cost; w.market.coins += cost; w.market.food -= amount; n.inventory.food += amount;
          simple('trade', `${n.identity.name}이 식량 ${amount}개를 ${cost}코인에 구매했다.`, 35, { amount, cost });
        } else {
          const amount = Math.min(n.inventory.wood, 3, Math.floor(w.market.coins / w.market.woodPrice));
          if (!amount) { this.fail(n, '시장 자금 또는 목재가 부족하다.'); break; }
          const cost = amount * w.market.woodPrice; n.wealth += cost; w.market.coins -= cost; n.inventory.wood -= amount; w.market.wood += amount;
          simple('trade', `${n.identity.name}이 목재 ${amount}개를 ${cost}코인에 판매했다.`, 35, { amount, cost });
        } break;
      }
      case 'Borrow': {
        if (!other || distance(n.position, other.position) > 1 || other.inventory.food < 3 || relationship(other, n.id).trust < 30 || w.loans.some(l => l.borrowerId === n.id && l.status !== 'repaid')) { this.fail(n, '식량 대여 조건을 충족하지 못했다.'); break; }
        other.inventory.food -= 2; n.inventory.food += 2;
        const e = socialEvent(w, { kind: 'loan', actorId: other.id, targetId: n.id, importance: 60, description: `${other.identity.name}이 ${n.identity.name}에게 식량 2개를 이틀 동안 빌려주었다.` });
        w.loans.push({ id: `l${w.nextId++}`, lenderId: other.id, borrowerId: n.id, amount: 2, due: w.tick + 288, status: 'active', sourceEventId: e.id }); break;
      }
      case 'Repay': {
        const loan = w.loans.find(l => l.id === a.targetId && l.borrowerId === n.id && l.status === 'active'), lender = w.npcs.find(p => p.id === loan?.lenderId && p.alive);
        if (!loan || !lender || distance(n.position, lender.position) > 1 || n.inventory.food < loan.amount) { this.fail(n, '상환 조건을 충족하지 못했다.'); break; }
        n.inventory.food -= loan.amount; lender.inventory.food += loan.amount; loan.status = 'repaid';
        const e = socialEvent(w, { kind: 'repayment', actorId: n.id, targetId: lender.id, importance: 60, causeId: loan.sourceEventId, description: `${n.identity.name}이 ${lender.identity.name}에게 식량 ${loan.amount}개를 갚았다.` });
        changeRelationship(w, lender, n.id, { trust: 8, respect: 5 }, e, '빌린 식량을 약속대로 갚은 사람이다.'); break;
      }
    }
  }
  private project(n: NPC) {
    const w = this.state, [id, kind] = n.currentAction!.targetId!.split(':'), b = w.buildings.find(b => b.id === id);
    const goal = n.goals.find(g => g.kind === kind);
    if (!goal || !b || b.level >= 4 || n.inventory.wood + w.storage.wood < 8) { this.fail(n, '프로젝트에 필요한 목재나 목표가 없다.'); return; }
    const own = Math.min(n.inventory.wood, 8); n.inventory.wood -= own; w.storage.wood -= 8 - own; b.level++;
    n.goals = n.goals.filter(g => g.id !== goal.id);
    socialEvent(w, { kind: 'project', actorId: n.id, locationId: b.id, importance: 75, description: `${n.identity.name}이 목재 8개로 ${b.name}을 개선했다. (단계 ${b.level})`, causeId: goal.sourceEventId });
  }
  experiment(kind: 'drought' | 'food') {
    const w = this.state;
    if (kind === 'drought') { w.droughtUntil = w.tick + 144 * 3; w.weather = 'drought'; }
    else if (kind === 'food') w.storage.food += 24;
    else throw new Error('알 수 없는 실험입니다.');
    appendEvent(w, { kind: 'experiment', importance: 50, description: kind === 'drought' ? '관찰 실험: 3일 동안 가뭄이 지속된다. 생산량이 감소한다.' : '관찰 실험: 공동 창고에 외부 식량 24개를 투입했다.', data: { command: kind } });
  }
  decisionContext(): { requestId: string; context: NPCContext } | null {
    const w = this.state, request = w.llm.queue[0]; if (!request || !w.llm.enabled) return null;
    const npc = w.npcs.find(n => n.id === request.npcId), event = w.events.find(e => e.id === request.eventId);
    if (!npc || !event) return null;
    const copy = structuredClone(npc); copy.memories = copy.memories.slice(-8); copy.relationships = copy.relationships.slice(-12);
    return { requestId: request.id, context: { npc: copy, event: structuredClone(event), allowedGoals: [...GOAL_KINDS], tick: w.tick } };
  }
  applyInterpretation(requestId: string, input: unknown): boolean {
    const w = this.state, request = w.llm.queue.find(q => q.id === requestId);
    if (!request) return false;
    const npc = w.npcs.find(n => n.id === request.npcId)!;
    const result = validateInterpretation(input);
    const valid = result && npc.alive && result.relationshipInterpretations.every(r => npc.relationships.some(existing => existing.npcId === r.npcId));
    w.llm.queue = w.llm.queue.filter(q => q.id !== requestId);
    if (!valid || !result) {
      w.llm.rejected++; appendEvent(w, { kind: 'llm', actorId: npc.id, causeId: request.eventId, importance: 10, description: '허용되지 않은 LLM 응답을 거부했다.' }); return false;
    }
    for (const goal of result.newGoals) {
      if (npc.goals.some(g => g.kind === goal.kind)) continue;
      if (npc.goals.length >= 4) npc.goals.shift();
      npc.goals.push({ id: `g${w.nextId++}`, ...goal, createdAt: w.tick, sourceEventId: request.eventId });
      appendEvent(w, { kind: 'goal', actorId: npc.id, causeId: request.eventId, importance: 45, description: `${npc.identity.name}의 새 목표: ${GOAL_LABELS[goal.kind]}`, data: { kind: goal.kind, reason: goal.reason } });
    }
    for (const meaning of result.relationshipInterpretations) relationship(npc, meaning.npcId).interpretation = meaning.meaning;
    w.llm.completed++;
    appendEvent(w, { kind: 'llm', actorId: npc.id, causeId: request.eventId, importance: 25, description: `${npc.identity.name}의 해석: ${result.interpretation}`, data: { result: JSON.stringify(result), requestId } });
    return true;
  }
  failDecision(requestId: string, reason: string) {
    const w = this.state, request = w.llm.queue.find(q => q.id === requestId); if (!request) return;
    request.attempts++;
    if (request.attempts >= 3) { w.llm.failed++; w.llm.queue = w.llm.queue.filter(q => q.id !== requestId); }
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
  return { seed: w.seed, day: dayOf(w.tick), elapsedDays: Number(((w.tick - 36) / 144).toFixed(2)), population: w.npcs.filter(n => n.alive).length, deaths: w.stats.deaths, averageFood: Number((w.stats.foodSum / Math.max(1, w.stats.samples)).toFixed(2)), storage: w.storage, conflicts: w.stats.conflicts, thefts: w.stats.thefts, shares: w.stats.shares, strongestRelationship: pairs[0] ?? null, weakestRelationship: pairs.at(-1) ?? null, events: w.events.length, llm: { requested: w.llm.requested, completed: w.llm.completed, rejected: w.llm.rejected, failed: w.llm.failed, queued: w.llm.queue.length } };
}
