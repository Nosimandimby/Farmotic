import { Router } from 'express';
import { db } from '../db.js';
import { estDateISO, toNumber } from '../stats.js';

const router = Router();

const arrondi = (valeur) => Math.round(valeur * 100) / 100;

function valider(body, { cycleId = null } = {}) {
  const erreurs = [];
  const data = {};

  const cycle = db
    .prepare('SELECT * FROM cycles WHERE id = ?')
    .get(cycleId ?? body?.cycle_id);
  if (!cycle) erreurs.push('Cycle introuvable.');
  data.cycle_id = cycle?.id;

  if (!estDateISO(body?.date)) {
    erreurs.push('La date est invalide.');
  } else {
    data.date = body.date;
  }

  const client = String(body?.client ?? '').trim();
  if (!client) {
    erreurs.push('Le nom du client est obligatoire.');
  } else if (client.length > 100) {
    erreurs.push('Le nom du client ne peut pas dépasser 100 caractères.');
  }
  data.client = client;

  const poids = toNumber(body?.poids_kg);
  if (poids === null || poids <= 0) {
    erreurs.push('Le poids vendu doit être supérieur à 0 kg.');
  } else {
    data.poids_kg = arrondi(poids);
  }

  const prix = toNumber(body?.prix_unitaire_kg);
  if (prix === null || prix <= 0) {
    erreurs.push('Le prix unitaire doit être supérieur à 0.');
  } else {
    data.prix_unitaire_kg = arrondi(prix);
  }

  const nombrePoulets = toNumber(body?.nombre_poulets);
  if (nombrePoulets === null) {
    data.nombre_poulets = null;
  } else if (!Number.isInteger(nombrePoulets) || nombrePoulets < 0) {
    erreurs.push('Le nombre de poulets doit être un entier positif.');
  } else {
    data.nombre_poulets = nombrePoulets;
  }

  data.commentaire = String(body?.commentaire ?? '').trim() || null;

  // Le montant est toujours recalculé côté serveur : jamais repris du client.
  data.montant_total =
    data.poids_kg && data.prix_unitaire_kg
      ? arrondi(data.poids_kg * data.prix_unitaire_kg)
      : null;

  return { erreurs, data };
}

router.get('/ventes', (req, res) => {
  const cycleId = Number(req.query.cycle_id);
  if (!cycleId) return res.status(400).json({ error: 'Cycle invalide.' });

  res.json(
    db
      .prepare('SELECT * FROM ventes WHERE cycle_id = ? ORDER BY date DESC, id DESC')
      .all(cycleId),
  );
});

router.post('/ventes', (req, res) => {
  const { erreurs, data } = valider(req.body || {});
  if (erreurs.length) return res.status(400).json({ error: erreurs[0] });

  const info = db
    .prepare(
      `INSERT INTO ventes (cycle_id, date, client, nombre_poulets, poids_kg,
         prix_unitaire_kg, montant_total, commentaire)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      data.cycle_id,
      data.date,
      data.client,
      data.nombre_poulets,
      data.poids_kg,
      data.prix_unitaire_kg,
      data.montant_total,
      data.commentaire,
    );

  res
    .status(201)
    .json(db.prepare('SELECT * FROM ventes WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/ventes/:id', (req, res) => {
  const vente = db.prepare('SELECT * FROM ventes WHERE id = ?').get(req.params.id);
  if (!vente) return res.status(404).json({ error: 'Vente introuvable.' });

  const { erreurs, data } = valider(
    {
      date: req.body?.date ?? vente.date,
      client: req.body?.client ?? vente.client,
      nombre_poulets:
        req.body?.nombre_poulets === undefined
          ? vente.nombre_poulets
          : req.body.nombre_poulets,
      poids_kg: req.body?.poids_kg ?? vente.poids_kg,
      prix_unitaire_kg: req.body?.prix_unitaire_kg ?? vente.prix_unitaire_kg,
      commentaire: req.body?.commentaire ?? vente.commentaire,
    },
    { cycleId: vente.cycle_id },
  );
  if (erreurs.length) return res.status(400).json({ error: erreurs[0] });

  db.prepare(
    `UPDATE ventes SET date = ?, client = ?, nombre_poulets = ?, poids_kg = ?,
       prix_unitaire_kg = ?, montant_total = ?, commentaire = ?
     WHERE id = ?`,
  ).run(
    data.date,
    data.client,
    data.nombre_poulets,
    data.poids_kg,
    data.prix_unitaire_kg,
    data.montant_total,
    data.commentaire,
    vente.id,
  );

  res.json(db.prepare('SELECT * FROM ventes WHERE id = ?').get(vente.id));
});

router.delete('/ventes/:id', (req, res) => {
  const vente = db.prepare('SELECT * FROM ventes WHERE id = ?').get(req.params.id);
  if (!vente) return res.status(404).json({ error: 'Vente introuvable.' });
  db.prepare('DELETE FROM ventes WHERE id = ?').run(vente.id);
  return res.json({ ok: true });
});

export default router;
