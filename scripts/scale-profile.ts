import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/engine';
import { indexPeople, neighbours } from '../src/sim/spatial';
const rows = [];
for (const population of [12, 300, 1000, 3000]) {
  const w = new Simulation(42, population).snapshot(),
    count = 500;
  const baseline = () => {
    const buckets = new Map<string, Set<(typeof w.npcs)[number]>>(),
      order = new Map<string, number>(),
      cells = new Map<string, string>();
    w.npcs.forEach((n, i) => {
      const key = `${Math.floor(n.position.x / 8)},${Math.floor(n.position.y / 8)}`;
      order.set(n.id, i);
      if (!buckets.has(key)) buckets.set(key, new Set());
      buckets.get(key)!.add(n);
      cells.set(n.id, key);
    });
    return buckets;
  };
  baseline();
  indexPeople(w);
  const begin = performance.now();
  for (let i = 0; i < count; i++) baseline();
  const baselineMs = performance.now() - begin;
  const next = performance.now();
  for (let i = 0; i < count; i++) indexPeople(w);
  const reuseMs = performance.now() - next;
  for (const n of w.npcs.slice(0, 20))
    assert.deepEqual(
      neighbours(w, n, 8).map((n) => n.id),
      w.npcs
        .filter((p) => Math.abs(n.position.x - p.position.x) + Math.abs(n.position.y - p.position.y) <= 8)
        .map((n) => n.id),
    );
  rows.push({ population, iterations: count, baselineMs, reuseMs, speedup: baselineMs / reuseMs });
}
writeFileSync(
  'reports/scale-profile-v022.json',
  JSON.stringify(
    {
      scope:
        'Local spatial-index microbenchmark; same positions and exact neighbour results. Does not measure full server request latency.',
      rows,
    },
    null,
    2,
  ) + '\n',
);
console.log(rows);
