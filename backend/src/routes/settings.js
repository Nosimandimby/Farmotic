import { Router } from 'express';
import { db, getSettings } from '../db.js';
import { toNumber } from '../stats.js';

const router = Router();

const DEFAUTS = {
  marge_cible: 20,
  poids_moyen_j45_kg: 2.5,
};

/** Les deux nouvelles colonnes sont numériques et jamais NULL côté API. */
function normaliser(settings) {
  return {
    ...settings,
    marge_cible:
      settings.marge_cible === null || settings.marge_cible === undefined
        ? DEFAUTS.marge_cible
        : Number(settings.marge_cible),
    poids_moyen_j45_kg:
      settings.poids_moyen_j45_kg === null || settings.poids_moyen_j45_kg === undefined
        ? DEFAUTS.poids_moyen_j45_kg
        : Number(settings.poids_moyen_j45_kg),
  };
}

router.get('/settings', (req, res) => {
  res.json(normaliser(getSettings()));
});

router.put('/settings', (req, res) => {
  const actuel = normaliser(getSettings());

  const devise = String(req.body?.devise ?? actuel.devise).trim() || 'MGA';
  const symbole = String(req.body?.symbole_devise ?? actuel.symbole_devise).trim() || 'Ar';
  const seuil = toNumber(req.body?.seuil_mortalite_alerte ?? actuel.seuil_mortalite_alerte);

  if (seuil === null || seuil < 0) {
    return res.status(400).json({ error: 'Le seuil de mortalité est invalide.' });
  }

  const margeCible = toNumber(req.body?.marge_cible ?? actuel.marge_cible);
  if (margeCible === null || margeCible < 0 || margeCible > 200) {
    return res.status(400).json({
      error: 'La marge bénéficiaire cible doit être comprise entre 0 et 200 %.',
    });
  }

  const poidsMoyenJ45 = toNumber(
    req.body?.poids_moyen_j45_kg ?? actuel.poids_moyen_j45_kg,
  );
  if (poidsMoyenJ45 === null || poidsMoyenJ45 < 0.5 || poidsMoyenJ45 > 10) {
    return res.status(400).json({
      error: 'Le poids moyen à J45 doit être compris entre 0,5 et 10 kg.',
    });
  }

  db.prepare(
    `UPDATE settings
        SET devise = ?, symbole_devise = ?, seuil_mortalite_alerte = ?,
            marge_cible = ?, poids_moyen_j45_kg = ?
      WHERE id = 1`,
  ).run(devise, symbole, seuil, margeCible, poidsMoyenJ45);

  return res.json(normaliser(getSettings()));
});

export default router;
