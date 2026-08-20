/** WHOOP is a signal, not the session. */

export function recoveryBand(recovery) {
  if (recovery == null) return null;
  if (recovery < 34) return "red";
  if (recovery < 67) return "yellow";
  return "green";
}

export function adjustReason({ recovery, sleepHours, strain, hrv, rhr } = {}) {
  const band = recoveryBand(recovery);
  const bits = [];
  if (recovery != null) bits.push(`${recovery}% recovery (${band})`);
  if (sleepHours != null) bits.push(`${sleepHours}h sleep`);
  if (strain != null) bits.push(`${strain} yesterday strain`);
  if (hrv != null) bits.push(`HRV ${hrv}`);
  if (rhr != null) bits.push(`RHR ${rhr}`);
  return {
    band,
    summary: bits.join(" · "),
    loadCut: band === "red" ? 0.25 : band === "yellow" ? 0.1 : 0,
  };
}

/**
 * Compare today's logged lifting volume to recent volume-per-strain.
 * history: [{volume, strain}]
 */
export function strainBudget({ volume, strain, history = [] } = {}) {
  if (strain == null || !(volume >= 0)) return null;
  const usable = history.filter((h) => h.strain > 0 && h.volume > 0);
  const ratio = strain > 0 ? volume / strain : null;
  let typical = null;
  if (usable.length >= 3) {
    typical = usable.reduce((s, h) => s + h.volume / h.strain, 0) / usable.length;
  }
  let verdict = "unknown";
  if (typical && ratio != null) {
    if (ratio > typical * 1.25) verdict = "too_much";
    else if (ratio < typical * 0.7) verdict = "easy";
    else verdict = "in_range";
  }
  return {
    volume, strain, ratio, typical, verdict,
    note: verdict === "too_much"
      ? `Strain ${strain} vs ${Math.round(volume)} volume — heavier than your usual ratio.`
      : verdict === "easy"
        ? `Strain ${strain} vs ${Math.round(volume)} volume — lighter than usual.`
        : verdict === "in_range"
          ? `Strain ${strain} vs ${Math.round(volume)} volume — in your usual range.`
          : strain != null ? `Strain ${strain} after ${Math.round(volume)} volume.` : null,
  };
}
