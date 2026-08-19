/* Which reminders are due right now.
 *
 * Kept pure and separate from server.js so it can be tested without booting
 * the app: given the saved data, the prefs and the local clock, it returns
 * the notifications that should fire. Deduplication happens on the keys,
 * one send per key per local day.
 */

export const DEFAULT_PUSH_PREFS = {
  train: true,        // morning nudge on training days
  weigh: true,        // Monday bodyweight reminder
  unlogged: true,     // evening "you didn't log it" nudge
  adjusted: true,     // fires when auto-adjust rewrites today's session
  morningHour: 8,     // local hour for the morning reminders
  eveningHour: 20,    // local hour for the evening nudge
};

/* @param today  local date, YYYY-MM-DD
 * @param idx    weekday index, 0 = Monday
 * @param hour   local hour, 0-23
 * @returns [{ key, payload }] in send order
 */
export function dueReminders({ data, prefs, today, idx, hour }) {
  const p = { ...DEFAULT_PUSH_PREFS, ...(prefs || {}) };
  const out = [];
  if (!data) return out;

  const workouts = Array.isArray(data.workouts) ? data.workouts : [];
  const loggedToday = workouts.some((w) => w && w.date === today);
  const week = data.plan && Array.isArray(data.plan.week) ? data.plan.week : null;
  const dy = week && idx >= 0 && idx < week.length ? week[idx] : null;
  const isTrainingDay = !!(dy && !dy.rest && Array.isArray(dy.exercises) && dy.exercises.length);

  /* Time-sensitive: the plan changed under them, so it goes out on the next
     tick rather than waiting for a scheduled hour. */
  if (p.adjusted && data.plan && data.plan.adjustedDate === today && data.plan.adjustNote) {
    out.push({
      key: `${today}|adjusted`,
      payload: { title: "Session adjusted", body: data.plan.adjustNote, tag: "forge-adjusted", url: "/" },
    });
  }

  /* Morning nudge. Suppressed once the session is logged — and it stops at
     the evening hour so a late first tick can't fire a stale "good morning". */
  if (p.train && isTrainingDay && !loggedToday && hour >= p.morningHour && hour < p.eveningHour) {
    const n = dy.exercises.length;
    out.push({
      key: `${today}|train`,
      payload: {
        title: `Training day — ${dy.focus || dy.day || "session"}`,
        body: `${n} exercise${n === 1 ? "" : "s"} on the plan${dy.warmup ? ". Warm-up: " + dy.warmup : "."}`,
        tag: "forge-train",
        url: "/",
      },
    });
  }

  if (p.weigh && idx === 0 && hour >= p.morningHour) {
    const log = Array.isArray(data.bodyLog) ? data.bodyLog : [];
    if (!log.some((b) => b && b.date === today)) {
      out.push({
        key: `${today}|weigh`,
        payload: {
          title: "Monday weigh-in",
          body: "Log your bodyweight while it's still a fasted number.",
          tag: "forge-weigh",
          url: "/",
        },
      });
    }
  }

  if (p.unlogged && isTrainingDay && !loggedToday && hour >= p.eveningHour) {
    out.push({
      key: `${today}|unlogged`,
      payload: {
        title: "Nothing logged today",
        body: `${dy.focus || dy.day || "Today's session"} is still open. Log it or move it — the coach reads both.`,
        tag: "forge-unlogged",
        url: "/",
      },
    });
  }

  return out;
}
