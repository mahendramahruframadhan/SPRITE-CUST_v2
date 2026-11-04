import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useRangedCases } from '../hooks/useCases.js';
import { getAuditMap } from '../lib/api.js';
import {
  reportTickets,
  uniformValue,
  sumCharges,
  buildPivotClientSupport,
  buildPivotCategory,
} from '../lib/billingReportData.js';
import { reportDocNumber } from '../config/billingReport.js';
import { fmtMoney } from '../utils/format.js';

const ID_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// YYYYMMDD -> '28 Okt 2026' (bulan Indonesia singkat, tanpa locale browser)
function fmtDateID(s) {
  if (!s || String(s).length !== 8) return '-';
  return `${+s.slice(6, 8)} ${ID_MONTHS[+s.slice(4, 6) - 1]} ${s.slice(0, 4)}`;
}

const today8 = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
};

// Escape teks agar aman dimasukkan ke `content: "..."` pada CSS.
const cssText = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');

// Laporan Billing On-Call A4 (gaya surat jalan). Data-driven dari filter billing:
// query ?from=YYYY-MM-DD&to=YYYY-MM-DD&brand=NAMA (kosong = tanpa batas/semua brand).
export default function BillingReportPage() {
  const [params] = useSearchParams();
  const from = params.get('from') || '';
  const to = params.get('to') || '';
  const brand = params.get('brand') || '';

  const { cases, loading } = useRangedCases(from, to);
  const [auditMap, setAuditMap] = useState({});

  useEffect(() => {
    let alive = true;
    getAuditMap()
      .then((r) => {
        if (alive && r && typeof r.map === 'object') setAuditMap(r.map);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const rows = useMemo(() => {
    const withAudit = cases.map((c) => ({
      ...c,
      statusValidasi: auditMap[c.recordUuid] || 'BELUM DIVALIDASI',
    }));
    return reportTickets(withAudit, { from, to, brand });
  }, [cases, auditMap, from, to, brand]);

  const total = useMemo(() => sumCharges(rows), [rows]);
  const pivot1 = useMemo(() => buildPivotClientSupport(rows), [rows]);
  const pivot2 = useMemo(() => buildPivotCategory(rows), [rows]);

  const info = useMemo(
    () => ({
      modul: uniformValue(rows, 'module'),
      billingStatus: uniformValue(rows, 'billingStatus'),
      statusValidasi: uniformValue(rows, 'statusValidasi'),
      completionNotes: uniformValue(rows, 'completionNotes'),
    }),
    [rows]
  );

  // Periode = tanggal terawal–terakhir dari data yang tampil.
  const periode = useMemo(() => {
    if (!rows.length) return '-';
    const dates = rows.map((r) => r.dateIssue).sort();
    const a = dates[0];
    const b = dates[dates.length - 1];
    return a === b ? fmtDateID(a) : `${fmtDateID(a)} – ${fmtDateID(b)}`;
  }, [rows]);

  const footerText = `Laporan Billing Audit On-Call · ${periode}`;
  const printDate = fmtDateID(today8());
  const docNumber = reportDocNumber(new Date());

  // Aturan cetak: footer kiri (nama laporan + periode) & nomor halaman X / Y
  // diletakkan di margin @page (Chrome mendukung counter(page)/counter(pages)).
  const printCss = `
    @page { size: A4 portrait; margin: 12mm 13mm 14mm; }
    @media print {
      body.bjr-body { background: #fff; }
      .bjr-bar { display: none; }
      .bjr-sheet { margin: 0; box-shadow: none; min-height: auto; }
      .bjr-foot-left { display: none; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    @page {
      @bottom-left { content: "${cssText(footerText)}"; font: 7.5pt Arial, sans-serif; color: #777; }
      @bottom-right { content: "Halaman " counter(page) " / " counter(pages); font: 7.5pt Arial, sans-serif; color: #777; }
    }
  `;

  const rp = (n) => (n ? fmtMoney(n) : '–');

  return (
    <div className="bjr-body" style={{ margin: 0, background: '#d9dce1', font: '9.5pt/1.35 Arial, Helvetica, sans-serif', color: '#111' }}>
      <style>{printCss}</style>
      <style>{`
        .bjr-sheet { width: 210mm; min-height: 297mm; margin: 0 auto 20px; background: #fff; padding: 2mm 0 6mm; box-shadow: 0 2px 12px rgba(0,0,0,.25); position: relative; }
        .bjr-inner { padding: 0 0mm; }
        .bjr-head { text-align: center; border-bottom: 3px double #111; padding-bottom: 8px; }
        .bjr-head h1 { margin: 0; font-size: 16pt; letter-spacing: 1.5px; }
        .bjr-head div { font-size: 8.5pt; color: #444; margin-top: 2px; }
        .bjr-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin: 10px 0 12px; font-size: 9pt; }
        .bjr-meta > div { display: flex; }
        .bjr-meta span:first-child { width: 34mm; color: #444; }
        .bjr-meta span:last-child { font-weight: bold; }
        .bjr-sheet table { width: 100%; border-collapse: collapse; }
        .bjr-main th, .bjr-main td { border: 1px solid #222; padding: 4px 5px; vertical-align: top; }
        .bjr-main th { background: #eceff3; font-size: 8.5pt; text-transform: uppercase; }
        .bjr-main td { font-size: 8.8pt; }
        .bjr-main thead { display: table-header-group; }
        .bjr-main tr { break-inside: avoid; page-break-inside: avoid; }
        .bjr-u { font: 6.6pt/1.3 Consolas, 'Courier New', monospace; word-break: break-all; }
        .bjr-c { text-align: center; }
        .bjr-r { text-align: right; white-space: nowrap; }
        .bjr-m { font-size: 7.8pt; color: #555; }
        .bjr-tot td { font-weight: bold; background: #f6f7f9; }
        .bjr-h2 { font-size: 10pt; margin: 16px 0 5px; letter-spacing: .5px; break-after: avoid; }
        .bjr-sum { display: flex; gap: 16px; margin-top: 12px; align-items: flex-start; }
        .bjr-gt td { font-weight: bold; background: #eceff3; }
        .bjr-note { flex: 1; font-size: 8.5pt; color: #333; border: 1px solid #999; padding: 6px 8px; }
        .bjr-recap th, .bjr-recap td { border: 1px solid #666; padding: 3px 5px; font-size: 8.5pt; }
        .bjr-recap th { background: #f1f1f1; }
        .bjr-recap { break-inside: avoid; page-break-inside: avoid; }
        .bjr-bar { text-align: center; padding: 12px; }
        .bjr-bar button { font: inherit; padding: 8px 18px; border: 0; border-radius: 6px; background: #1f3a5f; color: #fff; cursor: pointer; }
        .bjr-empty { padding: 40px 0; text-align: center; font-size: 10pt; color: #555; }
      `}</style>

      <div className="bjr-bar">
        <button type="button" onClick={() => window.print()}>Cetak / Simpan PDF (A4)</button>
      </div>

      <div className="bjr-sheet">
        <div className="bjr-inner">
          <div className="bjr-head">
            <h1>LAPORAN BILLING – ON-CALL</h1>
            <div>Billing Audit · Periode {periode}</div>
          </div>

          <div className="bjr-meta">
            <div><span>No. Dokumen</span><span>: {docNumber}</span></div>
            <div><span>Tanggal Cetak</span><span>: {printDate}</span></div>
            <div><span>Periode</span><span>: {periode}</span></div>
            <div><span>Modul</span><span>: {info.modul}</span></div>
            <div><span>Billing Status</span><span>: {info.billingStatus}</span></div>
            <div><span>Status Validasi</span><span>: {info.statusValidasi}</span></div>
            <div><span>Completion Notes</span><span>: {info.completionNotes}</span></div>
            <div><span>Jumlah Layanan</span><span>: {rows.length} tiket</span></div>
          </div>

          {rows.length === 0 ? (
            <p className="bjr-empty">
              {loading ? 'Memuat data…' : 'Tidak ada data tiket ON-CALL yang cocok dengan filter.'}
            </p>
          ) : (
            <>
              <table className="bjr-main">
                <thead>
                  <tr>
                    <th style={{ width: '7mm' }}>No</th>
                    <th style={{ width: '29mm' }}>UUID Tiket</th>
                    <th style={{ width: '19mm' }}>Tanggal</th>
                    <th style={{ width: '27mm' }}>Client</th>
                    <th>Issue</th>
                    <th style={{ width: '16mm' }}>PIC</th>
                    <th style={{ width: '28mm' }}>Kategori / Support</th>
                    <th style={{ width: '22mm' }}>Charges</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.uuid || i}>
                      <td className="bjr-c">{i + 1}</td>
                      <td className="bjr-u">{r.uuid || '-'}</td>
                      <td>{fmtDateID(r.dateIssue)}</td>
                      <td><b>{r.client || '-'}</b></td>
                      <td>{r.issue || '-'}</td>
                      <td>{r.pic}</td>
                      <td>
                        {r.billingCategory || '-'}
                        <br />
                        <span className="bjr-m">{r.supportType || '-'}</span>
                      </td>
                      <td className="bjr-r">{fmtMoney(r.charges)}</td>
                    </tr>
                  ))}
                  <tr className="bjr-tot">
                    <td colSpan={7} className="bjr-r">TOTAL CHARGES</td>
                    <td className="bjr-r">{fmtMoney(total)}</td>
                  </tr>
                </tbody>
              </table>

              <h2 className="bjr-h2">PIVOT SUMMARY – TOTAL CHARGES</h2>
              <div className="bjr-sum">
                <table className="bjr-recap">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Tiket</th>
                      {pivot1.types.map((t) => (
                        <th key={t}>{t.replace('SUPPORT TYPE - ', 'Type ')}</th>
                      ))}
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pivot1.body.map((r) => (
                      <tr key={r.client}>
                        <td>{r.client || '-'}</td>
                        <td className="bjr-c">{r.tickets}</td>
                        {pivot1.types.map((t) => (
                          <td key={t} className="bjr-r">{rp(r.byType.get(t))}</td>
                        ))}
                        <td className="bjr-r"><b>{fmtMoney(r.total)}</b></td>
                      </tr>
                    ))}
                    <tr className="bjr-gt">
                      <td>GRAND TOTAL</td>
                      <td className="bjr-c">{pivot1.grand.tickets}</td>
                      {pivot1.types.map((t) => (
                        <td key={t} className="bjr-r">{rp(pivot1.grand.byType.get(t))}</td>
                      ))}
                      <td className="bjr-r">{fmtMoney(pivot1.grand.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="bjr-sum">
                <table className="bjr-recap" style={{ flex: 1 }}>
                  <thead>
                    <tr>
                      <th>Billing Category</th>
                      <th>Tiket</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pivot2.body.map((r) => (
                      <tr key={r.category}>
                        <td>{r.category}</td>
                        <td className="bjr-c">{r.tickets}</td>
                        <td className="bjr-r">{fmtMoney(r.total)}</td>
                      </tr>
                    ))}
                    <tr className="bjr-gt">
                      <td>GRAND TOTAL</td>
                      <td className="bjr-c">{pivot2.grand.tickets}</td>
                      <td className="bjr-r">{fmtMoney(pivot2.grand.total)}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="bjr-note">
                  <b>Catatan:</b>
                  <br />
                  Seluruh layanan telah divalidasi dan siap ditagihkan.
                </div>
              </div>
            </>
          )}

          {/* Footer di layar (saat print digantikan margin box @page agar nomor halaman otomatis) */}
          <div className="bjr-foot-left" style={{ marginTop: 24, fontSize: '7.5pt', color: '#777', borderTop: '1px solid #ccc', paddingTop: 3, display: 'flex', justifyContent: 'space-between' }}>
            <span>{footerText}</span>
            <span>Halaman 1 / 1</span>
          </div>
        </div>
      </div>
    </div>
  );
}
