import { NavLink, Outlet, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { usePermissions, menuPerm } from '../hooks/usePermissions.js';
import { MODULES } from '../config/modules.js';
import Icon from '../components/Icon.jsx';
import AiChat from '../components/AiChat.jsx';

// Redirect route lama: /master & /pricelist -> /cfg
const LEGACY = { master: '/cfg', pricelist: '/cfg' };

export default function AppLayout() {
  const { user, logout } = useAuth();
  const { can } = usePermissions();
  const location = useLocation();

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  const redirect = LEGACY[location.pathname.replace('/', '')];
  if (redirect) return <Navigate to={redirect} replace />;

  const current =
    MODULES.find((m) => m.path === location.pathname) ||
    MODULES.find((m) => m.id === 'dashboard');

  const isNavVisible = (m) => !m.group && can(menuPerm(m.id)) && !m.hide;
  // Judul grup hanya tampil bila ada item terlihat di bawahnya (sebelum grup berikut)
  const isGroupVisible = (i) => {
    for (let j = i + 1; j < MODULES.length; j++) {
      if (MODULES[j].group) break;
      if (isNavVisible(MODULES[j])) return true;
    }
    return false;
  };

  const initials = user.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col fixed inset-y-0 z-40">
        <div className="px-5 py-5 flex items-center gap-3 border-b border-slate-100">
          <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center text-white shadow-lg shadow-brand-600/30">
            <Icon name="logo" className="w-5 h-5" strokeWidth={2} />
          </div>
          <div>
            <h1 className="font-bold text-slate-900 leading-tight text-sm">Pusat Data Bantuan</h1>
            <p className="text-[11px] text-slate-400">Sinkron dari Google Sheets</p>
          </div>
        </div>

        <nav className="flex-1 py-4 text-sm overflow-y-auto scrollbar-thin">
          {MODULES.map((m, i) => {
            if (m.group) {
              if (!isGroupVisible(i)) return null;
              return (
                <p
                  key={`g-${i}`}
                  className={`px-5 ${m.group === 'Menu Utama' ? '' : 'pt-5'} pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400`}
                >
                  {m.group}
                </p>
              );
            }
            if (!isNavVisible(m)) return null;
            return (
              <NavLink key={m.id} to={m.path} className="shell-nav">
                <Icon name={m.id === 'kasus' ? 'cases' : m.id} />
                {m.title}
              </NavLink>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-white flex items-center justify-center text-xs font-bold">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{user.name}</p>
              <p className="text-[11px] text-slate-400 truncate">
                {user.role} · {user.email}
              </p>
            </div>
            {can('settings') && (
              <NavLink
                to="/settings"
                title="Pengaturan"
                aria-label="Pengaturan akun"
                className="shrink-0 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg p-2 transition"
              >
                <Icon name="settings" className="w-5 h-5" strokeWidth={1.8} />
              </NavLink>
            )}
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 px-4 py-2 rounded-lg transition"
          >
            <Icon name="logout" className="w-4 h-4" strokeWidth={2} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="ml-64 flex flex-col min-h-screen">
        <header className="shrink-0 bg-white/80 backdrop-blur border-b border-slate-200 px-4 md:px-5 py-3.5 flex items-center gap-4 z-30 sticky top-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{current?.title || 'Dashboard'}</h2>
            <p className="text-xs text-slate-400">{current?.sub || '—'}</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 bg-slate-100 rounded-lg px-3 py-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Data dari Google Sheets
            </div>
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 bg-brand-50 border border-brand-100 rounded-lg px-3 py-2">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                />
              </svg>
              {user.role}
            </span>
          </div>
        </header>

        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </main>
      <AiChat />
    </div>
  );
}
