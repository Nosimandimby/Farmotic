import { Router } from 'express';
import { db } from '../db.js';
import { estDateISO, jourCycle, toNumber } from '../stats.js';

const router = Router();

function verifierContexte(cycleId, date) {
  const cycle = db.prepare('SELECT * FROM cycles WHERE id = ?').get(cycleId);
  if (!cycle) return { erreur: 'Cycle introuvable.' };
  if (!estDateISO(date)) return { erreur: 'La date du relevé est invalide.' };

  const jour = jourCycle(date, cycle.date_debut);
  if (jour < 1) {
    return { erreur: 'La date est antérieure au début du cycle.' };
  }
  return { cycle, jour };
}

function verifierParametre(parametreId) {
  const parametre = db
    .prepare('SELECT * FROM parametres_reference WHERE id = ?')
    .get(parametreId);
  if (!parametre) return { erreur: 'Paramètre introuvable.' };
  return { parametre };
}

router.get('/releves', (req, res) => {
  const cycleId = Number(req.query.cycle_id);
  if (!cycleId) return res.status(400).json({ error: 'Cycle invalide.' });

  const releves = db
    .prepare(
      `SELECT r.*, p.libelle, p.unite, p.nom AS parametre_nom, p.type_valeur
       FROM releves_journaliers r
       JOIN parametres_reference p ON p.id = r.parametre_id
       WHERE r.cycle_id = ?
       ORDER BY r.date DESC, r.jour_cycle DESC, p.ordre_affichage ASC, p.id ASC`,
    )
    .all(cycleId);

  res.json(releves);
});

router.post('/releves', (req, res) => {
  const cycleId = Number(req.body?.cycle_id);
  const parametreId = Number(req.body?.parametre_id);
  const valeur = String(req.body?.valeur ?? '').trim();
  const commentaire = String(req.body?.commentaire ?? '').trim() || null;

  const contexte = verifierContexte(cycleId, req.body?.date);
  if (contexte.erreur) return res.status(400).json({ error: contexte.erreur });

  const { parametre, erreur } = verifierParametre(parametreId);
  if (erreur) return res.status(400).json({ error: erreur });

  if (parametre.type_valeur === 'nombre' && toNumber(valeur) === null) {
    return res.status(400).json({ error: 'La valeur doit être un nombre.' });
  }
  if (valeur === '') {
    return res.status(400).json({ error: 'La valeur est obligatoire.' });
  }

  db.prepare(
    `INSERT INTO releves_journaliers (cycle_id, date, jour_cycle, parametre_id, valeur, commentaire)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(cycle_id, date, parametre_id)
     DO UPDATE SET valeur = excluded.valeur, commentaire = excluded.commentaire`,
  ).run(cycleId, req.body.date, contexte.jour, parametreId, valeur, commentaire);

  return res.status(201).json(
    db
      .prepare(
        'SELECT * FROM releves_journaliers WHERE cycle_id = ? AND date = ? AND parametre_id = ?',
      )
      .get(cycleId, req.body.date, parametreId),
  );
});

router.post('/releves/jour', (req, res) => {
  const cycleId = Number(req.body?.cycle_id);
  const valeurs = Array.isArray(req.body?.valeurs) ? req.body.valeurs : [];

  const contexte = verifierContexte(cycleId, req.body?.date);
  if (contexte.erreur) return res.status(400).json({ error: contexte.erreur });

  const insert = db.prepare(
    `INSERT INTO releves_journaliers (cycle_id, date, jour_cycle, parametre_id, valeur, commentaire)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(cycle_id, date, parametre_id)
     DO UPDATE SET valeur = excluded.valeur, commentaire = excluded.commentaire`,
  );
  const supprimer = db.prepare(
    'DELETE FROM releves_journaliers WHERE cycle_id = ? AND date = ? AND parametre_id = ?',
  );

  const erreurs = [];
  const enregistrer = db.transaction(() => {
    for (const ligne of valeurs) {
      const parametreId = Number(ligne.parametre_id);
      const parametre = db
        .prepare('SELECT * FROM parametres_reference WHERE id = ?')
        .get(parametreId);
      if (!parametre) {
        erreurs.push('Paramètre introuvable.');
        continue;
      }

      const valeur = String(ligne.valeur ?? '').trim();
      if (valeur === '') {
        supprimer.run(cycleId, req.body.date, parametreId);
        continue;
      }
      if (parametre.type_valeur === 'nombre' && toNumber(valeur) === null) {
        erreurs.push(`La valeur de « ${parametre.libelle} » doit être un nombre.`);
        continue;
      }

      const commentaire = String(ligne.commentaire ?? '').trim() || null;
      insert.run(cycleId, req.body.date, contexte.jour, parametreId, valeur, commentaire);
    }
    if (erreurs.length) throw new Error(erreurs[0]);
  });

  try {
    enregistrer();
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const enregistres = db
    .prepare('SELECT * FROM releves_journaliers WHERE cycle_id = ? AND date = ?')
    .all(cycleId, req.body.date);

  return res.json({ releves: enregistres, jour_cycle: contexte.jour });
});

router.delete('/releves/jour', (req, res) => {
  const cycleId = Number(req.query.cycle_id);
  const date = String(req.query.date || '');
  if (!cycleId || !estDateISO(date)) {
    return res.status(400).json({ error: 'Cycle ou date invalide.' });
  }

  const info = db
    .prepare('DELETE FROM releves_journaliers WHERE cycle_id = ? AND date = ?')
    .run(cycleId, date);

  return res.json({ supprimes: info.changes });
});

router.put('/releves/:id', (req, res) => {
  const releve = db
    .prepare('SELECT * FROM releves_journaliers WHERE id = ?')
    .get(req.params.id);
  if (!releve) return res.status(404).json({ error: 'Relevé introuvable.' });

  const date = req.body?.date ?? releve.date;
  const contexte = verifierContexte(releve.cycle_id, date);
  if (contexte.erreur) return res.status(400).json({ error: contexte.erreur });

  const parametre = db
    .prepare('SELECT * FROM parametres_reference WHERE id = ?')
    .get(releve.parametre_id);
  const valeur = String(req.body?.valeur ?? releve.valeur).trim();
  if (valeur === '') {
    return res.status(400).json({ error: 'La valeur est obligatoire.' });
  }
  if (parametre?.type_valeur === 'nombre' && toNumber(valeur) === null) {
    return res.status(400).json({ error: 'La valeur doit être un nombre.' });
  }

  const commentaire =
    req.body?.commentaire !== undefined
      ? String(req.body.commentaire).trim() || null
      : releve.commentaire;

  db.prepare(
    `UPDATE releves_journaliers SET date = ?, jour_cycle = ?, valeur = ?, commentaire = ?
     WHERE id = ?`,
  ).run(date, contexte.jour, valeur, commentaire, releve.id);

  return res.json(
    db.prepare('SELECT * FROM releves_journaliers WHERE id = ?').get(releve.id),
  );
});

router.delete('/releves/:id', (req, res) => {
  const releve = db
    .prepare('SELECT * FROM releves_journaliers WHERE id = ?')
    .get(req.params.id);
  if (!releve) return res.status(404).json({ error: 'Relevé introuvable.' });
  db.prepare('DELETE FROM releves_journaliers WHERE id = ?').run(releve.id);
  return res.json({ ok: true });
});

export default router;
