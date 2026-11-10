import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Dossier du fichier en cours, que l'on exécute les sources (modules ES)
 * ou le bundle de production (CommonJS).
 */
export const dossierExecution =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

const contientSources = (dossier) =>
  fs.existsSync(path.join(dossier, 'backend')) &&
  fs.existsSync(path.join(dossier, 'frontend'));

/** Racine de l'application : le dossier que l'on copie d'un PC à l'autre. */
export const racineApplication = (() => {
  if (process.env.FARMOTIC_ROOT) return path.resolve(process.env.FARMOTIC_ROOT);

  // Bundle de production : <racine>/build/farmotic.cjs
  if (fs.existsSync(path.join(dossierExecution, 'farmotic.cjs'))) {
    return path.dirname(dossierExecution);
  }

  // Sources : <racine>/backend/src/chemins.js
  return (
    [path.join(dossierExecution, '..', '..'), path.join(dossierExecution, '..')].find(
      contientSources,
    ) || process.cwd()
  );
})();

/** Dossier de l'interface compilée, ou null si elle n'est pas encore construite. */
export function dossierInterface() {
  const candidats = [
    path.join(dossierExecution, 'public'),
    path.join(racineApplication, 'build', 'public'),
    path.join(racineApplication, 'frontend', 'dist'),
  ];
  return candidats.find((dossier) => fs.existsSync(path.join(dossier, 'index.html'))) || null;
}
