import { useEffect, useRef, useState } from 'react';
import { useCases } from '../hooks/useCases.js';
import { chatAi, getAiConnections } from '../lib/api.js';
import { fmtMoney } from '../utils/format.js';

// Asisten AI lokal — menjawab dari data kasus backend (tanpa API AI eksternal).
// Nanti bisa diganti: kirim q + konteks ke endpoint AI bila agent di /cfg aktif.
const SUGGESTIONS = ['Berapa total kasus?', 'Kasus OPEN ada berapa?', 'Top 5 client', 'Total tagihan'];

function answer(q, cases) {
  const t = q.toLowerCase().trim();
  const num = (n) => n.toLocaleString('id-ID');
  if (!cases.length) return 'Data kasus belum termuat — pastikan backend jalan, lalu coba lagi.';
  if (/^(halo|hai|hallo|pagi|siang|sore|malam|assalamualaikum)/.test(t)) {
    return `Halo! Saya asisten data bantuan (${num(cases.length)} kasus termuat). Tanya mis. "kasus OPEN ada berapa?" atau "cari MAYOUTFIT".`;
  }
  if (/bisa apa|bantuan|help|fitur|contoh/.test(t)) {
    return 'Saya bisa:\n• Hitung kasus (total / per status / per billing)\n• Top client & total tagihan\n• Cari kasus by keyword — ketik "cari ..."';
  }
  const search = t.match(/^(cari|search|temukan)\s+(.+)/);
  if (search) {
    const kw = search[2].trim();
    const hit = cases.filter((c) =>
      `${c.no} ${c.client} ${c.issue} ${c.picName} ${c.location}`.toLowerCase().includes(kw)
    );
    if (!hit.length) return `Tidak ketemu kasus mengandung "${kw}".`;
    const lines = hit.slice(0, 5).map((c) => `• ${c.no} — ${c.client}: ${c.issue} [${c.status}]`);
    return `Ketemu ${num(hit.length)} untuk "${kw}":\n${lines.join('\n')}${hit.length > 5 ? `\n…dan ${num(hit.length - 5)} lainnya` : ''}`;
  }
  if (/top.*(client|brand|klien)|(client|brand|klien).*terbanyak/.test(t)) {
    const m = {};
    cases.forEach((c) => {
      const k = (c.client || '—').trim();
      m[k] = (m[k] || 0) + 1;
    });
    const top = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return `Top 5 client:\n${top.map(([k, v], i) => `${i + 1}. ${k} — ${num(v)} kasus`).join('\n')}`;
  }
  if (/tagihan|charges|rupiah|nilai/.test(t)) {
    const sum = cases.reduce((s, c) => s + (+c.charges || 0), 0);
    const paid = cases.filter((c) => +c.charges > 0).length;
    return `Total tagihan ${fmtMoney(sum)} dari ${num(paid)} kasus berbayar.`;
  }
  const byStatus = (s) => cases.filter((c) => (c.status || '').toUpperCase() === s).length;
  if (/open/.test(t)) return `Kasus OPEN: ${num(byStatus('OPEN'))} dari ${num(cases.length)} total.`;
  if (/done|selesai/.test(t)) return `Kasus DONE: ${num(byStatus('DONE'))} dari ${num(cases.length)} total.`;
  if (/on.?call/.test(t)) return `Billing ON-CALL: ${num(cases.filter((c) => c.billingStatus === 'ON-CALL').length)} kasus.`;
  if (/monthly/.test(t)) return `Billing MONTHLY: ${num(cases.filter((c) => c.billingStatus === 'MONTHLY').length)} kasus.`;
  if (/free/.test(t)) return `Billing FREE: ${num(cases.filter((c) => c.billingStatus === 'FREE').length)} kasus.`;
  if (/total|berapa|jumlah|semua/.test(t)) {
    return `Total ${num(cases.length)} kasus — OPEN: ${num(byStatus('OPEN'))}, DONE: ${num(byStatus('DONE'))}.`;
  }
  return 'Kurang paham — coba "bantuan" untuk daftar yang saya bisa, atau ketik "cari ..." + keyword.';
}

export default function AiChat() {
  const { cases } = useCases();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [msgs, setMsgs] = useState([
    { from: 'bot', text: 'Halo! Ada yang bisa saya bantu soal data kasus?' },
  ]);
  // Switcher model sekali klik — daftar dari backend, pilihan tersimpan lokal
  const [conns, setConns] = useState([]);
  const [connId, setConnId] = useState(() => {
    try {
      return localStorage.getItem('aiConnId') || '';
    } catch {
      return '';
    }
  });
  const bodyRef = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    let ignore = false;
    getAiConnections()
      .then((r) => {
        if (!ignore && Array.isArray(r) && r.length) setConns(r);
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, []);

  // Esc menutup panel (skill a11y: keyboard operable)
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [msgs, typing, open]);

  useEffect(() => () => clearTimeout(timer.current), []);

  function pushBot(text, local) {
    clearTimeout(timer.current);
    // Jeda kecil agar fallback lokal tetap terasa natural
    timer.current = setTimeout(() => {
      setMsgs((m) => [...m, { from: 'bot', text, local }]);
      setTyping(false);
    }, local ? 350 : 0);
  }

  function pickConn(id) {
    setConnId(id);
    try {
      if (id) localStorage.setItem('aiConnId', id);
      else localStorage.removeItem('aiConnId');
    } catch {}
    const hit = conns.find((c) => c.id === id);
    setMsgs((m) => [...m, {
      from: 'bot',
      text: hit ? `Siap — sekarang saya memakai ${hit.name} (${hit.model}).` : 'Kembali ke AI default yang aktif.',
    }]);
  }

  function send(text) {
    const q = (text ?? input).trim();
    if (!q || typing) return;
    const next = [...msgs, { from: 'user', text: q }];
    setMsgs(next);
    setInput('');
    setTyping(true);
    // Coba AI eksternal dulu (riwayat 7 pesan terakhir); gagal/belum setting → otak lokal
    const hist = next.slice(-7).map((m) => ({
      role: m.from === 'user' ? 'user' : 'assistant',
      content: m.text,
    }));
    chatAi(hist, connId || undefined).then(
      (r) => {
        if (r && r.ok && r.reply) pushBot(r.reply, false);
        else pushBot(answer(q, cases), true);
      },
      () => pushBot(answer(q, cases), true)
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="w-[min(92vw,380px)] h-[min(70vh,520px)] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-fade-in-fast">
          <div className="bg-gradient-to-r from-brand-700 to-brand-600 text-white px-4 py-3 flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center shrink-0" aria-hidden>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.83 8.83a3.75 3.75 0 015.3 0l1.44 1.44a3.75 3.75 0 010 5.3l-1.44 1.44a3.75 3.75 0 01-5.3 0L8.4 15.57a3.75 3.75 0 010-5.3l1.43-1.44zM15.37 8.83a3.75 3.75 0 015.3 0l1.44 1.44a3.75 3.75 0 010 5.3l-1.7 1.7" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v3m0 12v3M3 12h3m12 0h3" />
              </svg>
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold leading-tight">Asisten AI</p>
              {conns.length > 0 ? (
                <select
                  value={connId}
                  onChange={(e) => pickConn(e.target.value)}
                  aria-label="Pilih model AI"
                  title="Ganti model AI sekali klik"
                  className="mt-0.5 max-w-full text-[11px] font-semibold bg-white/15 hover:bg-white/25 rounded-md pl-1.5 pr-6 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-white/70 cursor-pointer [&>option]:text-slate-800"
                >
                  <option value="">✦ Otomatis (aktif)</option>
                  {conns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.active ? '● ' : ''}{c.name} — {c.model}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-[11px] text-brand-100">Jawab dari data kasus backend</p>
              )}
            </div>
            <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-white/15 text-white/90" aria-label="Tutup chat">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div ref={bodyRef} className="flex-1 overflow-y-auto px-3.5 py-3 space-y-2.5 bg-slate-50">
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                <p className={`max-w-[85%] text-[13px] leading-relaxed px-3 py-2 rounded-2xl whitespace-pre-line ${
                  m.from === 'user' ? 'bg-brand-600 text-white rounded-br-md' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-md'
                }`}>
                  {m.text}
                  {m.local && <span className="block mt-1 text-[10px] text-slate-400">· mode lokal (AI eksternal belum aktif)</span>}
                </p>
              </div>
            ))}
            {typing && (
              <div className="flex justify-start">
                <p className="bg-white border border-slate-200 text-slate-400 text-[13px] px-3 py-2 rounded-2xl rounded-bl-md motion-safe:animate-pulse">mengetik…</p>
              </div>
            )}
          </div>

          <div className="px-3 pt-2 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => send(s)} className="text-[11px] font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-100 rounded-full px-2.5 py-1 transition">
                {s}
              </button>
            ))}
          </div>
          <form
            className="p-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tanya soal data kasus…"
              aria-label="Tulis pesan untuk asisten AI"
              className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus-visible:ring-brand-500 bg-white"
            />
            <button className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl px-4 font-bold transition" aria-label="Kirim">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.27 3.13a59.9 59.9 0 0118.45 8.87 59.9 59.9 0 01-18.45 8.87L6 12zm0 0h7.5" />
              </svg>
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Tutup asisten AI' : 'Buka asisten AI'}
        aria-expanded={open}
        className="w-14 h-14 rounded-full bg-gradient-to-br from-brand-600 to-brand-700 hover:from-brand-700 hover:to-brand-800 text-white shadow-xl shadow-brand-600/30 flex items-center justify-center transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
      >
        {open ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.63 8.63a3.75 3.75 0 015.3 0l1.44 1.44a3.75 3.75 0 010 5.3l-1.44 1.44a3.75 3.75 0 01-5.3 0L7.2 15.37a3.75 3.75 0 010-5.3l1.43-1.44zM15.37 8.63a3.75 3.75 0 015.3 0l1.44 1.44a3.75 3.75 0 010 5.3l-1.7 1.7" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v3m0 12v3M3 12h3m12 0h3" />
          </svg>
        )}
      </button>
    </div>
  );
}
