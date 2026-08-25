import { isCompoundName } from "./plan-schema.js";

export function weekdayIdx(dateStr) {
  return (new Date(dateStr + "T00:00:00").getDay() + 6) % 7;
}

export function mondayOf(dateStr) {
  const dt = new Date(dateStr + "T00:00:00");
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}

export function loggedDayIndexes(workouts, todayKey) {
  const set = new Set();
  (workouts || []).forEach((w) => {
    if (mondayOf(w.date) !== todayKey) return;
    set.add(weekdayIdx(w.date));
  });
  return set;
}

export function sessionLoggedOn(workouts, dateStr) {
  return (workouts || []).some((w) => w.date === dateStr);
}

/** Do not auto-adjust a day that is already logged, rest, or already handled. */
export function canAutoAdjust({ plan, workouts, today, todayIdx }) {
  if (!plan || !Array.isArray(plan.week)) return false;
  if (plan.adjustedDate === today) return false;
  if (sessionLoggedOn(workouts, today)) return false;
  const dy = plan.week[todayIdx];
  if (!dy || dy.rest || !dy.exercises || !dy.exercises.length) return false;
  return true;
}

function keepCompounds(original, incoming) {
  if (!original || !original.exercises || !incoming || !incoming.exercises) return incoming;
  const next = { ...incoming, exercises: incoming.exercises.map((e) => ({ ...e })) };
  original.exercises.forEach((o, i) => {
    if (!isCompoundName(o.exercise || o.name)) return;
    const slot = next.exercises[i];
    if (slot) {
      next.exercises[i] = { ...slot, exercise: o.exercise, name: o.exercise };
    }
  });
  return next;
}

export function applyAutoAdjust(plan, adj, { today, todayIdx, neverSwapCompounds } = {}) {
  const dy = plan.week[todayIdx];
  const incoming = {
    day: (adj && adj.day) || dy.day,
    rest: false,
    focus: (adj && adj.focus) || dy.focus,
    warmup: (adj && adj.warmup) || dy.warmup,
    cooldown: (adj && adj.cooldown) || dy.cooldown || "",
    exercises: (adj && adj.exercises) || dy.exercises,
  };
  const day = neverSwapCompounds ? keepCompounds(dy, incoming) : incoming;
  return {
    ...plan,
    originalDay: { idx: todayIdx, day: dy },
    week: plan.week.map((d, i) => (i === todayIdx ? day : d)),
    adjustedDate: today,
    adjustNote: (adj && (adj.adjust_note || adj.adjustNote)) || "Adjusted to today's recovery.",
    adjustRecovery: adj && adj.adjustRecovery,
    adjustReason: adj && adj.adjustReason,
    adjustUndone: undefined,
  };
}

/** Weekly rewrite keeps any day that already has a logged session this week. */
export function applyPlanRewrite(prev, next, { workouts, today } = {}) {
  const todayKey = mondayOf(today);
  const kept = loggedDayIndexes(workouts, todayKey);
  if (!prev || !prev.week || !kept.size) return next;
  const week = next.week.map((d, i) => (kept.has(i) ? prev.week[i] : d));
  return { ...next, week, preservedDays: [...kept] };
}

export function undoPlan(plan) {
  if (!plan || !plan.originalDay) return plan;
  const { idx, day } = plan.originalDay;
  const week = plan.week.map((d, i) => (i === idx ? day : d));
  const next = { ...plan, week, adjustedDate: plan.adjustedDate, adjustUndone: true };
  delete next.originalDay;
  delete next.adjustNote;
  delete next.adjustRecovery;
  delete next.adjustReason;
  return next;
}
