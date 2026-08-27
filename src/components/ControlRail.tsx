import React, { useEffect, useState } from "react";
import {
  Play, Square, Repeat, HardDrive, Loader2, X, SlidersHorizontal, Layers, BookOpen, Check,
} from "lucide-react";
import { DisplayMode } from "../types";
import { BookLayoutMode, FontSizeOption } from "./BookFormatView";

export type DialogueLayout = "cards" | "book";

interface ControlRailProps {
  isPlaying: boolean;
  isBuffering: boolean;
  onPlayFullDialogue: () => void;
  onStopPlayback: () => void;
  lineCount: number;

  playbackSpeed: number;
  setPlaybackSpeed: (s: number) => void;
  isLooping: boolean;
  onToggleLoop: () => void;

  layout: DialogueLayout;
  setLayout: (l: DialogueLayout) => void;

  /** Cards view */
  displayMode: DisplayMode;
  setDisplayMode: (m: DisplayMode) => void;

  /** Book view */
  bookLayout: BookLayoutMode;
  setBookLayout: (m: BookLayoutMode) => void;
  fontSize: FontSizeOption;
  setFontSize: (f: FontSizeOption) => void;
  showTransliteration: boolean;
  setShowTransliteration: (v: boolean) => void;

  cachedLineCount: number;
  isPrecaching: boolean;
  precacheProgress: { current: number; total: number } | null;
  onPrecacheAudio: () => void;
  onCancelPrecache: () => void;
}

const SPEEDS = [0.75, 0.9, 1.0, 1.25];
const DISPLAY_MODES: { id: DisplayMode; label: string }[] = [
  { id: "all", label: "Study" },
  { id: "greek-english", label: "GR + EN" },
  { id: "greek-only", label: "Greek" },
];
const BOOK_LAYOUTS: { id: BookLayoutMode; label: string }[] = [
  { id: "parallel", label: "Bilingual" },
  { id: "folio", label: "Folio" },
  { id: "greek-manuscript", label: "Codex" },
];
const FONT_SIZES: { id: FontSizeOption; label: string }[] = [
  { id: "sm", label: "A−" }, { id: "base", label: "A" },
  { id: "lg", label: "A+" }, { id: "xl", label: "A++" },
];

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="space-y-1.5">
    <span className="block text-[9px] uppercase font-sans font-bold tracking-[0.18em] text-[#8B7355]">
      {title}
    </span>
    {children}
  </div>
);

/** Small segmented control. Used throughout so every choice reads the same way. */
function Segmented<T extends string>({
  options, value, onChange, disabled = false,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          disabled={disabled}
          aria-pressed={value === o.id}
          className={`px-2 py-1 border text-[10px] uppercase font-sans font-bold tracking-wider transition-all cursor-pointer disabled:opacity-50 ${
            value === o.id
              ? "border-[#2D2A26] bg-[#2D2A26] text-[#F7F5F0]"
              : "border-[#E5E1D8] text-[#5C564E] hover:border-[#2D2A26]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Reading controls.
 *
 * One rail rather than two bars: the card and book views each carried their own
 * play / speed / loop, which is the same control drawn twice and free to drift.
 * The rail's contents follow the active view — display mode for cards, layout
 * and type size for the book — while playback stays constant.
 *
 * On wide screens it sits beside the text as a sticky column, using horizontal
 * space that was empty. Below that it collapses to a button that raises a sheet,
 * so the reading column keeps the full width.
 */
export const ControlRail: React.FC<ControlRailProps> = (p) => {
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSheetOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  const body = (
    <div className="space-y-4">
      <button
        id="btn-play-full"
        onClick={p.isPlaying ? p.onStopPlayback : p.onPlayFullDialogue}
        disabled={p.isBuffering}
        className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 border border-[#2D2A26] text-[11px] uppercase tracking-widest font-sans font-bold transition-all cursor-pointer disabled:opacity-60 ${
          p.isPlaying
            ? "bg-[#8B7355] text-[#F7F5F0] hover:bg-[#2D2A26]"
            : "bg-[#2D2A26] text-[#F7F5F0] hover:bg-[#8B7355]"
        }`}
      >
        {p.isBuffering ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : p.isPlaying ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        <span>{p.isPlaying ? "Stop" : `Recite (${p.lineCount})`}</span>
      </button>

      <Section title="Speed">
        <Segmented
          options={SPEEDS.map((s) => ({ id: String(s) as string, label: `${s}×` }))}
          value={String(p.playbackSpeed)}
          onChange={(v) => p.setPlaybackSpeed(Number(v))}
        />
      </Section>

      <button
        onClick={p.onToggleLoop}
        aria-pressed={p.isLooping}
        className={`w-full flex items-center justify-center gap-1.5 px-2 py-1.5 border text-[10px] uppercase font-sans font-bold tracking-wider cursor-pointer transition-all ${
          p.isLooping
            ? "border-[#2D2A26] bg-[#2D2A26] text-[#F7F5F0]"
            : "border-[#E5E1D8] text-[#5C564E] hover:border-[#2D2A26]"
        }`}
      >
        <Repeat className="w-3 h-3" />
        Loop {p.isLooping ? "on" : "off"}
      </button>

      <Section title="Format">
        <Segmented
          options={[{ id: "cards" as DialogueLayout, label: "Cards" }, { id: "book" as DialogueLayout, label: "Book" }]}
          value={p.layout}
          onChange={p.setLayout}
        />
      </Section>

      {p.layout === "cards" ? (
        <Section title="Show">
          <Segmented options={DISPLAY_MODES} value={p.displayMode} onChange={p.setDisplayMode} />
        </Section>
      ) : (
        <>
          <Section title="Page layout">
            <Segmented options={BOOK_LAYOUTS} value={p.bookLayout} onChange={p.setBookLayout} />
          </Section>
          <Section title="Type size">
            <Segmented options={FONT_SIZES} value={p.fontSize} onChange={p.setFontSize} />
          </Section>
          <button
            onClick={() => p.setShowTransliteration(!p.showTransliteration)}
            aria-pressed={p.showTransliteration}
            className={`w-full flex items-center justify-center gap-1.5 px-2 py-1.5 border text-[10px] uppercase font-sans font-bold tracking-wider cursor-pointer transition-all ${
              p.showTransliteration
                ? "border-[#2D2A26] bg-[#2D2A26] text-[#F7F5F0]"
                : "border-[#E5E1D8] text-[#5C564E] hover:border-[#2D2A26]"
            }`}
          >
            {p.showTransliteration && <Check className="w-3 h-3" />}
            Phonetics
          </button>
        </>
      )}

      <Section title="Offline">
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#5C564E]">
          <HardDrive className="w-3 h-3 text-[#8B7355]" />
          <span>{p.cachedLineCount}/{p.lineCount} lines</span>
        </div>
        {p.isPrecaching ? (
          <div className="flex gap-1">
            <span className="flex-1 flex items-center justify-center gap-1 px-2 py-1 border border-[#E5E1D8] text-[10px] font-sans font-bold uppercase tracking-wider text-[#5C564E]">
              <Loader2 className="w-3 h-3 animate-spin" />
              {p.precacheProgress ? `${p.precacheProgress.current}/${p.precacheProgress.total}` : "…"}
            </span>
            <button
              onClick={p.onCancelPrecache}
              className="px-2 py-1 border border-[#2D2A26] text-[10px] font-sans font-bold uppercase tracking-wider hover:bg-[#2D2A26] hover:text-[#F7F5F0] cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          p.cachedLineCount < p.lineCount && (
            <button
              onClick={p.onPrecacheAudio}
              disabled={p.isPlaying}
              className="w-full px-2 py-1 border border-[#E5E1D8] text-[10px] font-sans font-bold uppercase tracking-wider text-[#5C564E] hover:border-[#2D2A26] hover:text-[#2D2A26] cursor-pointer disabled:opacity-50"
            >
              Download all
            </button>
          )
        )}
      </Section>
    </div>
  );

  return (
    <>
      {/* Wide screens: a sticky column beside the text. */}
      <aside className="hidden lg:block">
        <div className="sticky top-[10.5rem] bg-[#FFFFFF] border-2 border-[#2D2A26] p-4">
          <span className="flex items-center gap-1.5 text-[10px] uppercase font-sans font-bold tracking-[0.2em] text-[#2D2A26] border-b border-[#E5E1D8] pb-2 mb-3">
            {p.layout === "cards" ? <Layers className="w-3.5 h-3.5 text-[#8B7355]" /> : <BookOpen className="w-3.5 h-3.5 text-[#8B7355]" />}
            Reading
          </span>
          {body}
        </div>
      </aside>

      {/* Narrow screens: a button that raises a sheet, so the text keeps the width. */}
      <button
        id="btn-open-controls"
        onClick={() => setSheetOpen(true)}
        className="lg:hidden fixed bottom-4 right-4 z-30 flex items-center gap-2 px-4 py-3 bg-[#2D2A26] text-[#F7F5F0] border border-[#2D2A26] shadow-lg text-[11px] uppercase font-sans font-bold tracking-widest cursor-pointer"
      >
        <SlidersHorizontal className="w-4 h-4" />
        Controls
      </button>

      {sheetOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex items-end">
          <div className="absolute inset-0 bg-[#2D2A26]/50" onClick={() => setSheetOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Reading controls"
            className="relative w-full max-h-[80vh] overflow-y-auto bg-[#F7F5F0] border-t-2 border-[#2D2A26] p-4"
          >
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#E5E1D8]">
              <span className="text-[10px] uppercase font-sans font-bold tracking-[0.2em] text-[#2D2A26]">
                Reading
              </span>
              <button
                onClick={() => setSheetOpen(false)}
                aria-label="Close controls"
                className="p-1 border border-transparent hover:border-[#8B7355] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {body}
          </div>
        </div>
      )}
    </>
  );
};
