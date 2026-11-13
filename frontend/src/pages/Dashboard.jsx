import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowRight,
  Bird,
  Layers,
  Plus,
  Scale,
  Wallet,
  Activity,
} from 'lucide-react';
import { api } from '../api.js';
import { useSettings } from '../context/SettingsContext.jsx';
import useOnlineStatus, {
  MESSAGE_INDISPONIBLE_HORS_LIGNE,
} from '../hooks/useOnlineStatus.js';
import usePeutModifier, { MESSAGE_LECTURE_SEULE } from '../hooks/usePermissions.js';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Loading,
  PageHeader,
  StatCard,
} from '../components/ui.jsx';
import {
  formatMontant,
  formatNombre,
  formatPourcentage,
} from '../lib/format.js';

const COULEURS = [
  '#2f7049',
  '#63a97f',
  '#0ea5e9',
  '#f59e0b',
  '#8b5cf6',
  '#e11d48',
  '#14b8a6',
  '#94a3b8',
];

function CarteCycle({ cycle, settings }) {
  const { stats } = cycle;
  const alerte = stats.mortalite_alerte;
  const progression = Math.min(100, Math.max(0, (stats.taux_mortalite / (settings.seuil_mortalite_alerte || 5)) * 100));

  return (
    <Link
      to={`/cycles/${cycle.id}`}
      className="group block rounded-xl border border-slate-200 bg-white px-4 py-4 transition hover:border-brand-300 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900 group-hover:text-brand-800">
            {cycle.nom}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {cycle.souche || 'Souche non précisée'} · Jour {stats.age_jours}
          </p>
        </div>
        <Badge tone={alerte ? 'danger' : 'success'}>
          {alerte ? <AlertTriangle size={12} /> : <Activity size={12} />}
          {formatPourcentage(stats.taux_mortalite)}
        </Badge>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${alerte ? 'bg-rose-500' : 'bg-brand-500'}`}
          style={{ width: `${progression}%` }}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-slate-400">
        Seuil d’alerte : {formatPourcentage(settings.seuil_mortalite_alerte, 0)}
      </p>

      <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-xs">
        <div>
          <dt className="text-slate-400">Effectif</dt>
          <dd className="mt-0.5 font-semibold text-slate-800">
            {formatNombre(stats.effectif_vivant, 0)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Poids moyen</dt>
          <dd className="mt-0.5 font-semibold text-slate-800">
            {stats.poids_moyen !== null ? `${formatNombre(stats.poids_moyen, 3)} ${stats.poids_moyen_unite || 'kg'}` : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Coût total</dt>
          <dd className="mt-0.5 font-semibold text-slate-800">
            {formatMontant(stats.cout_total, settings)}
          </dd>
        </div>
      </dl>
    </Link>
  );
}

export default function Dashboard() {
  const { settings } = useSettings();
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const peutModifier = usePeutModifier();
  const [data, setData] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    let actif = true;
    api
      .get('/dashboard')
      .then((resultat) => {
        if (actif) setData(resultat);
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
  }, []);

  const donneesMortalite = useMemo(
    () =>
      (data?.actifs || []).map((cycle) => ({
        nom: cycle.nom.length > 14 ? `${cycle.nom.slice(0, 14)}…` : cycle.nom,
        mortalite: Number(cycle.stats.taux_mortalite.toFixed(2)),
      })),
    [data],
  );

  const charges = useMemo(
    () =>
      (data?.charges_par_categorie || []).map((ligne) => ({
        nom: ligne.categorie,
        valeur: ligne.montant,
      })),
    [data],
  );

  if (chargement) return <Loading />;
  if (erreur) return <Alert tone="danger">{erreur}</Alert>;

  const { totaux, actifs } = data;

  return (
    <div>
      <PageHeader
        eyebrow="Vue d’ensemble"
        title="Tableau de bord"
        subtitle="Suivez en un coup d’œil l’état de vos bandes, la mortalité et les coûts engagés."
        actions={
          <Button
            icon={Plus}
            onClick={() => navigate('/cycles', { state: { nouveau: true } })}
            disabled={!isOnline || !peutModifier}
            title={!isOnline ? MESSAGE_INDISPONIBLE_HORS_LIGNE : !peutModifier ? MESSAGE_LECTURE_SEULE : 'Créer un cycle'}
          >
            Nouveau cycle
          </Button>
        }
      />

      {totaux.alertes > 0 && (
        <div className="mb-5">
          <Alert
            tone="danger"
            title={`${totaux.alertes} cycle${totaux.alertes > 1 ? 's' : ''} au-dessus du seuil de mortalité`}
          >
            Vérifiez les bandes concernées : la mortalité dépasse{' '}
            {formatPourcentage(settings.seuil_mortalite_alerte, 0)} de l’effectif initial.
          </Alert>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Cycles en cours"
          value={totaux.cycles_actifs}
          hint={`${totaux.cycles_total} cycle(s) au total`}
          icon={Layers}
        />
        <StatCard
          label="Effectif vivant"
          value={formatNombre(totaux.effectif_vivant, 0)}
          unite="sujets"
          hint={`${formatNombre(totaux.poussins_actifs, 0)} poussins mis en place`}
          icon={Bird}
          tone="sky"
        />
        <StatCard
          label="Mortalité moyenne"
          value={formatPourcentage(totaux.mortalite_moyenne)}
          hint={`${formatNombre(totaux.total_morts, 0)} morts cumulés`}
          icon={Activity}
          tone={totaux.mortalite_moyenne > (settings.seuil_mortalite_alerte || 5) ? 'rose' : 'amber'}
        />
        <StatCard
          label="Coûts cumulés"
          value={formatMontant(totaux.charges_totales, settings)}
          hint="Poulettes et charges confondues"
          icon={Wallet}
          tone="violet"
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Cycles en cours</h2>
              <p className="text-xs text-slate-500">
                Progression de la mortalité par rapport au seuil d’alerte
              </p>
            </div>
            <Link
              to="/cycles"
              className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-900"
            >
              Tout voir <ArrowRight size={15} />
            </Link>
          </div>
          <div className="card-pad">
            {actifs.length === 0 ? (
              <EmptyState
                icon={Layers}
                title="Aucun cycle en cours"
                description="Créez votre première bande pour commencer à enregistrer les relevés."
                action={
                  <Button
                    icon={Plus}
                    onClick={() => navigate('/cycles', { state: { nouveau: true } })}
                    disabled={!isOnline || !peutModifier}
                    title={!isOnline ? MESSAGE_INDISPONIBLE_HORS_LIGNE : !peutModifier ? MESSAGE_LECTURE_SEULE : 'Créer un cycle'}
                  >
                    Créer un cycle
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {actifs.map((cycle) => (
                  <CarteCycle key={cycle.id} cycle={cycle} settings={settings} />
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">Répartition des charges</h2>
            <p className="text-xs text-slate-500">Tous cycles confondus</p>
          </div>
          <div className="card-pad">
            {charges.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="Aucune charge enregistrée"
                description="Ajoutez vos achats d’aliment et frais divers depuis un cycle."
              />
            ) : (
              <>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={charges}
                        dataKey="valeur"
                        nameKey="nom"
                        innerRadius={48}
                        outerRadius={78}
                        paddingAngle={2}
                        strokeWidth={0}
                      >
                        {charges.map((entree, index) => (
                          <Cell key={entree.nom} fill={COULEURS[index % COULEURS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(valeur) => formatMontant(valeur, settings)}
                        contentStyle={{
                          borderRadius: 12,
                          border: '1px solid #e2e8f0',
                          fontSize: 12,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="mt-3 space-y-2">
                  {charges.slice(0, 6).map((entree, index) => (
                    <li
                      key={entree.nom}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
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
              </>
            )}
          </div>
        </Card>
      </div>

      {donneesMortalite.length > 0 && (
        <Card className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Comparaison de la mortalité
              </h2>
              <p className="text-xs text-slate-500">
                Taux cumulé des cycles actifs, avec le seuil d’alerte
              </p>
            </div>
            <Badge tone="warning">
              <AlertTriangle size={12} /> Seuil {formatPourcentage(settings.seuil_mortalite_alerte, 0)}
            </Badge>
          </div>
          <div className="card-pad">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={donneesMortalite} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f0" vertical={false} />
                  <XAxis
                    dataKey="nom"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    unit="%"
                  />
                  <Tooltip
                    formatter={(valeur) => [formatPourcentage(valeur), 'Mortalité']}
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid #e2e8f0',
                      fontSize: 12,
                    }}
                  />
                  <ReferenceLine
                    y={Number(settings.seuil_mortalite_alerte) || 5}
                    stroke="#e11d48"
                    strokeDasharray="4 4"
                  />
                  <Bar dataKey="mortalite" radius={[6, 6, 0, 0]} maxBarSize={64}>
                    {donneesMortalite.map((entree) => (
                      <Cell
                        key={entree.nom}
                        fill={
                          entree.mortalite > (settings.seuil_mortalite_alerte || 5)
                            ? '#e11d48'
                            : '#3f8b5e'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Card className="card-pad">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-brand-50 p-2.5 text-brand-700">
              <Scale size={19} />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Indicateurs clés</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">
                L’indice de consommation et le coût par kilo sont calculés
                automatiquement à partir de vos relevés de poids et d’aliment.
              </p>
              <Link
                to="/references"
                className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-900"
              >
                Gérer les références <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </Card>
        <Card className="card-pad">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-amber-50 p-2.5 text-amber-700">
              <Bird size={19} />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Paramètres de suivi</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">
                Ajoutez ou désactivez les paramètres relevés chaque jour : poids,
                aliment, eau, température, observations…
              </p>
              <Link
                to="/parametres"
                className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-900"
              >
                Configurer le suivi <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
