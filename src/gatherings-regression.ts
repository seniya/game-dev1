import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { Simulation } from './sim/engine';
import { compactWorld } from './server/world';
import { balance } from './sim/economy';
import { urbanBalance } from './sim/urban';
import { DecisionCoordinator } from './llm/coordinator';
import { MockLLMProvider } from './llm/provider';
import type { WorldEvent } from './sim/types';

const seedArg=process.argv.indexOf('--seed');
const seeds=seedArg<0?[7,42,123]:[Number(process.argv[seedArg+1])];
if(seeds.some(seed=>![7,42,123].includes(seed)))throw new Error('Regression seed must be 7, 42 or 123');
const report=seedArg<0?'reports/recurring-observation-regression.json':`reports/recurring-observation-seed-${seeds[0]}.json`;
const results: unknown[] = [], started = Date.now();
for (const seed of seeds) for (const mode of ['off', 'mock'] as const) {
  const dir = mkdtempSync(`${tmpdir()}/lsw-gatherings-`), db = new DatabaseSync(`${dir}/events.sqlite`);
  db.exec('CREATE TABLE events(id TEXT PRIMARY KEY, body TEXT); CREATE TABLE refs(source TEXT,target TEXT);');
  const insert = db.prepare('INSERT OR IGNORE INTO events VALUES(?,?)'), ref = db.prepare('INSERT INTO refs VALUES(?,?)');
  let sim = new Simulation(seed); sim.setLLM(mode !== 'off');
  let known = new Set<string>(), peakBytes = 0, peakItems = 0, maximumStall = 0;
  let recurringProposals=0;
  const phases: Record<string, number> = {}, kinds: Record<string, number> = {}, deaths: Record<string, number> = {};
  const proposals = new Set<string>(), cooldown = new Map<string, number>();
  const invitations = new Map<string, Set<string>>(), hosts = new Map<string, string>(), completed = new Set<string>();
  const stalled = new Map<string, { key: string; tick: number }>();
  const archive = (events: WorldEvent[]) => {
    db.exec('BEGIN');
    for (const e of events) {
      if (known.has(e.id) || !insert.run(e.id, JSON.stringify(e)).changes) continue;
      for (const target of [...(e.causeId ? [e.causeId] : []), ...(Array.isArray(e.data.evidence) ? e.data.evidence : [])]) ref.run(e.id, target);
      if (e.kind === 'death') deaths[String(e.data.reason)] = (deaths[String(e.data.reason)] ?? 0) + 1;
      if (e.kind !== 'gathering') continue;
      const phase = String(e.data.phase); phases[phase] = (phases[phase] ?? 0) + 1;
      if (phase === 'proposed') {
        if(e.data.recurringPartner) {
          recurringProposals++;
          assert.ok(Array.isArray(e.data.evidence) && e.data.evidence.length>=2);
          for(const id of e.data.evidence) {
            const row=db.prepare('SELECT body FROM events WHERE id=?').get(id) as {body:string};
            const previous=JSON.parse(row.body) as WorldEvent;
            assert.equal(previous.data.phase,'completed');
            assert.ok(previous.participants.includes(e.actorId!) && previous.participants.includes(String(e.data.recurringPartner)) && previous.tick<=e.tick-432);
          }
        }
        const key = `${Math.floor(e.tick / 144)}:${e.data.settlementId}`; assert.ok(!proposals.has(key)); proposals.add(key);
        assert.ok(e.tick - (cooldown.get(e.actorId!) ?? -Infinity) >= 432); cooldown.set(e.actorId!, e.tick);
        hosts.set(String(e.data.gatheringId), e.actorId!); invitations.set(String(e.data.gatheringId), new Set());
      }
      const group = String(e.data.gatheringId);
      if (phase === 'invited') {
        assert.ok(typeof e.data.distance === 'number' && e.data.distance <= 4);
        const guest = e.participants.find(id => id !== e.actorId)!; assert.ok(!invitations.get(group)!.has(guest)); invitations.get(group)!.add(guest);
      }
      if (phase === 'accepted' || phase === 'arrived') assert.ok(e.actorId === hosts.get(group) || invitations.get(group)?.has(e.actorId!));
      if (phase === 'completed') {
        assert.ok(!completed.has(group)); completed.add(group);
        assert.ok(e.participants.length >= 2 && e.participants.length <= 4 && e.participants.every(id => id === hosts.get(group) || invitations.get(group)?.has(id)));
        kinds[String(e.data.gatheringKind)] = (kinds[String(e.data.gatheringKind)] ?? 0) + 1;
      }
    }
    db.exec('COMMIT');
  };
  archive(sim.snapshot().events);
  for (let day = 1; day <= 365; day++) {
    const coordinator = new DecisionCoordinator(sim, new MockLLMProvider());
    for (let t = 0; t < 144; t++) { sim.step(); if (mode === 'mock' && sim.pending) await coordinator.drain(); }
    const w = sim.snapshot(); archive(w.events);
    assert.deepEqual(balance(w), { food: 0, wood: 0, coins: 0 }); assert.ok(Object.values(urbanBalance(w)).every(v => v === 0));
    assert.ok((w.gatherings?.items.length ?? 0) <= 36); peakItems = Math.max(peakItems, w.gatherings?.items.length ?? 0);
    for (const n of w.npcs) {
      assert.ok(!n.cognition || n.cognition.reflections.length <= 8 && (n.cognition.retrieval?.items.length ?? 0) <= 8);
      const a = n.currentAction; if (!n.alive || !a) { stalled.delete(n.id); continue; }
      const key = JSON.stringify([a.kind, a.targetId, a.progress, a.path.length, n.position, n.decision.tick]);
      const previous = stalled.get(n.id); if (previous?.key === key) maximumStall = Math.max(maximumStall, w.tick - previous.tick); else stalled.set(n.id, { key, tick: w.tick });
    }
    assert.ok(maximumStall < 144 * 5);
    const compact = compactWorld(w), saved = JSON.stringify(compact); peakBytes = Math.max(peakBytes, Buffer.byteLength(saved));
    if (day % 30 === 0 || day === 100 || day === 365) {
      // Compare the uninterrupted engine to an independently restored compact checkpoint.
      const resumed = Simulation.load(saved); sim.step(144); resumed.step(144);
      assert.deepEqual({ ...JSON.parse(sim.save()), events: [] }, { ...JSON.parse(resumed.save()), events: [] });
      const missing = db.prepare('SELECT count(*) AS n FROM refs r LEFT JOIN events e ON e.id=r.target WHERE e.id IS NULL').get() as { n: number }; assert.equal(missing.n, 0);
    }
    sim = Simulation.load(saved); assert.equal(sim.save(), saved); known = new Set(compact.events.map(e => e.id));
    if (day === 100 || day === 365) {
      assert.ok((phases.proposed ?? 0) > 0 && (phases.completed ?? 0) > 0);
      results.push({ seed, mode, days: day, recurringProposals, survivors: w.npcs.filter(n => n.alive).length, phases: { ...phases }, completedKinds: { ...kinds }, deathReasons: { ...deaths },
        peakItems, peakCheckpointBytes: peakBytes, maximumStallTicks: maximumStall, retainedReflections: w.npcs.reduce((s, n) => s + (n.cognition?.reflections.length ?? 0), 0),
        modelDecisions: w.llm.completed, balance: balance(w), goodsBalance: urbanBalance(w), dailyRestore: true, exactContinuation: true, missingEvidence: 0 });
      console.log(JSON.stringify({ seed, mode, day, phases, kinds, survivors: w.npcs.filter(n => n.alive).length }));
      writeFileSync(report, JSON.stringify({ version: '0.18.0', completed: false, elapsedMs: Date.now() - started, results }, null, 2) + '\n');
    }
  }
  db.close(); rmSync(dir, { recursive: true });
}
writeFileSync(report, JSON.stringify({ version: '0.18.0', completed: true, elapsedMs: Date.now() - started, results,
  limits: 'Rule-based simulation on local CPU; no real Chrome inference, external API, human believability evaluation or production long-duration load test.' }, null, 2) + '\n');
