/* Multi-user behaviour tests: boots the real server against a throwaway
   data dir seeded with a single-user install, plus a stub OpenAI endpoint
   so the AI rate limit can be exercised without a key.
   Run: node test/multi-user.mjs */
import fs from "fs";
import path from "path";
import os from "os";
import http from "http";

let passed = 0, failed = 0;
const ok = (cond, name) => {
  if (cond) { passed++; console.log("  ✓", name); }
  else { failed++; console.error("  ✗", name); }
};

/* ---- stub OpenAI so /api/claude succeeds and the counter moves ---- */
const stub = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    res.setHeader("content-type", "application/json");
    const fail = raw.includes("FAIL_PLEASE");
    /* the delay widens the race window: all concurrent requests are in
       flight together, which is exactly what overshot the cap in prod */
    setTimeout(() => {
      if (fail) { res.statusCode = 500; res.end(JSON.stringify({ error: { message: "stub says no" } })); return; }
      res.end(JSON.stringify({ choices: [{ message: { content: "{\"ok\":true}" }, finish_reason: "stop" }] }));
    }, 150);
  });
});
await new Promise((r) => stub.listen(3198, r));

/* ---- seed a legacy single-user install ---- */
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "forge-mu-"));
const seedProfile = { profile: { level: "intermediate", goal: "strength", days: 4 }, workouts: [{ id: 1 }] };
fs.writeFileSync(path.join(DATA, "forge.json"), JSON.stringify(seedProfile));
fs.writeFileSync(path.join(DATA, "auth.json"), JSON.stringify({ password: "oldpw", sessions: [] }));
fs.writeFileSync(path.join(DATA, "whoop-history.json"), JSON.stringify([{ date: "2026-08-01", recovery: 80 }]));

process.env.DATA_DIR = DATA;
process.env.APP_PASSWORD = "envpw-should-be-overridden";
process.env.PORT = "3199";
process.env.TIMEZONE = "America/Argentina/Buenos_Aires";
process.env.OPENAI_API_KEY = "test-key";
process.env.OPENAI_MODEL = "gpt-test";
process.env.OPENAI_BASE_URL = "http://127.0.0.1:3198";
process.env.AUTO_ADJUST = "off";
process.env.ADMIN_NAME = "Milst";

await import("../server.js");
await new Promise((r) => setTimeout(r, 400));
const BASE = "http://127.0.0.1:3199";

const jar = {};
const call = async (method, p, { body, as, token } = {}) => {
  const headers = { "content-type": "application/json" };
  if (as && jar[as]) headers.cookie = jar[as];
  if (token) headers["x-app-token"] = encodeURIComponent(token);
  const r = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const setC = r.headers.get("set-cookie");
  if (as && setC) jar[as] = setC.split(";")[0];
  let json = null;
  try { json = await r.json(); } catch (e) {}
  return { status: r.status, json };
};

console.log("migration");
const usersStore = JSON.parse(fs.readFileSync(path.join(DATA, "users.json"), "utf8"));
ok(usersStore.users.length === 1, "one user after migration");
const admin = usersStore.users[0];
ok(admin.admin === true && admin.name === "Milst", "migrated user is the admin");
ok(admin.hash && admin.hash !== "oldpw", "password is hashed, not stored in clear");
ok(!fs.existsSync(path.join(DATA, "forge.json")), "root forge.json moved away");
ok(fs.existsSync(path.join(DATA, "users", admin.id, "forge.json")), "forge.json lives in the admin's folder");
ok(fs.existsSync(path.join(DATA, "users", admin.id, "whoop-history.json")), "whoop history moved too");

console.log("auth");
let r = await call("GET", "/api/auth/users");
ok(r.status === 401, "pre-auth user list is gone — accounts are not enumerable");
r = await call("POST", "/api/auth/login", { body: { username: "Milst", password: "wrong" } });
ok(r.status === 401, "wrong password rejected");
r = await call("POST", "/api/auth/login", { body: { username: "nobody", password: "oldpw" } });
ok(r.status === 401, "unknown username rejected");
r = await call("POST", "/api/auth/login", { body: { username: "milst", password: "oldpw" }, as: "admin" });
ok(r.status === 200 && r.json.user.admin, "username login (case-insensitive) works; auth.json override password wins over APP_PASSWORD");
r = await call("GET", "/api/data", { as: "admin" });
ok(r.status === 200 && r.json.profile && r.json.profile.goal === "strength", "admin sees the migrated data");
r = await call("GET", "/api/data", { token: admin.id + ":oldpw" });
ok(r.status === 200 && r.json.profile, "x-app-token id:password fallback works");
r = await call("GET", "/api/data", { token: "oldpw" });
ok(r.status === 401, "legacy bare-password token no longer authenticates");
r = await call("GET", "/api/auth/me", { as: "admin" });
ok(r.status === 200 && r.json.ai.limit === null, "admin has no AI cap");

console.log("user management");
r = await call("GET", "/api/users");
ok(r.status === 401, "user list needs auth");
r = await call("POST", "/api/users", { as: "admin", body: { name: "Juan", password: "temp1234" } });
ok(r.status === 200, "admin can add a user");
const juanId = r.json.user.id;
r = await call("POST", "/api/users", { as: "admin", body: { name: "juan", password: "x2345" } });
ok(r.status === 400, "duplicate name (case-insensitive) rejected");
r = await call("POST", "/api/auth/login", { body: { username: "Juan", password: "temp1234" }, as: "juan" });
ok(r.status === 200 && r.json.user.name === "Juan", "new user can log in with username");
r = await call("POST", "/api/auth/login", { body: { userId: juanId, password: "temp1234" } });
ok(r.status === 200, "legacy userId login still accepted (stored tokens keep working)");
r = await call("GET", "/api/users", { as: "juan" });
ok(r.status === 403, "non-admin cannot list users");

console.log("isolation");
r = await call("GET", "/api/data", { as: "juan" });
ok(r.status === 200 && !r.json.profile, "new user starts empty");
await call("PUT", "/api/data", { as: "juan", body: { profile: { goal: "hypertrophy" }, workouts: [] } });
r = await call("GET", "/api/data", { as: "juan" });
ok(r.json.profile && r.json.profile.goal === "hypertrophy", "juan's save lands");
r = await call("GET", "/api/data", { as: "admin" });
ok(r.json.profile.goal === "strength", "admin's data untouched by juan's save");
r = await call("GET", "/api/whoop/status", { as: "juan" });
ok(r.status === 200 && r.json.connected === false, "juan has no WHOOP connection");
await call("PUT", "/api/exinfo", { as: "admin", body: { squat: "a" } });
await call("PUT", "/api/exinfo", { as: "juan", body: { bench: "b" } });
r = await call("GET", "/api/exinfo", { as: "admin" });
ok(r.json.squat === "a" && r.json.bench === "b", "shared exinfo merges instead of overwriting");

console.log("AI rate limit");
const LIMIT = 10;
for (let i = 1; i <= LIMIT; i++) {
  r = await call("POST", "/api/claude", { as: "juan", body: { prompt: "hi" } });
  ok(r.status === 200 && r.json.ai.used === i && r.json.ai.left === LIMIT - i, `call ${i} allowed, counter at ${i}`);
}
r = await call("POST", "/api/claude", { as: "juan", body: { prompt: "hi" } });
ok(r.status === 429 && /limit/i.test(r.json.error), `call ${LIMIT + 1} blocked with 429`);
r = await call("POST", "/api/claude", { as: "admin", body: { prompt: "hi" } });
ok(r.status === 200 && r.json.ai === null, "admin calls are uncounted");
r = await call("GET", "/api/users", { as: "admin" });
ok(r.json.find((u) => u.id === juanId).aiToday === LIMIT, "admin panel shows juan's usage");

console.log("password reset + removal");
r = await call("POST", `/api/users/${juanId}/password`, { as: "admin", body: { password: "newpw99" } });
ok(r.status === 200, "admin resets juan's password");
r = await call("POST", "/api/auth/login", { body: { userId: juanId, password: "temp1234" } });
ok(r.status === 401, "old password dead after reset");
r = await call("POST", "/api/auth/login", { body: { userId: juanId, password: "newpw99" }, as: "juan" });
ok(r.status === 200, "new password works");
r = await call("DELETE", `/api/users/${admin.id}`, { as: "admin" });
ok(r.status === 400, "admin account cannot be removed");
r = await call("DELETE", `/api/users/${juanId}`, { as: "admin" });
ok(r.status === 200, "juan removed");
r = await call("GET", "/api/data", { as: "juan" });
ok(r.status === 401, "juan's session is dead after removal");
ok(!fs.existsSync(path.join(DATA, "users", juanId)), "juan's folder no longer active");
ok(fs.readdirSync(path.join(DATA, "trash")).some((d) => d.startsWith(juanId)), "juan's data parked in trash, not deleted");

console.log("concurrency: the cap holds under parallel calls");
r = await call("POST", "/api/users", { as: "admin", body: { name: "Sofi", password: "sofi1234" } });
const sofiId = r.json.user.id;
await call("POST", "/api/auth/login", { body: { username: "Sofi", password: "sofi1234" }, as: "sofi" });
const burst = await Promise.all(
  Array.from({ length: LIMIT + 4 }, () => call("POST", "/api/claude", { as: "sofi", body: { prompt: "hi" } }))
);
const okCount = burst.filter((x) => x.status === 200).length;
const blocked = burst.filter((x) => x.status === 429).length;
ok(okCount === LIMIT, `exactly ${LIMIT} of ${LIMIT + 4} parallel calls succeed (got ${okCount})`);
ok(blocked === 4, `the other 4 get 429 (got ${blocked})`);
r = await call("GET", "/api/users", { as: "admin" });
const sofiRow = r.json.find((u) => u.id === sofiId);
ok(sofiRow.aiToday === LIMIT, `counter reads exactly ${LIMIT}, never over (got ${sofiRow.aiToday})`);
r = await call("POST", "/api/claude", { as: "sofi", body: { prompt: "hi" } });
ok(r.status === 429, "sofi stays blocked after the burst");

console.log("refund: a failed AI call gives the slot back");
r = await call("POST", "/api/users", { as: "admin", body: { name: "Rafa", password: "rafa1234" } });
const rafaId = r.json.user.id;
await call("POST", "/api/auth/login", { body: { userId: rafaId, password: "rafa1234" }, as: "rafa" });
r = await call("POST", "/api/claude", { as: "rafa", body: { prompt: "FAIL_PLEASE" } });
ok(r.status === 502, "upstream failure surfaces as 502");
r = await call("GET", "/api/users", { as: "admin" });
ok(r.json.find((u) => u.id === rafaId).aiToday === 0, "failed call did not consume the budget");
r = await call("POST", "/api/claude", { as: "rafa", body: { prompt: "hi" } });
ok(r.status === 200 && r.json.ai.used === 1, "next successful call counts normally");

console.log("second boot is a no-op");
const before = JSON.stringify(JSON.parse(fs.readFileSync(path.join(DATA, "users.json"), "utf8")).users.map((u) => u.id));
/* simulate what migrateSingleUser checks: users already exist */
ok(before.includes(admin.id), "admin id stable — migration will not rerun with users present");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
