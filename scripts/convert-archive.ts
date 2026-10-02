import { readFile, writeFile } from 'node:fs/promises';
import { Simulation } from '../src/sim/engine';
import { compactWorld } from '../src/server/world';
import { archiveRecords } from '../src/shared/archive';
const [source,target]=process.argv.slice(2);
if(!source||!target||source===target)throw Error('사용법: npx tsx scripts/convert-archive.ts 원본.json 새파일.lsw');
const state=Simulation.load(await readFile(source,'utf8')).snapshot();
async function* events(){yield* state.events;}
await writeFile(target,archiveRecords(compactWorld(state),events(),state.events.length),{flag:'wx'});
console.log(`아카이브 저장: ${target} · 사건 ${state.events.length}건`);
