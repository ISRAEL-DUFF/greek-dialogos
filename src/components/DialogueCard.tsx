import React, { useMemo } from "react";
import { Volume2, HardDrive, Check } from "lucide-react";
import { DialogueLine, DisplayMode, WordGloss } from "../types";
import { wordAffixes, EMPTY_AFFIX } from "../utils/wordPunctuation";

interface DialogueCardProps {
  line: DialogueLine;
  isActive: boolean;
  activeWordIndex?: number | null;
  isLineBuffering: boolean;
  isCached?: boolean;
  displayMode: DisplayMode;
  onPlayLine: (line: DialogueLine) => void;
  onSelectWord: (word: WordGloss, line: DialogueLine) => void;
}

export const DialogueCard: React.FC<DialogueCardProps> = ({
  line,
  isActive,
  activeWordIndex = null,
  isLineBuffering,
  isCached = false,
  displayMode,
  onPlayLine,
  onSelectWord,
}) => {
  // `words[]` arrives without punctuation — it doubles as the lookup key — so
  // the running text is repunctuated from `greekText`, which has it.
  const affixes = useMemo(() => wordAffixes(line.greekText, line.words), [line]);
  const isSocrates = line.speaker === "Σωκράτης";

  return (
    <div
      id={`dialogue-line-${line.id}`}
      className={`transition-all duration-200 p-5 md:p-6 ${
        isActive
          ? "bg-[#FFFFFF] border-2 border-[#2D2A26] shadow-none ring-2 ring-[#8B7355]/40"
          : isSocrates
          ? "bg-[#FFFFFF] border border-[#E5E1D8] hover:border-[#2D2A26]"
          : "bg-[#FAFAF7] border border-[#E5E1D8] hover:border-[#2D2A26]"
      }`}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        
        {/* Speaker Profile Header */}
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 flex items-center justify-center font-serif font-bold text-sm ${
              isSocrates
                ? "bg-[#2D2A26] text-[#F7F5F0] border border-[#2D2A26]"
                : "bg-[#F7F5F0] text-[#2D2A26] border-2 border-[#2D2A26]"
            }`}
          >
            {isSocrates ? "Σ" : "Α"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-sans font-bold text-[#8B7355] tracking-[0.25em]">
                {line.speaker}
              </span>
              <span className="text-[10px] font-mono text-[#5C564E] font-medium">
                [{line.speakerEn} • {line.speakerRole}]
              </span>
            </div>
          </div>
        </div>

        {/* TTS Play Button & Cached Status Indicator */}
        <div className="flex items-center gap-2">
          {isCached && (
            <span
              className="flex items-center gap-1 text-[9px] font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-1.5 py-0.5"
              title="Audio cached locally in browser IndexedDB (0ms latency, offline ready)"
            >
              <Check className="w-2.5 h-2.5 text-emerald-700" />
              <span>Cached</span>
            </span>
          )}

          <button
            id={`btn-play-line-${line.id}`}
            onClick={() => onPlayLine(line)}
            disabled={isLineBuffering}
            className={`flex items-center gap-1.5 px-3 py-1.5 border border-[#2D2A26] text-[10px] uppercase tracking-widest font-sans font-bold transition-all cursor-pointer ${
              isActive
                ? "bg-[#2D2A26] text-[#F7F5F0]"
                : "bg-[#F7F5F0] text-[#2D2A26] hover:bg-[#2D2A26] hover:text-[#F7F5F0]"
            } disabled:opacity-50`}
            title={isCached ? "Play instant cached recitation" : "Play line with Gemini 3.1 Flash TTS (will cache automatically)"}
          >
            {isLineBuffering ? (
              <span className="w-3 h-3 border-2 border-current border-t-transparent animate-spin" />
            ) : (
              <Volume2 className="w-3 h-3" />
            )}
            <span>{isActive ? "Reciting..." : isLineBuffering ? "Synthesizing..." : "Recite Turn"}</span>
          </button>
        </div>
      </div>

      {/* Ancient Greek Text with Follow-Along Word Highlighting */}
      <div className="mt-4 pt-3 border-t border-[#E5E1D8]">
        <div className={`text-xl md:text-2xl font-serif text-[#2D2A26] leading-snug tracking-normal flex flex-wrap gap-x-2.5 gap-y-2 items-baseline ${!isSocrates ? 'italic' : ''}`}>
          {line.words.map((w, idx) => {
            const isWordActive = isActive && activeWordIndex === idx;
            const affix = affixes[idx] ?? EMPTY_AFFIX;
            return (
              <button
                key={idx}
                id={`word-${line.id}-${idx}`}
                onClick={() => onSelectWord(w, line)}
                className={`group relative inline-block text-left transition-all duration-150 cursor-pointer focus:outline-hidden ${
                  isWordActive
                    ? "bg-[#2D2A26] text-[#F7F5F0] px-1.5 py-0.5 ring-2 ring-[#8B7355] shadow-xs font-semibold scale-105"
                    : "hover:text-[#8B7355] hover:underline decoration-[#8B7355] decoration-1 underline-offset-4"
                }`}
                title={`Click for grammar breakdown of "${w.greek}"`}
              >
                <span>{affix.before}{w.greek}{affix.after}</span>
              </button>
            );
          })}
        </div>

        {/* Transliteration (Pronunciation) */}
        {displayMode !== "greek-only" && (
          <p className="mt-2 text-xs font-mono text-[#5C564E] italic">
            {line.transliteration}
          </p>
        )}
      </div>

      {/* Translations & Breakdown */}
      {displayMode !== "greek-only" && (
        <div className="mt-4 space-y-2 pt-3 border-t border-[#E5E1D8] text-xs font-sans">
          
          {/* English Translation */}
          <div className="flex items-start gap-2 text-[#2D2A26]">
            <span className="text-[9px] font-mono font-bold text-[#8B7355] border border-[#8B7355] px-1 py-0.5 uppercase tracking-wider shrink-0 mt-0.5">
              ENG
            </span>
            <p className="font-serif text-sm font-normal text-[#2D2A26]">
              "{line.englishTranslation}"
            </p>
          </div>

          {/* Modern Greek Translation */}
          {displayMode === "all" && (
            <div className="flex items-start gap-2 text-[#5C564E]">
              <span className="text-[9px] font-mono font-bold text-[#5C564E] border border-[#E5E1D8] px-1 py-0.5 uppercase tracking-wider shrink-0 mt-0.5">
                ELL
              </span>
              <p className="font-sans text-xs italic text-[#5C564E]">
                {line.modernGreekTranslation}
              </p>
            </div>
          )}

          {/* Interactive Word Chips (in Study mode) */}
          {displayMode === "all" && (
            <div className="pt-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[9px] uppercase font-sans font-bold text-[#8B7355] tracking-widest">
                  Lexical Analysis (Click Word to Inspect):
                </span>
                {isActive && activeWordIndex !== null && (
                  <span className="text-[9px] font-mono text-[#8B7355] font-semibold animate-pulse">
                    Reciting: {line.words[activeWordIndex]?.greek}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {line.words.map((w, idx) => {
                  const isWordActive = isActive && activeWordIndex === idx;
                  return (
                    <button
                      key={idx}
                      onClick={() => onSelectWord(w, line)}
                      className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs border transition-all cursor-pointer ${
                        isWordActive
                          ? "border-[#2D2A26] bg-[#2D2A26] text-[#F7F5F0] ring-2 ring-[#8B7355]/60 scale-105"
                          : "border-[#E5E1D8] bg-[#F7F5F0] hover:border-[#2D2A26] hover:bg-[#2D2A26] hover:text-[#F7F5F0] text-[#2D2A26]"
                      }`}
                    >
                      <span className="font-serif font-bold">{w.greek}</span>
                      <span className="opacity-40">|</span>
                      <span className="text-[10px] opacity-80">{w.meaning.split("/")[0]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      )}

    </div>
  );
};
