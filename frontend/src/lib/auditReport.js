// Laporan audit bulanan POPI NAVA: memperluas jadwal mingguan menjadi daftar
// toko per brand, menandai "sudah audit" bila dicentang manual ATAU foto
// LOCAL+WEB lengkap, lalu meringkas total/sudah/belum. Juga menghasilkan file
// .html mandiri (print-friendly) dengan semua teks data di-escape.
import { WEEK_LABELS } from './auditSchedule.js';

export function buildAuditReport(outlets, weeks, shotsComplete = {}) {
  const master = Array.isArray(outlets) ? outlets : [];
  const byUuid = new Map(master.map((o) => [o.uuid, o]));
  const byBrand = new Map();
  for (const o of master) {
    const b = o.brandName || '-';
    if (!byBrand.has(b)) byBrand.set(b, []);
    byBrand.get(b).push(o);
  }

  const seen = new Set();
  const outWeeks = [];
  let total = 0;
  let audited = 0;

  for (const weekKey of WEEK_LABELS) {
    const items = Array.isArray(weeks?.[weekKey]) ? weeks[weekKey] : [];
    const groups = new Map();
    const push = (brand, row) => {
      if (!groups.has(brand)) groups.set(brand, []);
      groups.get(brand).push(row);
      total += 1;
      if (row.audited) audited += 1;
    };

    for (const item of items) {
      if (!item) continue;
      if (item.type === 'brand') {
        const brand = item.brand || '-';
        const list = byBrand.get(brand) || [];
        if (list.length === 0) {
          const key = `brand:${brand}`;
          if (seen.has(key)) continue;
          seen.add(key);
          push(brand, {
            key, uuid: null, name: brand, brand, city: '-', custcode: '-',
            audited: !!item.audited, via: item.audited ? 'brand' : null,
          });
          continue;
        }
        for (const o of list) {
          if (seen.has(o.uuid)) continue;
          seen.add(o.uuid);
          const photo = !!shotsComplete[o.uuid];
          push(brand, {
            key: o.uuid, uuid: o.uuid, name: o.deptChannelName || '-', brand,
            city: o.city || '-', custcode: o.rvtCustcode || '-',
            audited: !!item.audited || photo,
            via: item.audited ? 'brand' : photo ? 'photo' : null,
          });
        }
        continue;
      }

      const key = item.uuid || item.id;
      if (seen.has(key)) continue;
      seen.add(key);
      const o = byUuid.get(item.uuid);
      const brand = o?.brandName || item.brand || '-';
      const photo = !!shotsComplete[item.uuid];
      push(brand, {
        key, uuid: item.uuid || null,
        name: o?.deptChannelName || item.name || '-', brand,
        city: o?.city || '-', custcode: o?.rvtCustcode || '-',
        audited: !!item.audited || photo,
        via: item.audited ? 'manual' : photo ? 'photo' : null,
      });
    }

    if (!groups.size) continue;
    outWeeks.push({
      key: weekKey,
      groups: [...groups.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], 'id'))
        .map(([brand, rows]) => ({
          brand,
          rows: rows.sort((a, b) => a.name.localeCompare(b.name, 'id')),
        })),
    });
  }

  const pending = total - audited;
  return {
    total,
    audited,
    pending,
    percent: total ? Math.round((audited / total) * 100) : 0,
    weeks: outWeeks,
  };
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

export function buildAuditReportHtml({ monthLabel, generatedAt, report, weekRanges = {} }) {
  const weeksHtml = report.weeks
    .map((w) => {
      const groupsHtml = w.groups
        .map(
          (g) => `
          <tr class="group"><td colspan="4">${esc(g.brand)} <span class="count">${g.rows.length} toko</span></td></tr>
          ${g.rows
            .map(
              (r) => `
          <tr>
            <td class="name">${esc(r.name)}</td>
            <td>${esc(r.custcode)}</td>
            <td>${esc(r.city)}</td>
            <td><span class="badge ${r.audited ? 'ok' : 'no'}">${r.audited ? 'Sudah audit' : 'Belum audit'}</span></td>
          </tr>`,
            )
            .join('')}`,
        )
        .join('');
      return `
      <section class="week">
        <h2>${esc(w.key)} <span class="range">${esc(weekRanges[w.key] || '')}</span></h2>
        <table>
          <thead><tr><th>Toko</th><th>Custcode</th><th>Kota</th><th>Status</th></tr></thead>
          <tbody>${groupsHtml}</tbody>
        </table>
      </section>`;
    })
    .join('');

  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Laporan Audit POPI NAVA — ${esc(monthLabel)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1e293b; background: #f8fafc; }
  .sheet { max-width: 900px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px; }
  header h1 { margin: 0 0 4px; font-size: 22px; }
  header p { margin: 0; color: #64748b; font-size: 13px; }
  .summary { display: flex; flex-wrap: wrap; gap: 12px; margin: 24px 0; }
  .card { flex: 1 1 130px; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 16px; }
  .card .label { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; }
  .card .value { font-size: 22px; font-weight: 700; margin-top: 4px; }
  .card.ok .value { color: #047857; }
  .card.no .value { color: #be123c; }
  .week { margin-top: 28px; page-break-inside: avoid; }
  .week h2 { font-size: 15px; margin: 0 0 8px; }
  .week h2 .range { font-weight: 400; color: #64748b; font-size: 12px; margin-left: 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
  th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #475569; }
  tr.group td { background: #eef2ff; font-weight: 700; color: #3730a3; }
  tr.group .count { font-weight: 400; color: #6366f1; font-size: 11px; margin-left: 6px; }
  td.name { font-weight: 600; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; }
  .badge.ok { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
  .badge.no { background: #fff1f2; color: #be123c; border: 1px solid #fecdd3; }
  footer { margin-top: 28px; font-size: 11px; color: #94a3b8; }
  @media print {
    body { padding: 0; background: #fff; }
    .sheet { border: 0; border-radius: 0; max-width: none; padding: 0; }
  }
</style>
</head>
<body>
<div class="sheet">
  <header>
    <h1>Laporan Audit POPI NAVA</h1>
    <p>Periode ${esc(monthLabel)} · dibuat ${esc(generatedAt)}</p>
  </header>
  <div class="summary">
    <div class="card"><div class="label">Total toko</div><div class="value">${report.total}</div></div>
    <div class="card ok"><div class="label">Sudah audit</div><div class="value">${report.audited}</div></div>
    <div class="card no"><div class="label">Belum audit</div><div class="value">${report.pending}</div></div>
    <div class="card"><div class="label">Progres</div><div class="value">${report.percent}%</div></div>
  </div>
  ${weeksHtml || '<p>Tidak ada toko yang dijadwalkan bulan ini.</p>'}
  <footer>Status "Sudah audit" = dicentang manual atau foto LOCAL &amp; WEB lengkap.</footer>
</div>
</body>
</html>`;
}
