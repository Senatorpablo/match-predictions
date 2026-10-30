// Seeds EXAMPLE fixtures (clearly labelled) + a few demo users and market picks. Safe to re-run.
const bcrypt = require('bcryptjs');
const { db, ensureAdmin, recompute } = require('../db');
ensureAdmin();
if (db.prepare('SELECT COUNT(*) c FROM fixtures WHERE is_example=1').get().c) { console.log('Example data already present.'); process.exit(0); }
const day = 864e5, now = Date.now();
const iso = (d, h) => { const t = new Date(now + d * day); t.setUTCHours(h, 0, 0, 0); return t.toISOString(); };
const fx = [
  ['Arsenal','Chelsea','Premier League',-6,15,'Emirates Stadium',2,1,1,0],
  ['Real Madrid','Barcelona','La Liga',-4,20,'Santiago Bernabéu',1,1,0,1],
  ['Bayern Munich','Dortmund','Bundesliga',-2,17,'Allianz Arena',3,0,2,0],
  ['Liverpool','Man City','Premier League',1,16,'Anfield'],
  ['Inter','AC Milan','Serie A',2,19,'San Siro'],
  ['PSG','Marseille','Ligue 1',3,20,'Parc des Princes'],
  ['Tottenham','Newcastle','Premier League',4,14,'Tottenham Hotspur Stadium'],
  ['Atlético Madrid','Sevilla','La Liga',5,20,'Metropolitano'],
  ['Juventus','Napoli','Serie A',8,19,'Allianz Stadium'],
];
const ALL = '1X2,DC,OU15,OU25,OU35,BTTS,DNB,HT1X2', DEF = '1X2,DC,OU25,BTTS';
const mk = i => [ALL, ALL, ALL, ALL, DEF, '1X2,DC,OU05,OU25,BTTS,DNB', DEF, '1X2,OU25,BTTS', DEF][i];
const forms = [['WWDLW','LDWLL',8,4],['WDLWD','WDLWD',6,6],['WWWWD','LLLLD',9,3],['WDWLW','DWLLD',7,5],[null,null,null,null],['DLLWW','WWLDW',4,8],['DWDWL','LWDWL',5,5],['WWWWW','LLLLL',9,2],['WLWDW','DLWDL',6,6]];
const ins = db.prepare('INSERT INTO fixtures(home_team,away_team,competition,kickoff,venue,home_score,away_score,ht_home,ht_away,markets,home_form,away_form,home_strength,away_strength,is_example) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)');
const ids = fx.map((f, i) => ins.run(f[0], f[1], f[2], iso(f[3], f[4]), f[5], f[6] ?? null, f[7] ?? null, f[8] ?? null, f[9] ?? null, mk(i), forms[i][0], forms[i][1], forms[i][2], forms[i][3]).lastInsertRowid);
const users = [['Tunde (demo)','tunde@example.com'],['Amara (demo)','amara@example.com'],['Chris (demo)','chris@example.com']];
const pw = bcrypt.hashSync('demo1234', 10);
const uids = users.map(([n, e]) => db.prepare('INSERT OR IGNORE INTO users(name,email,password_hash) VALUES(?,?,?)').run(n, e, pw) && db.prepare('SELECT id FROM users WHERE email=?').get(e).id);
// Market picks: [fixtureIndex, market, selection] per demo user
const mp = [
  [[0,'1X2','1'],[0,'OU25','O'],[0,'BTTS','Y'],[1,'DNB','1'],[1,'DC','X2'],[1,'HT1X2','X'],[2,'1X2','1'],[2,'BTTS','N'],[3,'1X2','X'],[3,'OU25','O']],
  [[0,'DC','1X'],[0,'OU35','U'],[1,'1X2','X'],[1,'BTTS','Y'],[2,'OU25','O'],[2,'HT1X2','1'],[3,'BTTS','Y'],[4,'DC','1X']],
  [[0,'1X2','2'],[0,'BTTS','N'],[1,'OU15','O'],[1,'DNB','2'],[2,'DC','1X'],[2,'OU35','U'],[3,'1X2','2']],
];
const kp = db.prepare('INSERT OR IGNORE INTO picks(user_id,fixture_id,market,selection) VALUES(?,?,?,?)');
uids.forEach((u, i) => mp[i].forEach(([j, m, s]) => kp.run(u, ids[j], m, s)));
ids.slice(0, 3).forEach(recompute);
console.log(`Seeded ${ids.length} EXAMPLE fixtures and ${users.length} demo users (password: demo1234).`);
