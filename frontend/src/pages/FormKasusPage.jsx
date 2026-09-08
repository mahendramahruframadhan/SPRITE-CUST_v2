import { useEffect, useMemo, useState } from 'react';
import { masters as fallbackMasters, priceListData as fallbackPrices } from '../data/masters.js';
import { createCase, getMasters } from '../lib/api.js';
import { recordActivity } from '../lib/activity.js';

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const INITIAL = {
  no: 'AUTO',
  dateIssue: '',
  startDate: '',
  finishDate: '',
  client: '',
  picName: '',
  assignTo: '',
  module: '',
  subModule: '',
  location: '',
  issue: '',
  status: '',
  supportCategory: '',
  billingStatus: '',
  billingCategory: '',
  refPriceList: '',
  channelTicket: '',
  supportType: '',
  charges: '',
  completionNotes: '',
  groupKpi: '',
  groupKpiDesc: '',
  monthName: '',
  weeknum: '',
  recordUuid: uuid(),
};

const INPUT_CLS =
  'mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white';

function Field({ label, required, children }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-500">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function Select({ value, onChange, items, placeholder = '-- Pilih --' }) {
  return (
    <select value={value} onChange={onChange} className={INPUT_CLS}>
      <option value="">{placeholder}</option>
      {items.map((it) => (
        <option key={it.name ?? it} value={it.name ?? it}>{it.name ?? it}</option>
      ))}
    </select>
  );
}

export default function FormKasusPage() {
  const [form, setForm] = useState(INITIAL);
  // Master dari backend (GET /api/masters); file lokal sebagai fallback offline
  const [masters, setMasters] = useState(fallbackMasters);
  const [priceListData, setPriceListData] = useState(fallbackPrices);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let ignore = false;
    getMasters()
      .then((r) => {
        if (ignore) return;
        if (r && r.masters) setMasters(r.masters);
        if (r && r.priceListData) setPriceListData(r.priceListData);
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, []);

  const subModules = useMemo(() => {
    const mod = form.module;
    return (masters.submodule || []).filter((s) => s.parent === mod || !mod);
  }, [form.module]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const preview = useMemo(
    () => ({
      ...form,
      dateIssue: form.dateIssue.replace(/-/g, ''),
      startDate: form.startDate.replace(/-/g, ''),
      finishDate: form.finishDate.replace(/-/g, ''),
    }),
    [form]
  );

  function autoFillCharges() {
    if (!form.billingCategory) {
      alert('Pilih Billing Category terlebih dahulu');
      return;
    }
    const item = priceListData.find((p) => p.category === form.billingCategory && p.active);
    if (!item) {
      alert('Kategori tidak ditemukan di price list');
      return;
    }
    const price = form.refPriceList.includes('1') ? item.pl1 : item.pl2;
    setForm({ ...form, charges: String(price || 0) });
  }

  function resetForm() {
    setForm({ ...INITIAL, recordUuid: uuid() });
  }

  async function saveForm() {
    for (const k of ['dateIssue', 'client', 'issue']) {
      if (!form[k]) {
        alert('Field wajib belum diisi');
        return;
      }
    }
    setSaving(true);
    try {
      // POST /api/cases — backend menulis ke DB (+ Sheets bila SHEETS_MOCK=false)
      await createCase({ ...form, month: form.monthName });
      recordActivity(`menambah kasus baru (${form.client})`, String(form.issue || '').slice(0, 80));
      alert('Kasus tersimpan di backend.');
      resetForm();
    } catch (e) {
      alert('Gagal menyimpan: ' + (e.message || e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-8 py-6">
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-2 -mt-1 mb-5">
        <button
          onClick={resetForm}
          className="text-sm font-semibold text-slate-500 px-4 py-2 rounded-lg hover:bg-slate-100 transition"
        >
          Reset
        </button>
        <button
          onClick={saveForm}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2 rounded-lg shadow-md shadow-brand-600/25 transition disabled:opacity-60"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Simpan ke Backend
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
        {/* Baris atas: nomor & tanggal */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Field label="No">
            <input type="text" readOnly value={form.no} className={`${INPUT_CLS} bg-slate-50 text-slate-500`} />
          </Field>
          <Field label="Date Issue" required>
            <input type="date" value={form.dateIssue} onChange={set('dateIssue')} required className={INPUT_CLS} />
          </Field>
          <Field label="Start Date">
            <input type="date" value={form.startDate} onChange={set('startDate')} className={INPUT_CLS} />
          </Field>
          <Field label="Finish Date">
            <input type="date" value={form.finishDate} onChange={set('finishDate')} className={INPUT_CLS} />
          </Field>
        </div>

        {/* Client & PIC */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Brand / Client" required>
            <input list="brandList" value={form.client} onChange={set('client')} required placeholder="Pilih atau ketik brand" className={INPUT_CLS} />
            <datalist id="brandList">
              {(masters.brand || []).map((b) => <option key={b.id} value={b.name} />)}
            </datalist>
          </Field>
          <Field label="PIC Name">
            <input list="picList" value={form.picName} onChange={set('picName')} placeholder="PIC lapangan" className={INPUT_CLS} />
            <datalist id="picList">
              {(masters.pic || []).map((p) => <option key={p.id} value={p.name} />)}
            </datalist>
          </Field>
          <Field label="Assign To">
            <Select value={form.assignTo} onChange={set('assignTo')} items={masters.assignTo || []} />
          </Field>
        </div>

        {/* Module & Sub Module */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Module">
            <Select
              value={form.module}
              onChange={(e) => setForm({ ...form, module: e.target.value, subModule: '' })}
              items={masters.module || []}
            />
          </Field>
          <Field label="Sub-Module">
            <Select value={form.subModule} onChange={set('subModule')} items={subModules} />
          </Field>
          <Field label="Location">
            <input type="text" value={form.location} onChange={set('location')} placeholder="cth. SHOP PALU" className={INPUT_CLS} />
          </Field>
        </div>

        {/* Issue */}
        <Field label="Issue / Masalah" required>
          <textarea rows="3" value={form.issue} onChange={set('issue')} required placeholder="Jelaskan masalah yang dilaporkan..." className={INPUT_CLS} />
        </Field>

        {/* Kategori & Billing */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Field label="Status">
            <Select value={form.status} onChange={set('status')} items={masters.status || []} />
          </Field>
          <Field label="Support Category">
            <Select value={form.supportCategory} onChange={set('supportCategory')} items={masters.supportCategory || []} />
          </Field>
          <Field label="Billing Status">
            <Select value={form.billingStatus} onChange={set('billingStatus')} items={masters.billingStatus || []} />
          </Field>
          <Field label="Billing Category">
            <Select value={form.billingCategory} onChange={set('billingCategory')} items={masters.billingCategory || []} />
          </Field>
        </div>

        {/* Price List & Charges */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
          <Field label="Ref Price List">
            <Select
              value={form.refPriceList}
              onChange={set('refPriceList')}
              items={[{ name: 'PRICELIST - 1' }, { name: 'PRICELIST - 2' }]}
            />
          </Field>
          <Field label="Channel Ticket">
            <Select value={form.channelTicket} onChange={set('channelTicket')} items={masters.channel || []} />
          </Field>
          <Field label="Support Type">
            <Select value={form.supportType} onChange={set('supportType')} items={masters.supportType || []} />
          </Field>
          <Field label="Charges (Rp)">
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rp</span>
              <input
                type="number"
                min="0"
                value={form.charges}
                onChange={set('charges')}
                placeholder="0"
                className="pl-8 pr-3 py-2.5 w-full text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40 bg-white"
              />
            </div>
            <p className="text-[10px] text-brand-600 mt-1 cursor-pointer hover:underline" onClick={autoFillCharges}>
              Isi otomatis dari price list
            </p>
          </Field>
        </div>

        {/* Group KPI & Notes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Group KPI">
            <Select value={form.groupKpi} onChange={set('groupKpi')} items={masters.groupKpi || []} />
          </Field>
          <Field label="Group KPI Description">
            <Select value={form.groupKpiDesc} onChange={set('groupKpiDesc')} items={masters.groupKpiDesc || []} />
          </Field>
          <Field label="Completion Notes">
            <input type="text" value={form.completionNotes} onChange={set('completionNotes')} placeholder="cth. SAME DAY SERVICE" className={INPUT_CLS} />
          </Field>
        </div>

        {/* Meta */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Bulan">
            <Select value={form.monthName} onChange={set('monthName')} items={masters.monthName || []} />
          </Field>
          <Field label="Weeknum">
            <input type="number" min="1" max="53" value={form.weeknum} onChange={set('weeknum')} className={INPUT_CLS} />
          </Field>
          <Field label="RECORD_UUID">
            <input type="text" readOnly value={form.recordUuid} className={`${INPUT_CLS} bg-slate-50 text-slate-500 font-mono text-xs`} />
          </Field>
        </div>

        {/* Preview JSON */}
        <Field label="Preview Data (JSON)">
          <textarea
            rows="4"
            readOnly
            value={JSON.stringify(preview, null, 2)}
            className="mt-1 w-full text-xs font-mono bg-slate-900 text-emerald-400 border border-slate-200 rounded-lg px-3 py-2.5"
          />
        </Field>
      </div>
    </div>
  );
}
