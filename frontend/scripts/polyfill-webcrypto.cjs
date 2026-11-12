// Préchargé dans le processus de build et dans ses threads de travail.
//
// Node 18 n'expose pas `globalThis.crypto` dans le contexte d'un Worker, alors
// que `serialize-javascript@7` — dépendance de @rollup/plugin-terser, utilisée
// par workbox-build pour minifier le service worker — appelle
// `crypto.getRandomValues`. Sans ce polyfill, `vite build` échoue avec
// « crypto is not defined » pendant l'écriture du service worker.
if (
  typeof globalThis.crypto === 'undefined' ||
  typeof globalThis.crypto.getRandomValues !== 'function'
) {
  globalThis.crypto = require('node:crypto').webcrypto;
}
