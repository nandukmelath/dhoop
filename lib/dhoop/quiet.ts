/**
 * When a call that nobody is using should end itself.
 *
 * Call time is counted for as long as an agent is in a call, used or not, and a call left open
 * runs for up to an hour: a fifth of Agora's whole free allowance. The call screen watches for
 * anything said, typed, tapped or pressed, and uses these two functions to decide what to show.
 *
 * Safe to import from a screen: no imports at all.
 */

/**
 * How long a call may sit unused before it ends itself, and how much warning it gives.
 * Four minutes and thirty seconds. NEXT_PUBLIC_DHOOP_QUIET_MINUTES changes the first (0 turns
 * it off), and outside a production build "?quiet=0.2" in the address does, for testing.
 */
export function quietLimits(search: string): { afterMs: number; warningMs: number } {
  const asked = process.env.NODE_ENV !== 'production' ? new URLSearchParams(search).get('quiet') : null;
  const minutes = Number(asked ?? process.env.NEXT_PUBLIC_DHOOP_QUIET_MINUTES ?? 4);
  if (!(minutes > 0)) return { afterMs: Infinity, warningMs: 0 };
  return { afterMs: minutes * 60_000, warningMs: Math.min(30_000, minutes * 60_000) };
}

/** What a quiet call shows: null while it is in use, the seconds left once the warning is up, and 0 when it is time to end. */
export function quietLeft(quietForMs: number, limits: { afterMs: number; warningMs: number }): number | null {
  if (quietForMs < limits.afterMs) return null;
  return Math.max(0, Math.ceil((limits.afterMs + limits.warningMs - quietForMs) / 1000));
}
