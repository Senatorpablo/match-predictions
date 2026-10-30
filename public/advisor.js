/* Deterministic pick advisor. No network, no API keys. Same inputs always give the same ratings.
   Last-5 form is oldest → newest (WWDLW means the latest game was a win). Blank form or strength uses a neutral default. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.Advisor = factory(); })(this, function () {
  const LINES = { OU05: 0.5, OU15: 1.5, OU25: 2.5, OU35: 3.5 };
  const NAMES = { '1X2': 'Match Result', DC: 'Double Chance', OU05: 'Over/Under 0.5', OU15: 'Over/Under 1.5', OU25: 'Over/Under 2.5', OU35: 'Over/Under 3.5', BTTS: 'Both Teams To Score', DNB: 'Draw No Bet', HT1X2: '1st Half Result' };
  const SEL = { '1': 'Home', '2': 'Away', X: 'Draw', '1X': 'Home or Draw', '12': 'Home or Away', X2: 'Draw or Away', Y: 'Yes (GG)', N: 'No (NG)' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const round1 = n => (Math.round(n * 10) / 10).toFixed(1);

  function cleanForm(v) {
    const s = String(v == null ? '' : v).toUpperCase().replace(/[^WDL]/g, '').slice(0, 5);
    return s || null;
  }
  function cleanStrength(v) {
    if (v == null) return null;
    const s = String(v).trim();
    if (!s) return null;
    if (!/^\d{1,2}$/.test(s)) return false;
    const n = Number(s);
    return n >= 1 && n <= 10 ? n : false;
  }
  function formScore(raw) {
    const f = cleanForm(raw) || 'WDLWD';
    let got = 0, weight = 0;
    for (let i = 0; i < f.length; i++) {
      const w = i + 1;
      got += (f[i] === 'W' ? 1 : f[i] === 'D' ? 0.5 : 0) * w;
      weight += w;
    }
    return { score: got / weight, form: cleanForm(raw), usedDefault: !cleanForm(raw) };
  }
  function pois(k, lambda) {
    let p = Math.exp(-lambda);
    for (let i = 1; i <= k; i++) p *= lambda / i;
    return p;
  }
  function matrix(lh, la) {
    const N = 8, ph = [], pa = [];
    let sh = 0, sa = 0;
    for (let i = 0; i <= N; i++) { ph[i] = pois(i, lh); pa[i] = pois(i, la); sh += ph[i]; sa += pa[i]; }
    let home = 0, draw = 0, away = 0, btts = 0;
    const over = { 0.5: 0, 1.5: 0, 2.5: 0, 3.5: 0 };
    for (let h = 0; h <= N; h++) for (let a = 0; a <= N; a++) {
      const p = (ph[h] / sh) * (pa[a] / sa);
      if (h > a) home += p; else if (h < a) away += p; else draw += p;
      if (h > 0 && a > 0) btts += p;
      const t = h + a;
      if (t > 0.5) over[0.5] += p;
      if (t > 1.5) over[1.5] += p;
      if (t > 2.5) over[2.5] += p;
      if (t > 3.5) over[3.5] += p;
    }
    return { home, draw, away, btts, over };
  }
  function ratingOf(p) { return p >= 0.55 ? 'Strong' : p >= 0.40 ? 'Fair' : 'Risky'; }

  function assess(fixture) {
    const f = fixture || {};
    const homeF = formScore(f.home_form), awayF = formScore(f.away_form);
    const hsRaw = cleanStrength(f.home_strength), asRaw = cleanStrength(f.away_strength);
    const hs = hsRaw === false || hsRaw == null ? 5 : hsRaw;
    const as = asRaw === false || asRaw == null ? 5 : asRaw;
    const edge = (hs - as) / 10;
    const hx = clamp(1.32 + edge * 0.95 + (homeF.score - 0.5) * 0.85, 0.3, 3.5);
    const ax = clamp(1.02 - edge * 0.95 + (awayF.score - 0.5) * 0.85, 0.25, 3.3);
    const ft = matrix(hx, ax);
    const ht = matrix(hx * 0.45, ax * 0.45);
    const probs = {
      '1X2': { '1': ft.home, X: ft.draw, '2': ft.away },
      DC: { '1X': ft.home + ft.draw, '12': ft.home + ft.away, X2: ft.draw + ft.away },
      OU05: { O: ft.over[0.5], U: 1 - ft.over[0.5] },
      OU15: { O: ft.over[1.5], U: 1 - ft.over[1.5] },
      OU25: { O: ft.over[2.5], U: 1 - ft.over[2.5] },
      OU35: { O: ft.over[3.5], U: 1 - ft.over[3.5] },
      BTTS: { Y: ft.btts, N: 1 - ft.btts },
      DNB: { '1': ft.home, '2': ft.away },
      HT1X2: { '1': ht.home, X: ht.draw, '2': ht.away }
    };
    return {
      probs, homeXG: hx, awayXG: ax,
      home: f.home_team || 'Home', away: f.away_team || 'Away',
      homeForm: homeF.form, awayForm: awayF.form,
      homeDefaultForm: homeF.usedDefault, awayDefaultForm: awayF.usedDefault,
      homeStrength: hs, awayStrength: as,
      homeDefaultStr: hsRaw == null || hsRaw === false, awayDefaultStr: asRaw == null || asRaw === false
    };
  }

  function sideWords(info, which) {
    const defF = which === 'home' ? info.homeDefaultForm : info.awayDefaultForm;
    const defS = which === 'home' ? info.homeDefaultStr : info.awayDefaultStr;
    const form = which === 'home' ? info.homeForm : info.awayForm;
    const str = which === 'home' ? info.homeStrength : info.awayStrength;
    const bits = [];
    bits.push(defF ? 'a neutral recent run' : `form ${form}`);
    bits.push(defS ? 'average strength' : `strength ${str}/10`);
    return bits.join(' and ');
  }

  function explain(market, sel, info, p) {
    const pct = Math.round(p * 100);
    const home = info.home, away = info.away;
    const goals = round1(info.homeXG + info.awayXG);
    if (market === '1X2' && sel === '1') return `${home} to win is about ${pct}%. They have ${sideWords(info, 'home')}, against ${away} with ${sideWords(info, 'away')}.`;
    if (market === '1X2' && sel === '2') return `${away} to win is about ${pct}%. They have ${sideWords(info, 'away')}, and ${home} have ${sideWords(info, 'home')} plus home advantage.`;
    if (market === '1X2' && sel === 'X') return `A draw is about ${pct}%. The projection is ${round1(info.homeXG)} to ${round1(info.awayXG)} from form and strength.`;
    if (market === 'DC') return `${SEL[sel] || sel} covers two results and comes out around ${pct}% on this form.`;
    if (LINES[market]) {
      const word = sel === 'O' ? 'Over' : 'Under';
      return `About ${goals} goals are projected. ${word} ${LINES[market]} is about ${pct}%.`;
    }
    if (market === 'BTTS' && sel === 'Y') return `Both teams scoring is about ${pct}%. The projection is ${round1(info.homeXG)} to ${round1(info.awayXG)} goals.`;
    if (market === 'BTTS' && sel === 'N') return `A clean sheet for one side is about ${pct}%. The projection is ${round1(info.homeXG)} to ${round1(info.awayXG)} goals.`;
    if (market === 'DNB') {
      const team = sel === '1' ? home : away;
      return `${team} Draw No Bet counts only if they win the match (about ${pct}%). A draw voids the pick instead of losing it.`;
    }
    if (market === 'HT1X2') {
      const bit = sel === '1' ? `${home} leading` : sel === '2' ? `${away} leading` : 'a level score';
      return `At half-time, ${bit} is about ${pct}%. Fewer goals are scored before the break, using the same form.`;
    }
    return `This pick is about ${pct}% on the recorded form and strength.`;
  }

  function rate(fixture, market, selection) {
    const info = assess(fixture);
    const bag = info.probs[market];
    const p = bag && bag[selection] != null ? bag[selection] : 0;
    const rating = ratingOf(p);
    return { rating, probability: p, reason: explain(market, selection, info, p), market, selection, info };
  }

  function slip(picks) {
    const open = (picks || []).filter(p => p && p.home_score == null && NAMES[p.market]);
    const rated = open.map(p => ({ ...rate(p, p.market, p.selection), pick: p }));
    const counts = { Strong: 0, Fair: 0, Risky: 0 };
    rated.forEach(r => { counts[r.rating] += 1; });
    const n = rated.length;
    const confidence = n ? Math.round(rated.reduce((a, r) => a + r.probability, 0) / n * 100) : 0;
    let summary = 'No open picks yet';
    if (n) {
      const s = counts.Strong, f = counts.Fair, k = counts.Risky;
      const tone = k === 0 && s >= f ? 'Solid' : k > s && k > f ? 'Aggressive' : 'Balanced';
      const parts = [];
      if (s) parts.push(`${s} safe`);
      if (f) parts.push(`${f} fair`);
      if (k) parts.push(`${k} risky`);
      summary = `${tone}: ${parts.join(', ')}`;
    }
    return { summary, confidence, counts, rated };
  }

  function selLabel(market, sel) {
    if (LINES[market]) return (sel === 'O' ? 'Over ' : 'Under ') + LINES[market];
    return SEL[sel] || sel;
  }

  function rateAccumulator(legs) {
    const list = (legs || []).filter(l => l && NAMES[l.market] && l.home_score == null);
    if (!list.length) return null;
    let surviveAll = 1;
    for (const leg of list) {
      const info = assess(leg);
      const win = (info.probs[leg.market] && info.probs[leg.market][leg.selection]) || 0;
      const draw = (info.probs['1X2'] && info.probs['1X2'].X) || 0;
      const survive = leg.market === 'DNB' ? Math.min(1, win + draw) : win;
      surviveAll *= survive;
    }
    const rating = ratingOf(surviveAll);
    const pct = Math.round(surviveAll * 100);
    return { probability: surviveAll, rating, confidence: pct, count: list.length, reason: `The chance every leg survives is about ${pct}%. ${rating === 'Risky' ? 'One losing leg loses the whole stake.' : 'That is a relatively steady combined slip.'}` };
  }

  function render(opts) {
    const loggedIn = !!(opts && opts.loggedIn);
    const pack = slip(loggedIn ? opts.picks : []);
    const acc = loggedIn ? rateAccumulator(opts.ticket || opts.picks) : null;
    const accHtml = acc ? `<div class="adv-item"><div class="row between gap"><div><b>Combined slip</b><div class="small muted">${acc.count} leg${acc.count === 1 ? '' : 's'} · ${acc.confidence}% survive</div></div><span class="pill adv-${acc.rating.toLowerCase()}">${acc.rating}</span></div><p class="small">${esc(acc.reason)}</p></div>` : '';
    const rows = pack.rated.map(r => `<div class="adv-item"><div class="row between gap"><div><b>${esc(r.pick.home_team)} vs ${esc(r.pick.away_team)}</b><div class="small muted">${esc(NAMES[r.market] || r.market)} · ${esc(selLabel(r.market, r.selection))}</div></div><span class="pill adv-${r.rating.toLowerCase()}">${r.rating}</span></div><p class="small">${esc(r.reason)}</p></div>`).join('');
    const empty = !loggedIn
      ? '<p class="small muted">Log in and tap a market. Each open pick is rated Strong, Fair or Risky.</p>'
      : '<p class="small muted">No open picks yet. Tap a market on an upcoming match and it will show up here.</p>';
    const head = !loggedIn ? 'Log in to rate your picks' : pack.summary;
    return `<aside class="advisor card" data-advisor><button type="button" class="advisor-toggle" aria-expanded="false"><span><b>Pick advisor</b><span class="small muted">${esc(head)}</span></span><span class="advisor-chev" aria-hidden="true">▾</span></button><div class="advisor-body"><p class="advisor-note">Guidance only — not a guarantee, and no real money.</p><div class="meter-wrap"><div class="row between"><span class="small">Pick confidence</span><b>${pack.confidence}%</b></div><div class="meter" role="meter" aria-valuenow="${pack.confidence}" aria-valuemin="0" aria-valuemax="100" aria-label="Pick confidence"><span style="width:${pack.confidence}%"></span></div></div>${accHtml}${rows || empty}<p class="small muted">Last 5 is oldest to newest, like WWDLW. Blank form or strength uses a neutral default. Odds on the slip are estimated or set by an admin — not live bookmaker prices.</p></div></aside>`;
  }

  return { cleanForm, cleanStrength, assess, rate, slip, rateAccumulator, render, ratingOf };
});
