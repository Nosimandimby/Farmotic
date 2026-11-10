import { Router } from 'express';
import { db, getSettings } from '../db.js';
import { cycleAvecStats } from '../stats.js';

const router = Router();

router.get('/dashboard', (req, res) => {
  const settings = getSettings();
  const cycles = db
    .prepare(
      `SELECT * FROM cycles
       ORDER BY CASE statut WHEN 'en_cours' THEN 0 ELSE 1 END, date_debut DESC`,
    )
    .all()
    .map(cycleAvecStats);

  const actifs = cycles.filter((c) => c.statut === 'en_cours');

  const totaux = {
    cycles_total: cycles.length,
    cycles_actifs: actifs.length,
    poussins_actifs: actifs.reduce((s, c) => s + c.nombre_poussins, 0),
    effectif_vivant: actifs.reduce((s, c) => s + c.stats.effectif_vivant, 0),
    total_morts: actifs.reduce((s, c) => s + c.stats.total_morts, 0),
    charges_totales: cycles.reduce((s, c) => s + c.stats.cout_total, 0),
    alertes: actifs.filter((c) => c.stats.mortalite_alerte).length,
    mortalite_moyenne: 0,
  };

  if (totaux.poussins_actifs > 0) {
    totaux.mortalite_moyenne = (totaux.total_morts / totaux.poussins_actifs) * 100;
  }


  const chargesParCategorie = db
    .prepare(
      `SELECT categorie, SUM(montant) AS montant FROM charges
       GROUP BY categorie ORDER BY montant DESC`,
    )
    .all();

  res.json({
    settings,
    cycles,
    actifs,
    totaux,
    charges_par_categorie: chargesParCategorie,
  });
});

export default router;
