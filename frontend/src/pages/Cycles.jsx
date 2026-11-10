import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Layers,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { api } from '../api.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { useToast } from '../components/Toast.jsx';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Loading,
  Modal,
  PageHeader,
} from '../components/ui.jsx';
import {
  aujourdhuiISO,
  formatDate,
  formatMontant,
  formatNombre,
  formatPourcentage,
} from '../lib/format.js';

const FILTRES = [
  { value: 'tous', label: 'Tous' },
  { value: 'en_cours', label: 'En cours' },
  { value: 'termine', label: 'Terminés' },
];

export function FormulaireCycle({ cycle, souches, onClose, onEnregistre }) {
  const [formulaire, setFormulaire] = useState({
    nom: cycle?.nom || '',
    date_debut: cycle?.date_debut || aujourdhuiISO(),
    nombre_poussins: cycle?.nombre_poussins ?? 500,
    prix_poussin: cycle?.prix_poussin ?? 0,
    souche: cycle?.souche || '',
    statut: cycle?.statut || 'en_cours',
  });
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  const modifier = (champ) => (event) =>
    setFormulaire((actuel) => ({ ...actuel, [champ]: event.target.value }));

  const soumettre = async (event) => {
    event.preventDefault();
    setErreur('');
    setEnCours(true);
    try {
      const charge = {
        ...formulaire,
        nombre_poussins: Number(formulaire.nombre_poussins),
        prix_poussin: Number(formulaire.prix_poussin || 0),
      };
      if (cycle) {
        await api.put(`/cycles/${cycle.id}`, charge);
      } else {
        await api.post('/cycles', charge);
      }
      await onEnregistre();
      onClose();
    } catch (error) {
      setErreur(error.message);
    } finally {
      setEnCours(false);
    }
  };

  return (
    <form
      onSubmit={soumettre}
      className="space-y-4"
      id="formulaire-cycle"
    >
      {erreur && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
          {erreur}
        </div>
      )}

      <Field label="Nom du cycle" htmlFor="nom">
        <input
          id="nom"
          className="input"
          value={formulaire.nom}
          onChange={modifier('nom')}
          placeholder="Bande de novembre 2026"
          required
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date de début" htmlFor="date_debut">
          <input
            id="date_debut"
            type="date"
            className="input"
            value={formulaire.date_debut}
            onChange={modifier('date_debut')}
            required
          />
        </Field>
        <Field label="Souche" htmlFor="souche" hint="Utilisée pour les références de croissance">
          <input
            id="souche"
            className="input"
            list="liste-souches"
            value={formulaire.souche}
            onChange={modifier('souche')}
            placeholder="Activo"
          />
          <datalist id="liste-souches">
            {souches.map((souche) => (
              <option key={souche} value={souche} />
            ))}
          </datalist>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre de poussins" htmlFor="nombre_poussins">
          <input
            id="nombre_poussins"
            type="number"
            min="1"
            step="1"
            className="input"
            value={formulaire.nombre_poussins}
            onChange={modifier('nombre_poussins')}
            required
          />
        </Field>
        <Field
          label="Prix unitaire du poussin"
          htmlFor="prix_poussin"
          hint="Prix d’achat d’un poussin, en Ariary"
        >
          <input
            id="prix_poussin"
            type="number"
            min="0"
            step="1"
            className="input"
            value={formulaire.prix_poussin}
            onChange={modifier('prix_poussin')}
          />
        </Field>
      </div>

      {cycle && (
        <Field label="Statut" htmlFor="statut">
          <select id="statut" className="input" value={formulaire.statut} onChange={modifier('statut')}>
            <option value="en_cours">En cours</option>
            <option value="termine">Terminé</option>
          </select>
        </Field>
      )}
    </form>
  );
}

export default function Cycles() {
  const { settings } = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [cycles, setCycles] = useState([]);
  const [souches, setSouches] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [filtre, setFiltre] = useState('tous');
  const [modale, setModale] = useState(null);
  const [cycleASupprimer, setCycleASupprimer] = useState(null);
  const [suppression, setSuppression] = useState(false);

  const charger = useCallback(async () => {
    const [listeCycles, listeSouches] = await Promise.all([
      api.get('/cycles'),
      api.get('/references/souches'),
    ]);
    setCycles(listeCycles);
    setSouches(listeSouches);
  }, []);

  useEffect(() => {
    let actif = true;
    charger()
      .catch((error) => {
        if (actif) setErreur(error.message);
      })
      .finally(() => {
        if (actif) setChargement(false);
      });
    return () => {
      actif = false;
    };
  }, [charger]);

  useEffect(() => {
    if (location.state?.nouveau) {
      setModale({ mode: 'creation' });
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  const cyclesAffiches = useMemo(
    () => (filtre === 'tous' ? cycles : cycles.filter((cycle) => cycle.statut === filtre)),
    [cycles, filtre],
  );

  const enregistrer = async () => {
    await charger();
    toast(modale?.mode === 'edition' ? 'Cycle mis à jour.' : 'Cycle créé avec succès.');
  };

  const basculerStatut = async (cycle) => {
    try {
      await api.put(`/cycles/${cycle.id}`, {
        statut: cycle.statut === 'en_cours' ? 'termine' : 'en_cours',
      });
      await charger();
      toast(
        cycle.statut === 'en_cours'
          ? 'Cycle marqué comme terminé.'
          : 'Cycle réouvert.',
      );
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  const supprimer = async () => {
    if (!cycleASupprimer) return;
    setSuppression(true);
    try {
      await api.del(`/cycles/${cycleASupprimer.id}`);
      await charger();
      toast('Cycle supprimé.');
      setCycleASupprimer(null);
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setSuppression(false);
    }
  };

  if (chargement) return <Loading />;

  return (
    <div>
      <PageHeader
        eyebrow="Élevage"
        title="Cycles d’élevage"
        subtitle="Une bande = un cycle, de la mise en place des poussins à la fin de la période d’élevage."
        actions={
          <Button icon={Plus} onClick={() => setModale({ mode: 'creation' })}>
            Nouveau cycle
          </Button>
        }
      />

      {erreur && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {erreur}
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {FILTRES.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setFiltre(item.value)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  filtre === item.value
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {item.label}
                <span className="ml-1.5 text-xs text-slate-400">
                  {item.value === 'tous'
                    ? cycles.length
                    : cycles.filter((cycle) => cycle.statut === item.value).length}
                </span>
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Seuil d’alerte mortalité : {formatPourcentage(settings.seuil_mortalite_alerte, 0)}
          </p>
        </div>

        {cyclesAffiches.length === 0 ? (
          <div className="card-pad">
            <EmptyState
              icon={Layers}
              title={cycles.length === 0 ? 'Aucun cycle pour le moment' : 'Aucun cycle dans ce filtre'}
              description={
                cycles.length === 0
                  ? 'Créez votre première bande pour enregistrer les relevés quotidiens, la mortalité et les charges.'
                  : 'Changez de filtre pour voir les autres cycles.'
              }
              action={
                cycles.length === 0 ? (
                  <Button icon={Plus} onClick={() => setModale({ mode: 'creation' })}>
                    Créer un cycle
                  </Button>
                ) : null
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="bg-slate-50/70">
                <tr>
                  <th className="th">Cycle</th>
                  <th className="th">Démarrage</th>
                  <th className="th">Effectif</th>
                  <th className="th">Mortalité</th>
                  <th className="th">Poids moyen</th>
                  <th className="th">Coût total</th>
                  <th className="th">Statut</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {cyclesAffiches.map((cycle) => (
                  <tr key={cycle.id} className="table-row">
                    <td className="td">
                      <Link
                        to={`/cycles/${cycle.id}`}
                        className="font-semibold text-slate-900 hover:text-brand-700"
                      >
                        {cycle.nom}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {cycle.souche || 'Souche non précisée'} · Jour {cycle.stats.age_jours}
                      </p>
                    </td>
                    <td className="td whitespace-nowrap text-slate-500">
                      {formatDate(cycle.date_debut)}
                    </td>
                    <td className="td">
                      <span className="font-semibold text-slate-800">
                        {formatNombre(cycle.stats.effectif_vivant, 0)}
                      </span>
                      <span className="text-slate-400">
                        {' '}
                        / {formatNombre(cycle.nombre_poussins, 0)}
                      </span>
                    </td>
                    <td className="td">
                      <span
                        className={`font-semibold ${
                          cycle.stats.mortalite_alerte ? 'text-rose-600' : 'text-slate-700'
                        }`}
                      >
                        {formatPourcentage(cycle.stats.taux_mortalite)}
                      </span>
                    </td>
                    <td className="td">
                      {cycle.stats.poids_moyen !== null
                        ? `${formatNombre(cycle.stats.poids_moyen, 3)} ${cycle.stats.poids_moyen_unite || 'kg'}`
                        : '—'}
                    </td>
                    <td className="td whitespace-nowrap">
                      {formatMontant(cycle.stats.cout_total, settings)}
                    </td>
                    <td className="td">
                      <Badge tone={cycle.statut === 'en_cours' ? 'success' : 'neutral'}>
                        {cycle.statut === 'en_cours' ? 'En cours' : 'Terminé'}
                      </Badge>
                    </td>
                    <td className="td">
                      <div className="flex items-center justify-end gap-1">
                        <Link to={`/cycles/${cycle.id}`} className="btn-icon" title="Ouvrir">
                          <ArrowRight size={16} />
                        </Link>
                        <button
                          type="button"
                          className="btn-icon"
                          title="Modifier"
                          onClick={() => setModale({ mode: 'edition', cycle })}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          title={
                            cycle.statut === 'en_cours'
                              ? 'Marquer comme terminé'
                              : 'Réouvrir le cycle'
                          }
                          onClick={() => basculerStatut(cycle)}
                        >
                          {cycle.statut === 'en_cours' ? (
                            <CheckCircle2 size={16} />
                          ) : (
                            <RotateCcw size={16} />
                          )}
                        </button>
                        <button
                          type="button"
                          className="btn-icon hover:text-rose-600"
                          title="Supprimer"
                          onClick={() => setCycleASupprimer(cycle)}
                        >
                          <Trash2 size={16} />
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

      <Modal
        open={Boolean(modale)}
        onClose={() => setModale(null)}
        title={modale?.mode === 'edition' ? 'Modifier le cycle' : 'Nouveau cycle'}
        description={
          modale?.mode === 'edition'
            ? 'Ajustez les informations de la bande.'
            : 'Renseignez les informations de la nouvelle bande.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setModale(null)}>
              Annuler
            </Button>
            <Button type="submit" form="formulaire-cycle">
              {modale?.mode === 'edition' ? 'Enregistrer' : 'Créer le cycle'}
            </Button>
          </>
        }
      >
        {modale && (
          <FormulaireCycle
            key={modale.cycle?.id || 'creation'}
            cycle={modale.cycle}
            souches={souches}
            onClose={() => setModale(null)}
            onEnregistre={enregistrer}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(cycleASupprimer)}
        onClose={() => setCycleASupprimer(null)}
        onConfirm={supprimer}
        loading={suppression}
        title="Supprimer ce cycle ?"
        message={`Le cycle « ${cycleASupprimer?.nom} » sera supprimé avec tous ses relevés, mortalités et charges. Cette action est irréversible.`}
      />
    </div>
  );
}
