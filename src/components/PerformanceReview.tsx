import React, { useRef, useState } from "react";
import { Play, Square, Loader2, User, Volume2 } from "lucide-react";
import { AncientGreekModule, DialogueLine } from "../types";
import { audioPlayer } from "../utils/audioPlayer";
import { gapAfter } from "../utils/dialogueTiming";

interface PerformanceReviewProps {
  module: AncientGreekModule;
  /** The speaker the learner took. */
  role: string;
  /** Their recordings, by line id. */
  attempts: Map<number, AudioBuffer>;
  onFetchLineAudio: (line: DialogueLine) => Promise<AudioBuffer>;
}

type Source = "yours" | "recital" | "missed";

/**
 * Where each line's audio will come from.
 *
 * "missed" is one of the learner's own lines that never got recorded. It still
 * plays the recital, so the dialogue runs through unbroken, but it is marked —
 * a review that quietly passed the model's voice off as the learner's would be
 * worse than useless.
 */
function sourceFor(line: DialogueLine, role: string, attempts: Map<number, AudioBuffer>): Source {
  if (attempts.has(line.id)) return "yours";
  return line.speaker === role ? "missed" : "recital";
}

/**
 * The performance, played back.
 *
 * The whole dialogue with the learner's own voice in their part and the recital
 * in the rest — the reading they actually took part in, rather than the one the
 * app would have produced on its own.
 *
 * Playback reuses the pacing from sequential dialogue playback, so the gaps
 * between turns are derived from punctuation and speaker change exactly as they
 * are elsewhere, rather than being a fixed interval invented here.
 */
export const PerformanceReview: React.FC<PerformanceReviewProps> = ({
  module,
  role,
  attempts,
  onFetchLineAudio,
}) => {
  const [playingLineId, setPlayingLineId] = useState<number | null>(null);
  const [playingAll, setPlayingAll] = useState(false);
  const [loadingLineId, setLoadingLineId] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // Bumped on every stop, so a playthrough abandoned mid-way cannot resume and
  // start fighting the next one for the speaker.
  const runRef = useRef(0);

  const spoken = module.lines.filter((l) => l.speaker === role);
  const recorded = spoken.filter((l) => attempts.has(l.id));

  const bufferFor = async (line: DialogueLine): Promise<AudioBuffer> => {
    const mine = attempts.get(line.id);
    if (mine) return mine;
    return await onFetchLineAudio(line);
  };

  const stopAll = () => {
    runRef.current++;
    audioPlayer.stop();
    setPlayingAll(false);
    setPlayingLineId(null);
    setLoadingLineId(null);
  };

  const playOne = async (line: DialogueLine) => {
    if (playingLineId === line.id) return stopAll();
    stopAll();
    const run = runRef.current;
    setLoadingLineId(line.id);
    try {
      const buffer = await bufferFor(line);
      if (run !== runRef.current) return;
      setLoadingLineId(null);
      setPlayingLineId(line.id);
      audioPlayer.playBuffer(buffer, 1, () => {
        if (run === runRef.current) setPlayingLineId(null);
      });
    } catch {
      setLoadingLineId(null);
      setProblem("That line could not be played.");
    }
  };

  const playAll = async () => {
    if (playingAll) return stopAll();
    stopAll();
    const run = ++runRef.current;
    setPlayingAll(true);
    setProblem(null);

    try {
      for (let i = 0; i < module.lines.length; i++) {
        if (run !== runRef.current) return;
        const line = module.lines[i];

        setLoadingLineId(line.id);
        const buffer = await bufferFor(line);
        if (run !== runRef.current) return;
        setLoadingLineId(null);
        setPlayingLineId(line.id);

        await new Promise<void>((resolve) => {
          audioPlayer.playBuffer(buffer, 1, resolve);
        });
        if (run !== runRef.current) return;

        const gap = gapAfter(line, module.lines[i + 1] ?? null, 1);
        if (gap > 0) await new Promise((r) => setTimeout(r, gap));
      }
    } catch {
      setProblem("The playthrough stopped early — a line could not be loaded.");
    } finally {
      if (run === runRef.current) {
        setPlayingAll(false);
        setPlayingLineId(null);
        setLoadingLineId(null);
      }
    }
  };

  const badge = (source: Source) => {
    const map: Record<Source, { text: string; className: string; icon: React.ElementType }> = {
      yours: {
        text: "Your voice",
        className: "border-[#2D2A26] bg-[#2D2A26] text-[#F7F5F0]",
        icon: User,
      },
      recital: {
        text: "Recital",
        className: "border-[#E5E1D8] text-[#5C564E]",
        icon: Volume2,
      },
      missed: {
        text: "Not recorded",
        className: "border-[#8B7355] text-[#8B7355]",
        icon: Volume2,
      },
    };
    const { text, className, icon: Icon } = map[source];
    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 border text-[9px] uppercase font-sans font-bold tracking-wider ${className}`}
      >
        <Icon className="w-2.5 h-2.5" />
        {text}
      </span>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap border-b border-[#E5E1D8] pb-3">
        <div>
          <span className="block text-[9px] uppercase font-sans font-bold tracking-[0.2em] text-[#8B7355] mb-1">
            The performance
          </span>
          <p className="text-xs font-sans text-[#5C564E] leading-relaxed max-w-md">
            {recorded.length} of {spoken.length} of your lines in your own voice
            {recorded.length < spoken.length && ", the rest read by the recital"}.
          </p>
        </div>

        <button
          onClick={playAll}
          className={`flex items-center gap-2 px-4 py-2 border border-[#2D2A26] text-[10px] uppercase font-sans font-bold tracking-widest transition-colors cursor-pointer ${
            playingAll
              ? "bg-[#8B7355] border-[#8B7355] text-[#F7F5F0]"
              : "bg-[#2D2A26] text-[#F7F5F0] hover:bg-transparent hover:text-[#2D2A26]"
          }`}
        >
          {playingAll ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          {playingAll ? "Stop" : "Play it through"}
        </button>
      </div>

      {problem && (
        <p className="text-[11px] font-sans text-[#5C564E] bg-[#FAF7F1] border-l-3 border-[#8B7355] p-2.5">
          {problem}
        </p>
      )}

      <div className="space-y-2">
        {module.lines.map((line) => {
          const source = sourceFor(line, role, attempts);
          const active = playingLineId === line.id;
          const loading = loadingLineId === line.id;

          return (
            <div
              key={line.id}
              className={`border p-3 transition-colors ${
                active ? "border-[#2D2A26] bg-[#F7F5F0]" : "border-[#E5E1D8] bg-[#FFFFFF]"
              }`}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
                <span className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-mono text-[#8A8378]">{line.id}</span>
                  <span className="text-[11px] font-sans font-bold uppercase tracking-wider text-[#2D2A26]">
                    {line.speaker}
                  </span>
                  {badge(source)}
                </span>

                <button
                  onClick={() => playOne(line)}
                  disabled={playingAll}
                  aria-label={`${active ? "Stop" : "Play"} line ${line.id}`}
                  className="flex items-center gap-1 px-2 py-0.5 border border-[#E5E1D8] text-[9px] uppercase font-sans font-bold tracking-wider text-[#5C564E] hover:border-[#2D2A26] hover:text-[#2D2A26] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  ) : active ? (
                    <Square className="w-2.5 h-2.5" />
                  ) : (
                    <Play className="w-2.5 h-2.5" />
                  )}
                  {active ? "Stop" : "Play"}
                </button>
              </div>

              <p className="font-serif text-lg text-[#2D2A26] leading-snug">{line.greekText}</p>
              <p className="text-[11px] font-sans text-[#5C564E] mt-1">{line.englishTranslation}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
