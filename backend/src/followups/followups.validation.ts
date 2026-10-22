// Validasi murni kontrak Client Follow-Up — TANPA dependensi Nest/DB sehingga
// bisa diuji dengan node:test bawaan (pola contract.validation.ts).
export const PRIORITIES = ['Rendah', 'Sedang', 'Tinggi', 'Urgent'];
export const STATUSES = ['Open', 'Perlu Pengecekan', 'Menunggu Client', 'Selesai'];
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class ContractError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'ContractError';
    this.code = code;
    this.status = status;
  }
}

export function str(v: unknown, max = 200): string {
  return String(v ?? '').trim().slice(0, max);
}

// Tanggal hari ini di zona Asia/Jakarta, format YYYY-MM-DD (PRD: hitung
// overdue di server dengan zona waktu ini).
export function todayJakarta(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(now);
}

export interface ParsedFollowup {
  client: string;
  issueDate: string;
  module: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  followupDate: string;
  pic: string;
}

function checkDate(label: string, value: unknown, code: string): string {
  const d = str(value, 10);
  if (!d) throw new ContractError(code, `${label} wajib diisi.`);
  if (!DATE_RE.test(d)) throw new ContractError('DATE_INVALID', `Format ${label.toLowerCase()} harus yyyy-MM-dd.`);
  return d;
}

// Validasi payload penuh (POST) — mengembalikan pesan balasan yang dirapikan.
export function checkFollowupInput(b: any): ParsedFollowup {
  const client = str(b?.client, 150);
  if (!client) throw new ContractError('CLIENT_REQUIRED', 'Client wajib diisi.');
  const issueDate = checkDate('Tanggal issue', b?.issueDate, 'ISSUE_DATE_REQUIRED');
  const module = str(b?.module, 80);
  if (!module) throw new ContractError('MODULE_REQUIRED', 'Modul wajib diisi.');
  const title = str(b?.title, 255);
  if (!title) throw new ContractError('TITLE_REQUIRED', 'Issue wajib diisi.');
  const priority = str(b?.priority, 10) || 'Sedang';
  if (!PRIORITIES.includes(priority)) {
    throw new ContractError('PRIORITY_INVALID', `Prioritas harus salah satu dari: ${PRIORITIES.join(', ')}.`);
  }
  const status = str(b?.status, 20) || 'Open';
  if (!STATUSES.includes(status)) {
    throw new ContractError('STATUS_INVALID', `Status harus salah satu dari: ${STATUSES.join(', ')}.`);
  }
  const followupDate = checkDate('Tanggal follow-up', b?.followupDate, 'FOLLOWUP_DATE_REQUIRED');
  if (followupDate < issueDate) {
    throw new ContractError('FOLLOWUP_BEFORE_ISSUE', 'Tanggal follow-up tidak boleh lebih awal dari tanggal issue.');
  }
  return {
    client,
    issueDate,
    module,
    title,
    description: str(b?.description, 2000),
    priority,
    status,
    followupDate,
    pic: str(b?.pic, 100),
  };
}

// Validasi partial (PATCH): field yang dikirim saja, lalu aturan tanggal
// dan status tetap ditegakkan terhadap hasil gabungan (basis = baris lama).
export function checkFollowupPatch(b: any, cur: any): ParsedFollowup {
  return checkFollowupInput({
    client: b?.client ?? cur?.client_name,
    issueDate: b?.issueDate ?? cur?.issue_date,
    module: b?.module ?? cur?.module,
    title: b?.title ?? cur?.title,
    description: b?.description ?? cur?.description ?? '',
    priority: b?.priority ?? cur?.priority,
    status: b?.status ?? cur?.status,
    followupDate: b?.followupDate ?? cur?.followup_date,
    pic: b?.pic ?? cur?.pic ?? '',
  });
}

// Catatan user: wajib ada isinya.
export function checkNoteInput(b: any): string {
  const note = str(b?.note ?? b?.text, 1000);
  if (!note) throw new ContractError('NOTE_REQUIRED', 'Catatan tidak boleh kosong.');
  return note;
}
