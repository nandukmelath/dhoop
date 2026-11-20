/**
 * Prints the exact settings Dhoop would send to Agora to start an agent, without
 * contacting Agora. Uses made-up credentials, so it is safe to run and to share.
 * Run with: npm run show:agent -- kn     (language: en, hi or kn)
 */
import { AgoraClient, Area } from 'agora-agents';
import { buildAgent } from '../lib/dhoop/agent';
import { isLang } from '../lib/dhoop/config';

const lang = isLang(process.argv[2]) ? process.argv[2] : 'en';
const client = new AgoraClient({ area: Area.US, appId: '0'.repeat(32), appCertificate: '1'.repeat(32) });
const { agent, toolsOn, voice } = buildAgent({
  client,
  lang,
  sid: 'example-session',
  cameraOn: true,
  resume: false,
  toolsBase: 'https://example.test',
  toolSecret: 'example-secret',
  murfKey: 'example-murf-key',
});

const properties = agent.toProperties({ channel: 'example-channel', agentUid: '123456', remoteUids: ['1001'], idleTimeout: 120, token: 'example-token' });

// Shorten the long parts so the shape is easy to read.
const view = JSON.parse(JSON.stringify(properties)) as Record<string, any>;
const sys = view.llm?.system_messages?.[0];
if (sys?.content) sys.content = `${String(sys.content).slice(0, 160)}… (${String(sys.content).length} characters)`;
if (Array.isArray(view.llm?.tools)) {
  view.llm.tools = view.llm.tools.map((t: any) => ({ name: t.function?.name, method: t.server?.method, url: t.server?.url, body: t.server?.body, headers: Object.keys(t.server?.headers ?? {}) }));
}
console.log(JSON.stringify({ lang, toolsOn, voice, properties: view }, null, 2));
