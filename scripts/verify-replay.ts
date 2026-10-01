import { readFile } from 'node:fs/promises';
import type { ReplayBundle } from '../src/server/replay';
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const fingerprint = createHash('sha256');
for (const path of (readdirSync('src', { recursive: true }) as string[]).filter((f) => f.endsWith('.ts')).sort())
  fingerprint.update(path).update(readFileSync(`src/${path}`));
(globalThis as unknown as Record<string, unknown>).__SIMULATION_BUILD__ = fingerprint.digest('hex');
const { verifyReplay } = await import('../src/server/replay');
const file = process.argv[2];
if (!file) throw new Error('사용법: npm run replay -- <세계 재생 파일> [--engine]');
const bundle = JSON.parse(await readFile(file, 'utf8')) as ReplayBundle;
const { world: _, ...result } = await verifyReplay(bundle, process.argv.includes('--engine'));
console.log(JSON.stringify(result, null, 2));
