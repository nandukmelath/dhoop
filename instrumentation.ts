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
/**
 * The building outlines are one very large file on another server, read a piece at a time. The
 * first read after a start must also fetch the file's index, and from the free host that took
 * longer than the twelve seconds a lookup is given: the first "show me this building" after
 * every restart failed (seen on the hosted copy, 20 Nov 2026). So the index and two places a
 * demo starts from are read here, before anyone asks. It tries for about two minutes.
 */
function warmBuildings() {
  const g = globalThis as unknown as { __dhoopWarming?: boolean };
  if (g.__dhoopWarming || process.env.NODE_ENV !== 'production') return;
  g.__dhoopWarming = true;
  // The hackathon's hall, and the Vidhana Soudha.
  const spots: [number, number][] = [[12.9672, 77.7236], [12.9796, 77.5907]];
  void (async () => {
    const { buildingsNear } = await import('./lib/dhoop/buildings');
    for (let attempt = 1; attempt <= 8; attempt++) {
      try {
        for (const [lat, lon] of spots) await buildingsNear(lat, lon, 120);
        console.log(`The building outlines are ready (attempt ${attempt}).`);
        return;
      } catch (error) {
        console.warn(`Reading the building outlines ahead of time failed (attempt ${attempt}): ${String(error)}`);
        await new Promise((r) => setTimeout(r, 10_000));
      }
    }
  })();
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  warmBuildings();
  if (process.env.DHOOP_KEEP_AWAKE !== '1') return;
  const base = (process.env.PUBLIC_BASE_URL?.trim() || process.env.RENDER_EXTERNAL_URL?.trim() || (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME.trim()}` : '')).replace(/\/+$/, '');
  if (!base) return;
  const g = globalThis as unknown as { __dhoopAwake?: ReturnType<typeof setInterval> };
  if (g.__dhoopAwake) return;
  g.__dhoopAwake = setInterval(() => {
    void fetch(`${base}/api/status`, { cache: 'no-store' }).catch(() => {});
  }, 10 * 60_000);
  g.__dhoopAwake.unref?.();
}
