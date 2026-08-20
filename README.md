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

## Reminders (push notifications)

Turn them on in the You tab → Reminders. Four nudges, each toggleable:

- **Training-day morning** — the day's focus and warm-up, at your chosen hour.
  Suppressed once the session is logged.
- **Monday weigh-in** — only if no bodyweight is logged that day.
- **Evening, not logged** — a poke if a training day is still empty.
- **Session adjusted** — fires when the background auto-adjust rewrites the day.

Nothing to configure: the server generates a VAPID key pair on first boot and
persists it to `vapid.json` on your volume. Set `VAPID_PUBLIC_KEY` /
`VAPID_PRIVATE_KEY` only if you want to pin your own pair, and `VAPID_SUBJECT`
(a `mailto:` or `https:` URL) if a push service asks for a contact.

**On iPhone, notifications only reach installed apps.** Share → Add to Home
Screen, open Forge from that icon, and the option appears. In a normal Safari
tab the browser doesn't expose push at all — the app says so rather than
offering a button that can't work.

The scheduler runs every 5 minutes and sends each reminder at most once per
local day (`TIMEZONE` decides when a day starts). Subscriptions the push
service reports as gone are dropped automatically; transient failures are kept
and retried.

## Architecture

- `src/App.jsx` — the UI (plan, log, history, stats, gamification).
- `src/lib/` — plan sanitising, progression, constraints, WHOOP signals, coach write-path.
- `server.js` — Express: serves the built frontend, stores data as JSON files
  in `/data` (or `./data` locally), and proxies `/api/claude` so your Anthropic
  key never reaches the browser.
- `push-rules.js` — decides which reminders are due. Kept pure and separate
  from the server so it can be tested without booting anything.
- `public/sw.js` — service worker: offline caching plus the push and
  notification-click handlers.
- Data files: `forge.json` (profile, workouts, plan, insights, body log),
  `exinfo.json` (cached exercise form guides), `vapid.json` (push keys),
  `push-subs.json`, `push-prefs.json` and `push-sent.json`.

## Tests

```bash
node test/strength-standards.mjs   # DOTS + standards maths, from the real App.jsx
node test/push-rules.mjs           # which reminders fire, and when they don't
node test/push-pruning.mjs         # dead subscriptions get dropped, flaky ones don't
node test/sw-behaviour.mjs         # the worker never pins the app to an old build
node test/photo-coverage.mjs       # exercise photo matcher
node test/coach-write.mjs          # auto-adjust / rewrite never touch logged days
node test/progression.mjs          # deterministic next-set rules
node test/plan-schema.mjs          # coach JSON is sanitised against constraints
node test/deload-whoop.mjs         # deload detection + strain budget
```

`photo-coverage` needs Babel: `npm i --no-save @babel/core @babel/preset-react
@babel/preset-env`. `push-pruning` needs a throwaway TLS cert, since web-push
refuses plain HTTP:

```bash
openssl req -x509 -newkey rsa:2048 -keyout /tmp/key.pem -out /tmp/cert.pem \
  -days 2 -nodes -subj /CN=localhost
```

It skips cleanly if the cert isn't there.

## Notes

- Single-user by design. The password is a shared secret, not accounts.
  Change it in the You tab — that writes `auth.json` and does not need a redeploy.
  After login the browser holds an httpOnly session cookie so the password is
  not sent on every request (`x-app-token` still works).
- Plan and delete snapshots live in `forge-history.json` (last 20). Undo last
  plan change from the Plan tab.
- Boot warns if `/data` is missing or not writable (`GET /api/health`).
- To back up your data, copy `forge.json` off the volume.
