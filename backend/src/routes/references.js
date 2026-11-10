import { Router } from 'express';
import { db } from '../db.js';
import { toNumber } from '../stats.js';

const router = Router();

router.get('/references/souches', (req, res) => {
  const souches = new Set();
  for (const ligne of db
    .prepare('SELECT DISTINCT souche FROM references_valeurs ORDER BY souche')
    .all()) {
    if (ligne.souche) souches.add(ligne.souche);
  }
  for (const ligne of db
    .prepare('SELECT DISTINCT souche FROM cycles WHERE souche IS NOT NULL')
    .all()) {
    if (ligne.souche) souches.add(ligne.souche);
  }
  res.json([...souches].sort((a, b) => a.localeCompare(b, 'fr')));
});

router.get('/references', (req, res) => {
  const parametreId = Number(req.query.parametre_id);
  const souche = String(req.query.souche || '').trim();
  if (!parametreId) {
    return res.status(400).json({ error: 'Paramètre invalide.' });
  }

  const valeurs = db
    .prepare(
      `SELECT * FROM references_valeurs
       WHERE parametre_id = ? AND souche = ? ORDER BY jour ASC`,
    )
    .all(parametreId, souche);

  res.json(valeurs);
});

router.post('/references', (req, res) => {
  const souche = String(req.body?.souche || '').trim();
  const parametreId = Number(req.body?.parametre_id);
  const jour = Number(req.body?.jour);
  const valeur = String(req.body?.valeur ?? '').trim();
  const note = String(req.body?.note ?? '').trim() || null;

  if (!souche) return res.status(400).json({ error: 'La souche est obligatoire.' });
  if (!parametreId || !Number.isInteger(jour) || jour < 1) {
    return res.status(400).json({ error: 'Le jour de référence est invalide.' });
  }

  const parametre = db
    .prepare('SELECT * FROM parametres_reference WHERE id = ?')
    .get(parametreId);
  if (!parametre) return res.status(400).json({ error: 'Paramètre invalide.' });

  if (valeur === '') {
    db.prepare(
      'DELETE FROM references_valeurs WHERE souche = ? AND jour = ? AND parametre_id = ?',
    ).run(souche, jour, parametreId);
    return res.json({ ok: true, supprime: true });
  }

  if (parametre.type_valeur === 'nombre' && toNumber(valeur) === null) {
    return res.status(400).json({ error: 'La valeur doit être un nombre.' });
  }

  db.prepare(
    `INSERT INTO references_valeurs (souche, jour, parametre_id, valeur, note)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(souche, jour, parametre_id)
     DO UPDATE SET valeur = excluded.valeur, note = excluded.note`,
  ).run(souche, jour, parametreId, valeur, note);

  return res.json(
    db
      .prepare(
        'SELECT * FROM references_valeurs WHERE souche = ? AND jour = ? AND parametre_id = ?',
      )
      .get(souche, jour, parametreId),
  );
});

router.delete('/references/:id', (req, res) => {
  const ligne = db
    .prepare('SELECT * FROM references_valeurs WHERE id = ?')
    .get(req.params.id);
  if (!ligne) return res.status(404).json({ error: 'Valeur de référence introuvable.' });
  db.prepare('DELETE FROM references_valeurs WHERE id = ?').run(ligne.id);
  return res.json({ ok: true });
});

export default router;
