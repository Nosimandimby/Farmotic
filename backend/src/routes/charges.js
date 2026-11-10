import { Router } from 'express';
import { db } from '../db.js';
import { estDateISO, toNumber } from '../stats.js';

const router = Router();

function valider(body) {
  const erreurs = [];
  const data = {};

  const cycle = db.prepare('SELECT * FROM cycles WHERE id = ?').get(body?.cycle_id);
  if (!cycle) erreurs.push('Cycle introuvable.');
  data.cycle_id = cycle?.id;

  if (!estDateISO(body?.date)) {
    erreurs.push('La date est invalide.');
  } else {
    data.date = body.date;
  }

  const categorie = String(body?.categorie || '').trim();
  if (!categorie) erreurs.push('La catégorie est obligatoire.');
  data.categorie = categorie;

  const montant = toNumber(body?.montant);
  if (montant === null || montant < 0) {
    erreurs.push('Le montant est invalide.');
  } else {
    data.montant = montant;
  }

  data.description = String(body?.description ?? '').trim() || null;

  return { erreurs, data };
}

router.get('/charges/categories', (req, res) => {
  res.json(
    db
      .prepare(
        'SELECT DISTINCT categorie FROM charges ORDER BY categorie COLLATE NOCASE',
      )
      .all()
      .map((ligne) => ligne.categorie),
  );
});

router.get('/charges', (req, res) => {
  const cycleId = Number(req.query.cycle_id);
  if (!cycleId) return res.status(400).json({ error: 'Cycle invalide.' });

  res.json(
    db
      .prepare('SELECT * FROM charges WHERE cycle_id = ? ORDER BY date DESC, id DESC')
      .all(cycleId),
  );
});

router.post('/charges', (req, res) => {
  const { erreurs, data } = valider(req.body || {});
  if (erreurs.length) return res.status(400).json({ error: erreurs[0] });

  const info = db
    .prepare(
      'INSERT INTO charges (cycle_id, date, categorie, description, montant) VALUES (?, ?, ?, ?, ?)',
    )
    .run(data.cycle_id, data.date, data.categorie, data.description, data.montant);

  res
    .status(201)
    .json(db.prepare('SELECT * FROM charges WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/charges/:id', (req, res) => {
  const charge = db.prepare('SELECT * FROM charges WHERE id = ?').get(req.params.id);
  if (!charge) return res.status(404).json({ error: 'Charge introuvable.' });

  const { erreurs, data } = valider({
    cycle_id: charge.cycle_id,
    date: req.body?.date ?? charge.date,
    categorie: req.body?.categorie ?? charge.categorie,
    description: req.body?.description ?? charge.description,
    montant: req.body?.montant ?? charge.montant,
  });
  if (erreurs.length) return res.status(400).json({ error: erreurs[0] });

  db.prepare(
    'UPDATE charges SET date = ?, categorie = ?, description = ?, montant = ? WHERE id = ?',
  ).run(data.date, data.categorie, data.description, data.montant, charge.id);

  res.json(db.prepare('SELECT * FROM charges WHERE id = ?').get(charge.id));
});

router.delete('/charges/:id', (req, res) => {
  const charge = db.prepare('SELECT * FROM charges WHERE id = ?').get(req.params.id);
  if (!charge) return res.status(404).json({ error: 'Charge introuvable.' });
  db.prepare('DELETE FROM charges WHERE id = ?').run(charge.id);
  return res.json({ ok: true });
});

export default router;
