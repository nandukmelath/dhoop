/**
 * Dhoop's mark: a marigold sun with an ink edge. It is also how Dhoop shows what it is doing.
 * The disc swells while it listens, the rays turn while it thinks, and they reach in and out
 * while it speaks. The motion is in app/globals.css.
 */
export type SunState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'off';

export function SunMark({ state = 'idle', className = '' }: { state?: SunState; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={`sun-${state} ${className}`} aria-hidden="true">
      <g className="sun-rays">
        {Array.from({ length: 12 }, (_, i) => (
          <g key={i} transform={`rotate(${i * 30} 50 50)`}>
            {/* Long and short rays in turn, like a child's drawing of the sun. */}
            <rect className="sun-ray" x="46.5" y={i % 2 ? 9 : 3} width="7" height={i % 2 ? 13 : 19} rx="3.5" style={{ animationDelay: `${(i * 90) % 520}ms` }} />
          </g>
        ))}
      </g>
      <circle className="sun-disc" cx="50" cy="50" r="23" />
    </svg>
  );
}
