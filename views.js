const M = require('./public/markets.js');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hue = s => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const initials = n => String(n).replace(/\(.*?\)/g, '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 3).toUpperCase();
const badge = (n, sz = '') => `<span class="badge ${sz}" style="--h:${hue(n)}">${esc(initials(n))}</span>`;
const time = iso => `<time data-ts="${esc(iso)}">${esc(new Date(iso).toUTCString().slice(0, 22))}</time>`;
const isPast = f => Date.now() >= Date.parse(f.kickoff);
const ex = f => f.is_example ? '<span class="pill ghost" title="Demo data — delete from Admin">Example</span>' : '';
const empty = (icon, title, text, cta = '') => `<div class="empty card"><div class="empty-ico">${icon}</div><h3>${esc(title)}</h3><p class="muted">${esc(text)}</p>${cta}</div>`;
const ptsPill = p => p == null ? '<span class="pill">Pending</span>' : `<span class="pill ${p > 1 ? 'gold' : p > 0 ? 'green' : 'red'}">+${p} pts</span>`;

function layout({ title, body, user, flash, active }) {
  const nav = [['home', '/', 'Home'], ['fixtures', '/fixtures', 'Fixtures'], ['leaderboard', '/leaderboard', 'Leaderboard']];
  if (user) nav.push(['me', '/me', 'My picks']);
  if (user?.is_admin) nav.push(['admin', '/admin', 'Admin']);
  const links = nav.map(([k, h, l]) => `<a href="${h}" class="${k === active ? 'on' : ''}">${l}</a>`).join('');
  const icons = { home: '⌂', fixtures: '⚽', leaderboard: '🏆', me: '★', admin: '⚙' };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)} · Matchday</title><meta name="theme-color" content="#0b1020"><meta name="description" content="Predict scores, climb the leaderboard.">
<link rel="manifest" href="/manifest.json"><link rel="icon" href="/icons/icon-192.png"><link rel="apple-touch-icon" href="/icons/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="/styles.css"><script>document.documentElement.dataset.theme=localStorage.theme||(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark')</script></head>
<body><div class="bg"></div>
<header class="top"><div class="wrap row"><a href="/" class="brand"><img src="/icons/icon-192.png" alt=""><span>Matchday</span></a>
<nav class="desk">${links}</nav><div class="row gap">
<button class="icon-btn" id="theme" aria-label="Toggle theme">◐</button>
${user ? `<form method="post" action="/logout"><button class="btn ghost sm">Log out</button></form>` : `<a class="btn ghost sm" href="/login">Log in</a><a class="btn sm hide-sm" href="/signup">Join free</a>`}
</div></div></header>
<main class="wrap">${flash ? `<div class="toast ${flash.type}">${esc(flash.msg)}</div>` : ''}${body}</main>
<footer class="wrap muted small">© ${new Date().getFullYear()} Matchday Predictions · Just for fun — no gambling.</footer>
<nav class="tabbar">${nav.map(([k, h, l]) => `<a href="${h}" class="${k === active ? 'on' : ''}"><i>${icons[k]}</i>${l}</a>`).join('')}</nav>
<script src="/app.js" defer></script></body></html>`;
}

const fixtureCard = (f, pred, user, picks, s) => {
  const done = f.home_score != null, live = isPast(f), cs = M.list(f.markets).includes('CS');
  const mk = picks === false ? '' : M.render(f, picks || {}, { open: !!user && !done && !live, action: '/pick/' + f.id, pts: s?.markets });
  let action;
  if (done) action = `<div class="result"><b>${f.home_score}</b><span>FT</span><b>${f.away_score}</b></div>`;
  else action = `<div class="vs">${live ? '<span class="pill red pulse">Locked</span>' : '<span class="vs-txt">VS</span>'}</div>`;
  let form = '';
  if (!done && !live) form = user ? (!cs ? '' : `<div class="mkt-h cs-h"><span>Correct Score</span><span class="mkt-pts">${s?.exact ?? 5} pts</span></div><form method="post" action="/predict/${f.id}" class="predict">
    <input type="number" name="home" min="0" max="99" inputmode="numeric" required value="${pred?.home_goals ?? ''}" aria-label="${esc(f.home_team)} goals">
    <span class="dash">–</span><input type="number" name="away" min="0" max="99" inputmode="numeric" required value="${pred?.away_goals ?? ''}" aria-label="${esc(f.away_team)} goals">
    <button class="btn sm">${pred ? 'Update' : 'Predict'}</button></form>
    <div class="quick">${['1-0', '2-1', '1-1', '0-0', '1-2', '0-1'].map(s => `<button type="button" class="chip" data-q="${s}">${s}</button>`).join('')}</div>`)
    : `<a class="btn ghost sm block" href="/login?next=/fixtures">Log in to predict</a>`;
  const n = picks ? Object.keys(picks).length : 0;
  const yours = pred ? `<div class="yours">Correct score <b>${pred.home_goals} – ${pred.away_goals}</b> ${done ? ptsPill(pred.points) : ''}</div>` : (user && (live || done) && !n ? '<div class="yours muted">No prediction made</div>' : '');
  return `<article class="card fixture" id="f${f.id}"><div class="meta"><span class="pill">${esc(f.competition)}</span>${ex(f)}<span class="muted small">${time(f.kickoff)}${f.venue ? ' · ' + esc(f.venue) : ''}</span></div>
  <div class="teams"><div class="team">${badge(f.home_team, 'lg')}<span>${esc(f.home_team)}</span></div>${action}<div class="team">${badge(f.away_team, 'lg')}<span>${esc(f.away_team)}</span></div></div>
  ${done && f.ht_home != null ? `<div class="small muted center">HT ${f.ht_home} – ${f.ht_away}</div>` : ''}
  ${!done && !live ? `<div class="countdown small muted" data-kick="${esc(f.kickoff)}"></div>` : ''}${mk}${form}${yours}</article>`;
};

function home({ user, upcoming, results, top, stats, s }) {
  return `<section class="hero"><span class="pill glow">Season is live</span><h1>Call the score.<br><span class="grad">Own the table.</span></h1>
  <p class="lead muted">Pick from match result, double chance, over/under, GG/NG and more on every match — or nail the correct score for <b>${s.exact} pts</b>. Points only, bragging rights included.</p>
  <div class="row gap wrapr">${user ? `<a class="btn lg" href="/fixtures">Make predictions</a><a class="btn ghost lg" href="/me">My picks</a>` : `<a class="btn lg" href="/signup">Start predicting — free</a><a class="btn ghost lg" href="/fixtures">Browse fixtures</a>`}</div>
  <div class="stats">${[['Fixtures', stats.fixtures], ['Players', stats.players], ['Predictions', stats.preds]].map(([l, v]) => `<div><b data-count="${v}">${v}</b><span>${l}</span></div>`).join('')}</div></section>
  <div class="grid2"><section><div class="sec-h"><h2>Up next</h2><a href="/fixtures" class="link">All fixtures →</a></div>
  ${upcoming.length ? upcoming.map(f => fixtureCard(f, null, null, false).replace(/<form[\s\S]*?<\/form>|<a class="btn ghost sm block"[^>]*>[^<]*<\/a>|<div class="quick">[\s\S]*?<\/div>/g, '')).join('') : empty('📅', 'No upcoming fixtures', 'The admin will add the next round soon.')}</section>
  <section><div class="sec-h"><h2>Top predictors</h2><a href="/leaderboard" class="link">Full table →</a></div>
  <div class="card list">${top.length ? top.map((r, i) => `<div class="lrow"><span class="rank r${i + 1}">${i + 1}</span>${badge(r.name)}<span class="grow">${esc(r.name)}</span><b>${r.pts}</b><span class="muted small">pts</span></div>`).join('') : '<p class="muted pad">No players yet — be the first!</p>'}</div>
  <div class="sec-h"><h2>Latest results</h2></div>
  <div class="card list">${results.length ? results.map(f => `<div class="lrow">${badge(f.home_team, 'sm')}<span class="grow small">${esc(f.home_team)}</span><b class="score">${f.home_score} – ${f.away_score}</b><span class="grow small right">${esc(f.away_team)}</span>${badge(f.away_team, 'sm')}</div>`).join('') : '<p class="muted pad">Results will appear here after matches.</p>'}</div></section></div>`;
}

function fixtures({ fx, mine, picks = {}, user, tab, s }) {
  const up = fx.filter(f => f.home_score == null && !isPast(f)), lk = fx.filter(f => f.home_score == null && isPast(f)), res = fx.filter(f => f.home_score != null).reverse();
  const lists = { upcoming: up, live: lk, results: res };
  const cur = lists[tab] ? tab : 'upcoming';
  const tabs = [['upcoming', 'Upcoming', up.length], ['live', 'In play / awaiting', lk.length], ['results', 'Results', res.length]];
  const list = lists[cur];
  const groups = {}; list.forEach(f => (groups[f.competition] ||= []).push(f));
  return `<div class="page-h"><h1>Fixtures</h1><p class="muted">Tap an option in each market to pick it — tap again to remove. Picks lock at kickoff.</p></div>
  <div class="tabs">${tabs.map(([k, l, n]) => `<a href="?tab=${k}" class="${k === cur ? 'on' : ''}">${l} <span>${n}</span></a>`).join('')}</div>
  ${list.length ? Object.entries(groups).map(([c, l]) => `<h3 class="comp">${esc(c)}</h3><div class="cards">${l.map(f => fixtureCard(f, mine[f.id], user, picks[f.id], s)).join('')}</div>`).join('') : empty(cur === 'results' ? '📊' : '📅', cur === 'results' ? 'No results yet' : 'Nothing here right now', cur === 'upcoming' ? 'New fixtures will appear once the admin publishes them.' : 'Check back after kickoff.')}`;
}

function me({ user, rows, picks = [], rank, total, me }) {
  const settled = rows.filter(r => r.points != null).concat(picks.filter(k => k.status && k.status !== 'void'));
  const acc = settled.length ? Math.round(100 * settled.filter(r => r.points > 0).length / settled.length) : 0;
  const byF = {}; for (const r of rows) (byF[r.fixture_id] ||= { f: r, items: [] }).items.push({ m: 'Correct score', sel: `${r.home_goals}–${r.away_goals}`, pts: r.points, st: r.points == null ? null : r.points > 0 ? 'won' : 'lost' });
  for (const k of picks) (byF[k.fixture_id] ||= { f: k, items: [] }).items.push({ m: M.MARKETS[k.market]?.name || k.market, sel: M.label(k.market, k.selection), pts: k.points, st: k.status });
  const groups = Object.values(byF).sort((a, b) => Date.parse(b.f.kickoff) - Date.parse(a.f.kickoff));
  const stPill = i => i.st == null ? '<span class="pill xs">Pending</span>' : i.st === 'void' ? '<span class="pill xs">Void</span>' : i.st === 'won' || i.pts > 0 ? `<span class="pill green xs">+${i.pts}</span>` : '<span class="pill red xs">0</span>';
  return `<div class="page-h row between wrapr"><div class="row gap">${badge(user.name, 'xl')}<div><h1>${esc(user.name)}</h1><p class="muted">${esc(user.email)}</p></div></div></div>
  <div class="stats card"><div><b>${me?.pts ?? 0}</b><span>Points</span></div><div><b>${rank ? '#' + rank : '–'}</b><span>of ${total}</span></div><div><b>${acc}%</b><span>Accuracy</span></div><div><b>${me?.exact ?? 0}</b><span>Exact scores</span></div></div>
  <div class="sec-h"><h2>Prediction history</h2></div>
  ${groups.length ? `<div class="card list">${groups.map(({ f: r, items }) => { const tot = items.reduce((a, i) => a + (i.pts || 0), 0), pend = items.every(i => i.st == null);
  return `<div class="lrow hist"><div class="grow"><div class="small muted">${esc(r.competition)} · ${time(r.kickoff)}${r.home_score != null ? ` · FT <b>${r.home_score}–${r.away_score}</b>` : ''}</div><div class="row gap">${badge(r.home_team, 'sm')}<b>${esc(r.home_team)}</b><span class="muted">vs</span><b>${esc(r.away_team)}</b>${badge(r.away_team, 'sm')}</div>
  <div class="picklist">${items.map(i => `<span class="pk ${i.st || ''}"><span class="muted">${esc(i.m)}</span> <b>${esc(i.sel)}</b> ${stPill(i)}</span>`).join('')}</div></div>
  <div class="right">${ptsPill(pend ? null : tot)}</div></div>`; }).join('')}</div>`
    : empty('🎯', 'No predictions yet', 'Pick a fixture and call the score.', '<a class="btn" href="/fixtures">Go to fixtures</a>')}`;
}

function leaderboard({ rows, user, s }) {
  const pod = rows.slice(0, 3);
  return `<div class="page-h"><h1>Leaderboard</h1><p class="muted">Points from every market you pick · ${s.exact} pts for an exact score</p></div>
  ${rows.length ? `<div class="podium">${[1, 0, 2].filter(i => pod[i]).map(i => `<div class="pod p${i + 1}">${badge(pod[i].name, 'xl')}<b>${esc(pod[i].name)}</b><span class="pts">${pod[i].pts} pts</span><div class="step">${i + 1}</div></div>`).join('')}</div>
  <div class="card list">${rows.map((r, i) => `<div class="lrow ${user?.id === r.id ? 'me' : ''}"><span class="rank r${i + 1}">${i + 1}</span>${badge(r.name)}<span class="grow">${esc(r.name)}${user?.id === r.id ? ' <span class="pill green">You</span>' : ''}</span><span class="muted small hide-sm">${r.won} won · ${r.exact} exact · ${r.played} settled</span><b>${r.pts}</b></div>`).join('')}</div>`
    : empty('🏆', 'The table is empty', 'Sign up and make predictions to get on the board.', '<a class="btn" href="/signup">Join now</a>')}`;
}

function auth(mode, next) {
  const su = mode === 'signup';
  return `<div class="auth card"><img src="/icons/icon-192.png" class="auth-logo" alt=""><h1>${su ? 'Create your account' : 'Welcome back'}</h1><p class="muted">${su ? 'Free forever. Predict, compete, win bragging rights.' : 'Log in to make your predictions.'}</p>
  <form method="post" action="/${mode}" class="stack">${su ? '<label>Display name<input name="name" required maxlength="40" autocomplete="nickname"></label>' : ''}
  <label>Email<input type="email" name="email" required autocomplete="email"></label>
  <label>Password<input type="password" name="password" required ${su ? 'minlength="8" autocomplete="new-password"' : 'autocomplete="current-password"'}></label>
  <input type="hidden" name="next" value="${esc(next || '')}"><button class="btn lg block">${su ? 'Create account' : 'Log in'}</button></form>
  <p class="muted small center">${su ? 'Already have an account? <a class="link" href="/login">Log in</a>' : 'New here? <a class="link" href="/signup">Create an account</a>'}</p></div>`;
}

function admin({ fx, edit, s, counts }) {
  const v = k => esc(edit?.[k] ?? '');
  const form = `<form method="post" action="${edit ? '/admin/fixtures/' + edit.id : '/admin/fixtures'}" class="card stack admin-form" data-kickoff-form>
   <h3>${edit ? 'Edit fixture' : 'Add a fixture'}</h3>
   <div class="grid-2"><label>Home team<input name="home_team" required value="${v('home_team')}" placeholder="e.g. Arsenal"></label><label>Away team<input name="away_team" required value="${v('away_team')}" placeholder="e.g. Chelsea"></label></div>
   <div class="grid-2"><label>Competition<input name="competition" required value="${v('competition')}" placeholder="e.g. Premier League" list="comps"></label><label>Kickoff (your local time)<input type="datetime-local" name="kickoff" required data-iso="${v('kickoff')}"></label></div>
   <label>Venue <span class="muted">(optional)</span><input name="venue" value="${v('venue')}" placeholder="e.g. Emirates Stadium"></label>
   <fieldset class="mkt-pick"><legend>Markets players can pick</legend>${M.ORDER.map(k => `<label class="chk"><input type="checkbox" name="markets" value="${k}" ${M.list(edit?.markets).includes(k) ? 'checked' : ''}><span>${esc(M.MARKETS[k].name)}</span></label>`).join('')}</fieldset>
   <input type="hidden" name="kickoff_iso"><datalist id="comps">${[...new Set(fx.map(f => f.competition))].map(c => `<option value="${esc(c)}">`).join('')}</datalist>
   <div class="row gap"><button class="btn">${edit ? 'Save changes' : 'Add fixture'}</button>${edit ? '<a class="btn ghost" href="/admin">Cancel</a>' : ''}</div></form>`;
  const row = f => `<div class="lrow admin-row"><div class="grow"><div class="small muted">${esc(f.competition)} · ${time(f.kickoff)} ${ex(f)}</div><div class="row gap">${badge(f.home_team, 'sm')}<b>${esc(f.home_team)}</b><span class="muted">vs</span><b>${esc(f.away_team)}</b>${badge(f.away_team, 'sm')}</div><div class="small muted">${f.n} pick${f.n === 1 ? '' : 's'} · ${M.list(f.markets).map(k => M.MARKETS[k].short).join(' · ')}</div></div>
   <form method="post" action="/admin/fixtures/${f.id}/result" class="predict tight${M.list(f.markets).includes('HT1X2') ? ' ht' : ''}"><input type="number" name="home_score" min="0" max="99" value="${f.home_score ?? ''}" aria-label="Home score"><span class="dash">–</span><input type="number" name="away_score" min="0" max="99" value="${f.away_score ?? ''}" aria-label="Away score">${M.list(f.markets).includes('HT1X2') ? `<span class="small muted">HT</span><input type="number" name="ht_home" min="0" max="99" value="${f.ht_home ?? ''}" aria-label="Half-time home"><span class="dash">–</span><input type="number" name="ht_away" min="0" max="99" value="${f.ht_away ?? ''}" aria-label="Half-time away">` : ''}<button class="btn sm ${f.home_score != null ? 'ghost' : ''}">${f.home_score != null ? 'Update' : 'Set result'}</button></form>
   <div class="row gap"><a class="icon-btn" href="/admin?edit=${f.id}#top" title="Edit">✎</a>${f.home_score != null ? `<form method="post" action="/admin/fixtures/${f.id}/result"><input type="hidden" name="clear" value="1"><button class="icon-btn" title="Clear result">↺</button></form>` : ''}<form method="post" action="/admin/fixtures/${f.id}/delete" data-confirm="Delete this fixture and its predictions?"><button class="icon-btn danger" title="Delete">🗑</button></form></div></div>`;
  return `<div class="page-h row between wrapr" id="top"><div><h1>Admin</h1><p class="muted">Manage fixtures, results and scoring.</p></div><a class="btn ghost" href="/admin/users">Users (${counts.users})</a></div>
  <div class="grid2 admin-grid"><div>${form}
  <form method="post" action="/admin/settings" class="card stack"><h3>Scoring rules</h3><p class="muted small" style="margin:0">Points awarded when a pick wins. Draw No Bet is void (0) on a draw.</p><div class="grid-3">${Object.keys(s.markets).map(k => `<label>${esc(M.MARKETS[k].name)}<input type="number" name="pts_${k}" min="0" max="99" value="${s.markets[k]}"></label>`).join('')}<label>Correct score — exact<input type="number" name="points_exact" min="0" max="99" value="${s.exact}"></label><label>Correct score — right result<input type="number" name="points_outcome" min="0" max="99" value="${s.outcome}"></label></div><button class="btn ghost">Save & recalculate</button></form></div>
  <div><div class="sec-h"><h2>All fixtures</h2><span class="muted small">${fx.length} total</span></div>${fx.length ? `<div class="card list">${fx.map(row).join('')}</div>` : empty('📋', 'No fixtures yet', 'Add your first fixture using the form.')}</div></div>`;
}

function users({ users, me }) {
  return `<div class="page-h row between wrapr"><div><h1>Users</h1><p class="muted">${users.length} registered</p></div><a class="btn ghost" href="/admin">← Back to admin</a></div>
  <div class="card list">${users.map(u => `<div class="lrow">${badge(u.name)}<div class="grow"><b>${esc(u.name)}</b> ${u.is_admin ? '<span class="pill gold">Admin</span>' : ''}<div class="small muted">${esc(u.email)} · joined ${esc(u.created_at.slice(0, 10))}</div></div><span class="small muted hide-sm">${u.n} picks</span><b>${u.pts}</b><span class="muted small">pts</span>
  ${u.id !== me.id ? `<form method="post" action="/admin/users/${u.id}/toggle-admin"><button class="btn ghost sm">${u.is_admin ? 'Revoke admin' : 'Make admin'}</button></form>` : ''}</div>`).join('')}</div>`;
}
module.exports = { layout, home, fixtures, me, leaderboard, auth, admin, users, empty };
