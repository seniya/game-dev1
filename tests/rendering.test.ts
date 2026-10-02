import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/engine';
import { motionTrace, movingTrace } from '../src/sim/motion';
import { MotionBuffer, MotionPlayback } from '../src/ui/motion';
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

test('buffered confirmed routes stay in motion across jitter and slow responses without extrapolation', () => {
  const buffer = new MotionBuffer(), playback = new MotionPlayback();
  let residents = new Simulation(42).snapshot().npcs.slice(0, 1);
  residents[0].position = { x: 1, y: 1 };
  const id = residents[0].id;
  playback.update([], residents, undefined, 0, 0);
  let tick = 0;
  for (const now of [2000, 4550, 6600, 9200, 12000, 15500, 18800]) {
    const next = structuredClone(residents), x = residents[0].position.x;
    next[0].position.x += 2;
    const displayed = playback.position(id, now);
    if (tick) {
      assert.equal(playback.active(now), true, `buffer must cover the response at ${now}ms`);
      assert.notDeepEqual(playback.position(id, now - 100), displayed, 'no artificial wait before the next response');
    }
    playback.update(residents, next, { fromTick: tick, toTick: tick + 2, paths: { [id]: [[x, 1], [x + 1, 1], [x + 2, 1]] } }, now, buffer.duration(now, 2000));
    assert.deepEqual(playback.position(id, now), displayed, 'receiving a snapshot must not jump');
    assert.ok(playback.position(id, now + 100)!.x <= next[0].position.x);
    residents = next; tick += 2;
  }
  assert.deepEqual(playback.position(id, 60_000), residents[0].position, 'network loss stops at the last confirmed position');
  assert.equal(buffer.duration(60_000, 2000), 0, 'long absence snaps to the recovered state');
  buffer.reset(); assert.equal(buffer.duration(61_000, 2000), 2700);
});

test('retargeting near a tile boundary does not give the short remainder a full tile of playback time', () => {
  const first = new Simulation(42).snapshot().npcs.slice(0, 1), id = first[0].id;
  first[0].position = { x: 1, y: 1 };
  const second = structuredClone(first); second[0].position = { x: 2, y: 2 };
  const third = structuredClone(second); third[0].position = { x: 3, y: 2 };
  const m = new MotionPlayback(); m.update([], first, undefined, 0, 0);
  m.update(first, second, { fromTick: 0, toTick: 2, paths: { [id]: [[1, 1], [2, 1], [2, 2]] } }, 0, 2000);
  m.update(second, third, { fromTick: 2, toTick: 3, paths: { [id]: [[2, 2], [3, 2]] } }, 1900, 1100);
  assert.deepEqual(m.position(id, 2000), { x: 2, y: 2 });
  assert.ok(Math.abs(m.position(id, 2100)!.x - 2.1) < 1e-10);
  assert.equal(m.position(id, 2100)!.y, 2);
});

test('settings commands include confirmed motion even when the intervention advances the clock', async () => {
  const w = initialWorld(1000); w.meta.running = true;
  const result = await applyCommand(w, { id: crypto.randomUUID(), revision: 0, action: { type: 'speed', speed: 5 } }, 3800);
  assert.equal(result.motion!.fromTick, w.state.tick);
  assert.equal(result.motion!.toTick, result.world.state.tick);
  assert.equal(result.world.state.tick, w.state.tick + 4);
  for (const [id, path] of Object.entries(result.motion!.paths)) {
    const target = result.world.state.npcs.find(n => n.id === id)!.position;
    assert.deepEqual(path.at(-1), [target.x, target.y]);
  }
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

test('viewport culling retains offscreen-to-offscreen routes crossing the visible map at every frame',()=>{
 const a=new Simulation().snapshot().npcs[0],b=structuredClone(a);a.position={x:0,y:3};b.position={x:20,y:3};
 const motion=new MotionPlayback();motion.update([], [a],undefined,0,0);motion.update([a],[b],{fromTick:0,toTick:20,paths:{[a.id]:Array.from({length:21},(_,i)=>[i,3])}},0,2000);
 assert.equal(motion.intersects(a.id,8,0,12,8),true);assert.equal(motion.intersects(a.id,8,8,12,12),false);
 for(let time=0;time<=2000;time+=50){const p=motion.position(a.id,time)!;if(p.x>=8&&p.x<12)assert.ok(motion.intersects(a.id,8,0,12,8));}
 motion.finish();assert.equal(motion.intersects(a.id,8,0,12,8),false);
});
