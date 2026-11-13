#!/usr/bin/env python3
"""Farmotic — lanceur Python (équivalent de l'ancien start.sh).

Vérifie les dépendances, les installe si besoin (dans un environnement virtuel
local `.venv` si le Python du système l'interdit), démarre le serveur FastAPI
sur le port 3001 (ou le suivant s'il est occupé) puis ouvre le navigateur.

Usage :
    python3 lancer.py                    # port 3001, navigateur ouvert
    PORT=3100 python3 lancer.py          # port imposé
    HOST=0.0.0.0 python3 lancer.py       # accessible sur le réseau local
    FARMOTIC_NO_OPEN=1 python3 lancer.py # ne pas ouvrir le navigateur
    python3 lancer.py --no-open
    python3 lancer.py --dev              # API en rechargement à chaud (:3001),
                                         # sans navigateur ni repli de port (Vite
                                         # proxifie /api vers 3001)
    python3 lancer.py --install-only     # installe les dépendances puis sort
"""

from __future__ import annotations

import importlib.util
import os
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

RACINE = Path(__file__).resolve().parent
FICHIER_DEPENDANCES = RACINE / "requirements.txt"
PAQUETS = ("fastapi", "uvicorn", "bcrypt")
DUREE_ATTENTE_NAVIGATEUR = 30.0


def paquets_manquants() -> list[str]:
    return [nom for nom in PAQUETS if importlib.util.find_spec(nom) is None]


def installer_dependances() -> bool:
    """`pip install -r requirements.txt` dans l'environnement courant."""
    print("  📦 Installation des dépendances Python…")
    commande = [sys.executable, "-m", "pip", "install", "-r", str(FICHIER_DEPENDANCES)]
    try:
        resultat = subprocess.run(commande, cwd=str(RACINE), check=False)
    except OSError as erreur:
        print(f"  ⚠ Impossible de lancer pip : {erreur}")
        return False
    return resultat.returncode == 0


def creer_environnement_virtuel() -> Path:
    """Repli quand le Python du système refuse les installations (PEP 668)."""
    dossier = RACINE / ".venv"
    python = dossier / ("Scripts/python.exe" if os.name == "nt" else "bin/python")

    if not python.exists():
        print("  🐍 Création d'un environnement virtuel local (.venv)…")
        subprocess.run([sys.executable, "-m", "venv", str(dossier)], check=True)

    print("  📦 Installation des dépendances dans .venv…")
    subprocess.run(
        [str(python), "-m", "pip", "install", "--quiet", "--upgrade", "pip"],
        check=False,
    )
    subprocess.run(
        [str(python), "-m", "pip", "install", "-r", str(FICHIER_DEPENDANCES)],
        check=True,
    )
    return python


def port_demande_env() -> int:
    """Port demandé par l'environnement (0, vide ou invalide → 3001)."""
    try:
        port = int(os.environ.get("PORT") or 3001)
    except ValueError:
        return 3001
    return port if port > 0 else 3001


def port_disponible(port: int, hote: str) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as prise:
        prise.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            prise.bind((hote, port))
        except OSError:
            return False
    return True


def trouver_port(depart: int, hote: str) -> int:
    """Comme l'ancien backend : on essaie le port demandé puis les suivants."""
    for port in range(depart, depart + 11):
        if port_disponible(port, hote):
            return port
    return depart


def ouvrir_navigateur(url: str, port: int, hote: str) -> None:
    """Attend que le serveur réponde, puis ouvre le navigateur par défaut."""
    adresse = "127.0.0.1" if hote in ("0.0.0.0", "::", "") else hote
    limite = time.monotonic() + DUREE_ATTENTE_NAVIGATEUR
    while time.monotonic() < limite:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as prise:
            prise.settimeout(0.5)
            try:
                prise.connect((adresse, port))
            except OSError:
                time.sleep(0.3)
                continue
        try:
            webbrowser.open(url)
        except Exception:  # noqa: BLE001 — l'ouverture du navigateur n'est pas indispensable
            pass
        return


def main() -> int:
    # Les messages du lanceur doivent apparaître immédiatement, même quand la
    # sortie est redirigée vers un fichier (systemd, « > log.txt », etc.).
    try:
        sys.stdout.reconfigure(line_buffering=True)
    except (AttributeError, ValueError):
        pass

    args = sys.argv[1:]
    mode_dev = "--dev" in args
    ouvrir = (
        not mode_dev
        and "--no-open" not in args
        and os.environ.get("FARMOTIC_NO_OPEN") != "1"
    )

    manquants = paquets_manquants()
    if "--install-only" in args:
        if not manquants:
            print("  ✅ Dépendances Python déjà installées.")
            return 0
        if installer_dependances():
            print("  ✅ Dépendances Python installées.")
            return 0
        try:
            creer_environnement_virtuel()
        except subprocess.CalledProcessError as erreur:
            print(f"\n  ❌ Installation impossible des dépendances Python : {erreur}\n")
            return 1
        print("  ✅ Dépendances Python installées dans .venv.")
        return 0
    if manquants:
        print(f"  ℹ Dépendances manquantes : {', '.join(manquants)}")
        if not installer_dependances():
            try:
                python = creer_environnement_virtuel()
            except subprocess.CalledProcessError as erreur:
                print("\n  ❌ Installation impossible des dépendances Python.")
                print(f"     {erreur}")
                print("     Installez-les manuellement :")
                print(f"     {sys.executable} -m pip install -r requirements.txt\n")
                return 1
            # On relance le lanceur avec l'interpréteur du venv.
            os.execv(str(python), [str(python), str(Path(__file__).resolve()), *args])
        else:
            # Recharge le script pour que les nouveaux paquets soient visibles.
            os.execv(sys.executable, [sys.executable, str(Path(__file__).resolve()), *args])

    os.chdir(RACINE)
    if str(RACINE) not in sys.path:
        sys.path.insert(0, str(RACINE))

    import uvicorn

    import main as backend

    port_demande = port_demande_env()
    hote = os.environ.get("HOST") or "127.0.0.1"

    if mode_dev:
        # Le proxy /api de Vite pointe sur le port 3001 : pas de repli silencieux.
        if not port_disponible(port_demande, hote):
            print(
                f"\n  ❌ Le port {port_demande} est déjà utilisé.\n"
                "     Arrêtez l'instance en cours (ou changez PORT) puis relancez.\n"
            )
            return 1
        port = port_demande
    else:
        port = trouver_port(port_demande, hote)
        if port != port_demande:
            print(f"  Port {port_demande} occupé, démarrage sur le port {port}…")

    hote_affiche = "localhost" if hote in ("0.0.0.0", "::") else hote
    url = f"http://{hote_affiche}:{port}"

    print("")
    print("  🐔 Farmotic — suivi des poulets de chair")
    print(f"  Interface et API : {url}")
    print(f"  Base de données  : {backend.CHEMIN_BASE}")
    if hote == "0.0.0.0":
        print("  Accès réseau     : ce PC ou un autre appareil du réseau local")
    print("  Arrêt            : Ctrl+C")
    print("")

    if ouvrir:
        threading.Thread(
            target=ouvrir_navigateur, args=(url, port, hote), daemon=True
        ).start()

    try:
        if mode_dev:
            # Rechargement à chaud du backend à chaque modification de *.py, et
            # journal des requêtes utiles pendant le développement.
            uvicorn.run(
                "main:app",
                host=hote,
                port=port,
                reload=True,
                reload_dirs=[str(RACINE)],
                reload_includes=["*.py"],
                log_level="info",
                access_log=True,
            )
        else:
            uvicorn.run(
                backend.app,
                host=hote,
                port=port,
                log_level="info",
                access_log=False,
            )
    except KeyboardInterrupt:
        print("\n  Arrêt de Farmotic (SIGINT)…")
    return 0


if __name__ == "__main__":
    sys.exit(main())
