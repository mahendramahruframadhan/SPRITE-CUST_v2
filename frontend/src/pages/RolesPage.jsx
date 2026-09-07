import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { DEFAULT_PERMS } from '../hooks/usePermissions.js';
import { signUp, getUsers, patchUser, deleteUser as deleteUserApi, setUserPassword, getPerms, putPerms, getLogs, postLog, getConfig, putConfig, chatAi } from '../lib/api.js';

// Koneksi AI eksternal (OpenAI-compatible) — key di backend, browser terima versi mask
const DEFAULT_AI = { provider: 'gemini', baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'gemini-2.0-flash', apiKey: '' };
const AI_PRESETS = {
  gemini: { baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'gemini-2.0-flash' },
  openai: { baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  custom: { baseURL: '', model: '' },
};

const ROLES = ['Super Admin', 'Admin CS', 'Support', 'Finance', 'Viewer'];
const ROLE_STYLE = {
  'Super Admin': 'bg-violet-50 text-violet-600 border-violet-200',
  'Admin CS': 'bg-brand-50 text-brand-700 border-brand-200',
  Support: 'bg-sky-50 text-sky-600 border-sky-200',
  Finance: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  Viewer: 'bg-slate-100 text-slate-500 border-slate-200',
};
const ROLE_DESC = {
  'Super Admin': 'Akses penuh semua modul & pengaturan',
  'Admin CS': 'Kelola kasus, master data & billing',
  Support: 'Input & tindaklanjut kasus support',
  Finance: 'Billing, price list & audit keuangan',
  Viewer: 'Hanya melihat dashboard & data kasus',
};
const MODULES = [
  { id: 'dashboard', name: 'Dashboard', desc: 'Ringkasan & grafik bantuan' },
  { id: 'cases', name: 'Data Kasus', desc: 'Lihat semua data kasus support' },
  { id: 'form', name: 'Form Kasus', desc: 'Input kasus support baru' },
  { id: 'hrreport', name: 'HR Report', desc: 'Rekap performa tim & detail ticket' },
  { id: 'cfg', name: 'Konfigurasi Sheet', desc: 'Master config dari Google Sheets' },
  { id: 'billing', name: 'Billing & Audit', desc: 'Validasi tagihan sebelum invoice' },
  { id: 'finance', name: 'Finance Audit', desc: 'Penerbitan invoice kasus tervalidasi' },
  { id: 'mockup', name: 'Dashboard Mockup', desc: 'Mockup data Google Sheets' },
  { id: 'roles', name: 'Hak Akses', desc: 'Kelola pengguna & izin' },
];
const SEED_USERS = [
  { id: 1, name: 'Rani Admin', email: 'rani@revota.id', role: 'Super Admin', active: true, lastLogin: 'Hari ini 09:12' },
  { id: 2, name: 'Budi Santoso', email: 'budi.cs@revota.id', role: 'Admin CS', active: true, lastLogin: 'Hari ini 08:47' },
  { id: 3, name: 'Sari Support', email: 'sari@revota.id', role: 'Support', active: true, lastLogin: 'Kemarin 16:20' },
  { id: 4, name: 'Fajar Finance', email: 'finance@revota.id', role: 'Finance', active: true, lastLogin: 'Hari ini 07:55' },
  { id: 5, name: 'Vina Viewer', email: 'vina@revota.id', role: 'Viewer', active: false, lastLogin: '3 hari lalu' },
];
const SEED_LOGS = [
  { who: 'Rani Admin', act: 'mengubah role Fajar Finance menjadi Finance', time: 'Hari ini 09:10' },
  { who: 'Rani Admin', act: 'menonaktifkan akun Vina Viewer', time: 'Kemarin 15:42' },
  { who: 'Budi Santoso', act: 'menambahkan pengguna baru Sari Support', time: '2 hari lalu' },
  { who: 'Rani Admin', act: 'memperbarui izin modul untuk role Support', time: '3 hari lalu' },
];

function loadLS(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v || structuredClone(fallback);
  } catch (e) {
    return structuredClone(fallback);
  }
}

const initials = (name) =>
  name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

// Waktu log dari backend ISO → tampil ringkas; string lama ditampilkan apa adanya
const fmtLogTime = (t) => {
  const d = new Date(t);
  if (isNaN(d)) return t;
  return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export default function RolesPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState(() => loadLS('appUsers', SEED_USERS));
  const [perms, setPerms] = useState(() => loadLS('appPerms', DEFAULT_PERMS));
  const [logs, setLogs] = useState(() => loadLS('appLogs', SEED_LOGS));
  const [tab, setTab] = useState('pengguna');
  const [q, setQ] = useState('');
  const [fRole, setFRole] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [modal, setModal] = useState(null); // {id?, name, email, role, active, password?}
  const [saving, setSaving] = useState(false);
  const [aiCfg, setAiCfg] = useState(DEFAULT_AI);
  const [aiKeyInput, setAiKeyInput] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [aiTest, setAiTest] = useState(null); // {ok, msg} — notif kecil di bawah tombol
  // Daftar koneksi AI (riwayat): [{id, name, provider, baseURL, model, apiKey(mask), hasKey, active}]
  const [conns, setConns] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [showAiForm, setShowAiForm] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    localStorage.setItem('appUsers', JSON.stringify(users));
    localStorage.setItem('appPerms', JSON.stringify(perms));
    localStorage.setItem('appLogs', JSON.stringify(logs));
  }, [users, perms, logs]);

  // Muat dari backend sekali saat mount; lokal sebagai fallback offline
  useEffect(() => {
    let ignore = false;
    getUsers()
      .then((r) => {
        if (!ignore && Array.isArray(r) && r.length) {
          setUsers(r.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role || 'Viewer', active: !!u.active, lastLogin: '—' })));
        }
      })
      .catch(() => {});
    getPerms()
      .then((r) => {
        if (!ignore && r && r.perms && Object.keys(r.perms).length) setPerms(r.perms);
      })
      .catch(() => {});
    getLogs()
      .then((r) => {
        if (!ignore && Array.isArray(r) && r.length) setLogs(r);
      })
      .catch(() => {});
    // Koneksi AI: daftar (key ter-mask); migrasi sekali dari aiConfig lama bila ada
    getConfig('aiConnections')
      .then((r) => {
        if (ignore) return;
        const list = r && r.config && Array.isArray(r.config.connections) ? r.config.connections : [];
        if (list.length) {
          setConns(list);
          return;
        }
        getConfig('aiConfig')
          .then((old) => {
            if (ignore || !old || !old.config || !old.config.apiKey) return;
            const c = old.config;
            const migrated = [{
              id: `ai_${Date.now()}`,
              name: 'AI Utama',
              provider: c.provider || 'gemini',
              baseURL: c.baseURL || '',
              model: c.model || '',
              hasKey: false,
              active: true,
            }];
            // ponytail: tanpa apiKey (mask tak boleh tersimpan) — chat tetap jalan via
            // fallback aiConfig lama sampai user Edit + isi key baru
            setConns(migrated);
            putConfig({ connections: migrated }, 'aiConnections').catch(() => {});
          })
          .catch(() => {});
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // Toast global halaman ini: showToast(pesan) netral, 'ok' hijau, 'err' merah
  function showToast(msg, kind) {
    setToast({ msg, kind: kind || 'info' });
  }

  function addLog(act) {
    const who = user?.name || 'Admin';
    setLogs((prev) => [{ who, act, time: 'Baru saja' }, ...prev].slice(0, 30));
    postLog(who, act).catch(() => {});
  }

  /* ---- Pengguna ---- */
  const filteredUsers = useMemo(
    () =>
      users.filter(
        (u) =>
          (u.name.toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase())) &&
          (!fRole || u.role === fRole) &&
          (!fStatus || (fStatus === 'aktif') === u.active)
      ),
    [users, q, fRole, fStatus]
  );

  async function toggleUser(id) {
    const u = users.find((x) => x.id === id);
    if (!u) return;
    const next = !u.active;
    setUsers((prev) => prev.map((x) => (x.id === id ? { ...x, active: next } : x)));
    addLog(`${next ? 'mengaktifkan' : 'menonaktifkan'} akun ${u.name}`);
    showToast(`Akun ${u.name} ${next ? 'diaktifkan' : 'dinonaktifkan'}`);
    try {
      await patchUser(id, { active: next });
    } catch {}
  }

  async function deleteUser(id) {
    const u = users.find((x) => x.id === id);
    if (!u) return;
    if (u.role === 'Super Admin') {
      showToast('Super Admin tidak dapat dihapus');
      return;
    }
    if (!confirm(`Hapus pengguna "${u.name}"?`)) return;
    try {
      const r = await deleteUserApi(id);
      if (r && r.ok === false) {
        showToast('Gagal: ' + (r.error || 'backend menolak'));
        return;
      }
    } catch {
      showToast('Backend tidak terjangkau — hapus lokal saja?');
      return;
    }
    setUsers((prev) => prev.filter((x) => x.id !== id));
    addLog(`menghapus pengguna ${u.name}`);
    showToast('Pengguna dihapus');
  }

  function openUserModal(id) {
    if (id) {
      const u = users.find((x) => x.id === id);
      setModal({ id, name: u.name, email: u.email, role: u.role, active: u.active });
    } else {
      setModal({ id: null, name: '', email: '', role: 'Viewer', active: true, password: '' });
    }
  }

  async function saveUser() {
    const { id, name, email, role, active, password } = modal;
    if (!name.trim() || !email.trim()) {
      showToast('Nama dan email wajib diisi');
      return;
    }
    if (id) {
      setSaving(true);
      try {
        await patchUser(id, { name: name.trim(), email: email.trim(), role, active });
        if (password && password.length > 0) {
          if (password.length < 5) throw new Error('Password baru min. 5 karakter');
          await setUserPassword(id, password);
        }
      } catch (e) {
        setSaving(false);
        showToast('Gagal: ' + (e.message || 'backend tidak terjangkau'));
        return;
      }
      setSaving(false);
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, name, email, role, active } : u)));
      addLog(`mengubah data pengguna ${name}`);
      setModal(null);
      showToast('Data pengguna disimpan');
      return;
    }
    if (!password || password.length < 5) {
      showToast('Password baru min. 5 karakter');
      return;
    }
    setSaving(true);
    try {
      // Buat kredensial login di backend; role disimpan lokal (appUsers)
      const r = await signUp(email.trim().toLowerCase(), password, name.trim(), role);
      if (!r || r.error || !r.user) throw new Error('Email sudah terdaftar?');
      setUsers((prev) => [...prev, { id: r.user.id, name: name.trim(), email: email.trim().toLowerCase(), role, active, lastLogin: 'Belum pernah login' }]);
      addLog(`menambahkan pengguna baru ${name} (${role})`);
      setModal(null);
      showToast('Pengguna + password tersimpan');
    } catch (e) {
      showToast('Gagal: ' + (e.message || 'backend tidak terjangkau'));
    } finally {
      setSaving(false);
    }
  }

  /* ---- Role & izin ---- */
  const roleCards = ROLES.map((r, i) => {
    const count = users.filter((u) => u.role === r).length;
    const modCount = MODULES.filter((m) => perms[r] && perms[r][m.id]).length;
    return { r, i, count, modCount };
  });

  function setPerm(role, modId, checked) {
    setPerms((prev) => ({
      ...prev,
      [role]: { ...prev[role], [modId]: checked ? 1 : 0 },
    }));
  }

  async function savePerms() {
    try {
      await putPerms(perms);
    } catch {
      showToast('Backend tidak terjangkau — tersimpan lokal saja');
      return;
    }
    addLog('memperbarui matriks izin modul');
    showToast('Matriks izin berhasil disimpan');
  }

  function persistConns(list) {
    setConns(list);
    return putConfig({ connections: list }, 'aiConnections');
  }

  // Toggle pakai: hanya satu koneksi aktif; klik yang aktif = nonaktifkan semua
  function activateConn(id) {
    const list = conns.map((c) => ({ ...c, active: c.id === id ? !c.active : false }));
    persistConns(list)
      .then(() => showToast(list.find((c) => c.id === id)?.active ? 'AI diaktifkan' : 'AI dinonaktifkan', 'ok'))
      .catch(() => showToast('Gagal menyimpan — backend tidak terjangkau', 'err'));
  }

  function removeConn(id) {
    const hit = conns.find((c) => c.id === id);
    if (!hit || !confirm(`Hapus koneksi "${hit.name}"?`)) return;
    persistConns(conns.filter((c) => c.id !== id))
      .then(() => showToast('Koneksi dihapus', 'ok'))
      .catch(() => showToast('Gagal menghapus', 'err'));
  }

  function startAddConn() {
    setEditingId(null);
    setAiCfg({ ...DEFAULT_AI, name: '' });
    setAiKeyInput('');
    setHasKey(false);
    setAiTest(null);
    setShowAiForm(true);
  }

  function startEditConn(id) {
    const hit = conns.find((c) => c.id === id);
    if (!hit) return;
    setEditingId(id);
    setAiCfg({ name: hit.name || '', provider: hit.provider || 'gemini', baseURL: hit.baseURL || '', model: hit.model || '', apiKey: '' });
    setAiKeyInput('');
    setHasKey(!!hit.hasKey);
    setAiTest(null);
    setShowAiForm(true);
  }

  function saveAiForm() {
    if (!aiCfg.baseURL.trim() || !aiCfg.model.trim()) {
      showToast('Base URL dan model wajib diisi', 'err');
      return;
    }
    const name = (aiCfg.name || '').trim() || 'Koneksi AI';
    let list;
    if (editingId) {
      const old = conns.find((c) => c.id === editingId);
      list = conns.map((c) => (c.id === editingId
        ? { ...c, name, provider: aiCfg.provider, baseURL: aiCfg.baseURL.trim(), model: aiCfg.model.trim(), ...(aiKeyInput ? { apiKey: aiKeyInput, hasKey: true } : {}) }
        : c));
      if (!old) return;
    } else {
      if (!aiKeyInput) {
        showToast('API Key wajib untuk koneksi baru', 'err');
        return;
      }
      list = [...conns, {
        id: `ai_${Date.now()}`, name, provider: aiCfg.provider,
        baseURL: aiCfg.baseURL.trim(), model: aiCfg.model.trim(),
        apiKey: aiKeyInput, hasKey: true, active: conns.length === 0,
      }];
    }
    persistConns(list)
      .then(() => {
        setShowAiForm(false);
        setAiKeyInput('');
        showToast('Koneksi AI tersimpan', 'ok');
      })
      .catch(() => showToast('Gagal menyimpan — backend tidak terjangkau', 'err'));
  }

  async function testAi() {
    setTestingAi(true);
    setAiTest(null);
    try {
      // Tes memakai koneksi AKTIF di DB (bukan draf form) — simpan dulu bila baru diubah
      const r = await chatAi([{ role: 'user', content: 'Balas persis: OK' }]);
      if (r && r.ok) setAiTest({ ok: true, msg: 'Koneksi berhasil — AI menjawab.' });
      else setAiTest({ ok: false, msg: 'Tidak berhasil: ' + (r?.error || 'unknown') });
    } catch (e) {
      setAiTest({ ok: false, msg: 'Tidak berhasil: ' + (e.message || e) });
    } finally {
      setTestingAi(false);
    }
  }

  const stats = {
    users: users.length,
    active: users.filter((u) => u.active).length,
    inactive: users.filter((u) => !u.active).length,
  };

  const inputCls =
    'text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white';

  return (
    <div className="px-8 py-6 space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-3 -mt-1">
        <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 bg-brand-50 border border-brand-100 rounded-lg px-3 py-2">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          Login sebagai: <span className="font-bold">{user?.role}</span>
        </span>
        <button
          onClick={() => openUserModal(null)}
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow-md shadow-brand-600/25 transition active:scale-95"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Tambah Pengguna
        </button>
      </div>

      {/* Statistik */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <StatCard title="Total Pengguna" value={stats.users} sub={`${stats.active} aktif`} delay=".02s" />
        <StatCard title="Jumlah Role" value={ROLES.length} sub="Super Admin s/d Viewer" delay=".06s" />
        <StatCard title="Modul Sistem" value={MODULES.length} sub="Dengan izin terpisah" delay=".1s" />
        <StatCard title="Nonaktif" value={stats.inactive} sub="Akun ditangguhkan" valueCls="text-rose-600" subCls="text-rose-500" delay=".14s" />
      </div>

      {/* Tab */}
      <div className="flex items-center gap-2 bg-slate-200/60 rounded-xl p-1 w-fit text-sm font-semibold animate-fade-in-fast" style={{ animationDelay: '.18s' }}>
        {[
          { id: 'pengguna', label: 'Pengguna' },
          { id: 'role', label: 'Role & Izin Modul' },
          { id: 'ai', label: 'AI & API Key' },
          { id: 'log', label: 'Log Aktivitas' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg transition ${tab === t.id ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB: Pengguna */}
      {tab === 'pengguna' && (
        <section className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center gap-3 animate-fade-in-fast" style={{ animationDelay: '.22s' }}>
            <div className="relative flex-1 min-w-[220px]">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                placeholder="Cari nama atau email..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white"
              />
            </div>
            <select value={fRole} onChange={(e) => setFRole(e.target.value)} className={inputCls}>
              <option value="">Semua Role</option>
              {ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={inputCls}>
              <option value="">Semua Status</option>
              <option value="aktif">Aktif</option>
              <option value="nonaktif">Nonaktif</option>
            </select>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-fade-in-fast" style={{ animationDelay: '.26s' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200">
                  <th className="px-6 py-3.5">Pengguna</th>
                  <th className="px-6 py-3.5">Role</th>
                  <th className="px-6 py-3.5">Login Terakhir</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/70 transition">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-white flex items-center justify-center text-xs font-bold shrink-0">
                          {initials(u.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 truncate">{u.name}</p>
                          <p className="text-xs text-slate-400 truncate">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-block text-[11px] font-bold border rounded-full px-2.5 py-1 ${ROLE_STYLE[u.role]}`}>{u.role}</span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">{u.lastLogin}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleUser(u.id)}
                          className={`relative w-10 h-[22px] rounded-full transition ${u.active ? 'bg-emerald-500' : 'bg-slate-300'}`}
                          title={u.active ? 'Nonaktifkan' : 'Aktifkan'}
                        >
                          <span
                            className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-all ${u.active ? 'left-[21px]' : 'left-[3px]'}`}
                          />
                        </button>
                        <span className={`text-xs font-semibold ${u.active ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {u.active ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => openUserModal(u.id)}
                        className="p-2 rounded-lg hover:bg-brand-50 text-slate-400 hover:text-brand-600 transition"
                        title="Edit"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                        </svg>
                      </button>
                      <button
                        onClick={() => deleteUser(u.id)}
                        className="p-2 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition"
                        title="Hapus"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredUsers.length === 0 && (
              <div className="px-6 py-12 text-center text-sm text-slate-400">Tidak ada pengguna yang cocok dengan filter.</div>
            )}
          </div>
        </section>
      )}

      {/* TAB: Role & Izin */}
      {tab === 'role' && (
        <section className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
            {roleCards.map(({ r, i, count, modCount }) => (
              <div key={r} className="bg-white rounded-2xl border border-slate-200 p-4 animate-fade-in-fast" style={{ animationDelay: `${0.05 * i}s` }}>
                <span className={`inline-block text-[11px] font-bold border rounded-full px-2.5 py-1 ${ROLE_STYLE[r]}`}>{r}</span>
                <p className="mt-2.5 text-[11px] text-slate-400 leading-relaxed min-h-[32px]">{ROLE_DESC[r]}</p>
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700">{count} pengguna</span>
                  <span className="text-slate-400">{modCount}/{MODULES.length} modul</span>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-fade-in-fast">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-bold text-slate-900">Matriks Izin Modul</h3>
                <p className="text-xs text-slate-400">Centang modul yang boleh diakses setiap role</p>
              </div>
              <button
                onClick={savePerms}
                className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow-md shadow-brand-600/25 transition active:scale-95"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Simpan Perubahan
              </button>
            </div>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200">
                    <th className="px-6 py-3.5 text-left">Modul</th>
                    {ROLES.map((r) => (
                      <th key={r} className="px-4 py-3.5 text-center">{r}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {MODULES.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-6 py-3.5">
                        <p className="font-semibold text-slate-800">{m.name}</p>
                        <p className="text-[11px] text-slate-400">{m.desc}</p>
                      </td>
                      {ROLES.map((r) => {
                        const locked = r === 'Super Admin';
                        const checked = !!perms[r]?.[m.id];
                        return (
                          <td key={r} className="px-4 py-3.5 text-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={locked}
                              onChange={(e) => setPerm(r, m.id, e.target.checked)}
                              className="w-4 h-4 text-brand-600 rounded border-slate-300 focus:ring-brand-500 disabled:opacity-60 cursor-pointer"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-6 py-3 text-[11px] text-slate-400 border-t border-slate-100 bg-slate-50/60">
              * Super Admin selalu memiliki akses penuh dan tidak dapat diubah.
            </p>
          </div>
        </section>
      )}

      {/* TAB: AI & API Key */}
      {tab === 'ai' && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              <span className="font-bold text-slate-700">{conns.filter((c) => c.active).length ? '1 AI dipakai' : 'Tidak ada AI dipakai'}</span>
              {' '}— chat memakai koneksi bertanda DIPAKAI
            </p>
            <button
              onClick={startAddConn}
              className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow-md shadow-brand-600/25 transition active:scale-95"
            >
              + Tambah AI
            </button>
          </div>

          {conns.map((c) => (
            <div key={c.id} className={`bg-white rounded-2xl border p-5 animate-fade-in-fast ${c.active ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-slate-200'}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={() => activateConn(c.id)}
                  title={c.active ? 'Nonaktifkan (chat jadi mode lokal)' : 'Pakai AI ini'}
                  className={`relative w-12 h-7 rounded-full transition shrink-0 ${c.active ? 'bg-emerald-500' : 'bg-slate-300'}`}
                >
                  <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${c.active ? 'left-6' : 'left-1'}`} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-slate-900 text-sm">{c.name}</h3>
                    {c.active && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">DIPAKAI</span>}
                    {c.hasKey && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">KEY ●</span>}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">{c.provider} · {c.model}</p>
                  <p className="text-[11px] text-slate-400 truncate">{c.baseURL}</p>
                </div>
                <div className="flex items-center gap-1">
                  {c.active && (
                    <button onClick={testAi} disabled={testingAi} title="Tes koneksi yang dipakai" aria-label="Tes koneksi yang dipakai" className="p-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white shadow-sm shadow-brand-600/25 transition active:scale-95 disabled:opacity-60">
                      <svg className={`w-4 h-4 ${testingAi ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                      </svg>
                    </button>
                  )}
                  <button onClick={() => startEditConn(c.id)} title="Edit (termasuk ganti API key)" aria-label="Edit koneksi" className="p-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-600 border border-amber-100 transition active:scale-95">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                    </svg>
                  </button>
                  <button onClick={() => removeConn(c.id)} title="Hapus" aria-label="Hapus koneksi" className="p-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-500 border border-rose-100 transition active:scale-95">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
              {aiTest && c.active && (
                <p className={`mt-2 text-xs font-semibold ${aiTest.ok ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {aiTest.ok ? '✓ ' : '✕ '}{aiTest.msg}
                </p>
              )}
            </div>
          ))}
          {conns.length === 0 && !showAiForm && (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-400">
              Belum ada AI terdaftar — klik <span className="font-bold">+ Tambah AI</span>.
            </div>
          )}

          {showAiForm && (
            <div className="bg-white rounded-2xl border border-brand-200 p-6 animate-fade-in-fast">
              <h3 className="font-bold text-slate-900 text-sm mb-4">{editingId ? 'Edit Koneksi AI' : 'Tambah AI Baru'}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-slate-500">Nama</label>
                  <input value={aiCfg.name || ''} onChange={(e) => setAiCfg({ ...aiCfg, name: e.target.value })} placeholder="mis. Gemini Utama" className={`${inputCls} mt-1 w-full`} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500">Provider</label>
                  <select
                    value={aiCfg.provider}
                    onChange={(e) => {
                      const v = e.target.value;
                      setAiCfg(AI_PRESETS[v] ? { ...aiCfg, provider: v, baseURL: AI_PRESETS[v].baseURL, model: AI_PRESETS[v].model } : { ...aiCfg, provider: v });
                    }}
                    className={`${inputCls} mt-1 w-full`}
                  >
                    <option value="gemini">Google Gemini</option>
                    <option value="openai">OpenAI</option>
                    <option value="custom">Custom (OpenAI-compatible)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500">Model</label>
                  <input value={aiCfg.model} onChange={(e) => setAiCfg({ ...aiCfg, model: e.target.value })} placeholder="gemini-2.0-flash" className={`${inputCls} mt-1 w-full`} />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-slate-500">Base URL</label>
                  <input value={aiCfg.baseURL} onChange={(e) => setAiCfg({ ...aiCfg, baseURL: e.target.value })} placeholder="https://…" className={`${inputCls} mt-1 w-full font-mono`} />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-slate-500">API Key {hasKey && <span className="text-emerald-600 font-bold">● tersimpan</span>}</label>
                  <input
                    type="password"
                    value={aiKeyInput}
                    onChange={(e) => setAiKeyInput(e.target.value)}
                    placeholder={hasKey ? 'Kosongkan bila tidak diganti' : 'sk-… / AIza…'}
                    className={`${inputCls} mt-1 w-full font-mono`}
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={saveAiForm} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow-md shadow-brand-600/25 transition">
                  Simpan
                </button>
                <button onClick={() => { setShowAiForm(false); setAiKeyInput(''); }} className="text-sm font-semibold text-slate-500 px-4 py-2 rounded-lg hover:bg-slate-100 transition">
                  Batal
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* TAB: Log */}
      {tab === 'log' && (
        <section>
          <div className="bg-white rounded-2xl border border-slate-200 p-6 animate-fade-in-fast">
            <h3 className="font-bold text-slate-900 mb-4">Log Aktivitas Admin</h3>
            <ol className="relative border-l-2 border-slate-100 space-y-5 ml-2">
              {logs.map((l, i) => (
                <li key={i} className="ml-5 relative">
                  <span className="absolute -left-[27px] top-1 w-3 h-3 rounded-full bg-brand-100 border-2 border-brand-500" />
                  <p className="text-sm text-slate-700">
                    <span className="font-bold">{l.who}</span> {l.act}
                  </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{fmtLogTime(l.time)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {/* Modal Tambah/Edit Pengguna */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-fade-in-fast">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">{modal.id ? 'Edit Pengguna' : 'Tambah Pengguna'}</h3>
              <button onClick={() => setModal(null)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500">Nama</label>
                <input
                  type="text"
                  value={modal.name}
                  onChange={(e) => setModal({ ...modal, name: e.target.value })}
                  className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Email</label>
                <input
                  type="email"
                  value={modal.email}
                  onChange={(e) => setModal({ ...modal, email: e.target.value })}
                  className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Role</label>
                <select
                  value={modal.role}
                  onChange={(e) => setModal({ ...modal, role: e.target.value })}
                  className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white"
                >
                  {ROLES.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </div>
              {!modal.id && (
                <div>
                  <label className="text-xs font-semibold text-slate-500">
                    Password login <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={modal.password || ''}
                    onChange={(e) => setModal({ ...modal, password: e.target.value })}
                    placeholder="Min. 5 karakter — tersimpan di backend"
                    className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white"
                  />
                </div>
              )}
              {modal.id && (
                <div>
                  <label className="text-xs font-semibold text-slate-500">Password baru (opsional)</label>
                  <input
                    type="password"
                    value={modal.password || ''}
                    onChange={(e) => setModal({ ...modal, password: e.target.value })}
                    placeholder="Kosongkan bila tidak diubah"
                    className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white"
                  />
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setModal({ ...modal, active: !modal.active })}
                  className={`relative w-10 h-[22px] rounded-full transition ${modal.active ? 'bg-emerald-500' : 'bg-slate-300'}`}
                >
                  <span
                    className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-all ${modal.active ? 'left-[21px]' : 'left-[3px]'}`}
                  />
                </button>
                <span className="text-xs font-semibold text-slate-600">Akun aktif</span>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => setModal(null)} className="text-sm font-semibold text-slate-500 px-4 py-2 rounded-lg hover:bg-slate-100 transition">
                Batal
              </button>
              <button
                onClick={saveUser}
                disabled={saving}
                className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2 rounded-lg shadow-md shadow-brand-600/25 transition disabled:opacity-60"
              >
                {saving ? 'Menyimpan…' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 text-white text-xs font-semibold px-4 py-2.5 rounded-lg shadow-xl animate-fade-in-fast ${
          toast.kind === 'ok' ? 'bg-emerald-600' : toast.kind === 'err' ? 'bg-rose-600' : 'bg-slate-800'
        }`}>
          {toast.kind === 'ok' ? '✓ ' : toast.kind === 'err' ? '✕ ' : ''}{toast.msg}
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, sub, valueCls = '', subCls = 'text-slate-400', delay }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 animate-fade-in-fast" style={{ animationDelay: delay }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</p>
          <p className={`mt-2 text-3xl font-extrabold text-slate-900 ${valueCls}`}>{value}</p>
          <p className={`mt-1 text-xs font-medium ${subCls}`}>{sub}</p>
        </div>
      </div>
    </div>
  );
}
