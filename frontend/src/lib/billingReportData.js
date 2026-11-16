// Logika data Laporan Billing On-Call (murni, tanpa DOM — bisa di-unit-test).
// Semua teks di-trim; tiket diidentifikasi RECORD_UUID; client dipakai apa adanya.

const txt = (v) => String(v ?? '').trim();

// Normalisasi satu kasus menjadi baris laporan.
export function normalizeTicket(c) {
  return {
    uuid: txt(c.recordUuid),
    dateIssue: txt(c.dateIssue), // YYYYMMDD
    client: txt(c.client),
    issue: txt(c.issue),
    pic: txt(c.picName) || '–',
    module: txt(c.module),
    billingStatus: txt(c.billingStatus),
    billingCategory: txt(c.billingCategory),
    supportType: txt(c.supportType),
    charges: Math.round(Number(c.charges) || 0),
    statusValidasi: txt(c.statusValidasi),
    completionNotes: txt(c.completionNotes),
  };
}

// Filter tiket ON-CALL sesuai periode (from/to 'YYYY-MM-DD', kosong = tanpa batas) & brand.
// Terbaru di atas (urut dateIssue descending).
export function reportTickets(allCases, { from = '', to = '', brand = '' } = {}) {
  const f = from.replace(/-/g, '');
  const t = to.replace(/-/g, '');
  return allCases
    .filter(
      (c) =>
        txt(c.billingStatus) === 'ON-CALL' &&
        (!f || txt(c.dateIssue) >= f) &&
        (!t || txt(c.dateIssue) <= t) &&
        (!brand || txt(c.client) === brand)
    )
    .map(normalizeTicket)
    .sort((a, b) => b.dateIssue.localeCompare(a.dateIssue));
}

// Nilai seragam untuk info umum: satu nilai bila semua sama, 'Beragam' bila beda, '–' bila kosong.
export function uniformValue(rows, key) {
  const set = [...new Set(rows.map((r) => txt(r[key])).filter(Boolean))];
  if (set.length === 0) return '–';
  return set.length === 1 ? set[0] : 'Beragam';
}

export const sumCharges = (rows) => rows.reduce((a, r) => a + r.charges, 0);

// Pivot 1: Client × Support Type. Urutan client & type = kemunculan pertama di data.
export function buildPivotClientSupport(rows) {
  const clients = [];
  const types = [];
  const map = new Map(); // client -> { tickets, byType: Map, total }
  rows.forEach((r) => {
    if (!map.has(r.client)) {
      map.set(r.client, { client: r.client, tickets: 0, byType: new Map(), total: 0 });
      clients.push(r.client);
    }
    const row = map.get(r.client);
    row.tickets += 1;
    row.total += r.charges;
    const t = r.supportType || '–';
    if (!types.includes(t)) types.push(t);
    row.byType.set(t, (row.byType.get(t) || 0) + r.charges);
  });
  const body = clients.map((c) => map.get(c));
  const grand = {
    tickets: body.reduce((a, r) => a + r.tickets, 0),
    total: body.reduce((a, r) => a + r.total, 0),
    byType: new Map(types.map((t) => [t, body.reduce((a, r) => a + (r.byType.get(t) || 0), 0)])),
  };
  return { types, body, grand };
}

// Pivot 2: Billing Category, urut total terbesar.
export function buildPivotCategory(rows) {
  const map = new Map();
  rows.forEach((r) => {
    const k = r.billingCategory || '–';
    if (!map.has(k)) map.set(k, { category: k, tickets: 0, total: 0 });
    const row = map.get(k);
    row.tickets += 1;
    row.total += r.charges;
  });
  const body = [...map.values()].sort((a, b) => b.total - a.total);
  const grand = {
    tickets: body.reduce((a, r) => a + r.tickets, 0),
    total: body.reduce((a, r) => a + r.total, 0),
  };
  return { body, grand };
}
