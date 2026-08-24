import { useState, useEffect, useRef } from "react";
import { sanitizePlan } from "./lib/plan-schema.js";
import { constraintBlock } from "./lib/constraints.js";
import { applyPlanRewrite, canAutoAdjust, applyAutoAdjust } from "./lib/coach-write.js";
import { suggestFromHistory, bumpWeight } from "./lib/progression.js";
import { adjustReason, strainBudget } from "./lib/whoop-signal.js";

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
  { name: "Walk", group: "Cardio", icon: "run", gear: [] },
  { name: "Rowing machine", group: "Cardio", icon: "run", gear: ["cardio"] },
  { name: "Elliptical", group: "Cardio", icon: "run", gear: ["cardio"] },
  { name: "Jump rope", group: "Cardio", icon: "run", gear: [] },
  { name: "Swim", group: "Cardio", icon: "run", gear: [] },
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
  const n = (name || "").trim().toLowerCase();
  const exact = LIB.find((e) => e.name.toLowerCase() === n);
  if (exact) return exact.group;
  // guarded before the fuzzy pass: "Walking lunge" must not match the "Walk" entry
  if (/lunge|split squat/.test(n)) return "Legs";
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

/* ================= time-based movements =================
   Cardio, holds and carries can't be logged as sets × reps × kg —
   the honest unit is minutes (plus distance where it exists). An
   exercise carries an explicit `mode` once the user toggles it;
   otherwise the mode is inferred from the name. Entries logged
   before this existed have no mode and no mins, so they read as
   "reps" and behave exactly as they always did. */
const TIMED_RE = /\b(run|running|jog|jogging|sprint|sprints|bike|biking|cycling|spin|walk|walking|hike|hiking|treadmill|elliptical|erg|rower|rowing machine|stairmaster|stair climber|swim|swimming|jump rope|skipping|cardio|plank|dead hang|wall sit|carry|farmers walk)\b/i;
const isTimedName = (name) => {
  const n = String(name || "").replace(/[-_']/g, " ");
  if (/lunge/i.test(n)) return false;
  return TIMED_RE.test(n);
};
const exMode = (ex) => (ex && ex.mode) || (isTimedName(ex && ex.name) ? "time" : "reps");
const isTimedEx = (ex) => exMode(ex) === "time";
// one-line summary for history, plan rows and "last time" hints
const exSummary = (e) => {
  if (!e) return "";
  if (isTimedEx(e)) {
    const bits = [];
    if (e.mins) bits.push(`${e.mins} min`);
    if (e.km) bits.push(`${e.km} km`);
    return bits.join(" · ");
  }
  return `${e.sets ? `${e.sets}×` : ""}${e.reps || ""}${e.weight ? ` @ ${e.weight}kg` : ""}`;
};

/* ================= exercise name normalization =================
   Free-text logging fragments the same lift across spellings
   ("Bench press" / "bench Press" / "Barbell bench press"), which
   splits PRs, muscle stats and readiness. canonicalName() folds a
   typed name onto one canonical label. */
const ALIASES = {
  "back squat": ["barbell squat", "bb squat", "squat", "squats", "high bar squat", "low bar squat"],
  "front squat": ["front barbell squat", "fsquat"],
  "goblet squat": ["kb goblet squat", "db goblet squat"],
  "bodyweight squat": ["air squat", "bw squat"],
  "leg press": ["legpress", "machine leg press"],
  "lunge": ["lunges", "forward lunge", "db lunge", "dumbbell lunge"],
  "walking lunge": ["walking lunges"],
  "bulgarian split squat": ["bss", "split squat", "rear foot elevated split squat", "rfess"],
  "leg extension": ["leg extensions", "quad extension"],
  "leg curl": ["leg curls", "hamstring curl", "lying leg curl"],
  "calf raise": ["calf raises", "standing calf raise"],
  "deadlift": ["conventional deadlift", "dl", "barbell deadlift"],
  "romanian deadlift": ["rdl", "rdls", "romanian dl", "stiff leg deadlift", "sldl"],
  "sumo deadlift": ["sumo dl"],
  "kettlebell swing": ["kb swing", "kb swings", "kettlebell swings", "swing"],
  "hip thrust": ["barbell hip thrust", "hip thrusts"],
  "glute bridge": ["glute bridges"],
  "good morning": ["good mornings"],
  "bench press": ["bench", "barbell bench press", "bb bench", "flat bench press", "bench press flat"],
  "incline bench press": ["incline bench", "incline barbell press"],
  "dumbbell bench press": ["db bench press", "db bench", "dumbbell bench"],
  "incline dumbbell press": ["incline db press", "incline dumbbell bench press"],
  "push-up": ["pushup", "push up", "pushups", "push ups", "press up"],
  "dip": ["dips", "triceps dip", "chest dip"],
  "chest fly": ["dumbbell fly", "db fly", "flyes", "chest flies", "pec fly"],
  "cable fly": ["cable crossover", "cable flyes"],
  "overhead press": ["ohp", "military press", "shoulder press", "barbell shoulder press", "strict press"],
  "dumbbell shoulder press": ["db shoulder press", "db overhead press"],
  "arnold press": ["arnolds"],
  "lateral raise": ["lat raise", "side raise", "lateral raises", "side lateral raise"],
  "front raise": ["front raises"],
  "rear delt fly": ["reverse fly", "rear delt raise", "reverse flyes"],
  "upright row": ["upright rows"],
  "shrug": ["shrugs", "barbell shrug", "db shrug"],
  "face pull": ["face pulls"],
  "pull-up": ["pullup", "pull up", "pullups", "pull ups"],
  "chin-up": ["chinup", "chin up", "chinups", "chin ups"],
  "lat pulldown": ["pulldown", "lat pull down", "lat pulldowns"],
  "barbell row": ["bent over row", "bb row", "bent-over barbell row", "pendlay row"],
  "dumbbell row": ["db row", "one arm dumbbell row", "single arm row"],
  "seated cable row": ["cable row", "seated row"],
  "t-bar row": ["tbar row", "t bar row"],
  "band row": ["resistance band row"],
  "hyperextension": ["back extension", "hyperextensions", "back extensions"],
  "biceps curl": ["bicep curl", "curl", "curls", "db curl", "dumbbell curl", "bicep curls"],
  "barbell curl": ["bb curl", "ez bar curl", "ez-bar curl"],
  "hammer curl": ["hammer curls"],
  "preacher curl": ["preacher curls"],
  "triceps extension": ["tricep extension", "overhead tricep extension", "tricep extensions"],
  "skullcrusher": ["skull crusher", "skullcrushers", "lying tricep extension"],
  "triceps pushdown": ["tricep pushdown", "pushdown", "cable pushdown", "rope pushdown"],
  "close-grip bench press": ["close grip bench", "cgbp"],
  "plank": ["planks", "front plank"],
  "side plank": ["side planks"],
  "crunch": ["crunches", "ab crunch"],
  "sit-up": ["situp", "sit up", "situps", "sit ups"],
  "hanging leg raise": ["hanging leg raises", "leg raise", "leg raises"],
  "russian twist": ["russian twists"],
  "mountain climber": ["mountain climbers"],
  "ab wheel": ["ab roller", "ab wheel rollout"],
  "cable crunch": ["kneeling cable crunch"],
  "farmer's walk": ["farmers walk", "farmer walk", "farmers carry"],
  "clean": ["power clean", "hang clean"],
  "snatch": ["power snatch"],
  "clean and jerk": ["c&j"],
  "thruster": ["thrusters"],
  "burpee": ["burpees"],
  "box jump": ["box jumps"],
  "run": ["running", "jog", "jogging", "treadmill"],
  "bike": ["cycling", "bicycle", "stationary bike", "spin"],
  "rowing machine": ["rower", "erg", "row machine", "concept2"],
  "jump rope": ["skipping", "skip rope"],
  "elliptical": ["cross trainer"],
  "walk": ["walking", "brisk walk", "hike", "hiking", "walking, treadmill"],
  "swim": ["swimming", "swim laps", "laps"],
  "stair climber": ["stairmaster", "stair master", "step mill", "stairs"],
  "dead hang": ["hang", "bar hang"],
};
const ALIAS_LOOKUP = (() => {
  const m = {};
  Object.entries(ALIASES).forEach(([canon, list]) => {
    m[canon] = canon;
    list.forEach((a) => { if (!m[a]) m[a] = canon; });
  });
  LIB.forEach((e) => { const k = e.name.toLowerCase(); if (!m[k]) m[k] = k; });
  return m;
})();
const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const canonicalName = (raw) => {
  const t = (raw || "").trim();
  if (!t) return t;
  let n = t.toLowerCase().replace(/\s+/g, " ").replace(/[.]/g, "");
  if (ALIAS_LOOKUP[n]) return titleCase(ALIAS_LOOKUP[n]);
  const stripped = n.replace(/^(barbell|dumbbell|db|bb|cable|machine|smith machine|kettlebell|kb|banded|band|resistance band|seated|standing) /, "");
  if (ALIAS_LOOKUP[stripped]) return titleCase(ALIAS_LOOKUP[stripped]);
  const singular = n.replace(/s$/, "");
  if (ALIAS_LOOKUP[singular]) return titleCase(ALIAS_LOOKUP[singular]);
  return t.replace(/\s+/g, " ");
};

/* ---------- estimated 1RM (Epley) ----------
   Top weight alone hides progress: 100kg x 5 beats 105kg x 1.
   Capped at 12 reps where the formula stops being meaningful. */
const estimate1RM = (weight, reps) => {
  const w = +weight || 0, r = +reps || 0;
  if (!w || !r || r > 12) return 0;
  return Math.round(w * (1 + r / 30));
};

/* ---------- DOTS ----------
   Bodyweight-normalised strength score used in modern powerlifting: it lets
   a 62kg and a 105kg lifter compare totals directly. Polynomial coefficients
   are the official IPF-adjacent DOTS set; the formula is only meaningful
   inside the bodyweight range it was fitted to, so it returns null outside. */
const DOTS_COEF = {
  M: [-0.000001093, 0.0007391293, -0.1918759221, 24.0900756, -307.75076],
  F: [-0.0000010706, 0.0005158568, -0.1126655495, 13.6175032, -57.96288],
};
const dotsScore = (totalKg, bwKg, sex) => {
  const total = +totalKg || 0, raw = +bwKg || 0;
  if (total <= 0 || raw <= 0) return null;
  const female = sex === "F";
  /* The polynomial was fitted to 40-210kg (40-150 for women) and goes
     nonsensical outside it, so the official implementation clamps to the
     boundary rather than extrapolating. Matching that keeps the score
     comparable to any other DOTS calculator. */
  const bw = Math.min(female ? 150 : 210, Math.max(40, raw));
  const [a, b, c, d, e] = DOTS_COEF[female ? "F" : "M"];
  const denom = a * bw ** 4 + b * bw ** 3 + c * bw ** 2 + d * bw + e;
  if (denom <= 0) return null;
  return Math.round((total * 500) / denom);
};
/* Rough interpretation bands for a squat+bench+deadlift DOTS. */
const DOTS_BANDS = [
  [200, "Untrained"], [250, "Beginner"], [300, "Novice"],
  [350, "Intermediate"], [425, "Advanced"], [500, "Elite"], [Infinity, "World class"],
];
const dotsBand = (v) => (v == null ? null : (DOTS_BANDS.find(([n]) => v < n) || DOTS_BANDS[DOTS_BANDS.length - 1])[1]);

/* ---------- strength standards ----------
   Thresholds are bodyweight multiples for a 1RM, the widely used
   ExRx-style bands. They are population averages, not a verdict: age,
   limb length and training age all move them. */
const LEVELS_5 = ["Beginner", "Novice", "Intermediate", "Advanced", "Elite"];
const STANDARDS = {
  //            beg   nov   int   adv   elite
  Squat:    { M: [1.0, 1.25, 1.5, 2.25, 2.75], F: [0.6, 0.85, 1.1, 1.5, 2.0] },
  Bench:    { M: [0.75, 1.0, 1.25, 1.75, 2.0], F: [0.4, 0.6, 0.75, 1.0, 1.35] },
  Deadlift: { M: [1.25, 1.5, 1.75, 2.5, 3.0], F: [0.6, 1.0, 1.25, 1.75, 2.25] },
  Press:    { M: [0.4, 0.6, 0.8, 1.1, 1.4], F: [0.25, 0.4, 0.55, 0.75, 1.0] },
  Row:      { M: [0.6, 0.85, 1.1, 1.5, 1.8], F: [0.35, 0.5, 0.7, 0.95, 1.25] },
};
/* Returns where a lift sits on the ladder plus what the next rung costs,
   which is the part that actually changes what you do on Monday. */
const standardFor = (lift, kg, bwKg, sex) => {
  const table = STANDARDS[lift];
  const bw = +bwKg || 0, best = +kg || 0;
  if (!table || bw <= 0 || best <= 0) return null;
  const th = (table[sex === "F" ? "F" : "M"]).map((m) => m * bw);
  let idx = -1;
  for (let i = 0; i < th.length; i++) if (best >= th[i]) idx = i;
  const next = idx + 1 < th.length ? th[idx + 1] : null;
  const floor = idx >= 0 ? th[idx] : 0;
  const ceil = next != null ? next : th[th.length - 1];
  return {
    lift,
    kg: Math.round(best),
    level: idx >= 0 ? LEVELS_5[idx] : "Untrained",
    levelIdx: idx,
    thresholds: th.map((v) => Math.round(v)),
    nextLevel: next != null ? LEVELS_5[idx + 1] : null,
    toNext: next != null ? Math.round(next - best) : 0,
    /* progress across the whole ladder, for the bar */
    pct: Math.max(0, Math.min(100, Math.round((best / th[th.length - 1]) * 100))),
    /* progress within the current rung, for the "x kg to Advanced" line */
    rungPct: ceil > floor ? Math.max(0, Math.min(100, Math.round(((best - floor) / (ceil - floor)) * 100))) : 100,
  };
};

/* ---------- exercise photos (free-exercise-db, public domain) ----------
   Full 873-exercise catalog by name; ids derive from the name, so only the
   names ship. PREFERRED pins the lifts people log most to a hand-checked
   photo; anything else goes through the fuzzy matcher below. Coverage is
   verified by a test rather than spot-checked. */
const EX_NAMES = "3/4 Sit-Up|90/90 Hamstring|Ab Crunch Machine|Ab Roller|Adductor|Adductor/Groin|Advanced Kettlebell Windmill|Air Bike|All Fours Quad Stretch|Alternate Hammer Curl|Alternate Heel Touchers|Alternate Incline Dumbbell Curl|Alternate Leg Diagonal Bound|Alternating Cable Shoulder Press|Alternating Deltoid Raise|Alternating Floor Press|Alternating Hang Clean|Alternating Kettlebell Press|Alternating Kettlebell Row|Alternating Renegade Row|Ankle Circles|Ankle On The Knee|Anterior Tibialis-SMR|Anti-Gravity Press|Arm Circles|Arnold Dumbbell Press|Around The Worlds|Atlas Stone Trainer|Atlas Stones|Axle Deadlift|Back Flyes - With Bands|Backward Drag|Backward Medicine Ball Throw|Balance Board|Ball Leg Curl|Band Assisted Pull-Up|Band Good Morning|Band Good Morning (Pull Through)|Band Hip Adductions|Band Pull Apart|Band Skull Crusher|Barbell Ab Rollout|Barbell Ab Rollout - On Knees|Barbell Bench Press - Medium Grip|Barbell Curl|Barbell Curls Lying Against An Incline|Barbell Deadlift|Barbell Full Squat|Barbell Glute Bridge|Barbell Guillotine Bench Press|Barbell Hack Squat|Barbell Hip Thrust|Barbell Incline Bench Press - Medium Grip|Barbell Incline Shoulder Raise|Barbell Lunge|Barbell Rear Delt Row|Barbell Rollout from Bench|Barbell Seated Calf Raise|Barbell Shoulder Press|Barbell Shrug|Barbell Shrug Behind The Back|Barbell Side Bend|Barbell Side Split Squat|Barbell Squat|Barbell Squat To A Bench|Barbell Step Ups|Barbell Walking Lunge|Battling Ropes|Bear Crawl Sled Drags|Behind Head Chest Stretch|Bench Dips|Bench Jump|Bench Press - Powerlifting|Bench Press - With Bands|Bench Press with Chains|Bench Sprint|Bent Over Barbell Row|Bent Over Dumbbell Rear Delt Raise With Head On Bench|Bent Over Low-Pulley Side Lateral|Bent Over One-Arm Long Bar Row|Bent Over Two-Arm Long Bar Row|Bent Over Two-Dumbbell Row|Bent Over Two-Dumbbell Row With Palms In|Bent Press|Bent-Arm Barbell Pullover|Bent-Arm Dumbbell Pullover|Bent-Knee Hip Raise|Bicycling|Bicycling, Stationary|Board Press|Body Tricep Press|Body-Up|Bodyweight Flyes|Bodyweight Mid Row|Bodyweight Squat|Bodyweight Walking Lunge|Bosu Ball Cable Crunch With Side Bends|Bottoms Up|Bottoms-Up Clean From The Hang Position|Box Jump (Multiple Response)|Box Skip|Box Squat|Box Squat with Bands|Box Squat with Chains|Brachialis-SMR|Bradford/Rocky Presses|Butt Lift (Bridge)|Butt-Ups|Butterfly|Cable Chest Press|Cable Crossover|Cable Crunch|Cable Deadlifts|Cable Hammer Curls - Rope Attachment|Cable Hip Adduction|Cable Incline Pushdown|Cable Incline Triceps Extension|Cable Internal Rotation|Cable Iron Cross|Cable Judo Flip|Cable Lying Triceps Extension|Cable One Arm Tricep Extension|Cable Preacher Curl|Cable Rear Delt Fly|Cable Reverse Crunch|Cable Rope Overhead Triceps Extension|Cable Rope Rear-Delt Rows|Cable Russian Twists|Cable Seated Crunch|Cable Seated Lateral Raise|Cable Shoulder Press|Cable Shrugs|Cable Wrist Curl|Calf Press|Calf Press On The Leg Press Machine|Calf Raise On A Dumbbell|Calf Raises - With Bands|Calf Stretch Elbows Against Wall|Calf Stretch Hands Against Wall|Calf-Machine Shoulder Shrug|Calves-SMR|Car Deadlift|Car Drivers|Carioca Quick Step|Cat Stretch|Catch and Overhead Throw|Chain Handle Extension|Chain Press|Chair Leg Extended Stretch|Chair Lower Back Stretch|Chair Squat|Chair Upper Body Stretch|Chest And Front Of Shoulder Stretch|Chest Push (multiple response)|Chest Push (single response)|Chest Push from 3 point stance|Chest Push with Run Release|Chest Stretch on Stability Ball|Child's Pose|Chin To Chest Stretch|Chin-Up|Circus Bell|Clean|Clean Deadlift|Clean Pull|Clean Shrug|Clean and Jerk|Clean and Press|Clean from Blocks|Clock Push-Up|Close-Grip Barbell Bench Press|Close-Grip Dumbbell Press|Close-Grip EZ Bar Curl|Close-Grip EZ-Bar Curl with Band|Close-Grip EZ-Bar Press|Close-Grip Front Lat Pulldown|Close-Grip Push-Up off of a Dumbbell|Close-Grip Standing Barbell Curl|Cocoons|Conan's Wheel|Concentration Curls|Cross Body Hammer Curl|Cross Over - With Bands|Cross-Body Crunch|Crossover Reverse Lunge|Crucifix|Crunch - Hands Overhead|Crunch - Legs On Exercise Ball|Crunches|Cuban Press|Dancer's Stretch|Dead Bug|Deadlift with Bands|Deadlift with Chains|Decline Barbell Bench Press|Decline Close-Grip Bench To Skull Crusher|Decline Crunch|Decline Dumbbell Bench Press|Decline Dumbbell Flyes|Decline Dumbbell Triceps Extension|Decline EZ Bar Triceps Extension|Decline Oblique Crunch|Decline Push-Up|Decline Reverse Crunch|Decline Smith Press|Deficit Deadlift|Depth Jump Leap|Dip Machine|Dips - Chest Version|Dips - Triceps Version|Donkey Calf Raises|Double Kettlebell Alternating Hang Clean|Double Kettlebell Jerk|Double Kettlebell Push Press|Double Kettlebell Snatch|Double Kettlebell Windmill|Double Leg Butt Kick|Downward Facing Balance|Drag Curl|Drop Push|Dumbbell Alternate Bicep Curl|Dumbbell Bench Press|Dumbbell Bench Press with Neutral Grip|Dumbbell Bicep Curl|Dumbbell Clean|Dumbbell Floor Press|Dumbbell Flyes|Dumbbell Incline Row|Dumbbell Incline Shoulder Raise|Dumbbell Lunges|Dumbbell Lying One-Arm Rear Lateral Raise|Dumbbell Lying Pronation|Dumbbell Lying Rear Lateral Raise|Dumbbell Lying Supination|Dumbbell One-Arm Shoulder Press|Dumbbell One-Arm Triceps Extension|Dumbbell One-Arm Upright Row|Dumbbell Prone Incline Curl|Dumbbell Raise|Dumbbell Rear Lunge|Dumbbell Scaption|Dumbbell Seated Box Jump|Dumbbell Seated One-Leg Calf Raise|Dumbbell Shoulder Press|Dumbbell Shrug|Dumbbell Side Bend|Dumbbell Squat|Dumbbell Squat To A Bench|Dumbbell Step Ups|Dumbbell Tricep Extension -Pronated Grip|Dynamic Back Stretch|Dynamic Chest Stretch|EZ-Bar Curl|EZ-Bar Skullcrusher|Elbow Circles|Elbow to Knee|Elbows Back|Elevated Back Lunge|Elevated Cable Rows|Elliptical Trainer|Exercise Ball Crunch|Exercise Ball Pull-In|Extended Range One-Arm Kettlebell Floor Press|External Rotation|External Rotation with Band|External Rotation with Cable|Face Pull|Farmer's Walk|Fast Skipping|Finger Curls|Flat Bench Cable Flyes|Flat Bench Leg Pull-In|Flat Bench Lying Leg Raise|Flexor Incline Dumbbell Curls|Floor Glute-Ham Raise|Floor Press|Floor Press with Chains|Flutter Kicks|Foot-SMR|Forward Drag with Press|Frankenstein Squat|Freehand Jump Squat|Frog Hops|Frog Sit-Ups|Front Barbell Squat|Front Barbell Squat To A Bench|Front Box Jump|Front Cable Raise|Front Cone Hops (or hurdle hops)|Front Dumbbell Raise|Front Incline Dumbbell Raise|Front Leg Raises|Front Plate Raise|Front Raise And Pullover|Front Squat (Clean Grip)|Front Squats With Two Kettlebells|Front Two-Dumbbell Raise|Full Range-Of-Motion Lat Pulldown|Gironda Sternum Chins|Glute Ham Raise|Glute Kickback|Goblet Squat|Good Morning|Good Morning off Pins|Gorilla Chin/Crunch|Groin and Back Stretch|Groiners|Hack Squat|Hammer Curls|Hammer Grip Incline DB Bench Press|Hamstring Stretch|Hamstring-SMR|Handstand Push-Ups|Hang Clean|Hang Clean - Below the Knees|Hang Snatch|Hang Snatch - Below Knees|Hanging Bar Good Morning|Hanging Leg Raise|Hanging Pike|Heaving Snatch Balance|Heavy Bag Thrust|High Cable Curls|Hip Circles (prone)|Hip Extension with Bands|Hip Flexion with Band|Hip Lift with Band|Hug A Ball|Hug Knees To Chest|Hurdle Hops|Hyperextensions (Back Extensions)|Hyperextensions With No Hyperextension Bench|IT Band and Glute Stretch|Iliotibial Tract-SMR|Inchworm|Incline Barbell Triceps Extension|Incline Bench Pull|Incline Cable Chest Press|Incline Cable Flye|Incline Dumbbell Bench With Palms Facing In|Incline Dumbbell Curl|Incline Dumbbell Flyes|Incline Dumbbell Flyes - With A Twist|Incline Dumbbell Press|Incline Hammer Curls|Incline Inner Biceps Curl|Incline Push-Up|Incline Push-Up Close-Grip|Incline Push-Up Depth Jump|Incline Push-Up Medium|Incline Push-Up Reverse Grip|Incline Push-Up Wide|Intermediate Groin Stretch|Intermediate Hip Flexor and Quad Stretch|Internal Rotation with Band|Inverted Row|Inverted Row with Straps|Iron Cross|Iron Crosses (stretch)|Isometric Chest Squeezes|Isometric Neck Exercise - Front And Back|Isometric Neck Exercise - Sides|Isometric Wipers|JM Press|Jackknife Sit-Up|Janda Sit-Up|Jefferson Squats|Jerk Balance|Jerk Dip Squat|Jogging, Treadmill|Keg Load|Kettlebell Arnold Press|Kettlebell Dead Clean|Kettlebell Figure 8|Kettlebell Hang Clean|Kettlebell One-Legged Deadlift|Kettlebell Pass Between The Legs|Kettlebell Pirate Ships|Kettlebell Pistol Squat|Kettlebell Seated Press|Kettlebell Seesaw Press|Kettlebell Sumo High Pull|Kettlebell Thruster|Kettlebell Turkish Get-Up (Lunge style)|Kettlebell Turkish Get-Up (Squat style)|Kettlebell Windmill|Kipping Muscle Up|Knee Across The Body|Knee Circles|Knee Tuck Jump|Knee/Hip Raise On Parallel Bars|Kneeling Arm Drill|Kneeling Cable Crunch With Alternating Oblique Twists|Kneeling Cable Triceps Extension|Kneeling Forearm Stretch|Kneeling High Pulley Row|Kneeling Hip Flexor|Kneeling Jump Squat|Kneeling Single-Arm High Pulley Row|Kneeling Squat|Landmine 180's|Landmine Linear Jammer|Lateral Bound|Lateral Box Jump|Lateral Cone Hops|Lateral Raise - With Bands|Latissimus Dorsi-SMR|Leg Extensions|Leg Lift|Leg Press|Leg Pull-In|Leg-Over Floor Press|Leg-Up Hamstring Stretch|Leverage Chest Press|Leverage Deadlift|Leverage Decline Chest Press|Leverage High Row|Leverage Incline Chest Press|Leverage Iso Row|Leverage Shoulder Press|Leverage Shrug|Linear 3-Part Start Technique|Linear Acceleration Wall Drill|Linear Depth Jump|Log Lift|London Bridges|Looking At Ceiling|Low Cable Crossover|Low Cable Triceps Extension|Low Pulley Row To Neck|Lower Back Curl|Lower Back-SMR|Lunge Pass Through|Lunge Sprint|Lying Bent Leg Groin|Lying Cable Curl|Lying Cambered Barbell Row|Lying Close-Grip Bar Curl On High Pulley|Lying Close-Grip Barbell Triceps Extension Behind The Head|Lying Close-Grip Barbell Triceps Press To Chin|Lying Crossover|Lying Dumbbell Tricep Extension|Lying Face Down Plate Neck Resistance|Lying Face Up Plate Neck Resistance|Lying Glute|Lying Hamstring|Lying High Bench Barbell Curl|Lying Leg Curls|Lying Machine Squat|Lying One-Arm Lateral Raise|Lying Prone Quadriceps|Lying Rear Delt Raise|Lying Supine Dumbbell Curl|Lying T-Bar Row|Lying Triceps Press|Machine Bench Press|Machine Bicep Curl|Machine Preacher Curls|Machine Shoulder (Military) Press|Machine Triceps Extension|Medicine Ball Chest Pass|Medicine Ball Full Twist|Medicine Ball Scoop Throw|Middle Back Shrug|Middle Back Stretch|Mixed Grip Chin|Monster Walk|Mountain Climbers|Moving Claw Series|Muscle Snatch|Muscle Up|Narrow Stance Hack Squats|Narrow Stance Leg Press|Narrow Stance Squats|Natural Glute Ham Raise|Neck Press|Neck-SMR|Oblique Crunches|Oblique Crunches - On The Floor|Olympic Squat|On Your Side Quad Stretch|On-Your-Back Quad Stretch|One Arm Against Wall|One Arm Chin-Up|One Arm Dumbbell Bench Press|One Arm Dumbbell Preacher Curl|One Arm Floor Press|One Arm Lat Pulldown|One Arm Pronated Dumbbell Triceps Extension|One Arm Supinated Dumbbell Triceps Extension|One Half Locust|One Handed Hang|One Knee To Chest|One Leg Barbell Squat|One-Arm Dumbbell Row|One-Arm Flat Bench Dumbbell Flye|One-Arm High-Pulley Cable Side Bends|One-Arm Incline Lateral Raise|One-Arm Kettlebell Clean|One-Arm Kettlebell Clean and Jerk|One-Arm Kettlebell Floor Press|One-Arm Kettlebell Jerk|One-Arm Kettlebell Military Press To The Side|One-Arm Kettlebell Para Press|One-Arm Kettlebell Push Press|One-Arm Kettlebell Row|One-Arm Kettlebell Snatch|One-Arm Kettlebell Split Jerk|One-Arm Kettlebell Split Snatch|One-Arm Kettlebell Swings|One-Arm Long Bar Row|One-Arm Medicine Ball Slam|One-Arm Open Palm Kettlebell Clean|One-Arm Overhead Kettlebell Squats|One-Arm Side Deadlift|One-Arm Side Laterals|One-Legged Cable Kickback|Open Palm Kettlebell Clean|Otis-Up|Overhead Cable Curl|Overhead Lat|Overhead Slam|Overhead Squat|Overhead Stretch|Overhead Triceps|Pallof Press|Pallof Press With Rotation|Palms-Down Dumbbell Wrist Curl Over A Bench|Palms-Down Wrist Curl Over A Bench|Palms-Up Barbell Wrist Curl Over A Bench|Palms-Up Dumbbell Wrist Curl Over A Bench|Parallel Bar Dip|Pelvic Tilt Into Bridge|Peroneals Stretch|Peroneals-SMR|Physioball Hip Bridge|Pin Presses|Piriformis-SMR|Plank|Plate Pinch|Plate Twist|Platform Hamstring Slides|Plie Dumbbell Squat|Plyo Kettlebell Pushups|Plyo Push-up|Posterior Tibialis Stretch|Power Clean|Power Clean from Blocks|Power Jerk|Power Partials|Power Snatch|Power Snatch from Blocks|Power Stairs|Preacher Curl|Preacher Hammer Dumbbell Curl|Press Sit-Up|Prone Manual Hamstring|Prowler Sprint|Pull Through|Pullups|Push Press|Push Press - Behind the Neck|Push Up to Side Plank|Push-Up Wide|Push-Ups - Close Triceps Position|Push-Ups With Feet Elevated|Push-Ups With Feet On An Exercise Ball|Pushups|Pushups (Close and Wide Hand Positions)|Pyramid|Quad Stretch|Quadriceps-SMR|Quick Leap|Rack Delivery|Rack Pull with Bands|Rack Pulls|Rear Leg Raises|Recumbent Bike|Return Push from Stance|Reverse Band Bench Press|Reverse Band Box Squat|Reverse Band Deadlift|Reverse Band Power Squat|Reverse Band Sumo Deadlift|Reverse Barbell Curl|Reverse Barbell Preacher Curls|Reverse Cable Curl|Reverse Crunch|Reverse Flyes|Reverse Flyes With External Rotation|Reverse Grip Bent-Over Rows|Reverse Grip Triceps Pushdown|Reverse Hyperextension|Reverse Machine Flyes|Reverse Plate Curls|Reverse Triceps Bench Press|Rhomboids-SMR|Rickshaw Carry|Rickshaw Deadlift|Ring Dips|Rocket Jump|Rocking Standing Calf Raise|Rocky Pull-Ups/Pulldowns|Romanian Deadlift|Romanian Deadlift from Deficit|Rope Climb|Rope Crunch|Rope Jumping|Rope Straight-Arm Pulldown|Round The World Shoulder Stretch|Rowing, Stationary|Runner's Stretch|Running, Treadmill|Russian Twist|Sandbag Load|Scapular Pull-Up|Scissor Kick|Scissors Jump|Seated Band Hamstring Curl|Seated Barbell Military Press|Seated Barbell Twist|Seated Bent-Over One-Arm Dumbbell Triceps Extension|Seated Bent-Over Rear Delt Raise|Seated Bent-Over Two-Arm Dumbbell Triceps Extension|Seated Biceps|Seated Cable Rows|Seated Cable Shoulder Press|Seated Calf Raise|Seated Calf Stretch|Seated Close-Grip Concentration Barbell Curl|Seated Dumbbell Curl|Seated Dumbbell Inner Biceps Curl|Seated Dumbbell Palms-Down Wrist Curl|Seated Dumbbell Palms-Up Wrist Curl|Seated Dumbbell Press|Seated Flat Bench Leg Pull-In|Seated Floor Hamstring Stretch|Seated Front Deltoid|Seated Glute|Seated Good Mornings|Seated Hamstring|Seated Hamstring and Calf Stretch|Seated Head Harness Neck Resistance|Seated Leg Curl|Seated Leg Tucks|Seated One-Arm Dumbbell Palms-Down Wrist Curl|Seated One-Arm Dumbbell Palms-Up Wrist Curl|Seated One-arm Cable Pulley Rows|Seated Overhead Stretch|Seated Palm-Up Barbell Wrist Curl|Seated Palms-Down Barbell Wrist Curl|Seated Side Lateral Raise|Seated Triceps Press|Seated Two-Arm Palms-Up Low-Pulley Wrist Curl|See-Saw Press (Alternating Side Press)|Shotgun Row|Shoulder Circles|Shoulder Press - With Bands|Shoulder Raise|Shoulder Stretch|Side Bridge|Side Hop-Sprint|Side Jackknife|Side Lateral Raise|Side Laterals to Front Raise|Side Leg Raises|Side Lying Groin Stretch|Side Neck Stretch|Side Standing Long Jump|Side To Side Chins|Side Wrist Pull|Side to Side Box Shuffle|Side-Lying Floor Stretch|Single Dumbbell Raise|Single Leg Butt Kick|Single Leg Glute Bridge|Single Leg Push-off|Single-Arm Cable Crossover|Single-Arm Linear Jammer|Single-Arm Push-Up|Single-Cone Sprint Drill|Single-Leg High Box Squat|Single-Leg Hop Progression|Single-Leg Lateral Hop|Single-Leg Leg Extension|Single-Leg Stride Jump|Sit Squats|Sit-Up|Skating|Sled Drag - Harness|Sled Overhead Backward Walk|Sled Overhead Triceps Extension|Sled Push|Sled Reverse Flye|Sled Row|Sledgehammer Swings|Smith Incline Shoulder Raise|Smith Machine Behind the Back Shrug|Smith Machine Bench Press|Smith Machine Bent Over Row|Smith Machine Calf Raise|Smith Machine Close-Grip Bench Press|Smith Machine Decline Press|Smith Machine Hang Power Clean|Smith Machine Hip Raise|Smith Machine Incline Bench Press|Smith Machine Leg Press|Smith Machine One-Arm Upright Row|Smith Machine Overhead Shoulder Press|Smith Machine Pistol Squat|Smith Machine Reverse Calf Raises|Smith Machine Squat|Smith Machine Stiff-Legged Deadlift|Smith Machine Upright Row|Smith Single-Leg Split Squat|Snatch|Snatch Balance|Snatch Deadlift|Snatch Pull|Snatch Shrug|Snatch from Blocks|Speed Band Overhead Triceps|Speed Box Squat|Speed Squats|Spell Caster|Spider Crawl|Spider Curl|Spinal Stretch|Split Clean|Split Jerk|Split Jump|Split Snatch|Split Squat with Dumbbells|Split Squats|Squat Jerk|Squat with Bands|Squat with Chains|Squat with Plate Movers|Squats - With Bands|Stairmaster|Standing Alternating Dumbbell Press|Standing Barbell Calf Raise|Standing Barbell Press Behind Neck|Standing Bent-Over One-Arm Dumbbell Triceps Extension|Standing Bent-Over Two-Arm Dumbbell Triceps Extension|Standing Biceps Cable Curl|Standing Biceps Stretch|Standing Bradford Press|Standing Cable Chest Press|Standing Cable Lift|Standing Cable Wood Chop|Standing Calf Raises|Standing Concentration Curl|Standing Dumbbell Calf Raise|Standing Dumbbell Press|Standing Dumbbell Reverse Curl|Standing Dumbbell Straight-Arm Front Delt Raise Above Head|Standing Dumbbell Triceps Extension|Standing Dumbbell Upright Row|Standing Elevated Quad Stretch|Standing Front Barbell Raise Over Head|Standing Gastrocnemius Calf Stretch|Standing Hamstring and Calf Stretch|Standing Hip Circles|Standing Hip Flexors|Standing Inner-Biceps Curl|Standing Lateral Stretch|Standing Leg Curl|Standing Long Jump|Standing Low-Pulley Deltoid Raise|Standing Low-Pulley One-Arm Triceps Extension|Standing Military Press|Standing Olympic Plate Hand Squeeze|Standing One-Arm Cable Curl|Standing One-Arm Dumbbell Curl Over Incline Bench|Standing One-Arm Dumbbell Triceps Extension|Standing Overhead Barbell Triceps Extension|Standing Palm-In One-Arm Dumbbell Press|Standing Palms-In Dumbbell Press|Standing Palms-Up Barbell Behind The Back Wrist Curl|Standing Pelvic Tilt|Standing Rope Crunch|Standing Soleus And Achilles Stretch|Standing Toe Touches|Standing Towel Triceps Extension|Standing Two-Arm Overhead Throw|Star Jump|Step Mill|Step-up with Knee Raise|Stiff Leg Barbell Good Morning|Stiff-Legged Barbell Deadlift|Stiff-Legged Dumbbell Deadlift|Stomach Vacuum|Straight Bar Bench Mid Rows|Straight Raises on Incline Bench|Straight-Arm Dumbbell Pullover|Straight-Arm Pulldown|Stride Jump Crossover|Sumo Deadlift|Sumo Deadlift with Bands|Sumo Deadlift with Chains|Superman|Supine Chest Throw|Supine One-Arm Overhead Throw|Supine Two-Arm Overhead Throw|Suspended Fallout|Suspended Push-Up|Suspended Reverse Crunch|Suspended Row|Suspended Split Squat|Svend Press|T-Bar Row with Handle|Tate Press|The Straddle|Thigh Abductor|Thigh Adductor|Tire Flip|Toe Touchers|Torso Rotation|Trail Running/Walking|Trap Bar Deadlift|Tricep Dumbbell Kickback|Tricep Side Stretch|Triceps Overhead Extension with Rope|Triceps Pushdown|Triceps Pushdown - Rope Attachment|Triceps Pushdown - V-Bar Attachment|Triceps Stretch|Tuck Crunch|Two-Arm Dumbbell Preacher Curl|Two-Arm Kettlebell Clean|Two-Arm Kettlebell Jerk|Two-Arm Kettlebell Military Press|Two-Arm Kettlebell Row|Underhand Cable Pulldowns|Upper Back Stretch|Upper Back-Leg Grab|Upright Barbell Row|Upright Cable Row|Upright Row - With Bands|Upward Stretch|V-Bar Pulldown|V-Bar Pullup|Vertical Swing|Walking, Treadmill|Weighted Ball Hyperextension|Weighted Ball Side Bend|Weighted Bench Dip|Weighted Crunches|Weighted Jump Squat|Weighted Pull Ups|Weighted Sissy Squat|Weighted Sit-Ups - With Bands|Weighted Squat|Wide Stance Barbell Squat|Wide Stance Stiff Legs|Wide-Grip Barbell Bench Press|Wide-Grip Decline Barbell Bench Press|Wide-Grip Decline Barbell Pullover|Wide-Grip Lat Pulldown|Wide-Grip Pulldown Behind The Neck|Wide-Grip Rear Pull-Up|Wide-Grip Standing Barbell Curl|Wind Sprints|Windmills|World's Greatest Stretch|Wrist Circles|Wrist Roller|Wrist Rotations with Straight Bar|Yoke Walk|Zercher Squats|Zottman Curl|Zottman Preacher Curl".split("|");
const PHOTO_PREFERRED = {"ab wheel":"Ab_Roller","arnold press":"Arnold_Dumbbell_Press","back squat":"Barbell_Squat","band row":"Seated_Cable_Rows","barbell curl":"Barbell_Curl","barbell row":"Bent_Over_Barbell_Row","bench press":"Barbell_Bench_Press_-_Medium_Grip","biceps curl":"Dumbbell_Bicep_Curl","bike":"Bicycling_Stationary","bodyweight squat":"Bodyweight_Squat","box jump":"Front_Box_Jump","bulgarian split squat":"Dumbbell_Rear_Lunge","cable crunch":"Cable_Crunch","cable fly":"Cable_Crossover","calf raise":"Standing_Calf_Raises","chest fly":"Dumbbell_Flyes","chin-up":"Chin-Up","clean":"Power_Clean","clean and jerk":"Clean_and_Jerk","close-grip bench press":"Close-Grip_Barbell_Bench_Press","crunch":"Crunches","deadlift":"Barbell_Deadlift","dip":"Dips_-_Triceps_Version","dumbbell bench press":"Dumbbell_Bench_Press","dumbbell row":"One-Arm_Dumbbell_Row","dumbbell shoulder press":"Dumbbell_Shoulder_Press","elliptical":"Elliptical_Trainer","face pull":"Face_Pull","farmer's walk":"Farmers_Walk","front raise":"Front_Dumbbell_Raise","front squat":"Front_Barbell_Squat","glute bridge":"Butt_Lift_Bridge","goblet squat":"Goblet_Squat","good morning":"Good_Morning","hammer curl":"Hammer_Curls","hanging leg raise":"Hanging_Leg_Raise","hip thrust":"Barbell_Hip_Thrust","hyperextension":"Hyperextensions_Back_Extensions","incline bench press":"Barbell_Incline_Bench_Press_-_Medium_Grip","incline dumbbell press":"Incline_Dumbbell_Press","jump rope":"Rope_Jumping","kettlebell swing":"One-Arm_Kettlebell_Swings","lat pulldown":"Wide-Grip_Lat_Pulldown","lateral raise":"Side_Lateral_Raise","leg curl":"Lying_Leg_Curls","leg extension":"Leg_Extensions","leg press":"Leg_Press","lunge":"Dumbbell_Lunges","mountain climber":"Mountain_Climbers","overhead press":"Barbell_Shoulder_Press","plank":"Plank","preacher curl":"Preacher_Curl","pull-up":"Pullups","push-up":"Pushups","rear delt fly":"Reverse_Flyes","romanian deadlift":"Romanian_Deadlift","rowing machine":"Rowing_Stationary","run":"Running_Treadmill","russian twist":"Russian_Twist","seated cable row":"Seated_Cable_Rows","shrug":"Barbell_Shrug","side plank":"Side_Bridge","sit-up":"Sit-Up","skullcrusher":"EZ-Bar_Skullcrusher","snatch":"Power_Snatch","sumo deadlift":"Sumo_Deadlift","t-bar row":"T-Bar_Row_with_Handle","thruster":"Kettlebell_Thruster","triceps extension":"Triceps_Pushdown","triceps pushdown":"Triceps_Pushdown","upright row":"Upright_Barbell_Row","walking lunge":"Barbell_Walking_Lunge","walk":"Walking_Treadmill","stair climber":"Stairmaster","wrist curl":"Palms-Up_Barbell_Wrist_Curl_Over_A_Bench"};
const PHOTO_SYNONYM = {
  "back squat": "barbell squat", "chest fly": "dumbbell flyes", "pec deck": "butterfly",
  "ab wheel": "ab roller", "bicycle crunch": "air bike", "jump rope": "rope jumping",
  "rowing machine": "rowing stationary", "battle ropes": "battling ropes",
  "reverse fly": "reverse flyes", "bike": "bicycling stationary", "run": "running treadmill",
  "elliptical": "elliptical trainer", "landmine press": "landmine linear jammer",
  "hyperextension": "hyperextensions back extensions", "skullcrusher": "ez bar skullcrusher",
  "dip": "dips triceps version",
};
const PHOTO_ABBR = {
  db: "dumbbell", bb: "barbell", kb: "kettlebell", ohp: "overhead press",
  rdl: "romanian deadlift", bss: "bulgarian split squat", cgbp: "close grip bench press",
  sldl: "stiff leg deadlift", ez: "e-z", hspu: "handstand pushup", gm: "good morning",
  ghr: "glute ham raise", pu: "pullup",
};
const PHOTO_STOP = new Set(["the", "a", "with", "and", "on", "to", "of", "for", "your"]);
const photoNorm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9 -]/g, " ").replace(/-/g, " ").replace(/\s+/g, " ").trim();
const photoId = (n) => n.replace(/[(),'.]/g, "").replace(/[ /]/g, "_");
const photoTokens = (s) => {
  const syn = PHOTO_SYNONYM[photoNorm(s)];
  let t = photoNorm(syn || s).split(" ").filter(Boolean).map((w) => PHOTO_ABBR[w] || w);
  return t.join(" ").split(" ")
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .map((w) => (w === "flye" || w === "flie" ? "fly" : w))
    .map((w) => (w === "pushup" ? "push" : w))
    .filter((w) => w && !PHOTO_STOP.has(w));
};
const PHOTO_INDEX = EX_NAMES.map((n) => ({ id: photoId(n), toks: photoTokens(n) }));
const photoMatch = (query) => {
  const key = photoNorm(query);
  if (PHOTO_PREFERRED[key]) return PHOTO_PREFERRED[key];
  const q = photoTokens(query);
  if (!q.length) return null;
  let best = null, bestScore = 0;
  for (const c of PHOTO_INDEX) {
    let hit = 0;
    for (const t of q) if (c.toks.includes(t)) hit++;
    if (!hit) continue;
    const coverage = hit / q.length;
    if (coverage < 0.6) continue;
    const score = coverage * 0.6 + (hit / c.toks.length) * 0.4;
    if (score > bestScore + 0.001 || (Math.abs(score - bestScore) <= 0.001 && best && c.toks.length < best.toks.length)) {
      bestScore = Math.max(score, bestScore); best = c;
    }
  }
  return best && bestScore >= 0.45 ? best.id : null;
};
const PHOTO_BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";
const photoFor = (name) => {
  const id = photoMatch(canonicalName(name));
  return id ? [PHOTO_BASE + id + "/0.jpg", PHOTO_BASE + id + "/1.jpg"] : null;
};

/* Start/finish photo pair; falls back to the animated pictogram. */
const ExPhoto = ({ name, fallback = null, rejected = false, onReject }) => {
  const pair = photoFor(name);
  const [frame, setFrame] = useState(0);
  const [dead, setDead] = useState(false);
  useEffect(() => {
    setFrame(0); setDead(false);
  }, [name]);
  useEffect(() => {
    if (!pair || dead) return undefined;
    const t = setInterval(() => setFrame((f) => 1 - f), 1600);
    return () => clearInterval(t);
  }, [name, dead]);
  if (rejected || !pair || dead) {
    return (
      <div>
        {fallback}
        {dead && !rejected && (
          <div style={{ fontSize: 12, color: T.sub, margin: "0 0 12px" }}>Photo unavailable — using the pictogram.</div>
        )}
      </div>
    );
  }
  return (
    <div style={{
      position: "relative", width: "100%", aspectRatio: "4 / 3", marginBottom: 14,
      borderRadius: 12, overflow: "hidden", background: T.surface2, border: `1px solid ${T.line}`,
    }}>
      {pair.map((u, i) => (
        <img key={u} src={u} alt="" onError={() => setDead(true)} loading="lazy"
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover",
            opacity: i === frame ? 1 : 0, transition: "opacity 0.4s",
          }} />
      ))}
      <div style={{
        position: "absolute", bottom: 8, right: 9, fontSize: 10.5, color: T.text,
        background: "rgba(11,12,15,0.72)", padding: "3px 9px", borderRadius: 999,
        fontFamily: FD, textTransform: "uppercase", letterSpacing: "0.1em",
      }}>{frame === 0 ? "Start" : "Finish"}</div>
      {onReject && (
        <button onClick={(e) => { e.stopPropagation(); onReject(name); }}
          style={{
            position: "absolute", top: 8, right: 8, fontSize: 11, color: T.text,
            background: "rgba(11,12,15,0.72)", border: "none", padding: "4px 9px",
            borderRadius: 999, cursor: "pointer",
          }}>Wrong photo</button>
      )}
    </div>
  );
};

/* ================= muscle readiness body map ================= */
/* ---------- 1 · Readiness model ----------
   Each logged set adds fatigue to its muscle group, decaying with a
   ~38 h half-life. Soreness reported in a check-in within the last
   2 days bumps a "ready" group to "recovering". Groups never trained
   in your log show as "untracked" (dim). */
const READY_GROUPS = ["Shoulders", "Chest", "Back", "Arms", "Core", "Legs", "Hamstrings", "Glutes"];
const HALF_LIFE_H = 38;

const muscleReadiness = (workouts, checkins, todayStr) => {
  const now = new Date(todayStr + "T12:00:00");
  const acc = {};
  READY_GROUPS.forEach((g) => { acc[g] = { load: 0, sets7: 0, last: null }; });
  (workouts || []).forEach((w) => {
    const days = (now - new Date(w.date + "T12:00:00")) / 864e5;
    (w.exercises || []).forEach((e) => {
      const g = groupFor(e.name);
      if (!acc[g]) return;
      if (!acc[g].last || w.date > acc[g].last) acc[g].last = w.date;
      if (days < 0 || days > 7) return;
      acc[g].sets7 += +e.sets || 1;
      if (days <= 6) acc[g].load += (+e.sets || 1) * Math.pow(0.5, (days * 24) / HALF_LIFE_H);
    });
  });
  const sore = new Set();
  (checkins || []).forEach((c) => {
    const days = (now - new Date(c.date + "T12:00:00")) / 864e5;
    const list = c.sore || c.soreness || [];
    if (days >= 0 && days <= 2 && Array.isArray(list)) list.forEach((g) => sore.add(g));
  });
  const out = {};
  READY_GROUPS.forEach((g) => {
    const { load, sets7, last } = acc[g];
    let status = !last ? "untracked" : load >= 5 ? "fatigued" : load >= 1.8 ? "recovering" : "ready";
    if (sore.has(g) && status === "ready") status = "recovering";
    out[g] = { status, load: Math.round(load * 10) / 10, sets7, last };
  });
  return out;
};

const STATUS_COLOR = { fatigued: T.red, recovering: T.gold, ready: T.good };
const STATUS_LABEL = { fatigued: "Fatigued", recovering: "Recovering", ready: "Ready", untracked: "No data yet" };

/* ---------- 2 · Body map (front + back, tappable) ----------
   Regions are data, drawn as the right half and mirrored, so both
   sides stay symmetric and share tap behaviour. */
const BODY_BASE = [
  "M60,30 C68,29 75,31 78,34 C81,37 81,43 81,50 C81,62 79,76 77,86 C76,94 72,99 60,100 Z",
  "M60,88 L74,88 C76,96 74,106 60,109 Z",
  "M79,36 C86,33 91,38 92,46 C93,56 92,66 90,73 C88,77 85,77 84,73 C82,66 80,50 79,36 Z",
  "M84,75 C88,74 92,78 93,85 C94,93 95,100 96,106 C97,111 94,114 92,113 C89,111 88,104 87,97 C86,90 84,82 84,75 Z",
  "M60,100 C70,99 77,104 78,114 C79,128 77,143 73,153 C70,158 64,158 62,153 C60,144 60,118 60,100 Z",
  "M62,155 C68,153 73,157 73,167 C73,179 71,191 69,197 C67,200 63,200 62,197 C61,188 61,168 62,155 Z",
  "M61,197 L70,197 L73,203 L61,203 Z",
];
const BODY_MUSCLES = {
  front: [
    ["Shoulders", "M79,33 C85,32 90,37 90,44 C90,49 87,51 83,49 C80,46 78,39 79,33 Z"],
    ["Chest", "M61.5,37 C69,36.5 76,40 77.5,46 C78,52 73,57 66,56.5 C62.5,56 61.5,54 61.5,50 Z"],
    ["Arms", "M83,51 C87,51 90,55 90.5,61 C91,67 89,72 86.5,72 C84,72 83,67 82.5,61 C82.5,56 82.5,52 83,51 Z"],
    ["Arms", "M86,75 C90,75 92,80 93,87 C94,93 94,98 92,99 C89.5,100 88,95 87,88 C86.5,83 86,78 86,75 Z"],
    ["Core", "M61,59 L68,59 C69,59 69.5,60 69.5,62 L69.5,90 C69.5,94 66,96 61,96 Z"],
    ["Core", "M71,61 C73.5,61 75,64 75,70 C75,78 73.5,85 71.5,88 C70,86 70,66 71,61 Z"],
    ["Legs", "M63,103 C70,101 76,106 77,114 C78,126 76,140 72,149 C69,153 64,153 62.5,148 C61,140 61.5,112 63,103 Z"],
    ["Legs", "M64.5,157 C69,156 71.5,161 71.5,169 C71.5,179 69.5,188 67.5,191 C65.5,189 64,179 63.5,169 C63.5,163 63.5,158 64.5,157 Z"],
  ],
  back: [
    ["Back", "M60,27 C65,28 70,30 73,33 C68,39 63,45 60,51 Z"],
    ["Shoulders", "M79,33 C85,32 90,37 90,44 C90,49 87,51 83,49 C80,46 78,39 79,33 Z"],
    ["Back", "M61.5,50 C68,48 75,46 78,48 C77,58 73,68 67,76 C63.5,79 61.5,78 61.5,72 Z"],
    ["Back", "M61,58 C63,58 64,59 64,61 L64,88 C64,91 62.5,92 61,92 Z"],
    ["Arms", "M83,51 C87,51 90,55 90.5,61 C91,67 89,72 86.5,72 C84,72 83,67 82.5,61 C82.5,56 82.5,52 83,51 Z"],
    ["Arms", "M86,75 C90,75 92,80 93,87 C94,93 94,98 92,99 C89.5,100 88,95 87,88 C86.5,83 86,78 86,75 Z"],
    ["Glutes", "M61.5,92 C69,90 75,94 76,101 C77,108 71,113 66,113 C62.5,113 61.5,109 61.5,103 Z"],
    ["Hamstrings", "M63,116 C70,114 76,118 76.5,127 C77,138 74,148 70,153 C66,155 63.5,151 62.5,143 C61.5,133 62,122 63,116 Z"],
    ["Legs", "M64,157 C69.5,156 72.5,162 72.5,171 C72.5,181 70,189 67.5,191 C65,189 63,180 63,170 C63,163 63,158 64,157 Z"],
  ],
};
const BODY_LINES = {
  front: [
    "M53,67 L67,67", "M53,74 L67,74", "M53,81 L67,81", "M60,60 L60,95",
    "M70,106 C72,116 72,132 69,146",
  ],
  back: ["M69,118 C70,128 69.5,140 67,150", "M67.5,159 C68.5,168 68,180 66.5,188"],
};

const BodyFigure = ({ side, fills, height, selected, onSelect }) => {
  const base = T.raised;
  const half = (
    <>
      {BODY_BASE.map((d, i) => <path key={"b" + i} d={d} fill={base} />)}
      {BODY_MUSCLES[side].map(([g, d], i) => (
        <path key={"m" + i} d={d} fill={fills[g] || base}
          opacity={selected && selected !== g ? 0.35 : 1}
          stroke={selected === g ? T.text : "none"} strokeWidth="1"
          style={{ cursor: onSelect ? "pointer" : "default", transition: "opacity 0.15s" }}
          onClick={onSelect ? (ev) => { ev.stopPropagation(); onSelect(g); } : undefined} />
      ))}
      <g stroke={base} strokeWidth="1.1" fill="none" opacity="0.9" pointerEvents="none">
        {BODY_LINES[side].map((d, i) => <path key={"l" + i} d={d} />)}
      </g>
    </>
  );
  return (
    <svg viewBox="0 0 120 210" height={height} style={{ display: "block" }}>
      <ellipse cx="60" cy="13" rx="8.5" ry="10" fill={base} />
      <path d="M54,21 L66,21 L68,30 L52,30 Z" fill={base} />
      <g>{half}</g>
      <g transform="translate(120,0) scale(-1,1)">{half}</g>
    </svg>
  );
};

const BodyMap = ({ fills = {}, height = 230, selected, onSelect }) => (
  <div style={{ display: "flex", gap: 22, justifyContent: "center", padding: "6px 0 2px" }}>
    {["front", "back"].map((s) => (
      <div key={s} style={{ textAlign: "center" }}>
        <BodyFigure side={s} fills={fills} height={height} selected={selected} onSelect={onSelect} />
        <div style={{ fontSize: 10, color: T.dim, marginTop: 4, fontFamily: FD, textTransform: "uppercase", letterSpacing: "0.12em" }}>{s}</div>
      </div>
    ))}
  </div>
);

/* ---------- 3 · Readiness card (tap a muscle for its numbers) ---------- */
const ReadinessCard = ({ workouts, checkins, todayStr }) => {
  const [sel, setSel] = useState(null);
  const r = muscleReadiness(workouts, checkins, todayStr);
  const fills = {};
  Object.entries(r).forEach(([g, v]) => {
    if (v.status !== "untracked") fills[g] = STATUS_COLOR[v.status];
  });
  const counts = { fatigued: 0, recovering: 0, ready: 0 };
  Object.values(r).forEach((v) => { if (counts[v.status] !== undefined) counts[v.status]++; });
  const d = sel ? r[sel] : null;
  return (
    <div onClick={() => setSel(null)} style={{
      background: T.surface, border: `1px solid ${T.line}`, borderRadius: 14,
      padding: 16, marginBottom: 12,
    }}>
      <div style={{
        fontFamily: FD, textTransform: "uppercase", letterSpacing: "0.1em",
        fontWeight: 700, fontSize: 12, color: T.sub, marginBottom: 4,
      }}>
        Muscle readiness
      </div>
      <BodyMap fills={fills} selected={sel} onSelect={(g) => setSel(sel === g ? null : g)} />
      <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 8 }}>
        {[["fatigued", "Fatigued"], ["recovering", "Recovering"], ["ready", "Ready"]].map(([k, l]) => (
          <span key={k} style={{ fontSize: 11.5, color: T.sub, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: STATUS_COLOR[k], display: "inline-block" }} />
            {l} <span style={{ fontFamily: FM, color: T.dim }}>{counts[k]}</span>
          </span>
        ))}
      </div>
      {d ? (
        <div onClick={(ev) => ev.stopPropagation()} style={{
          marginTop: 12, background: T.surface2, border: `1px solid ${T.line}`,
          borderLeft: `2px solid ${STATUS_COLOR[d.status] || T.dim}`,
          borderRadius: 10, padding: "10px 12px",
          display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap",
        }}>
          <span style={{ fontFamily: FD, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, fontSize: 15 }}>{sel}</span>
          <span style={{ fontSize: 12.5, color: STATUS_COLOR[d.status] || T.sub, fontWeight: 700 }}>{STATUS_LABEL[d.status]}</span>
          <span style={{ fontFamily: FM, fontSize: 12, color: T.sub, marginLeft: "auto" }}>
            load {d.load} · {d.sets7} sets / 7d{d.last ? ` · last ${d.last.slice(5)}` : ""}
          </span>
        </div>
      ) : (
        <div style={{ fontSize: 11.5, color: T.dim, marginTop: 8, lineHeight: 1.5, textAlign: "center" }}>
          Estimated from your last 6 days of sets. Tap any muscle for its numbers.
        </div>
      )}
    </div>
  );
};

/* ---------- 4 · Muscle highlight for the form-guide modal ---------- */
const regionForMuscle = (m) => {
  const n = (m || "").toLowerCase();
  if (/pec|chest/.test(n)) return "Chest";
  if (/lat|trap|rhomboid|erector|lower back|upper back|back/.test(n)) return "Back";
  if (/delt|shoulder|rotator/.test(n)) return "Shoulders";
  if (/bicep|tricep|forearm|brachi|arm|grip/.test(n)) return "Arms";
  if (/glute/.test(n)) return "Glutes";
  if (/hamstring/.test(n)) return "Hamstrings";
  if (/quad|calf|calves|adductor|leg|tibialis|soleus/.test(n)) return "Legs";
  if (/ab|core|oblique|hip flexor|spinae/.test(n)) return "Core";
  return null;
};

const MuscleHighlightMap = ({ info }) => {
  if (!info) return null;
  const fills = {};
  (info.muscles_secondary || []).forEach((m) => {
    const g = regionForMuscle(m); if (g) fills[g] = T.blue;
  });
  (info.muscles_primary || []).forEach((m) => {
    const g = regionForMuscle(m); if (g) fills[g] = T.accent;
  });
  if (!Object.keys(fills).length) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <BodyMap fills={fills} height={160} />
      <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 2, fontSize: 11.5, color: T.sub }}>
        <span><span style={{ color: T.accent }}>■</span> Primary</span>
        <span><span style={{ color: T.blue }}>■</span> Secondary</span>
      </div>
    </div>
  );
};

/* ---------- 5 · Video button (opens a YouTube form search) ---------- */
const VideoButton = ({ name }) => (
  <button
    onClick={() => window.open(
      "https://www.youtube.com/results?search_query=" +
      encodeURIComponent((name || "") + " exercise proper form"), "_blank")}
    style={{
      width: "100%", padding: "11px 12px", marginBottom: 14, cursor: "pointer",
      background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 10,
      color: T.blue, fontWeight: 700, fontSize: 13.5, fontFamily: FB,
    }}>
    ▶ Watch form videos on YouTube
  </button>
);

/* ---------- 6 · Animated exercise demo ----------
   Two-pose loop (SMIL crossfade) for the main movement patterns.
   Falls back to the static pictogram for anything unmatched. */
const DemoSvg = ({ size, a, b }) => (
  <svg viewBox="0 0 64 64" width={size} height={size} fill="none"
    stroke={T.accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <g>
      {a}
      <animate attributeName="opacity" values="1;1;0;0;1" keyTimes="0;0.42;0.5;0.92;1" dur="1.8s" repeatCount="indefinite" />
    </g>
    <g opacity="0">
      {b}
      <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.42;0.5;0.92;1" dur="1.8s" repeatCount="indefinite" />
    </g>
  </svg>
);

const DEMOS = {
  squat: {
    a: (<><circle cx="32" cy="10" r="5" /><path d="M32 15v16" /><path d="M14 21h36" /><circle cx="15" cy="21" r="3" /><circle cx="49" cy="21" r="3" /><path d="M32 31l-6 12v12M32 31l6 12v12" /></>),
    b: (<><circle cx="32" cy="22" r="5" /><path d="M32 27v9" /><path d="M14 33h36" /><circle cx="15" cy="33" r="3" /><circle cx="49" cy="33" r="3" /><path d="M32 36l-11 5 4 14M32 36l11 5-4 14" /></>),
  },
  hinge: {
    a: (<><circle cx="22" cy="17" r="5" /><path d="M24 21l12 12" /><path d="M36 33v14" /><path d="M25 25c-4 8-3 16 1 22" /><path d="M28 52h16" /><circle cx="28" cy="52" r="3" /><circle cx="44" cy="52" r="3" /></>),
    b: (<><circle cx="32" cy="10" r="5" /><path d="M32 15v18" /><path d="M32 33l-5 10v9M32 33l5 10v9" /><path d="M24 30h16" /><circle cx="24" cy="30" r="3" /><circle cx="40" cy="30" r="3" /></>),
  },
  pressH: {
    a: (<><path d="M12 44h40" /><circle cx="20" cy="38" r="5" /><path d="M25 40h20" /><path d="M34 40v-8" /><path d="M22 32h24" /><circle cx="23" cy="32" r="3" /><circle cx="45" cy="32" r="3" /></>),
    b: (<><path d="M12 44h40" /><circle cx="20" cy="38" r="5" /><path d="M25 40h20" /><path d="M34 40v-20" /><path d="M22 20h24" /><circle cx="23" cy="20" r="3" /><circle cx="45" cy="20" r="3" /></>),
  },
  pressV: {
    a: (<><circle cx="32" cy="14" r="5" /><path d="M32 19v16" /><path d="M32 35l-6 14M32 35l6 14" /><path d="M20 24h24" /><circle cx="20" cy="24" r="3" /><circle cx="44" cy="24" r="3" /></>),
    b: (<><circle cx="32" cy="20" r="5" /><path d="M32 25v12" /><path d="M32 37l-6 12M32 37l6 12" /><path d="M20 8h24" /><circle cx="20" cy="8" r="3" /><circle cx="44" cy="8" r="3" /></>),
  },
  pullup: {
    a: (<><path d="M12 10h40" /><circle cx="32" cy="26" r="5" /><path d="M24 12l8 9M40 12l-8 9" /><path d="M32 31v14l-4 8M32 45l4 8" /></>),
    b: (<><path d="M12 10h40" /><circle cx="32" cy="15" r="5" /><path d="M24 12l4 4M40 12l-4 4" /><path d="M32 20v14l-4 8M32 34l4 8" /></>),
  },
  row: {
    a: (<><circle cx="20" cy="16" r="5" /><path d="M23 20l14 8" /><path d="M37 28v14M37 42l6 8M37 42l-2 10" /><path d="M28 28v12" /><path d="M22 40h12" /><circle cx="22" cy="40" r="3" /><circle cx="34" cy="40" r="3" /></>),
    b: (<><circle cx="20" cy="16" r="5" /><path d="M23 20l14 8" /><path d="M37 28v14M37 42l6 8M37 42l-2 10" /><path d="M28 28v4" /><path d="M22 32h12" /><circle cx="22" cy="32" r="3" /><circle cx="34" cy="32" r="3" /></>),
  },
  curl: {
    a: (<><circle cx="32" cy="12" r="5" /><path d="M32 17v20" /><path d="M32 37l-5 14M32 37l5 14" /><path d="M32 22l-8 6v10M32 22l8 6v10" /><circle cx="24" cy="40" r="3" /><circle cx="40" cy="40" r="3" /></>),
    b: (<><circle cx="32" cy="12" r="5" /><path d="M32 17v20" /><path d="M32 37l-5 14M32 37l5 14" /><path d="M32 22l-8 6 2-8M32 22l8 6-2-8" /><circle cx="26" cy="19" r="3" /><circle cx="38" cy="19" r="3" /></>),
  },
  lunge: {
    a: (<><circle cx="32" cy="10" r="5" /><path d="M32 15v18" /><path d="M32 33l-5 10v9M32 33l5 10v9" /></>),
    b: (<><circle cx="30" cy="14" r="5" /><path d="M30 19v14" /><path d="M30 33l-10 6v11M30 33l9 4 5 13" /></>),
  },
  pushup: {
    a: (<><circle cx="16" cy="26" r="5" /><path d="M21 29l26 8" /><path d="M20 32v10M44 40v10" /></>),
    b: (<><circle cx="14" cy="38" r="5" /><path d="M19 40l28 4" /><path d="M18 42l2 8M44 44v6" /></>),
  },
};

const demoFor = (name) => {
  const n = (name || "").toLowerCase();
  if (/squat|leg press/.test(n)) return DEMOS.squat;
  if (/deadlift|rdl|romanian|hinge|swing|good ?morning|thrust/.test(n)) return DEMOS.hinge;
  if (/push-?up/.test(n)) return DEMOS.pushup;
  if (/bench|chest press|fly/.test(n)) return DEMOS.pressH;
  if (/overhead|shoulder press|ohp|military/.test(n)) return DEMOS.pressV;
  if (/pull-?up|chin|pulldown/.test(n)) return DEMOS.pullup;
  if (/row/.test(n)) return DEMOS.row;
  if (/curl/.test(n)) return DEMOS.curl;
  if (/lunge|split/.test(n)) return DEMOS.lunge;
  return null;
};

const ExDemo = ({ name, size = 64, fallback = null }) => {
  const d = demoFor(name);
  if (!d) return fallback;
  return <DemoSvg size={size} a={d.a} b={d.b} />;
};

const GOALS = ["Build strength", "Build muscle", "Lose fat", "Endurance", "General fitness"];
const LEVELS = ["Beginner", "Intermediate", "Advanced"];
const GEAR = [
  ["barbell", "Barbell & plates"], ["dumbbells", "Dumbbells"], ["kettlebell", "Kettlebell"],
  ["bands", "Resistance bands"], ["pullup-bar", "Pull-up bar"], ["machines", "Gym machines"], ["cardio", "Cardio machines"],
];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const emptyEx = () => ({ name: "", sets: "", reps: "", weight: "", rpe: "", mins: "", km: "", mode: "" });

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
const PENDING_KEY = "forge-pending-save";
const apiHeaders = () => ({
  "Content-Type": "application/json",
  ...(APP_TOKEN ? { "x-app-token": encodeURIComponent(APP_TOKEN) } : {}),
});

/* ---------- push notifications ----------
   The VAPID key travels as base64url and has to be handed to the browser
   as raw bytes. */
const urlB64ToBytes = (b64) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};
/* iOS only delivers Web Push to an app launched from the Home Screen — in
   Safari's normal tab PushManager is missing entirely, so telling the user
   to install first is the only useful thing to say. */
const isIOS = () =>
  /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.navigator.standalone === true ||
  (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
const pushSupported = () =>
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/* The app registers a listener here so every AI response can update the
   on-screen daily-quota pips without threading state through call sites. */
let onAiQuota = null;
async function askClaude(prompt, maxTokens = 1500) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ prompt, max_tokens: maxTokens }),
  });
  let data = null;
  try { data = await res.json(); } catch (e) {}
  if (data && data.ai && onAiQuota) onAiQuota(data.ai);
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
  const [push, setPush] = useState({
    key: null, subs: 0, on: false, busy: false, err: "", note: "",
    prefs: { train: true, weigh: true, unlogged: true, adjusted: true, morningHour: 8, eveningHour: 20 },
  });
  const [swapBusy, setSwapBusy] = useState(null);
  const [swapNote, setSwapNote] = useState("");
  const [moveDay, setMoveDay] = useState(null);
  const [addInj, setAddInj] = useState("");
  const [addAvoid, setAddAvoid] = useState("");
  const [addPrefer, setAddPrefer] = useState("");
  const [health, setHealth] = useState(null);
  const [pwNext, setPwNext] = useState("");
  const [pwCur, setPwCur] = useState("");
  const [pwNote, setPwNote] = useState("");
  const [strainNote, setStrainNote] = useState("");
  const [undoNote, setUndoNote] = useState("");
  const [adjBusy, setAdjBusy] = useState(false);
  const autoAdj = useRef(false);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [queued, setQueued] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [authNeeded, setAuthNeeded] = useState(false);
  const [pw, setPw] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [me, setMe] = useState(null);
  const [aiQuota, setAiQuota] = useState(null);
  const [loginUsers, setLoginUsers] = useState(null);
  const [selUser, setSelUser] = useState(null);
  const [adminUsers, setAdminUsers] = useState(null);
  const [nuName, setNuName] = useState("");
  const [nuPw, setNuPw] = useState("");
  const [nuNote, setNuNote] = useState("");

  const [d, setD] = useState({
    age: "", sex: "M", height: "", weight: "",
    goal: GOALS[0], specific: "", level: LEVELS[0], days: 3, gear: ["barbell", "dumbbells"],
    injuries: [],
    avoid: [], prefer: [], constraintNotes: "", neverSwapCompounds: false,
    photoRejects: {},
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
  const [statView, setStatView] = useState("overview");
  const [checkins, setCheckins] = useState([]);
  const [measurements, setMeasurements] = useState([]);
  const [whoopHist, setWhoopHist] = useState([]);
  const [mInput, setMInput] = useState({ waist: "", chest: "", arms: "", thighs: "" });
  const [ciDraft, setCiDraft] = useState({ energy: null, mood: null, soreness: [] });

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
        if (data.checkins) setCheckins(data.checkins);
        if (data.measurements) setMeasurements(data.measurements);
      }
      try {
        const c = await fetch("/api/exinfo", { headers: apiHeaders() });
        if (c.ok) exCache.current = (await c.json()) || {};
      } catch (e) {}
      setLoaded(true);
      try {
        const pc = await fetch("/api/push/config", { headers: apiHeaders() });
        if (pc.ok) {
          const cfg = await pc.json();
          let on = false;
          if (pushSupported()) {
            try {
              const reg = await navigator.serviceWorker.ready;
              on = !!(await reg.pushManager.getSubscription());
            } catch (e) {}
          }
          setPush((p) => ({ ...p, key: cfg.publicKey, subs: cfg.subscriptions || 0, prefs: { ...p.prefs, ...(cfg.prefs || {}) }, on }));
        }
      } catch (e) {}
      try {
        const hz = await fetch("/api/health");
        if (hz.ok) setHealth(await hz.json());
      } catch (e) {}
      try {
        const mr = await fetch("/api/auth/me", { headers: apiHeaders() });
        if (mr.ok) {
          const m = await mr.json();
          setMe(m);
          if (m.ai && m.ai.limit != null) setAiQuota(m.ai);
        }
      } catch (e) {}
      refreshWhoop();
    })();
  }, []);
  useEffect(() => {
    onAiQuota = (ai) => setAiQuota(ai);
    return () => { onAiQuota = null; };
  }, []);
  /* admin: load the users panel when settings open */
  useEffect(() => {
    if (!me || !me.admin || tab !== "profile" || adminUsers) return;
    (async () => {
      try {
        const r = await fetch("/api/users", { headers: apiHeaders() });
        if (r.ok) setAdminUsers(await r.json());
      } catch (e) {}
    })();
  }, [me, tab, adminUsers]);
  /* the login screen needs the user list before any auth exists */
  useEffect(() => {
    if (!authNeeded || loginUsers) return;
    (async () => {
      try {
        const r = await fetch("/api/auth/users");
        if (r.ok) {
          const list = await r.json();
          setLoginUsers(list);
          if (list.length === 1) setSelUser(list[0].id);
        } else setLoginUsers([]);
      } catch (e) { setLoginUsers([]); }
    })();
  }, [authNeeded, loginUsers]);

  /* WHOOP: re-fetch whenever the app comes back to the foreground and every
     15 min while visible. A PWA left open overnight otherwise keeps showing
     yesterday's recovery — the first fetch was the only one. */
  const refreshWhoop = async () => {
    try {
      const s = await fetch("/api/whoop/status", { headers: apiHeaders() });
      if (!s.ok) return;
      const st = await s.json();
      setWhoopConn(!!st.connected);
      if (!st.connected) return;
      const r = await fetch("/api/whoop/summary", { headers: apiHeaders() });
      if (r.ok) setWhoop(await r.json());
      const h = await fetch("/api/whoop/history", { headers: apiHeaders() });
      if (h.ok) setWhoopHist(await h.json());
    } catch (e) {}
  };
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") refreshWhoop(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    const id = setInterval(() => { if (document.visibilityState === "visible") refreshWhoop(); }, 15 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
      clearInterval(id);
    };
  }, []);

  const unlock = async () => {
    const val = pw.trim();
    if (!selUser) { setPwErr("Pick who you are first."); return; }
    setPwErr("");
    try {
      const lr = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selUser, password: val }),
      });
      if (lr.status === 401) { setPwErr("That password doesn't match this account."); return; }
      if (!lr.ok) { setPwErr("Server error — try again in a moment."); return; }
      const combined = selUser + ":" + val;
      try { localStorage.setItem("forge-token", combined); } catch (e) {
        /* cookie session still works even if storage is blocked */
      }
      window.location.reload();
    } catch (e) {
      setPwErr("Couldn't reach the server. Check your connection.");
    }
  };

  const persist = async (patch = {}) => {
    const full = { profile, workouts, bodyLog, plan, insights, live, reviewedWeek, block, nutrition, checkins, measurements, ...patch };
    try {
      const r = await fetch("/api/data", { method: "PUT", headers: apiHeaders(), body: JSON.stringify(full) });
      if (!r.ok) throw new Error("save failed");
      if (localStorage.getItem(PENDING_KEY)) { localStorage.removeItem(PENDING_KEY); setQueued(0); }
    } catch (e) {
      /* offline or server unreachable: keep the newest full snapshot on device */
      try { localStorage.setItem(PENDING_KEY, JSON.stringify(full)); setQueued((n) => n + 1); } catch (e2) {}
    }
  };

  /* flush a queued snapshot once the connection is back */
  const flushPending = async () => {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return;
    try {
      const r = await fetch("/api/data", { method: "PUT", headers: apiHeaders(), body: raw });
      if (!r.ok) throw new Error("save failed");
      localStorage.removeItem(PENDING_KEY);
      setQueued(0);
    } catch (e) {}
  };

  /* Tick only while a session or rest timer is running: this used to re-render
     the whole app twice a second, which remounted open modals and reset scroll. */
  useEffect(() => {
    if (!live && !restEnd) return undefined;
    setNowTs(Date.now());
    const id = setInterval(() => setNowTs(Date.now()), 500);
    return () => clearInterval(id);
  }, [live, restEnd]);

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

  /* Rest-over sound: the AudioContext must be created/resumed inside a tap,
     so armRestSound runs off the "Log set" button and playRestBeep fires later. */
  const audioCtx = useRef(null);
  const armRestSound = () => {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtx.current) audioCtx.current = new AC();
      if (audioCtx.current.state === "suspended") audioCtx.current.resume();
    } catch (e) {}
  };
  const playRestBeep = () => {
    try {
      const ctx = audioCtx.current;
      if (!ctx || ctx.state !== "running") return;
      const t0 = ctx.currentTime;
      [0, 0.22, 0.44].forEach((off, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine"; o.frequency.value = i === 2 ? 1320 : 880;
        g.gain.setValueAtTime(0.0001, t0 + off);
        g.gain.exponentialRampToValueAtTime(0.5, t0 + off + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.18);
        o.connect(g); g.connect(ctx.destination);
        o.start(t0 + off); o.stop(t0 + off + 0.2);
      });
    } catch (e) {}
  };

  /* Buzz once when the rest timer hits zero. */
  const buzzed = useRef(false);
  useEffect(() => {
    if (!restEnd) { buzzed.current = false; return; }
    if (nowTs >= restEnd && !buzzed.current) {
      buzzed.current = true;
      try { if (navigator.vibrate) navigator.vibrate([300, 110, 300, 110, 400]); } catch (e) {}
      playRestBeep();
      try {
        if (document.hidden && "Notification" in window && Notification.permission === "granted" && navigator.serviceWorker) {
          navigator.serviceWorker.ready.then((reg) => reg.showNotification("Rest over", {
            body: "Back to the bar \u2014 next set.", tag: "forge-rest",
            icon: "/icon-192.png", badge: "/icon-192.png",
          })).catch(() => {});
        }
      } catch (e) {}
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

  /* best estimated 1RM per lift, and its trend over time */
  const e1rmBest = {};
  workouts.forEach((w) => w.exercises.forEach((e) => {
    const v = estimate1RM(e.weight, e.reps);
    if (!v) return;
    const k = e.name.trim().toLowerCase();
    if (!e1rmBest[k] || v > e1rmBest[k].value) e1rmBest[k] = { name: e.name.trim(), value: v, date: w.date };
  }));
  const e1rmList = Object.values(e1rmBest).sort((a, b) => b.value - a.value);
  const e1rmSeriesFor = (name) => {
    const k = (name || "").trim().toLowerCase();
    return [...workouts]
      .filter((w) => w.exercises.some((e) => e.name.trim().toLowerCase() === k && estimate1RM(e.weight, e.reps)))
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((w, i) => ({
        x: i, date: w.date,
        y: Math.max(...w.exercises.filter((e) => e.name.trim().toLowerCase() === k).map((e) => estimate1RM(e.weight, e.reps))),
      }));
  };

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

  /* ================= deep analytics ================= */
  const E1RM = (w, r) => (+w || 0) * (1 + (+r || 1) / 30);
  const round1 = (n) => Math.round(n * 10) / 10;
  const dayDiff = (a, b) => Math.round((new Date(a) - new Date(b)) / 864e5);

  // --- per-workout enrichment ---
  const wVolume = (w) => w.exercises.reduce((s2, e) =>
    s2 + (+e.sets || 0) * (+e.reps || 0) * (+e.weight || 0), 0);

  // --- weekly muscle-group volume trend (12 weeks) ---
  const weekList12 = (() => {
    const out = [];
    for (let i = 11; i >= 0; i--) {
      const dt = new Date(todayKey + "T00:00:00"); dt.setDate(dt.getDate() - 7 * i);
      out.push(dt.toISOString().slice(0, 10));
    }
    return out;
  })();
  const muscleTrend = (() => {
    const map = {};
    workouts.forEach((w) => {
      const k = weekKey(w.date);
      if (!weekList12.includes(k)) return;
      w.exercises.forEach((e) => {
        const g = groupFor(e.name);
        // timed work has no set volume; the fallback below would invent some
        if (g === "Cardio" || isTimedEx(e)) return;
        const v = (+e.sets || 0) * (+e.reps || 0) * (+e.weight || 0) || (+e.sets || 1) * 20;
        map[g] = map[g] || {};
        map[g][k] = (map[g][k] || 0) + v;
      });
    });
    return Object.entries(map)
      .map(([g, byWeek]) => ({
        label: g,
        points: weekList12.map((k, i) => ({ x: i, y: byWeek[k] || 0 })),
        total: Object.values(byWeek).reduce((a, b) => a + b, 0),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  })();

  // --- cardio: minutes and distance, which sets×reps×kg can't see ---
  const cardioEntries = workouts.flatMap((w) => w.exercises
    .filter((e) => isTimedEx(e) && (+e.mins > 0 || +e.km > 0))
    .map((e) => ({ date: w.date, name: e.name, mins: +e.mins || 0, km: +e.km || 0 })));
  const cardioIn = (days) => {
    const sel = cardioEntries.filter((c) => dayDiff(todayStr, c.date) <= days);
    return {
      n: sel.length,
      mins: Math.round(sel.reduce((a, c) => a + c.mins, 0)),
      km: round1(sel.reduce((a, c) => a + c.km, 0)),
    };
  };
  const cardio7 = cardioIn(7);
  const cardio28 = cardioIn(28);
  const cardioByName = (() => {
    const m = {};
    cardioEntries.filter((c) => dayDiff(todayStr, c.date) <= 28).forEach((c) => {
      m[c.name] = m[c.name] || { name: c.name, mins: 0, km: 0, n: 0 };
      m[c.name].mins += c.mins; m[c.name].km += c.km; m[c.name].n++;
    });
    return Object.values(m).sort((a, b) => b.mins - a.mins);
  })();

  // --- e1RM trend for the big lifts ---
  const PATTERNS = [
    ["Squat", /squat/i, "#FF5F2E"],
    ["Bench", /bench|chest press/i, "#63A0FF"],
    ["Deadlift", /deadlift/i, "#3FD69A"],
    ["Press", /overhead|shoulder press|ohp|military/i, "#F2B437"],
    ["Row", /row|pulldown|pull-?up|chin/i, "#C77DFF"],
  ];
  const liftHistory = PATTERNS.map(([label, re, color]) => {
    const pts = [];
    [...workouts].sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((w) => {
      let best = 0;
      w.exercises.forEach((e) => {
        if (re.test(e.name) && +e.weight > 0) best = Math.max(best, E1RM(e.weight, e.reps));
      });
      if (best > 0) pts.push({ date: w.date, y: Math.round(best) });
    });
    return { label, color, pts, best: pts.length ? Math.max(...pts.map((p) => p.y)) : 0 };
  }).filter((l) => l.pts.length > 0);

  const bigThreeTotal = ["Squat", "Bench", "Deadlift"]
    .map((n) => (liftHistory.find((l) => l.label === n) || {}).best || 0);
  const totalKgBig3 = bigThreeTotal.reduce((a, b) => a + b, 0);

  // --- strength ratios vs typical reference values ---
  const bestOf = (label) => (liftHistory.find((l) => l.label === label) || {}).best || 0;
  const RATIOS = [
    ["Bench / Squat", bestOf("Bench"), bestOf("Squat"), 0.75],
    ["Deadlift / Squat", bestOf("Deadlift"), bestOf("Squat"), 1.2],
    ["Press / Bench", bestOf("Press"), bestOf("Bench"), 0.6],
    ["Row / Bench", bestOf("Row"), bestOf("Bench"), 0.8],
  ].filter(([, a, b]) => a > 0 && b > 0)
    .map(([label, a, b, ref]) => {
      const val = a / b;
      const pct = (val - ref) / ref;
      return { label, val: round1(val * 100) / 100, ref, verdict: pct > 0.12 ? "high" : pct < -0.12 ? "low" : "balanced" };
    });

  // --- relative strength (× bodyweight) ---
  const bwNow = bwSorted.length ? bwSorted[bwSorted.length - 1].weight : (profile ? +profile.weight : 0);
  const relStrength = bwNow > 0
    ? liftHistory.map((l) => ({ label: l.label, x: round1(l.best / bwNow * 100) / 100, kg: l.best, color: l.color }))
    : [];

  // --- strength standards + DOTS ---
  const sexKey = profile && profile.sex === "F" ? "F" : "M";
  const standards = bwNow > 0
    ? liftHistory
        .map((l) => { const s = standardFor(l.label, l.best, bwNow, sexKey); return s ? { ...s, color: l.color } : null; })
        .filter(Boolean)
    : [];
  /* DOTS needs a real squat+bench+deadlift total — a partial one would flatter
     or punish the score for no reason, so it only shows with all three. */
  const hasBig3 = bigThreeTotal.every((v) => v > 0);
  const dots = hasBig3 && bwNow > 0 ? dotsScore(totalKgBig3, bwNow, sexKey) : null;
  const dotsLevel = dotsBand(dots);

  // --- consistency heatmap (last ~26 weeks) ---
  const trainedDates = new Set(workouts.map((w) => w.date));
  const heatWeeks = (() => {
    const weeks = [];
    const start = new Date(todayKey + "T00:00:00");
    start.setDate(start.getDate() - 7 * 25);
    for (let wi = 0; wi < 26; wi++) {
      const col = [];
      for (let di = 0; di < 7; di++) {
        const dt = new Date(start); dt.setDate(dt.getDate() + wi * 7 + di);
        const ds = dt.toISOString().slice(0, 10);
        const w = workouts.find((x) => x.date === ds);
        col.push({ ds, on: trainedDates.has(ds), vol: w ? wVolume(w) : 0, future: ds > todayStr });
      }
      weeks.push(col);
    }
    return weeks;
  })();
  const maxDayVol = Math.max(1, ...workouts.map(wVolume));

  // --- rep range distribution (by sets) ---
  const repRanges = (() => {
    const b = { "1-5": 0, "6-12": 0, "13+": 0 };
    workouts.forEach((w) => w.exercises.forEach((e) => {
      const r = +e.reps || 0, st = +e.sets || 1;
      if (!r) return;
      if (r <= 5) b["1-5"] += st; else if (r <= 12) b["6-12"] += st; else b["13+"] += st;
    }));
    const tot = b["1-5"] + b["6-12"] + b["13+"] || 1;
    return { b, tot, pct: { "1-5": Math.round(b["1-5"] / tot * 100), "6-12": Math.round(b["6-12"] / tot * 100), "13+": Math.round(b["13+"] / tot * 100) } };
  })();
  const goalRange = profile && /strength/i.test(profile.goal) ? "1-5"
    : profile && /muscle/i.test(profile.goal) ? "6-12"
    : profile && /(endurance|fat)/i.test(profile.goal) ? "13+" : null;

  // --- session timing & duration ---
  const timed = workouts.filter((w) => w.hour != null);
  const byPartOfDay = (() => {
    const buckets = { Morning: [], Midday: [], Evening: [], Night: [] };
    timed.forEach((w) => {
      const h = w.hour;
      const k = h < 11 ? "Morning" : h < 16 ? "Midday" : h < 21 ? "Evening" : "Night";
      buckets[k].push(wVolume(w));
    });
    return Object.entries(buckets)
      .filter(([, v]) => v.length)
      .map(([k, v]) => ({ label: k, n: v.length, avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length) }));
  })();
  const durations = workouts.filter((w) => w.durationMin).map((w) => w.durationMin);
  const avgDuration = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;

  // --- exercise frequency & staleness ---
  const exStats = (() => {
    const m = {};
    workouts.forEach((w) => w.exercises.forEach((e) => {
      const n = e.name.trim(); if (!n) return;
      m[n] = m[n] || { name: n, count: 0, last: w.date, sets: 0 };
      m[n].count++;
      m[n].sets += +e.sets || 0;
      if (w.date > m[n].last) m[n].last = w.date;
    }));
    return Object.values(m).sort((a, b) => b.count - a.count);
  })();
  const stale = exStats.filter((e) => dayDiff(todayStr, e.last) > 21).slice(0, 6);

  // --- RPE analytics ---
  const rpeEntries = [];
  workouts.forEach((w) => w.exercises.forEach((e) => {
    if (+e.rpe > 0) rpeEntries.push({ date: w.date, name: e.name, rpe: +e.rpe });
  }));
  const rpeByWeek = weekList12.map((k, i) => {
    const vals = rpeEntries.filter((r) => weekKey(r.date) === k).map((r) => r.rpe);
    return { x: i, y: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0, n: vals.length };
  });
  const avgRpe = rpeEntries.length ? round1(rpeEntries.reduce((a, b) => a + b.rpe, 0) / rpeEntries.length) : null;

  // --- WHOOP correlations ---
  const pearson = (pairs) => {
    const n = pairs.length;
    if (n < 4) return null;
    const mx = pairs.reduce((a, p) => a + p.x, 0) / n, my = pairs.reduce((a, p) => a + p.y, 0) / n;
    let num = 0, dx = 0, dy = 0;
    pairs.forEach((p) => { num += (p.x - mx) * (p.y - my); dx += (p.x - mx) ** 2; dy += (p.y - my) ** 2; });
    if (!dx || !dy) return null;
    return round1(num / Math.sqrt(dx * dy) * 100) / 100;
  };
  const whoopByDate = {}; whoopHist.forEach((h) => { whoopByDate[h.date] = h; });
  const recoveryVsVolume = workouts
    .filter((w) => whoopByDate[w.date] && whoopByDate[w.date].recovery != null && wVolume(w) > 0)
    .map((w) => ({ x: whoopByDate[w.date].recovery, y: Math.round(wVolume(w)), date: w.date }));
  const sleepVsVolume = workouts
    .filter((w) => whoopByDate[w.date] && whoopByDate[w.date].sleepHours != null && wVolume(w) > 0)
    .map((w) => ({ x: whoopByDate[w.date].sleepHours, y: Math.round(wVolume(w)), date: w.date }));
  const strainVsRecovery = whoopHist
    .map((h, i) => {
      const next = whoopHist[i + 1];
      if (!next || h.strain == null || next.recovery == null) return null;
      if (dayDiff(next.date, h.date) !== 1) return null;
      return { x: h.strain, y: next.recovery, date: h.date };
    }).filter(Boolean);
  const rpeVsRecovery = rpeEntries
    .filter((r) => whoopByDate[r.date] && whoopByDate[r.date].recovery != null)
    .map((r) => ({ x: whoopByDate[r.date].recovery, y: r.rpe, date: r.date }));
  const weeklyRecovery = weekList12.map((k, i) => {
    const vals = whoopHist.filter((h) => weekKey(h.date) === k && h.recovery != null).map((h) => h.recovery);
    return { x: i, y: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0 };
  });
  const weeklyVolume12 = weekList12.map((k, i) => ({
    x: i, y: workouts.filter((w) => weekKey(w.date) === k).reduce((a, w) => a + wVolume(w), 0),
  }));

  // --- check-ins (mood / energy / soreness) ---
  const ciSorted = [...checkins].sort((a, b) => (a.date < b.date ? -1 : 1));
  const moodVsVolume = ciSorted
    .map((c) => {
      const w = workouts.find((x) => x.date === c.date);
      return w && c.energy ? { x: c.energy, y: Math.round(wVolume(w)), date: c.date } : null;
    }).filter(Boolean);
  const sorenessCount = (() => {
    const m = {};
    ciSorted.slice(-30).forEach((c) => (c.soreness || []).forEach((g) => { m[g] = (m[g] || 0) + 1; }));
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  })();
  const todayCheckin = checkins.find((c) => c.date === todayStr) || null;

  /* per-muscle readiness, also fed to the coach */
  const readiness = muscleReadiness(workouts, checkins, todayStr);
  const readinessLine = Object.entries(readiness)
    .filter(([, v]) => v.status !== "untracked")
    .map(([g, v]) => `${g}: ${v.status} (${v.sets7} sets last 7d)`)
    .join("; ");
  const readyGroups = Object.entries(readiness).filter(([, v]) => v.status === "ready").map(([g]) => g);
  const fatiguedGroups = Object.entries(readiness).filter(([, v]) => v.status === "fatigued").map(([g]) => g);

  // --- body measurements ---
  const MEAS = [["waist", "Waist"], ["chest", "Chest"], ["arms", "Arms"], ["thighs", "Thighs"]];
  const measSorted = [...measurements].sort((a, b) => (a.date < b.date ? -1 : 1));
  const measDelta = (k) => {
    const pts = measSorted.filter((m) => +m[k] > 0);
    if (pts.length < 2) return null;
    return round1(+pts[pts.length - 1][k] - +pts[0][k]);
  };

  const hasStrengthData = liftHistory.length > 0 || RATIOS.length > 0 || relStrength.length > 0
    || rpeEntries.length > 0 || exStats.length > 0;
  const hasMuscleData = muscleTrend.length > 0 || mList.length > 0 || sorenessCount.length > 0;
  const weightedSets = workouts.reduce((a, w) => a + w.exercises.filter((e) => +e.weight > 0).length, 0);

  /* ----- progression memory ----- */
  const lastPerfFor = (name) => {
    const k = (name || "").trim().toLowerCase();
    if (!k) return null;
    for (const w of workouts) { // workouts are sorted newest-first
      const e = w.exercises.find((x) => x.name.trim().toLowerCase() === k);
      if (e) return {
        sets: e.sets, reps: e.reps, weight: +e.weight || 0,
        mins: e.mins || "", km: e.km || "", mode: exMode(e),
        summary: exSummary(e), rpe: e.rpe || "", date: w.date,
      };
    }
    return null;
  };
  // RPE-aware progression: hard last time → hold, easy → bigger jump
  const suggestNext = (perf, name) => {
    if (name) {
      const hist = [];
      for (const w of workouts) {
        const e = w.exercises.find((x) => x.name.trim().toLowerCase() === name.trim().toLowerCase());
        if (e && +e.weight) hist.push({ weight: +e.weight, reps: +e.reps || 0, rpe: +e.rpe || 0, targetReps: +e.reps || 0, date: w.date });
      }
      const fromH = suggestFromHistory(hist);
      if (fromH) return fromH.weight;
    }
    if (!perf || !perf.weight) return null;
    const r = +perf.rpe || 0;
    const step = r >= 9.5 ? 0 : r >= 8.5 ? 1.25 : r > 0 && r <= 6 ? 5 : 2.5;
    return Math.round((perf.weight + step) * 2) / 2;
  };

  const undoLastMutation = async () => {
    try {
      const r = await fetch("/api/data/undo", { method: "POST", headers: apiHeaders() });
      const d2 = await r.json();
      if (!r.ok) { setUndoNote(d2.error || "nothing to undo"); return; }
      const data = d2.data || {};
      if (data.plan) setPlan(data.plan);
      if (data.workouts) setWorkouts(data.workouts);
      if (data.profile) { setProfile(data.profile); setD(data.profile); }
      setUndoNote("Restored previous snapshot");
      setTimeout(() => setUndoNote(""), 2500);
    } catch (e) {
      setUndoNote("Undo failed");
    }
  };

  const rejectPhoto = (name) => {
    const key = (name || "").trim().toLowerCase();
    if (!key) return;
    const photoRejects = { ...(d.photoRejects || profile.photoRejects || {}), [key]: true };
    const p = { ...(profile || d), photoRejects };
    setProfile(p); setD((x) => ({ ...x, photoRejects }));
    persist({ profile: p });
  };

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
    const rows = [["date", "exercise", "sets", "reps", "weight_kg", "minutes", "km", "rpe", "notes"]];
    workouts.forEach((w) => w.exercises.forEach((e, i) =>
      rows.push([w.date, e.name, e.sets, e.reps, e.weight, e.mins || "", e.km || "", e.rpe || "",
        i === 0 ? (w.notes || "").replace(/"/g, "'") : ""])));
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

  /* ----- one-time exercise name cleanup ----- */
  const nameMigration = useRef(false);
  useEffect(() => {
    if (!loaded || nameMigration.current || !workouts.length) return;
    if (localStorage.getItem("forge-names-v1")) { nameMigration.current = true; return; }
    nameMigration.current = true;
    let changed = 0;
    const next = workouts.map((w) => ({
      ...w,
      exercises: w.exercises.map((e) => {
        const c = canonicalName(e.name);
        if (c !== e.name) changed++;
        return { ...e, name: c };
      }),
    }));
    localStorage.setItem("forge-names-v1", "1");
    if (changed) {
      setWorkouts(next);
      persist({ workouts: next });
      setFlash(`Tidied ${changed} exercise name${changed > 1 ? "s" : ""}`);
      setTimeout(() => setFlash(""), 2600);
    }
    // eslint-disable-next-line
  }, [loaded, workouts.length]);

  /* ----- connectivity ----- */
  useEffect(() => {
    const up = () => { setOnline(true); flushPending(); };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    if (navigator.onLine) flushPending();
    if ("serviceWorker" in navigator) {
      /* Register, then actively look for a newer build. Without this a cached
         worker can keep serving an old bundle and deploys look like no-ops. */
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((reg) => {
        reg.update().catch(() => {});
        setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            /* a new worker took over an existing page: reload once to run it */
            if (sw.state === "installed" && navigator.serviceWorker.controller) {
              sw.postMessage("skip-waiting");
            }
          });
        });
      }).catch(() => {});
      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
    }
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (localStorage.getItem(PENDING_KEY)) setQueued(1);
  }, [loaded]);

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
    const clean = exs.filter((e) => e.name.trim()).map((e) => ({ ...e, name: canonicalName(e.name) }));
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
- Available equipment: ${gearLabels.join(", ")}${constraintBlock(p)}${whoop && whoop.recovery != null && !whoop.stale ? `
- Today's WHOOP: recovery ${whoop.recovery}%, HRV ${whoop.hrv} ms, RHR ${whoop.rhr} bpm, sleep ${whoop.sleepHours}h${whoop.sleepPerf ? ` (${whoop.sleepPerf}% performance)` : ""}, yesterday's strain ${whoop.strain}. Calibrate intensity to recovery: under 34% go much lighter, 34-66% moderate, above 66% full intensity.` : ""}${bc.ctx}
- Recent workouts (most recent first, rpe is 1-10 perceived effort where given): ${JSON.stringify(recent)}${avgRpe ? `
- Average logged RPE: ${avgRpe}. If recent RPE at given loads is 9+, hold or reduce load rather than adding weight; if 6 or below, add a larger jump.` : ""}${todayCheckin && (todayCheckin.soreness || []).length ? `
- Reported sore today: ${todayCheckin.soreness.join(", ")} — avoid hammering these, or program them lightly.` : ""}${sorenessCount.length ? `
- Frequently sore areas recently: ${sorenessCount.slice(0, 3).map(([g, n]) => `${g} (${n}x)`).join(", ")}.` : ""}${readinessLine ? `
- Per-muscle readiness right now (estimated from set volume with a 38h fatigue half-life): ${readinessLine}.${fatiguedGroups.length ? ` Fatigued: ${fatiguedGroups.join(", ")} — do not program these hard in the first 1-2 days of the week; give them at least 48h before heavy work.` : ""}${readyGroups.length ? ` Ready to train hard: ${readyGroups.join(", ")} — front-load these early in the week.` : ""}` : ""}${RATIOS.filter((r) => r.verdict === "low").length ? `
- Strength imbalances to address: ${RATIOS.filter((r) => r.verdict === "low").map((r) => r.label + " is low").join("; ")}. Bias volume toward the lagging lift.` : ""}${standards.length ? `
- Standards level per lift: ${standards.map((s2) => `${s2.lift} ${s2.level}${s2.nextLevel ? ` (${s2.toNext}kg short of ${s2.nextLevel})` : ""}`).join(", ")}. Program loads appropriate to that level, and where a lift is within a few kg of the next band, give it a chance to be tested this week.` : ""}${goalRange && repRanges.tot > 20 && repRanges.pct[goalRange] < 50 ? `
- Rep-range mismatch: their goal calls for ${goalRange} reps but only ${repRanges.pct[goalRange]}% of sets are there. Correct this.` : ""}${stale.length ? `
- Movements they have dropped for 3+ weeks: ${stale.map((e) => e.name).join(", ")}. Reintroduce if useful.` : ""}

Build a full 7-day week, Monday to Sunday, with exactly ${p.days} training days and ${7 - p.days} rest days. Place rest days sensibly for recovery. Use ONLY the available equipment. Progress loads in small steps vs their history. Serve the specific goals directly. Give every TRAINING day its own one-line warm-up that primes the specific muscles and movements in that session. On rest days give a one-line recovery suggestion (walk, stretch, mobility) instead.
${deloadNow ? "IMPORTANT: This must be a DELOAD week. Cut loads to roughly 60% of their recent working weights and reduce total sets by about 40%. Keep the same movement patterns, keep everything far from failure, and say in \"why\" that this is a recovery week and why it earns them progress." : ""}

Respond ONLY with valid JSON, no markdown fences, no preamble:
{
 "why": "2-3 sentences on the structure of this week and how it serves their goals",
 "tip": "one specific coaching tip for this athlete right now",
 "week": [
  {"day":"Mon","rest":false,"focus":"short session title","warmup":"one line warm-up specific to this session, e.g. 5 min bike then hip openers and 2 light sets of the first lift","exercises":[{"exercise":"name","sets":3,"reps":"8-10","load":"short load guidance"}]},
  For cardio, carries or holds (run, bike, walk, row, swim, jump rope, plank, farmer's walk), use minutes instead of sets and reps: {"exercise":"Run","minutes":30,"load":"conversational pace, zone 2"}.
  {"day":"Tue","rest":true,"note":"one-line recovery suggestion"}
 ]
}
The "week" array must have exactly 7 entries, days Mon,Tue,Wed,Thu,Fri,Sat,Sun in order.`;
    try {
      const clean = await askClaude(prompt, 2500);
      const parsed = parseJson(clean);
      const sanitized = sanitizePlan(parsed, {
        profile: p,
        libNames: LIB.map((e) => e.name),
      });
      const withMeta = applyPlanRewrite(plan, { ...sanitized, created: todayStr }, {
        workouts, today: todayStr,
      });
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
    setExs(dayObj.exercises.map((e) => (
      (e.minutes || isTimedName(e.exercise))
        ? { ...emptyEx(), name: e.exercise, mode: "time", mins: String(e.minutes || "") }
        : {
          ...emptyEx(), name: e.exercise, mode: "reps",
          sets: String(e.sets || ""), reps: String(e.reps || "").split("-")[0], weight: "",
        }
    )));
    setDate(todayStr);
    setTab("log");
  };

  /* ----- live workout mode ----- */
  const startLive = (dayObj) => {
    if (!dayObj || !dayObj.exercises) return;
    const sessionEx = dayObj.exercises.map((e) => {
      const perf = lastPerfFor(e.exercise);
      if (e.minutes || isTimedName(e.exercise)) {
        const targetMins = String(e.minutes || String(e.reps || "").replace(/[^\d.]/g, "") || 20);
        return {
          name: e.exercise, load: e.load || "", mode: "time", targetMins,
          sets: [{ mins: "", km: "", done: false, rpe: "", startedAt: null }],
        };
      }
      const targetSets = +e.sets || 3;
      const targetReps = String(e.reps || "8");
      return {
        name: e.exercise, load: e.load || "", mode: "reps", targetSets, targetReps,
        sets: Array.from({ length: targetSets }).map(() => ({
          reps: targetReps.split("-")[0],
          weight: perf && perf.weight ? String(perf.weight) : "",
          done: false, rpe: "",
        })),
      };
    });
    const lv = {
      startedAt: Date.now(), date: todayStr, idx: 0, focus: dayObj.focus || "",
      warmup: dayObj.warmup || "", warmupDone: false,
      checkin: todayCheckin ? { ...todayCheckin, saved: true } : null,
      exercises: sessionEx,
    };
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
      const rpes = ds.map((x) => +x.rpe).filter((v) => v > 0);
      const rpe = rpes.length ? String(round1(rpes.reduce((a, b) => a + b, 0) / rpes.length)) : "";
      if (isTimedEx(ex)) {
        const mins = ds.reduce((a, s) => a + (+s.mins || 0), 0);
        const km = ds.reduce((a, s) => a + (+s.km || 0), 0);
        return {
          name: canonicalName(ex.name), mode: "time",
          mins: mins ? String(round1(mins)) : "", km: km ? String(round1(km)) : "",
          sets: "", reps: "", weight: "", rpe,
        };
      }
      return {
        name: canonicalName(ex.name),
        mode: "reps",
        sets: String(ds.length),
        reps: String(ds[ds.length - 1].reps || ""),
        weight: weight ? String(weight) : "",
        rpe,
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
    const startedDate = new Date(live.startedAt);
    const w = {
      id: Date.now(), date: live.date || todayStr, exercises: entries,
      notes: `Live session · ${mins} min`,
      startedAt: live.startedAt, durationMin: mins, hour: startedDate.getHours(),
    };
    const next = [w, ...workouts].sort((a, b) => (a.date < b.date ? 1 : -1));
    setWorkouts(next);
    let nextCi = checkins;
    if (live.checkin && !checkins.some((c) => c.date === (live.date || todayStr))) {
      nextCi = [...checkins, { ...live.checkin, date: live.date || todayStr }];
      setCheckins(nextCi);
    }
    setLive(null); setRestEnd(null);
    persist({ workouts: next, live: null, checkins: nextCi });
    const sessionStrain = whoop ? (whoop.todayStrain ?? whoop.strain) : null;
    if (sessionStrain != null) {
      const hist = (whoopHist || []).map((h) => ({
        volume: (workouts.find((x) => x.date === h.date) ? volumeOf(workouts.find((x) => x.date === h.date)) : 0),
        strain: h.strain,
      })).filter((h) => h.strain && h.volume);
      const sb = strainBudget({ volume: volumeOf(w), strain: sessionStrain, history: hist });
      if (sb && sb.note) setStrainNote(sb.note);
    }
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
Athlete: ${profile.level}, goal ${profile.goal}.${constraintBlock(profile)}
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

  /* ----- move a session to another day (swap contents, keep day labels) ----- */
  const moveSession = (from, to) => {
    if (!plan || !plan.week || from === to || !plan.week[from] || !plan.week[to]) { setMoveDay(null); return; }
    if (doneDays.has(to) && !window.confirm("You already trained that day. Swap the sessions anyway?")) return;
    const np = JSON.parse(JSON.stringify(plan));
    const { day: da, ...contentA } = np.week[from];
    const { day: db, ...contentB } = np.week[to];
    np.week[from] = { day: da, ...contentB };
    np.week[to] = { day: db, ...contentA };
    if (np.originalDay && (np.originalDay.idx === from || np.originalDay.idx === to)) {
      np.originalDay.idx = np.originalDay.idx === from ? to : from;
    }
    setPlan(np);
    persist({ plan: np });
    setMoveDay(null);
    setOpenDay(to);
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

  const saveMeasurements = () => {
    const entry = { date: todayStr };
    let any = false;
    MEAS.forEach(([k]) => { if (+mInput[k] > 0) { entry[k] = +mInput[k]; any = true; } });
    if (!any) return;
    const prev = measurements.find((m) => m.date === todayStr) || {};
    const merged = { ...prev, ...entry };
    const next = [...measurements.filter((m) => m.date !== todayStr), merged];
    setMeasurements(next); persist({ measurements: next });
    setMInput({ waist: "", chest: "", arms: "", thighs: "" });
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

  /* ----- reminders (web push) -----
     Permission has to be requested inside the tap that asked for it, so this
     runs straight off the button with no awaits before requestPermission. */
  const enablePush = async () => {
    setPush((p) => ({ ...p, busy: true, err: "", note: "" }));
    const fail = (msg) => setPush((p) => ({ ...p, busy: false, err: msg }));
    if (!pushSupported()) {
      return fail(isIOS() && !isStandalone()
        ? "On iPhone, reminders only work once Forge is on your Home Screen. Tap Share → Add to Home Screen, open it from there, then come back."
        : "This browser doesn't support notifications.");
    }
    if (!push.key) return fail("The server hasn't sent its notification key yet. Reload and try again.");
    let perm;
    try { perm = await Notification.requestPermission(); } catch (e) { return fail("Couldn't ask for permission."); }
    if (perm !== "granted") {
      return fail(perm === "denied"
        ? "Notifications are blocked for Forge. Turn them back on in your phone's settings for this app, then try again."
        : "Permission wasn't granted.");
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription())
        || (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToBytes(push.key),
        }));
      const r = await fetch("/api/push/subscribe", {
        method: "POST", headers: apiHeaders(), body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!r.ok) return fail("The server rejected the subscription.");
      const d = await r.json();
      setPush((p) => ({ ...p, busy: false, on: true, subs: d.subscriptions || 1, note: "Reminders on for this device." }));
    } catch (e) {
      fail(String(e.message || e).slice(0, 180));
    }
  };

  const disablePush = async () => {
    setPush((p) => ({ ...p, busy: true, err: "", note: "" }));
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST", headers: apiHeaders(), body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setPush((p) => ({ ...p, busy: false, on: false, note: "Reminders off." }));
    } catch (e) {
      setPush((p) => ({ ...p, busy: false, err: String(e.message || e).slice(0, 180) }));
    }
  };

  const testPush = async () => {
    setPush((p) => ({ ...p, busy: true, err: "", note: "" }));
    try {
      const r = await fetch("/api/push/test", { method: "POST", headers: apiHeaders() });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "send failed");
      setPush((p) => ({ ...p, busy: false, note: `Sent to ${d.sent} device${d.sent === 1 ? "" : "s"}.` }));
    } catch (e) {
      setPush((p) => ({ ...p, busy: false, err: String(e.message || e).slice(0, 180) }));
    }
  };

  const setPushPref = async (patch) => {
    const next = { ...push.prefs, ...patch };
    setPush((p) => ({ ...p, prefs: next }));
    try {
      await fetch("/api/push/prefs", { method: "PUT", headers: apiHeaders(), body: JSON.stringify(next) });
    } catch (e) {}
  };

  /* ----- daily auto-adjust to recovery ----- */
  const adjustToday = async (w = whoop) => {
    if (!plan || !plan.week || !w || w.recovery == null) return;
    if (!canAutoAdjust({ plan, workouts, today: todayStr, todayIdx })) return;
    const dy = plan.week[todayIdx];
    setAdjBusy(true);
    const reason = adjustReason(w);
    const gearLabels = profile.gear.length ? profile.gear.map((g) => (GEAR.find(([k]) => k === g) || [g, g])[1]) : ["Bodyweight only"];
    const prompt = `Adjust today's planned training session to the athlete's recovery. Change only what recovery demands.

Athlete: ${profile.level}, goal ${profile.goal}.${constraintBlock(profile)}
Equipment: ${gearLabels.join(", ")}.
WHOOP today: ${reason.summary}.
Planned session: ${JSON.stringify(dy)}${readinessLine ? `
Per-muscle readiness today: ${readinessLine}.` : ""}

Rules:
- Recovery under 34% (red): cut loads 20-30%, drop roughly one set per exercise${profile.neverSwapCompounds ? "." : ", and swap the most CNS-taxing lifts (heavy squats/deadlifts) for gentler variants."}
- Recovery 34-66% (yellow): trim loads about 10% and reduce total sets slightly. Keep the session's structure.
- If a muscle group is listed as fatigued and today's session targets it, prefer swapping that work toward a ready group over simply cutting load.
- Keep the same day name and a similar exercise count. Use ONLY the available equipment.
${profile.neverSwapCompounds ? "- Do NOT replace squat/bench/deadlift/press/row — only change load, sets or reps." : ""}

Respond ONLY with valid JSON, no markdown fences:
{"day":"${dy.day}","rest":false,"focus":"session title","warmup":"one line warm-up for this session","exercises":[{"exercise":"name","sets":3,"reps":"8-10","load":"short guidance"}],"adjust_note":"one short sentence: what changed and why"}`;
    try {
      const clean = await askClaude(prompt, 1200);
      const adj = parseJson(clean);
      const sanitized = sanitizePlan({ why: "", tip: "", week: plan.week.map((d, i) => i === todayIdx ? adj : d) }, { profile });
      const np = applyAutoAdjust(plan, {
        ...adj,
        exercises: sanitized.week[todayIdx].exercises,
        adjustRecovery: w.recovery,
        adjustReason: reason.summary,
      }, { today: todayStr, todayIdx, neverSwapCompounds: !!profile.neverSwapCompounds });
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
    if (whoop.stale || whoop.recovery == null || whoop.recovery >= 67) return; // stale or green: leave the session alone
    if (!canAutoAdjust({ plan, workouts, today: todayStr, todayIdx })) return;
    if (live || planBusy) return;                                     // never mid-session or mid-build
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
${cardio28.n ? `Cardio and timed work is logged in minutes, not sets — it carries zero lifting volume by design, so do NOT read it as a missed or empty session. Last 7 days: ${cardio7.n} sessions, ${cardio7.mins} min${cardio7.km ? `, ${cardio7.km} km` : ""}. Last 28 days: ${cardio28.n} sessions, ${cardio28.mins} min${cardio28.km ? `, ${cardio28.km} km` : ""}. By movement: ${cardioByName.slice(0, 5).map((c) => `${c.name} ${c.mins} min${c.km ? `/${c.km} km` : ""}`).join(", ")}.
` : ""}PRs: ${JSON.stringify(prList.slice(0, 6))}
Body weight log: ${JSON.stringify(bwSorted.slice(-6))}
${(profile.injuries || []).length ? `Injuries/limitations: ${profile.injuries.join("; ")}
` : ""}${whoop && whoop.recovery != null && !whoop.stale ? `WHOOP today: recovery ${whoop.recovery}%, HRV ${whoop.hrv} ms, RHR ${whoop.rhr}, sleep ${whoop.sleepHours}h, strain ${whoop.strain}
` : ""}${nutAvg && nut ? `Nutrition last 7 days (${nutAvg.n} logged): avg ${nutAvg.k} kcal vs ${nut.kcal} target, ${nutAvg.p}g protein vs ${nut.protein}g target
` : ""}${block && blockPhase ? `Training block "${block.name}": week ${blockWeek}/${block.weeks.length}, phase ${blockPhase.type}
` : ""}${avgRpe ? `Average RPE ${avgRpe} across ${rpeEntries.length} rated sets.
` : ""}${RATIOS.length ? `Strength ratios: ${RATIOS.map((r) => `${r.label} ${r.val} (ref ${r.ref}, ${r.verdict})`).join("; ")}.
` : ""}${relStrength.length ? `Relative strength at ${bwNow}kg: ${relStrength.map((r) => `${r.label} ${r.x}x bw`).join(", ")}.
` : ""}${standards.length ? `Strength standards: ${standards.map((s2) => `${s2.lift} ${s2.level}${s2.nextLevel ? ` (${s2.toNext}kg from ${s2.nextLevel})` : ""}`).join(", ")}.${dots != null ? ` DOTS ${dots} (${dotsLevel}).` : ""}
` : ""}${repRanges.tot ? `Rep-range split: ${repRanges.pct["1-5"]}% heavy (1-5), ${repRanges.pct["6-12"]}% moderate, ${repRanges.pct["13+"]}% light.
` : ""}${stale.length ? `Dropped movements (3+ weeks): ${stale.map((e) => e.name).join(", ")}.
` : ""}${recoveryVsVolume.length >= 4 ? `Recovery-vs-volume correlation r=${pearson(recoveryVsVolume)} over ${recoveryVsVolume.length} sessions.
` : ""}${sleepVsVolume.length >= 4 ? `Sleep-vs-volume correlation r=${pearson(sleepVsVolume)}.
` : ""}${avgDuration ? `Average session ${avgDuration} min. Output by time of day: ${byPartOfDay.map((b) => `${b.label} ${b.avg}`).join(", ")}.
` : ""}${measSorted.length > 1 ? `Measurement changes (cm): ${MEAS.map(([k, l]) => { const d = measDelta(k); return d != null ? `${l} ${d > 0 ? "+" : ""}${d}` : null; }).filter(Boolean).join(", ")}.
` : ""}Recent sessions: ${JSON.stringify(recent)}

Use the correlations and ratios above — cite the actual numbers. If a correlation is weak (|r| < 0.2), say so rather than inventing a pattern.

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

  /* ================= chart primitives ================= */
  const LineChart = ({ series, height = 120, yFmt = (v) => v, xLabels = [], area = false }) => {
    const W = 320, H = height, pad = { l: 30, r: 6, t: 8, b: 16 };
    const all = series.flatMap((s2) => s2.points.map((p) => p.y));
    const maxY = Math.max(1, ...all), minY = Math.min(0, ...all);
    const maxX = Math.max(1, ...series.flatMap((s2) => s2.points.map((p) => p.x)));
    const px = (x) => pad.l + (x / maxX) * (W - pad.l - pad.r);
    const py = (y) => H - pad.b - ((y - minY) / (maxY - minY || 1)) * (H - pad.t - pad.b);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ overflow: "visible" }}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={py(minY + f * (maxY - minY))} y2={py(minY + f * (maxY - minY))}
              stroke={T.lineSoft} strokeWidth="1" />
            <text x={pad.l - 4} y={py(minY + f * (maxY - minY)) + 3} textAnchor="end"
              fill={T.dim} fontSize="7.5" fontFamily={FM}>{yFmt(Math.round(minY + f * (maxY - minY)))}</text>
          </g>
        ))}
        {series.map((s2, si) => {
          const d = s2.points.map((p, i) => `${i ? "L" : "M"}${px(p.x)},${py(p.y)}`).join(" ");
          return (
            <g key={si}>
              {area && <path d={`${d} L${px(s2.points[s2.points.length - 1].x)},${py(minY)} L${px(s2.points[0].x)},${py(minY)} Z`}
                fill={s2.color || T.accent} opacity="0.10" />}
              <path d={d} fill="none" stroke={s2.color || T.accent} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
              {s2.points.length < 25 && s2.points.map((p, i) => (
                <circle key={i} cx={px(p.x)} cy={py(p.y)} r="2" fill={s2.color || T.accent} />
              ))}
            </g>
          );
        })}
        {xLabels.map((l, i) => (
          <text key={i} x={px((i / Math.max(1, xLabels.length - 1)) * maxX)} y={H - 4}
            textAnchor="middle" fill={T.dim} fontSize="7.5" fontFamily={FM}>{l}</text>
        ))}
      </svg>
    );
  };

  const Legend = ({ items }) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
      {items.map((i) => (
        <span key={i.label} style={{ fontSize: 10.5, color: T.sub, display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 8, height: 2, background: i.color, display: "inline-block" }} />
          {i.label}{i.extra ? <span style={{ ...mono, color: T.dim }}> {i.extra}</span> : null}
        </span>
      ))}
    </div>
  );

  const Scatter = ({ points, xLabel, yLabel, height = 140, color = T.accent, yFmt = (v) => v, bands }) => {
    const W = 320, H = height, pad = { l: 34, r: 8, t: 8, b: 24 };
    if (!points.length) return <div style={{ color: T.dim, fontSize: 13 }}>Not enough paired data yet.</div>;
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    const xMin = Math.min(...xs), xMax = Math.max(...xs) || 1;
    const yMin = 0, yMax = Math.max(...ys) || 1;
    const px = (x) => pad.l + ((x - xMin) / ((xMax - xMin) || 1)) * (W - pad.l - pad.r);
    const py = (y) => H - pad.b - ((y - yMin) / ((yMax - yMin) || 1)) * (H - pad.t - pad.b);
    const r = pearson(points);
    // least-squares trend line
    let trend = null;
    if (points.length >= 4) {
      const n = points.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
      let num = 0, den = 0;
      points.forEach((p) => { num += (p.x - mx) * (p.y - my); den += (p.x - mx) ** 2; });
      if (den) { const m = num / den, b = my - m * mx; trend = { x1: xMin, y1: m * xMin + b, x2: xMax, y2: m * xMax + b }; }
    }
    return (
      <>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ overflow: "visible" }}>
          {bands && bands.map((b, i) => (
            <rect key={i} x={px(b.from)} y={pad.t} width={Math.max(0, px(b.to) - px(b.from))}
              height={H - pad.t - pad.b} fill={b.color} opacity="0.07" />
          ))}
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={pad.l} x2={W - pad.r} y1={py(yMin + f * (yMax - yMin))} y2={py(yMin + f * (yMax - yMin))} stroke={T.lineSoft} />
              <text x={pad.l - 4} y={py(yMin + f * (yMax - yMin)) + 3} textAnchor="end" fill={T.dim} fontSize="7.5" fontFamily={FM}>
                {yFmt(Math.round(yMin + f * (yMax - yMin)))}
              </text>
            </g>
          ))}
          {trend && <line x1={px(trend.x1)} y1={py(trend.y1)} x2={px(trend.x2)} y2={py(trend.y2)}
            stroke={T.sub} strokeWidth="1.2" strokeDasharray="4 3" />}
          {points.map((p, i) => <circle key={i} cx={px(p.x)} cy={py(p.y)} r="3" fill={color} opacity="0.75" />)}
          <text x={pad.l} y={H - 6} fill={T.dim} fontSize="8" fontFamily={FM}>{Math.round(xMin)}</text>
          <text x={W - pad.r} y={H - 6} textAnchor="end" fill={T.dim} fontSize="8" fontFamily={FM}>{Math.round(xMax)}</text>
          <text x={(W) / 2} y={H - 6} textAnchor="middle" fill={T.dim} fontSize="8.5">{xLabel}</text>
        </svg>
        <div style={{ fontSize: 11.5, color: T.sub, marginTop: 6 }}>
          {yLabel} vs {xLabel} · <span style={{ ...mono }}>n={points.length}</span>
          {r != null && <>
            {" · "}<span style={{ ...mono, color: Math.abs(r) >= 0.4 ? T.accent : T.dim }}>r={r}</span>
            <span style={{ color: T.dim }}>
              {" "}({Math.abs(r) < 0.2 ? "no relationship" : Math.abs(r) < 0.4 ? "weak" : Math.abs(r) < 0.6 ? "moderate" : "strong"}
              {r < -0.2 ? ", inverse" : ""})
            </span>
          </>}
        </div>
      </>
    );
  };

  const Heatmap = () => (
    <>
      <div style={{ display: "flex", gap: 2, overflowX: "auto", paddingBottom: 4 }}>
        {heatWeeks.map((col, ci) => (
          <div key={ci} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {col.map((d) => (
              <div key={d.ds} title={d.on ? `${d.ds} · ${Math.round(d.vol).toLocaleString()} vol` : d.ds}
                style={{
                  width: 9, height: 9, borderRadius: 2,
                  background: d.future ? "transparent"
                    : d.on ? `rgba(255,95,46,${0.3 + 0.7 * Math.min(1, d.vol / maxDayVol)})`
                    : T.surface2,
                  border: d.ds === todayStr ? `1px solid ${T.blue}` : "none",
                  boxSizing: "border-box",
                }} />
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.dim, marginTop: 6 }}>
        <span>26 weeks ago</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          less
          {[0.3, 0.55, 0.8, 1].map((o) => (
            <span key={o} style={{ width: 8, height: 8, borderRadius: 2, background: `rgba(255,95,46,${o})` }} />
          ))}
          more
        </span>
        <span>today</span>
      </div>
    </>
  );

  const Empty = ({ label, title, lines }) => (
    <div style={S.card}>
      <Rule label={label} />
      <div style={{ ...display, fontSize: 19, marginBottom: 8, color: T.sub }}>{title}</div>
      {lines.map((l, i) => (
        <div key={i} style={{ display: "flex", gap: 9, fontSize: 13, color: T.sub, lineHeight: 1.55, marginBottom: 6 }}>
          <span style={{ color: T.accent, ...mono, fontSize: 11, paddingTop: 2 }}>{String(i + 1).padStart(2, "0")}</span>
          <span>{l}</span>
        </div>
      ))}
    </div>
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
            <ExDemo name={modal.name} size={56}
              fallback={<ExIcon name={modal.name} size={52} color={T.accent} />} />
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
              <ExPhoto
                name={modal.name}
                rejected={!!((profile && profile.photoRejects) || {})[modal.name.trim().toLowerCase()]}
                onReject={rejectPhoto}
                fallback={<div style={{ fontSize: 13, color: T.sub, marginBottom: 12 }}>Using the pictogram — photo hidden or missing.</div>}
              />
              <MuscleHighlightMap info={info} />
              <VideoButton name={modal.name} />
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
            <p style={{ color: T.sub, fontSize: 13, marginTop: 0 }}>Who's training?</p>
            {loginUsers === null && <p style={{ color: T.dim, fontSize: 13 }}>Loading…</p>}
            {loginUsers && loginUsers.length === 0 && (
              <p style={{ color: T.sub, fontSize: 12.5 }}>No accounts found — the server may still be starting. Reload in a moment.</p>
            )}
            {loginUsers && loginUsers.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                {loginUsers.map((u) => (
                  <button key={u.id} onClick={() => { setSelUser(u.id); setPwErr(""); }}
                    style={{
                      ...S.ghost, padding: "12px 6px", display: "flex", flexDirection: "column",
                      alignItems: "center", gap: 6,
                      border: `1.5px solid ${selUser === u.id ? T.accent : T.line}`,
                      background: selUser === u.id ? T.accentDim || "transparent" : "transparent",
                    }}>
                    <span style={{
                      width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center",
                      justifyContent: "center", fontWeight: 800, fontSize: 15,
                      background: selUser === u.id ? T.accent : T.line, color: selUser === u.id ? "#fff" : T.sub,
                    }}>{(u.name || "?").slice(0, 1).toUpperCase()}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{u.name}</span>
                    {u.admin && <span style={{ fontSize: 10.5, color: T.dim }}>admin</span>}
                  </button>
                ))}
              </div>
            )}
            <span style={S.label}>Password</span>
            <input type="password" value={pw}
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
            <p style={{ color: T.sub, fontSize: 12.5, margin: "0 0 14px" }}>
              The coach programs around these — plans and exercise swaps will avoid aggravating movements.
            </p>
            <span style={S.label}>Never program these lifts</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
              {(d.avoid || []).map((x) => (
                <span key={x} style={{ ...S.chip(true), cursor: "default" }}>
                  {x} <span onClick={() => setDF("avoid", d.avoid.filter((y) => y !== x))} style={{ cursor: "pointer" }}>✕</span>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input style={{ ...S.input, flex: 1 }} value={addAvoid} placeholder="e.g. behind-the-neck press"
                onChange={(e) => setAddAvoid(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && addAvoid.trim()) { setDF("avoid", [...(d.avoid || []), addAvoid.trim()]); setAddAvoid(""); } }} />
              <button style={S.ghost} onClick={() => { if (addAvoid.trim()) { setDF("avoid", [...(d.avoid || []), addAvoid.trim()]); setAddAvoid(""); } }}>Add</button>
            </div>
            <span style={S.label}>Prefer these when swapping</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
              {(d.prefer || []).map((x) => (
                <span key={x} style={{ ...S.chip(true), cursor: "default" }}>
                  {x} <span onClick={() => setDF("prefer", d.prefer.filter((y) => y !== x))} style={{ cursor: "pointer" }}>✕</span>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input style={{ ...S.input, flex: 1 }} value={addPrefer} placeholder="e.g. goblet squat"
                onChange={(e) => setAddPrefer(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && addPrefer.trim()) { setDF("prefer", [...(d.prefer || []), addPrefer.trim()]); setAddPrefer(""); } }} />
              <button style={S.ghost} onClick={() => { if (addPrefer.trim()) { setDF("prefer", [...(d.prefer || []), addPrefer.trim()]); setAddPrefer(""); } }}>Add</button>
            </div>
            <span style={S.label}>Standing notes for the coach</span>
            <textarea rows={2} style={{ ...S.input, resize: "vertical", marginBottom: 12 }}
              placeholder="Shoulder cranky on wide grip. Keep compounds."
              value={d.constraintNotes || ""} onChange={(e) => setDF("constraintNotes", e.target.value)} />
            <button style={S.chip(!!d.neverSwapCompounds)} onClick={() => setDF("neverSwapCompounds", !d.neverSwapCompounds)}>
              Never auto-swap compounds
            </button>
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <Rule label="Reminders" />
                {push.on && <span style={{ fontSize: 12, color: T.good, fontWeight: 700 }}>● on</span>}
              </div>
              {isIOS() && !isStandalone() ? (
                <p style={{ color: T.sub, fontSize: 13, margin: 0, lineHeight: 1.6 }}>
                  iPhone only delivers notifications to installed apps. Tap <b style={{ color: T.text }}>Share → Add to
                  Home Screen</b>, open Forge from that icon, and this option will appear here.
                </p>
              ) : (
                <>
                  {!push.on ? (
                    <p style={{ color: T.sub, fontSize: 13, marginTop: 0 }}>
                      A nudge on training mornings, a Monday weigh-in prompt, and a poke in the evening if the session
                      never got logged. Nothing else.
                    </p>
                  ) : (
                    <>
                      {[
                        ["train", "Training-day morning nudge"],
                        ["weigh", "Monday weigh-in"],
                        ["unlogged", "Evening: session not logged"],
                        ["adjusted", "When recovery changes your session"],
                      ].map(([k, label], i, arr) => (
                        <Row key={k} last={i === arr.length - 1} onClick={() => setPushPref({ [k]: !push.prefs[k] })}>
                          <span style={{ flex: 1, fontSize: 13.5 }}>{label}</span>
                          <span style={{
                            width: 40, height: 22, borderRadius: 12, flexShrink: 0, position: "relative",
                            background: push.prefs[k] ? T.accentDim : T.surface2,
                            border: `1px solid ${push.prefs[k] ? T.accent : T.line}`,
                          }}>
                            <span style={{
                              position: "absolute", top: 3, left: push.prefs[k] ? 21 : 3,
                              width: 14, height: 14, borderRadius: 7,
                              background: push.prefs[k] ? T.accent : T.dim,
                            }} />
                          </span>
                        </Row>
                      ))}
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        {[["morningHour", "Morning"], ["eveningHour", "Evening"]].map(([k, l]) => (
                          <div key={k} style={{ flex: 1 }}>
                            <span style={S.label}>{l}</span>
                            <select style={{ ...S.input, appearance: "none" }} value={push.prefs[k]}
                              onChange={(e) => setPushPref({ [k]: +e.target.value })}>
                              {Array.from({ length: 24 }).map((_, h) => (
                                <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    {!push.on ? (
                      <button style={{ ...S.btn, flex: 1 }} disabled={push.busy} onClick={enablePush}>
                        {push.busy ? "Enabling…" : "Turn on reminders"}
                      </button>
                    ) : (
                      <>
                        <button style={{ ...S.ghost, flex: 1 }} disabled={push.busy} onClick={testPush}>Send a test</button>
                        <button style={{ ...S.ghost, flex: 1 }} disabled={push.busy} onClick={disablePush}>Turn off</button>
                      </>
                    )}
                  </div>
                  {push.note && <div style={{ fontSize: 12.5, color: T.good, marginTop: 10 }}>{push.note}</div>}
                  {push.err && (
                    <div style={{
                      marginTop: 10, fontSize: 12.5, lineHeight: 1.5, color: T.red,
                      background: T.redDim, borderLeft: `2px solid ${T.red}`, borderRadius: 8, padding: "10px 12px",
                    }}>
                      {push.err}
                    </div>
                  )}
                  {push.on && push.subs > 1 && (
                    <div style={{ fontSize: 11.5, color: T.dim, marginTop: 8 }}>
                      {push.subs} devices are subscribed. Reminders go to all of them.
                    </div>
                  )}
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
              {health && health.warning && (
                <p style={{ color: T.red, fontSize: 12.5, margin: "10px 0 0" }}>{health.warning}</p>
              )}
            </div>
          )}
          {profile && (
            <div style={S.card}>
              <Rule label="Password" />
              <span style={S.label}>Current</span>
              <input type="password" style={{ ...S.input, marginBottom: 8 }} value={pwCur} onChange={(e) => setPwCur(e.target.value)} />
              <span style={S.label}>New password</span>
              <input type="password" style={{ ...S.input, marginBottom: 10 }} value={pwNext} onChange={(e) => setPwNext(e.target.value)} />
              <button style={S.ghost} onClick={async () => {
                setPwNote("");
                try {
                  const r = await fetch("/api/auth/password", {
                    method: "POST", headers: apiHeaders(),
                    body: JSON.stringify({ current: pwCur, next: pwNext }),
                  });
                  const j = await r.json();
                  if (!r.ok) { setPwNote(j.error || "Could not change password"); return; }
                  const combined = (me ? me.id : "") + ":" + pwNext;
                  try { localStorage.setItem("forge-token", combined); } catch (e) {}
                  APP_TOKEN = combined;
                  setPwNote("Password updated. You'll need it next time you unlock.");
                  setPwCur(""); setPwNext("");
                } catch (e) { setPwNote("Network error"); }
              }}>Change password</button>
              {pwNote && <div style={{ fontSize: 12.5, color: T.sub, marginTop: 8 }}>{pwNote}</div>}
              <button style={{ ...S.ghost, marginTop: 10 }} onClick={async () => {
                try { await fetch("/api/auth/logout", { method: "POST", headers: apiHeaders() }); } catch (e) {}
                try { localStorage.removeItem("forge-token"); } catch (e) {}
                window.location.reload();
              }}>Switch user</button>
            </div>
          )}
          {profile && me && me.admin && (
            <div style={S.card}>
              <Rule label="Users" right={adminUsers ? `${adminUsers.length} of 6` : null} />
              {!adminUsers && <p style={{ color: T.dim, fontSize: 12.5, margin: 0 }}>Loading…</p>}
              {adminUsers && adminUsers.map((u) => (
                <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${T.line}` }}>
                  <span style={{
                    width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center",
                    justifyContent: "center", fontWeight: 800, fontSize: 13, flexShrink: 0,
                    background: u.admin ? T.accentDim : T.line, color: u.admin ? T.accent : T.sub,
                  }}>{(u.name || "?").slice(0, 1).toUpperCase()}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{u.name}{u.admin ? " · admin" : ""}</div>
                    <div style={{ fontSize: 11.5, color: T.dim }}>
                      {u.admin ? "No AI cap" : `AI today: ${u.aiToday} of ${u.aiLimit}`}
                      {u.whoop ? " · WHOOP" : ""}
                      {!u.lastLogin ? " · never logged in" : ""}
                    </div>
                  </div>
                  {!u.admin && (
                    <>
                      <button style={{ ...S.ghost, padding: "5px 9px", fontSize: 12 }} onClick={async () => {
                        const np = window.prompt(`New temporary password for ${u.name} (min 4 chars):`);
                        if (!np) return;
                        try {
                          const r = await fetch(`/api/users/${u.id}/password`, {
                            method: "POST", headers: apiHeaders(), body: JSON.stringify({ password: np }),
                          });
                          const j = await r.json();
                          setNuNote(r.ok ? `${u.name}'s password was reset.` : (j.error || "Reset failed"));
                        } catch (e) { setNuNote("Network error"); }
                      }}>Reset pw</button>
                      <button style={{ ...S.ghost, padding: "5px 9px", fontSize: 12, color: T.red }} onClick={async () => {
                        if (!window.confirm(`Remove ${u.name}? Their login stops working. Their data is parked on the server, not deleted.`)) return;
                        try {
                          const r = await fetch(`/api/users/${u.id}`, { method: "DELETE", headers: apiHeaders() });
                          if (r.ok) setAdminUsers(adminUsers.filter((x) => x.id !== u.id));
                          else { const j = await r.json(); setNuNote(j.error || "Remove failed"); }
                        } catch (e) { setNuNote("Network error"); }
                      }}>Remove</button>
                    </>
                  )}
                </div>
              ))}
              {adminUsers && adminUsers.length < 6 && (
                <div style={{ marginTop: 12 }}>
                  <span style={S.label}>Add a user</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input placeholder="Name" value={nuName} onChange={(e) => setNuName(e.target.value)}
                      style={{ ...S.input, marginBottom: 0, flex: 1 }} />
                    <input placeholder="Temp password" value={nuPw} onChange={(e) => setNuPw(e.target.value)}
                      style={{ ...S.input, marginBottom: 0, flex: 1 }} />
                  </div>
                  <button style={{ ...S.ghost, marginTop: 8 }} onClick={async () => {
                    setNuNote("");
                    try {
                      const r = await fetch("/api/users", {
                        method: "POST", headers: apiHeaders(),
                        body: JSON.stringify({ name: nuName.trim(), password: nuPw.trim() }),
                      });
                      const j = await r.json();
                      if (!r.ok) { setNuNote(j.error || "Could not add user"); return; }
                      setNuName(""); setNuPw("");
                      setNuNote(`${j.user.name} was added. Give them the temp password — they can change it in their own Settings.`);
                      const lr = await fetch("/api/users", { headers: apiHeaders() });
                      if (lr.ok) setAdminUsers(await lr.json());
                    } catch (e) { setNuNote("Network error"); }
                  }}>Add user</button>
                </div>
              )}
              {nuNote && <div style={{ fontSize: 12.5, color: T.sub, marginTop: 8 }}>{nuNote}</div>}
              <p style={{ color: T.dim, fontSize: 11.5, margin: "10px 0 0" }}>
                Everyone gets their own plans, logs, WHOOP connection and reminders. Non-admin accounts have a 3-call daily AI budget.
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
      {(!online || queued > 0) && (
        <div style={{
          background: online ? T.goldDim : T.redDim, borderBottom: `1px solid ${T.line}`,
          padding: "7px 14px", fontSize: 12.5, color: online ? T.gold : T.red, textAlign: "center",
        }}>
          {online
            ? "Saved on this device — syncing…"
            : "Offline — your sets are saved on this device and will sync when you reconnect"}
        </div>
      )}
      <div style={S.scroll}>
      <div style={S.shell}>

        {/* ================= PLAN ================= */}
        {tab === "coach" && (
          <>
            {me && !me.admin && aiQuota && aiQuota.limit != null && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 2px 10px" }}>
                <span style={{ fontSize: 11.5, color: T.dim }}>AI today</span>
                {Array.from({ length: aiQuota.limit }).map((_, i) => (
                  <span key={i} style={{
                    width: 16, height: 5, borderRadius: 3,
                    background: i < aiQuota.used ? T.accent : T.line,
                  }} />
                ))}
                <span style={{ fontSize: 11.5, color: aiQuota.left === 0 ? T.red : T.dim }}>
                  {aiQuota.left === 0 ? "limit reached · resets at midnight" : `${aiQuota.left} left`}
                </span>
              </div>
            )}
            {health && health.warning && (
              <div style={{ ...S.card, background: T.redDim, borderLeft: `2px solid ${T.red}` }}>
                <b style={{ color: T.red }}>Storage · </b>
                <span style={{ fontSize: 13.5 }}>{health.warning}</span>
              </div>
            )}
            {strainNote && (
              <div style={{ ...S.card, background: T.blueDim, borderLeft: `2px solid ${T.blue}` }}>
                <b style={{ color: T.blue }}>Strain vs volume · </b>
                <span style={{ fontSize: 13.5 }}>{strainNote}</span>
              </div>
            )}
            {undoNote && <div style={{ ...S.card, fontSize: 13 }}>{undoNote}</div>}
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
                  <b style={{ color: T.text }}>WHOOP recovery</b> — a signal, not the session.
                  {whoop.stale && <><br /><span style={{ color: T.gold }}>Yesterday's score — today's isn't in yet.</span></>}
                  {whoop && adjustReason(whoop).summary && <><br />{adjustReason(whoop).summary}</>}
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
                  <b style={{ color: T.gold }}>⚡ Today auto-adjusted{plan.adjustRecovery != null ? ` for ${plan.adjustRecovery}% recovery` : ""} · </b>
                  {plan.adjustNote}
                  {plan.adjustReason && <div style={{ color: T.sub, marginTop: 4 }}>{plan.adjustReason}</div>}
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
                                  {perf && (perf.mode === "time" ? !!perf.summary : perf.weight > 0) && (
                                    <div style={{ fontSize: 12, color: T.blue, marginTop: 2 }}>
                                      Last: {perf.summary}
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
                                <div style={{ ...mono, fontSize: 14, color: T.text, whiteSpace: "nowrap" }}>
                                  {(e.minutes || (isTimedName(e.exercise) && !e.sets))
                                    ? `${e.minutes || e.reps} min`
                                    : <>{e.sets}<span style={{ color: T.dim }}>×</span>{e.reps}</>}
                                </div>
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
                          <button style={{ ...S.ghost, width: "100%", marginTop: 8 }}
                            onClick={() => setMoveDay(moveDay === openDay ? null : openDay)}>
                            {moveDay === openDay ? "Cancel move" : "⇅ Move to another day"}
                          </button>
                          {moveDay === openDay && (
                            <div style={{ marginTop: 10 }}>
                              <span style={S.label}>Swap this session with…</span>
                              <div style={{ display: "flex", gap: 5 }}>
                                {plan.week.map((d2, i2) => {
                                  if (i2 === openDay) return <div key={i2} style={{ flex: 1 }} />;
                                  const trained = doneDays.has(i2);
                                  return (
                                    <button key={i2} onClick={() => moveSession(openDay, i2)} style={{
                                      flex: 1, padding: "9px 0", borderRadius: 8, cursor: "pointer",
                                      border: `1px solid ${T.line}`, background: T.surface2,
                                      color: trained ? T.dim : d2.rest ? T.sub : T.text,
                                    }}>
                                      <div style={{ ...mono, fontSize: 10, textTransform: "uppercase" }}>{d2.day}</div>
                                      <div style={{ fontSize: 9, marginTop: 3, color: trained ? T.good : d2.rest ? T.dim : T.sub }}>
                                        {trained ? "done" : d2.rest ? "rest" : "•"}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
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
                <button style={{ ...S.ghost, width: "100%", marginTop: 8 }} onClick={undoLastMutation}>Undo last plan change</button>
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

              {!live.checkin && (
                <div style={{ ...S.card, borderLeft: `2px solid ${T.blue}`, background: T.blueDim }}>
                  <div style={{
                    fontSize: 9.5, color: T.blue, textTransform: "uppercase",
                    letterSpacing: "0.14em", fontWeight: 600, marginBottom: 10,
                  }}>Before you start</div>
                  {[["energy", "Energy"], ["mood", "Mood"]].map(([k, label]) => (
                    <div key={k} style={{ marginBottom: 12 }}>
                      <span style={S.label}>{label}</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button key={n} onClick={() => setCiDraft((d2) => ({ ...d2, [k]: n }))}
                            style={{ ...S.chip(ciDraft[k] === n), flex: 1, ...mono, textAlign: "center" }}>{n}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <span style={S.label}>Sore anywhere?</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                    {["Legs", "Hamstrings", "Glutes", "Back", "Chest", "Shoulders", "Arms", "Core"].map((g) => (
                      <button key={g} onClick={() => setCiDraft((d2) => ({
                        ...d2, soreness: (d2.soreness || []).includes(g)
                          ? d2.soreness.filter((x) => x !== g) : [...(d2.soreness || []), g],
                      }))} style={S.chip((ciDraft.soreness || []).includes(g))}>{g}</button>
                    ))}
                  </div>
                  <button style={S.btn} onClick={() => updLive((nl) => {
                    nl.checkin = { energy: ciDraft.energy || null, mood: ciDraft.mood || null, soreness: ciDraft.soreness || [] };
                  }, true)}>Start training</button>
                </div>
              )}

              {live.checkin && live.warmup && !live.warmupDone && (
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
                      {isTimedEx(ex) ? `Target ${ex.targetMins} min` : `Target ${ex.targetSets}×${ex.targetReps}`}{ex.load ? ` · ${ex.load}` : ""}
                    </div>
                    {perf && (perf.mode === "time" ? !!perf.summary : perf.weight > 0) && (
                      <div style={{ fontSize: 12.5, color: T.blue, marginTop: 2 }}>
                        Last time: {perf.summary}{perf.mode !== "time" && nextW ? ` — try ${nextW}kg` : ""}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: T.sub, whiteSpace: "nowrap" }}>
                    {live.idx + 1}/{live.exercises.length}
                  </div>
                </div>

                {!isTimedEx(ex) && (() => {
                  const nxt = live.exercises[live.idx + 1];
                  const prv = live.exercises[live.idx - 1];
                  const linkedPrev = !!(prv && prv.supersetWithNext);
                  const canLink = !linkedPrev && nxt && !isTimedEx(nxt);
                  if (!canLink && !linkedPrev) return null;
                  return (
                    <div style={{ margin: "2px 0 8px" }}>
                      {linkedPrev ? (
                        <div style={{
                          fontSize: 12, color: T.blue, background: T.blueDim,
                          border: `1px solid ${T.line}`, borderRadius: 8, padding: "7px 10px",
                        }}>
                          ⧉ Superset with {prv.name} — rest starts after this set
                        </div>
                      ) : (
                        <button onClick={() => updLive((nl) => {
                          nl.exercises[nl.idx].supersetWithNext = !nl.exercises[nl.idx].supersetWithNext;
                        }, true)} style={{
                          width: "100%", textAlign: "left", cursor: "pointer", fontSize: 12,
                          borderRadius: 8, padding: "7px 10px", fontFamily: "inherit",
                          background: ex.supersetWithNext ? T.blueDim : T.surface2,
                          border: `1px solid ${ex.supersetWithNext ? T.blue : T.line}`,
                          color: ex.supersetWithNext ? T.blue : T.sub,
                        }}>
                          {ex.supersetWithNext
                            ? `⧉ Superset on — each set jumps to ${nxt.name}, no rest between`
                            : `⧉ Superset with ${nxt.name}`}
                        </button>
                      )}
                    </div>
                  );
                })()}

                {(() => {
                  if (isTimedEx(ex)) return null;
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

                {isTimedEx(ex) ? (() => {
                  const s = ex.sets[0];
                  const running = !!s.startedAt && !s.done;
                  const secs = running
                    ? Math.max(0, Math.floor((nowTs - s.startedAt) / 1000))
                    : Math.round((+s.mins || 0) * 60);
                  const stopAt = (st) => {
                    if (!st.startedAt) return;
                    st.mins = String(Math.max(0.1, Math.round(((Date.now() - st.startedAt) / 60000) * 10) / 10));
                    st.startedAt = null;
                  };
                  return (
                    <>
                      <div style={{
                        ...mono, fontSize: 44, fontWeight: 500, letterSpacing: "-0.04em",
                        textAlign: "center", padding: "10px 0 14px",
                        color: running ? T.accent : s.done ? T.good : T.text,
                      }}>
                        {fmtClock(secs)}
                      </div>
                      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                        <input inputMode="decimal" placeholder="min" value={s.mins} disabled={s.done}
                          onChange={(e) => updLive((nl) => { nl.exercises[nl.idx].sets[0].mins = e.target.value; })}
                          style={{ ...S.inputNum, flex: 1 }} />
                        <input inputMode="decimal" placeholder="km" value={s.km} disabled={s.done}
                          onChange={(e) => updLive((nl) => { nl.exercises[nl.idx].sets[0].km = e.target.value; })}
                          style={{ ...S.inputNum, flex: 1 }} />
                        {s.done && (
                          <input inputMode="decimal" placeholder="RPE" value={s.rpe}
                            onChange={(e) => updLive((nl) => { nl.exercises[nl.idx].sets[0].rpe = e.target.value; }, true)}
                            style={{ ...S.inputNum, width: 64, flex: "none" }} />
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button style={{ ...S.ghost, flex: 1, opacity: s.done ? 0.4 : 1 }} disabled={s.done}
                          onClick={() => updLive((nl) => {
                            const st = nl.exercises[nl.idx].sets[0];
                            if (st.startedAt) stopAt(st); else st.startedAt = Date.now();
                          }, true)}>
                          {running ? "■ Stop" : s.mins ? "▶ Restart timer" : "▶ Start timer"}
                        </button>
                        <button
                          onClick={() => updLive((nl) => {
                            const st = nl.exercises[nl.idx].sets[0];
                            if (!st.done) stopAt(st);
                            st.done = !st.done;
                          }, true)}
                          style={{
                            flex: 1, padding: "11px 0", borderRadius: 8, cursor: "pointer", fontSize: 11.5,
                            border: "none", fontFamily: FD, textTransform: "uppercase", letterSpacing: "0.11em", fontWeight: 700,
                            background: s.done ? T.goodDim : T.accent,
                            color: s.done ? T.good : "#17110E",
                          }}>
                          {s.done ? "✓ Logged" : "Log it"}
                        </button>
                      </div>
                    </>
                  );
                })() : (<>
                {ex.sets.map((s, si) => (
                  <div key={si} style={{
                    display: "flex", gap: 8, alignItems: "center", padding: "8px 0",
                    borderBottom: `1px solid ${T.line}`, opacity: s.done ? 0.65 : 1,
                  }}>
                    <span style={{ ...mono, width: 20, color: s.done ? T.good : T.dim, fontSize: 12 }}>{String(si + 1).padStart(2, "0")}</span>
                    <input inputMode="decimal" placeholder="kg" value={s.weight} disabled={s.done}
                      onChange={(e) => updLive((nl) => { nl.exercises[nl.idx].sets[si].weight = e.target.value; })}
                      style={{ ...S.inputNum, width: 74, flex: "none", padding: "10px 8px" }} />
                    {!s.done && (
                      <button type="button" onClick={() => updLive((nl) => {
                        const cur = nl.exercises[nl.idx].sets[si];
                        cur.weight = String(bumpWeight(cur.weight || 0, 2.5));
                      })}
                        style={{ ...S.ghost, padding: "8px 8px", flex: "none" }}>+2.5</button>
                    )}
                    <input inputMode="numeric" placeholder="reps" value={s.reps} disabled={s.done}
                      onChange={(e) => updLive((nl) => { nl.exercises[nl.idx].sets[si].reps = e.target.value; })}
                      style={{ ...S.inputNum, width: 64, flex: "none", padding: "10px 8px" }} />
                    {s.done && (
                      <input inputMode="decimal" placeholder="RPE" value={s.rpe}
                        onChange={(e) => updLive((nl) => { nl.exercises[nl.idx].sets[si].rpe = e.target.value; }, true)}
                        style={{ ...S.inputNum, width: 58, flex: "none", padding: "10px 6px", fontSize: 14 }} />
                    )}
                    <button
                      onClick={() => {
                        if (s.done) { updLive((nl) => { nl.exercises[nl.idx].sets[si].done = false; }, true); return; }
                        const nxt = live.exercises[live.idx + 1];
                        const prv = live.exercises[live.idx - 1];
                        const toPartner = !!(ex.supersetWithNext && nxt && !isTimedEx(nxt) && nxt.sets.some((x) => !x.done));
                        const backToA = !toPartner && !!(prv && prv.supersetWithNext && prv.sets.some((x) => !x.done));
                        updLive((nl) => {
                          nl.exercises[nl.idx].sets[si].done = true;
                          if (toPartner) nl.idx++;
                          else if (backToA) nl.idx--;
                        }, true);
                        if (toPartner) { setRestEnd(null); }
                        else { armRestSound(); setRestEnd(Date.now() + restSecs * 1000); }
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
                    cur.sets.push({ reps: lastSet.reps, weight: lastSet.weight, done: false, rpe: "" });
                  }, true)}>
                  + Extra set
                </button>
                </>)}
              </div>

              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <button style={{ ...S.ghost, flex: 1 }}
                  onClick={() => {
                    if (window.confirm("Skip this lift?")) {
                      updLive((nl) => {
                        if (nl.idx < nl.exercises.length - 1) nl.idx++;
                      }, true);
                      setRestEnd(null);
                    }
                  }}>Skip</button>
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
                    {(() => {
                      const mode = exMode(ex);
                      const fields = mode === "time"
                        ? [["mins", "min"], ["km", "km"], ["rpe", "RPE"]]
                        : [["sets", "sets"], ["reps", "reps"], ["weight", "kg"], ["rpe", "RPE"]];
                      return (
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          {fields.map(([f, ph]) => (
                            <input key={f} placeholder={ph} inputMode="decimal" value={ex[f] || ""}
                              onChange={(e) => setExs((a) => a.map((x, j) => j === i ? { ...x, [f]: e.target.value } : x))}
                              style={{ ...S.inputNum }} />
                          ))}
                          <button title={mode === "time" ? "Logging time — switch to sets and reps" : "Logging reps — switch to time"}
                            onClick={() => setExs((a) => a.map((x, j) => j === i
                              ? { ...x, mode: mode === "time" ? "reps" : "time" } : x))}
                            style={{
                              background: T.surface, border: `1px solid ${T.line}`, color: T.blue, flex: "none",
                              borderRadius: 8, padding: "10px 11px", cursor: "pointer", fontSize: 13, lineHeight: 1,
                            }}>
                            {mode === "time" ? "⏱" : "#"}
                          </button>
                        </div>
                      );
                    })()}
                    {(() => {
                      const perf = lastPerfFor(ex.name);
                      if (!perf || (!ex.name.trim())) return null;
                      const nextW = suggestNext(perf);
                      return (
                        <div style={{ fontSize: 12, color: T.sub, marginTop: 7, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span>
                            Last: {perf.summary || "—"} ({perf.date})
                            {perf.mode !== "time" && nextW ? <> · <b style={{ color: T.good }}>try {nextW}kg</b></> : null}
                          </span>
                          <button
                            onClick={() => setExs((a) => a.map((x, j) => j === i
                              ? (perf.mode === "time"
                                ? { ...x, mode: "time", mins: String(perf.mins || ""), km: String(perf.km || "") }
                                : { ...x, mode: "reps", sets: String(perf.sets || ""), reps: String(perf.reps || ""), weight: nextW ? String(nextW) : String(perf.weight || "") })
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
                    <span style={{ color: T.sub, fontSize: 13.5 }}>{exSummary(e)}</span>
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
            <div style={{ display: "flex", gap: 4, marginBottom: 14, overflowX: "auto", paddingBottom: 2 }}>
              {[["overview", "Overview"], ["strength", "Strength"], ["muscle", "Muscle"], ["recovery", "Recovery"], ["body", "Body"]].map(([k, l]) => (
                <button key={k} onClick={() => setStatView(k)} style={{
                  flex: "1 0 auto", padding: "8px 13px", borderRadius: 7, cursor: "pointer",
                  border: `1px solid ${statView === k ? T.accent : T.line}`,
                  background: statView === k ? T.accentDim : "transparent",
                  color: statView === k ? T.accent : T.dim,
                  fontFamily: FD, textTransform: "uppercase", letterSpacing: "0.09em",
                  fontWeight: statView === k ? 700 : 500, fontSize: 11.5, whiteSpace: "nowrap",
                }}>{l}</button>
              ))}
            </div>
            {/* AI coach review */}
            {statView === "overview" && (<>
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

            </>)}

            {/* tiles */}
            {statView === "overview" && (<>
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

            </>)}

            {/* cardio — minutes and distance, which volume can't show */}
            {statView === "overview" && cardio28.n > 0 && (
              <div style={S.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <Rule label="Cardio & timed work" right="last 28 days" />
                </div>
                <div style={{ display: "flex", gap: 18, marginBottom: cardioByName.length ? 12 : 0 }}>
                  <div>
                    <div style={{ ...mono, fontSize: 24, color: T.accent }}>{cardio28.mins}</div>
                    <div style={S.tileLab}>minutes</div>
                  </div>
                  {cardio28.km > 0 && (
                    <div>
                      <div style={{ ...mono, fontSize: 24, color: T.accent }}>{cardio28.km}</div>
                      <div style={S.tileLab}>km</div>
                    </div>
                  )}
                  <div>
                    <div style={{ ...mono, fontSize: 24, color: T.text }}>{cardio7.mins}</div>
                    <div style={S.tileLab}>min this week</div>
                  </div>
                </div>
                {cardioByName.slice(0, 5).map((c) => (
                  <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${T.line}` }}>
                    <ExIcon name={c.name} size={26} color={T.sub} />
                    <span style={{ flex: 1, fontSize: 13.5 }}>{c.name}</span>
                    <span style={{ color: T.sub, fontSize: 13 }}>
                      {c.n}× · {Math.round(c.mins)} min{c.km ? ` · ${round1(c.km)} km` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* adherence */}
            {statView === "overview" && (<>
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

            </>)}

            {statView === "muscle" && (
              <ReadinessCard workouts={workouts} checkins={checkins} todayStr={todayStr} />
            )}

            {statView === "muscle" && muscleTrend.length > 0 && (
              <div style={S.card}>
                <Rule label="Volume by muscle group" right="12 weeks" />
                <LineChart
                  series={muscleTrend.map((m, i) => ({
                    color: [T.accent, T.blue, T.good, T.gold, "#C77DFF"][i % 5],
                    points: m.points,
                  }))}
                  yFmt={(v) => v >= 1000 ? Math.round(v / 1000) + "k" : v}
                  xLabels={weekList12.map((k, i) => (i % 3 === 0 ? k.slice(5) : ""))}
                  height={140}
                />
                <Legend items={muscleTrend.map((m, i) => ({
                  label: m.label, color: [T.accent, T.blue, T.good, T.gold, "#C77DFF"][i % 5],
                }))} />
                <div style={{ fontSize: 11.5, color: T.dim, marginTop: 8, lineHeight: 1.5 }}>
                  Flat lines mean maintenance, not progress. Rising lines are where you're actually adding work.
                </div>
              </div>
            )}

            {statView === "muscle" && sorenessCount.length > 0 && (
              <div style={S.card}>
                <Rule label="Reported soreness" right="last 30 check-ins" />
                {sorenessCount.map(([g, n]) => {
                  const mx = sorenessCount[0][1] || 1;
                  return (
                    <div key={g} style={{ marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}>
                        <span>{g}</span><span style={{ ...mono, color: T.sub }}>{n}×</span>
                      </div>
                      <div style={{ height: 6, background: T.surface2, borderRadius: 3 }}>
                        <div style={{ width: `${(n / mx) * 100}%`, height: "100%", background: T.gold, borderRadius: 3 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* muscle groups detail */}
            {statView === "muscle" && (<>
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

            </>)}

            {/* balance */}
            {statView === "muscle" && (<>
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

            </>)}

            {/* weekly volume */}
            {statView === "overview" && (<>
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

            </>)}

            {statView === "strength" && (<>
              {liftHistory.length > 0 && (
                <div style={S.card}>
                  <Rule label="Estimated 1RM trend" right={totalKgBig3 ? `big 3 total ${Math.round(totalKgBig3)} kg` : null} />
                  <LineChart
                    series={liftHistory.map((l) => ({
                      color: l.color,
                      points: l.pts.map((p, i) => ({ x: i, y: p.y })),
                    }))}
                    yFmt={(v) => v + ""}
                    height={130}
                  />
                  <Legend items={liftHistory.map((l) => ({ label: l.label, color: l.color, extra: l.best + "kg" }))} />
                  <div style={{ fontSize: 11.5, color: T.dim, marginTop: 8, lineHeight: 1.5 }}>
                    Epley estimate from your best set each session. Sessions on the x-axis, kg on the y.
                  </div>
                </div>
              )}

              {relStrength.length > 0 && (
                <div style={S.card}>
                  <Rule label="Relative strength" right={`at ${bwNow} kg bodyweight`} />
                  {relStrength.map((r) => (
                    <div key={r.label} style={{ marginBottom: 9 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}>
                        <span>{r.label}</span>
                        <span style={{ ...mono }}>
                          <b style={{ color: r.color }}>{r.x}×</b>
                          <span style={{ color: T.dim }}> bw · {r.kg}kg</span>
                        </span>
                      </div>
                      <div style={{ height: 7, background: T.surface2, borderRadius: 4, position: "relative" }}>
                        <div style={{ width: `${Math.min(100, r.x / 2.5 * 100)}%`, height: "100%", background: r.color, borderRadius: 4 }} />
                        {[1, 1.5, 2].map((m) => (
                          <span key={m} style={{ position: "absolute", left: `${m / 2.5 * 100}%`, top: -2, width: 1, height: 11, background: T.line }} />
                        ))}
                      </div>
                    </div>
                  ))}
                  <div style={{ fontSize: 11.5, color: T.dim, marginTop: 6 }}>Ticks mark 1×, 1.5× and 2× bodyweight.</div>
                </div>
              )}

              {standards.length > 0 && (
                <div style={S.card}>
                  <Rule label="Strength standards" right={`${sexKey === "F" ? "female" : "male"} · ${bwNow} kg`} />
                  {dots != null && (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 12, marginBottom: 14,
                      background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 10, padding: "11px 13px",
                    }}>
                      <div>
                        <div style={{ ...mono, fontSize: 24, fontWeight: 500, letterSpacing: "-0.03em", color: T.gold, lineHeight: 1.1 }}>{dots}</div>
                        <div style={S.tileLab}>DOTS</div>
                      </div>
                      <div style={{ flex: 1, fontSize: 12.5, color: T.sub, lineHeight: 1.5 }}>
                        <b style={{ color: T.text }}>{dotsLevel}</b> for a {Math.round(totalKgBig3)} kg big-three total
                        at {bwNow} kg. One number that compares across bodyweights.
                      </div>
                    </div>
                  )}
                  {standards.map((s) => {
                    const seg = Math.min(4, s.levelIdx + 1);
                    const markerPct = Math.min(100, ((seg + s.rungPct / 100) / 5) * 100);
                    return (
                      <div key={s.lift} style={{ marginBottom: 13 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 12.5, marginBottom: 4 }}>
                          <span>{s.lift} <span style={{ ...mono, color: T.dim }}>{s.kg}kg</span></span>
                          <span style={{
                            fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700,
                            color: s.levelIdx >= 3 ? T.good : s.levelIdx >= 1 ? T.gold : T.sub,
                          }}>{s.level}</span>
                        </div>
                        <div style={{ position: "relative", height: 9, background: T.surface2, borderRadius: 4 }}>
                          <div style={{ width: `${markerPct}%`, height: "100%", background: s.color, borderRadius: 4, opacity: 0.85 }} />
                          {[1, 2, 3, 4].map((i) => (
                            <span key={i} style={{
                              position: "absolute", left: `${i * 20}%`, top: -1, width: 1, height: 11, background: T.bg,
                            }} />
                          ))}
                        </div>
                        <div style={{ fontSize: 11, color: T.dim, marginTop: 4 }}>
                          {s.nextLevel
                            ? <><b style={{ ...mono, color: T.text }}>{s.toNext} kg</b> to {s.nextLevel} <span style={{ ...mono }}>({s.thresholds[s.levelIdx + 1]}kg)</span></>
                            : "Top of the scale."}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: T.dim, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>
                    {LEVELS_5.map((l) => <span key={l} style={{ flex: 1, textAlign: "center" }}>{l.slice(0, 3)}</span>)}
                  </div>
                  <div style={{ fontSize: 11.5, color: T.dim, marginTop: 10, lineHeight: 1.5 }}>
                    Bands are bodyweight multiples of your estimated 1RM against typical population standards.
                    They're a reference point, not a report card — leverages and training age move them.
                  </div>
                </div>
              )}

              {RATIOS.length > 0 && (
                <div style={S.card}>
                  <Rule label="Strength ratios" />
                  {RATIOS.map((r) => (
                    <Row key={r.label} last={r === RATIOS[RATIOS.length - 1]}>
                      <span style={{ flex: 1, fontSize: 13.5 }}>{r.label}</span>
                      <span style={{ ...mono, fontSize: 13.5 }}>{r.val}</span>
                      <span style={{ ...mono, fontSize: 11, color: T.dim }}>ref {r.ref}</span>
                      <span style={{
                        fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700,
                        color: r.verdict === "balanced" ? T.good : r.verdict === "low" ? T.red : T.gold,
                      }}>{r.verdict}</span>
                    </Row>
                  ))}
                  <div style={{ fontSize: 11.5, color: T.dim, marginTop: 10, lineHeight: 1.5 }}>
                    Reference values are typical for balanced lifters. A "low" ratio usually points at the weaker lift as your priority.
                  </div>
                </div>
              )}

              {rpeEntries.length > 0 && (
                <div style={S.card}>
                  <Rule label="Effort (RPE) over time" right={avgRpe ? `avg ${avgRpe}` : null} />
                  <LineChart
                    series={[{ color: T.gold, points: rpeByWeek.map((p) => ({ x: p.x, y: round1(p.y) })) }]}
                    xLabels={weekList12.map((k, i) => (i % 3 === 0 ? k.slice(5) : ""))}
                    height={110} area
                  />
                  <div style={{ fontSize: 11.5, color: T.dim, marginTop: 8, lineHeight: 1.5 }}>
                    Weekly average RPE from {rpeEntries.length} rated sets. Climbing RPE at the same loads is an early fatigue signal.
                  </div>
                </div>
              )}
            </>)}

            {statView === "strength" && e1rmList.length > 0 && (
              <div style={S.card}>
                <Rule label="Estimated 1RM" right="Epley" />
                {(() => {
                  const series = e1rmSeriesFor(chosenEx);
                  const best = e1rmBest[(chosenEx || "").toLowerCase()];
                  const delta = series.length > 1 ? series[series.length - 1].y - series[0].y : null;
                  return (
                    <>
                      <div style={{ fontSize: 12.5, color: T.sub, marginBottom: 8 }}>{chosenEx}</div>
                      {series.length > 1 ? (
                        <LineChart series={[{ color: T.gold, points: series }]} height={110} area
                          yFmt={(v) => v + "kg"}
                          xLabels={series.map((p, i) => (i === 0 || i === series.length - 1 ? p.date.slice(5) : ""))} />
                      ) : (
                        <div style={{ fontSize: 13, color: T.sub, padding: "8px 0" }}>
                          Log this lift a few more times to see the trend.
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8, fontSize: 13 }}>
                        {best && <span style={{ color: T.sub }}>Best e1RM <b style={{ ...mono, color: T.gold }}>{best.value} kg</b></span>}
                        {delta !== null && (
                          <span style={{ color: T.sub }}>
                            Since first logged <b style={{ ...mono, color: delta >= 0 ? T.good : T.red }}>{delta >= 0 ? "+" : ""}{delta} kg</b>
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11.5, color: T.dim, marginTop: 8, lineHeight: 1.5 }}>
                        Estimated one-rep max from every set, so heavier reps at lower weight still count as progress. A flat line here while volume climbs means you are training, not gaining.
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* progression */}
            {statView === "strength" && (<>
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

            </>)}

            {statView === "recovery" && (<>
              {!whoopConn && (
                <div style={S.card}>
                  <Rule label="Recovery insights" />
                  <p style={{ color: T.sub, fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>
                    Connect WHOOP in the You tab to unlock these: whether training on low-recovery days actually
                    costs you output, how sleep affects your lifting, and whether your volume is outrunning your recovery.
                    Each one is answered from your own data, not general advice.
                  </p>
                </div>
              )}

              {whoopConn && whoopHist.length > 0 && (
                <div style={S.card}>
                  <Rule label="Volume vs recovery" right="12 weeks" />
                  <LineChart
                    series={[
                      { color: T.accent, points: weeklyVolume12.map((p) => ({ x: p.x, y: p.y })) },
                    ]}
                    yFmt={(v) => v >= 1000 ? Math.round(v / 1000) + "k" : v}
                    xLabels={weekList12.map((k, i) => (i % 3 === 0 ? k.slice(5) : ""))}
                    height={100}
                  />
                  <LineChart
                    series={[{ color: T.good, points: weeklyRecovery }]}
                    yFmt={(v) => v + "%"}
                    xLabels={weekList12.map((k, i) => (i % 3 === 0 ? k.slice(5) : ""))}
                    height={90}
                  />
                  <Legend items={[
                    { label: "Weekly volume", color: T.accent },
                    { label: "Avg recovery", color: T.good },
                  ]} />
                  <div style={{ fontSize: 11.5, color: T.dim, marginTop: 8, lineHeight: 1.5 }}>
                    Volume climbing while recovery trends down is accumulated fatigue — the signal to deload
                    before progress stalls.
                  </div>
                </div>
              )}

              {whoopConn && (
                <div style={S.card}>
                  <Rule label="Does low recovery cost you output?" />
                  <Scatter points={recoveryVsVolume} xLabel="recovery %" yLabel="session volume"
                    yFmt={(v) => v >= 1000 ? Math.round(v / 1000) + "k" : v}
                    bands={[
                      { from: 0, to: 34, color: T.red },
                      { from: 34, to: 67, color: T.gold },
                      { from: 67, to: 100, color: T.good },
                    ]} />
                </div>
              )}

              {whoopConn && (
                <div style={S.card}>
                  <Rule label="Sleep vs next-day output" />
                  <Scatter points={sleepVsVolume} xLabel="hours slept" yLabel="session volume"
                    color={T.blue} yFmt={(v) => v >= 1000 ? Math.round(v / 1000) + "k" : v} />
                </div>
              )}

              {whoopConn && (
                <div style={S.card}>
                  <Rule label="Strain vs next-day recovery" />
                  <Scatter points={strainVsRecovery} xLabel="strain" yLabel="next-day recovery %"
                    color={T.gold} yFmt={(v) => v + "%"} />
                  <div style={{ fontSize: 11.5, color: T.dim, marginTop: 6, lineHeight: 1.5 }}>
                    A steep inverse slope means hard days cost you more than average — useful for spacing your
                    heaviest sessions.
                  </div>
                </div>
              )}

              {whoopConn && rpeVsRecovery.length > 0 && (
                <div style={S.card}>
                  <Rule label="Recovery vs perceived effort" />
                  <Scatter points={rpeVsRecovery} xLabel="recovery %" yLabel="RPE" color={T.red} />
                  <div style={{ fontSize: 11.5, color: T.dim, marginTop: 6, lineHeight: 1.5 }}>
                    If the same weights feel harder on low-recovery days, this slope shows it.
                  </div>
                </div>
              )}

              {moodVsVolume.length > 0 && (
                <div style={S.card}>
                  <Rule label="Energy vs output" right="from check-ins" />
                  <Scatter points={moodVsVolume} xLabel="energy (1-5)" yLabel="session volume"
                    color={T.good} yFmt={(v) => v >= 1000 ? Math.round(v / 1000) + "k" : v} />
                </div>
              )}

              {ciSorted.length > 0 && (
                <div style={S.card}>
                  <Rule label="Mood & energy" right={`${ciSorted.length} check-ins`} />
                  <LineChart
                    series={[
                      { color: T.good, points: ciSorted.slice(-20).map((c, i) => ({ x: i, y: c.energy || 0 })) },
                      { color: T.blue, points: ciSorted.slice(-20).map((c, i) => ({ x: i, y: c.mood || 0 })) },
                    ]}
                    height={100}
                  />
                  <Legend items={[{ label: "Energy", color: T.good }, { label: "Mood", color: T.blue }]} />
                </div>
              )}
            </>)}

            {statView === "body" && (
              <div style={S.card}>
                <Rule label="Measurements" right="cm" />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                  {MEAS.map(([k, label]) => (
                    <div key={k} style={{ flex: 1, minWidth: 74 }}>
                      <span style={S.label}>{label}</span>
                      <input style={S.inputNum} inputMode="decimal" value={mInput[k]}
                        onChange={(e) => setMInput((m) => ({ ...m, [k]: e.target.value }))} />
                    </div>
                  ))}
                </div>
                <button style={{ ...S.ghost, width: "100%", marginBottom: 12 }} onClick={saveMeasurements}>
                  Log today's measurements
                </button>
                {measSorted.length > 0 && (
                  <>
                    <LineChart
                      series={MEAS.map(([k], i) => ({
                        color: [T.accent, T.blue, T.good, T.gold][i],
                        points: measSorted.filter((m) => +m[k] > 0).map((m, j) => ({ x: j, y: +m[k] })),
                      })).filter((sr) => sr.points.length > 1)}
                      height={120}
                    />
                    <Legend items={MEAS.map(([k, label], i) => {
                      const d = measDelta(k);
                      return {
                        label, color: [T.accent, T.blue, T.good, T.gold][i],
                        extra: d != null ? `${d > 0 ? "+" : ""}${d}cm` : null,
                      };
                    })} />
                  </>
                )}
                <div style={{ fontSize: 11.5, color: T.dim, marginTop: 8, lineHeight: 1.5 }}>
                  Weight alone hides a recomp — waist down while arms and chest hold or grow is the pattern you want.
                </div>
              </div>
            )}

            {/* body weight */}
            {statView === "body" && (<>
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

            </>)}

            {/* nutrition */}
            {statView === "body" && (<>
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

            </>)}

            {/* PRs */}
            {statView === "strength" && (<>
            {prList.length > 0 && (
              <div style={S.card}>
                <Rule label="Personal records" right="top set / e1RM" />
                {prList.slice(0, 8).map((p) => (
                  <div key={p.name} onClick={() => openExercise(p.name)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${T.line}`, cursor: "pointer" }}>
                    <ExIcon name={p.name} size={30} color={T.gold} />
                    <span style={{ flex: 1, fontSize: 14 }}>{p.name}</span>
                    <span style={{ ...mono, color: T.gold, fontSize: 14 }}>{p.weight}<span style={{ color: T.dim, fontSize: 11 }}> kg</span>
                      {e1rmBest[p.name.toLowerCase()] && (
                        <span style={{ color: T.dim, fontSize: 11 }}> · {e1rmBest[p.name.toLowerCase()].value} e1RM</span>
                      )}
                    </span>
                    <span style={{ color: T.sub, fontSize: 12 }}>{p.date}</span>
                  </div>
                ))}
              </div>
            )}

            </>)}

            {statView === "overview" && (<>
              <div style={S.card}>
                <Rule label="Consistency" right={`${workouts.length} sessions`} />
                <Heatmap />
              </div>

              {repRanges.tot > 0 && (
                <div style={S.card}>
                  <Rule label="Rep range mix" right={`${repRanges.tot} sets`} />
                  <div style={{ display: "flex", height: 14, borderRadius: 4, overflow: "hidden", marginBottom: 10 }}>
                    {[["1-5", T.accent], ["6-12", T.blue], ["13+", T.good]].map(([k, c]) => (
                      <div key={k} style={{ width: `${repRanges.pct[k]}%`, background: c }} />
                    ))}
                  </div>
                  {[["1-5", T.accent, "Strength"], ["6-12", T.blue, "Hypertrophy"], ["13+", T.good, "Endurance"]].map(([k, c, name]) => (
                    <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, padding: "3px 0" }}>
                      <span style={{ width: 8, height: 8, background: c, borderRadius: 2 }} />
                      <span style={{ flex: 1, color: T.sub }}>{name} <span style={{ ...mono, color: T.dim }}>{k}</span></span>
                      <span style={{ ...mono, color: goalRange === k ? T.accent : T.text }}>{repRanges.pct[k]}%</span>
                    </div>
                  ))}
                  {goalRange && (
                    <div style={{ fontSize: 12.5, color: T.sub, marginTop: 10, lineHeight: 1.5 }}>
                      Your goal ({profile.goal.toLowerCase()}) lives in the <b style={{ color: T.accent }}>{goalRange}</b> range —
                      {repRanges.pct[goalRange] >= 50
                        ? " your training matches it."
                        : ` only ${repRanges.pct[goalRange]}% of your sets are there.`}
                    </div>
                  )}
                </div>
              )}

              {(byPartOfDay.length > 0 || avgDuration) && (
                <div style={S.card}>
                  <Rule label="Session patterns" right={avgDuration ? `avg ${avgDuration} min` : null} />
                  {byPartOfDay.map((b) => {
                    const mx = Math.max(...byPartOfDay.map((x) => x.avg)) || 1;
                    return (
                      <div key={b.label} style={{ marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}>
                          <span>{b.label} <span style={{ ...mono, color: T.dim }}>n={b.n}</span></span>
                          <span style={{ ...mono, color: T.sub }}>{b.avg.toLocaleString()} avg vol</span>
                        </div>
                        <div style={{ height: 7, background: T.surface2, borderRadius: 4 }}>
                          <div style={{ width: `${(b.avg / mx) * 100}%`, height: "100%", background: T.blue, borderRadius: 4 }} />
                        </div>
                      </div>
                    );
                  })}
                  {byPartOfDay.length === 0 && (
                    <div style={{ fontSize: 13, color: T.dim }}>Log via live sessions to capture time of day.</div>
                  )}
                </div>
              )}

              {exStats.length > 0 && (
                <div style={S.card}>
                  <Rule label="Most trained" right={`${exStats.length} exercises`} />
                  {exStats.slice(0, 6).map((e) => {
                    const mx = exStats[0].count || 1;
                    const ds = dayDiff(todayStr, e.last);
                    return (
                      <div key={e.name} style={{ marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}>
                          <span>{e.name}</span>
                          <span style={{ ...mono, color: ds > 21 ? T.red : T.dim }}>
                            {e.count}× · {ds === 0 ? "today" : ds + "d"}
                          </span>
                        </div>
                        <div style={{ height: 6, background: T.surface2, borderRadius: 3 }}>
                          <div style={{ width: `${(e.count / mx) * 100}%`, height: "100%", background: T.accent, borderRadius: 3 }} />
                        </div>
                      </div>
                    );
                  })}
                  {stale.length > 0 && (
                    <div style={{ background: T.redDim, borderLeft: `2px solid ${T.red}`, borderRadius: 8, padding: "10px 12px", fontSize: 12.5, marginTop: 10, lineHeight: 1.5 }}>
                      <b style={{ color: T.red }}>Dropped off · </b>
                      {stale.map((e) => e.name).join(", ")} — not trained in 3+ weeks.
                    </div>
                  )}
                </div>
              )}
            </>)}

            {/* achievements */}
            {statView === "overview" && (<>
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
            </>)}
          </>
        )}
      </div>
      </div>
      <Tabs />
      {ExModal()}
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
