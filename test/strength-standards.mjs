/* Strength standards test — runs the REAL math from src/App.jsx.
 *
 *   node test/strength-standards.mjs
 *
 * DOTS is checked against published reference scores; a coefficient typo
 * would still produce plausible-looking numbers, so exact values matter.
 */
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const require2 = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const APP = join(here, "..", "src", "App.jsx");

const babel = require2("@babel/core");
let code = readFileSync(APP, "utf8");
code = code.slice(0, code.indexOf("export default function Forge"));
code = code.replace(/^import .*$/gm, "");
code += "\nexport { dotsScore, dotsBand, standardFor, STANDARDS, LEVELS_5, estimate1RM };\n";
const out = babel.transformSync(code, {
  presets: [
    ["@babel/preset-react", { runtime: "automatic" }],
    ["@babel/preset-env", { targets: { node: "current" }, modules: "commonjs" }],
  ],
  filename: "App.jsx",
}).code;
const tmp = join(here, ".standards-tmp.cjs");
writeFileSync(tmp, out);
let M;
try { M = require2(tmp); } finally { try { unlinkSync(tmp); } catch {} }

const { dotsScore, dotsBand, standardFor, STANDARDS, LEVELS_5 } = M;

let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};
const near = (name, got, want, tol) => {
  const ok = got != null && Math.abs(got - want) <= tol;
  if (!ok) failed++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}${ok ? "" : `\n        got  ${got}\n        want ~${want} (±${tol})`}`);
};

console.log("DOTS");
/* Cross-checked against the OpenPowerlifting reference implementation
   (coefficients and 40-210 / 40-150 clamping), plus a published worked
   example: 510kg at 83kg bodyweight scores ~345. */
near("male, 100kg bw, 600kg total", dotsScore(600, 100, "M"), 369.3, 1);
near("male, 75kg bw, 500kg total", dotsScore(500, 75, "M"), 358.7, 1);
near("female, 60kg bw, 300kg total", dotsScore(300, 60, "F"), 332.6, 1);
near("published worked example, 83kg / 510kg", dotsScore(510, 83, "M"), 344.3, 1);

/* A heavier lifter needs a bigger total for the same score — that's the
   entire point of the metric, so it's worth pinning down. */
const light = dotsScore(400, 70, "M");
const heavy = dotsScore(400, 110, "M");
check("same total scores lower at higher bodyweight", light > heavy, true);
check("more weight at the same bodyweight scores higher", dotsScore(500, 80, "M") > dotsScore(450, 80, "M"), true);
check("female coefficients differ from male", dotsScore(300, 60, "F") !== dotsScore(300, 60, "M"), true);

console.log("\nDOTS guard rails");
check("no total → null", dotsScore(0, 80, "M"), null);
check("no bodyweight → null", dotsScore(400, 0, "M"), null);
/* Outside the fitted range the reference clamps to the boundary rather than
   extrapolating, so these must equal the boundary score exactly. */
check("below 40kg clamps to the 40kg coefficient", dotsScore(400, 35, "M"), dotsScore(400, 40, "M"));
check("male above 210kg clamps", dotsScore(400, 240, "M"), dotsScore(400, 210, "M"));
check("female above 150kg clamps", dotsScore(400, 160, "F"), dotsScore(400, 150, "F"));
check("inside the range is NOT clamped", dotsScore(400, 180, "M") !== dotsScore(400, 210, "M"), true);
check("'Other' sex falls back to male coefficients", dotsScore(500, 80, "Other"), dotsScore(500, 80, "M"));

console.log("\nDOTS bands");
check("350 is Advanced", dotsBand(350), "Advanced");
check("120 is Untrained", dotsBand(120), "Untrained");
check("999 tops out at world class", dotsBand(999), "World class");
check("null score has no band", dotsBand(null), null);

console.log("\nStandards ladder");
/* 80kg male: beginner squat 80, novice 100, int 120, adv 180, elite 220 */
const sq = standardFor("Squat", 140, 80, "M");
check("140kg squat at 80kg bw is Intermediate", sq.level, "Intermediate");
check("thresholds are absolute kg", sq.thresholds, [80, 100, 120, 180, 220]);
check("next level is Advanced", sq.nextLevel, "Advanced");
check("40kg short of Advanced", sq.toNext, 40);

check("exactly on a threshold counts as that level", standardFor("Squat", 120, 80, "M").level, "Intermediate");
check("one kg under drops a level", standardFor("Squat", 119, 80, "M").level, "Novice");
check("below every threshold is Untrained", standardFor("Squat", 40, 80, "M").level, "Untrained");
check("untrained still reports a target", standardFor("Squat", 40, 80, "M").nextLevel, "Beginner");

const elite = standardFor("Squat", 300, 80, "M");
check("above elite has no next level", elite.nextLevel, null);
check("above elite asks for nothing more", elite.toNext, 0);
check("above elite caps the bar at 100%", elite.pct, 100);

console.log("\nStandards guard rails");
check("unknown lift → null", standardFor("Curl", 40, 80, "M"), null);
check("no bodyweight → null", standardFor("Squat", 140, 0, "M"), null);
check("no lift weight → null", standardFor("Squat", 0, 80, "M"), null);
check("women's bands are lower", standardFor("Bench", 60, 70, "F").level, "Intermediate");
check("same lift, male bands, is a rung lower", standardFor("Bench", 60, 70, "M").level, "Beginner");

console.log("\nTable sanity");
Object.entries(STANDARDS).forEach(([lift, byS]) => {
  Object.entries(byS).forEach(([sex, arr]) => {
    check(`${lift} ${sex} has ${LEVELS_5.length} ascending thresholds`,
      arr.length === LEVELS_5.length && arr.every((v, i) => i === 0 || v > arr[i - 1]), true);
  });
  check(`${lift}: female bands sit below male`, byS.F.every((v, i) => v < byS.M[i]), true);
});

console.log(failed ? `\n${failed} test(s) failed` : "\nall strength standards pass");
process.exit(failed ? 1 : 0);
