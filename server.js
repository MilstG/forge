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

/* ---- auth: env password, optional override in auth.json, session cookie ----
   x-app-token still works. After login the browser holds an httpOnly cookie
   so the password is not resent on every request. Change-password writes
   auth.json and does not require a redeploy. */
const ENV_PASSWORD = (process.env.APP_PASSWORD || "").trim();
const authFile = () => readJson("auth.json", { sessions: [] });
const currentPassword = () => (authFile().password || ENV_PASSWORD).trim();
const OPEN_PATHS = new Set(["/whoop/callback", "/whoop/diag", "/whoop/auth", "/auth/login", "/health"]);
const parseCookies = (req) => {
  const out = {};
  String(req.headers.cookie || "").split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
};
const tokenMatches = (raw) => {
  const pw = currentPassword();
  if (!pw) return true;
  if (!raw) return false;
  const candidates = [String(raw).trim()];
  try { candidates.push(decodeURIComponent(String(raw)).trim()); } catch (e) {}
  try { candidates.push(Buffer.from(String(raw), "base64").toString("utf8").trim()); } catch (e) {}
  return candidates.includes(pw);
};
const sessionOk = (req) => {
  const tok = parseCookies(req).forge_session;
  if (!tok) return false;
  const sessions = authFile().sessions || [];
  return sessions.some((s) => s.token === tok && (!s.exp || s.exp > Date.now()));
};
app.use("/api", (req, res, next) => {
  if (OPEN_PATHS.has(req.path)) return next();
  if (sessionOk(req) || tokenMatches(req.headers["x-app-token"])) return next();
  return res.status(401).json({ error: "unauthorized" });
});

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
app.post("/api/auth/login", (req, res) => {
  const pw = String((req.body && req.body.password) || "").trim();
  if (currentPassword() && pw !== currentPassword()) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const token = crypto.randomBytes(24).toString("hex");
  const auth = authFile();
  auth.sessions = (auth.sessions || []).filter((s) => s.exp > Date.now()).slice(-8);
  auth.sessions.push({ token, exp: Date.now() + 30 * 24 * 3600 * 1000, at: Date.now() });
  writeJson("auth.json", auth);
  res.setHeader("Set-Cookie", `forge_session=${token}; ${cookieFlags()}`);
  res.json({ ok: true, session: true });
});
app.post("/api/auth/logout", (req, res) => {
  const tok = parseCookies(req).forge_session;
  const auth = authFile();
  auth.sessions = (auth.sessions || []).filter((s) => s.token !== tok);
  writeJson("auth.json", auth);
  res.setHeader("Set-Cookie", "forge_session=; HttpOnly; Path=/; Max-Age=0");
  res.json({ ok: true });
});
app.post("/api/auth/password", (req, res) => {
  const current = String((req.body && req.body.current) || "").trim();
  const next = String((req.body && req.body.next) || "").trim();
  if (!next || next.length < 4) return res.status(400).json({ error: "new password too short" });
  if (currentPassword() && current !== currentPassword()) {
    return res.status(401).json({ error: "current password does not match" });
  }
  const auth = authFile();
  auth.password = next;
  auth.sessions = []; // force re-login
  writeJson("auth.json", auth);
  res.setHeader("Set-Cookie", "forge_session=; HttpOnly; Path=/; Max-Age=0");
  res.json({ ok: true });
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
    password_protected: !!currentPassword(),
    password_length: currentPassword() ? currentPassword().length : 0,
    password_is_ascii: currentPassword() ? /^[\x20-\x7E]*$/.test(currentPassword()) : true,
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

  // Persist a daily snapshot — correlations need history, not just today.
  try {
    const day = data.recoveryCreatedAt ? dateInTz(new Date(data.recoveryCreatedAt)) : dateInTz();
    if (data.recovery != null) {
      const hist = readJson("whoop-history.json", []);
      const rest = hist.filter((h) => h.date !== day);
      rest.push({
        date: day, recovery: data.recovery, hrv: data.hrv, rhr: data.rhr,
        sleepHours: data.sleepHours, sleepPerf: data.sleepPerf, strain: data.strain,
      });
      rest.sort((a, b) => (a.date < b.date ? -1 : 1));
      writeJson("whoop-history.json", rest.slice(-400));
    }
  } catch (e) { console.error("[whoop] history write failed", String(e.message || e)); }

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

app.get("/api/whoop/history", (_req, res) => res.json(readJson("whoop-history.json", [])));

app.post("/api/whoop/disconnect", (_req, res) => {
  try { fs.unlinkSync(fileFor("whoop.json")); } catch (e) {}
  whoopCache = { at: 0, data: null };
  res.json({ ok: true });
});

/* ---- data endpoints + plan/data snapshots ---- */
const snapshotPush = (reason, data) => {
  try {
    const hist = readJson("forge-history.json", []);
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
    writeJson("forge-history.json", hist.slice(-20));
  } catch (e) {
    console.error("[snapshot]", String(e.message || e));
  }
};

app.get("/api/data", (_req, res) => res.json(readJson("forge.json", {})));
app.put("/api/data", (req, res) => {
  const incoming = req.body || {};
  const prev = readJson("forge.json", {});
  const planChanged = JSON.stringify(prev.plan || null) !== JSON.stringify(incoming.plan || null);
  const deletedWorkout = (prev.workouts || []).length > (incoming.workouts || []).length;
  if (planChanged || deletedWorkout) snapshotPush(planChanged ? "plan" : "workout-delete", prev);
  writeJson("forge.json", incoming);
  res.json({ ok: true, snapshotted: planChanged || deletedWorkout });
});
app.get("/api/data/history", (_req, res) => {
  const hist = readJson("forge-history.json", []);
  res.json(hist.map((h, i) => ({ i, at: h.at, reason: h.reason })));
});
app.post("/api/data/undo", (req, res) => {
  const hist = readJson("forge-history.json", []);
  const last = hist.pop();
  if (!last) return res.status(400).json({ error: "nothing to undo" });
  const current = readJson("forge.json", {});
  writeJson("forge.json", { ...current, ...last.data });
  writeJson("forge-history.json", hist);
  res.json({ ok: true, restored: last.reason, at: last.at, data: { ...current, ...last.data } });
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
    if (idx < 0) return;
    if (!canAutoAdjust({ plan: data.plan, workouts: data.workouts, today, todayIdx: idx })) return;
    const dy = data.plan.week[idx];

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
    snapshotPush("auto-adjust", data);
    data.plan = applyAutoAdjust(data.plan, {
      ...adj,
      exercises: sanitized.week[idx].exercises,
      adjustRecovery: sum.recovery,
      adjustReason: reason.summary,
    }, { today, todayIdx: idx, neverSwapCompounds: !!p.neverSwapCompounds });
    delete data.plan.adjustUndone;
    writeJson("forge.json", data);
    console.log(`[auto-adjust] ${today}: ${dy.day} adjusted for ${reason.summary}`);
  } catch (e) {
    console.error("[auto-adjust] failed:", String(e.message || e));
  }
}
setInterval(autoAdjustCheck, 30 * 60 * 1000);
setTimeout(autoAdjustCheck, 20 * 1000); // and shortly after boot

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

const pushPrefs = () => ({ ...DEFAULT_PUSH_PREFS, ...(readJson("push-prefs.json", {}) || {}) });
const pushSubs = () => readJson("push-subs.json", []);
const savePushSubs = (list) => writeJson("push-subs.json", list);

/* Send to every subscription, dropping the ones the push service says are dead.
   404/410 means the browser threw the subscription away — keeping it would
   make every future send fail. */
async function pushSend(payload) {
  const subs = pushSubs();
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
  if (alive.length !== subs.length) savePushSubs(alive);
  return { sent, dropped: subs.length - alive.length };
}

app.get("/api/push/config", (_req, res) => {
  res.json({
    publicKey: vapid.publicKey,
    subscriptions: pushSubs().length,
    prefs: pushPrefs(),
    timezone: TZNAME,
  });
});

app.post("/api/push/subscribe", (req, res) => {
  const sub = req.body && req.body.subscription;
  if (!sub || !sub.endpoint) return res.status(400).json({ error: "missing subscription" });
  const list = pushSubs().filter((s) => s.sub.endpoint !== sub.endpoint);
  list.push({ sub, at: Date.now(), ua: String(req.headers["user-agent"] || "").slice(0, 160) });
  savePushSubs(list.slice(-10)); // a handful of devices is plenty
  res.json({ ok: true, subscriptions: list.length });
});

app.post("/api/push/unsubscribe", (req, res) => {
  const ep = req.body && req.body.endpoint;
  const list = pushSubs().filter((s) => s.sub.endpoint !== ep);
  savePushSubs(list);
  res.json({ ok: true, subscriptions: list.length });
});

app.put("/api/push/prefs", (req, res) => {
  const incoming = req.body || {};
  const next = { ...pushPrefs() };
  ["train", "weigh", "unlogged", "adjusted"].forEach((k) => {
    if (typeof incoming[k] === "boolean") next[k] = incoming[k];
  });
  ["morningHour", "eveningHour"].forEach((k) => {
    const v = +incoming[k];
    if (Number.isInteger(v) && v >= 0 && v <= 23) next[k] = v;
  });
  writeJson("push-prefs.json", next);
  res.json({ ok: true, prefs: next });
});

app.post("/api/push/test", async (_req, res) => {
  if (!pushSubs().length) return res.status(400).json({ error: "no devices subscribed" });
  const out = await pushSend({
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

function alreadySent(key) {
  const log = readJson("push-sent.json", {});
  return !!log[key];
}
function markSent(key) {
  const log = readJson("push-sent.json", {});
  log[key] = Date.now();
  // keep the file from growing forever
  const keys = Object.keys(log).sort();
  if (keys.length > 200) keys.slice(0, keys.length - 200).forEach((k) => delete log[k]);
  writeJson("push-sent.json", log);
}

async function fireOnce(key, payload) {
  if (alreadySent(key)) return false;
  markSent(key); // mark first: a failed send is better than a doubled one
  const out = await pushSend(payload);
  console.log(`[push] ${key} -> ${out.sent} device(s)`);
  return true;
}

async function pushCheck() {
  try {
    if (!pushSubs().length) return;
    const due = dueReminders({
      data: readJson("forge.json", null),
      prefs: pushPrefs(),
      today: dateInTz(),
      idx: weekdayIdxInTz(),
      hour: hourInTz(),
    });
    for (const r of due) await fireOnce(r.key, r.payload);
  } catch (e) {
    console.error("[push] scheduler failed:", String(e.message || e));
  }
}
setInterval(pushCheck, 5 * 60 * 1000);
setTimeout(pushCheck, 30 * 1000);

/* ---- serve the built frontend ---- */
app.use(express.static(path.join(__dirname, "dist")));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "dist", "index.html")));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Forge running on port " + port + ", data dir: " + DATA_DIR));
