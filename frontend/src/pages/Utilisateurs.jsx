import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pencil,
  Plus,
  UserRound,
  Users,
  KeyRound,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import useOnlineStatus, {
  MESSAGE_INDISPONIBLE_HORS_LIGNE,
} from '../hooks/useOnlineStatus.js';
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
} from '../components/ui.jsx';
import { formatDate } from '../lib/format.js';

const ROLES = [
  {
    value: 'admin',
    label: 'Administrateur',
    detail: 'Accès complet, y compris la gestion des comptes.',
  },
  {
    value: 'operateur',
    label: 'Opérateur',
    detail: 'Saisie des relevés, de la mortalité et des charges.',
  },
  {
    value: 'lecteur',
    label: 'Lecteur',
    detail: 'Consultation seule, sans saisie.',
  },
];

const LIBELLES_ROLES = Object.fromEntries(ROLES.map((role) => [role.value, role.label]));
const TONS_ROLES = { admin: 'brand', operateur: 'info', lecteur: 'neutral' };

const FORMULAIRE_VIDE = {
  username: '',
  mot_de_passe: '',
  role: 'operateur',
  actif: 1,
};

function FormulaireUtilisateur({ utilisateur, onClose, onEnregistre }) {
  const [formulaire, setFormulaire] = useState(
    utilisateur
      ? {
          username: utilisateur.username,
          mot_de_passe: '',
          role: utilisateur.role,
          actif: utilisateur.actif,
        }
      : FORMULAIRE_VIDE,
  );
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
        username: formulaire.username.trim(),
        role: formulaire.role,
        actif: Number(formulaire.actif),
      };
      if (formulaire.mot_de_passe) charge.mot_de_passe = formulaire.mot_de_passe;

      if (utilisateur) {
        await api.put(`/utilisateurs/${utilisateur.id}`, charge);
      } else {
        await api.post('/utilisateurs', charge);
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
    <form id="formulaire-utilisateur" onSubmit={soumettre} className="space-y-4">
      {erreur && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
          {erreur}
        </div>
      )}

      <Field
        label="Login"
        htmlFor="utilisateur-login"
        hint="3 à 40 caractères : lettres, chiffres, point, tiret ou « _ »."
      >
        <input
          id="utilisateur-login"
          className="input"
          value={formulaire.username}
          onChange={modifier('username')}
          placeholder="jean.rakoto"
          autoComplete="off"
          required
        />
      </Field>

      <Field
        label={utilisateur ? 'Nouveau mot de passe' : 'Mot de passe'}
        htmlFor="utilisateur-mdp"
        hint={
          utilisateur
            ? 'Laissez vide pour conserver le mot de passe actuel.'
            : 'Au moins 4 caractères.'
        }
      >
        <input
          id="utilisateur-mdp"
          type="password"
          className="input"
          value={formulaire.mot_de_passe}
          onChange={modifier('mot_de_passe')}
          placeholder={utilisateur ? '••••••••' : ''}
          autoComplete="new-password"
          required={!utilisateur}
        />
      </Field>

      <Field label="Rôle" htmlFor="utilisateur-role">
        <select
          id="utilisateur-role"
          className="input"
          value={formulaire.role}
          onChange={modifier('role')}
        >
          {ROLES.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>
      </Field>
      <p className="hint -mt-2">
        {ROLES.find((role) => role.value === formulaire.role)?.detail}
      </p>

      <Field label="État du compte" htmlFor="utilisateur-actif">
        <select
          id="utilisateur-actif"
          className="input"
          value={String(formulaire.actif)}
          onChange={modifier('actif')}
        >
          <option value="1">Actif — peut se connecter</option>
          <option value="0">Désactivé — connexion refusée</option>
        </select>
      </Field>
    </form>
  );
}

export default function Utilisateurs() {
  const { user } = useAuth();
  const toast = useToast();
  const isOnline = useOnlineStatus();

  const [utilisateurs, setUtilisateurs] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [modale, setModale] = useState(null);
  const [aSupprimer, setASupprimer] = useState(null);
  const [suppression, setSuppression] = useState(false);

  const charger = useCallback(async () => {
    const liste = await api.get('/utilisateurs');
    setUtilisateurs(liste);
  }, []);

  useEffect(() => {
    let actif = true;
    charger()
      .catch((error) => {
        if (actif) toast(error.message, 'error');
      })
      .finally(() => {
        if (actif) setChargement(false);
      });
    return () => {
      actif = false;
    };
  }, [charger, toast]);

  const totaux = useMemo(
    () => ({
      total: utilisateurs.length,
      actifs: utilisateurs.filter((compte) => compte.actif).length,
      admins: utilisateurs.filter((compte) => compte.role === 'admin' && compte.actif).length,
    }),
    [utilisateurs],
  );

  const enregistrer = async () => {
    await charger();
    toast(modale?.utilisateur ? 'Compte mis à jour.' : 'Compte créé.');
  };

  const basculerActif = async (compte) => {
    try {
      await api.put(`/utilisateurs/${compte.id}`, { actif: compte.actif ? 0 : 1 });
      await charger();
      toast(compte.actif ? 'Compte désactivé.' : 'Compte activé.');
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  const supprimer = async () => {
    if (!aSupprimer) return;
    setSuppression(true);
    try {
      await api.del(`/utilisateurs/${aSupprimer.id}`);
      await charger();
      toast('Compte supprimé.');
      setASupprimer(null);
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
        eyebrow="Administration"
        title="Utilisateurs"
        subtitle="Créez les comptes de l’exploitation et définissez ce que chacun peut faire."
        actions={
          <Button
            icon={Plus}
            onClick={() => setModale({ mode: 'creation' })}
            disabled={!isOnline}
            title={!isOnline ? MESSAGE_INDISPONIBLE_HORS_LIGNE : 'Créer un compte'}
          >
            Nouvel utilisateur
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Comptes" value={totaux.total} hint="Tous rôles confondus" icon={Users} />
        <StatCard
          label="Comptes actifs"
          value={totaux.actifs}
          hint="Autorisés à se connecter"
          icon={UserRound}
          tone="sky"
        />
        <StatCard
          label="Administrateurs actifs"
          value={totaux.admins}
          hint="Au moins un est requis"
          icon={ShieldCheck}
          tone="amber"
        />
      </div>

      <div className="mt-5">
        <Alert tone="info" title="Rôles et connexion">
          Un compte <strong>désactivé</strong> ne peut plus se connecter, même avec le bon mot de
          passe. Vous ne pouvez ni désactiver votre propre compte, ni retirer le dernier
          administrateur actif.
        </Alert>
      </div>

      <Card className="mt-5">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">Comptes de l’exploitation</h2>
          <p className="text-xs text-slate-500">
            Cliquez sur l’état d’un compte pour l’activer ou le désactiver.
          </p>
        </div>

        {utilisateurs.length === 0 ? (
          <div className="card-pad">
            <EmptyState
              icon={Users}
              title="Aucun compte"
              description="Créez un premier compte pour votre équipe."
              action={
                <Button
                  icon={Plus}
                  onClick={() => setModale({ mode: 'creation' })}
                  disabled={!isOnline}
                  title={!isOnline ? MESSAGE_INDISPONIBLE_HORS_LIGNE : 'Créer un compte'}
                >
                  Créer un compte
                </Button>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50/70">
                <tr>
                  <th className="th">Utilisateur</th>
                  <th className="th">Rôle</th>
                  <th className="th">État</th>
                  <th className="th">Créé le</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {utilisateurs.map((compte) => {
                  const soiMeme = compte.id === user?.id;
                  return (
                    <tr key={compte.id} className="table-row">
                      <td className="td">
                        <p className="font-semibold text-slate-900">
                          {compte.username}
                          {soiMeme && (
                            <span className="ml-2 text-xs font-medium text-slate-400">(vous)</span>
                          )}
                        </p>
                      </td>
                      <td className="td">
                        <Badge tone={TONS_ROLES[compte.role] || 'neutral'}>
                          {LIBELLES_ROLES[compte.role] || compte.role}
                        </Badge>
                      </td>
                      <td className="td">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={Boolean(compte.actif)}
                          onClick={() => basculerActif(compte)}
                          disabled={!isOnline}
                          title={!isOnline ? MESSAGE_INDISPONIBLE_HORS_LIGNE : undefined}
                          className={`inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 text-xs font-semibold transition disabled:opacity-50 ${
                            compte.actif
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded-full text-white ${
                              compte.actif ? 'bg-emerald-600' : 'bg-slate-400'
                            }`}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-white" />
                          </span>
                          {compte.actif ? 'Actif' : 'Désactivé'}
                        </button>
                      </td>
                      <td className="td whitespace-nowrap text-slate-500">
                        {formatDate(compte.created_at?.slice(0, 10))}
                      </td>
                      <td className="td">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            className="btn-icon disabled:opacity-40"
                            title={
                              !isOnline
                                ? MESSAGE_INDISPONIBLE_HORS_LIGNE
                                : 'Modifier ce compte'
                            }
                            disabled={!isOnline}
                            onClick={() => setModale({ mode: 'edition', utilisateur: compte })}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            className="btn-icon hover:text-rose-600 disabled:opacity-40"
                            title={
                              !isOnline
                                ? MESSAGE_INDISPONIBLE_HORS_LIGNE
                                : soiMeme
                                  ? 'Vous ne pouvez pas supprimer votre propre compte'
                                  : 'Supprimer ce compte'
                            }
                            disabled={soiMeme || !isOnline}
                            onClick={() => setASupprimer(compte)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-5 card-pad">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-brand-50 p-2.5 text-brand-700">
            <KeyRound size={18} />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Mots de passe</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              Les mots de passe sont chiffrés et ne peuvent pas être affichés. Pour en changer un,
              modifiez le compte et saisissez un nouveau mot de passe ; laissez le champ vide pour
              le conserver.
            </p>
          </div>
        </div>
      </Card>

      <Modal
        open={Boolean(modale)}
        onClose={() => setModale(null)}
        title={modale?.mode === 'edition' ? 'Modifier le compte' : 'Nouvel utilisateur'}
        description={
          modale?.mode === 'edition'
            ? 'Ajustez le login, le rôle, l’état ou le mot de passe.'
            : 'Renseignez les informations du nouveau compte.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setModale(null)}>
              Annuler
            </Button>
            <Button
              type="submit"
              form="formulaire-utilisateur"
              disabled={!isOnline}
              title={!isOnline ? MESSAGE_INDISPONIBLE_HORS_LIGNE : undefined}
            >
              {modale?.mode === 'edition' ? 'Enregistrer' : 'Créer le compte'}
            </Button>
          </>
        }
      >
        {modale && (
          <FormulaireUtilisateur
            key={modale.utilisateur?.id || 'creation'}
            utilisateur={modale.utilisateur}
            onClose={() => setModale(null)}
            onEnregistre={enregistrer}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(aSupprimer)}
        onClose={() => setASupprimer(null)}
        onConfirm={supprimer}
        loading={suppression}
        title="Supprimer ce compte ?"
        message={`Le compte « ${aSupprimer?.username} » sera supprimé définitivement et ne pourra plus se connecter.`}
      />
    </div>
  );
}
