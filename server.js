import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import webpush from "web-push";
import { dueReminders, DEFAULT_PUSH_PREFS } from "./push-rules.js";
import { canAutoAdjust, applyAutoAdjust } from "./src/lib/coach-write.js";
import { sanitizePlan } from "./src/lib/plan-schema.js";
import { adjustReason } from "./src/lib/whoop-signal.js";
import { constraintBlock } from "./src/lib/constraints.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "4mb" }));

/* ---- persistence: JSON files on a mounted volume ----
   On Railway, attach a volume mounted at /data so your log
   survives restarts and redeploys. Falls back to ./data locally. */
const VOLUME_MOUNTED = fs.existsSync("/data");
const DATA_DIR =
  process.env.DATA_DIR || (VOLUME_MOUNTED ? "/data" : path.join(__dirname, "data"));
let dataDirWritable = true;
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, ".write-check"), String(Date.now()));
} catch (e) {
  dataDirWritable = false;
  console.error("[data] DATA_DIR is not writable:", DATA_DIR, String(e.message || e));
}
const fileFor = (name) => path.join(DATA_DIR, name);
const readJson = (f, fallback) => {
  try { return JSON.parse(fs.readFileSync(fileFor(f), "utf8")); } catch { return fallback; }
};
const writeJson = (f, data) => {
  if (!dataDirWritable) throw new Error("data directory is not writable");
  const tmp = fileFor(f + ".tmp");
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, fileFor(f)); // atomic-ish write
};

/* ---- users: multi-user accounts on the volume ----
   users.json: { users: [{id,name,hash,salt,admin,...}], sessions: [{token,userId,exp,at}] }
   The first boot after this upgrade migrates the single-user install:
   the existing password becomes the admin account and every per-user data
   file moves into users/<id>/. Shared files (vapid.json, exinfo.json,
   users.json) stay at the volume root. */
const MAX_USERS = 6;
const AI_DAILY_LIMIT = 3;
const hashPassword = (pw, salt) => crypto.scryptSync(String(pw), salt, 32).toString("hex");
const newUserId = () => crypto.randomBytes(6).toString("hex");
const usersFile = () => readJson("users.json", { users: [], sessions: [] });
const saveUsers = (store) => writeJson("users.json", store);
const userDir = (id) => path.join(DATA_DIR, "users", String(id));
const userPath = (id, name) => path.join(userDir(id), name);
const readUserJson = (id, f, fallback) => {
  try { return JSON.parse(fs.readFileSync(userPath(id, f), "utf8")); } catch { return fallback; }
};
const writeUserJson = (id, f, data) => {
  if (!dataDirWritable) throw new Error("data directory is not writable");
  fs.mkdirSync(userDir(id), { recursive: true });
  const tmp = userPath(id, f + ".tmp");
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, userPath(id, f)); // atomic-ish write
};
const verifyPassword = (user, pw) => {
  if (!user) return false;
  if (!user.hash) return true; // install was never password-protected
  try {
    return crypto.timingSafeEqual(
      Buffer.from(user.hash, "hex"),
      Buffer.from(hashPassword(String(pw).trim(), user.salt), "hex")
    );
  } catch (e) { return false; }
};

/* one-time migration from the single-user layout */
const USER_DATA_FILES = [
  "forge.json", "forge-history.json", "whoop.json", "whoop-state.json",
  "whoop-history.json", "push-subs.json", "push-prefs.json", "push-sent.json",
  "ai-usage.json",
];
(function migrateSingleUser() {
  if (!dataDirWritable) return;
  const store = usersFile();
  if (store.users && store.users.length) return; // already migrated
  const legacyAuth = readJson("auth.json", {});
  const pw = String(legacyAuth.password || process.env.APP_PASSWORD || "").trim();
  const salt = crypto.randomBytes(16).toString("hex");
  const admin = {
    id: newUserId(),
    name: (process.env.ADMIN_NAME || "Milst").trim(),
    admin: true,
    salt,
    hash: pw ? hashPassword(pw, salt) : "",
    createdAt: Date.now(),
    lastLogin: null,
  };
  fs.mkdirSync(userDir(admin.id), { recursive: true });
  let moved = 0;
  for (const f of USER_DATA_FILES) {
    try {
      if (fs.existsSync(fileFor(f))) { fs.renameSync(fileFor(f), userPath(admin.id, f)); moved++; }
    } catch (e) { console.error("[migrate] could not move", f, String(e.message || e)); }
  }
  saveUsers({ users: [admin], sessions: [] });
  console.log(`[migrate] single-user install -> multi-user: ${moved} file(s) moved to users/${admin.id} (admin: ${admin.name})`);
})();

/* ---- auth: per-user password, session cookie, x-app-token fallback ----
   The x-app-token header carries "<userId>:<password>" percent-encoded
   (HTTP headers can't hold non-ASCII). It exists for browsers that drop
   cookies in installed PWAs. */
const OPEN_PATHS = new Set(["/whoop/callback", "/whoop/diag", "/whoop/auth", "/auth/login", "/auth/users", "/health"]);
const parseCookies = (req) => {
  const out = {};
  String(req.headers.cookie || "").split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
};
const userFromToken = (raw) => {
  if (!raw) return null;
  let sTok = String(raw);
  try { sTok = decodeURIComponent(sTok); } catch (e) {}
  const i = sTok.indexOf(":");
  if (i <= 0) return null;
  const id = sTok.slice(0, i).trim();
  const pw = sTok.slice(i + 1);
  const user = (usersFile().users || []).find((u) => u.id === id);
  return user && verifyPassword(user, pw) ? user : null;
};
const userFromSession = (req) => {
  const tok = parseCookies(req).forge_session;
  if (!tok) return null;
  const store = usersFile();
  const sess = (store.sessions || []).find((x) => x.token === tok && (!x.exp || x.exp > Date.now()));
  if (!sess) return null;
  return (store.users || []).find((u) => u.id === sess.userId) || null;
};
app.use("/api", (req, res, next) => {
  if (OPEN_PATHS.has(req.path)) return next();
  const user = userFromSession(req) || userFromToken(req.headers["x-app-token"]);
  if (user) { req.user = user; return next(); }
  return res.status(401).json({ error: "unauthorized" });
});
const requireAdmin = (req, res, next) =>
  req.user && req.user.admin ? next() : res.status(403).json({ error: "admin only" });

/* ---- per-user daily AI budget (admin is exempt) ---- */
const aiUsage = (id) => {
  const u = readUserJson(id, "ai-usage.json", {}) || {};
  const today = dateInTz();
  const count = Math.min(Math.max(+u.count || 0, 0), AI_DAILY_LIMIT);
  return u.date === today ? { date: today, count } : { date: today, count: 0 };
};
const aiStatus = (user) => {
  if (user.admin) return { used: 0, limit: null, left: null };
  const u = aiUsage(user.id);
  return { used: u.count, limit: AI_DAILY_LIMIT, left: Math.max(0, AI_DAILY_LIMIT - u.count) };
};

app.get("/api/health", (_req, res) => {
  res.json({
    ok: dataDirWritable,
    data_dir: DATA_DIR,
    writable: dataDirWritable,
    volume_mounted: VOLUME_MOUNTED,
    using_local_fallback: !VOLUME_MOUNTED,
    warning: !dataDirWritable
      ? "Data directory is not writable — logs will not persist."
      : !VOLUME_MOUNTED
        ? "No /data volume mounted. Redeploys will wipe local ./data."
        : null,
  });
});

const cookieFlags = () => {
  const secure = process.env.APP_URL ? "Secure; " : "";
  return `HttpOnly; ${secure}SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}`;
};

/* names only — the login screen needs the picker before auth */
app.get("/api/auth/users", (_req, res) => {
  res.json((usersFile().users || []).map((u) => ({ id: u.id, name: u.name, admin: !!u.admin })));
});
app.post("/api/auth/login", (req, res) => {
  const userId = String((req.body && req.body.userId) || "").trim();
  const pw = String((req.body && req.body.password) || "");
  const store = usersFile();
  const user = (store.users || []).find((u) => u.id === userId);
  if (!user || !verifyPassword(user, pw)) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const token = crypto.randomBytes(24).toString("hex");
  store.sessions = (store.sessions || []).filter((x) => x.exp > Date.now()).slice(-40);
  store.sessions.push({ token, userId: user.id, exp: Date.now() + 30 * 24 * 3600 * 1000, at: Date.now() });
  user.lastLogin = Date.now();
  saveUsers(store);
  res.setHeader("Set-Cookie", `forge_session=${token}; ${cookieFlags()}`);
  res.json({ ok: true, user: { id: user.id, name: user.name, admin: !!user.admin } });
});
app.get("/api/auth/me", (req, res) => {
  res.json({ id: req.user.id, name: req.user.name, admin: !!req.user.admin, ai: aiStatus(req.user) });
});
app.post("/api/auth/logout", (req, res) => {
  const tok = parseCookies(req).forge_session;
  const store = usersFile();
  store.sessions = (store.sessions || []).filter((x) => x.token !== tok);
  saveUsers(store);
  res.setHeader("Set-Cookie", "forge_session=; HttpOnly; Path=/; Max-Age=0");
  res.json({ ok: true });
});
app.post("/api/auth/password", (req, res) => {
  const current = String((req.body && req.body.current) || "");
  const next = String((req.body && req.body.next) || "").trim();
  if (!next || next.length < 4) return res.status(400).json({ error: "new password too short" });
  if (!verifyPassword(req.user, current)) {
    return res.status(401).json({ error: "current password does not match" });
  }
  const store = usersFile();
  const user = (store.users || []).find((u) => u.id === req.user.id);
  if (!user) return res.status(400).json({ error: "user not found" });
  user.salt = crypto.randomBytes(16).toString("hex");
  user.hash = hashPassword(next, user.salt);
  store.sessions = (store.sessions || []).filter((x) => x.userId !== user.id); // re-login on all devices
  saveUsers(store);
  res.setHeader("Set-Cookie", "forge_session=; HttpOnly; Path=/; Max-Age=0");
  res.json({ ok: true });
});

/* ---- admin: manage users ---- */
app.get("/api/users", requireAdmin, (req, res) => {
  res.json((usersFile().users || []).map((u) => ({
    id: u.id, name: u.name, admin: !!u.admin, lastLogin: u.lastLogin || null,
    whoop: !!((readUserJson(u.id, "whoop.json", null) || {}).access_token),
    aiToday: u.admin ? null : aiUsage(u.id).count,
    aiLimit: u.admin ? null : AI_DAILY_LIMIT,
  })));
});
app.post("/api/users", requireAdmin, (req, res) => {
  const name = String((req.body && req.body.name) || "").trim().slice(0, 24);
  const password = String((req.body && req.body.password) || "").trim();
  if (!name) return res.status(400).json({ error: "name required" });
  if (!password || password.length < 4) return res.status(400).json({ error: "password too short (min 4)" });
  const store = usersFile();
  if ((store.users || []).length >= MAX_USERS) {
    return res.status(400).json({ error: `User limit reached (${MAX_USERS}).` });
  }
  if ((store.users || []).some((u) => u.name.toLowerCase() === name.toLowerCase())) {
    return res.status(400).json({ error: "that name is taken" });
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const user = { id: newUserId(), name, admin: false, salt, hash: hashPassword(password, salt), createdAt: Date.now(), lastLogin: null };
  store.users.push(user);
  saveUsers(store);
  fs.mkdirSync(userDir(user.id), { recursive: true });
  res.json({ ok: true, user: { id: user.id, name: user.name } });
});
app.post("/api/users/:id/password", requireAdmin, (req, res) => {
  const next = String((req.body && req.body.password) || "").trim();
  if (!next || next.length < 4) return res.status(400).json({ error: "password too short (min 4)" });
  const store = usersFile();
  const user = (store.users || []).find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "user not found" });
  user.salt = crypto.randomBytes(16).toString("hex");
  user.hash = hashPassword(next, user.salt);
  store.sessions = (store.sessions || []).filter((x) => x.userId !== user.id);
  saveUsers(store);
  res.json({ ok: true });
});
app.delete("/api/users/:id", requireAdmin, (req, res) => {
  const store = usersFile();
  const user = (store.users || []).find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "user not found" });
  if (user.admin || user.id === req.user.id) return res.status(400).json({ error: "cannot remove the admin account" });
  store.users = store.users.filter((u) => u.id !== user.id);
  store.sessions = (store.sessions || []).filter((x) => x.userId !== user.id);
  saveUsers(store);
  /* keep the data — parked under trash/ instead of deleted */
  try {
    if (fs.existsSync(userDir(user.id))) {
      fs.mkdirSync(path.join(DATA_DIR, "trash"), { recursive: true });
      fs.renameSync(userDir(user.id), path.join(DATA_DIR, "trash", user.id + "-" + Date.now()));
    }
  } catch (e) { console.error("[users] could not park data dir:", String(e.message || e)); }
  res.json({ ok: true });
});


/* ---- WHOOP integration (OAuth 2.0, v2 API) ----
   Create an app at developer.whoop.com, add redirect URL
   {APP_URL}/api/whoop/callback, then set WHOOP_CLIENT_ID,
   WHOOP_CLIENT_SECRET and APP_URL env vars. */
const WHOOP_HOST = "https://api.prod.whoop.com";
const whoopConfigured = () => !!(process.env.WHOOP_CLIENT_ID && process.env.WHOOP_CLIENT_SECRET);
const appUrl = (req) => (process.env.APP_URL || `https://${req.headers.host}`).replace(/\/$/, "");
const whoopCaches = new Map();
const whoopCache = (id) => {
  if (!whoopCaches.has(id)) whoopCaches.set(id, { at: 0, data: null });
  return whoopCaches.get(id);
};

/* Legacy route from an older frontend. If this is reached, the browser is
   running a stale bundle — the current app POSTs to /whoop/auth-url instead. */
app.get("/api/whoop/auth", (req, res) => {
  res.status(409).type("html").send(`<!doctype html>
<meta name="viewport" content="width=device-width,initial-scale=1">
<body style="background:#0B0C0F;color:#EDEEF0;font:15px/1.6 system-ui;padding:28px;max-width:560px;margin:0 auto">
<h2 style="color:#FF5F2E;margin:0 0 12px">Stale app version</h2>
<p>This connect link belongs to an older build of the app. The server is up to date, but your browser is running the previous frontend.</p>
<p><b>Fix:</b> make sure <code style="color:#63A0FF">src/App.jsx</code> is committed and deployed alongside <code style="color:#63A0FF">server.js</code>, then hard-reload this site (long-press reload &rarr; Empty cache, or open in a private window).</p>
<p style="color:#8B9099;font-size:13px">Your data and WHOOP config are unaffected.</p>
<p><a href="/" style="color:#FF5F2E">&larr; Back to Forge</a></p>
</body>`);
});
app.post("/api/whoop/auth-url", (req, res) => {
  if (!whoopConfigured()) {
    return res.status(400).json({ error: "WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET are not set on the server." });
  }
  const state = req.user.id + "." + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  writeUserJson(req.user.id, "whoop-state.json", { state, at: Date.now() });
  const u = new URL(WHOOP_HOST + "/oauth/oauth2/auth");
  u.searchParams.set("client_id", process.env.WHOOP_CLIENT_ID);
  u.searchParams.set("redirect_uri", appUrl(req) + "/api/whoop/callback");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "offline read:recovery read:sleep read:cycles read:profile");
  u.searchParams.set("state", state);
  res.json({ url: u.toString(), redirect_uri: appUrl(req) + "/api/whoop/callback" });
});

/* Diagnostics: shows what the server thinks its config is, without
   revealing secrets. Useful for checking the redirect URL matches. */
app.get("/api/whoop/diag", (req, res) => {
  const connectedUsers = (usersFile().users || [])
    .filter((u) => !!((readUserJson(u.id, "whoop.json", null) || {}).access_token)).length;
  res.json({
    users: (usersFile().users || []).length,
    client_id_set: !!process.env.WHOOP_CLIENT_ID,
    client_secret_set: !!process.env.WHOOP_CLIENT_SECRET,
    app_url_env: process.env.APP_URL || null,
    redirect_uri_used: appUrl(req) + "/api/whoop/callback",
    connected_users: connectedUsers,
    timezone: process.env.TIMEZONE || "UTC (set TIMEZONE)",
    auto_adjust: (process.env.AUTO_ADJUST || "on"),
  });
});

app.get("/api/whoop/callback", async (req, res) => {
  const stateUserId = String(req.query.state || "").split(".")[0];
  const stateUser = (usersFile().users || []).find((u) => u.id === stateUserId) || null;
  const saved = stateUser ? readUserJson(stateUser.id, "whoop-state.json", {}) : {};
  if (req.query.error) {
    return res.status(400).send(`WHOOP declined the request: ${req.query.error}. ${req.query.error_description || ""}`);
  }
  if (!stateUser || !req.query.code || req.query.state !== saved.state) {
    return res.status(400).send("OAuth state mismatch — go back to the app and tap Connect WHOOP again.");
  }
  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: req.query.code,
      client_id: process.env.WHOOP_CLIENT_ID,
      client_secret: process.env.WHOOP_CLIENT_SECRET,
      redirect_uri: appUrl(req) + "/api/whoop/callback",
    });
    const r = await fetch(WHOOP_HOST + "/oauth/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const tok = await r.json();
    if (!r.ok) return res.status(502).send(
      "Token exchange failed. This almost always means the Redirect URL in your WHOOP app " +
      "doesn't exactly match:\n\n  " + appUrl(req) + "/api/whoop/callback\n\n" +
      "Check it character-for-character in the WHOOP Developer Dashboard, then try again.\n\nWHOOP said: " + JSON.stringify(tok)
    );
    writeUserJson(stateUser.id, "whoop.json", {
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      expires_at: Date.now() + (tok.expires_in || 3600) * 1000,
    });
    whoopCaches.delete(stateUser.id);
    res.redirect("/");
  } catch (e) {
    res.status(502).send("WHOOP connection failed: " + String(e));
  }
});

async function whoopAccessToken(userId) {
  let t = readUserJson(userId, "whoop.json", null);
  if (!t || !t.access_token) return null;
  if (Date.now() > (t.expires_at || 0) - 60000) {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: t.refresh_token,
      client_id: process.env.WHOOP_CLIENT_ID,
      client_secret: process.env.WHOOP_CLIENT_SECRET,
      scope: "offline",
    });
    const r = await fetch(WHOOP_HOST + "/oauth/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!r.ok) return null;
    const tok = await r.json();
    t = {
      access_token: tok.access_token,
      refresh_token: tok.refresh_token || t.refresh_token,
      expires_at: Date.now() + (tok.expires_in || 3600) * 1000,
    };
    writeUserJson(userId, "whoop.json", t);
  }
  return t.access_token;
}

app.get("/api/whoop/status", (req, res) => {
  const t = readUserJson(req.user.id, "whoop.json", null);
  res.json({ configured: whoopConfigured(), connected: !!(t && t.access_token) });
});

async function fetchWhoopSummary(userId) {
  const at = await whoopAccessToken(userId);
  if (!at) return null;
  const j = async (p) => {
    const r = await fetch(WHOOP_HOST + "/developer/v2" + p, { headers: { Authorization: "Bearer " + at } });
    return r.ok ? r.json() : null;
  };
  const [rec, slp, cyc] = await Promise.all([
    j("/recovery?limit=3"),
    j("/activity/sleep?limit=3"),
    j("/cycle?limit=3"),
  ]);
  const today = dateInTz();
  const cycles = (cyc && cyc.records) || [];
  // WHOOP returns newest first. The open cycle (no `end`) is *today*; the newest
  // closed cycle is *yesterday* — its strain is what today's recovery responds to.
  const openCycle = cycles.find((c) => !c.end) || cycles[0] || null;
  const closedCycle = cycles.find((c) => c.end && (!openCycle || c.id !== openCycle.id)) || null;

  // Recovery belongs to the open cycle. If WHOOP hasn't scored it yet, fall back
  // to the newest scored one but flag it as stale so the UI doesn't pretend.
  const recs = (rec && rec.records) || [];
  const scored = (r) => r && r.score && r.score.recovery_score != null && r.score_state !== "PENDING_SCORE";
  let recRec = openCycle ? recs.find((r) => r.cycle_id === openCycle.id && scored(r)) : null;
  if (!recRec) recRec = recs.find(scored) || recs[0] || null;
  const rs = (recRec && recRec.score) || {};

  // Sleep: the one that feeds this recovery (same cycle), else the newest.
  const slps = (slp && slp.records) || [];
  const sleepRec = (recRec && slps.find((x) => x.id === recRec.sleep_id)) || slps.find((x) => !x.nap) || slps[0] || null;
  const ss = (sleepRec && sleepRec.score) || {};
  let sleepHours = null;
  if (ss.stage_summary) {
    const ms = (ss.stage_summary.total_light_sleep_time_milli || 0) +
      (ss.stage_summary.total_slow_wave_sleep_time_milli || 0) +
      (ss.stage_summary.total_rem_sleep_time_milli || 0);
    if (ms > 0) sleepHours = Math.round(ms / 360000) / 10;
  }
  if (sleepHours === null && sleepRec && sleepRec.start && sleepRec.end) {
    sleepHours = Math.round((new Date(sleepRec.end) - new Date(sleepRec.start)) / 360000) / 10;
  }
  const ycs = (closedCycle && closedCycle.score) || {};
  const tcs = (openCycle && openCycle.score) || {};
  const recoveryCreatedAt = (recRec && (recRec.created_at || recRec.updated_at)) || null;
  const recoveryDate = recoveryCreatedAt ? dateInTz(new Date(recoveryCreatedAt)) : null;
  const data = {
    recovery: rs.recovery_score ?? null,
    hrv: rs.hrv_rmssd_milli != null ? Math.round(rs.hrv_rmssd_milli) : null,
    rhr: rs.resting_heart_rate ?? null,
    sleepHours,
    sleepPerf: ss.sleep_performance_percentage != null ? Math.round(ss.sleep_performance_percentage) : null,
    strain: ycs.strain != null ? Math.round(ycs.strain * 10) / 10 : null,        // yesterday's (closed cycle)
    todayStrain: tcs.strain != null ? Math.round(tcs.strain * 10) / 10 : null,   // so far today (open cycle)
    recoveryCreatedAt,
    recoveryDate,
    stale: !!recoveryDate && recoveryDate !== today,                             // today's not scored yet
    updated: new Date().toISOString(),
  };
  whoopCaches.set(userId, { at: Date.now(), data });

  // Persist a daily snapshot — correlations need history, not just today.
  try {
    const day = data.recoveryDate || dateInTz();
    if (data.recovery != null) {
      const hist = readUserJson(userId, "whoop-history.json", []);
      const rest = hist.filter((h) => h.date !== day);
      rest.push({
        date: day, recovery: data.recovery, hrv: data.hrv, rhr: data.rhr,
        sleepHours: data.sleepHours, sleepPerf: data.sleepPerf, strain: data.strain,
      });
      rest.sort((a, b) => (a.date < b.date ? -1 : 1));
      writeUserJson(userId, "whoop-history.json", rest.slice(-400));
    }
  } catch (e) { console.error("[whoop] history write failed", String(e.message || e)); }

  return data;
}

app.get("/api/whoop/summary", async (req, res) => {
  // Fresh for 15 min normally — but only 2 min while we're still holding
  // yesterday's recovery, so today's shows up shortly after WHOOP scores it.
  const c = whoopCache(req.user.id);
  const ttl = c.data && c.data.stale ? 2 * 60 * 1000 : 15 * 60 * 1000;
  if (c.data && Date.now() - c.at < ttl) return res.json(c.data);
  try {
    const data = await fetchWhoopSummary(req.user.id);
    if (!data) return res.status(400).json({ error: "not connected" });
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

app.get("/api/whoop/history", (req, res) => res.json(readUserJson(req.user.id, "whoop-history.json", [])));

app.post("/api/whoop/disconnect", (req, res) => {
  try { fs.unlinkSync(userPath(req.user.id, "whoop.json")); } catch (e) {}
  whoopCaches.delete(req.user.id);
  res.json({ ok: true });
});

/* ---- data endpoints + plan/data snapshots ---- */
const snapshotPush = (userId, reason, data) => {
  try {
    const hist = readUserJson(userId, "forge-history.json", []);
    hist.push({
      at: Date.now(),
      reason: reason || "save",
      data: {
        profile: data.profile,
        plan: data.plan,
        workouts: data.workouts,
        live: data.live,
        reviewedWeek: data.reviewedWeek,
      },
    });
    writeUserJson(userId, "forge-history.json", hist.slice(-20));
  } catch (e) {
    console.error("[snapshot]", String(e.message || e));
  }
};

app.get("/api/data", (req, res) => res.json(readUserJson(req.user.id, "forge.json", {})));
app.put("/api/data", (req, res) => {
  const incoming = req.body || {};
  const prev = readUserJson(req.user.id, "forge.json", {});
  const planChanged = JSON.stringify(prev.plan || null) !== JSON.stringify(incoming.plan || null);
  const deletedWorkout = (prev.workouts || []).length > (incoming.workouts || []).length;
  if (planChanged || deletedWorkout) snapshotPush(req.user.id, planChanged ? "plan" : "workout-delete", prev);
  writeUserJson(req.user.id, "forge.json", incoming);
  res.json({ ok: true, snapshotted: planChanged || deletedWorkout });
});
app.get("/api/data/history", (req, res) => {
  const hist = readUserJson(req.user.id, "forge-history.json", []);
  res.json(hist.map((h, i) => ({ i, at: h.at, reason: h.reason })));
});
app.post("/api/data/undo", (req, res) => {
  const hist = readUserJson(req.user.id, "forge-history.json", []);
  const last = hist.pop();
  if (!last) return res.status(400).json({ error: "nothing to undo" });
  const current = readUserJson(req.user.id, "forge.json", {});
  writeUserJson(req.user.id, "forge.json", { ...current, ...last.data });
  writeUserJson(req.user.id, "forge-history.json", hist);
  res.json({ ok: true, restored: last.reason, at: last.at, data: { ...current, ...last.data } });
});
/* exinfo (AI-written exercise notes) is shared across users so a note one
   person paid an AI call for benefits everyone — merged, never overwritten */
app.get("/api/exinfo", (_req, res) => res.json(readJson("exinfo.json", {})));
app.put("/api/exinfo", (req, res) => {
  const merged = { ...readJson("exinfo.json", {}), ...(req.body || {}) };
  writeJson("exinfo.json", merged);
  res.json({ ok: true });
});

/* ---- Claude proxy: keeps your API key server-side ---- */
/* ================= AI provider =================
   Set ONE of these in Railway → Variables:
     OPENAI_API_KEY      → uses OpenAI  (recommended cheap models below)
     ANTHROPIC_API_KEY   → uses Claude
   Optional: OPENAI_MODEL / ANTHROPIC_MODEL to pin a specific model.
   If unset, the server asks the provider which models your account has
   and picks the cheapest capable one from PREFERRED_OPENAI. */
const OPENAI_KEY = (process.env.OPENAI_API_KEY || "").trim();
const ANTHROPIC_KEY = (process.env.ANTHROPIC_API_KEY || "").trim();
const PROVIDER = (process.env.AI_PROVIDER || (OPENAI_KEY ? "openai" : ANTHROPIC_KEY ? "anthropic" : "")).toLowerCase();

// cheapest-first: model names churn, so we match against what your account offers
const PREFERRED_OPENAI = [
  "gpt-5.6-luna", "gpt-5.4-nano", "gpt-5.4-mini", "gpt-5.6-terra",
  "gpt-5.4", "gpt-5.2-chat-latest", "gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini",
];
let resolvedModel = null;

// Base URL is overridable for Azure / gateways / proxies.
const OPENAI_BASE = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const failedModels = new Set();

async function readErr(r) {
  const raw = await r.text().catch(() => "");
  let msg = "";
  try { const j = JSON.parse(raw); msg = (j.error && (j.error.message || j.error.code)) || ""; } catch (e) {}
  return msg || raw.slice(0, 300) || "(empty response body)";
}

async function openaiModels() {
  const url = OPENAI_BASE + "/models";
  const r = await fetch(url, { headers: { Authorization: "Bearer " + OPENAI_KEY } });
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status}: ${await readErr(r)}`);
  const d = await r.json();
  return (d.data || []).map((m) => m.id);
}

async function resolveModel() {
  if (resolvedModel && !failedModels.has(resolvedModel)) return resolvedModel;
  resolvedModel = null;
  if (PROVIDER === "anthropic") {
    resolvedModel = process.env.ANTHROPIC_MODEL || process.env.MODEL || "claude-sonnet-5";
    return resolvedModel;
  }
  const pinned = (process.env.OPENAI_MODEL || process.env.MODEL || "").trim();
  if (pinned && !failedModels.has(pinned)) { resolvedModel = pinned; return resolvedModel; }
  try {
    const ids = await openaiModels();
    for (const want of PREFERRED_OPENAI) {
      const hit = ids.find((id) => id === want && !failedModels.has(id))
        || ids.find((id) => id.startsWith(want) && !failedModels.has(id));
      if (hit) { resolvedModel = hit; console.log("[ai] auto-selected model:", hit); return hit; }
    }
    // nothing from the preference list — fall back to any chat-capable gpt id
    const any = ids.filter((id) => /^gpt-/.test(id) && !failedModels.has(id)).sort()[0];
    if (any) { resolvedModel = any; console.log("[ai] falling back to model:", any); return any; }
    throw new Error("No usable GPT model found on this account.");
  } catch (e) {
    console.error("[ai] model discovery failed:", String(e.message || e));
    throw e;
  }
}

/* Single entry point for all AI calls (used by the API route and the scheduler) */
async function callAI(prompt, maxTokens = 1500) {
  if (!PROVIDER) {
    throw new Error("No AI key set. Add OPENAI_API_KEY (or ANTHROPIC_API_KEY) in Railway → Variables.");
  }
  const model = await resolveModel();
  const cap = Math.min(Math.max(maxTokens || 1500, 4000), 16000);

  if (PROVIDER === "openai") {
    let useModel = model, lastErr = null;
    // A model can be renamed or unavailable on an account; on a model-shaped
    // error we blacklist it, pick the next preference, and retry.
    for (let attempt = 0; attempt < 3; attempt++) {
      const url = OPENAI_BASE + "/chat/completions";
      let r, data;
      try {
        r = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", Authorization: "Bearer " + OPENAI_KEY },
          body: JSON.stringify({
            model: useModel,
            messages: [{ role: "user", content: String(prompt || "") }],
            // every prompt in this app asks for JSON; this makes parsing reliable
            response_format: { type: "json_object" },
            // newer OpenAI models require max_completion_tokens and reject max_tokens
            max_completion_tokens: cap,
          }),
        });
      } catch (e) {
        throw new Error(`Network error reaching ${url}: ${String(e.message || e)}`);
      }
      if (!r.ok) {
        const detail = await readErr(r);
        lastErr = `POST ${url} (model ${useModel}) -> ${r.status}: ${detail}`;
        const modelIssue = r.status === 404 || /model/i.test(detail);
        if (modelIssue) {
          console.warn("[ai] model rejected:", useModel, detail);
          failedModels.add(useModel);
          try { useModel = await resolveModel(); } catch (e) { break; }
          if (failedModels.has(useModel)) break;
          continue;
        }
        break;
      }
      data = await r.json();
      const choice = (data.choices || [])[0] || {};
      const text = (choice.message && choice.message.content) || "";
      if (!text.trim()) {
        throw new Error(`Model ${useModel} returned no text (finish_reason: ${choice.finish_reason || "unknown"}).`);
      }
      return text;
    }
    throw new Error(lastErr || "OpenAI request failed and no usable model was found.");
  }

  // Anthropic
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, max_tokens: cap, messages: [{ role: "user", content: String(prompt || "") }] }),
  });
  if (!r.ok) throw new Error(`Claude API (${r.status}, model ${model}): ${await readErr(r)}`);
  const data = await r.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (!text.trim()) throw new Error(`Model returned no text (stop_reason: ${data.stop_reason || "unknown"}).`);
  return text;
}

/* Reserve the slot BEFORE the AI call, in one synchronous step. Checking
   first and incrementing after the (slow) call is a race: two requests in
   flight both pass the check and the counter overshoots the cap. A failed
   call refunds its slot so errors don't eat the daily budget. */
const aiReserve = (userId) => {
  const u = aiUsage(userId);
  if (u.count >= AI_DAILY_LIMIT) return null;
  u.count += 1;
  writeUserJson(userId, "ai-usage.json", u);
  return u;
};
const aiRefund = (userId, date) => {
  try {
    const u = aiUsage(userId);
    if (u.date === date && u.count > 0) {
      u.count -= 1;
      writeUserJson(userId, "ai-usage.json", u);
    }
  } catch (e) {}
};
app.post("/api/claude", async (req, res) => {
  let reserved = null;
  if (!req.user.admin) {
    reserved = aiReserve(req.user.id);
    if (!reserved) {
      return res.status(429).json({
        error: `Daily AI limit reached (${AI_DAILY_LIMIT} calls). It resets at midnight.`,
        ai: { used: AI_DAILY_LIMIT, limit: AI_DAILY_LIMIT, left: 0 },
      });
    }
  }
  try {
    const text = await callAI(req.body.prompt, +req.body.max_tokens || 1500);
    const ai = reserved
      ? { used: reserved.count, limit: AI_DAILY_LIMIT, left: Math.max(0, AI_DAILY_LIMIT - reserved.count) }
      : null;
    res.json({ text, ai });
  } catch (e) {
    if (reserved) aiRefund(req.user.id, reserved.date);
    console.error("[ai]", String(e.message || e));
    res.status(502).json({ error: String(e.message || e) });
  }
});

/* Public, secret-free diagnostics for the AI side */
app.get("/api/ai/diag", async (req, res) => {
  const out = {
    provider: PROVIDER || "none — set OPENAI_API_KEY or ANTHROPIC_API_KEY",
    openai_key_set: !!OPENAI_KEY,
    anthropic_key_set: !!ANTHROPIC_KEY,
    pinned_model: process.env.OPENAI_MODEL || process.env.ANTHROPIC_MODEL || process.env.MODEL || null,
    base_url: PROVIDER === "openai" ? OPENAI_BASE : "https://api.anthropic.com",
    key_prefix: (OPENAI_KEY || ANTHROPIC_KEY).slice(0, 7) || null,
    rejected_models: [...failedModels],
    resolved_model: resolvedModel,
  };
  try {
    out.resolved_model = await resolveModel();
    out.ok = true;
  } catch (e) {
    out.ok = false;
    out.error = String(e.message || e);
  }
  if (req.query.models === "1" && PROVIDER === "openai") {
    try { out.available_models = (await openaiModels()).filter((m) => /^(gpt|o[0-9])/.test(m)).sort(); }
    catch (e) { out.available_models_error = String(e.message || e); }
  }
  res.json(out);
});

/* ---- background auto-adjust ----
   Every 15 minutes: once WHOOP has synced today's recovery, adjust
   today's planned session in forge.json — no app open required.
   Set TIMEZONE (IANA name, e.g. America/Argentina/Buenos_Aires) so
   "today" matches your day, and AUTO_ADJUST=off to disable. */
const TZNAME = process.env.TIMEZONE || "UTC";
const GEAR_LABELS = {
  barbell: "Barbell & plates", dumbbells: "Dumbbells", kettlebell: "Kettlebell",
  bands: "Resistance bands", "pullup-bar": "Pull-up bar", machines: "Gym machines", cardio: "Cardio machines",
};
const dateInTz = (dt = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZNAME, year: "numeric", month: "2-digit", day: "2-digit" }).format(dt);
const weekdayIdxInTz = () => {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZNAME, weekday: "short" }).format(new Date());
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(wd);
};

async function autoAdjustCheck() {
  try {
    if ((process.env.AUTO_ADJUST || "on") === "off") return;
    if (!PROVIDER) return;
    const adminUser = (usersFile().users || []).find((u) => u.admin);
    if (!adminUser) return;
    const adminId = adminUser.id;
    const data = readUserJson(adminId, "forge.json", null);
    if (!data || !data.profile || !data.plan || !Array.isArray(data.plan.week)) return;
    const today = dateInTz();
    const idx = weekdayIdxInTz();
    if (idx < 0) return;
    if (!canAutoAdjust({ plan: data.plan, workouts: data.workouts, today, todayIdx: idx })) return;
    const dy = data.plan.week[idx];

    const sum = await fetchWhoopSummary(adminId);
    if (!sum || sum.recovery == null) return;                      // WHOOP not connected / no data
    if (sum.stale || (sum.recoveryDate && sum.recoveryDate !== today)) return;                                  // hasn't synced today yet — retry next tick

    if (sum.recovery >= 67) {                                      // green: train as planned
      data.plan.adjustedDate = today;
      writeUserJson(adminId, "forge.json", data);
      console.log(`[auto-adjust] ${today}: recovery ${sum.recovery}% — no change needed`);
      return;
    }

    const p = data.profile;
    const reason = adjustReason(sum);
    const gearLabels = (p.gear || []).length ? p.gear.map((g) => GEAR_LABELS[g] || g) : ["Bodyweight only"];
    const prompt = `Adjust today's planned training session to the athlete's recovery. Change only what recovery demands.

Athlete: ${p.level}, goal ${p.goal}.${constraintBlock(p)}
Equipment: ${gearLabels.join(", ")}.
WHOOP today: ${reason.summary}.
Planned session: ${JSON.stringify(dy)}

Rules:
- Recovery under 34% (red): cut loads 20-30%, drop roughly one set per exercise${p.neverSwapCompounds ? "." : ", and swap the most CNS-taxing lifts (heavy squats/deadlifts) for gentler variants."}
- Recovery 34-66% (yellow): trim loads about 10% and reduce total sets slightly. Keep the session's structure.
- Keep the same day name and a similar exercise count. Use ONLY the available equipment.
${p.neverSwapCompounds ? "- Do NOT replace squat/bench/deadlift/press/row — only change load, sets or reps." : ""}

Respond ONLY with valid JSON, no markdown fences:
{"day":"${dy.day}","rest":false,"focus":"session title","warmup":"one line warm-up for this session","exercises":[{"exercise":"name","sets":3,"reps":"8-10","load":"short guidance"}],"adjust_note":"one short sentence: what changed and why"}`;

    const text = await callAI(prompt, 1200);
    const adj = JSON.parse(text.replace(/```json|```/g, "").trim());
    const sanitized = sanitizePlan({ why: "", tip: "", week: data.plan.week.map((d, i) => i === idx ? adj : d) }, { profile: p });
    snapshotPush(adminId, "auto-adjust", data);
    data.plan = applyAutoAdjust(data.plan, {
      ...adj,
      exercises: sanitized.week[idx].exercises,
      adjustRecovery: sum.recovery,
      adjustReason: reason.summary,
    }, { today, todayIdx: idx, neverSwapCompounds: !!p.neverSwapCompounds });
    delete data.plan.adjustUndone;
    writeUserJson(adminId, "forge.json", data);
    console.log(`[auto-adjust] ${today}: ${dy.day} adjusted for ${reason.summary}`);
  } catch (e) {
    console.error("[auto-adjust] failed:", String(e.message || e));
  }
}
/* Every 15 min: pull WHOOP so the history file and cache stay current even
   when the app is closed. Goes through the cache, so it's a real WHOOP call
   only when the cached copy has expired. Then run the auto-adjust check. */
async function whoopPoll() {
  for (const u of usersFile().users || []) {
    try {
      const t = readUserJson(u.id, "whoop.json", null);
      if (!t || !t.access_token) continue;
      const c = whoopCache(u.id);
      const ttl = c.data && c.data.stale ? 2 * 60 * 1000 : 15 * 60 * 1000;
      if (!c.data || Date.now() - c.at >= ttl) await fetchWhoopSummary(u.id);
    } catch (e) { console.error("[whoop] poll failed:", u.name, String(e.message || e)); }
  }
  await autoAdjustCheck();
}
setInterval(whoopPoll, 15 * 60 * 1000);
setTimeout(whoopPoll, 20 * 1000); // and shortly after boot

/* ================= push notifications =================
   Web Push works on iOS 16.4+ but only once the app is installed to the
   Home Screen. Keys are generated once and persisted to the data volume,
   so there is nothing to configure — set VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY
   only if you want to pin your own pair. */
const vapid = (() => {
  const envPub = (process.env.VAPID_PUBLIC_KEY || "").trim();
  const envPriv = (process.env.VAPID_PRIVATE_KEY || "").trim();
  if (envPub && envPriv) return { publicKey: envPub, privateKey: envPriv };
  const saved = readJson("vapid.json", null);
  if (saved && saved.publicKey && saved.privateKey) return saved;
  const fresh = webpush.generateVAPIDKeys();
  writeJson("vapid.json", fresh);
  console.log("[push] generated a new VAPID key pair");
  return fresh;
})();
/* The subject must be a mailto: or https: URL — some push services reject
   anything else outright. */
const VAPID_SUBJECT = (() => {
  const s = (process.env.VAPID_SUBJECT || process.env.APP_URL || "").trim();
  if (/^mailto:/i.test(s) || /^https:\/\//i.test(s)) return s.replace(/\/$/, "");
  return "mailto:forge@example.com";
})();
webpush.setVapidDetails(VAPID_SUBJECT, vapid.publicKey, vapid.privateKey);

const pushPrefs = (userId) => ({ ...DEFAULT_PUSH_PREFS, ...(readUserJson(userId, "push-prefs.json", {}) || {}) });
const pushSubs = (userId) => readUserJson(userId, "push-subs.json", []);
const savePushSubs = (userId, list) => writeUserJson(userId, "push-subs.json", list);

/* Send to every subscription, dropping the ones the push service says are dead.
   404/410 means the browser threw the subscription away — keeping it would
   make every future send fail. */
async function pushSend(userId, payload) {
  const subs = pushSubs(userId);
  if (!subs.length) return { sent: 0, dropped: 0 };
  const body = JSON.stringify(payload);
  let sent = 0;
  const alive = [];
  for (const s of subs) {
    try {
      await webpush.sendNotification(s.sub, body, { TTL: 4 * 60 * 60 });
      sent++;
      alive.push(s);
    } catch (e) {
      const code = e && e.statusCode;
      if (code === 404 || code === 410) {
        console.log("[push] dropping expired subscription");
      } else {
        console.error("[push] send failed:", code || String(e.message || e));
        alive.push(s); // transient — keep it
      }
    }
  }
  if (alive.length !== subs.length) savePushSubs(userId, alive);
  return { sent, dropped: subs.length - alive.length };
}

app.get("/api/push/config", (req, res) => {
  res.json({
    publicKey: vapid.publicKey,
    subscriptions: pushSubs(req.user.id).length,
    prefs: pushPrefs(req.user.id),
    timezone: TZNAME,
  });
});

app.post("/api/push/subscribe", (req, res) => {
  const sub = req.body && req.body.subscription;
  if (!sub || !sub.endpoint) return res.status(400).json({ error: "missing subscription" });
  const list = pushSubs(req.user.id).filter((s) => s.sub.endpoint !== sub.endpoint);
  list.push({ sub, at: Date.now(), ua: String(req.headers["user-agent"] || "").slice(0, 160) });
  savePushSubs(req.user.id, list.slice(-10)); // a handful of devices is plenty
  res.json({ ok: true, subscriptions: list.length });
});

app.post("/api/push/unsubscribe", (req, res) => {
  const ep = req.body && req.body.endpoint;
  const list = pushSubs(req.user.id).filter((s) => s.sub.endpoint !== ep);
  savePushSubs(req.user.id, list);
  res.json({ ok: true, subscriptions: list.length });
});

app.put("/api/push/prefs", (req, res) => {
  const incoming = req.body || {};
  const next = { ...pushPrefs(req.user.id) };
  ["train", "weigh", "unlogged", "adjusted"].forEach((k) => {
    if (typeof incoming[k] === "boolean") next[k] = incoming[k];
  });
  ["morningHour", "eveningHour"].forEach((k) => {
    const v = +incoming[k];
    if (Number.isInteger(v) && v >= 0 && v <= 23) next[k] = v;
  });
  writeUserJson(req.user.id, "push-prefs.json", next);
  res.json({ ok: true, prefs: next });
});

app.post("/api/push/test", async (req, res) => {
  if (!pushSubs(req.user.id).length) return res.status(400).json({ error: "no devices subscribed" });
  const out = await pushSend(req.user.id, {
    title: "Forge",
    body: "Reminders are working. This is what they'll look like.",
    tag: "forge-test",
    url: "/",
  });
  res.json(out);
});

/* ---- reminder scheduler ----
   Runs every 5 minutes and fires at most once per reminder per day. The
   sent-log is keyed by local date so a restart can't double-send. */
const hourInTz = () =>
  +new Intl.DateTimeFormat("en-GB", { timeZone: TZNAME, hour: "2-digit", hourCycle: "h23" }).format(new Date());

function alreadySent(userId, key) {
  const log = readUserJson(userId, "push-sent.json", {});
  return !!log[key];
}
function markSent(userId, key) {
  const log = readUserJson(userId, "push-sent.json", {});
  log[key] = Date.now();
  // keep the file from growing forever
  const keys = Object.keys(log).sort();
  if (keys.length > 200) keys.slice(0, keys.length - 200).forEach((k) => delete log[k]);
  writeUserJson(userId, "push-sent.json", log);
}

async function fireOnce(userId, key, payload) {
  if (alreadySent(userId, key)) return false;
  markSent(userId, key); // mark first: a failed send is better than a doubled one
  const out = await pushSend(userId, payload);
  console.log(`[push] ${key} -> ${out.sent} device(s)`);
  return true;
}

async function pushCheck() {
  for (const u of usersFile().users || []) {
    try {
      if (!pushSubs(u.id).length) continue;
      const due = dueReminders({
        data: readUserJson(u.id, "forge.json", null),
        prefs: pushPrefs(u.id),
        today: dateInTz(),
        idx: weekdayIdxInTz(),
        hour: hourInTz(),
      });
      for (const r of due) await fireOnce(u.id, r.key, r.payload);
    } catch (e) {
      console.error("[push] scheduler failed:", u.name, String(e.message || e));
    }
  }
}
setInterval(pushCheck, 5 * 60 * 1000);
setTimeout(pushCheck, 30 * 1000);

/* ---- serve the built frontend ---- */
app.use(express.static(path.join(__dirname, "dist")));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "dist", "index.html")));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Forge running on port " + port + ", data dir: " + DATA_DIR));
