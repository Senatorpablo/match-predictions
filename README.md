# Matchday Predictions ⚽

A clean, mobile-first match-prediction website that also installs as a phone app (PWA). Players pick markets on each match, and the admin manages fixtures and enters results. Points and the leaderboard update automatically.

**Stack:** Node.js 18+ (tested on Node 24), Express, SQLite (better-sqlite3), server-rendered HTML, vanilla JS. No paid services.

## Run it
```bash
npm install
npm run seed      # optional: EXAMPLE fixtures + 3 demo users (password demo1234)
npm start         # http://localhost:3000
```

## Admin account
The first time the app starts, it creates an admin:
- Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` before the first start, **or**
- leave them unset. The email is then `admin@matchday.local`, and a random password is saved to `data/admin-credentials.txt` (chmod 600).

Admins can promote other users from **Admin → Users**.

## Features
- Sign up and log in (bcrypt-hashed passwords, signed httpOnly session cookie)
- Fixtures sorted into Upcoming, In play and Results tabs. Players tap a market option until kickoff, when picks lock on the server.
- My picks shows history, points, rank and accuracy. The leaderboard has a podium.
- Admin can add, edit and delete fixtures (team, competition, local kickoff time, venue, which markets are open) and set or clear the final score. 1st Half Result also takes a half-time score. Points are recalculated automatically.
- Points per market are configurable. Changing them recalculates all points.
- Dark and light theme, Inter font, gradients, micro-animations, team initial badges and empty states
- PWA: `manifest.json`, service worker with offline page, and icons. To install, use "Add to Home Screen". HTTPS is required in production.

## Environment
| Var | Default | |
|---|---|---|
| PORT | 3000 | |
| ADMIN_EMAIL / ADMIN_PASSWORD | see above | used only when no admin exists yet |
| SESSION_SECRET | auto-generated in `data/.session-secret` | set it in production |
| DB_PATH | `data/app.db` | point it at a persistent disk |
| NODE_ENV=production | | marks cookies as Secure (requires HTTPS) |

To remove the demo data, delete the fixtures marked "Example" in Admin. For a clean slate, delete the `data/` folder.

## Hosting
Any Node host with a persistent disk works: Render (add a Disk), Railway or Fly.io (volume), or a small VPS with Caddy or Nginx for HTTPS plus pm2/systemd. Set `DB_PATH` on the volume, and set `SESSION_SECRET` and `NODE_ENV=production`.

## Markets (bookmaker-style picks, points only)
Each fixture can offer several markets; the admin ticks which ones when adding/editing a fixture
(default: Match Result 1X2, Double Chance, Over/Under 2.5, Both Teams To Score).
Available: 1X2, Double Chance (1X/12/X2), Over/Under 0.5/1.5/2.5/3.5, GG/NG, Draw No Bet (void on a draw),
1st Half Result (admin enters the HT score). The admin enters the final score to settle every open market.
Players pick those markets; they do not enter a scoreline.
Points per market are set in Admin → Scoring rules (defaults 1X2=2, DC=1, O/U=1, GG/NG=1, DNB=1, HT=2).
No odds and no money — it's a points game. Market logic lives in `public/markets.js` (shared with the static demo in `docs/`).
Existing databases are migrated automatically on start (new `picks` table and `markets`/`ht_*` columns). Older scoreline rows stay in the database but are not shown or scored.
Run `npm test` for the smoke test.
