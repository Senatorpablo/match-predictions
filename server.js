const express = require('express');
const cookieSession = require('cookie-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { db, settings, set, ensureAdmin, recompute, recomputeAll } = require('./db');
const V = require('./views');

ensureAdmin();
const secretFile = path.join(__dirname, 'data', '.session-secret');
const SECRET = process.env.SESSION_SECRET || (fs.existsSync(secretFile) ? fs.readFileSync(secretFile, 'utf8') : (() => { const s = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(secretFile, s, { mode: 0o600 }); return s; })());

const app = express();
app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
app.use(cookieSession({ name: 'mp_sess', keys: [SECRET], maxAge: 30 * 864e5, sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production' }));
app.use((req, res, next) => {
  req.user = req.session.uid ? db.prepare('SELECT id,name,email,is_admin FROM users WHERE id=?').get(req.session.uid) : null;
  res.locals.flash = req.session.flash; req.session.flash = null;
  res.page = (title, body, opts = {}) => res.send(V.layout({ title, body, user: req.user, flash: res.locals.flash, active: opts.active }));
  next();
});
const flash = (req, type, msg) => { req.session.flash = { type, msg }; };
const auth = (req, res, next) => req.user ? next() : res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
const admin = (req, res, next) => req.user?.is_admin ? next() : (req.user ? res.status(403).page('Forbidden', V.empty('🔒', 'Admins only', 'You need admin access to view this page.')) : res.redirect('/login?next=/admin'));
const locked = f => Date.now() >= Date.parse(f.kickoff);
const int = v => { const n = parseInt(v, 10); return Number.isInteger(n) && n >= 0 && n <= 99 ? n : null; };

const leaderboard = () => db.prepare(`SELECT u.id,u.name,COALESCE(SUM(p.points),0) pts,COUNT(p.points) played,
  SUM(CASE WHEN p.points=(SELECT value FROM settings WHERE key='points_exact') AND p.points>0 THEN 1 ELSE 0 END) exact
  FROM users u LEFT JOIN predictions p ON p.user_id=u.id WHERE u.is_admin=0 GROUP BY u.id ORDER BY pts DESC, exact DESC, u.name`).all();

app.get('/', (req, res) => {
  const upcoming = db.prepare(`SELECT * FROM fixtures WHERE kickoff > ? ORDER BY kickoff LIMIT 3`).all(new Date().toISOString());
  const results = db.prepare(`SELECT * FROM fixtures WHERE home_score IS NOT NULL ORDER BY kickoff DESC LIMIT 3`).all();
  const stats = { fixtures: db.prepare('SELECT COUNT(*) c FROM fixtures').get().c, players: db.prepare('SELECT COUNT(*) c FROM users WHERE is_admin=0').get().c, preds: db.prepare('SELECT COUNT(*) c FROM predictions').get().c };
  res.page('Home', V.home({ user: req.user, upcoming, results, top: leaderboard().slice(0, 5), stats, s: settings() }), { active: 'home' });
});

app.get('/fixtures', (req, res) => {
  const fx = db.prepare('SELECT * FROM fixtures ORDER BY kickoff').all();
  const mine = req.user ? Object.fromEntries(db.prepare('SELECT * FROM predictions WHERE user_id=?').all(req.user.id).map(p => [p.fixture_id, p])) : {};
  res.page('Fixtures', V.fixtures({ fx, mine, user: req.user, tab: req.query.tab || 'upcoming' }), { active: 'fixtures' });
});

app.post('/predict/:id', auth, (req, res) => {
  const f = db.prepare('SELECT * FROM fixtures WHERE id=?').get(req.params.id);
  if (!f) return res.status(404).page('Not found', V.empty('🤷', 'Fixture not found', ''));
  if (locked(f)) { flash(req, 'error', 'Predictions are locked — this match has kicked off.'); return res.status(423).redirect('/fixtures'); }
  const h = int(req.body.home), a = int(req.body.away);
  if (h == null || a == null) { flash(req, 'error', 'Enter a valid score (0–99).'); return res.redirect('/fixtures'); }
  db.prepare(`INSERT INTO predictions(user_id,fixture_id,home_goals,away_goals) VALUES(?,?,?,?)
    ON CONFLICT(user_id,fixture_id) DO UPDATE SET home_goals=excluded.home_goals,away_goals=excluded.away_goals,updated_at=CURRENT_TIMESTAMP`).run(req.user.id, f.id, h, a);
  flash(req, 'success', `Saved: ${f.home_team} ${h} – ${a} ${f.away_team}`);
  res.redirect('/fixtures#f' + f.id);
});

app.get('/me', auth, (req, res) => {
  const rows = db.prepare(`SELECT p.*,f.home_team,f.away_team,f.competition,f.kickoff,f.home_score,f.away_score FROM predictions p JOIN fixtures f ON f.id=p.fixture_id WHERE p.user_id=? ORDER BY f.kickoff DESC`).all(req.user.id);
  const lb = leaderboard(); const rank = lb.findIndex(r => r.id === req.user.id) + 1;
  res.page('My predictions', V.me({ user: req.user, rows, rank, total: lb.length, me: lb.find(r => r.id === req.user.id) }), { active: 'me' });
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
  req.session.uid = db.prepare('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)').run(name, email, bcrypt.hashSync(pw, 10)).lastInsertRowid;
  flash(req, 'success', `You're in, ${name}! Make your first prediction.`); res.redirect(safeNext(req.body.next));
});
app.post('/logout', (req, res) => { req.session = null; res.redirect('/'); });

// ---- Admin ----
app.get('/admin', admin, (req, res) => {
  const fx = db.prepare(`SELECT f.*,(SELECT COUNT(*) FROM predictions p WHERE p.fixture_id=f.id) n FROM fixtures f ORDER BY kickoff DESC`).all();
  const edit = req.query.edit ? db.prepare('SELECT * FROM fixtures WHERE id=?').get(req.query.edit) : null;
  res.page('Admin', V.admin({ fx, edit, s: settings(), counts: { users: db.prepare('SELECT COUNT(*) c FROM users').get().c } }), { active: 'admin' });
});
function readFixture(b) {
  const f = { home_team: String(b.home_team || '').trim(), away_team: String(b.away_team || '').trim(), competition: String(b.competition || '').trim(), venue: String(b.venue || '').trim() || null, kickoff: b.kickoff_iso || b.kickoff };
  const t = Date.parse(f.kickoff);
  if (!f.home_team || !f.away_team || !f.competition || isNaN(t)) return null;
  f.kickoff = new Date(t).toISOString(); return f;
}
app.post('/admin/fixtures', admin, (req, res) => {
  const f = readFixture(req.body); if (!f) { flash(req, 'error', 'Home team, away team, competition and kickoff are required.'); return res.redirect('/admin'); }
  db.prepare('INSERT INTO fixtures(home_team,away_team,competition,kickoff,venue) VALUES(@home_team,@away_team,@competition,@kickoff,@venue)').run(f);
  flash(req, 'success', `Fixture added: ${f.home_team} vs ${f.away_team}`); res.redirect('/admin');
});
app.post('/admin/fixtures/:id', admin, (req, res) => {
  const f = readFixture(req.body); if (!f) { flash(req, 'error', 'All required fields must be filled.'); return res.redirect('/admin?edit=' + req.params.id); }
  db.prepare('UPDATE fixtures SET home_team=@home_team,away_team=@away_team,competition=@competition,kickoff=@kickoff,venue=@venue WHERE id=@id').run({ ...f, id: req.params.id });
  flash(req, 'success', 'Fixture updated.'); res.redirect('/admin');
});
app.post('/admin/fixtures/:id/delete', admin, (req, res) => { db.prepare('DELETE FROM fixtures WHERE id=?').run(req.params.id); flash(req, 'success', 'Fixture deleted.'); res.redirect('/admin'); });
app.post('/admin/fixtures/:id/result', admin, (req, res) => {
  const clear = req.body.clear === '1'; const h = int(req.body.home_score), a = int(req.body.away_score);
  if (!clear && (h == null || a == null)) { flash(req, 'error', 'Enter both scores.'); return res.redirect('/admin'); }
  db.prepare('UPDATE fixtures SET home_score=?,away_score=? WHERE id=?').run(clear ? null : h, clear ? null : a, req.params.id);
  recompute(req.params.id); flash(req, 'success', clear ? 'Result cleared.' : 'Result saved — points updated.'); res.redirect('/admin');
});
app.post('/admin/settings', admin, (req, res) => {
  const e = int(req.body.points_exact), o = int(req.body.points_outcome);
  if (e == null || o == null) { flash(req, 'error', 'Points must be whole numbers.'); return res.redirect('/admin'); }
  set('points_exact', e); set('points_outcome', o); recomputeAll(); flash(req, 'success', 'Scoring updated and all points recalculated.'); res.redirect('/admin');
});
app.get('/admin/users', admin, (req, res) => {
  const users = db.prepare(`SELECT u.*,COUNT(p.id) n,COALESCE(SUM(p.points),0) pts FROM users u LEFT JOIN predictions p ON p.user_id=u.id GROUP BY u.id ORDER BY u.created_at DESC`).all();
  res.page('Users', V.users({ users, me: req.user }), { active: 'admin' });
});
app.post('/admin/users/:id/toggle-admin', admin, (req, res) => {
  if (+req.params.id === req.user.id) { flash(req, 'error', "You can't change your own admin status."); return res.redirect('/admin/users'); }
  db.prepare('UPDATE users SET is_admin=1-is_admin WHERE id=?').run(req.params.id); res.redirect('/admin/users');
});
app.get('/healthz', (req, res) => res.json({ ok: true }));
app.use((req, res) => res.status(404).page('Not found', V.empty('🧭', 'Page not found', 'That page wandered offside.', '<a class="btn" href="/">Back home</a>')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Matchday Predictions running on http://localhost:${PORT}`));
