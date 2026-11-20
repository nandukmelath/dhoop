/**
 * Shade finding for the camera survey, as plain arithmetic.
 * Given the average brightness of each grid cell (0 to 255), a cell counts as sunlit when
 * it is at least `ratio` times as bright as the brightest cells in view.
 */
export function classifyCells(lums: number[], ratio: number): { lit: boolean[]; reference: number } {
  const sorted = [...lums].sort((a, b) => b - a);
  const top = sorted.slice(0, Math.max(3, Math.round(sorted.length * 0.3)));
  const reference = top.reduce((s, v) => s + v, 0) / top.length;
  return { lit: lums.map((v) => v >= reference * ratio), reference };
}
