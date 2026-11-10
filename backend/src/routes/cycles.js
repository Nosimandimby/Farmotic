import { Router } from 'express';
import { db, getSettings } from '../db.js';

import { requireAuth } from '../auth.js';
import {
  cycleAvecStats,
  estDateISO,
  getCycleStats,
  toNumber,
} from '../stats.js';

const router = Router();

const STATUTS = ['en_cours', 'termine'];

function validerCycle(body, { partiel = false } = {}) {
  const erreurs = [];
  const data = {};

  if (!partiel || body.nom !== undefined) {
    const nom = String(body.nom || '').trim();
    if (!nom) erreurs.push('Le nom du cycle est obligatoire.');
    data.nom = nom;
  }

  if (!partiel || body.date_debut !== undefined) {
    if (!estDateISO(body.date_debut)) {
      erreurs.push('La date de début est invalide.');
    } else {
      data.date_debut = body.date_debut;
    }
  }

  if (!partiel || body.nombre_poussins !== undefined) {
    const nombre = Number(body.nombre_poussins);
    if (!Number.isInteger(nombre) || nombre <= 0) {
      erreurs.push('Le nombre de poussins doit être un entier supérieur à 0.');
    } else {
      data.nombre_poussins = nombre;
    }
  }

  if (!partiel || body.prix_poussin !== undefined) {
    const prix = toNumber(body.prix_poussin ?? 0);
    if (prix === null || prix < 0) {
      erreurs.push('Le prix du poussin est invalide.');
    } else {
      data.prix_poussin = prix;
    }
  }

  if (!partiel || body.souche !== undefined) {
    data.souche = String(body.souche || '').trim() || null;
  }

  if (!partiel || body.statut !== undefined) {
    const statut = String(body.statut || 'en_cours');
    if (!STATUTS.includes(statut)) {
      erreurs.push('Statut de cycle invalide.');
    } else {
      data.statut = statut;
    }
  }

  return { erreurs, data };
}

router.get('/cycles', requireAuth, (req, res) => {
  const cycles = db
    .prepare(
      `SELECT * FROM cycles
       ORDER BY CASE statut WHEN 'en_cours' THEN 0 ELSE 1 END, date_debut DESC`,
    )
    .all();
  res.json(cycles.map(cycleAvecStats));
});

router.get('/cycles/:id', requireAuth, (req, res) => {
  const cycle = db.prepare('SELECT * FROM cycles WHERE id = ?').get(req.params.id);
  if (!cycle) return res.status(404).json({ error: 'Cycle introuvable.' });
  return res.json(cycleAvecStats(cycle));
});

router.post('/cycles', requireAuth, (req, res) => {
  const { erreurs, data } = validerCycle(req.body || {});
  if (erreurs.length) return res.status(400).json({ error: erreurs[0] });

  const info = db
    .prepare(
      `INSERT INTO cycles (nom, date_debut, nombre_poussins, prix_poussin, souche, statut)
       VALUES (@nom, @date_debut, @nombre_poussins, @prix_poussin, @souche, @statut)`,
    )
    .run(data);

  const cycle = db.prepare('SELECT * FROM cycles WHERE id = ?').get(info.lastInsertRowid);
  return res.status(201).json(cycleAvecStats(cycle));
});

router.put('/cycles/:id', requireAuth, (req, res) => {
  const cycle = db.prepare('SELECT * FROM cycles WHERE id = ?').get(req.params.id);
  if (!cycle) return res.status(404).json({ error: 'Cycle introuvable.' });

  const { erreurs, data } = validerCycle(req.body || {}, { partiel: true });
  if (erreurs.length) return res.status(400).json({ error: erreurs[0] });

  const fusion = { ...cycle, ...data };
  db.prepare(
    `UPDATE cycles SET nom = @nom, date_debut = @date_debut,
       nombre_poussins = @nombre_poussins, prix_poussin = @prix_poussin,
       souche = @souche, statut = @statut
     WHERE id = @id`,
  ).run({ ...fusion, id: cycle.id });

  const misAJour = db.prepare('SELECT * FROM cycles WHERE id = ?').get(cycle.id);
  return res.json(cycleAvecStats(misAJour));
});

router.delete('/cycles/:id', requireAuth, (req, res) => {
  const cycle = db.prepare('SELECT * FROM cycles WHERE id = ?').get(req.params.id);
  if (!cycle) return res.status(404).json({ error: 'Cycle introuvable.' });
  db.prepare('DELETE FROM cycles WHERE id = ?').run(cycle.id);
  return res.json({ ok: true });
});

router.get('/cycles/:id/serie', (req, res) => {
  const cycle = db.prepare('SELECT * FROM cycles WHERE id = ?').get(req.params.id);
  if (!cycle) return res.status(404).json({ error: 'Cycle introuvable.' });

  const parametre = db
    .prepare('SELECT * FROM parametres_reference WHERE id = ?')
    .get(req.query.parametre_id);
  if (!parametre) return res.status(400).json({ error: 'Paramètre invalide.' });

  const releves = db
    .prepare(
      `SELECT jour_cycle AS jour, valeur FROM releves_journaliers
       WHERE cycle_id = ? AND parametre_id = ? ORDER BY jour_cycle`,
    )
    .all(cycle.id, parametre.id);

  const references = cycle.souche
    ? db
        .prepare(
          `SELECT jour, valeur FROM references_valeurs
           WHERE souche = ? AND parametre_id = ? ORDER BY jour`,
        )
        .all(cycle.souche, parametre.id)
    : [];

  const points = new Map();
  for (const reference of references) {
    points.set(reference.jour, {
      jour: reference.jour,
      reference: toNumber(reference.valeur),
    });
  }
  for (const releve of releves) {
    const point = points.get(releve.jour) || { jour: releve.jour };
    point.reel = toNumber(releve.valeur);
    points.set(releve.jour, point);
  }

  return res.json({
    parametre: {
      id: parametre.id,
      nom: parametre.nom,
      libelle: parametre.libelle,
      unite: parametre.unite,
      type_valeur: parametre.type_valeur,
    },
    souche: cycle.souche,
    points: [...points.values()].sort((a, b) => a.jour - b.jour),
  });
});

router.get('/cycles/:id/synthese', requireAuth, (req, res) => {
  const cycle = db.prepare('SELECT * FROM cycles WHERE id = ?').get(req.params.id);
  if (!cycle) return res.status(404).json({ error: 'Cycle introuvable.' });

  const stats = getCycleStats(cycle);

  const chargesParCategorie = db
    .prepare(
      `SELECT categorie, SUM(montant) AS montant FROM charges
       WHERE cycle_id = ? GROUP BY categorie ORDER BY montant DESC`,
    )
    .all(cycle.id);

  const mortalites = db
    .prepare(
      `SELECT date, jour_cycle, nombre_morts FROM mortalites
       WHERE cycle_id = ? ORDER BY jour_cycle`,
    )
    .all(cycle.id);

  const aliment = db
    .prepare(
      `SELECT r.jour_cycle AS jour, SUM(CAST(REPLACE(r.valeur, ',', '.') AS REAL)) AS quantite
       FROM releves_journaliers r
       JOIN parametres_reference p ON p.id = r.parametre_id
       WHERE r.cycle_id = ? AND p.nom = 'aliment'
       GROUP BY r.jour_cycle ORDER BY r.jour_cycle`,
    )
    .all(cycle.id);

  const settings = getSettings();

  // Les calculs économiques s'appuient sur le poids moyen à J45 paramétré,
  // jamais sur la dernière pesée réelle.
  const poidsMoyenJ45 = toNumber(settings.poids_moyen_j45_kg) ?? 2.5;
  const margeCible = toNumber(settings.marge_cible) ?? 20;

  const vivants = stats.effectif_vivant;
  const chargesTotales = stats.cout_total;
  const facteurMarge = 1 + margeCible / 100;

  const montant = (valeur) => (valeur === null ? null : Math.round(valeur));

  let prixRevientPoulet = null;
  let prixRevientKg = null;
  if (vivants > 0 && chargesTotales > 0) {
    prixRevientPoulet = chargesTotales / vivants;
    if (poidsMoyenJ45 > 0) {
      prixRevientKg = prixRevientPoulet / poidsMoyenJ45;
    }
  }

  const prixVentePoulet =
    prixRevientPoulet === null ? null : montant(prixRevientPoulet * facteurMarge);
  const prixVenteKg =
    prixRevientKg === null ? null : montant(prixRevientKg * facteurMarge);

  const poidsTotalKg =
    vivants > 0 && poidsMoyenJ45 > 0
      ? Number((vivants * poidsMoyenJ45).toFixed(2))
      : null;

  const caProjete =
    poidsTotalKg !== null && prixVenteKg !== null
      ? montant(poidsTotalKg * prixVenteKg)
      : null;
  const beneficeProjete =
    caProjete !== null && chargesTotales > 0 ? montant(caProjete - chargesTotales) : null;

  const ventesCycle = db
    .prepare('SELECT * FROM ventes WHERE cycle_id = ? ORDER BY date DESC, id DESC')
    .all(cycle.id);

  const somme = (cle) =>
    ventesCycle.reduce((total, vente) => total + (toNumber(vente[cle]) ?? 0), 0);

  const poidsTotalVendu = Number(somme('poids_kg').toFixed(2));
  const chiffreAffairesReel = montant(somme('montant_total'));
  const prixMoyenKg =
    poidsTotalVendu > 0 ? montant(chiffreAffairesReel / poidsTotalVendu) : null;
  const beneficeReel = montant(chiffreAffairesReel - chargesTotales);
  const margeReellePct =
    chiffreAffairesReel > 0
      ? Number(((beneficeReel / chiffreAffairesReel) * 100).toFixed(1))
      : null;

  let comparaison = null;
  if (ventesCycle.length > 0 && beneficeProjete !== null) {
    const ecart = montant(beneficeReel - beneficeProjete);
    let ecartPct = null;
    let statut = 'non_comparable';
    if (beneficeProjete !== 0) {
      ecartPct = Number(((ecart / Math.abs(beneficeProjete)) * 100).toFixed(1));
      statut =
        ecartPct > 5 ? 'au_dessus' : ecartPct < -5 ? 'sous_performance' : 'conforme';
    }
    comparaison = {
      ecart_benefice: ecart,
      ecart_benefice_pct: ecartPct,
      statut,
    };
  }

  res.json({
    cycle: { ...cycle, stats },
    charges_par_categorie: chargesParCategorie,
    mortalites,
    aliment,
    parametres: {
      poids_moyen_j45_kg: poidsMoyenJ45,
      marge_cible: margeCible,
      poids_moyen_unite: stats.poids_moyen_unite,
    },
    prix_revient: {
      poulet: montant(prixRevientPoulet),
      kg: montant(prixRevientKg),
    },
    prix_vente_minimum: {
      poulet: prixVentePoulet,
      kg: prixVenteKg,
    },
    projection: {
      poids_total_kg: poidsTotalKg,
      ca_projete: caProjete,
      benefice_projete: beneficeProjete,
    },
    ventes: {
      nombre_ventes: ventesCycle.length,
      poulets_vendus: somme('nombre_poulets'),
      poids_total_vendu_kg: poidsTotalVendu,
      chiffre_affaires_reel: chiffreAffairesReel,
      prix_moyen_kg: prixMoyenKg,
      detail: ventesCycle,
    },
    reel: {
      chiffre_affaires: chiffreAffairesReel,
      benefice_reel: beneficeReel,
      marge_reelle_pct: margeReellePct,
    },
    comparaison,
  });
});

export default router;
