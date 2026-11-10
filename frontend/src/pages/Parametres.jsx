import { useEffect, useState } from 'react';
import {
  Coins,
  KeyRound,
  ListChecks,
  Lock,
  Pencil,
  Plus,
  Settings2,
  SlidersHorizontal,
  Trash2,
  User,
} from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
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
  Tabs,
} from '../components/ui.jsx';
import { formatMontant } from '../lib/format.js';

const FORMULAIRE_VIDE = {
  nom: '',
  libelle: '',
  unite: '',
  type_valeur: 'nombre',
  ordre_affichage: 10,
  actif: 1,
};

function FormulaireParametre({ parametre, onClose, onEnregistre }) {
  const [formulaire, setFormulaire] = useState(
    parametre
      ? {
          nom: parametre.nom,
          libelle: parametre.libelle,
          unite: parametre.unite || '',
          type_valeur: parametre.type_valeur,
          ordre_affichage: parametre.ordre_affichage,
          actif: parametre.actif,
        }
      : FORMULAIRE_VIDE,
  );
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const nomVerrouille = Boolean(parametre && ['poids', 'aliment'].includes(parametre.nom));

  const modifier = (champ) => (event) =>
    setFormulaire((actuel) => ({ ...actuel, [champ]: event.target.value }));

  const soumettre = async (event) => {
    event.preventDefault();
    setErreur('');
    setEnCours(true);
    try {
      const charge = {
        ...formulaire,
        ordre_affichage: Number(formulaire.ordre_affichage || 0),
        actif: Number(formulaire.actif),
      };
      if (parametre) {
        await api.put(`/parametres/${parametre.id}`, charge);
      } else {
        await api.post('/parametres', charge);
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
    <form id="formulaire-parametre" onSubmit={soumettre} className="space-y-4">
      {erreur && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
          {erreur}
        </div>
      )}

      <Field
        label="Nom technique"
        htmlFor="param-nom"
        hint={
          nomVerrouille
            ? 'Ce nom est utilisé par les indicateurs (poids, indice de consommation).'
            : 'Lettres minuscules, chiffres et « _ ». Ex. : poids_semaine'
        }
      >
        <input
          id="param-nom"
          className="input"
          value={formulaire.nom}
          onChange={modifier('nom')}
          disabled={nomVerrouille}
          required
        />
      </Field>

      <Field label="Libellé affiché" htmlFor="param-libelle">
        <input
          id="param-libelle"
          className="input"
          value={formulaire.libelle}
          onChange={modifier('libelle')}
          placeholder="Poids moyen"
          required
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Unité" htmlFor="param-unite" hint="Ex. : kg, L, °C, %">
          <input
            id="param-unite"
            className="input"
            value={formulaire.unite}
            onChange={modifier('unite')}
            placeholder="kg"
          />
        </Field>
        <Field label="Type de valeur" htmlFor="param-type">
          <select
            id="param-type"
            className="input"
            value={formulaire.type_valeur}
            onChange={modifier('type_valeur')}
          >
            <option value="nombre">Nombre</option>
            <option value="texte">Texte libre</option>
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Ordre d’affichage" htmlFor="param-ordre">
          <input
            id="param-ordre"
            type="number"
            step="1"
            className="input"
            value={formulaire.ordre_affichage}
            onChange={modifier('ordre_affichage')}
          />
        </Field>
        <Field label="État" htmlFor="param-actif">
          <select
            id="param-actif"
            className="input"
            value={String(formulaire.actif)}
            onChange={modifier('actif')}
          >
            <option value="1">Actif</option>
            <option value="0">Inactif</option>
          </select>
        </Field>
      </div>
    </form>
  );
}

export default function Parametres() {
  const { user } = useAuth();
  const { settings, refresh } = useSettings();
  const toast = useToast();

  const [onglet, setOnglet] = useState('suivi');
  const [parametres, setParametres] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [modale, setModale] = useState(null);
  const [aSupprimer, setASupprimer] = useState(null);
  const [suppression, setSuppression] = useState(false);

  const [preferences, setPreferences] = useState({
    devise: settings.devise,
    symbole_devise: settings.symbole_devise,
    seuil_mortalite_alerte: settings.seuil_mortalite_alerte,
    marge_cible: settings.marge_cible ?? 20,
    poids_moyen_j45_kg: settings.poids_moyen_j45_kg ?? 2.5,
  });
  const [enregistrementPreferences, setEnregistrementPreferences] = useState(false);

  const [motDePasse, setMotDePasse] = useState({
    actuel: '',
    nouveau: '',
    confirmation: '',
  });
  const [erreurMotDePasse, setErreurMotDePasse] = useState('');

  const charger = async () => {
    const data = await api.get('/parametres');
    setParametres(data);
  };

  useEffect(() => {
    let actif = true;
    charger()
      .catch((error) => toast(error.message, 'error'))
      .finally(() => {
        if (actif) setChargement(false);
      });
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPreferences({
      devise: settings.devise,
      symbole_devise: settings.symbole_devise,
      seuil_mortalite_alerte: settings.seuil_mortalite_alerte,
      marge_cible: settings.marge_cible ?? 20,
      poids_moyen_j45_kg: settings.poids_moyen_j45_kg ?? 2.5,
    });
  }, [settings]);

  const basculerActif = async (parametre) => {
    try {
      await api.put(`/parametres/${parametre.id}`, { actif: parametre.actif ? 0 : 1 });
      await charger();
      toast(parametre.actif ? 'Paramètre désactivé.' : 'Paramètre activé.');
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  const supprimer = async () => {
    if (!aSupprimer) return;
    setSuppression(true);
    try {
      await api.del(`/parametres/${aSupprimer.id}`);
      await charger();
      toast('Paramètre supprimé.');
      setASupprimer(null);
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setSuppression(false);
    }
  };

  const enregistrerPreferences = async (event) => {
    event.preventDefault();
    setEnregistrementPreferences(true);
    try {
      await api.put('/settings', preferences);
      await refresh();
      toast('Préférences enregistrées.');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setEnregistrementPreferences(false);
    }
  };

  const changerMotDePasse = async (event) => {
    event.preventDefault();
    setErreurMotDePasse('');
    if (motDePasse.nouveau !== motDePasse.confirmation) {
      setErreurMotDePasse('Les deux mots de passe ne correspondent pas.');
      return;
    }
    try {
      await api.put('/password', {
        mot_de_passe_actuel: motDePasse.actuel,
        nouveau_mot_de_passe: motDePasse.nouveau,
      });
      setMotDePasse({ actuel: '', nouveau: '', confirmation: '' });
      toast('Mot de passe mis à jour.');
    } catch (error) {
      setErreurMotDePasse(error.message);
    }
  };

  if (chargement) return <Loading />;

  const actifs = parametres.filter((parametre) => parametre.actif).length;

  return (
    <div>
      <PageHeader
        eyebrow="Configuration"
        title="Paramètres"
        subtitle="Adaptez l’application à votre exploitation : paramètres de suivi, devise et compte."
        actions={
          onglet === 'suivi' ? (
            <Button icon={Plus} onClick={() => setModale({ mode: 'creation' })}>
              Nouveau paramètre
            </Button>
          ) : null
        }
      />

      <Tabs
        items={[
          { value: 'suivi', label: 'Paramètres de suivi', icon: ListChecks },
          { value: 'preferences', label: 'Préférences', icon: SlidersHorizontal },
          { value: 'compte', label: 'Mon compte', icon: User },
        ]}
        value={onglet}
        onChange={setOnglet}
      />

      {onglet === 'suivi' && (
        <div className="mt-5 space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="card-pad">
              <p className="text-sm text-slate-500">Paramètres définis</p>
              <p className="kpi-value mt-1">{parametres.length}</p>
            </Card>
            <Card className="card-pad">
              <p className="text-sm text-slate-500">Paramètres actifs</p>
              <p className="kpi-value mt-1">{actifs}</p>
            </Card>
            <Card className="card-pad">
              <p className="text-sm text-slate-500">Désactivés</p>
              <p className="kpi-value mt-1">{parametres.length - actifs}</p>
            </Card>
          </div>

          <Card>
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">
                Paramètres relevés chaque jour
              </h2>
              <p className="text-xs text-slate-500">
                Ces champs apparaissent automatiquement dans la saisie des relevés et les
                tableaux comparatifs.
              </p>
            </div>

            {parametres.length === 0 ? (
              <div className="card-pad">
                <EmptyState
                  icon={ListChecks}
                  title="Aucun paramètre"
                  description="Créez au moins un paramètre (poids, aliment…) pour saisir des relevés."
                  action={
                    <Button icon={Plus} onClick={() => setModale({ mode: 'creation' })}>
                      Créer un paramètre
                    </Button>
                  }
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-slate-50/70">
                    <tr>
                      <th className="th w-16">Ordre</th>
                      <th className="th">Paramètre</th>
                      <th className="th">Unité</th>
                      <th className="th">Type</th>
                      <th className="th">État</th>
                      <th className="th text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parametres.map((parametre) => (
                      <tr key={parametre.id} className="table-row">
                        <td className="td text-slate-500">{parametre.ordre_affichage}</td>
                        <td className="td">
                          <p className="font-semibold text-slate-900">{parametre.libelle}</p>
                          <p className="text-xs text-slate-500">
                            {parametre.nom}
                            {['poids', 'aliment'].includes(parametre.nom) && (
                              <Badge tone="brand" className="ml-2">
                                indicateur
                              </Badge>
                            )}
                          </p>
                        </td>
                        <td className="td">{parametre.unite || '—'}</td>
                        <td className="td">
                          <Badge tone="neutral">
                            {parametre.type_valeur === 'nombre' ? 'Nombre' : 'Texte'}
                          </Badge>
                        </td>
                        <td className="td">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={Boolean(parametre.actif)}
                            onClick={() => basculerActif(parametre)}
                            className={`inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 text-xs font-semibold transition ${
                              parametre.actif
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            <span
                              className={`flex h-5 w-5 items-center justify-center rounded-full text-white ${
                                parametre.actif ? 'bg-emerald-600' : 'bg-slate-400'
                              }`}
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-white" />
                            </span>
                            {parametre.actif ? 'Actif' : 'Inactif'}
                          </button>
                        </td>
                        <td className="td">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              className="btn-icon"
                              title="Modifier"
                              onClick={() => setModale({ mode: 'edition', parametre })}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              type="button"
                              className="btn-icon hover:text-rose-600"
                              title="Supprimer"
                              onClick={() => setASupprimer(parametre)}
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

          <Card className="card-pad">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-brand-50 p-2.5 text-brand-700">
                <Settings2 size={18} />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Conseils de configuration</h3>
                <ul className="mt-1.5 space-y-1 text-sm text-slate-500">
                  <li>
                    • Gardez les paramètres <strong>poids</strong> et <strong>aliment</strong>{' '}
                    actifs : ils alimentent l’indice de consommation et le coût par kilo.
                  </li>
                  <li>
                    • Un paramètre utilisé par des relevés ne peut pas être supprimé : désactivez-le
                    pour conserver l’historique.
                  </li>
                  <li>
                    • L’unité est libre (kg, g, L, °C…) : elle s’affiche à côté des valeurs.
                  </li>
                </ul>
              </div>
            </div>
          </Card>
        </div>
      )}

      {onglet === 'preferences' && (
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]">
          <Card>
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">Préférences générales</h2>                <p className="text-xs text-slate-500">
                  Devise d’affichage, seuil d’alerte de mortalité et objectifs de production.
                </p>
            </div>
            <form onSubmit={enregistrerPreferences} className="card-pad space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Code devise" htmlFor="devise" hint="Ex. : MGA, EUR, USD">
                  <input
                    id="devise"
                    className="input"
                    value={preferences.devise}
                    onChange={(event) =>
                      setPreferences((actuel) => ({ ...actuel, devise: event.target.value }))
                    }
                    required
                  />
                </Field>
                <Field label="Symbole affiché" htmlFor="symbole" hint="Ex. : Ar, €, $">
                  <input
                    id="symbole"
                    className="input"
                    value={preferences.symbole_devise}
                    onChange={(event) =>
                      setPreferences((actuel) => ({
                        ...actuel,
                        symbole_devise: event.target.value,
                      }))
                    }
                    required
                  />
                </Field>
              </div>

              <Field
                label="Seuil d’alerte de mortalité (%)"
                htmlFor="seuil"
                hint="Une alerte s’affiche dès que le taux cumulé dépasse ce seuil."
              >
                <input
                  id="seuil"
                  type="number"
                  min="0"
                  step="0.1"
                  className="input"
                  value={preferences.seuil_mortalite_alerte}
                  onChange={(event) =>
                    setPreferences((actuel) => ({
                      ...actuel,
                      seuil_mortalite_alerte: event.target.value,
                    }))
                  }
                  required
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Marge bénéficiaire cible (%)"
                  htmlFor="marge-cible"
                  hint="Objectif de marge utilisé pour estimer votre prix de vente."
                >
                  <input
                    id="marge-cible"
                    type="number"
                    min="0"
                    max="200"
                    step="1"
                    className="input"
                    value={preferences.marge_cible}
                    onChange={(event) =>
                      setPreferences((actuel) => ({
                        ...actuel,
                        marge_cible: event.target.value,
                      }))
                    }
                    required
                  />
                </Field>
                <Field
                  label="Poids moyen à J45 (kg)"
                  htmlFor="poids-moyen-j45"
                  hint="Poids standard d’un poulet de chair à 45 jours"
                >
                  <input
                    id="poids-moyen-j45"
                    type="number"
                    min="0.5"
                    max="10"
                    step="0.1"
                    className="input"
                    value={preferences.poids_moyen_j45_kg}
                    onChange={(event) =>
                      setPreferences((actuel) => ({
                        ...actuel,
                        poids_moyen_j45_kg: event.target.value,
                      }))
                    }
                    required
                  />
                </Field>
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={enregistrementPreferences} icon={Coins}>
                  {enregistrementPreferences ? 'Enregistrement…' : 'Enregistrer les préférences'}
                </Button>
              </div>
            </form>
          </Card>

          <Card className="card-pad">
            <h3 className="text-sm font-semibold text-slate-900">Aperçu</h3>
            <p className="mt-1 text-sm text-slate-500">
              Montant affiché avec vos préférences actuelles :
            </p>
            <p className="mt-3 rounded-xl bg-brand-50 px-4 py-3 text-xl font-bold text-brand-900">
              {formatMontant(450000, preferences)}
            </p>
            <div className="mt-4 space-y-2 text-sm text-slate-500">
              <p>
                Devise :{' '}
                <span className="font-semibold text-slate-800">{preferences.devise}</span>
              </p>
              <p>
                Seuil d’alerte :{' '}
                <span className="font-semibold text-slate-800">
                  {preferences.seuil_mortalite_alerte} %
                </span>
              </p>
            </div>
          </Card>
        </div>
      )}

      {onglet === 'compte' && (
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]">
          <Card>
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">Changer le mot de passe</h2>
              <p className="text-xs text-slate-500">
                Utilisez au moins 4 caractères. La session reste active après la modification.
              </p>
            </div>
            <form onSubmit={changerMotDePasse} className="card-pad space-y-4">
              {erreurMotDePasse && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
                  {erreurMotDePasse}
                </div>
              )}
              <Field label="Mot de passe actuel" htmlFor="ancien-mdp">
                <div className="relative">
                  <Lock
                    size={16}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    id="ancien-mdp"
                    type="password"
                    className="input pl-10"
                    autoComplete="current-password"
                    value={motDePasse.actuel}
                    onChange={(event) =>
                      setMotDePasse((actuel) => ({ ...actuel, actuel: event.target.value }))
                    }
                    required
                  />
                </div>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nouveau mot de passe" htmlFor="nouveau-mdp">
                  <input
                    id="nouveau-mdp"
                    type="password"
                    className="input"
                    autoComplete="new-password"
                    value={motDePasse.nouveau}
                    onChange={(event) =>
                      setMotDePasse((actuel) => ({ ...actuel, nouveau: event.target.value }))
                    }
                    required
                  />
                </Field>
                <Field label="Confirmation" htmlFor="confirmation-mdp">
                  <input
                    id="confirmation-mdp"
                    type="password"
                    className="input"
                    autoComplete="new-password"
                    value={motDePasse.confirmation}
                    onChange={(event) =>
                      setMotDePasse((actuel) => ({
                        ...actuel,
                        confirmation: event.target.value,
                      }))
                    }
                    required
                  />
                </Field>
              </div>
              <div className="flex justify-end">
                <Button type="submit" icon={KeyRound}>
                  Mettre à jour le mot de passe
                </Button>
              </div>
            </form>
          </Card>

          <Card className="card-pad">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-base font-bold text-brand-800">
                {(user?.username || 'AD').slice(0, 2).toUpperCase()}
              </span>
              <div>
                <p className="font-semibold text-slate-900">{user?.username}</p>
                <p className="text-xs text-slate-500">Compte administrateur</p>
              </div>
            </div>
            <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm text-slate-500">
              <p>
                Login :{' '}
                <span className="font-semibold text-slate-800">{user?.username}</span>
              </p>
              <p className="text-xs leading-relaxed">
                Le compte est créé automatiquement au premier démarrage de l’application avec
                le mot de passe « admin ». Pensez à le modifier.
              </p>
            </div>
          </Card>
        </div>
      )}

      <Modal
        open={Boolean(modale)}
        onClose={() => setModale(null)}
        title={modale?.mode === 'edition' ? 'Modifier le paramètre' : 'Nouveau paramètre de suivi'}
        description={
          modale?.mode === 'edition'
            ? 'Les modifications s’appliquent aux prochains relevés.'
            : 'Ajoutez une mesure à saisir chaque jour.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setModale(null)}>
              Annuler
            </Button>
            <Button type="submit" form="formulaire-parametre">
              {modale?.mode === 'edition' ? 'Enregistrer' : 'Créer le paramètre'}
            </Button>
          </>
        }
      >
        {modale && (
          <FormulaireParametre
            parametre={modale.parametre}
            onClose={() => setModale(null)}
            onEnregistre={async () => {
              await charger();
              toast(
                modale?.mode === 'edition'
                  ? 'Paramètre mis à jour.'
                  : 'Paramètre créé.',
              );
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(aSupprimer)}
        onClose={() => setASupprimer(null)}
        onConfirm={supprimer}
        loading={suppression}
        title="Supprimer ce paramètre ?"
        message={`Le paramètre « ${aSupprimer?.libelle} » et ses valeurs de référence seront supprimés. S’il possède déjà des relevés, l’application vous proposera de le désactiver.`}
      />
    </div>
  );
}
