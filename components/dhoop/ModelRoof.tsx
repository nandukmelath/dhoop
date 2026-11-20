'use client';

import { useEffect, useRef, useState } from 'react';
import { classifyCells } from '@/lib/dhoop/shade';

/**
 * The camera survey. Point the camera at a roof (on stage: a small model lit by a lamp)
 * and this finds which parts are in shade, places a panel on every sunlit slot, and
 * reports the result to the session so the agent can read it with getRoofSurvey.
 *
 * The shade finding is plain image arithmetic, not a language model: split the framed
 * area into a grid, measure the brightness of each cell, and call a cell shaded when it
 * is clearly darker than the brightest cells. That keeps it fast and predictable.
 */

export const GRID = { cols: 6, rows: 3 };
/** The framed area, as fractions of the picture. */
const FRAME = { x: 0.1, y: 0.12, w: 0.8, h: 0.76 };

type Status = 'idle' | 'starting' | 'live' | 'dark' | 'blocked';

export default function ModelRoof({
  cameraTrack,
  post,
  panelsFit,
}: {
  /** The camera already published to the call, if any. Otherwise this component can open its own. */
  cameraTrack: MediaStreamTrack | null;
  post: (update: Record<string, unknown>) => Promise<unknown>;
  panelsFit?: number;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const workRef = useRef<HTMLCanvasElement | null>(null);
  const lastRef = useRef<string>('');
  const sentRef = useRef<string>('');
  const [ownStream, setOwnStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [ratio, setRatio] = useState(0.68);
  const [frozen, setFrozen] = useState(false);
  const [litCount, setLitCount] = useState<number | null>(null);

  // Attach whichever camera we have to the video element.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const stream = cameraTrack ? new MediaStream([cameraTrack]) : ownStream;
    if (!stream) {
      video.srcObject = null;
      setStatus((s) => (s === 'blocked' ? s : 'idle'));
      return;
    }
    video.srcObject = stream;
    setStatus('starting');
    video.play().then(() => setStatus('live')).catch(() => setStatus('live'));
  }, [cameraTrack, ownStream]);

  // Stop a camera this component opened itself.
  useEffect(() => () => ownStream?.getTracks().forEach((t) => t.stop()), [ownStream]);

  const openOwnCamera = async () => {
    try {
      setStatus('starting');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
      setOwnStream(stream);
    } catch {
      setStatus('blocked');
    }
  };

  // Look at the picture a few times a second.
  useEffect(() => {
    if (frozen) return;
    const id = setInterval(() => {
      const video = videoRef.current;
      const overlay = overlayRef.current;
      if (!video || !overlay || video.readyState < 2 || !video.videoWidth) return;
      if (!workRef.current) workRef.current = document.createElement('canvas');
      const work = workRef.current;
      const W = 192;
      const H = Math.round((W * video.videoHeight) / video.videoWidth);
      work.width = W;
      work.height = H;
      const wctx = work.getContext('2d', { willReadFrequently: true });
      if (!wctx) return;
      wctx.drawImage(video, 0, 0, W, H);

      const fx = FRAME.x * W;
      const fy = FRAME.y * H;
      const cw = (FRAME.w * W) / GRID.cols;
      const ch = (FRAME.h * H) / GRID.rows;
      const lums: number[] = [];
      for (let r = 0; r < GRID.rows; r++) {
        for (let c = 0; c < GRID.cols; c++) {
          // Sample the middle of each cell so edges and gaps do not confuse it.
          const x = Math.round(fx + c * cw + cw * 0.18);
          const y = Math.round(fy + r * ch + ch * 0.18);
          const w = Math.max(1, Math.round(cw * 0.64));
          const h = Math.max(1, Math.round(ch * 0.64));
          const d = wctx.getImageData(x, y, w, h).data;
          let sum = 0;
          for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          lums.push(sum / (d.length / 4));
        }
      }
      const { lit, reference } = classifyCells(lums, ratio);
      if (reference < 45) {
        setStatus('dark');
        draw(overlay, video, null);
        return;
      }
      setStatus('live');
      draw(overlay, video, lit);

      // Only report a reading once it has held still for two looks in a row.
      const key = lit.map((v) => (v ? '1' : '0')).join('');
      if (key === lastRef.current && key !== sentRef.current) {
        sentRef.current = key;
        setLitCount(lit.filter(Boolean).length);
        void post({ type: 'roof_model', cols: GRID.cols, rows: GRID.rows, lit });
      }
      lastRef.current = key;
    }, 350);
    return () => clearInterval(id);
  }, [ratio, frozen, post]);

  const hasCamera = !!cameraTrack || !!ownStream;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-lg border border-border bg-black">
        <video ref={videoRef} muted playsInline className="block aspect-video w-full object-cover" aria-label="Live camera view of the roof" />
        <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />
        {!hasCamera && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted p-4 text-center">
            <p className="text-sm text-muted-foreground">
              {status === 'blocked' ? 'The camera was blocked. Allow it in the browser, then try again.' : 'No camera yet. Start a conversation, or open this device’s camera.'}
            </p>
            <button type="button" onClick={openOwnCamera} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent">
              Open camera
            </button>
          </div>
        )}
        {status === 'dark' && hasCamera && (
          <div className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-xs text-white">Too dark to read. Add light or move the lamp closer.</div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <span className="font-medium">
          {litCount === null ? 'Place the roof inside the frame' : `${litCount} of ${GRID.cols * GRID.rows} panel slots are in the sun`}
          {panelsFit !== undefined && litCount !== null && panelsFit !== litCount ? ` (${panelsFit} saved)` : ''}
        </span>
        <label className="flex items-center gap-2 text-muted-foreground">
          Shadow sensitivity
          <input type="range" min={0.45} max={0.9} step={0.01} value={ratio} onChange={(e) => setRatio(Number(e.target.value))} aria-label="Shadow sensitivity" />
        </label>
        <button type="button" onClick={() => setFrozen((f) => !f)} className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent">
          {frozen ? 'Resume reading' : 'Hold this reading'}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        On stage this is a model and the lamp is the sun. On a real terrace the same reading gives a pre-survey that an installer confirms on site.
      </p>
    </div>
  );
}

/** Draw the frame, and a panel on every sunlit slot, over the live picture. */
function draw(canvas: HTMLCanvasElement, video: HTMLVideoElement, lit: boolean[] | null) {
  const W = video.videoWidth;
  const H = video.videoHeight;
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);
  const fx = FRAME.x * W;
  const fy = FRAME.y * H;
  const fw = FRAME.w * W;
  const fh = FRAME.h * H;
  ctx.lineWidth = Math.max(2, W / 480);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.setLineDash([W / 60, W / 90]);
  ctx.strokeRect(fx, fy, fw, fh);
  ctx.setLineDash([]);
  if (!lit) return;
  const cw = fw / GRID.cols;
  const ch = fh / GRID.rows;
  for (let r = 0; r < GRID.rows; r++) {
    for (let c = 0; c < GRID.cols; c++) {
      const x = fx + c * cw;
      const y = fy + r * ch;
      const pad = Math.min(cw, ch) * 0.08;
      if (lit[r * GRID.cols + c]) {
        ctx.fillStyle = 'rgba(37, 99, 235, 0.55)';
        ctx.strokeStyle = 'rgba(191, 219, 254, 0.95)';
        ctx.fillRect(x + pad, y + pad, cw - 2 * pad, ch - 2 * pad);
        ctx.strokeRect(x + pad, y + pad, cw - 2 * pad, ch - 2 * pad);
        // Cell lines, so it reads as a solar panel.
        ctx.beginPath();
        for (let i = 1; i < 3; i++) {
          ctx.moveTo(x + pad + ((cw - 2 * pad) * i) / 3, y + pad);
          ctx.lineTo(x + pad + ((cw - 2 * pad) * i) / 3, y + ch - pad);
        }
        ctx.moveTo(x + pad, y + ch / 2);
        ctx.lineTo(x + cw - pad, y + ch / 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(x + pad, y + pad, cw - 2 * pad, ch - 2 * pad);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.beginPath();
        ctx.moveTo(x + pad, y + pad);
        ctx.lineTo(x + cw - pad, y + ch - pad);
        ctx.moveTo(x + cw - pad, y + pad);
        ctx.lineTo(x + pad, y + ch - pad);
        ctx.stroke();
      }
    }
  }
}
