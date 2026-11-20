/**
 * Tells a request made on this computer apart from one that came in from outside.
 * The development-only shortcuts (the /setup page, tool calls from /dev) rely on it, so that
 * opening a tunnel to a development copy does not open them to the internet.
 */

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const LOOPBACK = /^(127(\.\d{1,3}){3}|::1|::ffff:127(\.\d{1,3}){3})$/;
/** Headers that tunnels and proxies add. A request carrying one did not start on this computer. */
const TUNNEL_HEADERS = ['cf-connecting-ip', 'cf-ray', 'true-client-ip', 'fly-client-ip'];

/** The host a request was sent to, in lower case. */
export const requestHost = (headers: Headers) => (headers.get('host') ?? '').trim().toLowerCase();

/** True for a request that was made on this computer to localhost, and did not come in through a tunnel. */
export function isLocalRequest(headers: Headers): boolean {
  if (!LOCAL_HOST.test(requestHost(headers))) return false;
  const every = (name: string, ok: (part: string) => boolean) => {
    const value = headers.get(name);
    return !value || value.split(',').every((part) => ok(part.trim().toLowerCase()));
  };
  if (!every('x-forwarded-host', (p) => LOCAL_HOST.test(p))) return false;
  if (!every('x-forwarded-for', (p) => LOOPBACK.test(p))) return false;
  if (!every('x-real-ip', (p) => LOOPBACK.test(p))) return false;
  return !TUNNEL_HEADERS.some((name) => headers.has(name));
}
