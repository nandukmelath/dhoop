import type { CSSProperties } from 'react';

/**
 * Dhoop's logo, in every shape it is used in. This page is also where the picture files come
 * from: `npm run brand` opens it in a browser nobody sees and saves each block as a PNG, so
 * the files and the page cannot drift apart. The sizes are exact pixels for that reason.
 *
 * The mark is the app's own sun (components/dhoop/SunMark.tsx), standing still: twelve rays,
 * long and short in turn, around a marigold disc with an ink edge. The word is set in Anek,
 * the family the app speaks six scripts in, narrow and heavy.
 */

const PAPER = '#f5f0e5';
const INK = '#1f1914';
const SUN = '#faa40f';
const NIGHT = '#141b33';
const CREAM = '#fcfaf3';

function Sun({ size, edge = INK }: { size: number; edge?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" style={{ display: 'block', flex: 'none' }}>
      <g fill={SUN} stroke={edge} strokeWidth={3}>
        {Array.from({ length: 12 }, (_, i) => (
          <rect key={i} x={46.5} y={i % 2 ? 9 : 3} width={7} height={i % 2 ? 13 : 19} rx={3.5} transform={`rotate(${i * 30} 50 50)`} />
        ))}
        <circle cx={50} cy={50} r={23} />
      </g>
    </svg>
  );
}

/** The sun for the smallest sizes (a browser tab, 16 to 48 pixels): eight thick rays, so that it does not turn to haze. */
function SmallSun({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" style={{ display: 'block', flex: 'none' }}>
      <g fill={SUN} stroke={INK} strokeWidth={5}>
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x={43.5} y={4} width={13} height={15} rx={6.5} transform={`rotate(${i * 45} 50 50)`} />
        ))}
        <circle cx={50} cy={50} r={23} />
      </g>
    </svg>
  );
}

const word = (size: number, color: string): CSSProperties => ({ fontSize: size, fontWeight: 800, fontStretch: '80%', letterSpacing: '-0.02em', lineHeight: 1, color, whiteSpace: 'nowrap' });

function Lockup({ height, color, edge }: { height: number; color: string; edge?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: height * 0.12 }}>
      <Sun size={height} edge={edge} />
      {/* The word sits a touch low, so that its letters and the disc share a middle line. */}
      <span style={{ ...word(height * 0.86, color), transform: `translateY(${height * 0.035}px)` }}>Dhoop</span>
    </div>
  );
}

const block = (width: number, height: number, background?: string): CSSProperties => ({ width, height, background, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flex: 'none' });

export default function BrandPage() {
  return (
    <main style={{ padding: 40, display: 'flex', flexDirection: 'column', gap: 48, alignItems: 'flex-start', minWidth: 1900 }}>
      <header>
        <h1 className="display" style={{ fontSize: 44 }}>
          Dhoop: the logo
        </h1>
        <p style={{ marginTop: 8, maxWidth: 760, fontSize: 17, lineHeight: 1.5 }}>
          The mark is the sun the app shows while it listens, thinks and speaks. Use it by itself where space is small, and with the word everywhere else. The picture files are in the repository&apos;s <code>brand</code> folder.
        </p>
      </header>

      <div id="mark" style={block(1024, 1024)}>
        <Sun size={900} />
      </div>
      <div id="icon" style={block(1024, 1024, PAPER)}>
        <Sun size={640} />
      </div>
      <div id="icon-night" style={block(1024, 1024, NIGHT)}>
        <Sun size={640} edge={CREAM} />
      </div>
      <div id="favicon" style={block(512, 512)}>
        <SmallSun size={512} />
      </div>

      <div id="logo" style={block(1800, 520)}>
        <Lockup height={400} color={INK} />
      </div>
      <div id="logo-paper" style={block(1800, 520, PAPER)}>
        <Lockup height={340} color={INK} />
      </div>
      <div id="logo-night" style={block(1800, 520, NIGHT)}>
        <Lockup height={340} color={CREAM} edge={CREAM} />
      </div>

      <div id="stacked" style={{ ...block(1024, 1024, PAPER), flexDirection: 'column', gap: 28 }}>
        <Sun size={430} />
        <span style={word(250, INK)}>Dhoop</span>
        <span style={{ fontSize: 44, fontWeight: 600, color: INK, opacity: 0.78, letterSpacing: '0.01em' }}>Solar for your roof, in your language</span>
      </div>

      <div id="social" style={{ ...block(1200, 630, PAPER), flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between', padding: '64px 72px', boxSizing: 'border-box' }}>
        <Lockup height={150} color={INK} />
        <div>
          <p style={{ fontSize: 68, fontWeight: 800, fontStretch: '80%', lineHeight: 1.04, letterSpacing: '-0.015em', color: INK, maxWidth: 1000 }}>Solar for your roof, in your language.</p>
          <p style={{ marginTop: 18, fontSize: 30, fontWeight: 500, color: INK, opacity: 0.8 }}>A voice guide that finds your roof from space and works out the system, the subsidy and the saving. Six Indian languages.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, width: '100%', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 30, fontWeight: 700, color: INK, background: SUN, border: `3px solid ${INK}`, borderRadius: 8, padding: '8px 18px' }}>dhoop.onrender.com</span>
          <span style={{ fontSize: 24, fontWeight: 600, color: INK, opacity: 0.7 }}>Agora Conversational AI · Murf Falcon</span>
        </div>
      </div>
    </main>
  );
}
