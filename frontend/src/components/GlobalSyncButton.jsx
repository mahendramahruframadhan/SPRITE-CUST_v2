import { useState } from 'react';
import { Button } from './ui/Button.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { usePermissions } from '../hooks/usePermissions.js';
import { triggerSync } from '../lib/api.js';

// Tombol ikon sinkron global di header: satu aksi untuk menarik Sheet → DB.
// Hanya untuk pemegang izin modul roles, sama dengan syarat POST /sync/trigger.
function pesanHasil(r) {
  const secs = r?.durationMs != null
    ? ` dalam ${(r.durationMs / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} dtk`
    : '';
  const rows = r?.rows ?? 0;
  if (rows === 0 && (r?.unchanged ?? 0) > 0) {
    return `Sudah sinkron — tidak ada perubahan (${r.readRows} dibaca${secs})`;
  }
  if (rows === 0 && (r?.readRows ?? 0) > 0) {
    return `${r.readRows} baris dibaca, ${r.skippedRows ?? 0} dilewati — cek kolom recordUuid di Sheet`;
  }
  if (rows === 0) return 'Tab terbaca tapi kosong — cek nama tab & isi Sheet';
  const same = r?.unchanged ? ` (${r.unchanged} sudah sama, dilewati)` : '';
  return `${rows.toLocaleString('id-ID')} baris baru/berubah${secs}${same} • data dimuat ulang`;
}

export default function GlobalSyncButton({ onSynced }) {
  const { can } = usePermissions();
  const { notify } = useToast();
  const [syncing, setSyncing] = useState(false);

  if (!can('roles')) return null;

  async function jalankan() {
    if (syncing) return;
    setSyncing(true);
    try {
      const r = await triggerSync();
      if (r && r.ok === false) throw new Error(r.error || 'Sinkron ditolak backend');
      notify(pesanHasil(r), 'success');
      onSynced?.(r);
    } catch (e) {
      notify(e?.message || 'Gagal sinkron — coba lagi', 'error');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      type="button"
      onClick={jalankan}
      disabled={syncing}
      aria-busy={syncing || undefined}
      aria-label="Sinkron dari Google Sheets"
      title={syncing ? 'Menyinkronkan…' : 'Sinkron dari Google Sheets'}
    >
      <svg
        className={`w-5 h-5 ${syncing ? 'animate-spin' : ''}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
      </svg>
    </Button>
  );
}
