import { Router } from 'express';
import { db } from '../db.js';
import { toNumber } from '../stats.js';

const router = Router();

const NOMS_PROTEGES = ['poids', 'aliment'];

function valider(body, { partiel = false } = {}) {
  const erreurs = [];
  const data = {};

  if (!partiel || body.nom !== undefined) {
    const nom = String(body.nom || '').trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(nom)) {
      erreurs.push(
        'Le nom technique doit commencer par une lettre et ne contenir que des lettres minuscules, chiffres ou « _ » (2 à 40 caractères).',
      );
    } else {
      data.nom = nom;
    }
  }

  if (!partiel || body.libelle !== undefined) {
    const libelle = String(body.libelle || '').trim();
    if (!libelle) erreurs.push('Le libellé est obligatoire.');
    data.libelle = libelle;
  }

  if (!partiel || body.unite !== undefined) {
    data.unite = String(body.unite ?? '').trim();
  }

  if (!partiel || body.type_valeur !== undefined) {
    const type = String(body.type_valeur || 'nombre');
    if (!['nombre', 'texte'].includes(type)) {
      erreurs.push('Type de valeur invalide.');
    } else {
      data.type_valeur = type;
    }
  }

  if (!partiel || body.ordre_affichage !== undefined) {
    const ordre = toNumber(body.ordre_affichage ?? 0);
    data.ordre_affichage = ordre === null ? 0 : Math.trunc(ordre);
  }

  if (!partiel || body.actif !== undefined) {
    data.actif = body.actif === false || body.actif === 0 ? 0 : 1;
  }

  return { erreurs, data };
}

function estUtilise(parametreId) {
  const releves = db
    .prepare('SELECT COUNT(*) AS total FROM releves_journaliers WHERE parametre_id = ?')
    .get(parametreId).total;
  return releves > 0;
}

router.get('/parametres', (req, res) => {
  const seulementActifs = req.query.actifs === '1';
  const parametres = db
    .prepare(
      `SELECT * FROM parametres_reference
       ${seulementActifs ? 'WHERE actif = 1' : ''}
       ORDER BY ordre_affichage ASC, id ASC`,
    )
    .all();
  res.json(parametres);
});

router.post('/parametres', (req, res) => {
  const { erreurs, data } = valider(req.body || {});
  if (erreurs.length) return res.status(400).json({ error: erreurs[0] });

  const existe = db
    .prepare('SELECT id FROM parametres_reference WHERE nom = ?')
    .get(data.nom);
  if (existe) {
    return res
      .status(400)
      .json({ error: `Le paramètre « ${data.nom} » existe déjà.` });
  }

  const info = db
    .prepare(
      `INSERT INTO parametres_reference (nom, libelle, unite, type_valeur, ordre_affichage, actif)
       VALUES (@nom, @libelle, @unite, @type_valeur, @ordre_affichage, @actif)`,
    )
    .run({ ...data, actif: data.actif ?? 1 });

  return res
    .status(201)
    .json(
      db
        .prepare('SELECT * FROM parametres_reference WHERE id = ?')
        .get(info.lastInsertRowid),
    );
});

router.put('/parametres/:id', (req, res) => {
  const parametre = db
    .prepare('SELECT * FROM parametres_reference WHERE id = ?')
    .get(req.params.id);
  if (!parametre) return res.status(404).json({ error: 'Paramètre introuvable.' });

  const { erreurs, data } = valider(req.body || {}, { partiel: true });
  if (erreurs.length) return res.status(400).json({ error: erreurs[0] });

  if (
    data.nom &&
    data.nom !== parametre.nom &&
    NOMS_PROTEGES.includes(parametre.nom)
  ) {
    return res.status(400).json({
      error: `Le nom technique « ${parametre.nom} » est utilisé par les indicateurs et ne peut pas être modifié.`,
    });
  }

  const doublon = db
    .prepare('SELECT id FROM parametres_reference WHERE nom = ? AND id != ?')
    .get(data.nom ?? parametre.nom, parametre.id);
  if (doublon) {
    return res
      .status(400)
      .json({ error: `Le paramètre « ${data.nom} » existe déjà.` });
  }

  const fusion = { ...parametre, ...data };
  db.prepare(
    `UPDATE parametres_reference
     SET nom = @nom, libelle = @libelle, unite = @unite, type_valeur = @type_valeur,
         ordre_affichage = @ordre_affichage, actif = @actif
     WHERE id = @id`,
  ).run({ ...fusion, id: parametre.id });

  return res.json(
    db.prepare('SELECT * FROM parametres_reference WHERE id = ?').get(parametre.id),
  );
});

router.delete('/parametres/:id', (req, res) => {
  const parametre = db
    .prepare('SELECT * FROM parametres_reference WHERE id = ?')
    .get(req.params.id);
  if (!parametre) return res.status(404).json({ error: 'Paramètre introuvable.' });

  if (estUtilise(parametre.id)) {
    return res.status(409).json({
      error:
        'Ce paramètre possède des relevés : désactivez-le plutôt que de le supprimer.',
    });
  }

  db.prepare('DELETE FROM parametres_reference WHERE id = ?').run(parametre.id);
  return res.json({ ok: true });
});

export default router;
