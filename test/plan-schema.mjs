import { sanitizePlan, isCompoundName } from "../src/lib/plan-schema.js";

let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

const raw = {
  why: "strength",
  tip: "sleep",
  week: [
    { day: "Mon", focus: "Lower", exercises: [{ exercise: "Back squat", sets: 3, reps: "5" }, { exercise: "Jumping lunge", sets: 3 }] },
    { day: "Tue", rest: true, note: "walk" },
  ],
};
const p = sanitizePlan(raw, { profile: { avoid: ["jumping lunge"] } });
check("pads to 7 days", p.week.length, 7);
check("drops banned lift", p.week[0].exercises.map((e) => e.exercise), ["Back squat"]);
check("keeps rest", p.week[1].rest, true);
check("fills missing days", p.week[3].rest, true);
check("squat is compound", isCompoundName("Back squat"), true);
check("curl is not", isCompoundName("Biceps curl"), false);

let threw = false;
try { sanitizePlan({}); } catch { threw = true; }
check("empty plan throws", threw, true);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
