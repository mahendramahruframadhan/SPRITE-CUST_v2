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
      notify('File harus gambar PNG/JPG/WebP.', 'err');
      return;
    }
    if (f.size > MAX_SHOT_MB * 1024 * 1024) {
      notify(`Ukuran gambar maks ${MAX_SHOT_MB} MB.`, 'err');
      return;
    }
    setBusy(true);
    setProgress(0);
    try {
      const prepared = await compressImage(f);
      const up = await requestShotUploadUrl({
        deptUuid: outletUuid, slot: slot.id, filename: prepared.name, sizeBytes: prepared.size, contentType: prepared.type,
      });
      await putXhr(up.url, prepared, setProgress);
      await confirmShotUpload({ id: up.id });
      notify(`Screenshot ${slot.label} terupload (${fmtKB(prepared.size)}).`, 'success');
      onChanged();
    } catch (err) {
      notify(err?.data?.message || err?.message || 'Upload gagal.', 'err');
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
      notify(`Screenshot ${slot.label} dihapus.`, 'success');
      onChanged();
    } catch (err) {
      notify(err?.data?.message || err?.message || 'Gagal menghapus.', 'err');
    } finally {
      setBusy(false);
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
          <Button type="button" variant="secondary" size="sm" loading={busy} onClick={() => inputRef.current?.click()}>
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

      {shot && !busy && (
        <div className="mt-2">
          {previewUrl ? (
            <a href={previewUrl} target="_blank" rel="noreferrer" aria-label={`Lihat screenshot ${slot.label}`}>
              <img src={previewUrl} alt={`Screenshot ${slot.label}`} className="w-full max-h-40 object-cover rounded-lg border border-slate-200 dark:border-slate-700" />
            </a>
          ) : (
            <div className="h-20 rounded-lg bg-slate-200/70 dark:bg-slate-700/50 animate-pulse" aria-hidden="true" />
          )}
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <p className="text-[10px] text-slate-500 truncate" title={shot.filename}>
              {shot.filename} · {fmtKB(shot.size_bytes)}
            </p>
            {canWrite && (
              <button type="button" onClick={onDelete} className="text-[10px] font-semibold text-rose-500 hover:text-rose-600">
                Hapus
              </button>
            )}
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
        <h3 className="text-xs font-extrabold tracking-wider text-slate-700 dark:text-slate-200">SCREENSHOT AUDIT</h3>
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
