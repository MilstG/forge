/* Cool-down field: survives sanitize, survives auto-adjust, and the
   muscle-group fallback produces specific stretches for legacy plans. */
import assert from "node:assert";
import { sanitizePlan } from "../src/lib/plan-schema.js";
import { applyAutoAdjust } from "../src/lib/coach-write.js";

/* sanitizePlan keeps cooldown on training days */
{
  const p = sanitizePlan({
    why: "w", tip: "t",
    week: [
      { day: "Mon", rest: false, focus: "Push", warmup: "band work",
        cooldown: "doorway pec stretch 40s per side; cross-body shoulder 30s",
        exercises: [{ exercise: "Bench Press", sets: 3, reps: "8-10", load: "" }] },
      { day: "Tue", rest: true, note: "walk" },
    ],
  }, { profile: { } });
  assert.equal(p.week[0].cooldown, "doorway pec stretch 40s per side; cross-body shoulder 30s");
  assert.equal(p.week[1].cooldown, undefined); // rest days carry no cooldown
}

/* missing cooldown coerces to empty string, not undefined/crash */
{
  const p = sanitizePlan({
    week: [{ day: "Mon", rest: false, focus: "Legs", exercises: [{ exercise: "Back Squat", sets: 3, reps: "5" }] }],
  }, {});
  assert.equal(p.week[0].cooldown, "");
}

/* auto-adjust: keeps the day's cooldown when the adjustment doesn't send one,
   takes the new one when it does */
{
  const plan = { week: [{ day: "Mon", rest: false, focus: "Legs", warmup: "w",
    cooldown: "quad stretch 40s", exercises: [{ exercise: "Back Squat", sets: 3, reps: "5" }] }] };
  const kept = applyAutoAdjust(plan, { focus: "Legs (light)", exercises: plan.week[0].exercises },
    { today: "2026-08-25", todayIdx: 0 });
  assert.equal(kept.week[0].cooldown, "quad stretch 40s");
  const replaced = applyAutoAdjust(plan, { cooldown: "gentle quad stretch 30s", exercises: plan.week[0].exercises },
    { today: "2026-08-25", todayIdx: 0 });
  assert.equal(replaced.week[0].cooldown, "gentle quad stretch 30s");
}

/* fallback generator (mirrors cooldownFor + groupFor in App.jsx): a legs+back
   day must mention leg and back stretches, and dedupe repeated groups */
{
  const groupFor = (name) => {
    const n = (name || "").trim().toLowerCase();
    if (/lunge|split squat/.test(n)) return "Legs";
    if (/squat|leg|calf/.test(n)) return "Legs";
    if (/rdl|romanian|hamstring|swing/.test(n)) return "Hamstrings";
    if (/deadlift|row|pull|chin|lat/.test(n)) return "Back";
    if (/bench|chest|push-?up|fly/.test(n)) return "Chest";
    return "Other";
  };
  const STRETCHES = {
    Legs: "standing quad stretch + deep squat hold",
    Hamstrings: "standing hamstring fold, knees soft",
    Back: "child's pose + hanging lat stretch",
    Chest: "doorway pec stretch each side",
  };
  const cooldownFor = (dy) => {
    if (!dy || dy.rest) return "";
    if (dy.cooldown) return dy.cooldown;
    const seen = [];
    (dy.exercises || []).forEach((e) => {
      const g = groupFor(e.exercise || e.name);
      if (STRETCHES[g] && !seen.includes(g)) seen.push(g);
    });
    if (!seen.length) return "5 min easy walk, then 5 slow breaths: 4s in, 6s out.";
    return `Hold 30-45s per side, easy breathing: ${seen.slice(0, 4).map((g) => STRETCHES[g]).join("; ")}. Finish with 5 slow nasal breaths.`;
  };

  const dy = { rest: false, exercises: [
    { exercise: "Back Squat" }, { exercise: "Walking Lunge" }, { exercise: "Barbell Row" },
  ] };
  const out = cooldownFor(dy);
  assert.ok(out.includes("quad stretch"), "legs stretch present");
  assert.ok(out.includes("lat stretch"), "back stretch present");
  assert.equal((out.match(/quad stretch/g) || []).length, 1, "Legs group deduped");
  assert.equal(cooldownFor({ rest: true }), "");
  assert.equal(cooldownFor({ rest: false, cooldown: "custom", exercises: [] }), "custom");
}

console.log("cooldown: all assertions passed");
