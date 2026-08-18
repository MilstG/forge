import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "4mb" }));

/* ---- persistence: JSON files on a mounted volume ----
   On Railway, attach a volume mounted at /data so your log
   survives restarts and redeploys. Falls back to ./data locally. */
const DATA_DIR =
  process.env.DATA_DIR || (fs.existsSync("/data") ? "/data" : path.join(__dirname, "data"));
fs.mkdirSync(DATA_DIR, { recursive: true });
const fileFor = (name) => path.join(DATA_DIR, name);
const readJson = (f, fallback) => {
  try { return JSON.parse(fs.readFileSync(fileFor(f), "utf8")); } catch { return fallback; }
};
const writeJson = (f, data) => {
  const tmp = fileFor(f + ".tmp");
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, fileFor(f)); // atomic-ish write
};

/* ---- simple password gate for all API routes ---- */
const PASSWORD = process.env.APP_PASSWORD || "";
app.use("/api", (req, res, next) => {
  if (req.path === "/whoop/callback") return next(); // OAuth redirect from WHOOP
  if (req.path === "/whoop/auth") {
    // browser navigation can't send headers; check token via query param
    if (PASSWORD && req.query.token !== PASSWORD) return res.status(401).send("unauthorized");
    return next();
  }
  if (PASSWORD && req.headers["x-app-token"] !== PASSWORD) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
});

/* ---- WHOOP integration (OAuth 2.0, v2 API) ----
   Create an app at developer.whoop.com, add redirect URL
   {APP_URL}/api/whoop/callback, then set WHOOP_CLIENT_ID,
   WHOOP_CLIENT_SECRET and APP_URL env vars. */
const WHOOP_HOST = "https://api.prod.whoop.com";
const whoopConfigured = () => !!(process.env.WHOOP_CLIENT_ID && process.env.WHOOP_CLIENT_SECRET);
const appUrl = (req) => (process.env.APP_URL || `https://${req.headers.host}`).replace(/\/$/, "");
let whoopCache = { at: 0, data: null };

app.get("/api/whoop/auth", (req, res) => {
  if (!whoopConfigured()) return res.status(500).send("Set WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET on the server first.");
  const state = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  writeJson("whoop-state.json", { state });
  const u = new URL(WHOOP_HOST + "/oauth/oauth2/auth");
  u.searchParams.set("client_id", process.env.WHOOP_CLIENT_ID);
  u.searchParams.set("redirect_uri", appUrl(req) + "/api/whoop/callback");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "offline read:recovery read:sleep read:cycles read:profile");
  u.searchParams.set("state", state);
  res.redirect(u.toString());
});

app.get("/api/whoop/callback", async (req, res) => {
  const saved = readJson("whoop-state.json", {});
  if (!req.query.code || req.query.state !== saved.state) return res.status(400).send("OAuth state mismatch — try connecting again.");
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
    if (!r.ok) return res.status(502).send("Token exchange failed: " + JSON.stringify(tok));
    writeJson("whoop.json", {
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      expires_at: Date.now() + (tok.expires_in || 3600) * 1000,
    });
    whoopCache = { at: 0, data: null };
    res.redirect("/");
  } catch (e) {
    res.status(502).send("WHOOP connection failed: " + String(e));
  }
});

async function whoopAccessToken() {
  let t = readJson("whoop.json", null);
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
    writeJson("whoop.json", t);
  }
  return t.access_token;
}

app.get("/api/whoop/status", (_req, res) => {
  const t = readJson("whoop.json", null);
  res.json({ configured: whoopConfigured(), connected: !!(t && t.access_token) });
});

app.get("/api/whoop/summary", async (_req, res) => {
  if (whoopCache.data && Date.now() - whoopCache.at < 15 * 60 * 1000) return res.json(whoopCache.data);
  const at = await whoopAccessToken();
  if (!at) return res.status(400).json({ error: "not connected" });
  const j = async (p) => {
    const r = await fetch(WHOOP_HOST + "/developer/v2" + p, { headers: { Authorization: "Bearer " + at } });
    return r.ok ? r.json() : null;
  };
  try {
    const [rec, slp, cyc] = await Promise.all([
      j("/recovery?limit=1"),
      j("/activity/sleep?limit=1"),
      j("/cycle?limit=1"),
    ]);
    const rs = (rec && rec.records && rec.records[0] && rec.records[0].score) || {};
    const sleepRec = slp && slp.records && slp.records[0];
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
    const cs = (cyc && cyc.records && cyc.records[0] && cyc.records[0].score) || {};
    const data = {
      recovery: rs.recovery_score ?? null,
      hrv: rs.hrv_rmssd_milli != null ? Math.round(rs.hrv_rmssd_milli) : null,
      rhr: rs.resting_heart_rate ?? null,
      sleepHours,
      sleepPerf: ss.sleep_performance_percentage != null ? Math.round(ss.sleep_performance_percentage) : null,
      strain: cs.strain != null ? Math.round(cs.strain * 10) / 10 : null,
      updated: new Date().toISOString(),
    };
    whoopCache = { at: Date.now(), data };
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

app.post("/api/whoop/disconnect", (_req, res) => {
  try { fs.unlinkSync(fileFor("whoop.json")); } catch (e) {}
  whoopCache = { at: 0, data: null };
  res.json({ ok: true });
});

/* ---- data endpoints ---- */
app.get("/api/data", (_req, res) => res.json(readJson("forge.json", {})));
app.put("/api/data", (req, res) => {
  writeJson("forge.json", req.body || {});
  res.json({ ok: true });
});
app.get("/api/exinfo", (_req, res) => res.json(readJson("exinfo.json", {})));
app.put("/api/exinfo", (req, res) => {
  writeJson("exinfo.json", req.body || {});
  res.json({ ok: true });
});

/* ---- Claude proxy: keeps your API key server-side ---- */
app.post("/api/claude", async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set" });
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.MODEL || "claude-sonnet-4-6",
        max_tokens: Math.min(+req.body.max_tokens || 1500, 4000),
        messages: [{ role: "user", content: String(req.body.prompt || "") }],
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      return res.status(502).json({ error: (data.error && data.error.message) || "api error" });
    }
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    res.json({ text });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

/* ---- serve the built frontend ---- */
app.use(express.static(path.join(__dirname, "dist")));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "dist", "index.html")));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Forge running on port " + port + ", data dir: " + DATA_DIR));
