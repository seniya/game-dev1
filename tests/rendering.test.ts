import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/engine';
import { motionTrace, movingTrace } from '../src/sim/motion';
import { MotionPlayback } from '../src/ui/motion';
import { mergeLiveJournal, type EventPage } from '../src/ui/journal';
import { initialWorld, applyCommand } from '../src/server/world';

test('presentation traces record real per-tick positions without affecting deterministic simulation', async () => {
  const a = new Simulation(42), b = new Simulation(42), trace = motionTrace(a.snapshot());
  a.step(12, trace); b.step(12); assert.equal(a.save(), b.save());
  for (const n of a.snapshot().npcs) {
    assert.equal(trace.paths[n.id].length, 13);
    assert.deepEqual(trace.paths[n.id].at(-1), [n.position.x, n.position.y]);
  }
  const w = initialWorld(1000); w.meta.running = true;
  const result = await applyCommand(w, { id: crypto.randomUUID(), revision: 0, action: { type: 'sync' } }, 3100);
  assert.equal(result.motion!.fromTick, w.state.tick); assert.equal(result.motion!.toTick, result.world.state.tick);
  assert.equal('motion' in result.world, false, 'presentation data stays outside durable world state');
  assert.ok(JSON.stringify(movingTrace(trace)).length < JSON.stringify(a.snapshot()).length);
});

test('motion follows confirmed corners, retargets continuously and snaps on pause or discontinuity', () => {
  const first = new Simulation(42).snapshot().npcs.slice(0, 1); first[0].position = { x: 1, y: 1 };
  const second = structuredClone(first); second[0].position = { x: 2, y: 2 };
  const m = new MotionPlayback(); m.update([], first, undefined, 0, 0);
  const paths = { [first[0].id]: [[1, 1], [2, 1], [2, 2]] as [number, number][] };
  m.update(first, second, { fromTick: 0, toTick: 2, paths }, 100, 1000);
  assert.deepEqual(m.position(first[0].id, 350), { x: 1.5, y: 1 });
  assert.deepEqual(m.position(first[0].id, 600), { x: 2, y: 1 });
  const third = structuredClone(second); third[0].position = { x: 3, y: 2 };
  const displayed = m.position(first[0].id, 700);
  m.update(second, third, { fromTick: 2, toTick: 3, paths: { [first[0].id]: [[2, 2], [3, 2]] } }, 700, 1000);
  assert.deepEqual(m.position(first[0].id, 700), displayed);
  assert.deepEqual(m.position(first[0].id, 5000), { x: 3, y: 2 }, 'a late network response cannot make residents walk beyond confirmed state');
  m.update(third, first, undefined, 5100, 0); assert.deepEqual(m.position(first[0].id, 5100), { x: 1, y: 1 });
  m.update(first, third, undefined, 5200, 1000); assert.deepEqual(m.position(first[0].id, 5200), { x: 3, y: 2 }, 'unexplained relocation must not animate through obstacles');
  third[0].alive = false; m.update(first, third, undefined, 5300, 1000); assert.equal(m.position(first[0].id, 5300), undefined);
});

test('live journal merges received events and keeps archive cursors correct without a refetch', () => {
  const w = initialWorld(0), sample = w.state.events[0];
  const event = (seq: number) => ({ ...sample, id: `event-${seq}`, description: `사건 ${seq}`, kind: 'share' as const, importance: 75 });
  const events = Array.from({ length: 40 }, (_, i) => event(40 - i));
  const page: EventPage = { epoch: w.epoch, events, eventCount: 40, next: null, cursors: Object.fromEntries(events.map((e, i) => [e.id, 40 - i])) };
  w.meta.eventCount = 45; w.state.events = Array.from({ length: 45 }, (_, i) => event(i + 1));
  const next = mergeLiveJournal(page, w, new URLSearchParams({ filter: 'important' }))!;
  assert.equal(next.events.length, 40); assert.equal(next.events[0].id, 'event-45'); assert.equal(next.next, 6);
  assert.equal(next.events.at(-1)!.id, 'event-6');
  assert.equal(mergeLiveJournal(next, w, new URLSearchParams()), next);
  const filtered = mergeLiveJournal({ ...page, events: [], cursors: {} }, w, new URLSearchParams({ filter: 'economy' }))!;
  assert.deepEqual(filtered.events, []);
  w.meta.eventCount = 200; assert.equal(mergeLiveJournal(next, w, new URLSearchParams()), undefined, 'missed event gaps require the authoritative archive');
});
