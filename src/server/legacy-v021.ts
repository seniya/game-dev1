// @ts-nocheck
// Immutable replay bridge from source 698739a2c3e0bc055af94fe1b312d4b9c1de9641.
// Generated with esbuild from the original sim/llm modules, external zod; do not edit engine rules here.
// ../../../..v0.21-source/src/sim/gatherings-types.ts
import { z } from "zod";
var id = z.string().min(1).max(100);
var tick = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
var GATHERING_LABELS = { meal: "\uD568\uAED8 \uC2DD\uC0AC", help: "\uC774\uC6C3\uC5D0\uAC8C \uC2DD\uB7C9 \uC804\uB2EC", harvest: "\uACF5\uB3D9 \uC218\uD655" };
var gatheringSchema = z.object({
  id,
  kind: z.enum(["meal", "help", "harvest"]),
  hostId: id,
  settlementId: id,
  buildingId: id,
  createdAt: tick,
  startsAt: tick,
  endsAt: tick,
  status: z.enum(["planned", "completed", "cancelled"]),
  recurring: z.object({ partnerId: id, evidence: z.array(id).min(2).max(3) }).strict().optional(),
  schedule: z.object({ eventId: id, requestEventId: id, requestedBy: id, tick, previousStart: tick }).strict().optional(),
  reason: z.string().max(1e3),
  sourceEventId: id,
  lastEventId: id,
  evidence: z.array(id).max(4),
  invitations: z.array(z.object({
    npcId: id,
    deliveredAt: tick,
    invitationEventId: id,
    responseEventId: id,
    senderId: id.optional(),
    depth: z.number().int().min(1).max(2).optional(),
    scheduleEventId: id.optional(),
    scheduleResponseId: id.optional(),
    status: z.enum(["accepted", "declined", "withdrawn", "attended", "missed"]),
    reason: z.string().max(1e3)
  }).strict()).max(3),
  progress: tick.max(6),
  attendance: z.array(id).max(4),
  finishedAt: tick.optional(),
  arrivals: z.array(z.object({ npcId: id, tick, eventId: id }).strict()).max(4)
}).strict();
var circleSchema = z.object({ hostId: id, partnerId: id, kind: z.enum(["meal", "help", "harvest"]), meetings: z.number().int().min(2).max(3), evidence: z.array(id).min(2).max(3), lastAt: tick }).strict();
var gatheringsSchema = z.object({ items: z.array(gatheringSchema).max(36), circles: z.array(circleSchema).max(48).optional(), lastProposalDay: z.number().int().min(-1) }).strict();
var isPlanned = (g) => g.status === "planned";

// ../../../..v0.21-source/src/sim/types.ts
var TICKS_PER_DAY = 144;
var GOAL_KINDS = ["secure_food", "help_neighbor", "earn_wealth", "expand_farm", "secure_storage", "build_home", "make_friend"];
var GOAL_LABELS = { secure_food: "\uCDA9\uBD84\uD55C \uC2DD\uB7C9 \uD655\uBCF4", help_neighbor: "\uC5B4\uB824\uC6B4 \uC774\uC6C3 \uB3D5\uAE30", earn_wealth: "\uC7AC\uC0B0 \uBAA8\uC73C\uAE30", expand_farm: "\uB18D\uC7A5 \uD655\uC7A5\uD558\uAE30", secure_storage: "\uCC3D\uACE0 \uBCF4\uC548 \uAC15\uD654", build_home: "\uC9D1 \uAC1C\uC120\uD558\uAE30", make_friend: "\uBBFF\uC744 \uB9CC\uD55C \uCE5C\uAD6C \uB9CC\uB4E4\uAE30" };
var OCCUPATIONS = { farmer: "\uB18D\uBD80", gatherer: "\uCC44\uC9D1\uAC00", woodcutter: "\uB098\uBB34\uAFBC", carpenter: "\uBAA9\uC218", merchant: "\uC0C1\uC778", miner: "\uAD11\uBD80", mason: "\uC11D\uACF5", miller: "\uC81C\uBD84\uC0AC", smith: "\uB300\uC7A5\uC7A5\uC774", gardener: "\uC6D0\uC608\uC0AC", weaver: "\uC9C1\uC870\uACF5", tailor: "\uC7AC\uBD09\uC0AC", cook: "\uC694\uB9AC\uC0AC", furniture_maker: "\uAC00\uAD6C\uC7A5\uC778", vegetable_grower: "\uCC44\uC18C\uB18D\uBD80", orchardist: "\uACFC\uC218\uB18D\uBD80", fisher: "\uC5B4\uBD80", herder: "\uBAA9\uCD95\uC5C5\uC790", clay_digger: "\uC810\uD1A0\uCC44\uAD74\uACF5", salt_worker: "\uC18C\uAE08\uCC44\uAD74\uACF5", baker: "\uC81C\uBE75\uC0AC", preserver: "\uC2DD\uD488\uAC00\uACF5\uC0AC", cheesemaker: "\uCE58\uC988\uC7A5\uC778", potter: "\uB3C4\uACF5", blanket_maker: "\uB2F4\uC694\uC7A5\uC778", herbalist: "\uC57D\uC81C\uC0AC", none: "\uBB34\uC9C1" };
var DAYS_PER_YEAR = 12;
var YEAR_TICKS = DAYS_PER_YEAR * TICKS_PER_DAY;
var MAX_POPULATION = 3e3;

// ../../../..v0.21-source/src/sim/memory-retrieval.ts
function retrieveMemories(memories, tick3, query = {}, limit = 8) {
  return memories.map((memory2) => {
    const recency = Math.pow(0.995, Math.max(0, tick3 - (memory2.lastRetrievedAt ?? memory2.createdAt)) / (TICKS_PER_DAY / 24));
    const importance = memory2.importance / 100;
    const dimensions = [
      query.npcIds?.length ? Number(memory2.relatedNpcIds.some((id7) => query.npcIds.includes(id7))) : void 0,
      query.locationIds?.length ? Number(memory2.relatedLocationIds.some((id7) => query.locationIds.includes(id7))) : void 0,
      query.types?.length ? Number(query.types.includes(memory2.type)) : void 0
    ].filter((v) => v !== void 0);
    const relevance = dimensions.length ? dimensions.reduce((a, b) => a + b, 0) / dimensions.length : 0;
    return { memory: memory2, recency, importance, relevance, score: recency + importance + relevance };
  }).sort((a, b) => b.score - a.score || b.memory.createdAt - a.memory.createdAt || a.memory.id.localeCompare(b.memory.id, "en")).slice(0, Math.max(0, Math.min(8, limit)));
}

// ../../../..v0.21-source/src/sim/random.ts
function random(state) {
  let x = state.rng;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.rng = x >>> 0;
  return state.rng / 4294967296;
}
var clamp = (n, min = 0, max = 100) => Math.min(max, Math.max(min, n));
var distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
var dayOf = (tick3) => Math.floor(tick3 / 144) + 1;

// ../../../..v0.21-source/src/sim/spatial.ts
var indexes = /* @__PURE__ */ new WeakMap();
var key = (x, y) => `${Math.floor(x / 8)},${Math.floor(y / 8)}`;
function indexPeople(w) {
  const i = { buckets: /* @__PURE__ */ new Map(), order: /* @__PURE__ */ new Map(), cells: /* @__PURE__ */ new Map() };
  indexes.set(w, i);
  w.npcs.forEach((n, order) => {
    i.order.set(n.id, order);
    updatePerson(w, n);
  });
}
function updatePerson(w, n) {
  const i = indexes.get(w);
  if (!i) return;
  const cell = key(n.position.x, n.position.y), previous = i.cells.get(n.id);
  if (previous === cell) return;
  if (previous) i.buckets.get(previous)?.delete(n);
  if (!i.buckets.has(cell)) i.buckets.set(cell, /* @__PURE__ */ new Set());
  i.buckets.get(cell).add(n);
  i.cells.set(n.id, cell);
}
function neighbours(w, n, radius) {
  const i = indexes.get(w);
  if (!i) return w.npcs.filter((p) => distance(n.position, p.position) <= radius);
  const result = [];
  for (let y = Math.floor((n.position.y - radius) / 8); y <= Math.floor((n.position.y + radius) / 8); y++) for (let x = Math.floor((n.position.x - radius) / 8); x <= Math.floor((n.position.x + radius) / 8); x++) {
    for (const p of i.buckets.get(`${x},${y}`) ?? []) if (distance(n.position, p.position) <= radius) result.push(p);
  }
  return result.sort((a, b) => i.order.get(a.id) - i.order.get(b.id));
}
var peopleIndexes = /* @__PURE__ */ new WeakMap();
function person(w, id7) {
  if (!id7) return;
  let i = peopleIndexes.get(w);
  if (!i || i.count !== w.npcs.length) {
    i = { count: w.npcs.length, byId: new Map(w.npcs.map((n) => [n.id, n])) };
    peopleIndexes.set(w, i);
  }
  return i.byId.get(id7);
}

// ../../../..v0.21-source/src/sim/social.ts
var indexes2 = /* @__PURE__ */ new WeakMap();
function eventById(w, id7) {
  let index = indexes2.get(w);
  if (!index) {
    index = { size: 0, byId: /* @__PURE__ */ new Map() };
    indexes2.set(w, index);
  }
  while (index.size < w.events.length) {
    const e = w.events[index.size++];
    index.byId.set(e.id, e);
  }
  return index.byId.get(id7);
}
function appendEvent(w, input) {
  const region = input.actorId ? person(w, input.actorId)?.settlementId : input.locationId ? w.buildings.find((b) => b.id === input.locationId)?.settlementId : void 0;
  const e = { ...input, id: `e${w.nextId++}`, tick: w.tick, participants: input.participants ?? [input.actorId, input.targetId].filter((id7) => !!id7), data: { ...region ? { settlementId: region } : {}, ...input.data } };
  const actor = w.civilization?.detail === "focused" && input.actorId ? person(w, input.actorId) : void 0;
  const brief = w.civilization?.detail === "focused" && actor && actor.settlementId !== w.civilization.focus && input.importance < 30 && ["arrival", "consumption", "storage", "failure"].includes(input.kind);
  if (!brief) w.events.push(e);
  return e;
}
function relationship(n, targetId) {
  let r = n.relationships.find((r2) => r2.npcId === targetId);
  if (!r) {
    r = { npcId: targetId, familiarity: 0, trust: 35, affection: 0, fear: 0, resentment: 0, respect: 20, family: false, interpretation: "\uC544\uC9C1 \uC11C\uB85C\uB97C \uC798 \uBAA8\uB978\uB2E4.", evidence: [] };
    n.relationships.push(r);
  }
  return r;
}
function changeRelationship(w, n, targetId, changes, cause, meaning) {
  const r = relationship(n, targetId), actual = [];
  const measurements = {};
  for (const [key2, amount] of Object.entries(changes)) {
    const k = key2, before = r[k];
    r[k] = clamp(before + amount);
    if (r[k] !== before) {
      measurements[`${k}Before`] = before;
      measurements[`${k}After`] = r[k];
    }
    if (r[k] !== before) actual.push(`${key2} ${r[k] - before > 0 ? "+" : ""}${Math.round((r[k] - before) * 100) / 100}`);
  }
  r.interpretation = meaning;
  if (!r.evidence.includes(cause.id)) r.evidence.push(cause.id);
  const evidenceLimit = w.npcs.length > 400 ? 4 : 12;
  if (r.evidence.length > evidenceLimit) r.evidence = [r.evidence[0], ...r.evidence.slice(-(evidenceLimit - 1))];
  appendEvent(w, { kind: "relationship", actorId: n.id, targetId, importance: 30, causeId: cause.id, description: `${n.identity.name} \u2192 ${person(w, targetId)?.identity.name}: ${actual.join(", ") || "\uAD00\uACC4\uC758 \uAE30\uC5B5\uC744 \uAC31\uC2E0"}`, data: { meaning, ...measurements } });
}
function remember(w, n, event2, description2 = event2.description) {
  if (event2.importance < 45 || !n.alive) return;
  const repeated = n.memories.find((m) => dayOf(m.createdAt) === dayOf(w.tick) && m.type === memoryType(event2) && m.relatedNpcIds.join(",") === event2.participants.filter((id7) => id7 !== n.id).join(",") && m.description === description2);
  if (repeated) {
    repeated.repetitions++;
    repeated.importance = clamp(repeated.importance + 2);
    return;
  }
  const memory2 = { id: `m${w.nextId++}`, type: memoryType(event2), description: description2, importance: event2.importance, emotionalImpact: ["theft", "witness", "rumor", "default", "scarcity", "death"].includes(event2.kind) ? -event2.importance : event2.importance * 0.6, createdAt: w.tick, relatedNpcIds: event2.participants.filter((id7) => id7 !== n.id), relatedLocationIds: event2.locationId ? [event2.locationId] : [], sourceEventId: event2.id, repetitions: 1 };
  n.memories.push(memory2);
  if (event2.kind === "gathering" && ["cancelled", "declined", "withdrawn", "missed"].includes(String(event2.data.phase))) memory2.emotionalImpact = event2.data.phase === "missed" ? -15 : 0;
  const memoryLimit = w.npcs.length > 400 ? 24 : 40;
  if (n.memories.length > memoryLimit) {
    n.memories.sort((a, b) => b.importance - a.importance || b.createdAt - a.createdAt);
    n.memories.length = memoryLimit;
  }
  appendEvent(w, { kind: "memory", actorId: n.id, importance: 15, causeId: event2.id, description: `${n.identity.name}\uC758 \uAE30\uC5B5: ${description2}` });
}
function memoryType(e) {
  if (["theft", "witness", "death"].includes(e.kind)) return "trauma";
  if (["trade", "loan", "default", "repayment", "scarcity"].includes(e.kind)) return "economic";
  if (e.kind === "project") return "achievement";
  return "social";
}
function gate(w, n, e) {
  if (!w.llm.enabled || e.importance < 65 || !e.participants.includes(n.id) || !n.alive) return;
  const key2 = `${n.id}:${e.kind}`;
  if (w.llm.gateKeys.includes(key2) || (w.llm.dailyByNpc[n.id] ?? 0) >= 2 || w.llm.dailyTotal >= 12 || w.llm.queue.length >= 24) return;
  w.llm.gateKeys.push(key2);
  w.llm.dailyByNpc[n.id] = (w.llm.dailyByNpc[n.id] ?? 0) + 1;
  w.llm.dailyTotal++;
  w.llm.requested++;
  w.llm.queue.push({ id: `q${w.nextId++}`, npcId: n.id, eventId: e.id, tick: w.tick, attempts: 0 });
}
function socialEvent(w, input) {
  const e = appendEvent(w, input);
  for (const id7 of e.participants) {
    const n = person(w, id7);
    if (n) {
      remember(w, n, e);
      gate(w, n, e);
    }
  }
  return e;
}
function decayMemories(w) {
  for (const n of w.npcs) {
    n.knownRumors = n.knownRumors.filter((id7) => w.tick - (eventById(w, id7)?.tick ?? -Infinity) < TICKS_PER_DAY * 7);
    for (const memory2 of n.memories) memory2.importance = Math.max(0, memory2.importance - (memory2.importance >= 75 ? 0.15 : 2));
    n.memories = n.memories.filter((m) => m.importance > 15 || w.tick - m.createdAt < TICKS_PER_DAY);
  }
}

// ../../../..v0.21-source/src/sim/cognition.ts
var PLAN_LABELS = { rest: "\uD734\uC2DD\uACFC \uC218\uBA74", sustain: "\uC2DD\uC0AC\uC640 \uC0DD\uD65C \uC900\uBE44", work: "\uC0DD\uC5C5\uACFC \uB9C8\uC744 \uC77C", connect: "\uC774\uC6C3\uACFC \uAD50\uB958" };
function cognition(n) {
  return n.cognition ??= { consideredMemoryIds: [], lastReflectionAt: 0, reflections: [] };
}
var reflectionRules = [
  { goal: "secure_food", kinds: ["scarcity", "health"], text: "\uBA39\uAC70\uB9AC\uC640 \uBAB8 \uC0C1\uD0DC\uC758 \uC5B4\uB824\uC6C0\uC774 \uBC18\uBCF5\uB418\uC5C8\uB2E4. \uC0DD\uD65C\uC5D0 \uD544\uC694\uD55C \uC2DD\uB7C9\uC744 \uBA3C\uC800 \uCC59\uAE30\uACE0 \uC2F6\uB2E4." },
  { goal: "help_neighbor", kinds: ["share", "repayment"], text: "\uB3C4\uC6C0\uC744 \uB098\uB204\uAC70\uB098 \uC57D\uC18D\uC744 \uC9C0\uD0A8 \uACBD\uD5D8\uC774 \uC313\uC600\uB2E4. \uC5EC\uC720\uAC00 \uC0DD\uAE30\uBA74 \uC774\uC6C3\uC744 \uB3D5\uACE0 \uC2F6\uB2E4." },
  { goal: "make_friend", kinds: ["talk", "family", "education", "gathering"], text: "\uD568\uAED8 \uC774\uC57C\uAE30\uD558\uACE0 \uBC30\uC6B4 \uACBD\uD5D8\uC774 \uC313\uC600\uB2E4. \uAC00\uAE4C\uC6B4 \uC0AC\uB78C\uB4E4\uACFC \uAD50\uB958\uB97C \uC774\uC5B4\uAC00\uACE0 \uC2F6\uB2E4." },
  { goal: "secure_storage", kinds: ["witness"], text: "\uACF5\uB3D9 \uC790\uC6D0\uC774 \uC0AC\uB77C\uC9C0\uB294 \uC77C\uC744 \uAC70\uB4ED \uBAA9\uACA9\uD588\uB2E4. \uCC3D\uACE0\uB97C \uB354 \uC548\uC804\uD558\uAC8C \uB9CC\uB4E4\uACE0 \uC2F6\uB2E4." },
  { goal: "earn_wealth", kinds: ["trade", "default"], text: "\uAC70\uB798\uC640 \uC0DD\uACC4\uC758 \uACBD\uD5D8\uC774 \uC313\uC600\uB2E4. \uC0DD\uD65C\uC5D0 \uD544\uC694\uD55C \uC7AC\uC0B0\uC744 \uB9C8\uB828\uD558\uACE0 \uC2F6\uB2E4." }
];
function reflect(w, n) {
  const c = cognition(n);
  if (!n.alive || w.tick - c.lastReflectionAt < 36) return;
  const fresh = n.memories.filter((m) => !c.consideredMemoryIds.includes(m.id));
  if (fresh.reduce((sum, m) => sum + m.importance, 0) < 180) return;
  const grounded = fresh.filter((m) => {
    const e = eventById(w, m.sourceEventId);
    return e?.participants.includes(n.id) && (e.kind !== "gathering" || e.data.phase === "completed");
  });
  const groups = reflectionRules.map((rule) => ({ rule, memories: grounded.filter((m) => rule.kinds.includes(eventById(w, m.sourceEventId).kind)) })).filter((g) => new Set(g.memories.map((m) => m.sourceEventId)).size >= 2).sort((a, b) => b.memories.reduce((s, m) => s + m.importance, 0) - a.memories.reduce((s, m) => s + m.importance, 0));
  c.consideredMemoryIds = n.memories.map((m) => m.id);
  c.lastReflectionAt = w.tick;
  const group = groups[0];
  if (!group) return;
  const evidence2 = [...new Set(retrieveMemories(group.memories, w.tick, {}, 4).map((r) => r.memory.sourceEventId))];
  const event2 = appendEvent(w, {
    kind: "memory",
    actorId: n.id,
    importance: 40,
    causeId: evidence2[0],
    description: `${n.identity.name}\uC758 \uC131\uCC30: ${group.rule.text}`,
    data: { cognition: "reflection", model: "rules", goal: group.rule.goal, evidence: evidence2 }
  });
  c.reflections.push({ eventId: event2.id, tick: w.tick, goal: group.rule.goal, text: group.rule.text, evidence: evidence2 });
  c.reflections = c.reflections.slice(-8);
}
function urgentNeed(n) {
  if (n.needs.thirst > 90) return "thirst";
  if (n.needs.hunger > 88) return "hunger";
  if (n.needs.fatigue > 94) return "fatigue";
  if (n.needs.health < 35) return "health";
  return void 0;
}
var interruptionLabels = { hunger: "\uBC30\uACE0\uD514", thirst: "\uAC08\uC99D", fatigue: "\uD53C\uB85C", health: "\uAC74\uAC15 \uC545\uD654" };
function preparePlan(w, n) {
  reflect(w, n);
  const c = cognition(n), previous = c.plan, day = Math.floor(w.tick / TICKS_PER_DAY);
  const recent = c.reflections.filter((r) => w.tick - r.tick <= 7 * TICKS_PER_DAY).at(-1);
  const goal2 = n.goals.at(-1), focus = recent && (!goal2 || recent.tick > goal2.createdAt) ? recent.goal : goal2?.kind;
  const signature = `${n.occupation}:${n.homeId}:${goal2?.id ?? ""}:${recent?.eventId ?? ""}`;
  const interruption = urgentNeed(n);
  if (!previous || previous.day !== day || previous.signature !== signature || previous.interruption !== interruption) {
    const reason = interruption ? `${interruptionLabels[interruption]} \uB54C\uBB38\uC5D0 \uB2F9\uC7A5\uC758 \uD544\uC694\uB97C \uBA3C\uC800 \uD574\uACB0\uD55C\uB2E4.` : previous?.interruption ? "\uAE09\uD55C \uD544\uC694\uB97C \uD574\uACB0\uD558\uC5EC \uD558\uB8E8 \uACC4\uD68D\uC73C\uB85C \uB3CC\uC544\uAC04\uB2E4." : previous?.day === day ? "\uC0C8 \uBAA9\uD45C\xB7\uC131\uCC30 \uB610\uB294 \uC0DD\uD65C \uD130\uC804\uC758 \uBCC0\uD654\uC5D0 \uB9DE\uCDB0 \uB0A8\uC740 \uD558\uB8E8\uB97C \uC870\uC815\uD55C\uB2E4." : "\uC0C8 \uD558\uB8E8\uC758 \uC0DD\uD65C \uB9AC\uB4EC\uACFC \uAE30\uC5B5\uC744 \uBC14\uD0D5\uC73C\uB85C \uACC4\uD68D\uD55C\uB2E4.";
    c.plan = {
      day,
      updatedAt: w.tick,
      revision: previous?.day === day ? previous.revision + 1 : 1,
      signature,
      reason,
      blocks: [{ start: 0, end: 30, intent: "rest" }, { start: 30, end: 54, intent: "sustain" }, { start: 54, end: 96, intent: "work" }, { start: 96, end: 126, intent: "connect" }, { start: 126, end: 144, intent: "rest" }],
      ...focus ? { focus } : {},
      evidence: [.../* @__PURE__ */ new Set([...goal2?.sourceEventId ? [goal2.sourceEventId] : [], ...recent ? [recent.eventId] : []])],
      ...interruption ? { interruption } : {}
    };
  }
  return c.plan;
}
var intentActions = {
  rest: ["Sleep", "Idle"],
  sustain: ["Eat", "Drink", "Wash", "TakeItem", "Gather"],
  work: ["Work", "Gather", "Trade", "StoreItem"],
  connect: ["Talk", "Share", "Repay"]
};
var goalActions = {
  secure_food: ["Gather", "TakeItem", "Trade"],
  help_neighbor: ["Share", "Repay"],
  earn_wealth: ["Work", "Trade"],
  expand_farm: ["Work"],
  secure_storage: ["Work"],
  build_home: ["Work"],
  make_friend: ["Talk"]
};
function matchesFocus(w, option, focus) {
  if (!focus || !goalActions[focus].includes(option.kind)) return false;
  if (["expand_farm", "secure_storage", "build_home"].includes(focus)) return option.targetId?.endsWith(`:${focus}`) ?? false;
  if (focus === "earn_wealth" && option.kind === "Trade") return option.targetId === "sell";
  if (focus === "secure_food") {
    if (option.kind === "Gather") return w.resources.some((r) => r.id === option.targetId && r.kind === "food");
    if (option.kind === "Trade") return option.targetId === "buy" || option.targetId?.startsWith("peer:") || ["goods:meals", "goods:vegetables", "goods:fruit", "goods:bread", "goods:cheese", "goods:stew", "goods:dried_fish"].includes(option.targetId ?? "");
  }
  return true;
}
function applyPlan(w, n, options) {
  const plan2 = preparePlan(w, n);
  const query = { types: plan2.focus === "secure_food" || plan2.focus === "earn_wealth" ? ["economic"] : ["social"] };
  const hits = retrieveMemories(n.memories, w.tick, query);
  cognition(n).retrieval = { tick: w.tick, items: hits.map((h) => ({ eventId: h.memory.sourceEventId, score: h.score, recency: h.recency, importance: h.importance, relevance: h.relevance })) };
  for (const h of hits) h.memory.lastRetrievedAt = w.tick;
  const intent = plan2.blocks.find((b) => w.tick % TICKS_PER_DAY >= b.start && w.tick % TICKS_PER_DAY < b.end).intent;
  for (const option of options) {
    if (plan2.interruption) {
      const urgent = plan2.interruption === "thirst" ? option.kind === "Drink" : plan2.interruption === "hunger" ? n.inventory.food > 0 ? option.kind === "Eat" : option.kind === "Borrow" || matchesFocus(w, option, "secure_food") : ["Sleep", "Eat", "Drink"].includes(option.kind);
      if (urgent) {
        option.score += 35;
        option.reason += ` \xB7 ${plan2.reason}`;
      }
      continue;
    }
    const householdPurchase = option.kind === "Trade" && option.targetId?.startsWith("goods:");
    const scheduled = householdPurchase ? intent === "sustain" : intentActions[intent].includes(option.kind);
    const focused = matchesFocus(w, option, plan2.focus);
    if (!scheduled && !focused) continue;
    option.score += (scheduled ? 3 : 0) + (focused ? 2 : 0);
    option.reason += ` \xB7 \uD558\uB8E8 \uACC4\uD68D: ${PLAN_LABELS[intent]}${focused ? ` / ${GOAL_LABELS[plan2.focus]}` : ""}`;
    option.evidence = [.../* @__PURE__ */ new Set([...option.evidence ?? [], ...plan2.evidence])].slice(0, 12);
  }
}

// ../../../..v0.21-source/src/sim/urban-types.ts
var GOODS = ["grain", "stone", "ore", "tools", "herbs", "fiber", "cloth", "clothes", "meals", "furniture", "vegetables", "fruit", "fish", "meat", "milk", "wool", "clay", "salt", "bread", "dried_fish", "cheese", "pottery", "blankets", "medicine", "stew"];
var INDUSTRIES = ["field", "quarry", "mine", "mill", "smith", "garden", "weaving", "tailoring", "kitchen", "joinery", "vegetable_farm", "orchard", "fishery", "pasture", "clay_pit", "saltworks", "bakery", "preserving", "dairy", "pottery", "blanket_workshop", "apothecary", "cookhouse"];
var SERVICES = ["road", "water", "sanitation", "clinic", "school"];
var emptyGoods = () => Object.fromEntries(GOODS.map((g) => [g, 0]));
var GOOD_LABELS = { grain: "\uACE1\uBB3C", stone: "\uC11D\uC7AC", ore: "\uAD11\uC11D", tools: "\uB3C4\uAD6C", herbs: "\uC57D\uCD08", fiber: "\uC12C\uC720", cloth: "\uC9C1\uBB3C", clothes: "\uC637", meals: "\uC694\uB9AC", furniture: "\uAC00\uAD6C", vegetables: "\uCC44\uC18C", fruit: "\uACFC\uC77C", fish: "\uC0DD\uC120", meat: "\uACE0\uAE30", milk: "\uC6B0\uC720", wool: "\uC591\uBAA8", clay: "\uC810\uD1A0", salt: "\uC18C\uAE08", bread: "\uBE75", dried_fish: "\uAC74\uC5B4\uBB3C", cheese: "\uCE58\uC988", pottery: "\uB3C4\uC790\uAE30", blankets: "\uB2F4\uC694", medicine: "\uC57D\uD488", stew: "\uC2A4\uD29C" };
var INDUSTRY_LABELS = { field: "\uACE1\uBB3C \uB18D\uC7A5", quarry: "\uCC44\uC11D\uC7A5", mine: "\uAD11\uC0B0", mill: "\uC81C\uBD84\uC18C", smith: "\uB3C4\uAD6C \uACF5\uBC29", garden: "\uC57D\uCD08\xB7\uC12C\uC720\uBC2D", weaving: "\uC9C1\uC870\uC18C", tailoring: "\uC7AC\uBD09\uC18C", kitchen: "\uACF5\uB3D9 \uBD80\uC5CC", joinery: "\uAC00\uAD6C \uACF5\uBC29", vegetable_farm: "\uCC44\uC18C\uBC2D", orchard: "\uACFC\uC218\uC6D0", fishery: "\uC591\uC5B4\uC7A5", pasture: "\uBAA9\uCD95\uC7A5", clay_pit: "\uC810\uD1A0 \uCC44\uAD74\uC7A5", saltworks: "\uC554\uC5FC \uCC44\uAD74\uC7A5", bakery: "\uC81C\uBE75\uC18C", preserving: "\uC2DD\uD488 \uBCF4\uC874\uC18C", dairy: "\uC720\uC81C\uD488 \uACF5\uBC29", pottery: "\uB3C4\uC790\uAE30 \uACF5\uBC29", blanket_workshop: "\uB2F4\uC694 \uACF5\uBC29", cookhouse: "\uC2A4\uD29C \uBD80\uC5CC", apothecary: "\uC57D\uBC29" };
var SERVICE_LABELS = { road: "\uB3C4\uB85C", water: "\uAE09\uC218", sanitation: "\uC704\uC0DD", clinic: "\uC9C4\uB8CC", school: "\uAD50\uC721" };
var INDUSTRY_SKILL = { field: "field", quarry: "quarry", mine: "mine", mill: "mill", smith: "smith", garden: "field", weaving: "mill", tailoring: "mill", kitchen: "mill", joinery: "smith", vegetable_farm: "field", orchard: "field", fishery: "field", pasture: "field", clay_pit: "quarry", saltworks: "mine", bakery: "mill", preserving: "mill", dairy: "mill", pottery: "smith", blanket_workshop: "mill", cookhouse: "mill", apothecary: "mill" };
var INDUSTRY_JOB = { field: "farmer", quarry: "mason", mine: "miner", mill: "miller", smith: "smith", garden: "gardener", weaving: "weaver", tailoring: "tailor", kitchen: "cook", joinery: "furniture_maker", vegetable_farm: "vegetable_grower", orchard: "orchardist", fishery: "fisher", pasture: "herder", clay_pit: "clay_digger", saltworks: "salt_worker", bakery: "baker", preserving: "preserver", dairy: "cheesemaker", pottery: "potter", blanket_workshop: "blanket_maker", cookhouse: "cook", apothecary: "herbalist" };
var GOOD_PRICES = { grain: 2, stone: 2, ore: 2, tools: 4, herbs: 2, fiber: 2, cloth: 3, clothes: 5, meals: 3, furniture: 6, vegetables: 2, fruit: 2, fish: 2, meat: 2, milk: 2, wool: 2, clay: 2, salt: 2, bread: 4, dried_fish: 4, cheese: 4, pottery: 4, blankets: 4, medicine: 4, stew: 4 };
var RAW_GOODS = ["grain", "stone", "ore", "herbs", "fiber", "vegetables", "fruit", "fish", "meat", "milk", "wool", "clay", "salt"];
var BASIC_RESOURCE_LABELS = { wood: "\uBAA9\uC7AC", ...Object.fromEntries(RAW_GOODS.map((g) => [g, GOOD_LABELS[g]])) };
var PRODUCTS = GOODS.filter((g) => !RAW_GOODS.includes(g));
var MINERALS = ["stone", "ore", "clay", "salt"];
var EXTRA_RECIPES = {
  vegetable_farm: { inputs: {}, outputs: { vegetables: 3 }, growth: 3 },
  orchard: { inputs: {}, outputs: { fruit: 3 }, growth: 3 },
  fishery: { inputs: {}, outputs: { fish: 2 }, growth: 2 },
  pasture: { inputs: { grain: 2 }, outputs: { meat: 1, milk: 2, wool: 1 }, growth: 2 },
  clay_pit: { inputs: {}, outputs: { clay: 2 }, deposit: "clay" },
  saltworks: { inputs: {}, outputs: { salt: 2 }, deposit: "salt" },
  bakery: { inputs: { grain: 2, milk: 1 }, outputs: { bread: 3 }, wood: 1 },
  preserving: { inputs: { fish: 2, salt: 1 }, outputs: { dried_fish: 2 } },
  dairy: { inputs: { milk: 2, salt: 1 }, outputs: { cheese: 2 } },
  pottery: { inputs: { clay: 3 }, outputs: { pottery: 2 }, wood: 1 },
  blanket_workshop: { inputs: { wool: 2, cloth: 1 }, outputs: { blankets: 1 } },
  cookhouse: { inputs: { meat: 1, vegetables: 2, salt: 1 }, outputs: { stew: 3 }, wood: 1 },
  apothecary: { inputs: { herbs: 2, pottery: 1 }, outputs: { medicine: 2 } }
};
var isGrowingIndustry = (kind) => kind === "field" || kind === "garden" || !!EXTRA_RECIPES[kind]?.growth;

// ../../../..v0.21-source/src/sim/employment.ts
var WORK_STATUS_LABELS = { child: "\uBB34\uC9C1 \xB7 \uC544\uB3D9\xB7\uD559\uC0DD", retired: "\uBB34\uC9C1 \xB7 \uC740\uD1F4", recovering: "\uBB34\uC9C1 \xB7 \uC694\uC591", seeking: "\uBB34\uC9C1 \xB7 \uAD6C\uC9C1 \uC911", employed: "\uC0AC\uC5C5\uCCB4 \uADFC\uBB34", independent: "\uC790\uC601 \uC0DD\uACC4 \uD65C\uB3D9", deceased: "\uC0AC\uB9DD" };
function workRestriction(w, n) {
  if (n.identity.age < 18) return "child";
  if (n.identity.age >= 65) return "retired";
  const u = w.urban?.citizens[n.id];
  if (n.needs.health < 40 || (u?.injury ?? 0) >= 60 || (u?.disease ?? 0) >= 60) return "recovering";
}
function canWork(w, n) {
  return n.alive && !workRestriction(w, n);
}
function workStatus(w, n) {
  return !n.alive ? "deceased" : workRestriction(w, n) ?? (w.urban.citizens[n.id]?.employer ? "employed" : n.occupation === "none" ? "seeking" : "independent");
}
function occupationLabel(w, n) {
  const state = workStatus(w, n);
  return ["child", "retired", "recovering", "seeking"].includes(state) ? WORK_STATUS_LABELS[state] : OCCUPATIONS[n.occupation];
}
function syncEmployment(w, n, record2 = true) {
  const restricted = workRestriction(w, n), previous = n.occupation;
  if (!restricted && n.alive && n.occupation !== "none") return;
  if (restricted || !n.alive) {
    if (n.occupation !== "none") {
      n.previousOccupation = n.occupation;
      n.occupation = "none";
    }
    for (const e of w.urban.enterprises) if (e.workers.includes(n.id)) e.workers = e.workers.filter((id7) => id7 !== n.id);
    delete w.urban.citizens[n.id].employer;
    if (n.currentAction?.kind === "Work" || n.currentAction?.kind === "Gather") n.currentAction = void 0;
  } else if (n.occupation === "none" && n.previousOccupation && n.previousOccupation !== "none") {
    n.occupation = n.previousOccupation;
    delete n.previousOccupation;
  }
  if (record2 && n.alive && n.occupation !== previous) appendEvent(w, { kind: "occupation", actorId: n.id, importance: 45, description: `${n.identity.name}: ${OCCUPATIONS[previous]} \u2192 ${occupationLabel(w, n)}.`, data: { previous, occupation: n.occupation, status: workStatus(w, n) } });
}
function migrateResources(w) {
  for (const goods2 of [w.urban.ledger.opening, w.urban.ledger.produced, w.urban.ledger.consumed, ...w.urban.cities.map((c) => c.goods)]) for (const good of GOODS.slice(10)) goods2[good] ??= 0;
  for (const c of w.urban.cities) for (const key2 of ["clay", "salt"]) {
    c.deposits[key2] ??= key2 === "clay" ? 1200 : 800;
    c.initialDeposits[key2] ??= c.deposits[key2];
  }
  for (const n of w.npcs) syncEmployment(w, n, false);
}

// ../../../..v0.21-source/src/sim/living-types.ts
import { z as z2 } from "zod";
var score = z2.number().finite().min(0).max(100);
var traitsSchema = z2.object({ patience: score, optimism: score, frugality: score, independence: score }).strict();
var desiresSchema = z2.object({ security: score, belonging: score, comfort: score, mastery: score, prosperity: score, novelty: score }).strict();
var bodySchema = z2.object({ stamina: score, cleanliness: score, warmth: score, pain: score }).strict();
var livingPersonSchema = z2.object({ traits: traitsSchema, desires: desiresSchema, body: bodySchema, clothing: score, furnishings: score }).strict();
var HOME_KINDS = ["shared", "cottage", "courtyard", "townhouse", "insulated"];
var HOMES = {
  shared: { label: "\uACF5\uB3D9\uC8FC\uD0DD", comfort: 45, privacy: 25, insulation: 40, rent: 1 },
  cottage: { label: "\uC624\uB450\uB9C9", comfort: 50, privacy: 80, insulation: 25, rent: 1 },
  courtyard: { label: "\uB9C8\uB2F9\uC9D1", comfort: 65, privacy: 55, insulation: 50, rent: 2 },
  townhouse: { label: "\uC0C1\uAC00\uC8FC\uD0DD", comfort: 75, privacy: 45, insulation: 65, rent: 3 },
  insulated: { label: "\uB2E8\uC5F4\uC8FC\uD0DD", comfort: 80, privacy: 75, insulation: 90, rent: 4 }
};
var livingSchema = z2.object({ since: z2.number().int().nonnegative(), people: z2.record(livingPersonSchema), homes: z2.record(z2.enum(HOME_KINDS)) }).strict();

// ../../../..v0.21-source/src/sim/living.ts
function newLivingPerson(n) {
  const p = n.personality;
  return {
    traits: { patience: Math.round((p.diligence + p.empathy) / 2), optimism: Math.round(100 - p.aggression * 0.6), frugality: Math.round((p.diligence + 100 - p.greed) / 2), independence: Math.round(100 - p.sociability * 0.7) },
    desires: { security: 35, belonging: Math.round(100 - n.needs.social), comfort: 30, mastery: Math.round(p.diligence * 0.5), prosperity: Math.round(p.greed * 0.6), novelty: Math.round(p.curiosity * 0.5) },
    body: { stamina: Math.round(100 - n.needs.fatigue * 0.5), cleanliness: 80, warmth: 80, pain: 0 },
    clothing: 0,
    furnishings: 0
  };
}
function initializeLiving(w) {
  w.living ??= { since: w.tick, people: {}, homes: {} };
  for (const n of w.npcs) w.living.people[n.id] ??= newLivingPerson(n);
  let i = 0;
  for (const b of w.buildings) if (b.kind === "home") {
    w.living.homes[b.id] ??= HOME_KINDS[i % HOME_KINDS.length];
    i++;
  }
}
function homeProfile(w, n) {
  return HOMES[w.living.homes[n.homeId] ?? "shared"];
}
function livingTick(w, n) {
  const l = w.living.people[n.id], u = w.urban.citizens[n.id], b = l.body;
  const resting = !n.currentAction?.path.length && (n.currentAction?.kind === "Sleep" || n.currentAction?.kind === "Idle");
  const labour = n.currentAction?.kind === "Work" || n.currentAction?.kind === "Gather";
  b.stamina = clamp(b.stamina + (resting ? 1.2 : labour ? -0.22 : -0.06));
  b.cleanliness = clamp(b.cleanliness - (labour ? 0.07 : 0.025));
  const insulation = homeProfile(w, n).insulation * (w.urban.buildings[n.homeId]?.condition ?? 100) / 100;
  const targetWarmth = clamp((seasonIndex(w) === 3 ? 38 : 75) + l.clothing * 0.25 + (resting && n.currentAction?.kind === "Sleep" ? insulation * 0.35 : 0) - (w.weather === "rain" && !resting ? 12 : 0));
  b.warmth = clamp(b.warmth + (targetWarmth - b.warmth) * 0.03);
  const targetPain = clamp(u.injury * 0.8 + u.disease * 0.25 + Math.max(0, 25 - b.stamina) * 0.2);
  b.pain = clamp(b.pain + (targetPain - b.pain) * 0.015 - (resting ? 0.08 : 0));
  if (b.warmth < 35 || b.stamina < 15) n.needs.fatigue = clamp(n.needs.fatigue + 0.07);
}
function livingDay(w) {
  initializeLiving(w);
  for (const n of w.npcs) if (n.alive) {
    const l = w.living.people[n.id], u = w.urban.citizens[n.id], d = l.desires;
    l.clothing = clamp(l.clothing - 2);
    l.furnishings = clamp(l.furnishings - 0.5);
    const target = { security: (100 - n.needs.safety + n.needs.hunger) / 2, belonging: 100 - n.needs.social, comfort: (100 - u.housing + n.needs.fatigue + 100 - l.body.warmth) / 3, mastery: 100 - (n.life.skill + u.education) / 2, prosperity: clamp(70 + n.personality.greed * 0.3 - n.wealth), novelty: n.personality.curiosity };
    for (const key2 of Object.keys(d)) d[key2] = clamp(d[key2] + (target[key2] - d[key2]) * 0.25);
    u.stress = clamp(u.stress + (l.body.cleanliness < 25 ? 2 : 0) + l.body.pain * 0.025 - l.traits.optimism * 0.012);
  }
}
var CONSUMABLES = ["herbs", "clothes", "meals", "furniture", "vegetables", "fruit", "bread", "dried_fish", "cheese", "stew", "blankets", "medicine", "pottery"];
function consumptionNeed(w, n, good) {
  const l = w.living.people[n.id], u = w.urban.citizens[n.id];
  if (good === "medicine") return Math.max(l.body.pain, u.disease * 4, u.injury * 3);
  if (good === "pottery") return l.body.cleanliness < 50 ? 100 - l.body.cleanliness : 0;
  if (good === "blankets") return l.clothing < 40 ? 100 - l.body.warmth : 0;
  if (["vegetables", "fruit", "bread", "dried_fish", "cheese", "stew"].includes(good)) return n.needs.hunger > 40 ? n.needs.hunger : 0;
  if (good === "herbs") return Math.max(l.body.pain, u.disease * 3, u.injury * 2);
  if (good === "clothes") return l.clothing < 30 ? Math.max(45, 100 - l.body.warmth) : 0;
  if (good === "meals") return n.needs.hunger > 30 || u.nutrition < 55 ? Math.max(n.needs.hunger, 100 - u.nutrition) : 0;
  if (good === "furniture") return l.furnishings < 30 ? l.desires.comfort : 0;
  return 0;
}
function livingCandidates(w, n, list) {
  const l = w.living.people[n.id], d = l.desires, b = l.body;
  for (const c2 of list) {
    let bonus = 0, why = "";
    if (c2.kind === "Sleep") {
      bonus = b.pain * 0.35 + (100 - b.stamina) * 0.2 + d.comfort * 0.08;
      why = `\uCCB4\uB825 ${Math.round(b.stamina)} \xB7 \uD1B5\uC99D ${Math.round(b.pain)}`;
    }
    if (c2.kind === "Work" || c2.kind === "Gather") {
      bonus = d.mastery * 0.06 + d.prosperity * 0.06 - b.pain * 0.3 - Math.max(0, 40 - b.stamina) * 0.6;
      why = `\uC131\uCDE8 \uC695\uB9DD ${Math.round(d.mastery)} \xB7 \uCCB4\uB825 ${Math.round(b.stamina)}`;
    }
    if (c2.kind === "Talk") {
      bonus = d.belonging * 0.13 + d.novelty * 0.05 - l.traits.independence * 0.05;
      why = `\uC18C\uC18D \uC695\uB9DD ${Math.round(d.belonging)}`;
    }
    if (c2.kind === "Theft") {
      bonus = -l.traits.patience * 0.12;
      why = `\uC778\uB0B4\uC2EC ${Math.round(l.traits.patience)}`;
    }
    if (c2.kind === "TakeItem" || c2.kind === "StoreItem") {
      bonus = d.security * 0.08;
      why = `\uC548\uC815 \uC695\uB9DD ${Math.round(d.security)}`;
    }
    c2.score = Math.round((c2.score + bonus) * 10) / 10;
    if (why) c2.reason += ` \xB7 ${why}`;
  }
  if (b.cleanliness < 65) {
    const well = localBuilding(w, n, "well");
    list.push({ kind: "Wash", score: Math.round((100 - b.cleanliness) * 1.15 - distance(n.position, well.position) * 0.6), reason: `\uCCAD\uACB0 ${Math.round(b.cleanliness)} \xB7 \uC6B0\uBB3C\uC5D0\uC11C \uC53B\uC5B4 \uC704\uC0DD\uACFC \uAE30\uBD84\uC744 \uD68C\uBCF5\uD55C\uB2E4.`, target: { ...well.position }, targetId: well.id });
  }
  const c = city(w, n.settlementId), shop = localBuilding(w, n, "market");
  for (const good of CONSUMABLES) {
    const need2 = consumptionNeed(w, n, good), price = GOOD_PRICES[good];
    const reserve = !["clothes", "furniture", "blankets", "pottery"].includes(good) ? 0 : Math.round(l.traits.frugality / 10) + market(w, n.settlementId).foodPrice * 2;
    if (need2 < 30 || !c.goods[good] || n.wealth < price + reserve) continue;
    list.push({ kind: "Trade", score: Math.round(need2 * 1.15 + 10 - l.traits.frugality * 0.12 - distance(n.position, shop.position) * 0.6), reason: `${GOOD_LABELS[good]} ${price}\uCF54\uC778 \xB7 \uD544\uC694 ${Math.round(need2)} \xB7 \uAC80\uC18C\uD568 ${Math.round(l.traits.frugality)} \xB7 \uC0DD\uD65C\uBE44 \uC720\uBCF4 ${reserve}`, target: { ...shop.position }, targetId: `goods:${good}` });
  }
}
function buyConsumerGood(w, n, good) {
  if (!CONSUMABLES.includes(good) || !n.alive || n.identity.age < 18 || isTravelling(w, n)) return false;
  const c = city(w, n.settlementId), price = GOOD_PRICES[good], l = w.living.people[n.id], u = w.urban.citizens[n.id];
  if (!c.goods[good] || n.wealth < price || !w.buildings.some((b) => b.kind === "market" && b.settlementId === n.settlementId && distance(b.position, n.position) === 0)) return false;
  c.goods[good]--;
  w.urban.ledger.consumed[good]++;
  n.wealth -= price;
  market(w, n.settlementId).coins += price;
  u.expenses += price;
  w.economy.totals.trades++;
  w.economy.totals.tradeVolume += price;
  if (good === "herbs") {
    l.body.pain = clamp(l.body.pain - 18);
    u.disease = clamp(u.disease - 2);
    u.injury = clamp(u.injury - 2);
  }
  if (good === "clothes") l.clothing = 100;
  if (good === "meals") {
    n.needs.hunger = clamp(n.needs.hunger - 45);
    u.nutrition = clamp(u.nutrition + 12);
  }
  if (good === "furniture") l.furnishings = 100;
  if (good === "blankets") {
    l.clothing = Math.max(l.clothing, 80);
    l.body.warmth = clamp(l.body.warmth + 25);
  }
  if (good === "pottery") l.body.cleanliness = clamp(l.body.cleanliness + 35);
  if (good === "medicine") {
    l.body.pain = clamp(l.body.pain - 30);
    u.disease = clamp(u.disease - 8);
    u.injury = clamp(u.injury - 5);
  }
  if (["vegetables", "fruit", "bread", "dried_fish", "cheese", "stew"].includes(good)) {
    n.needs.hunger = clamp(n.needs.hunger - (good === "vegetables" || good === "fruit" ? 25 : 45));
    u.nutrition = clamp(u.nutrition + 8);
  }
  l.desires.comfort = clamp(l.desires.comfort - 15);
  l.desires.novelty = clamp(l.desires.novelty - 8);
  appendEvent(w, { kind: "consumption", actorId: n.id, importance: 30, description: `${n.identity.name}\uC774 ${GOOD_LABELS[good]} 1\uAC1C\uB97C ${price}\uCF54\uC778\uC5D0 \uAD6C\uC785\uD574 \uC0DD\uD65C\uC5D0 \uC0AC\uC6A9\uD588\uB2E4.`, data: { settlementId: n.settlementId, good, amount: 1, price } });
  return true;
}
function migrateLiving(w) {
  for (const goods2 of [w.urban.ledger.opening, w.urban.ledger.produced, w.urban.ledger.consumed, ...w.urban.cities.map((c) => c.goods)]) for (const good of GOODS) goods2[good] ??= 0;
  initializeLiving(w);
}

// ../../../..v0.21-source/src/sim/pathfinding.ts
function walkable(w, p) {
  return Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x < w.width && p.y < w.height && !["water", "rock"].includes(w.tiles[p.y * w.width + p.x]);
}
function findPath(w, from, to) {
  if (!walkable(w, from) || !walkable(w, to)) return null;
  for (const axes of [["x", "y"], ["y", "x"]]) {
    const p = { ...from }, path = [];
    let blocked = false;
    for (const axis of axes) while (p[axis] !== to[axis]) {
      p[axis] += Math.sign(to[axis] - p[axis]);
      if (!walkable(w, p)) {
        blocked = true;
        break;
      }
      path.push({ ...p });
    }
    if (!blocked) return path;
  }
  const start = from.y * w.width + from.x, end = to.y * w.width + to.x;
  if (start === end) return [];
  const parents = new Int32Array(w.width * w.height).fill(-1), queue = [start];
  parents[start] = start;
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head], x = index % w.width, y = Math.floor(index / w.width);
    for (const p of [{ x, y: y - 1 }, { x: x + 1, y }, { x, y: y + 1 }, { x: x - 1, y }]) {
      const next = p.y * w.width + p.x;
      if (!walkable(w, p) || parents[next] !== -1) continue;
      parents[next] = index;
      if (next === end) {
        const path = [];
        for (let n = end; n !== start; n = parents[n]) path.push({ x: n % w.width, y: Math.floor(n / w.width) });
        return path.reverse();
      }
      queue.push(next);
    }
  }
  return null;
}

// ../../../..v0.21-source/src/sim/urban.ts
function newCitizen(n) {
  return { education: 0, nutrition: 65, stress: 10, housing: 70, trust: 50, disease: 0, injury: 0, preference: Math.round(n.personality.sociability), skills: { field: n.life.skill, quarry: 0, mine: 0, mill: 0, smith: 0 }, income: 0, expenses: 0 };
}
function initializeUrban(w) {
  w.urban ??= { since: w.tick, citizens: {}, cities: [], enterprises: [], freight: [], buildings: {}, ledger: { opening: emptyGoods(), produced: emptyGoods(), consumed: emptyGoods() }, samples: [] };
  for (const n of w.npcs) w.urban.citizens[n.id] ??= newCitizen(n);
  for (const b of w.buildings) w.urban.buildings[b.id] ??= { condition: 100, maintenance: b.kind === "home" ? 1 : 2 };
  for (const v of w.civilization.settlements) if (!w.urban.cities.some((c) => c.settlementId === v.id)) {
    const i = Number(v.id.slice(1)), ore = 600 + (w.seed + i * 197) % 5 * 300, stone = 1200 + (w.seed + i * 137) % 4 * 400;
    w.urban.cities.push({ settlementId: v.id, fertility: 45 + (w.seed + i * 29) % 56, deposits: { ore, stone, clay: 1200, salt: 800 }, initialDeposits: { ore, stone, clay: 1200, salt: 800 }, goods: emptyGoods(), treasury: 0, taxRate: 10, priority: "water", services: { road: 0, water: 0, sanitation: 0, clinic: 0, school: 0 }, active: { road: 0, water: 0, sanitation: 0, clinic: 0, school: 0 }, pollution: 0, collected: 0, spent: 0 });
  }
  if (w.version >= 7) initializeLiving(w);
}
function city(w, id7) {
  return w.urban.cities.find((c) => c.settlementId === id7);
}
function cityMetrics(w, id7) {
  const people = w.npcs.filter((n) => n.alive && n.settlementId === id7), adults = people.filter((n) => n.identity.age >= 18);
  const homes = w.buildings.filter((b) => b.kind === "home" && b.settlementId === id7);
  const beds = homes.reduce((s, b) => s + capacity(b), 0), c = city(w, id7);
  const employed = adults.filter((n) => w.urban.citizens[n.id]?.employer).length;
  const jobs = w.urban.enterprises.filter((e) => e.settlementId === id7).reduce((s, e) => s + e.capacity - e.workers.length, 0);
  const total = (key2) => people.reduce((s, n) => s + (w.urban.citizens[n.id]?.[key2] ?? 0), 0) / Math.max(1, people.length);
  const food = stocks(w, id7).food + market(w, id7).food + people.reduce((s, n) => s + n.inventory.food, 0);
  return { population: people.length, beds, vacant: Math.max(0, beds - people.length), employed, adults: adults.length, jobs, food, stress: total("stress"), trust: total("trust"), housing: total("housing"), sick: people.filter((n) => w.urban.citizens[n.id]?.disease > 0).length, stage: people.length >= 150 && w.urban.enterprises.filter((e) => e.settlementId === id7).length >= 4 && c.services.water > 0 ? "\uB3C4\uC2DC" : people.length >= 60 ? "\uC74D" : "\uB9C8\uC744" };
}
function setPolicy(w, id7, taxRate, priority, causeId) {
  if (!Number.isInteger(taxRate) || taxRate < 0 || taxRate > 30 || !SERVICES.includes(priority) || !w.civilization.settlements.some((v) => v.id === id7)) throw new Error("\uB3C4\uC2DC \uC815\uCC45 \uAC12\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
  initializeUrban(w);
  const c = city(w, id7), previous = c.taxRate;
  c.taxRate = taxRate;
  c.priority = priority;
  c.policyEventId = c.lastEventId = appendEvent(w, { kind: "policy", importance: 60, causeId, description: `${id7}\uC758 \uC138\uC728\uC744 ${taxRate}%\uB85C, \uACF5\uACF5\uD22C\uC790 \uC6B0\uC120\uC21C\uC704\uB97C ${SERVICE_LABELS[priority]}\uB85C \uBCC0\uACBD\uD588\uB2E4.`, data: { settlementId: id7, previous, taxRate, priority } }).id;
}
function site(w, id7) {
  const v = w.civilization.settlements.find((v2) => v2.id === id7);
  const taken = new Set([...w.buildings, ...w.resources].map((b) => `${b.position.x},${b.position.y}`));
  for (let y = -10; y < 10; y += 2) for (let x = -12; x < 11; x += 2) {
    const p = { x: v.center.x + x, y: v.center.y + y };
    if (p.x < 0 || p.y < 0 || p.x >= w.width || p.y >= w.height || taken.has(`${p.x},${p.y}`) || w.tiles[p.y * w.width + p.x] !== "grass" || !findPath(w, v.center, p)) continue;
    return p;
  }
}
function buildEnterprise(w, id7, kind) {
  initializeUrban(w);
  const c = city(w, id7), stock = stocks(w, id7);
  if (!c || !INDUSTRIES.includes(kind) || stock.wood < 8 || w.urban.enterprises.filter((e2) => e2.settlementId === id7).length >= 40) return;
  const position = site(w, id7);
  if (!position) return;
  stock.wood -= 8;
  w.economy.totals.investedWood += 8;
  const b = { id: `c${w.nextId++}`, kind: isGrowingIndustry(kind) ? "farm" : "market", name: INDUSTRY_LABELS[kind], position, level: 1, growth: isGrowingIndustry(kind) ? 20 : 0, settlementId: id7 };
  w.buildings.push(b);
  w.urban.buildings[b.id] = { condition: 100, maintenance: 2 };
  if (isGrowingIndustry(kind)) w.tiles[position.y * w.width + position.x] = "farm";
  const e = appendEvent(w, { kind: "construction", locationId: b.id, importance: 50, description: `${id7} \uACF5\uB3D9\uCCB4\uAC00 \uBAA9\uC7AC 8\uAC1C\uB85C ${INDUSTRY_LABELS[kind]}\uC744 \uAC74\uC124\uD588\uB2E4.`, data: { settlementId: id7, industry: kind, wood: 8 } });
  const enterprise = { id: `u${w.nextId++}`, settlementId: id7, buildingId: b.id, kind, capacity: 4, wage: 2, workers: [], output: 0, sourceEventId: e.id };
  w.urban.enterprises.push(enterprise);
  return enterprise;
}
function canProduce(w, n) {
  const e = w.urban.enterprises.find((e2) => e2.id === w.urban.citizens[n.id]?.employer);
  if (!e || e.settlementId !== n.settlementId || !e.workers.includes(n.id) || !canWork(w, n) || isTravelling(w, n)) return;
  const c = city(w, e.settlementId), b = w.buildings.find((b2) => b2.id === e.buildingId);
  if (market(w, e.settlementId).coins + c.treasury < e.wage || w.urban.buildings[b.id].condition < 20 || n.needs.health < 40) return;
  if (e.kind === "field" && b.growth < 2 || e.kind === "mine" && c.deposits.ore < 1 || e.kind === "quarry" && c.deposits.stone < 1 || e.kind === "mill" && c.goods.grain < 2 || e.kind === "smith" && (c.goods.ore < 2 || stocks(w, e.settlementId).wood < 1)) return;
  if (e.kind === "garden" && b.growth < 2 || e.kind === "weaving" && c.goods.fiber < 2 || e.kind === "tailoring" && c.goods.cloth < 2 || e.kind === "kitchen" && (c.goods.grain < 2 || c.goods.herbs < 1) || e.kind === "joinery" && (stocks(w, n.settlementId).wood < 3 || c.goods.tools < 1)) return;
  const recipe = EXTRA_RECIPES[e.kind];
  if (recipe && (recipe.growth && b.growth < recipe.growth || recipe.wood && stocks(w, n.settlementId).wood < recipe.wood || recipe.deposit && c.deposits[recipe.deposit] < (recipe.outputs[recipe.deposit] ?? 0) || Object.entries(recipe.inputs).some(([g, amount]) => c.goods[g] < amount))) return;
  return { e, c, b };
}
function industryWork(w, n) {
  const job = canProduce(w, n);
  if (!job || distance(n.position, job.b.position) !== 0) return false;
  const { e, c, b } = job, u = w.urban.citizens[n.id], m = market(w, n.settlementId);
  let amount = 1 + Math.floor((u.skills[INDUSTRY_SKILL[e.kind]] + u.education * 0.3) / 35), output = e.kind;
  const consume = (key2, amount2) => {
    c.goods[key2] -= amount2;
    w.urban.ledger.consumed[key2] += amount2;
  };
  if (e.kind === "field") {
    amount = Math.min(Math.floor(b.growth), Math.max(1, Math.round(amount * 2 * c.fertility / 45)));
    b.growth -= amount;
    harvest(w, e.settlementId, amount);
    c.goods.grain += amount;
    w.urban.ledger.produced.grain += amount;
    output = "grain";
  }
  if (e.kind === "mine" || e.kind === "quarry") {
    const key2 = e.kind === "mine" ? "ore" : "stone";
    amount = Math.min(amount, c.deposits[key2]);
    c.deposits[key2] -= amount;
    c.goods[key2] += amount;
    w.urban.ledger.produced[key2] += amount;
    c.pollution = clamp(c.pollution + 0.1);
    output = key2;
  }
  if (e.kind === "mill") {
    consume("grain", 2);
    amount = 3;
    m.food += amount;
    w.economy.totals.producedFood += amount;
    output = "food";
  }
  if (e.kind === "smith") {
    consume("ore", 2);
    stocks(w, n.settlementId).wood--;
    w.economy.totals.investedWood++;
    amount = 1;
    c.goods.tools++;
    w.urban.ledger.produced.tools++;
    output = "tools";
    c.pollution = clamp(c.pollution + 0.15);
  }
  if (e.kind === "garden") {
    amount = 2;
    b.growth -= 2;
    harvest(w, e.settlementId, 2);
    for (const g of ["herbs", "fiber"]) {
      c.goods[g]++;
      w.urban.ledger.produced[g]++;
    }
    output = "herbs";
  }
  const recipes = { weaving: { input: "fiber", output: "cloth" }, tailoring: { input: "cloth", output: "clothes" }, kitchen: { input: "grain", output: "meals" } };
  if (e.kind === "weaving" || e.kind === "tailoring" || e.kind === "kitchen") {
    const recipe2 = recipes[e.kind];
    consume(recipe2.input, 2);
    if (e.kind === "kitchen") consume("herbs", 1);
    amount = e.kind === "kitchen" ? 2 : 1;
    c.goods[recipe2.output] += amount;
    w.urban.ledger.produced[recipe2.output] += amount;
    output = recipe2.output;
  }
  if (e.kind === "joinery") {
    consume("tools", 1);
    stocks(w, n.settlementId).wood -= 3;
    w.economy.totals.investedWood += 3;
    amount = 1;
    c.goods.furniture++;
    w.urban.ledger.produced.furniture++;
    output = "furniture";
  }
  const recipe = EXTRA_RECIPES[e.kind];
  if (recipe) {
    for (const [good, quantity] of Object.entries(recipe.inputs)) consume(good, quantity);
    if (recipe.growth) {
      b.growth -= recipe.growth;
      harvest(w, e.settlementId, recipe.growth);
    }
    if (recipe.wood) {
      stocks(w, e.settlementId).wood -= recipe.wood;
      w.economy.totals.investedWood += recipe.wood;
    }
    if (recipe.deposit) c.deposits[recipe.deposit] -= recipe.outputs[recipe.deposit];
    amount = 0;
    for (const [good, quantity] of Object.entries(recipe.outputs)) {
      c.goods[good] += quantity;
      w.urban.ledger.produced[good] += quantity;
      amount += quantity;
    }
    output = Object.keys(recipe.outputs)[0];
  }
  const publicWage = Math.max(0, e.wage - m.coins), tax = Math.floor(e.wage * c.taxRate / 100);
  m.coins -= e.wage - publicWage;
  c.treasury -= publicWage;
  c.spent += publicWage;
  n.wealth += e.wage - tax;
  c.treasury += tax;
  c.collected += tax;
  u.income += e.wage - tax;
  w.economy.totals.wages += e.wage;
  w.living.people[n.id].desires.mastery = clamp(w.living.people[n.id].desires.mastery - 3);
  u.skills[INDUSTRY_SKILL[e.kind]] = clamp(u.skills[INDUSTRY_SKILL[e.kind]] + 0.3);
  e.output += amount;
  w.urban.buildings[b.id].condition = Math.max(0, w.urban.buildings[b.id].condition - 0.05);
  if ((e.kind === "mine" || e.kind === "quarry") && random(w) < 2e-3) {
    u.injury = clamp(u.injury + 12);
    u.healthEventId = appendEvent(w, { kind: "health", actorId: n.id, importance: 60, description: `${n.identity.name}\uC774 \uC791\uC5C5 \uC911 \uB2E4\uCCD0 \uD734\uC2DD\uACFC \uC9C4\uB8CC\uAC00 \uD544\uC694\uD558\uB2E4.`, data: { settlementId: n.settlementId, industry: e.kind } }).id;
  }
  appendEvent(w, { kind: "industry", actorId: n.id, locationId: b.id, causeId: e.sourceEventId, importance: 25, description: `${n.identity.name}\uC774 ${INDUSTRY_LABELS[e.kind]}\uC5D0\uC11C ${e.kind === "garden" ? "\uC57D\uCD08\xB7\uC12C\uC720 \uD569\uACC4" : recipe ? Object.keys(recipe.outputs).map((g) => GOOD_LABELS[g]).join("\xB7") + " \uD569\uACC4" : output === "food" ? "\uAC00\uACF5\uC2DD\uD488" : GOOD_LABELS[output]} ${amount}\uAC1C\uB97C \uC0DD\uC0B0\uD558\uACE0 \uC784\uAE08 ${e.wage - tax}\uCF54\uC778\uC744 \uBC1B\uC558\uB2E4.${publicWage ? ` \uACF5\uACF5\uC608\uC0B0\uC774 ${publicWage}\uCF54\uC778\uC744 \uBD80\uB2F4\uD588\uB2E4.` : ""}`, data: { settlementId: n.settlementId, industry: e.kind, output, amount, wage: e.wage, tax, publicWage } });
  return true;
}
function useTool(w, n) {
  const c = city(w, n.settlementId);
  if (!c?.goods.tools || c.goods.tools <= 1 && w.urban.enterprises.some((e) => e.settlementId === n.settlementId && e.kind === "joinery")) return 0;
  c.goods.tools--;
  w.urban.ledger.consumed.tools++;
  return 2;
}
function startFreight(w, from, to, good) {
  const relation = accord(w, from, to);
  if (relation?.status === "dispute") return false;
  const a = city(w, from), b = city(w, to);
  if (!a || !b || from === to || w.urban.freight.some((f) => f.from === from && f.to === to && f.good === good)) return false;
  const vs = w.civilization.settlements, path = findPath(w, vs.find((v) => v.id === from).center, vs.find((v) => v.id === to).center);
  if (!path) return false;
  const fee = Math.max(1, Math.ceil(path.length / (16 * (1 + a.active.road))) - (relation?.status === "cooperation" ? 1 : 0)), buyer = market(w, to);
  const price = GOOD_PRICES[good], amount = Math.min(8 + a.active.road * 4, Math.max(0, a.goods[good] - 4), Math.floor((buyer.coins - fee) / price));
  if (amount <= 0 || b.goods[good] >= 4) return false;
  const carrier = w.npcs.find((n) => canWork(w, n) && n.settlementId === from && !isTravelling(w, n));
  if (!carrier) return false;
  a.goods[good] -= amount;
  buyer.coins -= amount * price + fee;
  carrier.wealth += fee;
  w.urban.citizens[carrier.id].income += fee;
  const e = appendEvent(w, { kind: "freight", actorId: carrier.id, causeId: relation?.lastEventId, importance: 45, description: `${from} \u2192 ${to}: ${GOOD_LABELS[good]} ${amount}\uAC1C\uB97C \uC6B4\uC1A1\uD55C\uB2E4. \uC6B4\uC784 ${fee}\uCF54\uC778, \uAC70\uB9AC ${path.length}\uCE78.`, data: { from, to, good, amount, fee, phase: "departed" } });
  w.urban.freight.push({ id: `u${w.nextId++}`, from, to, good, amount, coins: amount * price, fee, path, progress: 0, sourceEventId: e.id });
  return true;
}
function advanceFreight(w) {
  for (const f of [...w.urban.freight]) {
    f.progress = Math.min(f.path.length, f.progress + 1 + city(w, f.from).active.road);
    if (f.progress < f.path.length) continue;
    city(w, f.to).goods[f.good] += f.amount;
    market(w, f.from).coins += f.coins;
    const delivered = appendEvent(w, { kind: "freight", causeId: f.sourceEventId, importance: 45, description: `${f.from} \u2192 ${f.to}: ${GOOD_LABELS[f.good]} ${f.amount}\uAC1C\uC640 \uB300\uAE08 ${f.coins}\uCF54\uC778\uC744 \uC778\uB3C4\uD588\uB2E4.`, data: { from: f.from, to: f.to, good: f.good, amount: f.amount, phase: "arrived" } });
    const relation = accord(w, f.from, f.to);
    if (relation) {
      relation.deliveries++;
      relation.deliveryEventId = delivered.id;
    }
    w.urban.freight = w.urban.freight.filter((x) => x.id !== f.id);
  }
}
function urbanBalance(w) {
  return Object.fromEntries(GOODS.map((g) => [g, w.urban.cities.reduce((s, c) => s + c.goods[g], 0) + w.urban.freight.filter((f) => f.good === g).reduce((s, f) => s + f.amount, 0) - w.urban.ledger.opening[g] - w.urban.ledger.produced[g] + w.urban.ledger.consumed[g]]));
}
function urbanDay(w) {
  initializeUrban(w);
  for (const n of w.npcs) syncEmployment(w, n);
  const byId = new Map(w.npcs.map((n) => [n.id, n]));
  for (const e of w.urban.enterprises) e.workers = e.workers.filter((id7) => {
    const n = byId.get(id7);
    return n && canWork(w, n) && n.settlementId === e.settlementId && !isTravelling(w, n);
  });
  for (const n of w.npcs) {
    const u = w.urban.citizens[n.id];
    u.income = 0;
    u.expenses = 0;
    if (!w.urban.enterprises.some((e) => e.workers.includes(n.id))) delete u.employer;
  }
  for (const c of w.urban.cities) {
    const id7 = c.settlementId, people = w.npcs.filter((n) => n.alive && n.settlementId === id7), adults = people.filter((n) => n.identity.age >= 18 && !isTravelling(w, n));
    const stock = stocks(w, id7), m = market(w, id7), buildings = w.buildings.filter((b) => b.settlementId === id7);
    let taxTotal = 0, rentTotal = 0;
    const occupancy = /* @__PURE__ */ new Map();
    for (const n of people) occupancy.set(n.homeId, (occupancy.get(n.homeId) ?? 0) + 1);
    for (const n of people) {
      const u = w.urban.citizens[n.id], home = buildings.find((b) => b.id === n.homeId);
      const owner = home.ownerIds?.map((id8) => byId.get(id8)).find((p) => p?.alive);
      if (owner && !home.ownerIds.includes(n.id) && n.identity.age >= 18 && n.wealth > 0) {
        const rent = Math.min(n.wealth, homeProfile(w, n).rent);
        n.wealth -= rent;
        owner.wealth += rent;
        u.expenses += rent;
        w.urban.citizens[owner.id].income += rent;
        rentTotal += rent;
      }
      const tax = n.identity.age >= 18 ? Math.min(n.wealth, Math.floor(Math.max(0, n.wealth - 10) * c.taxRate / 100)) : 0;
      n.wealth -= tax;
      u.expenses += tax;
      taxTotal += tax;
      const condition = w.urban.buildings[home.id].condition;
      const residence = homeProfile(w, n), lifestyle = w.living.people[n.id];
      u.housing = clamp(45 + residence.comfort * 0.4 + residence.privacy * lifestyle.traits.independence / 500 + lifestyle.furnishings * 0.15 - Math.max(0, (occupancy.get(home.id) ?? 0) - capacity(home)) * 15 - (100 - condition) * 0.5);
    }
    c.treasury += taxTotal;
    c.collected += taxTotal;
    if (taxTotal || rentTotal) c.lastEventId = appendEvent(w, { kind: "tax", importance: 40, causeId: c.policyEventId, description: `${id7}: \uC0DD\uD65C\uBE44 10\uCF54\uC778\uC744 \uC81C\uC678\uD55C \uC131\uC778 \uC7AC\uC0B0\uC5D0 ${c.taxRate}% \uC138\uC728\uC744 \uC801\uC6A9\uD574 ${taxTotal}\uCF54\uC778 \uC9D5\uC218. \uC784\uB300\uB8CC ${rentTotal}\uCF54\uC778\uC740 \uC18C\uC720\uC790\uC5D0\uAC8C \uC774\uC804\uD588\uB2E4.`, data: { settlementId: id7, tax: taxTotal, rent: rentTotal, treasury: c.treasury } }).id;
    const eligible2 = adults.filter((n) => canWork(w, n)), worker = eligible2[Math.floor(w.tick / 144) % Math.max(1, eligible2.length)], service = c.priority;
    if (worker && c.services[service] < 3 && c.treasury >= 12 && stock.wood >= 4 && c.goods.stone >= 2) {
      c.treasury -= 12;
      c.spent += 12;
      w.economy.totals.wages += 12;
      worker.wealth += 12;
      w.urban.citizens[worker.id].income += 12;
      stock.wood -= 4;
      w.economy.totals.investedWood += 4;
      c.goods.stone -= 2;
      w.urban.ledger.consumed.stone += 2;
      c.services[service]++;
      c.lastEventId = appendEvent(w, { kind: "public_service", actorId: worker.id, importance: 55, causeId: c.lastEventId, description: `${id7}\uC774 ${SERVICE_LABELS[service]} ${c.services[service]}\uB2E8\uACC4\uC5D0 \uC608\uC0B0 12\uCF54\uC778\xB7\uBAA9\uC7AC 4\uAC1C\xB7\uC11D\uC7AC 2\uAC1C\uB97C \uD22C\uC790\uD588\uB2E4.`, data: { settlementId: id7, service, level: c.services[service], coins: 12, wood: 4, stone: 2 } }).id;
      c.priority = SERVICES[(SERVICES.indexOf(service) + 1) % SERVICES.length];
    }
    for (const s of SERVICES) {
      c.active[s] = 0;
      const cost = c.services[s];
      if (!worker || !cost || c.treasury < cost) continue;
      c.treasury -= cost;
      c.spent += cost;
      w.economy.totals.wages += cost;
      worker.wealth += cost;
      w.urban.citizens[worker.id].income += cost;
      c.active[s] = cost;
    }
    for (const b of buildings) {
      const maintenance = w.urban.buildings[b.id];
      maintenance.condition = Math.max(0, maintenance.condition - 0.3);
      if (worker && maintenance.condition < 80 && c.treasury >= maintenance.maintenance && stock.wood > 0) {
        c.treasury -= maintenance.maintenance;
        c.spent += maintenance.maintenance;
        w.economy.totals.wages += maintenance.maintenance;
        worker.wealth += maintenance.maintenance;
        w.urban.citizens[worker.id].income += maintenance.maintenance;
        stock.wood--;
        w.economy.totals.investedWood++;
        maintenance.condition = Math.min(100, maintenance.condition + 15);
      }
    }
    const existing = w.urban.enterprises.filter((e) => e.settlementId === id7);
    if (people.length >= 12 && stock.wood >= 8) {
      const order = c.fertility >= 70 ? ["field", "mill", "quarry", "mine", "smith"] : ["quarry", "mine", "smith", "field", "mill"];
      order.push("garden", "weaving", "tailoring", "kitchen", "joinery", ...Object.keys(EXTRA_RECIPES));
      const missing = order.find((k) => !existing.some((e) => e.kind === k));
      if (missing) buildEnterprise(w, id7, missing);
      else if (existing.length < Math.min(40, Math.floor(people.length / 10)) && m.food < people.length * 2) buildEnterprise(w, id7, existing.filter((e) => e.kind === "field").length <= existing.filter((e) => e.kind === "mill").length ? "field" : "mill");
    }
    const localJobs = w.urban.enterprises.filter((e) => e.settlementId === id7);
    if (localJobs.length > adults.filter((n) => canWork(w, n)).length && localJobs.length && Math.floor(w.tick / 144) % 3 === 0) {
      for (const e of localJobs) {
        for (const id8 of e.workers) delete w.urban.citizens[id8].employer;
        e.workers = [];
      }
      localJobs.push(...localJobs.splice(0, Math.floor(w.tick / 432) * Math.max(1, adults.filter((n) => canWork(w, n)).length - 1) % localJobs.length));
      const field = localJobs.findIndex((e) => e.kind === "field");
      if (field >= 0) localJobs.unshift(...localJobs.splice(field, 1));
    }
    const staffing = Math.max(1, Math.floor(adults.filter((n) => canWork(w, n)).length / Math.max(1, localJobs.length)));
    for (const e of localJobs) for (const released of e.workers.splice(Math.min(e.capacity, staffing))) delete w.urban.citizens[released].employer;
    for (const e of localJobs) {
      for (const n of adults.filter((n2) => canWork(w, n2) && !w.urban.citizens[n2.id].employer).sort((a, b) => w.urban.citizens[b.id].skills[INDUSTRY_SKILL[e.kind]] + (b.occupation === INDUSTRY_JOB[e.kind] ? 40 : 0) - (w.urban.citizens[a.id].skills[INDUSTRY_SKILL[e.kind]] + (a.occupation === INDUSTRY_JOB[e.kind] ? 40 : 0)))) {
        if (e.workers.length >= Math.min(e.capacity, staffing)) break;
        e.workers.push(n.id);
        w.urban.citizens[n.id].employer = e.id;
        n.occupation = INDUSTRY_JOB[e.kind];
        appendEvent(w, { kind: "occupation", actorId: n.id, locationId: e.buildingId, importance: 40, causeId: e.sourceEventId, description: `${n.identity.name}\uC774 ${INDUSTRY_LABELS[e.kind]}\uC5D0 \uACE0\uC6A9\uB418\uC5C8\uB2E4. \uC791\uC5C5 \uC644\uB8CC\uB2F9 \uC784\uAE08 ${e.wage}\uCF54\uC778.`, data: { settlementId: id7, employer: e.id, industry: e.kind, wage: e.wage } });
      }
    }
    c.pollution = clamp(c.pollution + people.length / 200 - c.active.sanitation * 2 - 0.2);
    let students = c.active.school * 20, patients = c.active.clinic * 20;
    for (const n of people) {
      const u = w.urban.citizens[n.id], sick = u.disease > 0;
      u.nutrition = clamp(u.nutrition + (n.needs.hunger < 55 ? 2 : -4));
      if (students > 0 && n.identity.age < 18) {
        u.education = clamp(u.education + 1);
        students--;
      }
      if (patients > 0 && (u.disease > 0 || u.injury > 0)) {
        u.disease = Math.max(0, u.disease - 3);
        u.injury = Math.max(0, u.injury - 4);
        patients--;
      } else {
        u.disease = Math.max(0, u.disease - 0.5);
        u.injury = Math.max(0, u.injury - 1);
      }
      if (!sick && random(w) < Math.max(0, c.pollution + Math.max(0, people.length - 60) * 0.1 - c.active.water * 15 - c.active.sanitation * 15) / 1e3) {
        u.disease = 8;
        u.healthEventId = appendEvent(w, { kind: "health", actorId: n.id, importance: 60, description: `${n.identity.name}\uC774 \uC9C0\uC5ED\uC758 \uBC00\uC9D1\xB7\uC704\uC0DD \uC5EC\uAC74\uC73C\uB85C \uBCD1\uC5D0 \uAC78\uB838\uB2E4.`, data: { settlementId: id7, pollution: c.pollution, water: c.active.water, sanitation: c.active.sanitation } }).id;
      }
      u.stress = clamp(u.stress + (u.housing < 50 ? 3 : -1) + (u.nutrition < 40 ? 3 : 0) + (u.disease > 0 ? 2 : 0) + (n.identity.age >= 18 && !u.employer && n.wealth < 5 ? 2 : 0));
      u.trust = clamp(u.trust + (c.active.water + c.active.clinic + c.active.school) * 0.2 - c.taxRate * 0.03 - (u.stress > 60 ? 1 : 0));
      n.needs.health = Math.max(0.1, n.needs.health - u.disease * 0.15 - u.injury * 0.1);
      n.needs.fatigue = clamp(n.needs.fatigue + u.injury * 0.2 + u.stress * 0.02);
    }
    for (const other of w.urban.cities) if (other !== c) for (const good of GOODS) startFreight(w, id7, other.settlementId, good);
    const metrics = cityMetrics(w, id7);
    const migrant = adults.find((n) => w.tick - n.life.lastMove > 1728 && (w.urban.citizens[n.id].stress > 60 || w.urban.citizens[n.id].housing < 50));
    if (migrant) {
      const destinations = w.civilization.settlements.filter((v) => v.id !== id7).map((v) => ({ v, m: cityMetrics(w, v.id) })).filter((x) => x.m.vacant > 2 && x.m.food > x.m.population && x.m.stress < metrics.stress).sort((a, b) => b.m.jobs + b.m.housing / 10 - b.m.population * (100 - w.urban.citizens[migrant.id].preference) / 1e3 - (a.m.jobs + a.m.housing / 10 - a.m.population * (100 - w.urban.citizens[migrant.id].preference) / 1e3));
      if (destinations[0]) startMigration(w, migrant, destinations[0].v, c.lastEventId);
    }
    const evidence2 = w.events.slice(-2e3).filter((e) => e.data.settlementId === id7 && e.kind === "industry").slice(-4).map((e) => e.id);
    const causeId = c.lastEventId && eventById(w, c.lastEventId)?.kind !== "urban" ? c.lastEventId : c.policyEventId;
    const event2 = appendEvent(w, { kind: "urban", importance: 35, causeId, description: `${id7} ${metrics.stage}: \uC8FC\uBBFC ${metrics.population}\uBA85, \uC0AC\uC5C5\uCCB4 \uACE0\uC6A9 ${metrics.employed}\uBA85, \uBE48 \uC8FC\uAC70 ${metrics.vacant}\uC778, \uC608\uC0B0 ${c.treasury}\uCF54\uC778.`, data: { settlementId: id7, evidence: evidence2, ...metrics, treasury: c.treasury, pollution: c.pollution } });
    c.lastEventId = event2.id;
    w.urban.samples.push({ tick: w.tick, settlementId: id7, population: metrics.population, employed: metrics.employed, housing: metrics.beds, food: metrics.food, treasury: c.treasury, stress: metrics.stress, sick: metrics.sick, eventId: event2.id });
  }
  w.urban.samples = w.urban.samples.slice(-1080);
}

// ../../../..v0.21-source/src/sim/heritage.ts
var SEASONS = ["\uBD04", "\uC5EC\uB984", "\uAC00\uC744", "\uACA8\uC6B8"];
function seasonIndex(w) {
  return Math.floor(w.tick / TICKS_PER_DAY / (DAYS_PER_YEAR / 4)) % 4;
}
function initializeHeritage(w, fresh = false) {
  w.heritage ??= { since: w.tick, habitats: [], councils: [], accords: [] };
  for (const v of w.civilization.settlements) {
    if (!w.heritage.habitats.some((h) => h.settlementId === v.id)) w.heritage.habitats.push({ settlementId: v.id, soil: 80, pasture: 70, livestock: fresh ? 2 : 0, opening: fresh ? 2 : 0, born: 0, lost: 0, harvest: 0 });
    if (!w.heritage.councils.some((c) => c.settlementId === v.id)) w.heritage.councils.push({ settlementId: v.id, autonomous: true, groups: [] });
  }
  const vs = w.civilization.settlements;
  for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) if (!accord(w, vs[i].id, vs[j].id)) w.heritage.accords.push({ from: vs[i].id, to: vs[j].id, trust: 40, tension: 0, status: "neutral", deliveries: 0, reviewed: 0 });
}
function accord(w, a, b) {
  return w.heritage?.accords.find((r) => r.from === a && r.to === b || r.from === b && r.to === a);
}
function harvest(w, id7, amount) {
  const h = w.heritage?.habitats.find((h2) => h2.settlementId === id7);
  if (h) h.harvest += amount;
}
function cropMultiplier(w, id7) {
  const h = w.heritage.habitats.find((h2) => h2.settlementId === id7);
  return [0.95, 1.15, 1.25, 0.65][seasonIndex(w)] * (0.55 + (h?.soil ?? 80) / 160);
}
function setCouncil(w, id7, enabled) {
  const c = w.heritage.councils.find((c2) => c2.settlementId === id7);
  if (!c) throw new Error("\uB3C4\uC2DC \uC758\uD68C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
  c.autonomous = enabled;
  c.lastEventId = appendEvent(w, { kind: "council", importance: 55, description: `${id7}: \uC8FC\uBBFC \uACF5\uB3D9\uACB0\uC815 ${enabled ? "\uC2DC\uC791" : "\uC911\uB2E8"}.`, data: { settlementId: id7, enabled } }).id;
}
function ecologyDay(w) {
  initializeHeritage(w);
  const season = seasonIndex(w);
  for (const h of w.heritage.habitats) {
    const c = city(w, h.settlementId), people = w.npcs.filter((n) => n.alive && n.settlementId === h.settlementId), farmers = people.filter((n) => canWork(w, n));
    const fields = w.buildings.filter((b) => b.kind === "farm" && b.settlementId === h.settlementId).length;
    const beforeSoil = h.soil;
    h.soil = clamp(h.soil + (w.weather === "rain" ? 1.2 : 0.45) - h.harvest / Math.max(1, fields) * 0.018 - c.pollution * 2e-3);
    h.pasture = clamp(h.pasture + (w.weather === "drought" ? 0 : season === 3 ? 1 : 5) - h.livestock * 0.7);
    let born = 0, lost = 0, feed = 0, food = 0;
    if (farmers.length && h.livestock === 0 && c.goods.grain >= 12 && h.pasture > 50) {
      feed = 12;
      c.goods.grain -= feed;
      w.urban.ledger.consumed.grain += feed;
      born = 2;
    } else if (h.livestock > 0) {
      feed = Math.min(c.goods.grain, Math.ceil(h.livestock / 2));
      c.goods.grain -= feed;
      w.urban.ledger.consumed.grain += feed;
      if (!farmers.length || h.pasture < 10 && feed < Math.ceil(h.livestock / 2)) lost = 1;
      else {
        food = Math.min(farmers.length * 2, h.livestock);
        stocks(w, h.settlementId).food += food;
        w.economy.totals.producedFood += food;
        if (season === 0 && w.tick % (3 * TICKS_PER_DAY) === 0 && h.livestock >= 2 && h.livestock < 20 && h.pasture > 40 && feed > 0) born = 1;
      }
    }
    h.livestock += born - lost;
    h.born += born;
    h.lost += lost;
    h.lastEventId = appendEvent(w, { kind: "ecology", importance: 45, description: `${h.settlementId} ${SEASONS[season]}: \uD1A0\uC591 ${beforeSoil.toFixed(1)}\u2192${h.soil.toFixed(1)}, \uBAA9\uCD08 ${h.pasture.toFixed(1)}, \uAC00\uCD95 ${h.livestock}\uB9C8\uB9AC. \uC0AC\uB8CC \uACE1\uBB3C ${feed}\uAC1C, \uCD95\uC0B0 \uC2DD\uB7C9 ${food}\uAC1C.`, data: { settlementId: h.settlementId, season: SEASONS[season], soilBefore: beforeSoil, soil: h.soil, harvest: h.harvest, pasture: h.pasture, livestock: h.livestock, born, lost, feed, food } }).id;
    h.harvest = 0;
  }
  for (const r of w.resources) {
    const v = [...w.civilization.settlements].sort((a, b) => distance(a.center, r.position) - distance(b.center, r.position))[0];
    const h = w.heritage.habitats.find((h2) => h2.settlementId === v.id);
    const growth = r.kind === "wood" ? w.weather === "drought" || h.soil < 25 ? 1 : season === 3 ? 2 : 3 : w.weather === "drought" ? 0 : season === 3 ? 0 : w.weather === "rain" ? 2 : 1;
    r.amount = Math.min(r.capacity, r.amount + growth);
  }
}
function preference(w, n, parents) {
  const u = w.urban.citizens[n.id];
  if (u.disease > 0 || u.injury > 0) return "clinic";
  if (city(w, n.settlementId).pollution > 30) return "sanitation";
  if (n.needs.thirst > 60) return "water";
  if (n.life.parentIds.length || parents.has(n.id)) return "school";
  return n.occupation === "merchant" || n.occupation === "woodcutter" ? "road" : "water";
}
function societyDay(w) {
  initializeHeritage(w);
  const parents = new Set(w.npcs.filter((n) => n.alive && n.identity.age < 18).flatMap((n) => n.life.parentIds));
  const choices = new Map(w.npcs.filter((n) => n.alive && n.identity.age >= 18).map((n) => [n.id, preference(w, n, parents)]));
  for (const council of w.heritage.councils) {
    const adults = w.npcs.filter((n) => n.alive && n.identity.age >= 18 && n.settlementId === council.settlementId);
    council.groups = ["livelihood", "care", "exchange"].map((kind) => {
      const members = adults.filter((n) => (n.occupation === "merchant" ? "exchange" : n.life.partnerId ? "care" : "livelihood") === kind);
      const votes = SERVICES.map((priority) => ({ priority, count: members.filter((n) => choices.get(n.id) === priority).length }));
      return { kind, members: members.map((n) => n.id), priority: votes.sort((a, b) => b.count - a.count)[0].priority };
    });
    if (w.tick % (3 * TICKS_PER_DAY) || !adults.length || !council.autonomous) continue;
    const tally = SERVICES.map((priority) => ({ priority, count: adults.filter((n) => choices.get(n.id) === priority).length })).sort((a, b) => b.count - a.count);
    const chosen = tally[0];
    const e = appendEvent(w, { kind: "council", importance: 55, description: `${council.settlementId} \uC8FC\uBBFC ${adults.length}\uBA85\uC758 \uC0DD\uD65C \uC5EC\uAC74\uC744 \uBC18\uC601\uD55C \uACF5\uB3D9\uACB0\uC815: ${SERVICE_LABELS[chosen.priority]} ${chosen.count}\uD45C.`, data: { settlementId: council.settlementId, voters: adults.length, priority: chosen.priority, votes: chosen.count, tally: tally.map((v) => `${v.priority}:${v.count}`) } });
    council.lastEventId = e.id;
    setPolicy(w, council.settlementId, city(w, council.settlementId).taxRate, chosen.priority, e.id);
  }
  if (w.tick % (3 * TICKS_PER_DAY)) return;
  for (const r of w.heritage.accords) {
    const a = cityMetrics(w, r.from), b = cityMetrics(w, r.to), deliveries = r.deliveries - r.reviewed;
    const shortage = a.food < a.population || b.food < b.population;
    const previous = r.status;
    r.tension = clamp(r.tension + (shortage ? 15 : -10) - Math.min(10, deliveries * 2));
    r.trust = clamp(r.trust + Math.min(12, deliveries * 4) + (shortage ? -3 : 2));
    r.reviewed = r.deliveries;
    r.status = r.tension >= 60 ? "dispute" : r.trust >= 50 && r.tension < 30 ? "cooperation" : "neutral";
    if (r.status !== previous || deliveries) r.lastEventId = appendEvent(w, { kind: "diplomacy", causeId: deliveries ? r.deliveryEventId : void 0, importance: 60, description: `${r.from}\xB7${r.to}: ${r.status === "cooperation" ? "\uAD50\uC5ED \uD611\uC57D" : r.status === "dispute" ? "\uC790\uC6D0 \uBD84\uC7C1\uC73C\uB85C \uC2E0\uADDC \uC0B0\uC5C5 \uAD50\uC5ED \uC911\uB2E8" : "\uD1B5\uC0C1 \uAD00\uACC4"}. \uC2DD\uB7C9 \uBD80\uC871 ${shortage ? "\uC788\uC74C" : "\uC5C6\uC74C"}, \uCD5C\uADFC \uC778\uB3C4 ${deliveries}\uAC74, \uC2E0\uB8B0 ${r.trust}, \uAE34\uC7A5 ${r.tension}.`, data: { from: r.from, to: r.to, previous, status: r.status, shortage, deliveries, trust: r.trust, tension: r.tension, evidence: [w.heritage.habitats.find((h) => h.settlementId === r.from)?.lastEventId, w.heritage.habitats.find((h) => h.settlementId === r.to)?.lastEventId].filter((s) => !!s) } }).id;
  }
}

// ../../../..v0.21-source/src/sim/civilization.ts
function villageSize(w) {
  return w.civilization.settlements[0]?.center.x === 24 || !w.civilization.settlements.length && w.width === 48 ? { width: 48, height: 36 } : { width: 32, height: 24 };
}
function stocks(w, id7) {
  return id7 === "v0" ? w.storage : w.civilization.settlements.find((v) => v.id === id7).storage;
}
function market(w, id7) {
  return id7 === "v0" ? w.market : w.civilization.settlements.find((v) => v.id === id7).market;
}
function localBuilding(w, n, kind) {
  return w.buildings.filter((b) => b.kind === kind && b.settlementId === n.settlementId).sort((a, b) => distance(a.position, n.position) - distance(b.position, n.position))[0] ?? w.buildings.find((b) => b.kind === kind);
}
function capacity(b) {
  return 2 + b.level * 2;
}
function residents(w, id7) {
  return w.npcs.filter((n) => n.alive && n.settlementId === id7);
}
function initializeCivilization(w) {
  w.civilization ??= { settlements: [], journeys: [], focus: "v0", detail: "full" };
  if (!w.civilization.settlements.length) w.civilization.settlements.push({ id: "v0", name: "\uB290\uD2F0\uB9C8\uC744", center: { x: villageSize(w).width / 2, y: villageSize(w).height / 2 }, foundedAt: w.tick, storage: { food: 0, wood: 0 }, market: { food: 0, wood: 0, coins: 0, foodPrice: 3, woodPrice: 2 } });
  for (const b of w.buildings) {
    b.settlementId ??= "v0";
    if (b.kind === "home") b.ownerIds ??= w.npcs.filter((n) => n.homeId === b.id && n.alive).map((n) => n.id);
  }
  for (const n of w.npcs) {
    if (!n.life) n.life = { bornTick: w.tick - n.identity.age * YEAR_TICKS, parentIds: [], generation: 0, skill: 10, lastBirth: w.tick, lastMove: w.tick, estateSettled: !n.alive };
    if (n.life.bornTick === 0 && n.identity.age > 0 && !n.life.parentIds.length) n.life.bornTick = w.tick - n.identity.age * YEAR_TICKS;
    n.settlementId ??= "v0";
  }
}
function expandMap(w) {
  const size = villageSize(w);
  if (w.width >= size.width * 4 && w.height >= size.height * 3) return;
  const old = w.tiles, width = w.width, height = w.height;
  w.width = size.width * 4;
  w.height = size.height * 3;
  w.tiles = Array.from({ length: w.width * w.height }, (_, i) => {
    const x = i % w.width, y = Math.floor(i / w.width);
    return x < width && y < height ? old[y * width + x] : y % size.height === size.height / 2 || x % size.width === size.width / 2 ? "path" : "grass";
  });
}
function addVillage(w) {
  expandMap(w);
  const size = villageSize(w);
  const i = w.civilization.settlements.length, x = i % 4 * size.width + size.width / 2, y = Math.floor(i / 4) * size.height + size.height / 2;
  const v = { id: `v${i}`, name: ["\uB290\uD2F0\uB9C8\uC744", "\uAC15\uB108\uBA38\uB9C8\uC744", "\uB4E4\uB158\uB9C8\uC744", "\uC194\uBC14\uB78C\uB9C8\uC744"][i % 4] + (i >= 4 ? String(Math.floor(i / 4) + 1) : ""), center: { x, y }, foundedAt: w.tick, storage: { food: 0, wood: 0 }, market: { food: 0, wood: 0, coins: 0, foodPrice: 3, woodPrice: 2 } };
  w.civilization.settlements.push(v);
  const specs = [["storage", 0, -2], ["market", 1, 2], ["well", -4, -1], ["farm", 5, -5], ["home", -7, -6], ["home", -3, -7], ["home", 2, -8], ["home", -9, 4], ["home", -5, 6], ["home", 4, 6]];
  for (const [kind, dx, dy] of specs) {
    const position = { x: x + dx, y: y + dy };
    w.buildings.push({ id: `c${w.nextId++}`, kind, name: `${v.name} ${kind === "home" ? "\uC9D1" : kind === "farm" ? "\uB18D\uC7A5" : kind === "well" ? "\uC6B0\uBB3C" : kind === "market" ? "\uC2DC\uC7A5" : "\uCC3D\uACE0"}`, position, level: 1, growth: kind === "farm" ? 30 : 0, settlementId: v.id, ...kind === "home" ? { ownerIds: [] } : {} });
    w.tiles[position.y * w.width + position.x] = kind === "farm" ? "farm" : "grass";
  }
  for (let j = 0; j < 14; j++) {
    const position = { x: x - 12 + j % 7 * 2, y: y + 8 + Math.floor(j / 7) * 2 };
    w.resources.push({ id: `r-new-${w.nextId++}`, position, kind: j % 2 ? "wood" : "food", amount: 8, capacity: 24 });
  }
  initializeUrban(w);
  if (w.heritage) initializeHeritage(w);
  return v;
}
function populateSettlements(w) {
  const count = Math.min(12, Math.ceil(w.npcs.length / (w.npcs.length > 400 ? 250 : 36)));
  while (w.civilization.settlements.length < count) addVillage(w);
  if (count === 1) return;
  if (w.npcs.length > 36) {
    for (const v of w.civilization.settlements) {
      const target = Math.ceil(w.npcs.length / count);
      const occupied = new Set([...w.buildings, ...w.resources].map((b) => `${b.position.x},${b.position.y}`));
      for (const b of w.buildings.filter((b2) => b2.kind === "home" && b2.settlementId === v.id)) b.level = 4;
      let beds = 60, farms = 1;
      for (let dy = -10; dy < 11; dy += 2) for (let dx = -12; dx < 11; dx += 2) {
        if (beds >= target + 20 && farms >= Math.ceil(target / 8)) break;
        const position = { x: v.center.x + dx, y: v.center.y + dy };
        if (occupied.has(`${position.x},${position.y}`) || w.tiles[position.y * w.width + position.x] !== "grass" || !findPath(w, v.center, position)) continue;
        const kind = beds < target + 20 ? "home" : "farm";
        w.buildings.push({ id: `c${w.nextId++}`, kind, name: `${v.name} ${kind === "home" ? "\uACF5\uB3D9\uC8FC\uD0DD" : "\uB18D\uC7A5"}`, position, level: 4, growth: kind === "farm" ? 100 : 0, settlementId: v.id, ...kind === "home" ? { ownerIds: [] } : {} });
        if (kind === "home") beds += 10;
        else {
          farms++;
          w.tiles[position.y * w.width + position.x] = "farm";
        }
        occupied.add(`${position.x},${position.y}`);
      }
      const stock = stocks(w, v.id), m = market(w, v.id);
      stock.food = target * 4;
      stock.wood = target;
      m.food = target * 2;
      m.coins = target * 20;
    }
  }
  for (const b of w.buildings) if (b.kind === "home") b.ownerIds = [];
  w.npcs.forEach((n, i) => {
    const v = w.civilization.settlements[i % count], homes = w.buildings.filter((b) => b.kind === "home" && b.settlementId === v.id), home = homes[Math.floor(i / count) % homes.length];
    n.settlementId = v.id;
    n.homeId = home.id;
    n.position = { ...home.position };
    home.ownerIds.push(n.id);
  });
  for (const v of w.civilization.settlements.slice(1).filter(() => w.npcs.length <= 36)) {
    v.storage.food = 28;
    v.storage.wood = 12;
    v.market.food = 20;
    v.market.coins = 180;
  }
}
function isTravelling(w, n) {
  return w.civilization.journeys.some((j) => j.kind === "migration" && j.npcIds.includes(n.id));
}
function startMigration(w, n, to, causeId) {
  if (!n.alive || n.identity.age < 18 || n.settlementId === to.id || isTravelling(w, n)) return false;
  const group = w.npcs.filter((p) => p.alive && p.settlementId === n.settlementId && (p.id === n.id || p.id === n.life.partnerId || p.identity.age < 18 && p.life.parentIds.includes(n.id)));
  if (group.some((p) => isTravelling(w, p))) return false;
  const home = w.buildings.find((b) => b.kind === "home" && b.settlementId === to.id && w.npcs.filter((p) => p.alive && p.homeId === b.id).length + w.civilization.journeys.filter((j) => j.homeId === b.id).reduce((s, j) => s + j.npcIds.length, 0) + group.length <= capacity(b));
  const path = home && findPath(w, n.position, home.position);
  if (!home || !path || group.some((p) => distance(p.position, n.position) > 8 || !findPath(w, p.position, home.position))) return false;
  const e = appendEvent(w, { kind: "migration", actorId: n.id, participants: group.map((p) => p.id), importance: 60, causeId, locationId: home.id, description: `${n.identity.name}\uC758 \uAC00\uC871 ${group.length}\uBA85\uC774 \uC8FC\uAC70\uC640 \uC2DD\uB7C9 \uC5EC\uAC74\uC744 \uB530\uB77C ${to.name}\uC73C\uB85C \uC774\uC8FC\uB97C \uC2DC\uC791\uD588\uB2E4.`, data: { from: n.settlementId, to: to.id, distance: path.length, phase: "departed" } });
  for (const p of group) {
    const ownPath = findPath(w, p.position, home.position);
    w.civilization.journeys.push({ id: `j${w.nextId++}`, kind: "migration", from: p.settlementId, to: to.id, npcIds: [p.id], path: ownPath, progress: 0, food: 0, coins: 0, homeId: home.id, sourceEventId: e.id });
    for (const e2 of w.urban.enterprises) e2.workers = e2.workers.filter((id7) => id7 !== p.id);
    delete w.urban.citizens[p.id].employer;
    p.currentAction = void 0;
    p.life.lastMove = w.tick;
  }
  return true;
}
function advanceJourneys(w) {
  for (const j of [...w.civilization.journeys]) {
    const moving = j.npcIds.map((id7) => w.npcs.find((n) => n.id === id7)).filter((n) => n.alive);
    if (j.progress < j.path.length) {
      const p = j.path[j.progress++];
      moving.forEach((n) => {
        n.position = { ...p };
      });
    }
    if (j.progress < j.path.length && (j.kind === "trade" || moving.length)) continue;
    if (j.kind === "trade") {
      market(w, j.to).food += j.food;
      market(w, j.from).coins += j.coins;
      w.economy.totals.trades++;
      w.economy.totals.tradeVolume += j.food;
      appendEvent(w, { kind: "caravan", importance: 45, causeId: j.sourceEventId, description: `${j.from} \u2192 ${j.to} \uAD50\uC5ED\uC774 \uB3C4\uCC29\uD588\uB2E4. \uC2DD\uB7C9 ${j.food}\uAC1C\uC640 \uB300\uAE08 ${j.coins}\uCF54\uC778\uC744 \uC778\uB3C4\uD588\uB2E4.`, data: { from: j.from, to: j.to, food: j.food, coins: j.coins, phase: "arrived" } });
    } else for (const n of moving) {
      n.settlementId = j.to;
      n.homeId = j.homeId;
      n.currentAction = void 0;
      const home = w.buildings.find((b) => b.id === n.homeId);
      home.ownerIds ??= [];
      if (!home.ownerIds.length) home.ownerIds.push(n.id);
      appendEvent(w, { kind: "migration", actorId: n.id, locationId: home.id, importance: 55, causeId: j.sourceEventId, description: `${n.identity.name}\uC774 \uC0C8 \uB9C8\uC744\uC758 \uC9D1\uC5D0 \uB3C4\uCC29\uD588\uB2E4. \uC18C\uC9C0\uD488\uACFC \uC7AC\uC0B0\uC744 \uADF8\uB300\uB85C \uC62E\uACBC\uB2E4.`, data: { from: j.from, to: j.to, phase: "arrived" } });
    }
    w.civilization.journeys = w.civilization.journeys.filter((p) => p.id !== j.id);
  }
}
function startTrade(w, from, to) {
  if (from.id === to.id || w.civilization.journeys.some((j) => j.kind === "trade" && j.from === from.id && j.to === to.id)) return false;
  const seller = market(w, from.id), buyer = market(w, to.id), reserve = residents(w, from.id).length * 2;
  const amount = Math.min(12, Math.max(0, seller.food - reserve), Math.floor(buyer.coins / seller.foodPrice));
  if (!amount || buyer.food >= Math.max(6, residents(w, to.id).length) || seller.foodPrice > buyer.foodPrice) return false;
  const path = findPath(w, from.center, to.center);
  if (!path) return false;
  const cost = amount * seller.foodPrice;
  seller.food -= amount;
  buyer.coins -= cost;
  const e = appendEvent(w, { kind: "caravan", importance: 45, description: `${from.name}\uC758 \uC5EC\uBD84 \uC2DD\uB7C9 ${amount}\uAC1C\uB97C ${to.name}\uC5D0 ${cost}\uCF54\uC778\uC73C\uB85C \uAD50\uC5ED\uD55C\uB2E4. \uB3C4\uCC29 \uC804\uAE4C\uC9C0 \uD654\uBB3C\uACFC \uB300\uAE08\uC740 \uC6B4\uC1A1 \uC911\uC774\uB2E4.`, data: { from: from.id, to: to.id, food: amount, coins: cost, phase: "departed", distance: path.length } });
  w.civilization.journeys.push({ id: `j${w.nextId++}`, kind: "trade", from: from.id, to: to.id, npcIds: [], path, progress: 0, food: amount, coins: cost, sourceEventId: e.id });
  return true;
}
function buildHouse(w, v, kind = "home", observer = false) {
  const cost = kind === "home" ? 12 : 16;
  const stock = stocks(w, v.id);
  if (stock.wood < cost) return;
  const occupied = new Set([...w.buildings, ...w.resources].map((b) => `${b.position.x},${b.position.y}`));
  const sites = [];
  for (let dy = -9; dy <= 8; dy += 3) for (let dx = -10; dx <= 10; dx += 3) sites.push({ x: v.center.x + dx, y: v.center.y + dy });
  if (villageSize(w).width === 48) {
    for (let dy = -15; dy <= 15; dy += 3) for (let dx = -22; dx <= 20; dx += 3) {
      if (dy < -9 || dy > 8 || dx < -10 || dx > 10) sites.push({ x: v.center.x + dx, y: v.center.y + dy });
    }
  }
  for (const p of sites) {
    if (p.x < 0 || p.y < 0 || p.x >= w.width || p.y >= w.height || occupied.has(`${p.x},${p.y}`) || w.tiles[p.y * w.width + p.x] !== "grass" || !findPath(w, v.center, p)) continue;
    stock.wood -= cost;
    w.economy.totals.investedWood += cost;
    const b = { id: `c${w.nextId++}`, kind, name: `${v.name} ${kind === "home" ? "\uC0C8\uC9D1" : "\uC0C8 \uB18D\uC7A5"}`, position: p, level: 1, growth: 0, settlementId: v.id, ownerIds: [] };
    w.buildings.push(b);
    if (kind === "farm") {
      delete b.ownerIds;
      w.tiles[p.y * w.width + p.x] = "farm";
    }
    appendEvent(w, { kind: "construction", locationId: b.id, importance: 50, description: `${v.name}\uC774 ${observer ? "\uAD00\uCE21\uC790\uC758 \uAC74\uC124 \uC120\uD0DD\uC73C\uB85C" : "\uB9C8\uC744\uC758 \uD544\uC694\uC5D0 \uB530\uB77C"} \uACF5\uB3D9 \uBAA9\uC7AC ${cost}\uAC1C\uB85C ${kind === "home" ? capacity(b) + "\uC778 \uC8FC\uD0DD" : "\uC0DD\uC0B0 \uB18D\uC7A5"}\uC744 \uC9C0\uC5C8\uB2E4.`, data: { observer, wood: cost, settlementId: v.id, capacity: kind === "home" ? capacity(b) : 0 } });
    initializeUrban(w);
    if (w.heritage) initializeHeritage(w);
    return b;
  }
}
function regionalDay(w) {
  for (const v of [...w.civilization.settlements]) {
    const people = residents(w, v.id), stock = stocks(w, v.id), m = market(w, v.id);
    if (v.id !== "v0") {
      const need2 = people.length * 3, supply = stock.food + m.food + people.reduce((s, n) => s + n.inventory.food, 0);
      m.foodPrice += Math.sign(Math.max(1, Math.min(12, Math.round(3 * need2 / Math.max(1, supply)))) - m.foodPrice);
    }
    const homes = w.buildings.filter((b) => b.kind === "home" && b.settlementId === v.id);
    const beds = homes.reduce((s, b) => s + capacity(b), 0);
    if (people.length >= beds - 2) buildHouse(w, v);
    const farms = w.buildings.filter((b) => b.kind === "farm" && b.settlementId === v.id);
    if (people.length > farms.length * 12 && stock.wood >= 16) {
      buildHouse(w, v, "farm");
    }
    if (people.length >= 16 && stock.wood >= 60 && stock.food >= 24 && w.civilization.settlements.length < 12) {
      const next = addVillage(w);
      stock.wood -= 60;
      w.economy.totals.investedWood += 60;
      stock.food -= 24;
      next.storage.food += 24;
      const coins = Math.min(30, m.coins);
      m.coins -= coins;
      next.market.coins += coins;
      const e = appendEvent(w, { kind: "settlement", importance: 60, description: `${v.name}\uC774 \uBAA9\uC7AC 60\uAC1C\uB97C \uD22C\uC790\uD574 ${next.name}\uC744 \uC138\uC6B0\uACE0 \uC2DD\uB7C9 24\uAC1C\xB7\uC2DC\uC7A5 \uAE30\uAE08 ${coins}\uCF54\uC778\uC744 \uC62E\uACBC\uB2E4.`, data: { from: v.id, to: next.id, wood: 60, food: 24, coins } });
      next.sourceEventId = e.id;
      const founder = people.find((n) => n.identity.age >= 18 && !isTravelling(w, n));
      if (founder) startMigration(w, founder, next, e.id);
    }
    for (const to of w.civilization.settlements) if (to.id !== v.id) startTrade(w, v, to);
    const crowded = people.length > beds || stock.food + m.food < people.length;
    if (crowded) {
      const migrant = people.find((n) => n.identity.age >= 18 && w.tick - n.life.lastMove > YEAR_TICKS && !isTravelling(w, n));
      const better = w.civilization.settlements.find((other) => other.id !== v.id && stocks(w, other.id).food + market(w, other.id).food > residents(w, other.id).length * 2);
      if (migrant && better) startMigration(w, migrant, better);
    }
    if (w.tick % YEAR_TICKS === 0) for (const n of people.filter((n2) => canWork(w, n2) && !isTravelling(w, n2))) {
      const farmers = people.filter((p) => p.occupation === "farmer").length;
      const job = farmers < people.length / 3 ? "farmer" : stock.wood < 12 && !people.some((p) => p.occupation === "woodcutter") ? "woodcutter" : n.occupation;
      if (job !== n.occupation && !w.urban.citizens[n.id]?.employer) {
        const previous = n.occupation;
        n.occupation = job;
        appendEvent(w, { kind: "occupation", actorId: n.id, importance: 40, description: `${n.identity.name}\uC774 \uB9C8\uC744\uC758 \uC0DD\uC0B0 \uC218\uC694\uC5D0 \uB530\uB77C \uC9C1\uC5C5\uC744 \uBC14\uAFB8\uC5C8\uB2E4.`, data: { previous, occupation: job, settlementId: v.id } });
      }
    }
  }
}

// ../../../..v0.21-source/src/sim/gatherings.ts
var eligible = (w, n) => n.alive && n.identity.age >= 18 && !isTravelling(w, n);
function interruptionReason(w, n, settlementId) {
  if (!n.alive) return "\uC138\uC0C1\uC744 \uB5A0\uB098 \uC57D\uC18D\uC5D0 \uCC38\uC5EC\uD560 \uC218 \uC5C6\uB2E4.";
  if (n.settlementId !== settlementId || isTravelling(w, n)) return "\uAC70\uC8FC\uC9C0\uAC00 \uBC14\uB00C\uC5C8\uAC70\uB098 \uB9C8\uC744 \uC0AC\uC774\uB97C \uC774\uB3D9\uD558\uACE0 \uC788\uB2E4.";
  const urgent = urgentNeed(n);
  if (urgent) return `${{ hunger: "\uC2EC\uD55C \uBC30\uACE0\uD514", thirst: "\uC2EC\uD55C \uAC08\uC99D", fatigue: "\uC2EC\uD55C \uD53C\uB85C", health: "\uAC74\uAC15 \uC545\uD654" }[urgent]} \uB54C\uBB38\uC5D0 \uC0DD\uD65C \uD68C\uBCF5\uC744 \uBA3C\uC800 \uD574\uC57C \uD55C\uB2E4.`;
  return "\uACF5\uB3D9 \uD65C\uB3D9\uC5D0 \uCC38\uC5EC\uD560 \uC0DD\uD65C \uC870\uAC74\uC774 \uBC14\uB00C\uC5C8\uB2E4.";
}
var booked = (w, id7, except) => w.gatherings?.items.some((g) => isPlanned(g) && g.id !== except && (g.hostId === id7 || g.invitations.some((i) => i.npcId === id7 && i.status === "accepted")));
function record(w, g, phase, description2, participants, causeId = g.sourceEventId) {
  const e = socialEvent(w, {
    kind: "gathering",
    actorId: participants[0],
    participants,
    locationId: g.buildingId,
    importance: 55,
    causeId,
    description: description2,
    data: { gatheringId: g.id, gatheringKind: g.kind, phase }
  });
  g.lastEventId = e.id;
  return e;
}
var informed = (g, i) => !g.schedule || !!i.scheduleEventId;
function responseReason(w, g, n) {
  const host = w.npcs.find((p) => p.id === g.hostId);
  const path = findPath(w, n.position, w.buildings.find((b) => b.id === g.buildingId).position);
  const work = n.currentAction && ["Work", "Gather"].includes(n.currentAction.kind) ? n.currentAction.duration - n.currentAction.progress + n.currentAction.path.length : 0;
  return booked(w, n.id, g.id) ? "\uC774\uBBF8 \uB2E4\uB978 \uACF5\uB3D9 \uD65C\uB3D9 \uC57D\uC18D\uC774 \uC788\uB2E4." : urgentNeed(n) ? interruptionReason(w, n, g.settlementId) : path === null || path.length + work > g.startsAt - w.tick - 6 ? "\uC774\uB3D9\uACFC \uB0A8\uC740 \uC791\uC5C5 \uB54C\uBB38\uC5D0 \uC57D\uC18D \uC2DC\uAC04\uC5D0 \uB3C4\uCC29\uD558\uAE30 \uC5B4\uB835\uB2E4." : g.kind === "harvest" && !canWork(w, n) ? "\uC9C0\uAE08\uC740 \uB178\uB3D9\uD558\uAE30 \uC5B4\uB824\uC6B4 \uC0C1\uD0DC\uB2E4." : g.kind === "meal" && n.inventory.food < 1 ? "\uD568\uAED8 \uBA39\uC744 \uC790\uC2E0\uC758 \uC2DD\uB7C9\uC774 \uC5C6\uB2E4." : bond(n, host) < 15 ? "\uC9C0\uB09C \uAD00\uACC4\uC640 \uACBD\uD5D8 \uB54C\uBB38\uC5D0 \uC774\uBC88 \uCD08\uB300\uB97C \uAC70\uC808\uD55C\uB2E4." : "\uC0DD\uD65C \uC77C\uC815\uC5D0 \uC5EC\uC720\uAC00 \uC788\uACE0 \uD568\uAED8\uD560 \uC758\uC0AC\uAC00 \uC788\uC5B4 \uC57D\uC18D\uD55C\uB2E4.";
}
function rescheduleGathering(w, g, requester, reason) {
  const host = w.npcs.find((n) => n.id === g.hostId);
  if (!isPlanned(g) || g.schedule || w.tick >= g.startsAt - 12 || requester.id === host.id || !eligible(w, requester) || !g.invitations.some((i) => i.npcId === requester.id) || distance(host.position, requester.position) > 4) return false;
  const request = record(w, g, "reschedule-requested", `${requester.identity.name}\uC774 \uC2DC\uAC04\uC744 \uB2A6\uCD94\uC790\uACE0 \uC9C1\uC811 \uC81C\uC548\uD588\uB2E4. ${reason}`, [requester.id, host.id]);
  request.data.distance = distance(host.position, requester.position);
  const previousStart = g.startsAt;
  g.startsAt += 18;
  g.endsAt += 18;
  g.progress = 0;
  g.attendance = [];
  const event2 = record(w, g, "rescheduled", `${host.identity.name}\uC774 \uC57D\uC18D\uC744 3\uC2DC\uAC04 \uB2A6\uCDC4\uB2E4. \uC0C8 \uC2DC\uAC04\uC740 \uB2E4\uC2DC \uC804\uB2EC\uD558\uACE0 \uC218\uB77D\uBC1B\uC544\uC57C \uD55C\uB2E4.`, [host.id], request.id);
  event2.data.startsAt = g.startsAt;
  event2.data.endsAt = g.endsAt;
  g.schedule = { eventId: event2.id, requestEventId: request.id, requestedBy: requester.id, tick: w.tick, previousStart };
  if (host.currentAction?.kind === "Attend" && host.currentAction.targetId === g.id) delete host.currentAction;
  return true;
}
function deliverInvitations(w, g) {
  const host = w.npcs.find((n) => n.id === g.hostId);
  if (!isPlanned(g) || w.tick >= g.startsAt - 6 || !eligible(w, host)) return;
  const senders = [host, ...g.invitations.filter((i) => i.status === "accepted" && (i.depth ?? 1) === 1 && informed(g, i)).map((i) => w.npcs.find((n) => n.id === i.npcId))];
  for (const sender of senders) {
    if (!eligible(w, sender) || urgentNeed(sender) || sender.settlementId !== g.settlementId) continue;
    const parent = g.invitations.find((i) => i.npcId === sender.id);
    if (parent && !informed(g, parent)) continue;
    const nearby = w.npcs.filter((n) => n.id !== host.id && n.id !== sender.id && eligible(w, n) && n.settlementId === g.settlementId && distance(sender.position, n.position) <= 4 && !g.invitations.some((i) => i.npcId === n.id)).sort((a, b) => (sender.id === g.hostId ? Number(b.id === g.recurring?.partnerId) - Number(a.id === g.recurring?.partnerId) : 0) || invitationPreference(w, sender, b, g.kind) - invitationPreference(w, sender, a, g.kind) || a.id.localeCompare(b.id));
    for (const n of nearby.slice(0, 3 - g.invitations.length)) {
      const invitation = record(w, g, "invited", `${sender.identity.name}\uC774 ${n.identity.name}\uC5D0\uAC8C ${host.identity.name}\uC758 ${GATHERING_LABELS[g.kind]} \uC57D\uC18D\uC744 \uC9C1\uC811 \uC804\uD588\uB2E4.`, [sender.id, n.id], parent?.invitationEventId ?? g.sourceEventId);
      const circle = w.gatherings?.circles?.find((c) => c.hostId === sender.id && c.partnerId === n.id && c.kind === g.kind);
      invitation.data.evidence = [...parent ? [parent.responseEventId] : [], ...circle?.evidence ?? []];
      invitation.data.preference = invitationPreference(w, sender, n, g.kind);
      if (circle) invitation.description += ` \uC774\uC804\uC5D0 \uD568\uAED8 \uC644\uB8CC\uD55C ${circle.meetings}\uBC88\uC758 \uACBD\uD5D8\uC744 \uB2E4\uC74C \uCD08\uB300\uC5D0 \uCC38\uACE0\uD588\uB2E4.`;
      invitation.data.distance = distance(sender.position, n.position);
      invitation.data.depth = parent ? 2 : 1;
      const reason = responseReason(w, g, n), accepted = reason.startsWith("\uC0DD\uD65C \uC77C\uC815");
      const response = record(w, g, accepted ? "accepted" : "declined", `${n.identity.name}: ${reason}`, [n.id, sender.id], invitation.id);
      g.invitations.push({ npcId: n.id, senderId: sender.id, depth: parent ? 2 : 1, deliveredAt: w.tick, invitationEventId: invitation.id, responseEventId: response.id, status: accepted ? "accepted" : "declined", reason });
      if (g.schedule) {
        const i = g.invitations.at(-1);
        i.scheduleEventId = invitation.id;
        i.scheduleResponseId = response.id;
        invitation.data.schedule = g.schedule.eventId;
      }
      if (!accepted && /이동|작업|생활 회복/.test(reason)) rescheduleGathering(w, g, n, reason);
    }
  }
  if (g.schedule) for (const i of g.invitations.filter((i2) => !i2.scheduleEventId && ["accepted", "declined"].includes(i2.status))) {
    const n = w.npcs.find((n2) => n2.id === i.npcId);
    const sender = [host, ...g.invitations.filter((j) => j.status === "accepted" && !!j.scheduleEventId).map((j) => w.npcs.find((n2) => n2.id === j.npcId))].find((s) => eligible(w, s) && s.settlementId === g.settlementId && s.id !== n.id && distance(s.position, n.position) <= 4);
    if (!eligible(w, n) || n.settlementId !== g.settlementId || !sender) continue;
    const notice = record(w, g, "schedule-delivered", `${sender.identity.name}\uC774 ${n.identity.name}\uC5D0\uAC8C \uBCC0\uACBD\uB41C \uC57D\uC18D \uC2DC\uAC04\uC744 \uC9C1\uC811 \uC804\uD588\uB2E4.`, [sender.id, n.id], g.schedule.eventId);
    notice.data.distance = distance(sender.position, n.position);
    notice.data.schedule = g.schedule.eventId;
    const reason = responseReason(w, g, n), accepted = reason.startsWith("\uC0DD\uD65C \uC77C\uC815");
    const response = record(w, g, accepted ? "accepted" : "declined", `${n.identity.name}\uC774 \uC0C8 \uC2DC\uAC04\uC5D0 ${accepted ? "\uB2E4\uC2DC \uC57D\uC18D\uD588\uB2E4" : "\uCC38\uC5EC\uD558\uC9C0 \uC54A\uAE30\uB85C \uD588\uB2E4"}. ${reason}`, [n.id, sender.id], notice.id);
    i.scheduleEventId = notice.id;
    i.scheduleResponseId = response.id;
    i.responseEventId = response.id;
    i.status = accepted ? "accepted" : "declined";
    i.reason = reason;
    if (n.currentAction?.kind === "Attend" && n.currentAction.targetId === g.id) delete n.currentAction;
  }
}
function invitationPreference(w, n, other, kind) {
  const circle = w.gatherings?.circles?.find((c) => c.hostId === n.id && c.partnerId === other.id && c.kind === kind);
  const missed = n.memories.filter((m) => {
    const e = eventById(w, m.sourceEventId);
    return e?.kind === "gathering" && e.data.phase === "missed" && e.tick >= w.tick - 7 * 144 && w.gatherings?.items.some((g) => g.id === e.data.gatheringId && g.hostId === other.id);
  }).length;
  return bond(n, other) + (circle ? Math.max(0, circle.meetings * 4 - Math.floor((w.tick - circle.lastAt) / 144)) : 0) - Math.min(6, missed * 2);
}
function rememberCircle(w, g, host, guest, eventId) {
  const evidence2 = host.memories.map((m) => eventById(w, m.sourceEventId)).filter((e) => e?.kind === "gathering" && e.data.phase === "completed" && e.data.gatheringKind === g.kind && e.participants.includes(guest.id)).map((e) => e.id);
  const ids = [...new Set(evidence2.filter((id7) => id7 !== eventId))].sort((a, b) => eventById(w, a).tick - eventById(w, b).tick).slice(-2).concat(eventId);
  if (ids.length < 2) return;
  const circles = w.gatherings.circles ??= [];
  const existing = circles.find((c) => c.hostId === host.id && c.partnerId === guest.id && c.kind === g.kind);
  if (existing) {
    existing.evidence = ids;
    existing.meetings = ids.length;
    existing.lastAt = w.tick;
  } else circles.push({ hostId: host.id, partnerId: guest.id, kind: g.kind, meetings: ids.length, evidence: ids, lastAt: w.tick });
  if (circles.length > 48) circles.splice(0, circles.length - 48);
}
function bond(n, other) {
  const r = n.relationships.find((r2) => r2.npcId === other.id);
  return (r?.trust ?? 35) + (r?.affection ?? 0) * 0.3 - (r?.resentment ?? 0) + n.personality.sociability * 0.1;
}
function recurringCircle(w, host) {
  return (w.gatherings?.circles ?? []).filter((c) => c.hostId === host.id && w.tick - c.lastAt >= 3 * 144 && w.tick - c.lastAt <= 14 * 144).sort((a, b) => a.lastAt - b.lastAt || a.partnerId.localeCompare(b.partnerId)).find((c) => {
    const partner = w.npcs.find((n) => n.id === c.partnerId);
    return partner && eligible(w, partner) && partner.settlementId === host.settlementId && distance(host.position, partner.position) <= 4 && bond(host, partner) >= 25 && !booked(w, partner.id) && !w.gatherings?.items.some((g) => g.hostId === host.id && g.recurring?.partnerId === partner.id && w.tick - g.createdAt < 3 * 144);
  });
}
function proposeGatherings(w) {
  const state = w.gatherings ??= { items: [], lastProposalDay: -1 };
  const day = Math.floor(w.tick / 144);
  if (w.tick % 144 !== 60 || state.lastProposalDay === day) return;
  state.lastProposalDay = day;
  state.items = [...state.items.filter(isPlanned), ...state.items.filter((g) => !isPlanned(g)).slice(-24)];
  for (const village of w.civilization.settlements) {
    if (state.items.some((g) => isPlanned(g) && g.settlementId === village.id)) continue;
    const locals = w.npcs.filter((n) => eligible(w, n) && n.settlementId === village.id && !urgentNeed(n) && !booked(w, n.id) && !state.items.some((g) => g.hostId === n.id && w.tick - g.createdAt < 3 * 144));
    const due = new Map(locals.map((n) => [n.id, recurringCircle(w, n)]));
    const ranked = locals.sort((a, b) => (due.get(b.id) ? 60 : 0) - (due.get(a.id) ? 60 : 0) + (b.personality.sociability + b.personality.empathy + (100 - b.needs.social)) - (a.personality.sociability + a.personality.empathy + (100 - a.needs.social)) || a.id.localeCompare(b.id));
    for (const host of ranked.slice(0, 24)) {
      const neighbours2 = w.npcs.filter((n) => eligible(w, n) && n.id !== host.id && n.settlementId === village.id && distance(host.position, n.position) <= 4);
      if (!neighbours2.length) continue;
      let evidence2 = host.memories.filter((m) => m.type === "social" && eventById(w, m.sourceEventId)?.participants.includes(host.id) && eventById(w, m.sourceEventId)?.kind !== "rumor").slice(-4).map((m) => m.sourceEventId);
      const needy = neighbours2.find((n) => n.inventory.food === 0 && n.needs.hunger > 55);
      const farm = w.buildings.find((b) => b.kind === "farm" && b.settlementId === village.id && b.growth >= 8 && !w.urban.enterprises.some((e2) => e2.buildingId === b.id));
      const circle = due.get(host.id);
      const repeat = circle && (circle.kind === "meal" ? host.inventory.food >= 2 : circle.kind === "harvest" ? !!farm && canWork(w, host) : !!needy && host.inventory.food >= 3 && host.personality.empathy >= 45) ? circle : void 0;
      if (repeat) evidence2 = [...repeat.evidence];
      const kind = repeat?.kind ?? (needy && host.inventory.food >= 3 && host.personality.empathy >= 45 ? "help" : farm && canWork(w, host) && host.inventory.food < 3 ? "harvest" : host.inventory.food >= 2 && (host.needs.social < 75 || evidence2.length > 0) ? "meal" : void 0);
      if (!kind) continue;
      const venue = kind === "harvest" ? farm : w.buildings.find((b) => b.kind === "market" && b.settlementId === village.id);
      const path = findPath(w, host.position, venue.position);
      if (!path || path.length > 30) continue;
      let reason = kind === "help" ? `\uB208\uC55E\uC758 ${needy.identity.name}\uC5D0\uAC8C \uC2DD\uB7C9\uC774 \uC5C6\uACE0 \uBC30\uACE0\uD514\uC774 ${Math.round(needy.needs.hunger)}\uC774\uB2E4. \uB0B4 \uC2DD\uB7C9 ${host.inventory.food}\uAC1C \uC911 \uC77C\uBD80\uB97C \uB098\uB204\uACE0 \uC2F6\uB2E4.` : kind === "harvest" ? `\uB0B4 \uC2DD\uB7C9\uC740 ${host.inventory.food}\uAC1C\uC774\uACE0 \uB9C8\uC744 \uB18D\uC7A5\uC5D0 \uC775\uC740 \uC791\uBB3C ${Math.floor(farm.growth)}\uAC1C\uAC00 \uC788\uB2E4. \uD568\uAED8 \uC218\uD655\uD558\uACE0 \uC2F6\uB2E4.` : `\uB0B4 \uC2DD\uB7C9 ${host.inventory.food}\uAC1C\uC640 \uAD50\uB958 \uCDA9\uC871 ${Math.round(host.needs.social)}, \uAE30\uC5B5\uD55C \uB9CC\uB0A8 ${evidence2.length}\uAC74\uC744 \uBC14\uD0D5\uC73C\uB85C \uD568\uAED8 \uC2DD\uC0AC\uD558\uACE0 \uC2F6\uB2E4.`;
      if (repeat) reason = `${w.npcs.find((n) => n.id === repeat.partnerId).identity.name}\uACFC \uC2E4\uC81C\uB85C \uD568\uAED8\uD55C ${repeat.meetings}\uBC88\uC758 \uACBD\uD5D8\uC744 \uBC14\uD0D5\uC73C\uB85C \uC815\uAE30 \uBAA8\uC784\uC744 \uB2E4\uC2DC \uC81C\uC548\uD55C\uB2E4. \uB9E4\uBC88 \uC9C1\uC811 \uCD08\uB300\uD558\uACE0 \uC0C8\uB85C \uC218\uB77D\uBC1B\uB294\uB2E4. ${reason}`;
      const g = {
        id: `g${w.nextId++}`,
        kind,
        hostId: host.id,
        settlementId: village.id,
        buildingId: venue.id,
        createdAt: w.tick,
        startsAt: w.tick + 36,
        endsAt: w.tick + 60,
        status: "planned",
        ...repeat ? { recurring: { partnerId: repeat.partnerId, evidence: [...repeat.evidence] } } : {},
        reason,
        evidence: evidence2,
        sourceEventId: "",
        lastEventId: "",
        invitations: [],
        progress: 0,
        attendance: [],
        arrivals: []
      };
      const e = appendEvent(w, {
        kind: "gathering",
        actorId: host.id,
        locationId: venue.id,
        importance: 55,
        description: `${host.identity.name}\uC774 ${GATHERING_LABELS[kind]} \uC57D\uC18D\uC744 \uC81C\uC548\uD588\uB2E4. ${reason}`,
        data: { gatheringId: g.id, gatheringKind: kind, phase: "proposed", ...repeat ? { recurringPartner: repeat.partnerId } : {}, startsAt: g.startsAt, endsAt: g.endsAt, evidence: evidence2 }
      });
      g.sourceEventId = e.id;
      g.lastEventId = e.id;
      state.items.push(g);
      deliverInvitations(w, g);
      break;
    }
  }
}
function gatheringCandidate(w, n) {
  if (!eligible(w, n) || urgentNeed(n)) return;
  const g = w.gatherings?.items.find((g2) => isPlanned(g2) && w.tick >= (g2.schedule?.previousStart ?? g2.startsAt) - 24 && w.tick < g2.endsAt && (g2.hostId === n.id || g2.invitations.some((i) => i.npcId === n.id && i.status === "accepted")));
  if (!g) return;
  const b = w.buildings.find((b2) => b2.id === g.buildingId);
  const invitation = g.invitations.find((i) => i.npcId === n.id);
  const knownStart = invitation && !informed(g, invitation) ? g.schedule.previousStart : g.startsAt;
  if (w.tick >= knownStart + 24 || w.tick < knownStart - Math.min(12, distance(n.position, b.position) + 3)) return;
  return { kind: "Attend", score: 110, target: { ...b.position }, targetId: g.id, reason: `\uC57D\uC18D\uD55C ${GATHERING_LABELS[g.kind]} \xB7 ${b.name}\uC5D0\uC11C \uB9CC\uB098\uAE30\uB85C \uD588\uB2E4.`, evidence: [g.hostId === n.id ? g.sourceEventId : g.invitations.find((i) => i.npcId === n.id).responseEventId] };
}
function clearActions(w, g) {
  for (const n of w.npcs) if (n.currentAction?.kind === "Attend" && n.currentAction.targetId === g.id) delete n.currentAction;
}
function finish(w, g, reason, completed = []) {
  g.status = completed.length >= 2 ? "completed" : "cancelled";
  g.finishedAt = w.tick;
  if (g.status === "cancelled") {
    g.progress = 0;
    g.attendance = [];
  }
  const host = w.npcs.find((n) => n.id === g.hostId);
  const accepted = g.invitations.filter((i) => i.status === "accepted");
  const e = record(w, g, g.status, `${GATHERING_LABELS[g.kind]} ${g.status === "completed" ? "\uC644\uB8CC" : "\uCDE8\uC18C"} \xB7 ${reason}`, completed.length ? completed.map((n) => n.id) : [g.hostId]);
  for (const i of accepted) {
    const n = w.npcs.find((n2) => n2.id === i.npcId);
    if (completed.includes(n)) {
      rememberCircle(w, g, host, n, e.id);
      rememberCircle(w, g, n, host, e.id);
      i.status = "attended";
      i.reason = "\uC57D\uC18D \uC7A5\uC18C\uC5D0\uC11C \uD568\uAED8 \uD65C\uB3D9\uC744 \uB9C8\uCCE4\uB2E4.";
      i.responseEventId = e.id;
      changeRelationship(w, host, n.id, { trust: 3, affection: 2, familiarity: 3 }, e, "\uC57D\uC18D\uD55C \uD65C\uB3D9\uC744 \uD568\uAED8 \uB9C8\uCCE4\uB2E4.");
      changeRelationship(w, n, host.id, { trust: 3, affection: 2, familiarity: 3 }, e, "\uC57D\uC18D\uD55C \uD65C\uB3D9\uC744 \uD568\uAED8 \uB9C8\uCCE4\uB2E4.");
    } else {
      i.status = "missed";
      i.reason = "\uC57D\uC18D \uC2DC\uAC04 \uC548\uC5D0 \uACF5\uB3D9 \uD65C\uB3D9\uC744 \uB9C8\uCE58\uC9C0 \uBABB\uD588\uB2E4.";
      const notice = record(w, g, "missed", `${n.identity.name}\uC774 \uC57D\uC18D \uC2DC\uAC04 \uC548\uC5D0 \uACF5\uB3D9 \uD65C\uB3D9\uC744 \uB9C8\uCE58\uC9C0 \uBABB\uD588\uB2E4.`, [n.id], i.responseEventId);
      i.responseEventId = notice.id;
    }
  }
  clearActions(w, g);
}
function updateGatherings(w) {
  for (const g of w.gatherings?.items.filter(isPlanned) ?? []) {
    const host = w.npcs.find((n) => n.id === g.hostId);
    if (!eligible(w, host) || host.settlementId !== g.settlementId || urgentNeed(host)) {
      finish(w, g, `\uC8FC\uCD5C\uC790: ${interruptionReason(w, host, g.settlementId)}`);
      continue;
    }
    for (const i of g.invitations.filter((i2) => i2.status === "accepted")) {
      const n = w.npcs.find((n2) => n2.id === i.npcId);
      if (eligible(w, n) && n.settlementId === g.settlementId && !urgentNeed(n)) continue;
      i.status = "withdrawn";
      i.reason = interruptionReason(w, n, g.settlementId);
      const e = record(w, g, "withdrawn", `${n.identity.name}: ${i.reason}`, [n.id], i.responseEventId);
      i.responseEventId = e.id;
      if (n.currentAction?.kind === "Attend" && n.currentAction.targetId === g.id) delete n.currentAction;
    }
    deliverInvitations(w, g);
    if (w.tick >= g.endsAt) {
      finish(w, g, "\uC57D\uC18D \uC2DC\uAC04 \uC548\uC5D0 \uC778\uC6D0\xB7\uC7A5\uC18C\xB7\uC790\uC6D0 \uC870\uAC74\uC744 \uD568\uAED8 \uCDA9\uC871\uD558\uC9C0 \uBABB\uD588\uB2E4.");
      continue;
    }
    const b = w.buildings.find((b2) => b2.id === g.buildingId);
    const participants = [host, ...g.invitations.filter((i) => i.status === "accepted" && informed(g, i)).map((i) => w.npcs.find((n) => n.id === i.npcId))];
    const present = participants.filter((n) => n.currentAction?.kind === "Attend" && n.currentAction.targetId === g.id && distance(n.position, b.position) === 0);
    for (const n of present) if (!g.arrivals.some((a) => a.npcId === n.id)) {
      const e = appendEvent(w, {
        kind: "gathering",
        actorId: n.id,
        locationId: b.id,
        importance: 20,
        causeId: n.id === g.hostId ? g.sourceEventId : g.invitations.find((i) => i.npcId === n.id).responseEventId,
        description: `${n.identity.name}\uC774 ${GATHERING_LABELS[g.kind]} \uC57D\uC18D \uC7A5\uC18C\uC5D0 \uC2E4\uC81C\uB85C \uB3C4\uCC29\uD588\uB2E4.`,
        data: { gatheringId: g.id, gatheringKind: g.kind, phase: "arrived" }
      });
      g.arrivals.push({ npcId: n.id, tick: w.tick, eventId: e.id });
      g.lastEventId = e.id;
    }
    if (w.tick < g.startsAt) continue;
    const ready = present.includes(host) && present.length >= 2 && (g.kind === "meal" ? present.every((n) => n.inventory.food >= 1) : g.kind === "help" ? host.inventory.food >= 2 && present.some((n) => n.id !== host.id && n.inventory.food === 0) : present.every((n) => canWork(w, n)) && b.growth >= present.length * 2);
    if (!ready) {
      g.progress = 0;
      g.attendance = [];
      continue;
    }
    const ids = present.map((n) => n.id);
    if (JSON.stringify(ids) !== JSON.stringify(g.attendance)) {
      g.progress = 0;
      g.attendance = ids;
    }
    if (++g.progress < 6) continue;
    if (g.kind === "meal") for (const n of present) {
      n.inventory.food--;
      w.economy.totals.consumedFood++;
      n.needs.hunger = clamp(n.needs.hunger - 38);
    }
    let helped;
    if (g.kind === "help") {
      const target = present.find((n) => n.id !== host.id && n.inventory.food === 0);
      host.inventory.food--;
      target.inventory.food++;
      w.stats.shares++;
      helped = target;
    }
    if (g.kind === "harvest") {
      const amount = present.length * 2;
      b.growth -= amount;
      harvest(w, g.settlementId, amount);
      w.economy.totals.producedFood += amount;
      for (const n of present) n.inventory.food += 2;
    }
    for (const n of present) n.needs.social = clamp(n.needs.social + 20);
    finish(w, g, g.kind === "meal" ? `${present.length}\uBA85\uC774 \uAC01\uC790 \uC2DD\uB7C9 1\uAC1C\uB97C \uBA39\uC5C8\uB2E4.` : g.kind === "help" ? `${host.identity.name}\uC774 ${helped.identity.name}\uC5D0\uAC8C \uC18C\uC9C0 \uC2DD\uB7C9 1\uAC1C\uB97C \uC804\uB2EC\uD588\uB2E4.` : `${present.length}\uBA85\uC774 \uC2E4\uC81C \uC791\uBB3C\uC5D0\uC11C \uAC01\uC790 \uC2DD\uB7C9 2\uAC1C\uB97C \uC218\uD655\uD588\uB2E4.`, present);
  }
}

// ../../../..v0.21-source/src/sim/requests-types.ts
import { z as z3 } from "zod";
var id2 = z3.string().min(1).max(100);
var tick2 = z3.number().int().nonnegative();
var REQUEST_KINDS = ["food", "clothing", "housing"];
var REQUEST_CHOICES = ["food", "farm", "clothes", "mend", "repair", "expand", "later", "decline"];
var REQUEST_LABELS = { food: "\uB2E4\uC74C \uB07C\uB2C8\uB97C \uBD80\uD0C1\uD574\uC694", clothing: "\uB530\uB73B\uD55C \uC637\uC774 \uD544\uC694\uD574\uC694", housing: "\uC6B0\uB9AC \uC9D1\uC744 \uB3CC\uBD10 \uC8FC\uC138\uC694" };
var score2 = z3.number().finite().min(0).max(100);
var requestMetricsSchema = z3.object({ hunger: score2, health: score2, food: tick2, clothing: score2, warmth: score2, condition: score2, capacity: tick2, trust: score2 }).strict();
var residentRequestSchema = z3.object({
  id: id2,
  npcId: id2,
  settlementId: id2,
  homeId: id2,
  kind: z3.enum(REQUEST_KINDS),
  status: z3.enum(["open", "deferred", "observing", "completed", "declined", "expired", "resolved", "cancelled"]),
  createdAt: tick2,
  expiresAt: tick2,
  deferredUntil: tick2.optional(),
  reviewAt: tick2.optional(),
  closedAt: tick2.optional(),
  choice: z3.enum(REQUEST_CHOICES).optional(),
  sourceEventId: id2,
  lastEventId: id2,
  decisionEventId: id2.optional(),
  resultEventId: id2.optional(),
  buildingId: id2.optional(),
  context: z3.object({ metrics: requestMetricsSchema, facts: z3.array(z3.string().max(300)).max(5), evidence: z3.array(id2).max(4) }).strict().optional(),
  followups: z3.array(z3.object({ days: z3.union([z3.literal(1), z3.literal(3)]), tick: tick2, eventId: id2, metrics: requestMetricsSchema, evidence: z3.array(id2).max(6), needRemains: z3.boolean() }).strict()).max(2).optional(),
  followupStopped: id2.optional(),
  followupSince: tick2.optional(),
  before: requestMetricsSchema,
  immediate: requestMetricsSchema.optional(),
  after: requestMetricsSchema.optional()
}).strict();
var requestsSchema = z3.object({ since: tick2, lastOffered: z3.number().int().min(-1e3), offeredDay: tick2, offeredToday: tick2.max(2), cooldowns: z3.record(tick2), items: z3.array(residentRequestSchema).max(32) }).strict();
var emptyRequests = (since) => ({ since, lastOffered: since - 36, offeredDay: 0, offeredToday: 0, cooldowns: {}, items: [] });

// ../../../..v0.21-source/src/sim/requests.ts
var activeRequest = (r) => ["open", "deferred", "observing"].includes(r.status);
function requestMetrics(w, n) {
  const l = w.living.people[n.id], home = w.buildings.find((b) => b.id === n.homeId);
  return {
    hunger: n.needs.hunger,
    health: n.needs.health,
    food: n.inventory.food,
    clothing: l.clothing,
    warmth: l.body.warmth,
    condition: w.urban.buildings[home.id].condition,
    capacity: capacity(home),
    trust: w.urban.citizens[n.id].trust
  };
}
function need(w, n, kind, ongoing = false) {
  if (!n.alive || isTravelling(w, n)) return false;
  const l = w.living.people[n.id], home = w.buildings.find((b) => b.id === n.homeId);
  if (kind === "food") return ongoing ? n.inventory.food < 3 : n.inventory.food <= 1 && n.needs.hunger >= 35;
  if (kind === "clothing") return l.clothing < 30 && (ongoing || l.body.warmth < 65);
  return w.urban.buildings[home.id].condition < 65 || w.npcs.filter((p) => p.alive && p.homeId === home.id).length > capacity(home);
}
function requestContext(w, n, kind) {
  const metrics = requestMetrics(w, n), stock = stocks(w, n.settlementId);
  const c = w.urban.cities.find((c2) => c2.settlementId === n.settlementId);
  const facts = kind === "food" ? [`\uC18C\uC9C0 \uC2DD\uB7C9 ${metrics.food}\uAC1C \xB7 \uACF5\uB3D9 \uC2DD\uB7C9 ${stock.food}\uAC1C`, `\uC624\uB298 \uACF5\uB3D9 \uC2DD\uB7C9 \uC778\uCD9C ${n.dailyTaken}/3\uAC1C \xB7 \uC18C\uC9C0\uAE08 ${n.wealth}\uCF54\uC778`] : kind === "clothing" ? [`\uC637 \uC0C1\uD0DC ${Math.round(metrics.clothing)} \xB7 \uC628\uAE30 ${Math.round(metrics.warmth)}`, `\uB9C8\uC744 \uC637 ${c.goods.clothes}\uAC1C \xB7 \uC9C1\uBB3C ${c.goods.cloth}\uAC1C`] : [`\uC9D1 \uB0B4\uAD6C\uB3C4 ${Math.round(metrics.condition)} \xB7 \uC815\uC6D0 ${metrics.capacity}\uBA85`, `\uD568\uAED8 \uC0AC\uB294 \uC8FC\uBBFC ${w.npcs.filter((p) => p.alive && p.homeId === n.homeId).length}\uBA85 \xB7 \uACF5\uB3D9 \uBAA9\uC7AC ${stock.wood}\uAC1C`];
  const kinds = kind === "food" ? ["consumption", "storage", "trade", "share", "scarcity", "failure", "production"] : kind === "clothing" ? ["consumption", "health", "industry", "weather"] : ["birth", "family", "migration", "construction", "project", "public_service"];
  const evidence2 = w.events.slice(-100).filter((e) => e.tick >= w.tick - 144 && kinds.includes(e.kind) && (e.participants.includes(n.id) || e.actorId === n.id || e.locationId === n.homeId)).slice(-4).map((e) => e.id);
  return { metrics, facts, evidence: evidence2 };
}
function pendingFollowup(r) {
  return !!r.decisionEventId && !!r.followups && !r.followupStopped && [1, 3].some((days) => r.reviewAt - 12 + days * 144 >= r.followupSince && !r.followups.some((f) => f.days === days));
}
function updateFollowups(w) {
  for (const r of w.requests.items.filter(pendingFollowup)) {
    const n = w.npcs.find((n2) => n2.id === r.npcId);
    if (!n.alive || n.homeId !== r.homeId || n.settlementId !== r.settlementId || isTravelling(w, n)) {
      const e = appendEvent(w, {
        kind: "request",
        actorId: n.id,
        importance: 45,
        causeId: r.decisionEventId,
        description: `${n.identity.name}\uC758 \uC0DD\uC560\xB7\uAC70\uC8FC \uC0C1\uD669\uC774 \uBC14\uB00C\uC5B4 \uC774 \uBD80\uD0C1\uC758 \uC7A5\uAE30 \uBE44\uAD50\uB97C \uC911\uB2E8\uD588\uB2E4.`,
        data: { requestId: r.id, requestKind: r.kind, phase: "followup-stopped" }
      });
      r.followupStopped = e.id;
      continue;
    }
    for (const days of [1, 3]) {
      const due = r.reviewAt - 12 + days * 144;
      if (due < r.followupSince || w.tick < due || r.followups.some((f) => f.days === days)) continue;
      const since = r.followups.at(-1)?.tick ?? r.reviewAt - 12;
      const evidence2 = w.events.slice(-100).filter((e2) => e2.tick > since && e2.kind !== "request" && ["production", "consumption", "storage", "trade", "share", "family", "birth", "migration", "health", "project", "industry"].includes(e2.kind) && (e2.participants.includes(n.id) || e2.actorId === n.id || !!r.buildingId && e2.locationId === r.buildingId)).slice(-6).map((e2) => e2.id);
      const metrics = requestMetrics(w, n), needRemains = need(w, n, r.kind);
      const e = appendEvent(w, {
        kind: "request",
        actorId: n.id,
        locationId: r.buildingId,
        importance: 50,
        causeId: r.decisionEventId,
        description: `${n.identity.name}\uC758 \uBD80\uD0C1\uC744 \uC9C0\uC6D0\uD55C \uB4A4 ${days}\uC77C \uACBD\uACFC: ${needRemains ? "\uAC19\uC740 \uC5B4\uB824\uC6C0\uC758 \uC870\uAC74\uC774 \uB2E4\uC2DC \uAD00\uCC30\uB410\uB2E4" : "\uD604\uC7AC \uAC19\uC740 \uBD80\uD0C1\uC774 \uD544\uC694\uD55C \uC870\uAC74\uC740 \uC544\uB2C8\uB2E4"}. \uC0DD\uD65C\uACFC \uB0A0\uC528\uAC00 \uD568\uAED8 \uBC18\uC601\uB41C \uC2E4\uC81C \uC0C1\uD0DC\uB2E4.`,
        data: { requestId: r.id, requestKind: r.kind, phase: "followup", days, evidence: evidence2, needRemains, ...metrics }
      });
      r.followups.push({ days, tick: w.tick, eventId: e.id, metrics, evidence: evidence2, needRemains });
    }
  }
}
function requestOptions(w, r) {
  const s = stocks(w, r.settlementId), city2 = w.urban.cities.find((c) => c.settlementId === r.settlementId);
  const home = w.buildings.find((b) => b.id === r.homeId);
  const wood = (amount) => s.wood < amount ? `\uACF5\uB3D9 \uBAA9\uC7AC ${amount - s.wood}\uAC1C \uBD80\uC871` : void 0;
  const options = r.kind === "food" ? [
    { choice: "food", label: "\uC9C0\uAE08 \uC2DD\uB7C9 \uBCF4\uB0B4\uAE30", cost: "\uACF5\uB3D9 \uC2DD\uB7C9 2\uAC1C", effect: "\uC8FC\uBBFC\uC758 \uC18C\uC9C0 \uC2DD\uB7C9 +2 \xB7 \uB9C8\uC744\uC5D0 \uB300\uD55C \uC2E0\uB8B0 +4. \uBA39\uB294 \uC2DC\uC810\uC740 \uC8FC\uBBFC\uC774 \uACB0\uC815\uD569\uB2C8\uB2E4.", disabled: s.food < 2 ? "\uACF5\uB3D9 \uC2DD\uB7C9\uC774 \uBD80\uC871\uD569\uB2C8\uB2E4" : void 0 },
    { choice: "farm", label: "\uC55E\uC73C\uB85C\uC758 \uC2DD\uB7C9 \uC900\uBE44", cost: "\uACF5\uB3D9 \uBAA9\uC7AC 16\uAC1C", effect: "\uB18D\uC7A5 1\uACF3 \uC2E0\uC124 \xB7 \uC2E0\uB8B0 +4. \uB2F9\uC7A5 \uB07C\uB2C8\uB97C \uC8FC\uC9C0\uB294 \uC54A\uC73C\uBA70 \uC131\uC7A5\uACFC \uC8FC\uBBFC\uC758 \uC218\uD655\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.", disabled: wood(16) }
  ] : r.kind === "clothing" ? [
    { choice: "clothes", label: "\uC0C8 \uC637 \uAC74\uB124\uAE30", cost: "\uB9C8\uC744 \uC637 \uC7AC\uACE0 1\uAC1C", effect: "\uC637 \uC0C1\uD0DC 100 \xB7 \uC2E0\uB8B0 +4. \uC628\uAE30\uB294 \uB0A0\uC528\uC640 \uD65C\uB3D9\uC5D0 \uB530\uB77C \uC11C\uC11C\uD788 \uBCC0\uD569\uB2C8\uB2E4.", disabled: city2.goods.clothes < 1 ? "\uB9C8\uC744\uC5D0 \uC637 \uC7AC\uACE0\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4" : void 0 },
    { choice: "mend", label: "\uC637 \uAE30\uC6CC\uC8FC\uAE30", cost: "\uB9C8\uC744 \uC9C1\uBB3C \uC7AC\uACE0 1\uAC1C", effect: "\uC637 \uC0C1\uD0DC 65 \xB7 \uC2E0\uB8B0 +4. \uC0C8 \uC637\uBCF4\uB2E4 \uC801\uC740 \uC7AC\uB8CC\uB85C \uCD94\uC704\uC5D0 \uB300\uBE44\uD569\uB2C8\uB2E4.", disabled: city2.goods.cloth < 1 ? "\uB9C8\uC744\uC5D0 \uC9C1\uBB3C \uC7AC\uACE0\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4" : void 0 }
  ] : [
    { choice: "repair", label: "\uC9D1 \uC218\uB9AC\uD558\uAE30", cost: "\uACF5\uB3D9 \uBAA9\uC7AC 6\uAC1C", effect: "\uC9D1 \uB0B4\uAD6C\uB3C4 +40 (\uCD5C\uB300 100) \xB7 \uC2E0\uB8B0 +4. \uB3D9\uAC70\uC778\uB3C4 \uD568\uAED8 \uD61C\uD0DD\uC744 \uBC1B\uC2B5\uB2C8\uB2E4.", disabled: w.urban.buildings[home.id].condition >= 100 ? "\uC774\uBBF8 \uD2BC\uD2BC\uD55C \uC9D1\uC785\uB2C8\uB2E4" : wood(6) },
    { choice: "expand", label: "\uBC29 \uB298\uB9AC\uAE30", cost: "\uACF5\uB3D9 \uBAA9\uC7AC 8\uAC1C", effect: "\uC9D1 \uB2E8\uACC4 +1 \xB7 \uC815\uC6D0 +2\uBA85 \xB7 \uC2E0\uB8B0 +4. \uC0C8 \uC8FC\uBBFC\uC774 \uC989\uC2DC \uC0DD\uAE30\uC9C0\uB294 \uC54A\uC2B5\uB2C8\uB2E4.", disabled: home.level >= 4 ? "\uC774\uBBF8 \uCD5C\uB300 \uD06C\uAE30\uC758 \uC9D1\uC785\uB2C8\uB2E4" : wood(8) }
  ];
  options.push(
    { choice: "later", label: "\uC870\uAE08 \uB4A4\uC5D0 \uACB0\uC815", cost: "\uC790\uC6D0 \uC18C\uBAA8 \uC5C6\uC74C", effect: "\uAC8C\uC784 6\uC2DC\uAC04 \uB4A4 \uB2E4\uC2DC \uD45C\uC2DC\uD569\uB2C8\uB2E4. \uD55C \uBC88\uB9CC \uBBF8\uB8F0 \uC218 \uC788\uC2B5\uB2C8\uB2E4.", disabled: r.deferredUntil !== void 0 ? "\uC774\uBBF8 \uD55C \uBC88 \uBBF8\uB8EC \uBD80\uD0C1\uC785\uB2C8\uB2E4" : void 0 },
    { choice: "decline", label: "\uC774\uBC88\uC5D0\uB294 \uAC70\uC808", cost: "\uC790\uC6D0 \uC18C\uBAA8 \uC5C6\uC74C", effect: "\uC774\uBC88 \uBD80\uD0C1\uC744 \uC9C0\uC6D0 \uC5C6\uC774 \uB9C8\uCE69\uB2C8\uB2E4. \uB9C8\uC744\uC5D0 \uB300\uD55C \uC2E0\uB8B0\uB294 \uC720\uC9C0\uB429\uB2C8\uB2E4." }
  );
  return options;
}
function closeRequest(w, r, status, description2) {
  const n = w.npcs.find((n2) => n2.id === r.npcId);
  r.status = status;
  r.closedAt = w.tick;
  r.after = requestMetrics(w, n);
  const e = appendEvent(w, {
    kind: "request",
    actorId: n.id,
    importance: 50,
    causeId: r.lastEventId,
    description: description2,
    data: { requestId: r.id, phase: status, requestKind: r.kind, settlementId: r.settlementId, ...r.choice ? { choice: r.choice } : {}, hungerBefore: r.before.hunger, hungerAfter: r.after.hunger, trustBefore: r.before.trust, trustAfter: r.after.trust }
  });
  r.lastEventId = r.resultEventId = e.id;
  if (status === "completed" || status === "declined") remember(w, n, e);
}
function respondToRequest(w, id7, choice) {
  const r = w.requests.items.find((r2) => r2.id === id7);
  if (!r || !["open", "deferred"].includes(r.status)) throw new Error("\uBD80\uD0C1\uC774 \uC774\uBBF8 \uCC98\uB9AC\uB418\uC5C8\uAC70\uB098 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  if (!REQUEST_CHOICES.includes(choice)) throw new Error("\uBD80\uD0C1\uC758 \uC120\uD0DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
  const n = w.npcs.find((n2) => n2.id === r.npcId);
  if (!n.alive || n.settlementId !== r.settlementId || n.homeId !== r.homeId || isTravelling(w, n) || w.tick >= r.expiresAt) throw new Error("\uBD80\uD0C1\uC758 \uC0C1\uD669\uC774 \uBC14\uB00C\uC5C8\uC2B5\uB2C8\uB2E4. \uCD5C\uC2E0 \uC0C1\uD0DC\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
  const option = requestOptions(w, r).find((o) => o.choice === choice);
  if (!option || option.disabled) throw new Error(`\uBD80\uD0C1\uC744 \uC9C4\uD589\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4: ${option?.disabled ?? "\uC774 \uBD80\uD0C1\uC5D0 \uC5C6\uB294 \uC120\uD0DD"}`);
  if (!need(w, n, r.kind, true)) {
    closeRequest(w, r, "resolved", `${n.identity.name}\uC758 \uBD80\uD0C1\uC740 \uC8FC\uBBFC\uC758 \uC0DD\uD65C \uC18D\uC5D0\uC11C \uC774\uBBF8 \uD574\uACB0\uB418\uC5B4 \uC790\uC6D0\uC744 \uC0AC\uC6A9\uD558\uC9C0 \uC54A\uC558\uB2E4.`);
    return;
  }
  if (choice === "later") {
    r.status = "deferred";
    r.deferredUntil = w.tick + 36;
    const e2 = appendEvent(w, { kind: "request", actorId: n.id, importance: 35, causeId: r.lastEventId, description: `${n.identity.name}\uC758 \uBD80\uD0C1\uC744 \uAC8C\uC784 6\uC2DC\uAC04 \uB4A4 \uB2E4\uC2DC \uC0B4\uD3B4\uBCF4\uAE30\uB85C \uD588\uB2E4.`, data: { requestId: r.id, phase: "deferred", requestKind: r.kind } });
    r.lastEventId = e2.id;
    return;
  }
  const before = requestMetrics(w, n);
  if (choice === "decline") {
    r.before = before;
    r.choice = choice;
    closeRequest(w, r, "declined", `${n.identity.name}\uC758 \uBD80\uD0C1\uC5D0 \uC774\uBC88\uC5D0\uB294 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uAE30\uB85C \uD588\uB2E4. \uC790\uC6D0\uACFC \uC2E0\uB8B0\uB294 \uBCC0\uACBD\uD558\uC9C0 \uC54A\uC558\uB2E4.`);
    return;
  }
  const stock = stocks(w, r.settlementId), c = w.urban.cities.find((c2) => c2.settlementId === r.settlementId), home = w.buildings.find((b) => b.id === r.homeId);
  if (choice === "farm") {
    const b = buildHouse(w, w.civilization.settlements.find((v) => v.id === r.settlementId), "farm", true);
    if (!b) throw new Error("\uBD80\uD0C1\uC744 \uC9C4\uD589\uD560 \uC5F0\uACB0\uB41C \uBE48 \uB18D\uC7A5 \uBD80\uC9C0\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
    r.buildingId = b.id;
  }
  r.before = before;
  if (choice === "food") {
    stock.food -= 2;
    n.inventory.food += 2;
  }
  if (choice === "clothes" || choice === "mend") {
    const good = choice === "clothes" ? "clothes" : "cloth";
    c.goods[good]--;
    w.urban.ledger.consumed[good]++;
    w.living.people[n.id].clothing = choice === "clothes" ? 100 : 65;
  }
  if (choice === "repair" || choice === "expand") {
    const cost = choice === "repair" ? 6 : 8;
    stock.wood -= cost;
    w.economy.totals.investedWood += cost;
    if (choice === "repair") w.urban.buildings[home.id].condition = Math.min(100, w.urban.buildings[home.id].condition + 40);
    else home.level++;
    r.buildingId = home.id;
  }
  w.urban.citizens[n.id].trust = clamp(w.urban.citizens[n.id].trust + 4);
  r.followups = [];
  r.followupSince = w.tick;
  r.choice = choice;
  r.status = "observing";
  r.reviewAt = w.tick + 12;
  r.immediate = requestMetrics(w, n);
  const e = appendEvent(w, {
    kind: "request",
    actorId: n.id,
    locationId: r.buildingId,
    importance: 55,
    causeId: r.lastEventId,
    description: `${n.identity.name}\uC758 \uBD80\uD0C1\uC5D0 \u2018${option.label}\u2019\uB85C \uC751\uB2F5\uD588\uB2E4. ${option.cost}\uB97C \uC0AC\uC6A9\uD588\uB2E4.`,
    data: { requestId: r.id, phase: "supported", requestKind: r.kind, choice, cost: option.cost, trustBefore: r.before.trust, trustAfter: r.immediate.trust }
  });
  r.lastEventId = r.decisionEventId = e.id;
  remember(w, n, e);
  if (r.kind === "housing") for (const other of w.npcs.filter((p) => p.alive && p.id !== n.id && p.homeId === home.id)) {
    remember(w, other, e, `${n.identity.name}\uC774 \uBD80\uD0C1\uD55C \uC9D1 \uAC1C\uC120\uC73C\uB85C \uC6B0\uB9AC \uC9D1\uC758 \uC5EC\uAC74\uC774 \uB098\uC544\uC84C\uB2E4.`);
    changeRelationship(w, other, n.id, { trust: 2, affection: 1 }, e, "\uD568\uAED8 \uC0AC\uB294 \uC9D1\uC758 \uAC1C\uC120\uC744 \uC694\uCCAD\uD574 \uC900 \uC774\uC6C3\uC774\uB2E4.");
  }
}
function updateRequests(w) {
  const state = w.requests;
  updateFollowups(w);
  for (const r of state.items.filter(activeRequest)) {
    const n2 = w.npcs.find((n3) => n3.id === r.npcId);
    if (!n2.alive || n2.settlementId !== r.settlementId || n2.homeId !== r.homeId || isTravelling(w, n2)) {
      closeRequest(w, r, "cancelled", `${n2.identity.name}\uC758 \uC0DD\uC560\xB7\uAC70\uC8FC \uC0C1\uD669\uC774 \uBC14\uB00C\uC5B4 \uBD80\uD0C1 \uAD00\uCC30\uC744 \uB9C8\uCCE4\uB2E4.`);
      continue;
    }
    if (r.status === "observing") {
      if (w.tick >= r.reviewAt) closeRequest(w, r, "completed", `${n2.identity.name}\uC744 \uC9C0\uC6D0\uD55C \uB4A4 \uAC8C\uC784 2\uC2DC\uAC04\uC758 \uC0DD\uD65C\uC744 \uAD00\uCC30\uD588\uB2E4. \uC218\uCE58\uB294 \uADF8\uB3D9\uC548\uC758 \uD65C\uB3D9\uACFC \uB0A0\uC528\uAC00 \uD568\uAED8 \uBC18\uC601\uB41C \uACB0\uACFC\uB2E4.`);
      continue;
    }
    if (w.tick >= r.expiresAt) {
      closeRequest(w, r, "expired", `${n2.identity.name}\uC758 \uBD80\uD0C1\uC744 \uB354 \uAE30\uB2E4\uB9AC\uC9C0 \uC54A\uACE0 \uAE30\uB85D\uC5D0 \uB0A8\uACBC\uB2E4. \uC9C0\uC6D0 \uC790\uC6D0\uC740 \uC0AC\uC6A9\uD558\uC9C0 \uC54A\uC558\uB2E4.`);
      continue;
    }
    if (w.tick > r.createdAt && !need(w, n2, r.kind, true)) {
      closeRequest(w, r, "resolved", `${n2.identity.name}\uC774 \uC0DD\uD65C\uC744 \uC774\uC5B4\uAC00\uBA70 \uBD80\uD0C1\uC758 \uC5B4\uB824\uC6C0\uC744 \uC2A4\uC2A4\uB85C \uD574\uACB0\uD588\uB2E4.`);
      continue;
    }
    if (r.status === "deferred" && w.tick >= r.deferredUntil) r.status = "open";
  }
  if (w.tick % 12 !== 0 || w.tick - state.lastOffered < 36 || state.items.filter(activeRequest).length >= 2) return;
  const day = dayOf(w.tick);
  if (state.offeredDay !== day) {
    state.offeredDay = day;
    state.offeredToday = 0;
  }
  if (state.offeredToday >= 2) return;
  for (const [key2, until] of Object.entries(state.cooldowns)) if (until <= w.tick) delete state.cooldowns[key2];
  const candidates2 = w.npcs.filter((n2) => n2.alive && !state.items.some((r) => activeRequest(r) && r.npcId === n2.id)).flatMap((n2) => ["food", "clothing", "housing"].filter((kind2) => !state.cooldowns[`${n2.id}:${kind2}`] && need(w, n2, kind2)).map((kind2) => ({ n: n2, kind: kind2, urgency: kind2 === "food" ? n2.needs.hunger + 20 : kind2 === "clothing" ? 100 - w.living.people[n2.id].body.warmth : 100 - w.urban.buildings[n2.homeId].condition }))).sort((a, b) => b.urgency - a.urgency || a.n.id.localeCompare(b.n.id));
  const pick = candidates2[0];
  if (!pick) return;
  if (state.items.length >= 32 && !state.items.some((r) => !activeRequest(r) && !pendingFollowup(r))) return;
  const { n, kind } = pick, id7 = `request-${w.nextId++}`, before = requestMetrics(w, n), context = requestContext(w, n, kind);
  const repeats = state.items.filter((r) => r.npcId === n.id && r.kind === kind && w.tick - r.createdAt <= 12 * 144).length;
  const e = appendEvent(w, { kind: "request", actorId: n.id, locationId: n.homeId, importance: 50, description: `${n.identity.name}\uC758 \uBD80\uD0C1: ${REQUEST_LABELS[kind]}`, data: { requestId: id7, phase: "offered", requestKind: kind, ...before, evidence: context.evidence, conditions: context.facts, hunger: before.hunger, food: before.food, clothing: before.clothing, warmth: before.warmth, condition: before.condition, capacity: before.capacity } });
  if (state.items.length >= 32) state.items.splice(state.items.findIndex((r) => !activeRequest(r) && !pendingFollowup(r)), 1);
  state.items.push({ id: id7, npcId: n.id, settlementId: n.settlementId, homeId: n.homeId, kind, status: "open", createdAt: w.tick, expiresAt: w.tick + 432, sourceEventId: e.id, lastEventId: e.id, before, context });
  state.cooldowns[`${n.id}:${kind}`] = w.tick + 432 * Math.min(3, repeats + 1);
  state.lastOffered = w.tick;
  state.offeredToday++;
}

// ../../../..v0.21-source/src/sim/appearance.ts
var COLORS = ["#e5a85f", "#d98175", "#76b4a3", "#a893c4", "#739eb7", "#d1b154", "#91a767", "#c6859f", "#71918d", "#b19a83", "#bb8b57", "#95a2c7"];
function appearance(n) {
  return n.profile?.appearance ?? { skin: "#ebcba4", hair: "#5d5345", outfit: COLORS[Number(n.id.replace("npc", "")) % COLORS.length] ?? COLORS[0], hairstyle: "short", accessory: "none" };
}

// ../../../..v0.21-source/src/sim/attraction.ts
var round = (v) => Math.round(v * 10) / 10;
var bounded = (v, min, max) => Math.max(min, Math.min(max, v));
var signed = (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
function charmProfile(p, t) {
  return [
    { label: "\uB2E4\uC815\uD55C \uBC30\uB824", strength: p.empathy, taste: p.empathy },
    { label: "\uAFB8\uC900\uD55C \uC131\uC2E4\uD568", strength: p.diligence, taste: p.diligence },
    { label: "\uD3B8\uC548\uD55C \uCE5C\uD654\uB825", strength: p.sociability, taste: p.sociability },
    { label: "\uD765\uBBF8\uB85C\uC6B4 \uD638\uAE30\uC2EC", strength: p.curiosity, taste: p.curiosity },
    { label: "\uCC28\uBD84\uD55C \uD0DC\uB3C4", strength: 100 - p.aggression, taste: 100 - p.aggression },
    { label: "\uB109\uB109\uD55C \uB9C8\uC74C", strength: 100 - p.greed, taste: p.empathy },
    { label: "\uB048\uAE30 \uC788\uB294 \uACBD\uCCAD", strength: t.patience, taste: t.patience },
    { label: "\uBC1D\uC740 \uB099\uAD00\uC131", strength: t.optimism, taste: t.optimism },
    { label: "\uC54C\uB730\uD55C \uC0DD\uD65C\uB825", strength: t.frugality, taste: t.frugality },
    { label: "\uC790\uB9BD\uC801\uC778 \uD0DC\uB3C4", strength: t.independence, taste: t.independence }
  ];
}
function charmPoints(p, t) {
  return charmProfile(p, t).sort((a, b) => b.strength - a.strength).slice(0, 3);
}
function attraction(w, observer, target) {
  const p = observer.personality, q = target.personality;
  const own = w.living.people[observer.id], other = w.living.people[target.id];
  const factors = [];
  const add = (key2, label, value2, reason) => factors.push({ key: key2, label, value: round(value2), reason });
  const sameJob = observer.occupation !== "none" && observer.occupation === target.occupation;
  add(
    "occupation",
    "\uC9C1\uC5C5",
    target.occupation === "none" ? 0 : sameJob ? 1 + p.diligence / 100 : p.curiosity / 100,
    target.occupation === "none" ? "\uC77C\uD558\uC9C0 \uC54A\uB294 \uC0C1\uD0DC\uB294 \uC9C1\uC5C5 \uAC00\uC0B0 \uC5C6\uC74C" : sameJob ? `${OCCUPATIONS[target.occupation]} \uB3D9\uB8CC\uC758 \uACF5\uAC10\uB300` : `${OCCUPATIONS[target.occupation]}\uC758 \uB2E4\uB978 \uC77C\uC0C1\uC5D0 \uB300\uD55C \uD638\uAE30\uC2EC`
  );
  const gap = Math.abs(observer.identity.age - target.identity.age);
  add("age", "\uB098\uC774", Math.max(0, 1 - gap / 30) * (1 - p.curiosity / 200), `${gap}\uC138 \uCC28\uC774 \xB7 \uAC00\uAE4C\uC6B4 \uC0DD\uC560 \uACBD\uD5D8\uC758 \uACF5\uAC10\uB300`);
  add(
    "health",
    "\uAC74\uAC15",
    target.needs.health / 100 * (100 - other.body.pain) / 100 * p.sociability / 100 + (1 - target.needs.health / 100) * p.empathy / 100,
    `\uAC74\uAC15 ${Math.round(target.needs.health)} \xB7 \uD65C\uB825\uC5D0 \uB04C\uB9BC\uACFC \uC544\uD508 \uC774\uC6C3\uC5D0 \uB300\uD55C \uBC30\uB824`
  );
  const a = appearance(observer), b = appearance(target);
  const similarity = (Number(a.hairstyle === b.hairstyle) + Number(a.accessory === b.accessory) + Number(a.outfit.toLowerCase() === b.outfit.toLowerCase())) / 3;
  const style = similarity * (1 - p.curiosity / 100) + (1 - similarity) * p.curiosity / 100;
  add(
    "appearance",
    "\uC678\uBAA8 \uCDE8\uD5A5",
    style + (other.body.cleanliness - 50) / 100,
    `${p.curiosity >= 50 ? "\uC0C8\uB85C\uC6B4" : "\uC775\uC219\uD55C"} \uBA38\uB9AC\xB7\uC18C\uD488\xB7\uC637\uCC28\uB9BC \uC120\uD638 \xB7 \uCCAD\uACB0 ${Math.round(other.body.cleanliness)}`
  );
  const assets = target.wealth + target.inventory.food * 2 + target.inventory.wood * 2;
  add(
    "assets",
    "\uC790\uC0B0",
    Math.min(1, assets / 200) * (p.greed / 100 + own.traits.frugality / 100),
    `\uCF54\uC778 ${target.wealth} \xB7 \uC2DD\uB7C9 ${target.inventory.food} \xB7 \uBAA9\uC7AC ${target.inventory.wood} \xB7 \uC0DD\uD65C \uC5EC\uC720\uC5D0 \uB300\uD55C \uAD00\uC2EC`
  );
  const mismatch = Math.abs(p.sociability - q.sociability) / 100 * own.traits.independence / 100;
  const friction = q.aggression / 100 * (1 - own.traits.patience / 200) * 3 + q.greed / 100 * p.empathy / 100;
  add(
    "personality",
    "\uC131\uACA9 \uAD81\uD569",
    (q.empathy - 50) / 50 * (0.5 + p.empathy / 100) - friction - mismatch,
    "\uBC30\uB824\uC5D0 \uB300\uD55C \uD638\uC751 \xB7 \uACF5\uACA9\uC131\xB7\uD0D0\uC695\uACFC \uB300\uD654 \uC18D\uB3C4 \uCC28\uC774\uC758 \uB9C8\uCC30"
  );
  const targetCharms = charmPoints(q, other.traits);
  const tastes = new Map(charmProfile(p, own.traits).map((c) => [c.label, c.taste]));
  const charms = targetCharms.map((c) => ({
    label: c.label,
    strength: c.strength,
    value: round(c.strength / 100 * (tastes.get(c.label) ?? 0) / 100)
  }));
  add("charm", "\uB9E4\uB825 \uD3EC\uC778\uD2B8", charms.reduce((s, c) => s + c.value, 0), charms.map((c) => `${c.label} ${signed(c.value)}`).join(" \xB7 "));
  const value = round(bounded(factors.reduce((s, f) => s + f.value, 0), -8, 12));
  const conduct = (q.empathy + other.traits.patience - q.aggression - q.greed) / 200;
  const changes = {
    familiarity: 5,
    affection: round(bounded(1 + value * 0.35, -2, 5)),
    trust: round(bounded(conduct, -1, 1)),
    resentment: round(Math.max(0, -factors.find((f) => f.key === "personality").value - 2) * 0.3)
  };
  return {
    value,
    factors,
    charms,
    changes,
    reason: factors.map((f) => `${f.label} ${signed(f.value)}`).join(" \xB7 ")
  };
}

// ../../../..v0.21-source/src/sim/character-schema.ts
import { z as z4 } from "zod";
var score3 = z4.number().int().min(0).max(100);
var appearanceSchema = z4.object({
  skin: z4.string().regex(/^#[0-9a-fA-F]{6}$/),
  hair: z4.string().regex(/^#[0-9a-fA-F]{6}$/),
  outfit: z4.string().regex(/^#[0-9a-fA-F]{6}$/),
  hairstyle: z4.enum(["short", "long", "curly", "bald", "bob", "ponytail", "bun", "braid", "spiky"]),
  accent: z4.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  clothing: z4.enum(["plain", "stripes", "overalls", "vest", "dress"]).optional(),
  expression: z4.enum(["smile", "calm", "bright"]).optional(),
  faceMark: z4.enum(["none", "freckles", "blush", "beard"]).optional(),
  backdrop: z4.enum(["meadow", "sunset", "night"]).optional(),
  accessory: z4.enum(["none", "glasses", "hat", "scarf", "earrings", "flower", "headphones"])
}).strict();
var characterSchema = z4.object({
  name: z4.string().trim().min(1).max(40),
  age: z4.number().int().min(0).max(80),
  background: z4.string().trim().max(300),
  homeId: z4.string().min(1).max(100),
  occupation: z4.enum(Object.keys(OCCUPATIONS)),
  goal: z4.enum(["secure_food", "help_neighbor", "earn_wealth", "expand_farm", "secure_storage", "build_home", "make_friend"]),
  appearance: appearanceSchema,
  traits: traitsSchema.optional(),
  desires: desiresSchema.optional(),
  body: bodySchema.optional(),
  needs: z4.object({ hunger: score3, thirst: score3, fatigue: score3, health: score3.min(1), safety: score3, social: score3 }).strict(),
  personality: z4.object({ diligence: score3, greed: score3, sociability: score3, aggression: score3, empathy: score3, curiosity: score3 }).strict(),
  skill: score3,
  education: score3,
  skills: z4.object({ field: score3, quarry: score3, mine: score3, mill: score3, smith: score3 }).strict(),
  food: z4.number().int().min(0).max(100),
  wood: z4.number().int().min(0).max(100),
  wealth: z4.number().int().min(0).max(1e3),
  greetId: z4.string().min(1).max(100).optional()
}).strict();
var profileSchema = z4.object({ commandId: z4.string().uuid().optional(), background: z4.string().max(300), appearance: appearanceSchema, createdAt: z4.number().int().nonnegative(), arrivalEventId: z4.string().min(1).max(100) }).strict();

// ../../../..v0.21-source/src/sim/characters.ts
function availableHomes(w) {
  const occupied = /* @__PURE__ */ new Map();
  for (const n of w.npcs) if (n.alive) occupied.set(n.homeId, (occupied.get(n.homeId) ?? 0) + 1);
  for (const j of w.civilization.journeys) if (j.kind === "migration" && j.homeId) occupied.set(j.homeId, (occupied.get(j.homeId) ?? 0) + j.npcIds.length);
  return w.buildings.filter((b) => b.kind === "home").map((b) => ({ home: b, vacant: Math.max(0, capacity(b) - (occupied.get(b.id) ?? 0)) }));
}
function createCharacter(w, input) {
  const parsed = characterSchema.safeParse(input);
  if (!parsed.success) throw new Error(`\uCE90\uB9AD\uD130 \uC124\uC815\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694: ${parsed.error.issues[0].path.join(".")}`);
  const a = parsed.data;
  if (w.npcs.filter((n2) => n2.alive).length >= MAX_POPULATION || w.npcs.length >= 3e4) throw new Error("\uC8FC\uBBFC \uC218 \uC0C1\uD55C\uC5D0 \uB3C4\uB2EC\uD588\uC2B5\uB2C8\uB2E4.");
  const slot = availableHomes(w).find((b) => b.home.id === a.homeId);
  if (!slot?.vacant) throw new Error("\uC120\uD0DD\uD55C \uC9D1\uC5D0 \uBE48\uC790\uB9AC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uB2E4\uB978 \uC9D1\uC744 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.");
  const home = slot.home;
  const other = a.greetId ? w.npcs.find((n2) => n2.id === a.greetId && n2.alive && n2.settlementId === home.settlementId && !isTravelling(w, n2)) : void 0;
  if (a.greetId && !other) throw new Error("\uC778\uC0AC\uD560 \uC8FC\uBBFC\uC774 \uAC19\uC740 \uC815\uCC29\uC9C0\uC5D0 \uC788\uB294\uC9C0 \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
  const path = other ? findPath(w, home.position, other.position) : void 0;
  if (other && path === null) throw new Error("\uC778\uC0AC\uD560 \uC8FC\uBBFC\uC5D0\uAC8C \uAC08 \uC218 \uC788\uB294 \uAE38\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
  let id7;
  do {
    id7 = `npc-created-${w.nextId++}`;
  } while (w.npcs.some((n2) => n2.id === id7));
  const n = {
    id: id7,
    identity: { name: a.name, age: a.age },
    position: { ...home.position },
    homeId: home.id,
    settlementId: home.settlementId,
    life: { bornTick: w.tick - a.age * YEAR_TICKS, parentIds: [], generation: 0, skill: a.skill, lastBirth: w.tick, lastMove: w.tick, estateSettled: false },
    occupation: a.occupation,
    alive: true,
    needs: { ...a.needs },
    personality: { ...a.personality },
    inventory: { food: a.food, wood: a.wood },
    wealth: a.wealth,
    relationships: [],
    memories: [],
    goals: [],
    decision: { reason: "\uC0C8\uB85C\uC6B4 \uC774\uC6C3\uC73C\uB85C \uC774\uACF3\uC5D0\uC11C \uC0B6\uC744 \uC2DC\uC791\uD569\uB2C8\uB2E4.", candidates: [], tick: w.tick },
    dailyTaken: 0,
    lastTalk: -100,
    knownRumors: []
  };
  w.npcs.push(n);
  indexPeople(w);
  w.living.people[id7] = { ...newLivingPerson(n), ...a.traits ? { traits: { ...a.traits } } : {}, ...a.desires ? { desires: { ...a.desires } } : {}, ...a.body ? { body: { ...a.body } } : {} };
  w.urban.citizens[id7] = { ...newCitizen(n), education: a.education, skills: { ...a.skills } };
  syncEmployment(w, n, false);
  if (a.age < 18) delete n.previousOccupation;
  const assets = w.economy.arrivals ??= { food: 0, wood: 0, coins: 0 };
  assets.food += a.food;
  assets.wood += a.wood;
  assets.coins += a.wealth;
  const event2 = socialEvent(w, {
    kind: "arrival",
    actorId: id7,
    locationId: home.id,
    importance: 60,
    description: `${a.name}\uC774 ${home.name}\uC5D0 \uC785\uC8FC\uD588\uB2E4. \uC2DC\uC791 \uC790\uC0B0: \uC2DD\uB7C9 ${a.food}\uAC1C, \uBAA9\uC7AC ${a.wood}\uAC1C, ${a.wealth}\uCF54\uC778.`,
    data: { createdCharacter: true, food: a.food, wood: a.wood, coins: a.wealth }
  });
  n.profile = { background: a.background, appearance: { ...a.appearance }, createdAt: w.tick, arrivalEventId: event2.id };
  n.goals.push({ id: `g${w.nextId++}`, kind: a.goal, reason: `\uC0C8 \uC0B6\uC758 \uBC14\uB78C: ${GOAL_LABELS[a.goal]}`, createdAt: w.tick, sourceEventId: event2.id });
  if (other && path) {
    n.currentAction = { kind: "Talk", score: 100, reason: `${other.identity.name}\uC5D0\uAC8C \uCCAB \uC778\uC0AC\uB97C \uAC74\uB124\uB7EC \uAC04\uB2E4.`, target: { ...other.position }, targetId: other.id, path, progress: 0, duration: 2, evidence: [event2.id] };
    n.decision.reason = n.currentAction.reason;
  }
  return n;
}

// ../../../..v0.21-source/src/sim/history.ts
var HISTORY_KINDS = {
  population: ["birth", "death", "family", "inheritance", "migration", "settlement"],
  economy: ["request", "inheritance", "trade", "industry", "freight", "tax", "public_service", "construction", "scarcity"],
  ecology: ["ecology", "weather", "scarcity", "health"],
  society: ["request", "council", "diplomacy", "policy", "share", "theft", "migration"]
};
function historyContext(events, topic) {
  const selected = events.filter((e) => HISTORY_KINDS[topic].includes(e.kind) && (e.kind !== "health" || e.importance >= 45)).slice(-8);
  return { topic, cards: selected.map((e) => ({ id: e.id, tick: e.tick, text: e.description.slice(0, 800), kind: e.kind, ...e.causeId ? { causeId: e.causeId } : {} })) };
}
function validateHistorySelection(input, context) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).join() !== "evidence") return null;
  const ids = input.evidence;
  if (!Array.isArray(ids) || !ids.length || ids.length > 3 || new Set(ids).size !== ids.length || ids.some((id7) => typeof id7 !== "string" || !context.cards.some((c) => c.id === id7))) return null;
  return ids;
}

// ../../../..v0.21-source/src/sim/life.ts
function related(w, a, b) {
  const ancestors = (n) => {
    const ids = /* @__PURE__ */ new Set([n.id]), queue = [...n.life.parentIds];
    for (let i = 0; i < queue.length; i++) if (!ids.has(queue[i])) {
      ids.add(queue[i]);
      queue.push(...w.npcs.find((p) => p.id === queue[i])?.life.parentIds ?? []);
    }
    return ids;
  };
  const aa = ancestors(a);
  return [...ancestors(b)].some((id7) => aa.has(id7));
}
function formFamily(w, a, b) {
  if (!a.alive || !b.alive || a.id === b.id || a.life.partnerId || b.life.partnerId || a.identity.age < 18 || b.identity.age < 18 || a.settlementId !== b.settlementId || related(w, a, b) || isTravelling(w, a) || isTravelling(w, b)) return false;
  const bond2 = relationship(a, b.id), reverse = relationship(b, a.id);
  if (bond2.trust < 40 || reverse.trust < 40 || bond2.affection < 10 || reverse.affection < 10) return false;
  const occupancy = /* @__PURE__ */ new Map();
  for (const n of w.npcs) if (n.alive && n.id !== a.id && n.id !== b.id) occupancy.set(n.homeId, (occupancy.get(n.homeId) ?? 0) + 1);
  const home = w.buildings.filter((h) => h.kind === "home" && h.settlementId === a.settlementId).sort((h, j) => (occupancy.get(h.id) ?? 0) - (occupancy.get(j.id) ?? 0)).find((h) => (occupancy.get(h.id) ?? 0) + 2 <= capacity(h));
  if (!home) return false;
  a.life.partnerId = b.id;
  b.life.partnerId = a.id;
  a.homeId = b.homeId = home.id;
  a.currentAction = b.currentAction = void 0;
  home.ownerIds = [.../* @__PURE__ */ new Set([...home.ownerIds ?? [], a.id, b.id])];
  bond2.family = reverse.family = true;
  const e = socialEvent(w, { kind: "family", actorId: a.id, targetId: b.id, locationId: home.id, importance: 60, description: `${a.identity.name}\uACFC ${b.identity.name}\uC774 \uC11C\uB85C\uC758 \uC2E0\uB8B0\uC640 \uC560\uC815\uC744 \uBC14\uD0D5\uC73C\uB85C \uAC00\uC871\uC744 \uC774\uB8E8\uC5C8\uB2E4.`, data: { homeId: home.id, trust: bond2.trust, affection: bond2.affection, reverseTrust: reverse.trust, reverseAffection: reverse.affection, evidence: [.../* @__PURE__ */ new Set([...bond2.evidence.slice(-4), ...reverse.evidence.slice(-4)])] } });
  bond2.evidence.push(e.id);
  reverse.evidence.push(e.id);
  return true;
}
function giveBirth(w, a, b) {
  if (!a.alive || !b.alive || a.life.partnerId !== b.id || b.life.partnerId !== a.id || a.homeId !== b.homeId || a.settlementId !== b.settlementId || [a, b].some((n) => n.identity.age < 18 || n.identity.age > 45 || n.needs.health < 65 || n.needs.hunger > 60 || w.tick - n.life.lastBirth < YEAR_TICKS * 2 || isTravelling(w, n))) return;
  if (w.npcs.filter((n) => n.alive).length >= MAX_POPULATION || w.npcs.length >= 3e4) return;
  const home = w.buildings.find((h) => h.id === a.homeId), family = w.npcs.filter((n) => n.alive && n.homeId === home.id), stock = stocks(w, a.settlementId);
  if (family.length >= capacity(home) || stock.food + a.inventory.food + b.inventory.food < (family.length + 1) * 4) return;
  let cost = 2;
  for (const inv of [a.inventory, b.inventory, stock]) {
    const take = Math.min(cost, inv.food);
    inv.food -= take;
    cost -= take;
  }
  w.economy.totals.consumedFood += 2;
  const id7 = `npc-born-${w.nextId++}`;
  const personality = { ...a.personality };
  for (const key2 of Object.keys(personality)) personality[key2] = (a.personality[key2] + b.personality[key2]) / 2;
  const child = {
    id: id7,
    identity: { name: `\uC0C8\uBD04${w.nextId}`, age: 0 },
    position: { ...home.position },
    homeId: home.id,
    settlementId: a.settlementId,
    life: { bornTick: w.tick, parentIds: [a.id, b.id], generation: Math.max(a.life.generation, b.life.generation) + 1, skill: 0, lastBirth: w.tick, lastMove: w.tick, estateSettled: false },
    occupation: "none",
    alive: true,
    needs: { hunger: 10, thirst: 0, fatigue: 0, health: 100, safety: 90, social: 80 },
    personality,
    inventory: { food: 0, wood: 0 },
    wealth: 0,
    relationships: [],
    memories: [],
    goals: [],
    decision: { reason: "\uAC00\uC871\uC758 \uB3CC\uBD04\uC744 \uBC1B\uC73C\uBA70 \uC790\uB780\uB2E4.", candidates: [], tick: w.tick },
    dailyTaken: 0,
    lastTalk: -100,
    knownRumors: []
  };
  w.npcs.push(child);
  w.living.people[child.id] = newLivingPerson(child);
  for (const key2 of Object.keys(w.living.people[child.id].traits)) w.living.people[child.id].traits[key2] = (w.living.people[a.id].traits[key2] + w.living.people[b.id].traits[key2]) / 2;
  w.urban.citizens[child.id] = newCitizen(child);
  a.life.lastBirth = b.life.lastBirth = w.tick;
  const familyEvent = [...relationship(a, b.id).evidence].reverse().find((id8) => eventById(w, id8)?.kind === "family");
  const e = socialEvent(w, { kind: "birth", causeId: familyEvent, actorId: child.id, participants: [child.id, a.id, b.id], locationId: home.id, importance: 60, description: `${a.identity.name}\uACFC ${b.identity.name}\uC758 \uAC00\uC871\uC5D0 ${child.identity.name}\uC774 \uD0DC\uC5B4\uB0AC\uB2E4.`, data: { parents: [a.id, b.id], generation: child.life.generation, consumedFood: 2 } });
  child.life.birthEventId = e.id;
  for (const parent of [a, b]) {
    const r = relationship(parent, child.id), reverse = relationship(child, parent.id);
    r.family = reverse.family = true;
    r.trust = reverse.trust = 80;
    r.affection = reverse.affection = 70;
    r.evidence.push(e.id);
    reverse.evidence.push(e.id);
  }
  return child;
}
function careForChild(w, n) {
  if (n.identity.age >= 18 || isTravelling(w, n)) return false;
  const caregivers = w.npcs.filter((p) => p.alive && p.identity.age >= 18 && p.homeId === n.homeId && !isTravelling(w, p));
  const home = w.buildings.find((h) => h.id === n.homeId);
  const route = findPath(w, n.position, home.position);
  if (route?.length) n.position = { ...route[0] };
  n.currentAction = void 0;
  if (!route || route.length > 1) return true;
  if (caregivers.length) {
    n.needs.thirst = clamp(n.needs.thirst - 2);
    n.needs.fatigue = clamp(n.needs.fatigue - 2);
    n.needs.social = clamp(n.needs.social + 0.5);
    if (n.needs.hunger > 38) {
      const donor = caregivers.find((p) => p.inventory.food > 1), stock = stocks(w, n.settlementId), own = n.inventory.food > 0;
      const inventory = own ? n.inventory : donor?.inventory ?? stock;
      if (inventory.food > 0) {
        inventory.food--;
        w.economy.totals.consumedFood++;
        n.needs.hunger = clamp(n.needs.hunger - 38);
        appendEvent(w, { kind: "consumption", actorId: n.id, targetId: donor?.id, causeId: n.life.birthEventId, importance: 20, description: `${n.identity.name}\uC774 \uAC00\uC871\uC758 \uB3CC\uBD04\uC73C\uB85C \uC2DD\uB7C9 1\uAC1C\uB97C \uBA39\uC5C8\uB2E4.`, data: { amount: 1, resource: "food", caregiver: donor?.id ?? caregivers[0].id } });
      }
    }
  }
  n.decision = { reason: caregivers.length ? "\uAC19\uC740 \uC9D1\uC758 \uC5B4\uB978\uC774 \uC2DD\uC0AC\xB7\uBB3C\xB7\uD734\uC2DD\uC744 \uB3CC\uBCF8\uB2E4." : "\uD568\uAED8 \uC0AC\uB294 \uBCF4\uD638\uC790\uAC00 \uC5C6\uC5B4 \uB3CC\uBD04\uC774 \uD544\uC694\uD558\uB2E4.", candidates: [], tick: w.tick };
  return true;
}
function settleEstate(w, n, causeId) {
  if (n.life.estateSettled) return;
  n.life.estateSettled = true;
  const children = w.npcs.filter((p) => p.alive && p.life.parentIds.includes(n.id));
  const partner = w.npcs.find((p) => p.alive && p.id === n.life.partnerId);
  const heirs = [...children, ...partner ? [partner] : []].sort((a, b) => a.id.localeCompare(b.id));
  const recipient = heirs[0];
  for (const loan of w.loans.filter((l) => l.status !== "repaid" && (l.borrowerId === n.id || l.lenderId === n.id))) {
    if (loan.borrowerId === n.id) {
      const lender = w.npcs.find((p) => p.id === loan.lenderId), paid = Math.min(n.inventory.food, loan.remaining), forgiven = loan.remaining - paid;
      n.inventory.food -= paid;
      (lender.alive ? lender.inventory : stocks(w, lender.settlementId)).food += paid;
      loan.remaining = 0;
      loan.status = "repaid";
      appendEvent(w, { kind: "inheritance", actorId: n.id, targetId: lender.id, causeId, importance: 45, description: `\uC720\uC0B0\uC5D0\uC11C \uC2DD\uB7C9 \uCC44\uBB34 ${paid}\uAC1C\uB97C \uC0C1\uD658\uD558\uACE0 \uB0A8\uC740 ${forgiven}\uAC1C\uB294 \uC0AC\uB9DD\uC73C\uB85C \uC885\uACB0\uD588\uB2E4.`, data: { loanId: loan.id, paid, forgiven } });
    } else if (recipient && recipient.id !== loan.borrowerId) loan.lenderId = recipient.id;
    else {
      loan.remaining = 0;
      loan.status = "repaid";
    }
  }
  const food = n.inventory.food, wood = n.inventory.wood, coins = n.wealth;
  if (heirs.length) {
    for (const [i, heir] of heirs.entries()) {
      heir.inventory.food += Math.floor(food / heirs.length) + (i < food % heirs.length ? 1 : 0);
      heir.inventory.wood += Math.floor(wood / heirs.length) + (i < wood % heirs.length ? 1 : 0);
      heir.wealth += Math.floor(coins / heirs.length) + (i < coins % heirs.length ? 1 : 0);
    }
  } else {
    const stock = stocks(w, n.settlementId);
    stock.food += food;
    stock.wood += wood;
    market(w, n.settlementId).coins += coins;
  }
  n.inventory = { food: 0, wood: 0 };
  n.wealth = 0;
  for (const b of w.buildings) if (b.ownerIds?.includes(n.id)) b.ownerIds = [.../* @__PURE__ */ new Set([...b.ownerIds.filter((id7) => id7 !== n.id), ...heirs.map((h) => h.id)])];
  appendEvent(w, { kind: "inheritance", actorId: n.id, participants: [n.id, ...heirs.map((h) => h.id)], causeId, importance: 60, description: `${n.identity.name}\uC758 \uC7AC\uC0B0\uACFC \uC8FC\uD0DD \uC18C\uC720\uAD8C\uC744 ${heirs.length ? heirs.map((h) => h.identity.name).join(", ") : "\uB9C8\uC744 \uACF5\uB3D9\uCCB4"}\uC5D0 \uACC4\uC2B9\uD588\uB2E4.`, data: { food, wood, coins, heirs: heirs.map((h) => h.id) } });
  if (partner) delete partner.life.partnerId;
  delete n.life.partnerId;
}
function die(w, n, reason) {
  if (!n.alive) return;
  for (const e2 of w.urban.enterprises) e2.workers = e2.workers.filter((id7) => id7 !== n.id);
  delete w.urban.citizens[n.id].employer;
  n.alive = false;
  n.needs.health = 0;
  delete n.currentAction;
  n.life.deathTick = w.tick;
  w.stats.deaths++;
  const e = socialEvent(w, { kind: "death", actorId: n.id, causeId: reason === "illness" ? w.urban.citizens[n.id].healthEventId : void 0, participants: [n.id, ...w.npcs.filter((p) => p.alive && (p.life.parentIds.includes(n.id) || p.id === n.life.partnerId)).map((p) => p.id)], importance: 100, description: `${n.identity.name}\uC774 ${reason === "age" ? "\uB178\uD654" : reason === "illness" ? "\uC9C8\uBCD1\xB7\uBD80\uC0C1\uACFC \uAC74\uAC15 \uC545\uD654" : "\uC0DD\uC874 \uC790\uC6D0 \uBD80\uC871"}\uB85C ${n.identity.age}\uC138\uC5D0 \uC138\uC0C1\uC744 \uB5A0\uB0AC\uB2E4.`, data: { reason, disease: w.urban.citizens[n.id].disease, injury: w.urban.citizens[n.id].injury, age: n.identity.age, hunger: n.needs.hunger, thirst: n.needs.thirst, fatigue: n.needs.fatigue, food: n.inventory.food, storageFood: stocks(w, n.settlementId).food, weather: w.weather } });
  n.life.deathEventId = e.id;
  settleEstate(w, n, e.id);
}
function lifeDay(w) {
  for (const n of [...w.npcs]) {
    if (!n.alive) continue;
    const previous = n.identity.age;
    n.identity.age = Math.max(0, Math.floor((w.tick - n.life.bornTick) / YEAR_TICKS));
    if (n.identity.age >= 85) {
      die(w, n, "age");
      continue;
    }
    if (n.identity.age >= 65) n.needs.health = Math.max(1, n.needs.health - (n.identity.age - 64) * 0.1);
    if (previous < 18 && n.identity.age >= 18) {
      const mentor = w.npcs.filter((p) => p.alive && n.life.parentIds.includes(p.id)).sort((a, b) => b.life.skill - a.life.skill)[0];
      n.occupation = mentor?.previousOccupation ?? mentor?.occupation ?? "none";
      delete n.previousOccupation;
      socialEvent(w, { kind: "coming_of_age", actorId: n.id, targetId: mentor?.id, importance: 60, description: `${n.identity.name}\uC774 \uC131\uC778\uC774 \uB418\uC5B4 ${n.occupation === "none" ? "\uC77C\uC790\uB9AC\uB97C \uCC3E\uAE30 \uC2DC\uC791\uD55C\uB2E4" : "\uBC30\uC6B4 \uAE30\uC220\uB85C \uC77C\uC744 \uC2DC\uC791\uD55C\uB2E4"}.`, data: { skill: n.life.skill, occupation: n.occupation }, causeId: n.life.birthEventId });
    }
    syncEmployment(w, n);
    if (n.identity.age < 18) {
      const mentor = w.npcs.filter((p) => p.alive && p.homeId === n.homeId && p.identity.age >= 18).sort((a, b) => b.life.skill - a.life.skill)[0];
      if (mentor && n.needs.health > 50) {
        n.life.skill = Math.min(mentor.life.skill, n.life.skill + 0.1);
        if (previous !== n.identity.age) appendEvent(w, { kind: "education", actorId: n.id, targetId: mentor.id, importance: 40, description: `${n.identity.name}\uC774 ${mentor.identity.name}\uC5D0\uAC8C \uC0DD\uD65C \uAE30\uC220\uC744 \uBC30\uC6E0\uB2E4.`, data: { skill: n.life.skill, occupation: mentor.occupation } });
      }
      if (!mentor) {
        const foster = w.npcs.find((p) => p.alive && p.identity.age >= 18 && p.settlementId === n.settlementId && w.npcs.filter((q) => q.alive && q.homeId === p.homeId).length < capacity(w.buildings.find((b) => b.id === p.homeId)));
        if (foster && n.homeId !== foster.homeId) {
          n.homeId = foster.homeId;
          appendEvent(w, { kind: "family", actorId: n.id, targetId: foster.id, importance: 60, description: `${foster.identity.name}\uC758 \uC9D1\uC774 \uBCF4\uD638\uC790\uAC00 \uC5C6\uB294 ${n.identity.name}\uC758 \uC591\uC721\uC744 \uB9E1\uC558\uB2E4.`, data: { homeId: n.homeId, foster: true } });
        }
      }
    } else if (!n.life.partnerId) {
      const partner = w.npcs.find((p) => p.alive && p.id !== n.id && !p.life.partnerId && p.identity.age >= 18 && p.settlementId === n.settlementId && (n.relationships.find((r) => r.npcId === p.id)?.affection ?? 0) >= 10);
      if (partner) formFamily(w, n, partner);
    } else if (n.id < n.life.partnerId) {
      const partner = w.npcs.find((p) => p.id === n.life.partnerId);
      if (partner) giveBirth(w, n, partner);
    }
  }
}

// ../../../..v0.21-source/src/sim/economy.ts
var emptyFlow = () => ({ producedFood: 0, producedWood: 0, consumedFood: 0, investedWood: 0, externalFood: 0, trades: 0, tradeVolume: 0, wages: 0 });
function holdings(w) {
  const regional = w.civilization?.settlements.filter((v) => v.id !== "v0").reduce((a, v) => ({ food: a.food + v.storage.food + v.market.food, wood: a.wood + v.storage.wood + v.market.wood, coins: a.coins + v.market.coins }), { food: 0, wood: 0, coins: 0 }) ?? { food: 0, wood: 0, coins: 0 };
  const transit = w.civilization?.journeys.reduce((a, j) => ({ food: a.food + j.food, coins: a.coins + j.coins }), { food: 0, coins: 0 }) ?? { food: 0, coins: 0 };
  const urbanCoins = (w.urban?.cities.reduce((s, c) => s + c.treasury, 0) ?? 0) + (w.urban?.freight.reduce((s, f) => s + f.coins, 0) ?? 0);
  return w.npcs.reduce(
    (a, n) => ({ food: a.food + n.inventory.food, wood: a.wood + n.inventory.wood, coins: a.coins + n.wealth }),
    { food: w.storage.food + w.market.food + regional.food + transit.food, wood: w.storage.wood + w.market.wood + regional.wood, coins: w.market.coins + regional.coins + transit.coins + urbanCoins }
  );
}
function createEconomy(w) {
  const h = holdings(w);
  return { since: w.tick, openingFood: h.food, openingWood: h.wood, openingCoins: h.coins, totals: emptyFlow(), daily: [], last: { ...emptyFlow(), shares: w.stats.shares, conflicts: w.stats.conflicts } };
}
function balance(w) {
  const h = holdings(w), e = w.economy, t = e.totals;
  return { food: h.food - (e.openingFood + (e.arrivals?.food ?? 0) + t.producedFood + t.externalFood - t.consumedFood), wood: h.wood - (e.openingWood + (e.arrivals?.wood ?? 0) + t.producedWood - t.investedWood), coins: h.coins - e.openingCoins - (e.arrivals?.coins ?? 0) };
}
function updatePrices(w) {
  const living = w.npcs.filter((n) => n.alive && n.settlementId === "v0"), hungry = living.filter((n) => n.inventory.food < 2 && n.needs.hunger > 45).length;
  const foodStock = w.storage.food + w.market.food + living.reduce((s, n) => s + n.inventory.food, 0), demand = living.length * 3 + hungry * 2;
  const desired = Math.max(1, Math.min(12, Math.round(3 * demand / Math.max(1, foodStock))));
  const previous = w.market.foodPrice;
  w.market.foodPrice += Math.sign(desired - previous);
  const woodStock = w.storage.wood + w.market.wood + living.reduce((s, n) => s + n.inventory.wood, 0);
  const woodTarget = woodStock < living.length * 2 ? 3 : woodStock > living.length * 8 ? 1 : 2;
  w.market.woodPrice += Math.sign(woodTarget - w.market.woodPrice);
  const e = appendEvent(w, {
    kind: "price",
    importance: 25,
    description: `\uC2DD\uB7C9 \uAC00\uACA9 ${previous} \u2192 ${w.market.foodPrice}\uCF54\uC778. \uC2DD\uB7C9 ${foodStock}\uAC1C, \uC218\uC694 \uAE30\uC900 ${demand}\uAC1C, \uC2DD\uB7C9\uC774 \uD544\uC694\uD55C \uC8FC\uBBFC ${hungry}\uBA85.`,
    data: { previous, price: w.market.foodPrice, desired, foodStock, demand, hungry, woodPrice: w.market.woodPrice, woodStock }
  });
  return e;
}
function sampleDay(w) {
  const e = w.economy, h = holdings(w), living = w.npcs.filter((n) => n.alive), wealth = living.map((n) => n.wealth).sort((a, b) => a - b);
  const flow2 = emptyFlow();
  for (const key2 of Object.keys(flow2)) flow2[key2] = e.totals[key2] - e.last[key2];
  const source = updatePrices(w);
  e.daily.push({
    ...flow2,
    day: dayOf(w.tick) - 1,
    tick: w.tick,
    population: living.length,
    food: h.food,
    storageFood: w.storage.food,
    foodPrice: w.market.foodPrice,
    coins: h.coins,
    poorest: wealth[0] ?? 0,
    median: wealth.length ? (wealth[Math.floor((wealth.length - 1) / 2)] + wealth[Math.floor(wealth.length / 2)]) / 2 : 0,
    richest: wealth.at(-1) ?? 0,
    shares: w.stats.shares - e.last.shares,
    conflicts: w.stats.conflicts - e.last.conflicts,
    eventId: source.id
  });
  e.last = { ...e.totals, shares: w.stats.shares, conflicts: w.stats.conflicts };
}

// ../../../..v0.21-source/src/sim/world.ts
function createWorld(seed = 42, population = 12) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 4294967295) throw new Error("\uC2DC\uB4DC\uB294 0~4294967295 \uC815\uC218\uC5EC\uC57C \uD569\uB2C8\uB2E4.");
  if (!Number.isInteger(population) || population < 10 || population > 3e3) throw new Error("\uC8FC\uBBFC \uC218\uB294 10~3000\uBA85\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.");
  const w = {
    version: 9,
    observation: { watchIds: [] },
    requests: emptyRequests(36),
    living: void 0,
    heritage: void 0,
    urban: void 0,
    civilization: { settlements: [], journeys: [], focus: "v0", detail: "full" },
    seed,
    rng: seed || 2654435769,
    tick: 36,
    nextId: 1,
    width: 48,
    height: 36,
    tiles: [],
    buildings: [],
    resources: [],
    npcs: [],
    storage: { food: 28, wood: 12 },
    market: { food: 20, wood: 0, coins: 180, foodPrice: 3, woodPrice: 2 },
    weather: "sunny",
    droughtUntil: 0,
    economy: void 0,
    events: [],
    loans: [],
    llm: { enabled: true, queue: [], gateKeys: [], dailyByNpc: {}, dailyTotal: 0, requested: 0, completed: 0, rejected: 0, failed: 0 },
    stats: { foodSum: 0, samples: 0, deaths: 0, thefts: 0, shares: 0, conflicts: 0 }
  };
  for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) {
    const lx = x - 8, ly = y - 6;
    const riverX = 34 + Math.round(Math.sin(ly / 4));
    let tile = x >= riverX && x < riverX + 3 ? "water" : "grass";
    if ((ly === 11 || ly === 12) && x > 2 && x < 46) tile = "path";
    if ((lx === 14 || lx === 15) && y > 2 && y < 34) tile = "path";
    if (lx < 7 && ly < 10 && x > 1 && y > 1) tile = "forest";
    if (lx > 18 && lx < 24 && ly > 4 && ly < 10) tile = "farm";
    if (x > 43 && y < 5) tile = "rock";
    w.tiles.push(tile);
  }
  const buildings = [
    ["storage", "\uACF5\uB3D9 \uCC3D\uACE0", 16, 10],
    ["farm", "\uB3D9\uCABD \uACF5\uB3D9 \uB18D\uC7A5", 21, 7],
    ["market", "\uB290\uD2F0\uB098\uBB34 \uC2DC\uC7A5", 17, 14],
    ["well", "\uB9C8\uC744 \uC6B0\uBB3C", 12, 11],
    ["home", "\uB178\uC744\uC9D1", 9, 6],
    ["home", "\uC18C\uB098\uBB34\uC9D1", 13, 5],
    ["home", "\uB3CC\uB2F4\uC9D1", 18, 4],
    ["home", "\uD480\uAF43\uC9D1", 7, 16],
    ["home", "\uD587\uC0B4\uC9D1", 11, 18],
    ["home", "\uBC14\uB78C\uC9D1", 20, 18]
  ];
  w.buildings = buildings.map(([kind, name, x, y], i) => ({ id: `b${i}`, kind, name, position: { x: x + 8, y: y + 6 }, level: 1, growth: kind === "farm" ? 30 : 0 }));
  for (let i = 0; i < 18; i++) {
    const x = 2 + i % 5, y = 2 + Math.floor(i / 5) * 2;
    w.resources.push({ id: `r${i}`, position: { x: x + 8, y: y + 6 }, kind: i % 3 === 0 ? "food" : "wood", amount: i % 3 === 0 ? 3 : 10, capacity: 16 });
  }
  for (let i = 0; i < 5; i++) w.resources.push({ id: `berry${i}`, position: { x: 11 + i * 4, y: 27 }, kind: "food", amount: 4, capacity: 20 });
  const names = ["\uD558\uB8E8", "\uC11C\uC5F0", "\uB3C4\uC724", "\uBBFC\uC11C", "\uC9C0\uD638", "\uC218\uC544", "\uC2DC\uC6B0", "\uB098\uC740", "\uC720\uC900", "\uB2E4\uC740", "\uC774\uC548", "\uC18C\uC728", "\uBBFC\uC7AC", "\uC5EC\uC6B8", "\uC5F0\uC6B0", "\uD574\uC194"];
  const jobs = ["farmer", "gatherer", "farmer", "woodcutter", "carpenter", "farmer", "merchant", "gatherer", "woodcutter", "farmer", "gatherer", "carpenter"];
  for (let i = 0; i < population; i++) {
    const home = w.buildings[4 + i % 6];
    const personality = { diligence: random(w) * 100, greed: random(w) * 100, sociability: random(w) * 100, aggression: random(w) * 100, empathy: random(w) * 100, curiosity: random(w) * 100 };
    w.npcs.push({
      id: `npc${i}`,
      identity: { name: `${names[i % names.length]}${i >= names.length ? Math.floor(i / names.length) + 1 : ""}`, age: 20 + Math.floor(random(w) * 44) },
      life: { bornTick: 0, parentIds: [], generation: 0, skill: 10, lastBirth: 0, lastMove: 0, estateSettled: false },
      settlementId: "v0",
      position: { x: home.position.x + i % 2, y: home.position.y + 1 },
      homeId: home.id,
      occupation: jobs[i % jobs.length],
      alive: true,
      needs: { hunger: 20 + random(w) * 40, thirst: 15 + random(w) * 25, fatigue: 10 + random(w) * 20, health: 80 + random(w) * 20, safety: 90, social: 45 + random(w) * 40 },
      personality,
      inventory: { food: 1 + Math.floor(random(w) * 3), wood: 0 },
      wealth: 8 + Math.floor(random(w) * 22),
      relationships: [],
      memories: [],
      goals: [{ id: `initial${i}`, kind: i % 3 === 0 ? "secure_food" : i % 3 === 1 ? "help_neighbor" : "earn_wealth", reason: "\uC0C8\uB85C\uC6B4 \uB9C8\uC744\uC5D0\uC11C \uC0B6\uC758 \uAE30\uBC18\uC744 \uB9CC\uB4E4\uACE0 \uC2F6\uB2E4.", createdAt: w.tick }],
      decision: { reason: "\uC544\uCE68\uC758 \uCCAB \uD589\uB3D9\uC744 \uC0DD\uAC01\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4.", candidates: [], tick: w.tick },
      dailyTaken: 0,
      lastTalk: -100,
      knownRumors: []
    });
  }
  for (let i = 0; i < w.npcs.length; i++) {
    const n = w.npcs[i];
    if (i % 12 === 9) {
      n.identity.age = 8;
      n.occupation = "none";
    }
    if (i % 12 === 10) n.identity.age = 70;
    if (i % 12 === 11) n.occupation = "none";
  }
  initializeCivilization(w);
  populateSettlements(w);
  for (const n of w.npcs.filter((n2) => n2.identity.age < 18)) {
    if (w.npcs.some((p) => p.homeId === n.homeId && p.identity.age >= 18)) continue;
    const guardian = w.npcs.find((p) => p.identity.age >= 18 && p.identity.age < 65 && p.settlementId === n.settlementId && w.npcs.filter((q) => q.homeId === p.homeId).length < 2 + w.buildings.find((b) => b.id === p.homeId).level * 2);
    if (guardian) {
      for (const b of w.buildings) if (b.ownerIds) b.ownerIds = b.ownerIds.filter((id7) => id7 !== n.id);
      n.homeId = guardian.homeId;
      n.position = { ...w.buildings.find((b) => b.id === n.homeId).position };
    }
  }
  initializeUrban(w);
  initializeHeritage(w, true);
  for (const n of w.npcs) syncEmployment(w, n, false);
  w.economy = createEconomy(w);
  return w;
}

// ../../../..v0.21-source/src/sim/affinity.ts
function affinity(w, n, other) {
  const r = n.relationships.find((r2) => r2.npcId === other.id);
  const memories = retrieveMemories(n.memories.filter((m) => m.relatedNpcIds.includes(other.id)), w.tick, { npcIds: [other.id] }, 4).map((h) => h.memory);
  let experience = 0;
  for (const m of memories) {
    const recency = 1 / (1 + Math.max(0, w.tick - m.createdAt) / (144 * 7));
    experience += m.emotionalImpact / 100 * m.importance / 100 * recency * Math.min(3, m.repetitions);
  }
  const impression = attraction(w, n, other);
  const history = (r ? (r.trust - 35) * 0.18 + r.affection * 0.1 - r.resentment * 0.22 - r.fear * 0.06 : 0) + Math.max(-12, Math.min(12, experience * (2 + n.personality.empathy / 25)));
  const value = history + impression.value;
  return {
    value,
    evidence: [.../* @__PURE__ */ new Set([...r?.evidence.slice(-3) ?? [], ...memories.slice(-3).map((m) => m.sourceEventId)])],
    reason: `\uC2E0\uB8B0 ${Math.round(r?.trust ?? 35)} \xB7 \uBD88\uB9CC ${Math.round(r?.resentment ?? 0)} \xB7 \uACBD\uD5D8 ${memories.length}\uAC74 \xB7 \uAD00\uACC4/\uAE30\uC5B5 ${history.toFixed(1)} \xB7 \uD604\uC7AC \uC778\uC0C1 ${signed(impression.value)} (${impression.reason})`
  };
}

// ../../../..v0.21-source/src/sim/social-motives.ts
function socialMotives(w, n, other) {
  const relationship3 = n.relationships.find((r) => r.npcId === other.id);
  const recent = n.memories.filter((m) => m.relatedNpcIds.includes(other.id) && w.tick >= m.createdAt && w.tick - m.createdAt <= 7 * 144).map((m) => ({ m, e: eventById(w, m.sourceEventId) })).filter(({ e }) => e && e.participants.includes(n.id) && e.participants.includes(other.id));
  const help = recent.filter(({ e }) => e.kind === "share" && e.actorId === other.id && e.targetId === n.id).sort((a, b) => b.m.createdAt - a.m.createdAt)[0];
  const kept = recent.filter(({ e }) => e.kind === "repayment" && e.actorId === other.id && e.targetId === n.id).sort((a, b) => b.m.createdAt - a.m.createdAt)[0];
  const wary = (relationship3?.resentment ?? 0) >= 50 || (relationship3?.fear ?? 0) >= 50;
  const strength = (at) => Math.max(0, 1 - (w.tick - at) / (7 * 144));
  const gratitude = help && !wary ? Number(((2 + n.personality.empathy / 25) * strength(help.m.createdAt)).toFixed(2)) : 0;
  const reliability = kept && !wary ? Number(((2 + n.personality.sociability / 50) * strength(kept.m.createdAt)).toFixed(2)) : 0;
  return {
    share: gratitude,
    talk: reliability,
    borrow: gratitude,
    evidence: [...gratitude ? [help.e.id] : [], ...reliability ? [kept.e.id] : []],
    reason: [...gratitude ? [`\uC9C1\uC811 \uBC1B\uC740 \uC2DD\uB7C9 \uB3C4\uC6C0\uC744 \uAE30\uC5B5\uD574 \uBCF4\uB2F5\xB7\uB3C4\uC6C0 \uC694\uCCAD \uC120\uD638 +${gratitude.toFixed(1)}`] : [], ...reliability ? [`\uC0C1\uD658 \uC57D\uC18D\uC744 \uC9C0\uD0A8 \uACBD\uD5D8\uC73C\uB85C \uB300\uD654 \uC120\uD638 +${reliability.toFixed(1)}`] : []].join(" \xB7 ")
  };
}

// ../../../..v0.21-source/src/sim/decision.ts
var durations = { Attend: 6, Wash: 3, Idle: 2, Move: 1, Sleep: 8, Eat: 1, Drink: 1, Gather: 3, Work: 4, Talk: 2, StoreItem: 1, TakeItem: 1, Share: 1, Theft: 2, Trade: 1, Borrow: 1, Repay: 1 };
function candidates(w, n) {
  const list = [];
  const stock = stocks(w, n.settlementId), localMarket = market(w, n.settlementId);
  const add = (kind, score7, reason, target = n.position, targetId, evidence2) => list.push({ kind, score: Math.round((score7 - distance(n.position, target) * 0.6) * 10) / 10, reason, target: { ...target }, targetId, evidence: evidence2 });
  const has = (kind) => n.goals.some((g) => g.kind === kind);
  const home = w.buildings.find((b) => b.id === n.homeId);
  const storage = localBuilding(w, n, "storage");
  const market2 = localBuilding(w, n, "market");
  const farm = w.buildings.filter((b) => b.kind === "farm" && b.settlementId === n.settlementId && !w.urban.enterprises.some((e) => e.buildingId === b.id) && b.growth >= 3).sort((a, b) => distance(a.position, n.position) - distance(b.position, n.position))[0] ?? w.buildings.find((b) => b.kind === "farm" && b.settlementId === n.settlementId && !w.urban.enterprises.some((e) => e.buildingId === b.id));
  const well = localBuilding(w, n, "well");
  const urban = w.urban.citizens[n.id];
  const night = w.tick % 144 >= 126 || w.tick % 144 < 30;
  const job = canProduce(w, n);
  if (job) add("Work", 76 + n.personality.diligence * 0.25 - (w.urban.citizens[n.id]?.stress ?? 0) * 0.15, `${INDUSTRY_LABELS[job.e.kind]} \xB7 \uC784\uAE08 ${job.e.wage}\uCF54\uC778 \xB7 \uC7AC\uB8CC\uC640 \uAE30\uAE08 \uD655\uBCF4`, job.b.position, `industry:${job.e.buildingId}`);
  add("Idle", 8, "\uC8FC\uBCC0\uC744 \uC0B4\uD53C\uBA70 \uC7A0\uC2DC \uC270\uB2E4.");
  if (n.inventory.food > 0) add("Eat", n.needs.hunger * 1.9 - 25, `\uBC30\uACE0\uD514 ${Math.round(n.needs.hunger)} \xB7 \uC18C\uC9C0 \uC2DD\uB7C9 ${n.inventory.food}`);
  add("Drink", n.needs.thirst * 1.9 - 22, `\uAC08\uC99D ${Math.round(n.needs.thirst)} \xB7 \uC6B0\uBB3C\uC5D0\uC11C \uBB3C\uC744 \uB9C8\uC2E0\uB2E4.`, well.position, well.id);
  add("Sleep", n.needs.fatigue * 1.5 - 20 + (night ? 24 : 0) + urban.stress * 0.15 + urban.injury * 0.3, `\uD53C\uB85C ${Math.round(n.needs.fatigue)}${night ? " \xB7 \uBC24\uC5D0\uB294 \uC218\uBA74\uC744 \uC6B0\uC120\uD55C\uB2E4." : ""}`, home.position, home.id);
  if (n.inventory.food < 2 + Math.floor(n.personality.greed / 30) && stock.food > 0) {
    if (n.dailyTaken < 3) add("TakeItem", n.needs.hunger * 1.2 + n.personality.greed * 0.3 + (has("secure_food") ? 12 : 0), `\uACF5\uB3D9 \uC2DD\uB7C9 ${stock.food} \xB7 \uC624\uB298 \uC778\uCD9C ${n.dailyTaken}/3`, storage.position, storage.id);
    else if (n.needs.hunger > 60 || n.personality.greed > 70) add("Theft", n.needs.hunger * 0.95 + n.personality.greed * 0.5 - n.personality.empathy * 0.4 - storage.level * 7 + (50 - urban.trust) * 0.1, "\uC778\uCD9C \uD55C\uB3C4\uB97C \uC18C\uC9C4\uD588\uB2E4. \uAD76\uC8FC\uB9BC\xB7\uD0D0\uC695\uACFC \uD0C0\uC778\uC5D0 \uB300\uD55C \uACF5\uAC10\uC744 \uBE44\uAD50\uD55C\uB2E4.", storage.position, storage.id);
  }
  for (const r of w.resources) {
    if (distance(r.position, n.position) > 20 || r.amount < 1 || r.kind === "wood" && n.inventory.wood >= 8) continue;
    const foodNeed = n.inventory.food < 3 ? n.needs.hunger * 0.85 : -30;
    add("Gather", r.kind === "food" ? 18 + foodNeed + (n.occupation === "gatherer" ? 22 : 0) : 20 + n.personality.diligence * 0.25 + (n.occupation === "woodcutter" ? 25 : 0), r.kind === "food" ? "\uC8FC\uBCC0 \uC5F4\uB9E4\uB97C \uCC44\uC9D1\uD574 \uC2DD\uB7C9\uC744 \uD655\uBCF4\uD55C\uB2E4." : "\uC232\uC5D0\uC11C \uBAA9\uC7AC\uB97C \uBAA8\uC740\uB2E4.", r.position, r.id);
  }
  if (farm.growth >= 3 && n.inventory.food < 7) add("Work", 25 + n.personality.diligence * 0.4 + (n.occupation === "farmer" ? 25 : 0) + (n.inventory.food < 2 ? n.needs.hunger * 0.6 : 0), `\uB18D\uC7A5 \uC218\uD655 \uAC00\uB2A5\uB7C9 ${Math.floor(farm.growth)} \xB7 \uADFC\uBA74 ${Math.round(n.personality.diligence)}`, farm.position, farm.id);
  const project = n.goals.find((g) => ["expand_farm", "secure_storage", "build_home"].includes(g.kind));
  if (project && n.inventory.wood + stock.wood >= 8) {
    const b = project.kind === "expand_farm" ? farm : project.kind === "build_home" ? home : storage;
    if (b.level < 4) add("Work", 65 + n.personality.diligence * 0.2, `\uC7A5\uAE30 \uBAA9\uD45C: ${project.reason}`, b.position, `${b.id}:${project.kind}`);
  }
  if (!project && n.occupation === "carpenter" && farm.level < 4 && n.inventory.wood + stock.wood >= 8) add("Work", 52 + n.personality.diligence * 0.2, `\uB18D\uC7A5 ${farm.level}\uB2E8\uACC4 \xB7 \uBAA9\uC7AC 8\uAC1C \uD22C\uC790\uB85C \uC131\uC7A5 \uC18D\uB3C4 +35%p`, farm.position, `${farm.id}:expand_farm`);
  if (n.inventory.food > 3 || n.inventory.wood >= 4) add("StoreItem", 40 + n.personality.empathy * 0.35 + n.inventory.wood * 2 - n.personality.greed * 0.2, "\uC5EC\uBD84\uC758 \uC790\uC6D0\uC744 \uACF5\uB3D9 \uCC3D\uACE0\uC5D0 \uBCF4\uAD00\uD55C\uB2E4.", storage.position, storage.id);
  if (n.inventory.food < 2 && localMarket.food > 0 && n.wealth >= localMarket.foodPrice) add("Trade", n.needs.hunger * 1.1 + (n.occupation === "merchant" ? 15 : 0), `\uC2DC\uC7A5 \uC2DD\uB7C9 \uAC00\uACA9 ${localMarket.foodPrice} \xB7 \uC7AC\uC0B0 ${n.wealth}`, market2.position, "buy");
  if (n.inventory.wood >= 2 && localMarket.coins >= localMarket.woodPrice * 2) add("Trade", 38 + n.personality.greed * 0.45 + (has("earn_wealth") ? 15 : 0), "\uBAA9\uC7AC\uB97C \uD314\uC544 \uC0DD\uD65C\uBE44\uB97C \uB9C8\uB828\uD55C\uB2E4.", market2.position, "sell");
  for (const other of w.npcs.length > 400 ? neighbours(w, n, 7).sort((a, b) => distance(n.position, a.position) - distance(n.position, b.position)).slice(0, 24) : neighbours(w, n, 7)) {
    if (!other.alive || other.id === n.id) continue;
    const d = distance(n.position, other.position);
    if (d > 7) continue;
    const bond2 = affinity(w, n, other), consent = affinity(w, other, n);
    const motives = socialMotives(w, n, other);
    const evidence2 = [.../* @__PURE__ */ new Set([...bond2.evidence, ...motives.evidence])];
    const experienceReason = motives.reason ? ` \xB7 ${motives.reason}` : "";
    if (d > 7) continue;
    if (n.inventory.food > 1 && other.inventory.food === 0 && (other.needs.hunger > 60 || other.needs.health < 55)) add("Share", 25 + n.personality.empathy * 0.85 + (has("help_neighbor") ? 15 : 0) - n.needs.hunger * 0.3 + bond2.value + motives.share, `${other.identity.name}\uC758 \uC2DD\uB7C9\uC774 \uC5C6\uACE0 ${other.needs.health < 55 ? "\uBAB8\uC774 \uC544\uD504\uB2E4" : "\uBC30\uACE0\uD514\uC774 \uB192\uB2E4"}. ${bond2.reason}${experienceReason}`, other.position, other.id, evidence2);
    if (w.tick - n.lastTalk > 18 && w.tick - other.lastTalk > 8 && d <= 4) add("Talk", (100 - n.needs.social) * 0.65 + n.personality.sociability * 0.3 + (has("make_friend") ? 15 : 0) + bond2.value + motives.talk, `${other.identity.name}\uACFC \uB300\uD654\uD558\uACE0 \uC2F6\uB2E4. \uC0AC\uD68C\uC801 \uCDA9\uC871 ${Math.round(n.needs.social)} \xB7 ${bond2.reason}${experienceReason}`, other.position, other.id, evidence2);
    const rel = other.relationships.find((r) => r.npcId === n.id);
    if (n.inventory.food === 0 && n.needs.hunger > 65 && other.inventory.food >= 3 && (rel?.trust ?? 35) >= 30 && !w.loans.some((l) => l.borrowerId === n.id && l.status !== "repaid")) add("Borrow", n.needs.hunger * 1.2 + bond2.value + consent.value * 0.4 + motives.borrow, `${other.identity.name}\uC5D0\uAC8C \uC2DD\uB7C9\uC744 \uBE4C\uB9B4 \uC218 \uC788\uB2E4. ${bond2.reason} \xB7 \uC0C1\uB300\uC758 \uC2E0\uB8B0 ${Math.round(rel?.trust ?? 35)}${experienceReason}`, other.position, other.id, [.../* @__PURE__ */ new Set([...evidence2, ...consent.evidence])]);
    if (n.inventory.food < 2 && other.inventory.food > 3 && n.wealth >= localMarket.foodPrice && (rel?.trust ?? 35) >= 20) add("Trade", n.needs.hunger * 1.15 + bond2.value + 8, `${other.identity.name}\uC758 \uC5EC\uBD84 \uC2DD\uB7C9\uC744 ${localMarket.foodPrice}\uCF54\uC778\uC5D0 \uAD6C\uB9E4. ${bond2.reason}`, other.position, `peer:${other.id}`, evidence2);
  }
  for (const loan of w.loans.filter((l) => l.borrowerId === n.id && l.status !== "repaid" && n.inventory.food > 1)) {
    const lender = w.npcs.find((p) => p.id === loan.lenderId);
    if (lender?.alive) add("Repay", 55 + n.personality.empathy * 0.4 + (w.tick >= loan.due - 72 ? 25 : 0), `${lender.identity.name}\uC5D0\uAC8C \uB0A8\uC740 \uBE5A ${loan.remaining}\uAC1C \uC911 ${Math.min(loan.remaining, n.inventory.food - 1)}\uAC1C \uC0C1\uD658`, lender.position, loan.id);
  }
  if (!canWork(w, n)) {
    for (let i = list.length - 1; i >= 0; i--) if (list[i].kind === "Work" || list[i].kind === "Gather") list.splice(i, 1);
  }
  livingCandidates(w, n, list);
  const appointment = gatheringCandidate(w, n);
  if (appointment) list.push(appointment);
  return list.sort((a, b) => b.score - a.score);
}
function plan(w, n) {
  if (!n.currentAction) delete n.currentAction;
  const options = candidates(w, n);
  applyPlan(w, n, options);
  options.sort((a, b) => b.score - a.score);
  for (const candidate2 of options) {
    const path = findPath(w, n.position, candidate2.target);
    if (path !== null) return { action: { ...candidate2, path, progress: 0, duration: durations[candidate2.kind] }, candidates: options.slice(0, 6) };
  }
  return { action: { kind: "Idle", score: 0, reason: "\uB3C4\uB2EC \uAC00\uB2A5\uD55C \uD589\uB3D9\uC744 \uCC3E\uC9C0 \uBABB\uD588\uB2E4.", target: { ...n.position }, path: [], progress: 0, duration: 1 }, candidates: options.slice(0, 6) };
}

// ../../../..v0.21-source/src/sim/gatherings-validation.ts
function validateGatherings(w, ensure, register) {
  if (!w.gatherings) {
    ensure(w.npcs.every((n) => n.currentAction?.kind !== "Attend"), "\uC57D\uC18D \uC5C6\uB294 \uACF5\uB3D9 \uD65C\uB3D9");
    return;
  }
  const events = new Map(w.events.map((e) => [e.id, e])), people = new Map(w.npcs.map((n) => [n.id, n]));
  ensure(w.gatherings.lastProposalDay <= Math.floor(w.tick / 144), "\uACF5\uB3D9 \uD65C\uB3D9 \uC81C\uC548 \uB0A0\uC9DC");
  const booked2 = /* @__PURE__ */ new Set(), villages = /* @__PURE__ */ new Set();
  for (const g of w.gatherings.items) {
    register(g.id);
    const source = events.get(g.sourceEventId), last = events.get(g.lastEventId), b = w.buildings.find((b2) => b2.id === g.buildingId);
    ensure(people.has(g.hostId) && b?.settlementId === g.settlementId && b.kind === (g.kind === "harvest" ? "farm" : "market"), "\uACF5\uB3D9 \uD65C\uB3D9 \uC7A5\uC18C/\uC8FC\uCD5C\uC790");
    ensure(g.createdAt <= w.tick && g.startsAt === g.createdAt + (g.schedule ? 54 : 36) && g.endsAt === g.startsAt + 24, "\uACF5\uB3D9 \uD65C\uB3D9 \uC2DC\uAC04");
    ensure(source?.kind === "gathering" && source.actorId === g.hostId && source.tick === g.createdAt && source.data.phase === "proposed" && source.data.gatheringId === g.id && source.data.gatheringKind === g.kind && source.locationId === g.buildingId, "\uACF5\uB3D9 \uD65C\uB3D9 \uC81C\uC548 \uCD9C\uCC98");
    ensure(JSON.stringify(source?.data.evidence) === JSON.stringify(g.evidence) && g.evidence.every((id7) => {
      const e = events.get(id7);
      return e && e.tick <= g.createdAt && e.participants.includes(g.hostId) && e.kind !== "rumor";
    }), "\uACF5\uB3D9 \uD65C\uB3D9 \uAC1C\uC778 \uADFC\uAC70");
    ensure(last?.kind === "gathering" && last.data.gatheringId === g.id && last.tick <= w.tick, "\uACF5\uB3D9 \uD65C\uB3D9 \uB9C8\uC9C0\uB9C9 \uAE30\uB85D");
    if (g.recurring) {
      ensure(g.recurring.partnerId !== g.hostId && people.has(g.recurring.partnerId) && source?.data.recurringPartner === g.recurring.partnerId && JSON.stringify(g.evidence) === JSON.stringify(g.recurring.evidence), "\uC815\uAE30 \uBAA8\uC784 \uC81C\uC548 \uC5F0\uACB0");
      ensure(new Set(g.recurring.evidence).size === g.recurring.evidence.length && g.recurring.evidence.every((id7) => {
        const e = events.get(id7);
        return e?.kind === "gathering" && e.data.phase === "completed" && e.data.gatheringKind === g.kind && e.participants.includes(g.hostId) && e.participants.includes(g.recurring.partnerId) && e.tick <= g.createdAt - 3 * 144;
      }), "\uC815\uAE30 \uBAA8\uC784 \uC2E4\uC81C \uC644\uB8CC \uADFC\uAC70");
    }
    if (g.schedule) {
      const change = events.get(g.schedule.eventId), request = events.get(g.schedule.requestEventId);
      ensure(g.schedule.previousStart === g.createdAt + 36 && g.schedule.tick >= g.createdAt && g.schedule.tick < g.schedule.previousStart - 12 && g.schedule.tick <= w.tick, "\uC57D\uC18D \uBCC0\uACBD \uC2DC\uAC04");
      ensure(request?.kind === "gathering" && request.data.phase === "reschedule-requested" && request.data.gatheringId === g.id && request.actorId === g.schedule.requestedBy && request.participants.includes(g.hostId) && typeof request.data.distance === "number" && request.data.distance <= 4 && request.data.distance >= 0, "\uC57D\uC18D \uC870\uC728 \uC694\uCCAD");
      ensure(change?.kind === "gathering" && change.data.phase === "rescheduled" && change.causeId === request?.id && change.data.gatheringId === g.id && change.actorId === g.hostId && change.tick === g.schedule.tick && change.data.startsAt === g.startsAt && change.data.endsAt === g.endsAt, "\uC57D\uC18D \uBCC0\uACBD \uCD9C\uCC98");
    }
    ensure(new Set(g.invitations.map((i) => i.npcId)).size === g.invitations.length, "\uC911\uBCF5 \uCD08\uB300");
    ensure(new Set(g.arrivals.map((a) => a.npcId)).size === g.arrivals.length && g.arrivals.every((a) => {
      const e = events.get(a.eventId);
      return (a.npcId === g.hostId || g.invitations.some((i) => i.npcId === a.npcId && i.deliveredAt <= a.tick)) && a.tick >= g.createdAt && a.tick < g.endsAt && a.tick <= w.tick && e?.kind === "gathering" && e.data.phase === "arrived" && e.data.gatheringId === g.id && e.actorId === a.npcId && e.tick === a.tick && e.locationId === g.buildingId;
    }), "\uACF5\uB3D9 \uD65C\uB3D9 \uC2E4\uC81C \uB3C4\uCC29 \uADFC\uAC70");
    for (const i of g.invitations) {
      const invitation = events.get(i.invitationEventId), response = events.get(i.responseEventId);
      ensure(i.npcId !== g.hostId && people.has(i.npcId) && i.deliveredAt >= g.createdAt && i.deliveredAt < g.startsAt - 6 && i.deliveredAt <= w.tick, "\uCD08\uB300 \uB300\uC0C1/\uC2DC\uAC04");
      ensure(invitation?.kind === "gathering" && invitation.data.phase === "invited" && invitation.data.gatheringId === g.id && invitation.tick === i.deliveredAt && typeof invitation.data.distance === "number" && invitation.data.distance <= 4 && invitation.data.distance >= 0 && invitation.participants.includes(i.npcId) && invitation.actorId === (i.senderId ?? g.hostId), "\uCD08\uB300 \uC804\uB2EC \uADFC\uAC70");
      const sender = i.senderId ?? g.hostId;
      if (sender !== g.hostId) {
        const parent = g.invitations.find((j) => j.npcId === sender);
        const consent = Array.isArray(invitation?.data.evidence) ? events.get(invitation.data.evidence[0]) : void 0;
        ensure(consent?.kind === "gathering" && consent.data.gatheringId === g.id && consent.data.phase === "accepted" && consent.actorId === sender && consent.tick <= i.deliveredAt, "\uCD08\uB300 \uC804\uB2EC\uC790\uC758 \uC218\uB77D \uADFC\uAC70");
        ensure(i.depth === 2 && parent && (parent.depth ?? 1) === 1 && parent.deliveredAt <= i.deliveredAt && invitation?.causeId === parent.invitationEventId, "\uCD08\uB300 \uC804\uB2EC \uACBD\uB85C");
      } else ensure((i.depth ?? 1) === 1, "\uCD08\uB300 \uC804\uB2EC \uAE4A\uC774");
      if (i.scheduleEventId) {
        const notice = events.get(i.scheduleEventId), consent = events.get(i.scheduleResponseId);
        ensure(g.schedule && notice?.kind === "gathering" && notice.data.gatheringId === g.id && notice.data.schedule === g.schedule.eventId && notice.participants.includes(i.npcId) && notice.tick >= g.schedule.tick && notice.tick <= w.tick && typeof notice.data.distance === "number" && notice.data.distance >= 0 && notice.data.distance <= 4, "\uC57D\uC18D \uBCC0\uACBD \uC804\uB2EC");
        ensure(consent?.kind === "gathering" && consent.causeId === notice?.id && consent.actorId === i.npcId && ["accepted", "declined"].includes(String(consent.data.phase)) && consent.tick === notice?.tick, "\uC57D\uC18D \uBCC0\uACBD \uC7AC\uC218\uB77D");
      } else ensure(!i.scheduleResponseId, "\uC57D\uC18D \uBCC0\uACBD \uC804\uB2EC \uC5C6\uB294 \uC751\uB2F5");
      ensure(response?.kind === "gathering" && response.data.gatheringId === g.id && response.participants.includes(i.npcId) && response.tick >= i.deliveredAt && response.tick <= w.tick && response.data.phase === ({ attended: "completed" }[i.status] ?? i.status), "\uCD08\uB300 \uC751\uB2F5 \uADFC\uAC70");
      if (isPlanned(g) && i.status === "accepted") {
        ensure(!booked2.has(i.npcId), "\uC8FC\uBBFC \uC57D\uC18D \uC911\uBCF5");
        booked2.add(i.npcId);
      }
      ensure(!isPlanned(g) || !["attended", "missed"].includes(i.status), "\uC885\uB8CC \uC804 \uCC38\uC11D \uACB0\uACFC");
      ensure(isPlanned(g) || i.status !== "accepted", "\uC885\uB8CC \uD6C4 \uBBF8\uCC98\uB9AC \uC57D\uC18D");
    }
    ensure(new Set(g.attendance).size === g.attendance.length && g.attendance.every((id7) => g.arrivals.some((a) => a.npcId === id7) && (id7 === g.hostId || g.invitations.some((i) => i.npcId === id7 && ["accepted", "attended"].includes(i.status) && (!g.schedule || !!i.scheduleEventId)))), "\uCD08\uB300 \uC5C6\uB294 \uCC38\uC11D");
    ensure(g.progress === 0 ? g.attendance.length === 0 : g.attendance.length >= 2 && g.attendance.includes(g.hostId), "\uACF5\uB3D9 \uD65C\uB3D9 \uC9C4\uD589 \uC778\uC6D0");
    if (isPlanned(g)) {
      ensure(!booked2.has(g.hostId) && !villages.has(g.settlementId) && g.endsAt > w.tick && g.finishedAt === void 0 && g.progress < 6, "\uC9C4\uD589 \uC911 \uC57D\uC18D \uC0C1\uD55C/\uC885\uB8CC \uC2DC\uAC04");
      booked2.add(g.hostId);
      villages.add(g.settlementId);
      if (g.progress > 0) ensure(g.attendance.every((id7) => {
        const n = people.get(id7);
        return n.alive && distance(n.position, b.position) === 0 && n.currentAction?.kind === "Attend" && n.currentAction.targetId === g.id;
      }), "\uC2E4\uC81C \uCC38\uC11D \uC704\uCE58");
    } else {
      ensure(g.finishedAt !== void 0 && g.finishedAt >= g.createdAt && g.finishedAt <= w.tick, "\uACF5\uB3D9 \uD65C\uB3D9 \uC885\uB8CC \uC2DC\uAC04");
      ensure(g.status !== "completed" || g.progress === 6 && g.invitations.some((i) => i.status === "attended"), "\uACF5\uB3D9 \uD65C\uB3D9 \uC644\uB8CC \uADFC\uAC70");
    }
  }
  const circleKeys = /* @__PURE__ */ new Set();
  for (const c of w.gatherings.circles ?? []) {
    const key2 = `${c.hostId}:${c.partnerId}:${c.kind}`;
    ensure(!circleKeys.has(key2) && c.hostId !== c.partnerId && people.has(c.hostId) && people.has(c.partnerId) && c.meetings === c.evidence.length && new Set(c.evidence).size === c.evidence.length, "\uCE5C\uAD50 \uBAA8\uC784 \uC778\uC6D0/\uC911\uBCF5");
    circleKeys.add(key2);
    ensure(c.evidence.every((id7) => {
      const e = events.get(id7);
      return e?.kind === "gathering" && e.data.phase === "completed" && e.data.gatheringKind === c.kind && e.participants.includes(c.hostId) && e.participants.includes(c.partnerId) && e.tick <= c.lastAt;
    }) && events.get(c.evidence.at(-1))?.tick === c.lastAt && c.lastAt <= w.tick, "\uCE5C\uAD50 \uBAA8\uC784 \uC2E4\uC81C \uACF5\uB3D9 \uACBD\uD5D8");
  }
  for (const n of w.npcs) if (n.currentAction?.kind === "Attend") {
    const g = w.gatherings.items.find((g2) => g2.id === n.currentAction.targetId);
    ensure(g && isPlanned(g) && (g.hostId === n.id || g.invitations.some((i) => i.npcId === n.id && i.status === "accepted")) && distance(n.currentAction.target, w.buildings.find((b) => b.id === g.buildingId).position) === 0, "\uACF5\uB3D9 \uD65C\uB3D9 \uD589\uB3D9 \uAD8C\uD55C");
  }
}

// ../../../..v0.21-source/src/sim/cognition-validation.ts
import { z as z5 } from "zod";
var id3 = z5.string().min(1).max(100);
var natural = z5.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
var goal = z5.enum(GOAL_KINDS);
var evidence = z5.array(id3).max(4);
var cognitionSchema = z5.object({
  consideredMemoryIds: z5.array(id3).max(40),
  lastReflectionAt: natural,
  reflections: z5.array(z5.object({ eventId: id3, tick: natural, goal, text: z5.string().max(2e3), evidence: evidence.min(2) }).strict()).max(8),
  plan: z5.object({
    day: natural,
    updatedAt: natural,
    revision: natural.min(1),
    signature: z5.string().max(500),
    reason: z5.string().max(2e3),
    blocks: z5.array(z5.object({ start: natural.max(143), end: natural.min(1).max(144), intent: z5.enum(["rest", "sustain", "work", "connect"]) }).strict()).min(1).max(8),
    focus: goal.optional(),
    evidence,
    interruption: z5.enum(["hunger", "thirst", "fatigue", "health"]).optional()
  }).strict().optional(),
  retrieval: z5.object({ tick: natural, items: z5.array(z5.object({ eventId: id3, score: z5.number().min(0).max(3), recency: z5.number().min(0).max(1), importance: z5.number().min(0).max(1), relevance: z5.number().min(0).max(1) }).strict()).max(8) }).strict().optional()
}).strict();
function validateCognition(w, n, events, ensure) {
  for (const m of n.memories) ensure(m.lastRetrievedAt === void 0 || m.lastRetrievedAt >= m.createdAt && m.lastRetrievedAt <= w.tick, "\uAE30\uC5B5 \uAC80\uC0C9 \uC2DC\uAC04");
  const c = n.cognition;
  if (!c) return;
  ensure(c.lastReflectionAt <= w.tick && new Set(c.consideredMemoryIds).size === c.consideredMemoryIds.length, "\uC131\uCC30 \uCC98\uB9AC \uC2DC\uAC04/\uC911\uBCF5");
  ensure(new Set(c.reflections.map((r) => r.eventId)).size === c.reflections.length, "\uC911\uBCF5 \uC131\uCC30");
  for (const r of c.reflections) {
    const source = events.get(r.eventId);
    ensure(r.tick <= w.tick && source?.tick === r.tick && source.actorId === n.id && source.kind === "memory" && source.data.cognition === "reflection" && source.data.model === "rules" && source.data.goal === r.goal, "\uC131\uCC30 \uCD9C\uCC98");
    ensure(new Set(r.evidence).size === r.evidence.length && JSON.stringify(source?.data.evidence) === JSON.stringify(r.evidence) && r.evidence.every((id7) => {
      const e = events.get(id7);
      return e && e.tick <= r.tick && e.participants.includes(n.id) && !["rumor", "memory"].includes(e.kind);
    }), "\uC131\uCC30 \uADFC\uAC70/\uC9C0\uC2DD \uACBD\uACC4");
  }
  if (c.plan) {
    const p = c.plan;
    ensure(p.updatedAt <= w.tick && p.day === Math.floor(p.updatedAt / TICKS_PER_DAY), "\uD558\uB8E8 \uACC4\uD68D \uC2DC\uAC04");
    ensure(p.blocks[0].start === 0 && p.blocks.at(-1).end === TICKS_PER_DAY && p.blocks.every((b, i) => b.end > b.start && (!i || p.blocks[i - 1].end === b.start)), "\uD558\uB8E8 \uACC4\uD68D \uAD6C\uAC04");
    ensure(p.evidence.every((id7) => events.get(id7)?.participants.includes(n.id)), "\uD558\uB8E8 \uACC4\uD68D \uADFC\uAC70");
  }
  if (c.retrieval) ensure(c.retrieval.tick <= w.tick && c.retrieval.items.every((h) => {
    const e = events.get(h.eventId);
    return e && e.tick <= c.retrieval.tick && e.participants.includes(n.id) && Math.abs(h.score - h.recency - h.importance - h.relevance) < 1e-9;
  }), "\uAC80\uC0C9 \uADFC\uAC70/\uC810\uC218");
}

// ../../../..v0.21-source/src/sim/requests-validation.ts
function validateRequests(w, ensure, register) {
  const s = w.requests, events = new Map(w.events.map((e) => [e.id, e]));
  ensure(s.since <= w.tick && s.lastOffered <= w.tick && s.offeredDay <= Math.floor(w.tick / 144) + 1, "\uBD80\uD0C1 \uC2DC\uC791/\uBC1C\uC0DD \uC2DC\uAC04");
  ensure(s.items.filter(activeRequest).length <= 2 && new Set(s.items.filter(activeRequest).map((r) => r.npcId)).size === s.items.filter(activeRequest).length, "\uC9C4\uD589 \uC911 \uBD80\uD0C1 \uC0C1\uD55C/\uC911\uBCF5");
  ensure(Object.keys(s.cooldowns).length <= 64, "\uBD80\uD0C1 \uC7AC\uC694\uCCAD \uB300\uAE30 \uC0C1\uD55C");
  for (const [key2, until] of Object.entries(s.cooldowns)) ensure(w.npcs.some((n) => ["food", "clothing", "housing"].some((kind) => key2 === `${n.id}:${kind}`)) && until <= w.tick + 1296, "\uBD80\uD0C1 \uB300\uAE30 \uC8FC\uBBFC/\uC2DC\uAC04");
  for (const r of s.items) {
    register(r.id);
    ensure(/^request-\d+$/.test(r.id) && Number(r.id.slice(8)) < w.nextId, "\uBD80\uD0C1 ID");
    ensure(w.npcs.some((n) => n.id === r.npcId) && w.civilization.settlements.some((v) => v.id === r.settlementId) && w.buildings.some((b) => b.id === r.homeId && b.kind === "home" && b.settlementId === r.settlementId), "\uBD80\uD0C1 \uC8FC\uBBFC/\uB9C8\uC744/\uC8FC\uD0DD");
    ensure(!r.buildingId || w.buildings.some((b) => b.id === r.buildingId && b.settlementId === r.settlementId), "\uBD80\uD0C1 \uAC74\uBB3C");
    const source = events.get(r.sourceEventId);
    ensure(source?.tick === r.createdAt && source.data.phase === "offered" && r.createdAt >= s.since && r.createdAt <= w.tick && r.expiresAt === r.createdAt + 432, "\uBD80\uD0C1 \uCD9C\uCC98/\uAE30\uD55C");
    for (const id7 of [r.sourceEventId, r.lastEventId, r.decisionEventId, r.resultEventId].filter(Boolean)) {
      const e = events.get(id7);
      ensure(e?.kind === "request" && e.actorId === r.npcId && e.data.requestId === r.id && e.data.requestKind === r.kind, "\uBD80\uD0C1 \uC0AC\uAC74 \uCC38\uC870");
    }
    if (r.context) {
      ensure(Object.entries(r.context.metrics).every(([key2, value]) => source?.data[key2] === value), "\uBD80\uD0C1 \uBC30\uACBD \uC218\uCE58");
      ensure(r.context.evidence.length === new Set(r.context.evidence).size, "\uBD80\uD0C1 \uBC30\uACBD \uC911\uBCF5");
      for (const id7 of r.context.evidence) ensure(events.has(id7) && events.get(id7).tick <= r.createdAt, "\uBD80\uD0C1 \uBC30\uACBD \uADFC\uAC70");
      ensure(JSON.stringify(source?.data.evidence) === JSON.stringify(r.context.evidence) && JSON.stringify(source?.data.conditions) === JSON.stringify(r.context.facts), "\uBD80\uD0C1 \uBC30\uACBD \uAE30\uB85D \uC77C\uCE58");
    }
    ensure(r.followups === void 0 === (r.followupSince === void 0), "\uBD80\uD0C1 \uC7A5\uAE30 \uAD00\uCC30 \uC2DC\uC791");
    if (r.followups) {
      ensure(!!r.decisionEventId && r.followupSince <= w.tick && r.followupSince >= r.reviewAt - 12, "\uBD80\uD0C1 \uC7A5\uAE30 \uAD00\uCC30 \uC9C0\uC6D0");
      ensure(new Set(r.followups.map((f) => f.days)).size === r.followups.length, "\uBD80\uD0C1 \uC7A5\uAE30 \uAD00\uCC30 \uC911\uBCF5");
      let previous = -1;
      for (const f of r.followups) {
        const e = events.get(f.eventId);
        ensure(f.tick >= r.reviewAt - 12 + f.days * 144 && f.tick >= r.followupSince && f.tick <= w.tick && f.days > previous, "\uBD80\uD0C1 \uC7A5\uAE30 \uAD00\uCC30 \uC2DC\uAC04");
        previous = f.days;
        ensure(e?.kind === "request" && e.actorId === r.npcId && e.tick === f.tick && e.causeId === r.decisionEventId && e.data.requestId === r.id && e.data.phase === "followup" && e.data.days === f.days && e.data.needRemains === f.needRemains, "\uBD80\uD0C1 \uC7A5\uAE30 \uAD00\uCC30 \uC0AC\uAC74");
        ensure(Object.entries(f.metrics).every(([key2, value]) => e?.data[key2] === value) && JSON.stringify(e?.data.evidence) === JSON.stringify(f.evidence), "\uBD80\uD0C1 \uC7A5\uAE30 \uAD00\uCC30 \uC218\uCE58");
        ensure(new Set(f.evidence).size === f.evidence.length && f.evidence.every((id7) => events.has(id7) && events.get(id7).tick <= f.tick && events.get(id7).tick > r.reviewAt - 12), "\uBD80\uD0C1 \uC7A5\uAE30 \uAD00\uCC30 \uADFC\uAC70");
      }
    }
    if (r.followupStopped) {
      const e = events.get(r.followupStopped);
      ensure(!!r.followups && e?.kind === "request" && e.actorId === r.npcId && e.data.requestId === r.id && e.data.phase === "followup-stopped" && e.causeId === r.decisionEventId, "\uBD80\uD0C1 \uC7A5\uAE30 \uAD00\uCC30 \uC911\uB2E8");
    }
    const supported = !!r.decisionEventId;
    ensure(!r.choice || (r.choice === "decline" ? r.status === "declined" : { food: ["food", "farm"], clothing: ["clothes", "mend"], housing: ["repair", "expand"] }[r.kind].includes(r.choice)), "\uBD80\uD0C1 \uC120\uD0DD");
    ensure(supported === (!!r.choice && r.choice !== "decline"), "\uBD80\uD0C1 \uC120\uD0DD/\uC9C0\uC6D0 \uC0C1\uD0DC");
    ensure(supported === !!r.immediate && supported === !!r.reviewAt && (!supported || r.choice && r.choice !== "decline" && events.get(r.decisionEventId)?.tick === r.reviewAt - 12), "\uBD80\uD0C1 \uC9C0\uC6D0/\uAD00\uCC30");
    ensure(r.deferredUntil === void 0 || r.deferredUntil >= r.createdAt + 36 && r.deferredUntil <= w.tick + 36, "\uBD80\uD0C1 \uBBF8\uB8E8\uAE30 \uC2DC\uAC04");
    ensure(r.status !== "deferred" || r.deferredUntil !== void 0, "\uBD80\uD0C1 \uBBF8\uB8E8\uAE30 \uC0C1\uD0DC");
    ensure(r.status !== "observing" && r.status !== "completed" || supported, "\uBD80\uD0C1 \uAD00\uCC30 \uC0C1\uD0DC");
    ensure(activeRequest(r) ? !r.closedAt && !r.after && !r.resultEventId : r.closedAt !== void 0 && r.closedAt >= r.createdAt && r.closedAt <= w.tick && !!r.after && r.lastEventId === r.resultEventId && events.get(r.resultEventId)?.data.phase === r.status, "\uBD80\uD0C1 \uC885\uB8CC \uC0C1\uD0DC");
    ensure(r.status !== "completed" || r.closedAt >= r.reviewAt, "\uBD80\uD0C1 \uACB0\uACFC \uC2DC\uAC04");
  }
}

// ../../../..v0.21-source/src/sim/heritage-validation.ts
import { z as z6 } from "zod";
var nat = z6.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
var score4 = z6.number().min(0).max(100);
var id4 = z6.string().min(1).max(100);
var heritageSchema = z6.object({
  since: nat,
  habitats: z6.array(z6.object({ settlementId: id4, soil: score4, pasture: score4, livestock: nat.max(20), opening: nat.max(2), born: nat, lost: nat, harvest: nat, lastEventId: id4.optional() }).strict()).max(12),
  councils: z6.array(z6.object({ settlementId: id4, autonomous: z6.boolean(), groups: z6.array(z6.object({ kind: z6.enum(["livelihood", "care", "exchange"]), members: z6.array(id4).max(3e3), priority: z6.enum(SERVICES) }).strict()).max(3), lastEventId: id4.optional() }).strict()).max(12),
  accords: z6.array(z6.object({ from: id4, to: id4, trust: score4, tension: score4, status: z6.enum(["neutral", "cooperation", "dispute"]), deliveries: nat, reviewed: nat, lastEventId: id4.optional(), deliveryEventId: id4.optional() }).strict()).max(66)
}).strict();
function validateHeritage(w, ensure) {
  const h = w.heritage, villages = new Set(w.civilization.settlements.map((v) => v.id)), people = new Set(w.npcs.map((n) => n.id)), events = new Map(w.events.map((e) => [e.id, e]));
  ensure(h.since <= w.tick, "\uC0DD\uD0DC \uC2DC\uC791 \uB0A0\uC9DC");
  for (const list of [h.habitats, h.councils]) ensure(list.length === villages.size && new Set(list.map((x) => x.settlementId)).size === villages.size && list.every((x) => villages.has(x.settlementId)), "\uC0DD\uD0DC\xB7\uC758\uD68C \uC9C0\uC5ED \uCC38\uC870");
  for (const v of h.habitats) {
    ensure(v.livestock === v.opening + v.born - v.lost, "\uAC00\uCD95 \uBCF4\uC874");
    ensure(!v.lastEventId || events.get(v.lastEventId)?.kind === "ecology", "\uC0DD\uD0DC \uADFC\uAC70");
  }
  for (const c of h.councils) {
    ensure(!c.lastEventId || events.get(c.lastEventId)?.kind === "council", "\uC758\uD68C \uADFC\uAC70");
    const members = c.groups.flatMap((g) => g.members);
    ensure(new Set(members).size === members.length && members.every((id7) => people.has(id7)) && new Set(c.groups.map((g) => g.kind)).size === c.groups.length, "\uC8FC\uBBFC \uC9D1\uB2E8 \uC911\uBCF5\xB7\uCC38\uC870");
  }
  const pairs = /* @__PURE__ */ new Set();
  for (const r of h.accords) {
    const key2 = [r.from, r.to].sort().join(":");
    ensure(villages.has(r.from) && villages.has(r.to) && r.from !== r.to && !pairs.has(key2) && r.reviewed <= r.deliveries, "\uB3C4\uC2DC \uAD00\uACC4 \uCC38\uC870");
    pairs.add(key2);
    ensure(!r.lastEventId || events.get(r.lastEventId)?.kind === "diplomacy", "\uB3C4\uC2DC \uD611\uC57D \uADFC\uAC70");
    ensure(!r.deliveryEventId || events.get(r.deliveryEventId)?.kind === "freight", "\uB3C4\uC2DC \uAD50\uC5ED \uADFC\uAC70");
  }
  ensure(pairs.size === villages.size * (villages.size - 1) / 2, "\uB3C4\uC2DC \uAD00\uACC4 \uB204\uB77D");
}

// ../../../..v0.21-source/src/sim/urban-validation.ts
import { z as z7 } from "zod";
var nat2 = z7.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
var score5 = z7.number().min(0).max(100);
var id5 = z7.string().min(1).max(100);
var goods = z7.object(Object.fromEntries(GOODS.map((g) => [g, nat2]))).strict();
var services = z7.object({ road: nat2.max(3), water: nat2.max(3), sanitation: nat2.max(3), clinic: nat2.max(3), school: nat2.max(3) }).strict();
var deposits = z7.object({ stone: nat2, ore: nat2, clay: nat2, salt: nat2 }).strict();
var urbanSchema = z7.object({
  since: nat2,
  citizens: z7.record(z7.object({ education: score5, nutrition: score5, stress: score5, housing: score5, trust: score5, disease: score5, injury: score5, preference: score5, skills: z7.object({ field: score5, quarry: score5, mine: score5, mill: score5, smith: score5 }).strict(), employer: id5.optional(), healthEventId: id5.optional(), income: nat2, expenses: nat2 }).strict()),
  cities: z7.array(z7.object({ settlementId: id5, fertility: score5, deposits, initialDeposits: deposits, goods, treasury: nat2, taxRate: nat2.max(30), priority: z7.enum(SERVICES), services, active: services, pollution: score5, collected: nat2, spent: nat2, policyEventId: id5.optional(), lastEventId: id5.optional() }).strict()).max(12),
  enterprises: z7.array(z7.object({ id: id5, settlementId: id5, buildingId: id5, kind: z7.enum(INDUSTRIES), capacity: nat2.min(1).max(40), wage: nat2.min(1).max(20), workers: z7.array(id5).max(40), output: nat2, sourceEventId: id5.optional() }).strict()).max(480),
  freight: z7.array(z7.object({ id: id5, from: id5, to: id5, good: z7.enum(GOODS), amount: nat2.min(1), coins: nat2.min(1), fee: nat2.min(1), path: z7.array(z7.object({ x: nat2.max(191), y: nat2.max(191) }).strict()).max(16384), progress: nat2, sourceEventId: id5 }).strict()).max(1e3),
  buildings: z7.record(z7.object({ condition: score5, maintenance: nat2.min(1).max(20) }).strict()),
  ledger: z7.object({ opening: goods, produced: goods, consumed: goods }).strict(),
  samples: z7.array(z7.object({ tick: nat2, settlementId: id5, population: nat2.max(3e3), employed: nat2.max(3e3), housing: nat2, food: nat2, treasury: nat2, stress: score5, sick: nat2.max(3e3), eventId: id5 }).strict()).max(1080)
}).strict();
function validateUrban(w, ensure) {
  const u = w.urban, npcs = new Map(w.npcs.map((n) => [n.id, n])), buildings = new Map(w.buildings.map((b) => [b.id, b])), villages = new Set(w.civilization.settlements.map((v) => v.id)), events = new Map(w.events.map((e) => [e.id, e]));
  ensure(u.since <= w.tick, "\uB3C4\uC2DC \uD68C\uACC4 \uC2DC\uC791");
  ensure(Object.keys(u.citizens).length === npcs.size && Object.keys(u.citizens).every((id7) => npcs.has(id7)), "\uB3C4\uC2DC \uC8FC\uBBFC \uCC38\uC870");
  ensure(Object.keys(u.buildings).length === buildings.size && Object.keys(u.buildings).every((id7) => buildings.has(id7)), "\uB3C4\uC2DC \uAC74\uBB3C \uCC38\uC870");
  ensure(u.cities.length === villages.size && new Set(u.cities.map((c) => c.settlementId)).size === villages.size, "\uB3C4\uC2DC \uC911\uBCF5/\uB204\uB77D");
  for (const c of u.cities) {
    ensure(villages.has(c.settlementId) && c.treasury === c.collected - c.spent, "\uB3C4\uC2DC \uC608\uC0B0 \uBCF4\uC874");
    ensure(!c.lastEventId || events.has(c.lastEventId), "\uB3C4\uC2DC \uC6D0\uC778 \uC0AC\uAC74");
    ensure(!c.policyEventId || events.get(c.policyEventId)?.kind === "policy", "\uC815\uCC45 \uCD9C\uCC98");
    for (const key2 of MINERALS) ensure(c.deposits[key2] <= c.initialDeposits[key2], "\uB9E4\uC7A5 \uC790\uC6D0");
    for (const s of SERVICES) ensure(c.active[s] <= c.services[s], "\uACF5\uACF5 \uC11C\uBE44\uC2A4 \uC6A9\uB7C9");
  }
  for (const key2 of MINERALS) ensure(u.cities.reduce((s, c) => s + c.initialDeposits[key2] - c.deposits[key2], 0) === u.ledger.produced[key2], "\uCC44\uAD74 \uD68C\uACC4");
  const employed = /* @__PURE__ */ new Set(), ids = new Set([...w.npcs, ...w.buildings, ...w.resources, ...w.events, ...w.loans, ...w.civilization.journeys].map((x) => x.id));
  for (const e of u.enterprises) {
    ensure(!ids.has(e.id) && /^u\d+$/.test(e.id) && Number(e.id.slice(1)) < w.nextId, "\uC0AC\uC5C5\uCCB4 ID");
    ids.add(e.id);
    ensure(villages.has(e.settlementId) && buildings.get(e.buildingId)?.settlementId === e.settlementId && e.workers.length <= e.capacity && (!e.sourceEventId || events.has(e.sourceEventId)), "\uC0AC\uC5C5\uCCB4 \uC704\uCE58/\uC815\uC6D0/\uCD9C\uCC98");
    for (const id7 of e.workers) {
      ensure(npcs.get(id7)?.alive && npcs.get(id7).identity.age >= 18 && npcs.get(id7).settlementId === e.settlementId && !employed.has(id7) && u.citizens[id7].employer === e.id, "\uACE0\uC6A9 \uC911\uBCF5/\uCC38\uC870");
      employed.add(id7);
    }
  }
  for (const [id7, c] of Object.entries(u.citizens)) {
    ensure(!c.employer || employed.has(id7), "\uADFC\uB85C\uC790 \uACE0\uC6A9 \uCC38\uC870");
    ensure(!c.healthEventId || events.get(c.healthEventId)?.kind === "health" && events.get(c.healthEventId)?.actorId === id7, "\uAC74\uAC15 \uC0AC\uAC74 \uCD9C\uCC98");
  }
  for (const f of u.freight) {
    ensure(!ids.has(f.id) && /^u\d+$/.test(f.id) && Number(f.id.slice(1)) < w.nextId, "\uD654\uBB3C ID");
    ids.add(f.id);
    ensure(villages.has(f.from) && villages.has(f.to) && f.from !== f.to && f.progress <= f.path.length && events.get(f.sourceEventId)?.kind === "freight", "\uC6B4\uC1A1 \uCC38\uC870");
    const from = w.civilization.settlements.find((v) => v.id === f.from), to = w.civilization.settlements.find((v) => v.id === f.to);
    ensure(f.path.length > 0 && distance(from.center, f.path[0]) === 1 && distance(to.center, f.path.at(-1)) === 0 && f.path.every((p, i) => walkable(w, p) && (!i || distance(f.path[i - 1], p) === 1)), "\uD654\uBB3C \uACBD\uB85C");
  }
  for (const s of u.samples) ensure(s.tick <= w.tick && villages.has(s.settlementId) && events.get(s.eventId)?.kind === "urban" && events.get(s.eventId)?.tick === s.tick && s.employed <= s.population && s.sick <= s.population, "\uB3C4\uC2DC \uD45C\uBCF8/\uCD9C\uCC98");
  ensure(Object.values(urbanBalance(w)).every((n) => n === 0), "\uC0B0\uC5C5 \uC790\uC6D0 \uD68C\uACC4 \uBCF4\uC874");
}

// ../../../..v0.21-source/src/sim/validation.ts
import { z as z8 } from "zod";
var natural2 = z8.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
var id6 = z8.string().min(1).max(100);
var description = z8.string().max(2e3);
var score6 = z8.number().min(0).max(100);
var pos = z8.object({ x: natural2.max(191), y: natural2.max(191) }).strict();
var resources = z8.object({ food: natural2, wood: natural2 }).strict();
var goalKind = z8.enum(GOAL_KINDS);
var actionKind = z8.enum(["Attend", "Wash", "Idle", "Move", "Sleep", "Eat", "Drink", "Gather", "Work", "Talk", "StoreItem", "TakeItem", "Share", "Theft", "Trade", "Borrow", "Repay"]);
var candidate = z8.object({ kind: actionKind, score: z8.number().finite(), reason: description, target: pos, targetId: id6.optional(), evidence: z8.array(id6).max(12).optional() }).strict();
var action = candidate.extend({ path: z8.array(pos).max(16384), progress: natural2, duration: natural2.min(1).max(100) }).strict();
var relationship2 = z8.object({ npcId: id6, familiarity: score6, trust: score6, affection: score6, fear: score6, resentment: score6, respect: score6, family: z8.boolean(), interpretation: description, evidence: z8.array(id6) }).strict();
var memory = z8.object({ id: id6, type: z8.enum(["personal", "social", "event", "economic", "trauma", "achievement"]), description, importance: score6, emotionalImpact: z8.number().min(-100).max(100), createdAt: natural2, lastRetrievedAt: natural2.optional(), relatedNpcIds: z8.array(id6), relatedLocationIds: z8.array(id6), sourceEventId: id6, repetitions: natural2.min(1) }).strict();
var npc = z8.object({
  cognition: cognitionSchema.optional(),
  profile: profileSchema.optional(),
  id: id6,
  identity: z8.object({ name: z8.string().min(1).max(80), age: natural2.max(150) }).strict(),
  position: pos,
  homeId: id6,
  settlementId: id6,
  life: z8.object({ bornTick: z8.number().int().min(-3e5).max(Number.MAX_SAFE_INTEGER), parentIds: z8.array(id6).max(2), partnerId: id6.optional(), generation: natural2.max(1e3), skill: score6, lastBirth: natural2, lastMove: natural2, deathTick: natural2.optional(), birthEventId: id6.optional(), deathEventId: id6.optional(), estateSettled: z8.boolean() }).strict(),
  previousOccupation: z8.enum(Object.keys(OCCUPATIONS)).optional(),
  occupation: z8.enum(Object.keys(OCCUPATIONS)),
  alive: z8.boolean(),
  needs: z8.object({ hunger: score6, thirst: score6, fatigue: score6, health: score6, safety: score6, social: score6 }).strict(),
  personality: z8.object({ diligence: score6, greed: score6, sociability: score6, aggression: score6, empathy: score6, curiosity: score6 }).strict(),
  inventory: resources,
  wealth: natural2,
  relationships: z8.array(relationship2).max(3e4),
  memories: z8.array(memory).max(40),
  goals: z8.array(z8.object({ id: id6, kind: goalKind, reason: description, createdAt: natural2, sourceEventId: id6.optional() }).strict()).max(4),
  currentAction: action.optional(),
  decision: z8.object({ reason: description, candidates: z8.array(candidate).max(6), tick: natural2 }).strict(),
  dailyTaken: natural2.max(3),
  lastTalk: z8.number().int().min(-1e3),
  knownRumors: z8.array(id6)
}).strict();
var event = z8.object({ id: id6, tick: natural2, kind: z8.enum(["arrival", "production", "consumption", "storage", "trade", "loan", "repayment", "default", "share", "theft", "witness", "rumor", "talk", "scarcity", "health", "death", "weather", "relationship", "memory", "goal", "llm", "experiment", "failure", "project", "wage", "price", "family", "birth", "coming_of_age", "inheritance", "education", "construction", "settlement", "migration", "caravan", "occupation", "industry", "public_service", "tax", "urban", "policy", "freight", "ecology", "council", "diplomacy", "request", "gathering"]), actorId: id6.optional(), targetId: id6.optional(), locationId: id6.optional(), participants: z8.array(id6).max(3e4), importance: score6, description, causeId: id6.optional(), data: z8.record(z8.union([z8.string().max(1e4), z8.number().finite(), z8.boolean(), z8.array(id6)])) }).strict();
var flow = z8.object({ producedFood: natural2, producedWood: natural2, consumedFood: natural2, investedWood: natural2, externalFood: natural2, trades: natural2, tradeVolume: natural2, wages: natural2 }).strict();
var economy = z8.object({
  arrivals: resources.extend({ coins: natural2 }).strict().optional(),
  since: natural2,
  openingFood: natural2,
  openingWood: natural2,
  openingCoins: natural2,
  totals: flow,
  last: flow.extend({ shares: natural2, conflicts: natural2 }).strict(),
  daily: z8.array(flow.extend({ day: natural2.min(1), tick: natural2, population: natural2.max(3e3), food: natural2, storageFood: natural2, foodPrice: natural2.min(1).max(12), coins: natural2, poorest: natural2, median: z8.number().finite().nonnegative(), richest: natural2, shares: natural2, conflicts: natural2, eventId: id6 }).strict()).max(1e4)
}).strict();
var world = z8.object({
  gatherings: gatheringsSchema.optional(),
  version: z8.literal(9),
  observation: z8.object({ watchIds: z8.array(z8.string().min(1).max(100)).max(12) }).strict(),
  requests: requestsSchema,
  living: livingSchema,
  heritage: heritageSchema,
  urban: urbanSchema,
  seed: natural2.max(4294967295),
  rng: natural2.min(1).max(4294967295),
  tick: natural2,
  nextId: natural2.min(1),
  width: natural2.min(8).max(192),
  height: natural2.min(8).max(128),
  tiles: z8.array(z8.enum(["grass", "water", "path", "forest", "rock", "farm"])).max(24576),
  buildings: z8.array(z8.object({ id: id6, kind: z8.enum(["home", "storage", "farm", "market", "well"]), name: description, position: pos, level: natural2.min(1).max(4), growth: z8.number().min(0).max(120), settlementId: id6, ownerIds: z8.array(id6).max(3e4).optional() }).strict()).max(4e3),
  resources: z8.array(z8.object({ id: id6, position: pos, kind: z8.enum(["food", "wood"]), amount: natural2, capacity: natural2.min(1) }).strict()).max(1e3),
  npcs: z8.array(npc).min(10).max(3e4),
  storage: resources,
  market: resources.extend({ coins: natural2, foodPrice: natural2.min(1).max(12), woodPrice: natural2.min(1).max(3) }).strict(),
  weather: z8.enum(["sunny", "rain", "cloudy", "drought"]),
  droughtUntil: natural2,
  civilization: z8.object({ settlements: z8.array(z8.object({ id: id6, name: description, center: pos, foundedAt: natural2, sourceEventId: id6.optional(), storage: resources, market: resources.extend({ coins: natural2, foodPrice: natural2.min(1).max(12), woodPrice: natural2.min(1).max(3) }).strict() }).strict()).min(1).max(12), journeys: z8.array(z8.object({ id: id6, kind: z8.enum(["migration", "trade"]), from: id6, to: id6, npcIds: z8.array(id6).max(3e3), path: z8.array(pos).max(16384), progress: natural2, food: natural2, coins: natural2, sourceEventId: id6, homeId: id6.optional() }).strict()).max(1e3), focus: id6, detail: z8.enum(["full", "focused"]) }).strict(),
  economy,
  events: z8.array(event).max(1e6),
  loans: z8.array(z8.object({ id: id6, lenderId: id6, borrowerId: id6, amount: natural2.min(1), remaining: natural2, due: natural2, status: z8.enum(["active", "repaid", "defaulted"]), sourceEventId: id6 }).strict()),
  llm: z8.object({ enabled: z8.boolean(), queue: z8.array(z8.object({ id: id6, npcId: id6, eventId: id6, tick: natural2, attempts: natural2.max(2) }).strict()).max(24), gateKeys: z8.array(z8.string().max(150)).max(12), dailyByNpc: z8.record(natural2.max(2)), dailyTotal: natural2.max(12), requested: natural2, completed: natural2, rejected: natural2, failed: natural2 }).strict(),
  stats: z8.object({ foodSum: z8.number().finite().nonnegative(), samples: natural2, deaths: natural2.max(3e4), thefts: natural2, shares: natural2, conflicts: natural2 }).strict()
}).strict();
function validateSave(input) {
  if (input && typeof input === "object" && input.version === 1) {
    const legacy = structuredClone(input);
    try {
      legacy.version = 2;
      legacy.loans = legacy.loans.map((l) => ({ ...l, remaining: l.status === "repaid" ? 0 : l.amount }));
      legacy.economy = createEconomy(legacy);
      input = legacy;
    } catch {
      throw new Error("\uC800\uC7A5 \uD30C\uC77C \uD615\uC2DD \uC624\uB958: \uC774\uC804 \uBC84\uC804\uC758 \uC138\uACC4 \uB370\uC774\uD130\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
    }
  }
  if (input && typeof input === "object" && input.version === 2) {
    const legacy = structuredClone(input);
    try {
      initializeCivilization(legacy);
      legacy.version = 3;
      input = legacy;
    } catch {
      throw new Error("\uC800\uC7A5 \uD30C\uC77C \uD615\uC2DD \uC624\uB958: \uC774\uC804 \uC138\uACC4\uC758 \uC0DD\uC560\xB7\uB9C8\uC744 \uBCC0\uD658\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
    }
  }
  if (input && typeof input === "object" && input.version === 3) {
    const legacy = structuredClone(input);
    try {
      initializeUrban(legacy);
      legacy.version = 4;
      input = legacy;
    } catch {
      throw new Error("\uC800\uC7A5 \uD30C\uC77C \uD615\uC2DD \uC624\uB958: \uB3C4\uC2DC \uBCC0\uD658\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
    }
  }
  if (input && typeof input === "object" && input.version === 4) {
    const legacy = structuredClone(input);
    try {
      initializeHeritage(legacy);
      legacy.version = 5;
      input = legacy;
    } catch {
      throw new Error("\uC800\uC7A5 \uD30C\uC77C \uD615\uC2DD \uC624\uB958: \uC0DD\uD0DC\xB7\uC0AC\uD68C \uBCC0\uD658\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
    }
  }
  if (input && typeof input === "object" && input.version === 5) {
    const legacy = structuredClone(input);
    try {
      migrateLiving(legacy);
      legacy.version = 6;
      input = legacy;
    } catch {
      throw new Error("\uC800\uC7A5 \uD30C\uC77C \uD615\uC2DD \uC624\uB958: \uC0DD\uD65C \uB2E4\uC591\uC131 \uBCC0\uD658\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
    }
  }
  if (input && typeof input === "object" && input.version === 6) {
    const legacy = structuredClone(input);
    try {
      migrateResources(legacy);
      legacy.version = 7;
      input = legacy;
    } catch {
      throw new Error("\uC800\uC7A5 \uD30C\uC77C \uD615\uC2DD \uC624\uB958: \uC790\uC6D0\xB7\uACE0\uC6A9 \uC0C1\uD0DC \uBCC0\uD658\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
    }
  }
  if (input && typeof input === "object" && input.version === 7) {
    const legacy = structuredClone(input);
    legacy.version = 8;
    legacy.requests = emptyRequests(legacy.tick);
    input = legacy;
  }
  if (input && typeof input === "object" && input.version === 8) {
    const legacy = structuredClone(input);
    if (!Array.isArray(legacy.requests?.items) || legacy.requests.items.some((r) => !r || typeof r !== "object")) throw new Error("\uC800\uC7A5 \uD30C\uC77C \uD615\uC2DD \uC624\uB958: \uC774\uC804 \uBD80\uD0C1 \uC0C1\uD0DC\uB97C \uC77D\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    for (const r of legacy.requests.items) if (r.decisionEventId && r.status !== "cancelled") {
      r.followups = [];
      r.followupSince = legacy.tick;
    }
    legacy.version = 9;
    legacy.observation = { watchIds: [] };
    input = legacy;
  }
  const parsed = world.safeParse(input);
  if (!parsed.success) throw new Error(`\uC800\uC7A5 \uD30C\uC77C \uD615\uC2DD \uC624\uB958: ${parsed.error.issues[0].path.join(".")} (${parsed.error.issues[0].message})`);
  const w = parsed.data;
  const ensure = (condition, message) => {
    if (!condition) throw new Error(`\uC800\uC7A5 \uD30C\uC77C \uBB34\uACB0\uC131 \uC624\uB958: ${message}`);
  };
  ensure(w.tiles.length === w.width * w.height, "\uC9C0\uB3C4 \uD06C\uAE30");
  const ids = /* @__PURE__ */ new Set(), events = new Map(w.events.map((e) => [e.id, e])), npcs = new Set(w.npcs.map((n) => n.id)), buildings = new Map(w.buildings.map((b) => [b.id, b]));
  const register = (value) => {
    ensure(!ids.has(value), `\uC911\uBCF5 ID ${value}`);
    ids.add(value);
    if (/^[emqlgcj]\d+$/.test(value)) ensure(Number(value.slice(1)) < w.nextId, "\uB2E4\uC74C ID");
  };
  [...w.buildings, ...w.resources, ...w.npcs, ...w.events, ...w.loans, ...w.llm.queue].forEach((v) => register(v.id));
  ensure(new Set(w.observation.watchIds).size === w.observation.watchIds.length && w.observation.watchIds.every((id7) => npcs.has(id7)), "\uAD00\uC2EC \uC8FC\uBBFC \uC911\uBCF5/\uCC38\uC870");
  const villages = new Set(w.civilization.settlements.map((v) => v.id));
  ensure(villages.size === w.civilization.settlements.length && villages.has("v0") && villages.has(w.civilization.focus), "\uB9C8\uC744 ID/\uAD00\uCC30 \uB300\uC0C1");
  ensure(w.npcs.filter((n) => n.alive).length <= 3e3, "\uC0DD\uC874 \uC778\uAD6C \uC0C1\uD55C");
  for (const v of w.civilization.settlements) {
    register(v.id);
    ensure(walkable(w, v.center) && v.foundedAt <= w.tick && (!v.sourceEventId || events.has(v.sourceEventId)), "\uC815\uCC29\uC9C0 \uC704\uCE58/\uCD9C\uCC98");
    if (v.id === "v0") ensure(v.storage.food + v.storage.wood + v.market.food + v.market.wood + v.market.coins === 0, "\uC911\uC559 \uC7AC\uACE0 \uC911\uBCF5");
  }
  for (const b of w.buildings) {
    ensure(walkable(w, b.position) && villages.has(b.settlementId), "\uAC74\uBB3C \uC704\uCE58/\uB9C8\uC744");
    ensure(!b.ownerIds || new Set(b.ownerIds).size === b.ownerIds.length && b.ownerIds.every((id7) => npcs.has(id7)), "\uC8FC\uD0DD \uC18C\uC720\uAD8C");
  }
  const travellers = /* @__PURE__ */ new Set();
  for (const j of w.civilization.journeys) {
    register(j.id);
    ensure(villages.has(j.from) && villages.has(j.to) && j.from !== j.to && events.has(j.sourceEventId) && j.progress <= j.path.length, "\uC774\uB3D9 \uCD9C\uCC98/\uB9C8\uC744/\uC9C4\uD589");
    ensure(j.path.every((p, i) => walkable(w, p) && (!i || distance(j.path[i - 1], p) === 1)), "\uC774\uB3D9 \uACBD\uB85C");
    for (const id7 of j.npcIds) {
      ensure(npcs.has(id7) && !travellers.has(id7), "\uC774\uC8FC \uC8FC\uBBFC \uC911\uBCF5");
      travellers.add(id7);
    }
    if (j.kind === "migration") {
      const person2 = w.npcs.find((n) => n.id === j.npcIds[0]);
      const target = buildings.get(j.homeId);
      ensure(person2 && person2.settlementId === j.from && target && (!j.path.length || distance(j.path.at(-1), target.position) === 0) && (j.progress === j.path.length || distance(person2.position, j.path[j.progress]) === 1), "\uC774\uC8FC \uACBD\uB85C\uC640 \uD604\uC7AC \uC704\uCE58");
      ensure(j.npcIds.length === 1 && buildings.get(j.homeId)?.kind === "home" && buildings.get(j.homeId)?.settlementId === j.to && j.food === 0 && j.coins === 0, "\uC774\uC8FC \uC8FC\uD0DD/\uD654\uBB3C");
    } else ensure(j.npcIds.length === 0 && !j.homeId && j.food > 0 && j.coins > 0, "\uAD50\uC5ED \uD654\uBB3C");
  }
  for (const kind of ["farm", "storage", "market", "well", "home"]) ensure(w.buildings.some((b) => b.kind === kind), `\uD544\uC218 \uAC74\uBB3C ${kind}`);
  for (const r of w.resources) {
    ensure(walkable(w, r.position), "\uC790\uC6D0 \uC704\uCE58");
    ensure(r.amount <= r.capacity, "\uC790\uC6D0 \uC6A9\uB7C9");
  }
  let lastTick = 0;
  const seenEvents = /* @__PURE__ */ new Set();
  for (const e of w.events) {
    ensure(e.tick >= lastTick && e.tick <= w.tick, "\uC0AC\uAC74 \uC2DC\uAC04");
    lastTick = e.tick;
    ensure(!e.causeId || seenEvents.has(e.causeId), "\uC0AC\uAC74 \uC6D0\uC778");
    ensure(!Array.isArray(e.data.evidence) || e.data.evidence.every((id7) => seenEvents.has(id7)), "\uC120\uD0DD \uC0AC\uAC74 \uADFC\uAC70");
    seenEvents.add(e.id);
    ensure(!e.actorId || npcs.has(e.actorId), "\uC0AC\uAC74 \uD589\uC704\uC790");
    ensure(!e.targetId || npcs.has(e.targetId), "\uC0AC\uAC74 \uB300\uC0C1");
    ensure(!e.locationId || buildings.has(e.locationId), "\uC0AC\uAC74 \uC704\uCE58");
    ensure(e.participants.every((n) => npcs.has(n)), "\uC0AC\uAC74 \uCC38\uC5EC\uC790");
  }
  for (const n of w.npcs) {
    validateCognition(w, n, events, ensure);
    if (n.profile) ensure(n.profile.createdAt <= w.tick && events.get(n.profile.arrivalEventId)?.tick === n.profile.createdAt && events.get(n.profile.arrivalEventId)?.actorId === n.id && events.get(n.profile.arrivalEventId)?.kind === "arrival" && events.get(n.profile.arrivalEventId)?.data.createdCharacter === true, "\uC0DD\uC131 \uC8FC\uBBFC \uCD9C\uCC98");
    if (n.id.startsWith("npc-created-")) ensure(Number(n.id.slice(12)) < w.nextId, "\uC0DD\uC131 ID \uC21C\uC11C");
    if (n.id.startsWith("npc-born-")) ensure(Number(n.id.slice(9)) < w.nextId, "\uCD9C\uC0DD ID \uC21C\uC11C");
    ensure(walkable(w, n.position) && buildings.get(n.homeId)?.kind === "home", "\uC8FC\uBBFC \uC704\uCE58/\uC9D1");
    ensure(villages.has(n.settlementId) && buildings.get(n.homeId)?.settlementId === n.settlementId, "\uC8FC\uBBFC \uC18C\uC18D \uB9C8\uC744");
    ensure(n.life.bornTick <= w.tick && n.life.lastBirth <= w.tick && n.life.lastMove <= w.tick, "\uC0DD\uC560 \uC2DC\uAC04");
    ensure(new Set(n.life.parentIds).size === n.life.parentIds.length && n.life.parentIds.every((id7) => id7 !== n.id && w.npcs.some((p) => p.id === id7 && p.life.bornTick < n.life.bornTick && p.life.generation < n.life.generation)), "\uBD80\uBAA8/\uC138\uB300 \uCC38\uC870");
    ensure(!n.life.partnerId || w.npcs.some((p) => p.id === n.life.partnerId && p.id !== n.id && p.alive && n.alive && p.life.partnerId === n.id), "\uBC30\uC6B0\uC790 \uCC38\uC870");
    ensure(!n.life.birthEventId || events.get(n.life.birthEventId)?.kind === "birth" && events.get(n.life.birthEventId)?.actorId === n.id && events.get(n.life.birthEventId)?.tick === n.life.bornTick, "\uCD9C\uC0DD \uCD9C\uCC98");
    ensure(!n.life.deathEventId || !n.alive && events.get(n.life.deathEventId)?.kind === "death" && events.get(n.life.deathEventId)?.actorId === n.id && events.get(n.life.deathEventId)?.tick === n.life.deathTick, "\uC0AC\uB9DD \uCD9C\uCC98");
    ensure(n.life.estateSettled === !n.alive && (n.life.deathTick === void 0 || !n.alive && n.life.deathTick <= w.tick), "\uC0C1\uC18D/\uC0AC\uB9DD \uC0C1\uD0DC");
    ensure(n.alive === n.needs.health > 0, "\uC0DD\uC874 \uC0C1\uD0DC");
    ensure(n.alive || !n.currentAction, "\uC0AC\uB9DD \uC8FC\uBBFC \uD589\uB3D9");
    ensure(n.decision.tick <= w.tick && n.lastTalk <= w.tick, "\uD310\uB2E8 \uC2DC\uAC04");
    ensure(new Set(n.relationships.map((r) => r.npcId)).size === n.relationships.length, "\uC911\uBCF5 \uAD00\uACC4");
    for (const r of n.relationships) ensure(r.npcId !== n.id && npcs.has(r.npcId) && r.evidence.every((e) => events.has(e)), "\uAD00\uACC4 \uB300\uC0C1/\uCD9C\uCC98");
    for (const m of n.memories) {
      register(m.id);
      ensure(events.has(m.sourceEventId) && m.createdAt <= w.tick && m.relatedNpcIds.every((id7) => npcs.has(id7)) && m.relatedLocationIds.every((id7) => buildings.has(id7)), "\uAE30\uC5B5 \uCD9C\uCC98");
    }
    for (const g of n.goals) {
      register(g.id);
      ensure(g.createdAt <= w.tick && (!g.sourceEventId || events.has(g.sourceEventId)), "\uBAA9\uD45C \uCD9C\uCC98");
    }
    ensure(n.knownRumors.every((id7) => {
      const seen = events.get(id7);
      return seen?.kind === "witness" && seen.causeId && events.get(seen.causeId)?.kind === "theft";
    }), "\uC18C\uBB38 \uCD9C\uCC98");
    for (const c of n.decision.candidates) ensure(!c.evidence || c.evidence.every((id7) => events.has(id7)), "\uD310\uB2E8 \uD6C4\uBCF4 \uADFC\uAC70");
    if (n.currentAction) {
      const a = n.currentAction;
      let previous = n.position;
      for (const p of a.path) {
        ensure(walkable(w, p) && distance(previous, p) === 1, "\uC774\uB3D9 \uACBD\uB85C");
        previous = p;
      }
      ensure(distance(previous, a.target) === 0 && walkable(w, a.target) && a.progress < a.duration, "\uD589\uB3D9 \uC9C4\uD589");
      const buildingKinds = { Sleep: "home", Wash: "well", Drink: "well", StoreItem: "storage", TakeItem: "storage", Theft: "storage" };
      if (buildingKinds[a.kind]) ensure(w.buildings.some((b) => b.kind === buildingKinds[a.kind] && distance(b.position, a.target) === 0), "\uD589\uB3D9 \uAC74\uBB3C");
      if (a.kind === "Gather") ensure(w.resources.some((r) => r.id === a.targetId && distance(r.position, a.target) === 0), "\uCC44\uC9D1 \uB300\uC0C1");
      if (a.kind === "Work") ensure(w.buildings.some((b) => b.id === (a.targetId?.startsWith("industry:") ? a.targetId.slice(9) : a.targetId?.split(":")[0]) && distance(b.position, a.target) === 0), "\uC791\uC5C5 \uB300\uC0C1");
      if (["Share", "Talk", "Borrow"].includes(a.kind)) ensure(a.targetId && a.targetId !== n.id && npcs.has(a.targetId), "\uC0AC\uD68C \uD589\uB3D9 \uB300\uC0C1");
      if (a.kind === "Repay") ensure(w.loans.some((l) => l.id === a.targetId && l.borrowerId === n.id), "\uC0C1\uD658 \uB300\uC0C1");
      if (a.kind === "Trade") {
        if (a.targetId?.startsWith("peer:")) ensure(npcs.has(a.targetId.slice(5)) && a.targetId.slice(5) !== n.id, "\uC8FC\uBBFC \uAC70\uB798 \uB300\uC0C1");
        else if (a.targetId?.startsWith("goods:")) ensure(CONSUMABLES.some((g) => a.targetId === `goods:${g}`) && w.buildings.some((b) => b.kind === "market" && b.settlementId === n.settlementId && distance(b.position, a.target) === 0), "\uC0DD\uD65C \uC0C1\uD488 \uAC70\uB798 \uB300\uC0C1");
        else ensure((a.targetId === "buy" || a.targetId === "sell") && w.buildings.some((b) => b.kind === "market" && distance(b.position, a.target) === 0), "\uAC70\uB798 \uC720\uD615/\uC2DC\uC7A5");
      }
      ensure(!a.evidence || a.evidence.every((id7) => events.has(id7)), "\uD589\uB3D9 \uD310\uB2E8 \uADFC\uAC70");
    }
  }
  for (const l of w.loans) ensure(l.borrowerId !== l.lenderId && npcs.has(l.borrowerId) && npcs.has(l.lenderId) && events.get(l.sourceEventId)?.kind === "loan" && l.remaining <= l.amount && (l.status === "repaid" ? l.remaining === 0 : l.remaining > 0), "\uB300\uC5EC \uACC4\uC57D");
  for (const q of w.llm.queue) ensure(npcs.has(q.npcId) && events.get(q.eventId)?.participants.includes(q.npcId) && q.tick <= w.tick, "LLM \uC694\uCCAD \uCD9C\uCC98");
  ensure(Object.keys(w.llm.dailyByNpc).every((id7) => npcs.has(id7)), "LLM \uC608\uC0B0 \uC8FC\uBBFC");
  ensure(Object.values(balance(w)).every((v) => v === 0), "\uC790\uC6D0/\uD654\uD3D0 \uD68C\uACC4 \uBCF4\uC874");
  ensure(w.economy.since <= w.tick, "\uD68C\uACC4 \uC2DC\uC791 \uC2DC\uAC04");
  let sampleTick = w.economy.since;
  for (const d of w.economy.daily) {
    ensure(d.tick > sampleTick && d.tick <= w.tick && d.tick % 144 === 0 && d.day === d.tick / 144 && events.get(d.eventId)?.kind === "price" && events.get(d.eventId)?.tick === d.tick && events.get(d.eventId)?.data.price === d.foodPrice, "\uC77C\uBCC4 \uD45C\uBCF8/\uCD9C\uCC98");
    sampleTick = d.tick;
    ensure(d.poorest <= d.median && d.median <= d.richest, "\uC7AC\uC0B0 \uBD84\uD3EC");
  }
  for (const key2 of Object.keys(w.economy.totals)) ensure(w.economy.last[key2] <= w.economy.totals[key2], "\uD68C\uACC4 \uB204\uC801\uB7C9");
  ensure(w.living.since <= w.tick, "\uC0DD\uD65C \uC0C1\uD0DC \uC2DC\uC791 \uC2DC\uAC04");
  ensure(Object.keys(w.living.people).length === npcs.size && Object.keys(w.living.people).every((id7) => npcs.has(id7)), "\uC0DD\uD65C \uC8FC\uBBFC \uCC38\uC870");
  ensure(Object.keys(w.living.homes).length === w.buildings.filter((b) => b.kind === "home").length && Object.keys(w.living.homes).every((id7) => buildings.get(id7)?.kind === "home"), "\uC8FC\uAC70 \uC720\uD615 \uCC38\uC870");
  validateGatherings(w, ensure, register);
  validateRequests(w, ensure, register);
  validateUrban(w, ensure);
  validateHeritage(w, ensure);
  return structuredClone(input);
}
var interpretation = z8.object({
  newGoals: z8.array(z8.object({ kind: goalKind, reason: z8.string().min(1).max(300) }).strict()).max(2),
  interpretation: z8.string().min(1).max(600),
  relationshipInterpretations: z8.array(z8.object({ npcId: id6, meaning: z8.string().min(1).max(300) }).strict()).max(4)
}).strict();
function validateInterpretation(input) {
  const result = interpretation.safeParse(input);
  return result.success ? result.data : null;
}

// ../../../..v0.21-source/src/sim/engine.ts
var Simulation = class _Simulation {
  state;
  constructor(seed = 42, population = 12) {
    this.state = createWorld(seed, population);
    appendEvent(this.state, { kind: "weather", importance: 20, description: "\uBD04\uC758 \uCCAB \uC544\uCE68. \uC791\uC740 \uB9C8\uC744\uC758 \uD558\uB8E8\uAC00 \uC2DC\uC791\uB418\uC5C8\uC2B5\uB2C8\uB2E4." });
    updateRequests(this.state);
  }
  static load(json) {
    if (json.length > 15e7) throw new Error("\uC800\uC7A5 \uD30C\uC77C\uC774 \uB108\uBB34 \uD07D\uB2C8\uB2E4.");
    const state = validateSave(JSON.parse(json));
    const sim = new _Simulation();
    sim.state = state;
    return sim;
  }
  respondToRequest(id7, choice) {
    respondToRequest(this.state, id7, choice);
  }
  watchResident(id7, enabled) {
    const ids = this.state.observation.watchIds;
    if (!this.state.npcs.some((n) => n.id === id7)) throw new Error("\uAD00\uC2EC \uC8FC\uBBFC\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    if (enabled && !ids.includes(id7)) {
      if (ids.length >= 12) throw new Error("\uAD00\uC2EC \uC8FC\uBBFC\uC740 \uCD5C\uB300 12\uBA85\uC785\uB2C8\uB2E4.");
      ids.push(id7);
    }
    if (!enabled) this.state.observation.watchIds = ids.filter((value) => value !== id7);
  }
  snapshot() {
    return structuredClone(this.state);
  }
  save() {
    return JSON.stringify(this.state);
  }
  get tick() {
    return this.state.tick;
  }
  get pending() {
    return this.state.llm.queue.length;
  }
  setDetail(focus, detail) {
    if (!this.state.civilization.settlements.some((v) => v.id === focus)) throw new Error("\uAD00\uCC30\uD560 \uB9C8\uC744\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
    this.state.civilization.focus = focus;
    this.state.civilization.detail = detail;
  }
  createCharacter(input, commandId) {
    const n = createCharacter(this.state, input);
    if (commandId) n.profile.commandId = commandId;
    return n.id;
  }
  setCouncil(id7, enabled) {
    setCouncil(this.state, id7, enabled);
  }
  setPolicy(id7, taxRate, priority) {
    setPolicy(this.state, id7, taxRate, priority);
  }
  recordHistory(topic, evidence2, requestId, model) {
    const context = historyContext(this.state.events.filter((e) => evidence2.includes(e.id)), topic);
    if (!validateHistorySelection({ evidence: evidence2 }, context)) return false;
    appendEvent(this.state, { kind: "llm", importance: 55, description: `\uC5ED\uC0AC \uAD00\uCC30 \xB7 \uBAA8\uB378\uC774 \uACE0\uB978 \uADFC\uAC70 ${evidence2.length}\uAC74. \uC6D0\uBB38 \uC0AC\uAC74\uC744 \uD568\uAED8 \uD655\uC778\uD558\uC138\uC694.`, data: { history: true, topic, evidence: evidence2, requestId, model } });
    return true;
  }
  setLLM(enabled) {
    this.state.llm.enabled = enabled;
    if (!enabled) this.state.llm.queue = [];
  }
  step(count = 1, motion) {
    if (!Number.isInteger(count) || count < 1 || count > 1e6) throw new Error("\uD2F1 \uC218\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
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
  tickOnce() {
    const w = this.state;
    w.tick++;
    if (w.tick % TICKS_PER_DAY === 0) this.newDay();
    advanceJourneys(w);
    advanceFreight(w);
    indexPeople(w);
    proposeGatherings(w);
    for (const farm of w.buildings.filter((b) => b.kind === "farm")) farm.growth = Math.min(120, farm.growth + (w.weather === "drought" ? 0.025 : w.weather === "rain" ? 0.24 : 0.14) * (1 + (farm.level - 1) * 0.35) * (city(w, farm.settlementId)?.fertility ?? 70) / 70 * (w.urban.buildings[farm.id]?.condition ?? 100) / 100 * cropMultiplier(w, farm.settlementId));
    for (let i = 0; i < w.npcs.length; i++) {
      const n = w.npcs[(i + w.tick) % w.npcs.length];
      if (!n.alive) continue;
      n.needs.hunger = clamp(n.needs.hunger + (n.identity.age < 18 ? 0.4 : 0.8));
      n.needs.thirst = clamp(n.needs.thirst + (w.weather === "drought" ? 0.8 : 0.5));
      n.needs.fatigue = clamp(n.needs.fatigue + (n.currentAction?.kind === "Sleep" ? 0 : 0.33));
      n.needs.social = clamp(n.needs.social - 0.18);
      n.needs.safety = clamp(n.needs.safety + 0.06);
      const u = w.urban.citizens[n.id];
      n.needs.fatigue = clamp(n.needs.fatigue + u.injury * 5e-3);
      livingTick(w, n);
      const before = n.needs.health;
      if (n.needs.hunger > 92 || n.needs.thirst > 94 || n.needs.fatigue > 98) n.needs.health = clamp(n.needs.health - 0.7);
      else if (n.needs.hunger < 55 && n.needs.thirst < 65 && n.needs.fatigue < 70) n.needs.health = clamp(n.needs.health + 0.13);
      n.needs.health = clamp(n.needs.health - u.disease * 0.025 - u.injury * 0.012);
      if (before >= 50 && n.needs.health < 50) socialEvent(w, { kind: "health", actorId: n.id, importance: 75, description: `${n.identity.name}\uC758 \uAC74\uAC15\uC774 \uC545\uD654\uB418\uC5C8\uB2E4. \uC2DD\uB7C9\uACFC \uD734\uC2DD\uC774 \uD544\uC694\uD558\uB2E4.` });
      if (n.needs.health <= 0) {
        die(w, n, u.disease > 0 || u.injury > 0 ? "illness" : "needs");
        continue;
      }
      syncEmployment(w, n);
      if (careForChild(w, n) || isTravelling(w, n)) {
        updatePerson(w, n);
        continue;
      }
      const appointment = gatheringCandidate(w, n);
      if (appointment && n.currentAction?.kind !== "Attend" && !["Work", "Gather"].includes(n.currentAction?.kind ?? "") && (n.currentAction?.score ?? 0) < appointment.score) delete n.currentAction;
      if (n.currentAction?.kind === "Attend" && !appointment) delete n.currentAction;
      const a = n.currentAction;
      if (a && urgentNeed(n) && n.cognition?.plan?.interruption !== urgentNeed(n)) n.currentAction = void 0;
      if (a && (n.needs.hunger > 88 && n.inventory.food > 0 && a.kind !== "Eat" || n.needs.thirst > 90 && a.kind !== "Drink")) n.currentAction = void 0;
      if (!n.currentAction) {
        const decision = plan(w, n);
        n.currentAction = decision.action;
        n.decision = { reason: decision.action.reason, candidates: decision.candidates, tick: w.tick };
      }
      this.advance(n);
      updatePerson(w, n);
    }
    for (const loan of w.loans) {
      if (loan.status !== "active" || w.tick < loan.due) continue;
      loan.status = "defaulted";
      w.stats.conflicts++;
      const lender = w.npcs.find((n) => n.id === loan.lenderId), borrower = w.npcs.find((n) => n.id === loan.borrowerId);
      const e = socialEvent(w, { kind: "default", actorId: borrower.id, targetId: lender.id, importance: 75, causeId: loan.sourceEventId, description: `${borrower.identity.name}\uC774 ${lender.identity.name}\uC5D0\uAC8C \uBE4C\uB9B0 \uB0A8\uC740 \uC2DD\uB7C9 ${loan.remaining}\uAC1C\uB97C \uAE30\uD55C \uB0B4 \uAC1A\uC9C0 \uBABB\uD588\uB2E4.` });
      changeRelationship(w, lender, borrower.id, { trust: -18, resentment: 16 }, e, "\uBE4C\uB824\uC900 \uC2DD\uB7C9\uC744 \uC57D\uC18D\uD55C \uB0A0 \uB3CC\uB824\uBC1B\uC9C0 \uBABB\uD588\uB2E4.");
    }
    updateGatherings(w);
    updateRequests(w);
    w.stats.foodSum += this.totalFood();
    w.stats.samples++;
  }
  totalFood() {
    return holdings(this.state).food;
  }
  newDay() {
    const w = this.state;
    w.llm.gateKeys = [];
    w.llm.dailyByNpc = {};
    w.llm.dailyTotal = 0;
    const roll = random(w);
    w.weather = w.tick < w.droughtUntil ? "drought" : roll < 0.24 ? "rain" : roll < 0.55 ? "cloudy" : "sunny";
    const weatherName = { rain: "\uBE44", cloudy: "\uD750\uB9BC", sunny: "\uB9D1\uC74C", drought: "\uAC00\uBB44" }[w.weather];
    appendEvent(w, { kind: "weather", importance: 20, description: `${dayOf(w.tick)}\uC77C\uC9F8 \xB7 ${weatherName}. ${w.weather === "drought" ? "\uB18D\uC7A5\uACFC \uC5F4\uB9E4\uC758 \uC0DD\uC0B0\uB7C9\uC774 \uAC10\uC18C\uD55C\uB2E4." : "\uC0C8\uB85C\uC6B4 \uD558\uB8E8\uAC00 \uC2DC\uC791\uB418\uC5C8\uB2E4."}` });
    ecologyDay(w);
    sampleDay(w);
    for (const n of w.npcs) {
      n.dailyTaken = 0;
      if (n.alive && n.inventory.food === 0 && n.needs.hunger > 65) socialEvent(w, { kind: "scarcity", actorId: n.id, importance: 70, description: `${n.identity.name}\uC774 \uC2DD\uB7C9 \uBD80\uC871\uC744 \uACAA\uACE0 \uC788\uB2E4. \uACF5\uB3D9 \uCC3D\uACE0\uC5D0 ${stocks(w, n.settlementId).food}\uAC1C\uAC00 \uB0A8\uC544 \uC788\uB2E4.` });
    }
    lifeDay(w);
    regionalDay(w);
    urbanDay(w);
    initializeUrban(w);
    livingDay(w);
    societyDay(w);
    decayMemories(w);
  }
  advance(n) {
    const w = this.state, a = n.currentAction;
    if (w.tick - n.decision.tick > 144 && a.path.length > 0) {
      this.fail(n, "\uD558\uB8E8 \uB3D9\uC548 \uBAA9\uC801\uC9C0\uC5D0 \uB3C4\uCC29\uD558\uC9C0 \uBABB\uD574 \uACBD\uB85C\uC640 \uBAA9\uD45C\uB97C \uB2E4\uC2DC \uD310\uB2E8\uD55C\uB2E4.");
      return;
    }
    if (["Share", "Talk", "Borrow", "Repay"].includes(a.kind) || a.kind === "Trade" && a.targetId?.startsWith("peer:")) {
      const targetId = a.kind === "Repay" ? w.loans.find((l) => l.id === a.targetId)?.lenderId : a.kind === "Trade" ? a.targetId?.slice(5) : a.targetId;
      const target = person(w, targetId);
      if (!target?.alive || distance(target.position, n.position) > 12) {
        this.fail(n, "\uB300\uC0C1 \uC8FC\uBBFC\uACFC \uB9CC\uB098\uC9C0 \uBABB\uD588\uB2E4.");
        return;
      }
      if (distance(target.position, a.target) > 0) {
        a.target = { ...target.position };
        const path = findPath(w, n.position, a.target);
        if (!path) {
          this.fail(n, "\uB300\uC0C1\uC5D0\uAC8C \uAC08 \uC218 \uC788\uB294 \uAE38\uC774 \uC5C6\uB2E4.");
          return;
        }
        a.path = path;
      }
    }
    if (a.path.length > 0) {
      const next = a.path.shift();
      if (!walkable(w, next) || distance(n.position, next) !== 1) {
        this.fail(n, "\uC774\uB3D9 \uACBD\uB85C\uAC00 \uB9C9\uD614\uB2E4.");
        return;
      }
      n.position = next;
      if (a.path.length === 0) appendEvent(w, { kind: "arrival", actorId: n.id, locationId: w.buildings.find((b) => distance(b.position, a.target) === 0)?.id, importance: 5, description: `${n.identity.name}\uC774 \uBAA9\uC801\uC9C0\uC5D0 \uB3C4\uCC29\uD588\uB2E4.`, data: { action: a.kind } });
      return;
    }
    if (a.kind === "Attend") {
      a.progress = this.state.gatherings?.items.find((g) => g.id === a.targetId)?.progress ?? 0;
      return;
    }
    if (++a.progress < a.duration) return;
    this.execute(n);
    n.currentAction = void 0;
  }
  fail(n, reason) {
    appendEvent(this.state, { kind: "failure", actorId: n.id, importance: 5, description: `${n.identity.name}: ${reason}` });
    n.currentAction = void 0;
  }
  execute(n) {
    const w = this.state, a = n.currentAction, stock = stocks(w, n.settlementId), localMarket = market(w, n.settlementId);
    if (distance(n.position, a.target) !== 0) {
      this.fail(n, "\uBAA9\uC801\uC9C0\uC5D0 \uB3C4\uCC29\uD558\uC9C0 \uC54A\uC558\uB2E4.");
      return;
    }
    const found = person(w, a.targetId), other = found?.alive ? found : void 0;
    const simple = (kind, description2, importance = 15, data = {}) => appendEvent(w, { kind, actorId: n.id, locationId: w.buildings.find((b) => b.id === a.targetId)?.id, description: description2, importance, data: { ...data, action: a.kind } });
    switch (a.kind) {
      case "Idle":
        n.needs.fatigue = clamp(n.needs.fatigue - 2);
        break;
      case "Move":
        break;
      case "Wash":
        w.living.people[n.id].body.cleanliness = clamp(w.living.people[n.id].body.cleanliness + 65);
        w.urban.citizens[n.id].stress = clamp(w.urban.citizens[n.id].stress - 3);
        simple("health", `${n.identity.name}\uC774 \uC6B0\uBB3C\uC5D0\uC11C \uC53B\uACE0 \uCCAD\uACB0\uC744 \uD68C\uBCF5\uD588\uB2E4.`);
        break;
      case "Eat":
        if (n.inventory.food < 1) {
          this.fail(n, "\uBA39\uC744 \uC2DD\uB7C9\uC774 \uC5C6\uB2E4.");
          break;
        }
        n.inventory.food--;
        w.economy.totals.consumedFood++;
        n.needs.hunger = clamp(n.needs.hunger - 38);
        simple("consumption", `${n.identity.name}\uC774 \uC2DD\uB7C9 1\uAC1C\uB97C \uBA39\uC5C8\uB2E4.`, 15, { resource: "food", amount: 1 });
        break;
      case "Drink":
        n.needs.thirst = clamp(n.needs.thirst - 80);
        simple("consumption", `${n.identity.name}\uC774 \uC6B0\uBB3C\uC5D0\uC11C \uBB3C\uC744 \uB9C8\uC168\uB2E4.`);
        break;
      case "Sleep":
        n.needs.fatigue = clamp(n.needs.fatigue - (42 + homeProfile(w, n).comfort * 0.25 + w.living.people[n.id].furnishings * 0.08));
        n.needs.health = clamp(n.needs.health + 3);
        simple("health", `${n.identity.name}\uC774 \uC7A0\uC744 \uC790\uACE0 \uAE30\uC6B4\uC744 \uD68C\uBCF5\uD588\uB2E4.`);
        break;
      case "Gather": {
        if (!canWork(w, n)) break;
        const r = w.resources.find((r2) => r2.id === a.targetId);
        if (!r || distance(r.position, n.position) !== 0 || r.amount < 1) {
          this.fail(n, "\uCC44\uC9D1 \uC790\uC6D0\uC774 \uC18C\uC9C4\uB418\uC5C8\uB2E4.");
          break;
        }
        const amount = Math.min(3, r.amount);
        r.amount -= amount;
        n.inventory[r.kind] += amount;
        w.economy.totals[r.kind === "food" ? "producedFood" : "producedWood"] += amount;
        simple("production", `${n.identity.name}\uC774 ${r.kind === "food" ? "\uC5F4\uB9E4" : "\uBAA9\uC7AC"} ${amount}\uAC1C\uB97C \uBAA8\uC558\uB2E4.`, 20, { resource: r.kind, amount });
        break;
      }
      case "Work": {
        if (!canWork(w, n)) break;
        if (a.targetId?.startsWith("industry:")) {
          if (!industryWork(w, n)) this.fail(n, "\uACE0\uC6A9\xB7\uC7AC\uB8CC\xB7\uC784\uAE08 \uB610\uB294 \uC2DC\uC124 \uC870\uAC74\uC774 \uBC14\uB00C\uC5C8\uB2E4.");
          break;
        }
        if (a.targetId?.includes(":")) {
          this.project(n);
          break;
        }
        const farm = w.buildings.find((b) => b.id === a.targetId && b.kind === "farm" && !w.urban.enterprises.some((e) => e.buildingId === b.id));
        if (!farm || farm.growth < 3) {
          this.fail(n, "\uC791\uBB3C\uC774 \uC544\uC9C1 \uC790\uB77C\uC9C0 \uC54A\uC558\uB2E4.");
          break;
        }
        n.life.skill = Math.min(100, n.life.skill + 0.02);
        const amount = Math.min(4 + Math.floor(n.life.skill / 25) + useTool(w, n), Math.floor(farm.growth));
        farm.growth -= amount;
        harvest(w, farm.settlementId, amount);
        n.inventory.food += amount;
        w.economy.totals.producedFood += amount;
        const harvestEvent = simple("production", `${n.identity.name}\uC774 \uB18D\uC7A5\uC5D0\uC11C \uC2DD\uB7C9 ${amount}\uAC1C\uB97C \uC218\uD655\uD588\uB2E4.`, 25, { resource: "food", amount, level: farm.level });
        const wage = Math.min(2, localMarket.coins);
        if (wage > 0) {
          n.inventory.food--;
          localMarket.food++;
          localMarket.coins -= wage;
          n.wealth += wage;
          w.urban.citizens[n.id].income += wage;
          w.economy.totals.wages += wage;
          appendEvent(w, { kind: "wage", actorId: n.id, locationId: localBuilding(w, n, "market").id, causeId: harvestEvent.id, importance: 30, description: `${n.identity.name}\uC774 \uC218\uD655 \uC2DD\uB7C9 1\uAC1C\uB97C \uC2DC\uC7A5\uC5D0 \uB0A9\uD488\uD558\uACE0 \uACF5\uB3D9 \uC2DC\uC7A5 \uAE30\uAE08\uC5D0\uC11C \uC784\uAE08 ${wage}\uCF54\uC778\uC744 \uBC1B\uC558\uB2E4.`, data: { employer: "market", amount: wage, food: 1, fundRemaining: localMarket.coins } });
        }
        break;
      }
      case "StoreItem": {
        const food = Math.max(0, n.inventory.food - (n.personality.greed > 65 ? 4 : 2)), wood = n.inventory.wood;
        n.inventory.food -= food;
        n.inventory.wood = 0;
        stock.food += food;
        stock.wood += wood;
        const marketSupply = Math.min(Math.floor(food / 2), Math.max(0, 20 - localMarket.food));
        stock.food -= marketSupply;
        localMarket.food += marketSupply;
        simple("storage", `${n.identity.name}\uC774 \uC2DD\uB7C9 ${food}\uAC1C\xB7\uBAA9\uC7AC ${wood}\uAC1C\uB97C \uACF5\uB3D9 \uBCF4\uAD00\uD588\uB2E4.`, 25, { food, wood, marketSupply });
        break;
      }
      case "TakeItem": {
        const amount = Math.min(stock.food, 3 - n.dailyTaken, 1 + Math.floor(n.personality.greed / 35));
        if (amount <= 0) {
          this.fail(n, "\uACF5\uB3D9 \uC2DD\uB7C9 \uB610\uB294 \uC624\uB298 \uC778\uCD9C \uD55C\uB3C4\uAC00 \uC5C6\uB2E4.");
          break;
        }
        stock.food -= amount;
        n.inventory.food += amount;
        n.dailyTaken += amount;
        simple("storage", `${n.identity.name}\uC774 \uACF5\uB3D9 \uCC3D\uACE0\uC5D0\uC11C \uC2DD\uB7C9 ${amount}\uAC1C\uB97C \uAC00\uC838\uAC14\uB2E4.`, 25, { amount });
        break;
      }
      case "Theft": {
        if (stock.food < 1 || n.dailyTaken < 3) {
          this.fail(n, "\uC808\uB3C4 \uC870\uAC74\uC774 \uBC14\uB00C\uC5C8\uB2E4.");
          break;
        }
        const amount = Math.min(stock.food, 2 + Math.floor(n.personality.greed / 40));
        stock.food -= amount;
        n.inventory.food += amount;
        w.stats.thefts++;
        const e = socialEvent(w, { kind: "theft", actorId: n.id, locationId: a.targetId, importance: 80, description: `${n.identity.name}\uC774 \uC778\uCD9C \uD55C\uB3C4\uB97C \uB118\uACA8 \uACF5\uB3D9 \uC2DD\uB7C9 ${amount}\uAC1C\uB97C \uBAB0\uB798 \uAC00\uC838\uAC14\uB2E4.`, data: { amount } });
        const nearby = neighbours(w, n, 4).filter((p) => p.alive && p.id !== n.id);
        const witnesses = w.npcs.length > 400 ? nearby.sort((a2, b) => distance(n.position, a2.position) - distance(n.position, b.position)).slice(0, 12) : nearby;
        for (const witness of witnesses) {
          w.stats.conflicts++;
          witness.needs.safety = clamp(witness.needs.safety - 12);
          const seen = socialEvent(w, { kind: "witness", actorId: witness.id, targetId: n.id, importance: 80, causeId: e.id, locationId: a.targetId, description: `${witness.identity.name}\uC774 ${n.identity.name}\uC758 \uC2DD\uB7C9 \uC808\uB3C4\uB97C \uC9C1\uC811 \uBAA9\uACA9\uD588\uB2E4.` });
          witness.knownRumors.push(seen.id);
          changeRelationship(w, witness, n.id, { trust: -20, resentment: 20, fear: 5 }, seen, "\uACF5\uB3D9 \uC2DD\uB7C9\uC744 \uBAB0\uB798 \uAC00\uC838\uAC00\uB294 \uBAA8\uC2B5\uC744 \uC9C1\uC811 \uBCF4\uC558\uB2E4.");
        }
        break;
      }
      case "Share": {
        if (!other || distance(n.position, other.position) > 1 || n.inventory.food <= 1 || other.inventory.food > 0) {
          this.fail(n, "\uC2DD\uB7C9 \uACF5\uC720 \uC870\uAC74\uC774 \uBC14\uB00C\uC5C8\uB2E4.");
          break;
        }
        n.inventory.food--;
        other.inventory.food++;
        w.stats.shares++;
        const e = socialEvent(w, { kind: "share", actorId: n.id, targetId: other.id, importance: 75, data: { amount: 1, reason: a.reason, evidence: a.evidence ?? [] }, description: `${n.identity.name}\uC774 \uBC30\uACE0\uD508 ${other.identity.name}\uC5D0\uAC8C \uC790\uC2E0\uC758 \uC2DD\uB7C9 1\uAC1C\uB97C \uB098\uB204\uC5C8\uB2E4.` });
        changeRelationship(w, other, n.id, { trust: 12, affection: 10, respect: 6 }, e, "\uD798\uB4E4 \uB54C \uC790\uC2E0\uC758 \uC2DD\uB7C9\uC744 \uB098\uB204\uC5B4 \uC900 \uC0AC\uB78C\uC774\uB2E4.");
        break;
      }
      case "Talk": {
        if (!other || distance(n.position, other.position) > 1 || w.tick - other.lastTalk < 8) {
          this.fail(n, "\uB300\uD654 \uC0C1\uB300\uAC00 \uC9C0\uAE08 \uBC14\uC058\uB2E4.");
          break;
        }
        n.needs.social = clamp(n.needs.social + 32);
        other.needs.social = clamp(other.needs.social + 22);
        n.lastTalk = other.lastTalk = w.tick;
        for (const p of [n, other]) {
          const d = w.living.people[p.id].desires;
          d.belonging = clamp(d.belonging - 20);
          d.novelty = clamp(d.novelty - 10);
        }
        const forward = attraction(w, n, other), reverse = attraction(w, other, n);
        const e = socialEvent(w, { kind: "talk", actorId: n.id, targetId: other.id, importance: 35, data: {
          reason: a.reason,
          evidence: a.evidence ?? [],
          impression: forward.value,
          reverseImpression: reverse.value,
          factors: forward.factors.map((f) => `${f.label} ${signed(f.value)}: ${f.reason}`),
          reverseFactors: reverse.factors.map((f) => `${f.label} ${signed(f.value)}: ${f.reason}`),
          affectionChange: forward.changes.affection,
          reverseAffectionChange: reverse.changes.affection
        }, description: `${n.identity.name}\uACFC ${other.identity.name}\uC774 \uC77C\uC0C1\uC758 \uC774\uC57C\uAE30\uB97C \uB098\uB204\uC5C8\uB2E4.` });
        changeRelationship(w, n, other.id, forward.changes, e, `\uB300\uD654\uB97C \uB098\uB204\uBA70 \uB290\uB080 \uC778\uC0C1 ${signed(forward.value)} \xB7 ${forward.reason}`);
        changeRelationship(w, other, n.id, reverse.changes, e, `\uB300\uD654\uB97C \uB098\uB204\uBA70 \uB290\uB080 \uC778\uC0C1 ${signed(reverse.value)} \xB7 ${reverse.reason}`);
        const sourceById = { get: (id7) => eventById(w, id7) };
        const knownRoots = new Set(other.knownRumors.map((id7) => sourceById.get(id7)?.causeId));
        const rumorId = n.knownRumors.find((id7) => {
          const seen = sourceById.get(id7);
          return seen?.causeId && !knownRoots.has(seen.causeId) && seen.targetId !== other.id && w.tick - seen.tick < 144 * 7;
        });
        const source = rumorId ? eventById(w, rumorId) : void 0;
        if (source && source.targetId && source.targetId !== other.id && w.tick - source.tick < 144 * 7) {
          other.knownRumors.push(source.id);
          const rumor = socialEvent(w, { kind: "rumor", actorId: n.id, targetId: other.id, importance: 60, causeId: source.id, description: `${n.identity.name}\uC774 ${other.identity.name}\uC5D0\uAC8C ${source.actorId === n.id ? "\uC9C1\uC811 \uBAA9\uACA9\uD55C" : "\uC804\uD574 \uB4E4\uC740"} \uC808\uB3C4 \uC774\uC57C\uAE30\uB97C \uC804\uD588\uB2E4.`, data: { suspectId: source.targetId, rootEventId: source.causeId, knowledge: "hearsay", speakerSource: source.actorId === n.id ? "direct" : "hearsay" } });
          changeRelationship(w, other, source.targetId, { trust: -4, resentment: 3 }, rumor, `${n.identity.name}\uC5D0\uAC8C \uC808\uB3C4 \uC18C\uBB38\uC744 \uB4E4\uC5C8\uB2E4. \uC9C1\uC811 \uBCF8 \uC0AC\uC2E4\uC740 \uC544\uB2C8\uB2E4.`);
        }
        break;
      }
      case "Trade": {
        if (a.targetId?.startsWith("goods:")) {
          if (!buyConsumerGood(w, n, a.targetId.slice(6))) this.fail(n, "\uC0C1\uD488 \uC7AC\uACE0\xB7\uB300\uAE08 \uB610\uB294 \uC2DC\uC7A5 \uC704\uCE58\uAC00 \uBC14\uB00C\uC5C8\uB2E4.");
          break;
        }
        const seller = a.targetId?.startsWith("peer:") ? w.npcs.find((p) => p.id === a.targetId.slice(5) && p.alive) : void 0;
        const buying = a.targetId === "buy" || !!seller, resource = buying ? "food" : "wood";
        if (a.targetId?.startsWith("peer:") && (!seller || distance(n.position, seller.position) > 1 || (seller.relationships.find((r) => r.npcId === n.id)?.trust ?? 35) < 20)) {
          this.fail(n, "\uD310\uB9E4\uC790\uB97C \uB9CC\uB098\uAC70\uB098 \uAC70\uB798 \uB3D9\uC758\uB97C \uC5BB\uC9C0 \uBABB\uD588\uB2E4.");
          break;
        }
        const price = buying ? localMarket.foodPrice : localMarket.woodPrice;
        const stock2 = seller ? Math.max(0, seller.inventory.food - 3) : buying ? localMarket.food : n.inventory.wood;
        const amount = Math.min(buying ? 2 : 3, stock2, Math.floor((buying ? n.wealth : localMarket.coins) / price));
        if (!amount) {
          this.fail(n, "\uAC70\uB798 \uC7AC\uACE0 \uB610\uB294 \uC2E4\uC81C \uC790\uAE08\uC774 \uBD80\uC871\uD558\uB2E4.");
          break;
        }
        const cost = amount * price;
        if (buying) {
          n.wealth -= cost;
          w.urban.citizens[n.id].expenses += cost;
          n.inventory.food += amount;
          if (seller) {
            seller.wealth += cost;
            w.urban.citizens[seller.id].income += cost;
            seller.inventory.food -= amount;
          } else {
            localMarket.coins += cost;
            localMarket.food -= amount;
          }
        } else {
          n.wealth += cost;
          w.urban.citizens[n.id].income += cost;
          localMarket.coins -= cost;
          n.inventory.wood -= amount;
          localMarket.wood += amount;
        }
        w.economy.totals.trades++;
        w.economy.totals.tradeVolume += amount;
        const e = socialEvent(w, {
          kind: "trade",
          actorId: n.id,
          targetId: seller?.id,
          importance: seller ? 45 : 35,
          description: `${n.identity.name}\uC774 ${seller?.identity.name ?? "\uACF5\uB3D9 \uC2DC\uC7A5"}${buying ? "\uC5D0\uAC8C\uC11C" : "\uC5D0"} ${buying ? "\uC2DD\uB7C9" : "\uBAA9\uC7AC"} ${amount}\uAC1C\uB97C ${cost}\uCF54\uC778\uC5D0 ${buying ? "\uAD6C\uB9E4" : "\uD310\uB9E4"}\uD588\uB2E4.`,
          data: { buyer: buying ? n.id : "market", seller: seller?.id ?? (buying ? "market" : n.id), resource, amount, price, cost, reason: a.reason, evidence: a.evidence ?? [] }
        });
        if (seller) {
          changeRelationship(w, n, seller.id, { trust: 2, respect: 1 }, e, "\uD569\uC758\uD55C \uAC00\uACA9\uC73C\uB85C \uBB3C\uAC74\uC744 \uAC70\uB798\uD588\uB2E4.");
          changeRelationship(w, seller, n.id, { trust: 2, respect: 1 }, e, "\uBB3C\uAC74\uAC12\uC744 \uBE60\uC9D0\uC5C6\uC774 \uC9C0\uBD88\uD55C \uC774\uC6C3\uC774\uB2E4.");
        }
        break;
      }
      case "Borrow": {
        if (!other || distance(n.position, other.position) > 1 || other.inventory.food < 3 || relationship(other, n.id).trust < 30 || w.loans.some((l) => l.borrowerId === n.id && l.status !== "repaid")) {
          this.fail(n, "\uC2DD\uB7C9 \uB300\uC5EC \uC870\uAC74\uC744 \uCDA9\uC871\uD558\uC9C0 \uBABB\uD588\uB2E4.");
          break;
        }
        other.inventory.food -= 2;
        n.inventory.food += 2;
        const e = socialEvent(w, { kind: "loan", actorId: other.id, targetId: n.id, importance: 60, data: { amount: 2, reason: a.reason, evidence: a.evidence ?? [] }, description: `${other.identity.name}\uC774 ${n.identity.name}\uC5D0\uAC8C \uC2DD\uB7C9 2\uAC1C\uB97C \uC774\uD2C0 \uB3D9\uC548 \uBE4C\uB824\uC8FC\uC5C8\uB2E4.` });
        w.loans.push({ id: `l${w.nextId++}`, lenderId: other.id, borrowerId: n.id, amount: 2, remaining: 2, due: w.tick + 288, status: "active", sourceEventId: e.id });
        break;
      }
      case "Repay": {
        const loan = w.loans.find((l) => l.id === a.targetId && l.borrowerId === n.id && l.status !== "repaid"), lender = w.npcs.find((p) => p.id === loan?.lenderId && p.alive);
        if (!loan || !lender || distance(n.position, lender.position) > 1 || n.inventory.food <= 1) {
          this.fail(n, "\uC0C1\uD658 \uC870\uAC74\uC744 \uCDA9\uC871\uD558\uC9C0 \uBABB\uD588\uB2E4.");
          break;
        }
        const amount = Math.min(loan.remaining, n.inventory.food - 1), wasLate = loan.status === "defaulted";
        n.inventory.food -= amount;
        lender.inventory.food += amount;
        loan.remaining -= amount;
        if (loan.remaining === 0) loan.status = "repaid";
        const e = socialEvent(w, { kind: "repayment", actorId: n.id, targetId: lender.id, importance: 60, causeId: loan.sourceEventId, description: `${n.identity.name}\uC774 ${lender.identity.name}\uC5D0\uAC8C \uC2DD\uB7C9 ${amount}\uAC1C\uB97C \uAC1A\uC558\uB2E4. \uB0A8\uC740 \uBE5A ${loan.remaining}\uAC1C${wasLate ? " \xB7 \uC5F0\uCCB4 \uD6C4 \uC0C1\uD658" : ""}.`, data: { loanId: loan.id, amount, remaining: loan.remaining, late: wasLate, reason: a.reason, evidence: a.evidence ?? [] } });
        changeRelationship(w, lender, n.id, { trust: loan.remaining === 0 ? wasLate ? 12 : 8 : 2, respect: loan.remaining === 0 ? 5 : 1, resentment: wasLate ? loan.remaining === 0 ? -10 : -2 : 0 }, e, loan.remaining === 0 ? "\uBE4C\uB9B0 \uC2DD\uB7C9\uC744 \uBAA8\uB450 \uAC1A\uC544 \uC57D\uC18D\uC744 \uD574\uACB0\uD588\uB2E4." : "\uD615\uD3B8\uC5D0 \uB9DE\uAC8C \uBE5A\uC744 \uC870\uAE08\uC529 \uAC1A\uACE0 \uC788\uB2E4.");
        break;
      }
    }
  }
  project(n) {
    const w = this.state, stock = stocks(w, n.settlementId), [id7, kind] = n.currentAction.targetId.split(":"), b = w.buildings.find((b2) => b2.id === id7);
    const goal2 = n.goals.find((g) => g.kind === kind);
    if (!goal2 && !(kind === "expand_farm" && n.occupation === "carpenter" && b?.kind === "farm") || !b || b.level >= 4 || n.inventory.wood + stock.wood < 8) {
      this.fail(n, "\uD504\uB85C\uC81D\uD2B8\uC5D0 \uD544\uC694\uD55C \uBAA9\uC7AC\uB098 \uBAA9\uD45C\uAC00 \uC5C6\uB2E4.");
      return;
    }
    const own = Math.min(n.inventory.wood, 8);
    n.inventory.wood -= own;
    stock.wood -= 8 - own;
    b.level++;
    w.economy.totals.investedWood += 8;
    n.goals = n.goals.filter((g) => g.id !== goal2?.id);
    socialEvent(w, { kind: "project", actorId: n.id, locationId: b.id, importance: 75, description: `${n.identity.name}\uC774 \uBAA9\uC7AC 8\uAC1C\uB85C ${b.name}\uC744 \uAC1C\uC120\uD588\uB2E4. (\uB2E8\uACC4 ${b.level})`, causeId: goal2?.sourceEventId, data: { woodCost: 8, personalWood: own, communalWood: 8 - own, level: b.level, growthMultiplier: b.kind === "farm" ? 1 + (b.level - 1) * 0.35 : 1 } });
  }
  build(settlementId, kind) {
    if (kind !== "home" && kind !== "farm") throw new Error("\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uAC74\uBB3C\uC785\uB2C8\uB2E4.");
    const v = this.state.civilization.settlements.find((v2) => v2.id === settlementId);
    if (!v) throw new Error("\uB9C8\uC744\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    const b = buildHouse(this.state, v, kind, true);
    if (!b) throw new Error("\uACF5\uB3D9 \uBAA9\uC7AC\uAC00 \uBD80\uC871\uD558\uAC70\uB098 \uC5F0\uACB0\uB41C \uBE48 \uAC74\uC124 \uBD80\uC9C0\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
    return b.id;
  }
  experiment(kind) {
    const w = this.state;
    if (kind === "drought") {
      w.droughtUntil = w.tick + 144 * 3;
      w.weather = "drought";
    } else if (kind === "food") {
      w.storage.food += 24;
      w.economy.totals.externalFood += 24;
    } else throw new Error("\uC54C \uC218 \uC5C6\uB294 \uC2E4\uD5D8\uC785\uB2C8\uB2E4.");
    appendEvent(w, { kind: "experiment", importance: 50, description: kind === "drought" ? "\uAD00\uCC30 \uC2E4\uD5D8: 3\uC77C \uB3D9\uC548 \uAC00\uBB44\uC774 \uC9C0\uC18D\uB41C\uB2E4. \uC0DD\uC0B0\uB7C9\uC774 \uAC10\uC18C\uD55C\uB2E4." : "\uAD00\uCC30 \uC2E4\uD5D8: \uACF5\uB3D9 \uCC3D\uACE0\uC5D0 \uC678\uBD80 \uC2DD\uB7C9 24\uAC1C\uB97C \uD22C\uC785\uD588\uB2E4.", data: { command: kind, externalFood: kind === "food" ? 24 : 0 } });
  }
  decisionContext() {
    const w = this.state, request = w.llm.queue[0];
    if (!request || !w.llm.enabled) return null;
    const npc2 = w.npcs.find((n) => n.id === request.npcId), event2 = eventById(w, request.eventId);
    if (!npc2 || !event2) return null;
    const copy = structuredClone(npc2);
    copy.memories = retrieveMemories(copy.memories, w.tick, { npcIds: event2.participants.filter((id7) => id7 !== npc2.id), locationIds: event2.locationId ? [event2.locationId] : [] }).map((h) => h.memory);
    copy.relationships = copy.relationships.slice(-12);
    delete copy.cognition;
    return { requestId: request.id, context: { npc: copy, event: structuredClone(event2), allowedGoals: [...GOAL_KINDS], tick: w.tick } };
  }
  applyInterpretation(requestId, input, provenance) {
    const w = this.state, request = w.llm.queue.find((q) => q.id === requestId);
    if (!request) return false;
    const npc2 = w.npcs.find((n) => n.id === request.npcId);
    const result = validateInterpretation(input);
    const valid = result && npc2.alive && result.relationshipInterpretations.every((r) => npc2.relationships.some((existing) => existing.npcId === r.npcId)) && (!provenance || provenance.evidence.includes(request.eventId) && provenance.evidence.every((id7) => eventById(w, id7) && (id7 === request.eventId || npc2.memories.some((m) => m.sourceEventId === id7))));
    w.llm.queue = w.llm.queue.filter((q) => q.id !== requestId);
    if (!valid || !result) {
      w.llm.rejected++;
      appendEvent(w, { kind: "llm", actorId: npc2.id, causeId: request.eventId, importance: 10, description: "\uD5C8\uC6A9\uB418\uC9C0 \uC54A\uC740 LLM \uC751\uB2F5\uC744 \uAC70\uBD80\uD588\uB2E4." });
      return false;
    }
    for (const goal2 of result.newGoals) {
      if (npc2.goals.some((g) => g.kind === goal2.kind)) continue;
      if (npc2.goals.length >= 4) npc2.goals.shift();
      npc2.goals.push({ id: `g${w.nextId++}`, ...goal2, createdAt: w.tick, sourceEventId: request.eventId });
      appendEvent(w, { kind: "goal", actorId: npc2.id, causeId: request.eventId, importance: 45, description: `${npc2.identity.name}\uC758 ${provenance?.model === "chrome-built-in" ? "Chrome AI\uAC00 \uC81C\uC548\uD55C \uBAA9\uD45C" : "\uC0C8 \uBAA9\uD45C"}: ${GOAL_LABELS[goal2.kind]}`, data: { kind: goal2.kind, reason: goal2.reason, ...provenance ?? {} } });
    }
    for (const meaning of result.relationshipInterpretations) {
      const relation = relationship(npc2, meaning.npcId);
      relation.interpretation = meaning.meaning;
      if (!relation.evidence.includes(request.eventId)) relation.evidence.push(request.eventId);
    }
    w.llm.completed++;
    appendEvent(w, { kind: "llm", actorId: npc2.id, causeId: request.eventId, importance: 25, description: `${npc2.identity.name}${provenance?.model === "chrome-built-in" ? ": " : "\uC758 \uD574\uC11D: "}${result.interpretation}`, data: { result: JSON.stringify(result), requestId, ...provenance ?? {} } });
    return true;
  }
  closeChromeRequests(ids, reason, representative) {
    const w = this.state, requests = w.llm.queue.filter((q) => ids.includes(q.id));
    if (!requests.length) return;
    w.llm.queue = w.llm.queue.filter((q) => !ids.includes(q.id));
    appendEvent(w, {
      kind: "llm",
      actorId: requests[0].npcId,
      causeId: requests[0].eventId,
      importance: 5,
      description: `Chrome \uD310\uB2E8 ${reason === "merged" ? "\uC0AC\uAC74 \uBB36\uC74C\uC73C\uB85C \uCC98\uB9AC" : "\uD604\uC7AC \uC0C1\uD0DC\uC5D0 \uB530\uB77C \uC0DD\uB7B5"}`,
      data: { reason, requestIds: requests.map((q) => q.id), representative, evidence: requests.map((q) => q.eventId) }
    });
  }
  recordDialogue(speakerId, listenerId, text, evidence2, requestId, model) {
    const w = this.state, speaker = w.npcs.find((n) => n.id === speakerId), listener = w.npcs.find((n) => n.id === listenerId);
    if (!speaker?.alive || !listener?.alive || speakerId === listenerId || !text.trim() || text.length > 500 || !evidence2.length || evidence2.length > 8 || evidence2.some((id7) => !eventById(w, id7) || !speaker.memories.some((m) => m.sourceEventId === id7 && m.relatedNpcIds.includes(listenerId)))) return false;
    appendEvent(w, {
      kind: "llm",
      actorId: speakerId,
      targetId: listenerId,
      causeId: evidence2[0],
      importance: 30,
      description: `${speaker.identity.name}\uAC00 ${listener.identity.name}\uC5D0\uAC8C \uB5A0\uC62C\uB9B0 \uB9D0: ${text}`,
      data: { text, evidence: evidence2, requestId, model, dialogue: true }
    });
    return true;
  }
  failDecision(requestId, reason, retry = true) {
    const w = this.state, request = w.llm.queue.find((q) => q.id === requestId);
    if (!request) return;
    request.attempts++;
    if (!retry || request.attempts >= 3) {
      w.llm.failed++;
      w.llm.queue = w.llm.queue.filter((q) => q.id !== requestId);
    }
    appendEvent(w, { kind: "llm", actorId: request.npcId, causeId: request.eventId, importance: 5, description: `\uD310\uB2E8 \uCC98\uB9AC \uC2E4\uD328 (${request.attempts}/3): ${reason.slice(0, 160)}` });
  }
};

// ../../../..v0.21-source/src/llm/coordinator.ts
var DecisionCoordinator = class {
  constructor(sim, provider, timeoutMs = 5e3) {
    this.sim = sim;
    this.provider = provider;
    this.timeoutMs = timeoutMs;
  }
  sim;
  provider;
  timeoutMs;
  busy = false;
  disposed = false;
  dispose() {
    this.disposed = true;
  }
  async processOne() {
    if (this.busy || this.disposed) return false;
    const pending = this.sim.decisionContext();
    if (!pending) return false;
    this.busy = true;
    let timer;
    try {
      const result = await Promise.race([
        this.provider.interpretEvent(pending.context),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("provider timeout")), this.timeoutMs);
        })
      ]);
      if (!this.disposed) this.sim.applyInterpretation(pending.requestId, result);
    } catch (error) {
      if (!this.disposed) this.sim.failDecision(pending.requestId, error instanceof Error ? error.message : "provider error");
    } finally {
      clearTimeout(timer);
      this.busy = false;
    }
    return true;
  }
  async drain() {
    while (!this.disposed && await this.processOne()) {
    }
  }
};

// ../../../..v0.21-source/src/llm/provider.ts
var MockLLMProvider = class {
  async decideGoal({ npc: npc2, event: event2 }) {
    let kind = "secure_food";
    if (event2.kind === "share") kind = npc2.personality.empathy > 45 ? "help_neighbor" : "make_friend";
    else if (event2.kind === "witness") kind = "secure_storage";
    else if (event2.kind === "default") kind = "earn_wealth";
    else if (event2.kind === "scarcity") kind = "expand_farm";
    return { newGoals: [{ kind, reason: `${event2.description} \uC774 \uACBD\uD5D8\uC774 \uC55E\uC73C\uB85C\uC758 \uC120\uD0DD\uC5D0 \uC601\uD5A5\uC744 \uC8FC\uC5C8\uB2E4.`.slice(0, 300) }] };
  }
  async interpretEvent(context) {
    const goals = await this.decideGoal(context);
    return { ...goals, interpretation: context.event.kind === "share" ? "\uC5B4\uB824\uC6B8 \uB54C \uBC1B\uC740 \uB3C4\uC6C0\uC744 \uAE30\uC5B5\uD558\uACE0 \uC774\uC6C3\uC5D0\uAC8C \uB3CC\uB824\uC8FC\uACE0 \uC2F6\uB2E4." : context.event.kind === "witness" ? "\uACF5\uB3D9 \uC790\uC6D0\uC744 \uC9C0\uD0AC \uC218 \uC788\uB3C4\uB85D \uCC3D\uACE0\uB97C \uAC1C\uC120\uD558\uACE0 \uC2F6\uB2E4." : "\uC624\uB298\uC758 \uACBD\uD5D8\uC744 \uAE30\uC5B5\uD558\uBA70 \uC55E\uC73C\uB85C\uC758 \uC0DD\uD65C\uC744 \uC900\uBE44\uD574\uC57C\uACA0\uB2E4.", relationshipInterpretations: [] };
  }
  async generateDialogue({ speaker, listener, memories }) {
    const shared = memories.find((m) => m.relatedNpcIds.includes(listener.id));
    return { text: `${listener.identity.name}, ${shared ? `\uADF8\uB54C \uC77C\uC774 \uAE30\uC5B5\uB098. ${shared.description}` : "\uC624\uB298 \uD558\uB8E8\uB294 \uC5B4\uB560\uC5B4?"} \u2014 ${speaker.identity.name}` };
  }
};
export {
  DecisionCoordinator as LegacyCoordinator,
  MockLLMProvider as LegacyMock,
  Simulation as LegacySimulation
};
