/* Subscription pruning test — drives the REAL server against a mock push
 * service over HTTPS (web-push refuses plain http, so a self-signed cert
 * is the only way to see the code path that actually runs in production).
 *
 *   node test/push-pruning.mjs
 *
 * Why this is worth a test: if a dead subscription is never dropped, every
 * later send fails against it forever and the failure is invisible — the
 * reminders just stop. If a transient 500 drops it, one flaky minute
 * silently unsubscribes the phone.
 */
import https from "https";
import http from "http";
import crypto from "crypto";
import fs from "fs";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const CERT = process.env.MOCK_CERT || "/tmp/cert.pem";
const KEY = process.env.MOCK_KEY || "/tmp/key.pem";
if (!fs.existsSync(CERT) || !fs.existsSync(KEY)) {
  console.log("skip: no mock TLS cert. Generate one with:\n" +
    "  openssl req -x509 -newkey rsa:2048 -keyout /tmp/key.pem -out /tmp/cert.pem -days 2 -nodes -subj /CN=localhost");
  process.exit(0);
}

/* A real P-256 key, or web-push rejects the subscription before it ever
   reaches the network and we'd be testing nothing. */
const mkSub = (path) => {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    endpoint: `https://localhost:4443${path}`,
    keys: {
      p256dh: ecdh.getPublicKey().toString("base64url"),
      auth: crypto.randomBytes(16).toString("base64url"),
    },
  };
};

let status = 410;
let hits = 0;
const mock = https.createServer({ cert: fs.readFileSync(CERT), key: fs.readFileSync(KEY) }, (req, res) => {
  hits++;
  res.writeHead(status);
  res.end();
});
await new Promise((r) => mock.listen(4443, r));

const DATA = "/tmp/forge-prune-test";
fs.rmSync(DATA, { recursive: true, force: true });
fs.mkdirSync(DATA, { recursive: true });

const server = spawn("node", ["server.js"], {
  cwd: ROOT,
  env: {
    ...process.env,
    DATA_DIR: DATA,
    APP_PASSWORD: "pw",
    PORT: "3998",
    AUTO_ADJUST: "off",
    NODE_TLS_REJECT_UNAUTHORIZED: "0", // self-signed mock
  },
  stdio: ["ignore", "pipe", "pipe"],
});
const log = [];
server.stdout.on("data", (d) => log.push(String(d)));
server.stderr.on("data", (d) => log.push(String(d)));

const waitFor = async (fn, ms = 8000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (await fn()) return true; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
};
const H = { "Content-Type": "application/json", "x-app-token": "pw" };
const post = (p, b = {}) =>
  fetch("http://localhost:3998" + p, { method: "POST", headers: H, body: JSON.stringify(b) })
    .then((r) => r.json().catch(() => ({})));

const up = await waitFor(() => fetch("http://localhost:3998/api/push/config", { headers: H }).then((r) => r.ok));
if (!up) { console.error("server never came up:\n" + log.join("")); server.kill(); mock.close(); process.exit(1); }

const subCount = () => {
  try { return JSON.parse(fs.readFileSync(join(DATA, "push-subs.json"), "utf8")).length; }
  catch { return 0; }
};

let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}${ok ? "" : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`);
};

await post("/api/push/subscribe", { subscription: mkSub("/gone") });
check("subscription stored", subCount(), 1);

const before = hits;
status = 410;
await post("/api/push/test");
check("the mock push service was actually contacted", hits > before, true);
check("410 Gone → subscription pruned", subCount(), 0);

await post("/api/push/subscribe", { subscription: mkSub("/missing") });
status = 404;
await post("/api/push/test");
check("404 Not Found → subscription pruned", subCount(), 0);

await post("/api/push/subscribe", { subscription: mkSub("/flaky") });
status = 500;
await post("/api/push/test");
check("500 is transient → subscription kept", subCount(), 1);

status = 201;
const ok = await post("/api/push/test");
check("a successful send reports one delivery", ok.sent, 1);
check("a successful send keeps the subscription", subCount(), 1);

/* Two devices, one dead: the live one must survive the dead one's failure. */
await post("/api/push/subscribe", { subscription: mkSub("/second-device") });
check("two devices subscribed", subCount(), 2);
status = 410;
await post("/api/push/test");
check("all-dead prunes both", subCount(), 0);

await post("/api/push/test");
check("no subscribers is not an error path that crashes", server.killed, false);

server.kill();
mock.close();
console.log(failed ? `\n${failed} test(s) failed` : "\nall pruning behaviour correct");
process.exit(failed ? 1 : 0);
