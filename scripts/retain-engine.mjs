// Preserve an exact committed engine before modifying its rules. No working-tree source is used.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildSync } from 'esbuild';
const commit = execFileSync('git', ['rev-parse', '--verify', `${process.argv[2] ?? 'HEAD'}^{commit}`], {encoding:'utf8'}).trim();
const temp = mkdtempSync(join(tmpdir(), 'world-engine-'));
try {
  const files = execFileSync('git', ['ls-tree','-r','--name-only',commit,'src'], {encoding:'utf8'}).trim().split('\n').filter(f=>f.endsWith('.ts'));
  const hash = createHash('sha256');
  for (const file of files.sort((a,b)=>a.slice(4)<b.slice(4)?-1:1)) {
    const data=execFileSync('git',['show',`${commit}:${file}`],{maxBuffer:10_000_000});
    hash.update(file.slice(4)).update(data);
    mkdirSync(join(temp,file,'..'),{recursive:true});writeFileSync(join(temp,file),data);
  }
  const fingerprint=hash.digest('hex');
  writeFileSync(join(temp,'entry.ts'),`export {Simulation as LegacySimulation} from './src/sim/engine';\nexport {DecisionCoordinator as LegacyCoordinator} from './src/llm/coordinator';\nexport {MockLLMProvider as LegacyMock} from './src/llm/provider';\n`);
  const output=buildSync({entryPoints:[join(temp,'entry.ts')],bundle:true,format:'esm',platform:'neutral',external:['zod'],write:false,minify:true}).outputFiles[0].text;
  const path=`src/server/retained/${fingerprint}.ts`;
  const body=`// @ts-nocheck\n// Immutable engine from ${commit}. Regenerate using scripts/retain-engine.mjs.\n${output}`;
  writeFileSync(path,body);
  writeFileSync(path+'.json',JSON.stringify({commit,fingerprint,sha256:createHash('sha256').update(body).digest('hex')},null,2)+'\n');
  const registryPath='src/server/engine-registry.ts',registry=readFileSync(registryPath,'utf8');
  if(!registry.includes(fingerprint))writeFileSync(registryPath,registry.replace('export const retainedEngines = {',`export const retainedEngines = {\n  '${fingerprint}': () => import('./retained/${fingerprint}'),`));
  console.log(JSON.stringify({commit,fingerprint,path}));
} finally {rmSync(temp,{recursive:true,force:true});}
