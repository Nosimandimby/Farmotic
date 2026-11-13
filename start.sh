#!/usr/bin/env bash
# Farmotic — lanceur de compatibilité.
#
# Le backend est désormais écrit en Python (FastAPI). Ce script ne sert plus
# qu'à conserver les habitudes et les unités systemd qui appellent ./start.sh :
# il délègue tout à lancer.py.
#
# Usage identique à lancer.py :
#   ./start.sh
#   PORT=3100 ./start.sh
#   HOST=0.0.0.0 ./start.sh
#   FARMOTIC_NO_OPEN=1 ./start.sh
set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Lancer Python du projet s'il existe (installé par lancer.py), sinon le
# Python du système.
PYTHON="$RACINE/.venv/bin/python"
if [ ! -x "$PYTHON" ]; then
  PYTHON="$(command -v python3 || command -v python || true)"
fi

if [ -z "$PYTHON" ]; then
  echo "Python 3.10+ est introuvable. Installez-le puis relancez ./start.sh" >&2
  echo "Sur Debian / Raspberry Pi : sudo apt install -y python3 python3-venv python3-pip" >&2
  exit 1
fi

exec "$PYTHON" "$RACINE/lancer.py" "$@"
