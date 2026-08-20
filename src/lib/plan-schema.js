import { exerciseBanned } from "./constraints.js";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function parseReps(reps) {
  if (reps == null) return "";
  return String(reps);
}

export function normalizeExercise(raw = {}, { profile, libNames = [] } = {}) {
  const name = String(raw.exercise || raw.name || "").trim();
  if (!name) return null;
  if (exerciseBanned(name, profile)) return null;
  const minutes = raw.minutes != null ? +raw.minutes : null;
  const timed = minutes > 0 || raw.mode === "time";
  const out = timed
    ? { exercise: name, minutes: minutes || +raw.mins || 20, load: String(raw.load || "") }
    : {
      exercise: name,
      sets: Math.max(1, Math.min(8, +raw.sets || 3)),
      reps: parseReps(raw.reps || "8-10"),
      load: String(raw.load || ""),
    };
  if (libNames.length) {
    const hit = libNames.find((n) => n.toLowerCase() === name.toLowerCase());
    if (hit) out.exercise = hit;
  }
  return out;
}

export function normalizeDay(raw = {}, idx = 0, opts = {}) {
  const day = DAYS[idx] || raw.day || "Mon";
  if (raw.rest) return { day, rest: true, note: String(raw.note || raw.warmup || "Walk, stretch, or mobility.") };
  const exercises = (raw.exercises || []).map((e) => normalizeExercise(e, opts)).filter(Boolean);
  if (!exercises.length) return { day, rest: true, note: String(raw.note || "Rest.") };
  return {
    day,
    rest: false,
    focus: String(raw.focus || "Training"),
    warmup: String(raw.warmup || ""),
    exercises,
  };
}

/** Validate / coerce a coach week. Throws if it cannot be rescued. */
export function sanitizePlan(parsed, opts = {}) {
  if (!parsed || typeof parsed !== "object") throw new Error("Plan is not an object.");
  const weekIn = Array.isArray(parsed.week) ? parsed.week : [];
  if (!weekIn.length) throw new Error("Plan has no week.");
  const week = DAYS.map((d, i) => {
    const raw = weekIn.find((x) => x && x.day === d) || weekIn[i] || { day: d, rest: true };
    return normalizeDay(raw, i, opts);
  });
  return {
    why: String(parsed.why || ""),
    tip: String(parsed.tip || ""),
    week,
    created: parsed.created || null,
  };
}

export function isCompoundName(name) {
  const n = String(name || "").toLowerCase();
  if (/romanian|sumo|front squat|incline|lunge/.test(n)) return /deadlift|squat/.test(n);
  return /\b(back squat|squat|deadlift|bench press|overhead press|barbell row|strict press|ohp)\b/.test(n)
    || /^(bench press|deadlift|back squat|overhead press|barbell row)$/.test(n);
}
