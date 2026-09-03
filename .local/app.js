/* ============================================================
   app.js — Shared shell untuk semua halaman Pusat Data Bantuan
   Dua mode:
   - STANDALONE: halaman dibuka langsung -> auth guard + inject
     menu "Hak Akses" ke sidebar.
   - EMBEDDED: halaman dimuat di dalam app.html -> sidebar
     internal disembunyikan, sub-nav internal (data-page)
     diubah menjadi tab bar horizontal, logout diteruskan
     ke shell utama.
   ============================================================ */
(function () {
  const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const embedded = (function () { try { return window.self !== window.top; } catch (e) { return true; } })();

  // ---------- Auth guard (hanya mode standalone) ----------
  if (!embedded && page !== 'login.html' && page !== 'app.html' && !localStorage.getItem('loggedIn')) {
    location.replace('login.html');
    return;
  }

  // ---------- Logout global ----------
  window.logout = function () {
    localStorage.removeItem('loggedIn');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userName');
    localStorage.removeItem('userRole');
    if (embedded) {
      try { window.parent.postMessage('app:logout', '*'); } catch (e) {}
      return;
    }
    location.href = 'login.html';
  };

  // ---------- Helper user ----------
  window.currentUser = function () {
    return {
      name: localStorage.getItem('userName') || 'Pengguna',
      email: localStorage.getItem('userEmail') || '-',
      role: localStorage.getItem('userRole') || 'Viewer'
    };
  };

  document.addEventListener('DOMContentLoaded', function () {
    if (page === 'login.html' || page === 'app.html') return;

    /* ================= MODE EMBEDDED (di dalam app.html) ================= */
    if (embedded) {
      // Sembunyikan sidebar internal & rapikan margin konten
      const st = document.createElement('style');
      st.textContent =
        'body>div>aside{display:none!important}' +
        'main.ml-64,.ml-64{margin-left:0!important}';
      document.head.appendChild(st);

      // Sub-nav internal (mis. index.html: ringkasan, percakapan, dst.)
      // diubah menjadi tab bar horizontal agar tetap bisa diakses.
      const items = Array.from(document.querySelectorAll('.nav-item[data-page]'));
      const main = document.querySelector('main');
      if (items.length && main) {
        const st2 = document.createElement('style');
        st2.textContent = 'main>header.sticky{top:53px!important}';
        document.head.appendChild(st2);
        const bar = document.createElement('div');
        bar.className = 'sticky top-0 z-30 h-[53px] bg-white/90 backdrop-blur border-b border-slate-200 px-6 flex items-center gap-1 overflow-x-auto scrollbar-thin text-sm font-semibold';

        const baseCls = 'px-3.5 py-2 rounded-lg whitespace-nowrap transition ';
        function cls(on) { return baseCls + (on ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-100'); }
        function syncTabs() {
          Array.from(bar.children).forEach(function (b) {
            b.className = cls(b._nav.classList.contains('active'));
          });
        }
        items.forEach(function (a) {
          const b = document.createElement('button');
          b.textContent = a.textContent.trim();
          b._nav = a;
          b.className = cls(a.classList.contains('active'));
          b.addEventListener('click', function () {
            a.click();
            setTimeout(syncTabs, 0);
          });
          bar.appendChild(b);
        });
        main.insertBefore(bar, main.firstChild);
      }
      return;
    }

    /* ================= MODE STANDALONE ================= */
    // Inject menu Hak Akses ke sidebar (sekali saja)
    const nav = document.querySelector('aside nav');
    if (nav && !nav.querySelector('a[href="roles.html"]')) {
      const wrap = document.createElement('div');
      wrap.innerHTML =
        '<p class="px-5 pt-5 pb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Administrasi</p>' +
        '<a href="roles.html" class="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50 transition">' +
        '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">' +
        '<path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/>' +
        '</svg>Hak Akses</a>';
      while (wrap.firstChild) nav.appendChild(wrap.firstChild);
    }

    // Bind tombol keluar generik
    document.querySelectorAll('button[title="Keluar"]').forEach(function (b) {
      b.addEventListener('click', window.logout);
    });
  });
})();
