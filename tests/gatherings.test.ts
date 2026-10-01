import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/engine';
import { proposeGatherings, deliverInvitations, gatheringCandidate, updateGatherings } from '../src/sim/gatherings';
import { balance } from '../src/sim/economy';
import { compactWorld } from '../src/server/world';
import { appendEvent } from '../src/sim/social';
import type { Gathering } from '../src/sim/gatherings-types';
import { relationship } from '../src/sim/social';
import { stateChange, restoreChange } from '../src/server/journal';
import { gatheringsView } from '../src/ui/gatherings';
import { database } from './helpers/database';
import { WorldStore } from '../src/server/store';
import { applyCommand } from '../src/server/world';

function fixture(kind: Gathering['kind'] = 'meal') {
  const w = new Simulation().snapshot(); w.llm.enabled = false; w.tick = 60;
  const venue = w.buildings.find(b => b.kind === (kind === 'harvest' ? 'farm' : 'market'))!;
  const host = w.npcs[0], guest = w.npcs[1];
  for (const n of w.npcs) { n.position = { ...w.buildings.find(b => b.id === n.homeId)!.position }; n.personality.sociability = 0; n.personality.empathy = 0; n.needs.social = 100; }
  for (const n of [host, guest]) { n.position = { ...venue.position }; n.identity.age = 30; n.life.bornTick = w.tick - 30 * 1728; n.needs = { hunger: 20, thirst: 20, fatigue: 20, health: 100, safety: 80, social: 20 }; n.inventory.food = 3; }
  host.personality.sociability = 100; host.personality.empathy = 100;
  if (kind === 'help') { guest.inventory.food = 0; guest.needs.hunger = 60; }
  if (kind === 'harvest') { host.inventory.food = 1; venue.growth = 30; }
  // These fixtures deliberately change starting holdings; align the opening account.
  w.economy.openingFood += balance(w).food;
  proposeGatherings(w);
  const g = w.gatherings!.items.find(g => g.hostId === host.id)!;
  assert.ok(g); assert.equal(g.kind, kind); assert.ok(g.invitations.some(i => i.npcId === guest.id && i.status === 'accepted'));
  return { w, g, host, guest, venue };
}
function attend(f: ReturnType<typeof fixture>) {
  const { w, g, host, guest, venue } = f; w.tick = g.startsAt;
  for (const n of [host, guest]) { n.position = { ...venue.position }; n.currentAction = { ...gatheringCandidate(w, n)!, path: [], duration: 6, progress: 0 }; }
}
test('autonomous proposals use actual needs, direct invitations and bounded schedules', () => {
  const { w, g, host } = fixture();
  assert.equal(g.sourceEventId, w.events.find(e => e.data.phase === 'proposed')!.id);
  assert.ok(g.invitations.length <= 3); const before = JSON.stringify(w); proposeGatherings(w); assert.equal(JSON.stringify(w), before);
  const uninformed = w.npcs.find(n => n.id !== host.id && !g.invitations.some(i => i.npcId === n.id))!;
  w.tick = g.startsAt; assert.equal(gatheringCandidate(w, uninformed), undefined);
  assert.ok(!uninformed.memories.some(m => w.events.find(e => e.id === m.sourceEventId)?.data.gatheringId === g.id));
  Simulation.load(JSON.stringify(w));
});
for (const kind of ['meal', 'help', 'harvest'] as const) test(`${kind} completes only after six ticks together and preserves real resource accounts`, () => {
  const f = fixture(kind); attend(f); const { w, g, host, guest } = f;
  const initial = host.inventory.food + guest.inventory.food, trust = relationship(host, guest.id).trust;
  for (let i = 0; i < 5; i++) { updateGatherings(w); assert.equal(g.status, 'planned'); w.tick++; }
  updateGatherings(w); assert.equal(g.status, 'completed'); assert.equal(g.progress, 6);
  assert.equal(host.inventory.food + guest.inventory.food, initial + (kind === 'meal' ? -2 : kind === 'harvest' ? 4 : 0));
  assert.equal(relationship(host, guest.id).trust, trust + 3); assert.deepEqual(balance(w), { food: 0, wood: 0, coins: 0 });
  assert.ok(guest.memories.some(m => w.events.find(e => e.id === m.sourceEventId)?.data.phase === 'completed'));
  const once = JSON.stringify(w); updateGatherings(w); assert.equal(JSON.stringify(w), once); Simulation.load(JSON.stringify(w));
});
test('resource exhaustion and missing attendees cannot complete a gathering or invent production', () => {
  const f = fixture('harvest'); attend(f); const { w, g, venue } = f; venue.growth = 0;
  const total = w.economy.totals.producedFood;
  for (; w.tick <= g.endsAt; w.tick++) updateGatherings(w);
  assert.equal(g.status, 'cancelled'); assert.equal(w.economy.totals.producedFood, total); assert.equal(g.progress, 0);
  assert.deepEqual(balance(w), { food: 0, wood: 0, coins: 0 }); Simulation.load(JSON.stringify(w));
});
test('urgent needs withdraw a promise and are never revealed to an absent host', () => {
  const f = fixture(); attend(f); const { w, g, guest, host } = f; updateGatherings(w); w.tick++;
  guest.needs.thirst = 99; updateGatherings(w);
  const i = g.invitations.find(i => i.npcId === guest.id)!; assert.equal(i.status, 'withdrawn'); assert.equal(guest.currentAction, undefined);
  const e = w.events.find(e => e.id === i.responseEventId)!; assert.deepEqual(e.participants, [guest.id]);
  assert.ok(!host.memories.some(m => m.sourceEventId === e.id)); assert.equal(g.progress, 0);
  const sim = Simulation.load(JSON.stringify(w)); sim.step(); assert.notEqual(sim.snapshot().npcs[1].currentAction?.kind, 'Attend');
});
test('direct encounters can deliver a later invitation and strained relationships can refuse it', () => {
  const { w, g, host, venue } = fixture(); const outsider = w.npcs.find(n => n.id !== host.id && !g.invitations.some(i => i.npcId === n.id))!;
  g.invitations = g.invitations.slice(0, 1); outsider.position = { ...venue.position }; outsider.identity.age = 30;
  outsider.needs.hunger = 20; outsider.needs.thirst = 20; outsider.needs.fatigue = 20; outsider.needs.health = 100; outsider.inventory.food = 2;
  relationship(outsider, host.id).resentment = 100;
  w.tick++; deliverInvitations(w, g);
  const i = g.invitations.find(i => i.npcId === outsider.id);
  assert.ok(i); assert.equal(i.status, 'declined'); assert.match(i.reason, /관계/);
});
test('checkpoint and server change replay retain invitations and exact in-flight continuation', () => {
  const f = fixture(); attend(f); updateGatherings(f.w);
  for (let i = 0; i < 120; i++) appendEvent(f.w, { kind: 'weather', importance: 1, description: '압축 뒤 원본 조회' });
  const compact = compactWorld(f.w); const a = Simulation.load(JSON.stringify(f.w)), b = Simulation.load(JSON.stringify(compact));
  const before = b.snapshot(); a.step(30); b.step(30);
  assert.deepEqual(a.snapshot().gatherings, b.snapshot().gatherings); assert.deepEqual(a.snapshot().npcs, b.snapshot().npcs);
  const restored = restoreChange(before, stateChange(before, b.snapshot())); assert.deepEqual(restored, JSON.parse(b.save())); Simulation.load(JSON.stringify(restored));
});
test('forged invitation, uninvited attendance and duplicate bookings are rejected', () => {
  const { w, g } = fixture();
  const check = (change: (copy: typeof w) => void) => { const copy = structuredClone(w); change(copy); assert.throws(() => Simulation.load(JSON.stringify(copy)), /공동 활동|초대|약속/); };
  check(c => { c.gatherings!.items[0].invitations[0].invitationEventId = c.events[0].id; });
  check(c => { c.gatherings!.items[0].attendance = [c.npcs.at(-1)!.id]; c.gatherings!.items[0].progress = 1; });
  check(c => { c.gatherings!.items[0].invitations.push({ ...g.invitations[0] }); });
  check(c => { delete c.gatherings; c.npcs[0].currentAction = { kind: 'Attend', score: 110, target: { ...c.npcs[0].position }, targetId: g.id, reason: '', path: [], progress: 0, duration: 6 }; });
});
test('observation HTML escapes resident names and never changes plans or retrieval timestamps', () => {
  const { w, host } = fixture(); host.identity.name = '<script>fake</script>'; const before = JSON.stringify(w);
  const html = gatheringsView(w, host); assert.ok(html.includes('&lt;script&gt;')); assert.ok(!html.includes('<script>')); assert.equal(JSON.stringify(w), before);
});
test('server commits new optional appointment state and restores it with original invitation records', async () => {
  const db = database(), store = new WorldStore(db); await store.init(0);
  const before = await store.read();
  assert.equal(before.state.gatherings, undefined);
  const result = await applyCommand(before, { id: 'appointments-step', revision: before.revision, action: { type: 'step', ticks: 144 } }, 0);
  assert.ok(result.world.state.gatherings?.items.length);
  await store.commit(result.world, result.events, 'step', 'appointments-step');
  const after = await new WorldStore(db).read();
  assert.deepEqual(after.state.gatherings, result.world.state.gatherings);
  const exported = await store.export(after.epoch);
  const g = exported.gatherings!.items[0];
  assert.ok(exported.events.some(e => e.id === g.sourceEventId));
  for (const i of g.invitations) assert.ok(exported.events.some(e => e.id === i.invitationEventId));
  Simulation.load(JSON.stringify(exported));
});
