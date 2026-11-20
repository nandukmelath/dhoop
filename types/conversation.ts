import type { ReactNode } from 'react';
import type { RTMClient } from 'agora-rtm';

export interface AgoraTokenData {
  token: string;
  uid: string;
  channel: string;
  agentId?: string;
}

export interface ClientStartRequest {
  requester_id: string;
  channel_name: string;
  /** Conversation language: 'en', 'hi' or 'kn'. Defaults to English. */
  lang?: string;
  /** Let the agent see the published camera. Defaults to true. */
  camera?: boolean;
  /** Session id shared by tools and screens. Defaults to the channel name. */
  sid?: string;
  /** True when the agent is being restarted mid-conversation, for example to change language. */
  resume?: boolean;
  /** True when the person has come back in a later call and wants to carry on from the earlier one. */
  returning?: boolean;
  /** True after the recogniser has failed in this call: start again with the plain setup, without the list of names. */
  plain_listening?: boolean;
  /** True when the agent is being replaced because its speech recognition failed in this call. */
  listening_failed?: boolean;
  /** A listening setup to try, for tests. Ignored in a production build. */
  stt?: string;
}

export interface StopConversationRequest {
  agent_id: string;
}

/** Names of the three services behind the agent, as the server configured them. Shown on screen. */
export interface PipelineLabels {
  stt: string;
  llm: string;
  tts: string;
}

export interface AgentResponse {
  agent_id: string;
  create_ts: number;
  state: string;
  /** What is really listening, thinking and speaking in this session. */
  pipeline?: PipelineLabels;
  /** Whether the agent could be given its tools (needs a public address). */
  tools_on?: boolean;
  /** 'murf' when Murf Falcon is speaking, 'default' when the Murf key is missing. */
  voice?: 'murf' | 'default';
  camera?: boolean;
  lang?: string;
}

export interface AgoraRenewalTokens {
  rtcToken: string;
  rtmToken: string;
}

export interface ConversationComponentProps {
  agoraData: AgoraTokenData;
  rtmClient: RTMClient;
  onTokenWillExpire: (uid: string) => Promise<AgoraRenewalTokens>;
  onEndConversation: () => void;
  /** Publish the camera so the agent can see. */
  publishCamera?: boolean;
  /** The big-screen content shown beside the transcript. Receives the camera's media track, if any. */
  stage?: (ctx: { cameraTrack: MediaStreamTrack | null }) => ReactNode;
  /** Extra controls shown in the header, such as the language chips. */
  headerExtras?: ReactNode;
  /** The services named in the header, from the server's answer when the agent started. */
  pipelineLabels?: PipelineLabels;
  /** Goes up by one each time the agent is restarted in the same call, such as on a language change. */
  restartCount?: number;
  /**
   * Something the screen tells the agent on the person's behalf, such as "this device has shared
   * its location". A new id means a new message. It is sent once the agent is in the call, and
   * waits its turn behind whatever the agent is saying.
   */
  nudge?: { id: number; text: string };
  /** Called when the engine reports that its speech recogniser has failed. */
  onListeningFailed?: () => void;
}
