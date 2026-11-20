'use client';

export type QuickstartAgentMetric = {
  type: string;
  name: string;
  value: number;
  timestamp: number;
};

type QuickstartPipelineMetricsProps = {
  metrics: QuickstartAgentMetric[];
  /** The services really in use, from the server. Neutral names are shown until they arrive. */
  labels?: { stt?: string; llm?: string; tts?: string };
};

// The labels here are neutral on purpose: the real names come from the server, which knows
// what it configured (lib/dhoop/agent.ts). A fixed vendor name here would be wrong for some setups.
const PIPELINE = [
  { key: 'stt', label: 'Speech to text', metricTypes: ['stt', 'asr'] },
  { key: 'llm', label: 'Language model', metricTypes: ['llm', 'mllm'] },
  { key: 'tts', label: 'Text to speech', metricTypes: ['tts'] },
] as const;

function formatMetricName(name: string) {
  return name.replace(/[_-]+/g, ' ');
}

export function QuickstartPipelineMetrics({
  metrics,
  labels,
}: QuickstartPipelineMetricsProps) {
  const latestByType = new Map<string, QuickstartAgentMetric>();
  for (const metric of metrics) {
    latestByType.set(metric.type.toLowerCase(), metric);
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="text-sm font-medium leading-6 text-muted-foreground">
        Pipeline
      </span>
      {PIPELINE.map((step, index) => {
        const metric = step.metricTypes
          .map((type) => latestByType.get(type))
          .find(Boolean);

        return (
          <div key={step.key} className="flex items-center gap-2">
            {index > 0 && (
              <span className="text-xs text-muted-foreground" aria-hidden="true">
                /
              </span>
            )}
            <span className="rounded-md border border-border bg-transparent px-2 py-0.5 text-xs font-semibold leading-4 text-foreground shadow-sm">
              {labels?.[step.key] || step.label}
              {metric && (
                <span
                  className="ml-2 text-primary"
                  title={new Date(metric.timestamp).toLocaleTimeString()}
                >
                  {formatMetricName(metric.name)} {Math.round(metric.value)}ms
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
