#!/usr/bin/env bash
# Farmotic — mode développement.
# API FastAPI sur http://localhost:3001 (rechargement à chaud de main.py) et
# interface Vite sur http://localhost:5173 (proxy /api vers 3001).
#
#   ./dev.sh            # les deux services
#   PORT=3100 ./dev.sh  # port d'API imposé (pensez à frontend/vite.config.js)
set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$RACINE"

# Python du projet (.venv créé par lancer.py), sinon Python du système.
PYTHON="$RACINE/.venv/bin/python"
if [ ! -x "$PYTHON" ]; then
  PYTHON="$(command -v python3 || command -v python || true)"
fi

if [ -z "$PYTHON" ]; then
  echo "Python 3.10+ est introuvable. Installez-le :" >&2
  echo "  sudo apt install -y python3 python3-venv python3-pip" >&2
  exit 1
fi

# Dépendances Python (fastapi, uvicorn, bcrypt).
if ! "$PYTHON" -c "import fastapi, uvicorn, bcrypt" >/dev/null 2>&1; then
  echo "  📦 Installation des dépendances Python…"
  "$PYTHON" "$RACINE/lancer.py" --install-only
  # Après une installation dans .venv, on réutilise cet interpréteur.
  if [ -x "$RACINE/.venv/bin/python" ]; then
    PYTHON="$RACINE/.venv/bin/python"
  fi
  export PATH="$(dirname "$PYTHON"):$PATH"
fi

# Node.js reste nécessaire à Vite pour l'interface en développement.
if ! command -v npm >/dev/null 2>&1; then
  echo "npm est introuvable : Node.js 20+ est requis pour l'interface (Vite)." >&2
  echo "Installez Node.js depuis https://nodejs.org/ ou via nvm." >&2
  exit 1
fi

if [ ! -x "$RACINE/node_modules/.bin/vite" ]; then
  echo "  📦 Installation des dépendances de l'interface…"
  npm install --no-audit --no-fund
fi

# L'API doit trouver ses modules et l'interpréteur choisi.
export PATH="$(dirname "$PYTHON"):$PATH"

# PORT=0 (ou vide) n'a pas de sens ici : on revient au port par défaut pour que
# l'affichage et le proxy /api de Vite (port 3001) restent cohérents.
if [ -z "${PORT:-}" ] || [ "${PORT}" = "0" ]; then
  export PORT=3001
fi

echo ""
echo "  🐔 Farmotic — mode développement"
echo "  API       : http://localhost:${PORT:-3001}/api  (FastAPI, rechargement auto)"
echo "  Interface : http://localhost:5173               (Vite, à ouvrir)"
echo "  Arrêt     : Ctrl+C"
echo ""
echo "  ℹ Modifier l'interface ne demande aucun build : Vite recharge à chaud."
echo "  ℹ Recompiler pour la production : cd frontend && npm run build"
echo ""

exec npm run dev
