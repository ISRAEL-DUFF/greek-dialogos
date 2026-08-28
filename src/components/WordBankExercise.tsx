import React, { useMemo, useState } from "react";
import { Check, Eye, RotateCcw, Info } from "lucide-react";
import { DialogueLine } from "../types";
import {
  buildWordBank,
  checkAssembly,
  explainViolation,
  AssemblyResult,
  BankWord,
} from "../utils/wordBank";

interface WordBankExerciseProps {
  line: DialogueLine;
  /** Raised once the Greek is on screen, by solving or by revealing. */
  onOpened: () => void;
}

/**
 * Compose the line before speaking it.
 *
 * The learner sees the English and the line's own words, shuffled, and rebuilds
 * the Greek. Skippable by design: a sixteen-word Symposium turn is a hard
 * puzzle, and forcing it on every turn would make the mode tedious rather than
 * useful.
 *
 * Tiles are buttons rather than drag targets. Dragging would exclude keyboard
 * and touch users and buys nothing pedagogically — the exercise is about word
 * order, not pointer skill.
 */
export const WordBankExercise: React.FC<WordBankExerciseProps> = ({ line, onOpened }) => {
  // Seeded on the line so returning to it shows the tiles where they were left.
  const bank = useMemo(
    () => buildWordBank(line.greekText, line.words, line.id),
    [line.greekText, line.words, line.id]
  );

  const [placed, setPlaced] = useState<BankWord[]>([]);
  const [result, setResult] = useState<AssemblyResult | null>(null);
  const [revealed, setRevealed] = useState(false);

  const placedIds = new Set(placed.map((t) => t.index));
  const remaining = bank.tiles.filter((t) => !placedIds.has(t.index));
  const complete = placed.length === bank.solution.length;
  const solved = result?.tier === "exact";
  const open = revealed || result !== null;

  const finish = (next: AssemblyResult | null, reveal: boolean) => {
    if (next) setResult(next);
    if (reveal) setRevealed(true);
    onOpened();
  };

  const place = (tile: BankWord) => {
    setPlaced((p) => [...p, tile]);
    setResult(null);
  };

  const remove = (at: number) => {
    setPlaced((p) => p.filter((_, i) => i !== at));
    setResult(null);
  };

  const reset = () => {
    setPlaced([]);
    setResult(null);
  };

  const original = bank.solution.map((t) => t.display).join(" ");

  return (
    <div className="space-y-5">
      {/* The prompt. The English is what the learner works from; the
          transliteration is withheld because it is the answer, spelled out. */}
      <div>
        <span className="block text-[9px] uppercase font-sans font-bold tracking-[0.2em] text-[#8B7355] mb-1">
          Compose this line
        </span>
        <p className="font-serif text-lg text-[#2D2A26] leading-snug">
          “{line.englishTranslation}”
        </p>
      </div>

      {/* Assembled so far */}
      <div>
        <span className="block text-[9px] uppercase font-sans font-bold tracking-[0.2em] text-[#5C564E] mb-1.5">
          Your line
        </span>
        <div
          className={`min-h-[3.5rem] flex flex-wrap gap-2 items-center p-3 border ${
            placed.length ? "border-[#2D2A26] bg-[#FFFFFF]" : "border-dashed border-[#BFB8AA] bg-[#FAFAF7]"
          }`}
        >
          {placed.length === 0 && (
            <span className="text-xs font-sans text-[#8A8378] italic">
              Choose words below to build the sentence.
            </span>
          )}
          {placed.map((tile, at) => (
            <button
              key={`${tile.index}-${at}`}
              onClick={() => remove(at)}
              aria-label={`Remove ${tile.display}`}
              className="px-2.5 py-1 border border-[#2D2A26] bg-[#F7F5F0] font-serif text-lg text-[#2D2A26] hover:bg-[#2D2A26] hover:text-[#F7F5F0] transition-colors cursor-pointer"
            >
              {tile.display}
            </button>
          ))}
        </div>
      </div>

      {/* The bank */}
      {remaining.length > 0 && (
        <div>
          <span className="block text-[9px] uppercase font-sans font-bold tracking-[0.2em] text-[#5C564E] mb-1.5">
            Words ({remaining.length} left)
          </span>
          <div className="flex flex-wrap gap-2">
            {remaining.map((tile) => (
              <button
                key={tile.index}
                onClick={() => place(tile)}
                aria-label={`Add ${tile.display}`}
                className="px-2.5 py-1 border border-[#E5E1D8] bg-[#FFFFFF] font-serif text-lg text-[#2D2A26] hover:border-[#2D2A26] transition-colors cursor-pointer"
              >
                {tile.display}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          onClick={() => finish(checkAssembly(placed, bank), false)}
          disabled={!complete || open}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-[#2D2A26] bg-[#2D2A26] text-[#F7F5F0] text-[10px] uppercase font-sans font-bold tracking-widest hover:bg-transparent hover:text-[#2D2A26] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#2D2A26] disabled:hover:text-[#F7F5F0]"
        >
          <Check className="w-3 h-3" />
          Check
        </button>

        {placed.length > 0 && !open && (
          <button
            onClick={reset}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-[#E5E1D8] text-[10px] uppercase font-sans font-bold tracking-widest text-[#5C564E] hover:border-[#2D2A26] hover:text-[#2D2A26] transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            Clear
          </button>
        )}

        {!open && (
          <button
            onClick={() => finish(null, true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-[#E5E1D8] text-[10px] uppercase font-sans font-bold tracking-widest text-[#5C564E] hover:border-[#2D2A26] hover:text-[#2D2A26] transition-colors cursor-pointer ml-auto"
          >
            <Eye className="w-3 h-3" />
            Show me
          </button>
        )}
      </div>

      {/* Verdict */}
      <div aria-live="polite">
        {result?.tier === "exact" && (
          <p className="text-xs font-sans text-[#4F6B4A] font-bold uppercase tracking-widest">
            ✓ That is the text.
          </p>
        )}

        {result?.tier === "rule" && (
          <div className="border-l-3 border-[#8B7355] bg-[#FAF7F1] p-3 space-y-1.5">
            {result.violations.map((v, i) => (
              <p key={i} className="text-xs font-sans text-[#2D2A26] leading-relaxed flex gap-2">
                <Info className="w-3.5 h-3.5 text-[#8B7355] shrink-0 mt-0.5" />
                <span className="font-serif">{explainViolation(v)}</span>
              </p>
            ))}
          </div>
        )}

        {result?.tier === "variant" && (
          <p className="text-xs font-sans text-[#5C564E] leading-relaxed">
            A different order — Greek allows a great deal of freedom here, and nothing you placed
            breaks a rule. Compare it with the original below.
          </p>
        )}
      </div>

      {/* The line itself, once earned or asked for */}
      {open && (
        <div className={`pt-4 border-t border-[#E5E1D8] space-y-2 ${solved ? "" : ""}`}>
          <span className="block text-[9px] uppercase font-sans font-bold tracking-[0.2em] text-[#8B7355]">
            {solved ? "The line" : "The text reads"}
          </span>
          <div className="text-2xl md:text-3xl font-serif text-[#2D2A26] leading-relaxed">
            {original}
          </div>
          <div className="text-xs font-mono text-[#5C564E] italic">{line.transliteration}</div>
        </div>
      )}
    </div>
  );
};
