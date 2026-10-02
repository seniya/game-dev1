import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const registry=readFileSync('src/server/engine-registry.ts','utf8');
for(const file of readdirSync('src/server/retained').filter(f=>f.endsWith('.json'))) {
 const m=JSON.parse(readFileSync(`src/server/retained/${file}`,'utf8'));
 const hash=createHash('sha256').update(readFileSync(`src/server/retained/${file.slice(0,-5)}`)).digest('hex');
 if(hash!==m.sha256||!registry.includes(m.fingerprint)||!registry.includes(`./retained/${m.fingerprint}`))throw Error(`Retained engine integrity failed: ${file}`);
}
console.log('Retained engine hashes and registry verified.');
