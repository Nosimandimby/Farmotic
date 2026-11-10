import { db, getSettings } from './db.js';

export function toNumber(valeur) {
  if (valeur === null || valeur === undefined) return null;
  const normalise = String(valeur).trim().replace(',', '.');
  if (normalise === '') return null;
  const nombre = Number(normalise);
  return Number.isFinite(nombre) ? nombre : null;
}

export function dateDuJour() {
  return new Date().toLocaleDateString('en-CA');
}

export function joursEntre(depuis, jusqu) {
  const a = Date.parse(`${depuis}T00:00:00Z`);
  const b = Date.parse(`${jusqu}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

export function jourCycle(date, dateDebut) {
  return joursEntre(dateDebut, date) + 1;
}

export function estDateISO(valeur) {
  return typeof valeur === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valeur);
}

export function getParametrePoids() {
  return db
    .prepare("SELECT * FROM parametres_reference WHERE nom = 'poids'")
    .get();
}

export function getParametreAliment() {
  return db
    .prepare("SELECT * FROM parametres_reference WHERE nom = 'aliment'")
    .get();
}

export function getCycleStats(cycle) {
  const settings = getSettings();

  const totalMorts = db
    .prepare(
      'SELECT COALESCE(SUM(nombre_morts), 0) AS total FROM mortalites WHERE cycle_id = ?',
    )
    .get(cycle.id).total;

  const effectifVivant = Math.max(0, cycle.nombre_poussins - totalMorts);
  const tauxMortalite =
    cycle.nombre_poussins > 0 ? (totalMorts / cycle.nombre_poussins) * 100 : 0;

  const ageJours = Math.max(
    0,
    Math.min(999, joursEntre(cycle.date_debut, dateDuJour()) + 1),
  );

  const parametrePoids = getParametrePoids();
  const parametreAliment = getParametreAliment();

  const relevesPoids = parametrePoids
    ? db
        .prepare(
          `SELECT date, jour_cycle, valeur FROM releves_journaliers
           WHERE cycle_id = ? AND parametre_id = ? ORDER BY jour_cycle ASC`,
        )
        .all(cycle.id, parametrePoids.id)
        .map((r) => ({ ...r, nombre: toNumber(r.valeur) }))
        .filter((r) => r.nombre !== null)
    : [];

  const dernierPoids = relevesPoids[relevesPoids.length - 1] || null;
  const poidsMoyen = dernierPoids ? dernierPoids.nombre : null;

  const alimentTotal = parametreAliment
    ? db
        .prepare(
          'SELECT COALESCE(SUM(valeur), 0) AS total FROM releves_journaliers WHERE cycle_id = ? AND parametre_id = ?',
        )
        .get(cycle.id, parametreAliment.id).total
    : 0;

  const charges = db
    .prepare(
      'SELECT COALESCE(SUM(montant), 0) AS total FROM charges WHERE cycle_id = ?',
    )
    .get(cycle.id).total;

  const coutPoulettes = cycle.nombre_poussins * (cycle.prix_poussin || 0);
  const coutTotal = charges + coutPoulettes;

  const unitePoids = parametrePoids?.unite || 'kg';
  const uniteAliment = parametreAliment?.unite || 'kg';

  // poidsVifTotal est exprime dans l'unite du parametre poids (kg ou g).
  // Pour le cout par kilo et l'indice de consommation on se ramene toujours
  // a des grandeurs pour 1 kg afin que les etiquettes "par kilo" restent
  // correctes quelle que soit l'unite choisie pour la saisie.
  const poidsVifTotalKg =
    poidsMoyen !== null
      ? effectifVivant * (unitePoids === 'g' ? poidsMoyen / 1000 : poidsMoyen)
      : 0;
  const alimentTotalKg =
    uniteAliment === 'g' ? alimentTotal / 1000 : alimentTotal;
  const indiceConsommation =
    alimentTotalKg > 0 && poidsVifTotalKg > 0
      ? alimentTotalKg / poidsVifTotalKg
      : null;
  const coutParKg = poidsVifTotalKg > 0 ? coutTotal / poidsVifTotalKg : null;

  // La reference (issues des tableaux de reference) est toujours en kg.
  // Si l'utilisateur saisit en grammes, on convertit la reference en grammes
  // pour que le calcul d'ecart et l'affichage soient coherence.
  let referencePoids = null;
  let ecartReference = null;
  if (parametrePoids && cycle.souche && dernierPoids) {
    const reference = db.prepare(
      `SELECT valeur FROM references_valeurs
       WHERE souche = ? AND jour = ? AND parametre_id = ?`,
    ).get(cycle.souche, dernierPoids.jour_cycle, parametrePoids.id);
    const valeurReferenceKg = reference ? toNumber(reference.valeur) : null;
    if (valeurReferenceKg !== null && valeurReferenceKg > 0) {
      referencePoids =
        unitePoids === 'g' ? valeurReferenceKg * 1000 : valeurReferenceKg;
      const poidsMoyenKg = unitePoids === 'g' ? poidsMoyen / 1000 : poidsMoyen;
      ecartReference =
        poidsMoyenKg > 0
          ? ((poidsMoyenKg - valeurReferenceKg) / valeurReferenceKg) * 100
          : null;
    }
  }

  const dernierReleve = db.prepare(
    'SELECT MAX(date) AS date FROM releves_journaliers WHERE cycle_id = ?',
  ).get(cycle.id).date;

  return {
    age_jours: ageJours,
    total_morts: totalMorts,
    effectif_vivant: effectifVivant,
    taux_mortalite: tauxMortalite,
    mortalite_alerte: tauxMortalite > (settings.seuil_mortalite_alerte ?? 5),
    poids_moyen: poidsMoyen,
    poids_reference: referencePoids,
    ecart_reference_pct: ecartReference,
    aliment_total: alimentTotal,
    indice_consommation: indiceConsommation,
    total_charges: charges,
    cout_poulettes: coutPoulettes,
    cout_total: coutTotal,
    cout_par_kg: coutParKg,
    dernier_releve: dernierReleve,
    poids_vif_total: poidsVifTotalKg,
    poids_moyen_unite: unitePoids,
  };
}

export function cycleAvecStats(cycle) {
  return { ...cycle, stats: getCycleStats(cycle) };
}
