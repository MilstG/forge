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

/* ---- simple password gate for all API routes ----
   The token travels in a header, so it is percent-encoded by the client
   (HTTP headers can't carry non-ASCII, e.g. accented characters).
   Values are trimmed because env vars often pick up stray whitespace. */
const PASSWORD = (process.env.APP_PASSWORD || "").trim();
const OPEN_PATHS = new Set(["/whoop/callback", "/whoop/diag", "/whoop/auth"]);
const tokenMatches = (raw) => {
  if (!PASSWORD) return true;
  if (!raw) return false;
  const candidates = [String(raw).trim()];
  try { candidates.push(decodeURIComponent(String(raw)).trim()); } catch (e) {}
  try { candidates.push(Buffer.from(String(raw), "base64").toString("utf8").trim()); } catch (e) {}
  return candidates.includes(PASSWORD);
};
app.use("/api", (req, res, next) => {
  if (OPEN_PATHS.has(req.path)) return next(); // OAuth redirect + non-sensitive diagnostics
  if (!tokenMatches(req.headers["x-app-token"])) {
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
  const state = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  writeJson("whoop-state.json", { state, at: Date.now() });
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
  const t = readJson("whoop.json", null);
  res.json({
    password_protected: !!PASSWORD,
    password_length: PASSWORD ? PASSWORD.length : 0,
    password_is_ascii: PASSWORD ? /^[\x20-\x7E]*$/.test(PASSWORD) : true,
    client_id_set: !!process.env.WHOOP_CLIENT_ID,
    client_secret_set: !!process.env.WHOOP_CLIENT_SECRET,
    app_url_env: process.env.APP_URL || null,
    redirect_uri_used: appUrl(req) + "/api/whoop/callback",
    connected: !!(t && t.access_token),
    token_expires_in_min: t && t.expires_at ? Math.round((t.expires_at - Date.now()) / 60000) : null,
    timezone: process.env.TIMEZONE || "UTC (set TIMEZONE)",
    auto_adjust: (process.env.AUTO_ADJUST || "on"),
  });
});

app.get("/api/whoop/callback", async (req, res) => {
  const saved = readJson("whoop-state.json", {});
  if (req.query.error) {
    return res.status(400).send(`WHOOP declined the request: ${req.query.error}. ${req.query.error_description || ""}`);
  }
  if (!req.query.code || req.query.state !== saved.state) {
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

async function fetchWhoopSummary() {
  const at = await whoopAccessToken();
  if (!at) return null;
  const j = async (p) => {
    const r = await fetch(WHOOP_HOST + "/developer/v2" + p, { headers: { Authorization: "Bearer " + at } });
    return r.ok ? r.json() : null;
  };
  const [rec, slp, cyc] = await Promise.all([
    j("/recovery?limit=1"),
    j("/activity/sleep?limit=1"),
    j("/cycle?limit=1"),
  ]);
  const recRec = rec && rec.records && rec.records[0];
  const rs = (recRec && recRec.score) || {};
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
    recoveryCreatedAt: (recRec && (recRec.created_at || recRec.updated_at)) || null,
    updated: new Date().toISOString(),
  };
  whoopCache = { at: Date.now(), data };
  return data;
}

app.get("/api/whoop/summary", async (_req, res) => {
  if (whoopCache.data && Date.now() - whoopCache.at < 15 * 60 * 1000) return res.json(whoopCache.data);
  try {
    const data = await fetchWhoopSummary();
    if (!data) return res.status(400).json({ error: "not connected" });
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

async function openaiModels() {
  const r = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: "Bearer " + OPENAI_KEY },
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(`OpenAI /models (${r.status}): ${(e.error && e.error.message) || "request failed"}`);
  }
  const d = await r.json();
  return (d.data || []).map((m) => m.id);
}

async function resolveModel() {
  if (resolvedModel) return resolvedModel;
  if (PROVIDER === "anthropic") {
    resolvedModel = process.env.ANTHROPIC_MODEL || process.env.MODEL || "claude-sonnet-5";
    return resolvedModel;
  }
  const pinned = process.env.OPENAI_MODEL || process.env.MODEL;
  if (pinned) { resolvedModel = pinned.trim(); return resolvedModel; }
  try {
    const ids = await openaiModels();
    for (const want of PREFERRED_OPENAI) {
      const hit = ids.find((id) => id === want) || ids.find((id) => id.startsWith(want));
      if (hit) { resolvedModel = hit; console.log("[ai] auto-selected model:", hit); return hit; }
    }
    // nothing from the preference list — fall back to any chat-capable gpt id
    const any = ids.filter((id) => /^gpt-/.test(id)).sort()[0];
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
    const body = {
      model,
      messages: [{ role: "user", content: String(prompt || "") }],
      // every prompt in this app asks for JSON; this makes parsing reliable
      response_format: { type: "json_object" },
      // newer OpenAI models require max_completion_tokens and reject max_tokens
      max_completion_tokens: cap,
    };
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: "Bearer " + OPENAI_KEY },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) {
      const msg = (data.error && data.error.message) || JSON.stringify(data).slice(0, 300);
      throw new Error(`OpenAI (${r.status}, model ${model}): ${msg}`);
    }
    const choice = (data.choices || [])[0] || {};
    const text = (choice.message && choice.message.content) || "";
    if (!text.trim()) throw new Error(`Model returned no text (finish_reason: ${choice.finish_reason || "unknown"}). Try a higher token limit.`);
    return text;
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
  const data = await r.json();
  if (!r.ok) {
    const msg = (data.error && data.error.message) || JSON.stringify(data).slice(0, 300);
    throw new Error(`Claude API (${r.status}, model ${model}): ${msg}`);
  }
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (!text.trim()) throw new Error(`Model returned no text (stop_reason: ${data.stop_reason || "unknown"}).`);
  return text;
}

app.post("/api/claude", async (req, res) => {
  try {
    const text = await callAI(req.body.prompt, +req.body.max_tokens || 1500);
    res.json({ text });
  } catch (e) {
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
   Every 30 minutes: once WHOOP has synced today's recovery, adjust
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
    const data = readJson("forge.json", null);
    if (!data || !data.profile || !data.plan || !Array.isArray(data.plan.week)) return;
    const today = dateInTz();
    const idx = weekdayIdxInTz();
    if (idx < 0 || data.plan.adjustedDate === today) return;      // already handled today
    const dy = data.plan.week[idx];
    if (!dy || dy.rest || !dy.exercises || !dy.exercises.length) return;

    const sum = await fetchWhoopSummary();
    if (!sum || sum.recovery == null) return;                      // WHOOP not connected / no data
    const recDay = sum.recoveryCreatedAt ? dateInTz(new Date(sum.recoveryCreatedAt)) : today;
    if (recDay !== today) return;                                  // hasn't synced today yet — retry next tick

    if (sum.recovery >= 67) {                                      // green: train as planned
      data.plan.adjustedDate = today;
      writeJson("forge.json", data);
      console.log(`[auto-adjust] ${today}: recovery ${sum.recovery}% — no change needed`);
      return;
    }

    const p = data.profile;
    const gearLabels = (p.gear || []).length ? p.gear.map((g) => GEAR_LABELS[g] || g) : ["Bodyweight only"];
    const prompt = `Adjust today's planned training session to the athlete's recovery. Change only what recovery demands.

Athlete: ${p.level}, goal ${p.goal}.${(p.injuries || []).length ? ` Injuries: ${p.injuries.join("; ")}.` : ""}
Equipment: ${gearLabels.join(", ")}.
WHOOP today: recovery ${sum.recovery}%, HRV ${sum.hrv} ms, RHR ${sum.rhr} bpm, sleep ${sum.sleepHours}h, yesterday's strain ${sum.strain}.
Planned session: ${JSON.stringify(dy)}

Rules:
- Recovery under 34% (red): cut loads 20-30%, drop roughly one set per exercise, and swap the most CNS-taxing lifts (heavy squats/deadlifts) for gentler variants.
- Recovery 34-66% (yellow): trim loads about 10% and reduce total sets slightly. Keep the session's structure.
- Keep the same day name and a similar exercise count. Use ONLY the available equipment.

Respond ONLY with valid JSON, no markdown fences:
{"day":"${dy.day}","rest":false,"focus":"session title","exercises":[{"exercise":"name","sets":3,"reps":"8-10","load":"short guidance"}],"adjust_note":"one short sentence: what changed and why"}`;

    const text = await callAI(prompt, 1200);
    const adj = JSON.parse(text.replace(/```json|```/g, "").trim());
    data.plan.originalDay = { idx, day: dy };
    data.plan.week[idx] = {
      day: adj.day || dy.day, rest: false,
      focus: adj.focus || dy.focus, exercises: adj.exercises || dy.exercises,
    };
    data.plan.adjustedDate = today;
    data.plan.adjustNote = adj.adjust_note || "Adjusted to today's recovery.";
    data.plan.adjustRecovery = sum.recovery;
    delete data.plan.adjustUndone;
    writeJson("forge.json", data);
    console.log(`[auto-adjust] ${today}: ${dy.day} adjusted for recovery ${sum.recovery}%`);
  } catch (e) {
    console.error("[auto-adjust] failed:", String(e.message || e));
  }
}
setInterval(autoAdjustCheck, 30 * 60 * 1000);
setTimeout(autoAdjustCheck, 20 * 1000); // and shortly after boot

/* ---- serve the built frontend ---- */
app.use(express.static(path.join(__dirname, "dist")));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "dist", "index.html")));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Forge running on port " + port + ", data dir: " + DATA_DIR));
