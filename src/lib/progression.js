/* Deterministic next-set suggestions. No model required. */

const round2p5 = (n) => Math.round(n * 2) / 2;

/** Single-session suggestion from last logged performance. */
export function suggestNext(perf) {
  if (!perf || !perf.weight) return null;
  const r = +perf.rpe || 0;
  const step = r >= 9.5 ? 0 : r >= 8.5 ? 1.25 : r > 0 && r <= 6 ? 5 : 2.5;
  return round2p5(perf.weight + step);
}

/**
 * History-aware progression.
 * @param {Array<{weight:number, reps:number, rpe?:number, targetReps?:number, date?:string}>} history newest-first
 */
export function suggestFromHistory(history = []) {
  const usable = (history || []).filter((h) => +h.weight > 0);
  if (!usable.length) return null;
  const last = usable[0];
  const target = +last.targetReps || +String(last.reps || "").split("-")[0] || 0;
  const hit = target ? (+last.reps || 0) >= target : true;
  const prev = usable[1];
  const missedTwice = usable.slice(0, 2).length === 2 && usable.slice(0, 2).every((h) => {
    const t = +h.targetReps || +String(h.reps || "").split("-")[0] || 0;
    return t > 0 && (+h.reps || 0) < t;
  });

  if (missedTwice) {
    return {
      weight: round2p5(last.weight * 0.9),
      action: "deload",
      note: "Missed target twice — drop ~10% and rebuild.",
    };
  }
  if (!hit) {
    return {
      weight: last.weight,
      action: "hold",
      note: "Missed reps — hold the load.",
    };
  }
  const rpe = +last.rpe || 0;
  const step = rpe >= 9.5 ? 0 : rpe >= 8.5 ? 1.25 : rpe > 0 && rpe <= 6 ? 5 : 2.5;
  const stalled = prev && +prev.weight === +last.weight && hit;
  return {
    weight: round2p5(last.weight + (stalled ? Math.max(step, 2.5) : step)),
    action: step === 0 ? "hold" : "add",
    note: step === 0 ? "Last set was a grind — hold." : `Hit reps — try +${stalled ? Math.max(step, 2.5) : step} kg.`,
  };
}

export function bumpWeight(kg, delta = 2.5) {
  return round2p5((+kg || 0) + delta);
}
