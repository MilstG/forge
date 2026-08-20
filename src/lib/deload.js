/** Detect a 4–6 week load climb that deserves a planned deload. */

export function weekVolumesRising(vols = [], n = 4) {
  if (!vols || vols.length < n) return false;
  const slice = vols.slice(-n);
  if (slice.some((v) => !(v > 0))) return false;
  for (let i = 1; i < slice.length; i++) {
    if (!(slice[i] > slice[i - 1])) return false;
  }
  return true;
}

export function liftStalled(weightsNewestFirst = []) {
  const pts = (weightsNewestFirst || []).filter((v) => v > 0);
  return pts.length >= 3 && pts[0] <= pts[2];
}

export function detectDeloadNeed({ weekVolumes = [], stalledLifts = [] } = {}) {
  const rising = weekVolumesRising(weekVolumes, 4);
  const stalled = stalledLifts.filter(Boolean);
  return {
    needed: rising || stalled.length > 0,
    rising,
    stalled,
    reason: [
      rising ? "Volume has climbed 4 weeks in a row." : null,
      stalled.length ? `Stalled: ${stalled.join(", ")}.` : null,
    ].filter(Boolean).join(" "),
  };
}
