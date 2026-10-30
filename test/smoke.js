// Smoke test: node test/smoke.js  (uses a throwaway DB)
const assert = require('assert'); const os = require('os'); const path = require('path'); const fs = require('fs');
const M = require('../public/markets.js');
const f = (h, a, hh, ha) => ({ home_score: h, away_score: a, ht_home: hh, ht_away: ha });
const t = (m, s, fx, want) => assert.strictEqual(M.settle(m, s, fx).status, want, `${m} ${s}`);
t('1X2', '1', f(2, 1), 'won'); t('1X2', 'X', f(2, 1), 'lost'); t('DC', '1X', f(1, 1), 'won'); t('DC', '12', f(1, 1), 'lost');
t('OU25', 'O', f(2, 1), 'won'); t('OU25', 'U', f(2, 1), 'lost'); t('OU05', 'U', f(0, 0), 'won'); t('OU35', 'O', f(2, 2), 'won');
t('BTTS', 'Y', f(1, 1), 'won'); t('BTTS', 'Y', f(3, 0), 'lost'); t('DNB', '1', f(1, 1), 'void'); t('DNB', '2', f(0, 1), 'won');
t('HT1X2', '1', f(2, 1, 1, 0), 'won'); t('HT1X2', '1', f(2, 1), 'void');
assert.strictEqual(M.settle('1X2', '1', { home_score: null, away_score: null }).status, null);
assert.strictEqual(M.settle('CS', '1-0', f(2, 1)).status, null);
assert.ok(!M.MARKETS.CS && !M.ORDER.includes('CS') && !M.DEFAULT.includes('CS'));
assert.deepStrictEqual(M.list(null), M.DEFAULT); assert.deepStrictEqual(M.list('CS,1X2,bogus'), ['1X2']);
// DB + migration: build an old-schema DB, then load the app's db module against it
const dbp = path.join(os.tmpdir(), `mp-smoke-${process.pid}.db`); [dbp, dbp + '-wal', dbp + '-shm'].forEach(p => fs.rmSync(p, { force: true }));
const Old = require('better-sqlite3')(dbp);
Old.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, is_admin INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE fixtures(id INTEGER PRIMARY KEY, home_team TEXT NOT NULL, away_team TEXT NOT NULL, competition TEXT NOT NULL, kickoff TEXT NOT NULL, venue TEXT, home_score INTEGER, away_score INTEGER, is_example INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE predictions(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, fixture_id INTEGER NOT NULL, home_goals INTEGER NOT NULL, away_goals INTEGER NOT NULL, points INTEGER, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, fixture_id));
CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT); INSERT INTO settings VALUES('points_exact','3'),('points_outcome','1');
INSERT INTO users(name,email,password_hash) VALUES('P','p@x.io','x'); INSERT INTO fixtures(home_team,away_team,competition,kickoff,home_score,away_score) VALUES('A','B','L','2020-01-01T00:00:00Z',2,1);
INSERT INTO predictions(user_id,fixture_id,home_goals,away_goals,points) VALUES(1,1,2,1,5);`); Old.close();
process.env.DB_PATH = dbp; process.env.ADMIN_PASSWORD = 'smoke-test-pw';
const D = require('../db');
assert.deepStrictEqual(Object.keys(D.settings()), ['markets']);
assert.ok(!('exact' in D.settings()) && !('outcome' in D.settings()));
assert.strictEqual(D.db.prepare('SELECT markets FROM fixtures').get().markets, M.DEFAULT.join(','));
const kept = D.db.prepare('SELECT home_goals,away_goals,points FROM predictions').get();
assert.deepStrictEqual(kept, { home_goals: 2, away_goals: 1, points: null });
D.db.prepare("INSERT INTO picks(user_id,fixture_id,market,selection) VALUES(1,1,'1X2','1'),(1,1,'BTTS','Y'),(1,1,'DNB','2')").run();
D.recompute(1);
assert.strictEqual(D.db.prepare('SELECT points FROM predictions').get().points, null);
const pk = Object.fromEntries(D.db.prepare('SELECT market,status,points FROM picks').all().map(r => [r.market, r]));
assert.deepStrictEqual([pk['1X2'].status, pk['1X2'].points, pk.BTTS.status, pk.DNB.status], ['won', 2, 'won', 'lost']);
// HTTP routes render
const app = require('../server'); const srv = app.listen(0, async () => {
  const base = `http://127.0.0.1:${srv.address().port}`;
  try { for (const u of ['/', '/fixtures', '/fixtures?tab=results', '/leaderboard', '/markets.js', '/healthz']) assert.strictEqual((await fetch(base + u)).status, 200, u);
    const pages = await Promise.all(['/', '/fixtures', '/fixtures?tab=results', '/leaderboard', '/markets.js'].map(async u => [u, await (await fetch(base + u)).text()]));
    for (const [u, html] of pages) assert.ok(!/correct score|exact score|points_exact|name="home"/i.test(html), u);
    assert.ok(pages.find(([u]) => u === '/fixtures?tab=results')[1].includes('class="mkts'));
    const V = require('../views');
    const adminHtml = V.admin({ fx: [{ id: 1, home_team: 'A', away_team: 'B', competition: 'L', kickoff: '2020-01-01T00:00:00Z', home_score: 2, away_score: 1, ht_home: 1, ht_away: 0, markets: '1X2,HT1X2,CS', n: 0 }], edit: { markets: '1X2,CS' }, s: D.settings(), counts: { users: 1 } });
    assert.ok(adminHtml.includes('name="home_score"') && adminHtml.includes('name="ht_home"'));
    assert.ok(!/correct score|exact score|points_exact|value="CS"/i.test(adminHtml));
    assert.ok(adminHtml.includes('Match Result') && adminHtml.includes('1st Half Result'));
    console.log('Smoke test passed ✓'); } catch (e) { console.error(e); process.exitCode = 1; }
  srv.close(); D.db.close(); [dbp, dbp + '-wal', dbp + '-shm'].forEach(p => fs.rmSync(p, { force: true }));
});
