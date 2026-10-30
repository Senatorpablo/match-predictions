# Matchday Predictions ⚽

A clean, mobile-first match-prediction website that also installs as a phone app (PWA). Players predict scores, and the admin manages fixtures and enters results. Points and the leaderboard update automatically.

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
- Fixtures sorted into Upcoming, In play and Results tabs. Players can predict or edit with quick-pick chips until kickoff, when predictions lock on the server.
- My picks shows history, points, rank, accuracy and exact scores. The leaderboard has a podium.
- Admin can add, edit and delete fixtures (team, competition, local kickoff time, venue) and set or clear results. Points are recalculated automatically.
- Configurable scoring (default: 3 for an exact score, 1 for the correct outcome). Changing it recalculates all points.
- Dark and light theme, Inter font, gradients, micro-animations, team initial badges and empty states
- PWA: `manifest.json`, service worker with offline page, and icons. To install, use "Add to Home Screen". HTTPS is required in production.

## Environment
| Var | Default | |
|---|---|---|
| PORT | 3000 | |
| ADMIN_EMAIL / ADMIN_PASSWORD | see above | used only when no admin exists yet |
| SESSION_SECRET | auto-generated in `data/.session-secret` | set it in production |
| DB_PATH | `data/app.db` | point it at a persistent disk |
| POINTS_EXACT / POINTS_OUTCOME | 3 / 1 | first-run defaults; change them later in Admin |
| NODE_ENV=production | | marks cookies as Secure (requires HTTPS) |

To remove the demo data, delete the fixtures marked "Example" in Admin. For a clean slate, delete the `data/` folder.

## Hosting
Any Node host with a persistent disk works: Render (add a Disk), Railway or Fly.io (volume), or a small VPS with Caddy or Nginx for HTTPS plus pm2/systemd. Set `DB_PATH` on the volume, and set `SESSION_SECRET` and `NODE_ENV=production`.
