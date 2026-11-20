/**
 * Runs once, when the server starts.
 *
 * A free host puts a server to sleep after a quarter of an hour without a visitor, and the
 * next visitor then waits about a minute for it to wake. That visitor may be a judge. With
 * DHOOP_KEEP_AWAKE=1 the server asks for its own status page through its public address every
 * ten minutes, which the host counts as a visit. It is off unless asked for: on a laptop or a
 * paid host it does nothing useful.
 *
 * The address is worked out here the same way as `publicBaseUrl` in `lib/dhoop/server.ts`,
 * and not imported from there, so that starting the server does not load the call machinery.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.DHOOP_KEEP_AWAKE !== '1') return;
  const base = (process.env.PUBLIC_BASE_URL?.trim() || process.env.RENDER_EXTERNAL_URL?.trim() || (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME.trim()}` : '')).replace(/\/+$/, '');
  if (!base) return;
  const g = globalThis as unknown as { __dhoopAwake?: ReturnType<typeof setInterval> };
  if (g.__dhoopAwake) return;
  g.__dhoopAwake = setInterval(() => {
    void fetch(`${base}/api/status`, { cache: 'no-store' }).catch(() => {});
  }, 10 * 60_000);
  g.__dhoopAwake.unref?.();
}
