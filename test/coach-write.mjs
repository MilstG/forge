import { canAutoAdjust, applyAutoAdjust, applyPlanRewrite, undoPlan } from "../src/lib/coach-write.js";

let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}${ok ? "" : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

const week = (exs) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, i) =>
  exs[i] ? { day, rest: false, focus: "Lift", exercises: exs[i] } : { day, rest: true, note: "rest" }
);

const plan = { week: week([
  [{ exercise: "Back squat", sets: 3, reps: "5" }],
  [{ exercise: "Bench press", sets: 3, reps: "5" }],
  null, null, null, null, null,
]), created: "2026-08-17" };

console.log("auto-adjust guards");
check("ok when nothing logged", canAutoAdjust({ plan, workouts: [], today: "2026-08-17", todayIdx: 0 }), true);
check("blocked once already adjusted", canAutoAdjust({
  plan: { ...plan, adjustedDate: "2026-08-17" }, workouts: [], today: "2026-08-17", todayIdx: 0,
}), false);
check("blocked if the day is already logged", canAutoAdjust({
  plan, workouts: [{ date: "2026-08-17", exercises: [] }], today: "2026-08-17", todayIdx: 0,
}), false);
check("blocked on a rest day", canAutoAdjust({ plan, workouts: [], today: "2026-08-19", todayIdx: 2 }), false);

console.log("\napply + undo");
const adj = applyAutoAdjust(plan, {
  focus: "Light squat", exercises: [{ exercise: "Goblet squat", sets: 3, reps: "8" }],
  adjust_note: "cut load",
}, { today: "2026-08-17", todayIdx: 0 });
check("stores original squat", adj.originalDay.day.exercises[0].exercise, "Back squat");
check("writes the swap", adj.week[0].exercises[0].exercise, "Goblet squat");

const pinned = applyAutoAdjust(plan, {
  exercises: [{ exercise: "Goblet squat", sets: 2, reps: "8", load: "-20%" }],
}, { today: "2026-08-17", todayIdx: 0, neverSwapCompounds: true });
check("never-swap keeps the squat", pinned.week[0].exercises[0].exercise, "Back squat");
check("never-swap still cuts sets", pinned.week[0].exercises[0].sets, 2);

const undone = undoPlan(adj);
check("undo restores squat", undone.week[0].exercises[0].exercise, "Back squat");
check("undo flags the day", undone.adjustUndone, true);

console.log("\nweekly rewrite preserves completed days");
const next = { why: "new", tip: "x", week: week([
  [{ exercise: "Front squat", sets: 3, reps: "5" }],
  [{ exercise: "Incline bench", sets: 3, reps: "8" }],
  null, null, null, null, null,
]) };
const merged = applyPlanRewrite(plan, next, {
  workouts: [{ date: "2026-08-17", exercises: [{ name: "Back squat" }] }],
  today: "2026-08-18",
});
check("keeps Monday as logged", merged.week[0].exercises[0].exercise, "Back squat");
check("rewrites unlogged Tuesday", merged.week[1].exercises[0].exercise, "Incline bench");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
