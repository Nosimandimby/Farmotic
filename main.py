#!/usr/bin/env python3
"""Farmotic — backend FastAPI.

Traduction fidèle du backend Node.js/Express d'origine :

* mêmes URLs d'API (`/api/cycles`, `/api/releves`, …), mêmes méthodes HTTP,
  mêmes codes de statut et mêmes corps JSON (y compris les messages d'erreur) ;
* même base SQLite (`data/database.sqlite`), mêmes tables, mêmes colonnes et
  exactement les mêmes requêtes SQL ;
* mêmes sessions persistées (cookie `farmotic.sid` signé de la même façon et
  lignes de la table `sessions` au même format), donc les utilisateurs déjà
  connectés le restent après la migration ;
* l'interface React compilée (`build/public` ou `frontend/dist`) est servie sur
  `/` avec repli sur `index.html` pour le routage côté client.

Lancement : `python3 lancer.py` (ou `uvicorn main:app`).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import locale
import math
import os
import re
import secrets
import shutil
import sqlite3
import tempfile
import threading
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from email.utils import format_datetime
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import quote, unquote

import bcrypt

from maj import (
    ErreurMiseAJour,
    appliquer_mise_a_jour,
    info_application,
    redemarrer,
    verifier_mise_a_jour,
)
from fastapi import Body, Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from starlette.background import BackgroundTask
from starlette.exceptions import HTTPException as StarletteHTTPException

# --------------------------------------------------------------------------
# Chemins
# --------------------------------------------------------------------------

RACINE = Path(__file__).resolve().parent
DOSSIER_DONNEES = RACINE / "data"


def _resoudre_chemin_base() -> Path:
    """Même stratégie que l'ancien backend Node.js."""
    chemin_env = os.environ.get("DB_PATH")
    if chemin_env:
        chemin = Path(chemin_env).expanduser().resolve()
        chemin.parent.mkdir(parents=True, exist_ok=True)
        return chemin

    DOSSIER_DONNEES.mkdir(parents=True, exist_ok=True)
    cible = DOSSIER_DONNEES / "database.sqlite"
    # Reprise des données d'une installation de l'ancien backend Node.js
    # (sauvegarde conservée dans data/database.nodejs.sqlite).
    ancienne = DOSSIER_DONNEES / "database.nodejs.sqlite"
    if not cible.exists() and ancienne.exists():
        try:
            shutil.copyfile(ancienne, cible)
        except OSError:
            pass
    return cible


CHEMIN_BASE = _resoudre_chemin_base()


def _dossier_interface() -> Path | None:
    for candidat in (RACINE / "build" / "public", RACINE / "frontend" / "dist"):
        if (candidat / "index.html").is_file():
            return candidat
    return None


DOSSIER_INTERFACE = _dossier_interface()

# --------------------------------------------------------------------------
# Base de données (sqlite3 natif)
# --------------------------------------------------------------------------

_verrou = threading.RLock()


def _ouvrir_connexion() -> sqlite3.Connection:
    connexion = sqlite3.connect(
        str(CHEMIN_BASE),
        check_same_thread=False,
        isolation_level=None,  # autocommit : les transactions sont explicites
        timeout=5.0,
    )
    connexion.row_factory = sqlite3.Row
    connexion.execute("PRAGMA foreign_keys = ON")
    connexion.execute("PRAGMA busy_timeout = 5000")
    return connexion


_base = _ouvrir_connexion()


def q(sql: str, params: tuple = ()) -> list[dict[str, Any]]:
    """SELECT renvoyant toutes les lignes."""
    with _verrou:
        return [dict(ligne) for ligne in _base.execute(sql, params).fetchall()]


def q1(sql: str, params: tuple = ()) -> dict[str, Any] | None:
    """SELECT renvoyant la première ligne (ou None)."""
    with _verrou:
        ligne = _base.execute(sql, params).fetchone()
        return dict(ligne) if ligne is not None else None


def executer(sql: str, params: tuple = ()) -> sqlite3.Cursor:
    """INSERT / UPDATE / DELETE — le curseur expose `lastrowid` et `rowcount`."""
    with _verrou:
        return _base.execute(sql, params)


def exec_script(sql: str) -> None:
    with _verrou:
        _base.executescript(sql)


@contextmanager
def transaction() -> Iterator[None]:
    """Équivalent de `db.transaction(fn)` : BEGIN / COMMIT / ROLLBACK."""
    with _verrou:
        _base.execute("BEGIN")
        try:
            yield
        except BaseException:
            try:
                _base.execute("ROLLBACK")
            except sqlite3.Error:
                pass
            raise
        else:
            _base.execute("COMMIT")


# --------------------------------------------------------------------------
# Utilitaires numériques et de dates (sémantique JavaScript)
# --------------------------------------------------------------------------


def to_number(valeur: Any) -> float | None:
    """Équivalent de `toNumber()` du backend Node.js."""
    if valeur is None:
        return None
    if isinstance(valeur, bool):
        # JS : String(true) === 'true' → Number(...) NaN → null
        return None
    texte = str(valeur).strip().replace(",", ".")
    if texte == "":
        return None
    try:
        nombre = float(texte)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(nombre):
        return None
    return nombre


def entier(valeur: Any) -> int | None:
    """Équivalent de `Number.isInteger(Number(valeur))`."""
    nombre = to_number(valeur)
    if nombre is None or not nombre.is_integer():
        return None
    return int(nombre)


def arrondi_js(valeur: float) -> int:
    """`Math.round` de JavaScript : demi-valeur arrondie vers +∞."""
    return math.floor(valeur + 0.5)


def arrondi_decimal(valeur: float, decimales: int) -> float:
    """`Number(valeur.toFixed(decimales))`."""
    return float(f"{valeur:.{decimales}f}")


def date_du_jour() -> str:
    return date.today().isoformat()


def jours_entre(depuis: str, jusqu: str) -> int:
    try:
        debut = date.fromisoformat(str(depuis))
        fin = date.fromisoformat(str(jusqu))
    except (TypeError, ValueError):
        return 0
    return (fin - debut).days


def jour_cycle(une_date: str, date_debut: str) -> int:
    return jours_entre(date_debut, une_date) + 1


_MOTIF_DATE_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def est_date_iso(valeur: Any) -> bool:
    return isinstance(valeur, str) and bool(_MOTIF_DATE_ISO.match(valeur))


def texte_js(valeur: float) -> str:
    """`String(nombre)` de JavaScript : 1.0 → « 1 », 0.185 → « 0.185 »."""
    if isinstance(valeur, float) and valeur.is_integer():
        return str(int(valeur))
    return repr(valeur) if isinstance(valeur, float) else str(valeur)


def trier_fr(valeurs: list[str]) -> list[str]:
    """`localeCompare(a, b, 'fr')`."""
    try:
        return sorted(valeurs, key=locale.strxfrm)
    except Exception:  # noqa: BLE001 — tri secondaire si la locale est absente
        return sorted(valeurs, key=str.casefold)


# --------------------------------------------------------------------------
# Schéma, données de référence et comptes (identique à l'ancien backend Node.js)
# --------------------------------------------------------------------------

SCHEMA = """
CREATE TABLE IF NOT EXISTS cycles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  date_debut TEXT NOT NULL,
  nombre_poussins INTEGER NOT NULL,
  prix_poussin REAL DEFAULT 0,
  souche TEXT,
  statut TEXT DEFAULT 'en_cours',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS parametres_reference (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL UNIQUE,
  libelle TEXT NOT NULL,
  unite TEXT,
  type_valeur TEXT DEFAULT 'nombre',
  ordre_affichage INTEGER DEFAULT 0,
  actif INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS references_valeurs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  souche TEXT NOT NULL,
  jour INTEGER NOT NULL,
  parametre_id INTEGER NOT NULL,
  valeur TEXT NOT NULL,
  note TEXT,
  FOREIGN KEY (parametre_id) REFERENCES parametres_reference(id) ON DELETE CASCADE,
  UNIQUE(souche, jour, parametre_id)
);

CREATE TABLE IF NOT EXISTS releves_journaliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  jour_cycle INTEGER NOT NULL,
  parametre_id INTEGER NOT NULL,
  valeur TEXT NOT NULL,
  commentaire TEXT,
  FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE,
  FOREIGN KEY (parametre_id) REFERENCES parametres_reference(id),
  UNIQUE(cycle_id, date, parametre_id)
);

CREATE TABLE IF NOT EXISTS mortalites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  jour_cycle INTEGER NOT NULL,
  nombre_morts INTEGER NOT NULL,
  motif TEXT,
  FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS charges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  categorie TEXT NOT NULL,
  description TEXT,
  montant REAL NOT NULL,
  FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ventes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  client TEXT NOT NULL,
  nombre_poulets INTEGER,
  poids_kg REAL NOT NULL,
  prix_unitaire_kg REAL NOT NULL,
  montant_total REAL NOT NULL,
  commentaire TEXT,
  FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ventes_cycle ON ventes(cycle_id);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  devise TEXT DEFAULT 'MGA',
  symbole_devise TEXT DEFAULT 'Ar',
  seuil_mortalite_alerte REAL DEFAULT 5.0
);

CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  sess TEXT NOT NULL,
  expire INTEGER NOT NULL
);
"""

PARAMETRES_DEFAUT = [
    {"nom": "poids", "libelle": "Poids moyen", "unite": "kg", "type_valeur": "nombre", "ordre_affichage": 1},
    {"nom": "aliment", "libelle": "Aliment consommé (jour)", "unite": "kg", "type_valeur": "nombre", "ordre_affichage": 2},
    {"nom": "eau", "libelle": "Eau consommée (jour)", "unite": "L", "type_valeur": "nombre", "ordre_affichage": 3},
    {"nom": "temperature", "libelle": "Température ambiante", "unite": "°C", "type_valeur": "nombre", "ordre_affichage": 4},
    {"nom": "humidite", "libelle": "Humidité", "unite": "%", "type_valeur": "nombre", "ordre_affichage": 5},
    {"nom": "observation", "libelle": "Observation", "unite": "", "type_valeur": "texte", "ordre_affichage": 6},
]

ANCRES_POIDS = [
    (1, 0.042),
    (7, 0.185),
    (14, 0.47),
    (21, 0.95),
    (28, 1.55),
    (35, 2.2),
    (42, 2.8),
    (43, 2.95),
    (44, 3.1),
    (45, 3.25),
]

ANCRES_ALIMENT = [
    (1, 0.013),
    (7, 0.15),
    (14, 0.52),
    (21, 1.1),
    (28, 1.87),
    (35, 2.75),
    (42, 3.7),
    (43, 3.9),
    (44, 4.1),
    (45, 4.3),
]

SETTINGS_DEFAUT = {
    "devise": "MGA",
    "symbole_devise": "Ar",
    "seuil_mortalite_alerte": 5,
    "marge_cible": 20,
    "poids_moyen_j45_kg": 2.5,
}


def interpoler(ancres: list[tuple[int, float]], jour: int) -> float:
    if jour <= ancres[0][0]:
        return ancres[0][1]
    dernier = ancres[-1]
    if jour >= dernier[0]:
        return dernier[1]
    for (j0, v0), (j1, v1) in zip(ancres, ancres[1:]):
        if j0 <= jour <= j1:
            ratio = (jour - j0) / (j1 - j0)
            return v0 * math.pow(v1 / v0, ratio)
    return dernier[1]


def _arrondi_3(valeur: float) -> float:
    return arrondi_decimal(valeur, 3)


def seed_references() -> None:
    total = (q1("SELECT COUNT(*) AS total FROM references_valeurs") or {}).get("total", 0)
    if total and total > 0:
        return

    parametres = q("SELECT id, nom FROM parametres_reference")
    ids = {parametre["nom"]: parametre["id"] for parametre in parametres}
    poids_id = ids.get("poids")
    aliment_id = ids.get("aliment")
    eau_id = ids.get("eau")
    if not poids_id or not aliment_id:
        return

    with transaction():
        aliment_cumule_precedent = 0.0
        for jour in range(1, 46):
            poids = _arrondi_3(interpoler(ANCRES_POIDS, jour))
            aliment_cumule = interpoler(ANCRES_ALIMENT, jour)
            aliment_jour = _arrondi_3(aliment_cumule - aliment_cumule_precedent)
            aliment_cumule_precedent = aliment_cumule

            executer(
                """INSERT OR IGNORE INTO references_valeurs
                     (souche, jour, parametre_id, valeur, note)
                   VALUES (?, ?, ?, ?, ?)""",
                ("Activo", jour, poids_id, texte_js(poids), "Poids vif cible"),
            )
            executer(
                """INSERT OR IGNORE INTO references_valeurs
                     (souche, jour, parametre_id, valeur, note)
                   VALUES (?, ?, ?, ?, ?)""",
                ("Activo", jour, aliment_id, texte_js(aliment_jour), "Consommation journalière indicative"),
            )
            if eau_id:
                executer(
                    """INSERT OR IGNORE INTO references_valeurs
                         (souche, jour, parametre_id, valeur, note)
                       VALUES (?, ?, ?, ?, ?)""",
                    ("Activo", jour, eau_id, texte_js(_arrondi_3(aliment_jour * 1.8)), "Environ 1,8 x l’aliment"),
                )


def assurer_table_users() -> None:
    table = q1("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")

    if not table:
        exec_script(
            """
            CREATE TABLE users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              username TEXT UNIQUE NOT NULL,
              password_hash TEXT NOT NULL,
              role TEXT DEFAULT 'admin',
              actif INTEGER DEFAULT 1,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
    else:
        colonnes = [colonne["name"] for colonne in q("PRAGMA table_info(users)")]
        if "role" not in colonnes:
            exec_script("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'admin'")
        if "actif" not in colonnes:
            exec_script("ALTER TABLE users ADD COLUMN actif INTEGER DEFAULT 1")
        exec_script("UPDATE users SET role = 'admin' WHERE role IS NULL")
        exec_script("UPDATE users SET actif = 1 WHERE actif IS NULL")

    total = (q1("SELECT COUNT(*) AS total FROM users") or {}).get("total", 0)
    admins = (
        q1("SELECT COUNT(*) AS total FROM users WHERE role = 'admin' AND actif = 1") or {}
    ).get("total", 0)

    if total == 0:
        hash_admin = hacher_mot_de_passe("admin")
        executer(
            "INSERT INTO users (username, password_hash, role, actif) VALUES (?, ?, 'admin', 1)",
            ("admin", hash_admin),
        )
    elif not admins:
        premier = q1("SELECT id FROM users ORDER BY id ASC LIMIT 1")
        if premier:
            executer("UPDATE users SET role = 'admin', actif = 1 WHERE id = ?", (premier["id"],))

    nombre_users = (q1("SELECT COUNT(*) AS total FROM users") or {}).get("total", 0)
    nombre_admins = (
        q1("SELECT COUNT(*) AS total FROM users WHERE role = 'admin' AND actif = 1") or {}
    ).get("total", 0)
    print(f"users table OK : {nombre_users} users, {nombre_admins} admins actifs")


def assurer_colonnes_settings() -> None:
    colonnes = [colonne["name"] for colonne in q("PRAGMA table_info(settings)")]

    if "marge_cible" not in colonnes:
        exec_script("ALTER TABLE settings ADD COLUMN marge_cible REAL DEFAULT 20.0")
    if "poids_moyen_j45_kg" not in colonnes:
        exec_script("ALTER TABLE settings ADD COLUMN poids_moyen_j45_kg REAL DEFAULT 2.5")

    exec_script("UPDATE settings SET marge_cible = 20.0 WHERE marge_cible IS NULL")
    exec_script(
        "UPDATE settings SET poids_moyen_j45_kg = 2.5 WHERE poids_moyen_j45_kg IS NULL"
    )


def initialiser_base() -> None:
    exec_script(SCHEMA)
    assurer_colonnes_settings()
    assurer_table_users()

    executer(
        """INSERT OR IGNORE INTO settings (id, devise, symbole_devise, seuil_mortalite_alerte)
           VALUES (1, 'MGA', 'Ar', 5.0)"""
    )

    total_parametres = (q1("SELECT COUNT(*) AS total FROM parametres_reference") or {}).get(
        "total", 0
    )
    if total_parametres == 0:
        with transaction():
            for parametre in PARAMETRES_DEFAUT:
                executer(
                    """INSERT INTO parametres_reference
                         (nom, libelle, unite, type_valeur, ordre_affichage)
                       VALUES (?, ?, ?, ?, ?)""",
                    (
                        parametre["nom"],
                        parametre["libelle"],
                        parametre["unite"],
                        parametre["type_valeur"],
                        parametre["ordre_affichage"],
                    ),
                )

    seed_references()


def get_settings() -> dict[str, Any]:
    return q1("SELECT * FROM settings WHERE id = 1") or dict(SETTINGS_DEFAUT)


# --------------------------------------------------------------------------
# Mots de passe (compatibles avec les hachages bcryptjs de l'ancien backend)
# --------------------------------------------------------------------------


def hacher_mot_de_passe(mot_de_passe: str) -> str:
    sel = bcrypt.gensalt(rounds=10, prefix=b"2a")
    return bcrypt.hashpw(mot_de_passe.encode("utf-8"), sel).decode("utf-8")


def verifier_mot_de_passe(mot_de_passe: str, hash_stocke: Any) -> bool:
    if not hash_stocke:
        return False
    try:
        return bcrypt.checkpw(
            mot_de_passe.encode("utf-8"), str(hash_stocke).encode("utf-8")
        )
    except (ValueError, TypeError):
        return False


# --------------------------------------------------------------------------
# Sessions persistées (même format que express-session)
# --------------------------------------------------------------------------

NOM_COOKIE = "farmotic.sid"
DUREE_MS = 7 * 24 * 60 * 60 * 1000


def _secret_session() -> str:
    """Secret stable, généré une fois puis conservé dans `data/`."""
    secret_env = os.environ.get("SESSION_SECRET")
    if secret_env:
        return secret_env

    fichier = DOSSIER_DONNEES / "session-secret.txt"
    try:
        if fichier.exists():
            secret = fichier.read_text(encoding="utf-8").strip()
            if secret:
                return secret
        DOSSIER_DONNEES.mkdir(parents=True, exist_ok=True)
        secret = secrets.token_hex(48)
        fichier.write_text(secret, encoding="utf-8")
        os.chmod(fichier, 0o600)
        return secret
    except OSError:
        return secrets.token_hex(48)


SECRET = _secret_session()


def _signature(valeur: str) -> str:
    """Même signature que `cookie-signature` (HMAC-SHA256 base64 sans « = »)."""
    mac = hmac.new(SECRET.encode("utf-8"), valeur.encode("utf-8"), hashlib.sha256).digest()
    return base64.b64encode(mac).decode("ascii").rstrip("=")


def signer(valeur: str) -> str:
    return f"s:{valeur}.{_signature(valeur)}"


def designer(cookie: str) -> str | None:
    if not cookie or not cookie.startswith("s:"):
        return None
    valeur, separateur, signature = cookie[2:].rpartition(".")
    if not separateur or not valeur or not signature:
        return None
    if hmac.compare_digest(signature, _signature(valeur)):
        return valeur
    return None


def _maintenant_ms() -> int:
    return int(datetime.now(tz=timezone.utc).timestamp() * 1000)


def _expiration_iso() -> str:
    """ISO 8601 avec millisecondes, comme `Date.toISOString()`."""
    echeance = datetime.now(tz=timezone.utc) + timedelta(milliseconds=DUREE_MS)
    return echeance.strftime("%Y-%m-%dT%H:%M:%S.") + f"{echeance.microsecond // 1000:03d}Z"


def _entete_cookie(sid: str) -> str:
    expiration = format_datetime(
        datetime.now(tz=timezone.utc) + timedelta(milliseconds=DUREE_MS), usegmt=True
    )
    return (
        f"{NOM_COOKIE}={quote(signer(sid), safe='')}; Path=/; "
        f"Max-Age={DUREE_MS // 1000}; Expires={expiration}; HttpOnly; SameSite=Lax"
    )


def _entete_cookie_supprime() -> str:
    return (
        f"{NOM_COOKIE}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; "
        "HttpOnly; SameSite=Lax"
    )


def _charger_session(request: Request) -> tuple[str | None, dict[str, Any] | None]:
    brut = request.cookies.get(NOM_COOKIE)
    if not brut:
        return None, None

    sid = designer(unquote(brut))
    if not sid:
        return None, None

    ligne = q1("SELECT sess, expire FROM sessions WHERE sid = ?", (sid,))
    if not ligne:
        return None, None
    if int(ligne["expire"]) < _maintenant_ms():
        executer("DELETE FROM sessions WHERE sid = ?", (sid,))
        return None, None
    try:
        donnees = json.loads(ligne["sess"])
    except ValueError:
        return None, None
    if not isinstance(donnees, dict):
        return None, None
    return sid, donnees


def _enregistrer_session(sid: str, donnees: dict[str, Any]) -> None:
    donnees["cookie"] = {
        "originalMaxAge": DUREE_MS,
        "expires": _expiration_iso(),
        "httpOnly": True,
        "path": "/",
        "sameSite": "lax",
        "secure": False,
    }
    executer(
        """INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?)
           ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expire = excluded.expire""",
        (sid, json.dumps(donnees, ensure_ascii=False), _maintenant_ms() + DUREE_MS),
    )


# --------------------------------------------------------------------------
# Application
# --------------------------------------------------------------------------

initialiser_base()
# Nettoyage des sessions expirées au démarrage (l'ancien backend le faisait
# toutes les heures ; au redémarrage suffit pour une application locale).
executer("DELETE FROM sessions WHERE expire < ?", (_maintenant_ms(),))

app = FastAPI(
    title="Farmotic",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


@app.middleware("http")
async def middleware_session(request: Request, call_next):
    """Charge la session, puis la persiste et rafraîchit le cookie (rolling)."""
    request.state.session = None
    request.state.session_id = None
    request.state.session_detruite = False

    sid, donnees = _charger_session(request)
    request.state.session_id = sid
    request.state.session = donnees

    response = await call_next(request)

    if request.url.path.startswith("/api"):
        response.headers["cache-control"] = "no-store"

    if request.state.session_detruite:
        response.headers.append("set-cookie", _entete_cookie_supprime())
        return response

    if request.state.session is not None:
        identifiant = request.state.session_id or secrets.token_urlsafe(24)
        request.state.session_id = identifiant
        _enregistrer_session(identifiant, request.state.session)
        response.headers.append("set-cookie", _entete_cookie(identifiant))

    return response


@app.exception_handler(StarletteHTTPException)
async def gestion_erreur_http(request: Request, exc: StarletteHTTPException):
    """Répond `{ "error": … }` comme l'ancien backend Express."""
    return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code)


@app.exception_handler(Exception)
async def gestion_erreur_interne(request: Request, exc: Exception):
    print(f"Erreur inattendue : {exc!r}")
    return JSONResponse({"error": "Erreur interne du serveur."}, status_code=500)


def _propre(valeur: Any) -> Any:
    """Garantit un JSON sérialisable (NaN/Infinity → null, comme JSON.stringify)."""
    if isinstance(valeur, float):
        if math.isnan(valeur) or math.isinf(valeur):
            return None
        return valeur
    if isinstance(valeur, dict):
        return {cle: _propre(item) for cle, item in valeur.items()}
    if isinstance(valeur, (list, tuple)):
        return [_propre(item) for item in valeur]
    return valeur


def reponse(donnees: Any, statut: int = 200) -> JSONResponse:
    return JSONResponse(content=_propre(donnees), status_code=statut)


def erreur(message: str, statut: int = 400) -> JSONResponse:
    return JSONResponse({"error": message}, status_code=statut)


def corps_json(body: Any) -> dict[str, Any]:
    """`req.body || {}` — le corps doit être un objet JSON."""
    return body if isinstance(body, dict) else {}


# --------------------------------------------------------------------------
# Authentification (dépendances)
# --------------------------------------------------------------------------


def session_requise(request: Request) -> dict[str, Any]:
    session = getattr(request.state, "session", None)
    if not session or not session.get("userId"):
        raise HTTPException(status_code=401, detail="Non authentifié")
    return session


def utilisateur_requis(request: Request) -> dict[str, Any]:
    session = session_requise(request)
    utilisateur = q1(
        "SELECT id, username, role, created_at FROM users WHERE id = ?",
        (session.get("userId"),),
    )
    if not utilisateur:
        raise HTTPException(status_code=401, detail="Non authentifié")
    return utilisateur


def administrateur_requis(request: Request) -> dict[str, Any]:
    utilisateur = utilisateur_requis(request)
    if utilisateur.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Non autorisé")
    return utilisateur


# --------------------------------------------------------------------------
# Statistiques d'un cycle (reprises de l'ancien backend Node.js)
# --------------------------------------------------------------------------


def get_parametre_poids() -> dict[str, Any] | None:
    return q1("SELECT * FROM parametres_reference WHERE nom = 'poids'")


def get_parametre_aliment() -> dict[str, Any] | None:
    return q1("SELECT * FROM parametres_reference WHERE nom = 'aliment'")


def get_cycle_stats(cycle: dict[str, Any]) -> dict[str, Any]:
    settings = get_settings()

    total_morts = (
        q1(
            "SELECT COALESCE(SUM(nombre_morts), 0) AS total FROM mortalites WHERE cycle_id = ?",
            (cycle["id"],),
        )
        or {}
    ).get("total", 0) or 0

    effectif_vivant = max(0, cycle["nombre_poussins"] - total_morts)
    taux_mortalite = (
        (total_morts / cycle["nombre_poussins"]) * 100 if cycle["nombre_poussins"] > 0 else 0
    )

    age_jours = max(0, min(999, jours_entre(cycle["date_debut"], date_du_jour()) + 1))

    parametre_poids = get_parametre_poids()
    parametre_aliment = get_parametre_aliment()

    releves_poids: list[dict[str, Any]] = []
    if parametre_poids:
        for releve in q(
            """SELECT date, jour_cycle, valeur FROM releves_journaliers
               WHERE cycle_id = ? AND parametre_id = ? ORDER BY jour_cycle ASC""",
            (cycle["id"], parametre_poids["id"]),
        ):
            nombre = to_number(releve["valeur"])
            if nombre is not None:
                releves_poids.append({**releve, "nombre": nombre})

    dernier_poids = releves_poids[-1] if releves_poids else None
    poids_moyen = dernier_poids["nombre"] if dernier_poids else None

    aliment_total = 0
    if parametre_aliment:
        aliment_total = (
            q1(
                """SELECT COALESCE(SUM(valeur), 0) AS total FROM releves_journaliers
                   WHERE cycle_id = ? AND parametre_id = ?""",
                (cycle["id"], parametre_aliment["id"]),
            )
            or {}
        ).get("total", 0) or 0

    charges = (
        q1(
            "SELECT COALESCE(SUM(montant), 0) AS total FROM charges WHERE cycle_id = ?",
            (cycle["id"],),
        )
        or {}
    ).get("total", 0) or 0

    cout_poulettes = cycle["nombre_poussins"] * (cycle["prix_poussin"] or 0)
    cout_total = charges + cout_poulettes

    unite_poids = (parametre_poids or {}).get("unite") or "kg"
    unite_aliment = (parametre_aliment or {}).get("unite") or "kg"

    # Les grandeurs « par kilo » restent exprimées pour 1 kg, quelle que soit
    # l'unité de saisie (kg ou g).
    poids_vif_total_kg = (
        effectif_vivant * (poids_moyen / 1000 if unite_poids == "g" else poids_moyen)
        if poids_moyen is not None
        else 0
    )
    aliment_total_kg = aliment_total / 1000 if unite_aliment == "g" else aliment_total
    indice_consommation = (
        aliment_total_kg / poids_vif_total_kg
        if aliment_total_kg > 0 and poids_vif_total_kg > 0
        else None
    )
    cout_par_kg = cout_total / poids_vif_total_kg if poids_vif_total_kg > 0 else None

    reference_poids = None
    ecart_reference = None
    if parametre_poids and cycle["souche"] and dernier_poids:
        reference = q1(
            """SELECT valeur FROM references_valeurs
               WHERE souche = ? AND jour = ? AND parametre_id = ?""",
            (cycle["souche"], dernier_poids["jour_cycle"], parametre_poids["id"]),
        )
        valeur_reference_kg = to_number(reference["valeur"]) if reference else None
        if valeur_reference_kg is not None and valeur_reference_kg > 0:
            reference_poids = (
                valeur_reference_kg * 1000 if unite_poids == "g" else valeur_reference_kg
            )
            poids_moyen_kg = poids_moyen / 1000 if unite_poids == "g" else poids_moyen
            ecart_reference = (
                ((poids_moyen_kg - valeur_reference_kg) / valeur_reference_kg) * 100
                if poids_moyen_kg > 0
                else None
            )

    dernier_releve = (
        q1(
            "SELECT MAX(date) AS date FROM releves_journaliers WHERE cycle_id = ?",
            (cycle["id"],),
        )
        or {}
    ).get("date")

    seuil = settings.get("seuil_mortalite_alerte")
    seuil = 5 if seuil is None else seuil

    return {
        "age_jours": age_jours,
        "total_morts": total_morts,
        "effectif_vivant": effectif_vivant,
        "taux_mortalite": taux_mortalite,
        "mortalite_alerte": taux_mortalite > seuil,
        "poids_moyen": poids_moyen,
        "poids_reference": reference_poids,
        "ecart_reference_pct": ecart_reference,
        "aliment_total": aliment_total,
        "indice_consommation": indice_consommation,
        "total_charges": charges,
        "cout_poulettes": cout_poulettes,
        "cout_total": cout_total,
        "cout_par_kg": cout_par_kg,
        "dernier_releve": dernier_releve,
        "poids_vif_total": poids_vif_total_kg,
        "poids_moyen_unite": unite_poids,
    }


def cycle_avec_stats(cycle: dict[str, Any]) -> dict[str, Any]:
    return {**cycle, "stats": get_cycle_stats(cycle)}


# --------------------------------------------------------------------------
# Santé
# --------------------------------------------------------------------------


@app.get("/api/sante")
def sante():
    return reponse({"ok": True})


# --------------------------------------------------------------------------
# Authentification (routes)
# --------------------------------------------------------------------------


@app.post("/api/login")
def login(request: Request, body: dict | None = Body(default=None)):
    donnees = corps_json(body)
    username = str(donnees.get("username") or "").strip()
    password = str(donnees.get("password") or "")

    if not username or not password:
        return erreur("Veuillez renseigner le login et le mot de passe.", 400)

    utilisateur = q1("SELECT * FROM users WHERE username = ? COLLATE NOCASE", (username,))

    if not utilisateur or not verifier_mot_de_passe(password, utilisateur.get("password_hash")):
        return erreur("Login ou mot de passe incorrect.", 401)

    if int(utilisateur.get("actif") or 0) == 0:
        return erreur("Ce compte est désactivé. Contactez un administrateur.", 403)

    request.state.session = {
        "userId": utilisateur["id"],
        "username": utilisateur["username"],
    }

    return reponse(
        {
            "user": {
                "id": utilisateur["id"],
                "username": utilisateur["username"],
                "role": utilisateur.get("role") or "lecteur",
                "actif": int(utilisateur.get("actif") if utilisateur.get("actif") is not None else 1),
                "created_at": utilisateur.get("created_at"),
            }
        }
    )


@app.post("/api/logout")
def logout(request: Request):
    sid = getattr(request.state, "session_id", None)
    if sid:
        executer("DELETE FROM sessions WHERE sid = ?", (sid,))
    request.state.session = None
    request.state.session_detruite = True
    return reponse({"ok": True})


@app.get("/api/me")
def me(request: Request, _: dict = Depends(utilisateur_requis)):
    session = session_requise(request)
    utilisateur = q1(
        "SELECT id, username, role, actif, created_at FROM users WHERE id = ?",
        (session.get("userId"),),
    )
    if not utilisateur:
        raise HTTPException(status_code=401, detail="Non authentifié")
    if int(utilisateur.get("actif") or 0) == 0:
        sid = getattr(request.state, "session_id", None)
        if sid:
            executer("DELETE FROM sessions WHERE sid = ?", (sid,))
        request.state.session = None
        return erreur("Ce compte est désactivé.", 401)
    return reponse(
        {
            "user": {
                **utilisateur,
                "role": utilisateur.get("role") or "lecteur",
                "actif": int(utilisateur.get("actif") if utilisateur.get("actif") is not None else 1),
            }
        }
    )


@app.put("/api/password")
def changer_mot_de_passe(
    request: Request,
    body: dict | None = Body(default=None),
    _: dict = Depends(session_requise),
):
    donnees = corps_json(body)
    actuel = str(donnees.get("mot_de_passe_actuel") or "")
    nouveau = str(donnees.get("nouveau_mot_de_passe") or "")

    if len(nouveau) < 4:
        return erreur("Le nouveau mot de passe doit contenir au moins 4 caractères.", 400)

    session = session_requise(request)
    utilisateur = q1("SELECT * FROM users WHERE id = ?", (session.get("userId"),))
    if not utilisateur or not verifier_mot_de_passe(actuel, utilisateur.get("password_hash")):
        return erreur("Mot de passe actuel incorrect.", 400)

    executer(
        "UPDATE users SET password_hash = ? WHERE id = ?",
        (hacher_mot_de_passe(nouveau), utilisateur["id"]),
    )
    return reponse({"ok": True})


# --------------------------------------------------------------------------
# Tableau de bord
# --------------------------------------------------------------------------


@app.get("/api/dashboard")
def dashboard(_: dict = Depends(session_requise)):
    settings = get_settings()
    cycles = [
        cycle_avec_stats(cycle)
        for cycle in q(
            """SELECT * FROM cycles
               ORDER BY CASE statut WHEN 'en_cours' THEN 0 ELSE 1 END, date_debut DESC"""
        )
    ]

    actifs = [cycle for cycle in cycles if cycle["statut"] == "en_cours"]

    totaux = {
        "cycles_total": len(cycles),
        "cycles_actifs": len(actifs),
        "poussins_actifs": sum(cycle["nombre_poussins"] for cycle in actifs),
        "effectif_vivant": sum(cycle["stats"]["effectif_vivant"] for cycle in actifs),
        "total_morts": sum(cycle["stats"]["total_morts"] for cycle in actifs),
        "charges_totales": sum(cycle["stats"]["cout_total"] for cycle in cycles),
        "alertes": len([cycle for cycle in actifs if cycle["stats"]["mortalite_alerte"]]),
        "mortalite_moyenne": 0,
    }

    if totaux["poussins_actifs"] > 0:
        totaux["mortalite_moyenne"] = (
            totaux["total_morts"] / totaux["poussins_actifs"]
        ) * 100

    charges_par_categorie = q(
        """SELECT categorie, SUM(montant) AS montant FROM charges
           GROUP BY categorie ORDER BY montant DESC"""
    )

    return reponse(
        {
            "settings": settings,
            "cycles": cycles,
            "actifs": actifs,
            "totaux": totaux,
            "charges_par_categorie": charges_par_categorie,
        }
    )


# --------------------------------------------------------------------------
# Cycles
# --------------------------------------------------------------------------

STATUTS_CYCLE = ["en_cours", "termine"]


def valider_cycle(body: dict[str, Any], partiel: bool = False) -> tuple[list[str], dict[str, Any]]:
    erreurs: list[str] = []
    data: dict[str, Any] = {}

    if not partiel or "nom" in body:
        nom = str(body.get("nom") or "").strip()
        if not nom:
            erreurs.append("Le nom du cycle est obligatoire.")
        data["nom"] = nom

    if not partiel or "date_debut" in body:
        if not est_date_iso(body.get("date_debut")):
            erreurs.append("La date de début est invalide.")
        else:
            data["date_debut"] = body["date_debut"]

    if not partiel or "nombre_poussins" in body:
        nombre = entier(body.get("nombre_poussins"))
        if nombre is None or nombre <= 0:
            erreurs.append("Le nombre de poussins doit être un entier supérieur à 0.")
        else:
            data["nombre_poussins"] = nombre

    if not partiel or "prix_poussin" in body:
        prix = to_number(body.get("prix_poussin") if body.get("prix_poussin") is not None else 0)
        if prix is None or prix < 0:
            erreurs.append("Le prix du poussin est invalide.")
        else:
            data["prix_poussin"] = prix

    if not partiel or "souche" in body:
        data["souche"] = str(body.get("souche") or "").strip() or None

    if not partiel or "statut" in body:
        statut = str(body.get("statut") or "en_cours")
        if statut not in STATUTS_CYCLE:
            erreurs.append("Statut de cycle invalide.")
        else:
            data["statut"] = statut

    return erreurs, data


@app.get("/api/cycles")
def lister_cycles(_: dict = Depends(session_requise)):
    cycles = q(
        """SELECT * FROM cycles
           ORDER BY CASE statut WHEN 'en_cours' THEN 0 ELSE 1 END, date_debut DESC"""
    )
    return reponse([cycle_avec_stats(cycle) for cycle in cycles])


@app.get("/api/cycles/{cycle_id}")
def lire_cycle(cycle_id: str, _: dict = Depends(session_requise)):
    cycle = q1("SELECT * FROM cycles WHERE id = ?", (cycle_id,))
    if not cycle:
        return erreur("Cycle introuvable.", 404)
    return reponse(cycle_avec_stats(cycle))


@app.post("/api/cycles")
def creer_cycle(
    body: dict | None = Body(default=None),
    _: dict = Depends(session_requise),
):
    erreurs, data = valider_cycle(corps_json(body))
    if erreurs:
        return erreur(erreurs[0], 400)

    curseur = executer(
        """INSERT INTO cycles (nom, date_debut, nombre_poussins, prix_poussin, souche, statut)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (
            data["nom"],
            data["date_debut"],
            data["nombre_poussins"],
            data["prix_poussin"],
            data["souche"],
            data["statut"],
        ),
    )

    cycle = q1("SELECT * FROM cycles WHERE id = ?", (curseur.lastrowid,))
    return reponse(cycle_avec_stats(cycle), 201)


@app.put("/api/cycles/{cycle_id}")
def modifier_cycle(
    cycle_id: str,
    body: dict | None = Body(default=None),
    _: dict = Depends(session_requise),
):
    cycle = q1("SELECT * FROM cycles WHERE id = ?", (cycle_id,))
    if not cycle:
        return erreur("Cycle introuvable.", 404)

    erreurs, data = valider_cycle(corps_json(body), partiel=True)
    if erreurs:
        return erreur(erreurs[0], 400)

    fusion = {**cycle, **data}
    executer(
        """UPDATE cycles SET nom = ?, date_debut = ?,
             nombre_poussins = ?, prix_poussin = ?,
             souche = ?, statut = ?
           WHERE id = ?""",
        (
            fusion["nom"],
            fusion["date_debut"],
            fusion["nombre_poussins"],
            fusion["prix_poussin"],
            fusion["souche"],
            fusion["statut"],
            cycle["id"],
        ),
    )

    mis_a_jour = q1("SELECT * FROM cycles WHERE id = ?", (cycle["id"],))
    return reponse(cycle_avec_stats(mis_a_jour))


@app.delete("/api/cycles/{cycle_id}")
def supprimer_cycle(
    cycle_id: str, _: dict = Depends(session_requise)
):
    cycle = q1("SELECT * FROM cycles WHERE id = ?", (cycle_id,))
    if not cycle:
        return erreur("Cycle introuvable.", 404)
    executer("DELETE FROM cycles WHERE id = ?", (cycle["id"],))
    return reponse({"ok": True})


@app.get("/api/cycles/{cycle_id}/serie")
def serie_cycle(
    cycle_id: str, request: Request, _: dict = Depends(session_requise)
):
    cycle = q1("SELECT * FROM cycles WHERE id = ?", (cycle_id,))
    if not cycle:
        return erreur("Cycle introuvable.", 404)

    parametre_id = entier(request.query_params.get("parametre_id"))
    parametre = (
        q1("SELECT * FROM parametres_reference WHERE id = ?", (parametre_id,))
        if parametre_id is not None
        else None
    )
    if not parametre:
        return erreur("Paramètre invalide.", 400)

    releves = q(
        """SELECT jour_cycle AS jour, valeur FROM releves_journaliers
           WHERE cycle_id = ? AND parametre_id = ? ORDER BY jour_cycle""",
        (cycle["id"], parametre["id"]),
    )

    # Un cycle sans souche renseignée utilise quand même les références
    # disponibles lorsqu'il n'existe qu'une seule souche.
    souche = cycle.get("souche")
    if not souche:
        souches = q("SELECT DISTINCT souche FROM references_valeurs ORDER BY souche")
        if len(souches) == 1:
            souche = souches[0]["souche"]

    references = (
        q(
            """SELECT jour, valeur FROM references_valeurs
               WHERE souche = ? AND parametre_id = ? ORDER BY jour""",
            (souche, parametre["id"]),
        )
        if souche
        else []
    )

    points: dict[int, dict[str, Any]] = {}
    for reference in references:
        points[reference["jour"]] = {
            "jour": reference["jour"],
            "reference": to_number(reference["valeur"]),
        }
    for releve in releves:
        point = points.get(releve["jour"]) or {"jour": releve["jour"]}
        point["reel"] = to_number(releve["valeur"])
        points[releve["jour"]] = point

    return reponse(
        {
            "parametre": {
                "id": parametre["id"],
                "nom": parametre["nom"],
                "libelle": parametre["libelle"],
                "unite": parametre["unite"],
                "type_valeur": parametre["type_valeur"],
            },
            "souche": souche,
            "points": [points[jour] for jour in sorted(points)],
        }
    )


@app.get("/api/cycles/{cycle_id}/synthese")
def synthese_cycle(
    cycle_id: str, _: dict = Depends(session_requise)
):
    cycle = q1("SELECT * FROM cycles WHERE id = ?", (cycle_id,))
    if not cycle:
        return erreur("Cycle introuvable.", 404)

    stats = get_cycle_stats(cycle)

    charges_par_categorie = q(
        """SELECT categorie, SUM(montant) AS montant FROM charges
           WHERE cycle_id = ? GROUP BY categorie ORDER BY montant DESC""",
        (cycle["id"],),
    )

    mortalites = q(
        """SELECT date, jour_cycle, nombre_morts FROM mortalites
           WHERE cycle_id = ? ORDER BY jour_cycle""",
        (cycle["id"],),
    )

    aliment = q(
        """SELECT r.jour_cycle AS jour, SUM(CAST(REPLACE(r.valeur, ',', '.') AS REAL)) AS quantite
           FROM releves_journaliers r
           JOIN parametres_reference p ON p.id = r.parametre_id
           WHERE r.cycle_id = ? AND p.nom = 'aliment'
           GROUP BY r.jour_cycle ORDER BY r.jour_cycle""",
        (cycle["id"],),
    )

    settings = get_settings()

    # Les calculs économiques s'appuient sur le poids moyen à J45 paramétré,
    # jamais sur la dernière pesée réelle.
    poids_moyen_j45 = to_number(settings.get("poids_moyen_j45_kg"))
    if poids_moyen_j45 is None:
        poids_moyen_j45 = 2.5
    marge_cible = to_number(settings.get("marge_cible"))
    if marge_cible is None:
        marge_cible = 20

    vivants = stats["effectif_vivant"]
    charges_totales = stats["cout_total"]
    facteur_marge = 1 + marge_cible / 100

    def montant(valeur: float | None) -> int | None:
        return None if valeur is None else arrondi_js(valeur)

    prix_revient_poulet = None
    prix_revient_kg = None
    if vivants > 0 and charges_totales > 0:
        prix_revient_poulet = charges_totales / vivants
        if poids_moyen_j45 > 0:
            prix_revient_kg = prix_revient_poulet / poids_moyen_j45

    prix_vente_poulet = (
        None if prix_revient_poulet is None else montant(prix_revient_poulet * facteur_marge)
    )
    prix_vente_kg = None if prix_revient_kg is None else montant(prix_revient_kg * facteur_marge)

    poids_total_kg = (
        arrondi_decimal(vivants * poids_moyen_j45, 2)
        if vivants > 0 and poids_moyen_j45 > 0
        else None
    )

    ca_projete = (
        montant(poids_total_kg * prix_vente_kg)
        if poids_total_kg is not None and prix_vente_kg is not None
        else None
    )
    benefice_projete = (
        montant(ca_projete - charges_totales)
        if ca_projete is not None and charges_totales > 0
        else None
    )

    ventes_cycle = q(
        "SELECT * FROM ventes WHERE cycle_id = ? ORDER BY date DESC, id DESC",
        (cycle["id"],),
    )

    def somme(cle: str) -> float:
        return sum((to_number(vente.get(cle)) or 0) for vente in ventes_cycle)

    poids_total_vendu = arrondi_decimal(somme("poids_kg"), 2)
    chiffre_affaires_reel = montant(somme("montant_total"))
    prix_moyen_kg = (
        montant(chiffre_affaires_reel / poids_total_vendu) if poids_total_vendu > 0 else None
    )
    benefice_reel = montant(chiffre_affaires_reel - charges_totales)
    marge_reelle_pct = (
        arrondi_decimal((benefice_reel / chiffre_affaires_reel) * 100, 1)
        if chiffre_affaires_reel > 0
        else None
    )

    comparaison = None
    if ventes_cycle and benefice_projete is not None:
        ecart = montant(benefice_reel - benefice_projete)
        ecart_pct = None
        statut = "non_comparable"
        if benefice_projete != 0:
            ecart_pct = arrondi_decimal((ecart / abs(benefice_projete)) * 100, 1)
            statut = (
                "au_dessus"
                if ecart_pct > 5
                else "sous_performance"
                if ecart_pct < -5
                else "conforme"
            )
        comparaison = {
            "ecart_benefice": ecart,
            "ecart_benefice_pct": ecart_pct,
            "statut": statut,
        }

    return reponse(
        {
            "cycle": {**cycle, "stats": stats},
            "charges_par_categorie": charges_par_categorie,
            "mortalites": mortalites,
            "aliment": aliment,
            "parametres": {
                "poids_moyen_j45_kg": poids_moyen_j45,
                "marge_cible": marge_cible,
                "poids_moyen_unite": stats["poids_moyen_unite"],
            },
            "prix_revient": {
                "poulet": montant(prix_revient_poulet),
                "kg": montant(prix_revient_kg),
            },
            "prix_vente_minimum": {
                "poulet": prix_vente_poulet,
                "kg": prix_vente_kg,
            },
            "projection": {
                "poids_total_kg": poids_total_kg,
                "ca_projete": ca_projete,
                "benefice_projete": benefice_projete,
            },
            "ventes": {
                "nombre_ventes": len(ventes_cycle),
                "poulets_vendus": somme("nombre_poulets"),
                "poids_total_vendu_kg": poids_total_vendu,
                "chiffre_affaires_reel": chiffre_affaires_reel,
                "prix_moyen_kg": prix_moyen_kg,
                "detail": ventes_cycle,
            },
            "reel": {
                "chiffre_affaires": chiffre_affaires_reel,
                "benefice_reel": benefice_reel,
                "marge_reelle_pct": marge_reelle_pct,
            },
            "comparaison": comparaison,
        }
    )


# --------------------------------------------------------------------------
# Paramètres de suivi
# --------------------------------------------------------------------------

NOMS_PROTEGES = ["poids", "aliment"]
MOTIF_NOM_PARAMETRE = re.compile(r"^[a-z][a-z0-9_]{1,39}$")


def valider_parametre(
    body: dict[str, Any], partiel: bool = False
) -> tuple[list[str], dict[str, Any]]:
    erreurs: list[str] = []
    data: dict[str, Any] = {}

    if not partiel or "nom" in body:
        nom = str(body.get("nom") or "").strip().lower()
        if not MOTIF_NOM_PARAMETRE.match(nom):
            erreurs.append(
                "Le nom technique doit commencer par une lettre et ne contenir que des "
                "lettres minuscules, chiffres ou « _ » (2 à 40 caractères)."
            )
        else:
            data["nom"] = nom

    if not partiel or "libelle" in body:
        libelle = str(body.get("libelle") or "").strip()
        if not libelle:
            erreurs.append("Le libellé est obligatoire.")
        data["libelle"] = libelle

    if not partiel or "unite" in body:
        data["unite"] = str(body.get("unite") if body.get("unite") is not None else "").strip()

    if not partiel or "type_valeur" in body:
        type_valeur = str(body.get("type_valeur") or "nombre")
        if type_valeur not in ["nombre", "texte"]:
            erreurs.append("Type de valeur invalide.")
        else:
            data["type_valeur"] = type_valeur

    if not partiel or "ordre_affichage" in body:
        ordre = to_number(
            body.get("ordre_affichage") if body.get("ordre_affichage") is not None else 0
        )
        data["ordre_affichage"] = 0 if ordre is None else int(ordre)

    if not partiel or "actif" in body:
        valeur = body.get("actif")
        inactif = valeur is False or (
            isinstance(valeur, (int, float))
            and not isinstance(valeur, bool)
            and valeur == 0
        )
        data["actif"] = 0 if inactif else 1

    return erreurs, data


def parametre_est_utilise(parametre_id: int) -> bool:
    total = (
        q1(
            "SELECT COUNT(*) AS total FROM releves_journaliers WHERE parametre_id = ?",
            (parametre_id,),
        )
        or {}
    ).get("total", 0)
    return (total or 0) > 0


@app.get("/api/parametres")
def lister_parametres(
    request: Request, _: dict = Depends(session_requise)
):
    seulement_actifs = request.query_params.get("actifs") == "1"
    parametres = q(
        f"""SELECT * FROM parametres_reference
            {'WHERE actif = 1' if seulement_actifs else ''}
            ORDER BY ordre_affichage ASC, id ASC"""
    )
    return reponse(parametres)


@app.post("/api/parametres")
def creer_parametre(
    body: dict | None = Body(default=None),
    _: dict = Depends(session_requise),
):
    erreurs, data = valider_parametre(corps_json(body))
    if erreurs:
        return erreur(erreurs[0], 400)

    existe = q1("SELECT id FROM parametres_reference WHERE nom = ?", (data["nom"],))
    if existe:
        return erreur(f"Le paramètre « {data['nom']} » existe déjà.", 400)

    curseur = executer(
        """INSERT INTO parametres_reference
             (nom, libelle, unite, type_valeur, ordre_affichage, actif)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (
            data["nom"],
            data["libelle"],
            data["unite"],
            data["type_valeur"],
            data["ordre_affichage"],
            data.get("actif", 1),
        ),
    )

    return reponse(
        q1("SELECT * FROM parametres_reference WHERE id = ?", (curseur.lastrowid,)), 201
    )


@app.put("/api/parametres/{parametre_id}")
def modifier_parametre(
    parametre_id: str,
    body: dict | None = Body(default=None),
    _: dict = Depends(session_requise),
):
    parametre = q1("SELECT * FROM parametres_reference WHERE id = ?", (parametre_id,))
    if not parametre:
        return erreur("Paramètre introuvable.", 404)

    erreurs, data = valider_parametre(corps_json(body), partiel=True)
    if erreurs:
        return erreur(erreurs[0], 400)

    if (
        data.get("nom")
        and data["nom"] != parametre["nom"]
        and parametre["nom"] in NOMS_PROTEGES
    ):
        return erreur(
            f"Le nom technique « {parametre['nom']} » est utilisé par les indicateurs "
            "et ne peut pas être modifié.",
            400,
        )

    doublon = q1(
        "SELECT id FROM parametres_reference WHERE nom = ? AND id != ?",
        (data.get("nom", parametre["nom"]), parametre["id"]),
    )
    if doublon:
        return erreur(f"Le paramètre « {data.get('nom')} » existe déjà.", 400)

    fusion = {**parametre, **data}
    executer(
        """UPDATE parametres_reference
           SET nom = ?, libelle = ?, unite = ?, type_valeur = ?,
               ordre_affichage = ?, actif = ?
           WHERE id = ?""",
        (
            fusion["nom"],
            fusion["libelle"],
            fusion["unite"],
            fusion["type_valeur"],
            fusion["ordre_affichage"],
            fusion["actif"],
            parametre["id"],
        ),
    )

    return reponse(
        q1("SELECT * FROM parametres_reference WHERE id = ?", (parametre["id"],))
    )


@app.delete("/api/parametres/{parametre_id}")
def supprimer_parametre(
    parametre_id: str, _: dict = Depends(session_requise)
):
    parametre = q1("SELECT * FROM parametres_reference WHERE id = ?", (parametre_id,))
    if not parametre:
        return erreur("Paramètre introuvable.", 404)

    if parametre_est_utilise(parametre["id"]):
        return erreur(
            "Ce paramètre possède des relevés : désactivez-le plutôt que de le supprimer.",
            409,
        )

    executer("DELETE FROM parametres_reference WHERE id = ?", (parametre["id"],))
    return reponse({"ok": True})


# --------------------------------------------------------------------------
# Références par souche
# --------------------------------------------------------------------------


@app.get("/api/references/souches")
def lister_souches(_: dict = Depends(session_requise)):
    souches: set[str] = set()
    for ligne in q("SELECT DISTINCT souche FROM references_valeurs ORDER BY souche"):
        if ligne.get("souche"):
            souches.add(ligne["souche"])
    for ligne in q("SELECT DISTINCT souche FROM cycles WHERE souche IS NOT NULL"):
        if ligne.get("souche"):
            souches.add(ligne["souche"])
    return reponse(trier_fr(list(souches)))


@app.get("/api/references")
def lister_references(
    request: Request, _: dict = Depends(session_requise)
):
    parametre_id = entier(request.query_params.get("parametre_id"))
    souche = str(request.query_params.get("souche") or "").strip()
    if not parametre_id:
        return erreur("Paramètre invalide.", 400)

    valeurs = q(
        """SELECT * FROM references_valeurs
           WHERE parametre_id = ? AND souche = ? ORDER BY jour ASC""",
        (parametre_id, souche),
    )
    return reponse(valeurs)


@app.post("/api/references")
def enregistrer_reference(
    body: dict | None = Body(default=None),
    _: dict = Depends(session_requise),
):
    donnees = corps_json(body)
    souche = str(donnees.get("souche") or "").strip()
    parametre_id = entier(donnees.get("parametre_id"))
    jour = entier(donnees.get("jour"))
    valeur = str(donnees.get("valeur") if donnees.get("valeur") is not None else "").strip()
    note = str(donnees.get("note") if donnees.get("note") is not None else "").strip() or None

    if not souche:
        return erreur("La souche est obligatoire.", 400)
    if not parametre_id or jour is None or jour < 1:
        return erreur("Le jour de référence est invalide.", 400)

    parametre = q1("SELECT * FROM parametres_reference WHERE id = ?", (parametre_id,))
    if not parametre:
        return erreur("Paramètre invalide.", 400)

    if valeur == "":
        executer(
            "DELETE FROM references_valeurs WHERE souche = ? AND jour = ? AND parametre_id = ?",
            (souche, jour, parametre_id),
        )
        return reponse({"ok": True, "supprime": True})

    if parametre["type_valeur"] == "nombre" and to_number(valeur) is None:
        return erreur("La valeur doit être un nombre.", 400)

    executer(
        """INSERT INTO references_valeurs (souche, jour, parametre_id, valeur, note)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(souche, jour, parametre_id)
           DO UPDATE SET valeur = excluded.valeur, note = excluded.note""",
        (souche, jour, parametre_id, valeur, note),
    )

    return reponse(
        q1(
            "SELECT * FROM references_valeurs WHERE souche = ? AND jour = ? AND parametre_id = ?",
            (souche, jour, parametre_id),
        )
    )


@app.delete("/api/references/{reference_id}")
def supprimer_reference(
    reference_id: str, _: dict = Depends(session_requise)
):
    ligne = q1("SELECT * FROM references_valeurs WHERE id = ?", (reference_id,))
    if not ligne:
        return erreur("Valeur de référence introuvable.", 404)
    executer("DELETE FROM references_valeurs WHERE id = ?", (ligne["id"],))
    return reponse({"ok": True})


# --------------------------------------------------------------------------
# Relevés journaliers
# --------------------------------------------------------------------------


def verifier_contexte(cycle_id: Any, une_date: Any) -> dict[str, Any]:
    cycle = q1("SELECT * FROM cycles WHERE id = ?", (cycle_id,))
    if not cycle:
        return {"erreur": "Cycle introuvable."}
    if not est_date_iso(une_date):
        return {"erreur": "La date du relevé est invalide."}

    jour = jour_cycle(une_date, cycle["date_debut"])
    if jour < 1:
        return {"erreur": "La date est antérieure au début du cycle."}
    return {"cycle": cycle, "jour": jour}


def verifier_parametre_releve(parametre_id: Any) -> dict[str, Any]:
    parametre = q1("SELECT * FROM parametres_reference WHERE id = ?", (parametre_id,))
    if not parametre:
        return {"erreur": "Paramètre introuvable."}
    return {"parametre": parametre}


@app.get("/api/releves")
def lister_releves(
    request: Request, _: dict = Depends(session_requise)
):
    cycle_id = entier(request.query_params.get("cycle_id"))
    if not cycle_id:
        return erreur("Cycle invalide.", 400)

    releves = q(
        """SELECT r.*, p.libelle, p.unite, p.nom AS parametre_nom, p.type_valeur
           FROM releves_journaliers r
           JOIN parametres_reference p ON p.id = r.parametre_id
           WHERE r.cycle_id = ?
           ORDER BY r.date DESC, r.jour_cycle DESC, p.ordre_affichage ASC, p.id ASC""",
        (cycle_id,),
    )
    return reponse(releves)


@app.post("/api/releves")
def creer_releve(
    body: dict | None = Body(default=None),
    _: dict = Depends(session_requise),
):
    donnees = corps_json(body)
    cycle_id = entier(donnees.get("cycle_id"))
    parametre_id = entier(donnees.get("parametre_id"))
    valeur = str(donnees.get("valeur") if donnees.get("valeur") is not None else "").strip()
    commentaire = (
        str(donnees.get("commentaire") if donnees.get("commentaire") is not None else "").strip()
        or None
    )

    contexte = verifier_contexte(cycle_id, donnees.get("date"))
    if contexte.get("erreur"):
        return erreur(contexte["erreur"], 400)

    verif = verifier_parametre_releve(parametre_id)
    if verif.get("erreur"):
        return erreur(verif["erreur"], 400)
    parametre = verif["parametre"]

    if parametre["type_valeur"] == "nombre" and to_number(valeur) is None:
        return erreur("La valeur doit être un nombre.", 400)
    if valeur == "":
        return erreur("La valeur est obligatoire.", 400)

    executer(
        """INSERT INTO releves_journaliers
             (cycle_id, date, jour_cycle, parametre_id, valeur, commentaire)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(cycle_id, date, parametre_id)
           DO UPDATE SET valeur = excluded.valeur, commentaire = excluded.commentaire""",
        (cycle_id, donnees["date"], contexte["jour"], parametre_id, valeur, commentaire),
    )

    return reponse(
        q1(
            "SELECT * FROM releves_journaliers WHERE cycle_id = ? AND date = ? AND parametre_id = ?",
            (cycle_id, donnees["date"], parametre_id),
        ),
        201,
    )


@app.post("/api/releves/jour")
def enregistrer_journee(
    body: dict | None = Body(default=None),
    _: dict = Depends(session_requise),
):
    donnees = corps_json(body)
    cycle_id = entier(donnees.get("cycle_id"))
    valeurs = donnees.get("valeurs") if isinstance(donnees.get("valeurs"), list) else []
    une_date = donnees.get("date")

    contexte = verifier_contexte(cycle_id, une_date)
    if contexte.get("erreur"):
        return erreur(contexte["erreur"], 400)

    erreurs: list[str] = []

    def enregistrer() -> None:
        for ligne in valeurs:
            if not isinstance(ligne, dict):
                erreurs.append("Paramètre introuvable.")
                continue
            parametre_id = entier(ligne.get("parametre_id"))
            parametre = q1(
                "SELECT * FROM parametres_reference WHERE id = ?", (parametre_id,)
            )
            if not parametre:
                erreurs.append("Paramètre introuvable.")
                continue

            valeur = str(ligne.get("valeur") if ligne.get("valeur") is not None else "").strip()
            if valeur == "":
                executer(
                    "DELETE FROM releves_journaliers WHERE cycle_id = ? AND date = ? AND parametre_id = ?",
                    (cycle_id, une_date, parametre_id),
                )
                continue
            if parametre["type_valeur"] == "nombre" and to_number(valeur) is None:
                erreurs.append(f"La valeur de « {parametre['libelle']} » doit être un nombre.")
                continue

            commentaire = (
                str(ligne.get("commentaire") if ligne.get("commentaire") is not None else "").strip()
                or None
            )
            executer(
                """INSERT INTO releves_journaliers
                     (cycle_id, date, jour_cycle, parametre_id, valeur, commentaire)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(cycle_id, date, parametre_id)
                   DO UPDATE SET valeur = excluded.valeur, commentaire = excluded.commentaire""",
                (cycle_id, une_date, contexte["jour"], parametre_id, valeur, commentaire),
            )

        if erreurs:
            raise ValueError(erreurs[0])

    try:
        with transaction():
            enregistrer()
    except ValueError as exc:
        return erreur(str(exc), 400)

    enregistres = q(
        "SELECT * FROM releves_journaliers WHERE cycle_id = ? AND date = ?",
        (cycle_id, une_date),
    )
    return reponse({"releves": enregistres, "jour_cycle": contexte["jour"]})


@app.delete("/api/releves/jour")
def supprimer_journee(
    request: Request, _: dict = Depends(session_requise)
):
    cycle_id = entier(request.query_params.get("cycle_id"))
    une_date = str(request.query_params.get("date") or "")
    if not cycle_id or not est_date_iso(une_date):
        return erreur("Cycle ou date invalide.", 400)

    curseur = executer(
        "DELETE FROM releves_journaliers WHERE cycle_id = ? AND date = ?",
        (cycle_id, une_date),
    )
    return reponse({"supprimes": curseur.rowcount})


@app.put("/api/releves/{releve_id}")
def modifier_releve(
    releve_id: str,
    body: dict | None = Body(default=None),
    _: dict = Depends(session_requise),
):
    releve = q1("SELECT * FROM releves_journaliers WHERE id = ?", (releve_id,))
    if not releve:
        return erreur("Relevé introuvable.", 404)

    donnees = corps_json(body)
    une_date = donnees.get("date") if donnees.get("date") is not None else releve["date"]
    contexte = verifier_contexte(releve["cycle_id"], une_date)
    if contexte.get("erreur"):
        return erreur(contexte["erreur"], 400)

    parametre = q1(
        "SELECT * FROM parametres_reference WHERE id = ?", (releve["parametre_id"],)
    )
    valeur = str(
        donnees.get("valeur") if donnees.get("valeur") is not None else releve["valeur"]
    ).strip()
    if valeur == "":
        return erreur("La valeur est obligatoire.", 400)
    if (parametre or {}).get("type_valeur") == "nombre" and to_number(valeur) is None:
        return erreur("La valeur doit être un nombre.", 400)

    if "commentaire" in donnees:
        commentaire = str(donnees.get("commentaire") or "").strip() or None
    else:
        commentaire = releve["commentaire"]

    executer(
        """UPDATE releves_journaliers SET date = ?, jour_cycle = ?, valeur = ?, commentaire = ?
           WHERE id = ?""",
        (une_date, contexte["jour"], valeur, commentaire, releve["id"]),
    )

    return reponse(
        q1("SELECT * FROM releves_journaliers WHERE id = ?", (releve["id"],))
    )


@app.delete("/api/releves/{releve_id}")
def supprimer_releve(
    releve_id: str, _: dict = Depends(session_requise)
):
    releve = q1("SELECT * FROM releves_journaliers WHERE id = ?", (releve_id,))
    if not releve:
        return erreur("Relevé introuvable.", 404)
    executer("DELETE FROM releves_journaliers WHERE id = ?", (releve["id"],))
    return reponse({"ok": True})


# --------------------------------------------------------------------------
# Mortalité
# --------------------------------------------------------------------------


def contexte_mortalite(donnees: dict[str, Any]) -> dict[str, Any]:
    cycle = q1("SELECT * FROM cycles WHERE id = ?", (donnees.get("cycle_id"),))
    if not cycle:
        return {"erreur": "Cycle introuvable."}
    if not est_date_iso(donnees.get("date")):
        return {"erreur": "La date est invalide."}

    jour = jour_cycle(donnees["date"], cycle["date_debut"])
    if jour < 1:
        return {"erreur": "La date est antérieure au début du cycle."}

    nombre = entier(donnees.get("nombre_morts"))
    if nombre is None or nombre < 0:
        return {"erreur": "Le nombre de morts doit être un entier positif."}

    deja_morts = (
        q1(
            "SELECT COALESCE(SUM(nombre_morts), 0) AS total FROM mortalites WHERE cycle_id = ?",
            (cycle["id"],),
        )
        or {}
    ).get("total", 0) or 0

    return {"cycle": cycle, "jour": jour, "nombre": nombre, "deja_morts": deja_morts}


@app.get("/api/mortalites")
def lister_mortalites(
    request: Request, _: dict = Depends(session_requise)
):
    cycle_id = entier(request.query_params.get("cycle_id"))
    if not cycle_id:
        return erreur("Cycle invalide.", 400)

    return reponse(
        q(
            "SELECT * FROM mortalites WHERE cycle_id = ? ORDER BY date DESC, id DESC",
            (cycle_id,),
        )
    )


@app.post("/api/mortalites")
def creer_mortalite(
    body: dict | None = Body(default=None),
    _: dict = Depends(session_requise),
):
    donnees = corps_json(body)
    contexte = contexte_mortalite(donnees)
    if contexte.get("erreur"):
        return erreur(contexte["erreur"], 400)

    if contexte["deja_morts"] + contexte["nombre"] > contexte["cycle"]["nombre_poussins"]:
        return erreur("La mortalité cumulée dépasse le nombre de poussins du cycle.", 400)

    motif = (
        str(donnees.get("motif") if donnees.get("motif") is not None else "").strip() or None
    )
    curseur = executer(
        """INSERT INTO mortalites (cycle_id, date, jour_cycle, nombre_morts, motif)
           VALUES (?, ?, ?, ?, ?)""",
        (contexte["cycle"]["id"], donnees["date"], contexte["jour"], contexte["nombre"], motif),
    )

    return reponse(
        q1("SELECT * FROM mortalites WHERE id = ?", (curseur.lastrowid,)), 201
    )


@app.put("/api/mortalites/{mortalite_id}")
def modifier_mortalite(
    mortalite_id: str,
    body: dict | None = Body(default=None),
    _: dict = Depends(session_requise),
):
    ligne = q1("SELECT * FROM mortalites WHERE id = ?", (mortalite_id,))
    if not ligne:
        return erreur("Enregistrement introuvable.", 404)

    donnees = corps_json(body)
    une_date = donnees.get("date") if donnees.get("date") is not None else ligne["date"]
    nombre = (
        donnees.get("nombre_morts")
        if donnees.get("nombre_morts") is not None
        else ligne["nombre_morts"]
    )
    contexte = contexte_mortalite(
        {"cycle_id": ligne["cycle_id"], "date": une_date, "nombre_morts": nombre}
    )
    if contexte.get("erreur"):
        return erreur(contexte["erreur"], 400)

    autres = (
        q1(
            """SELECT COALESCE(SUM(nombre_morts), 0) AS total FROM mortalites
               WHERE cycle_id = ? AND id != ?""",
            (ligne["cycle_id"], ligne["id"]),
        )
        or {}
    ).get("total", 0) or 0

    if autres + contexte["nombre"] > contexte["cycle"]["nombre_poussins"]:
        return erreur("La mortalité cumulée dépasse le nombre de poussins du cycle.", 400)

    if "motif" in donnees:
        motif = str(donnees.get("motif") or "").strip() or None
    else:
        motif = ligne["motif"]

    executer(
        """UPDATE mortalites SET date = ?, jour_cycle = ?, nombre_morts = ?, motif = ?
           WHERE id = ?""",
        (une_date, contexte["jour"], contexte["nombre"], motif, ligne["id"]),
    )

    return reponse(q1("SELECT * FROM mortalites WHERE id = ?", (ligne["id"],)))


@app.delete("/api/mortalites/{mortalite_id}")
def supprimer_mortalite(
    mortalite_id: str, _: dict = Depends(session_requise)
):
    ligne = q1("SELECT * FROM mortalites WHERE id = ?", (mortalite_id,))
    if not ligne:
        return erreur("Enregistrement introuvable.", 404)
    executer("DELETE FROM mortalites WHERE id = ?", (ligne["id"],))
    return reponse({"ok": True})


# --------------------------------------------------------------------------
# Charges
# --------------------------------------------------------------------------


def valider_charge(body: dict[str, Any]) -> tuple[list[str], dict[str, Any]]:
    erreurs: list[str] = []
    data: dict[str, Any] = {}

    cycle = q1("SELECT * FROM cycles WHERE id = ?", (body.get("cycle_id"),))
    if not cycle:
        erreurs.append("Cycle introuvable.")
    data["cycle_id"] = cycle["id"] if cycle else None

    if not est_date_iso(body.get("date")):
        erreurs.append("La date est invalide.")
    else:
        data["date"] = body["date"]

    categorie = str(body.get("categorie") or "").strip()
    if not categorie:
        erreurs.append("La catégorie est obligatoire.")
    data["categorie"] = categorie

    montant = to_number(body.get("montant"))
    if montant is None or montant < 0:
        erreurs.append("Le montant est invalide.")
    else:
        data["montant"] = montant

    data["description"] = (
        str(body.get("description") if body.get("description") is not None else "").strip()
        or None
    )

    return erreurs, data


@app.get("/api/charges/categories")
def lister_categories_charges(_: dict = Depends(session_requise)):
    lignes = q("SELECT DISTINCT categorie FROM charges ORDER BY categorie COLLATE NOCASE")
    return reponse([ligne["categorie"] for ligne in lignes])


@app.get("/api/charges")
def lister_charges(
    request: Request, _: dict = Depends(session_requise)
):
    cycle_id = entier(request.query_params.get("cycle_id"))
    if not cycle_id:
        return erreur("Cycle invalide.", 400)

    return reponse(
        q(
            "SELECT * FROM charges WHERE cycle_id = ? ORDER BY date DESC, id DESC",
            (cycle_id,),
        )
    )


@app.post("/api/charges")
def creer_charge(
    body: dict | None = Body(default=None),
    _: dict = Depends(session_requise),
):
    erreurs, data = valider_charge(corps_json(body))
    if erreurs:
        return erreur(erreurs[0], 400)

    curseur = executer(
        """INSERT INTO charges (cycle_id, date, categorie, description, montant)
           VALUES (?, ?, ?, ?, ?)""",
        (data["cycle_id"], data["date"], data["categorie"], data["description"], data["montant"]),
    )

    return reponse(q1("SELECT * FROM charges WHERE id = ?", (curseur.lastrowid,)), 201)


@app.put("/api/charges/{charge_id}")
def modifier_charge(
    charge_id: str,
    body: dict | None = Body(default=None),
    _: dict = Depends(session_requise),
):
    charge = q1("SELECT * FROM charges WHERE id = ?", (charge_id,))
    if not charge:
        return erreur("Charge introuvable.", 404)

    donnees = corps_json(body)
    erreurs, data = valider_charge(
        {
            "cycle_id": charge["cycle_id"],
            "date": donnees.get("date") if donnees.get("date") is not None else charge["date"],
            "categorie": (
                donnees.get("categorie")
                if donnees.get("categorie") is not None
                else charge["categorie"]
            ),
            "description": (
                donnees.get("description")
                if donnees.get("description") is not None
                else charge["description"]
            ),
            "montant": (
                donnees.get("montant") if donnees.get("montant") is not None else charge["montant"]
            ),
        }
    )
    if erreurs:
        return erreur(erreurs[0], 400)

    executer(
        """UPDATE charges SET date = ?, categorie = ?, description = ?, montant = ?
           WHERE id = ?""",
        (data["date"], data["categorie"], data["description"], data["montant"], charge["id"]),
    )

    return reponse(q1("SELECT * FROM charges WHERE id = ?", (charge["id"],)))


@app.delete("/api/charges/{charge_id}")
def supprimer_charge(
    charge_id: str, _: dict = Depends(session_requise)
):
    charge = q1("SELECT * FROM charges WHERE id = ?", (charge_id,))
    if not charge:
        return erreur("Charge introuvable.", 404)
    executer("DELETE FROM charges WHERE id = ?", (charge["id"],))
    return reponse({"ok": True})


# --------------------------------------------------------------------------
# Ventes
# --------------------------------------------------------------------------


def _arrondi_centimes(valeur: float) -> float:
    return arrondi_js(valeur * 100) / 100


def valider_vente(
    body: dict[str, Any], cycle_id: Any = None
) -> tuple[list[str], dict[str, Any]]:
    erreurs: list[str] = []
    data: dict[str, Any] = {}

    cycle = q1(
        "SELECT * FROM cycles WHERE id = ?",
        (cycle_id if cycle_id is not None else body.get("cycle_id"),),
    )
    if not cycle:
        erreurs.append("Cycle introuvable.")
    data["cycle_id"] = cycle["id"] if cycle else None

    if not est_date_iso(body.get("date")):
        erreurs.append("La date est invalide.")
    else:
        data["date"] = body["date"]

    client = str(body.get("client") if body.get("client") is not None else "").strip()
    if not client:
        erreurs.append("Le nom du client est obligatoire.")
    elif len(client) > 100:
        erreurs.append("Le nom du client ne peut pas dépasser 100 caractères.")
    data["client"] = client

    poids = to_number(body.get("poids_kg"))
    if poids is None or poids <= 0:
        erreurs.append("Le poids vendu doit être supérieur à 0 kg.")
    else:
        data["poids_kg"] = _arrondi_centimes(poids)

    prix = to_number(body.get("prix_unitaire_kg"))
    if prix is None or prix <= 0:
        erreurs.append("Le prix unitaire doit être supérieur à 0.")
    else:
        data["prix_unitaire_kg"] = _arrondi_centimes(prix)

    nombre_poulets = to_number(body.get("nombre_poulets"))
    if nombre_poulets is None:
        data["nombre_poulets"] = None
    elif not nombre_poulets.is_integer() or nombre_poulets < 0:
        erreurs.append("Le nombre de poulets doit être un entier positif.")
    else:
        data["nombre_poulets"] = int(nombre_poulets)

    data["commentaire"] = (
        str(body.get("commentaire") if body.get("commentaire") is not None else "").strip()
        or None
    )

    # Le montant est toujours recalculé côté serveur : jamais repris du client.
    if data.get("poids_kg") and data.get("prix_unitaire_kg"):
        data["montant_total"] = _arrondi_centimes(
            data["poids_kg"] * data["prix_unitaire_kg"]
        )
    else:
        data["montant_total"] = None

    return erreurs, data


@app.get("/api/ventes")
def lister_ventes(
    request: Request, _: dict = Depends(session_requise)
):
    cycle_id = entier(request.query_params.get("cycle_id"))
    if not cycle_id:
        return erreur("Cycle invalide.", 400)

    return reponse(
        q(
            "SELECT * FROM ventes WHERE cycle_id = ? ORDER BY date DESC, id DESC",
            (cycle_id,),
        )
    )


@app.post("/api/ventes")
def creer_vente(
    body: dict | None = Body(default=None),
    _: dict = Depends(session_requise),
):
    erreurs, data = valider_vente(corps_json(body))
    if erreurs:
        return erreur(erreurs[0], 400)

    curseur = executer(
        """INSERT INTO ventes (cycle_id, date, client, nombre_poulets, poids_kg,
             prix_unitaire_kg, montant_total, commentaire)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            data["cycle_id"],
            data["date"],
            data["client"],
            data["nombre_poulets"],
            data["poids_kg"],
            data["prix_unitaire_kg"],
            data["montant_total"],
            data["commentaire"],
        ),
    )

    return reponse(q1("SELECT * FROM ventes WHERE id = ?", (curseur.lastrowid,)), 201)


@app.put("/api/ventes/{vente_id}")
def modifier_vente(
    vente_id: str,
    body: dict | None = Body(default=None),
    _: dict = Depends(session_requise),
):
    vente = q1("SELECT * FROM ventes WHERE id = ?", (vente_id,))
    if not vente:
        return erreur("Vente introuvable.", 404)

    donnees = corps_json(body)
    erreurs, data = valider_vente(
        {
            "date": donnees.get("date") if donnees.get("date") is not None else vente["date"],
            "client": (
                donnees.get("client") if donnees.get("client") is not None else vente["client"]
            ),
            "nombre_poulets": (
                vente["nombre_poulets"]
                if "nombre_poulets" not in donnees
                else donnees.get("nombre_poulets")
            ),
            "poids_kg": (
                donnees.get("poids_kg")
                if donnees.get("poids_kg") is not None
                else vente["poids_kg"]
            ),
            "prix_unitaire_kg": (
                donnees.get("prix_unitaire_kg")
                if donnees.get("prix_unitaire_kg") is not None
                else vente["prix_unitaire_kg"]
            ),
            "commentaire": (
                donnees.get("commentaire")
                if donnees.get("commentaire") is not None
                else vente["commentaire"]
            ),
        },
        cycle_id=vente["cycle_id"],
    )
    if erreurs:
        return erreur(erreurs[0], 400)

    executer(
        """UPDATE ventes SET date = ?, client = ?, nombre_poulets = ?, poids_kg = ?,
             prix_unitaire_kg = ?, montant_total = ?, commentaire = ?
           WHERE id = ?""",
        (
            data["date"],
            data["client"],
            data["nombre_poulets"],
            data["poids_kg"],
            data["prix_unitaire_kg"],
            data["montant_total"],
            data["commentaire"],
            vente["id"],
        ),
    )

    return reponse(q1("SELECT * FROM ventes WHERE id = ?", (vente["id"],)))


@app.delete("/api/ventes/{vente_id}")
def supprimer_vente(
    vente_id: str, _: dict = Depends(session_requise)
):
    vente = q1("SELECT * FROM ventes WHERE id = ?", (vente_id,))
    if not vente:
        return erreur("Vente introuvable.", 404)
    executer("DELETE FROM ventes WHERE id = ?", (vente["id"],))
    return reponse({"ok": True})


# --------------------------------------------------------------------------
# Préférences générales
# --------------------------------------------------------------------------

DEFAUTS_SETTINGS = {"marge_cible": 20, "poids_moyen_j45_kg": 2.5}


def normaliser_settings(settings: dict[str, Any]) -> dict[str, Any]:
    marge = settings.get("marge_cible")
    poids = settings.get("poids_moyen_j45_kg")
    return {
        **settings,
        "marge_cible": DEFAUTS_SETTINGS["marge_cible"] if marge is None else float(marge),
        "poids_moyen_j45_kg": (
            DEFAUTS_SETTINGS["poids_moyen_j45_kg"] if poids is None else float(poids)
        ),
    }


@app.get("/api/settings")
def lire_settings(_: dict = Depends(session_requise)):
    return reponse(normaliser_settings(get_settings()))


@app.put("/api/settings")
def modifier_settings(
    body: dict | None = Body(default=None),
    _: dict = Depends(session_requise),
):
    actuel = normaliser_settings(get_settings())
    donnees = corps_json(body)

    devise = str(donnees.get("devise", actuel.get("devise")) or "").strip() or "MGA"
    symbole = (
        str(donnees.get("symbole_devise", actuel.get("symbole_devise")) or "").strip() or "Ar"
    )
    seuil = to_number(donnees.get("seuil_mortalite_alerte", actuel.get("seuil_mortalite_alerte")))

    if seuil is None or seuil < 0:
        return erreur("Le seuil de mortalité est invalide.", 400)

    marge_cible = to_number(donnees.get("marge_cible", actuel.get("marge_cible")))
    if marge_cible is None or marge_cible < 0 or marge_cible > 200:
        return erreur(
            "La marge bénéficiaire cible doit être comprise entre 0 et 200 %.", 400
        )

    poids_moyen_j45 = to_number(
        donnees.get("poids_moyen_j45_kg", actuel.get("poids_moyen_j45_kg"))
    )
    if poids_moyen_j45 is None or poids_moyen_j45 < 0.5 or poids_moyen_j45 > 10:
        return erreur("Le poids moyen à J45 doit être compris entre 0,5 et 10 kg.", 400)

    executer(
        """UPDATE settings
              SET devise = ?, symbole_devise = ?, seuil_mortalite_alerte = ?,
                  marge_cible = ?, poids_moyen_j45_kg = ?
            WHERE id = 1""",
        (devise, symbole, seuil, marge_cible, poids_moyen_j45),
    )

    return reponse(normaliser_settings(get_settings()))


# --------------------------------------------------------------------------
# Utilisateurs (administrateurs uniquement)
# --------------------------------------------------------------------------

ROLES = ["admin", "operateur", "lecteur"]
CHAMPS_UTILISATEUR = "SELECT id, username, role, actif, created_at FROM users"
MOTIF_LOGIN = re.compile(r"^[a-zA-Z0-9._-]{3,40}$")


def normaliser_utilisateur(utilisateur: dict[str, Any]) -> dict[str, Any]:
    actif = utilisateur.get("actif")
    return {
        "id": utilisateur["id"],
        "username": utilisateur["username"],
        "role": utilisateur.get("role") or "lecteur",
        "actif": 1 if actif is None else int(actif),
        "created_at": utilisateur.get("created_at"),
    }


def nombre_admins_actifs(exclu_id: int | None = None) -> int:
    if exclu_id:
        ligne = q1(
            """SELECT COUNT(*) AS total FROM users
               WHERE role = 'admin' AND actif = 1 AND id != ?""",
            (exclu_id,),
        )
    else:
        ligne = q1(
            "SELECT COUNT(*) AS total FROM users WHERE role = 'admin' AND actif = 1"
        )
    return (ligne or {}).get("total", 0) or 0


def lire_cible(identifiant: Any) -> dict[str, Any] | None:
    return q1("SELECT * FROM users WHERE id = ?", (identifiant,))


def _actif_demande(valeur: Any, defaut: int) -> int:
    """`req.body.actif === false || Number(req.body.actif) === 0 ? 0 : 1`."""
    if valeur is False:
        return 0
    if isinstance(valeur, (int, float)) and not isinstance(valeur, bool) and valeur == 0:
        return 0
    if isinstance(valeur, str) and valeur.strip() in ("0", ""):
        return defaut
    return 1


@app.get("/api/utilisateurs")
def lister_utilisateurs(_: dict = Depends(administrateur_requis)):
    utilisateurs = q(
        f"""{CHAMPS_UTILISATEUR}
            ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'operateur' THEN 1 ELSE 2 END,
                     username COLLATE NOCASE ASC"""
    )
    return reponse([normaliser_utilisateur(utilisateur) for utilisateur in utilisateurs])


@app.post("/api/utilisateurs")
def creer_utilisateur(
    body: dict | None = Body(default=None),
    _: dict = Depends(administrateur_requis),
):
    donnees = corps_json(body)
    username = str(donnees.get("username") if donnees.get("username") is not None else "").strip()
    mot_de_passe = str(
        donnees.get("mot_de_passe") if donnees.get("mot_de_passe") is not None else ""
    )
    role = str(donnees.get("role") if donnees.get("role") is not None else "lecteur")
    actif = _actif_demande(donnees.get("actif"), 1)

    if not MOTIF_LOGIN.match(username):
        return erreur(
            "Le login doit contenir 3 à 40 caractères : lettres, chiffres, point, "
            "tiret ou « _ ».",
            400,
        )
    if len(mot_de_passe) < 4:
        return erreur("Le mot de passe doit contenir au moins 4 caractères.", 400)
    if role not in ROLES:
        return erreur("Rôle invalide.", 400)

    existe = q1("SELECT id FROM users WHERE username = ? COLLATE NOCASE", (username,))
    if existe:
        return erreur(f"Le login « {username} » est déjà utilisé.", 409)

    curseur = executer(
        "INSERT INTO users (username, password_hash, role, actif) VALUES (?, ?, ?, ?)",
        (username, hacher_mot_de_passe(mot_de_passe), role, actif),
    )

    return reponse(normaliser_utilisateur(lire_cible(curseur.lastrowid)), 201)


@app.put("/api/utilisateurs/{utilisateur_id}")
def modifier_utilisateur(
    utilisateur_id: str,
    request: Request,
    body: dict | None = Body(default=None),
    _: dict = Depends(administrateur_requis),
):
    cible = lire_cible(utilisateur_id)
    if not cible:
        return erreur("Utilisateur introuvable.", 404)

    donnees = corps_json(body)
    username = (
        str(donnees.get("username") or "").strip()
        if "username" in donnees
        else cible["username"]
    )
    role = (
        str(donnees.get("role"))
        if "role" in donnees
        else (cible.get("role") or "lecteur")
    )
    if "actif" in donnees:
        actif = _actif_demande(donnees.get("actif"), 1)
    else:
        actif = 1 if cible.get("actif") else 0
    mot_de_passe = (
        str(donnees.get("mot_de_passe") if donnees.get("mot_de_passe") is not None else "")
        if "mot_de_passe" in donnees
        else ""
    )

    if not MOTIF_LOGIN.match(username):
        return erreur(
            "Le login doit contenir 3 à 40 caractères : lettres, chiffres, point, "
            "tiret ou « _ ».",
            400,
        )
    if role not in ROLES:
        return erreur("Rôle invalide.", 400)
    if mot_de_passe and len(mot_de_passe) < 4:
        return erreur("Le mot de passe doit contenir au moins 4 caractères.", 400)

    doublon = q1(
        "SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id != ?",
        (username, cible["id"]),
    )
    if doublon:
        return erreur(f"Le login « {username} » est déjà utilisé.", 409)

    session = session_requise(request)
    soi_meme = int(session.get("userId")) == int(cible["id"])
    if soi_meme and (role != "admin" or actif == 0):
        return erreur(
            "Vous ne pouvez pas retirer vos propres droits d'administrateur ni "
            "désactiver votre compte.",
            400,
        )

    etait_admin_actif = cible.get("role") == "admin" and bool(cible.get("actif"))
    if (
        etait_admin_actif
        and (role != "admin" or actif == 0)
        and nombre_admins_actifs(cible["id"]) == 0
    ):
        return erreur("Au moins un administrateur actif doit rester en place.", 400)

    executer(
        "UPDATE users SET username = ?, role = ?, actif = ? WHERE id = ?",
        (username, role, actif, cible["id"]),
    )
    if mot_de_passe:
        executer(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hacher_mot_de_passe(mot_de_passe), cible["id"]),
        )

    return reponse(normaliser_utilisateur(lire_cible(cible["id"])))


@app.delete("/api/utilisateurs/{utilisateur_id}")
def supprimer_utilisateur(
    utilisateur_id: str,
    request: Request,
    _: dict = Depends(administrateur_requis),
):
    cible = lire_cible(utilisateur_id)
    if not cible:
        return erreur("Utilisateur introuvable.", 404)

    session = session_requise(request)
    if int(session.get("userId")) == int(cible["id"]):
        return erreur("Vous ne pouvez pas supprimer votre propre compte.", 400)
    if (
        cible.get("role") == "admin"
        and cible.get("actif")
        and nombre_admins_actifs(cible["id"]) == 0
    ):
        return erreur("Au moins un administrateur actif doit rester en place.", 400)

    executer("DELETE FROM users WHERE id = ?", (cible["id"],))
    return reponse({"ok": True})


# --------------------------------------------------------------------------
# Sauvegarde et restauration de la base (administrateurs uniquement)
# --------------------------------------------------------------------------

TAILLE_MAX_SAUVEGARDE = 100 * 1024 * 1024  # 100 Mo

TABLES_FARMOTIC = (
    "users",
    "sessions",
    "cycles",
    "mortalites",
    "releves_journaliers",
    "charges",
    "ventes",
    "parametres_reference",
    "references_valeurs",
    "settings",
)


def _nom_fichier_sauvegarde() -> str:
    """Nom proposé à l'export : `farmotic-database-AAAA-MM-JJ.sqlite`."""
    return f"farmotic-database-{datetime.now().strftime('%Y-%m-%d')}.sqlite"


def _copier_base(destination: Path) -> None:
    """Copie cohérente de la base ouverte (API backup de SQLite)."""
    with _verrou:
        copie = sqlite3.connect(str(destination))
        try:
            _base.backup(copie)
        finally:
            copie.close()


@app.get("/api/sauvegarde")
def exporter_sauvegarde(_: dict = Depends(administrateur_requis)):
    """Télécharge une copie datée de la base SQLite."""
    try:
        descripteur, chemin = tempfile.mkstemp(
            prefix="farmotic-sauvegarde-", suffix=".sqlite"
        )
        os.close(descripteur)
        fichier = Path(chemin)
        _copier_base(fichier)
    except (OSError, sqlite3.Error) as exc:
        print(f"Export de sauvegarde impossible : {exc!r}")
        return erreur("Impossible de préparer la sauvegarde.", 500)

    return FileResponse(
        fichier,
        media_type="application/vnd.sqlite3",
        filename=_nom_fichier_sauvegarde(),
        headers={"cache-control": "no-store"},
        background=BackgroundTask(lambda: fichier.unlink(missing_ok=True)),
    )


@app.post("/api/sauvegarde/restauration")
async def restaurer_sauvegarde(
    request: Request, _: dict = Depends(administrateur_requis)
):
    """Remplace la base par un fichier `.sqlite` exporté précédemment."""
    contenu = await request.body()
    if not contenu:
        return erreur("Aucun fichier reçu.", 400)
    if len(contenu) > TAILLE_MAX_SAUVEGARDE:
        return erreur("Fichier trop volumineux (100 Mo maximum).", 400)
    if not contenu.startswith(b"SQLite format 3\x00"):
        return erreur("Ce fichier n'est pas une base SQLite valide.", 400)

    dossier_temporaire = Path(tempfile.mkdtemp(prefix="farmotic-restauration-"))
    candidat = dossier_temporaire / "verification.sqlite"
    try:
        candidat.write_bytes(contenu)
        controle = sqlite3.connect(str(candidat))
        try:
            tables = {
                ligne[0]
                for ligne in controle.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                )
            }
        finally:
            controle.close()
    except (OSError, sqlite3.Error) as exc:
        print(f"Sauvegarde illisible : {exc!r}")
        shutil.rmtree(dossier_temporaire, ignore_errors=True)
        return erreur("Ce fichier n'est pas une base SQLite lisible.", 400)

    manquantes = [table for table in TABLES_FARMOTIC if table not in tables]
    if manquantes:
        shutil.rmtree(dossier_temporaire, ignore_errors=True)
        return erreur(
            "Cette sauvegarde ne correspond pas à une base Farmotic "
            f"(tables manquantes : {', '.join(manquantes)}).",
            400,
        )

    global _base
    horodatage = datetime.now().strftime("%Y-%m-%d-%H%M%S")
    securite = CHEMIN_BASE.parent / f"database-avant-restauration-{horodatage}.sqlite"

    try:
        with _verrou:
            _copier_base(securite)
            _base.close()
            shutil.copyfile(candidat, CHEMIN_BASE)
            _base = _ouvrir_connexion()
            # Le fichier restauré peut avoir expiré les sessions en cours : on
            # garde celle de l'administrateur qui effectue la restauration.
            session = getattr(request.state, "session", None)
            session_id = getattr(request.state, "session_id", None)
            if session and session_id:
                _enregistrer_session(session_id, session)
    except (OSError, sqlite3.Error) as exc:
        print(f"Restauration impossible : {exc!r}")
        try:
            _base.execute("SELECT 1")
        except (sqlite3.Error, AttributeError):
            _base = _ouvrir_connexion()
        return erreur(
            "La restauration a échoué ; la base actuelle a été conservée "
            f"(copie de sécurité : {securite.name}).",
            500,
        )
    finally:
        shutil.rmtree(dossier_temporaire, ignore_errors=True)

    return reponse(
        {
            "ok": True,
            "sauvegarde_securite": securite.name,
            "message": "Sauvegarde restaurée. Rechargez l'application.",
        }
    )


# --------------------------------------------------------------------------
# Version installée et mises à jour
# --------------------------------------------------------------------------


@app.get("/api/version")
def version_application(_: dict = Depends(session_requise)):
    return reponse(info_application())


@app.get("/api/maj/verifier")
def verifier_maj(_: dict = Depends(administrateur_requis)):
    return reponse(verifier_mise_a_jour())


@app.post("/api/maj/appliquer")
def appliquer_maj(_: dict = Depends(administrateur_requis)):
    try:
        resultat = appliquer_mise_a_jour()
    except ErreurMiseAJour as erreur:
        return JSONResponse({"error": str(erreur)}, status_code=400)

    if resultat.get("applique"):
        # Le nouveau code n'est chargé qu'au prochain démarrage : on relance le
        # processus une fois la réponse envoyée.
        redemarrer()
        resultat["redemarrage"] = True
    return reponse(resultat)


# --------------------------------------------------------------------------
# API inconnue → 404 JSON, comme Express
# --------------------------------------------------------------------------

METHODES_API = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]


@app.api_route("/api", methods=METHODES_API)
@app.api_route("/api/{chemin:path}", methods=METHODES_API)
def api_inconnue(chemin: str = ""):
    return erreur("Ressource introuvable.", 404)


# --------------------------------------------------------------------------
# Interface React compilée (repli sur index.html pour le routage client)
# --------------------------------------------------------------------------


@app.api_route("/{chemin:path}", methods=["GET", "HEAD"])
def servir_interface(chemin: str):
    if DOSSIER_INTERFACE is None:
        if chemin in ("", "/"):
            return PlainTextResponse(
                "L'interface n'est pas compilée. Lancez « npm run build » puis redémarrez.",
                status_code=503,
            )
        return erreur("Ressource introuvable.", 404)

    racine_interface = DOSSIER_INTERFACE.resolve()
    if chemin:
        fichier = (racine_interface / chemin).resolve()
        if fichier.is_file() and racine_interface in fichier.parents:
            return FileResponse(
                fichier, headers={"cache-control": "public, max-age=3600"}
            )

    return FileResponse(
        racine_interface / "index.html", headers={"cache-control": "no-cache"}
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "3001")),
    )
