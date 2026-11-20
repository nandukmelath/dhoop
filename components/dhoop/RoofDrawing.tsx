import { layoutPanels } from '@/lib/dhoop/panels';

/**
 * The roof as a drawing: its outline and the panels on it, white on night blue like a builder's
 * print. Drawn from the same outline and the same panel layout as the satellite view, with no
 * map behind it, so it loads at once on a phone. `lit` panels are the recommended system; the
 * rest of the room on the roof is drawn faint.
 */
export function RoofDrawing({ ring, panelsFit, panelsLit, className = 'block h-auto max-h-72 w-full' }: { ring: [number, number][]; panelsFit: number; panelsLit?: number; className?: string }) {
  if (ring.length < 3) return null;
  const shapes = layoutPanels(ring, panelsFit);
  // Metres east and north of the first corner, north up.
  const lat0 = ring[0][0];
  const east = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const xy = ([lat, lon]: [number, number]): [number, number] => [(lon - ring[0][1]) * east, -(lat - lat0) * 111_320];
  const outline = ring.map(xy);
  const xs = outline.map((p) => p[0]);
  const ys = outline.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pad = Math.max(maxX - minX, maxY - minY) * 0.12 + 0.5;
  const path = (points: [number, number][]) => `M${points.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join('L')}Z`;
  // One drawn rectangle may stand for several panels on a very large roof.
  const each = shapes.length ? Math.max(1, panelsFit / shapes.length) : 1;
  const lit = panelsLit ? Math.max(1, Math.ceil(panelsLit / each)) : shapes.length;
  const width = maxX - minX + pad * 2;
  const line = width / 220;
  return (
    <svg viewBox={`${minX - pad} ${minY - pad} ${width} ${maxY - minY + pad * 2}`} className={className} role="img" aria-label="Drawing of the roof with solar panels on it">
      <path d={path(outline)} fill="hsl(222 44% 20%)" stroke="hsl(38 96% 52%)" strokeWidth={line * 2.2} strokeLinejoin="round" />
      {shapes.map((shape, i) => (
        <path key={i} d={path(shape.map(xy))} fill={i < lit ? 'hsl(214 86% 56%)' : 'hsl(214 60% 56% / 0.25)'} stroke={i < lit ? 'hsl(44 62% 97%)' : 'hsl(44 62% 97% / 0.4)'} strokeWidth={line * 0.7} />
      ))}
    </svg>
  );
}
