import { cp, access, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { generateServiceWorker } from './generate-sw.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
await access(new URL('../dist/index.html', import.meta.url));
await access(new URL('../apps/transcribe/dist/sw.js', import.meta.url));
await cp(root + 'apps/transcribe/dist', root + 'dist/transcribe', { recursive: true });
await writeFile(root + 'dist/.nojekyll', '');
const result = await generateServiceWorker(root + 'dist');
console.log(`Bass Lab: Shape + tools + Transcribe · root cache ${result.version}`);
