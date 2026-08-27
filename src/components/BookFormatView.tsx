import React, { useState, useEffect, useRef } from "react";
import { Play, Square, Volume2, BookOpen, Columns, AlignLeft, ZoomIn, ZoomOut, Bookmark, FileText, Check, Sparkles, FastForward, RotateCcw, Repeat } from "lucide-react";
import { DialogueLine, WordGloss, VoiceName, AncientGreekModule } from "../types";

export type BookLayoutMode = "parallel" | "folio" | "greek-manuscript";
export type FontSizeOption = "sm" | "base" | "lg" | "xl";

interface BookFormatViewProps {
  module: AncientGreekModule;
  isPlaying: boolean;
  isBuffering: boolean;
  activeLineId: number | null;
  activeWordIndex: number | null;
  playbackSpeed: number;
  setPlaybackSpeed?: (speed: number) => void;
  isLooping?: boolean;
  onToggleLoop?: () => void;
  onPlayLine: (line: DialogueLine) => void;
  onPlayFullDialogue: () => void;
  onStopPlayback: () => void;
  onSelectWord: (word: WordGloss, line: DialogueLine) => void;
  /** Book layout controls, lifted so the shared rail can drive them. */
  layoutMode: BookLayoutMode;
  fontSize: FontSizeOption;
  showTransliteration: boolean;
}

export const BookFormatView: React.FC<BookFormatViewProps> = ({
  module,
  isPlaying,
  isBuffering,
  activeLineId,
  activeWordIndex,
  playbackSpeed,
  setPlaybackSpeed,
  isLooping = false,
  onToggleLoop,
  onPlayLine,
  onPlayFullDialogue,
  onStopPlayback,
  onSelectWord,
  layoutMode,
  fontSize,
  showTransliteration,
}) => {
  const [showStephanusNumbers] = useState(true);

  const activeLineRef = useRef<HTMLDivElement | null>(null);

  const activeLineIndex = module.lines.findIndex((l) => l.id === activeLineId);
  const activeLine = activeLineIndex >= 0 ? module.lines[activeLineIndex] : null;

  // Auto-scroll active line into reader view during continuous recitation
  useEffect(() => {
    if (activeLineId && activeLineRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [activeLineId]);



  const getFontSizeClasses = () => {
    switch (fontSize) {
      case "sm":
        return {
          greek: "text-lg md:text-xl leading-relaxed",
          translit: "text-[11px]",
          english: "text-sm leading-relaxed",
        };
      case "lg":
        return {
          greek: "text-2xl md:text-3xl leading-loose",
          translit: "text-sm",
          english: "text-base md:text-lg leading-relaxed",
        };
      case "xl":
        return {
          greek: "text-3xl md:text-4xl leading-loose",
          translit: "text-base",
          english: "text-lg md:text-xl leading-loose",
        };
      case "base":
      default:
        return {
          greek: "text-xl md:text-2xl leading-relaxed",
          translit: "text-xs",
          english: "text-base leading-relaxed",
        };
    }
  };

  const fontClasses = getFontSizeClasses();

  return (
    <div className="space-y-6">
      
      {/* Control ribbon removed: playback, layout, font size and phonetics
          are now in the shared control rail, so book and card views no
          longer carry two separate playback bars. */}
      {/* The Book Folio Container */}
      <div className="bg-[#FFFFFF] border-2 border-[#2D2A26] shadow-md p-6 sm:p-10 md:p-14 relative">
        
        {/* Book Page Header & Scholarly Title */}
        <div className="text-center pb-8 border-b-2 border-[#2D2A26] space-y-2">
          <div className="text-[10px] tracking-[0.35em] uppercase font-sans font-bold text-[#8B7355]">
            BIBLIOTHECA SCRIPTORUM GRAECORUM ET ROMANORUM
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-serif tracking-tight text-[#2D2A26] uppercase">
            {module.title}
          </h2>
          <div className="text-xs sm:text-sm font-serif italic text-[#5C564E]">
            {module.titleEn} • {module.author || "Classical Text"} • {module.stephanusRef || "Pagina I"}
          </div>
          <div className="flex items-center justify-center gap-4 text-[10px] font-mono text-[#8B7355] pt-1">
            <span>[Recensionem recognovit: Gemini Flash Reconstructed TTS]</span>
            <span>•</span>
            <span>[{module.genre.toUpperCase()} • {module.difficulty.toUpperCase()}]</span>
          </div>
        </div>

        {/* Marginalia & Instructions banner */}
        <div className="mt-4 pb-4 border-b border-[#E5E1D8] flex items-center justify-between text-[10px] font-mono text-[#5C564E]">
          <span className="hidden sm:inline">TIP: Click any line to listen with TTS • Click any word for lexical analysis</span>
          <span className="text-[#8B7355] font-bold">{module.lines.length} Lines • Folio I</span>
        </div>

        {/* ---------------------------------------------------- */}
        {/* LAYOUT 1: PARALLEL FACING COLUMNS (Loeb Classical Format) */}
        {/* ---------------------------------------------------- */}
        {layoutMode === "parallel" && (
          <div className="mt-8 space-y-8">
            {module.lines.map((line, idx) => {
              const isActive = activeLineId === line.id;
              const isFirstSpeaker = line.speaker === module.speakers[0]?.name;
              const stephanusSection = `128${String.fromCharCode(97 + (idx % 5))}`;

              return (
                <div
                  key={line.id}
                  ref={isActive ? activeLineRef : null}
                  className={`grid grid-cols-1 lg:grid-cols-2 gap-6 p-4 sm:p-5 border transition-all duration-200 ${
                    isActive
                      ? "bg-[#F7F5F0] border-2 border-[#2D2A26] ring-2 ring-[#8B7355]/40 shadow-xs"
                      : "border-[#E5E1D8] hover:border-[#2D2A26] bg-[#FFFFFF]"
                  }`}
                >
                  
                  {/* Left Column: Attic Greek */}
                  <div className="space-y-2.5 relative pr-0 lg:pr-4 lg:border-r border-[#E5E1D8]">
                    
                    {/* Speaker Cue & Line Control */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {showStephanusNumbers && (
                          <span className="text-[10px] font-mono text-[#8B7355] font-bold">
                            [{stephanusSection}]
                          </span>
                        )}
                        <span className="text-xs uppercase font-sans font-bold tracking-[0.2em] text-[#2D2A26]">
                          {line.speaker}
                        </span>
                      </div>

                      <button
                        onClick={() => onPlayLine(line)}
                        className={`flex items-center gap-1 px-2 py-0.5 border text-[9px] uppercase font-bold tracking-widest transition-all cursor-pointer ${
                          isActive
                            ? "bg-[#2D2A26] text-[#F7F5F0] border-[#2D2A26]"
                            : "border-[#E5E1D8] text-[#5C564E] hover:border-[#2D2A26] hover:text-[#2D2A26]"
                        }`}
                        title="Play this speaker turn"
                      >
                        <Volume2 className="w-2.5 h-2.5" />
                        <span>{isActive ? "Reciting" : "Listen"}</span>
                      </button>
                    </div>

                    {/* Greek Words with Follow-Along Highlighting */}
                    <div className={`font-serif text-[#2D2A26] ${fontClasses.greek} flex flex-wrap gap-x-2 gap-y-1.5 items-baseline ${!isFirstSpeaker ? 'italic' : ''}`}>
                      {line.words.map((w, wIdx) => {
                        const isWordActive = isActive && activeWordIndex === wIdx;
                        return (
                          <button
                            key={wIdx}
                            onClick={() => onSelectWord(w, line)}
                            className={`group inline-block text-left transition-all duration-150 cursor-pointer focus:outline-hidden ${
                              isWordActive
                                ? "bg-[#2D2A26] text-[#F7F5F0] px-1.5 py-0.5 ring-2 ring-[#8B7355] shadow-xs font-semibold scale-105"
                                : "hover:text-[#8B7355] hover:underline decoration-[#8B7355] decoration-1 underline-offset-4"
                            }`}
                            title={`Inspect "${w.greek}" (${w.meaning.split("/")[0]})`}
                          >
                            {w.greek}
                          </button>
                        );
                      })}
                    </div>

                    {/* Transliteration */}
                    {showTransliteration && (
                      <p className={`font-mono text-[#5C564E] italic pt-1 ${fontClasses.translit}`}>
                        {line.transliteration}
                      </p>
                    )}

                  </div>

                  {/* Right Column: English Translation */}
                  <div className="space-y-2 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[9px] font-mono font-bold text-[#8B7355] border border-[#8B7355] px-1 py-0.2 uppercase tracking-wider">
                          ENG
                        </span>
                        <span className="text-xs uppercase font-sans font-semibold tracking-wider text-[#5C564E]">
                          {line.speakerEn}
                        </span>
                      </div>
                      <p className={`font-serif text-[#2D2A26] ${fontClasses.english}`}>
                        "{line.englishTranslation}"
                      </p>
                    </div>

                    <div className="pt-2 border-t border-[#E5E1D8] text-[11px] font-sans text-[#5C564E] italic">
                      Modern Greek: {line.modernGreekTranslation}
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* LAYOUT 2: DRAMATIC FOLIO (Single Running Dialogue)   */}
        {/* ---------------------------------------------------- */}
        {layoutMode === "folio" && (
          <div className="mt-8 space-y-6 max-w-3xl mx-auto">
            {module.lines.map((line, idx) => {
              const isActive = activeLineId === line.id;
              const isFirstSpeaker = line.speaker === module.speakers[0]?.name;
              const stephanusSection = `128${String.fromCharCode(97 + (idx % 5))}`;

              return (
                <div
                  key={line.id}
                  ref={isActive ? activeLineRef : null}
                  className={`p-5 border transition-all duration-200 ${
                    isActive
                      ? "bg-[#F7F5F0] border-2 border-[#2D2A26] ring-2 ring-[#8B7355]/40"
                      : "border-[#E5E1D8] bg-[#FFFFFF] hover:border-[#2D2A26]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-[#E5E1D8]">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-mono text-[#8B7355] font-bold">
                        [{stephanusSection}]
                      </span>
                      <span className="text-xs uppercase font-sans font-bold tracking-[0.25em] text-[#2D2A26]">
                        {line.speaker} <span className="font-mono text-[10px] text-[#5C564E]">({line.speakerEn})</span>
                      </span>
                    </div>

                    <button
                      onClick={() => onPlayLine(line)}
                      className={`flex items-center gap-1 px-2.5 py-1 border text-[9px] uppercase font-bold tracking-widest transition-all cursor-pointer ${
                        isActive
                          ? "bg-[#2D2A26] text-[#F7F5F0] border-[#2D2A26]"
                          : "border-[#E5E1D8] text-[#5C564E] hover:border-[#2D2A26] hover:text-[#2D2A26]"
                      }`}
                    >
                      <Volume2 className="w-3 h-3" />
                      <span>{isActive ? "Reciting..." : "Listen"}</span>
                    </button>
                  </div>

                  {/* Greek Text */}
                  <div className={`font-serif text-[#2D2A26] ${fontClasses.greek} flex flex-wrap gap-x-2.5 gap-y-1.5 items-baseline leading-relaxed ${!isFirstSpeaker ? 'italic' : ''}`}>
                    {line.words.map((w, wIdx) => {
                      const isWordActive = isActive && activeWordIndex === wIdx;
                      return (
                        <button
                          key={wIdx}
                          onClick={() => onSelectWord(w, line)}
                          className={`group inline-block text-left transition-all duration-150 cursor-pointer focus:outline-hidden ${
                            isWordActive
                              ? "bg-[#2D2A26] text-[#F7F5F0] px-1.5 py-0.5 ring-2 ring-[#8B7355] shadow-xs font-semibold scale-105"
                              : "hover:text-[#8B7355] hover:underline decoration-[#8B7355] decoration-1 underline-offset-4"
                          }`}
                        >
                          {w.greek}
                        </button>
                      );
                    })}
                  </div>

                  {/* Phonetics & English translation */}
                  <div className="mt-3 pt-3 border-t border-[#E5E1D8] space-y-1">
                    {showTransliteration && (
                      <p className={`font-mono text-[#5C564E] italic ${fontClasses.translit}`}>
                        {line.transliteration}
                      </p>
                    )}
                    <p className={`font-serif text-[#2D2A26] font-normal ${fontClasses.english}`}>
                      <span className="font-sans font-bold text-[10px] text-[#8B7355] uppercase tracking-wider mr-2">
                        Translation:
                      </span>
                      "{line.englishTranslation}"
                    </p>
                  </div>

                </div>
              );
            })}
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* LAYOUT 3: GREEK MANUSCRIPT CODEX (Pure Greek Text)   */}
        {/* ---------------------------------------------------- */}
        {layoutMode === "greek-manuscript" && (
          <div className="mt-8 max-w-3xl mx-auto space-y-6">
            
            {/* Codex recitation header removed: it repeated the module title
                and carried a third copy of play/loop, after the top ribbon
                and the card-view bar. Identity is in the page header; playback
                is in the rail. */}
            {/* Manuscript Sheet */}
            <div className="p-6 sm:p-10 border-2 border-[#2D2A26] bg-[#FAFAF7] space-y-6 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-[#E5E1D8] text-[10px] font-mono text-[#8B7355]">
                <span className="uppercase tracking-widest font-bold">MANUSCRIPT FOLIO • {module.stephanusRef || "PAGINA I"}</span>
                <span>{module.lines.length} TURNS • ALL GREEK TEXT</span>
              </div>

              <div className="space-y-4">
                {module.lines.map((line, idx) => {
                  const isActive = activeLineId === line.id;
                  const stephanusSection = `128${String.fromCharCode(97 + (idx % 5))}`;

                  return (
                    <div
                      key={line.id}
                      ref={isActive ? activeLineRef : null}
                      className={`p-4 transition-all duration-200 border ${
                        isActive
                          ? "bg-[#FFFFFF] border-2 border-[#2D2A26] ring-2 ring-[#8B7355]/40 shadow-sm"
                          : "border-[#E5E1D8] hover:border-[#2D2A26] bg-[#FFFFFF]/60"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2 mb-2 pb-1.5 border-b border-[#E5E1D8]/60">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <span className="text-[10px] font-mono text-[#8B7355] font-bold">
                            [{stephanusSection}]
                          </span>
                          <span className="text-xs uppercase font-sans font-bold tracking-widest text-[#2D2A26]">
                            {line.speaker}
                          </span>
                          <span className="text-[10px] font-mono text-[#5C564E]">
                            ({line.speakerEn})
                          </span>
                        </div>

                        {/* Individual Line Play button */}
                        <button
                          onClick={() => onPlayLine(line)}
                          className={`shrink-0 flex items-center gap-1 px-2.5 py-1 border text-[9px] uppercase font-bold tracking-widest transition-all cursor-pointer ${
                            isActive
                              ? "bg-[#2D2A26] text-[#F7F5F0] border-[#2D2A26]"
                              : "border-[#E5E1D8] text-[#5C564E] hover:border-[#2D2A26] hover:text-[#2D2A26]"
                          }`}
                          title={`Recite line ${idx + 1}`}
                        >
                          <Volume2 className="w-2.5 h-2.5" />
                          <span>{isActive ? "Reciting..." : "Listen Line"}</span>
                        </button>
                      </div>
                      
                      {/* Greek Line Words */}
                      <div className={`font-serif text-[#2D2A26] ${fontClasses.greek} flex flex-wrap gap-x-2.5 gap-y-1.5 items-baseline leading-relaxed`}>
                        {line.words.map((w, wIdx) => {
                          const isWordActive = isActive && activeWordIndex === wIdx;
                          return (
                            <button
                              key={wIdx}
                              onClick={() => onSelectWord(w, line)}
                              className={`transition-all duration-150 cursor-pointer focus:outline-hidden ${
                                isWordActive
                                  ? "bg-[#2D2A26] text-[#F7F5F0] px-1.5 py-0.5 ring-2 ring-[#8B7355] font-semibold scale-105"
                                  : "hover:text-[#8B7355] hover:underline decoration-[#8B7355] decoration-1 underline-offset-4"
                              }`}
                              title={`Inspect "${w.greek}" (${w.meaning.split("/")[0]})`}
                            >
                              {w.greek}
                            </button>
                          );
                        })}
                      </div>

                      {/* Transliteration preview if enabled */}
                      {showTransliteration && (
                        <div className="mt-2 pt-2 border-t border-[#E5E1D8]/40 text-[11px] font-mono text-[#5C564E] italic">
                          {line.transliteration}
                        </div>
                      )}

                    </div>
                  );
                })}
              </div>

            </div>
          </div>
        )}

        {/* Philological notes.
            Previously four notes hardcoded here — they rendered identically for
            every module, so the Aesop fable and the Apology both displayed
            "128a 1 Χαῖρε, ὦ φίλε", which belongs to neither. Every module
            already carries authored notes; this reads them.

            The heading no longer says "Apparatus Criticus". An apparatus
            records variant readings across manuscript witnesses; these are
            grammatical and cultural commentary, which is a different genre. */}
        {module.commentary?.philologicalNotes?.length ? (
          <div className="mt-12 pt-6 border-t-2 border-[#2D2A26] text-xs font-mono text-[#5C564E] space-y-2">
            <div className="text-[10px] uppercase font-sans font-bold text-[#8B7355] tracking-[0.25em] mb-2">
              Philological Notes
            </div>
            {module.commentary.philologicalNotes.map((note, i) => (
              <p key={i}>
                {note.citation && (
                  <strong className="text-[#2D2A26]">{note.citation} </strong>
                )}
                <em className="font-serif not-italic text-[#2D2A26]">{note.greekTerm}</em>
                {": "}
                <span className="font-sans">{note.commentary}</span>
                {note.rhetoricalDevice && (
                  <span className="text-[#8B7355]"> [{note.rhetoricalDevice}]</span>
                )}
              </p>
            ))}
          </div>
        ) : null}

        {/* Provenance. The page is set as a critical edition, so it must say
            whether the text has a manuscript tradition at all — otherwise an
            invented reference reads exactly like a genuine one. */}
        <div className="mt-6 pt-3 border-t border-[#E5E1D8] text-[10px] font-sans text-[#5C564E] leading-relaxed">
          {module.provenance === "transmitted" ? (
            <span>
              <strong className="text-[#2D2A26] uppercase tracking-wider">Transmitted text.</strong>{" "}
              Quoted from the manuscript tradition; {module.stephanusRef} is a standard reference.
            </span>
          ) : module.provenance === "adapted" ? (
            <span>
              <strong className="text-[#2D2A26] uppercase tracking-wider">Adapted text.</strong>{" "}
              Based on a genuine work, reworded or simplified for study. {module.stephanusRef} locates
              the source passage; the wording here is not the transmitted text.
            </span>
          ) : (
            <span>
              <strong className="text-[#2D2A26] uppercase tracking-wider">Composed for study.</strong>{" "}
              Written as a teaching text, not drawn from a manuscript tradition.
              {module.stephanusRef ? ` "${module.stephanusRef}" is a stylistic label, not a citation.` : ""}
            </span>
          )}
        </div>

        {/* Book Page Footer Marker */}
        <div className="mt-8 text-center text-[10px] font-serif text-[#8B7355] tracking-[0.3em] uppercase">
          ❦ FINIS DIALOGI SOCRATICI ❦
        </div>

      </div>

      {/* Floating Sticky Audio Controller during Continuous Playback */}
      {isPlaying && activeLine && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 max-w-lg w-[92%] bg-[#2D2A26] text-[#F7F5F0] border-2 border-[#8B7355] p-3 shadow-xl flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[10px] uppercase font-sans font-bold text-[#8B7355] tracking-wider">
              <span className="w-2 h-2 rounded-full bg-[#8B7355] animate-ping" />
              <span>Turn {activeLineIndex + 1} of {module.lines.length}: {activeLine.speaker}</span>
            </div>
            <p className="font-serif text-xs text-[#E5E1D8] truncate mt-0.5">
              {activeLine.greekText}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onStopPlayback}
              className="px-3 py-1.5 border border-[#8B7355] bg-[#8B7355] text-[#F7F5F0] hover:bg-[#A0896B] text-[10px] uppercase font-sans font-bold tracking-wider cursor-pointer"
            >
              <Square className="w-3 h-3 fill-current inline-block mr-1" />
              Stop
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
