/* Persistent injury / preference memory used by prompts and plan sanitising. */

export function constraintLines(profile = {}) {
  const inj = profile.injuries || [];
  const avoid = profile.avoid || [];
  const prefer = profile.prefer || [];
  const notes = (profile.constraintNotes || "").trim();
  const lines = [];
  if (inj.length) lines.push(`Injuries / limitations: ${inj.join("; ")}. Avoid anything that aggravates these.`);
  if (avoid.length) lines.push(`Never program: ${avoid.join(", ")}.`);
  if (prefer.length) lines.push(`Prefer when a swap is needed: ${prefer.join(", ")}.`);
  if (notes) lines.push(`Constraint notes: ${notes}`);
  if (profile.neverSwapCompounds) lines.push("Never swap compound lifts (squat, bench, deadlift, press, row). Only change load or sets.");
  return lines;
}

export function constraintBlock(profile) {
  const lines = constraintLines(profile);
  return lines.length ? "\n- " + lines.join("\n- ") : "";
}

const tokens = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2);

export function exerciseBanned(name, profile = {}) {
  const n = tokens(name);
  if (!n.length) return false;
  const banned = [...(profile.injuries || []), ...(profile.avoid || [])];
  for (const b of banned) {
    const bt = tokens(b);
    if (!bt.length) continue;
    // "avoid deep squat" should not ban every squat unless they named the lift
    if (bt.length === 1 && n.includes(bt[0])) return true;
    if (bt.length > 1 && bt.every((t) => n.includes(t))) return true;
    const liftish = bt.find((t) => n.includes(t) && ["squat", "deadlift", "bench", "press", "row", "lunge", "pull"].includes(t));
    if (liftish && /avoid|no |don't|dont|skip/.test(b.toLowerCase())) return true;
  }
  return false;
}
