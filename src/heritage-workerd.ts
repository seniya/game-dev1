import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Simulation } from './sim/engine';
import type { WorldView, Command } from './server/world';
const origin = 'http://127.0.0.1:4174';
let world = await (await fetch(`${origin}/api/world`)).json() as WorldView;
const measurements: { action: string; ms: number; population: number; tick: number; bytes: number }[] = [];
async function send(action: Command['action']) {
  const start = performance.now();
  const response = await fetch(`${origin}/api/command`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: randomUUID(), revision: world.revision, action }) });
  assert.equal(response.status, 200); const text = await response.text(); world = JSON.parse(text);
  measurements.push({ action: action.type, ms: Math.round(performance.now() - start), population: world.state.npcs.filter(n => n.alive).length, tick: world.state.tick, bytes: Buffer.byteLength(text) });
}
await send({ type: 'reset', seed: 42, population: 72 }); await send({ type: 'ai-mode', mode: 'off' });
for (let i = 0; i < 4; i++) await send({ type: 'step', ticks: 144 });
const response = await fetch(`${origin}/api/history?topic=ecology&settlement=v0&epoch=${world.epoch}`);
assert.equal(response.status, 200); const history = await response.json() as any; assert.ok(history.events.some((e: any) => e.kind === 'ecology')); assert.ok(history.comparison.first.tick < history.comparison.last.tick);
const before = world.state.tick, exp = await fetch(`${origin}/api/export-stream`); assert.equal(exp.status, 200);
const saved = await exp.text(), restored = Simulation.load(saved).snapshot(); assert.equal(restored.tick, before); assert.ok(restored.events.length > world.state.events.length);
await send({ type: 'import', save: saved }); assert.equal(world.state.tick, before);
await send({ type: 'reset', seed: 123, population: 3000 }); await send({ type: 'ai-mode', mode: 'off' });
const start = world.state.tick; await send({ type: 'step', ticks: 144 }); assert.equal(world.meta.pendingTicks, 143);
await send({ type: 'sync' }); assert.equal(world.meta.pendingTicks, 142); await send({ type: 'play', running: false }); assert.equal(world.meta.pendingTicks, 0); assert.equal(world.state.tick, start + 2);
const threeK = await (await fetch(`${origin}/api/export-stream`)).text(); assert.equal(Simulation.load(threeK).snapshot().npcs.length, 3000);
const reconnected = await (await fetch(`${origin}/api/world`)).json() as WorldView; assert.equal(reconnected.state.tick, world.state.tick); assert.equal(reconnected.revision, world.revision);
await writeFile('reports/heritage-workerd.json', JSON.stringify({ generatedAt: new Date().toISOString(), runtime: 'local Cloudflare Worker/D1, real HTTP requests', history: { records: history.events.length, first: history.comparison.first.id, last: history.comparison.last.id }, exportBytes: Buffer.byteLength(saved), threeKExportBytes: Buffer.byteLength(threeK), measurements, checks: ['city historical comparisons', 'stream restore', '3000 residents', 'bounded manual day', 'cancel and reconnect'] }, null, 2));
// Leave the disposable local world small and paused for manual viewing.
await send({ type: 'reset', seed: 42, population: 12 }); await send({ type: 'ai-mode', mode: 'off' });
console.log('PASS: real Worker/D1 historical queries, streaming save/load, 3000 residents and bounded continuation.');
