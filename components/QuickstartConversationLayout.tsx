'use client';

import { useState, type ReactNode } from 'react';
import { SunMark } from '@/components/dhoop/SunMark';

type QuickstartConversationLayoutProps = {
  statusPanel: ReactNode;
  pipelineMetrics: ReactNode;
  transcriptPanel: ReactNode;
  visualizer: ReactNode;
  controls: ReactNode;
  onEndConversation: () => void;
  /** Dhoop's big-screen content: the roof, the numbers, the application. */
  stage?: ReactNode;
  /** Extra header controls, such as the language chips. */
  headerExtras?: ReactNode;
  /** The last thing said, for the phone's dock, where the whole transcript does not fit. */
  caption?: ReactNode;
};

/**
 * The in-call layout, made for a phone first.
 *
 * On a phone the stage fills the screen and the voice lives in a dock at the bottom, within
 * reach of a thumb: the sun, the last thing said and the microphone. Pulling the dock up opens
 * the whole conversation. On a laptop the same dock stands as a rail down the left side, with
 * the conversation always open.
 *
 * The dock is one element in both shapes, so the microphone and the transcript are mounted
 * once. Parts that only show when it is open on a phone carry `dock-more`.
 */
export function QuickstartConversationLayout({ statusPanel, pipelineMetrics, transcriptPanel, visualizer, controls, onEndConversation, stage, headerExtras, caption }: QuickstartConversationLayoutProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-0 flex-1 flex-col text-left">
      <header className="relative z-[1300] flex shrink-0 items-center justify-between gap-2 border-b-2 border-foreground bg-card px-3 py-2 md:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <SunMark className="h-9 w-9 shrink-0" />
          <div className="min-w-0">
            <span className="display block text-2xl max-sm:hidden">Dhoop</span>
            <div className="hidden lg:block">{pipelineMetrics}</div>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 overflow-x-auto">{headerExtras}</div>
          <div className="hidden sm:block">{statusPanel}</div>
          <button
            type="button"
            onClick={onEndConversation}
            aria-label="End conversation with Dhoop"
            title="End conversation"
            className="h-9 shrink-0 rounded-md border-2 border-destructive px-3 text-sm font-bold text-destructive hover:bg-destructive hover:text-destructive-foreground"
          >
            End
          </button>
        </div>
      </header>

      <div className="flex min-h-0 w-full flex-1 flex-col lg:flex-row">
        <aside
          data-open={open}
          className="group z-[1200] flex shrink-0 flex-col gap-2 bg-card max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:border-t-2 max-lg:border-foreground max-lg:px-3 max-lg:pb-[max(0.6rem,env(safe-area-inset-bottom))] max-lg:pt-2 max-lg:shadow-[0_-10px_30px_-12px_hsl(var(--foreground)/0.35)] max-lg:data-[open=true]:top-[3.4rem] lg:w-[22rem] lg:gap-3 lg:border-r-2 lg:border-foreground lg:p-4"
          aria-label="Conversation with Dhoop"
        >
          <div className="flex shrink-0 items-center gap-3 lg:flex-col lg:items-stretch">
            <div className="shrink-0">{visualizer}</div>
            <div className="min-w-0 flex-1 lg:hidden">{caption}</div>
            <button
              type="button"
              onClick={() => setOpen((was) => !was)}
              aria-expanded={open}
              aria-label={open ? 'Close the conversation' : 'Open the conversation'}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border-2 border-foreground bg-background lg:hidden"
            >
              <svg viewBox="0 0 20 20" className={`h-4 w-4 transition-transform ${open ? '' : 'rotate-180'}`} aria-hidden="true">
                <path d="M4 7l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <div className="min-h-0 flex-1 max-lg:group-data-[open=false]:hidden">{transcriptPanel}</div>
          <div className="shrink-0">{controls}</div>
          <div className="shrink-0 lg:hidden max-lg:group-data-[open=false]:hidden">
            {pipelineMetrics}
            <div className="mt-2 sm:hidden">{statusPanel}</div>
          </div>
        </aside>

        {/* The dock covers the foot of the stage on a phone, so the stage keeps that much clear. */}
        <main className="min-h-0 flex-1 overflow-y-auto px-3 pb-44 pt-3 md:px-5 lg:pb-6 lg:pt-4">{stage}</main>
      </div>
    </div>
  );
}
