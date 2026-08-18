/* Photo coverage test — runs the REAL matcher from src/App.jsx.
 *
 *   node test/photo-coverage.mjs           # offline: coverage report only
 *   node test/photo-coverage.mjs --urls    # also HTTP-checks every photo URL
 *
 * Fails (exit 1) if a lift in KNOWN_LIFTS has no photo and isn't listed in
 * NO_PHOTO_EXPECTED, so a regression in the matcher is caught automatically.
 */
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const require2 = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const APP = join(here, "..", "src", "App.jsx");

/* Compile the module scope of App.jsx (everything above the component) with
   Babel and load it, so the test exercises exactly the code the app ships. */
const babel = require2("@babel/core");
let code = readFileSync(APP, "utf8");
code = code.slice(0, code.indexOf("export default function Forge"));
code = code.replace(/^import .*$/gm, "");
code += "\nexport { photoFor, canonicalName, photoMatch, EX_NAMES };\n";
const out = babel.transformSync(code, {
  presets: [
    ["@babel/preset-react", { runtime: "automatic" }],
    ["@babel/preset-env", { targets: { node: "current" }, modules: "commonjs" }],
  ],
  filename: "App.jsx",
}).code;
const tmp = join(here, ".photo-tmp.cjs");
writeFileSync(tmp, out);
let M;
try {
  M = require2(tmp);
} finally {
  try { unlinkSync(tmp); } catch {}
}

/* Every lift the app can realistically show: the built-in library, what a
   coach commonly programs, and the sloppy text people type mid-workout. */
const KNOWN_LIFTS = [
  "Back squat","Goblet squat","Leg press","Bodyweight squat","Lunge","Bulgarian split squat",
  "Deadlift","Romanian deadlift","Kettlebell swing","Hip thrust","Bench press","Dumbbell bench press",
  "Push-up","Overhead press","Lateral raise","Pull-up","Chin-up","Lat pulldown","Barbell row",
  "Dumbbell row","Band row","Biceps curl","Triceps extension","Plank","Crunch","Run","Bike",
  "Dumbbell pullover","Cable lateral raise","Face pull","Incline dumbbell press","Chest fly",
  "Cable fly","Pec deck","Arnold press","Front raise","Rear delt fly","Upright row","Shrug",
  "Seated cable row","T-bar row","Inverted row","Hyperextension","Good morning","Front squat",
  "Hack squat","Split squat","Step-up","Walking lunge","Leg extension","Leg curl","Calf raise",
  "Glute bridge","Sumo deadlift","Trap bar deadlift","Barbell curl","Hammer curl","Preacher curl",
  "Concentration curl","Cable curl","Skullcrusher","Triceps pushdown","Close-grip bench press",
  "Dip","Wrist curl","Sit-up","Russian twist","Hanging leg raise","Mountain climber","Ab wheel",
  "Cable crunch","Side plank","Bicycle crunch","Superman","Power clean","Hang clean","Push press",
  "Thruster","Snatch","Clean and jerk","Box jump","Jump rope","Rowing machine","Elliptical",
  "Battle ropes","Sled push","Incline bench press","Decline bench press","Machine chest press",
  "Landmine press","Pallof press","Reverse fly","Shoulder press","Farmer's walk","Seated leg curl",
  "bench","squats","RDLs","pull ups","db curl","OHP","lat pulldowns","bb row","incline db press",
  "Bird dog","Burpee","Copenhagen plank","Nordic curl",
];

/* genuinely absent from the 873-exercise database — these correctly fall back
   to the animated pictogram. Add here only after checking the db really lacks it. */
const NO_PHOTO_EXPECTED = new Set([
  "Bird dog", "Burpee", "Copenhagen plank", "Nordic curl",
]);

const missing = [], matched = [];
for (const lift of KNOWN_LIFTS) {
  const urls = M.photoFor(lift);
  if (!urls) missing.push(lift);
  else matched.push([lift, urls[0].split("/").slice(-2)[0]]);
}

const unexpected = missing.filter((m) => !NO_PHOTO_EXPECTED.has(m));
const pct = Math.round((matched.length / KNOWN_LIFTS.length) * 100);

console.log("catalog:", M.EX_NAMES.length, "exercises");
console.log("tested: ", KNOWN_LIFTS.length, "| with photo:", matched.length, "| coverage:", pct + "%");

if (missing.length) {
  console.log("\nno photo (falls back to pictogram):");
  for (const m of missing) console.log("   " + m + (NO_PHOTO_EXPECTED.has(m) ? "  [expected]" : "  [UNEXPECTED]"));
}

if (process.argv.includes("--urls")) {
  console.log("\nchecking " + matched.length + " photo URLs…");
  const ids = [...new Set(matched.map(([, id]) => id))];
  let bad = 0;
  await Promise.all(ids.map(async (id) => {
    for (const frame of ["0", "1"]) {
      const u = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/" + id + "/" + frame + ".jpg";
      try {
        const r = await fetch(u, { method: "HEAD" });
        if (!r.ok) { console.log("   DEAD " + r.status + "  " + u); bad++; }
      } catch (e) { console.log("   ERR   " + u); bad++; }
    }
  }));
  console.log(bad === 0 ? "all URLs live (both frames)" : bad + " dead URLs");
  if (bad) process.exit(1);
}

if (unexpected.length) {
  console.log("\nFAIL: " + unexpected.length + " lift(s) lost their photo.");
  process.exit(1);
}
console.log("\nPASS");
