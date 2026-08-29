import React, { useEffect, useRef } from "react";
import { Play, Square } from "lucide-react";
import {
  comparePace,
  normalizePeaks,
  peakAmplitude,
  relativeWidth,
  toPeaks,
} from "../utils/waveform";

interface WaveformCompareProps {
  /** The model's recital of the line. */
  reference: AudioBuffer | null;
  /** What the learner just said. */
  attempt: AudioBuffer | null;
  onPlay: (which: "reference" | "attempt") => void;
  onStop: () => void;
  playing: "reference" | "attempt" | null;
}

const HEIGHT = 56;
const BUCKET_PX = 2;

/**
 * Draw one clip's envelope into its canvas.
 *
 * Peaks are computed against the canvas's backing-store width so the buckets
 * line up with real pixels; on a retina display, computing against CSS pixels
 * would halve the horizontal resolution for no reason.
 */
function draw(
  canvas: HTMLCanvasElement,
  buffer: AudioBuffer,
  widthFraction: number,
  color: string
): void {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth;
  if (cssWidth === 0) return;

  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(HEIGHT * dpr);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Only part of the axis belongs to this clip; the rest stays empty so a
  // shorter attempt visibly stops short of the reference.
  const drawWidth = Math.max(1, Math.floor(canvas.width * widthFraction));
  const buckets = Math.max(1, Math.floor(drawWidth / (BUCKET_PX * dpr)));

  const samples = buffer.getChannelData(0);
  const peaks = normalizePeaks(toPeaks(samples, buckets), peakAmplitude(samples));

  const mid = canvas.height / 2;
  const half = canvas.height / 2 - 2;
  const barWidth = drawWidth / buckets;

  ctx.fillStyle = color;
  peaks.forEach((p, i) => {
    const top = mid - p.max * half;
    const bottom = mid - p.min * half;
    ctx.fillRect(
      i * barWidth,
      top,
      Math.max(1, barWidth - dpr),
      Math.max(dpr, bottom - top)
    );
  });

  // The centre line continues across the unused remainder, so the axis reads
  // as one shared timeline rather than two clips of unrelated width.
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.25;
  ctx.fillRect(drawWidth, mid - dpr / 2, canvas.width - drawWidth, dpr);
  ctx.globalAlpha = 1;
}

const Row: React.FC<{
  label: string;
  seconds: number | null;
  buffer: AudioBuffer | null;
  widthFraction: number;
  color: string;
  isPlaying: boolean;
  onToggle: () => void;
}> = ({ label, seconds, buffer, widthFraction, color, isPlaying, onToggle }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !buffer) return;
    const render = () => draw(canvas, buffer, widthFraction, color);
    render();
    // Redraw on resize: the canvas backing store is sized from the element,
    // so a layout change would otherwise leave a stretched, blurry waveform.
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [buffer, widthFraction, color]);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] uppercase font-sans font-bold tracking-[0.2em] text-[#5C564E]">
          {label}
          {seconds !== null && (
            <span className="ml-2 font-mono normal-case tracking-normal text-[#8A8378]">
              {seconds.toFixed(1)}s
            </span>
          )}
        </span>
        <button
          onClick={onToggle}
          disabled={!buffer}
          aria-label={`${isPlaying ? "Stop" : "Play"} ${label}`}
          className="flex items-center gap-1 px-2 py-0.5 border border-[#E5E1D8] text-[9px] uppercase font-sans font-bold tracking-wider text-[#5C564E] hover:border-[#2D2A26] hover:text-[#2D2A26] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPlaying ? <Square className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5" />}
          {isPlaying ? "Stop" : "Play"}
        </button>
      </div>
      <div className="border border-[#E5E1D8] bg-[#FFFFFF]">
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: `${HEIGHT}px`, display: "block" }}
        />
      </div>
    </div>
  );
};

/**
 * The learner's attempt beside the model's recital.
 *
 * No score. There is no speech recognition for Ancient Greek, so the app cannot
 * judge the attempt and does not pretend to — it draws both clips and reports
 * the one thing it genuinely measures, which is how long each took.
 *
 * Both are drawn on a shared time axis. Fitting each to the full width would
 * normalise away the difference most worth seeing: an attempt half again as
 * long as the recital is the signature of reading word by word.
 */
export const WaveformCompare: React.FC<WaveformCompareProps> = ({
  reference,
  attempt,
  onPlay,
  onStop,
  playing,
}) => {
  const refMs = reference ? reference.duration * 1000 : 0;
  const attMs = attempt ? attempt.duration * 1000 : 0;
  const longest = Math.max(refMs, attMs);
  const pace = attempt && reference ? comparePace(attMs, refMs) : null;

  const toggle = (which: "reference" | "attempt") =>
    playing === which ? onStop() : onPlay(which);

  return (
    <div className="space-y-3">
      <Row
        label="The recital"
        seconds={reference ? reference.duration : null}
        buffer={reference}
        widthFraction={relativeWidth(refMs, longest)}
        color="#8B7355"
        isPlaying={playing === "reference"}
        onToggle={() => toggle("reference")}
      />
      <Row
        label="Yours"
        seconds={attempt ? attempt.duration : null}
        buffer={attempt}
        widthFraction={relativeWidth(attMs, longest)}
        color="#2D2A26"
        isPlaying={playing === "attempt"}
        onToggle={() => toggle("attempt")}
      />

      {pace && pace.kind !== "unknown" && (
        <p className="text-[11px] font-sans text-[#5C564E] leading-relaxed border-t border-[#E5E1D8] pt-2">
          {pace.note}
        </p>
      )}
    </div>
  );
};
