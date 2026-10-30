const express = require('express');
const cookieSession = require('cookie-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { db, settings, set, ensureAdmin, recompute, recomputeAll, voidFixtureLegs } = require('./db');
const V = require('./views');
const M = require('./public/markets.js');
const A = require('./public/advisor.js');
const O = require('./public/odds.js');
const odds = O.createOddsProvider({ assess: f => A.assess(f), env: process.env });

ensureAdmin();
const secretFile = path.join(__dirname, 'data', '.session-secret');
const SECRET = process.env.SESSION_SECRET || (fs.existsSync(secretFile) ? fs.readFileSync(secretFile, 'utf8') : (() => { const s = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(secretFile, s, { mode: 0o600 }); return s; })());

const app = express();
app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
app.use(cookieSession({ name: 'mp_sess', keys: [SECRET], maxAge: 30 * 864e5, sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production' }));
app.use((req, res, next) => {
  req.user = req.session.uid ? db.prepare('SELECT id,name,email,is_admin,COALESCE(balance,0) balance FROM users WHERE id=?').get(req.session.uid) : null;
  res.locals.flash = req.session.flash; req.session.flash = null;
  res.page = (title, body, opts = {}) => res.send(V.layout({ title, body, user: req.user, flash: res.locals.flash, active: opts.active }));
  next();
});
const flash = (req, type, msg) => { req.session.flash = { type, msg }; };
const auth = (req, res, next) => req.user ? next() : res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
const admin = (req, res, next) => req.user?.is_admin ? next() : (req.user ? res.status(403).page('Forbidden', V.empty('🔒', 'Admins only', 'You need admin access to view this page.')) : res.redirect('/login?next=/admin'));
const locked = f => Date.now() >= Date.parse(f.kickoff);
const int = v => { const n = parseInt(v, 10); return Number.isInteger(n) && n >= 0 && n <= 99 ? n : null; };

const leaderboard = () => db.prepare(`SELECT u.id,u.name,
  COALESCE((SELECT SUM(points) FROM picks WHERE user_id=u.id),0) pts,
  (SELECT COUNT(status) FROM picks WHERE user_id=u.id) played,
  (SELECT COUNT(*) FROM picks WHERE user_id=u.id AND status='won') won,
  (SELECT COUNT(*) FROM slips WHERE user_id=u.id AND status!='open') slip_n,
  COALESCE((SELECT SUM(payout - stake) FROM slips WHERE user_id=u.id AND status!='open'),0) slip_net
  FROM users u WHERE u.is_admin=0 ORDER BY pts DESC, won DESC, u.name`).all();
const picksFor = uid => { const o = {}; if (uid) for (const k of db.prepare('SELECT * FROM picks WHERE user_id=?').all(uid)) (o[k.fixture_id] ||= {})[k.market] = k; return o; };

app.get('/', (req, res) => {
  const upcoming = db.prepare(`SELECT * FROM fixtures WHERE kickoff > ? ORDER BY kickoff LIMIT 3`).all(new Date().toISOString());
  const results = db.prepare(`SELECT * FROM fixtures WHERE home_score IS NOT NULL ORDER BY kickoff DESC LIMIT 3`).all();
  const stats = { fixtures: db.prepare('SELECT COUNT(*) c FROM fixtures').get().c, players: db.prepare('SELECT COUNT(*) c FROM users WHERE is_admin=0').get().c, preds: db.prepare('SELECT COUNT(*) c FROM picks').get().c };
  res.page('Home', V.home({ user: req.user, upcoming, results, top: leaderboard().slice(0, 5), stats, s: settings() }), { active: 'home' });
});

const openSlip = uid => uid ? db.prepare(`SELECT k.market,k.selection,f.home_team,f.away_team,f.competition,f.kickoff,f.home_score,f.home_form,f.away_form,f.home_strength,f.away_strength,f.option_odds FROM picks k JOIN fixtures f ON f.id=k.fixture_id WHERE k.user_id=? AND f.home_score IS NULL ORDER BY f.kickoff,k.market`).all(uid) : [];
const draftMap = uid => { const o = {}; if (uid) for (const d of db.prepare('SELECT fixture_id,market,selection FROM draft_legs WHERE user_id=?').all(uid)) (o[d.fixture_id] ||= {})[d.market] = d.selection; return o; };
const draftLegs = uid => uid ? db.prepare(`SELECT d.fixture_id,d.market,d.selection,f.home_team,f.away_team,f.kickoff,f.home_score,f.home_form,f.away_form,f.home_strength,f.away_strength,f.option_odds FROM draft_legs d JOIN fixtures f ON f.id=d.fixture_id WHERE d.user_id=? ORDER BY f.kickoff,d.market`).all(uid).map(r => { const q = odds.quote(r, r.market, r.selection); return { ...r, decimal: q.decimal, source: q.source, marketName: M.MARKETS[r.market].name, selLabel: M.label(r.market, r.selection) }; }) : [];
const fresh = uid => db.prepare('SELECT id,name,email,is_admin,COALESCE(balance,0) balance FROM users WHERE id=?').get(uid);
app.get('/fixtures', (req, res) => {
  const fx = db.prepare('SELECT * FROM fixtures ORDER BY kickoff').all();
  const legs = draftLegs(req.user?.id);
  res.page('Fixtures', V.fixtures({ fx, picks: picksFor(req.user?.id), user: req.user, tab: req.query.tab || 'upcoming', s: settings(), slip: openSlip(req.user?.id), legs, draft: draftMap(req.user?.id), balance: req.user?.balance || 0 }), { active: 'fixtures' });
});

// One-tap market picks (1X2, DC, O/U, GG/NG, DNB, HT). Tapping the same option again removes it.
app.post('/pick/:id', auth, (req, res) => {
  const json = (req.get('accept') || '').includes('application/json');
  const fail = (code, msg) => json ? res.status(code).json({ ok: false, error: msg }) : (flash(req, 'error', msg), res.redirect('/fixtures'));
  const f = db.prepare('SELECT * FROM fixtures WHERE id=?').get(req.params.id);
  if (!f) return fail(404, 'Fixture not found.');
  if (locked(f) || f.home_score != null) return fail(423, 'Picks are locked — this match has kicked off.');
  const m = String(req.body.market || ''), sel = String(req.body.selection || '');
  if (!M.list(f.markets).includes(m) || !M.valid(m, sel)) return fail(400, 'That option is not available for this match.');
  const cur = db.prepare('SELECT * FROM picks WHERE user_id=? AND fixture_id=? AND market=?').get(req.user.id, f.id, m);
  if (cur && cur.selection !== sel) return fail(409, `You already have ${M.MARKETS[m].name}: ${M.label(m, cur.selection)} on ${f.home_team} vs ${f.away_team}. Remove it from the slip before choosing another option.`);
  let selected = sel;
  if (cur && cur.selection === sel) {
    db.prepare('DELETE FROM picks WHERE id=?').run(cur.id);
    db.prepare('DELETE FROM draft_legs WHERE user_id=? AND fixture_id=? AND market=?').run(req.user.id, f.id, m);
    selected = null;
  } else {
    db.prepare(`INSERT INTO picks(user_id,fixture_id,market,selection) VALUES(?,?,?,?) ON CONFLICT(user_id,fixture_id,market) DO UPDATE SET selection=excluded.selection,updated_at=CURRENT_TIMESTAMP`).run(req.user.id, f.id, m, sel);
    db.prepare(`INSERT INTO draft_legs(user_id,fixture_id,market,selection) VALUES(?,?,?,?) ON CONFLICT(user_id,fixture_id,market) DO UPDATE SET selection=excluded.selection`).run(req.user.id, f.id, m, sel);
  }
  const legs = draftLegs(req.user.id);
  if (json) return res.json({ ok: true, market: m, selection: selected, advisor: A.render({ loggedIn: true, picks: openSlip(req.user.id), ticket: legs }), slip: O.renderSlip({ loggedIn: true, balance: fresh(req.user.id).balance, legs }) });
  flash(req, 'success', selected ? `Picked ${M.MARKETS[m].name}: ${M.label(m, sel)}` : 'Pick removed.');
  res.redirect('/fixtures#f' + f.id);
});

app.get('/me', auth, (req, res) => {
  const lb = leaderboard(); const rank = lb.findIndex(r => r.id === req.user.id) + 1;
  const picks = db.prepare(`SELECT k.*,f.home_team,f.away_team,f.competition,f.kickoff,f.home_score,f.away_score FROM picks k JOIN fixtures f ON f.id=k.fixture_id WHERE k.user_id=? ORDER BY f.kickoff DESC`).all(req.user.id);
  const legs = draftLegs(req.user.id);
  res.page('My picks', V.me({ user: req.user, picks, rank, total: lb.length, me: lb.find(r => r.id === req.user.id), slip: openSlip(req.user.id), legs, balance: req.user.balance }), { active: 'me' });
});

app.post('/slip/remove', auth, (req, res) => {
  const json = (req.get('accept') || '').includes('application/json');
  const fid = req.body.fixture_id, m = String(req.body.market || '');
  db.prepare('DELETE FROM draft_legs WHERE user_id=? AND fixture_id=? AND market=?').run(req.user.id, fid, m);
  db.prepare('DELETE FROM picks WHERE user_id=? AND fixture_id=? AND market=?').run(req.user.id, fid, m);
  const legs = draftLegs(req.user.id);
  if (json) return res.json({ ok: true, advisor: A.render({ loggedIn: true, picks: openSlip(req.user.id), ticket: legs }), slip: O.renderSlip({ loggedIn: true, balance: fresh(req.user.id).balance, legs }) });
  flash(req, 'success', 'Removed from the slip.');
  res.redirect('/fixtures');
});
app.post('/slip/place', auth, (req, res) => {
  const json = (req.get('accept') || '').includes('application/json');
  const fail = (code, msg) => json ? res.status(code).json({ ok: false, error: msg }) : (flash(req, 'error', msg), res.redirect('/slips'));
  const legs = draftLegs(req.user.id);
  if (!legs.length) return fail(400, 'Your slip is empty.');
  if (legs.some(l => locked(l) || l.home_score != null)) return fail(423, 'The earliest match on this slip has kicked off, so it can no longer be placed.');
  const stake = parseInt(req.body.stake, 10);
  const bal = fresh(req.user.id).balance;
  if (!Number.isInteger(stake) || stake < 1) return fail(400, 'Enter a whole stake of at least 1 point.');
  if (stake > bal) return fail(400, `You only have ${bal} points to stake.`);
  const mult = O.product(legs.map(l => l.decimal));
  const potential = Math.round(stake * mult);
  db.transaction(() => {
    db.prepare('UPDATE users SET balance = balance - ? WHERE id=?').run(stake, req.user.id);
    const id = db.prepare('INSERT INTO slips(user_id,stake,combined_odds,potential) VALUES(?,?,?,?)').run(req.user.id, stake, mult, potential).lastInsertRowid;
    const ins = db.prepare('INSERT INTO slip_legs(slip_id,fixture_id,market,selection,odds,source,status,home_team,away_team,kickoff) VALUES(?,?,?,?,?,?,?,?,?,?)');
    for (const l of legs) ins.run(id, l.fixture_id, l.market, l.selection, l.decimal, l.source, 'pending', l.home_team, l.away_team, l.kickoff);
    db.prepare('DELETE FROM draft_legs WHERE user_id=?').run(req.user.id);
  })();
  flash(req, 'success', `Slip placed. ${stake} points staked at ${mult.toFixed(2)}×.`);
  if (json) return res.json({ ok: true, balance: fresh(req.user.id).balance });
  res.redirect('/slips');
});
app.get('/slips', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM slips WHERE user_id=? ORDER BY id DESC').all(req.user.id);
  for (const s of rows) s.legs = db.prepare('SELECT * FROM slip_legs WHERE slip_id=? ORDER BY kickoff,market').all(s.id);
  const legs = draftLegs(req.user.id);
  res.page('Slips', V.slips({ user: fresh(req.user.id), rows, legs, slip: openSlip(req.user.id) }), { active: 'slips' });
});

app.get('/leaderboard', (req, res) => res.page('Leaderboard', V.leaderboard({ rows: leaderboard(), user: req.user, s: settings() }), { active: 'leaderboard' }));

app.get('/login', (req, res) => res.page('Log in', V.auth('login', req.query.next)));
app.get('/signup', (req, res) => res.page('Sign up', V.auth('signup', req.query.next)));
const safeNext = n => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//')) ? n : '/fixtures';
app.post('/login', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(String(req.body.email || '').trim().toLowerCase());
  if (!u || !bcrypt.compareSync(String(req.body.password || ''), u.password_hash)) { flash(req, 'error', 'Invalid email or password.'); return res.redirect('/login'); }
  req.session.uid = u.id; flash(req, 'success', `Welcome back, ${u.name.split(' ')[0]}!`);
  res.redirect(u.is_admin && !req.body.next ? '/admin' : safeNext(req.body.next));
});
app.post('/signup', (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 40), email = String(req.body.email || '').trim().toLowerCase(), pw = String(req.body.password || '');
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || pw.length < 8) { flash(req, 'error', 'Please enter a name, a valid email and a password of at least 8 characters.'); return res.redirect('/signup'); }
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) { flash(req, 'error', 'An account with that email already exists.'); return res.redirect('/signup'); }
  req.session.uid = db.prepare('INSERT INTO users(name,email,password_hash,balance) VALUES(?,?,?,?)').run(name, email, bcrypt.hashSync(pw, 10), settings().startingBalance).lastInsertRowid;
  flash(req, 'success', `You're in, ${name}! Make your first prediction.`); res.redirect(safeNext(req.body.next));
});
app.post('/logout', (req, res) => { req.session = null; res.redirect('/'); });

// ---- Admin ----
app.get('/admin', admin, (req, res) => {
  const fx = db.prepare(`SELECT f.*,(SELECT COUNT(*) FROM picks k WHERE k.fixture_id=f.id) n FROM fixtures f ORDER BY kickoff DESC`).all();
  const edit = req.query.edit ? db.prepare('SELECT * FROM fixtures WHERE id=?').get(req.query.edit) : null;
  res.page('Admin', V.admin({ fx, edit, s: settings(), counts: { users: db.prepare('SELECT COUNT(*) c FROM users').get().c } }), { active: 'admin' });
});
function readFixture(b) {
  const f = { home_team: String(b.home_team || '').trim(), away_team: String(b.away_team || '').trim(), competition: String(b.competition || '').trim(), venue: String(b.venue || '').trim() || null, kickoff: b.kickoff_iso || b.kickoff, markets: M.list([].concat(b.markets || []).join(',')).join(',') };
  const t = Date.parse(f.kickoff);
  if (!f.home_team || !f.away_team || !f.competition || isNaN(t)) return null;
  const hs = A.cleanStrength(b.home_strength), as = A.cleanStrength(b.away_strength);
  if (hs === false || as === false) return { error: 'Strength must be a whole number from 1 to 10, or left blank.' };
  f.kickoff = new Date(t).toISOString();
  const priced = O.collectAdminOdds(k => b[k], M.ORDER, M.MARKETS);
  if (priced.error) return priced;
  f.home_form = A.cleanForm(b.home_form); f.away_form = A.cleanForm(b.away_form);
  f.home_strength = hs; f.away_strength = as;
  f.option_odds = priced.json;
  return f;
}
app.post('/admin/fixtures', admin, (req, res) => {
  const f = readFixture(req.body); if (!f || f.error) { flash(req, 'error', f?.error || 'Home team, away team, competition and kickoff are required.'); return res.redirect('/admin'); }
  db.prepare('INSERT INTO fixtures(home_team,away_team,competition,kickoff,venue,markets,home_form,away_form,home_strength,away_strength,option_odds) VALUES(@home_team,@away_team,@competition,@kickoff,@venue,@markets,@home_form,@away_form,@home_strength,@away_strength,@option_odds)').run(f);
  flash(req, 'success', `Fixture added: ${f.home_team} vs ${f.away_team}`); res.redirect('/admin');
});
app.post('/admin/fixtures/:id', admin, (req, res) => {
  const f = readFixture(req.body); if (!f || f.error) { flash(req, 'error', f?.error || 'All required fields must be filled.'); return res.redirect('/admin?edit=' + req.params.id); }
  db.prepare('UPDATE fixtures SET home_team=@home_team,away_team=@away_team,competition=@competition,kickoff=@kickoff,venue=@venue,markets=@markets,home_form=@home_form,away_form=@away_form,home_strength=@home_strength,away_strength=@away_strength,option_odds=@option_odds WHERE id=@id').run({ ...f, id: req.params.id });
  recompute(req.params.id);
  flash(req, 'success', 'Fixture updated.'); res.redirect('/admin');
});
app.post('/admin/fixtures/:id/delete', admin, (req, res) => { voidFixtureLegs(req.params.id); db.prepare('DELETE FROM fixtures WHERE id=?').run(req.params.id); flash(req, 'success', 'Fixture deleted.'); res.redirect('/admin'); });
app.post('/admin/fixtures/:id/result', admin, (req, res) => {
  const clear = req.body.clear === '1'; const h = int(req.body.home_score), a = int(req.body.away_score);
  if (!clear && (h == null || a == null)) { flash(req, 'error', 'Enter both scores.'); return res.redirect('/admin'); }
  const hh = int(req.body.ht_home), ha = int(req.body.ht_away), ht = !clear && hh != null && ha != null;
  if (ht && (hh > h || ha > a)) { flash(req, 'error', 'Half-time goals cannot exceed full-time goals.'); return res.redirect('/admin'); }
  db.prepare('UPDATE fixtures SET home_score=?,away_score=?,ht_home=?,ht_away=? WHERE id=?').run(clear ? null : h, clear ? null : a, ht ? hh : null, ht ? ha : null, req.params.id);
  recompute(req.params.id); flash(req, 'success', clear ? 'Result cleared.' : 'Result saved — points updated.'); res.redirect('/admin');
});
app.post('/admin/settings', admin, (req, res) => {
  const mk = {}; for (const k of Object.keys(settings().markets)) { mk[k] = int(req.body['pts_' + k]); if (mk[k] == null) { flash(req, 'error', 'Points must be whole numbers.'); return res.redirect('/admin'); } }
  const start = parseInt(req.body.starting_balance, 10);
  if (!Number.isInteger(start) || start < 1 || start > 100000) { flash(req, 'error', 'Starting balance must be a whole number from 1 to 100000.'); return res.redirect('/admin'); }
  for (const k in mk) set('pts_' + k, mk[k]); set('starting_balance', start); recomputeAll(); flash(req, 'success', 'Scoring updated and all points recalculated.'); res.redirect('/admin');
});
app.get('/admin/users', admin, (req, res) => {
  const users = db.prepare(`SELECT u.*,(SELECT COUNT(*) FROM picks WHERE user_id=u.id) n,COALESCE((SELECT SUM(points) FROM picks WHERE user_id=u.id),0) pts FROM users u ORDER BY u.created_at DESC`).all();
  res.page('Users', V.users({ users, me: req.user }), { active: 'admin' });
});
app.post('/admin/users/:id/toggle-admin', admin, (req, res) => {
  if (+req.params.id === req.user.id) { flash(req, 'error', "You can't change your own admin status."); return res.redirect('/admin/users'); }
  db.prepare('UPDATE users SET is_admin=1-is_admin WHERE id=?').run(req.params.id); res.redirect('/admin/users');
});
app.get('/healthz', (req, res) => res.json({ ok: true }));
app.use((req, res) => res.status(404).page('Not found', V.empty('🧭', 'Page not found', 'That page wandered offside.', '<a class="btn" href="/">Back home</a>')));

module.exports = app;
const PORT = process.env.PORT || 3000;
if (require.main === module) app.listen(PORT, () => console.log(`Matchday Predictions running on http://localhost:${PORT}`));
