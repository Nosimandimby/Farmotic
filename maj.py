#!/usr/bin/env python3
"""Farmotic — vérification et application des mises à jour.

Ce module n'utilise **que la bibliothèque standard** : il reste utilisable même
si les dépendances de l'application sont cassées (situation possible juste après
une mise à jour qui en ajoute ou en retire).

Fonctionnement : l'application est installée depuis un dépôt Git
(https://github.com/Nosimandimby/Farmotic). « Mettre à jour » consiste donc à

1. récupérer les nouveautés (`git fetch`),
2. les appliquer en avance rapide (`git pull --ff-only`),
3. réinstaller les dépendances Python si `requirements.txt` a changé,
4. réinstaller les dépendances (`npm ci` si `package-lock.json` a changé, sinon
   `npm install`) et recompiler l'interface React si `frontend/` a changé
   (nécessite Node.js),
5. redémarrer le serveur (fait par l'appelant).
"""

from __future__ import annotations

import json
import os
import platform
import re
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any

RACINE = Path(__file__).resolve().parent
FICHIER_VERSION = RACINE / "package.json"  # secours si l'installation n'est pas un dépôt Git
# Fichiers de verrouillage régénérés automatiquement par npm : s'ils sont les
# seuls fichiers modifiés localement, on les remet dans l'état du dépôt au lieu
# de bloquer la mise à jour (ils sont reconstruits par `npm install`).
FICHIERS_REGENERABLES = ("package-lock.json", "frontend/package-lock.json")

DELAI_GIT = 60
DELAI_INSTALLATION = 300
DELAI_INSTALLATION_NODE = 1800
DELAI_COMPILATION = 600


class ErreurMiseAJour(Exception):
    """Erreur lisible, affichée telle quelle dans l'interface."""


# --------------------------------------------------------------------------
# Git
# --------------------------------------------------------------------------


def _environnement_git() -> dict[str, str]:
    """Empêche Git de rester bloqué sur une demande de mot de passe."""
    environnement = dict(os.environ)
    environnement.setdefault(
        "GIT_SSH_COMMAND",
        "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10",
    )
    environnement["GIT_TERMINAL_PROMPT"] = "0"
    environnement["GCM_INTERACTIVE"] = "never"
    environnement["LC_ALL"] = "C"
    return environnement


def _git(*arguments: str, delai: int = DELAI_GIT) -> str:
    try:
        resultat = subprocess.run(
            ["git", *arguments],
            cwd=RACINE,
            capture_output=True,
            text=True,
            timeout=delai,
            env=_environnement_git(),
        )
    except FileNotFoundError:
        raise ErreurMiseAJour("Git n'est pas installé sur cette machine.") from None
    except subprocess.TimeoutExpired:
        raise ErreurMiseAJour(
            "Git n'a pas répondu à temps (connexion Internet indisponible ?)."
        ) from None

    if resultat.returncode != 0:
        lignes = (resultat.stderr or resultat.stdout or "").strip().splitlines()
        detail = lignes[-1] if lignes else f"git {arguments[0]} a échoué."
        raise ErreurMiseAJour(detail)
    return resultat.stdout.strip()


def est_depot_git() -> bool:
    return (RACINE / ".git").exists() and shutil.which("git") is not None


# --------------------------------------------------------------------------
# Version et informations d'installation
# --------------------------------------------------------------------------


def version_package_json() -> str:
    """Version déclarée dans package.json (secours hors dépôt Git)."""
    try:
        donnees = json.loads(FICHIER_VERSION.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return "0.0.0"
    return str(donnees.get("version") or "0.0.0")


def _describe(reference: str | None = None) -> str | None:
    """`git describe` brut, ex. « v2.1.0 » ou « v2.1.0-2-gc7fcd62 »."""
    arguments = ["describe", "--tags", "--always"]
    if reference:
        arguments.append(reference)
    try:
        return _git(*arguments) or None
    except ErreurMiseAJour:
        return None


def _version_depuis_describe(texte: str | None) -> str | None:
    """Extrait « 2.1.0 » de « v2.1.0-2-gc7fcd62 »."""
    if not texte:
        return None
    correspondance = re.match(r"^v?(\d+(?:\.\d+)*)", texte.strip())
    return correspondance.group(1) if correspondance else None


def version_installee() -> str:
    """Version installée : tag Git le plus proche, sinon package.json."""
    if est_depot_git():
        version = _version_depuis_describe(_describe())
        if version:
            return version
    return version_package_json()


def branche_courante() -> str:
    try:
        branche = _git("rev-parse", "--abbrev-ref", "HEAD")
    except ErreurMiseAJour:
        return "main"
    return branche if branche and branche != "HEAD" else "main"


def modifications_locales() -> list[str]:
    """Fichiers suivis modifiés localement (ils bloqueraient `git pull`)."""
    try:
        sortie = _git("diff", "--name-only", "HEAD")
    except ErreurMiseAJour:
        return []
    return [ligne.strip() for ligne in sortie.splitlines() if ligne.strip()]


def info_application() -> dict[str, Any]:
    """Version installée et contexte de l'installation."""
    infos: dict[str, Any] = {
        "version": version_installee(),
        "version_package": version_package_json(),
        "version_source": "tag Git",
        "describe": None,
        "depot_git": est_depot_git(),
        "branche": None,
        "commit": None,
        "commit_court": None,
        "date_commit": None,
        "python": platform.python_version(),
        "dossier": str(RACINE),
    }
    if infos["depot_git"]:
        try:
            infos["branche"] = branche_courante()
            infos["commit"] = _git("rev-parse", "HEAD")
            infos["commit_court"] = infos["commit"][:7]
            infos["date_commit"] = _git("log", "-1", "--format=%cI")
            infos["describe"] = _describe()
        except ErreurMiseAJour:
            pass
    if not infos["describe"]:
        infos["version_source"] = "package.json"
    return infos


# --------------------------------------------------------------------------
# Vérification
# --------------------------------------------------------------------------


def verifier_mise_a_jour() -> dict[str, Any]:
    """Interroge le dépôt distant et indique si une mise à jour existe."""
    infos = info_application()
    resultat: dict[str, Any] = {
        **infos,
        "a_jour": None,
        "commits_en_attente": 0,
        "version_disponible": infos["version"],
        "modifications_locales": [],
        "erreur": None,
    }

    if not infos["depot_git"]:
        resultat["erreur"] = (
            "Cette installation n'est pas un dépôt Git : la mise à jour "
            "automatique est indisponible."
        )
        return resultat

    branche = infos["branche"] or "main"
    try:
        _git("fetch", "--prune", "--quiet", "origin")
    except ErreurMiseAJour as erreur:
        resultat["erreur"] = f"Vérification impossible : {erreur}"
        return resultat

    try:
        distance = _git("rev-list", "--count", f"HEAD..origin/{branche}")
    except ErreurMiseAJour as erreur:
        resultat["erreur"] = (
            f"Impossible de comparer avec origin/{branche} : {erreur}"
        )
        return resultat

    commits = int(distance or 0)
    resultat["commits_en_attente"] = commits
    resultat["a_jour"] = commits == 0
    resultat["version_disponible"] = (
        _version_depuis_describe(_describe(f"origin/{branche}")) or infos["version"]
    )
    resultat["modifications_locales"] = modifications_locales()
    return resultat


# --------------------------------------------------------------------------
# Application de la mise à jour
# --------------------------------------------------------------------------


def _installer_dependances() -> str | None:
    """Réinstalle les dépendances Python ; renvoie un avertissement éventuel."""
    try:
        resultat = subprocess.run(
            [sys.executable, "-m", "pip", "install", "-r", "requirements.txt", "--quiet"],
            cwd=RACINE,
            capture_output=True,
            text=True,
            timeout=DELAI_INSTALLATION,
        )
    except (OSError, subprocess.TimeoutExpired) as erreur:
        return f"Dépendances non réinstallées ({erreur})."

    if resultat.returncode != 0:
        lignes = (resultat.stderr or resultat.stdout or "").strip().splitlines()
        detail = lignes[-1] if lignes else "erreur inconnue"
        return f"Dépendances non réinstallées ({detail})."
    return None


def _version_node() -> str | None:
    try:
        resultat = subprocess.run(
            ["node", "--version"], capture_output=True, text=True, timeout=15, cwd=RACINE
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    return resultat.stdout.strip() or None


def _node_trop_ancien(version: str | None) -> bool:
    if not version:
        return False
    correspondance = re.match(r"v?(\d+)", version)
    return bool(correspondance) and int(correspondance.group(1)) < 20


def _executer_npm(arguments: list[str], delai: int) -> tuple[bool, str]:
    """Exécute une commande npm ; renvoie (succès, dernier message d'erreur)."""
    try:
        resultat = subprocess.run(
            ["npm", *arguments],
            cwd=RACINE,
            capture_output=True,
            text=True,
            timeout=delai,
        )
    except (OSError, subprocess.TimeoutExpired) as erreur:
        return False, str(erreur)

    if resultat.returncode == 0:
        return True, ""

    lignes = (resultat.stderr or resultat.stdout or "").strip().splitlines()
    return False, (lignes[-1] if lignes else "erreur inconnue")


def _installer_dependances_node(verrou_modifie: bool) -> str | None:
    """Installe les dépendances de l'interface ; renvoie un avertissement si échec.

    `npm ci` est utilisé quand `package-lock.json` a changé : installation
    reproductible, exactement conforme au verrou. Il exige cependant un verrou
    synchronisé avec `package.json` ; si ce n'est pas le cas, on retente avec
    `npm install` plutôt que d'abandonner.
    """
    if verrou_modifie:
        succes, detail = _executer_npm(
            ["ci", "--no-audit", "--no-fund"], DELAI_INSTALLATION_NODE
        )
        if succes:
            return None
        succes, detail_install = _executer_npm(
            ["install", "--no-audit", "--no-fund"], DELAI_INSTALLATION_NODE
        )
        if succes:
            return None
        return (
            "Dépendances de l'interface non installées : `npm ci` puis "
            f"`npm install` ont échoué ({detail_install or detail}). "
            "L'ancienne interface reste affichée."
        )

    succes, detail = _executer_npm(
        ["install", "--no-audit", "--no-fund"], DELAI_INSTALLATION_NODE
    )
    if succes:
        return None
    return (
        f"Dépendances de l'interface non installées ({detail}). "
        "L'ancienne interface reste affichée."
    )


def _recompiler_interface(fichiers: set[str]) -> str | None:
    """Installe si nécessaire les dépendances puis recompile l'interface."""
    if not shutil.which("npm"):
        return (
            "Interface non recompilée : Node.js (npm) est introuvable sur cette "
            "machine. Installez Node.js 20+ puis relancez la mise à jour."
        )

    verrou_modifie = bool(
        fichiers & {"package-lock.json", "frontend/package-lock.json"}
    )
    dependances_modifiees = verrou_modifie or bool(
        fichiers & {"package.json", "frontend/package.json"}
    )
    if dependances_modifiees or not (RACINE / "node_modules").is_dir():
        avertissement = _installer_dependances_node(verrou_modifie)
        if avertissement:
            return avertissement

    version_node = _version_node()
    commande = ["npm", "run", "build"]
    try:
        resultat = subprocess.run(
            commande,
            cwd=RACINE,
            capture_output=True,
            text=True,
            timeout=DELAI_COMPILATION,
        )
    except (OSError, subprocess.TimeoutExpired) as erreur:
        return f"Interface non recompilée ({erreur})."

    if resultat.returncode != 0:
        if _node_trop_ancien(version_node):
            return (
                "Interface non recompilée : Node.js 20 ou plus récent est requis "
                f"(version installée : {version_node}). Mettez Node.js à jour puis "
                "relancez la mise à jour."
            )
        lignes = (resultat.stderr or resultat.stdout or "").strip().splitlines()
        detail = lignes[-1] if lignes else "erreur inconnue"
        return f"Interface non recompilée ({detail})."

    source = RACINE / "frontend" / "dist"
    cible = RACINE / "build" / "public"
    if not (source / "index.html").is_file():
        return "Interface non recompilée (frontend/dist est incomplet)."
    try:
        if cible.exists():
            shutil.rmtree(cible)
        shutil.copytree(source, cible)
    except OSError as erreur:
        return f"Interface recompilée mais non copiée dans build/public ({erreur})."
    return None


def appliquer_mise_a_jour(recompiler_interface: bool = True) -> dict[str, Any]:
    """Applique la mise à jour disponible (ne redémarre pas le serveur)."""
    etat = verifier_mise_a_jour()
    if etat.get("erreur"):
        raise ErreurMiseAJour(str(etat["erreur"]))
    if etat.get("a_jour"):
        return {
            "applique": False,
            "message": "Farmotic est déjà à jour.",
            "version": etat["version"],
            "version_disponible": etat["version_disponible"],
        }

    locales = etat.get("modifications_locales") or []
    bloquants = [fichier for fichier in locales if fichier not in FICHIERS_REGENERABLES]
    if bloquants:
        liste = ", ".join(bloquants[:5]) + ("…" if len(bloquants) > 5 else "")
        raise ErreurMiseAJour(
            "Des modifications locales non validées empêchent la mise à jour "
            f"({liste}). Validez-les avec Git puis réessayez."
        )
    if locales:
        # Seuls des fichiers de verrouillage ont été modifiés : on les remet dans
        # l'état du dépôt (ils seront régénérés par npm) pour permettre le pull.
        _git("checkout", "--", *locales)
    fichiers_retablis = list(locales)

    ancienne_version = etat["version"]
    ancien_commit = etat["commit"]
    branche = etat["branche"] or "main"

    _git("pull", "--ff-only", "--quiet", "origin", branche, delai=180)
    nouveau_commit = _git("rev-parse", "HEAD")

    if nouveau_commit == ancien_commit:
        return {
            "applique": False,
            "message": "Aucune modification à appliquer.",
            "version": version_installee(),
            "version_disponible": etat["version_disponible"],
        }

    fichiers = set(
        _git("diff", "--name-only", ancien_commit, nouveau_commit).splitlines()
    )

    avertissements: list[str] = []
    if fichiers_retablis:
        avertissements.append(
            "Fichier(s) de verrouillage local(aux) ignoré(s) puis régénéré(s) : "
            + ", ".join(fichiers_retablis)
            + "."
        )
    if "requirements.txt" in fichiers:
        avertissement = _installer_dependances()
        if avertissement:
            avertissements.append(avertissement)
    if recompiler_interface and (
        any(chemin.startswith("frontend/") for chemin in fichiers)
        or "package.json" in fichiers
    ):
        avertissement = _recompiler_interface(fichiers)
        if avertissement:
            avertissements.append(avertissement)

    infos = info_application()
    return {
        "applique": True,
        "message": "Mise à jour appliquée.",
        "ancienne_version": ancienne_version,
        "version": infos["version"],
        "version_disponible": infos["version"],
        "commit": infos["commit_court"],
        "fichiers_modifies": len(fichiers),
        "redemarrage_requis": True,
        "avertissements": avertissements,
    }


# --------------------------------------------------------------------------
# Redémarrage
# --------------------------------------------------------------------------


def commande_redemarrage() -> list[str]:
    """Commande relançant l'application telle qu'elle a été démarrée."""
    script = Path(sys.argv[0]).resolve() if sys.argv and sys.argv[0] else None
    if script and script.is_file() and script.suffix == ".py":
        return [sys.executable, str(script), *sys.argv[1:]]
    return [sys.executable, str(RACINE / "lancer.py")]


def redemarrer(delai: float = 1.5) -> None:
    """Remplace le processus courant par une nouvelle instance (après réponse)."""
    commande = commande_redemarrage()

    def _relancer() -> None:
        time.sleep(delai)
        try:
            os.execv(commande[0], commande)
        except OSError as erreur:  # pragma: no cover - cas très inhabituel
            print(f"Redémarrage automatique impossible : {erreur!r}")

    threading.Thread(target=_relancer, name="redemarrage", daemon=True).start()
