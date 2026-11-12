import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Layers,
  BookOpen,
  Settings,
  LogOut,
  Menu,
  X,
  Bird,
  CalendarDays,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import OfflineBanner from './OfflineBanner.jsx';
import { formatDateLongue, aujourdhuiISO } from '../lib/format.js';

const NAVIGATION = [
  { to: '/', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
  { to: '/cycles', label: 'Cycles d’élevage', icon: Layers },
  { to: '/references', label: 'Références', icon: BookOpen },
  { to: '/parametres', label: 'Paramètres', icon: Settings },
];

// Visible uniquement pour les administrateurs.
const NAVIGATION_ADMIN = {
  to: '/utilisateurs',
  label: 'Utilisateurs',
  icon: Users,
};

const LIBELLES_ROLES = {
  admin: 'Administrateur',
  operateur: 'Opérateur',
  lecteur: 'Lecteur',
};

function initiales(username = '') {
  return username.slice(0, 2).toUpperCase();
}

export default function Layout() {
  const { user, logout } = useAuth();
  const [menuOuvert, setMenuOuvert] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const navigation =
    user?.role === 'admin' ? [...NAVIGATION, NAVIGATION_ADMIN] : NAVIGATION;

  useEffect(() => {
    setMenuOuvert(false);
  }, [location.pathname]);

  const deconnecter = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-canvas">
      {menuOuvert && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMenuOuvert(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-brand-950 transition-transform duration-200 lg:translate-x-0 ${
          menuOuvert ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              'radial-gradient(ellipse at 20% 0%, rgba(63,139,94,0.35), transparent 60%), radial-gradient(ellipse at 100% 100%, rgba(63,139,94,0.18), transparent 55%)',
          }}
          aria-hidden="true"
        />

        <div className="relative flex items-center justify-between px-5 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/90 text-white shadow-lg shadow-brand-950/40 ring-1 ring-white/20">
              <Bird size={23} strokeWidth={2} />
            </span>
            <div>
              <p className="text-lg font-extrabold tracking-tight text-white">Farmotic</p>
              <p className="text-[11px] font-medium uppercase tracking-wider text-brand-200/70">
                Suivi avicole
              </p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-brand-100/70 hover:bg-white/10 lg:hidden"
            onClick={() => setMenuOuvert(false)}
            aria-label="Fermer le menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="relative mt-2 flex-1 space-y-1 px-3">
          <p className="px-3 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-widest text-brand-200/50">
            Pilotage
          </p>
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `nav-item ${isActive ? 'nav-item-active' : ''}`
              }
            >
              <item.icon size={18} strokeWidth={2} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="relative border-t border-white/10 p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-xs font-bold text-brand-100 ring-1 ring-white/15">
              {initiales(user?.username)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{user?.username}</p>
              <p className="text-[11px] text-brand-200/60">
                {LIBELLES_ROLES[user?.role] || 'Éleveur'}
              </p>
            </div>
            <button
              type="button"
              onClick={deconnecter}
              className="rounded-lg p-2 text-brand-100/70 transition hover:bg-white/10 hover:text-white"
              title="Se déconnecter"
              aria-label="Se déconnecter"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-slate-200/80 bg-canvas/85 px-4 backdrop-blur sm:px-6 lg:hidden">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              className="btn-icon"
              onClick={() => setMenuOuvert(true)}
              aria-label="Ouvrir le menu"
            >
              <Menu size={20} />
            </button>
            <span className="flex items-center gap-2 text-base font-extrabold text-brand-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-700 text-white">
                <Bird size={17} />
              </span>
              Farmotic
            </span>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">
            {initiales(user?.username)}
          </span>
        </header>

        <OfflineBanner />

        <div className="hidden items-center justify-between gap-4 px-8 pt-6 text-xs text-slate-500 lg:flex">
          <span className="inline-flex items-center gap-2">
            <CalendarDays size={14} className="text-brand-600" />
            {formatDateLongue(aujourdhuiISO())}
          </span>
          <span className="inline-flex items-center gap-2 font-medium text-slate-400">
            Ferme avicole · Gestion des poulets de chair
          </span>
        </div>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
