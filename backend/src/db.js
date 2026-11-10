import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import sqlite from 'node-sqlite3-wasm';

import { racineApplication } from './chemins.js';

const { Database } = sqlite;

export { racineApplication };

const DOSSIER_DONNEES = path.join(racineApplication, 'data');

/**
 * Une base créée par une version précédente (better-sqlite3) peut être en mode
 * journal WAL, que le moteur WebAssembly ne sait pas ouvrir en écriture.
 * On repasse l'en-tête SQLite en journal classique (octets 18 et 19), sans
 * toucher aux données — uniquement si aucun fichier -wal n'attend d'être validé.
 */
function forcerJournalClassique(chemin) {
  try {
    if (!fs.existsSync(chemin)) return;
    if (fs.existsSync(`${chemin}-wal`) && fs.statSync(`${chemin}-wal`).size > 0) return;

    const fd = fs.openSync(chemin, 'r+');
    try {
      const entete = Buffer.alloc(20);
      const lus = fs.readSync(fd, entete, 0, 20, 0);
      if (lus < 20 || entete.toString('latin1', 0, 15) !== 'SQLite format 3') return;
      if (entete[18] !== 2 && entete[19] !== 2) return;
      fs.writeSync(fd, Buffer.from([1, 1]), 0, 2, 18);
    } finally {
      fs.closeSync(fd);
    }
    fs.rmSync(`${chemin}-shm`, { force: true });
  } catch {
    /* la base sera recréée si elle reste illisible */
  }
}

function resoudreCheminBase() {
  if (process.env.DB_PATH) {
    const chemin = path.resolve(process.env.DB_PATH);
    fs.mkdirSync(path.dirname(chemin), { recursive: true });
    return chemin;
  }

  fs.mkdirSync(DOSSIER_DONNEES, { recursive: true });
  const cible = path.join(DOSSIER_DONNEES, 'database.sqlite');
  const ancienne = path.join(racineApplication, 'backend', 'database.sqlite');

  // Reprise des données d'une installation précédente (ancien emplacement).
  if (!fs.existsSync(cible) && fs.existsSync(ancienne)) {
    try {
      fs.copyFileSync(ancienne, cible);
    } catch {
      /* on repartira d'une base neuve si la copie échoue */
    }
  }

  forcerJournalClassique(cible);
  return cible;
}

export const dbPath = resoudreCheminBase();
const dossierVerrou = `${dbPath}.lock`;

/**
 * node-sqlite3-wasm matérialise le verrou d'écriture par un dossier
 * « <base>.lock ». S'il subsiste après un arrêt brutal, on le retire pour
 * pouvoir redémarrer (les autres instances gardent un verrou récent).
 */
function nettoyerVerrouObsolete() {
  try {
    if (!fs.existsSync(dossierVerrou)) return;
    const age = Date.now() - fs.statSync(dossierVerrou).mtimeMs;
    if (age > 5000) {
      fs.rmSync(dossierVerrou, { recursive: true, force: true });
      console.log('  Verrou de base de données obsolète supprimé.');
    }
  } catch {
    /* sans importance : SQLite signalera un éventuel conflit */
  }
}

nettoyerVerrouObsolete();

const base = new Database(dbPath);

// SQLite compilé en WebAssembly : on reste en mode journal classique
// (le mode WAL nécessite de la mémoire partagée, non disponible ici).
try {
  base.exec('PRAGMA journal_mode = DELETE');
} catch {
  /* déjà en journal classique */
}
base.exec('PRAGMA foreign_keys = ON');
base.exec('PRAGMA busy_timeout = 5000');

const echapper = (texte) => texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function motifParametre(prefixe, cle) {
  return new RegExp(`${echapper(prefixe)}${echapper(cle)}(?![A-Za-z0-9_])`);
}

/**
 * Convertit les arguments « à la better-sqlite3 » (positionnels, ou objet de
 * paramètres nommés `@nom`) vers le format attendu par node-sqlite3-wasm.
 * Les clés absentes de la requête sont ignorées.
 */
function normaliserParametres(sql, args) {
  if (args.length === 0) return undefined;
  if (args.length > 1) return args;

  const seul = args[0];
  if (seul === undefined) return undefined;
  if (Array.isArray(seul)) return seul;
  if (seul === null || typeof seul !== 'object' || seul instanceof Uint8Array) {
    return seul;
  }

  const sortie = {};
  for (const [cle, valeur] of Object.entries(seul)) {
    let trouve = false;
    for (const prefixe of ['@', ':', '$']) {
      if (motifParametre(prefixe, cle).test(sql)) {
        sortie[`${prefixe}${cle}`] = valeur;
        trouve = true;
        break;
      }
    }
    if (!trouve && motifParametre('', cle).test(sql)) {
      sortie[cle] = valeur;
    }
  }
  return sortie;
}

const cacheRequetes = new Map();

function statement(sql) {
  let brut = cacheRequetes.get(sql);
  if (!brut) {
    brut = base.prepare(sql);
    cacheRequetes.set(sql, brut);
  }
  return brut;
}

/** Petite façade synchrone compatible avec l'API better-sqlite3 utilisée ici. */
export const db = {
  prepare(sql) {
    return {
      run: (...args) => statement(sql).run(normaliserParametres(sql, args)),
      get: (...args) => statement(sql).get(normaliserParametres(sql, args)) ?? null,
      all: (...args) => statement(sql).all(normaliserParametres(sql, args)),
    };
  },
  exec(sql) {
    base.exec(sql);
  },
  transaction(fn) {
    return (...args) => {
      base.exec('BEGIN');
      try {
        const resultat = fn(...args);
        base.exec('COMMIT');
        return resultat;
      } catch (error) {
        try {
          base.exec('ROLLBACK');
        } catch {
          /* rien à annuler */
        }
        throw error;
      }
    };
  },
  close() {
    cacheRequetes.clear();
    if (base.isOpen) base.close();
    try {
      fs.rmSync(dossierVerrou, { recursive: true, force: true });
    } catch {
      /* déjà absent */
    }
  },
};

// La table `users` n'est pas dans ce schéma : elle est gérée par
// `assurerTableUsers()`, qui sait créer la table ou compléter une table
// existante (colonnes role / actif) sans perdre les comptes déjà en place.
const SCHEMA = `
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
`;

const PARAMETRES_DEFAUT = [
  { nom: 'poids', libelle: 'Poids moyen', unite: 'kg', type_valeur: 'nombre', ordre_affichage: 1 },
  { nom: 'aliment', libelle: 'Aliment consommé (jour)', unite: 'kg', type_valeur: 'nombre', ordre_affichage: 2 },
  { nom: 'eau', libelle: 'Eau consommée (jour)', unite: 'L', type_valeur: 'nombre', ordre_affichage: 3 },
  { nom: 'temperature', libelle: 'Température ambiante', unite: '°C', type_valeur: 'nombre', ordre_affichage: 4 },
  { nom: 'humidite', libelle: 'Humidité', unite: '%', type_valeur: 'nombre', ordre_affichage: 5 },
  { nom: 'observation', libelle: 'Observation', unite: '', type_valeur: 'texte', ordre_affichage: 6 },
];

// Repères de croissance de la souche de démonstration « Activo »
// (poids vif et aliment cumulé, par sujet).
const ANCRES_POIDS = [
  [1, 0.042],
  [7, 0.185],
  [14, 0.47],
  [21, 0.95],
  [28, 1.55],
  [35, 2.2],
  [42, 2.8],
  [43, 2.95],
  [44, 3.1],
  [45, 3.25],
];
const ANCRES_ALIMENT = [
  [1, 0.013],
  [7, 0.15],
  [14, 0.52],
  [21, 1.1],
  [28, 1.87],
  [35, 2.75],
  [42, 3.7],
  [43, 3.9],
  [44, 4.1],
  [45, 4.3],
];

function interpoler(ancres, jour) {
  if (jour <= ancres[0][0]) return ancres[0][1];
  const dernier = ancres[ancres.length - 1];
  if (jour >= dernier[0]) return dernier[1];
  for (let i = 0; i < ancres.length - 1; i += 1) {
    const [j0, v0] = ancres[i];
    const [j1, v1] = ancres[i + 1];
    if (jour >= j0 && jour <= j1) {
      const ratio = (jour - j0) / (j1 - j0);
      return v0 * Math.pow(v1 / v0, ratio);
    }
  }
  return dernier[1];
}

const arrondi = (valeur, decimales = 3) => Number(valeur.toFixed(decimales));

function seedReferences() {
  const existe = db
    .prepare('SELECT COUNT(*) AS total FROM references_valeurs')
    .get().total;
  if (existe > 0) return;

  const parametres = db.prepare('SELECT id, nom FROM parametres_reference').all();
  const idDe = (nom) => parametres.find((p) => p.nom === nom)?.id;
  const poidsId = idDe('poids');
  const alimentId = idDe('aliment');
  const eauId = idDe('eau');
  if (!poidsId || !alimentId) return;

  const insert = db.prepare(
    `INSERT OR IGNORE INTO references_valeurs (souche, jour, parametre_id, valeur, note)
     VALUES (?, ?, ?, ?, ?)`,
  );

  const graine = db.transaction(() => {
    let alimentCumulePrecedent = 0;
    for (let jour = 1; jour <= 45; jour += 1) {
      const poids = arrondi(interpoler(ANCRES_POIDS, jour));
      const alimentCumule = interpoler(ANCRES_ALIMENT, jour);
      const alimentJour = arrondi(alimentCumule - alimentCumulePrecedent);
      alimentCumulePrecedent = alimentCumule;

      insert.run('Activo', jour, poidsId, String(poids), 'Poids vif cible');
      insert.run(
        'Activo',
        jour,
        alimentId,
        String(alimentJour),
        'Consommation journalière indicative',
      );
      if (eauId) {
        insert.run(
          'Activo',
          jour,
          eauId,
          String(arrondi(alimentJour * 1.8)),
          'Environ 1,8 x l’aliment',
        );
      }
    }
  });
  graine();
}

/**
 * Garantit que la table `users` existe avec la structure minimale et les
 * colonnes de gestion multi-utilisateurs (role, actif).
 * Idempotent : gère une base neuve (table absente), une base ancienne
 * (colonnes manquantes) et une base déjà à jour.
 */
function assurerTableUsers() {
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
    .get();

  if (!table) {
    // Cas A : la table users n'existe pas du tout.
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        actif INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } else {
    // Cas B / C : la table existe, on n'ajoute que ce qui manque.
    const colonnes = db
      .prepare('PRAGMA table_info(users)')
      .all()
      .map((colonne) => colonne.name);

    if (!colonnes.includes('role')) {
      db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'admin'");
    }
    if (!colonnes.includes('actif')) {
      db.exec('ALTER TABLE users ADD COLUMN actif INTEGER DEFAULT 1');
    }

    db.exec("UPDATE users SET role = 'admin' WHERE role IS NULL");
    db.exec('UPDATE users SET actif = 1 WHERE actif IS NULL');
  }

  const total = db.prepare('SELECT COUNT(*) AS total FROM users').get().total;
  const admins = db
    .prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'admin' AND actif = 1")
    .get().total;

  if (total === 0) {
    // Base vide : compte par défaut admin / admin.
    const hash = bcrypt.hashSync('admin', 10);
    db.prepare(
      "INSERT INTO users (username, password_hash, role, actif) VALUES (?, ?, 'admin', 1)",
    ).run('admin', hash);
  } else if (admins === 0) {
    // Des comptes existent mais aucun administrateur actif : on promeut le premier.
    const premier = db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get();
    if (premier) {
      db.prepare("UPDATE users SET role = 'admin', actif = 1 WHERE id = ?").run(
        premier.id,
      );
    }
  }

  const nombreUsers = db.prepare('SELECT COUNT(*) AS total FROM users').get().total;
  const nombreAdmins = db
    .prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'admin' AND actif = 1")
    .get().total;
  console.log(`users table OK : ${nombreUsers} users, ${nombreAdmins} admins actifs`);
}

/**
 * Colonnes de pilotage économique ajoutées après la première version :
 * marge bénéficiaire cible (%) et poids moyen attendu à J45 (kg).
 * Idempotent : chaque ALTER n'est exécuté que si la colonne manque.
 */
function assurerColonnesSettings() {
  const colonnes = db
    .prepare('PRAGMA table_info(settings)')
    .all()
    .map((colonne) => colonne.name);

  if (!colonnes.includes('marge_cible')) {
    db.exec('ALTER TABLE settings ADD COLUMN marge_cible REAL DEFAULT 20.0');
  }
  if (!colonnes.includes('poids_moyen_j45_kg')) {
    db.exec('ALTER TABLE settings ADD COLUMN poids_moyen_j45_kg REAL DEFAULT 2.5');
  }

  db.exec('UPDATE settings SET marge_cible = 20.0 WHERE marge_cible IS NULL');
  db.exec(
    'UPDATE settings SET poids_moyen_j45_kg = 2.5 WHERE poids_moyen_j45_kg IS NULL',
  );
}

export function initDb() {
  db.exec(SCHEMA);

  assurerColonnesSettings();

  assurerTableUsers();

  db.prepare(
    `INSERT OR IGNORE INTO settings (id, devise, symbole_devise, seuil_mortalite_alerte)
     VALUES (1, 'MGA', 'Ar', 5.0)`,
  ).run();

  const parametres = db
    .prepare('SELECT COUNT(*) AS total FROM parametres_reference')
    .get().total;
  if (parametres === 0) {
    const insert = db.prepare(
      `INSERT INTO parametres_reference (nom, libelle, unite, type_valeur, ordre_affichage)
       VALUES (@nom, @libelle, @unite, @type_valeur, @ordre_affichage)`,
    );
    const graine = db.transaction(() => {
      for (const parametre of PARAMETRES_DEFAUT) insert.run(parametre);
    });
    graine();
  }

  seedReferences();
}

export function getSettings() {
  return (
    db.prepare('SELECT * FROM settings WHERE id = 1').get() || {
      devise: 'MGA',
      symbole_devise: 'Ar',
      seuil_mortalite_alerte: 5,
      marge_cible: 20,
      poids_moyen_j45_kg: 2.5,
    }
  );
}
