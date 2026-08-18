/* Verifies the service worker never pins the app to an old build.
   Runs sw.js in a fake worker scope and drives its fetch handler. */
import { readFileSync } from "fs";
import vm from "vm";

const listeners = {};
const caches_ = new Map();               // cacheName -> Map(url -> body)
const mkCache = (name) => {
  if (!caches_.has(name)) caches_.set(name, new Map());
  const m = caches_.get(name);
  return {
    addAll: async () => {},
    put: async (req, res) => m.set(typeof req === "string" ? req : req.url, res.body),
    match: async (req) => {
      const k = typeof req === "string" ? req : req.url;
      return m.has(k) ? { body: m.get(k), clone() { return this; } } : undefined;
    },
  };
};

let server = {};                         // url -> body currently on the server
let network = true;

const scope = {
  self: {
    addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
    skipWaiting: () => {}, clients: { claim: () => {} },
    location: { origin: "https://forge.app" },
  },
  caches: {
    open: async (n) => mkCache(n),
    keys: async () => [...caches_.keys()],
    delete: async (n) => caches_.delete(n),
    match: async (req) => {
      for (const n of caches_.keys()) {
        const hit = await mkCache(n).match(req);
        if (hit) return hit;
      }
      return undefined;
    },
  },
  fetch: async (req) => {
    const url = typeof req === "string" ? req : req.url;
    if (!network) throw new Error("offline");
    if (!(url in server)) return { status: 404, body: null, type: "basic", clone() { return this; } };
    return { status: 200, body: server[url], type: "basic", clone() { return this; }, ok: true };
  },
  URL, Response: { error: () => ({ body: "ERR" }) }, console,
};
vm.createContext(scope);
vm.runInContext(readFileSync("public/sw.js", "utf8"), scope);

const req = (url, opts = {}) => ({
  url, method: "GET", mode: opts.mode || "same-origin",
  headers: { get: (h) => (h === "accept" ? (opts.accept || "") : null) },
});

const doFetch = async (r) => {
  let out;
  const e = { request: r, respondWith: (p) => { out = p; } };
  for (const fn of listeners.fetch || []) fn(e);
  return out === undefined ? "PASSTHROUGH(network)" : (await out).body;
};

const t = (label, got, want) =>
  console.log((got === want ? "PASS  " : "FAIL  ") + label + "\n        got " + JSON.stringify(got) +
    (got === want ? "" : "  WANTED " + JSON.stringify(want)));

// --- deploy v1, load the page ---
server = { "https://forge.app/index.html": "HTML-v1", "https://forge.app/assets/app-aaa.js": "JS-v1" };
const html = req("https://forge.app/index.html", { mode: "navigate", accept: "text/html" });
await doFetch(html);
await doFetch(req("https://forge.app/assets/app-aaa.js"));

// --- redeploy: new HTML pointing at a new bundle ---
server = { "https://forge.app/index.html": "HTML-v2", "https://forge.app/assets/app-bbb.js": "JS-v2" };
t("new deploy is picked up (this was the bug)", await doFetch(html), "HTML-v2");
t("new bundle fetched", await doFetch(req("https://forge.app/assets/app-bbb.js")), "JS-v2");

// --- offline ---
network = false;
t("offline still boots from cache", await doFetch(html), "HTML-v2");
t("offline serves cached bundle", await doFetch(req("https://forge.app/assets/app-bbb.js")), "JS-v2");

// --- API must never be cached ---
network = true;
t("API bypasses the worker", await doFetch(req("https://forge.app/api/data")), "PASSTHROUGH(network)");

// --- photos cached for a dead signal ---
server["https://raw.githubusercontent.com/x/0.jpg"] = "IMG";
await doFetch(req("https://raw.githubusercontent.com/x/0.jpg"));
network = false;
t("exercise photo survives offline", await doFetch(req("https://raw.githubusercontent.com/x/0.jpg")), "IMG");
