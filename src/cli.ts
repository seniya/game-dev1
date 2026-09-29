import { readFile, writeFile } from 'node:fs/promises';
import { Simulation, summarize } from './sim/engine';
import { DecisionCoordinator } from './llm/coordinator';
import { MockLLMProvider } from './llm/provider';

async function main() {
  const args = process.argv.slice(2), options = new Map<string, string>();
  if (args.includes('--help')) { console.log('npm run simulate -- --days 100 --seed 42 --npcs 12 --llm mock|off [--load world.save.json] [--save world.save.json]'); return; }
  for (let i = 0; i < args.length; i += 2) {
    if (!['--days', '--seed', '--npcs', '--llm', '--save', '--load'].includes(args[i]) || args[i + 1] === undefined) throw new Error(`잘못된 옵션: ${args[i]}`);
    options.set(args[i], args[i + 1]);
  }
  const days = Number(options.get('--days') ?? 100);
  if (!Number.isInteger(days) || days < 1 || days > 10000) throw new Error('--days는 1~10000 정수여야 합니다.');
  const mode = options.get('--llm') ?? 'mock'; if (!['mock', 'off'].includes(mode)) throw new Error('--llm은 mock 또는 off입니다.');
  const sim = options.has('--load') ? Simulation.load(await readFile(options.get('--load')!, 'utf8')) : new Simulation(Number(options.get('--seed') ?? 42), Number(options.get('--npcs') ?? 12));
  sim.setLLM(mode === 'mock'); const coordinator = new DecisionCoordinator(sim, new MockLLMProvider());
  const startTick = sim.tick, started = performance.now();
  for (let i = 0; i < days * 144; i++) { sim.step(); if (mode === 'mock' && sim.pending) await coordinator.drain(); }
  const result = { ...summarize(sim.snapshot()), simulatedDays: (sim.tick - startTick) / 144, elapsedMs: Math.round(performance.now() - started) };
  if (options.has('--save')) await writeFile(options.get('--save')!, sim.save(), 'utf8');
  console.log(JSON.stringify(result, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
