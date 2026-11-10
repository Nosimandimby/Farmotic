import { Router } from 'express';
import { db } from '../db.js';
import { estDateISO, jourCycle } from '../stats.js';

const router = Router();

function contexteMortalite(body) {
  const cycle = db.prepare('SELECT * FROM cycles WHERE id = ?').get(body?.cycle_id);
  if (!cycle) return { erreur: 'Cycle introuvable.' };
  if (!estDateISO(body?.date)) return { erreur: 'La date est invalide.' };

  const jour = jourCycle(body.date, cycle.date_debut);
  if (jour < 1) {
    return { erreur: 'La date est antérieure au début du cycle.' };
  }

  const nombre = Number(body?.nombre_morts);
  if (!Number.isInteger(nombre) || nombre < 0) {
    return { erreur: 'Le nombre de morts doit être un entier positif.' };
  }

  const dejaMorts = db
    .prepare('SELECT COALESCE(SUM(nombre_morts), 0) AS total FROM mortalites WHERE cycle_id = ?')
    .get(cycle.id).total;

  return { cycle, jour, nombre, dejaMorts };
}

router.get('/mortalites', (req, res) => {
  const cycleId = Number(req.query.cycle_id);
  if (!cycleId) return res.status(400).json({ error: 'Cycle invalide.' });

  res.json(
    db
      .prepare(
        'SELECT * FROM mortalites WHERE cycle_id = ? ORDER BY date DESC, id DESC',
      )
      .all(cycleId),
  );
});

router.post('/mortalites', (req, res) => {
  const contexte = contexteMortalite(req.body || {});
  if (contexte.erreur) return res.status(400).json({ error: contexte.erreur });

  if (contexte.dejaMorts + contexte.nombre > contexte.cycle.nombre_poussins) {
    return res.status(400).json({
      error: 'La mortalité cumulée dépasse le nombre de poussins du cycle.',
    });
  }

  const motif = String(req.body?.motif ?? '').trim() || null;
  const info = db
    .prepare(
      'INSERT INTO mortalites (cycle_id, date, jour_cycle, nombre_morts, motif) VALUES (?, ?, ?, ?, ?)',
    )
    .run(contexte.cycle.id, req.body.date, contexte.jour, contexte.nombre, motif);

  res.status(201).json(
    db.prepare('SELECT * FROM mortalites WHERE id = ?').get(info.lastInsertRowid),
  );
});

router.put('/mortalites/:id', (req, res) => {
  const ligne = db
    .prepare('SELECT * FROM mortalites WHERE id = ?')
    .get(req.params.id);
  if (!ligne) return res.status(404).json({ error: 'Enregistrement introuvable.' });

  const contexte = contexteMortalite({
    cycle_id: ligne.cycle_id,
    date: req.body?.date ?? ligne.date,
    nombre_morts: req.body?.nombre_morts ?? ligne.nombre_morts,
  });
  if (contexte.erreur) return res.status(400).json({ error: contexte.erreur });

  const autres = db
    .prepare(
      'SELECT COALESCE(SUM(nombre_morts), 0) AS total FROM mortalites WHERE cycle_id = ? AND id != ?',
    )
    .get(ligne.cycle_id, ligne.id).total;

  if (autres + contexte.nombre > contexte.cycle.nombre_poussins) {
    return res.status(400).json({
      error: 'La mortalité cumulée dépasse le nombre de poussins du cycle.',
    });
  }

  const motif =
    req.body?.motif !== undefined
      ? String(req.body.motif).trim() || null
      : ligne.motif;

  const date = req.body?.date ?? ligne.date;
  db.prepare(
    'UPDATE mortalites SET date = ?, jour_cycle = ?, nombre_morts = ?, motif = ? WHERE id = ?',
  ).run(date, contexte.jour, contexte.nombre, motif, ligne.id);

  res.json(db.prepare('SELECT * FROM mortalites WHERE id = ?').get(ligne.id));
});

router.delete('/mortalites/:id', (req, res) => {
  const ligne = db
    .prepare('SELECT * FROM mortalites WHERE id = ?')
    .get(req.params.id);
  if (!ligne) return res.status(404).json({ error: 'Enregistrement introuvable.' });
  db.prepare('DELETE FROM mortalites WHERE id = ?').run(ligne.id);
  return res.json({ ok: true });
});

export default router;
