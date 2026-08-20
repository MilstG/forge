import { suggestNext, suggestFromHistory, bumpWeight } from "../src/lib/progression.js";

let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

check("default +2.5", suggestNext({ weight: 100, rpe: 8 }), 102.5);
check("grind holds", suggestNext({ weight: 100, rpe: 10 }), 100);
check("easy jumps 5", suggestNext({ weight: 100, rpe: 5 }), 105);
check("bump", bumpWeight(80, 2.5), 82.5);

const hit = suggestFromHistory([{ weight: 100, reps: 5, targetReps: 5, rpe: 7 }]);
check("hit adds", hit.action, "add");
check("hit weight", hit.weight, 102.5);

const miss = suggestFromHistory([{ weight: 100, reps: 3, targetReps: 5 }]);
check("single miss holds", miss.action, "hold");

const twice = suggestFromHistory([
  { weight: 100, reps: 3, targetReps: 5 },
  { weight: 100, reps: 4, targetReps: 5 },
]);
check("two misses deload", twice.action, "deload");
check("deload ~10%", twice.weight, 90);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
