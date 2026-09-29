import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { cp, mkdir } from 'node:fs/promises';
export default defineConfig({
  plugins: [cloudflare({ viteEnvironment: { name: 'server' } }), { name: 'sites-metadata', async closeBundle() {
    await mkdir('dist/.openai', { recursive: true });
    await cp('.openai/hosting.json', 'dist/.openai/hosting.json');
  } }],
});
