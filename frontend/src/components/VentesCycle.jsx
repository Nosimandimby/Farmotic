import { useState } from 'react';
import {
  Banknote,
  Pencil,
  Plus,
  Scale,
  ShoppingBasket,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { api } from '../api.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { useToast } from '../components/Toast.jsx';
import useOnlineStatus, {
  MESSAGE_INDISPONIBLE_HORS_LIGNE,
} from '../hooks/useOnlineStatus.js';
import usePeutModifier, { MESSAGE_LECTURE_SEULE } from '../hooks/usePermissions.js';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
  StatCard,
} from '../components/ui.jsx';
import {
  aujourdhuiISO,
  formatDate,
  formatMontant,
  formatNombre,
  formatPourcentage,
} from '../lib/format.js';

const FORMULAIRE_VIDE = {
  date: aujourdhuiISO(),
  client: '',
  nombre_poulets: '',
  poids_kg: '',
  prix_unitaire_kg: '',
  commentaire: '',
};

const STATUTS = {
  au_dessus: { tone: 'success', label: 'Au-dessus du prévisionnel' },
  conforme: { tone: 'info', label: 'Conforme au prévisionnel' },
  sous_performance: { tone: 'danger', label: 'Sous le prévisionnel' },
  non_comparable: { tone: 'neutral', label: 'Non comparable' },
};

function FormulaireVente({ vente, cycleId, onClose, onEnregistre }) {
  const { settings } = useSettings();
  const [formulaire, setFormulaire] = useState(
    vente
      ? {
          date: vente.date,
          client: vente.client,
          nombre_poulets: vente.nombre_poulets ?? '',
          poids_kg: vente.poids_kg,
          prix_unitaire_kg: vente.prix_unitaire_kg,
          commentaire: vente.commentaire || '',
        }
      : FORMULAIRE_VIDE,
  );
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  const modifier = (champ) => (event) =>
    setFormulaire((actuel) => ({ ...actuel, [champ]: event.target.value }));

  const montant =
    Number(formulaire.poids_kg) > 0 && Number(formulaire.prix_unitaire_kg) > 0
      ? Number(formulaire.poids_kg) * Number(formulaire.prix_unitaire_kg)
      : 0;

  const soumettre = async (event) => {
    event.preventDefault();
    setErreur('');
    setEnCours(true);
    try {
      const charge = {
        cycle_id: Number(cycleId),
        date: formulaire.date,
        client: formulaire.client.trim(),
        nombre_poulets:
          formulaire.nombre_poulets === '' ? null : Number(formulaire.nombre_poulets),
        poids_kg: Number(formulaire.poids_kg),
        prix_unitaire_kg: Number(formulaire.prix_unitaire_kg),
        commentaire: formulaire.commentaire,
      };
      if (vente) {
        await api.put(`/ventes/${vente.id}`, charge);
      } else {
        await api.post('/ventes', charge);
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
    <form id="formulaire-vente" onSubmit={soumettre} className="space-y-4">
      {erreur && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
          {erreur}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date de vente" htmlFor="vente-date">
          <input
            id="vente-date"
            type="date"
            className="input"
            value={formulaire.date}
            onChange={modifier('date')}
            required
          />
        </Field>
        <Field label="Client" htmlFor="vente-client">
          <input
            id="vente-client"
            className="input"
            value={formulaire.client}
            onChange={modifier('client')}
            placeholder="Épicerie, collecteur, abattoir…"
            required
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Poids vendu (kg)" htmlFor="vente-poids">
          <input
            id="vente-poids"
            type="number"
            min="0"
            step="0.01"
            className="input"
            value={formulaire.poids_kg}
            onChange={modifier('poids_kg')}
            placeholder="0"
            required
          />
        </Field>
        <Field
          label="Prix de vente au kg"
          htmlFor="vente-prix"
          hint={`En ${settings.devise}`}
        >
          <div className="relative">
            <input
              id="vente-prix"
              type="number"
              min="0"
              step="any"
              className="input pr-10"
              value={formulaire.prix_unitaire_kg}
              onChange={modifier('prix_unitaire_kg')}
              placeholder="0"
              required
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-slate-400">
              {settings.symbole_devise}
            </span>
          </div>
        </Field>
      </div>

      <Field
        label="Nombre de poulets (facultatif)"
        htmlFor="vente-poulets"
        hint="À renseigner si la vente se fait à la pièce plutôt qu’au poids."
      >
        <input
          id="vente-poulets"
          type="number"
          min="0"
          step="1"
          className="input"
          value={formulaire.nombre_poulets}
          onChange={modifier('nombre_poulets')}
          placeholder="—"
        />
      </Field>

      <Field label="Commentaire" htmlFor="vente-commentaire">
        <input
          id="vente-commentaire"
          className="input"
          value={formulaire.commentaire}
          onChange={modifier('commentaire')}
          placeholder="Lot 1, camion du matin…"
        />
      </Field>

      <div className="rounded-xl bg-brand-50 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
          Montant total calculé
        </p>
        <p className="mt-1 text-lg font-bold text-brand-900">
          {formatMontant(montant, settings)}
        </p>
      </div>

      {enCours && <p className="text-xs text-slate-500">Enregistrement…</p>}
    </form>
  );
}

export default function VentesCycle({ cycleId, cycle, synthese, onRafraichir }) {
  const { settings } = useSettings();
  const toast = useToast();
  const isOnline = useOnlineStatus();
  const peutModifier = usePeutModifier();

  const [modale, setModale] = useState(null);
  const [aSupprimer, setASupprimer] = useState(null);
  const [suppression, setSuppression] = useState(false);

  const supprimer = async () => {
    if (!aSupprimer) return;
    setSuppression(true);
    try {
      await api.del(`/ventes/${aSupprimer.id}`);
      toast('Vente supprimée.');
      setASupprimer(null);
      await onRafraichir();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setSuppression(false);
    }
  };

  if (!synthese) {
    return (
      <div className="mt-5">
        <Alert tone="info" title="Synthèse indisponible">
          Les ventes de ce cycle ne peuvent pas être affichées pour le moment.
        </Alert>
      </div>
    );
  }

  const ventes = synthese.ventes;
  const reel = synthese.reel;
  const projection = synthese.projection;
  const comparaison = synthese.comparaison;
  const prixRevientKg = synthese.prix_revient?.kg ?? null;
  const lectureSeule = cycle?.statut === 'termine';
  const statut = STATUTS[comparaison?.statut] || null;
  const beneficeReel = reel?.benefice_reel ?? 0;

  return (
    <div className="mt-5 space-y-5">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Ventes du cycle</h2>
            <p className="text-xs text-slate-500">
              Enregistrez les ventes réelles (client, poids, prix au kg) pour comparer le
              bénéfice obtenu au prévisionnel à J45.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={lectureSeule ? 'neutral' : 'success'}>
              {lectureSeule ? 'Cycle terminé' : 'Cycle en cours'}
            </Badge>
            {!lectureSeule && (
              <Button
                icon={Plus}
                onClick={() => setModale({ mode: 'creation' })}
                disabled={!isOnline || !peutModifier}
                title={!isOnline ? MESSAGE_INDISPONIBLE_HORS_LIGNE : !peutModifier ? MESSAGE_LECTURE_SEULE : 'Ajouter une vente'}
              >
                Nouvelle vente
              </Button>
            )}
          </div>
        </div>
        {lectureSeule && (
          <div className="card-pad">
            <Alert tone="info" title="Cycle terminé">
              Les ventes enregistrées restent consultables, mais la saisie est verrouillée.
              Réouvrez le cycle pour ajouter une vente.
            </Alert>
          </div>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Chiffre d’affaires réel"
          value={formatMontant(reel?.chiffre_affaires, settings)}
          hint={`${formatNombre(ventes?.nombre_ventes, 0)} vente(s) enregistrée(s)`}
          icon={Banknote}
        />
        <StatCard
          label="Poids vendu"
          value={formatNombre(ventes?.poids_total_vendu_kg, 1)}
          unite="kg"
          hint="Cumul des ventes du cycle"
          icon={Scale}
          tone="sky"
        />
        <StatCard
          label="Poulets vendus"
          value={formatNombre(ventes?.poulets_vendus, 0)}
          unite="sujets"
          hint="Renseigné quand la vente est à la pièce"
          icon={ShoppingBasket}
          tone="amber"
        />
        <StatCard
          label="Prix moyen de vente"
          value={formatMontant(ventes?.prix_moyen_kg, settings)}
          unite="/ kg"
          hint={
            prixRevientKg !== null
              ? `Prix de revient : ${formatMontant(prixRevientKg, settings)} / kg`
              : 'Prix de revient non calculable'
          }
          icon={TrendingUp}
          tone="violet"
        />
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Comparaison réel vs prévisionnel
            </h2>
            <p className="text-xs text-slate-500">
              Prévisionnel calculé sur le poids moyen à J45 et la marge cible.
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
              <p className="text-xs text-slate-500">
                {formatNombre(projection?.poids_total_kg, 1)} kg projetés
              </p>
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
                {formatNombre(ventes?.poids_total_vendu_kg, 1)} kg vendus
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
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Historique des ventes</h2>
            <p className="text-xs text-slate-500">
              Les lignes surlignées sont vendues sous le prix de revient au kilo.
            </p>
          </div>
          <Badge tone="brand">{ventes?.nombre_ventes ?? 0} ligne(s)</Badge>
        </div>

        {!ventes?.detail?.length ? (
          <div className="card-pad">
            <EmptyState
              icon={Banknote}
              title="Aucune vente enregistrée"
              description="Ajoutez la première vente pour suivre le chiffre d’affaires réel du cycle."
              action={
                !lectureSeule && (
                  <Button
                    icon={Plus}
                    onClick={() => setModale({ mode: 'creation' })}
                    disabled={!isOnline || !peutModifier}
                    title={!isOnline ? MESSAGE_INDISPONIBLE_HORS_LIGNE : !peutModifier ? MESSAGE_LECTURE_SEULE : 'Ajouter une vente'}
                  >
                    Ajouter une vente
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50/70">
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Client</th>
                  <th className="th text-right">Poulets</th>
                  <th className="th text-right">Poids</th>
                  <th className="th text-right">Prix/kg</th>
                  <th className="th text-right">Montant</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {ventes.detail.map((vente) => {
                  const sousPrixRevient =
                    prixRevientKg !== null && Number(vente.prix_unitaire_kg) < prixRevientKg;
                  return (
                    <tr
                      key={vente.id}
                      className={`table-row ${sousPrixRevient ? 'bg-amber-50/70' : ''}`}
                    >
                      <td className="td whitespace-nowrap font-medium text-slate-800">
                        {formatDate(vente.date)}
                      </td>
                      <td className="td text-slate-700">
                        <p className="font-medium text-slate-800">{vente.client}</p>
                        {vente.commentaire && (
                          <p className="text-xs text-slate-500">{vente.commentaire}</p>
                        )}
                      </td>
                      <td className="td text-right text-slate-600">
                        {vente.nombre_poulets ?? '—'}
                      </td>
                      <td className="td whitespace-nowrap text-right text-slate-700">
                        {formatNombre(vente.poids_kg, 2)} kg
                      </td>
                      <td
                        className={`td whitespace-nowrap text-right font-medium ${
                          sousPrixRevient ? 'text-amber-700' : 'text-slate-700'
                        }`}
                      >
                        {formatMontant(vente.prix_unitaire_kg, settings)}
                      </td>
                      <td className="td whitespace-nowrap text-right font-semibold text-slate-900">
                        {formatMontant(vente.montant_total, settings)}
                      </td>
                      <td className="td">
                        <div className="flex justify-end gap-1">
                          {!lectureSeule && (
                            <>
                              <button
                                type="button"
                                className="btn-icon disabled:opacity-40"
                                title={
                                  !isOnline ? MESSAGE_INDISPONIBLE_HORS_LIGNE : !peutModifier ? MESSAGE_LECTURE_SEULE : 'Modifier'
                                }
                                disabled={!isOnline || !peutModifier}
                                onClick={() => setModale({ mode: 'edition', vente })}
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                type="button"
                                className="btn-icon hover:text-rose-600 disabled:opacity-40"
                                title={
                                  !isOnline ? MESSAGE_INDISPONIBLE_HORS_LIGNE : !peutModifier ? MESSAGE_LECTURE_SEULE : 'Supprimer'
                                }
                                disabled={!isOnline || !peutModifier}
                                onClick={() => setASupprimer(vente)}
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50/60">
                  <td className="td font-semibold text-slate-700" colSpan={3}>
                    Total des ventes
                  </td>
                  <td className="td text-right font-semibold text-slate-800">
                    {formatNombre(ventes.poids_total_vendu_kg, 2)} kg
                  </td>
                  <td className="td" />
                  <td className="td text-right font-bold text-slate-900">
                    {formatMontant(reel?.chiffre_affaires, settings)}
                  </td>
                  <td className="td" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(modale)}
        onClose={() => setModale(null)}
        title={modale?.mode === 'edition' ? 'Modifier la vente' : 'Nouvelle vente'}
        description="Le montant total est calculé automatiquement (poids × prix au kg)."
        footer={
          <>
            <Button variant="secondary" onClick={() => setModale(null)}>
              Annuler
            </Button>
            <Button
              type="submit"
              form="formulaire-vente"
              disabled={!isOnline || !peutModifier}
              title={!isOnline ? MESSAGE_INDISPONIBLE_HORS_LIGNE : !peutModifier ? MESSAGE_LECTURE_SEULE : undefined}
            >
              {modale?.mode === 'edition' ? 'Enregistrer' : 'Ajouter la vente'}
            </Button>
          </>
        }
      >
        {modale && (
          <FormulaireVente
            vente={modale.vente}
            cycleId={cycleId}
            onClose={() => setModale(null)}
            onEnregistre={async () => {
              await onRafraichir();
              toast(modale?.mode === 'edition' ? 'Vente mise à jour.' : 'Vente enregistrée.');
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(aSupprimer)}
        onClose={() => setASupprimer(null)}
        onConfirm={supprimer}
        loading={suppression}
        title="Supprimer cette vente ?"
        message={`La vente de ${formatNombre(
          aSupprimer?.poids_kg,
          2,
        )} kg à ${aSupprimer?.client} sera définitivement supprimée.`}
      />
    </div>
  );
}
