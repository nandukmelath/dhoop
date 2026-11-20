'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AgoraRTC, {
  useRTCClient,
  useLocalMicrophoneTrack,
  useLocalCameraTrack,
  useRemoteUsers,
  useClientEvent,
  useJoin,
  usePublish,
  RemoteUser,
  UID,
} from 'agora-rtc-react';
import {
  AgoraVoiceAI,
  AgoraVoiceAIEvents,
  AgentState,
  ChatMessagePriority,
  ChatMessageType,
  MessageSalStatus,
  TranscriptHelperMode,
  type TranscriptHelperItem,
  type UserTranscription,
  type AgentTranscription,
} from 'agora-agent-client-toolkit';
import { SunMark, type SunState } from '@/components/dhoop/SunMark';
import { MicButtonWithVisualizer } from 'agora-agent-uikit/rtc';
import { DEFAULT_AGENT_UID } from '@/lib/agora';
import {
  getCurrentInProgressMessage,
  getMessageList,
  mapAgentVisualizerState,
  normalizeTimestampMs,
  normalizeTranscript,
} from '@/lib/conversation';
import { MicrophoneSelector } from './MicrophoneSelector';
import {
  getConversationIssueSeverity,
  type ConnectionIssue,
} from './ConversationErrorCard';
import { ConnectionStatusPanel } from './ConnectionStatusPanel';
import { QuickstartConversationLayout } from './QuickstartConversationLayout';
import {
  QuickstartPipelineMetrics,
  type QuickstartAgentMetric,
} from './QuickstartPipelineMetrics';
import { QuickstartTranscriptPanel } from './QuickstartTranscriptPanel';
import { quietLeft, quietLimits } from '@/lib/dhoop/quiet';
import type { ConversationComponentProps } from '@/types/conversation';

// Cap the displayed issues list to avoid overwhelming the UI during a cascade of errors.
const MAX_CONNECTION_ISSUES = 6;

type AgoraRtcWithParameters = typeof AgoraRTC & {
  setParameter?: (key: string, value: unknown) => void;
};

// Payload shape for signaling-level errors forwarded by the agent over RTM.
// The `module` field identifies which backend subsystem (LLM / ASR / TTS) raised the error.
type RtmMessageErrorPayload = {
  object: 'message.error';
  module?: string;
  code?: number;
  message?: string;
  send_ts?: number;
};

// Payload shape for SAL (Session Abstraction Layer) registration status messages.
// VP_REGISTER_FAIL and VP_REGISTER_DUPLICATE indicate RTM channel subscription problems.
type RtmSalStatusPayload = {
  object: 'message.sal_status';
  status?: string;
  timestamp?: number;
};

// Type guard for RTM signaling-level error payloads (object: 'message.error').
function isRtmMessageErrorPayload(
  value: unknown,
): value is RtmMessageErrorPayload {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { object?: unknown }).object === 'message.error'
  );
}

// Type guard for RTM SAL status payloads (object: 'message.sal_status').
function isRtmSalStatusPayload(value: unknown): value is RtmSalStatusPayload {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { object?: unknown }).object === 'message.sal_status'
  );
}

/**
 * Things a person can say to Dhoop, shown as buttons to tap. In English; Dhoop answers in the
 * language of the call. The order follows a conversation.
 */
const TRY_SAYING = [
  'My bill is 3,200 rupees a month',
  'Find my roof',
  'Add 300 square metres on the right',
  'Move the outline 3 metres up',
  'Not this building, the next one to the left',
  'Undo that',
  'What could my whole neighbourhood do?',
  'Play my solar story',
  'Find the best place for a 1 megawatt solar farm near here',
  'Which is better for solar, Kochi or Jaipur?',
  'Who installs solar in Jaipur?',
  'What about the monsoon?',
  'Can I run my AC on it right now?',
  'What will my roof make tomorrow?',
  'What does it save over 25 years?',
  'Show me the Vidhana Soudha in Bengaluru',
  'Can I get the subsidy?',
  'I cannot pay it all at once',
  'Carry on in Hindi',
];

export default function ConversationComponent({
  agoraData,
  rtmClient,
  onTokenWillExpire,
  onEndConversation,
  publishCamera = false,
  stage,
  headerExtras,
  pipelineLabels,
  restartCount = 0,
  nudge,
  onListeningFailed,
}: ConversationComponentProps) {
  const client = useRTCClient();
  // The engine's events are subscribed to once, so the newest callback is read from here.
  const listeningFailed = useRef(onListeningFailed);
  /** When the recogniser was last reported failed in this call. A restart within seconds of it is the recovery from it. */
  const listeningFailedAt = useRef(0);
  useEffect(() => {
    listeningFailed.current = onListeningFailed;
  });
  const remoteUsers = useRemoteUsers();
  const [isEnabled, setIsEnabled] = useState(true);
  const [isAgentConnected, setIsAgentConnected] = useState(false);
  const [isConnectionDetailsOpen, setIsConnectionDetailsOpen] = useState(false);

  // Tracks granular RTC connection state for the status dot.
  // Agora states: DISCONNECTED | CONNECTING | CONNECTED | DISCONNECTING | RECONNECTING
  const [connectionState, setConnectionState] = useState<string>('CONNECTING');
  const agentUID = String(DEFAULT_AGENT_UID);
  const [joinedUID, setJoinedUID] = useState<UID>(0);

  // Transcript + agent state — managed with AgoraVoiceAI (see effect below).
  const [rawTranscript, setRawTranscript] = useState<
    TranscriptHelperItem<Partial<UserTranscription | AgentTranscription>>[]
  >([]);
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const [agentMetrics, setAgentMetrics] = useState<QuickstartAgentMetric[]>([]);
  const [connectionIssues, setConnectionIssues] = useState<ConnectionIssue[]>(
    [],
  );
  // `quiet` is for a fault the app is already putting right by itself: it is kept in the list
  // for whoever looks, but the panel does not spring open over the screen for it.
  const addConnectionIssue = useCallback((issue: ConnectionIssue, quiet = false) => {
    if (!quiet) setIsConnectionDetailsOpen(true);
    setConnectionIssues((prev) => {
      const isDuplicate = prev.some(
        (x) =>
          x.agentUserId === issue.agentUserId &&
          x.code === issue.code &&
          x.message === issue.message &&
          Math.abs(x.timestamp - issue.timestamp) < 1500,
      );
      if (isDuplicate) return prev;
      return [issue, ...prev].slice(0, MAX_CONNECTION_ISSUES);
    });
  }, []);

  // StrictMode guard: delay `useJoin`'s ready flag until after the fake-unmount
  // cycle completes. React StrictMode fires cleanup synchronously before any
  // setTimeout callback, so the first (fake) mount's timeout is always cancelled.
  // Only the real second mount's timeout fires, meaning useJoin joins exactly once.
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(() => {
      if (!cancelled) setIsReady(true);
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
      setIsReady(false);
    };
  }, []);

  const { isConnected: joinSuccess } = useJoin(
    {
      appid: process.env.NEXT_PUBLIC_AGORA_APP_ID!,
      channel: agoraData.channel,
      token: agoraData.token,
      uid: parseInt(agoraData.uid, 10),
    },
    isReady,
  );

  // Create mic track only after the StrictMode fake-unmount cycle completes (isReady).
  // Passing `true` here creates two tracks in StrictMode — the first publishes, then
  // StrictMode cleanup closes it and the second takes over, causing a ~3s audio gap.
  // isReady uses the same setTimeout(fn,0) pattern as useJoin: StrictMode cleanup fires
  // synchronously before the timeout, so only the real second mount's timer fires.
  // Do NOT pass `isEnabled` — that ties track lifetime to mute state and breaks the Web Audio
  // graph inside MicButtonWithVisualizer. Mute uses track.setEnabled() only.
  // micError is set when the browser refuses or has no microphone. The agent can still be
  // heard then, but it cannot hear the person, so the screen must say so.
  const { localMicrophoneTrack, error: micError } = useLocalMicrophoneTrack(isReady);

  // Dhoop: publish the camera too, so the managed model can see a bill or a roof.
  // Same isReady gate as the mic, for the same StrictMode reason. A refused camera
  // permission leaves the track null and the conversation carries on by voice.
  const { localCameraTrack } = useLocalCameraTrack(isReady && publishCamera);
  // Bumped after switching cameras, because the track object stays the same while its
  // underlying media track changes.
  const [cameraVersion, setCameraVersion] = useState(0);
  const cameraMediaTrack = useMemo(
    () => (localCameraTrack ? localCameraTrack.getMediaStreamTrack() : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [localCameraTrack, cameraVersion],
  );
  // Move to the next camera, for example from the laptop's own to one pointed at the roof.
  const handleSwitchCamera = useCallback(async () => {
    if (!localCameraTrack) return;
    try {
      const cameras = await AgoraRTC.getCameras();
      if (cameras.length < 2) return;
      const currentId = localCameraTrack.getMediaStreamTrack().getSettings().deviceId;
      const index = cameras.findIndex((c) => c.deviceId === currentId);
      const next = cameras[(index + 1) % cameras.length];
      await localCameraTrack.setDevice(next.deviceId);
      setCameraVersion((v) => v + 1);
    } catch (error) {
      console.error('Failed to switch camera:', error);
    }
  }, [localCameraTrack]);

  // ENABLE_AUDIO_PTS is a module-level SDK parameter (not on the client instance).
  // It must be set before publishing audio for transcript timing to be accurate.
  useEffect(() => {
    if (!client) return;
    try {
      (AgoraRTC as AgoraRtcWithParameters).setParameter?.(
        'ENABLE_AUDIO_PTS',
        true,
      );
    } catch (error) {
      console.warn('Could not set ENABLE_AUDIO_PTS:', error);
    }
  }, [client]);

  // Track the auto-assigned RTC UID for token renewal and agent invite.
  useEffect(() => {
    if (joinSuccess && client) {
      const uid = client.uid;
      if (uid !== null && uid !== undefined) {
        setJoinedUID(uid);
      }
    }
  }, [joinSuccess, client]);

  // Initialize AgoraVoiceAI once the channel is joined.
  //
  // Gating on `isReady && joinSuccess` is critical for StrictMode safety:
  //   - `isReady` ensures we are past the initial fake-unmount cycle, so this
  //     effect only runs on the real mount (not the discarded fake one).
  //   - Once `isReady` is true, React does NOT double-invoke this effect for
  //     subsequent state changes (`joinSuccess` becoming true). That means
  //     AgoraVoiceAI.init() is called exactly once.
  useEffect(() => {
    if (!isReady || !joinSuccess) return;

    let cancelled = false;

    (async () => {
      try {
        const ai = await AgoraVoiceAI.init({
          rtcEngine: client,
          rtmEngine: rtmClient,
          renderMode: TranscriptHelperMode.TEXT,
          enableLog: true,
        });

        if (cancelled) {
          try {
            if (AgoraVoiceAI.getInstance() === ai) {
              // Tear down only the instance created by this effect run.
              ai.unsubscribe();
              ai.destroy();
            }
          } catch {}
          return;
        }

        ai.on(AgoraVoiceAIEvents.TRANSCRIPT_UPDATED, (t) => {
          setRawTranscript([...t]);
        });
        // Agent state drives the visualizer, independent of RTC audio presence.
        ai.on(AgoraVoiceAIEvents.AGENT_STATE_CHANGED, (_, event) =>
          setAgentState(event.state),
        );
        ai.on(AgoraVoiceAIEvents.AGENT_METRICS, (_, metrics) => {
          setAgentMetrics((prev) => [...prev, metrics].slice(-8));
        });
        ai.on(AgoraVoiceAIEvents.MESSAGE_ERROR, (agentUserId, error) => {
          addConnectionIssue({
            id: `${Date.now()}-${agentUserId}-message-error-${error.code}`,
            source: 'rtm',
            agentUserId,
            code: error.code,
            message: error.message,
            timestamp: normalizeTimestampMs(error.timestamp),
          });
        });
        // SAL status: capture raw RTM messages so message.sal_status surfaces even if higher-level events don't.
        ai.on(
          AgoraVoiceAIEvents.MESSAGE_SAL_STATUS,
          (agentUserId, salStatus) => {
            if (
              salStatus.status === MessageSalStatus.VP_REGISTER_FAIL ||
              salStatus.status === MessageSalStatus.VP_REGISTER_DUPLICATE
            ) {
              addConnectionIssue({
                id: `${Date.now()}-${agentUserId}-sal-${salStatus.status}`,
                source: 'rtm',
                agentUserId,
                code: salStatus.status,
                message: `SAL status: ${salStatus.status}`,
                timestamp: normalizeTimestampMs(salStatus.timestamp),
              });
            }
          },
        );
        // Agent error: capture raw RTM messages so message.error surfaces even if higher-level events don't.
        ai.on(AgoraVoiceAIEvents.AGENT_ERROR, (agentUserId, error) => {
          // The card on screen is short. The whole error goes to the console, for whoever is finding the fault.
          console.warn('Dhoop agent error', JSON.stringify(error));
          // A failed recogniser hears nothing for the rest of the call, and typed messages stall too.
          // The app restarts it once in the plain setup, which has never failed.
          const recovering = String(error.type) === 'asr';
          if (recovering) {
            listeningFailedAt.current = Date.now();
            listeningFailed.current?.();
          }
          addConnectionIssue(
            {
              id: `${Date.now()}-${agentUserId}-agent-error-${error.code}`,
              source: 'agent',
              agentUserId,
              code: error.code,
              message: `${error.type}: ${error.message}`,
              timestamp: normalizeTimestampMs(error.timestamp),
            },
            recovering,
          );
        });
        // subscribeMessage binds the toolkit to both RTC stream messages and RTM payloads.
        ai.subscribeMessage(agoraData.channel);
      } catch (error) {
        if (!cancelled) {
          console.error('[AgoraVoiceAI] init failed:', error);
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        const ai = AgoraVoiceAI.getInstance();
        if (ai) {
          ai.unsubscribe();
          ai.destroy();
        }
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, joinSuccess]);

  // Raw RTM parsing is kept as a fallback for signaling-level errors and SAL status.
  useEffect(() => {
    const handleRtmMessage = (event: {
      message: string | Uint8Array;
      publisher: string;
    }) => {
      const payloadText =
        typeof event.message === 'string'
          ? event.message
          : new TextDecoder().decode(event.message);

      let parsed: unknown;
      try {
        parsed = JSON.parse(payloadText);
      } catch {
        return;
      }

      if (isRtmMessageErrorPayload(parsed)) {
        const p = parsed;
        addConnectionIssue({
          id: `${Date.now()}-${event.publisher}-rtm-msg-error-${p.code ?? 'unknown'}`,
          source: 'rtm-signaling',
          agentUserId: event.publisher,
          code: p.code ?? 'unknown',
          message: `${p.module ?? 'unknown'}: ${p.message ?? 'Unknown signaling error'}`,
          timestamp: normalizeTimestampMs(p.send_ts ?? Date.now()),
        });
        return;
      }

      if (isRtmSalStatusPayload(parsed)) {
        const p = parsed;
        if (
          p.status === 'VP_REGISTER_FAIL' ||
          p.status === 'VP_REGISTER_DUPLICATE'
        ) {
          addConnectionIssue({
            id: `${Date.now()}-${event.publisher}-rtm-sal-${p.status}`,
            source: 'rtm-signaling',
            agentUserId: event.publisher,
            code: p.status,
            message: `SAL status: ${p.status}`,
            timestamp: normalizeTimestampMs(p.timestamp ?? Date.now()),
          });
        }
      }
    };

    rtmClient.addEventListener('message', handleRtmMessage);
    return () => {
      rtmClient.removeEventListener('message', handleRtmMessage);
    };
  }, [rtmClient, addConnectionIssue]);

  // The toolkit uses uid="0" for local user speech — remap to actual RTC UID
  // so the transcript panel renders user messages on the correct side.
  // Also normalize punctuation spacing for display when upstream text arrives compacted.
  const transcript = useMemo(() => {
    return normalizeTranscript(rawTranscript, String(client.uid));
  }, [rawTranscript, client.uid]);

  // Completed (END + INTERRUPTED) messages shown as history.
  // INTERRUPTED must be included — if the agent's first turn is cut off,
  // messageList stays empty and the first interrupted turn is never shown.
  // The toolkit numbers turns per agent. When the agent is restarted inside a call (a language
  // change), the new agent's turns reuse the old numbers and overwrite the old lines on screen.
  // So at each restart the lines shown so far are set aside, and whatever the toolkit still
  // holds from before the restart is not shown a second time.
  const [archived, setArchived] = useState<ReturnType<typeof getMessageList>>([]);
  const liveMessages = useMemo(() => {
    const keyOf = (m: { uid: number; turn_id?: string | number; createdAt?: number }) => `${m.uid}|${m.turn_id}|${m.createdAt}`;
    const kept = new Set(archived.map(keyOf));
    // What the screen tells the agent on the person's behalf (a nudge: a whole line in round
    // brackets, sent as if typed) is not something the person said, and is not shown as if it were.
    const isNudge = (m: { uid: number | string; text?: string }) => String(m.uid) !== agentUID && /^\s*\([\s\S]*\)\s*$/.test(m.text ?? '');
    return getMessageList(transcript).filter((m) => !kept.has(keyOf(m)) && !isNudge(m));
  }, [transcript, archived, agentUID]);
  // Adjusting state when a prop changes, the way React's documentation describes it.
  const [seenRestart, setSeenRestart] = useState(restartCount);
  if (restartCount !== seenRestart) {
    setSeenRestart(restartCount);
    setArchived((old) => [...old, ...liveMessages]);
    // A new agent has taken the seat. The one before it took its faults with it.
    setConnectionIssues([]);
    setIsConnectionDetailsOpen(false);
  }
  const messageList = useMemo(() => [...archived, ...liveMessages], [archived, liveMessages]);

  const currentInProgressMessage = useMemo(() => {
    // The live partial turn renders separately from the completed history list.
    return getCurrentInProgressMessage(transcript);
  }, [transcript]);
  // The turns the agent has begun since it took the seat, by the numbers the toolkit gives them,
  // the one in progress included. (Lines set aside at a restart are left out: a new agent's
  // turns reuse the old numbers.)
  const agentTurnIds = useMemo(() => {
    const ids = liveMessages.filter((m) => String(m.uid) === agentUID).map((m) => String(m.turn_id));
    if (currentInProgressMessage && String(currentInProgressMessage.uid) === agentUID) ids.push(String(currentInProgressMessage.turn_id));
    return [...new Set(ids)].sort().join(',');
  }, [liveMessages, currentInProgressMessage, agentUID]);
  const agentTurns = useRef('');

  // Publish local mic once the track exists; usePublish waits for RTC connection.
  usePublish([localMicrophoneTrack, localCameraTrack]);

  useClientEvent(client, 'user-joined', (user) => {
    if (user.uid.toString() === agentUID) setIsAgentConnected(true);
  });

  // For saying a lost line again (see `owed` below): whether the agent has left since it was lost.
  const agentLeft = useRef(false);
  useClientEvent(client, 'user-left', (user) => {
    if (user.uid.toString() === agentUID) {
      setIsAgentConnected(false);
      agentLeft.current = true;
    }
  });

  // Sync isAgentConnected with remoteUsers (covers cases where user-joined/left are missed)
  useEffect(() => {
    const isAgentInRemoteUsers = remoteUsers.some(
      (user) => user.uid.toString() === agentUID,
    );
    setIsAgentConnected(isAgentInRemoteUsers);
  }, [remoteUsers, agentUID]);

  useClientEvent(client, 'connection-state-change', (curState) => {
    setConnectionState(curState);
  });

  const connectionSeverity = useMemo<'normal' | 'warning' | 'error'>(() => {
    // RTC transport problems take precedence; otherwise derive severity from captured issues.
    if (
      connectionState === 'DISCONNECTED' ||
      connectionState === 'DISCONNECTING'
    ) {
      return 'error';
    }
    if (
      connectionState === 'CONNECTING' ||
      connectionState === 'RECONNECTING'
    ) {
      return 'warning';
    }
    if (connectionIssues.length === 0) {
      return 'normal';
    }
    return connectionIssues.some(
      (issue) => getConversationIssueSeverity(issue) === 'error',
    )
      ? 'error'
      : 'warning';
  }, [connectionState, connectionIssues]);

  const visualizerState = useMemo(
    () =>
      mapAgentVisualizerState(agentState, isAgentConnected, connectionState),
    [agentState, isAgentConnected, connectionState],
  );

  /**
   * Mute/unmute via track.setEnabled() only — usePublish owns publish state.
   * If we also unpublish in the toggle, usePublish and the button fight each other
   * and break the MicButtonWithVisualizer Web Audio graph.
   */
  // Loud room: the microphone stays shut except while the space bar or the button is held.
  // The neighbours are then not taken for the caller, and cannot interrupt Dhoop.
  const [holdToTalk, setHoldToTalk] = useState(() => {
    try {
      return typeof window !== 'undefined' && window.localStorage.getItem('dhoop.holdToTalk') === '1';
    } catch {
      return false;
    }
  });
  const [holding, setHolding] = useState(false);
  const letGoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hold = useCallback(() => {
    clearTimeout(letGoTimer.current);
    setHolding(true);
  }, []);
  // The microphone stays open a moment after letting go, or the last syllable is cut off.
  const letGo = useCallback(() => {
    clearTimeout(letGoTimer.current);
    letGoTimer.current = setTimeout(() => setHolding(false), 450);
  }, []);
  // While the solar story is playing over the screen, its narrator must not be taken for the
  // person talking. The film says when it starts and stops.
  const [storyPlaying, setStoryPlaying] = useState(false);
  useEffect(() => {
    const onStory = (event: Event) => setStoryPlaying((event as CustomEvent<boolean>).detail === true);
    window.addEventListener('dhoop:story', onStory);
    return () => window.removeEventListener('dhoop:story', onStory);
  }, []);
  useEffect(() => {
    // The sound is turned down to nothing, not cut off. With the track muted no sound reaches
    // Agora at all, and its recogniser then reports that it has failed, every ten seconds.
    try {
      localMicrophoneTrack?.setVolume((holdToTalk && !holding) || storyPlaying ? 0 : 100);
    } catch {
      // The track is closing.
    }
  }, [localMicrophoneTrack, holdToTalk, holding, storyPlaying]);
  useEffect(() => {
    if (!holdToTalk) return;
    const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || typing(event.target)) return;
      event.preventDefault();
      hold();
    };
    const up = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || typing(event.target)) return;
      event.preventDefault();
      letGo();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      clearTimeout(letGoTimer.current);
    };
  }, [holdToTalk, hold, letGo]);

  const handleMicToggle = useCallback(async () => {
    const next = !isEnabled;
    const track = localMicrophoneTrack;
    if (!track) {
      setIsEnabled(next);
      return;
    }
    try {
      await track.setEnabled(next);
      setIsEnabled(next);
    } catch (error) {
      console.error('Failed to toggle microphone:', error);
    }
  }, [isEnabled, localMicrophoneTrack]);

  const handleTokenWillExpire = useCallback(async () => {
    if (!onTokenWillExpire || !joinedUID) return;
    try {
      // RTC and RTM renew independently, but the quickstart fetches both in one request.
      const { rtcToken, rtmToken } = await onTokenWillExpire(
        joinedUID.toString(),
      );
      await client?.renewToken(rtcToken);
      await rtmClient.renewToken(rtmToken);
    } catch (error) {
      console.error('Failed to renew Agora token:', error);
    }
  }, [client, onTokenWillExpire, joinedUID, rtmClient]);

  useClientEvent(client, 'token-privilege-will-expire', handleTokenWillExpire);

  const handleEndConversation = useCallback(async () => {
    onEndConversation();
  }, [onEndConversation]);

  // Call time is not free, and an agent in a call that nobody is using still counts: for up to
  // an hour, a fifth of the whole free allowance. So a call in which nobody has spoken, typed,
  // tapped or pressed a key for four minutes ends itself, after half a minute's warning.
  // Carrying on afterwards picks the conversation up where it stopped.
  const quiet = useMemo(() => quietLimits(typeof window === 'undefined' ? '' : window.location.search), []);
  // Set when the call screen first appears (the effect below), not while it is being drawn.
  const lastActive = useRef(0);
  const [endingIn, setEndingIn] = useState<number | null>(null);
  const stillHere = useCallback(() => {
    lastActive.current = Date.now();
    setEndingIn(null);
  }, []);
  // Anything said, by either side, is the call being used.
  useEffect(() => {
    stillHere();
  }, [transcript, stillHere]);
  useEffect(() => {
    window.addEventListener('pointerdown', stillHere);
    window.addEventListener('keydown', stillHere);
    return () => {
      window.removeEventListener('pointerdown', stillHere);
      window.removeEventListener('keydown', stillHere);
    };
  }, [stillHere]);
  const endCall = useRef(handleEndConversation);
  useEffect(() => {
    endCall.current = handleEndConversation;
  });
  useEffect(() => {
    if (!Number.isFinite(quiet.afterMs)) return;
    const watch = setInterval(() => {
      if (!lastActive.current) lastActive.current = Date.now();
      const left = quietLeft(Date.now() - lastActive.current, quiet);
      if (left === 0) {
        clearInterval(watch);
        try {
          window.sessionStorage.setItem('dhoop.endedQuiet', '1');
        } catch {
          // A private window. The start page then simply does not say why the call ended.
        }
        void endCall.current();
      } else setEndingIn(left);
    }, 1000);
    return () => clearInterval(watch);
  }, [quiet]);

  // What the screen tells the agent on the person's behalf (see `nudge` in the props). It is
  // sent once the agent is in the call, and queued behind whatever the agent is saying, so a
  // location arriving mid-greeting does not cut the greeting off.
  const sentNudge = useRef(0);
  useEffect(() => {
    if (!nudge || nudge.id === sentNudge.current || !isAgentConnected) return;
    let tries = 0;
    const attempt = () => {
      let ai: ReturnType<typeof AgoraVoiceAI.getInstance> | null = null;
      try {
        ai = AgoraVoiceAI.getInstance();
      } catch {
        /* the toolkit is not ready yet */
      }
      if (!ai) return ++tries < 15;
      sentNudge.current = nudge.id;
      ai.sendText(agentUID, {
        messageType: ChatMessageType.TEXT,
        priority: ChatMessagePriority.APPEND,
        responseInterruptable: true,
        text: nudge.text,
      }).catch((error) => console.error('Could not tell the agent:', error));
      return false;
    };
    if (!attempt()) return;
    const timer = setInterval(() => {
      if (!attempt()) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [nudge, isAgentConnected, agentUID]);

  // Typing instead of talking: for a loud hall, a blocked microphone, or a quiet check.
  // The text goes to the agent over RTM and is treated like something the person said.
  const [typed, setTyped] = useState('');
  const [typedBusy, setTypedBusy] = useState(false);
  // A typed or tapped line that the agent never picked up, and the one owed to its successor.
  // With a failed recogniser Agora's engine answers nothing, typed lines included, until the
  // app has brought a new agent in (`recoverListening` in DhoopApp.tsx). A tap in those seconds
  // was simply lost, twice in three calls on the evening this was written. So a line the agent
  // never went on to think about or answer is said again to the agent that replaces it.
  const unanswered = useRef<{ text: string; at: number; turns: string } | null>(null);
  const owed = useRef<string | null>(null);
  /** Put words to the agent as if the person had said them. True when they went. */
  const say = useCallback(
    async (text: string): Promise<boolean> => {
      try {
        await AgoraVoiceAI.getInstance()?.sendText(agentUID, {
          messageType: ChatMessageType.TEXT,
          priority: ChatMessagePriority.INTERRUPTED,
          responseInterruptable: true,
          text,
        });
        unanswered.current = { text, at: Date.now(), turns: agentTurns.current };
        console.info('[dhoop] typed line sent');
        return true;
      } catch (error) {
        console.error('Could not send the message:', error);
        return false;
      }
    },
    [agentUID],
  );
  const sendTyped = useCallback(async () => {
    const text = typed.trim();
    if (!text || typedBusy) return;
    setTypedBusy(true);
    if (await say(text)) setTyped('');
    setTypedBusy(false);
  }, [typed, typedBusy, say]);
  // Things to try, one tap each: for someone who does not know what Dhoop can do, and for a
  // hall too loud to be heard in. A tap is sent like a typed line.
  const tapToSay = useCallback(
    async (text: string) => {
      if (typedBusy) return;
      setTypedBusy(true);
      await say(text);
      setTypedBusy(false);
    },
    [typedBusy, say],
  );

  // The agent has begun a turn of its own since the line was sent: the line was answered. Only
  // that counts. The agent's state does not: in a real call, with the recogniser failed, the
  // state still moved after a typed line that was never answered, the line was taken for
  // answered, and it was not said again. A turn is told by its number, not by how many there
  // are, because a greeting cut short moves from one list to another on the way.
  useEffect(() => {
    agentTurns.current = agentTurnIds;
    const sent = unanswered.current;
    if (!sent) return;
    const had = new Set(sent.turns.split(','));
    if (agentTurnIds.split(',').some((id) => id && !had.has(id))) {
      unanswered.current = null;
      console.info('[dhoop] typed line answered');
    }
  }, [agentTurnIds]);
  // A new agent is taking the seat. A line the old one never answered is owed to it, when the
  // old one is leaving because its recogniser failed (reported in the last twenty seconds) and
  // the line is under three quarters of a minute old. A change of language owes nothing: there
  // the agent was working, and saying "add 300 square metres" a second time would be far worse
  // than losing a tap.
  const restartSeen = useRef(restartCount);
  useEffect(() => {
    if (restartCount === restartSeen.current) return;
    restartSeen.current = restartCount;
    const lost = unanswered.current;
    unanswered.current = null;
    const now = Date.now();
    const recovering = now - listeningFailedAt.current < 20_000;
    owed.current = lost && recovering && now - lost.at < 45_000 ? lost.text : null;
    agentLeft.current = false;
    console.info(`[dhoop] agent restarting: line unanswered ${lost ? 'yes' : 'no'}, after a failed recogniser ${recovering ? 'yes' : 'no'}, owed ${owed.current ? 'yes' : 'no'}`);
    const text = owed.current;
    if (!text) return;
    // It is said three seconds after the new agent joins (below). Should its joining go unseen,
    // it is said twelve seconds from now all the same.
    const byTheClock = setTimeout(() => {
      if (owed.current !== text) return;
      owed.current = null;
      console.info('[dhoop] saying the lost line again, by the clock');
      void say(text);
    }, 12_000);
    return () => clearTimeout(byTheClock);
  }, [restartCount, say]);
  // The new agent is in the call: after the three seconds in which words are still lost, say it.
  useEffect(() => {
    if (!isAgentConnected || !owed.current || !agentLeft.current) return;
    const text = owed.current;
    const timer = setTimeout(() => {
      if (owed.current !== text) return;
      owed.current = null;
      console.info('[dhoop] saying the lost line again');
      void say(text);
    }, 3000);
    return () => clearTimeout(timer);
  }, [isAgentConnected, restartCount, say]);

  // Agora's engine says what the agent is doing; the sun shows it.
  const sunState: SunState =
    visualizerState === 'talking' ? 'speaking' : visualizerState === 'analyzing' ? 'thinking' : visualizerState === 'listening' ? 'listening' : visualizerState === 'ambient' ? 'idle' : 'off';
  const sunLabel = { speaking: 'Speaking', thinking: 'Thinking', listening: 'Listening', idle: 'Ready', off: 'Connecting' }[sunState];
  const lastLine = currentInProgressMessage ?? messageList[messageList.length - 1];

  return (
    <>
      {endingIn !== null && (
        <div role="alert" className="fixed left-1/2 top-20 z-[3000] w-[min(92vw,27rem)] -translate-x-1/2 rounded-md border-2 border-foreground bg-primary px-4 py-3 text-center text-sm font-bold shadow-[4px_4px_0_0_hsl(var(--foreground))]">
          Nobody has spoken for a while. This call ends in {endingIn} seconds to save call time. Say something, or tap anywhere, to keep it going.
        </div>
      )}
    <QuickstartConversationLayout
      caption={
        <p className="line-clamp-2 text-sm leading-snug">
          {lastLine?.text ? (
            <>
              <span className="label-caps mr-1.5">{String(lastLine.uid) === agentUID ? 'Dhoop' : 'You'}</span>
              {lastLine.text}
            </>
          ) : (
            <span className="text-muted-foreground">{sunLabel}. Say your monthly bill, or ask about the subsidy.</span>
          )}
        </p>
      }
      stage={stage ? stage({ cameraTrack: cameraMediaTrack }) : null}
      headerExtras={headerExtras}
      statusPanel={
        <ConnectionStatusPanel
          connectionState={connectionState}
          connectionSeverity={connectionSeverity}
          connectionIssues={connectionIssues}
          isOpen={isConnectionDetailsOpen}
          onToggle={() => setIsConnectionDetailsOpen((open) => !open)}
        />
      }
      pipelineMetrics={<QuickstartPipelineMetrics metrics={agentMetrics} labels={pipelineLabels} />}
      transcriptPanel={
        <QuickstartTranscriptPanel
          messageList={messageList}
          currentInProgressMessage={currentInProgressMessage}
          agentUID={agentUID}
        />
      }
      visualizer={
        <div className="flex items-center gap-2 lg:flex-col lg:py-3" role="region" aria-label="AI agent status visualization">
          <SunMark state={sunState} className="h-12 w-12 lg:h-32 lg:w-32" />
          <span className="label-caps max-lg:hidden" aria-live="polite">
            {sunLabel}
          </span>
          {/* Not seen, but needed: this is what plays the agent's voice. */}
          {remoteUsers.map((user) => (
            <div key={user.uid} className="hidden">
              <RemoteUser user={user} />
            </div>
          ))}
        </div>
      }
      controls={
        <div className="flex flex-col items-stretch gap-2">
        {micError && (
          <p role="alert" className="w-full rounded-md border border-destructive/60 bg-destructive/10 px-3 py-2 text-center text-sm font-medium text-destructive">
            Dhoop cannot hear you: this browser has blocked the microphone, or has none. Allow the microphone for this page, then end and start again.
          </p>
        )}
        <div
          className="mx-auto flex w-fit items-center gap-3"
          role="group"
          aria-label="Audio controls"
        >
          <div className="conversation-mic-host flex items-center justify-center">
            <MicButtonWithVisualizer
              isEnabled={isEnabled}
              setIsEnabled={setIsEnabled}
              track={localMicrophoneTrack}
              onToggle={handleMicToggle}
              className="overflow-visible"
              aria-label={isEnabled ? 'Mute microphone' : 'Unmute microphone'}
              enabledColor="hsl(var(--primary))"
              disabledColor="hsl(var(--destructive))"
            />
          </div>
          <MicrophoneSelector localMicrophoneTrack={localMicrophoneTrack} />
          {localCameraTrack && (
            <button
              type="button"
              onClick={handleSwitchCamera}
              className="rounded-md border-2 border-foreground/70 px-3 py-1 text-xs font-semibold text-foreground"
              title="Use the next camera"
            >
              Switch camera
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <label className="flex items-center gap-2 max-lg:group-data-[open=false]:hidden">
            <input
              type="checkbox"
              checked={holdToTalk}
              onChange={(event) => {
                setHoldToTalk(event.target.checked);
                setHolding(false);
                try {
                  window.localStorage.setItem('dhoop.holdToTalk', event.target.checked ? '1' : '0');
                } catch {
                  // The choice lasts for this call only.
                }
              }}
            />
            Loud room: hold to talk
          </label>
          {holdToTalk && (
            <button
              type="button"
              onPointerDown={hold}
              onPointerUp={letGo}
              onPointerLeave={letGo}
              onPointerCancel={letGo}
              aria-pressed={holding}
              className={`select-none touch-none rounded-md border-2 border-foreground px-4 py-2 text-sm font-bold ${holding ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground'}`}
            >
              {holding ? 'Listening…' : 'Hold here, or the space bar, and speak'}
            </button>
          )}
        </div>
        <div className="flex w-full items-center gap-1.5 max-lg:overflow-x-auto max-lg:group-data-[open=false]:hidden lg:max-h-[6.5rem] lg:flex-wrap lg:overflow-y-auto" role="group" aria-label="Things to try saying">
          <span className="label-caps shrink-0">Try</span>
          {TRY_SAYING.map((line) => (
            <button
              key={line}
              type="button"
              // Not before Dhoop has joined the call: words sent into an empty room are lost.
              disabled={typedBusy || !isAgentConnected}
              onClick={() => void tapToSay(line)}
              className="shrink-0 rounded-full border border-foreground/40 bg-background px-2.5 py-1 text-left text-xs font-medium text-foreground hover:bg-primary disabled:opacity-50"
            >
              {line}
            </button>
          ))}
        </div>
        <form
          className="flex w-full items-center gap-2 max-lg:group-data-[open=false]:hidden"
          onSubmit={(event) => {
            event.preventDefault();
            void sendTyped();
          }}
        >
          <input
            type="text"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="Or type to Dhoop"
            aria-label="Type a message to Dhoop"
            maxLength={300}
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={typedBusy || !typed.trim()}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
          >
            Send
          </button>
        </form>
        </div>
      }
      onEndConversation={handleEndConversation}
    />
    </>
  );
}
