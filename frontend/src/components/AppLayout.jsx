import { NavLink, Outlet, useLocation, Navigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import { useAuth } from '../context/AuthContext.jsx';
import { usePermissions, menuPerm } from '../hooks/usePermissions.js';
import { MODULES } from '../config/modules.js';
import { getJSON, set as simpan } from '../lib/storage.js';
import Icon from '../components/Icon.jsx';
import AiChat from '../components/AiChat.jsx';

// Design Read: shell admin untuk staf operasional, bahasa brand indigo Revota,
// dial ENERGY 2 / RHYTHM 2 / MOTION 2.
// R-31: satu pegas untuk semua gerak shell (stiffness 380/damping 38) = terasa
// fisik dan cepat tanpa memantul berlebihan; drawer mobile bisa di-swipe
// karena sebagian pengguna operasional bekerja dari HP.
const PEGAS_SHELL = { type: 'spring', stiffness: 380, damping: 38 };
const KUNCI_CiUT = 'shellCollapsed';

// Redirect route lama: /master & /pricelist -> /cfg
const LEGACY = { master: '/cfg', pricelist: '/cfg' };

function navTerlihat(m, can) {
  return !m.group && can(menuPerm(m.id)) && !m.hide;
}

// Judul grup hanya tampil bila ada item terlihat di bawahnya (sebelum grup berikut)
function grupTerlihat(i, can) {
  for (let j = i + 1; j < MODULES.length; j++) {
    if (MODULES[j].group) break;
    if (navTerlihat(MODULES[j], can)) return true;
  }
  return false;
}

// Isi sidebar dipakai dua tempat: panel desktop (bisa diciutkan) dan drawer
// mobile (selalu penuh). `ciut` hanya true di desktop.
function IsiSidebar({ ciut, saatNavigasi = () => {}, pengguna, keluar, bisa, saklarCiut, refTutup = null }) {
  const inisial = pengguna.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className={`flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 ${ciut ? 'flex-col px-0 py-5' : 'px-5 py-5'}`}>
        <div className="w-10 h-10 shrink-0 rounded-xl bg-brand-600 flex items-center justify-center text-white shadow-lg shadow-brand-600/30">
          <Icon name="logo" className="w-5 h-5" strokeWidth={2} />
        </div>
        {!ciut && (
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-slate-900 dark:text-white leading-tight text-sm">Pusat Data Bantuan</h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Sinkron dari Google Sheets</p>
          </div>
        )}
        {/* Tombol tutup khusus drawer mobile */}
        <button
          ref={refTutup}
          type="button"
          onClick={saatNavigasi}
          aria-label="Tutup navigasi"
          className="lg:hidden w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        {/* Tombol ciut/luas khusus desktop */}
        <button
          type="button"
          onClick={saklarCiut}
          aria-expanded={!ciut}
          aria-label={ciut ? 'Luaskan sidebar' : 'Ciutkan sidebar'}
          title={ciut ? 'Luaskan sidebar' : 'Ciutkan sidebar'}
          className="hidden lg:inline-flex w-11 h-11 shrink-0 items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
        >
          <svg
            className={`w-5 h-5 transition-transform duration-300 ${ciut ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
      </div>

      <nav aria-label="Navigasi utama" className="flex-1 py-4 text-sm overflow-y-auto overflow-x-hidden scrollbar-thin">
        {MODULES.map((m, i) => {
          if (m.group) {
            if (ciut || !grupTerlihat(i, bisa)) return null;
            return (
              <p
                key={`g-${i}`}
                className={`px-5 ${m.group === 'Menu Utama' ? '' : 'pt-5'} pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 whitespace-nowrap`}
              >
                {m.group}
              </p>
            );
          }
          if (!navTerlihat(m, bisa)) return null;
          return (
            <NavLink
              key={m.id}
              to={m.path}
              onClick={saatNavigasi}
              title={ciut ? m.title : undefined}
              className={`shell-nav ${ciut ? 'lg:justify-center lg:px-0' : ''}`}
            >
              <Icon name={m.id === 'kasus' ? 'cases' : m.id} />
              {!ciut && <span className="truncate">{m.title}</span>}
            </NavLink>
          );
        })}
      </nav>

      <div className={`border-t border-slate-100 dark:border-slate-800 ${ciut ? 'p-2 flex flex-col items-center gap-2' : 'p-4'}`}>
        {!ciut ? (
          <>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-white flex items-center justify-center text-xs font-bold">
                {inisial}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{pengguna.name}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {pengguna.role} · {pengguna.email}
                </p>
              </div>
              {bisa('settings') && (
                <NavLink
                  to="/settings"
                  onClick={saatNavigasi}
                  title="Pengaturan"
                  aria-label="Pengaturan akun"
                  className="shrink-0 text-slate-500 dark:text-slate-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-slate-800 rounded-lg p-2 transition"
                >
                  <Icon name="settings" className="w-5 h-5" strokeWidth={1.8} />
                </NavLink>
              )}
            </div>
            <button
              onClick={keluar}
              className="w-full min-h-[44px] flex items-center justify-center gap-2 text-sm font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 px-4 py-2 rounded-lg transition"
            >
              <Icon name="logout" className="w-4 h-4" strokeWidth={2} />
              Logout
            </button>
          </>
        ) : (
          <>
            <div
              title={`${pengguna.name} · ${pengguna.role}`}
              className="w-11 h-11 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-white hidden lg:flex items-center justify-center text-xs font-bold"
            >
              {inisial}
            </div>
            <button
              onClick={keluar}
              title="Logout"
              aria-label="Logout"
              className="hidden lg:inline-flex w-11 h-11 items-center justify-center rounded-xl text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60"
            >
              <Icon name="logout" className="w-4 h-4" strokeWidth={2} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const { can } = usePermissions();
  const location = useLocation();
  // Drawer di layar kecil: hamburger membuka, overlay / swipe / Escape /
  // klik menu menutup.
  const [navBuka, setNavBuka] = useState(false);
  // Sidebar desktop bisa diciutkan; preferensi tersimpan (lib/storage.js).
  const [ciut, setCiut] = useState(() => getJSON(KUNCI_CiUT, false) === true);
  const refTutup = useRef(null);

  const saklarCiut = () => {
    setCiut((c) => {
      simpan(KUNCI_CiUT, !c);
      return !c;
    });
  };

  useEffect(() => {
    if (!navBuka) return;
    function saatTombol(e) {
      if (e.key === 'Escape') setNavBuka(false);
    }
    document.addEventListener('keydown', saatTombol);
    // Kunci scroll body selama drawer terbuka + fokus ke tombol tutup (R-32)
    const gayaAwal = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    refTutup.current?.focus();
    return () => {
      document.removeEventListener('keydown', saatTombol);
      document.body.style.overflow = gayaAwal;
    };
  }, [navBuka]);

  // Ganti halaman (termasuk dari dalam) selalu menutup drawer mobile.
  useEffect(() => {
    setNavBuka(false);
  }, [location.pathname]);

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  const redirect = LEGACY[location.pathname.replace('/', '')];
  if (redirect) return <Navigate to={redirect} replace />;

  const saatIni =
    MODULES.find((m) => m.path === location.pathname) ||
    MODULES.find((m) => m.id === 'dashboard');

  const tutupDrawer = () => setNavBuka(false);

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen">
        {/* Sidebar desktop: diciutkan sesuai preferensi */}
        <motion.aside
          aria-label="Navigasi utama"
          className="hidden lg:block fixed inset-y-0 left-0 z-40 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 overflow-hidden"
          initial={false}
          animate={{ width: ciut ? 80 : 256 }}
          transition={PEGAS_SHELL}
        >
          <IsiSidebar
            ciut={ciut}
            pengguna={user}
            keluar={logout}
            bisa={can}
            saklarCiut={saklarCiut}
          />
        </motion.aside>

        {/* Drawer mobile: swipe untuk menutup */}
        <AnimatePresence>
          {navBuka && (
            <>
              <motion.button
                key="latar"
                type="button"
                onClick={tutupDrawer}
                aria-label="Tutup navigasi"
                className="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-[2px] lg:hidden cursor-default"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
              <motion.aside
                key="laci"
                id="navigasi-seluler"
                role="dialog"
                aria-modal="true"
                aria-label="Navigasi utama"
                className="lg:hidden fixed inset-y-0 left-0 z-40 w-[280px] max-w-[85vw] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col"
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={PEGAS_SHELL}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.25}
                dragMomentum={false}
                onDragEnd={(_, info) => {
                  if (info.offset.x < -90 || info.velocity.x < -500) setNavBuka(false);
                }}
              >
                <IsiSidebar
                  ciut={false}
                  saatNavigasi={tutupDrawer}
                  pengguna={user}
                  keluar={logout}
                  bisa={can}
                  saklarCiut={saklarCiut}
                  refTutup={refTutup}
                />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Main */}
        <main className={`shell-main flex flex-col min-h-screen ${ciut ? 'lg:ml-20' : 'lg:ml-64'}`}>
          <header className="shrink-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 md:px-5 py-3.5 flex items-center gap-3 z-30 sticky top-0">
            <button
              type="button"
              onClick={() => setNavBuka((o) => !o)}
            aria-expanded={navBuka}
            aria-controls={navBuka ? 'navigasi-seluler' : undefined}
              aria-label="Buka navigasi"
              className="lg:hidden w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white truncate">{saatIni?.title || 'Dashboard'}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{saatIni?.sub || '—'}</p>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                Data dari Google Sheets
              </div>
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-500/10 border border-brand-100 dark:border-brand-500/20 rounded-lg px-3 py-2">
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
    </MotionConfig>
  );
}
