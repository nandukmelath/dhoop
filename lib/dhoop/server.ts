import { AgoraClient, Area, generateConvoAIToken } from 'agora-agents';

/** Server-only helpers shared by the API routes. */

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/** Agora region for the agent service. US matches Agora's starter; set AGORA_AREA=AP or EU to change it. */
export function agoraArea() {
  const a = (process.env.AGORA_AREA ?? 'US').toUpperCase();
  return a === 'AP' ? Area.AP : a === 'EU' ? Area.EU : Area.US;
}

export function agoraClient() {
  return new AgoraClient({
    area: agoraArea(),
    appId: requireEnv('NEXT_PUBLIC_AGORA_APP_ID'),
    appCertificate: requireEnv('NEXT_AGORA_APP_CERTIFICATE'),
  });
}

/**
 * Sign-in for calls made straight on `client.agents` (speak, get, list and so on): pass it as
 * the second argument. The SDK signs only what an AgentSession does, and its own stopAgent().
 * A direct call without this is refused with "Invalid authentication type".
 */
export function agoraAuth(): { headers: { Authorization: string } } {
  const token = generateConvoAIToken({
    appId: requireEnv('NEXT_PUBLIC_AGORA_APP_ID'),
    appCertificate: requireEnv('NEXT_AGORA_APP_CERTIFICATE'),
    // The token proves who is calling; these calls name their agent in the request itself.
    // The SDK's stopAgent() signs the same way, with a fixed channel name and uid 0.
    channelName: 'dhoop',
    uid: 0,
  });
  return { headers: { Authorization: `agora token=${token}` } };
}

/**
 * The address Agora's cloud uses to reach this app's tool endpoints. It must be public
 * HTTPS (a deployment or a tunnel). Without it the agent still talks but cannot use tools.
 */
export function publicBaseUrl(): string | undefined {
  const explicit = process.env.PUBLIC_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  // Hosts that say what address they gave the app: Render, then Vercel.
  const render = process.env.RENDER_EXTERNAL_URL?.trim() || (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME.trim()}` : '');
  if (render) return render.replace(/\/+$/, '');
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return vercel ? `https://${vercel}` : undefined;
}

const g = globalThis as unknown as { __dhoopSecret?: string };

/** Shared secret that Agora sends with every tool call, so strangers cannot call the tools. */
export function toolSecret(): string {
  if (process.env.DHOOP_TOOL_SECRET) return process.env.DHOOP_TOOL_SECRET;
  if (!g.__dhoopSecret) g.__dhoopSecret = `dev-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  return g.__dhoopSecret;
}

export function isToolCallAllowed(request: Request): boolean {
  const got = request.headers.get('x-dhoop-key');
  return !!got && got === toolSecret();
}
