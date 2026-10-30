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
// Safe, additive migrations. Older scoreline rows in `predictions` stay in the database but are never shown or scored.
const cols = db.prepare('PRAGMA table_info(fixtures)').all().map(c => c.name);
if (!cols.includes('markets')) db.exec(`ALTER TABLE fixtures ADD COLUMN markets TEXT`);
if (!cols.includes('ht_home')) db.exec(`ALTER TABLE fixtures ADD COLUMN ht_home INTEGER`);
if (!cols.includes('ht_away')) db.exec(`ALTER TABLE fixtures ADD COLUMN ht_away INTEGER`);
if (!cols.includes('home_form')) db.exec(`ALTER TABLE fixtures ADD COLUMN home_form TEXT`);
if (!cols.includes('away_form')) db.exec(`ALTER TABLE fixtures ADD COLUMN away_form TEXT`);
if (!cols.includes('home_strength')) db.exec(`ALTER TABLE fixtures ADD COLUMN home_strength INTEGER`);
if (!cols.includes('away_strength')) db.exec(`ALTER TABLE fixtures ADD COLUMN away_strength INTEGER`);
if (!cols.includes('option_odds')) db.exec(`ALTER TABLE fixtures ADD COLUMN option_odds TEXT`);
const ucols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
if (!ucols.includes('balance')) db.exec(`ALTER TABLE users ADD COLUMN balance INTEGER`);
db.exec(`
CREATE TABLE IF NOT EXISTS draft_legs(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, fixture_id INTEGER NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE, market TEXT NOT NULL, selection TEXT NOT NULL, PRIMARY KEY(user_id, fixture_id, market));
CREATE TABLE IF NOT EXISTS slips(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, stake INTEGER NOT NULL, combined_odds REAL NOT NULL, potential INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'open', payout INTEGER NOT NULL DEFAULT 0, credited INTEGER NOT NULL DEFAULT 0, placed_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS slip_legs(id INTEGER PRIMARY KEY, slip_id INTEGER NOT NULL REFERENCES slips(id) ON DELETE CASCADE, fixture_id INTEGER, market TEXT NOT NULL, selection TEXT NOT NULL, odds REAL NOT NULL, source TEXT NOT NULL, status TEXT, home_team TEXT, away_team TEXT, kickoff TEXT, UNIQUE(slip_id, fixture_id, market));
`);
const M = require('./public/markets.js');
const Tickets = require('./public/odds.js');
db.prepare('UPDATE fixtures SET markets=? WHERE markets IS NULL').run(M.DEFAULT.join(','));
db.prepare('UPDATE predictions SET points=NULL WHERE points IS NOT NULL').run();
const get = k => db.prepare('SELECT value FROM settings WHERE key=?').get(k)?.value;
const set = (k, v) => db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, String(v));
for (const k of M.ORDER) if (get('pts_' + k) == null) set('pts_' + k, M.MARKETS[k].def);
if (get('starting_balance') == null) set('starting_balance', 1000);
db.prepare('UPDATE users SET balance=? WHERE balance IS NULL').run(+get('starting_balance'));
const settings = () => { const markets = {}; for (const k of M.ORDER) markets[k] = +get('pts_' + k); return { markets, startingBalance: +get('starting_balance') || 1000 }; };

function ensureAdmin() {
  const email = (process.env.ADMIN_EMAIL || 'admin@matchday.local').toLowerCase();
  if (db.prepare('SELECT 1 FROM users WHERE is_admin=1').get()) return null;
  let pw = process.env.ADMIN_PASSWORD, generated = false;
  if (!pw) { pw = crypto.randomBytes(9).toString('base64url'); generated = true; }
  const ex = db.prepare('SELECT id FROM users WHERE email=?').get(email);
  if (ex) db.prepare('UPDATE users SET is_admin=1, password_hash=? WHERE id=?').run(bcrypt.hashSync(pw, 10), ex.id);
  else db.prepare('INSERT INTO users(name,email,password_hash,is_admin,balance) VALUES(?,?,?,1,?)').run('Admin', email, bcrypt.hashSync(pw, 10), +get('starting_balance') || 1000);
  if (generated) {
    const f = path.join(dir, 'admin-credentials.txt');
    fs.writeFileSync(f, `ADMIN_EMAIL=${email}\nADMIN_PASSWORD=${pw}\n`, { mode: 0o600 });
    console.log(`Admin created: ${email} — generated password saved to ${f}`);
  } else console.log(`Admin created: ${email}`);
}
function applySlip(id) {
  const slip = db.prepare('SELECT * FROM slips WHERE id=?').get(id); if (!slip) return;
  const legs = db.prepare('SELECT status,odds FROM slip_legs WHERE slip_id=?').all(id);
  const result = Tickets.settleTicket(slip.stake, legs);
  const payout = result.status === 'open' ? 0 : result.payout;
  const delta = payout - (slip.credited || 0);
  if (delta) db.prepare('UPDATE users SET balance = COALESCE(balance,0) + ? WHERE id=?').run(delta, slip.user_id);
  db.prepare('UPDATE slips SET status=?, payout=?, credited=? WHERE id=?').run(result.status, payout, payout, id);
}
function settleSlips(fixtureId) {
  const f = db.prepare('SELECT * FROM fixtures WHERE id=?').get(fixtureId); if (!f) return;
  const legs = db.prepare('SELECT * FROM slip_legs WHERE fixture_id=?').all(fixtureId);
  const ids = new Set();
  for (const leg of legs) {
    let status = 'pending';
    if (f.home_score != null) { const r = M.settle(leg.market, leg.selection, f, {}); status = r.status || 'pending'; }
    db.prepare('UPDATE slip_legs SET status=? WHERE id=?').run(status, leg.id);
    ids.add(leg.slip_id);
  }
  for (const id of ids) applySlip(id);
}
function voidFixtureLegs(fixtureId) {
  const ids = db.prepare('SELECT DISTINCT slip_id FROM slip_legs WHERE fixture_id=?').all(fixtureId);
  db.prepare(`UPDATE slip_legs SET status='void' WHERE fixture_id=?`).run(fixtureId);
  db.prepare('DELETE FROM draft_legs WHERE fixture_id=?').run(fixtureId);
  for (const { slip_id } of ids) applySlip(slip_id);
}
function recompute(fixtureId) {
  const f = db.prepare('SELECT * FROM fixtures WHERE id=?').get(fixtureId); if (!f) return;
  const s = settings(); const up = db.prepare('UPDATE predictions SET points=NULL WHERE id=?');
  const upk = db.prepare('UPDATE picks SET status=?,points=? WHERE id=?');
  db.transaction(() => {
    for (const p of db.prepare('SELECT id FROM predictions WHERE fixture_id=?').all(fixtureId)) up.run(p.id);
    for (const k of db.prepare('SELECT * FROM picks WHERE fixture_id=?').all(fixtureId)) { const r = M.settle(k.market, k.selection, f, s.markets); upk.run(r.status, r.points, k.id); }
    settleSlips(fixtureId);
  })();
}
function recomputeAll() { for (const { id } of db.prepare('SELECT id FROM fixtures').all()) recompute(id); }
module.exports = { db, settings, set, ensureAdmin, recompute, recomputeAll, voidFixtureLegs, applySlip };
