import { detectDeloadNeed, weekVolumesRising } from "../src/lib/deload.js";
import { adjustReason, strainBudget } from "../src/lib/whoop-signal.js";

let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

check("4-week climb", weekVolumesRising([10, 20, 30, 40]), true);
check("not a climb", weekVolumesRising([10, 20, 15, 40]), false);

const d = detectDeloadNeed({ weekVolumes: [1, 2, 3, 4], stalledLifts: ["Bench"] });
check("needed", d.needed, true);

check("red band", adjustReason({ recovery: 20 }).band, "red");
check("yellow band", adjustReason({ recovery: 50 }).band, "yellow");
check("green band", adjustReason({ recovery: 80 }).band, "green");

const sb = strainBudget({
  volume: 20000, strain: 8,
  history: [{ volume: 10000, strain: 10 }, { volume: 9000, strain: 9 }, { volume: 11000, strain: 11 }],
});
check("too much volume for strain", sb.verdict, "too_much");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
