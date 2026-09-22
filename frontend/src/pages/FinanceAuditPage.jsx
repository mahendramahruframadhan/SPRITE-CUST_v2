import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar } from 'react-chartjs-2';
import { requestPdfUploadUrl, confirmPdfUpload, listPdfsByCase, getPdfState, getPdfHistory, requestPdfDownloadUrl, deletePdf, patchInvoice, getInvoiceMap } from '../lib/api.js';
import { useCases } from '../hooks/useCases.js';
import { useInvoiceState, DEFAULT_INVOICE } from '../hooks/useInvoiceState.js';
import { recordActivity } from '../lib/activity.js';
import { useToast } from '../context/ToastContext.jsx';
import { fmtDate8 } from '../utils/format.js';
import { useAuditState } from '../hooks/useAuditState.js';
import { useAuth } from '../context/AuthContext.jsx';
import CaseDetailModal from '../components/CaseDetailModal.jsx';
import DeleteConfirmModal from '../components/DeleteConfirmModal.jsx';
import InvoiceHistoryModal from '../components/InvoiceHistoryModal.jsx';

const VALID_TAG = 'VALID - SIAP INVOICE';

const MAX_PDF_MB = 10;

// PUT langsung ke presigned URL R2 dengan progress (fetch tanpa progress bar).
function putXhr(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', 'application/pdf');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload R2 gagal (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error('Koneksi putus saat upload, coba lagi.'));
    xhr.send(file);
  });
}

const fmtKB = (b) => `${(Number(b || 0) / 1024).toLocaleString('id-ID', { maximumFractionDigits: 0 })} KB`;

// Pesan error backend → kalimat ramah untuk toast
const PDF_ERR_MSG = {
  R2_NOT_CONFIGURED: 'Penyimpanan PDF belum dikonfigurasi — hubungi admin.',
  NOT_PDF: 'File harus berformat PDF.',
  BAD_SIZE: 'Ukuran PDF di luar batas yang diizinkan.',
  CASE_NOT_FOUND: 'Kasus tidak ditemukan.',
  PDF_NOT_FOUND: 'Data PDF tidak ditemukan.',
  NOT_READY: 'File belum selesai diunggah.',
  VERIFY_FAILED: 'File tidak terverifikasi sebagai PDF.',
};
const pdfErrMsg = (err, fallback) => PDF_ERR_MSG[err?.code] || err?.data?.message || err?.message || fallback;

// Label status file yang ramah (status mentah: uploading/failed/completed)
const PDF_STATUS_LABEL = { uploading: 'mengupload…', failed: 'gagal', completed: 'selesai' };

// Status invoice kanonis yang dikunci sistem (otomatis upload/hapus PDF) —
// manual dari dropdown ditolak backend 422. PAID satu-satunya yang boleh manual.
const INV_AUTO_LOCKED = ['MENUNGGU INVOICE', 'INVOICE TERBIT'];
const INV_ERR_MSG = {
  INVOICE_AUTO_LOCKED: 'Status ini diatur otomatis oleh sistem (upload/hapus PDF) — manual hanya PAID.',
  INVOICE_NEED_PDF: 'Belum bisa PAID — upload minimal 1 PDF invoice dulu.',
};
const invErrMsg = (err, fallback) => INV_ERR_MSG[err?.code] || err?.data?.message || err?.message || fallback;

// Sel upload PDF invoice per baris: pilih -> PUT R2 (progress) -> confirm ->
// daftar file (unduh/hapus). Tombol Unduh/Hapus digate kondisi true/false:
// aktif hanya bila file berstatus 'completed', selain itu disabled + tooltip.
const isPdfReady = (st) => st === 'completed';
function PdfCell({ recordUuid, caseNo, caseClient, notify, onStatusChange }) {
  const inputId = `pdf-${recordUuid}`;
  const fileRef = useRef(null);
  const seq = useRef(0);
  const [files, setFiles] = useState([]);
  // Gate server (GET /api/pdf/state/:uuid) — default false sampai backend menjawab.
  // Fallback: bila endpoint belum ada (backend lama), gating mengandalkan status lokal.
  const [gate, setGate] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(null);

  const reload = useCallback(() => {
    const my = ++seq.current;
    listPdfsByCase(recordUuid).then(
      (rows) => {
        if (seq.current === my) setFiles(Array.isArray(rows) ? rows : []);
      },
      () => {}
    );
    getPdfState(recordUuid).then(
      (st) => {
        if (seq.current === my) setGate({ canDownload: !!st?.canDownload, canDelete: !!st?.canDelete });
      },
      () => {}
    );
  }, [recordUuid]);

  useEffect(() => {
    reload();
  }, [reload]);

  const pick = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f || busy) return;
    // Pengaman ganda: input sudah disabled, tapi cegah juga secara logika
    const allowed = gate ? gate.canUpload : !files.some((x) => isPdfReady(x.status));
    if (!allowed) {
      notify('Upload dinonaktifkan — PDF sudah terupload. Hapus PDF untuk upload ulang.', 'err');
      return;
    }
    const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    if (!isPdf) {
      notify(`"${f.name}" bukan PDF — pilih file berformat PDF.`, 'err');
      return;
    }
    if (f.size > MAX_PDF_MB * 1024 * 1024) {
      notify(`"${f.name}" terlalu besar (${fmtKB(f.size)}) — maksimal ${MAX_PDF_MB} MB.`, 'err');
      return;
    }
    fileRef.current = f;
    setBusy(true);
    setPct(0);
    let uid = null;
    try {
      const u = await requestPdfUploadUrl({ recordUuid, filename: f.name, sizeBytes: f.size });
      uid = u.id;
      notify(`Mengupload "${f.name}" (${fmtKB(f.size)})…`, 'info', 2000);
      await putXhr(u.url, f, setPct);
      const done = await confirmPdfUpload({ id: u.id });
      notify(`PDF terupload: "${f.name}" (${fmtKB(f.size)}).`, 'success');
      // Sinkron status invoice otomatis dari backend (TERBIT, kecuali sudah PAID)
      if (done?.invoiceStatus) onStatusChange?.(recordUuid, done.invoiceStatus);
      reload();
    } catch (err) {
      notify(pdfErrMsg(err, 'Upload gagal, coba lagi.'), 'err');
      // Bersihkan baris uploading yang gagal agar tidak nyangkut di daftar
      // (server juga menghapusnya via cron, tapi itu butuh >30 menit)
      if (uid) {
        try { await deletePdf(uid); } catch { /* abaikan, daftar di-reload */ }
        reload();
      }
    } finally {
      fileRef.current = null;
      setBusy(false);
      setPct(null);
    }
  };

  const download = async (id, filename, sizeBytes) => {
    if (downloadBusy) return;
    setDownloadBusy(id);
    try {
      const r = await requestPdfDownloadUrl(id);
      const a = document.createElement('a');
      a.href = r.url;
      a.download = filename || 'invoice.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      const label = `"${filename || 'invoice.pdf'}"${sizeBytes ? ` (${fmtKB(sizeBytes)})` : ''}`;
      notify(`Mengunduh ${label}…`, 'download');
    } catch (err) {
      notify(pdfErrMsg(err, 'Unduhan gagal, coba lagi.'), 'err');
    } finally {
      setDownloadBusy(null);
    }
  };

  // Hapus via modal konfirmasi elegan (tanpa confirm() bawaan browser).
  // remove() murni menghapus; askDelete() membuka modal; confirmDelete() mengeksekusi.
  const remove = async (id, filename) => {
    try {
      const r = await deletePdf(id);
      notify(`PDF dihapus: "${filename}".`, 'success');
      // Sinkron status invoice otomatis dari backend (kembali MENUNGGU bila PDF habis)
      if (r?.invoiceStatus) onStatusChange?.(recordUuid, r.invoiceStatus);
      reload();
      return true;
    } catch (err) {
      notify(pdfErrMsg(err, 'Hapus gagal, coba lagi.'), 'err');
      return false;
    }
  };

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  // Id file yang sedang disiapkan unduhannya (spinner di tombol Unduh)
  const [downloadBusy, setDownloadBusy] = useState(null);
  // B. Riwayat invoice+PDF per baris
  const [histOpen, setHistOpen] = useState(false);
  const [hist, setHist] = useState([]);
  const [histBusy, setHistBusy] = useState(false);

  const openHistory = async () => {
    if (histBusy) return;
    setHistBusy(true);
    try {
      const r = await getPdfHistory(recordUuid);
      setHist(Array.isArray(r?.history) ? r.history : []);
      setHistOpen(true);
    } catch (err) {
      notify(pdfErrMsg(err, 'Riwayat gagal dimuat.'), 'err');
    } finally {
      setHistBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleteBusy) return;
    setDeleteBusy(true);
    try {
      const gone = await remove(deleteTarget.id, deleteTarget.filename);
      if (gone) setDeleteTarget(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  // Id file yang sedang dibuka ke tab baru (untuk status loading tombol mata)
  const [previewBusy, setPreviewBusy] = useState(null);

  // Buka isi PDF di tab baru (bukan modal — lebih lega).
  // Tab dibuka sinkron (tanpa noopener agar bisa diisi/ditutup dari sini, anti popup-blocker),
  // lalu diarahkan LANGSUNG ke presigned URL inline — tanpa fetch/blob sehingga tidak
  // tergantung CORS dan tidak pernah memicu download (syarat: backend sudah ?inline=1).
  const openPreview = async (f) => {
    if (previewBusy) return;
    const tab = window.open('', '_blank');
    if (!tab) {
      notify('Tab baru diblokir browser — izinkan popup untuk situs ini.', 'err');
      return;
    }
    try {
      tab.document.write('<!doctype html><html><head><title>Memuat…</title></head><body style="font-family:sans-serif;display:flex;height:100vh;align-items:center;justify-content:center;color:#64748b">Memuat pratinjau PDF…</body></html>');
      tab.document.close();
    } catch { /* abaikan bila tab tak bisa ditulis */ }
    setPreviewBusy(f.id);
    try {
      const r = await requestPdfDownloadUrl(f.id, { inline: true });
      tab.location.href = r.url;
    } catch (err) {
      try { tab.close(); } catch { /* abaikan */ }
      notify(pdfErrMsg(err, 'Pratinjau gagal dibuka.'), 'err');
    } finally {
      setPreviewBusy(null);
    }
  };

  // Upload di-disabled bila sudah ada file completed (aturan: 1 kasus = 1 PDF aktif).
  // Tombol aktif kembali otomatis setelah PDF dihapus (gate.canUpload dari server).
  const hasCompleted = files.some((f) => isPdfReady(f.status));
  const canUpload = gate ? gate.canUpload : !hasCompleted;
  const uploadDisabled = busy || !canUpload;

  return (
    <div className="w-[220px]">
      <input id={inputId} type="file" accept="application/pdf,.pdf" className="hidden" onChange={pick} disabled={uploadDisabled} />
      <label
        htmlFor={inputId}
        aria-disabled={uploadDisabled}
        title={canUpload ? 'Upload PDF invoice' : 'Upload dinonaktifkan — PDF sudah terupload. Hapus PDF untuk upload ulang.'}
        className={`inline-flex w-full items-center justify-center gap-2 text-[12px] font-extrabold rounded-xl px-3 py-2 transition ${uploadDisabled ? 'cursor-not-allowed text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700' : 'cursor-pointer text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-sm shadow-emerald-600/25 hover:shadow-md'}`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        {busy && pct !== null ? `${pct}%` : 'Upload PDF'}
      </label>
      {busy && pct !== null && (
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      {files.length > 0 ? (
        <ul className="mt-1.5 space-y-1.5">
          {files.map((f) => {
            // Kondisi true/false: status lokal AND gate server (keduanya harus true).
            // gate null = backend lama tanpa /state → hanya status lokal yang dipakai.
            // Hapus SELALU aktif termasuk baris macet (uploading/failed) agar user bisa
            // membersihkan sendiri; Lihat & Unduh tetap khusus file completed.
            const ready = isPdfReady(f.status);
            const canDl = ready && (!gate || gate.canDownload);
            const hint = ready ? 'Belum dikonfirmasi server — muat ulang halaman.' : 'Tersedia setelah upload selesai dikonfirmasi';
            const statusLabel = PDF_STATUS_LABEL[f.status] || f.status;
            const iconBtn = 'shrink-0 rounded-lg p-1.5 transition disabled:opacity-30 disabled:cursor-not-allowed';
            return (
            <li
              key={f.id}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 shadow-sm px-2 py-1.5"
            >
              <div className="flex items-center gap-1.5">
                <span aria-hidden="true" className={`shrink-0 rounded-lg p-1.5 ${ready ? 'bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-400' : 'bg-amber-50 text-amber-500 dark:bg-amber-500/10 dark:text-amber-400'}`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </span>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-[11px] font-bold text-slate-700 dark:text-slate-200" title={f.filename}>{f.filename}</p>
                  <p className="text-[10px] font-semibold text-slate-400 tabular-nums">
                    {fmtKB(f.sizeBytes)}{!ready ? ` · ${statusLabel}` : ''}
                  </p>
                </div>
                <div className="shrink-0 flex items-center">
                  <button
                    type="button"
                    onClick={() => openPreview(f)}
                    disabled={!canDl || previewBusy !== null}
                    title={canDl ? `Lihat ${f.filename} di tab baru` : hint}
                    aria-label={`Lihat ${f.filename} di tab baru`}
                    aria-disabled={!canDl}
                    className={`${iconBtn} text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10`}
                  >
                    {previewBusy === f.id ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => download(f.id, f.filename, f.sizeBytes)}
                    disabled={!canDl || downloadBusy !== null}
                    title={downloadBusy === f.id ? 'Menyiapkan unduhan…' : (canDl ? `Unduh ${f.filename}` : hint)}
                    aria-label={`Unduh ${f.filename}`}
                    aria-disabled={!canDl}
                    className={`${iconBtn} text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-500/10`}
                  >
                    {downloadBusy === f.id ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(f)}
                    title={ready ? `Hapus ${f.filename}` : `Hapus ${f.filename} (${statusLabel}, belum selesai)`}
                    aria-label={`Hapus ${f.filename}`}
                    className={`${iconBtn} text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
            </li>
            );
          })}
        </ul>
      ) : (
        // Sebelum ada upload: status kosong yang elegan
        <div className="mt-1.5 flex w-full items-center gap-1.5 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 px-2 py-1.5 text-slate-400">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <span className="flex-1 min-w-0 truncate text-[11px] font-semibold">Belum ada PDF</span>
        </div>
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          file={{ filename: deleteTarget.filename, sizeLabel: fmtKB(deleteTarget.sizeBytes) }}
          busy={deleteBusy}
          onCancel={() => { if (!deleteBusy) setDeleteTarget(null); }}
          onConfirm={confirmDelete}
        />
      )}
      <button
        type="button"
        onClick={openHistory}
        disabled={histBusy}
        title="Lihat riwayat invoice, validasi & PDF kasus ini"
        className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 text-[11px] font-bold rounded-xl px-2 py-1.5 text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-500/10 border border-transparent hover:border-brand-100 dark:hover:border-brand-500/20 transition disabled:opacity-50"
      >
        {histBusy ? (
          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
        {histBusy ? 'Memuat…' : 'Riwayat'}
      </button>
      {histOpen && (
        <InvoiceHistoryModal
          title={`Kasus #${caseNo} (${caseClient})`}
          subtitle={`${hist.length} aktivitas tercatat`}
          history={hist}
          onClose={() => setHistOpen(false)}
        />
      )}
    </div>
  );
}

// Badge billing status (selaras dashboard)
const BILL_BADGE = {
  FREE: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
  'ON-CALL': 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
  MONTHLY: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20',
};
// Warna select status invoice (status kustom → netral)
const INV_TONE = {
  'MENUNGGU INVOICE': 'border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-400',
  'INVOICE TERBIT': 'border-violet-200 bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:border-violet-500/30 dark:text-violet-400',
  PAID: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-400',
};

export default function FinanceAuditPage() {
  const { notify } = useToast();
  const { user } = useAuth();
  const { caseAuditStatus } = useAuditState();
  const { cases: allCases, loading } = useCases();
  const { invoiceActions, invoiceStatus, defaultInvoiceStatus, syncInvoiceStatus, addInvoiceAction, removeInvoiceAction, renameInvoiceAction, ensureDefaults, invoiceMeta, updateInvoiceMeta } = useInvoiceState();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [brand, setBrand] = useState('');
  const [billStatus, setBillStatus] = useState('');
  const [invFilter, setInvFilter] = useState('');
  const [masterOpen, setMasterOpen] = useState(false);
  const [newAction, setNewAction] = useState('');
  const [detailUuid, setDetailUuid] = useState(null);
  const [editingAction, setEditingAction] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState('');

  // Pastikan kasus tervalidasi punya status invoice default
  useEffect(() => {
    ensureDefaults(validatedPool.map((c) => c.recordUuid));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseAuditStatus]);

  // A+P3. Sinkron status invoice dari backend (sumber kebenaran otomasi upload/hapus):
  // saat halaman dimuat + tiap jendela kembali fokus (tutup sisa celah basi antar-tab).
  const syncFromServer = useCallback(() => {
    getInvoiceMap()
      .then((r) => {
        if (!r || typeof r.map !== 'object') return;
        Object.entries(r.map).forEach(([uuid, st]) => syncInvoiceStatus(uuid, st));
      })
      .catch(() => {});
  }, [syncInvoiceStatus]);

  useEffect(() => {
    syncFromServer();
    window.addEventListener('focus', syncFromServer);
    return () => window.removeEventListener('focus', syncFromServer);
  }, [syncFromServer]);

  const brands = useMemo(
    () => [...new Set(allCases.map((c) => c.client).filter(Boolean))].sort(),
    [allCases]
  );

  // Pool kasus yang boleh diproses finance
  const validatedPool = useMemo(
    () =>
      allCases.filter(
        (c) =>
          (c.billingStatus === 'ON-CALL' || c.billingStatus === 'MONTHLY') &&
          caseAuditStatus[c.recordUuid] === VALID_TAG
      ),
    [allCases, caseAuditStatus]
  );

  const stats = useMemo(() => {
    const byStatus = (a) => validatedPool.filter((c) => (invoiceStatus[c.recordUuid] || defaultInvoiceStatus) === a);
    const outstanding = validatedPool.filter((c) => (invoiceStatus[c.recordUuid] || defaultInvoiceStatus) !== 'PAID');
    return {
      total: validatedPool.length,
      totalAmount: validatedPool.reduce((a, c) => a + (+c.charges || 0), 0),
      menunggu: byStatus('MENUNGGU INVOICE').length,
      terbit: byStatus('INVOICE TERBIT').length,
      paid: byStatus('PAID').length,
      outstandingCount: outstanding.length,
      outstandingAmount: outstanding.reduce((a, c) => a + (+c.charges || 0), 0),
    };
  }, [validatedPool, invoiceStatus, defaultInvoiceStatus]);

  const kpi = [
    { t: 'Siap Invoice', v: stats.total.toLocaleString('id-ID'), sub: fmtMoney(stats.totalAmount) + ' tervalidasi', color: 'text-brand-600', darkColor: 'dark:text-brand-300', accent: 'from-brand-500 to-brand-300' },
    { t: 'Menunggu Invoice', v: stats.menunggu.toLocaleString('id-ID'), sub: 'kasus', color: 'text-amber-600', darkColor: 'dark:text-amber-400', accent: 'from-amber-500 to-amber-300' },
    { t: 'Invoice Terbit', v: stats.terbit.toLocaleString('id-ID'), sub: 'kasus', color: 'text-violet-600', darkColor: 'dark:text-violet-400', accent: 'from-violet-500 to-violet-300' },
    { t: 'Paid', v: stats.paid.toLocaleString('id-ID'), sub: `dari ${stats.total} kasus tervalidasi`, color: 'text-emerald-600', darkColor: 'dark:text-emerald-400', accent: 'from-emerald-500 to-emerald-300' },
    { t: 'Total Outstanding', v: fmtMoney(stats.outstandingAmount), sub: `${stats.outstandingCount} kasus belum PAID`, color: 'text-rose-600', darkColor: 'dark:text-rose-400', accent: 'from-rose-500 to-rose-300', size: 'text-[19px]' },
  ];

  const filtered = useMemo(() => {
    const f = from.replace(/-/g, '');
    const t = to.replace(/-/g, '');
    return validatedPool.filter((c) => {
      const d = c.dateIssue;
      const s = invoiceStatus[c.recordUuid] || defaultInvoiceStatus;
      return (
        (!f || d >= f) &&
        (!t || d <= t) &&
        (!brand || c.client === brand) &&
        (!billStatus || c.billingStatus === billStatus) &&
        (!invFilter || s === invFilter)
      );
    });
  }, [validatedPool, invoiceStatus, defaultInvoiceStatus, from, to, brand, billStatus, invFilter]);

  const total = filtered.reduce((a, c) => a + (+c.charges || 0), 0);

  // Ubah status invoice manual: hanya PAID yang diizinkan server (422 bila dilanggar).
  // Lokal diubah HANYA setelah server sukses — sinkron, bukan optimistic.
  async function handleInvoice(uuid, action) {
    const prev = invoiceStatus[uuid] || defaultInvoiceStatus;
    if (action === prev) return;
    const c = allCases.find((x) => x.recordUuid === uuid);
    const meta = invoiceMeta[uuid] || {};
    const label = c ? `kasus #${c.no} (${c.client})` : `kasus ${String(uuid).slice(0, 8)}`;
    const invNo = (meta.no || '').trim();
    try {
      await patchInvoice(uuid, action);
      syncInvoiceStatus(uuid, action);
      notify(`Status invoice ${label} menjadi ${action}.`, 'success');
      recordActivity(`mengubah status invoice ${label}`, `menjadi ${action}${invNo ? ` • no. invoice ${invNo}` : ''}`, 'Invoice');
    } catch (err) {
      notify(invErrMsg(err, 'Gagal mengubah status invoice.'), 'err');
    }
  }

  function exportData() {
    const headers = ['NO', 'DATE ISSUE', 'CLIENT', 'PIC NAME', 'ISSUE', 'MODULE', 'BILLING STATUS', 'BILLING CATEGORY', 'SUPPORT TYPE', 'CHARGES', 'STATUS VALIDASI', 'STATUS INVOICE', 'NOMOR INVOICE', 'KETERANGAN', 'COMPLETION NOTES', 'RECORD_UUID'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      headers.join(','),
      ...filtered.map((c) => {
        const m = invoiceMeta[c.recordUuid] || {};
        return [
          c.no, c.dateIssue, c.client, c.picName, c.issue, c.module, c.billingStatus, c.billingCategory,
          c.supportType, c.charges, caseAuditStatus[c.recordUuid] || '', invoiceStatus[c.recordUuid] || '',
          m.no || '', m.note || '',
          c.completionNotes, c.recordUuid,
        ]
          .map(esc)
          .join(',');
      }),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'finance-audit.csv';
    a.click();
    URL.revokeObjectURL(url);
    notify(`Export ${filtered.length} kasus tervalidasi berhasil diunduh.`, 'success');
  }

  const filterCls =
    'mt-1 block text-sm border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-300 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 transition';

  return (
    <div className="w-full min-w-0 px-3 sm:px-4 md:px-5 py-5 space-y-5">
      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#064e3b] via-[#059669] to-[#10b981] text-white shadow-2xl shadow-emerald-600/25 animate-fade-in-fast">
        <div aria-hidden="true" className="absolute -right-24 -top-24 w-96 h-96 bg-white/15 rounded-full blur-3xl" />
        <div aria-hidden="true" className="absolute -left-16 -bottom-28 w-80 h-80 bg-teal-300/20 rounded-full blur-3xl" />
        <div className="relative p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] bg-white/15 border border-white/20 rounded-full px-3 py-1">
                [ FINANCE /// INVOICE ]
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-white/10 border border-white/15 rounded-full px-3 py-1">
                {user?.name || 'Finance User'}
              </span>
            </div>
            <h1 className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight">
              Finance Audit
            </h1>
            <p className="mt-2 text-sm text-white/75 max-w-xl leading-relaxed">
              {stats.total} kasus tervalidasi siap invoice · outstanding <span className="font-bold text-white tabular-nums">{fmtMoney(stats.outstandingAmount)}</span> · {stats.paid} sudah PAID.
            </p>
          </div>
          <div className="flex flex-wrap lg:flex-col gap-2.5 shrink-0">
            <button
              onClick={() => setMasterOpen(true)}
              className="inline-flex items-center justify-center gap-2 bg-white text-emerald-700 text-sm font-extrabold px-4 py-3 rounded-2xl shadow-lg hover:bg-emerald-50 transition active:scale-[.98]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Master Status Invoice
            </button>
            <button
              onClick={exportData}
              className="inline-flex items-center justify-center gap-2 text-[13px] font-bold text-white/90 bg-white/10 hover:bg-white/20 border border-white/15 px-4 py-2.5 rounded-2xl transition active:scale-[.98]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Export CSV
            </button>
          </div>
        </div>
      </section>

      {/* Alur kerja */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm px-4 py-3 flex flex-wrap items-center gap-x-2 gap-y-2 text-[11px] font-bold animate-fade-in-fast">
        <span className="text-slate-400 uppercase tracking-[0.14em]">Alur:</span>
        <Link to="/billing" className="text-brand-600 hover:text-brand-700 hover:underline uppercase tracking-wide">Billing & Audit</Link>
        <Arrow />
        <FlowPill tone="bg-amber-50 text-amber-700 border-amber-200">Menunggu Invoice</FlowPill>
        <Arrow />
        <FlowPill tone="bg-violet-50 text-violet-700 border-violet-200">Invoice Terbit</FlowPill>
        <Arrow />
        <FlowPill tone="bg-emerald-50 text-emerald-700 border-emerald-200">Paid</FlowPill>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {kpi.map((d, i) => (
          <div key={d.t} className="group relative overflow-hidden bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800 p-5 shadow-[0_1px_2px_rgba(16,24,40,.05)] hover:shadow-xl hover:-translate-y-1 hover:border-transparent transition-all duration-300 animate-fade-in-fast">
            <div aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${d.accent}`} />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.12em] truncate">{d.t}</p>
                <p className={`mt-2 ${d.size || 'text-[22px]'} leading-tight font-extrabold tracking-tight tabular-nums ${d.color} ${d.darkColor || ''}`}>{d.v}</p>
                <p className="mt-1.5 text-xs font-medium text-slate-400 truncate">{d.sub}</p>
              </div>
              <span className={`w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br ${d.accent} flex items-center justify-center`}>
                <span className="w-2.5 h-2.5 rounded-full bg-white" aria-hidden="true" />
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-[0_1px_2px_rgba(16,24,40,.05)] p-5 animate-fade-in-fast">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-extrabold text-slate-900 dark:text-white tracking-tight">Filter Data</h3>
            <p className="text-xs text-slate-400">
              {loading ? 'Memuat dari backend…' : <>Menampilkan <span className="font-bold text-emerald-600">{filtered.length}</span> dari {validatedPool.length} kasus tervalidasi</>}
            </p>
          </div>
          <button
            onClick={() => {
              setFrom('');
              setTo('');
              setBrand('');
              setBillStatus('');
              setInvFilter('');
            }}
            className="text-[13px] font-bold text-slate-500 dark:text-slate-300 hover:text-rose-600 border border-slate-200 dark:border-slate-700 hover:border-rose-200 hover:bg-rose-50 dark:hover:bg-rose-500/10 px-4 py-2 rounded-xl transition"
          >
            Reset Filter
          </button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Date From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={filterCls} />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Date Until</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={filterCls} />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Brand</label>
            <select value={brand} onChange={(e) => setBrand(e.target.value)} className={`${filterCls} min-w-[200px]`}>
              <option value="">Semua Brand</option>
              {brands.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Billing Status</label>
            <select value={billStatus} onChange={(e) => setBillStatus(e.target.value)} className={`${filterCls} min-w-[150px]`}>
              <option value="">ON-CALL + MONTHLY</option>
              <option value="ON-CALL">ON-CALL</option>
              <option value="MONTHLY">MONTHLY</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Status Invoice</label>
            <select value={invFilter} onChange={(e) => setInvFilter(e.target.value)} className={`${filterCls} min-w-[180px]`}>
              <option value="">Semua</option>
              {invoiceActions.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800 overflow-hidden shadow-[0_1px_2px_rgba(16,24,40,.05),0_12px_32px_-16px_rgba(16,24,40,.15)] animate-fade-in-fast">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3 justify-between bg-gradient-to-r from-slate-50/80 to-white dark:from-slate-800/60 dark:to-slate-900">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.191-2.074-.571a1.918 1.918 0 01-1.816-1.816A2.487 2.487 0 0112 7.5a2.487 2.487 0 012.5 2.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            <div>
              <h3 className="font-extrabold text-slate-900 dark:text-white tracking-tight">Kasus Tervalidasi — Siap Invoice</h3>
              <p className="text-xs text-slate-400">{loading ? 'Memuat dari backend…' : `${filtered.length} kasus · total ${fmtMoney(total)}`}</p>
            </div>
          </div>
          <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1.5 tabular-nums">
            Total filter: {fmtMoney(total)}
          </span>
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm min-w-[1240px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/70">
                <th className="px-6 py-3 font-bold">No</th>
                <th className="px-4 py-3 font-bold">Tanggal</th>
                <th className="px-4 py-3 font-bold">Brand</th>
                <th className="px-4 py-3 font-bold">PIC</th>
                <th className="px-4 py-3 font-bold">Issue</th>
                <th className="px-4 py-3 font-bold">Module</th>
                <th className="px-4 py-3 font-bold">Billing Status</th>
                <th className="px-4 py-3 font-bold">Billing Category</th>
                <th className="px-4 py-3 font-bold text-right">Charges</th>
                <th className="px-4 py-3 font-bold">Status Invoice</th>
                <th className="px-4 py-3 font-bold">Upload PDF</th>
                <th className="px-4 py-3 font-bold">No. Invoice</th>
                <th className="px-4 py-3 font-bold">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((c) => {
                const meta = invoiceMeta[c.recordUuid] || {};
                const bs = (c.billingStatus || '').trim() || '-';
                return (
                <tr key={c.recordUuid} className="even:bg-slate-50/60 dark:even:bg-slate-800/40 hover:bg-emerald-50/50 dark:hover:bg-slate-800 transition">
                  <td className="px-6 py-3.5 text-slate-400 tabular-nums">{c.no}</td>
                  <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300 font-semibold whitespace-nowrap tabular-nums">{fmtDate8(c.dateIssue)}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className="font-bold text-slate-800 dark:text-slate-100">{c.client}</span>
                  </td>
                  <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{c.picName || '-'}</td>
                  <td className="px-4 py-3.5">
                    <div className="min-w-[200px] max-w-[300px]">
                      <p className="text-slate-500 dark:text-slate-300 text-xs line-clamp-2">{c.issue || '-'}</p>
                      <button
                        type="button"
                        onClick={() => setDetailUuid(c.recordUuid)}
                        className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-brand-600 dark:text-brand-300 hover:text-brand-700 bg-brand-50 dark:bg-brand-500/10 hover:bg-brand-100 dark:hover:bg-brand-500/20 border border-brand-100 dark:border-brand-500/20 rounded-lg px-2.5 py-1 transition"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                        </svg>
                        Lihat Detail
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 rounded-full px-2.5 py-1">{c.module}</span>
                    {c.subModule && <span className="mt-1 block text-[10px] text-slate-400 font-medium">{c.subModule}</span>}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold border rounded-full px-2.5 py-1 ${BILL_BADGE[bs] || 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />{bs}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">{c.billingCategory || '-'}</td>
                  <td className={`px-4 py-3.5 text-right tabular-nums whitespace-nowrap ${+c.charges > 0 ? 'font-extrabold text-amber-700 dark:text-amber-400' : 'font-semibold text-slate-300 dark:text-slate-600'}`}>{fmtMoney(c.charges)}</td>
                  <td className="px-4 py-3.5">
                    <select
                      value={invoiceStatus[c.recordUuid] || defaultInvoiceStatus}
                      onChange={(e) => handleInvoice(c.recordUuid, e.target.value)}
                      title="MENUNGGU/TERBIT otomatis oleh sistem (upload/hapus PDF) — manual hanya PAID"
                      className={`text-xs font-semibold border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 bg-white dark:bg-slate-800 dark:text-slate-100 max-w-[180px] ${INV_TONE[invoiceStatus[c.recordUuid]] || 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}
                    >
                      {invoiceActions.map((a) => {
                        const cur = invoiceStatus[c.recordUuid] || defaultInvoiceStatus;
                        // Opsi otomatis dikunci kecuali sedang terpilih (tampil baca-saja)
                        const locked = INV_AUTO_LOCKED.includes(a) && cur !== a;
                        return <option key={a} value={a} disabled={locked}>{a}{locked ? ' (otomatis)' : ''}</option>;
                      })}
                    </select>
                  </td>
                  <td className="px-4 py-3.5">
                    <PdfCell recordUuid={c.recordUuid} caseNo={c.no} caseClient={c.client} notify={notify} onStatusChange={syncInvoiceStatus} />
                  </td>
                  <td className="px-4 py-3.5">
                    <input
                      type="text"
                      placeholder="No. invoice"
                      value={meta.no || ''}
                      onChange={(e) => updateInvoiceMeta(c.recordUuid, { no: e.target.value })}
                      className="text-xs font-mono border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 w-[130px]"
                    />
                  </td>
                  <td className="px-4 py-3.5">
                    <input
                      type="text"
                      placeholder="Keterangan..."
                      title={meta.note || ''}
                      value={meta.note || ''}
                      onChange={(e) => updateInvoiceMeta(c.recordUuid, { note: e.target.value })}
                      className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 w-[160px]"
                    />
                  </td>
                </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-6 py-12 text-center text-slate-400 text-sm">
                    Belum ada kasus tervalidasi — validasi dulu kasus di menu{' '}
                    <Link to="/billing" className="font-semibold text-emerald-600 hover:underline">
                      Billing &amp; Audit
                    </Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2 justify-between text-xs text-slate-400 bg-slate-50/60 dark:bg-slate-800/40">
          <span>
            Hanya kasus <span className="font-bold text-emerald-600 dark:text-emerald-400">VALID - SIAP INVOICE</span> dari Billing & Audit yang tampil di halaman ini
          </span>
          <span className="tabular-nums">
            {filtered.length} kasus · <span className="text-base font-extrabold text-slate-900 dark:text-white">Total: {fmtMoney(total)}</span>
          </span>
        </div>
      </div>

      {/* Modal Master Status Invoice */}
      {masterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setMasterOpen(false)} />
          <div className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md animate-fade-in-fast overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-emerald-50/80 to-white dark:from-slate-800 dark:to-slate-900">
              <div>
                <h3 className="font-extrabold text-slate-900 dark:text-white tracking-tight">Master Status Invoice</h3>
                <p className="text-xs text-slate-400">Kelola opsi status invoice</p>
              </div>
              <button onClick={() => setMasterOpen(false)} aria-label="Tutup" className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-4">
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {invoiceActions.map((a) => {
                  const used = Object.values(invoiceStatus).filter((s) => s === a).length;
                  const isEditing = editingAction === a;
                  return (
                    <li key={a} className="py-3 flex items-center justify-between gap-2">
                      {isEditing ? (
                        <form
                          className="flex-1 flex items-center gap-2"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            if (editBusy) return;
                            setEditErr('');
                            setEditBusy(true);
                            try {
                              const r = await renameInvoiceAction(a, editValue);
                              const finalName = r?.to || String(editValue).trim().toUpperCase();
                              recordActivity(
                                `mengubah nama status invoice "${a}" menjadi "${finalName}"`,
                                `${r?.migrated ?? 0} kasus dimigrasi`,
                                'Konfigurasi'
                              );
                              notify(`"${a}" menjadi "${finalName}" (${r?.migrated ?? 0} kasus).`, 'success');
                              setEditingAction(null);
                              setEditValue('');
                            } catch (err) {
                              setEditErr(err?.message || 'Gagal menyimpan.');
                            } finally {
                              setEditBusy(false);
                            }
                          }}
                        >
                          <input
                            autoFocus
                            type="text"
                            value={editValue}
                            maxLength={40}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="flex-1 min-w-0 text-sm font-bold border-2 border-emerald-300 dark:border-emerald-500/40 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 uppercase"
                          />
                          <button
                            type="submit"
                            disabled={editBusy}
                            className="shrink-0 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 px-3 py-1.5 rounded-lg transition"
                          >
                            {editBusy ? '…' : 'Simpan'}
                          </button>
                          <button
                            type="button"
                            disabled={editBusy}
                            onClick={() => { setEditingAction(null); setEditValue(''); setEditErr(''); }}
                            className="shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 px-3 py-1.5 rounded-lg transition"
                          >
                            Batal
                          </button>
                        </form>
                      ) : (
                        <>
                          <span className="min-w-0">
                            <span className="block text-sm text-slate-700 dark:text-slate-200 font-bold truncate">{a}</span>
                            <span className="block text-[10px] text-slate-400 font-medium">
                              {DEFAULT_INVOICE.includes(a) ? 'Default' : 'Kustom'} · dipakai {used} kasus
                            </span>
                          </span>
                          <span className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => { setEditingAction(a); setEditValue(a); setEditErr(''); }}
                              title={`Ubah nama "${a}"`}
                              className="text-xs font-semibold text-brand-600 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-500/10 px-2 py-1 rounded transition"
                            >
                              Edit
                            </button>
                            {DEFAULT_INVOICE.includes(a) ? null : (
                              <button
                                onClick={() => {
                                  if (confirm(`Yakin hapus status "${a}"? ${used} kasus yang menggunakannya akan kembali ke status default.`)) {
                                    removeInvoiceAction(a);
                                    recordActivity(`menghapus status invoice "${a}"`, 'kasus terkait kembali ke status default', 'Konfigurasi');
                                    notify(`Status "${a}" dihapus.`, 'success');
                                  }
                                }}
                                className="text-xs font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 px-2 py-1 rounded transition"
                              >
                                Hapus
                              </button>
                            )}
                          </span>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
              {editErr && <p className="mt-1 text-xs font-semibold text-rose-600">{editErr}</p>}
              <form
                className="mt-4 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const val = newAction.trim().toUpperCase();
                  if (!val) return;
                  if (invoiceActions.includes(val)) {
                    notify(`Status "${val}" sudah ada.`, 'error');
                    return;
                  }
                  addInvoiceAction(val);
                  recordActivity(`menambah status invoice baru "${val}"`, '', 'Konfigurasi');
                  notify(`Status "${val}" ditambahkan.`, 'success');
                  setNewAction('');
                }}
              >
                <input
                  type="text"
                  placeholder="Status invoice baru..."
                  value={newAction}
                  onChange={(e) => setNewAction(e.target.value)}
                  className="flex-1 text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
                />
                <button className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 rounded-lg transition">Tambah</button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Popup detail kasus dari kolom Issue */}
      {(() => {
        const d = allCases.find((x) => x.recordUuid === detailUuid) || null;
        const meta = d ? invoiceMeta[d.recordUuid] || {} : {};
        const invStatus = d ? invoiceStatus[d.recordUuid] || defaultInvoiceStatus : null;
        return (
          <CaseDetailModal
            c={d}
            kicker={`Detail Kasus #${d?.no || '-'}`}
            title={d?.client || '-'}
            chips={d ? [
              { text: d.module || '-', className: 'bg-white/15 border-white/20' },
              { text: d.billingStatus || '-', className: 'bg-white/15 border-white/20' },
              { text: invStatus, className: 'bg-amber-300/90 text-amber-900 border-transparent' },
            ] : []}
            sections={d ? [
              { title: 'Informasi Kasus', rows: [
                ['Tgl Issue', fmtDate8(d.dateIssue)],
                ['Brand', d.client || '-'],
                ['Channel', d.channelTicket || '-'],
                ['PIC Name', d.picName || d.assignTo || '-'],
                ['Module', d.module || '-'],
                ['Sub-Module', d.subModule || '-'],
                ['Lokasi', d.location || '-'],
              ]},
              { title: 'Billing & Invoice', rows: [
                ['Status Billing', d.billingStatus || '-'],
                ['Kategori Billing', d.billingCategory || '-'],
                ['Tipe Support', d.supportType || '-'],
                ['Charges', fmtMoney(d.charges)],
                ['Status Validasi', VALID_TAG],
                ['Status Invoice', invStatus],
                ['No. Invoice', meta.no || '-'],
                ['Keterangan', meta.note || '-'],
              ]},
            ] : []}
            notes={{ label: 'Completion Notes', text: d?.completionNotes }}
            onClose={() => setDetailUuid(null)}
          />
        );
      })()}
    </div>
  );
}

function fmtMoney(n) {
  return 'Rp ' + (n || 0).toLocaleString('id-ID');
}

function FlowPill({ tone, children }) {
  return (
    <span className={`inline-flex items-center border rounded-full px-3 py-1 uppercase tracking-wide ${tone}`}>
      {children}
    </span>
  );
}

function Arrow() {
  return (
    <svg className="w-3.5 h-3.5 text-slate-300" fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}
