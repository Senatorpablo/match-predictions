(() => {
  const $ = (s, r = document) => r.querySelectorAll(s);
  document.getElementById('theme')?.addEventListener('click', () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = t; localStorage.theme = t; });
  const fmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  $('time[data-ts]').forEach(t => { const d = new Date(t.dataset.ts); if (!isNaN(d)) { t.textContent = fmt.format(d); t.title = d.toString(); } });
  const tick = () => $('[data-kick]').forEach(el => { let s = (Date.parse(el.dataset.kick) - Date.now()) / 1000; if (s <= 0) { el.textContent = 'Kicked off — refresh to see lock'; return; }
    const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); el.textContent = `Locks in ${d ? d + 'd ' : ''}${h}h ${m}m`; });
  tick(); setInterval(tick, 30000);
  $('.chip[data-q]').forEach(c => c.addEventListener('click', () => { const [h, a] = c.dataset.q.split('-'); const f = c.closest('.fixture').querySelector('form.predict'); f.home.value = h; f.away.value = a; f.home.focus(); }));
  $('[data-kickoff-form]').forEach(f => { const i = f.querySelector('input[type=datetime-local]'); if (i.dataset.iso) { const d = new Date(i.dataset.iso); i.value = new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); }
    f.addEventListener('submit', () => { f.kickoff_iso.value = new Date(i.value).toISOString(); }); });
  $('form[data-confirm]').forEach(f => f.addEventListener('submit', e => { if (!confirm(f.dataset.confirm)) e.preventDefault(); }));
  $('[data-count]').forEach(el => { const n = +el.dataset.count, t0 = performance.now(); const step = t => { const p = Math.min(1, (t - t0) / 700); el.textContent = Math.round(n * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
})();
