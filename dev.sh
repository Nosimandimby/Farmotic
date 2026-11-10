#!/usr/bin/env bash
# Farmotic — mode développement.
# API sur http://localhost:3001 (rechargée automatiquement) et interface Vite
# sur http://localhost:5173 (à ouvrir dans le navigateur).
set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$RACINE"

# Voir start.sh : le Node.js de .tools n'est utilisé que s'il s'exécute sur
# cette architecture (il est compilé pour x86-64, donc ignoré sur un Pi arm64).
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
  exit 1
fi

# Voir start.sh : npm peut manquer si les liens symboliques de .tools/node ont
# été perdus lors d'une copie du dossier.
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
  echo "npm est introuvable." >&2
  exit 1
fi

ARCH_COURANTE="$(uname -s)-$(uname -m)"
MARQUEUR_ARCH="$RACINE/node_modules/.farmotic-architecture"
if [ ! -d "$RACINE/node_modules/express" ] ||
  [ "$(cat "$MARQUEUR_ARCH" 2>/dev/null || true)" != "$ARCH_COURANTE" ]; then
  echo "  Installation des dépendances…"
  npm install --no-audit --no-fund
  printf '%s' "$ARCH_COURANTE" >"$MARQUEUR_ARCH"
fi

echo ""
echo "  🐔 Farmotic — mode développement"
echo "  Interface : http://localhost:5173"
echo "  API       : http://localhost:3001/api"
echo "  Arrêt     : Ctrl+C"
echo ""

exec npm run dev
