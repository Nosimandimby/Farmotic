import { useEffect, useState } from 'react';
import {
  Coins,
  Database,
  Download,
  DownloadCloud,
  GitBranch,
  Info,
  KeyRound,
  ListChecks,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
  Upload,
  User,
} from 'lucide-react';
import { api, restaurerSauvegarde, telechargerSauvegarde } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useToast } from '../components/Toast.jsx';
import useOnlineStatus, {
  MESSAGE_INDISPONIBLE_HORS_LIGNE,
} from '../hooks/useOnlineStatus.js';
import usePeutModifier, { MESSAGE_LECTURE_SEULE } from '../hooks/usePermissions.js';
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
  const isOnline = useOnlineStatus();
  const peutModifier = usePeutModifier();

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

  const [exportEnCours, setExportEnCours] = useState(false);
  const [fichierSauvegarde, setFichierSauvegarde] = useState(null);
  const [confirmationRestauration, setConfirmationRestauration] = useState(false);
  const [restaurationEnCours, setRestaurationEnCours] = useState(false);

  const [infosVersion, setInfosVersion] = useState(null);
  const [etatMaj, setEtatMaj] = useState(null);
  const [verificationMaj, setVerificationMaj] = useState(false);
  const [applicationMaj, setApplicationMaj] = useState(false);
  const [confirmationMaj, setConfirmationMaj] = useState(false);
  const [redemarrage, setRedemarrage] = useState(false);

  const estAdmin = user?.role === 'admin';

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

  useEffect(() => {
    if (onglet !== 'apropos' || infosVersion) return undefined;
    let actif = true;
    api.get('/version')
      .then((infos) => {
        if (actif) setInfosVersion(infos);
      })
      .catch((error) => {
        if (actif) toast(error.message, 'error');
      });
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onglet, infosVersion]);

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

  const exporterSauvegarde = async () => {
    setExportEnCours(true);
    try {
      const nom = await telechargerSauvegarde();
      toast(`Sauvegarde exportée : ${nom}`);
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setExportEnCours(false);
    }
  };

  const restaurer = async () => {
    if (!fichierSauvegarde) return;
    setRestaurationEnCours(true);
    try {
      const resultat = await restaurerSauvegarde(fichierSauvegarde);
      toast(
        `Sauvegarde restaurée. Copie de l’ancienne base : ${resultat.sauvegarde_securite}.`,
      );
      setTimeout(() => window.location.reload(), 1200);
    } catch (error) {
      toast(error.message, 'error');
      setConfirmationRestauration(false);
    } finally {
      setRestaurationEnCours(false);
    }
  };

  const verifierMaj = async () => {
    setVerificationMaj(true);
    setEtatMaj(null);
    try {
      const etat = await api.get('/maj/verifier');
      setEtatMaj(etat);
      if (etat.erreur) {
        toast(etat.erreur, 'error');
      } else if (etat.a_jour) {
        toast('Farmotic est à jour.');
      } else {
        toast(`Nouvelle version disponible : ${etat.version_disponible}.`);
      }
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setVerificationMaj(false);
    }
  };

  const attendreRedemarrage = async () => {
    setRedemarrage(true);
    for (let essai = 0; essai < 60; essai += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        await api.get('/version');
        window.location.reload();
        return;
      } catch {
        // Le serveur est en cours de redémarrage : on réessaie.
      }
    }
    setRedemarrage(false);
    toast('Le serveur ne répond pas. Relancez Farmotic manuellement.', 'error');
  };

  const appliquerMaj = async () => {
    setConfirmationMaj(false);
    setApplicationMaj(true);
    try {
      const resultat = await api.post('/maj/appliquer');
      if (!resultat.applique) {
        toast(resultat.message || 'Aucune mise à jour à appliquer.');
        setEtatMaj(null);
        return;
      }
      toast(`Version ${resultat.version} installée. Redémarrage…`);
      for (const avertissement of resultat.avertissements || []) {
        toast(avertissement, 'error');
      }
      await attendreRedemarrage();
      setEtatMaj(null);
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setApplicationMaj(false);
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
            <Button
              icon={Plus}
              onClick={() => setModale({ mode: 'creation' })}
              disabled={!isOnline || !peutModifier}
              title={!isOnline ? MESSAGE_INDISPONIBLE_HORS_LIGNE : !peutModifier ? MESSAGE_LECTURE_SEULE : 'Créer un paramètre'}
            >
              Nouveau paramètre
            </Button>
          ) : null
        }
      />

      <Tabs
        items={[
          { value: 'suivi', label: 'Paramètres de suivi', icon: ListChecks },
          { value: 'preferences', label: 'Préférences', icon: SlidersHorizontal },
          ...(estAdmin
            ? [{ value: 'sauvegarde', label: 'Sauvegarde', icon: Database }]
            : []),
          { value: 'apropos', label: 'À propos', icon: Info },
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
                    <Button
                      icon={Plus}
                      onClick={() => setModale({ mode: 'creation' })}
                      disabled={!isOnline || !peutModifier}
                      title={
                        !isOnline ? MESSAGE_INDISPONIBLE_HORS_LIGNE : !peutModifier ? MESSAGE_LECTURE_SEULE : 'Créer un paramètre'
                      }
                    >
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
                            disabled={!isOnline || !peutModifier}
                            title={!isOnline ? MESSAGE_INDISPONIBLE_HORS_LIGNE : !peutModifier ? MESSAGE_LECTURE_SEULE : undefined}
                            className={`inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 text-xs font-semibold transition disabled:opacity-50 ${
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
                              className="btn-icon disabled:opacity-40"
                              title={
                                !isOnline ? MESSAGE_INDISPONIBLE_HORS_LIGNE : !peutModifier ? MESSAGE_LECTURE_SEULE : 'Modifier'
                              }
                              disabled={!isOnline || !peutModifier}
                              onClick={() => setModale({ mode: 'edition', parametre })}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              type="button"
                              className="btn-icon hover:text-rose-600 disabled:opacity-40"
                              title={
                                !isOnline ? MESSAGE_INDISPONIBLE_HORS_LIGNE : !peutModifier ? MESSAGE_LECTURE_SEULE : 'Supprimer'
                              }
                              disabled={!isOnline || !peutModifier}
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
                <Button
                  type="submit"
                  disabled={enregistrementPreferences || !isOnline || !peutModifier}
                  icon={Coins}
                  title={!isOnline ? MESSAGE_INDISPONIBLE_HORS_LIGNE : !peutModifier ? MESSAGE_LECTURE_SEULE : undefined}
                >
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

      {onglet === 'sauvegarde' && estAdmin && (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card className="card-pad">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-brand-50 p-2.5 text-brand-700">
                <Download size={18} />
              </span>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-slate-900">
                  Exporter la base de données
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Télécharge le fichier SQLite complet (cycles, relevés, charges, ventes,
                  comptes) sous un nom daté du jour, par exemple{' '}
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                    farmotic-database-{new Date().toISOString().slice(0, 10)}.sqlite
                  </code>
                  .
                </p>
                <div className="mt-4">
                  <Button
                    icon={Download}
                    onClick={exporterSauvegarde}
                    disabled={exportEnCours || !isOnline}
                    title={!isOnline ? MESSAGE_INDISPONIBLE_HORS_LIGNE : !peutModifier ? MESSAGE_LECTURE_SEULE : undefined}
                  >
                    {exportEnCours ? 'Préparation…' : 'Télécharger la sauvegarde'}
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          <Card className="card-pad">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-amber-50 p-2.5 text-amber-700">
                <Upload size={18} />
              </span>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-slate-900">
                  Restaurer une sauvegarde
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Remplace toutes les données actuelles par le contenu du fichier choisi.
                  Une copie de la base actuelle est conservée automatiquement dans le
                  dossier <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">data/</code>.
                </p>

                <label
                  htmlFor="fichier-sauvegarde"
                  className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 px-3.5 py-2.5 text-sm text-slate-600 hover:border-brand-400 hover:text-brand-700"
                >
                  <span className="truncate">
                    {fichierSauvegarde
                      ? fichierSauvegarde.name
                      : 'Choisir un fichier .sqlite'}
                  </span>
                  <span className="shrink-0 text-xs font-semibold uppercase tracking-wide">
                    Parcourir
                  </span>
                </label>
                <input
                  id="fichier-sauvegarde"
                  type="file"
                  accept=".sqlite,.db,application/vnd.sqlite3,application/octet-stream"
                  className="hidden"
                  onChange={(event) =>
                    setFichierSauvegarde(event.target.files?.[0] || null)
                  }
                />

                <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                  <TriangleAlert size={15} className="mt-0.5 shrink-0" />
                  <p>
                    Les données saisies depuis cette sauvegarde seront perdues. Les
                    utilisateurs devront peut-être se reconnecter.
                  </p>
                </div>

                <div className="mt-4">
                  <Button
                    icon={Upload}
                    onClick={() => setConfirmationRestauration(true)}
                    disabled={!fichierSauvegarde || restaurationEnCours || !isOnline}
                    title={!isOnline ? MESSAGE_INDISPONIBLE_HORS_LIGNE : !peutModifier ? MESSAGE_LECTURE_SEULE : undefined}
                  >
                    Restaurer les données
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {onglet === 'apropos' && (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card className="card-pad">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-brand-50 p-2.5 text-brand-700">
                <Info size={18} />
              </span>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-slate-900">Farmotic</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Suivi d’élevage de poulets de chair — interface React et API Python.
                </p>
                <p className="mt-4 text-3xl font-bold text-slate-900">
                  version {infosVersion?.version || '—'}
                </p>
                {infosVersion?.describe && (
                  <p className="mt-1 font-mono text-xs text-slate-400">
                    {infosVersion.describe}
                  </p>
                )}

                <dl className="mt-4 space-y-1.5 text-sm text-slate-500">
                  {infosVersion?.branche && (
                    <div className="flex items-center justify-between gap-3">
                      <dt className="flex items-center gap-1.5">
                        <GitBranch size={14} /> Branche
                      </dt>
                      <dd className="font-semibold text-slate-800">
                        {infosVersion.branche}
                        {infosVersion.commit_court ? ` · ${infosVersion.commit_court}` : ''}
                      </dd>
                    </div>
                  )}
                  {infosVersion?.date_commit && (
                    <div className="flex items-center justify-between gap-3">
                      <dt>Date du code</dt>
                      <dd className="font-semibold text-slate-800">
                        {new Date(infosVersion.date_commit).toLocaleDateString('fr-FR')}
                      </dd>
                    </div>
                  )}
                  {infosVersion?.python && (
                    <div className="flex items-center justify-between gap-3">
                      <dt>Python</dt>
                      <dd className="font-semibold text-slate-800">{infosVersion.python}</dd>
                    </div>
                  )}
                  {infosVersion?.version_source && (
                    <div className="flex items-center justify-between gap-3">
                      <dt>Version lue dans</dt>
                      <dd className="font-semibold text-slate-800">
                        {infosVersion.version_source}
                      </dd>
                    </div>
                  )}
                  {infosVersion?.dossier && (
                    <div className="flex items-center justify-between gap-3">
                      <dt>Dossier</dt>
                      <dd className="max-w-[60%] truncate font-mono text-xs text-slate-700">
                        {infosVersion.dossier}
                      </dd>
                    </div>
                  )}
                </dl>

                <p className="mt-4 text-xs leading-relaxed text-slate-400">
                  Données enregistrées localement dans data/database.sqlite. Pensez à
                  exporter régulièrement une sauvegarde.
                </p>
              </div>
            </div>
          </Card>

          <Card className="card-pad">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-brand-50 p-2.5 text-brand-700">
                <RefreshCw size={18} />
              </span>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-slate-900">Mises à jour</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Vérifie si une nouvelle version est publiée sur le dépôt, puis
                  l’installe sans passer par le terminal.
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    icon={RefreshCw}
                    onClick={verifierMaj}
                    disabled={verificationMaj || !isOnline || redemarrage}
                    title={!isOnline ? MESSAGE_INDISPONIBLE_HORS_LIGNE : !peutModifier ? MESSAGE_LECTURE_SEULE : undefined}
                  >
                    {verificationMaj ? 'Vérification…' : 'Vérifier les mises à jour'}
                  </Button>
                  {estAdmin && etatMaj?.a_jour === false && (
                    <Button
                      icon={DownloadCloud}
                      onClick={() => setConfirmationMaj(true)}
                      disabled={applicationMaj || redemarrage || !isOnline}
                      title={!isOnline ? MESSAGE_INDISPONIBLE_HORS_LIGNE : !peutModifier ? MESSAGE_LECTURE_SEULE : undefined}
                    >
                      {applicationMaj ? 'Installation…' : 'Mettre à jour'}
                    </Button>
                  )}
                </div>

                {redemarrage && (
                  <p className="mt-4 rounded-xl border border-brand-200 bg-brand-50 px-3.5 py-2.5 text-sm text-brand-800">
                    Mise à jour appliquée, redémarrage du serveur… La page se rechargera
                    automatiquement.
                  </p>
                )}

                {etatMaj && !redemarrage && (
                  <div
                    className={`mt-4 rounded-xl border px-3.5 py-2.5 text-sm ${
                      etatMaj.erreur
                        ? 'border-rose-200 bg-rose-50 text-rose-700'
                        : etatMaj.a_jour
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-amber-200 bg-amber-50 text-amber-800'
                    }`}
                  >
                    {etatMaj.erreur ? (
                      etatMaj.erreur
                    ) : etatMaj.a_jour ? (
                      <>Vous utilisez la dernière version ({etatMaj.version}).</>
                    ) : (
                      <>
                        Version <strong>{etatMaj.version_disponible}</strong> disponible{' '}
                        ({etatMaj.commits_en_attente} modification(s)).
                        {!estAdmin && ' Seul un administrateur peut l’installer.'}
                      </>
                    )}
                  </div>
                )}

                <p className="mt-4 text-xs leading-relaxed text-slate-400">
                  La mise à jour récupère le code depuis le dépôt Git, réinstalle les
                  dépendances si nécessaire et recompile l’interface (Node.js requis).
                </p>
              </div>
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
                <Button
                  type="submit"
                  icon={KeyRound}
                  disabled={!isOnline || !peutModifier}
                  title={!isOnline ? MESSAGE_INDISPONIBLE_HORS_LIGNE : !peutModifier ? MESSAGE_LECTURE_SEULE : undefined}
                >
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
            <Button
              type="submit"
              form="formulaire-parametre"
              disabled={!isOnline || !peutModifier}
              title={!isOnline ? MESSAGE_INDISPONIBLE_HORS_LIGNE : !peutModifier ? MESSAGE_LECTURE_SEULE : undefined}
            >
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
        open={confirmationMaj}
        onClose={() => setConfirmationMaj(false)}
        onConfirm={appliquerMaj}
        loading={applicationMaj}
        confirmLabel="Mettre à jour"
        confirmVariant="primary"
        loadingLabel="Installation…"
        title="Installer la mise à jour ?"
        message={`Farmotic va récupérer la version ${etatMaj?.version_disponible || ''} depuis le dépôt Git, réinstaller les dépendances si besoin et recompiler l’interface. Le serveur redémarre ensuite automatiquement ; vos données ne sont pas modifiées.`}
      />

      <ConfirmDialog
        open={confirmationRestauration}
        onClose={() => setConfirmationRestauration(false)}
        onConfirm={restaurer}
        loading={restaurationEnCours}
        confirmLabel="Restaurer"
        confirmVariant="primary"
        loadingLabel="Restauration…"
        title="Restaurer cette sauvegarde ?"
        message={`Toutes les données actuelles (cycles, relevés, charges, ventes) seront remplacées par le contenu de « ${fichierSauvegarde?.name} ». Une copie de la base actuelle est enregistrée dans le dossier data/.`}
      />

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
