'use client';

import { useEffect, useMemo, useRef } from 'react';

type TranscriptMessage = {
  turn_id?: string | number;
  uid: number;
  text?: string;
  createdAt?: number;
};

type QuickstartTranscriptPanelProps = {
  messageList: TranscriptMessage[];
  currentInProgressMessage: TranscriptMessage | null;
  agentUID: string;
};

function formatMessageTime(createdAt?: number) {
  if (!createdAt) return null;
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(createdAt));
}

export function QuickstartTranscriptPanel({
  messageList,
  currentInProgressMessage,
  agentUID,
}: QuickstartTranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const messages = useMemo(
    () =>
      currentInProgressMessage
        ? [...messageList, currentInProgressMessage]
        : messageList,
    [currentInProgressMessage, messageList],
  );

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages]);

  return (
    <section
      className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-md border-2 border-foreground bg-background"
      aria-label="Transcription panel"
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b-2 border-foreground bg-card px-3">
        <div>
          <h2 className="label-caps text-foreground">Transcript</h2>
          <p className="sr-only">Live voice turns</p>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3"
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
            Start speaking to see the live transcript here.
          </div>
        ) : (
          messages.map((message, index) => {
            const isAgent = String(message.uid) === agentUID;
            const label = isAgent ? 'Agent' : 'You';
            const text = message.text?.trim();
            const time = formatMessageTime(message.createdAt);

            return (
              <article
                key={`${message.turn_id ?? message.uid}-${index}`}
                className={`flex flex-col ${isAgent ? 'items-start' : 'items-end'}`}
              >
                <div className="mb-1 flex items-center gap-2 px-1 text-xs font-semibold text-muted-foreground">
                  <span>{label}</span>
                  {time && <span className="font-normal">{time}</span>}
                </div>
                <div
                  className={`max-w-[92%] whitespace-pre-wrap rounded-md border-2 px-3 py-2 text-[0.95rem] leading-6 ${
                    isAgent ? 'rounded-tl-none border-foreground bg-primary/25 text-foreground' : 'rounded-tr-none border-foreground/60 bg-card text-foreground'
                  }`}
                >
                  {text || '...'}
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
