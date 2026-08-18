# Forge — personal workout tracker with an AI coach

React + Vite frontend, Express backend, file-based persistence, and a server-side
proxy to the Anthropic API for weekly plans, form guides, and training analysis.

## Run locally

```bash
npm install
npm run build
ANTHROPIC_API_KEY=sk-ant-... APP_PASSWORD=yourpassword npm start
# open http://localhost:3000
```

For frontend development with hot reload, run `npm start` in one terminal and
`npm run dev` in another (the dev server proxies /api to port 3000).

## Deploy on Railway

1. **Put this folder in a GitHub repo** (or use the Railway CLI with `railway up`).

2. **Create the service**: Railway dashboard → New Project → Deploy from GitHub repo.
   Railway auto-detects Node, runs `npm install` + `npm run build`, then `npm start`.

3. **Set environment variables** (service → Variables):
   - `ANTHROPIC_API_KEY` — your key from the Anthropic Console. Required for the
     AI coach features. API usage is billed to your account.
   - `APP_PASSWORD` — pick any password. Without it the app (and your API key)
     is open to anyone who finds the URL. Strongly recommended.
   - `MODEL` — optional, defaults to `claude-sonnet-4-6`.

4. **Attach a volume for persistence**: service → right-click / settings →
   Attach Volume → mount path `/data`. This is where your workout log lives.
   Without a volume, data is wiped on every redeploy.

5. **Generate a domain**: service → Settings → Networking → Generate Domain.
   Open it, enter your APP_PASSWORD, and start training.

## Connect WHOOP (optional)

The coach can calibrate daily intensity to your recovery, sleep and strain.

1. Go to developer.whoop.com → Dashboard → create an App.
2. Add a Redirect URL: `https://YOUR-DOMAIN/api/whoop/callback` (must match exactly).
3. Request scopes: `offline`, `read:recovery`, `read:sleep`, `read:cycles`, `read:profile`.
4. Set env vars on Railway: `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, and
   `APP_URL` (e.g. `https://YOUR-DOMAIN`, no trailing slash).
5. Redeploy, open the app → You tab → Connect WHOOP, and approve.

Tokens are stored in `whoop.json` on your volume and refreshed automatically.
Recovery data is cached for 15 minutes and fed into weekly plans and the
coach's training analysis.

## Background auto-adjust

With WHOOP connected, the server checks every 30 minutes whether today's
recovery has synced. Once it has, it adjusts today's planned session in place
(yellow recovery: ~10% lighter; red: 20-30% lighter with gentler lift swaps;
green: untouched) — even if you never open the app. You'll see the ⚡ badge
and an Undo button on the Plan tab. Runs at most once per day.

Extra env vars:
- `TIMEZONE` — IANA name so "today" matches your day, e.g.
  `America/Argentina/Buenos_Aires`. Defaults to UTC.
- `AUTO_ADJUST` — set to `off` to disable the background scheduler.

## Architecture

- `src/App.jsx` — the whole UI (plan, log, history, stats, gamification).
- `server.js` — Express: serves the built frontend, stores data as JSON files
  in `/data` (or `./data` locally), and proxies `/api/claude` so your Anthropic
  key never reaches the browser.
- Data files: `forge.json` (profile, workouts, plan, insights, body log) and
  `exinfo.json` (cached exercise form guides).

## Notes

- Single-user by design. The password is a shared secret, not accounts.
- To back up your data, copy `forge.json` off the volume.
