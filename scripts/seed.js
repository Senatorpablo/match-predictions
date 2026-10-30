// Seeds EXAMPLE fixtures (clearly labelled) + a few demo users/predictions. Safe to re-run.
const bcrypt = require('bcryptjs');
const { db, ensureAdmin, recompute } = require('../db');
ensureAdmin();
if (db.prepare('SELECT COUNT(*) c FROM fixtures WHERE is_example=1').get().c) { console.log('Example data already present.'); process.exit(0); }
const day = 864e5, now = Date.now();
const iso = (d, h) => { const t = new Date(now + d * day); t.setUTCHours(h, 0, 0, 0); return t.toISOString(); };
const fx = [
  ['Arsenal','Chelsea','Premier League',-6,15,'Emirates Stadium',2,1],
  ['Real Madrid','Barcelona','La Liga',-4,20,'Santiago Bernabéu',1,1],
  ['Bayern Munich','Dortmund','Bundesliga',-2,17,'Allianz Arena',3,0],
  ['Liverpool','Man City','Premier League',1,16,'Anfield'],
  ['Inter','AC Milan','Serie A',2,19,'San Siro'],
  ['PSG','Marseille','Ligue 1',3,20,'Parc des Princes'],
  ['Tottenham','Newcastle','Premier League',4,14,'Tottenham Hotspur Stadium'],
  ['Atlético Madrid','Sevilla','La Liga',5,20,'Metropolitano'],
  ['Juventus','Napoli','Serie A',8,19,'Allianz Stadium'],
];
const ins = db.prepare('INSERT INTO fixtures(home_team,away_team,competition,kickoff,venue,home_score,away_score,is_example) VALUES(?,?,?,?,?,?,?,1)');
const ids = fx.map(f => ins.run(f[0], f[1], f[2], iso(f[3], f[4]), f[5], f[6] ?? null, f[7] ?? null).lastInsertRowid);
const users = [['Tunde (demo)','tunde@example.com'],['Amara (demo)','amara@example.com'],['Chris (demo)','chris@example.com']];
const pw = bcrypt.hashSync('demo1234', 10);
const uids = users.map(([n, e]) => db.prepare('INSERT OR IGNORE INTO users(name,email,password_hash) VALUES(?,?,?)').run(n, e, pw) && db.prepare('SELECT id FROM users WHERE email=?').get(e).id);
const picks = [[[2,1],[1,1],[2,0]],[[1,0],[2,1],[3,0]],[[0,2],[1,1],[1,1]]];
const pi = db.prepare('INSERT OR IGNORE INTO predictions(user_id,fixture_id,home_goals,away_goals) VALUES(?,?,?,?)');
uids.forEach((u, i) => picks[i].forEach(([h, a], j) => pi.run(u, ids[j], h, a)));
ids.slice(0, 3).forEach(recompute);
console.log(`Seeded ${ids.length} EXAMPLE fixtures and ${users.length} demo users (password: demo1234).`);
