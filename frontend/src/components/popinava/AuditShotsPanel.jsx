// Panel screenshot audit per outlet: 2 slot (LOCAL & WEB).
// Kompres gambar di browser -> presigned PUT ke R2 -> confirm -> thumbnail.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  requestShotUploadUrl, confirmShotUpload, listShotsByOutlet, requestShotDownloadUrl, deleteShot,
} from '../../lib/api.js';

const MAX_SHOT_MB = 10;
const ACCEPT = 'image/png,image/jpeg,image/webp';
const SLOTS = [
  { id: 'local', label: 'LOCAL', hint: 'Screenshot hasil audit di lokal' },
  { id: 'web', label: 'WEB', hint: 'Screenshot hasil audit di server' },
];

const fmtKB = (b) => `${(Number(b || 0) / 1024).toLocaleString('id-ID', { maximumFractionDigits: 0 })} KB`;

// Kompres via canvas: max sisi 1600px, JPEG 0.8. PNG dengan transparansi
// fallback ke JPEG putih bila perlu. Gagal kompres -> pakai file asli.
async function compressImage(file) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.8));
    if (!blob) return file;
    const base = file.name.replace(/\.[^.]+$/, '') || 'screenshot';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

function putXhr(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type || 'image/jpeg');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload gagal (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error('Koneksi putus saat upload.'));
    xhr.send(file);
  });
}

function SlotCard({ slot, shot, outletUuid, onChanged, canWrite }) {
  const { notify } = useToast();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState('');

  // Ambil URL pratinjau (inline) untuk shot yang sudah completed.
  useEffect(() => {
    let alive = true;
    setPreviewUrl('');
    if (shot && shot.status !== 'failed') {
      requestShotDownloadUrl(shot.id, { inline: true }).then(
        (r) => { if (alive) setPreviewUrl(r.url || r.data?.url || ''); },
        () => {},
      );
    }
    return () => { alive = false; };
  }, [shot?.id, shot?.status]);

  async function onPick(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(f.type)) {
      notify('Format file harus gambar PNG, JPG, atau WebP.', 'error');
      return;
    }
    if (f.size > MAX_SHOT_MB * 1024 * 1024) {
      notify(`Ukuran gambar melebihi batas ${MAX_SHOT_MB} MB.`, 'error');
      return;
    }
    setBusy(true);
    setProgress(0);
    notify(`Mengupload screenshot ${slot.label}…`, 'info', 2000);
    try {
      const prepared = await compressImage(f);
      const up = await requestShotUploadUrl({
        deptUuid: outletUuid, slot: slot.id, filename: prepared.name, sizeBytes: prepared.size, contentType: prepared.type,
      });
      await putXhr(up.url, prepared, setProgress);
      await confirmShotUpload({ id: up.id });
      notify(`Screenshot ${slot.label} berhasil diupload (${fmtKB(prepared.size)}).`, 'success');
      onChanged();
    } catch (err) {
      notify(err?.data?.message || err?.message || `Upload screenshot ${slot.label} gagal.`, 'error');
    } finally {
      setBusy(false);
      setProgress(0);
    }
  }

  async function onDelete() {
    if (!shot) return;
    setBusy(true);
    try {
      await deleteShot(shot.id);
      notify(`Screenshot ${slot.label} "${shot.filename}" berhasil dihapus.`, 'success');
      onChanged();
    } catch (err) {
      notify(err?.data?.message || err?.message || `Gagal menghapus screenshot ${slot.label}.`, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function onDownload() {
    if (!shot) return;
    try {
      const r = await requestShotDownloadUrl(shot.id);
      const url = r.url || r.data?.url;
      if (!url) throw new Error('URL unduhan tidak tersedia.');
      const a = document.createElement('a');
      a.href = url;
      a.download = shot.filename || `screenshot-${slot.id}.jpg`;
      a.click();
      notify(`Screenshot ${slot.label} diunduh: ${shot.filename}`, 'download');
    } catch (err) {
      notify(err?.data?.message || err?.message || `Gagal mengunduh screenshot ${slot.label}.`, 'error');
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/60 dark:bg-slate-800/40">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold tracking-wider text-slate-700 dark:text-slate-200">{slot.label}</p>
          <p className="text-[10px] text-slate-400">{slot.hint}</p>
        </div>
        {canWrite && (
          <Button
            type="button"
            variant={shot ? 'secondary' : 'primary'}
            size="sm"
            loading={busy}
            onClick={() => inputRef.current?.click()}
            className="rounded-full text-xs"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            {shot ? 'Ganti' : 'Upload'}
          </Button>
        )}
      </div>
      <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={onPick} aria-label={`Upload screenshot ${slot.label}`} />

      {busy && (
        <div className="mt-2">
          <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div className="h-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-[10px] text-slate-400 tabular-nums">{progress}%</p>
        </div>
      )}

      {!shot && !busy && (
        <p className="mt-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40 px-3 py-4 text-center text-[11px] text-slate-400">
          Belum ada screenshot {slot.label}
        </p>
      )}

      {shot && !busy && (
        <div className="mt-2">
          {previewUrl ? (
            <a href={previewUrl} target="_blank" rel="noreferrer" aria-label={`Lihat screenshot ${slot.label}`}>
              <img src={previewUrl} alt={`Screenshot ${slot.label}`} className="w-full max-h-40 object-cover rounded-lg border border-slate-200 dark:border-slate-700" />
            </a>
          ) : (
            <div className="h-20 rounded-lg bg-slate-200/70 dark:bg-slate-700/50 animate-pulse" aria-hidden="true" />
          )}
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate min-w-0" title={shot.filename}>
              {shot.filename} · {fmtKB(shot.size_bytes)}
            </p>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onDownload}
                className="inline-flex items-center gap-1 rounded-full border border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10 px-2.5 py-1 text-[10px] font-bold text-sky-600 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-500/20 transition"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Unduh
              </button>
              {canWrite && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="inline-flex items-center gap-1 rounded-full border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-2.5 py-1 text-[10px] font-bold text-rose-600 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79" />
                  </svg>
                  Hapus
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AuditShotsPanel({ outletUuid, canWrite = true }) {
  const [shots, setShots] = useState([]);
  const [loading, setLoading] = useState(false);
  const load = useCallback(() => {
    if (!outletUuid) return;
    setLoading(true);
    listShotsByOutlet(outletUuid).then(
      (rows) => setShots(Array.isArray(rows) ? rows : rows?.data || []),
      () => setShots([]),
    ).finally(() => setLoading(false));
  }, [outletUuid]);

  useEffect(() => { load(); }, [load]);

  const bySlot = {};
  for (const s of shots) {
    if (s.status === 'failed') continue;
    if (!bySlot[s.slot] || (bySlot[s.slot].created_at || '') < (s.created_at || '')) bySlot[s.slot] = s;
  }

  return (
    <section aria-label="Screenshot audit" className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-extrabold tracking-wider text-slate-700 dark:text-slate-200">
          <span className="inline-flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-brand-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
            </svg>
            SCREENSHOT AUDIT
          </span>
        </h3>
        {loading && <span className="text-[10px] text-slate-400">Memuat…</span>}
      </div>
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SLOTS.map((s) => (
          <SlotCard key={s.id} slot={s} shot={bySlot[s.id]} outletUuid={outletUuid} onChanged={load} canWrite={canWrite} />
        ))}
      </div>
    </section>
  );
}
