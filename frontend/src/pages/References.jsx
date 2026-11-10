import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BookOpen,
  Info,
  LineChart as LineChartIcon,
  Plus,
  Trash2,
} from 'lucide-react';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Loading,
  Modal,
  PageHeader,
} from '../components/ui.jsx';
import { formatNombre } from '../lib/format.js';

export default function References() {
  const toast = useToast();

  const [souches, setSouches] = useState([]);
  const [parametres, setParametres] = useState([]);
  const [souche, setSouche] = useState('');
  const [parametreId, setParametreId] = useState('');
  const [lignes, setLignes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [chargementValeurs, setChargementValeurs] = useState(false);
  const [modaleSouche, setModaleSouche] = useState(false);
  const [nouvelleSouche, setNouvelleSouche] = useState('');
  const [jourAjout, setJourAjout] = useState('');
  const [lignesEnregistrees, setLignesEnregistrees] = useState({});

  useEffect(() => {
    let actif = true;
    Promise.all([api.get('/references/souches'), api.get('/parametres')])
      .then(([listeSouches, listeParametres]) => {
        if (!actif) return;
        const numeriques = listeParametres.filter(
          (p) => p.type_valeur === 'nombre',
        );
        setSouches(listeSouches);
        setParametres(numeriques);
        setSouche(listeSouches[0] || '');
        setParametreId(numeriques[0] ? String(numeriques[0].id) : '');
      })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => {
        if (actif) setChargement(false);
      });
    return () => { actif = false; };
  }, [toast]);

  const chargerValeurs = useCallback(async () => {
    if (!souche || !parametreId) {
      setLignes([]);
      return;
    }
    setChargementValeurs(true);
    try {
      const data = await api.get(
        `/references?parametre_id=${parametreId}&souche=${encodeURIComponent(souche)}`,
      );
      setLignes(
        data
          .map((ligne) => ({
            jour: ligne.jour,
            valeur: ligne.valeur,
            note: ligne.note || '',
            id: ligne.id,
          }))
          .sort((a, b) => a.jour - b.jour),
      );
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setChargementValeurs(false);
    }
  }, [souche, parametreId, toast]);

  useEffect(() => {
    chargerValeurs();
  }, [chargerValeurs]);

  const parametre = useMemo(
    () => parametres.find((p) => String(p.id) === String(parametreId)),
    [parametres, parametreId],
  );

  const donneesGraphique = useMemo(
    () =>
      lignes
        .map((ligne) => ({ jour: ligne.jour, valeur: Number(String(ligne.valeur).replace(',', '.')) }))
        .filter((ligne) => Number.isFinite(ligne.valeur)),
    [lignes],
  );

  const modifierLigne = (jour, champ, valeur) => {
    setLignes((actuelles) => {
      if (!actuelles.some((ligne) => ligne.jour === jour)) {
        return [...actuelles, { jour, valeur: '', note: '', id: null, [champ]: valeur }].sort(
          (a, b) => a.jour - b.jour,
        );
      }
      return actuelles.map((ligne) =>
        ligne.jour === jour ? { ...ligne, [champ]: valeur } : ligne,
      );
    });
  };

  const enregistrerLigne = async (ligne) => {
    const cle = `${ligne.jour}-${ligne.valeur}-${ligne.note}`;
    if (lignesEnregistrees[cle]) return;
    try {
      const valeur = String(ligne.valeur ?? '').trim();
      if (valeur && Number.isNaN(Number(valeur.replace(',', '.')))) {
        toast('Valeur doit être un nombre.', 'error');
        return;
      }
      await api.post('/references', {
        souche,
        parametre_id: Number(parametreId),
        jour: ligne.jour,
        valeur,
        note: ligne.note,
      });
      setLignesEnregistrees((actuel) => ({ ...actuel, [cle]: true }));
      if (valeur === '') {
        setLignes((actuelles) => actuelles.filter((item) => item.jour !== ligne.jour));
        toast('Valeur de référence supprimée.');
      } else {
        toast(`Jour ${ligne.jour} enregistré.`);
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const ajouterJour = (event) => {
    event.preventDefault();
    const jour = Number(jourAjout);
    if (!Number.isInteger(jour) || jour < 1) {
      toast('Indiquez un jour valide (1 ou plus).', 'error');
      return;
    }
    if (lignes.some((ligne) => ligne.jour === jour)) {
      toast('Ce jour existe déjà pour cette souche.', 'error');
      return;
    }
    setLignes((actuelles) =>
      [...actuelles, { jour, valeur: '', note: '', id: null }].sort((a, b) => a.jour - b.jour),
    );
    setJourAjout('');
  };

  const supprimerLigne = async (ligne) => {
    try {
      await api.post('/references', {
        souche,
        parametre_id: Number(parametreId),
        jour: ligne.jour,
        valeur: '',
      });
      setLignes((actuelles) => actuelles.filter((item) => item.jour !== ligne.jour));
      toast('Valeur de référence supprimée.');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const creerSouche = (event) => {
    event.preventDefault();
    const nom = nouvelleSouche.trim();
    if (!nom) return;
    setSouches((actuelles) =>
      [...new Set([...actuelles, nom])].sort((a, b) => a.localeCompare(b, 'fr')),
    );
    setSouche(nom);
    setNouvelleSouche('');
    setModaleSouche(false);
    toast(`Souche « ${nom} » sélectionnée. Enregistrez une première valeur.`);
  };

  if (chargement) return <Loading />;

  const aucuneSouche = souches.length === 0;
  const nbNumeriques = parametres.filter(p => p.type_valeur === 'nombre').length || 0;

  return (
    <div>
      <PageHeader
        eyebrow="Objectifs de croissance"
        title="Références par souche"
        subtitle="Définissez les valeurs cibles jour par jour pour chaque souche. Elles servent de comparaison dans les graphiques et les indicateurs."
        actions={
          <Button
            variant="secondary"
            icon={Plus}
            onClick={() => setModaleSouche(true)}
          >
            Nouvelle souche
          </Button>
        }
      />

      <Alert tone="info" icon={Info} title="Comment ça marche ?">
        Les références sont propres à chaque souche et à chaque paramètre. Les relevés réels
        de vos cycles sont comparés à ces valeurs jour par jour. Pour l'aliment, saisissez la
        consommation <strong>journalière</strong> de référence.
      </Alert>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
        <Card>
          <div className="flex flex-wrap items-end gap-4 border-b border-slate-100 px-5 py-4">
            <Field label="Souche" htmlFor="ref-souche" className="min-w-[180px] flex-1">
              <select
                id="ref-souche"
                className="input"
                value={souche}
                onChange={(event) => setSouche(event.target.value)}
                disabled={aucuneSouche}
              >
                {aucuneSouche && <option value="">Aucune souche</option>}
                {souches.map((nom) => (
                  <option key={nom} value={nom}>
                    {nom}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Paramètre" htmlFor="ref-parametre" className="min-w-[180px] flex-1">
              <select
                id="ref-parametre"
                className="input"
                value={parametreId}
                onChange={(event) => setParametreId(event.target.value)}
              >
                {parametres.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.libelle}
                    {item.unite ? ` (${item.unite})` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <p className="pb-2.5 text-xs text-slate-500">
              {lignes.length} jour(s) de référence.
            </p>
          </div>

          {aucuneSouche ? (
            <div className="card-pad">
              <EmptyState
                icon={BookOpen}
                title="Aucune souche de référence"
                description="Créez une souche puis saisissez ses objectifs de croissance."
                action={
                  <Button icon={Plus} onClick={() => setModaleSouche(true)}>
                    Créer une souche
                  </Button>
                }
              />
            </div>
          ) : chargementValeurs ? (
            <Loading label="Chargement des références…" />
          ) : (
            <div className="overflow-y-auto max-h-[600px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="th w-24 bg-slate-50">Jour</th>
                    <th className="th bg-slate-50">Valeur{parametre?.unite ? ` (${parametre.unite})` : ''}</th>
                    <th className="th bg-slate-50">Note</th>
                    <th className="th w-12 bg-slate-50" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Array.from({ length: 45 }, (_, index) => {
                    const jour = index + 1;
                    const ligne = lignes.find((ligne) => ligne.jour === jour);
                    return (
                      <tr key={jour} className={jour % 2 ? 'bg-slate-50/60' : ''}>
                        <td className="td font-semibold text-slate-800">J{jour}</td>
                        <td className="td">
                          <input
                            className="input py-1.5"
                            type="number"
                            step="any"
                            aria-label={`Valeur du jour ${jour}`}
                            value={ligne?.valeur ?? ''}
                            onChange={(event) =>
                              modifierLigne(jour, 'valeur', event.target.value)
                            }
                            onBlur={() => ligne && enregistrerLigne(ligne)}
                            placeholder="0"
                          />
                        </td>
                        <td className="td">
                          <input
                            className="input py-1.5"
                            aria-label={`Note du jour ${jour}`}
                            value={ligne?.note ?? ''}
                            onChange={(event) =>
                              modifierLigne(jour, 'note', event.target.value)
                            }
                            onBlur={() => ligne && enregistrerLigne(ligne)}
                            placeholder="Objectif, remarque…"
                          />
                        </td>
                        <td className="td">
                          <button
                            type="button"
                            className="btn-icon hover:text-rose-600"
                            title="Supprimer ce jour"
                            onClick={() => ligne && supprimerLigne(ligne)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Courbe de référence</h2>
                <p className="text-xs text-slate-500">{souche || 'Aucune souche'}</p>
              </div>
              <span className="rounded-lg bg-brand-50 p-2 text-brand-700">
                <LineChartIcon size={17} />
              </span>
            </div>
            <div className="card-pad">
              {donneesGraphique.length < 2 ? (
                <p className="py-12 text-center text-sm text-slate-500">
                  Ajoutez au moins deux jours pour afficher la courbe.
                </p>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={donneesGraphique} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f0" vertical={false} />
                      <XAxis dataKey="jour" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                        labelFormatter={(jour) => `Jour ${jour}`}
                        formatter={(valeur) => [
                          `${formatNombre(valeur, 3)} ${parametre?.unite || ''}`,
                          parametre?.libelle || 'Référence',
                        ]}
                      />
                      <Line
                        type="monotone"
                        dataKey="valeur"
                        stroke="#2f7049"
                        strokeWidth={2.5}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </Card>

          <Card className="card-pad">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-amber-50 p-2.5 text-amber-700">
                <Info size={18} />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Bon à savoir</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">
                  Le poids de référence permet de calculer l'écart de croissance du cycle.
                  L'aliment sert à comparer la consommation cumulée. Vous pouvez modifier ces
                  valeurs à tout moment : les graphiques se mettent à jour.
                </p>
                {parametre && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge tone="brand">Unité : {parametre.unite || '—'}</Badge>
                    <Badge tone="neutral">Nom technique : {parametre.nom}</Badge>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={modaleSouche}
        onClose={() => setModaleSouche(false)}
        title="Nouvelle souche"
        description="Créez une souche pour lui associer ses propres références de croissance."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModaleSouche(false)}>
              Annuler
            </Button>
            <Button type="submit" form="formulaire-souche">
              Créer
            </Button>
          </>
        }
      >
        <form id="formulaire-souche" onSubmit={creerSouche} className="space-y-4">
          <Field label="Nom de la souche" htmlFor="nouvelle-souche" hint="Ex. : Activo, Ross 308, Hubbard…">
            <input
              id="nouvelle-souche"
              className="input"
              value={nouvelleSouche}
              onChange={(event) => setNouvelleSouche(event.target.value)}
              placeholder="Ross 308"
              autoFocus
              required
            />
          </Field>
          <p className="text-xs text-slate-500">
            La souche ne sera enregistrée qu'au moment de la première valeur de référence.
          </p>
        </form>
      </Modal>
    </div>
  );
}
