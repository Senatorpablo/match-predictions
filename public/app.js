(() => {
  const $ = (s, r = document) => r.querySelectorAll(s);
  document.getElementById('theme')?.addEventListener('click', () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = t; localStorage.theme = t; });
  const fmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  $('time[data-ts]').forEach(t => { const d = new Date(t.dataset.ts); if (!isNaN(d)) { t.textContent = fmt.format(d); t.title = d.toString(); } });
  const tick = () => $('[data-kick]').forEach(el => { let s = (Date.parse(el.dataset.kick) - Date.now()) / 1000; if (s <= 0) { el.textContent = 'Kicked off — refresh to see lock'; return; }
    const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); el.textContent = `Locks in ${d ? d + 'd ' : ''}${h}h ${m}m`; });
  tick(); setInterval(tick, 30000);
  $('[data-kickoff-form]').forEach(f => { const i = f.querySelector('input[type=datetime-local]'); if (i.dataset.iso) { const d = new Date(i.dataset.iso); i.value = new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); }
    f.addEventListener('submit', () => { f.kickoff_iso.value = new Date(i.value).toISOString(); }); });
  $('form[data-confirm]').forEach(f => f.addEventListener('submit', e => { if (!confirm(f.dataset.confirm)) e.preventDefault(); }));
  $('[data-count]').forEach(el => { const n = +el.dataset.count, t0 = performance.now(); const step = t => { const p = Math.min(1, (t - t0) / 700); el.textContent = Math.round(n * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); });
  // One-tap market picks without a page reload (falls back to normal form post).
  const deskAdvisor = () => matchMedia('(min-width:1040px)').matches;
  document.addEventListener('click', e => {
    const tog = e.target.closest('.advisor-toggle');
    if (tog) {
      if (deskAdvisor()) return;
      const panel = tog.closest('.advisor');
      const open = panel.classList.toggle('open');
      tog.setAttribute('aria-expanded', open ? 'true' : 'false');
      return;
    }
    const b = e.target.closest('.mkt .opt'); if (!b || b.disabled || !window.fetch) return;
    e.preventDefault(); const form = b.closest('form'); b.classList.add('busy');
    fetch(form.action, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, credentials: 'same-origin',
      body: new URLSearchParams({ market: form.market.value, selection: b.value }) })
      .then(r => r.json()).then(j => { if (!j.ok) throw new Error(j.error); form.querySelectorAll('.opt').forEach(o => { const on = o.value === j.selection; o.classList.toggle('on', on); o.setAttribute('aria-pressed', on); });
        if (j.advisor) { const cur = document.querySelector('[data-advisor]'); if (cur) { const open = cur.classList.contains('open'); const box = document.createElement('div'); box.innerHTML = j.advisor; const next = box.firstElementChild; if (open) { next.classList.add('open'); next.querySelector('.advisor-toggle')?.setAttribute('aria-expanded', 'true'); } cur.replaceWith(next); } } })
      .catch(err => alert(err.message || 'Could not save your pick.')).finally(() => b.classList.remove('busy'));
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
})();
