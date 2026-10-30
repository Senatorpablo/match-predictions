const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const dir = path.join(__dirname, 'data'); fs.mkdirSync(dir, { recursive: true });
const db = new Database(process.env.DB_PATH || path.join(dir, 'app.db'));
db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, is_admin INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS fixtures(id INTEGER PRIMARY KEY, home_team TEXT NOT NULL, away_team TEXT NOT NULL, competition TEXT NOT NULL, kickoff TEXT NOT NULL, venue TEXT, home_score INTEGER, away_score INTEGER, is_example INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS predictions(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, fixture_id INTEGER NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE, home_goals INTEGER NOT NULL, away_goals INTEGER NOT NULL, points INTEGER, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, fixture_id));
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS picks(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, fixture_id INTEGER NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE, market TEXT NOT NULL, selection TEXT NOT NULL, status TEXT, points INTEGER, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, fixture_id, market));
`);
// Safe, additive migrations for existing databases (existing score predictions keep working as the Correct Score market).
const cols = db.prepare('PRAGMA table_info(fixtures)').all().map(c => c.name);
if (!cols.includes('markets')) db.exec(`ALTER TABLE fixtures ADD COLUMN markets TEXT`);
if (!cols.includes('ht_home')) db.exec(`ALTER TABLE fixtures ADD COLUMN ht_home INTEGER`);
if (!cols.includes('ht_away')) db.exec(`ALTER TABLE fixtures ADD COLUMN ht_away INTEGER`);
const M = require('./public/markets.js');
db.prepare('UPDATE fixtures SET markets=? WHERE markets IS NULL').run(M.DEFAULT.join(','));
const get = k => db.prepare('SELECT value FROM settings WHERE key=?').get(k)?.value;
const set = (k, v) => db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, String(v));
if (get('points_exact') == null) set('points_exact', process.env.POINTS_EXACT || 5);
if (get('points_outcome') == null) set('points_outcome', process.env.POINTS_OUTCOME || 1);
for (const k of M.ORDER) if (k !== 'CS' && get('pts_' + k) == null) set('pts_' + k, M.MARKETS[k].def);
const settings = () => { const markets = {}; for (const k of M.ORDER) if (k !== 'CS') markets[k] = +get('pts_' + k); return { exact: +get('points_exact'), outcome: +get('points_outcome'), markets }; };

function ensureAdmin() {
  const email = (process.env.ADMIN_EMAIL || 'admin@matchday.local').toLowerCase();
  if (db.prepare('SELECT 1 FROM users WHERE is_admin=1').get()) return null;
  let pw = process.env.ADMIN_PASSWORD, generated = false;
  if (!pw) { pw = crypto.randomBytes(9).toString('base64url'); generated = true; }
  const ex = db.prepare('SELECT id FROM users WHERE email=?').get(email);
  if (ex) db.prepare('UPDATE users SET is_admin=1, password_hash=? WHERE id=?').run(bcrypt.hashSync(pw, 10), ex.id);
  else db.prepare('INSERT INTO users(name,email,password_hash,is_admin) VALUES(?,?,?,1)').run('Admin', email, bcrypt.hashSync(pw, 10));
  if (generated) {
    const f = path.join(dir, 'admin-credentials.txt');
    fs.writeFileSync(f, `ADMIN_EMAIL=${email}\nADMIN_PASSWORD=${pw}\n`, { mode: 0o600 });
    console.log(`Admin created: ${email} — generated password saved to ${f}`);
  } else console.log(`Admin created: ${email}`);
}
const sign = n => Math.sign(n);
function scorePrediction(p, f, s = settings()) {
  if (f.home_score == null) return null;
  if (p.home_goals === f.home_score && p.away_goals === f.away_score) return s.exact;
  if (sign(p.home_goals - p.away_goals) === sign(f.home_score - f.away_score)) return s.outcome;
  return 0;
}
function recompute(fixtureId) {
  const f = db.prepare('SELECT * FROM fixtures WHERE id=?').get(fixtureId); if (!f) return;
  const s = settings(); const up = db.prepare('UPDATE predictions SET points=? WHERE id=?');
  const upk = db.prepare('UPDATE picks SET status=?,points=? WHERE id=?');
  db.transaction(() => {
    for (const p of db.prepare('SELECT * FROM predictions WHERE fixture_id=?').all(fixtureId)) up.run(scorePrediction(p, f, s), p.id);
    for (const k of db.prepare('SELECT * FROM picks WHERE fixture_id=?').all(fixtureId)) { const r = M.settle(k.market, k.selection, f, s.markets); upk.run(r.status, r.points, k.id); }
  })();
}
function recomputeAll() { for (const { id } of db.prepare('SELECT id FROM fixtures').all()) recompute(id); }
module.exports = { db, settings, set, ensureAdmin, recompute, recomputeAll, scorePrediction };
