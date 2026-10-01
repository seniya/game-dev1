import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { cp, mkdir } from 'node:fs/promises';
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const simulationBuild = createHash('sha256');
for (const file of (readdirSync('src', { recursive: true }) as string[]).filter(f => f.endsWith('.ts')).sort()) simulationBuild.update(file).update(readFileSync(`src/${file}`));
export default defineConfig({
  define: { __SIMULATION_BUILD__: JSON.stringify(simulationBuild.digest('hex')) },
  plugins: [cloudflare({ viteEnvironment: { name: 'server' } }), { name: 'sites-metadata', async closeBundle() {
    await mkdir('dist/.openai', { recursive: true });
    await cp('.openai/hosting.json', 'dist/.openai/hosting.json');
  } }],
});
