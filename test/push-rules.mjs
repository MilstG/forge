/* Reminder scheduler test — runs the real rules from push-rules.js.
 *
 *   node test/push-rules.mjs
 *
 * The thing that actually matters here is the negatives: a reminder that
 * fires on a rest day, or after the session is already logged, trains you
 * to swipe notifications away, and then the useful ones get ignored too.
 */
import { dueReminders } from "../push-rules.js";

let failed = 0;
const keysOf = (args) => dueReminders(args).map((r) => r.key.split("|")[1]).sort();
const check = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}${ok ? "" : `\n        got  ${g}\n        want ${w}`}`);
};

const TODAY = "2026-08-19";      // a Wednesday
const MON = "2026-08-17";

const plan = (over = {}) => ({
  week: [
    { day: "Monday", focus: "Lower A", warmup: "Bike 5 min", exercises: [{ exercise: "Squat" }, { exercise: "RDL" }] },
    { day: "Tuesday", rest: true },
    { day: "Wednesday", focus: "Upper A", warmup: "Band pull-aparts", exercises: [{ exercise: "Bench" }] },
    { day: "Thursday", rest: true },
    { day: "Friday", focus: "Lower B", exercises: [{ exercise: "Deadlift" }] },
    { day: "Saturday", rest: true },
    { day: "Sunday", rest: true },
  ],
  ...over,
});
const base = { workouts: [], bodyLog: [], plan: plan() };

/* --- the morning nudge --- */
check("training day, 8am, nothing logged",
  keysOf({ data: base, today: TODAY, idx: 2, hour: 8 }), ["train"]);

check("too early — before the morning hour",
  keysOf({ data: base, today: TODAY, idx: 2, hour: 6 }), []);

check("rest day stays quiet",
  keysOf({ data: base, today: TODAY, idx: 1, hour: 9 }), []);

check("already logged — no nudge",
  keysOf({ data: { ...base, workouts: [{ date: TODAY }] }, today: TODAY, idx: 2, hour: 9 }), []);

check("logged on a different day doesn't count",
  keysOf({ data: { ...base, workouts: [{ date: "2026-08-18" }] }, today: TODAY, idx: 2, hour: 9 }), ["train"]);

check("no plan at all — nothing to remind about",
  keysOf({ data: { workouts: [], bodyLog: [] }, today: TODAY, idx: 2, hour: 9 }), []);

check("empty exercise list is not a training day",
  keysOf({ data: { ...base, plan: plan({ week: [{}, {}, { day: "Wed", exercises: [] }] }) }, today: TODAY, idx: 2, hour: 9 }), []);

check("weekday index past the end of the plan is handled",
  keysOf({ data: base, today: TODAY, idx: 9, hour: 9 }), []);

/* --- the evening nudge --- */
check("evening, still unlogged — only the evening one",
  keysOf({ data: base, today: TODAY, idx: 2, hour: 20 }), ["unlogged"]);

check("evening but logged — silence",
  keysOf({ data: { ...base, workouts: [{ date: TODAY }] }, today: TODAY, idx: 2, hour: 21 }), []);

/* --- Monday weigh-in --- */
check("Monday morning, no weight logged",
  keysOf({ data: base, today: MON, idx: 0, hour: 8 }).sort(), ["train", "weigh"]);

check("Monday, weight already logged",
  keysOf({ data: { ...base, bodyLog: [{ date: MON, weight: 78 }] }, today: MON, idx: 0, hour: 8 }), ["train"]);

check("Tuesday gets no weigh-in",
  keysOf({ data: base, today: TODAY, idx: 1, hour: 9 }), []);

/* --- auto-adjust --- */
const adjusted = { ...base, plan: plan({ adjustedDate: TODAY, adjustNote: "Cut loads 20% — recovery 31%." }) };
check("adjust note fires regardless of hour",
  keysOf({ data: adjusted, today: TODAY, idx: 2, hour: 3 }), ["adjusted"]);

check("yesterday's adjust note does not re-fire",
  keysOf({ data: { ...base, plan: plan({ adjustedDate: "2026-08-18", adjustNote: "x" }) }, today: TODAY, idx: 2, hour: 3 }), []);

check("adjust note carries into the notification body",
  dueReminders({ data: adjusted, today: TODAY, idx: 2, hour: 3 })[0].payload.body,
  "Cut loads 20% — recovery 31%.");

/* --- prefs --- */
check("every reminder off means silence",
  keysOf({ data: adjusted, prefs: { train: false, weigh: false, unlogged: false, adjusted: false }, today: MON, idx: 0, hour: 20 }), []);

check("custom morning hour is respected",
  keysOf({ data: base, prefs: { morningHour: 11 }, today: TODAY, idx: 2, hour: 9 }), []);

check("custom morning hour fires at the new time",
  keysOf({ data: base, prefs: { morningHour: 11 }, today: TODAY, idx: 2, hour: 11 }), ["train"]);

/* --- dedupe keys are stable and day-scoped --- */
const a = dueReminders({ data: base, today: TODAY, idx: 2, hour: 8 })[0].key;
const b = dueReminders({ data: base, today: TODAY, idx: 2, hour: 9 })[0].key;
check("same day, same key (so it only sends once)", a === b, true);
check("key is scoped to the date", a, `${TODAY}|train`);

console.log(failed ? `\n${failed} test(s) failed` : "\nall push rules pass");
process.exit(failed ? 1 : 0);
