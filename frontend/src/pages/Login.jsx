import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bird,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  TrendingUp,
  Wallet,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Alert, Button, Field } from '../components/ui.jsx';

const ARGUMENTS = [
  {
    icon: TrendingUp,
    titre: 'Suivez chaque bande au quotidien',
    texte: 'Poids, aliment, eau et mortalité comparés aux références de la souche.',
  },
  {
    icon: Wallet,
    titre: 'Maîtrisez vos coûts de production',
    texte: 'Charges, coût par kilo et indice de consommation calculés automatiquement.',
  },
  {
    icon: ShieldCheck,
    titre: 'Des références 100 % paramétrables',
    texte: 'Vos propres souches, vos propres objectifs de croissance.',
  },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [afficherMotDePasse, setAfficherMotDePasse] = useState(false);
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  const destination = location.state?.from?.pathname || '/';

  const soumettre = async (event) => {
    event.preventDefault();
    setErreur('');
    setEnCours(true);
    try {
      await login(username.trim(), password);
      navigate(destination, { replace: true });
    } catch (error) {
      setErreur(error.message);
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-brand-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 15% 10%, rgba(99,169,127,0.35), transparent 55%), radial-gradient(ellipse at 90% 85%, rgba(63,139,94,0.3), transparent 50%)',
          }}
          aria-hidden="true"
        />
        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-lg ring-1 ring-white/20">
              <Bird size={26} />
            </span>
            <div>
              <p className="text-xl font-extrabold tracking-tight">Farmotic</p>
              <p className="text-xs font-medium uppercase tracking-widest text-brand-200/70">
                Suivi avicole
              </p>
            </div>
          </div>

          <h1 className="mt-14 max-w-lg text-4xl font-extrabold leading-tight tracking-tight">
            Pilotez chaque bande, de la poussinière à la vente.
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-brand-100/80">
            Une application simple et complète pour enregistrer vos relevés,
            surveiller la mortalité et comparer vos performances aux objectifs de
            croissance.
          </p>

          <ul className="mt-10 space-y-5">
            {ARGUMENTS.map((argument) => (
              <li key={argument.titre} className="flex gap-3.5">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-brand-100 ring-1 ring-white/10">
                  <argument.icon size={18} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{argument.titre}</p>
                  <p className="mt-0.5 max-w-sm text-sm leading-relaxed text-brand-100/70">
                    {argument.texte}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-brand-200/50">
          © {new Date().getFullYear()} Farmotic · Gestion des poulets de chair
        </p>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-700 text-white shadow-sm">
              <Bird size={24} />
            </span>
            <div>
              <p className="text-lg font-extrabold tracking-tight text-brand-950">
                Farmotic
              </p>
              <p className="text-[11px] font-medium uppercase tracking-widest text-slate-400">
                Suivi avicole
              </p>
            </div>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Connexion
          </h2>
          <p className="mt-1.5 text-sm text-slate-500">
            Accédez au suivi de vos cycles d’élevage.
          </p>

          <form onSubmit={soumettre} className="mt-7 space-y-4">
            {erreur && <Alert tone="danger">{erreur}</Alert>}

            <Field label="Login" htmlFor="username">
              <input
                id="username"
                name="username"
                className="input"
                type="text"
                autoComplete="username"
                autoFocus
                placeholder="admin"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </Field>

            <Field label="Mot de passe" htmlFor="password">
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  className="input pr-11"
                  type={afficherMotDePasse ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setAfficherMotDePasse((valeur) => !valeur)}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 transition hover:text-slate-600"
                  aria-label={
                    afficherMotDePasse
                      ? 'Masquer le mot de passe'
                      : 'Afficher le mot de passe'
                  }
                >
                  {afficherMotDePasse ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </Field>

            <Button
              type="submit"
              className="w-full"
              disabled={enCours}
              icon={enCours ? undefined : ArrowRight}
            >
              {enCours ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Connexion…
                </>
              ) : (
                'Se connecter'
              )}
            </Button>
          </form>

          <div className="mt-7 rounded-xl border border-slate-200 bg-white/60 p-4">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <LockKeyhole size={13} />
              Compte de démonstration
            </p>
            <p className="mt-1.5 text-sm text-slate-600">
              Login <span className="font-semibold text-slate-900">admin</span> ·
              Mot de passe <span className="font-semibold text-slate-900">admin</span>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
