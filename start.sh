#!/usr/bin/env bash
# Farmotic — lance l'application (interface + API) dans le navigateur.
# Usage : ./start.sh                 (port 3001, ou le suivant s'il est occupé)
#         PORT=3100 ./start.sh       (port imposé)
#         HOST=0.0.0.0 ./start.sh    (accessible depuis le réseau local)
#         FARMOTIC_NO_OPEN=1 ./start.sh  (ne pas ouvrir le navigateur)
set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$RACINE"

# Node.js : le binaire livré dans .tools est compilé pour une seule
# architecture (x86-64). On ne l'utilise que s'il s'exécute vraiment ici :
# sur un Raspberry Pi (arm64/armhf) c'est le Node.js du système qui prend
# le relais, sinon l'application ne démarrerait pas du tout.
NODE_EMBARQUE="$RACINE/.tools/node/bin/node"
if [ -x "$NODE_EMBARQUE" ]; then
  if "$NODE_EMBARQUE" --version >/dev/null 2>&1; then
    export PATH="$RACINE/.tools/node/bin:$PATH"
  else
    echo "  ℹ Node.js livré dans .tools incompatible avec cette architecture ($(uname -m)) :"
    echo "    utilisation du Node.js du système."
  fi
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js est introuvable. Installez Node.js 18 ou plus récent : https://nodejs.org/" >&2
  echo "Sur Raspberry Pi : sudo apt install -y nodejs npm" >&2
  echo "(ou NodeSource pour une version 20 LTS : https://github.com/nodesource/distributions)" >&2
  exit 1
fi

# npm : celui du système, sinon celui livré avec .tools/node. Une copie du
# dossier peut perdre les liens symboliques bin/npm et bin/npx : on fabrique
# alors de petits lanceurs temporaires pour que « npm run build » fonctionne.
if ! command -v npm >/dev/null 2>&1; then
  NPM_CLI="$RACINE/.tools/node/lib/node_modules/npm/bin/npm-cli.js"
  if [ -f "$NPM_CLI" ]; then
    LANCEURS="${TMPDIR:-/tmp}/farmotic-lanceurs-$(id -u)"
    mkdir -p "$LANCEURS"
    NODE="$(command -v node)"
    printf '#!/bin/sh\nexec "%s" "%s" "$@"\n' "$NODE" "$NPM_CLI" >"$LANCEURS/npm"
    printf '#!/bin/sh\nexec "%s" "%s" "$@"\n' \
      "$NODE" "$RACINE/.tools/node/lib/node_modules/npm/bin/npx-cli.js" >"$LANCEURS/npx"
    chmod +x "$LANCEURS/npm" "$LANCEURS/npx"
    export PATH="$LANCEURS:$PATH"
  fi
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm est introuvable : impossible d'installer les dépendances ou de compiler." >&2
  echo "Réinstallez Node.js 18 ou plus récent depuis https://nodejs.org/" >&2
  exit 1
fi

# Dépendances : au premier lancement, ou si le dossier a été copié depuis
# une autre architecture (esbuild et Vite embarquent des binaires natifs
# propres à la machine : x86-64 sur PC, arm64 sur Raspberry Pi).
ARCH_COURANTE="$(uname -s)-$(uname -m)"
MARQUEUR_ARCH="$RACINE/node_modules/.farmotic-architecture"
if [ ! -d "$RACINE/node_modules/express" ] ||
  [ "$(cat "$MARQUEUR_ARCH" 2>/dev/null || true)" != "$ARCH_COURANTE" ]; then
  echo "  Installation des dépendances…"
  npm install --no-audit --no-fund
  printf '%s' "$ARCH_COURANTE" >"$MARQUEUR_ARCH"
fi

# Compilation si elle manque, ou si les sources sont plus récentes.
besoin_build=0
if [ ! -f "$RACINE/build/farmotic.cjs" ] || [ ! -f "$RACINE/build/public/index.html" ]; then
  besoin_build=1
elif [ -n "$(find "$RACINE/backend/src" "$RACINE/frontend/src" "$RACINE/package.json" \
  -newer "$RACINE/build/farmotic.cjs" -print -quit 2>/dev/null)" ]; then
  besoin_build=1
fi

if [ "$besoin_build" -eq 1 ]; then
  echo "  Compilation de Farmotic…"
  npm run build
fi

exec node "$RACINE/build/farmotic.cjs" "$@"
