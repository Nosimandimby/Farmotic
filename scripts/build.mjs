import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const dossierScripts = path.dirname(fileURLToPath(import.meta.url));
const racine = path.resolve(dossierScripts, '..');
const dossierBuild = path.join(racine, 'build');
const dossierPublic = path.join(dossierBuild, 'public');
const dossierInterface = path.join(racine, 'frontend', 'dist');

const index = path.join(dossierInterface, 'index.html');
if (!fs.existsSync(index)) {
  console.error(
    "\n  ⚠ Interface non compilée. Lancez d'abord « npm run build:interface ».\n",
  );
  process.exit(1);
}

// On repart d'un dossier build propre : l'interface et le serveur sont toujours
// compilés ensemble, jamais mélangés avec une version précédente.
fs.rmSync(dossierBuild, { recursive: true, force: true });
fs.mkdirSync(dossierBuild, { recursive: true });

fs.cpSync(dossierInterface, dossierPublic, { recursive: true });

await build({
  entryPoints: [path.join(racine, 'backend', 'src', 'server.js')],
  outfile: path.join(dossierBuild, 'farmotic.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  sourcemap: false,
  logLevel: 'info',
  banner: {
    js: '// Farmotic — serveur compilé par « npm run build ». Ne pas éditer à la main.',
  },
});

// node-sqlite3-wasm charge son binaire WebAssembly à côté du script exécuté
// (le bundle), d'où cette copie dans build/.
const wasm = path.join(
  racine,
  'node_modules',
  'node-sqlite3-wasm',
  'dist',
  'node-sqlite3-wasm.wasm',
);
if (!fs.existsSync(wasm)) {
  console.error(
    '\n  ⚠ node-sqlite3-wasm est absent. Lancez « npm install » puis relancez la compilation.\n',
  );
  process.exit(1);
}
fs.copyFileSync(wasm, path.join(dossierBuild, 'node-sqlite3-wasm.wasm'));

console.log('\n  ✅ Farmotic compilé dans ./build (node build/farmotic.cjs)\n');
