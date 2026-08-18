// Copies the marketing landing page into the web app's public dir so it can be
// served at /landing.html (the app mounts it at "/"). Runs on predev/prebuild
// so the two never drift. Single source of truth: apps/landing/index.html.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));           // apps/web/scripts
const src = resolve(here, '../../landing/index.html');          // apps/landing/index.html
const dest = resolve(here, '../public/landing.html');           // apps/web/public/landing.html

if (!existsSync(src)) {
  console.warn(`[copy-landing] source not found: ${src} — skipping`);
  process.exit(0);
}
mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log(`[copy-landing] ${src} → ${dest}`);
