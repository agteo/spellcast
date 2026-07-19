// Shared landmark geometry helpers for rule-based gesture recognizers.

export function dist2(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function mid(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: ((a.z ?? 0) + (b.z ?? 0)) / 2,
  };
}

/** True when the tip is not stretched far past the MCP (finger curled). */
export function fingerCurled(lms, tipIdx, pipIdx, mcpIdx) {
  const tip = lms[tipIdx];
  const pip = lms[pipIdx];
  const mcp = lms[mcpIdx];
  if (!tip || !pip || !mcp) return false;
  const tipSpan = dist2(tip, mcp);
  const pipSpan = dist2(pip, mcp);
  return tipSpan < pipSpan * 1.35;
}

/** True when tip is clearly extended away from the MCP. */
export function fingerExtended(lms, tipIdx, pipIdx, mcpIdx) {
  const tip = lms[tipIdx];
  const pip = lms[pipIdx];
  const mcp = lms[mcpIdx];
  if (!tip || !pip || !mcp) return false;
  const tipSpan = dist2(tip, mcp);
  const pipSpan = dist2(pip, mcp) || 1e-6;
  return tipSpan > pipSpan * 1.6;
}
