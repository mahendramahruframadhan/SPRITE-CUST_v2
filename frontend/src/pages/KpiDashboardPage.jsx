/* eslint-disable react/forbid-elements -- kontrol periode mengikuti CSS template (.seg button), bukan varian Button */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Line, Bar, Doughnut, Radar } from 'react-chartjs-2';
import { useCases } from '../hooks/useCases.js';
import { useTheme } from '../context/ThemeContext.jsx';

const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const HARI = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum'];

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
.kpi-dash{--card:#fff;--ink:#14182e;--mut:#6a7290;--line:#e3e7f2;--pri:#3b4cca;--pri2:#8a6cff;--ok:#0fa99b;--warn:#f0a020;--bad:#f2557a;--hero1:#2a2f8f;--hero2:#4b3bd1;color-scheme:light;background:transparent;color:var(--ink);font-family:"Plus Jakarta Sans",Inter,system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.5}
.dark .kpi-dash{--card:#171b35;--ink:#eceffd;--mut:#9aa3c7;--line:#262b4f;--pri:#7d8bff;--pri2:#b39cff;--ok:#35d0c0;--warn:#ffc04d;--bad:#ff7d9b;--hero1:#1a1f66;--hero2:#33279e;color-scheme:dark}
.kpi-dash *{box-sizing:border-box}
.kpi-dash .page{max-width:1600px}
.kpi-dash .top{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:center;margin:0}
.kpi-dash .top h1{font-size:20px;margin:0;font-weight:800;letter-spacing:-.01em}
.kpi-dash .top p{margin:0;font-size:13px;color:var(--mut)}
.kpi-dash .seg{display:inline-flex;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:4px;flex-wrap:wrap}
.kpi-dash .seg button{border:0;background:none;color:var(--mut);font:600 13px inherit;font-family:inherit;padding:7px 16px;border-radius:9px;cursor:pointer}
.kpi-dash .seg button[aria-pressed=true]{background:var(--pri);color:#fff}
.kpi-dash .seg button:focus-visible{outline:2px solid var(--pri2);outline-offset:2px}
.kpi-dash .g{display:grid;gap:16px;grid-template-columns:repeat(12,1fr);margin:0}
.kpi-dash .c{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px}
.kpi-dash .c h2{font-size:15px;margin:0 0 2px;font-weight:700}
.kpi-dash .c .s{font-size:12.5px;color:var(--mut);margin:0 0 12px}
.kpi-dash .s12{grid-column:span 12}.kpi-dash .s8{grid-column:span 8}.kpi-dash .s7{grid-column:span 7}.kpi-dash .s5{grid-column:span 5}.kpi-dash .s4{grid-column:span 4}.kpi-dash .s2{grid-column:span 2}
@media(max-width:900px){.kpi-dash .s8,.kpi-dash .s7,.kpi-dash .s5,.kpi-dash .s4{grid-column:span 12}.kpi-dash .s2{grid-column:span 6}}
@media(max-width:520px){.kpi-dash .s2{grid-column:span 12}}
.kpi-dash .hero{background:linear-gradient(120deg,var(--hero1),var(--hero2));color:#fff;border:0;border-radius:28px;display:grid;grid-template-columns:minmax(220px,300px) 1fr;gap:24px;align-items:center;padding:24px}
@media(max-width:700px){.kpi-dash .hero{grid-template-columns:1fr}}
.kpi-dash .gauge{position:relative;width:100%;max-width:300px;margin:0 auto}
.kpi-dash .gauge svg{width:100%;display:block}
.kpi-dash .gauge .num{position:absolute;left:0;right:0;bottom:6px;text-align:center}
.kpi-dash .gauge .num b{font-size:54px;font-weight:800;line-height:1;letter-spacing:-.03em}
.kpi-dash .gauge .num span{display:block;font-size:13px;opacity:.85}
.kpi-dash #arc{transition:stroke-dasharray 1.2s cubic-bezier(.2,.8,.2,1)}
.kpi-dash .hero h2{font-size:24px;margin:0 0 6px;font-weight:800;letter-spacing:-.01em;color:#fff}
.kpi-dash .hero p{margin:0 0 16px;opacity:.9;font-size:14px;max-width:56ch}
.kpi-dash .hs{display:flex;flex-wrap:wrap;gap:10px}
.kpi-dash .hs div{background:rgba(255,255,255,.14);border-radius:14px;padding:10px 16px;min-width:120px}
.kpi-dash .hs b{display:block;font-size:22px;font-weight:800}
.kpi-dash .hs span{font-size:12px;opacity:.85}
.kpi-dash .k .l{font-size:12.5px;color:var(--mut);font-weight:500}
.kpi-dash .k .v{font-size:26px;font-weight:800;letter-spacing:-.02em;margin:2px 0}
.kpi-dash .k .v small{font-size:13px;font-weight:500;color:var(--mut)}
.kpi-dash .k svg{width:100%;height:30px;display:block;margin:4px 0 6px}
.kpi-dash .k .f{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--mut);gap:6px}
.kpi-dash .b{display:inline-block;padding:2px 9px;border-radius:99px;font-size:11.5px;font-weight:700;color:#fff;white-space:nowrap}
.kpi-dash .b.ok{background:var(--ok)}.kpi-dash .b.warn{background:var(--warn);color:#2a1d00}.kpi-dash .b.bad{background:var(--bad)}
.kpi-dash .ch{position:relative;height:270px}
.kpi-dash .hm{display:grid;grid-template-columns:40px repeat(5,1fr);gap:4px;font-size:11.5px;color:var(--mut)}
.kpi-dash .hm i{aspect-ratio:1.5;border-radius:6px;display:block;min-height:26px}
.kpi-dash .hm span{display:flex;align-items:center;justify-content:center}
.kpi-dash .hm .d{justify-content:flex-start}
.kpi-dash .lg{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--mut);margin-top:10px}
.kpi-dash .lg i{width:90px;height:8px;border-radius:4px;background:linear-gradient(90deg,rgba(59,76,202,.1),rgba(59,76,202,1))}
.kpi-dash .fn{display:flex;flex-direction:column;gap:8px}
.kpi-dash .fn div{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-radius:10px;color:#fff;font-weight:700;font-size:14px;transition:width .8s}
.kpi-dash .fn small{font-weight:500;opacity:.9;font-size:12px}
.kpi-dash .lb{display:grid;gap:12px}
.kpi-dash .lb .r{display:grid;grid-template-columns:48px 1fr auto;gap:12px;align-items:center}
.kpi-dash .lb svg{width:48px;height:48px}
.kpi-dash .lb b{font-size:14px;display:block}
.kpi-dash .lb span{font-size:12px;color:var(--mut)}
.kpi-dash .lb em{font-style:normal;font-weight:800;font-size:15px}
.kpi-dash .ins{margin:0;padding:0;list-style:none;display:grid;gap:10px;font-size:13.5px}
.kpi-dash .ins li{padding-left:14px;border-left:3px solid var(--pri2)}
.kpi-dash table{width:100%;border-collapse:collapse;font-size:13px}
.kpi-dash th,.kpi-dash td{text-align:left;padding:9px 6px;border-bottom:1px solid var(--line)}
.kpi-dash th{color:var(--mut);font-weight:600;font-size:12px}
.kpi-dash .pr{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}
.kpi-dash footer{font-size:12px;color:var(--mut);margin:0}
@media(prefers-reduced-motion:reduce){.kpi-dash #arc,.kpi-dash .fn div{transition:none}}
`;

function parse8(s) {
  if (!s || !/^\d{8}$/.test(s)) return null;
  const d = new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));
  return Number.isNaN(d.getTime()) ? null : d;
}
const monthKey = (s) => (s && /^\d{6}/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}` : '');
const labelBulan = (key) => {
  const [y, m] = key.split('-').map(Number);
  return `${NAMA_BULAN[m - 1] || m} ${y}`;
};
const durasiHari = (r) => {
  const a = parse8(r.startDate);
  const b = parse8(r.finishDate);
  return a && b ? Math.max(0, Math.round((b - a) / 86400000)) : 0;
};
const sameDay = (r) => /SAME DAY/i.test(r.completionNotes || '') || durasiHari(r) <= 0;
const fmt = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
const pct = (v, t, hb) => (hb ? (t > 0 ? (v / t) * 100 : 0) : (v > 0 ? (t / v) * 100 : 100));
const tone = (p) => (p >= 100 ? 'ok' : p >= 85 ? 'warn' : 'bad');
const LABEL_TONE = { ok: 'Tercapai', warn: 'Mendekati', bad: 'Di bawah target' };

function hitung(rows) {
  const done = rows.filter((r) => r.status === 'DONE');
  const same = done.filter(sameDay);
  const hitungPer = (keyOf) => {
    const out = new Map();
    rows.forEach((r) => {
      const k = keyOf(r) || 'Lainnya';
      out.set(k, (out.get(k) || 0) + 1);
    });
    return [...out.entries()].sort((a, b) => b[1] - a[1]);
  };
  const modul = hitungPer((r) => (r.module || '').trim().toUpperCase());
  const pic = hitungPer((r) => (r.assignTo || '').trim().toUpperCase()).filter(([k]) => k !== 'LAINNYA');
  const jenis = hitungPer((r) => (r.supportCategory || '').trim().toUpperCase());
  const masuk = Array(5).fill(0);
  const selesai = Array(5).fill(0);
  const heat = HARI.map(() => Array(5).fill(0));
  rows.forEach((r) => {
    const w = Number(r.weeknum) - 1;
    const di = parse8(r.dateIssue);
    if (w >= 0 && w < 5) masuk[w] += 1;
    const sf = parse8(r.finishDate);
    const sw = sf ? Math.min(4, Math.max(0, Math.ceil(sf.getDate() / 7) - 1)) : -1;
    if (sw >= 0) selesai[sw] += 1;
    if (di) {
      const day = (di.getDay() + 6) % 7;
      if (day < 5 && w >= 0 && w < 5) heat[day][w] += 1;
    }
  });
  return {
    total: rows.length,
    done: done.length,
    same: same.length,
    samePct: done.length ? (same.length / done.length) * 100 : 0,
    avgDur: done.length ? done.reduce((a, r) => a + durasiHari(r), 0) / done.length : 0,
    bugs: rows.filter((r) => /BUG/i.test(r.supportCategory || '')).length,
    oncall: rows.filter((r) => /ON-CALL/i.test(r.billingStatus || '')).length,
    backlog: rows.length - done.length,
    modul: modul.slice(0, 5),
    modulAll: modul,
    pic,
    jenis,
    masuk,
    selesai,
    heat,
  };
}

function spark(values, i, col) {
  if (!values.length) return '';
  const mx = Math.max(...values);
  const mn = Math.min(...values);
  const r = mx - mn || 1;
  const p = values.map((v, j) => [j * 50 + 5, 26 - ((v - mn) / r) * 22]);
  const at = p[Math.min(Math.max(i, 0), p.length - 1)];
  return `<svg viewBox="0 0 110 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="${p.map((x) => x.join(',')).join(' ')}" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${at[0]}" cy="${at[1]}" r="3.5" fill="${col}"/></svg>`;
}

export default function KpiDashboardPage() {
  const { cases, loading, error } = useCases();
  const { theme } = useTheme();
  const rootRef = useRef(null);
  const [colors, setColors] = useState(null);

  const periods = useMemo(() => [...new Set(cases.map((r) => monthKey(r.dateIssue)).filter(Boolean))].sort(), [cases]);
  const [periode, setPeriode] = useState('');
  useEffect(() => {
    if (periods.length && !periode) setPeriode(periods[periods.length - 1]);
  }, [periods, periode]);

  const semua = useMemo(() => hitung(cases), [cases]);
  const perBulan = useMemo(() => periods.map((p) => hitung(cases.filter((r) => monthKey(r.dateIssue) === p))), [periods, cases]);
  const m = useMemo(() => (periode ? hitung(cases.filter((r) => monthKey(r.dateIssue) === periode)) : semua), [cases, periode, semua]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const v = (n) => cs.getPropertyValue(n).trim();
    setColors({ ok: v('--ok'), warn: v('--warn'), bad: v('--bad'), pri: v('--pri'), pri2: v('--pri2'), line: v('--line'), mut: v('--mut'), card: v('--card'), ink: v('--ink') });
  }, [theme, loading]);

  const bulanKerja = useMemo(() => {
    const out = new Map();
    cases.forEach((r) => {
      const k = monthKey(r.startDate);
      if (k) out.set(k, (out.get(k) || 0) + 1);
    });
    return [...out.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [cases]);
  const rataDikerjakan = bulanKerja.length ? bulanKerja.reduce((a, x) => a + x[1], 0) / bulanKerja.length : 0;

  const idx = periode ? Math.max(0, periods.indexOf(periode)) : periods.length - 1;
  const avg = (field) => (perBulan.length ? perBulan.reduce((a, x) => a + x[field], 0) / perBulan.length : 0);
  const targetDone = Math.max(1, Math.ceil(avg('done') * 1.1));
  const targetBugs = Math.max(1, Math.ceil(avg('bugs') * 1.1));
  const targetOncall = Math.max(1, Math.ceil(avg('oncall') * 1.1));

  const kpis = [
    { n: 'Tiket selesai', u: '', t: targetDone, hb: 1, v: perBulan.map((x) => x.done), cur: m.done },
    { n: 'Selesai same-day', u: '%', t: 90, hb: 1, v: perBulan.map((x) => x.samePct), cur: m.samePct },
    { n: 'Rata-rata durasi', u: ' hr', t: 1, hb: 0, v: perBulan.map((x) => x.avgDur), cur: m.avgDur },
    { n: 'Kasus bug sistem', u: '', t: targetBugs, hb: 0, v: perBulan.map((x) => x.bugs), cur: m.bugs },
    { n: 'Tiket ON-CALL', u: '', t: targetOncall, hb: 1, v: perBulan.map((x) => x.oncall), cur: m.oncall },
    { n: 'Backlog', u: '', t: 20, hb: 0, v: perBulan.map((x) => x.backlog), cur: m.backlog },
  ];

  const score = kpis.length ? Math.round(kpis.reduce((a, k) => a + Math.min(pct(k.cur, k.t, k.hb), 100), 0) / kpis.length) : 0;
  const okCount = kpis.filter((k) => pct(k.cur, k.t, k.hb) >= 100).length;
  const buruk = kpis.filter((k) => pct(k.cur, k.t, k.hb) < 85);
  const judul = score >= 90 ? 'Kinerja sehat' : score >= 80 ? 'Kinerja baik, ada yang perlu dibenahi' : 'Kinerja perlu perhatian';
  const narasi = !m.total
    ? 'Belum ada data kasus untuk periode ini.'
    : `${okCount} dari ${kpis.length} KPI memenuhi target di ${periode ? labelBulan(periode) : 'seluruh periode'}.` +
      (buruk.length ? ` Yang paling tertinggal: ${buruk.map((k) => k.n.toLowerCase()).join(', ')}.` : ' Tidak ada KPI yang jauh dari target.');
  const labelPeriode = periode ? labelBulan(periode) : 'Seluruh periode';
  const modulTeratas = m.modulAll[0];
  const picTeratas = m.pic[0];
  const insights = !m.total
    ? ['Belum ada data kasus untuk periode ini.']
    : [
        `${m.done} tiket selesai di ${labelPeriode.toLowerCase()}, ${Math.round(m.samePct)}% di antaranya same-day.`,
        modulTeratas ? `Modul ${modulTeratas[0]} menyumbang ${modulTeratas[1]} tiket (${Math.round((modulTeratas[1] / m.total) * 100)}% dari seluruh tiket).` : 'Data modul belum tersedia.',
        `Rata-rata durasi pengerjaan ${fmt(m.avgDur)} hari; ${m.done - m.same} tiket memakan lebih dari satu hari.`,
        picTeratas ? `PIC ${picTeratas[0]} menangani ${picTeratas[1]} tiket (${Math.round((picTeratas[1] / Math.max(1, m.done)) * 100)}% dari tiket selesai).` : 'Data PIC belum tersedia.',
      ];
  const tindakLanjut = [];
  if (m.samePct < 90) tindakLanjut.push(['Tinjau tiket yang melewati satu hari kerja', 'Koordinator', '–', 'bad']);
  if (m.bugs > 0) tindakLanjut.push(['Prioritaskan penanganan bug sistem', 'Support', '–', 'warn']);
  if (m.backlog > 0) tindakLanjut.push(['Bersihkan backlog kasus terbuka', 'Koordinator', '–', 'pri']);
  if (!tindakLanjut.length) tindakLanjut.push(['Tidak ada tindak lanjut khusus', '–', '–', 'ok']);

  const c = colors || { ok: '#0fa99b', warn: '#f0a020', bad: '#f2557a', pri: '#3b4cca', pri2: '#8a6cff', line: '#e3e7f2', mut: '#6a7290', card: '#fff', ink: '#14182e' };
  const area = (col) => (ctx) => {
    const ch = ctx.chart;
    if (!ch.chartArea) return col;
    const g = ch.ctx.createLinearGradient(0, ch.chartArea.top, 0, ch.chartArea.bottom);
    g.addColorStop(0, col + '77');
    g.addColorStop(1, col + '05');
    return g;
  };
  const base = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true, color: c.mut } } },
  };
  const jenisWarna = [c.bad, c.pri, c.ok, c.warn, c.pri2];
  const targetPic = Math.max(1, Math.ceil((m.pic.length ? m.pic.reduce((a, x) => a + x[1], 0) / m.pic.length : 0) * 1.2));
  const maxHeat = Math.max(1, ...m.heat.flat());
  const maksWk = Math.max(1, ...m.masuk, ...m.selesai);

  return (
    <div className="kpi-dash" ref={rootRef}>
      <style>{STYLES}</style>
      <div className="page">
        <div className="top">
          <div>
            <h1>Dashboard KPI tim support &amp; development</h1>
            <p>Angka dihitung langsung dari data kasus di database — {loading ? 'memuat…' : `${m.total} kasus`}</p>
          </div>
          <div className="seg" role="group" aria-label="Pilih periode">
            <button aria-pressed={periode === ''} onClick={() => setPeriode('')}>Semua</button>
            {periods.map((p) => (
              <button key={p} aria-pressed={periode === p} onClick={() => setPeriode(p)}>{labelBulan(p)}</button>
            ))}
          </div>
        </div>

        {loading && <div className="c">Memuat data dari database…</div>}
        {error && <div className="c" role="alert">Gagal memuat data: {error}</div>}
        {!loading && !error && (
          <>
            <div className="g">
              <div className="c hero s12">
                <div className="gauge">
                  <svg viewBox="0 0 200 110" aria-hidden="true">
                    <path d="M10 100 A90 90 0 0 1 190 100" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="14" strokeLinecap="round" pathLength="100" />
                    <path id="arc" d="M10 100 A90 90 0 0 1 190 100" fill="none" stroke="#fff" strokeWidth="14" strokeLinecap="round" pathLength="100" strokeDasharray={`${score} 100`} />
                  </svg>
                  <div className="num"><b>{score}</b><span>skor KPI dari 100</span></div>
                </div>
                <div>
                  <h2>{judul}</h2>
                  <p>{narasi}</p>
                  <div className="hs">
                    <div><b>{m.done}</b><span>tiket selesai</span></div>
                    <div><b>{Math.round(m.samePct)}%</b><span>same-day</span></div>
                    <div><b>{fmt(m.avgDur)}</b><span>hari rata-rata</span></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="g">
              {kpis.map((k) => {
                const p = pct(k.cur, k.t, k.hb);
                const t = tone(p);
                return (
                  <div className="c k s2" key={k.n}>
                    <div className="l">{k.n}</div>
                    <div className="v">{fmt(k.cur)}<small>{k.u}</small></div>
                    <div dangerouslySetInnerHTML={{ __html: spark(k.v, idx, c[t]) }} />
                    <div className="f">
                      <span className={`b ${t}`}>{LABEL_TONE[t]}</span>
                      <span>target {fmt(k.t)}{k.u}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="g">
              <div className="c s12">
                <h2>Rata-rata tiket mulai dikerjakan per bulan</h2>
                <p className="s">Rata-rata {fmt(rataDikerjakan)} tiket/bulan, dihitung dari tanggal mulai (startDate) tiap kasus.</p>
                <div className="ch"><Bar data={{
                  labels: bulanKerja.map(([k]) => labelBulan(k)),
                  datasets: [
                    { type: 'bar', label: 'Tiket mulai dikerjakan', data: bulanKerja.map(([, v]) => v), backgroundColor: bulanKerja.map(([k]) => (k === periode ? c.pri2 : c.pri)), borderRadius: 8, maxBarThickness: 56 },
                    { type: 'line', label: `Rata-rata ${fmt(rataDikerjakan)} tiket`, data: bulanKerja.map(() => rataDikerjakan), borderColor: c.warn, borderDash: [6, 4], borderWidth: 2, pointRadius: 0, fill: false },
                  ],
                }} options={{ ...base, plugins: { ...base.plugins, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)} tiket` } } }, scales: { x: { grid: { display: false }, ticks: { color: c.mut } }, y: { beginAtZero: true, grid: { color: c.line }, ticks: { color: c.mut } } } }} /></div>
              </div>
            </div>

            <div className="g">
              <div className="c s8">
                <h2>Tiket masuk dan selesai per minggu</h2>
                <p className="s">Dihitung dari tanggal issue dan tanggal selesai tiap kasus.</p>
                <div className="ch"><Line data={{
                  labels: [1, 2, 3, 4, 5].map((w) => `Minggu ${w}`),
                  datasets: [
                    { label: 'Tiket masuk', data: m.masuk, borderColor: c.bad, backgroundColor: area(c.bad), fill: true, tension: 0.4, pointRadius: 4, borderWidth: 3 },
                    { label: 'Tiket selesai', data: m.selesai, borderColor: c.ok, backgroundColor: area(c.ok), fill: true, tension: 0.4, pointRadius: 4, borderWidth: 3 },
                  ],
                }} options={{ ...base, scales: { x: { grid: { display: false }, ticks: { color: c.mut } }, y: { beginAtZero: true, suggestedMax: maksWk, grid: { color: c.line }, ticks: { color: c.mut } } } }} /></div>
              </div>
              <div className="c s4">
                <h2>Jenis masalah</h2>
                <p className="s">{m.total} tiket berdasarkan kategori dukungan.</p>
                <div className="ch"><Doughnut data={{
                  labels: m.jenis.map(([k]) => k),
                  datasets: [{ data: m.jenis.map(([, v]) => v), backgroundColor: m.jenis.map((_, i) => jenisWarna[i % jenisWarna.length]), borderColor: c.card, borderWidth: 3 }],
                }} options={{ ...base, cutout: '66%' }} /></div>
              </div>
            </div>

            <div className="g">
              <div className="c s7">
                <h2>Kapan tiket paling ramai</h2>
                <p className="s">Tiket masuk per hari kerja dan minggu. Database tidak menyimpan jam, jadi panasnya per hari/minggu.</p>
                <div className="hm">
                  <span />
                  {[1, 2, 3, 4, 5].map((w) => <span key={w}>M{w}</span>)}
                  {HARI.map((h, di) => (
                    <div key={h} style={{ display: 'contents' }}>
                      <span className="d">{h}</span>
                      {m.heat[di].map((v, wi) => (
                        <i key={wi} title={`${h} minggu ${wi + 1}: ${v} tiket`} style={{ background: `rgba(${theme === 'dark' ? '125,139,255' : '59,76,202'},${(0.08 + (v / maxHeat) * 0.9).toFixed(2)})` }} />
                      ))}
                    </div>
                  ))}
                </div>
                <div className="lg">sepi <i /> ramai</div>
              </div>
              <div className="c s5">
                <h2>Same-day per modul</h2>
                <p className="s">Garis putus-putus menandai target 85%.</p>
                <div className="ch"><Radar data={{
                  labels: m.modul.map(([k]) => k),
                  datasets: [
                    { label: 'Same-day (%)', data: m.modul.map(([k]) => {
                      const rows = cases.filter((r) => (periode ? monthKey(r.dateIssue) === periode : true) && (r.module || '').trim().toUpperCase() === k && r.status === 'DONE');
                      return rows.length ? (rows.filter(sameDay).length / rows.length) * 100 : 0;
                    }), borderColor: c.pri, backgroundColor: c.pri + '33', pointBackgroundColor: c.pri, borderWidth: 2 },
                    { label: 'Target', data: m.modul.map(() => 85), borderColor: c.mut, borderDash: [5, 4], pointRadius: 0, borderWidth: 1.5, fill: false },
                  ],
                }} options={{ ...base, scales: { r: { min: 0, max: 100, ticks: { display: false, stepSize: 20 }, grid: { color: c.line }, angleLines: { color: c.line }, pointLabels: { color: c.mut, font: { size: 11 } } } } }} /></div>
              </div>
            </div>

            <div className="g">
              <div className="c s5">
                <h2>Alur pengerjaan tiket</h2>
                <p className="s">Diterima (tanggal issue) → dikerjakan (tanggal mulai) → selesai.</p>
                <div className="fn">
                  {[
                    ['Diterima', m.total, c.pri2],
                    ['Dikerjakan', cases.filter((r) => (periode ? monthKey(r.dateIssue) === periode : true) && parse8(r.startDate)).length, c.pri],
                    ['Selesai', m.done, c.ok],
                  ].map(([nama, v, warna], i, arr) => (
                    <div key={nama} style={{ width: `${Math.max(55, arr[0][1] ? (v / arr[0][1]) * 100 : 0)}%`, background: warna }}>
                      <span>{nama}</span>
                      <span>{v}{i ? <> <small>({m.total ? Math.round((v / m.total) * 100) : 0}%)</small></> : null}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="c s7">
                <h2>Kontribusi per PIC</h2>
                <p className="s">Cincin menunjukkan capaian terhadap target {targetPic} tiket per orang (turun dari rata-rata periode).</p>
                <div className="lb">
                  {m.pic.length ? m.pic.map(([nama, v]) => {
                    const pc = Math.min(v / targetPic, 1);
                    const col = v >= targetPic ? c.ok : v >= targetPic * 0.8 ? c.warn : c.bad;
                    return (
                      <div className="r" key={nama}>
                        <svg viewBox="0 0 48 48">
                          <circle cx="24" cy="24" r="19" fill="none" stroke={c.line} strokeWidth="5" />
                          <circle cx="24" cy="24" r="19" fill="none" stroke={col} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(pc * 119.4).toFixed(1)} 120`} transform="rotate(-90 24 24)" />
                          <text x="24" y="28.5" textAnchor="middle" fontSize="13" fontWeight="700" fill={c.ink}>{nama[0]}</text>
                        </svg>
                        <div><b>{nama}</b><span>{Math.round(pc * 100)}% dari target</span></div>
                        <em>{v}</em>
                      </div>
                    );
                  }) : <p className="s">Data PIC belum tersedia.</p>}
                </div>
              </div>
            </div>

            <div className="g">
              <div className="c s7">
                <h2>Temuan utama</h2>
                <p className="s">Alasan di balik angka {labelPeriode.toLowerCase()}.</p>
                <ul className="ins">{insights.map((t, i) => <li key={i}>{t}</li>)}</ul>
              </div>
              <div className="c s5">
                <h2>Tindak lanjut</h2>
                <p className="s">Saran otomatis berdasarkan angka di atas.</p>
                <table><thead><tr><th>Aksi</th><th>PIC</th><th>Tenggat</th></tr></thead><tbody>
                  {tindakLanjut.map((a) => <tr key={a[0]}><td><i className="pr" style={{ background: c[a[3]] || c.pri }} />{a[0]}</td><td>{a[1]}</td><td>{a[2]}</td></tr>)}
                </tbody></table>
              </div>
            </div>
            <footer>Sumber data: tabel kasus di database (Google Sheets → DB). Periode dipilih dari tanggal issue yang tersedia.</footer>
          </>
        )}
      </div>
    </div>
  );
}
