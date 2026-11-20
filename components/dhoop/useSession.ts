'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@/lib/dhoop/store';

/**
 * Keeps a screen in step with a session. It asks the server a few times a second whether
 * anything changed (the tools the agent calls write to the session) and redraws when it has.
 */
export function useSession(sid: string | null, intervalMs = 700) {
  const [session, setSession] = useState<Session | null>(null);
  const [offline, setOffline] = useState(false);
  const revRef = useRef(0);

  useEffect(() => {
    if (!sid) return;
    let stopped = false;
    revRef.current = 0;
    const tick = async () => {
      try {
        const res = await fetch(`/api/session/${encodeURIComponent(sid)}?rev=${revRef.current}`, { cache: 'no-store' });
        const data = await res.json();
        if (stopped) return;
        setOffline(false);
        if (!data.unchanged) {
          revRef.current = data.rev;
          setSession(data as Session);
        }
      } catch {
        if (!stopped) setOffline(true);
      }
    };
    void tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [sid, intervalMs]);

  /** Report something to the session: a roof reading, a typed bill, a view change. */
  const post = useCallback(
    async (update: Record<string, unknown>) => {
      if (!sid) return null;
      const res = await fetch(`/api/session/${encodeURIComponent(sid)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
      return res.json().catch(() => null);
    },
    [sid],
  );

  return { session, post, offline };
}

/** Rupees in the Indian style: ₹1,62,000. */
export const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
