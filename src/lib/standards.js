/* DOTS + ExRx-style strength standards. Pure maths — no React. */

export const estimate1RM = (weight, reps) => {
  const w = +weight || 0, r = +reps || 0;
  if (!w || !r || r > 12) return 0;
  return Math.round(w * (1 + r / 30));
};

export const DOTS_COEF = {
  M: [-0.000001093, 0.0007391293, -0.1918759221, 24.0900756, -307.75076],
  F: [-0.0000010706, 0.0005158568, -0.1126655495, 13.6175032, -57.96288],
};

export const dotsScore = (totalKg, bwKg, sex) => {
  const total = +totalKg || 0, raw = +bwKg || 0;
  if (total <= 0 || raw <= 0) return null;
  const female = sex === "F";
  const bw = Math.min(female ? 150 : 210, Math.max(40, raw));
  const [a, b, c, d, e] = DOTS_COEF[female ? "F" : "M"];
  const denom = a * bw ** 4 + b * bw ** 3 + c * bw ** 2 + d * bw + e;
  if (denom <= 0) return null;
  return Math.round((total * 500) / denom);
};

export const DOTS_BANDS = [
  [200, "Untrained"], [250, "Beginner"], [300, "Novice"],
  [350, "Intermediate"], [425, "Advanced"], [500, "Elite"], [Infinity, "World class"],
];
export const dotsBand = (v) => (v == null ? null : (DOTS_BANDS.find(([n]) => v < n) || DOTS_BANDS[DOTS_BANDS.length - 1])[1]);

export const LEVELS_5 = ["Beginner", "Novice", "Intermediate", "Advanced", "Elite"];
export const STANDARDS = {
  Squat:    { M: [1.0, 1.25, 1.5, 2.25, 2.75], F: [0.6, 0.85, 1.1, 1.5, 2.0] },
  Bench:    { M: [0.75, 1.0, 1.25, 1.75, 2.0], F: [0.4, 0.6, 0.75, 1.0, 1.35] },
  Deadlift: { M: [1.25, 1.5, 1.75, 2.5, 3.0], F: [0.6, 1.0, 1.25, 1.75, 2.25] },
  Press:    { M: [0.4, 0.6, 0.8, 1.1, 1.4], F: [0.25, 0.4, 0.55, 0.75, 1.0] },
  Row:      { M: [0.6, 0.85, 1.1, 1.5, 1.8], F: [0.35, 0.5, 0.7, 0.95, 1.25] },
};

export const standardFor = (lift, kg, bwKg, sex) => {
  const table = STANDARDS[lift];
  const bw = +bwKg || 0, best = +kg || 0;
  if (!table || bw <= 0 || best <= 0) return null;
  const th = (table[sex === "F" ? "F" : "M"]).map((m) => m * bw);
  let idx = -1;
  for (let i = 0; i < th.length; i++) if (best >= th[i]) idx = i;
  const next = idx + 1 < th.length ? th[idx + 1] : null;
  const floor = idx >= 0 ? th[idx] : 0;
  const ceil = next != null ? next : th[th.length - 1];
  return {
    lift,
    kg: Math.round(best),
    level: idx >= 0 ? LEVELS_5[idx] : "Untrained",
    levelIdx: idx,
    thresholds: th.map((v) => Math.round(v)),
    nextLevel: next != null ? LEVELS_5[idx + 1] : null,
    toNext: next != null ? Math.round(next - best) : 0,
    pct: Math.max(0, Math.min(100, Math.round((best / th[th.length - 1]) * 100))),
    rungPct: ceil > floor ? Math.max(0, Math.min(100, Math.round(((best - floor) / (ceil - floor)) * 100))) : 100,
  };
};
