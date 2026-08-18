import { useState, useEffect, useRef } from "react";

/* ================= design tokens =================
   Direction: machinist's instrument panel. Warm near-black surfaces,
   ember accent, hairline rules. Three type roles — condensed display
   for headings, grotesk for prose, mono for every number. */
const T = {
  bg: "#0B0C0F",
  surface: "#141619",
  surface2: "#1B1E23",
  raised: "#22262C",
  line: "#25292F",
  lineSoft: "rgba(255,255,255,0.06)",
  text: "#EDEEF0",
  sub: "#8B9099",
  dim: "#5E636B",
  accent: "#FF5F2E",
  accentDim: "rgba(255,95,46,0.12)",
  accentGlow: "rgba(255,95,46,0.28)",
  good: "#3FD69A",
  goodDim: "rgba(63,214,154,0.10)",
  blue: "#63A0FF",
  blueDim: "rgba(99,160,255,0.10)",
  gold: "#F2B437",
  goldDim: "rgba(242,180,55,0.10)",
  red: "#FF6B5A",
  redDim: "rgba(255,107,90,0.10)",
};

const FD = "'Saira Condensed','Arial Narrow',Impact,sans-serif";  // display
const FB = "'Inter',system-ui,-apple-system,'Segoe UI',sans-serif"; // body
const FM = "'JetBrains Mono','SFMono-Regular',Menlo,monospace";     // numerals

const display = {
  fontFamily: FD,
  textTransform: "uppercase",
  letterSpacing: "0.015em",
  fontWeight: 700,
  lineHeight: 1.05,
};
const mono = {
  fontFamily: FM,
  fontVariantNumeric: "tabular-nums",
  fontFeatureSettings: "'tnum' 1",
};

/* ================= pictograms ================= */
const P = ({ children }) => (
  <svg viewBox="0 0 64 64" width="100%" height="100%" fill="none"
    stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const ICONS = {
  squat: (<P><circle cx="30" cy="14" r="5" /><path d="M30 19v10l-8 10v12" /><path d="M30 29l8 10v12" /><path d="M10 24h40" /><circle cx="12" cy="24" r="3.5" /><circle cx="52" cy="24" r="3.5" /></P>),
  hinge: (<P><circle cx="24" cy="16" r="5" /><path d="M24 21l12 10-2 16" /><path d="M24 21c-6 4-8 10-6 16" /><path d="M14 50h22" /><circle cx="14" cy="50" r="3.5" /><circle cx="38" cy="50" r="3.5" /></P>),
  lunge: (<P><circle cx="32" cy="12" r="5" /><path d="M32 17v14" /><path d="M32 31l-12 8v11" /><path d="M32 31l10 4 4 15" /><path d="M20 50h8M42 50h8" /></P>),
  pressH: (<P><path d="M10 40h44" /><path d="M18 40v6M46 40v6" /><circle cx="30" cy="33" r="4.5" /><path d="M30 37l4 3h10" /><path d="M14 24h36" /><circle cx="14" cy="24" r="3.5" /><circle cx="50" cy="24" r="3.5" /><path d="M32 24v9" /></P>),
  pressV: (<P><circle cx="32" cy="22" r="5" /><path d="M32 27v14l-6 10M32 41l6 10" /><path d="M14 12h36" /><circle cx="14" cy="12" r="3.5" /><circle cx="50" cy="12" r="3.5" /><path d="M26 27l6-11M38 27l-6-11" /></P>),
  pullup: (<P><path d="M8 10h48" /><circle cx="32" cy="24" r="5" /><path d="M22 12l10 7 10-7" /><path d="M32 29v12l-5 9M32 41l5 9" /></P>),
  row: (<P><circle cx="20" cy="16" r="5" /><path d="M20 21l14 8 12-2" /><path d="M34 29l-2 18M20 21c-5 5-6 12-3 18" /><path d="M40 42h14" /><circle cx="40" cy="42" r="3.5" /><circle cx="54" cy="42" r="3.5" /><path d="M46 29v13" /></P>),
  curl: (<P><circle cx="32" cy="14" r="5" /><path d="M32 19v20l-6 12M32 39l6 12" /><path d="M32 24l10 2 4-8" /><circle cx="48" cy="16" r="3.5" /><path d="M32 24l-10 2-4-8" /><circle cx="16" cy="16" r="3.5" /></P>),
  plank: (<P><circle cx="14" cy="26" r="5" /><path d="M18 30l30 8" /><path d="M48 38l8 6" /><path d="M14 31v9l4 4" /><path d="M8 52h48" /></P>),
  pushup: (<P><circle cx="16" cy="24" r="5" /><path d="M20 28l28 6" /><path d="M48 34l8 8" /><path d="M18 29l-2 13" /><path d="M8 50h48" /></P>),
  raise: (<P><circle cx="32" cy="14" r="5" /><path d="M32 19v20l-6 12M32 39l6 12" /><path d="M32 24h-16M32 24h16" /><circle cx="14" cy="24" r="3.5" /><circle cx="50" cy="24" r="3.5" /></P>),
  run: (<P><circle cx="36" cy="12" r="5" /><path d="M36 17l-8 10 6 8-4 14" /><path d="M28 27l14 2 6 8" /><path d="M28 27l-12 4" /></P>),
  rest: (<P><path d="M12 44c0-10 9-18 20-18s20 8 20 18" /><path d="M8 44h48" /><path d="M22 18l4-4M32 14v-6M42 18l-4-4" /></P>),
};

const LIB = [
  { name: "Back squat", group: "Legs", icon: "squat", gear: ["barbell"] },
  { name: "Goblet squat", group: "Legs", icon: "squat", gear: ["dumbbells", "kettlebell"] },
  { name: "Leg press", group: "Legs", icon: "squat", gear: ["machines"] },
  { name: "Bodyweight squat", group: "Legs", icon: "squat", gear: [] },
  { name: "Lunge", group: "Legs", icon: "lunge", gear: [] },
  { name: "Bulgarian split squat", group: "Legs", icon: "lunge", gear: ["dumbbells"] },
  { name: "Deadlift", group: "Back", icon: "hinge", gear: ["barbell"] },
  { name: "Romanian deadlift", group: "Hamstrings", icon: "hinge", gear: ["barbell", "dumbbells"] },
  { name: "Kettlebell swing", group: "Hamstrings", icon: "hinge", gear: ["kettlebell"] },
  { name: "Hip thrust", group: "Glutes", icon: "hinge", gear: ["barbell"] },
  { name: "Bench press", group: "Chest", icon: "pressH", gear: ["barbell"] },
  { name: "Dumbbell bench press", group: "Chest", icon: "pressH", gear: ["dumbbells"] },
  { name: "Push-up", group: "Chest", icon: "pushup", gear: [] },
  { name: "Overhead press", group: "Shoulders", icon: "pressV", gear: ["barbell", "dumbbells"] },
  { name: "Lateral raise", group: "Shoulders", icon: "raise", gear: ["dumbbells"] },
  { name: "Pull-up", group: "Back", icon: "pullup", gear: ["pullup-bar"] },
  { name: "Chin-up", group: "Back", icon: "pullup", gear: ["pullup-bar"] },
  { name: "Lat pulldown", group: "Back", icon: "pullup", gear: ["machines"] },
  { name: "Barbell row", group: "Back", icon: "row", gear: ["barbell"] },
  { name: "Dumbbell row", group: "Back", icon: "row", gear: ["dumbbells"] },
  { name: "Band row", group: "Back", icon: "row", gear: ["bands"] },
  { name: "Biceps curl", group: "Arms", icon: "curl", gear: ["dumbbells", "barbell", "bands"] },
  { name: "Triceps extension", group: "Arms", icon: "raise", gear: ["dumbbells", "bands", "machines"] },
  { name: "Plank", group: "Core", icon: "plank", gear: [] },
  { name: "Crunch", group: "Core", icon: "plank", gear: [] },
  { name: "Run", group: "Cardio", icon: "run", gear: [] },
  { name: "Bike", group: "Cardio", icon: "run", gear: ["cardio"] },
];

const iconFor = (name) => {
  const n = (name || "").toLowerCase();
  const hit = LIB.find((e) => e.name.toLowerCase() === n) ||
    LIB.find((e) => n.includes(e.name.toLowerCase()) || e.name.toLowerCase().includes(n));
  if (hit) return ICONS[hit.icon];
  if (/squat|leg press/.test(n)) return ICONS.squat;
  if (/deadlift|hinge|swing|thrust|good ?morning/.test(n)) return ICONS.hinge;
  if (/lunge|split/.test(n)) return ICONS.lunge;
  if (/bench|chest press|fly/.test(n)) return ICONS.pressH;
  if (/push-?up/.test(n)) return ICONS.pushup;
  if (/overhead|shoulder press|ohp|military/.test(n)) return ICONS.pressV;
  if (/pull-?up|chin|pulldown/.test(n)) return ICONS.pullup;
  if (/row/.test(n)) return ICONS.row;
  if (/curl/.test(n)) return ICONS.curl;
  if (/raise|extension|pushdown|dip/.test(n)) return ICONS.raise;
  if (/plank|crunch|sit-?up|core|ab/.test(n)) return ICONS.plank;
  if (/run|bike|sprint|jog|cardio|elliptical|walk/.test(n)) return ICONS.run;
  return ICONS.raise;
};
const groupFor = (name) => {
  const n = (name || "").toLowerCase();
  const hit = LIB.find((e) => n.includes(e.name.toLowerCase()) || e.name.toLowerCase().includes(n));
  if (hit) return hit.group;
  if (/squat|leg|lunge|calf/.test(n)) return "Legs";
  if (/rdl|romanian|hamstring|swing/.test(n)) return "Hamstrings";
  if (/glute|thrust/.test(n)) return "Glutes";
  if (/deadlift|row|pull|chin|lat/.test(n)) return "Back";
  if (/bench|chest|push-?up|fly/.test(n)) return "Chest";
  if (/shoulder|overhead|raise|ohp/.test(n)) return "Shoulders";
  if (/curl|triceps|dip|extension/.test(n)) return "Arms";
  if (/plank|crunch|core|ab/.test(n)) return "Core";
  if (/run|bike|cardio|sprint|walk/.test(n)) return "Cardio";
  return "Other";
};

const GOALS = ["Build strength", "Build muscle", "Lose fat", "Endurance", "General fitness"];
const LEVELS = ["Beginner", "Intermediate", "Advanced"];
const GEAR = [
  ["barbell", "Barbell & plates"], ["dumbbells", "Dumbbells"], ["kettlebell", "Kettlebell"],
  ["bands", "Resistance bands"], ["pullup-bar", "Pull-up bar"], ["machines", "Gym machines"], ["cardio", "Cardio machines"],
];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const emptyEx = () => ({ name: "", sets: "", reps: "", weight: "" });

/* ================= gamification ================= */
const xpOf = (ws) => ws.reduce((s, w) => s + 50 + w.exercises.length * 10, 0);
const levelOf = (xp) => Math.floor(Math.sqrt(xp / 100));
const levelFloor = (lv) => lv * lv * 100;
const BADGES = [
  { id: "first", label: "First session", test: (s) => s.count >= 1 },
  { id: "five", label: "5 sessions", test: (s) => s.count >= 5 },
  { id: "fifteen", label: "15 sessions", test: (s) => s.count >= 15 },
  { id: "thirty", label: "30 sessions", test: (s) => s.count >= 30 },
  { id: "vol50", label: "50k volume", test: (s) => s.volume >= 50000 },
  { id: "vol250", label: "250k volume", test: (s) => s.volume >= 250000 },
  { id: "pr5", label: "5 PRs", test: (s) => s.prCount >= 5 },
  { id: "streak3", label: "3-week streak", test: (s) => s.streak >= 3 },
  { id: "streak8", label: "8-week streak", test: (s) => s.streak >= 8 },
];

/* ================= API helpers (server-backed) ================= */
let APP_TOKEN = null;
try { APP_TOKEN = localStorage.getItem("forge-token"); } catch (e) {}
// HTTP headers can't carry non-ASCII (accents, ñ, emoji), so the token is
// percent-encoded here and decoded server-side.
const apiHeaders = () => ({
  "Content-Type": "application/json",
  ...(APP_TOKEN ? { "x-app-token": encodeURIComponent(APP_TOKEN) } : {}),
});

async function askClaude(prompt, maxTokens = 1500) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ prompt, max_tokens: maxTokens }),
  });
  let data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (${res.status}).`);
  }
  return (data.text || "").replace(/```json|```/g, "").trim();
}

// Models sometimes wrap JSON in prose; take the outermost object.
function parseJson(text) {
  const t = (text || "").trim();
  try { return JSON.parse(t); } catch (e) {}
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error("The model didn't return usable JSON.");
}

/* ================= component ================= */
export default function Forge() {
  const [tab, setTab] = useState("coach");
  const [profile, setProfile] = useState(null);
  const [workouts, setWorkouts] = useState([]);
  const [bodyLog, setBodyLog] = useState([]);
  const [plan, setPlan] = useState(null);
  const [insights, setInsights] = useState(null);
  const [live, setLive] = useState(null);
  const [reviewedWeek, setReviewedWeek] = useState(null);
  const [celebrate, setCelebrate] = useState(null);
  const [restEnd, setRestEnd] = useState(null);
  const [nowTs, setNowTs] = useState(Date.now());
  const [block, setBlock] = useState(null);
  const [blockBusy, setBlockBusy] = useState(false);
  const [nutrition, setNutrition] = useState([]);
  const [nKcal, setNKcal] = useState("");
  const [nProt, setNProt] = useState("");
  const [whoop, setWhoop] = useState(null);
  const [whoopConn, setWhoopConn] = useState(false);
  const [whoopErr, setWhoopErr] = useState("");
  const [swapBusy, setSwapBusy] = useState(null);
  const [swapNote, setSwapNote] = useState("");
  const [addInj, setAddInj] = useState("");
  const [adjBusy, setAdjBusy] = useState(false);
  const autoAdj = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [authNeeded, setAuthNeeded] = useState(false);
  const [pw, setPw] = useState("");
  const [pwErr, setPwErr] = useState("");

  const [d, setD] = useState({
    age: "", sex: "M", height: "", weight: "",
    goal: GOALS[0], specific: "", level: LEVELS[0], days: 3, gear: ["barbell", "dumbbells"],
    injuries: [],
  });
  const setDF = (k, v) => setD((p) => ({ ...p, [k]: v }));

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [exs, setExs] = useState([emptyEx()]);
  const [notes, setNotes] = useState("");
  const [flash, setFlash] = useState("");

  const [planBusy, setPlanBusy] = useState(false);
  const [planErr, setPlanErr] = useState("");
  const [openDay, setOpenDay] = useState(null);
  const autoRan = useRef(false);

  // exercise info modal
  const [modal, setModal] = useState(null); // {name, info, busy, err}
  const exCache = useRef({});

  const [insightsBusy, setInsightsBusy] = useState(false);
  const [statEx, setStatEx] = useState("");
  const [bwInput, setBwInput] = useState("");

  /* ---------- load ---------- */
  useEffect(() => {
    (async () => {
      let data = null;
      try {
        const r = await fetch("/api/data", { headers: apiHeaders() });
        if (r.status === 401) { setAuthNeeded(true); return; }
        if (r.ok) data = await r.json();
      } catch (e) {}
      if (data) {
        if (data.profile) { setProfile(data.profile); setD(data.profile); }
        setWorkouts(data.workouts || []);
        setBodyLog(data.bodyLog || []);
        if (data.plan) setPlan(data.plan);
        if (data.insights) setInsights(data.insights);
        if (data.live) setLive(data.live);
        if (data.reviewedWeek) setReviewedWeek(data.reviewedWeek);
        if (data.block) setBlock(data.block);
        if (data.nutrition) setNutrition(data.nutrition);
      }
      try {
        const c = await fetch("/api/exinfo", { headers: apiHeaders() });
        if (c.ok) exCache.current = (await c.json()) || {};
      } catch (e) {}
      setLoaded(true);
      try {
        const s = await fetch("/api/whoop/status", { headers: apiHeaders() });
        if (s.ok) {
          const st = await s.json();
          setWhoopConn(!!st.connected);
          if (st.connected) {
            const r = await fetch("/api/whoop/summary", { headers: apiHeaders() });
            if (r.ok) setWhoop(await r.json());
          }
        }
      } catch (e) {}
    })();
  }, []);

  const unlock = async () => {
    const val = pw.trim();
    if (!val) return;
    setPwErr("");
    try {
      const r = await fetch("/api/data", {
        headers: { "Content-Type": "application/json", "x-app-token": encodeURIComponent(val) },
      });
      if (r.status === 401) { setPwErr("That password doesn't match. Check the APP_PASSWORD variable in Railway."); return; }
      if (!r.ok) { setPwErr("Server error — try again in a moment."); return; }
      try { localStorage.setItem("forge-token", val); } catch (e) {
        setPwErr("This browser is blocking local storage, so the password can't be saved. Turn off private browsing.");
        return;
      }
      window.location.reload();
    } catch (e) {
      setPwErr("Couldn't reach the server. Check your connection.");
    }
  };

  const persist = async (patch = {}) => {
    const full = { profile, workouts, bodyLog, plan, insights, live, reviewedWeek, block, nutrition, ...patch };
    try {
      await fetch("/api/data", { method: "PUT", headers: apiHeaders(), body: JSON.stringify(full) });
    } catch (e) { console.error("save failed", e); }
  };

  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  /* Keep the screen awake during a live session — phones lock mid-set otherwise. */
  useEffect(() => {
    let lock = null, cancelled = false;
    const acquire = async () => {
      try {
        if ("wakeLock" in navigator && (live || restEnd)) {
          lock = await navigator.wakeLock.request("screen");
        }
      } catch (e) { /* unsupported or denied — harmless */ }
    };
    acquire();
    const onVis = () => { if (document.visibilityState === "visible" && !cancelled) acquire(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("visibilitychange", onVis);
      if (lock) { try { lock.release(); } catch (e) {} }
    };
  }, [live, restEnd]);

  /* Buzz once when the rest timer hits zero. */
  const buzzed = useRef(false);
  useEffect(() => {
    if (!restEnd) { buzzed.current = false; return; }
    if (nowTs >= restEnd && !buzzed.current) {
      buzzed.current = true;
      try { if (navigator.vibrate) navigator.vibrate([160, 90, 160]); } catch (e) {}
    }
  }, [nowTs, restEnd]);

  /* ---------- derived ---------- */
  const volumeOf = (w) => w.exercises.reduce((s, e) => {
    const st = +e.sets || 0, rp = +e.reps || 0, wt = +e.weight || 0;
    return s + st * rp * (wt || 1);
  }, 0);
  const totalVolume = workouts.reduce((s, w) => s + volumeOf(w), 0);
  const totalKg = workouts.reduce((s, w) => s + w.exercises.reduce((a, e) =>
    a + (+e.sets || 0) * (+e.reps || 0) * (+e.weight || 0), 0), 0);

  const prs = {};
  workouts.forEach((w) => w.exercises.forEach((e) => {
    const wt = +e.weight || 0, k = e.name.trim().toLowerCase();
    if (!k || !wt) return;
    if (!prs[k] || wt > prs[k].weight) prs[k] = { name: e.name.trim(), weight: wt, date: w.date, reps: +e.reps || 1 };
  }));
  const prList = Object.values(prs).sort((a, b) => b.weight - a.weight);

  const weekKey = (dstr) => {
    const dt = new Date(dstr + "T00:00:00");
    dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
    return dt.toISOString().slice(0, 10);
  };
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayKey = weekKey(todayStr);
  const todayIdx = (new Date().getDay() + 6) % 7;
  const weekCounts = {}, weekVols = {};
  workouts.forEach((w) => {
    const k = weekKey(w.date);
    weekCounts[k] = (weekCounts[k] || 0) + 1;
    weekVols[k] = (weekVols[k] || 0) + volumeOf(w);
  });
  const thisWeek = weekCounts[todayKey] || 0;

  const target = profile ? Math.min(profile.days, 7) : 3;
  let streak = 0;
  {
    if (thisWeek >= target) streak++;
    for (let i = 1; i < 104; i++) {
      const dt = new Date(todayKey + "T00:00:00"); dt.setDate(dt.getDate() - 7 * i);
      if ((weekCounts[dt.toISOString().slice(0, 10)] || 0) >= target) streak++;
      else break;
    }
  }

  const xp = xpOf(workouts);
  const level = levelOf(xp);
  const lvFloor = levelFloor(level), lvNext = levelFloor(level + 1);
  const lvPct = Math.min(1, (xp - lvFloor) / Math.max(1, lvNext - lvFloor));
  const earned = BADGES.map((b) => ({ ...b, on: b.test({ count: workouts.length, volume: totalVolume, prCount: prList.length, streak }) }));

  const weeks8 = (() => {
    const out = [];
    for (let i = 7; i >= 0; i--) {
      const dt = new Date(todayKey + "T00:00:00"); dt.setDate(dt.getDate() - 7 * i);
      const k = dt.toISOString().slice(0, 10);
      out.push({ k, vol: weekVols[k] || 0, n: weekCounts[k] || 0 });
    }
    return out;
  })();
  const maxWeekVol = Math.max(1, ...weeks8.map((w) => w.vol));

  /* ----- muscle analytics (last 28 days) ----- */
  const CANON = ["Legs", "Hamstrings", "Glutes", "Back", "Chest", "Shoulders", "Arms", "Core", "Cardio"];
  const mStats = {};
  CANON.forEach((g) => { mStats[g] = { sets: 0, kg: 0, last: null }; });
  workouts.forEach((w) => {
    const ageDays = (new Date(todayStr) - new Date(w.date)) / 864e5;
    w.exercises.forEach((e) => {
      const g = groupFor(e.name);
      if (!mStats[g]) mStats[g] = { sets: 0, kg: 0, last: null };
      if (ageDays <= 28) {
        mStats[g].sets += +e.sets || 1;
        mStats[g].kg += (+e.sets || 0) * (+e.reps || 0) * (+e.weight || 0);
      }
      if (!mStats[g].last || w.date > mStats[g].last) mStats[g].last = w.date;
    });
  });
  const mList = Object.entries(mStats)
    .filter(([g, v]) => v.sets > 0 || v.last)
    .sort((a, b) => b[1].kg - a[1].kg || b[1].sets - a[1].sets);
  const maxKg = Math.max(1, ...mList.map(([, v]) => v.kg));
  const maxSets = Math.max(1, ...mList.map(([, v]) => v.sets));
  const daysSince = (dstr) => dstr ? Math.floor((new Date(todayStr) - new Date(dstr)) / 864e5) : null;

  const pushSets = (mStats["Chest"].sets || 0) + (mStats["Shoulders"].sets || 0);
  const pullSets = mStats["Back"].sets || 0;
  const upperSets = pushSets + pullSets + (mStats["Arms"].sets || 0);
  const lowerSets = (mStats["Legs"].sets || 0) + (mStats["Hamstrings"].sets || 0) + (mStats["Glutes"].sets || 0);
  const neglected = ["Legs", "Back", "Chest", "Shoulders", "Core"]
    .filter((g) => {
      const ds = daysSince(mStats[g].last);
      return ds === null || ds > 10;
    });

  const exNames = [...new Set(workouts.flatMap((w) => w.exercises.map((e) => e.name.trim())).filter(Boolean))];
  const chosenEx = statEx || exNames[0] || "";
  const progression = workouts
    .map((w) => {
      const match = w.exercises.filter((e) => e.name.trim().toLowerCase() === chosenEx.toLowerCase());
      if (!match.length) return null;
      const best = match.reduce((m, e) => Math.max(m, +e.weight || 0), 0);
      return { date: w.date, weight: best, reps: +match[0].reps || 1 };
    })
    .filter((p) => p && p.weight > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const e1rm = progression.length
    ? Math.round(progression[progression.length - 1].weight * (1 + progression[progression.length - 1].reps / 30))
    : 0;

  const bwSorted = [...bodyLog].sort((a, b) => (a.date < b.date ? -1 : 1));
  const bwDelta = bwSorted.length >= 2
    ? (bwSorted[bwSorted.length - 1].weight - bwSorted[0].weight).toFixed(1) : null;

  /* ----- progression memory ----- */
  const lastPerfFor = (name) => {
    const k = (name || "").trim().toLowerCase();
    if (!k) return null;
    for (const w of workouts) { // workouts are sorted newest-first
      const e = w.exercises.find((x) => x.name.trim().toLowerCase() === k);
      if (e) return { sets: e.sets, reps: e.reps, weight: +e.weight || 0, date: w.date };
    }
    return null;
  };
  const suggestNext = (perf) => (perf && perf.weight ? Math.round((perf.weight + 2.5) * 2) / 2 : null);

  /* ----- rest timer duration by goal ----- */
  const restSecs = ({ "Build strength": 180, "Build muscle": 90, "Lose fat": 60, "Endurance": 60, "General fitness": 90 })[profile && profile.goal] || 90;
  const fmtClock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  /* ----- adherence ----- */
  const doneDays = new Set(
    workouts.filter((w) => weekKey(w.date) === todayKey)
      .map((w) => (new Date(w.date + "T00:00:00").getDay() + 6) % 7)
  );
  const adherence8 = weeks8.map((w) => ({ ...w, pct: Math.min(100, Math.round((w.n / target) * 100)) }));
  const avgAdherence = Math.round(adherence8.reduce((s, w) => s + w.pct, 0) / adherence8.length);

  /* ----- fatigue / deload detection ----- */
  const completedVols = weeks8.slice(0, 7).map((w) => w.vol);
  let volRising = completedVols.length >= 4;
  for (let i = completedVols.length - 4; i < completedVols.length - 1; i++) {
    if (!(completedVols[i] > 0 && completedVols[i + 1] > completedVols[i])) volRising = false;
  }
  const freq = {};
  workouts.forEach((w) => w.exercises.forEach((e) => {
    if (+e.weight > 0) { const k = e.name.trim(); freq[k] = (freq[k] || 0) + 1; }
  }));
  const stalled = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k)
    .filter((name) => {
      const pts = workouts
        .filter((w) => w.exercises.some((e) => e.name.trim() === name))
        .map((w) => Math.max(...w.exercises.filter((e) => e.name.trim() === name).map((e) => +e.weight || 0)))
        .filter((v) => v > 0);
      return pts.length >= 3 && pts[0] <= pts[2]; // newest not above 3 sessions ago
    });
  const fatigueAlert = volRising || stalled.length > 0;

  /* ----- weekly review ----- */
  const planAge = plan && plan.created ? Math.floor((new Date(todayStr) - new Date(plan.created)) / 864e5) : 0;
  const reviewDue = plan && (todayIdx === 6 || planAge >= 7) && reviewedWeek !== todayKey && workouts.length > 0;
  const prevWeekVol = weeks8[6] ? weeks8[6].vol : 0;
  const curWeekVol = weeks8[7] ? weeks8[7].vol : 0;
  const volDeltaPct = prevWeekVol > 0 ? Math.round(((curWeekVol - prevWeekVol) / prevWeekVol) * 100) : null;
  const prsThisWeek = prList.filter((p) => weekKey(p.date) === todayKey).length;

  /* ----- export ----- */
  const download = (name, content, type) => {
    const b = new Blob([content], { type });
    const u = URL.createObjectURL(b);
    const a = document.createElement("a");
    a.href = u; a.download = name; a.click();
    URL.revokeObjectURL(u);
  };
  const exportJson = () => download("forge-backup-" + todayStr + ".json",
    JSON.stringify({ profile, workouts, bodyLog, plan, insights }, null, 2), "application/json");
  const exportCsv = () => {
    const rows = [["date", "exercise", "sets", "reps", "weight_kg", "notes"]];
    workouts.forEach((w) => w.exercises.forEach((e, i) =>
      rows.push([w.date, e.name, e.sets, e.reps, e.weight, i === 0 ? (w.notes || "").replace(/"/g, "'") : ""])));
    const csv = rows.map((r) => r.map((c) => `"${c ?? ""}"`).join(",")).join("\n");
    download("forge-log-" + todayStr + ".csv", csv, "text/csv");
  };

  /* ----- warm-up ramp ----- */
  const warmupRamp = (w) => {
    const ww = parseFloat(w);
    if (!ww || ww < 30) return null;
    const r25 = (x) => Math.max(20, Math.round(x / 2.5) * 2.5);
    const out = [];
    [[0.4, 8], [0.6, 5], [0.8, 3]].forEach(([p, reps]) => {
      const kg = r25(ww * p);
      if (kg < ww && !out.some((o) => o.kg === kg)) out.push({ kg, reps });
    });
    return out.length ? out : null;
  };

  /* ----- nutrition targets (Mifflin-St Jeor) ----- */
  const nut = (() => {
    if (!profile) return null;
    const kg = +profile.weight || 0, cm = +profile.height || 0, age = +profile.age || 0;
    if (!kg || !cm || !age) return null;
    const bmr = 10 * kg + 6.25 * cm - 5 * age + (profile.sex === "M" ? 5 : profile.sex === "F" ? -161 : -78);
    const tdee = bmr * (1.3 + Math.min(profile.days, 6) * 0.05);
    const g = profile.goal;
    const kcal = Math.round((g === "Lose fat" ? tdee * 0.8 : g === "Build muscle" ? tdee * 1.1 : g === "Build strength" ? tdee * 1.05 : tdee) / 10) * 10;
    const protein = Math.round(kg * (g === "Lose fat" ? 2.0 : g === "Build muscle" ? 1.8 : 1.6));
    return { kcal, protein };
  })();
  const todayNut = nutrition.find((n) => n.date === todayStr) || null;
  const nutAvg = (() => {
    const recent7 = nutrition.filter((n) => (new Date(todayStr) - new Date(n.date)) / 864e5 <= 7);
    if (!recent7.length) return null;
    return {
      k: Math.round(recent7.reduce((s, n) => s + (+n.kcal || 0), 0) / recent7.length),
      p: Math.round(recent7.reduce((s, n) => s + (+n.protein || 0), 0) / recent7.length),
      n: recent7.length,
    };
  })();

  /* ----- training block ----- */
  const blockCtxFor = (blk) => {
    if (!blk || !blk.weeks || !blk.weeks.length) return { ctx: "", deload: false };
    const wk = Math.floor((new Date(todayKey) - new Date(blk.start)) / (7 * 864e5)) + 1;
    if (wk > blk.weeks.length || wk < 1) return { ctx: "", deload: false };
    const ph = blk.weeks.find((w) => w.week === wk) || blk.weeks[wk - 1];
    return {
      ctx: `\n- Training block "${blk.name}", week ${wk} of ${blk.weeks.length}. Phase: ${ph.type} — ${ph.note}. Program THIS week to match the phase.`,
      deload: /deload/i.test(ph.type || ""),
    };
  };
  const blockWeek = block && block.weeks && block.weeks.length
    ? Math.floor((new Date(todayKey) - new Date(block.start)) / (7 * 864e5)) + 1 : 0;
  const blockDone = block && block.weeks ? blockWeek > block.weeks.length : false;
  const blockPhase = block && block.weeks && blockWeek >= 1 && blockWeek <= block.weeks.length
    ? (block.weeks.find((w) => w.week === blockWeek) || block.weeks[blockWeek - 1]) : null;

  /* ---------- actions ---------- */
  const saveProfile = () => {
    const p = { ...d, days: +d.days || 3 };
    setProfile(p);
    persist({ profile: p });
    autoRan.current = false;
    setPlan(null);
    setTab("coach");
  };

  const saveWorkout = () => {
    const clean = exs.filter((e) => e.name.trim());
    if (!clean.length) { setFlash("Add at least one exercise"); setTimeout(() => setFlash(""), 1800); return; }
    const newPRs = clean
      .filter((e) => {
        const wt = +e.weight || 0, k = e.name.trim().toLowerCase();
        return wt > 0 && wt > ((prs[k] || {}).weight || 0);
      })
      .map((e) => ({ name: e.name.trim(), weight: +e.weight, old: (prs[e.name.trim().toLowerCase()] || {}).weight || null }));
    const w = { id: Date.now(), date, exercises: clean, notes: notes.trim() };
    const next = [w, ...workouts].sort((a, b) => (a.date < b.date ? 1 : -1));
    setWorkouts(next); persist({ workouts: next });
    setExs([emptyEx()]); setNotes("");
    if (newPRs.length) setCelebrate(newPRs);
    setFlash("Saved — +" + (50 + clean.length * 10) + " XP");
    setTimeout(() => setFlash(""), 2200);
  };

  const delWorkout = (id) => {
    const next = workouts.filter((w) => w.id !== id);
    setWorkouts(next); persist({ workouts: next });
  };

  const logBodyWeight = () => {
    const v = parseFloat(bwInput);
    if (!v) return;
    const entry = { date: todayStr, weight: v };
    const next = [...bodyLog.filter((b) => b.date !== entry.date), entry];
    setBodyLog(next); persist({ bodyLog: next });
    setBwInput("");
  };

  /* ----- weekly plan ----- */
  const getPlan = async (p = profile, opts = {}) => {
    if (!p) return;
    setPlanBusy(true); setPlanErr("");
    const gearLabels = p.gear.length ? p.gear.map((g) => (GEAR.find(([k]) => k === g) || [g, g])[1]) : ["Bodyweight only"];
    const recent = workouts.slice(0, 10).map((w) => ({ date: w.date, exercises: w.exercises, notes: w.notes }));
    const bc = blockCtxFor(opts.block || block);
    const deloadNow = opts.deload || bc.deload;
    const prompt = `You are a concise, practical personal trainer building a weekly program.

Athlete:
- Age ${p.age || "?"}, sex ${p.sex}, height ${p.height || "?"} cm, weight ${p.weight || "?"} kg
- Experience: ${p.level}. Wants to train ${p.days} days/week.
- Main goal: ${p.goal}. Specific goals in their own words: "${p.specific || "none given"}"
- Available equipment: ${gearLabels.join(", ")}${(p.injuries || []).length ? `
- Injuries / limitations: ${p.injuries.join("; ")} — avoid movements that aggravate these and pick safe alternatives.` : ""}${whoop && whoop.recovery != null ? `
- Today's WHOOP: recovery ${whoop.recovery}%, HRV ${whoop.hrv} ms, RHR ${whoop.rhr} bpm, sleep ${whoop.sleepHours}h${whoop.sleepPerf ? ` (${whoop.sleepPerf}% performance)` : ""}, yesterday's strain ${whoop.strain}. Calibrate intensity to recovery: under 34% go much lighter, 34-66% moderate, above 66% full intensity.` : ""}${bc.ctx}
- Recent workouts (most recent first): ${JSON.stringify(recent)}

Build a full 7-day week, Monday to Sunday, with exactly ${p.days} training days and ${7 - p.days} rest days. Place rest days sensibly for recovery. Use ONLY the available equipment. Progress loads in small steps vs their history. Serve the specific goals directly. Give every TRAINING day its own one-line warm-up that primes the specific muscles and movements in that session. On rest days give a one-line recovery suggestion (walk, stretch, mobility) instead.
${deloadNow ? "IMPORTANT: This must be a DELOAD week. Cut loads to roughly 60% of their recent working weights and reduce total sets by about 40%. Keep the same movement patterns, keep everything far from failure, and say in \"why\" that this is a recovery week and why it earns them progress." : ""}

Respond ONLY with valid JSON, no markdown fences, no preamble:
{
 "why": "2-3 sentences on the structure of this week and how it serves their goals",
 "tip": "one specific coaching tip for this athlete right now",
 "week": [
  {"day":"Mon","rest":false,"focus":"short session title","warmup":"one line warm-up specific to this session, e.g. 5 min bike then hip openers and 2 light sets of the first lift","exercises":[{"exercise":"name","sets":3,"reps":"8-10","load":"short load guidance"}]},
  {"day":"Tue","rest":true,"note":"one-line recovery suggestion"}
 ]
}
The "week" array must have exactly 7 entries, days Mon,Tue,Wed,Thu,Fri,Sat,Sun in order.`;
    try {
      const clean = await askClaude(prompt, 2500);
      const parsed = parseJson(clean);
      const withMeta = { ...parsed, created: todayStr };
      setPlan(withMeta);
      persist({ plan: withMeta });
      setOpenDay(todayIdx);
    } catch (e) {
      setPlanErr(String(e.message || e));
    }
    setPlanBusy(false);
  };

  useEffect(() => {
    if (loaded && profile && tab === "coach" && !autoRan.current && !plan && !planBusy) {
      autoRan.current = true;
      getPlan(profile);
    }
    // eslint-disable-next-line
  }, [loaded, profile, tab]);

  const sendToLog = (dayObj) => {
    if (!dayObj || !dayObj.exercises) return;
    setExs(dayObj.exercises.map((e) => ({
      name: e.exercise, sets: String(e.sets || ""), reps: String(e.reps || "").split("-")[0], weight: "",
    })));
    setDate(todayStr);
    setTab("log");
  };

  /* ----- live workout mode ----- */
  const startLive = (dayObj) => {
    if (!dayObj || !dayObj.exercises) return;
    const sessionEx = dayObj.exercises.map((e) => {
      const perf = lastPerfFor(e.exercise);
      const targetSets = +e.sets || 3;
      const targetReps = String(e.reps || "8");
      return {
        name: e.exercise, load: e.load || "", targetSets, targetReps,
        sets: Array.from({ length: targetSets }).map(() => ({
          reps: targetReps.split("-")[0],
          weight: perf && perf.weight ? String(perf.weight) : "",
          done: false,
        })),
      };
    });
    const lv = { startedAt: Date.now(), date: todayStr, idx: 0, focus: dayObj.focus || "", warmup: dayObj.warmup || "", warmupDone: false, exercises: sessionEx };
    setLive(lv); persist({ live: lv });
    setRestEnd(null);
    setTab("live");
  };

  const updLive = (fn, save = false) => {
    const nl = JSON.parse(JSON.stringify(live));
    fn(nl);
    setLive(nl);
    if (save) persist({ live: nl });
  };

  const finishLive = () => {
    const entries = live.exercises.map((ex) => {
      const ds = ex.sets.filter((s) => s.done);
      if (!ds.length) return null;
      const weight = Math.max(...ds.map((s) => +s.weight || 0));
      return {
        name: ex.name,
        sets: String(ds.length),
        reps: String(ds[ds.length - 1].reps || ""),
        weight: weight ? String(weight) : "",
      };
    }).filter(Boolean);
    if (!entries.length) { discardLive(); return; }
    const mins = Math.max(1, Math.round((Date.now() - live.startedAt) / 60000));
    const newPRs = entries
      .filter((e) => {
        const wt = +e.weight || 0, k = e.name.trim().toLowerCase();
        return wt > 0 && wt > ((prs[k] || {}).weight || 0);
      })
      .map((e) => ({ name: e.name.trim(), weight: +e.weight, old: (prs[e.name.trim().toLowerCase()] || {}).weight || null }));
    const w = { id: Date.now(), date: live.date || todayStr, exercises: entries, notes: `Live session · ${mins} min` };
    const next = [w, ...workouts].sort((a, b) => (a.date < b.date ? 1 : -1));
    setWorkouts(next);
    setLive(null); setRestEnd(null);
    persist({ workouts: next, live: null });
    setTab("coach");
    if (newPRs.length) setCelebrate(newPRs);
  };

  const discardLive = () => {
    setLive(null); setRestEnd(null);
    persist({ live: null });
    setTab("coach");
  };

  const dismissReview = (alsoRebuild = false) => {
    setReviewedWeek(todayKey);
    persist({ reviewedWeek: todayKey });
    if (alsoRebuild) getPlan();
  };

  /* ----- training block ----- */
  const startBlock = async (n) => {
    setBlockBusy(true);
    const prompt = `Design a ${n}-week training block (mesocycle) for this athlete: ${JSON.stringify(profile)}. Sessions logged so far: ${workouts.length}. Recent PRs: ${JSON.stringify(prList.slice(0, 4))}.

Respond ONLY with valid JSON, no markdown fences:
{"name":"short evocative block name","weeks":[{"week":1,"type":"phase, e.g. Accumulation / Intensification / Deload / Peak","note":"one line: how loads, volume or RPE change this week"}]}
Exactly ${n} entries in "weeks". Include at least one Deload week placed for recovery, and make the final week test or peak toward their specific goals.`;
    try {
      const clean = await askClaude(prompt, 1400);
      const b = parseJson(clean);
      const nb = { name: b.name || `${n}-week block`, start: todayKey, weeks: b.weeks || [] };
      setBlock(nb);
      persist({ block: nb });
      getPlan(profile, { block: nb });
    } catch (e) {
      setPlanErr(String(e.message || e));
    }
    setBlockBusy(false);
  };
  const endBlock = () => { setBlock(null); persist({ block: null }); };

  /* ----- exercise swap ----- */
  const swapExercise = async (di, ei) => {
    if (!plan || !plan.week || !plan.week[di] || swapBusy) return;
    const dy = plan.week[di]; const cur = dy.exercises[ei];
    const key = `${di}-${ei}`;
    setSwapBusy(key); setSwapNote("");
    const gearLabels = profile.gear.length ? profile.gear.map((g) => (GEAR.find(([k]) => k === g) || [g, g])[1]) : ["Bodyweight only"];
    const prompt = `Suggest ONE replacement exercise.
Athlete: ${profile.level}, goal ${profile.goal}.${(profile.injuries || []).length ? ` Injuries: ${profile.injuries.join("; ")}.` : ""}
Equipment available: ${gearLabels.join(", ")}.
Session focus: ${dy.focus}. Exercises already in the session: ${dy.exercises.map((e) => e.exercise).join(", ")}.
Replace "${cur.exercise}" (${cur.sets}×${cur.reps}) with a DIFFERENT movement that hits similar muscles, works with the equipment${(profile.injuries || []).length ? ", is safe for the injuries" : ""}, and is not already in the session.
Respond ONLY with valid JSON, no markdown fences: {"exercise":"name","sets":${+cur.sets || 3},"reps":"${cur.reps || "8-10"}","load":"short load guidance","why":"one short sentence on why this swap works"}`;
    try {
      const clean = await askClaude(prompt, 400);
      const alt = parseJson(clean);
      const np = JSON.parse(JSON.stringify(plan));
      np.week[di].exercises[ei] = { exercise: alt.exercise, sets: alt.sets, reps: alt.reps, load: alt.load };
      setPlan(np);
      persist({ plan: np });
      setSwapNote(`⇄ Swapped in ${alt.exercise}${alt.why ? " — " + alt.why : ""}`);
      setTimeout(() => setSwapNote(""), 8000);
    } catch (e) {
      setSwapNote(String(e.message || e).slice(0, 160));
      setTimeout(() => setSwapNote(""), 4000);
    }
    setSwapBusy(null);
  };

  /* ----- nutrition ----- */
  const saveNutrition = () => {
    const k = +nKcal || 0, p2 = +nProt || 0;
    if (!k && !p2) return;
    const entry = {
      date: todayStr,
      kcal: k || (todayNut && todayNut.kcal) || 0,
      protein: p2 || (todayNut && todayNut.protein) || 0,
    };
    const next = [...nutrition.filter((n) => n.date !== todayStr), entry];
    setNutrition(next);
    persist({ nutrition: next });
    setNKcal(""); setNProt("");
  };

  /* ----- whoop ----- */
  const connectWhoop = async () => {
    setWhoopErr("");
    try {
      const r = await fetch("/api/whoop/auth-url", { method: "POST", headers: apiHeaders() });
      if (r.status === 401) {
        setWhoopErr("Your session isn't authenticated. Reload the app and enter your password, then try again.");
        return;
      }
      const data = await r.json();
      if (!r.ok || !data.url) {
        setWhoopErr(data.error || "Couldn't start the WHOOP connection.");
        return;
      }
      window.location.href = data.url;
    } catch (e) {
      setWhoopErr("Network error reaching the server. Try again in a moment.");
    }
  };

  const disconnectWhoop = async () => {
    try { await fetch("/api/whoop/disconnect", { method: "POST", headers: apiHeaders() }); } catch (e) {}
    setWhoopConn(false); setWhoop(null); setWhoopErr("");
  };

  /* ----- daily auto-adjust to recovery ----- */
  const adjustToday = async (w = whoop) => {
    if (!plan || !plan.week || !w || w.recovery == null) return;
    const dy = plan.week[todayIdx];
    if (!dy || dy.rest || !dy.exercises || !dy.exercises.length) return;
    setAdjBusy(true);
    const gearLabels = profile.gear.length ? profile.gear.map((g) => (GEAR.find(([k]) => k === g) || [g, g])[1]) : ["Bodyweight only"];
    const prompt = `Adjust today's planned training session to the athlete's recovery. Change only what recovery demands.

Athlete: ${profile.level}, goal ${profile.goal}.${(profile.injuries || []).length ? ` Injuries: ${profile.injuries.join("; ")}.` : ""}
Equipment: ${gearLabels.join(", ")}.
WHOOP today: recovery ${w.recovery}%, HRV ${w.hrv} ms, RHR ${w.rhr} bpm, sleep ${w.sleepHours}h, yesterday's strain ${w.strain}.
Planned session: ${JSON.stringify(dy)}

Rules:
- Recovery under 34% (red): cut loads 20-30%, drop roughly one set per exercise, and swap the most CNS-taxing lifts (heavy squats/deadlifts) for gentler variants.
- Recovery 34-66% (yellow): trim loads about 10% and reduce total sets slightly. Keep the session's structure.
- Keep the same day name and a similar exercise count. Use ONLY the available equipment.

Respond ONLY with valid JSON, no markdown fences:
{"day":"${dy.day}","rest":false,"focus":"session title","warmup":"one line warm-up for this session","exercises":[{"exercise":"name","sets":3,"reps":"8-10","load":"short guidance"}],"adjust_note":"one short sentence: what changed and why"}`;
    try {
      const clean = await askClaude(prompt, 1200);
      const adj = parseJson(clean);
      const np = JSON.parse(JSON.stringify(plan));
      np.originalDay = { idx: todayIdx, day: dy };
      np.week[todayIdx] = { day: adj.day || dy.day, rest: false, focus: adj.focus || dy.focus, warmup: adj.warmup || dy.warmup, exercises: adj.exercises || dy.exercises };
      np.adjustedDate = todayStr;
      np.adjustNote = adj.adjust_note || "Adjusted to today's recovery.";
      np.adjustRecovery = w.recovery;
      setPlan(np);
      persist({ plan: np });
      setOpenDay(todayIdx);
    } catch (e) { /* leave plan untouched on failure */ }
    setAdjBusy(false);
  };

  const undoAdjust = () => {
    if (!plan || !plan.originalDay) return;
    const np = JSON.parse(JSON.stringify(plan));
    np.week[np.originalDay.idx] = np.originalDay.day;
    delete np.originalDay; delete np.adjustNote; delete np.adjustRecovery;
    np.adjustedDate = todayStr; // don't re-adjust again today after an undo
    np.adjustUndone = true;
    setPlan(np);
    persist({ plan: np });
  };

  useEffect(() => {
    if (!loaded || !profile || !plan || !whoop || autoAdj.current) return;
    if (whoop.recovery == null || whoop.recovery >= 67) return;      // green: train as planned
    if (plan.adjustedDate === todayStr) return;                       // already handled today
    if (live || planBusy) return;                                     // never mid-session or mid-build
    const dy = plan.week && plan.week[todayIdx];
    if (!dy || dy.rest) return;
    autoAdj.current = true;
    adjustToday(whoop);
    // eslint-disable-next-line
  }, [loaded, profile, plan, whoop]);

  /* ----- exercise info ----- */
  const openExercise = async (name) => {
    const key = name.trim().toLowerCase();
    if (!key) return;
    if (exCache.current[key]) { setModal({ name, info: exCache.current[key] }); return; }
    setModal({ name, busy: true });
    const prompt = `You are an experienced strength coach. Explain the exercise "${name}" for a recreational lifter.

Respond ONLY with valid JSON, no markdown fences:
{
 "muscles_primary": ["main muscles worked"],
 "muscles_secondary": ["assisting muscles"],
 "setup": "1-2 sentences on starting position",
 "execution": ["step 1", "step 2", "step 3"],
 "dos": ["3 short do's for good form"],
 "donts": ["3 short common mistakes to avoid"],
 "feel": "one sentence: where you should feel it working"
}`;
    try {
      const clean = await askClaude(prompt, 900);
      const info = parseJson(clean);
      exCache.current[key] = info;
      try {
        await fetch("/api/exinfo", { method: "PUT", headers: apiHeaders(), body: JSON.stringify(exCache.current) });
      } catch (e) {}
      setModal({ name, info });
    } catch (e) {
      setModal({ name, err: String(e.message || e).slice(0, 200) + " — tap to retry.", retry: true });
    }
  };

  /* ----- AI insights ----- */
  const getInsights = async () => {
    setInsightsBusy(true);
    const recent = workouts.slice(0, 14).map((w) => ({ date: w.date, exercises: w.exercises, notes: w.notes }));
    const muscleSummary = mList.map(([g, v]) => `${g}: ${v.sets} sets, ${Math.round(v.kg)} kg lifted, last trained ${v.last || "never"}`).join("\n");
    const prompt = `You are a sharp, honest strength coach reviewing an athlete's training log. Be specific and direct — reference their actual numbers. No generic advice.

Athlete: ${JSON.stringify(profile)}
Sessions logged: ${workouts.length}. This week: ${thisWeek}/${profile.days}. Week streak: ${streak}.
Total volume: ${Math.round(totalVolume)}. Total kg lifted (weighted work only): ${Math.round(totalKg)}.
Muscle groups, last 28 days:
${muscleSummary}
Push sets ${pushSets} vs pull sets ${pullSets}. Upper ${upperSets} vs lower ${lowerSets}.
PRs: ${JSON.stringify(prList.slice(0, 6))}
Body weight log: ${JSON.stringify(bwSorted.slice(-6))}
${(profile.injuries || []).length ? `Injuries/limitations: ${profile.injuries.join("; ")}
` : ""}${whoop && whoop.recovery != null ? `WHOOP today: recovery ${whoop.recovery}%, HRV ${whoop.hrv} ms, RHR ${whoop.rhr}, sleep ${whoop.sleepHours}h, strain ${whoop.strain}
` : ""}${nutAvg && nut ? `Nutrition last 7 days (${nutAvg.n} logged): avg ${nutAvg.k} kcal vs ${nut.kcal} target, ${nutAvg.p}g protein vs ${nut.protein}g target
` : ""}${block && blockPhase ? `Training block "${block.name}": week ${blockWeek}/${block.weeks.length}, phase ${blockPhase.type}
` : ""}Recent sessions: ${JSON.stringify(recent)}

Respond ONLY with valid JSON, no markdown fences:
{
 "headline": "one blunt sentence summarizing the state of their training",
 "wins": ["2-3 specific things going well, with numbers"],
 "gaps": ["2-3 specific weaknesses or imbalances, with numbers"],
 "actions": ["3 concrete things to change in the next 2 weeks"]
}`;
    try {
      const clean = await askClaude(prompt, 1200);
      const parsed = parseJson(clean);
      const withMeta = { ...parsed, date: todayStr };
      setInsights(withMeta);
      persist({ insights: withMeta });
    } catch (e) {
      setInsights({ headline: String(e.message || e).slice(0, 220), wins: [], gaps: [], actions: [], date: todayStr });
    }
    setInsightsBusy(false);
  };

  /* ---------- styles ---------- */
  const S = {
    page: {
      height: "100dvh", minHeight: "100svh", background: T.bg, color: T.text,
      display: "flex", flexDirection: "column", overflow: "hidden", position: "relative",
      fontFamily: FB, letterSpacing: "-0.005em",
    },
    scroll: { flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", paddingTop: 16, paddingBottom: 28 },
    shell: { maxWidth: 660, margin: "0 auto", padding: "0 16px" },
    card: {
      background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12,
      padding: 18, marginBottom: 12,
    },
    // flush panel: no border, just a rule at the top — used for grouped sections
    h: (size = 17) => ({ ...display, fontSize: size, marginBottom: 12 }),
    label: {
      fontSize: 10, color: T.dim, textTransform: "uppercase", letterSpacing: "0.14em",
      fontWeight: 600, marginBottom: 7, display: "block", fontFamily: FB,
    },
    num: (size = 15, color) => ({ ...mono, fontSize: size, fontWeight: 500, color: color || T.text, letterSpacing: "-0.02em" }),
    input: {
      width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: 9,
      border: `1px solid ${T.line}`, background: T.bg, color: T.text, fontSize: 16,
      outline: "none", fontFamily: FB,
    },
    inputNum: {
      width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 9,
      border: `1px solid ${T.line}`, background: T.bg, color: T.text, fontSize: 16,
      outline: "none", ...mono, textAlign: "center",
    },
    btn: {
      background: T.accent, color: "#150A05", border: "none", borderRadius: 9,
      padding: "14px 18px", fontSize: 13, cursor: "pointer", width: "100%",
      fontFamily: FD, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700,
      boxShadow: `0 0 0 1px ${T.accent}, 0 6px 22px -8px ${T.accentGlow}`,
    },
    ghost: {
      background: "transparent", color: T.text, border: `1px solid ${T.line}`,
      borderRadius: 9, padding: "11px 15px", fontSize: 12, cursor: "pointer",
      fontFamily: FD, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600,
    },
    chip: (on) => ({
      padding: "9px 14px", borderRadius: 7, fontSize: 13.5, fontWeight: 500, cursor: "pointer",
      fontFamily: FB, transition: "none",
      border: `1px solid ${on ? T.accent : T.line}`,
      background: on ? T.accentDim : "transparent", color: on ? T.accent : T.sub,
    }),
    tile: { background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: "13px 14px" },
    tileNum: { ...mono, fontSize: 21, fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1.1 },
    tileLab: { fontSize: 9.5, color: T.dim, textTransform: "uppercase", letterSpacing: "0.13em", fontWeight: 600, marginTop: 5 },
  };

  /* ----- primitives ----- */
  // Section header with a ruled line and tick — the recurring structural device
  const Rule = ({ label, right, color = T.dim }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 13 }}>
      <span style={{ width: 2, height: 11, background: color === T.dim ? T.accent : color, flexShrink: 0 }} />
      <span style={{ fontSize: 10, color, textTransform: "uppercase", letterSpacing: "0.16em", fontWeight: 600, whiteSpace: "nowrap" }}>
        {label}
      </span>
      <span style={{ flex: 1, height: 1, background: T.lineSoft }} />
      {right && <span style={{ ...mono, fontSize: 11, color: T.dim, whiteSpace: "nowrap" }}>{right}</span>}
    </div>
  );

  const Row = ({ children, last, onClick, style }) => (
    <div onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 12, padding: "11px 0",
      borderBottom: last ? "none" : `1px solid ${T.lineSoft}`,
      cursor: onClick ? "pointer" : "default", ...style,
    }}>{children}</div>
  );

  const Ring = ({ pct, size = 46 }) => {
    const r = (size - 5) / 2, c = 2 * Math.PI * r;
    return (
      <svg width={size} height={size} style={{ flexShrink: 0 }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={T.line} strokeWidth="2.5" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={T.accent} strokeWidth="2.5" fill="none"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="butt"
          transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        <text x="50%" y="53%" textAnchor="middle" dominantBaseline="middle"
          fill={T.text} fontSize={size / 2.9} fontWeight="500"
          fontFamily={FM}>{level}</text>
      </svg>
    );
  };

  const ExIcon = ({ name, size = 42, color = T.sub, icon }) => (
    <div style={{
      width: size, height: size, flexShrink: 0, color,
      background: T.bg, border: `1px solid ${T.line}`, borderRadius: 9,
      padding: size > 34 ? 7 : 5, boxSizing: "border-box",
    }}>{icon || iconFor(name)}</div>
  );

  const Header = () => (
    <div style={{
      background: T.surface, borderBottom: `1px solid ${T.line}`,
      padding: "13px 16px 12px", flexShrink: 0,
      paddingTop: "calc(13px + env(safe-area-inset-top))",
    }}>
      <div style={{ maxWidth: 660, margin: "0 auto", display: "flex", alignItems: "center", gap: 13 }}>
        <Ring pct={lvPct} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...display, fontSize: 22, letterSpacing: "0.08em" }}>
            Forge<span style={{ color: T.accent }}>.</span>
          </div>
          <div style={{ fontSize: 11, color: T.dim, marginTop: 3, ...mono }}>
            LV{level} · {xp - lvFloor}/{lvNext - lvFloor} XP
          </div>
        </div>
        {profile && (
          <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ ...mono, fontSize: 17, color: T.text }}>
                {thisWeek}<span style={{ color: T.dim, fontSize: 13 }}>/{profile.days}</span>
              </div>
              <div style={{ fontSize: 9, color: T.dim, textTransform: "uppercase", letterSpacing: "0.12em", marginTop: 3 }}>week</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ ...mono, fontSize: 17, color: streak > 0 ? T.gold : T.dim }}>
                {streak}
              </div>
              <div style={{ fontSize: 9, color: T.dim, textTransform: "uppercase", letterSpacing: "0.12em", marginTop: 3 }}>streak</div>
            </div>
          </div>
        )}
      </div>
      {profile && (
        <div style={{ maxWidth: 660, margin: "11px auto 0", display: "flex", gap: 3 }}>
          {Array.from({ length: profile.days }).map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 3,
              background: i < thisWeek ? T.accent : T.line,
              boxShadow: i < thisWeek ? `0 0 8px -1px ${T.accentGlow}` : "none",
            }} />
          ))}
        </div>
      )}
    </div>
  );

  const Tabs = () => (
    <div style={{
      flexShrink: 0, zIndex: 10, background: T.surface, borderTop: `1px solid ${T.line}`,
      paddingBottom: "env(safe-area-inset-bottom)",
    }}>
      <div style={{ maxWidth: 660, margin: "0 auto", display: "flex" }}>
        {[["coach", "Plan"], ["log", "Log"], ["history", "Log book"], ["stats", "Stats"], ["profile", "You"]].map(([k, l]) => {
          const on = tab === k;
          return (
            <button key={k} onClick={() => setTab(k)} style={{
              flex: 1, padding: "14px 0 16px", background: "none", border: "none", cursor: "pointer",
              color: on ? T.accent : T.dim,
              fontFamily: FD, fontWeight: on ? 700 : 500, fontSize: 12,
              textTransform: "uppercase", letterSpacing: "0.11em",
              boxShadow: on ? `inset 0 2px 0 ${T.accent}` : "none",
            }}>{l}</button>
          );
        })}
      </div>
    </div>
  );

  /* ----- exercise modal ----- */
  const ExModal = () => {
    if (!modal) return null;
    const info = modal.info;
    return (
      <div onClick={() => setModal(null)} style={{
        position: "absolute", inset: 0, zIndex: 50, background: "rgba(6,8,11,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 14, boxSizing: "border-box",
      }}>
        <div onClick={(e) => e.stopPropagation()} style={{
          background: T.surface, borderRadius: 18, width: "100%", maxWidth: 560,
          maxHeight: "100%", overflowY: "auto", padding: 18, boxSizing: "border-box",
          border: `1px solid ${T.line}`, boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <ExIcon name={modal.name} size={52} color={T.accent} />
            <div style={{ flex: 1 }}>
              <div style={{ ...display, fontSize: 25 }}>{modal.name}</div>
              <div style={{ fontSize: 12.5, color: T.sub }}>{groupFor(modal.name)}</div>
            </div>
            <button onClick={() => setModal(null)} style={{
              background: T.surface2, border: `1px solid ${T.line}`, color: T.sub,
              borderRadius: 999, width: 34, height: 34, fontSize: 16, cursor: "pointer",
            }}>✕</button>
          </div>

          {modal.busy && <div style={{ color: T.sub, padding: "20px 0" }}>Loading form guide…</div>}
          {modal.err && (
            <button style={S.ghost} onClick={() => openExercise(modal.name)}>{modal.err}</button>
          )}
          {info && (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                {(info.muscles_primary || []).map((m) => (
                  <span key={m} style={{ ...S.chip(true), cursor: "default", fontSize: 12.5 }}>{m}</span>
                ))}
                {(info.muscles_secondary || []).map((m) => (
                  <span key={m} style={{ ...S.chip(false), cursor: "default", fontSize: 12.5, color: T.sub }}>{m}</span>
                ))}
              </div>
              {info.setup && (
                <div style={{ marginBottom: 12 }}>
                  <div style={S.label}>Setup</div>
                  <div style={{ fontSize: 14, lineHeight: 1.5 }}>{info.setup}</div>
                </div>
              )}
              {info.execution && info.execution.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={S.label}>How to do it</div>
                  {info.execution.map((s, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, marginBottom: 6 }}>
                      <span style={{ ...display, color: T.accent, fontSize: 15, width: 16 }}>{i + 1}</span>
                      <span style={{ fontSize: 14, lineHeight: 1.45 }}>{s}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 210, background: T.goodDim, borderRadius: 9, padding: 13, borderLeft: `2px solid ${T.good}` }}>
                  <div style={{ ...S.label, color: T.good }}>Do</div>
                  {(info.dos || []).map((x, i) => <div key={i} style={{ fontSize: 13.5, marginBottom: 4 }}>✓ {x}</div>)}
                </div>
                <div style={{ flex: 1, minWidth: 210, background: T.redDim, borderRadius: 9, padding: 13, borderLeft: `2px solid ${T.red}` }}>
                  <div style={{ ...S.label, color: T.red }}>Don't</div>
                  {(info.donts || []).map((x, i) => <div key={i} style={{ fontSize: 13.5, marginBottom: 4 }}>✕ {x}</div>)}
                </div>
              </div>
              {info.feel && (
                <div style={{ fontSize: 13.5, color: T.sub }}>
                  <b style={{ color: T.blue }}>Where you should feel it · </b>{info.feel}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  /* ---------- render ---------- */
  if (authNeeded) {
    return (
      <div style={S.page}>
        <div style={{ ...S.scroll, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ ...S.card, width: 300 }}>
            <div style={{ ...display, fontSize: 30, marginBottom: 6, letterSpacing: "0.06em" }}>Forge<span style={{ color: T.accent }}>.</span></div>
            <p style={{ color: T.sub, fontSize: 13, marginTop: 0 }}>This app is password-protected.</p>
            <span style={S.label}>Password</span>
            <input type="password" autoFocus value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && unlock()}
              style={{ ...S.input, marginBottom: 12 }} />
            <button style={S.btn} onClick={unlock}>Unlock</button>
            {pwErr && (
              <div style={{
                marginTop: 12, fontSize: 12.5, lineHeight: 1.5, color: T.red,
                background: T.redDim, borderLeft: `2px solid ${T.red}`, borderRadius: 8, padding: "10px 12px",
              }}>{pwErr}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!loaded) return <div style={S.page}><div style={{ ...S.shell, paddingTop: 40, color: T.sub }}>Loading…</div></div>;

  if (!profile || tab === "profile") {
    return (
      <div style={S.page}>
        {profile && <Header />}
        <div style={S.scroll}>
        <div style={S.shell}>
          {!profile && (
            <div style={{ padding: "26px 2px 6px" }}>
              <div style={{ ...display, fontSize: 40, letterSpacing: "0.06em" }}>Forge<span style={{ color: T.accent }}>.</span></div>
              <p style={{ color: T.sub, fontSize: 14, marginTop: 8 }}>
                Tell your coach about yourself. You'll get a full weekly plan right after.
              </p>
            </div>
          )}
          <div style={S.card}>
            <Rule label="About you" />
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              {[["age", "Age", "34"], ["height", "Height (cm)", "176"], ["weight", "Weight (kg)", "78"]].map(([k, l, ph]) => (
                <div key={k} style={{ flex: 1, minWidth: 88 }}>
                  <span style={S.label}>{l}</span>
                  <input style={S.input} inputMode="decimal" value={d[k]} onChange={(e) => setDF(k, e.target.value)} placeholder={ph} />
                </div>
              ))}
            </div>
            <span style={S.label}>Sex</span>
            <div style={{ display: "flex", gap: 8 }}>
              {["M", "F", "Other"].map((s) => <button key={s} style={S.chip(d.sex === s)} onClick={() => setDF("sex", s)}>{s}</button>)}
            </div>
          </div>
          <div style={S.card}>
            <Rule label="Your goals" />
            <span style={S.label}>Main goal</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
              {GOALS.map((g) => <button key={g} style={S.chip(d.goal === g)} onClick={() => setDF("goal", g)}>{g}</button>)}
            </div>
            <span style={S.label}>Specific goals — your coach reads this</span>
            <textarea rows={2} style={{ ...S.input, resize: "vertical" }}
              placeholder="e.g. Squat 100 kg, do 10 strict pull-ups, drop 5 kg by December"
              value={d.specific} onChange={(e) => setDF("specific", e.target.value)} />
          </div>
          <div style={S.card}>
            <Rule label="Training setup" />
            <span style={S.label}>Experience</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
              {LEVELS.map((l) => <button key={l} style={S.chip(d.level === l)} onClick={() => setDF("level", l)}>{l}</button>)}
            </div>
            <span style={S.label}>Days per week</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
              {[2, 3, 4, 5, 6].map((n) => <button key={n} style={S.chip(+d.days === n)} onClick={() => setDF("days", n)}>{n}</button>)}
            </div>
            <span style={S.label}>Gear you have — pick all that apply</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {GEAR.map(([k, label]) => (
                <button key={k} style={S.chip(d.gear.includes(k))}
                  onClick={() => setDF("gear", d.gear.includes(k) ? d.gear.filter((x) => x !== k) : [...d.gear, k])}>
                  {label}
                </button>
              ))}
              <button style={S.chip(d.gear.length === 0)} onClick={() => setDF("gear", [])}>Bodyweight only</button>
            </div>
          </div>
          <div style={S.card}>
            <Rule label="Injuries & limitations" />
            {(d.injuries || []).length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                {(d.injuries || []).map((inj) => (
                  <span key={inj} style={{ ...S.chip(true), cursor: "default", display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {inj}
                    <span onClick={() => setDF("injuries", d.injuries.filter((x) => x !== inj))}
                      style={{ cursor: "pointer", fontWeight: 800 }}>✕</span>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              <input style={{ ...S.input, minWidth: 160, flex: 1, width: "auto" }} value={addInj} placeholder="e.g. left knee — avoid deep flexion"
                onChange={(e) => setAddInj(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && addInj.trim()) { setDF("injuries", [...(d.injuries || []), addInj.trim()]); setAddInj(""); } }} />
              <button style={{ ...S.ghost, whiteSpace: "nowrap" }}
                onClick={() => { if (addInj.trim()) { setDF("injuries", [...(d.injuries || []), addInj.trim()]); setAddInj(""); } }}>
                Add
              </button>
            </div>
            <p style={{ color: T.sub, fontSize: 12.5, margin: 0 }}>
              The coach programs around these — plans and exercise swaps will avoid aggravating movements.
            </p>
          </div>

          {profile && (
            <div style={S.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <Rule label="WHOOP" />
                {whoopConn && <span style={{ fontSize: 12, color: T.good, fontWeight: 700 }}>● connected</span>}
              </div>
              {!whoopConn ? (
                <>
                  <p style={{ color: T.sub, fontSize: 13, marginTop: 0 }}>
                    Connect your WHOOP and the coach will calibrate each day's intensity to your recovery, sleep and strain.
                  </p>
                  <button style={S.btn} onClick={connectWhoop}>Connect WHOOP</button>
                  {whoopErr && (
                    <div style={{
                      marginTop: 10, fontSize: 12.5, lineHeight: 1.5, color: T.red,
                      background: T.redDim, borderLeft: `2px solid ${T.red}`, borderRadius: 8, padding: "10px 12px",
                    }}>
                      {whoopErr}
                    </div>
                  )}
                  <p style={{ color: T.dim, fontSize: 11.5, marginBottom: 0 }}>
                    Needs WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET set on the server — see the README.
                  </p>
                </>
              ) : (
                <>
                  {whoop && whoop.recovery != null ? (
                    <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                      {[[whoop.recovery + "%", "Recovery"], [whoop.hrv, "HRV ms"], [whoop.rhr, "RHR"], [whoop.sleepHours + "h", "Sleep"]].map(([n, l]) => (
                        <div key={l} style={{ ...S.tile, flex: 1, padding: "8px 10px" }}>
                          <div style={{ ...S.tileNum, fontSize: 18 }}>{n ?? "—"}</div>
                          <div style={S.tileLab}>{l}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ color: T.sub, fontSize: 13 }}>Connected — data syncs on load.</p>
                  )}
                  <button style={{ ...S.ghost, width: "100%" }} onClick={disconnectWhoop}>Disconnect</button>
                </>
              )}
            </div>
          )}

          {profile && (
            <div style={S.card}>
              <Rule label="Backup & export" />
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <button style={{ ...S.ghost, flex: 1 }} onClick={exportJson}>Download JSON</button>
                <button style={{ ...S.ghost, flex: 1 }} onClick={exportCsv}>Download CSV</button>
              </div>
              <p style={{ color: T.sub, fontSize: 12.5, margin: 0 }}>
                JSON is a full backup of everything. CSV is your workout log for spreadsheets.
              </p>
            </div>
          )}
          <button style={S.btn} onClick={saveProfile}>{profile ? "Save & rebuild my plan" : "Build my weekly plan →"}</button>
          <div style={{ height: 20 }} />
        </div>
        </div>
        {profile && <Tabs />}
      </div>
    );
  }

  return (
    <div style={S.page}>
      <Header />
      <div style={S.scroll}>
      <div style={S.shell}>

        {/* ================= PLAN ================= */}
        {tab === "coach" && (
          <>
            {live && (
              <div onClick={() => setTab("live")} style={{
                ...S.card, borderColor: T.gold, cursor: "pointer",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <span style={{ fontWeight: 800, color: T.gold }}>▶ Session in progress</span>
                <span style={{ fontSize: 13, color: T.sub }}>tap to resume</span>
              </div>
            )}

            {reviewDue && (
              <div style={{ ...S.card, borderColor: T.blue, borderWidth: 1.5 }}>
                <div style={{ fontSize: 11, color: T.blue, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 800, marginBottom: 6 }}>
                  Weekly review
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.55 }}>
                  <b>{thisWeek}/{profile.days}</b> sessions this week
                  {volDeltaPct !== null && <> · volume <b style={{ color: volDeltaPct >= 0 ? T.good : T.red }}>{volDeltaPct >= 0 ? "+" : ""}{volDeltaPct}%</b> vs last week</>}
                  {prsThisWeek > 0 && <> · <b style={{ color: T.gold }}>{prsThisWeek} PR{prsThisWeek > 1 ? "s" : ""}</b> 🎉</>}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button style={{ ...S.btn, flex: 1, padding: "10px 12px", fontSize: 14 }} onClick={() => dismissReview(true)}>
                    Build next week's plan
                  </button>
                  <button style={S.ghost} onClick={() => dismissReview(false)}>Later</button>
                </div>
              </div>
            )}

            {fatigueAlert && !planBusy && (
              <div style={{ ...S.card, background: T.goldDim, borderColor: T.line, borderLeft: `2px solid ${T.gold}` }}>
                <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
                  <b style={{ color: T.gold }}>Fatigue check · </b>
                  {volRising && "Your volume has climbed 4 weeks straight. "}
                  {stalled.length > 0 && `Progress has stalled on ${stalled.join(", ")}. `}
                  A lighter week now usually buys progress later.
                </div>
                <button style={{ ...S.ghost, width: "100%", marginTop: 10, borderColor: T.gold, color: T.gold }}
                  onClick={() => getPlan(profile, { deload: true })}>
                  Plan a deload week
                </button>
              </div>
            )}

            {whoop && whoop.recovery != null && (
              <div style={{ ...S.card, display: "flex", gap: 14, alignItems: "center", padding: "12px 16px" }}>
                <div style={{
                  ...display, fontSize: 30,
                  color: whoop.recovery >= 67 ? T.good : whoop.recovery >= 34 ? T.gold : T.red,
                }}>
                  {whoop.recovery}%
                </div>
                <div style={{ flex: 1, fontSize: 12.5, color: T.sub, lineHeight: 1.5 }}>
                  <b style={{ color: T.text }}>WHOOP recovery</b> — coach adjusts today's intensity to this.<br />
                  {whoop.hrv != null && <>HRV {whoop.hrv}ms · </>}
                  {whoop.rhr != null && <>RHR {whoop.rhr} · </>}
                  {whoop.sleepHours != null && <>Sleep {whoop.sleepHours}h · </>}
                  {whoop.strain != null && <>Strain {whoop.strain}</>}
                </div>
              </div>
            )}

            {adjBusy && (
              <div style={{ ...S.card, borderColor: T.gold }}>
                <span style={{ fontSize: 13.5 }}>
                  <b style={{ color: T.gold }}>⚡ Recovery is {whoop && whoop.recovery}% · </b>
                  adjusting today's session…
                </span>
              </div>
            )}
            {!adjBusy && plan && plan.adjustedDate === todayStr && plan.adjustNote && !plan.adjustUndone && (
              <div style={{ ...S.card, background: T.goldDim, borderColor: T.line, borderLeft: `2px solid ${T.gold}` }}>
                <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
                  <b style={{ color: T.gold }}>⚡ Today auto-adjusted for {plan.adjustRecovery}% recovery · </b>
                  {plan.adjustNote}
                </div>
                {plan.originalDay && (
                  <button onClick={undoAdjust} style={{
                    background: "none", border: "none", color: T.sub, fontSize: 12.5,
                    fontWeight: 700, cursor: "pointer", padding: "8px 0 0", textDecoration: "underline",
                  }}>
                    Feeling strong? Undo — restore the original session
                  </button>
                )}
              </div>
            )}

            {block ? (
              <div style={S.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <Rule label={`Block · ${block.name}`} />
                  <button onClick={() => { if (window.confirm("End this training block?")) endBlock(); }}
                    style={{ background: "none", border: "none", color: T.sub, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    End block
                  </button>
                </div>
                {blockDone ? (
                  <div style={{ fontSize: 14, color: T.good }}>Block complete! 🎉 Start a new one when you're ready.</div>
                ) : blockPhase ? (
                  <div style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 10 }}>
                    Week <b>{blockWeek}/{block.weeks.length}</b> — <b style={{ color: /deload/i.test(blockPhase.type) ? T.gold : T.blue }}>{blockPhase.type}</b>
                    <span style={{ color: T.sub }}> · {blockPhase.note}</span>
                  </div>
                ) : null}
                <div style={{ display: "flex", gap: 3 }}>
                  {(block.weeks || []).map((w) => (
                    <div key={w.week} title={`W${w.week}: ${w.type}`} style={{
                      flex: 1, height: 7, borderRadius: 3,
                      background: w.week < blockWeek ? T.good
                        : w.week === blockWeek ? T.accent
                        : /deload/i.test(w.type) ? "rgba(245,192,78,0.45)" : T.line,
                    }} />
                  ))}
                </div>
              </div>
            ) : (
              <div style={S.card}>
                <Rule label="Train in a block" />
                <p style={{ color: T.sub, fontSize: 13, marginTop: 0 }}>
                  A structured multi-week program: planned progression, a built-in deload, and a peak week aimed at your goals.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  {[8, 10, 12].map((n) => (
                    <button key={n} style={{ ...S.ghost, flex: 1, opacity: blockBusy ? 0.5 : 1 }} disabled={blockBusy}
                      onClick={() => startBlock(n)}>
                      {blockBusy ? "…" : `${n} weeks`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {planBusy && (
              <div style={{ ...S.card, textAlign: "center", padding: 30 }}>
                <div style={{ ...display, fontSize: 18, color: T.accent }}>Building your week…</div>
                <div style={{ color: T.sub, fontSize: 13, marginTop: 6 }}>Goals, gear, recovery and recent sessions all considered</div>
              </div>
            )}
            {planErr && (
              <div style={S.card}>
                <div style={{ color: T.red, fontSize: 14, marginBottom: 12 }}>{planErr}</div>
                <button style={S.ghost} onClick={() => getPlan()}>Try again</button>
              </div>
            )}
            {plan && !planBusy && (
              <>
                {(() => {
                  const td = plan.week && plan.week[todayIdx];
                  const trained = doneDays.has(todayIdx);
                  return (
                    <div style={{
                      ...S.card, padding: 0, overflow: "hidden",
                      borderColor: trained ? T.line : td && !td.rest ? T.accent : T.line,
                    }}>
                      <div style={{ padding: "16px 18px 15px", background: td && !td.rest && !trained ? T.accentDim : "transparent" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <span style={{ fontSize: 10, color: T.dim, textTransform: "uppercase", letterSpacing: "0.16em", fontWeight: 600 }}>
                            Today · {DAYS[todayIdx]}
                          </span>
                          <span style={{ ...mono, fontSize: 10.5, color: T.dim }}>{todayStr}</span>
                        </div>
                        <div style={{ ...display, fontSize: 30, marginTop: 7, color: td && td.rest ? T.sub : T.text }}>
                          {trained ? "Session complete" : td ? (td.rest ? "Rest day" : td.focus) : "No plan yet"}
                        </div>
                        {td && !td.rest && !trained && (
                          <div style={{ ...mono, fontSize: 12, color: T.sub, marginTop: 6 }}>
                            {td.exercises.length} exercises · {td.exercises.reduce((s, e) => s + (+e.sets || 0), 0)} sets
                          </div>
                        )}
                        {td && td.rest && (
                          <div style={{ fontSize: 13.5, color: T.sub, marginTop: 6, lineHeight: 1.5 }}>{td.note || "Recovery day."}</div>
                        )}
                        {trained && (
                          <div style={{ fontSize: 13, color: T.good, marginTop: 6 }}>✓ Logged. Well done.</div>
                        )}
                      </div>
                      {td && !td.rest && !trained && (
                        <div style={{ display: "flex", borderTop: `1px solid ${T.line}` }}>
                          <button onClick={() => startLive(td)} style={{
                            flex: 1, padding: "15px 0", background: T.accent, color: "#150A05", border: "none",
                            cursor: "pointer", fontFamily: FD, textTransform: "uppercase",
                            letterSpacing: "0.11em", fontWeight: 700, fontSize: 13,
                          }}>
                            Start session
                          </button>
                          <button onClick={() => setOpenDay(todayIdx)} style={{
                            padding: "15px 20px", background: "transparent", color: T.sub, border: "none",
                            borderLeft: `1px solid ${T.line}`, cursor: "pointer", fontFamily: FD,
                            textTransform: "uppercase", letterSpacing: "0.11em", fontWeight: 600, fontSize: 12,
                          }}>
                            View
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div style={S.card}>
                  <Rule label="The week" right={`built ${plan.created}`} />
                  <div style={{ fontSize: 13.5, color: T.sub, lineHeight: 1.6 }}>{plan.why}</div>
                </div>

                {/* day strip */}
                <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
                  {(plan.week || []).map((dy, i) => {
                    const isToday = i === todayIdx;
                    const open = openDay === i;
                    const done = doneDays.has(i);
                    const missed = !dy.rest && i < todayIdx && !done;
                    return (
                      <button key={i} onClick={() => setOpenDay(open ? null : i)} style={{
                        flex: 1, padding: "10px 0 8px", borderRadius: 9, cursor: "pointer",
                        border: `1px solid ${open ? T.accent : T.line}`,
                        background: open ? T.accentDim : T.surface,
                        boxShadow: isToday && !open ? `inset 0 -2px 0 ${T.blue}` : "none",
                      }}>
                        <div style={{
                          ...mono, fontSize: 9.5, letterSpacing: "0.06em",
                          color: isToday ? T.blue : T.dim, textTransform: "uppercase",
                        }}>{dy.day}</div>
                        <div style={{
                          width: 26, height: 26, margin: "6px auto 0",
                          color: dy.rest ? T.dim : open ? T.accent : T.sub, opacity: dy.rest ? 0.5 : 1,
                        }}>
                          {dy.rest ? ICONS.rest : iconFor((dy.exercises || [{}])[0].exercise)}
                        </div>
                        <div style={{
                          width: 14, height: 2, margin: "7px auto 0",
                          background: done ? T.good : missed ? T.red : "transparent",
                        }} />
                      </button>
                    );
                  })}
                </div>

                {/* open day detail */}
                {openDay !== null && plan.week && plan.week[openDay] && (() => {
                  const dy = plan.week[openDay];
                  return (
                    <div style={S.card}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                        <div style={{ ...display, fontSize: 24 }}>
                          {dy.rest ? `${dy.day} · Rest` : dy.focus}
                        </div>
                        {openDay === todayIdx && <span style={{ fontSize: 11, color: T.blue, fontWeight: 800, textTransform: "uppercase" }}>Today</span>}
                      </div>
                      {dy.rest ? (
                        <div style={{ color: T.sub, fontSize: 14, lineHeight: 1.5 }}>
                          {dy.note || "Recovery day. Easy walk, stretch, sleep well."}
                        </div>
                      ) : (
                        <>
                          {dy.warmup && (
                            <div style={{
                              background: T.goodDim, borderLeft: `2px solid ${T.good}`, borderRadius: 8,
                              padding: "10px 13px", margin: "4px 0 12px", fontSize: 13, lineHeight: 1.5,
                            }}>
                              <span style={{
                                fontSize: 9.5, color: T.good, textTransform: "uppercase",
                                letterSpacing: "0.14em", fontWeight: 600, display: "block", marginBottom: 4,
                              }}>Warm-up</span>
                              {dy.warmup}
                            </div>
                          )}
                          {(dy.exercises || []).map((e, i) => {
                            const perf = lastPerfFor(e.exercise);
                            return (
                              <div key={i} onClick={() => openExercise(e.exercise)} style={{
                                display: "flex", gap: 12, alignItems: "center", cursor: "pointer",
                                padding: "11px 0", borderBottom: i < dy.exercises.length - 1 ? `1px solid ${T.line}` : "none",
                              }}>
                                <ExIcon name={e.exercise} />
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontWeight: 700, fontSize: 15 }}>{e.exercise} <span style={{ color: T.sub, fontWeight: 400, fontSize: 12 }}>ⓘ</span></div>
                                  {e.load && <div style={{ fontSize: 12.5, color: T.sub, marginTop: 2 }}>{e.load}</div>}
                                  {perf && perf.weight > 0 && (
                                    <div style={{ fontSize: 12, color: T.blue, marginTop: 2 }}>
                                      Last: {perf.sets}×{perf.reps} @ {perf.weight}kg
                                    </div>
                                  )}
                                </div>
                                <button onClick={(ev) => { ev.stopPropagation(); swapExercise(openDay, i); }}
                                  title="Swap for an alternative" style={{
                                    background: T.surface2, border: `1px solid ${T.line}`, color: T.blue,
                                    borderRadius: 8, width: 34, height: 34, cursor: "pointer", fontSize: 16, flexShrink: 0,
                                  }}>
                                  {swapBusy === `${openDay}-${i}` ? "…" : "⇄"}
                                </button>
                                <div style={{ ...mono, fontSize: 14, color: T.text, whiteSpace: "nowrap" }}>{e.sets}<span style={{ color: T.dim }}>×</span>{e.reps}</div>
                              </div>
                            );
                          })}
                          {swapNote && (
                            <div style={{ fontSize: 12.5, color: T.blue, padding: "9px 0 0" }}>{swapNote}</div>
                          )}
                          <button style={{ ...S.btn, marginTop: 14 }} onClick={() => startLive(dy)}>
                            ▶ Start live session
                          </button>
                          <button style={{ ...S.ghost, width: "100%", marginTop: 8 }} onClick={() => sendToLog(dy)}>
                            Prefill the log form instead
                          </button>
                        </>
                      )}
                    </div>
                  );
                })()}

                {plan.tip && (
                  <div style={{ ...S.card, background: T.goodDim, borderColor: T.line, borderLeft: `2px solid ${T.good}` }}>
                    <b style={{ color: T.good }}>Coach's tip · </b><span style={{ fontSize: 14 }}>{plan.tip}</span>
                  </div>
                )}
                <button style={{ ...S.ghost, width: "100%" }} onClick={() => getPlan()}>Rebuild this week's plan</button>
                <div style={{ fontSize: 12, color: T.sub, marginTop: 8, textAlign: "center" }}>
                  Tap any exercise for form, muscles worked, and do's & don'ts.
                </div>
              </>
            )}
            {!plan && !planBusy && !planErr && (
              <div style={S.card}><button style={S.btn} onClick={() => getPlan()}>Build my weekly plan</button></div>
            )}
          </>
        )}

        {/* ================= LIVE SESSION ================= */}
        {tab === "live" && live && (() => {
          const ex = live.exercises[live.idx];
          const perf = lastPerfFor(ex.name);
          const nextW = suggestNext(perf);
          const elapsedMin = Math.floor((nowTs - live.startedAt) / 60000);
          const totalDone = live.exercises.reduce((s, e) => s + e.sets.filter(x => x.done).length, 0);
          const restLeft = restEnd ? Math.max(0, Math.ceil((restEnd - nowTs) / 1000)) : null;
          return (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                <div style={{ ...display, fontSize: 24 }}>{live.focus || "Live session"}</div>
                <div style={{ fontSize: 13, color: T.sub }}>{elapsedMin} min · {totalDone} sets done</div>
              </div>

              {live.warmup && !live.warmupDone && (
                <div style={{
                  ...S.card, background: T.goodDim, borderColor: T.line,
                  borderLeft: `2px solid ${T.good}`,
                }}>
                  <div style={{
                    fontSize: 9.5, color: T.good, textTransform: "uppercase",
                    letterSpacing: "0.14em", fontWeight: 600, marginBottom: 6,
                  }}>Warm-up first</div>
                  <div style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 12 }}>{live.warmup}</div>
                  <button style={{ ...S.ghost, width: "100%" }}
                    onClick={() => updLive((nl) => { nl.warmupDone = true; }, true)}>
                    ✓ Warm-up done
                  </button>
                </div>
              )}

              {restEnd && (
                <div style={{
                  ...S.card, textAlign: "center",
                  background: restLeft > 0 ? T.accentDim : T.goodDim,
                  borderColor: restLeft > 0 ? T.accent : T.good,
                }}>
                  <div style={{ ...mono, fontSize: 44, fontWeight: 500, letterSpacing: "-0.04em", color: restLeft > 0 ? T.accent : T.good }}>
                    {restLeft > 0 ? fmtClock(restLeft) : "GO!"}
                  </div>
                  <div style={{ fontSize: 12, color: T.sub, marginBottom: 10 }}>
                    {restLeft > 0 ? "Rest — breathe, shake it out" : "Rest over. Next set."}
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                    {restLeft > 0 && (
                      <button style={S.ghost} onClick={() => setRestEnd(restEnd + 30000)}>+30s</button>
                    )}
                    <button style={S.ghost} onClick={() => setRestEnd(null)}>
                      {restLeft > 0 ? "Skip" : "Dismiss"}
                    </button>
                  </div>
                </div>
              )}

              <div style={S.card}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 6 }}>
                  <div onClick={() => openExercise(ex.name)} style={{ cursor: "pointer" }}>
                    <ExIcon name={ex.name} size={52} color={T.accent} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 17 }}>
                      {ex.name} <span onClick={() => openExercise(ex.name)} style={{ color: T.blue, fontSize: 12, cursor: "pointer" }}>ⓘ form</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: T.sub }}>
                      Target {ex.targetSets}×{ex.targetReps}{ex.load ? ` · ${ex.load}` : ""}
                    </div>
                    {perf && perf.weight > 0 && (
                      <div style={{ fontSize: 12.5, color: T.blue, marginTop: 2 }}>
                        Last time: {perf.sets}×{perf.reps} @ {perf.weight}kg{nextW ? ` — try ${nextW}kg` : ""}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: T.sub, whiteSpace: "nowrap" }}>
                    {live.idx + 1}/{live.exercises.length}
                  </div>
                </div>

                {(() => {
                  const ww = parseFloat(((ex.sets.find((s) => !s.done) || ex.sets[0]) || {}).weight);
                  const ramp = warmupRamp(ww);
                  if (!ramp) return null;
                  return (
                    <div style={{ background: T.surface2, borderRadius: 10, padding: "9px 12px", margin: "6px 0 8px" }}>
                      <div style={{ ...S.label, marginBottom: 4 }}>Warm-up ramp → {ww}kg</div>
                      <div style={{ fontSize: 13.5, color: T.sub }}>
                        {ramp.map((r) => `${r.kg}kg × ${r.reps}`).join("   ·   ")}
                      </div>
                    </div>
                  );
                })()}

                {ex.sets.map((s, si) => (
                  <div key={si} style={{
                    display: "flex", gap: 8, alignItems: "center", padding: "8px 0",
                    borderBottom: `1px solid ${T.line}`, opacity: s.done ? 0.65 : 1,
                  }}>
                    <span style={{ ...mono, width: 20, color: s.done ? T.good : T.dim, fontSize: 12 }}>{String(si + 1).padStart(2, "0")}</span>
                    <input inputMode="decimal" placeholder="kg" value={s.weight} disabled={s.done}
                      onChange={(e) => updLive((nl) => { nl.exercises[nl.idx].sets[si].weight = e.target.value; })}
                      style={{ ...S.inputNum, width: 74, flex: "none", padding: "10px 8px" }} />
                    <input inputMode="numeric" placeholder="reps" value={s.reps} disabled={s.done}
                      onChange={(e) => updLive((nl) => { nl.exercises[nl.idx].sets[si].reps = e.target.value; })}
                      style={{ ...S.inputNum, width: 64, flex: "none", padding: "10px 8px" }} />
                    <button
                      onClick={() => {
                        if (s.done) { updLive((nl) => { nl.exercises[nl.idx].sets[si].done = false; }, true); return; }
                        updLive((nl) => { nl.exercises[nl.idx].sets[si].done = true; }, true);
                        setRestEnd(Date.now() + restSecs * 1000);
                      }}
                      style={{
                        flex: 1, padding: "11px 0", borderRadius: 8, cursor: "pointer", fontSize: 11.5,
                        border: "none", fontFamily: FD, textTransform: "uppercase", letterSpacing: "0.11em", fontWeight: 700,
                        background: s.done ? T.goodDim : T.accent,
                        color: s.done ? T.good : "#17110E",
                      }}>
                      {s.done ? "✓ Done" : "Log set"}
                    </button>
                  </div>
                ))}
                <button style={{ ...S.ghost, width: "100%", marginTop: 10 }}
                  onClick={() => updLive((nl) => {
                    const cur = nl.exercises[nl.idx];
                    const lastSet = cur.sets[cur.sets.length - 1] || { reps: cur.targetReps.split("-")[0], weight: "" };
                    cur.sets.push({ reps: lastSet.reps, weight: lastSet.weight, done: false });
                  }, true)}>
                  + Extra set
                </button>
              </div>

              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <button style={{ ...S.ghost, flex: 1, opacity: live.idx === 0 ? 0.4 : 1 }} disabled={live.idx === 0}
                  onClick={() => { updLive((nl) => { nl.idx--; }, true); setRestEnd(null); }}>
                  ← Prev
                </button>
                <button style={{ ...S.ghost, flex: 1, opacity: live.idx >= live.exercises.length - 1 ? 0.4 : 1 }}
                  disabled={live.idx >= live.exercises.length - 1}
                  onClick={() => { updLive((nl) => { nl.idx++; }, true); setRestEnd(null); }}>
                  Next →
                </button>
              </div>

              <button style={{ ...S.btn, opacity: totalDone ? 1 : 0.5 }} disabled={!totalDone} onClick={finishLive}>
                Finish session ({totalDone} sets)
              </button>
              <button style={{ background: "none", border: "none", color: T.red, width: "100%", padding: 14, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                onClick={() => { if (window.confirm("Discard this session? Logged sets will be lost.")) discardLive(); }}>
                Discard session
              </button>
            </>
          );
        })()}

        {/* ================= LOG ================= */}
        {tab === "log" && (
          <>
            <div style={S.card}>
              <Rule label="Log a workout" />
              <span style={S.label}>Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                style={{ ...S.input, marginBottom: 12, colorScheme: "dark" }} />
              {exs.map((ex, i) => (
                <div key={i} style={{ background: T.surface2, borderRadius: 10, padding: 13, marginBottom: 9, display: "flex", gap: 11, border: `1px solid ${T.line}` }}>
                  <div onClick={() => ex.name.trim() && openExercise(ex.name)} style={{ cursor: ex.name.trim() ? "pointer" : "default" }}>
                    <ExIcon name={ex.name} size={40} color={T.accent} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <input placeholder="Exercise" list="lib" value={ex.name}
                      onChange={(e) => setExs((a) => a.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                      style={{ ...S.input, background: T.surface, marginBottom: 8 }} />
                    <div style={{ display: "flex", gap: 8 }}>
                      {["sets", "reps", "weight"].map((f) => (
                        <input key={f} placeholder={f === "weight" ? "kg" : f}
                          inputMode="decimal" value={ex[f]}
                          onChange={(e) => setExs((a) => a.map((x, j) => j === i ? { ...x, [f]: e.target.value } : x))}
                          style={{ ...S.inputNum }} />
                      ))}
                    </div>
                    {(() => {
                      const perf = lastPerfFor(ex.name);
                      if (!perf || (!ex.name.trim())) return null;
                      const nextW = suggestNext(perf);
                      return (
                        <div style={{ fontSize: 12, color: T.sub, marginTop: 7, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span>
                            Last: {perf.sets}×{perf.reps}{perf.weight ? ` @ ${perf.weight}kg` : ""} ({perf.date})
                            {nextW ? <> · <b style={{ color: T.good }}>try {nextW}kg</b></> : null}
                          </span>
                          <button
                            onClick={() => setExs((a) => a.map((x, j) => j === i
                              ? { ...x, sets: String(perf.sets || ""), reps: String(perf.reps || ""), weight: nextW ? String(nextW) : String(perf.weight || "") }
                              : x))}
                            style={{ background: "none", border: `1px solid ${T.line}`, color: T.blue, borderRadius: 6, padding: "3px 8px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                            Use
                          </button>
                        </div>
                      );
                    })()}
                    {exs.length > 1 && (
                      <button onClick={() => setExs((a) => a.filter((_, j) => j !== i))}
                        style={{ background: "none", border: "none", color: T.red, fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: "8px 0 0" }}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <datalist id="lib">{LIB.map((e) => <option key={e.name} value={e.name} />)}</datalist>
              <button style={{ ...S.ghost, width: "100%", marginBottom: 12 }} onClick={() => setExs((a) => [...a, emptyEx()])}>
                + Add exercise
              </button>
              <span style={S.label}>Notes — your coach reads these</span>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Felt strong. Shoulder a bit cranky on presses."
                style={{ ...S.input, resize: "vertical", marginBottom: 12 }} />
              <button style={S.btn} onClick={saveWorkout}>{flash || "Save workout"}</button>
            </div>
            <div style={{ ...S.card, padding: 12 }}>
              <div style={{ fontSize: 11.5, color: T.sub, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700 }}>
                Tap to add · long-name ⓘ for form guide
              </div>
              <div style={{ display: "flex", gap: 10, overflowX: "auto" }}>
                {LIB.map((e) => (
                  <div key={e.name} style={{ textAlign: "center", minWidth: 66 }}>
                    <button onClick={() => {
                      const empty = exs.findIndex((x) => !x.name.trim());
                      if (empty >= 0) setExs((a) => a.map((x, j) => j === empty ? { ...x, name: e.name } : x));
                      else setExs((a) => [...a, { ...emptyEx(), name: e.name }]);
                    }} style={{ background: "none", border: "none", cursor: "pointer", color: T.text, padding: 0 }}>
                      <ExIcon name={e.name} size={48} color={T.sub} />
                    </button>
                    <div onClick={() => openExercise(e.name)}
                      style={{ fontSize: 10.5, color: T.sub, marginTop: 4, lineHeight: 1.2, cursor: "pointer" }}>
                      {e.name} <span style={{ color: T.blue }}>ⓘ</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ================= HISTORY ================= */}
        {tab === "history" && (
          <>
            {workouts.length === 0 && (
              <div style={{ ...S.card, color: T.sub }}>No sessions yet. Your plan has one waiting for you.</div>
            )}
            {workouts.map((w) => (
              <div key={w.id} style={S.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                  <span style={{ ...mono, fontSize: 13.5, color: T.text }}>{w.date}</span>
                  <div style={{ display: "flex", gap: 14, alignItems: "baseline" }}>
                    <span style={{ fontSize: 12, color: T.sub }}>{Math.round(volumeOf(w)).toLocaleString()} vol</span>
                    <button onClick={() => delWorkout(w.id)}
                      style={{ background: "none", border: "none", color: T.red, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                      Delete
                    </button>
                  </div>
                </div>
                {w.exercises.map((e, i) => (
                  <div key={i} onClick={() => openExercise(e.name)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${T.line}`, cursor: "pointer" }}>
                    <ExIcon name={e.name} size={30} color={T.sub} />
                    <span style={{ flex: 1, fontSize: 14 }}>{e.name}</span>
                    <span style={{ color: T.sub, fontSize: 13.5 }}>
                      {e.sets && `${e.sets}×`}{e.reps}{e.weight && ` @ ${e.weight}kg`}
                    </span>
                  </div>
                ))}
                {w.notes && <div style={{ fontSize: 13, color: T.sub, marginTop: 8, fontStyle: "italic" }}>{w.notes}</div>}
              </div>
            ))}
          </>
        )}

        {/* ================= STATS ================= */}
        {tab === "stats" && (
          <>
            {/* AI coach review */}
            <div style={{ ...S.card, borderColor: T.blue }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <Rule label="Coach's review" />
                {insights && insights.date && <span style={{ fontSize: 11, color: T.sub }}>{insights.date}</span>}
              </div>
              {!insights && !insightsBusy && (
                <p style={{ color: T.sub, fontSize: 13.5, marginTop: 0 }}>
                  A blunt read of your training: what's working, what's lagging, what to change.
                </p>
              )}
              {insightsBusy && <div style={{ color: T.sub, fontSize: 14 }}>Reviewing your log…</div>}
              {insights && !insightsBusy && (
                <>
                  <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.45, marginBottom: 10 }}>{insights.headline}</div>
                  {insights.wins && insights.wins.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ ...S.label, color: T.good }}>Working</div>
                      {insights.wins.map((x, i) => <div key={i} style={{ fontSize: 13.5, marginBottom: 4 }}>✓ {x}</div>)}
                    </div>
                  )}
                  {insights.gaps && insights.gaps.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ ...S.label, color: T.red }}>Lagging</div>
                      {insights.gaps.map((x, i) => <div key={i} style={{ fontSize: 13.5, marginBottom: 4 }}>▲ {x}</div>)}
                    </div>
                  )}
                  {insights.actions && insights.actions.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ ...S.label, color: T.blue }}>Next 2 weeks</div>
                      {insights.actions.map((x, i) => <div key={i} style={{ fontSize: 13.5, marginBottom: 4 }}>{i + 1}. {x}</div>)}
                    </div>
                  )}
                </>
              )}
              <button style={{ ...S.ghost, width: "100%", marginTop: 8 }} onClick={getInsights} disabled={insightsBusy}>
                {insights ? "Re-analyze my training" : "Analyze my training"}
              </button>
            </div>

            {/* tiles */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(92px,1fr))", gap: 9, marginBottom: 12 }}>
              {[
                [workouts.length, "Sessions"],
                [(totalKg >= 1000 ? Math.round(totalKg / 1000) + "t" : Math.round(totalKg) + "kg"), "Iron lifted"],
                [prList.length, "PRs set"],
                [streak, "Week streak"],
                [thisWeek + "/" + profile.days, "This week"],
                [xp.toLocaleString(), "XP"],
              ].map(([n, l]) => (
                <div key={l} style={S.tile}>
                  <div style={S.tileNum}>{n}</div>
                  <div style={S.tileLab}>{l}</div>
                </div>
              ))}
            </div>

            {/* adherence */}
            <div style={S.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <Rule label="Plan adherence — last 8 weeks" />
                <span style={{ fontSize: 12.5, color: avgAdherence >= 80 ? T.good : avgAdherence >= 50 ? T.gold : T.red, fontWeight: 800 }}>
                  avg {avgAdherence}%
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 7, height: 74 }}>
                {adherence8.map((w) => (
                  <div key={w.k} style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: 9.5, color: T.sub, marginBottom: 2 }}>{w.pct}%</div>
                    <div title={`${w.n}/${target} sessions`} style={{
                      height: Math.max(3, (w.pct / 100) * 50),
                      background: w.pct >= 100 ? T.good : w.pct >= 50 ? T.gold : T.red,
                      borderRadius: "4px 4px 0 0", opacity: w.pct ? 1 : 0.25,
                    }} />
                    <div style={{ fontSize: 9, color: T.sub, marginTop: 3 }}>{w.k.slice(5)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* muscle groups detail */}
            {mList.length > 0 && (
              <div style={S.card}>
                <Rule label="Muscle groups — last 28 days" />
                {mList.map(([g, v]) => {
                  const ds = daysSince(v.last);
                  const stale = ds !== null && ds > 10;
                  return (
                    <div key={g} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
                        <span style={{ fontWeight: 700 }}>{g}</span>
                        <span style={{ color: stale ? T.red : T.sub }}>
                          {v.sets} sets · {Math.round(v.kg).toLocaleString()} kg
                          {ds !== null && ` · ${ds === 0 ? "today" : ds + "d ago"}`}
                        </span>
                      </div>
                      <div style={{ height: 9, background: T.surface2, borderRadius: 5, overflow: "hidden", display: "flex" }}>
                        <div style={{ width: `${(v.kg / maxKg) * 100}%`, background: T.accent }} />
                      </div>
                      <div style={{ height: 4, background: T.surface2, borderRadius: 3, marginTop: 2, overflow: "hidden" }}>
                        <div style={{ width: `${(v.sets / maxSets) * 100}%`, height: "100%", background: T.blue }} />
                      </div>
                    </div>
                  );
                })}
                <div style={{ fontSize: 11.5, color: T.sub, marginTop: 4 }}>
                  <span style={{ color: T.accent }}>■</span> kg lifted &nbsp; <span style={{ color: T.blue }}>■</span> sets
                </div>
              </div>
            )}

            {/* balance */}
            {(pushSets + pullSets + lowerSets) > 0 && (
              <div style={S.card}>
                <Rule label="Balance — last 28 days" />
                {[
                  ["Push", pushSets, "Pull", pullSets],
                  ["Upper", upperSets, "Lower", lowerSets],
                ].map(([la, va, lb, vb]) => {
                  const tot = va + vb || 1;
                  return (
                    <div key={la} style={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                        <span>{la} <b>{va}</b></span><span><b>{vb}</b> {lb}</span>
                      </div>
                      <div style={{ height: 10, borderRadius: 5, overflow: "hidden", display: "flex" }}>
                        <div style={{ width: `${(va / tot) * 100}%`, background: T.accent }} />
                        <div style={{ width: `${(vb / tot) * 100}%`, background: T.blue }} />
                      </div>
                    </div>
                  );
                })}
                {neglected.length > 0 && (
                  <div style={{ background: T.redDim, borderRadius: 9, padding: "11px 13px", fontSize: 13, borderLeft: `2px solid ${T.red}` }}>
                    <b style={{ color: T.red }}>Needs attention · </b>
                    {neglected.join(", ")} — over 10 days without work (or never trained).
                  </div>
                )}
              </div>
            )}

            {/* weekly volume */}
            <div style={S.card}>
              <Rule label="Weekly volume — last 8 weeks" />
              <div style={{ display: "flex", alignItems: "flex-end", gap: 7, height: 100 }}>
                {weeks8.map((w) => (
                  <div key={w.k} style={{ flex: 1, textAlign: "center" }}>
                    <div title={`${Math.round(w.vol)} vol · ${w.n} sessions`} style={{
                      height: Math.max(4, (w.vol / maxWeekVol) * 78),
                      background: w.k === todayKey ? T.accent : T.blue,
                      borderRadius: "4px 4px 0 0", opacity: w.vol ? 1 : 0.25,
                    }} />
                    <div style={{ fontSize: 9.5, color: T.sub, marginTop: 4 }}>{w.k.slice(5)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* progression */}
            {exNames.length > 0 && (
              <div style={S.card}>
                <Rule label="Exercise progression" />
                <select value={chosenEx} onChange={(e) => setStatEx(e.target.value)} style={{ ...S.input, marginBottom: 12 }}>
                  {exNames.map((n) => <option key={n}>{n}</option>)}
                </select>
                {progression.length > 0 ? (
                  <>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 90 }}>
                      {progression.slice(-12).map((p, i) => {
                        const mx = Math.max(...progression.map((q) => q.weight));
                        return (
                          <div key={i} style={{ flex: 1, textAlign: "center" }}>
                            <div style={{ fontSize: 9.5, color: T.sub, marginBottom: 2 }}>{p.weight}</div>
                            <div style={{ height: Math.max(4, (p.weight / mx) * 62), background: T.accent, borderRadius: "4px 4px 0 0" }} />
                            <div style={{ fontSize: 9, color: T.sub, marginTop: 3 }}>{p.date.slice(5)}</div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: 10, fontSize: 13.5, color: T.sub }}>
                      Estimated 1RM: <b style={{ color: T.text }}>{e1rm} kg</b>
                      {prs[chosenEx.toLowerCase()] && <> · Best set: <b style={{ color: T.gold }}>{prs[chosenEx.toLowerCase()].weight} kg</b></>}
                    </div>
                  </>
                ) : (
                  <div style={{ color: T.sub, fontSize: 13.5 }}>Log this exercise with a weight to see progression.</div>
                )}
              </div>
            )}

            {/* body weight */}
            <div style={S.card}>
              <Rule label="Body weight" />
              <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <input style={{ ...S.input, minWidth: 150, flex: 1, width: "auto" }} inputMode="decimal" placeholder="Today's weight (kg)"
                  value={bwInput} onChange={(e) => setBwInput(e.target.value)} />
                <button style={{ ...S.ghost, whiteSpace: "nowrap" }} onClick={logBodyWeight}>Log</button>
              </div>
              {bwSorted.length > 0 && (
                <>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 60 }}>
                    {bwSorted.slice(-14).map((b, i) => {
                      const vals = bwSorted.slice(-14).map((x) => x.weight);
                      const mn = Math.min(...vals), mx = Math.max(...vals);
                      const h = mx === mn ? 30 : 8 + ((b.weight - mn) / (mx - mn)) * 44;
                      return <div key={i} title={`${b.date}: ${b.weight}kg`}
                        style={{ flex: 1, height: h, background: T.blue, borderRadius: 3, opacity: 0.55 + 0.45 * (i / 14) }} />;
                    })}
                  </div>
                  <div style={{ fontSize: 13, color: T.sub, marginTop: 8 }}>
                    Latest: <b style={{ color: T.text }}>{bwSorted[bwSorted.length - 1].weight} kg</b>
                    {bwDelta !== null && <> · {bwDelta > 0 ? "+" : ""}{bwDelta} kg since first log</>}
                  </div>
                </>
              )}
            </div>

            {/* nutrition */}
            <div style={S.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <Rule label="Nutrition" />
                {nut && <span style={{ fontSize: 12, color: T.sub }}>targets: {nut.kcal} kcal · {nut.protein}g protein</span>}
              </div>
              {!nut ? (
                <p style={{ color: T.sub, fontSize: 13.5, margin: 0 }}>
                  Add your age, height and weight in the You tab and I'll compute daily calorie and protein targets for your goal.
                </p>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                    <input style={{ ...S.input, minWidth: 110, flex: 1, width: "auto" }} inputMode="numeric" placeholder={`kcal today${todayNut && todayNut.kcal ? ` (${todayNut.kcal})` : ""}`}
                      value={nKcal} onChange={(e) => setNKcal(e.target.value)} />
                    <input style={{ ...S.input, minWidth: 110, flex: 1, width: "auto" }} inputMode="numeric" placeholder={`protein g${todayNut && todayNut.protein ? ` (${todayNut.protein})` : ""}`}
                      value={nProt} onChange={(e) => setNProt(e.target.value)} />
                    <button style={{ ...S.ghost, whiteSpace: "nowrap" }} onClick={saveNutrition}>Log</button>
                  </div>
                  {todayNut && (
                    <div style={{ fontSize: 13, marginBottom: 10 }}>
                      Today: <b style={{ color: todayNut.kcal <= nut.kcal ? T.good : T.gold }}>{todayNut.kcal || 0}</b>
                      <span style={{ color: T.sub }}>/{nut.kcal} kcal</span> · {" "}
                      <b style={{ color: (todayNut.protein || 0) >= nut.protein ? T.good : T.gold }}>{todayNut.protein || 0}</b>
                      <span style={{ color: T.sub }}>/{nut.protein}g protein</span>
                    </div>
                  )}
                  {nutrition.length > 0 && (
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 56 }}>
                      {Array.from({ length: 14 }).map((_, i) => {
                        const dt = new Date(todayStr + "T00:00:00"); dt.setDate(dt.getDate() - (13 - i));
                        const ds = dt.toISOString().slice(0, 10);
                        const en = nutrition.find((n) => n.date === ds);
                        const pPct = en ? Math.min(1.15, (+en.protein || 0) / nut.protein) : 0;
                        return (
                          <div key={ds} title={en ? `${ds}: ${en.kcal} kcal, ${en.protein}g protein` : ds}
                            style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
                            <div style={{
                              height: Math.max(2, pPct * 46),
                              background: pPct >= 1 ? T.good : en ? T.blue : T.line,
                              borderRadius: 2, opacity: en ? 1 : 0.3,
                            }} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: T.sub, marginTop: 5 }}>
                    Protein vs target, last 14 days. <span style={{ color: T.good }}>■</span> hit target
                  </div>
                </>
              )}
            </div>

            {/* PRs */}
            {prList.length > 0 && (
              <div style={S.card}>
                <Rule label="Personal records" />
                {prList.slice(0, 8).map((p) => (
                  <div key={p.name} onClick={() => openExercise(p.name)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${T.line}`, cursor: "pointer" }}>
                    <ExIcon name={p.name} size={30} color={T.gold} />
                    <span style={{ flex: 1, fontSize: 14 }}>{p.name}</span>
                    <span style={{ ...mono, color: T.gold, fontSize: 14 }}>{p.weight}<span style={{ color: T.dim, fontSize: 11 }}> kg</span></span>
                    <span style={{ color: T.sub, fontSize: 12 }}>{p.date}</span>
                  </div>
                ))}
              </div>
            )}

            {/* achievements */}
            <div style={S.card}>
              <Rule label="Achievements" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(92px,1fr))", gap: 8 }}>
                {earned.map((b) => (
                  <div key={b.id} style={{
                    background: b.on ? T.accentDim : T.surface2,
                    border: `1px solid ${b.on ? T.accent : T.line}`,
                    borderRadius: 10, padding: "10px 8px", textAlign: "center", opacity: b.on ? 1 : 0.45,
                  }}>
                    <div style={{ fontSize: 20 }}>{b.on ? "🏅" : "🔒"}</div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, marginTop: 4 }}>{b.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
      </div>
      <Tabs />
      <ExModal />
      {celebrate && (
        <div onClick={() => setCelebrate(null)} style={{
          position: "absolute", inset: 0, zIndex: 60, background: "rgba(6,8,11,0.88)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
          <div style={{
            background: "linear-gradient(160deg,#2A2410,#1A1F26)", border: `1.5px solid ${T.gold}`,
            borderRadius: 20, padding: "30px 24px", textAlign: "center", maxWidth: 420, width: "100%",
            boxShadow: "0 0 80px rgba(245,192,78,0.25)",
          }}>
            <div style={{ fontSize: 54, lineHeight: 1 }}>🏆</div>
            <div style={{ ...display, fontSize: 34, color: T.gold, margin: "10px 0 18px", letterSpacing: "0.04em" }}>
              New PR{celebrate.length > 1 ? "s" : ""}!
            </div>
            {celebrate.map((p) => (
              <div key={p.name} style={{ fontSize: 16, marginBottom: 8 }}>
                <b>{p.name}</b><br />
                <span style={{ color: T.sub }}>{p.old ? `${p.old} kg → ` : ""}</span>
                <b style={{ color: T.gold, fontSize: 20 }}>{p.weight} kg</b>
              </div>
            ))}
            <div style={{ color: T.sub, fontSize: 12.5, marginTop: 14 }}>Tap anywhere to keep forging</div>
          </div>
        </div>
      )}
    </div>
  );
}
