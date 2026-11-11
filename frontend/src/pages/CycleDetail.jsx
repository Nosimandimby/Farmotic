import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';
import {
  Activity,
  ArrowLeft,
  Banknote,
  CheckCircle2,
  ClipboardList,
  Egg,
  Pencil,
  Plus,
  Receipt,
  RotateCcw,
  Scale,
  Trash2,
  TrendingDown,
  TrendingUp,
  Utensils,
  Wallet,
} from 'lucide-react';
import { api } from '../api.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { useToast } from '../components/Toast.jsx';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Loading,
  Modal,
  PageHeader,
  StatCard,
  Tabs,
} from '../components/ui.jsx';
import { FormulaireCycle } from './Cycles.jsx';
import VentesCycle from '../components/VentesCycle.jsx';
import {
  aujourdhuiISO,
  formatDate,
  formatMontant,
  formatNombre,
  formatPourcentage,
} from '../lib/format.js';

const COULEURS = ['#2f7049', '#63a97f', '#0ea5e9', '#f59e0b', '#8b5cf6', '#e11d48', '#14b8a6'];

const styleInfobulle = {
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  fontSize: 12,
};

function joursEntre(dateA, dateB) {
  const a = Date.parse(`${dateA}T00:00:00Z`);
  const b = Date.parse(`${dateB}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

// Exprime une référence dans l'unité du relevé (les références de poids peuvent
// être stockées en grammes ou en kilogrammes).
function normaliserReference(parametre, unitaire, referencePoidsEnGrammes) {
  if (parametre.nom !== 'poids') return { valeur: unitaire, equivalence: null };
  const grammes = referencePoidsEnGrammes ? unitaire : unitaire * 1000;
  return {
    valeur: parametre.unite === 'kg' ? grammes / 1000 : grammes,
    equivalence:
      parametre.unite === 'kg' && referencePoidsEnGrammes
        ? `${formatNombre(grammes, 0)} g`
        : null,
  };
}

function CarteGraphique({ title, subtitle, meta, children, vide, messageVide }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        {meta}
      </div>
      <div className="card-pad">
        {vide ? (
          <EmptyState icon={Activity} title="Pas encore de données" description={messageVide} />
        ) : (
          <div className="h-64">{children}</div>
        )}
      </div>
    </Card>
  );
}

function TarifPrixVenteMinimum({ stats, settings }) {
  const poidsJ45 =
    Number(settings?.poids_moyen_j45_kg) > 0 ? Number(settings.poids_moyen_j45_kg) : 2.5;
  const marge = Number(settings?.marge_cible) >= 0 ? Number(settings.marge_cible) : 20;
  const vivants = Number(stats?.effectif_vivant) || 0;
  const coutTotal = Number(stats?.cout_total) || 0;

  const prixRevientPoulet = vivants > 0 && coutTotal > 0 ? coutTotal / vivants : null;
  const prixRevientKg = prixRevientPoulet === null ? null : prixRevientPoulet / poidsJ45;
  const facteurMarge = 1 + marge / 100;
  const prixVentePoulet = prixRevientPoulet === null ? null : Math.round(prixRevientPoulet * facteurMarge);
  const prixVenteKg = prixRevientKg === null ? null : Math.round(prixRevientKg * facteurMarge);
  const poidsTotalKg = vivants > 0 ? Number((vivants * poidsJ45).toFixed(2)) : null;
  const caProjete =
    poidsTotalKg !== null && prixVenteKg !== null
      ? Math.round(poidsTotalKg * prixVenteKg)
      : null;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Prix de vente minimum</h2>
          <p className="text-xs text-slate-500">
            Prix à ne pas descendre pour couvrir les coûts et dégager la marge visée.
          </p>
        </div>
        <Badge tone="brand">Marge cible : {formatPourcentage(marge, 0)}</Badge>
      </div>
      <div className="card-pad">
        {prixVentePoulet === null ? (
          <EmptyState
            icon={Wallet}
            title="Prix non calculable"
            description="Enregistrez les charges du cycle (poussins, aliment, frais divers) pour obtenir le prix de revient et le prix de vente minimum."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Prix de revient
              </p>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {formatMontant(prixRevientPoulet, settings)}
                <span className="ml-1 text-xs font-medium text-slate-500">/ poulet</span>
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {formatMontant(prixRevientKg, settings)} / kg
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Prix de vente minimum
              </p>
              <p className="mt-1 text-lg font-bold text-brand-800">
                {formatMontant(prixVentePoulet, settings)}
                <span className="ml-1 text-xs font-medium text-slate-500">/ poulet</span>
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {formatMontant(prixVenteKg, settings)} / kg
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Poids vif projeté
              </p>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {formatNombre(poidsTotalKg, 1)}
                <span className="ml-1 text-xs font-medium text-slate-500">kg</span>
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {formatNombre(vivants, 0)} sujets × {formatNombre(poidsJ45, 2)} kg
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Chiffre d’affaires projeté
              </p>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {formatMontant(caProjete, settings)}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Bénéfice :{' '}
                {formatMontant(caProjete === null ? null : caProjete - coutTotal, settings)}
              </p>
            </div>
          </div>
        )}

        <p className="mt-4 text-xs text-slate-500">
          Calcul basé sur un poids moyen de {formatNombre(poidsJ45, 2)} kg à J45 et une marge de{' '}
          {formatPourcentage(marge, 0)} ·{' '}
          <Link to="/parametres" className="font-semibold text-brand-700 hover:text-brand-900">
            modifier ces valeurs
          </Link>
        </p>
      </div>
    </Card>
  );
}

const STATUTS_COMPARAISON = {
  au_dessus: { tone: 'success', label: 'Au-dessus du prévisionnel' },
  conforme: { tone: 'info', label: 'Conforme au prévisionnel' },
  sous_performance: { tone: 'danger', label: 'Sous le prévisionnel' },
  non_comparable: { tone: 'neutral', label: 'Non comparable' },
};

function ResultatReelVsPrevisionnel({ synthese, settings, onVoirVentes }) {
  const { reel, projection, ventes, comparaison } = synthese;
  const nombreVentes = ventes?.nombre_ventes ?? 0;
  const beneficeReel = reel?.benefice_reel ?? 0;
  const statut = STATUTS_COMPARAISON[comparaison?.statut] || null;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Résultat réel vs prévisionnel
          </h2>
          <p className="text-xs text-slate-500">
            Bénéfice des ventes enregistrées comparé à la projection à J45.
          </p>
        </div>
        {statut ? (
          <Badge tone={statut.tone}>{statut.label}</Badge>
        ) : (
          <Badge tone="neutral">Aucune vente</Badge>
        )}
      </div>
      <div className="card-pad space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Prévisionnel J45
            </p>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {formatMontant(projection?.ca_projete, settings)}
            </p>
            <p className="text-xs text-slate-500">Chiffre d’affaires projeté</p>
            <p className="mt-2 text-sm font-semibold text-slate-800">
              Bénéfice : {formatMontant(projection?.benefice_projete, settings)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Réel
            </p>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {formatMontant(reel?.chiffre_affaires, settings)}
            </p>
            <p className="text-xs text-slate-500">
              {formatNombre(ventes?.poids_total_vendu_kg, 1)} kg vendus ·{' '}
              {formatNombre(nombreVentes, 0)} vente(s)
            </p>
            <p
              className={`mt-2 text-sm font-semibold ${
                beneficeReel >= 0 ? 'text-emerald-700' : 'text-rose-600'
              }`}
            >
              Bénéfice : {formatMontant(reel?.benefice_reel, settings)}
              {reel?.marge_reelle_pct !== null && reel?.marge_reelle_pct !== undefined
                ? ` (${formatPourcentage(reel.marge_reelle_pct)})`
                : ''}
            </p>
          </div>
        </div>

        {comparaison && (
          <p className="text-sm text-slate-600">
            Écart de bénéfice :{' '}
            <span className="font-semibold text-slate-900">
              {formatMontant(comparaison.ecart_benefice, settings)}
            </span>
            {comparaison.ecart_benefice_pct !== null
              ? ` (${comparaison.ecart_benefice_pct >= 0 ? '+' : ''}${formatNombre(
                  comparaison.ecart_benefice_pct,
                  1,
                )} %)`
              : ''}
          </p>
        )}

        {nombreVentes === 0 ? (
          <EmptyState
            icon={Banknote}
            title="Aucune vente enregistrée"
            description="Saisissez vos ventes pour comparer le bénéfice réel à la projection."
            action={
              <Button icon={Banknote} onClick={onVoirVentes}>
                Saisir une vente
              </Button>
            }
          />
        ) : (
          <div className="flex justify-end">
            <Button variant="secondary" icon={TrendingUp} onClick={onVoirVentes}>
              Voir / gérer les ventes
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function CycleDetail() {
  const { id } = useParams();
  const { settings } = useSettings();
  const toast = useToast();
  const navigate = useNavigate();

  const [cycle, setCycle] = useState(null);
  const [parametres, setParametres] = useState([]);
  const [releves, setReleves] = useState([]);
  const [mortalites, setMortalites] = useState([]);
  const [charges, setCharges] = useState([]);
  const [synthese, setSynthese] = useState(null);
  const [series, setSeries] = useState({});
  const [seriesParametres, setSeriesParametres] = useState({});
  const [souches, setSouches] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [version, setVersion] = useState(0);
  const [onglet, setOnglet] = useState('synthese');

  const [modaleEdition, setModaleEdition] = useState(false);
  const [confirmationSuppression, setConfirmationSuppression] = useState(false);
  const [suppression, setSuppression] = useState(false);

  const [dateSaisie, setDateSaisie] = useState(aujourdhuiISO());
  const [valeursSaisies, setValeursSaisies] = useState({});
  const [commentaireSaisie, setCommentaireSaisie] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);

  const [formMortalite, setFormMortalite] = useState({
    date: aujourdhuiISO(),
    nombre_morts: 1,
    motif: '',
  });
  const [mortEdition, setMortEdition] = useState(null);

  const [formCharge, setFormCharge] = useState({
    date: aujourdhuiISO(),
    categorie: '',
    description: '',
    montant: '',
  });
  const [chargeEdition, setChargeEdition] = useState(null);

  const rafraichir = useCallback(() => setVersion((valeur) => valeur + 1), []);

  useEffect(() => {
    let actif = true;
    setChargement(true);

    Promise.all([
      api.get(`/cycles/${id}`),
      api.get('/parametres'),
      api.get(`/releves?cycle_id=${id}`),
      api.get(`/mortalites?cycle_id=${id}`),
      api.get(`/charges?cycle_id=${id}`),
      api.get('/references/souches'),
      api.get(`/cycles/${id}/synthese`),
    ])
      .then(async ([cycleData, parametresData, relevesData, mortalitesData, chargesData, souchesData, syntheseData]) => {
        const parametrePoids = parametresData.find((p) => p.nom === 'poids');
        const parametreAliment = parametresData.find((p) => p.nom === 'aliment');

        // Les séries portent la référence du jour : on les charge pour tous les
        // paramètres actifs (plus poids et aliment) afin d'afficher la valeur de
        // référence à côté de chaque saisie.
        const parametresASerie = parametresData.filter(
          (p) => p.actif || p.nom === 'poids' || p.nom === 'aliment',
        );
        const seriesListe = await Promise.all(
          parametresASerie.map((p) =>
            api.get(`/cycles/${id}/serie?parametre_id=${p.id}`).catch(() => null),
          ),
        );
        const parParametre = {};
        for (const serie of seriesListe) {
          if (serie?.parametre) parParametre[serie.parametre.id] = serie;
        }

        if (!actif) return;
        setCycle(cycleData);
        setParametres(parametresData);
        setReleves(relevesData);
        setMortalites(mortalitesData);
        setCharges(chargesData);
        setSouches(souchesData);
        setSynthese(syntheseData);
        setSeriesParametres(parParametre);
        setSeries({
          poids: parParametre[parametrePoids?.id] ?? null,
          aliment: parParametre[parametreAliment?.id] ?? null,
        });
        setErreur('');
      })
      .catch((error) => {
        if (actif) setErreur(error.message);
      })
      .finally(() => {
        if (actif) setChargement(false);
      });

    return () => {
      actif = false;
    };
  }, [id, version]);

  useEffect(() => {
    const duJour = releves.filter((releve) => releve.date === dateSaisie);
    const valeurs = {};
    duJour.forEach((releve) => {
      valeurs[releve.parametre_id] = releve.valeur;
    });
    setValeursSaisies(valeurs);
    setCommentaireSaisie(duJour.find((releve) => releve.commentaire)?.commentaire || '');
  }, [dateSaisie, releves]);

  const parametresActifs = useMemo(
    () => parametres.filter((parametre) => parametre.actif),
    [parametres],
  );

  const parametresTableau = useMemo(() => {
    const utilises = new Set(releves.map((releve) => releve.parametre_id));
    return parametres.filter((parametre) => utilises.has(parametre.id) || parametre.actif);
  }, [parametres, releves]);

  // Les références de poids peuvent être exprimées en grammes ou en kilos selon
  // la saisie faite dans « Références ». On déduit l'unité de la série : un
  // poulet de chair ne pèse jamais 100 kg, donc une référence > 100 est en g.
  const referencePoidsEnGrammes = useMemo(() => {
    const parametrePoids = parametres.find((parametre) => parametre.nom === 'poids');
    const points = parametrePoids
      ? seriesParametres[parametrePoids.id]?.points || []
      : [];
    const maximum = points.reduce(
      (valeurMax, point) =>
        Number.isFinite(point.reference)
          ? Math.max(valeurMax, Number(point.reference))
          : valeurMax,
      0,
    );
    return maximum > 100;
  }, [parametres, seriesParametres]);

  // Référence de chaque paramètre pour la date saisie, exprimée dans l'unité
  // du relevé. Pour l'aliment, la référence est une quantité par sujet : la
  // référence du jour est donc « référence unitaire × nombre de poulets vivants ».
  const referencesDuJour = useMemo(() => {
    if (!cycle || !dateSaisie) return {};
    const jour = joursEntre(cycle.date_debut, dateSaisie) + 1;
    const mortsCumules = mortalites
      .filter((ligne) => ligne.jour_cycle <= jour)
      .reduce((total, ligne) => total + (Number(ligne.nombre_morts) || 0), 0);
    const vivants = Math.max(0, (Number(cycle.nombre_poussins) || 0) - mortsCumules);

    const references = {};
    for (const parametre of parametres) {
      const points = seriesParametres[parametre.id]?.points || [];
      const point = points.find((entree) => entree.jour === jour);
      const unitaire =
        point && Number.isFinite(point.reference) ? Number(point.reference) : null;
      if (unitaire === null) continue;

      const estAliment = parametre.nom === 'aliment';
      const { valeur: valeurAffichee, equivalence } = normaliserReference(
        parametre,
        unitaire,
        referencePoidsEnGrammes,
      );

      references[parametre.id] = {
        unitaire: valeurAffichee,
        vivants: estAliment ? vivants : null,
        total: estAliment ? valeurAffichee * vivants : null,
        unite: parametre.unite || '',
        equivalence,
      };
    }
    return references;
  }, [
    cycle,
    dateSaisie,
    mortalites,
    parametres,
    seriesParametres,
    referencePoidsEnGrammes,
  ]);

  // Références jour par jour pour colorer l'historique des relevés.
  const referencesParJour = useMemo(() => {
    const poussins = Number(cycle?.nombre_poussins) || 0;
    const mortsParJour = new Map();
    for (const ligne of mortalites) {
      const jour = ligne.jour_cycle;
      mortsParJour.set(
        jour,
        (mortsParJour.get(jour) || 0) + (Number(ligne.nombre_morts) || 0),
      );
    }
    const mortsCumules = new Map();
    let cumul = 0;
    for (const jour of [...mortsParJour.keys()].sort((a, b) => a - b)) {
      cumul += mortsParJour.get(jour);
      mortsCumules.set(jour, cumul);
    }
    const vivantsAuJour = (jour) => {
      let morts = 0;
      for (const [jourMort, total] of mortsCumules) {
        if (jourMort > jour) break;
        morts = total;
      }
      return Math.max(0, poussins - morts);
    };

    const references = {};
    for (const parametre of parametres) {
      const points = seriesParametres[parametre.id]?.points || [];
      const parJour = new Map();
      for (const point of points) {
        if (!Number.isFinite(point.reference)) continue;
        const { valeur } = normaliserReference(
          parametre,
          Number(point.reference),
          referencePoidsEnGrammes,
        );
        parJour.set(
          point.jour,
          parametre.nom === 'aliment' ? valeur * vivantsAuJour(point.jour) : valeur,
        );
      }
      references[parametre.id] = parJour;
    }
    return references;
  }, [cycle, mortalites, parametres, seriesParametres, referencePoidsEnGrammes]);

  const joursReleves = useMemo(() => {
    const map = new Map();
    for (const releve of releves) {
      const entree = map.get(releve.date) || {
        date: releve.date,
        jour: releve.jour_cycle,
        valeurs: {},
        commentaire: null,
      };
      entree.valeurs[releve.parametre_id] = releve.valeur;
      if (releve.commentaire) entree.commentaire = releve.commentaire;
      map.set(releve.date, entree);
    }
    return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [releves]);

  const donneesMortalite = useMemo(() => {
    const triees = [...mortalites].sort((a, b) => a.jour_cycle - b.jour_cycle);
    let cumul = 0;
    return triees.map((ligne) => {
      cumul += ligne.nombre_morts;
      return {
        jour: ligne.jour_cycle,
        cumul,
        morts: ligne.nombre_morts,
      };
    });
  }, [mortalites]);

  const donneesAliment = useMemo(() => {
    const points = series.aliment?.points || [];
    let cumulReel = 0;
    let cumulReference = 0;
    return points
      .map((point) => {
        if (Number.isFinite(point.reel)) cumulReel += point.reel;
        if (Number.isFinite(point.reference)) cumulReference += point.reference;
        return {
          jour: point.jour,
          reel: Number.isFinite(point.reel) ? Number(cumulReel.toFixed(2)) : null,
          reference: Number.isFinite(point.reference) ? Number(cumulReference.toFixed(2)) : null,
        };
      })
      .filter((point) => point.reel !== null || point.reference !== null);
  }, [series.aliment]);

  const chargesParCategorie = useMemo(() => {
    const map = new Map();
    for (const charge of charges) {
      map.set(charge.categorie, (map.get(charge.categorie) || 0) + charge.montant);
    }
    return [...map.entries()]
      .map(([nom, valeur]) => ({ nom, valeur }))
      .sort((a, b) => b.valeur - a.valeur);
  }, [charges]);

  const enregistrerJour = async (event) => {
    event.preventDefault();
    setEnregistrement(true);
    try {
      await api.post('/releves/jour', {
        cycle_id: Number(id),
        date: dateSaisie,
        valeurs: parametresActifs.map((parametre) => ({
          parametre_id: parametre.id,
          valeur: valeursSaisies[parametre.id] ?? '',
          commentaire: commentaireSaisie,
        })),
      });
      rafraichir();
      toast('Relevés du jour enregistrés.');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setEnregistrement(false);
    }
  };

  const supprimerJour = async (date) => {
    try {
      await api.del(`/releves/jour?cycle_id=${id}&date=${date}`);
      rafraichir();
      toast('Journée de relevés supprimée.');
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  const soumettreMortalite = async (event) => {
    event.preventDefault();
    try {
      const charge = {
        cycle_id: Number(id),
        date: formMortalite.date,
        nombre_morts: Number(formMortalite.nombre_morts),
        motif: formMortalite.motif,
      };
      if (mortEdition) {
        await api.put(`/mortalites/${mortEdition}`, charge);
        toast('Mortalité mise à jour.');
      } else {
        await api.post('/mortalites', charge);
        toast('Mortalité enregistrée.');
      }
      setMortEdition(null);
      setFormMortalite({ date: aujourdhuiISO(), nombre_morts: 1, motif: '' });
      rafraichir();
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  const modifierMortalite = (ligne) => {
    setMortEdition(ligne.id);
    setFormMortalite({
      date: ligne.date,
      nombre_morts: ligne.nombre_morts,
      motif: ligne.motif || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const supprimerMortalite = async (ligne) => {
    try {
      await api.del(`/mortalites/${ligne.id}`);
      rafraichir();
      toast('Enregistrement supprimé.');
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  const soumettreCharge = async (event) => {
    event.preventDefault();
    try {
      const charge = {
        cycle_id: Number(id),
        date: formCharge.date,
        categorie: formCharge.categorie,
        description: formCharge.description,
        montant: Number(formCharge.montant),
      };
      if (chargeEdition) {
        await api.put(`/charges/${chargeEdition}`, charge);
        toast('Charge mise à jour.');
      } else {
        await api.post('/charges', charge);
        toast('Charge enregistrée.');
      }
      setChargeEdition(null);
      setFormCharge({ date: aujourdhuiISO(), categorie: '', description: '', montant: '' });
      rafraichir();
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  const modifierCharge = (charge) => {
    setChargeEdition(charge.id);
    setFormCharge({
      date: charge.date,
      categorie: charge.categorie,
      description: charge.description || '',
      montant: charge.montant,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const supprimerCharge = async (charge) => {
    try {
      await api.del(`/charges/${charge.id}`);
      rafraichir();
      toast('Charge supprimée.');
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  const basculerStatut = async () => {
    try {
      await api.put(`/cycles/${id}`, {
        statut: cycle.statut === 'en_cours' ? 'termine' : 'en_cours',
      });
      rafraichir();
      toast(cycle.statut === 'en_cours' ? 'Cycle terminé.' : 'Cycle réouvert.');
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  const supprimerCycle = async () => {
    setSuppression(true);
    try {
      await api.del(`/cycles/${id}`);
      toast('Cycle supprimé.');
      navigate('/cycles', { replace: true });
    } catch (error) {
      toast(error.message, 'error');
      setSuppression(false);
    }
  };

  if (chargement) return <Loading />;
  if (erreur || !cycle) {
    return (
      <div>
        <Link
          to="/cycles"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={15} /> Retour aux cycles
        </Link>
        <Alert tone="danger" title="Cycle indisponible">
          {erreur || 'Ce cycle est introuvable.'}
        </Alert>
      </div>
    );
  }

  const stats = cycle.stats;
  const unitePoids = series.poids?.parametre?.unite || 'kg';
  const uniteAliment = series.aliment?.parametre?.unite || 'kg';
  const jourSaisie = joursEntre(cycle.date_debut, dateSaisie) + 1;

  return (
    <div>
      <Link
        to="/cycles"
        className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-800"
      >
        <ArrowLeft size={15} /> Retour aux cycles
      </Link>

      <PageHeader
        eyebrow="Cycle d’élevage"
        title={cycle.nom}
        subtitle={`Démarrage le ${formatDate(cycle.date_debut)} · Jour ${stats.age_jours} · ${formatNombre(cycle.nombre_poussins, 0)} poussins`}
        actions={
          <>
            <Badge tone={cycle.statut === 'en_cours' ? 'success' : 'neutral'}>
              {cycle.statut === 'en_cours' ? 'En cours' : 'Terminé'}
            </Badge>
            {cycle.souche && <Badge tone="brand">{cycle.souche}</Badge>}
            <Button variant="secondary" icon={Pencil} onClick={() => setModaleEdition(true)}>
              Modifier
            </Button>
            <Button variant="secondary" icon={cycle.statut === 'en_cours' ? CheckCircle2 : RotateCcw} onClick={basculerStatut}>
              {cycle.statut === 'en_cours' ? 'Terminer' : 'Réouvrir'}
            </Button>
            <Button
              variant="ghost"
              className="text-rose-600 hover:bg-rose-50"
              icon={Trash2}
              onClick={() => setConfirmationSuppression(true)}
              aria-label="Supprimer le cycle"
            />
          </>
        }
      />

      {stats.mortalite_alerte && (
        <div className="mb-5">
          <Alert tone="danger" title="Seuil de mortalité dépassé">
            La mortalité atteint {formatPourcentage(stats.taux_mortalite)} pour un seuil fixé à{' '}
            {formatPourcentage(settings.seuil_mortalite_alerte, 0)}. Contrôlez la ventilation,
            l’eau et l’état sanitaire de la bande.
          </Alert>
        </div>
      )}

      <Tabs
        items={[
          { value: 'synthese', label: 'Synthèse', icon: Activity },
          { value: 'releves', label: 'Relevés quotidiens', icon: ClipboardList },
          { value: 'mortalite', label: 'Mortalité', icon: TrendingDown },
          { value: 'charges', label: 'Charges', icon: Receipt },
          { value: 'ventes', label: 'Ventes', icon: Banknote },
        ]}
        value={onglet}
        onChange={setOnglet}
      />

      {onglet === 'synthese' && (
        <div className="mt-5 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Effectif vivant"
              value={formatNombre(stats.effectif_vivant, 0)}
              unite="sujets"
              hint={`${formatNombre(stats.total_morts, 0)} morts cumulés`}
              icon={Egg}
            />
            <StatCard
              label="Taux de mortalité"
              value={formatPourcentage(stats.taux_mortalite)}
              hint={`Seuil d’alerte : ${formatPourcentage(settings.seuil_mortalite_alerte, 0)}`}
              icon={TrendingDown}
              tone={stats.mortalite_alerte ? 'rose' : 'amber'}
            />
            <StatCard
              label="Poids moyen"
              value={stats.poids_moyen !== null ? formatNombre(stats.poids_moyen, stats.poids_moyen_unite === 'g' ? 1 : 3) : '—'}
              unite={stats.poids_moyen !== null ? stats.poids_moyen_unite : undefined}
              hint={
                stats.ecart_reference_pct !== null
                  ? `Référence : ${formatNombre(stats.poids_reference, stats.poids_moyen_unite === 'g' ? 1 : 3)} ${stats.poids_moyen_unite} (${stats.ecart_reference_pct >= 0 ? '+' : ''}${formatNombre(stats.ecart_reference_pct, 1)} %)`
                  : 'Aucune référence comparable'
              }
              icon={Scale}
              tone="sky"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Aliment consommé"
              value={formatNombre(stats.aliment_total, 2)}
              unite={uniteAliment}
              hint="Cumul des relevés journaliers"
              icon={Utensils}
            />
            <StatCard
              label="Indice de consommation"
              value={stats.indice_consommation !== null ? formatNombre(stats.indice_consommation, 2) : '—'}
              hint="Aliment total / poids vif estimé"
              icon={Activity}
              tone="sky"
            />
            <StatCard
              label="Coût total"
              value={formatMontant(stats.cout_total, settings)}
              hint={`Dont poussins : ${formatMontant(stats.cout_poulettes, settings)}`}
              icon={Wallet}
              tone="amber"
            />
            <StatCard
              label="Coût par kg vif"
              value={stats.cout_par_kg !== null ? formatMontant(stats.cout_par_kg, settings) : '—'}
              hint="Coût total / poids vif estimé"
              icon={Receipt}
              tone="violet"
            />
          </div>

          <TarifPrixVenteMinimum cycleId={id} stats={stats} charges={charges} settings={settings} onRafraichir={() => rafraichir()} />

          {synthese && (
            <ResultatReelVsPrevisionnel
              synthese={synthese}
              settings={settings}
              onVoirVentes={() => setOnglet('ventes')}
            />
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <CarteGraphique
              title="Croissance : réel vs référence"
              subtitle={`Poids moyen par jour${cycle.souche ? ` · ${cycle.souche}` : ''}`}
              vide={!series.poids?.points?.length}
              messageVide="Saisissez un poids moyen dans les relevés pour tracer la courbe."
              meta={
                series.poids?.parametre && (
                  <Badge tone="brand">Unité : {unitePoids}</Badge>
                )
              }
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series.poids?.points || []} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f0" vertical={false} />
                  <XAxis dataKey="jour" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={styleInfobulle}
                    labelFormatter={(jour) => `Jour ${jour}`}
                    formatter={(valeur, nom) => [
                      `${formatNombre(valeur, 3)} ${unitePoids}`,
                      nom === 'reel' ? 'Réel' : 'Référence',
                    ]}
                  />
                  <Legend
                    formatter={(valeur) => (valeur === 'reel' ? 'Réel' : 'Référence')}
                    iconType="line"
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="reference"
                    stroke="#94a3b8"
                    strokeDasharray="5 4"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="reel"
                    stroke="#2f7049"
                    strokeWidth={2.5}
                    dot={{ r: 2.5, strokeWidth: 0, fill: '#2f7049' }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </CarteGraphique>

            <CarteGraphique
              title="Aliment cumulé"
              subtitle="Consommation réelle comparée à la référence"
              vide={donneesAliment.length === 0}
              messageVide="Renseignez l’aliment consommé chaque jour pour suivre le cumul."
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={donneesAliment} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f0" vertical={false} />
                  <XAxis dataKey="jour" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={styleInfobulle}
                    labelFormatter={(jour) => `Jour ${jour}`}
                    formatter={(valeur, nom) => [
                      `${formatNombre(valeur, 2)} ${uniteAliment}`,
                      nom === 'reel' ? 'Réel' : 'Référence',
                    ]}
                  />
                  <Legend
                    formatter={(valeur) => (valeur === 'reel' ? 'Réel' : 'Référence')}
                    iconType="line"
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  <Line type="monotone" dataKey="reference" stroke="#94a3b8" strokeDasharray="5 4" strokeWidth={2} dot={false} connectNulls />
                  <Line type="monotone" dataKey="reel" stroke="#0ea5e9" strokeWidth={2.5} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </CarteGraphique>

            <CarteGraphique
              title="Mortalité cumulée"
              subtitle="Nombre de morts cumulés par jour du cycle"
              vide={donneesMortalite.length === 0}
              messageVide="Aucune mortalité enregistrée pour ce cycle."
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={donneesMortalite} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="mortaliteGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#e11d48" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#e11d48" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f0" vertical={false} />
                  <XAxis dataKey="jour" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={styleInfobulle}
                    labelFormatter={(jour) => `Jour ${jour}`}
                    formatter={(valeur, nom) => [valeur, nom === 'cumul' ? 'Cumul' : 'Jour']}
                  />
                  <Area type="monotone" dataKey="cumul" stroke="#e11d48" strokeWidth={2.5} fill="url(#mortaliteGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </CarteGraphique>

            <Card>
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-base font-semibold text-slate-900">Répartition des charges</h2>
                <p className="text-xs text-slate-500">
                  Total : {formatMontant(stats.cout_total, settings)} (poussins inclus)
                </p>
              </div>
              <div className="card-pad">
                {chargesParCategorie.length === 0 ? (
                  <EmptyState
                    icon={Wallet}
                    title="Aucune charge enregistrée"
                    description="Ajoutez vos achats d’aliment, frais vétérinaires et autres dépenses dans l’onglet Charges."
                    action={
                      <Button variant="secondary" size="sm" onClick={() => setOnglet('charges')}>
                        Saisir une charge
                      </Button>
                    }
                  />
                ) : (
                  <div className="grid items-center gap-4 sm:grid-cols-2">
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={chargesParCategorie}
                            dataKey="valeur"
                            nameKey="nom"
                            innerRadius={45}
                            outerRadius={76}
                            paddingAngle={2}
                            strokeWidth={0}
                          >
                            {chargesParCategorie.map((entree, index) => (
                              <Cell key={entree.nom} fill={COULEURS[index % COULEURS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(valeur) => formatMontant(valeur, settings)} contentStyle={styleInfobulle} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <ul className="space-y-2 text-sm">
                      {chargesParCategorie.slice(0, 7).map((entree, index) => (
                        <li key={entree.nom} className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2 text-slate-600">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: COULEURS[index % COULEURS.length] }}
                            />
                            <span className="truncate">{entree.nom}</span>
                          </span>
                          <span className="shrink-0 font-semibold text-slate-800">
                            {formatMontant(entree.valeur, settings)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {onglet === 'releves' && (
        <div className="mt-5 space-y-5">
          <Card>
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">Saisie des relevés</h2>
              <p className="text-xs text-slate-500">
                Enregistrez les mesures d’une journée. Les valeurs existantes sont chargées
                automatiquement.
              </p>
            </div>
            <form onSubmit={enregistrerJour} className="card-pad space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Date du relevé" htmlFor="date-releve">
                  <input
                    id="date-releve"
                    type="date"
                    className="input"
                    value={dateSaisie}
                    onChange={(event) => setDateSaisie(event.target.value)}
                    required
                  />
                </Field>
                <div className="flex items-end">
                  <p className="rounded-xl bg-brand-50 px-3.5 py-2.5 text-sm font-semibold text-brand-800">
                    {jourSaisie >= 1 ? `Jour ${jourSaisie} du cycle` : 'Date hors cycle'}
                  </p>
                </div>
              </div>

              {parametresActifs.length === 0 ? (
                <Alert tone="info">
                  Aucun paramètre de suivi actif. Activez au moins un paramètre dans
                  « Paramètres » pour saisir des relevés.
                </Alert>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {parametresActifs.map((parametre) => {
                    const reference = referencesDuJour[parametre.id];
                    const valeurReference =
                      reference?.total !== null && reference?.total !== undefined
                        ? reference.total
                        : reference?.unitaire ?? null;
                    const saisie = valeursSaisies[parametre.id];
                    const nombreSaisi =
                      saisie !== undefined && saisie !== '' && Number.isFinite(Number(saisie))
                        ? Number(saisie)
                        : null;
                    const ecart =
                      nombreSaisi !== null && valeurReference
                        ? ((nombreSaisi - valeurReference) / valeurReference) * 100
                        : null;

                    return (
                    <div
                      key={parametre.id}
                      className="rounded-xl border border-slate-200 bg-white p-3.5"
                    >
                      <label className="label" htmlFor={`param-${parametre.id}`}>
                        {parametre.libelle}
                      </label>
                      <div className="flex flex-wrap items-start gap-2">
                      <div className="relative min-w-[120px] flex-1">
                        <input
                          id={`param-${parametre.id}`}
                          type={parametre.type_valeur === 'nombre' ? 'number' : 'text'}
                          step="any"
                          inputMode={parametre.type_valeur === 'nombre' ? 'decimal' : 'text'}
                          value={valeursSaisies[parametre.id] ?? ''}
                          onChange={(event) =>
                            setValeursSaisies((actuel) => ({
                              ...actuel,
                              [parametre.id]: event.target.value,
                            }))
                          }
                          placeholder={parametre.type_valeur === 'nombre' ? '0' : 'Texte libre'}
                          className={`input ${
                            parametre.unite ? 'pr-12' : ''
                          }`}
                        />
                        {parametre.unite && (
                          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-slate-400">
                            {parametre.unite}
                          </span>
                        )}
                      </div>

                      <div
                        className={`min-w-[140px] flex-1 rounded-lg px-2.5 py-1.5 text-xs ${
                          reference
                            ? 'bg-brand-50/80 text-brand-800'
                            : 'bg-slate-50 text-slate-400'
                        }`}
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-700">
                          Référence
                        </p>
                        {reference ? (
                          <>
                            <p className="font-semibold text-brand-900">
                              {formatNombre(
                                reference.total !== null ? reference.total : reference.unitaire,
                                3,
                              )}{' '}
                              {reference.unite}
                              {reference.equivalence ? ` (${reference.equivalence})` : ''}
                            </p>
                            {reference.total !== null && (
                              <p className="text-[11px] text-brand-700">
                                {formatNombre(reference.unitaire, 3)} {reference.unite}/sujet ×{' '}
                                {formatNombre(reference.vivants, 0)} sujets
                              </p>
                            )}
                            {ecart !== null && (
                              <p
                                className={`text-[11px] font-semibold ${
                                  ecart >= 0 ? 'text-emerald-700' : 'text-rose-600'
                                }`}
                              >
                                Écart : {ecart >= 0 ? '+' : ''}
                                {formatNombre(ecart, 1)} %
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-[11px]">Aucune référence pour ce jour</p>
                        )}
                      </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}

              <Field label="Commentaire du jour" htmlFor="commentaire">
                <textarea
                  id="commentaire"
                  className="input min-h-[76px] resize-y"
                  value={commentaireSaisie}
                  onChange={(event) => setCommentaireSaisie(event.target.value)}
                  placeholder="Comportement du troupeau, traitement, incident…"
                />
              </Field>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  Laissez un champ vide pour ne pas enregistrer ce paramètre.
                </p>
                <Button type="submit" disabled={enregistrement} icon={Plus}>
                  {enregistrement ? 'Enregistrement…' : 'Enregistrer les relevés'}
                </Button>
              </div>
            </form>
          </Card>

          <Card>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Historique des relevés</h2>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span>{joursReleves.length} journée(s) enregistrée(s)</span>
                  <span className="font-medium text-emerald-600">≥ supérieur à la référence</span>
                  <span className="font-medium text-rose-600">≤ inférieur à la référence</span>
                  <span className="font-medium text-slate-500">conforme en noir</span>
                </p>
              </div>
            </div>
            {joursReleves.length === 0 ? (
              <div className="card-pad">
                <EmptyState
                  icon={ClipboardList}
                  title="Aucun relevé enregistré"
                  description="Commencez par la saisie du jour ci-dessus."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-slate-50/70">
                    <tr>
                      <th className="th">Date</th>
                      <th className="th">Jour</th>
                      {parametresTableau.map((parametre) => (
                        <th key={parametre.id} className="th">
                          {parametre.libelle}
                          {parametre.unite ? ` (${parametre.unite})` : ''}
                        </th>
                      ))}
                      <th className="th text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {joursReleves.map((jour) => (
                      <tr key={jour.date} className="table-row">
                        <td className="td whitespace-nowrap font-medium text-slate-800">
                          {formatDate(jour.date)}
                        </td>
                        <td className="td whitespace-nowrap text-slate-500">J{jour.jour}</td>
                        {parametresTableau.map((parametre) => {
                          const valeur = jour.valeurs[parametre.id];
                          const nombre = Number(String(valeur ?? '').replace(',', '.'));
                          const reference =
                            referencesParJour[parametre.id]?.get(jour.jour) ?? null;
                          const comparable =
                            valeur !== undefined &&
                            valeur !== '' &&
                            Number.isFinite(nombre) &&
                            Number.isFinite(reference) &&
                            reference !== 0;
                          let classe = '';
                          if (comparable) {
                            const ecart = (nombre - reference) / reference;
                            if (ecart > 0.005) classe = 'font-semibold text-emerald-600';
                            else if (ecart < -0.005) classe = 'font-semibold text-rose-600';
                            else classe = 'text-slate-800';
                          }
                          return (
                            <td
                              key={parametre.id}
                              className={`td whitespace-nowrap ${classe}`}
                              title={
                                Number.isFinite(reference)
                                  ? `Référence : ${formatNombre(reference, 3)} ${parametre.unite || ''}`
                                  : undefined
                              }
                            >
                              {valeur ?? '—'}
                            </td>
                          );
                        })}
                        <td className="td">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              className="btn-icon"
                              title="Modifier cette journée"
                              onClick={() => {
                                setDateSaisie(jour.date);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              type="button"
                              className="btn-icon hover:text-rose-600"
                              title="Supprimer cette journée"
                              onClick={() => supprimerJour(jour.date)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {onglet === 'mortalite' && (
        <div className="mt-5 grid gap-5 lg:grid-cols-[360px_1fr]">
          <Card>
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">
                {mortEdition ? 'Modifier la mortalité' : 'Enregistrer une mortalité'}
              </h2>
              <p className="text-xs text-slate-500">Total actuel : {stats.total_morts} morts</p>
            </div>
            <form onSubmit={soumettreMortalite} className="card-pad space-y-4">
              <Field label="Date" htmlFor="mort-date">
                <input
                  id="mort-date"
                  type="date"
                  className="input"
                  value={formMortalite.date}
                  onChange={(event) =>
                    setFormMortalite((actuel) => ({ ...actuel, date: event.target.value }))
                  }
                  required
                />
              </Field>
              <Field label="Nombre de morts" htmlFor="mort-nombre">
                <input
                  id="mort-nombre"
                  type="number"
                  min="0"
                  step="1"
                  className="input"
                  value={formMortalite.nombre_morts}
                  onChange={(event) =>
                    setFormMortalite((actuel) => ({
                      ...actuel,
                      nombre_morts: event.target.value,
                    }))
                  }
                  required
                />
              </Field>
              <Field label="Motif / observation" htmlFor="mort-motif">
                <input
                  id="mort-motif"
                  className="input"
                  value={formMortalite.motif}
                  onChange={(event) =>
                    setFormMortalite((actuel) => ({ ...actuel, motif: event.target.value }))
                  }
                  placeholder="Chaleur, maladie, écrasement…"
                />
              </Field>
              <div className="flex gap-2">
                <Button type="submit" className="flex-1" icon={mortEdition ? Pencil : Plus}>
                  {mortEdition ? 'Mettre à jour' : 'Ajouter'}
                </Button>
                {mortEdition && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setMortEdition(null);
                      setFormMortalite({ date: aujourdhuiISO(), nombre_morts: 1, motif: '' });
                    }}
                  >
                    Annuler
                  </Button>
                )}
              </div>
            </form>
          </Card>

          <Card>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">Historique</h2>
              <Badge tone="danger">{formatPourcentage(stats.taux_mortalite)} de mortalité</Badge>
            </div>
            {mortalites.length === 0 ? (
              <div className="card-pad">
                <EmptyState
                  icon={TrendingDown}
                  title="Aucune mortalité enregistrée"
                  description="Les pertes saisies ici alimentent automatiquement le taux de mortalité."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-slate-50/70">
                    <tr>
                      <th className="th">Date</th>
                      <th className="th">Jour</th>
                      <th className="th">Morts</th>
                      <th className="th">Motif</th>
                      <th className="th text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...mortalites]
                      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
                      .map((ligne) => (
                        <tr key={ligne.id} className="table-row">
                          <td className="td whitespace-nowrap font-medium text-slate-800">
                            {formatDate(ligne.date)}
                          </td>
                          <td className="td text-slate-500">J{ligne.jour_cycle}</td>
                          <td className="td">
                            <span className="font-semibold text-rose-600">
                              {ligne.nombre_morts}
                            </span>
                          </td>
                          <td className="td text-slate-600">{ligne.motif || '—'}</td>
                          <td className="td">
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                className="btn-icon"
                                title="Modifier"
                                onClick={() => modifierMortalite(ligne)}
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                type="button"
                                className="btn-icon hover:text-rose-600"
                                title="Supprimer"
                                onClick={() => supprimerMortalite(ligne)}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {onglet === 'charges' && (
        <div className="mt-5 grid gap-5 lg:grid-cols-[360px_1fr]">
          <Card>
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">
                {chargeEdition ? 'Modifier la charge' : 'Ajouter une charge'}
              </h2>
              <p className="text-xs text-slate-500">
                Total charges : {formatMontant(stats.total_charges, settings)}
              </p>
            </div>
            <form onSubmit={soumettreCharge} className="card-pad space-y-4">
              <Field label="Date" htmlFor="charge-date">
                <input
                  id="charge-date"
                  type="date"
                  className="input"
                  value={formCharge.date}
                  onChange={(event) =>
                    setFormCharge((actuel) => ({ ...actuel, date: event.target.value }))
                  }
                  required
                />
              </Field>
              <Field label="Catégorie" htmlFor="charge-categorie">
                <input
                  id="charge-categorie"
                  className="input"
                  list="categories-charges"
                  value={formCharge.categorie}
                  onChange={(event) =>
                    setFormCharge((actuel) => ({ ...actuel, categorie: event.target.value }))
                  }
                  placeholder="Aliment"
                  required
                />
                <datalist id="categories-charges">
                  {['Aliment', 'Poussins', 'Vétérinaire', 'Litière', 'Eau et électricité', 'Main d’œuvre', 'Matériel', 'Transport', 'Autre'].map(
                    (categorie) => (
                      <option key={categorie} value={categorie} />
                    ),
                  )}
                </datalist>
              </Field>
              <Field label="Montant" htmlFor="charge-montant" hint={`En ${settings.devise}`}>
                <div className="relative">
                  <input
                    id="charge-montant"
                    type="number"
                    min="0"
                    step="any"
                    className="input pr-10"
                    value={formCharge.montant}
                    onChange={(event) =>
                      setFormCharge((actuel) => ({ ...actuel, montant: event.target.value }))
                    }
                    placeholder="0"
                    required
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-slate-400">
                    {settings.symbole_devise}
                  </span>
                </div>
              </Field>
              <Field label="Description" htmlFor="charge-description">
                <input
                  id="charge-description"
                  className="input"
                  value={formCharge.description}
                  onChange={(event) =>
                    setFormCharge((actuel) => ({ ...actuel, description: event.target.value }))
                  }
                  placeholder="Provende démarrage, 10 sacs…"
                />
              </Field>
              <div className="flex gap-2">
                <Button type="submit" className="flex-1" icon={chargeEdition ? Pencil : Plus}>
                  {chargeEdition ? 'Mettre à jour' : 'Ajouter la charge'}
                </Button>
                {chargeEdition && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setChargeEdition(null);
                      setFormCharge({
                        date: aujourdhuiISO(),
                        categorie: '',
                        description: '',
                        montant: '',
                      });
                    }}
                  >
                    Annuler
                  </Button>
                )}
              </div>
            </form>
          </Card>

          <Card>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">Détail des charges</h2>
              <Badge tone="brand">{charges.length} ligne(s)</Badge>
            </div>
            {charges.length === 0 ? (
              <div className="card-pad">
                <EmptyState
                  icon={Receipt}
                  title="Aucune charge enregistrée"
                  description="Ajoutez vos achats pour calculer le coût de production et le coût par kilo."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead className="bg-slate-50/70">
                    <tr>
                      <th className="th">Date</th>
                      <th className="th">Catégorie</th>
                      <th className="th">Description</th>
                      <th className="th text-right">Montant</th>
                      <th className="th text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {charges.map((charge) => (
                      <tr key={charge.id} className="table-row">
                        <td className="td whitespace-nowrap font-medium text-slate-800">
                          {formatDate(charge.date)}
                        </td>
                        <td className="td">
                          <Badge tone="brand">{charge.categorie}</Badge>
                        </td>
                        <td className="td text-slate-600">{charge.description || '—'}</td>
                        <td className="td text-right font-semibold text-slate-800">
                          {formatMontant(charge.montant, settings)}
                        </td>
                        <td className="td">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              className="btn-icon"
                              title="Modifier"
                              onClick={() => modifierCharge(charge)}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              type="button"
                              className="btn-icon hover:text-rose-600"
                              title="Supprimer"
                              onClick={() => supprimerCharge(charge)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50/60">
                      <td className="td font-semibold text-slate-700" colSpan={3}>
                        Total des charges
                      </td>
                      <td className="td text-right font-bold text-slate-900">
                        {formatMontant(stats.total_charges, settings)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {onglet === 'ventes' && (
        <VentesCycle
          cycleId={id}
          cycle={cycle}
          synthese={synthese}
          onRafraichir={async () => rafraichir()}
        />
      )}

      <Modal
        open={modaleEdition}
        onClose={() => setModaleEdition(false)}
        title="Modifier le cycle"
        description="Ajustez les informations de la bande."
        footer={
          <>
            <Button variant="secondary" onClick={() => setModaleEdition(false)}>
              Annuler
            </Button>
            <Button type="submit" form="formulaire-cycle">
              Enregistrer
            </Button>
          </>
        }
      >
        {modaleEdition && (
          <FormulaireCycle
            cycle={cycle}
            souches={souches}
            onClose={() => setModaleEdition(false)}
            onEnregistre={async () => {
              rafraichir();
              toast('Cycle mis à jour.');
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={confirmationSuppression}
        onClose={() => setConfirmationSuppression(false)}
        onConfirm={supprimerCycle}
        loading={suppression}
        title="Supprimer ce cycle ?"
        message={`Le cycle « ${cycle.nom} » et toutes ses données (relevés, mortalités, charges) seront définitivement supprimés.`}
      />
    </div>
  );
}
