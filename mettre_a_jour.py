#!/usr/bin/env python3
"""Farmotic — script de mise à jour automatique.

Usage :

    python3 mettre_a_jour.py              # vérifie puis applique la mise à jour
    python3 mettre_a_jour.py --verifier   # vérifie seulement (aucune écriture)
    python3 mettre_a_jour.py --sans-interface   # ne recompile pas l'interface

La même logique est disponible dans l'application (Paramètres → À propos),
sans passer par le terminal.
"""

from __future__ import annotations

import argparse
import sys

from maj import (
    ErreurMiseAJour,
    appliquer_mise_a_jour,
    branche_courante,
    info_application,
    verifier_mise_a_jour,
)


def afficher_etat(etat: dict) -> None:
    print(f"\n  🐔 Farmotic — version installée : {etat['version']}")
    if etat.get("commit_court"):
        print(f"     Commit {etat['commit_court']} (branche {etat.get('branche')})")
    if etat.get("erreur"):
        print(f"\n  ⚠️  {etat['erreur']}")
        return
    if etat.get("a_jour"):
        print("  ✅ Application à jour.")
        return
    print(
        f"  ⬆️  Mise à jour disponible : version {etat['version_disponible']} "
        f"({etat['commits_en_attente']} commit(s))."
    )
    for fichier in etat.get("modifications_locales") or []:
        print(f"     ⚠️  Modifié localement : {fichier}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Vérifie et applique les mises à jour de Farmotic.",
    )
    parser.add_argument(
        "--verifier",
        action="store_true",
        help="affiche l'état des mises à jour sans rien modifier",
    )
    parser.add_argument(
        "--sans-interface",
        action="store_true",
        help="ne pas recompiler l'interface React",
    )
    arguments = parser.parse_args()

    try:
        if arguments.verifier:
            afficher_etat(verifier_mise_a_jour())
            return 0

        etat = verifier_mise_a_jour()
        afficher_etat(etat)
        if etat.get("erreur"):
            return 1
        if etat.get("a_jour"):
            return 0

        print("\n  ⏳ Application de la mise à jour…")
        resultat = appliquer_mise_a_jour(
            recompiler_interface=not arguments.sans_interface
        )
    except ErreurMiseAJour as erreur:
        print(f"\n  ❌ {erreur}\n")
        return 1

    if not resultat.get("applique"):
        print(f"\n  {resultat.get('message')}\n")
        return 0

    print(
        f"\n  ✅ Mise à jour appliquée : {resultat['ancienne_version']} → "
        f"{resultat['version']} ({resultat['fichiers_modifies']} fichier(s))."
    )
    for avertissement in resultat.get("avertissements") or []:
        print(f"     ⚠️  {avertissement}")
    print(
        "\n  Redémarrez l'application pour utiliser la nouvelle version :\n"
        "     python3 lancer.py\n"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
