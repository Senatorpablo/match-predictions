/* Static Matchday demo. State lives in localStorage. All links are relative or in-page hashes. */
(() => {
  const KEY = 'matchday-demo-v5';
  const AD = window.Advisor;
  const MK = window.Markets;
  const OD = window.Odds.createOddsProvider({ assess: f => AD.assess(f), env: {} });
  const ICONS = { home: '⌂', fixtures: '⚽', leaderboard: '🏆', slips: '▤', me: '★', admin: '⚙' };
  const PATHS = ['/', '/fixtures', '/me', '/leaderboard', '/slips', '/admin', '/admin/users', '/login', '/signup'];

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hue = s => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const initials = n => String(n).replace(/\(.*?\)/g, '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 3).toUpperCase();
  const badge = (n, sz = '') => `<span class="badge ${sz}" style="--h:${hue(n)}">${esc(initials(n))}</span>`;
  const timeEl = iso => `<time data-ts="${esc(iso)}">${esc(new Date(iso).toUTCString().slice(0, 22))}</time>`;
  const isPast = f => Date.now() >= Date.parse(f.kickoff);
  const ex = f => f.is_example ? '<span class="pill ghost" title="Demo data — delete from Admin">Example</span>' : '';
  const empty = (icon, title, text, cta = '') => `<div class="empty card"><div class="empty-ico">${icon}</div><h3>${esc(title)}</h3><p class="muted">${esc(text)}</p>${cta}</div>`;
  const ptsPill = p => p == null ? '<span class="pill">Pending</span>' : `<span class="pill ${p > 1 ? 'gold' : p > 0 ? 'green' : 'red'}">+${p} pts</span>`;
  const intOrNull = v => {
    const s = String(v ?? '').trim();
    if (!/^\d{1,2}$/.test(s)) return null;
    const n = Number(s);
    return n <= 99 ? n : null;
  };
  function recompute(s) {
    for (const k of s.picks) {
      const f = s.fixtures.find(x => x.id === k.fixture_id);
      const r = f ? MK.settle(k.market, k.selection, f, s.settings.markets) : { status: null, points: null };
      k.status = r.status; k.points = r.points;
    }
    for (const slip of s.slips || []) {
      for (const leg of slip.legs) {
        const f = s.fixtures.find(x => x.id === leg.fixture_id);
        leg.status = f && f.home_score != null ? MK.settle(leg.market, leg.selection, f).status : 'pending';
      }
      const result = window.Odds.settleTicket(slip.stake, slip.legs.map(l => ({ status: l.status, odds: l.odds })));
      const payout = result.status === 'open' ? 0 : result.payout;
      const user = s.users.find(u => u.id === slip.user_id);
      if (user) user.balance = (user.balance || 0) + payout - (slip.credited || 0);
      slip.credited = payout; slip.payout = payout; slip.status = result.status;
    }
  }
  function leaderboard(s) {
    return s.users.filter(u => !u.is_admin).map(u => {
      const kp = s.picks.filter(k => k.user_id === u.id && k.status && MK.MARKETS[k.market]);
      return {
        id: u.id,
        name: u.name,
        pts: kp.reduce((a, k) => a + (k.points || 0), 0),
        played: kp.length,
        won: kp.filter(k => k.status === 'won').length,
        slip_n: (s.slips || []).filter(sl => sl.user_id === u.id && sl.status !== 'open').length,
        slip_net: (s.slips || []).filter(sl => sl.user_id === u.id && sl.status !== 'open').reduce((a, sl) => a + (sl.payout - sl.stake), 0)
      };
    }).sort((a, b) => b.pts - a.pts || b.won - a.won || a.name.localeCompare(b.name));
  }
  function byKick(dir = 1) {
    return (a, b) => (Date.parse(a.kickoff) - Date.parse(b.kickoff)) * dir;
  }

  function seed(now = Date.now()) {
    const day = 864e5;
    const iso = (d, h) => { const t = new Date(now + d * day); t.setUTCHours(h, 0, 0, 0); return t.toISOString(); };
    const fx = [
      ['Arsenal', 'Chelsea', 'Premier League', -6, 15, 'Emirates Stadium', 2, 1, 1, 0],
      ['Real Madrid', 'Barcelona', 'La Liga', -4, 20, 'Santiago Bernabéu', 1, 1, 0, 1],
      ['Bayern Munich', 'Dortmund', 'Bundesliga', -2, 17, 'Allianz Arena', 3, 0, 2, 0],
      ['Liverpool', 'Man City', 'Premier League', 1, 16, 'Anfield'],
      ['Inter', 'AC Milan', 'Serie A', 2, 19, 'San Siro'],
      ['PSG', 'Marseille', 'Ligue 1', 3, 20, 'Parc des Princes'],
      ['Tottenham', 'Newcastle', 'Premier League', 4, 14, 'Tottenham Hotspur Stadium'],
      ['Atlético Madrid', 'Sevilla', 'La Liga', 5, 20, 'Metropolitano'],
      ['Juventus', 'Napoli', 'Serie A', 8, 19, 'Allianz Stadium']
    ];
    const created = new Date(now).toISOString();
    const FORMS = [['WWDLW', 'LDWLL', 8, 4], ['WDLWD', 'WDLWD', 6, 6], ['WWWWD', 'LLLLD', 9, 3], ['WDWLW', 'DWLLD', 7, 5], [null, null, null, null], ['DLLWW', 'WWLDW', 4, 8], ['DWDWL', 'LWDWL', 5, 5], ['WWWWW', 'LLLLL', 9, 2], ['WLWDW', 'DLWDL', 6, 6]];
    const ALL = '1X2,DC,OU15,OU25,OU35,BTTS,DNB,HT1X2', DEF = MK.DEFAULT.join(',');
    const MKS = [ALL, ALL, ALL, ALL, DEF, '1X2,DC,OU05,OU25,BTTS,DNB', DEF, '1X2,OU25,BTTS', DEF];
    const fixtures = fx.map((f, i) => ({
      id: i + 1, home_team: f[0], away_team: f[1], competition: f[2], kickoff: iso(f[3], f[4]),
      venue: f[5], home_score: f[6] ?? null, away_score: f[7] ?? null, ht_home: f[8] ?? null, ht_away: f[9] ?? null, markets: MKS[i],
      home_form: FORMS[i][0], away_form: FORMS[i][1], home_strength: FORMS[i][2], away_strength: FORMS[i][3],
      option_odds: i === 0 ? JSON.stringify({ '1X2': { '1': 1.72, X: 3.4, '2': 4.5 } }) : null, is_example: 1, created_at: created
    }));
    const users = [
      { id: 1, name: 'Admin', email: 'admin@matchday.local', password: 'demo1234', is_admin: 1, example: 1, balance: 1000, created_at: created },
      { id: 2, name: 'Tunde (demo)', email: 'tunde@example.com', password: 'demo1234', is_admin: 0, example: 1, balance: 1000, created_at: created },
      { id: 3, name: 'Amara (demo)', email: 'amara@example.com', password: 'demo1234', is_admin: 0, example: 1, balance: 1000, created_at: created },
      { id: 4, name: 'Chris (demo)', email: 'chris@example.com', password: 'demo1234', is_admin: 0, example: 1, balance: 1000, created_at: created }
    ];
    const mp = [
      [[0, '1X2', '1'], [0, 'OU25', 'O'], [0, 'BTTS', 'Y'], [1, 'DNB', '1'], [1, 'DC', 'X2'], [1, 'HT1X2', 'X'], [2, '1X2', '1'], [2, 'BTTS', 'N'], [3, '1X2', 'X'], [3, 'OU25', 'O']],
      [[0, 'DC', '1X'], [0, 'OU35', 'U'], [1, '1X2', 'X'], [1, 'BTTS', 'Y'], [2, 'OU25', 'O'], [2, 'HT1X2', '1'], [3, 'BTTS', 'Y'], [4, 'DC', '1X']],
      [[0, '1X2', '2'], [0, 'BTTS', 'N'], [1, 'OU15', 'O'], [1, 'DNB', '2'], [2, 'DC', '1X'], [2, 'OU35', 'U'], [3, '1X2', '2']]
    ];
    const kpicks = [];
    let kid = 1;
    users.slice(1).forEach((u, i) => mp[i].forEach(([j, market, selection]) => kpicks.push({ id: kid++, user_id: u.id, fixture_id: fixtures[j].id, market, selection, status: null, points: null })));
    const markets = {}; MK.ORDER.forEach(k => { markets[k] = MK.MARKETS[k].def; });
    const draft = kpicks.filter(k => { const f = fixtures.find(x => x.id === k.fixture_id); return f && f.home_score == null; }).map(k => ({ user_id: k.user_id, fixture_id: k.fixture_id, market: k.market, selection: k.selection }));
    const state = { version: 5, nextId: 1000, sessionUserId: 2, settings: { markets, startingBalance: 1000 }, users, fixtures, picks: kpicks, draft, slips: [] };
    recompute(state);
    return state;
  }

  let state;
  let flash = null;
  let lastHash = location.hash;

  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode */ } }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && s.version === 5 && Array.isArray(s.picks) && Array.isArray(s.fixtures) && Array.isArray(s.users)) {
          recompute(s);
          if (s.sessionUserId && !s.users.some(u => u.id === s.sessionUserId)) s.sessionUserId = null;
          return s;
        }
      }
    } catch (e) { /* reseed */ }
    const s = seed();
    state = s;
    save();
    return s;
  }

  const currentUser = () => state.users.find(u => u.id === state.sessionUserId) || null;
  function parse() {
    let h = (location.hash || '#').slice(1);
    if (!h) h = '/';
    if (!h.startsWith('/')) h = '/' + h;
    const i = h.indexOf('?');
    const path = (i >= 0 ? h.slice(0, i) : h).replace(/\/+$/, '') || '/';
    const params = new URLSearchParams(i >= 0 ? h.slice(i + 1) : '');
    return { path, params };
  }
  function safeNext(n) {
    if (typeof n !== 'string' || !n.startsWith('/') || n.startsWith('//')) return '/fixtures';
    const path = n.split('?')[0];
    return PATHS.includes(path) && path !== '/login' && path !== '/signup' ? n : '/fixtures';
  }
  function go(hash) {
    if (!hash.startsWith('#')) hash = '#' + hash;
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function fixtureCard(f, user, interactive) {
    const done = f.home_score != null && f.away_score != null;
    const live = isPast(f);
    const mine = {}; if (user) state.picks.filter(k => k.user_id === user.id && k.fixture_id === f.id && MK.MARKETS[k.market]).forEach(k => { mine[k.market] = k; });
    const draft = {}; if (user) (state.draft || []).filter(d => d.user_id === user.id && d.fixture_id === f.id).forEach(d => { draft[d.market] = d.selection; });
    const mk = interactive ? MK.render(f, mine, { open: !!user && !done && !live, action: '#', pts: state.settings.markets, quote: (m, sel) => OD.quote(f, m, sel), draft }).replace(/<form method="post" action="#"/g, `<form action="#" data-fid="${f.id}"`) : '';
    const action = done
      ? `<div class="result"><b>${f.home_score}</b><span>FT</span><b>${f.away_score}</b></div>`
      : `<div class="vs">${live ? '<span class="pill red pulse">Locked</span>' : '<span class="vs-txt">VS</span>'}</div>`;
    const form = (interactive && !done && !live && !user) ? `<a class="btn ghost sm block" href="#/login?next=/fixtures">Log in to pick</a>` : '';
    const yours = (interactive && user && (live || done) && !Object.keys(mine).length) ? '<div class="yours muted">No picks made</div>' : '';
    const countdown = !done && !live ? `<div class="countdown small muted" data-kick="${esc(f.kickoff)}"></div>` : '';
    return `<article class="card fixture" id="f${f.id}"><div class="meta"><span class="pill">${esc(f.competition)}</span>${ex(f)}<span class="muted small">${timeEl(f.kickoff)}${f.venue ? ' · ' + esc(f.venue) : ''}</span></div>
      <div class="teams"><div class="team">${badge(f.home_team, 'lg')}<span>${esc(f.home_team)}</span></div>${action}<div class="team">${badge(f.away_team, 'lg')}<span>${esc(f.away_team)}</span></div></div>
      ${done && f.ht_home != null ? `<div class="small muted center">HT ${f.ht_home} – ${f.ht_away}</div>` : ''}${countdown}${mk}${form}${yours}</article>`;
  }

  function homeView(user) {
    const upcoming = state.fixtures.filter(f => Date.parse(f.kickoff) > Date.now()).sort(byKick(1)).slice(0, 3);
    const results = state.fixtures.filter(f => f.home_score != null).sort(byKick(-1)).slice(0, 3);
    const top = leaderboard(state).slice(0, 5);
    const stats = {
      fixtures: state.fixtures.length,
      players: state.users.filter(u => !u.is_admin).length,
      preds: state.picks.length
    };
    return `<section class="hero"><span class="pill glow">Season is live</span><h1>Call the match.<br><span class="grad">Own the table.</span></h1>
      <p class="lead muted">Pick who wins each match, earn points, top the table. Free, no money involved.</p>
      <div class="row gap wrapr">${user ? `<a class="btn lg" href="#/fixtures">Make predictions</a><a class="btn ghost lg" href="#/me">My picks</a>` : `<a class="btn lg" href="#/signup">Start predicting — free</a><a class="btn ghost lg" href="#/fixtures">Browse fixtures</a>`}</div></section>
      <div class="grid2"><section><div class="sec-h"><h2>Up next</h2><a href="#/fixtures" class="link">All fixtures →</a></div>
      ${upcoming.length ? upcoming.map(f => fixtureCard(f, null, false)).join('') : empty('📅', 'No upcoming fixtures', 'The admin will add the next round soon.')}</section>
      <section><div class="sec-h"><h2>Top predictors</h2><a href="#/leaderboard" class="link">Full table →</a></div>
      <div class="card list">${top.length ? top.map((r, i) => `<div class="lrow"><span class="rank r${i + 1}">${i + 1}</span>${badge(r.name)}<span class="grow">${esc(r.name)}</span><b>${r.pts}</b><span class="muted small">pts</span></div>`).join('') : '<p class="muted pad">No players yet — be the first!</p>'}</div>
      <div class="sec-h"><h2>Latest results</h2></div>
      <div class="card list">${results.length ? results.map(f => `<div class="lrow">${badge(f.home_team, 'sm')}<span class="grow small">${esc(f.home_team)}</span><b class="score">${f.home_score} – ${f.away_score}</b><span class="grow small right">${esc(f.away_team)}</span>${badge(f.away_team, 'sm')}</div>`).join('') : '<p class="muted pad">Results will appear here after matches.</p>'}</div></section></div>`;
  }

  function fixturesView(user, tab) {
    const fx = state.fixtures.slice().sort(byKick(1));
    const up = fx.filter(f => f.home_score == null && !isPast(f));
    const lk = fx.filter(f => f.home_score == null && isPast(f));
    const res = fx.filter(f => f.home_score != null).reverse();
    const lists = { upcoming: up, live: lk, results: res };
    const cur = lists[tab] ? tab : 'upcoming';
    const tabs = [['upcoming', 'Upcoming', up.length], ['live', 'In play / awaiting', lk.length], ['results', 'Results', res.length]];
    const list = lists[cur];
    const groups = Object.create(null);
    list.forEach(f => { (groups[f.competition] ||= []).push(f); });
    return `<div class="page-split"><div class="page-main"><div class="page-h"><h1>Fixtures</h1><p class="muted">Tap to pick, tap again to undo. Picks lock at kickoff.</p></div>
      <div class="tabs">${tabs.map(([k, l, n]) => `<a href="#/fixtures?tab=${k}" class="${k === cur ? 'on' : ''}">${l} <span>${n}</span></a>`).join('')}</div>
      ${list.length ? Object.entries(groups).map(([c, rows]) => `<h3 class="comp">${esc(c)}</h3><div class="cards">${rows.map(f => fixtureCard(f, user, true)).join('')}</div>`).join('') : empty(cur === 'results' ? '📊' : '📅', cur === 'results' ? 'No results yet' : 'Nothing here right now', cur === 'upcoming' ? 'New fixtures will appear once the admin publishes them.' : 'Check back after kickoff.')}</div>
      ${rail(user)}</div>`;
  }

  function meView(user) {
    const lb = leaderboard(state);
    const me = lb.find(r => r.id === user.id);
    const rank = lb.findIndex(r => r.id === user.id) + 1;
    const kp = state.picks.filter(k => k.user_id === user.id && MK.MARKETS[k.market]);
    const settled = kp.filter(k => k.status && k.status !== 'void');
    const byF = {};
    kp.forEach(k => { const f = state.fixtures.find(x => x.id === k.fixture_id); if (f) (byF[k.fixture_id] ||= { f, items: [] }).items.push({ m: MK.MARKETS[k.market].name, sel: MK.label(k.market, k.selection), pts: k.points, st: k.status }); });
    const groups = Object.values(byF).sort((a, b) => Date.parse(b.f.kickoff) - Date.parse(a.f.kickoff));
    const stPill = i => i.st == null ? '<span class="pill xs">Pending</span>' : i.st === 'void' ? '<span class="pill xs">Void</span>' : i.pts > 0 ? `<span class="pill green xs">+${i.pts}</span>` : '<span class="pill red xs">0</span>';
    const acc = settled.length ? Math.round(100 * settled.filter(r => r.points > 0).length / settled.length) : 0;
    return `<div class="page-split"><div class="page-main"><div class="page-h row between wrapr"><div class="row gap">${badge(user.name, 'xl')}<div><h1>${esc(user.name)}</h1><p class="muted">${esc(user.email)}</p></div></div><a class="btn ghost sm" href="#/slips">My slips</a></div>
      <div class="stats card"><div><b>${me?.pts ?? 0}</b><span>Points</span></div><div><b>${rank ? '#' + rank : '–'}</b><span>of ${lb.length}</span></div><div><b>${acc}%</b><span>Accuracy</span></div><div><b>${me?.won ?? 0}</b><span>Won</span></div></div>
      <div class="sec-h"><h2>Pick history</h2></div>
      ${groups.length ? `<div class="card list">${groups.map(({ f: r, items }) => { const tot = items.reduce((a, i) => a + (i.pts || 0), 0), pend = items.every(i => i.st == null);
      return `<div class="lrow hist"><div class="grow"><div class="small muted">${esc(r.competition)} · ${timeEl(r.kickoff)}${r.home_score != null ? ` · FT <b>${r.home_score}–${r.away_score}</b>` : ''}</div><div class="row gap">${badge(r.home_team, 'sm')}<b>${esc(r.home_team)}</b><span class="muted">vs</span><b>${esc(r.away_team)}</b>${badge(r.away_team, 'sm')}</div>
      <div class="picklist">${items.map(i => `<span class="pk"><span class="muted">${esc(i.m)}</span> <b>${esc(i.sel)}</b> ${stPill(i)}</span>`).join('')}</div></div>
      <div class="right">${ptsPill(pend ? null : tot)}</div></div>`; }).join('')}</div>`
      : empty('🎯', 'No picks yet', 'Open a fixture and tap a market.', '<a class="btn" href="#/fixtures">Go to fixtures</a>')}</div>
      ${rail(user)}</div>`;
  }
  function slipsView(user) {
    const rows = (state.slips || []).filter(s => s.user_id === user.id).slice().reverse();
    const st = s => s === 'won' ? 'green' : s === 'lost' ? 'red' : '';
    const list = rows.length ? `<div class="card list">${rows.map(s => `<div class="lrow hist"><div class="grow"><div class="row between"><b>${esc(s.status)}</b><span class="pill ${st(s.status)}">${s.payout ? '+' + s.payout : s.status === 'open' ? 'Open' : '0'}</span></div><div class="small muted">Stake ${s.stake} · ${Number(s.combined_odds).toFixed(2)}×</div><div class="picklist">${s.legs.map(l => `<span class="pk"><span class="muted">${esc(l.home_team)} vs ${esc(l.away_team)}</span> <b>${esc(MK.label(l.market, l.selection))}</b> ${Number(l.odds).toFixed(2)}</span>`).join('')}</div></div></div>`).join('')}</div>` : empty('▤', 'No slips placed yet', 'Build one from the fixtures page. Points only — no real money.', '<a class="btn" href="#/fixtures">Go to fixtures</a>');
    return `<div class="page-split"><div class="page-main"><div class="page-h"><h1>Slips</h1><p class="muted">Balance <b>${user.balance || 0} pts</b>. A losing leg loses the stake. This is not real money.</p></div>${list}</div>${rail(user)}</div>`;
  }

  function leaderboardView(user) {
    const rows = leaderboard(state);
    const pod = rows.slice(0, 3);
    return `<div class="page-h"><h1>Leaderboard</h1><p class="muted">Points from every market you pick.</p></div>
      ${rows.length ? `<div class="podium">${[1, 0, 2].filter(i => pod[i]).map(i => `<div class="pod p${i + 1}">${badge(pod[i].name, 'xl')}<b>${esc(pod[i].name)}</b><span class="pts">${pod[i].pts} pts</span><div class="step">${i + 1}</div></div>`).join('')}</div>
      <div class="card list">${rows.map((r, i) => `<div class="lrow ${user?.id === r.id ? 'me' : ''}"><span class="rank r${i + 1}">${i + 1}</span>${badge(r.name)}<span class="grow">${esc(r.name)}${user?.id === r.id ? ' <span class="pill green">You</span>' : ''}</span><span class="muted small hide-sm">${r.won} won · ${r.played} settled${r.slip_n ? ` · slip ${r.slip_net >= 0 ? '+' : ''}${r.slip_net}` : ''}</span><b>${r.pts}</b></div>`).join('')}</div>`
      : empty('🏆', 'The table is empty', 'Sign up and make predictions to get on the board.', '<a class="btn" href="#/signup">Join now</a>')}`;
  }

  function toLocalInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  }
  function readFixture(form) {
    const home_team = form.home_team.value.trim();
    const away_team = form.away_team.value.trim();
    const competition = form.competition.value.trim();
    const venue = form.venue.value.trim() || null;
    const local = form.kickoff.value;
    if (!home_team || !away_team || !competition || !local) return null;
    const kickoffDate = new Date(local);
    if (isNaN(kickoffDate)) return null;
    const markets = MK.list([...form.querySelectorAll('input[name=markets]:checked')].map(i => i.value).join(',')).join(',');
    const home_strength = AD.cleanStrength(form.home_strength.value), away_strength = AD.cleanStrength(form.away_strength.value);
    if (home_strength === false || away_strength === false) return { error: 'Strength must be a whole number from 1 to 10, or left blank.' };
    const priced = window.Odds.collectAdminOdds(k => form[k] ? form[k].value : '', MK.ORDER, MK.MARKETS);
    if (priced.error) return priced;
    return { home_team, away_team, competition, venue, markets, kickoff: kickoffDate.toISOString(), home_form: AD.cleanForm(form.home_form.value), away_form: AD.cleanForm(form.away_form.value), home_strength, away_strength, option_odds: priced.json };
  }
  function presentLegs(user) {
    if (!user) return [];
    return (state.draft || []).filter(d => d.user_id === user.id).map(d => {
      const f = state.fixtures.find(x => x.id === d.fixture_id);
      if (!f) return null;
      const q = OD.quote(f, d.market, d.selection);
      return { ...f, ...d, decimal: q.decimal, source: q.source };
    }).filter(Boolean);
  }
  function rail(user) {
    return `<div class="rail">${window.Odds.renderSlip({ loggedIn: !!user, balance: user?.balance || 0, legs: presentLegs(user), demo: true })}${AD.render({ loggedIn: !!user, picks: openSlip(user), ticket: presentLegs(user) })}</div>`;
  }
  function openSlip(user) {
    if (!user) return [];
    return state.picks.filter(k => MK.MARKETS[k.market] && k.user_id === user.id).map(k => {
      const f = state.fixtures.find(x => x.id === k.fixture_id);
      return f ? { ...f, market: k.market, selection: k.selection } : null;
    }).filter(Boolean);
  }

  function adminView(editId) {
    const s = state.settings;
    const fx = state.fixtures.slice().sort(byKick(-1));
    const edit = editId ? state.fixtures.find(f => f.id === editId) : null;
    const v = k => esc(edit?.[k] ?? '');
    const comps = [...new Set(fx.map(f => f.competition))];
    const form = `<form action="#" class="card stack admin-form" data-action="save-fixture" ${edit ? `data-id="${edit.id}"` : ''}>
      <h3>${edit ? 'Edit fixture' : 'Add a fixture'}</h3>
      <div class="grid-2"><label>Home team<input name="home_team" required value="${v('home_team')}" placeholder="e.g. Arsenal"></label><label>Away team<input name="away_team" required value="${v('away_team')}" placeholder="e.g. Chelsea"></label></div>
      <div class="grid-2"><label>Competition<input name="competition" required value="${v('competition')}" placeholder="e.g. Premier League" list="comps"></label><label>Kickoff (your local time)<input type="datetime-local" name="kickoff" required value="${edit ? esc(toLocalInput(edit.kickoff)) : ''}"></label></div>
      <label>Venue <span class="muted">(optional)</span><input name="venue" value="${v('venue')}" placeholder="e.g. Emirates Stadium"></label>
      <div class="advisor-fields"><p class="muted small" style="margin:0">Advisor form, optional. Last 5 is oldest to newest (WWDLW). Blank uses a neutral default.</p>
      <div class="grid-2"><label>Home last 5<input name="home_form" maxlength="5" placeholder="WWDLW" value="${v('home_form')}" autocapitalize="characters"></label><label>Away last 5<input name="away_form" maxlength="5" placeholder="LDWLL" value="${v('away_form')}" autocapitalize="characters"></label></div>
      <div class="grid-2"><label>Home strength 1–10<input type="number" name="home_strength" min="1" max="10" placeholder="5" value="${edit?.home_strength ?? ''}"></label><label>Away strength 1–10<input type="number" name="away_strength" min="1" max="10" placeholder="5" value="${edit?.away_strength ?? ''}"></label></div></div>
      <details class="odds-fields"><summary>Optional odds <span class="muted">blank = estimated, 1.05–15</span></summary><div class="odds-grid">${MK.ORDER.map(k => `<div class="odds-row"><span>${esc(MK.MARKETS[k].short)}</span>${MK.MARKETS[k].opts.map(([sel, lab]) => `<label>${esc(lab)}<input type="number" name="odd_${k}_${sel}" min="1.05" max="15" step="0.01" placeholder="Est." value="${esc(((window.Odds.parseOdds(edit?.option_odds)[k] || {})[sel] ?? ''))}"></label>`).join('')}</div>`).join('')}</div></details>
      <fieldset class="mkt-pick"><legend>Markets players can pick</legend>${MK.ORDER.map(k => `<label class="chk"><input type="checkbox" name="markets" value="${k}" ${MK.list(edit?.markets).includes(k) ? 'checked' : ''}><span>${esc(MK.MARKETS[k].name)}</span></label>`).join('')}</fieldset>
      <datalist id="comps">${comps.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
      <div class="row gap"><button class="btn" type="submit">${edit ? 'Save changes' : 'Add fixture'}</button>${edit ? '<a class="btn ghost" href="#/admin">Cancel</a>' : ''}</div></form>`;
    const row = f => {
      const n = state.picks.filter(k => k.fixture_id === f.id && MK.MARKETS[k.market]).length;
      const ht = MK.list(f.markets).includes('HT1X2');
      const scored = f.home_score != null;
      return `<div class="lrow admin-row"><div class="grow"><div class="small muted">${esc(f.competition)} · ${timeEl(f.kickoff)} ${ex(f)}</div><div class="row gap">${badge(f.home_team, 'sm')}<b>${esc(f.home_team)}</b><span class="muted">vs</span><b>${esc(f.away_team)}</b>${badge(f.away_team, 'sm')}</div><div class="small muted">${n} pick${n === 1 ? '' : 's'} · ${MK.list(f.markets).map(k => MK.MARKETS[k].short).join(' · ')}</div></div>
        <form action="#" class="predict tight${ht ? ' ht' : ''}" data-action="result" data-id="${f.id}"><input type="number" name="home_score" min="0" max="99" value="${f.home_score ?? ''}" aria-label="Home score"><span class="dash">–</span><input type="number" name="away_score" min="0" max="99" value="${f.away_score ?? ''}" aria-label="Away score">${ht ? `<span class="small muted">HT</span><input type="number" name="ht_home" min="0" max="99" value="${f.ht_home ?? ''}" aria-label="Half-time home"><span class="dash">–</span><input type="number" name="ht_away" min="0" max="99" value="${f.ht_away ?? ''}" aria-label="Half-time away">` : ''}<button class="btn sm ${scored ? 'ghost' : ''}" type="submit">${scored ? 'Update' : 'Set result'}</button></form>
        <div class="row gap"><a class="icon-btn" href="#/admin?edit=${f.id}" title="Edit">✎</a>${scored ? `<form action="#" data-action="clear-result" data-id="${f.id}"><button class="icon-btn" type="submit" title="Clear result">↺</button></form>` : ''}<form action="#" data-action="delete-fixture" data-id="${f.id}" data-confirm="Delete this fixture and its predictions?"><button class="icon-btn danger" type="submit" title="Delete">🗑</button></form></div></div>`;
    };
    return `<div class="page-h row between wrapr" id="top"><div><h1>Admin</h1><p class="muted">Manage fixtures, results and scoring.</p></div><a class="btn ghost" href="#/admin/users">Users (${state.users.length})</a></div>
      <div class="grid2 admin-grid"><div>${form}
      <form action="#" method="post" class="card stack" data-action="save-settings"><h3>Scoring rules</h3><p class="muted small" style="margin:0">Points awarded when a pick wins. Draw No Bet is void (0) on a draw. Starting balance applies to new players.</p><div class="grid-3">${Object.keys(s.markets).map(k => `<label>${esc(MK.MARKETS[k].name)}<input type="number" name="pts_${k}" min="0" max="99" value="${s.markets[k]}"></label>`).join('')}<label>Starting slip points<input type="number" name="starting_balance" min="1" max="100000" value="${s.startingBalance ?? 1000}"></label></div><button class="btn ghost" type="submit">Save & recalculate</button></form></div>
      <div><div class="sec-h"><h2>All fixtures</h2><span class="muted small">${fx.length} total</span></div>${fx.length ? `<div class="card list">${fx.map(row).join('')}</div>` : empty('📋', 'No fixtures yet', 'Add your first fixture using the form.')}</div></div>`;
  }

  function usersView(me) {
    const users = state.users.slice().sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id - b.id);
    return `<div class="page-h row between wrapr"><div><h1>Users</h1><p class="muted">${users.length} registered</p></div><a class="btn ghost" href="#/admin">← Back to admin</a></div>
      <div class="card list">${users.map(u => {
        const mine = state.picks.filter(k => k.user_id === u.id && MK.MARKETS[k.market]);
        const n = mine.length;
        const pts = mine.reduce((a, k) => a + (k.points || 0), 0);
        return `<div class="lrow">${badge(u.name)}<div class="grow"><b>${esc(u.name)}</b> ${u.is_admin ? '<span class="pill gold">Admin</span>' : ''}<div class="small muted">${esc(u.email)} · joined ${esc(String(u.created_at).slice(0, 10))}</div></div><span class="small muted hide-sm">${n} picks</span><b>${pts}</b><span class="muted small">pts</span>
          ${u.id !== me.id ? `<form action="#" data-action="toggle-admin" data-id="${u.id}"><button class="btn ghost sm" type="submit">${u.is_admin ? 'Revoke admin' : 'Make admin'}</button></form>` : ''}</div>`;
      }).join('')}</div>`;
  }

  function authView(mode, next) {
    const su = mode === 'signup';
    const examples = state.users.filter(u => u.example);
    return `<div class="auth card"><img src="icons/icon-192.png" class="auth-logo" alt=""><h1>${su ? 'Create your account' : 'Welcome back'}</h1><p class="muted">${su ? 'Free forever. Predict, compete, win bragging rights.' : 'Log in to make your predictions.'}</p>
      <form action="#" class="stack" data-action="${su ? 'signup' : 'login'}">${su ? '<label>Display name<input name="name" required maxlength="40" autocomplete="nickname"></label>' : ''}
      <label>Email<input type="email" name="email" required autocomplete="email"></label>
      <label>Password<input type="password" name="password" required ${su ? 'minlength="8" autocomplete="new-password"' : 'autocomplete="current-password"'}></label>
      <input type="hidden" name="next" value="${esc(next || '')}"><button class="btn lg block" type="submit">${su ? 'Create account' : 'Log in'}</button></form>
      <p class="muted small center">${su ? 'Already have an account? <a class="link" href="#/login">Log in</a>' : 'New here? <a class="link" href="#/signup">Create an account</a>'}</p>
      ${su ? '' : `<p class="muted small center">Example accounts use password <b>demo1234</b></p><div class="demo-accounts">${examples.map(u => `<button type="button" class="btn ghost sm" data-action="login-as" data-id="${u.id}">${esc(u.name)}</button>`).join('')}</div>`}
      </div>`;
  }

  function pageBody(path, params, user) {
    if (path === '/') return { title: 'Home', active: 'home', html: homeView(user) };
    if (path === '/fixtures') return { title: 'Fixtures', active: 'fixtures', html: fixturesView(user, params.get('tab') || 'upcoming') };
    if (path === '/me') return { title: 'My predictions', active: 'me', html: meView(user) };
    if (path === '/slips') return { title: 'Slips', active: 'slips', html: slipsView(user) };
    if (path === '/leaderboard') return { title: 'Leaderboard', active: 'leaderboard', html: leaderboardView(user) };
    if (path === '/admin') return { title: 'Admin', active: 'admin', html: adminView(+(params.get('edit') || 0)) };
    if (path === '/admin/users') return { title: 'Users', active: 'admin', html: usersView(user) };
    if (path === '/login') return { title: 'Log in', active: '', html: authView('login', params.get('next') || '') };
    if (path === '/signup') return { title: 'Sign up', active: '', html: authView('signup', params.get('next') || '') };
    return { title: 'Not found', active: '', html: empty('🧭', 'Page not found', 'That page wandered offside.', '<a class="btn" href="#/">Back home</a>') };
  }

  function shell(user, active, body) {
    const nav = [['home', '#/', 'Home'], ['fixtures', '#/fixtures', 'Fixtures'], ['leaderboard', '#/leaderboard', 'Leaderboard']];
        if (user) nav.push(['me', '#/me', 'My picks']);
    if (user?.is_admin) nav.push(['admin', '#/admin', 'Admin']);
    const links = nav.map(([k, h, l]) => `<a href="${h}" class="${k === active ? 'on' : ''}">${l}</a>`).join('');
    const who = state.users.slice().sort((a, b) => a.is_admin - b.is_admin || a.id - b.id);
    const toast = flash ? `<div class="toast ${flash.type}" role="status">${esc(flash.msg)}</div>` : '';
    return `<header class="top"><div class="wrap row"><a href="#/" class="brand"><img src="icons/icon-192.png" alt=""><span>Matchday</span></a>
      <nav class="desk">${links}</nav><div class="row gap">
      <button class="icon-btn" id="theme" type="button" aria-label="Toggle theme">◐</button>
      ${user ? `<button class="btn ghost sm" type="button" data-action="logout">Log out</button>` : `<a class="btn ghost sm" href="#/login">Log in</a><a class="btn sm hide-sm" href="#/signup">Join free</a>`}
      </div></div></header>
      <div class="demo-banner"><span>Demo — example data, stored only in your browser</span>
      <label>View as <select id="view-as" aria-label="View as"><option value="">Signed out</option>${who.map(u => `<option value="${u.id}"${u.id === state.sessionUserId ? ' selected' : ''}>${esc(u.name)}</option>`).join('')}</select></label>
      <button type="button" data-action="reset">Reset</button></div>
      <main class="wrap">${toast}${body}</main>
      <footer class="wrap muted small">© ${new Date().getFullYear()} Matchday Predictions · Just for fun — no gambling.</footer>
      <nav class="tabbar">${nav.map(([k, h, l]) => `<a href="${h}" class="${k === active ? 'on' : ''}"><i>${ICONS[k]}</i>${l}</a>`).join('')}</nav>`;
  }

  function enhance() {
    const fmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    document.querySelectorAll('time[data-ts]').forEach(t => {
      const d = new Date(t.dataset.ts);
      if (!isNaN(d)) { t.textContent = fmt.format(d); t.title = d.toString(); }
    });
    document.querySelectorAll('[data-count]').forEach(el => {
      const n = +el.dataset.count, t0 = performance.now();
      const step = t => {
        const p = Math.min(1, (t - t0) / 700);
        el.textContent = Math.round(n * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    tick();
  }
  function tick() {
    document.querySelectorAll('[data-kick]').forEach(el => {
      let s = (Date.parse(el.dataset.kick) - Date.now()) / 1000;
      if (s <= 0) { el.textContent = 'Kicked off — refresh to see lock'; return; }
      const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
      el.textContent = `Locks in ${d ? d + 'd ' : ''}${h}h ${m}m`;
    });
  }

  function render(opts = {}) {
    const { path, params } = parse();
    const user = currentUser();
    const needsUser = path === '/me' || path === '/slips' || path === '/admin' || path === '/admin/users';
    if (!user && needsUser) {
      go('#/login?next=' + encodeURIComponent(path));
      return;
    }
    const page = pageBody(path, params, user);
    const msg = flash;
    document.title = page.title + ' · Matchday';
    document.getElementById('app').innerHTML = shell(user, page.active, page.html);
    flash = null;
    enhance();
    const hash = location.hash;
    const changed = hash !== lastHash;
    lastHash = hash;
    if (opts.focusId) document.getElementById(opts.focusId)?.scrollIntoView({ block: 'center' });
    else if (changed || opts.forceTop || msg) window.scrollTo(0, 0);
  }

  function setFlash(type, msg) { flash = { type, msg }; }

  function onSaveFixture(form) {
    const id = form.dataset.id ? +form.dataset.id : 0;
    const data = readFixture(form);
    if (!data || data.error) { setFlash('error', data?.error || (id ? 'All required fields must be filled.' : 'Home team, away team, competition and kickoff are required.')); render(); return; }
    if (id) {
      const f = state.fixtures.find(x => x.id === id);
      if (!f) return;
      Object.assign(f, data);
      recompute(state); save();
      setFlash('success', 'Fixture updated.');
      go('#/admin');
    } else {
      state.fixtures.push({ id: state.nextId++, ...data, home_score: null, away_score: null, is_example: 0, created_at: new Date().toISOString() });
      save();
      setFlash('success', `Fixture added: ${data.home_team} vs ${data.away_team}`);
      render({ forceTop: true });
    }
  }
  function onResult(form) {
    const f = state.fixtures.find(x => x.id === +form.dataset.id);
    if (!f) return;
    const h = intOrNull(form.home_score.value), a = intOrNull(form.away_score.value);
    if (h == null || a == null) { setFlash('error', 'Enter both scores.'); render(); return; }
    const hh = form.ht_home ? intOrNull(form.ht_home.value) : null, ha = form.ht_away ? intOrNull(form.ht_away.value) : null;
    const ht = hh != null && ha != null;
    if (ht && (hh > h || ha > a)) { setFlash('error', 'Half-time goals cannot exceed full-time goals.'); render(); return; }
    f.home_score = h; f.away_score = a; f.ht_home = ht ? hh : null; f.ht_away = ht ? ha : null;
    recompute(state); save();
    setFlash('success', 'Result saved — points updated.');
    render();
  }
  function onClear(form) {
    const f = state.fixtures.find(x => x.id === +form.dataset.id);
    if (!f) return;
    f.home_score = null; f.away_score = null; f.ht_home = null; f.ht_away = null;
    recompute(state); save();
    setFlash('success', 'Result cleared.');
    render();
  }
  function onDelete(form) {
    const id = +form.dataset.id;
    state.fixtures = state.fixtures.filter(f => f.id !== id);
    state.picks = state.picks.filter(k => k.fixture_id !== id);
    state.draft = (state.draft || []).filter(d => d.fixture_id !== id);
    for (const slip of state.slips || []) for (const leg of slip.legs) if (leg.fixture_id === id) leg.status = 'void';
    recompute(state); save();
    setFlash('success', 'Fixture deleted.');
    render();
  }
  function onSettings(form) {
    const markets = {};
    for (const k of Object.keys(state.settings.markets)) { markets[k] = intOrNull(form['pts_' + k].value); if (markets[k] == null) { setFlash('error', 'Points must be whole numbers.'); render(); return; } }
    const start = parseInt(form.starting_balance.value, 10);
    if (!Number.isInteger(start) || start < 1 || start > 100000) { setFlash('error', 'Starting balance must be a whole number from 1 to 100000.'); render(); return; }
    state.settings = { markets, startingBalance: start };
    recompute(state); save();
    setFlash('success', 'Scoring updated and all points recalculated.');
    render();
  }
  function onToggle(form) {
    const me = currentUser();
    const u = state.users.find(x => x.id === +form.dataset.id);
    if (!u || !me) return;
    if (u.id === me.id) { setFlash('error', "You can't change your own admin status."); render(); return; }
    u.is_admin = u.is_admin ? 0 : 1;
    save();
    render();
  }
  function enter(u, next) {
    state.sessionUserId = u.id;
    save();
    setFlash('success', `Welcome back, ${u.name.split(' ')[0]}!`);
    go('#' + ((u.is_admin && !next) ? '/admin' : safeNext(next || '')));
  }
  function onLogin(form) {
    const email = String(form.email.value || '').trim().toLowerCase();
    const u = state.users.find(x => x.email === email);
    if (!u || u.password !== String(form.password.value || '')) { setFlash('error', 'Invalid email or password.'); render(); return; }
    enter(u, form.next.value);
  }
  function onSignup(form) {
    const name = String(form.name.value || '').trim().slice(0, 40);
    const email = String(form.email.value || '').trim().toLowerCase();
    const password = String(form.password.value || '');
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
      setFlash('error', 'Please enter a name, a valid email and a password of at least 8 characters.');
      render(); return;
    }
    if (state.users.some(u => u.email === email)) { setFlash('error', 'An account with that email already exists.'); render(); return; }
    const u = { id: state.nextId++, name, email, password, is_admin: 0, example: 0, balance: state.settings.startingBalance || 1000, created_at: new Date().toISOString() };
    state.users.push(u);
    state.sessionUserId = u.id;
    save();
    setFlash('success', `You're in, ${name}! Make your first prediction.`);
    go('#' + safeNext(form.next.value || ''));
  }

  function refreshAdvisor() {
    const cur = document.querySelector('[data-advisor]');
    if (!cur) return;
    const open = cur.classList.contains('open');
    const box = document.createElement('div');
    box.innerHTML = AD.render({ loggedIn: !!currentUser(), picks: openSlip(currentUser()), ticket: presentLegs(currentUser()) });
    const next = box.firstElementChild;
    if (!next) return;
    if (open) { next.classList.add('open'); next.querySelector('.advisor-toggle')?.setAttribute('aria-expanded', 'true'); }
    cur.replaceWith(next);
  }
  function onSlipRemove(form) {
    const user = currentUser(); if (!user) return;
    const fid = +form.dataset.fid, market = form.dataset.market;
    state.draft = (state.draft || []).filter(d => !(d.user_id === user.id && d.fixture_id === fid && d.market === market));
    state.picks = state.picks.filter(k => !(k.user_id === user.id && k.fixture_id === fid && k.market === market));
    save(); setFlash('success', 'Removed from the slip.'); render();
  }
  function onSlipPlace(form) {
    const user = currentUser(); if (!user) return;
    const legs = presentLegs(user);
    if (!legs.length) { setFlash('error', 'Your slip is empty.'); render(); return; }
    if (legs.some(l => isPast(l) || l.home_score != null)) { setFlash('error', 'The earliest match on this slip has kicked off, so it can no longer be placed.'); render(); return; }
    const stake = parseInt(form.stake.value, 10);
    if (!Number.isInteger(stake) || stake < 1) { setFlash('error', 'Enter a whole stake of at least 1 point.'); render(); return; }
    if (stake > (user.balance || 0)) { setFlash('error', `You only have ${user.balance || 0} points to stake.`); render(); return; }
    const mult = window.Odds.product(legs.map(l => l.decimal));
    user.balance -= stake;
    state.slips = state.slips || [];
    state.slips.push({ id: state.nextId++, user_id: user.id, stake, combined_odds: mult, potential: Math.round(stake * mult), status: 'open', payout: 0, credited: 0, placed_at: new Date().toISOString(), legs: legs.map(l => ({ fixture_id: l.fixture_id, market: l.market, selection: l.selection, odds: l.decimal, source: l.source, status: 'pending', home_team: l.home_team, away_team: l.away_team, kickoff: l.kickoff })) });
    state.draft = (state.draft || []).filter(d => d.user_id !== user.id);
    recompute(state); save();
    setFlash('success', `Slip placed. ${stake} points staked at ${mult.toFixed(2)}×.`);
    go('#/slips');
  }
  function refreshSlip() {
    const cur = document.querySelector('[data-slip]');
    if (!cur) return;
    const open = cur.classList.contains('open');
    const user = currentUser();
    const box = document.createElement('div');
    box.innerHTML = window.Odds.renderSlip({ loggedIn: !!user, balance: user?.balance || 0, legs: presentLegs(user), demo: true });
    const next = box.firstElementChild;
    if (!next) return;
    if (open) next.classList.add('open');
    cur.replaceWith(next);
  }

  document.addEventListener('click', e => {
    const theme = e.target.closest('#theme');
    if (theme) {
      const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = t;
      try { localStorage.theme = t; } catch (err) { /* ignore */ }
      return;
    }
    if (e.target.closest('[data-slip-open]')) { document.querySelector('[data-slip]')?.classList.add('open'); return; }
    if (e.target.closest('[data-slip-close]')) { document.querySelector('[data-slip]')?.classList.remove('open'); return; }
    const tog = e.target.closest('.advisor-toggle');
    if (tog) {
      if (matchMedia('(min-width:1040px)').matches) return;
      const panel = tog.closest('.advisor');
      const open = panel.classList.toggle('open');
      tog.setAttribute('aria-expanded', open ? 'true' : 'false');
      return;
    }
    const opt = e.target.closest('.mkt .opt');
    if (opt) {
      e.preventDefault();
      const form = opt.closest('form'), user = currentUser();
      const f = state.fixtures.find(x => x.id === +form.dataset.fid);
      if (!f || !user || opt.disabled) return;
      if (isPast(f) || f.home_score != null) { setFlash('error', 'Picks are locked — this match has kicked off.'); render(); return; }
      const market = form.market.value, sel = opt.value;
      if (!MK.list(f.markets).includes(market) || !MK.valid(market, sel)) return;
      const cur = state.picks.find(k => k.user_id === user.id && k.fixture_id === f.id && k.market === market);
      if (cur && cur.selection !== sel) { setFlash('error', `You already have ${MK.MARKETS[market].name}: ${MK.label(market, cur.selection)} on ${f.home_team} vs ${f.away_team}. Remove it from the slip before choosing another option.`); render(); return; }
      state.draft = state.draft || [];
      let selected = sel;
      if (cur && cur.selection === sel) {
        state.picks = state.picks.filter(k => k !== cur);
        state.draft = state.draft.filter(d => !(d.user_id === user.id && d.fixture_id === f.id && d.market === market));
        selected = null;
      } else {
        state.picks.push({ id: state.nextId++, user_id: user.id, fixture_id: f.id, market, selection: sel, status: null, points: null });
        state.draft.push({ user_id: user.id, fixture_id: f.id, market, selection: sel });
      }
      save();
      form.querySelectorAll('.opt').forEach(o => { const on = o.value === selected; o.classList.toggle('on', on); o.classList.toggle('in-slip', on); o.setAttribute('aria-pressed', on); });
      refreshAdvisor(); refreshSlip();
      return;
    }
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.closest('form')) return;
    if (btn.dataset.action === 'logout') { state.sessionUserId = null; save(); go('#/'); }
    if (btn.dataset.action === 'reset') {
      if (!confirm('Reset the demo to the original example fixtures and players? Predictions stored in this browser will be cleared.')) return;
      state = seed(); save();
      setFlash('success', 'Example data restored.');
      go('#/');
    }
    if (btn.dataset.action === 'login-as') {
      const u = state.users.find(x => x.id === +btn.dataset.id);
      if (u) enter(u, parse().params.get('next') || '');
    }
  });
  document.addEventListener('change', e => {
    if (e.target.id !== 'view-as') return;
    const v = e.target.value;
    state.sessionUserId = v ? +v : null;
    save();
    render();
  });
  document.addEventListener('submit', e => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement) || !form.closest('#app')) return;
    e.preventDefault();
    if (form.dataset.confirm && !confirm(form.dataset.confirm)) return;
    const action = form.dataset.action;
    if (action === 'save-fixture') onSaveFixture(form);
    else if (action === 'result') onResult(form);
    else if (action === 'clear-result') onClear(form);
    else if (action === 'delete-fixture') onDelete(form);
    else if (action === 'save-settings') onSettings(form);
    else if (action === 'toggle-admin') onToggle(form);
    else if (action === 'login') onLogin(form);
    else     if (action === 'signup') onSignup(form);
    else if (action === 'slip-remove') onSlipRemove(form);
    else if (action === 'slip-place') onSlipPlace(form);
  });
  document.addEventListener('input', e => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || !input.matches('[data-stake]')) return;
    const form = input.closest('form');
    const out = form?.querySelector('[data-return]');
    const mult = Number(form?.dataset.mult) || 0;
    if (out) out.textContent = String(Math.round((Number(input.value) || 0) * mult));
  });
  window.addEventListener('hashchange', () => render());
  setInterval(tick, 30000);
  state = load();
  render();
})();
