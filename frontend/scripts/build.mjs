// Build de l'interface : Vite + vite-plugin-pwa.
//
// On lance Vite dans un processus enfant avec NODE_OPTIONS=--require <polyfill>
// afin que le polyfill `crypto` soit aussi présent dans les threads de travail
// (workbox-build délègue la minification du service worker à des Workers de
// @rollup/plugin-terser). Voir scripts/polyfill-webcrypto.cjs.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const dossierScripts = path.dirname(fileURLToPath(import.meta.url));
const polyfill = path.join(dossierScripts, 'polyfill-webcrypto.cjs');
const viteBin = path.join(
  path.dirname(require.resolve('vite/package.json')),
  'bin',
  'vite.js',
);

const nodeOptions = [process.env.NODE_OPTIONS, `--require=${polyfill}`]
  .filter(Boolean)
  .join(' ');

const enfant = spawn(process.execPath, [viteBin, 'build', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, NODE_OPTIONS: nodeOptions },
});

enfant.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
