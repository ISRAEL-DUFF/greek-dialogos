import React, { useState } from "react";
import { Volume2, ArrowRight, RotateCcw, Check } from "lucide-react";
import { DialogueLine, VoiceName, AncientGreekModule } from "../types";
import { WordBankExercise } from "./WordBankExercise";
import { SpeakAndCompare } from "./SpeakAndCompare";
import { PerformanceReview } from "./PerformanceReview";
import { buildWordBank } from "../utils/wordBank";
import { SpeechSettings } from "../utils/speechSettings";

interface RoleplayModeProps {
  module: AncientGreekModule;
  onPlayLine: (line: DialogueLine) => Promise<void>;
  /**
   * The line's recital as a decoded buffer, for drawing beside the learner's
   * attempt. Separate from onPlayLine because the comparison needs the samples,
   * not the playback — and because it is only called when the learner asks,
   * since on a cold cache it costs a synthesis.
   */
  onFetchLineAudio: (line: DialogueLine) => Promise<AudioBuffer>;
  settings: SpeechSettings;
  onSettingsChange: (next: SpeechSettings) => void;
}

export const RoleplayMode: React.FC<RoleplayModeProps> = ({
  module,
  onPlayLine,
  onFetchLineAudio,
  settings,
  onSettingsChange,
}) => {
  const defaultSpeaker = module.speakers[0]?.name || "Σωκράτης";
  const [selectedRole, setSelectedRole] = useState<string>(defaultSpeaker);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isPlayingAuto, setIsPlayingAuto] = useState(false);
  /**
   * Has the current line's text been shown — by solving the exercise or by
   * asking for it? Until then the Greek, its transliteration and the reference
   * recital are all withheld, since each of them is the answer.
   */
  const [lineOpened, setLineOpened] = useState(false);

  /**
   * Every attempt the learner has recorded this run, by line id.
   *
   * In memory only, for the length of the session — recordings are never
   * written to IndexedDB, which keeps them out of the audio cache's quota and
   * means there is nothing to evict or clean up. Reloading loses them, which is
   * the trade for holding none of the learner's voice on disk.
   */
  const [attempts, setAttempts] = useState<Map<number, AudioBuffer>>(new Map());

  const lines = module.lines;
  const currentLine = lines[currentStepIndex];
  const isUserTurn = currentLine ? currentLine.speaker === selectedRole : false;

  // Not every line can be made into a puzzle: too short, or its words[] does
  // not align with its greekText. Those fall back to simply showing the line.
  const bank = currentLine
    ? buildWordBank(currentLine.greekText, currentLine.words, currentLine.id)
    : null;
  const hasExercise = isUserTurn && settings.roleplayCompose && Boolean(bank?.usable);
  const withholdAnswer = hasExercise && !lineOpened;

  const handleNextStep = async () => {
    if (currentStepIndex < lines.length - 1) {
      const nextIndex = currentStepIndex + 1;
      setCurrentStepIndex(nextIndex);
      setLineOpened(false);
      const nextLine = lines[nextIndex];
      if (nextLine.speaker !== selectedRole) {
        setIsPlayingAuto(true);
        try {
          await onPlayLine(nextLine);
        } finally {
          setIsPlayingAuto(false);
        }
      }
    } else {
      setIsCompleted(true);
    }
  };

  const handleReset = () => {
    setCurrentStepIndex(0);
    setIsCompleted(false);
    setLineOpened(false);
    setAttempts(new Map());
  };

  const handleStartRoleplay = async (role: string) => {
    setSelectedRole(role);
    setCurrentStepIndex(0);
    setIsCompleted(false);
    setLineOpened(false);
    setAttempts(new Map());
    const firstLine = lines[0];
    if (firstLine && firstLine.speaker !== role) {
      setIsPlayingAuto(true);
      try {
        await onPlayLine(firstLine);
      } finally {
        setIsPlayingAuto(false);
      }
    }
  };

  return (
    <div className="bg-[#FFFFFF] border-2 border-[#2D2A26] p-6 shadow-none space-y-6">
      
      {/* Header & Character Selection */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-5 border-b border-[#E5E1D8]">
        <div>
          <span className="text-[10px] uppercase font-sans font-bold text-[#8B7355] tracking-[0.3em] block mb-1">
            Recitation & Dialectic Exercise • {module.titleEn}
          </span>
          <h2 className="text-2xl font-serif font-normal text-[#2D2A26]">
            Recitation Practice
          </h2>
          <p className="text-xs text-[#5C564E] font-sans mt-1">
            Choose a speaker. On their lines you rebuild the Greek and say it aloud; on the others, the
            recital plays. Nothing is listening — you compare your attempt with the recital and judge it
            yourself.
          </p>
        </div>

        {/* Exercise toggles. They live here rather than in the settings drawer
            because this is the only place they apply, and a learner who finds
            the composing step too hard for a long line wants it off now, not
            three screens away. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ["roleplayCompose", "Compose", "Rebuild the line from its words before seeing it"],
              ["roleplayRecord", "Record", "Record yourself and compare with the recital"],
            ] as const
          ).map(([key, label, title]) => (
            <button
              key={key}
              onClick={() => onSettingsChange({ ...settings, [key]: !settings[key] })}
              aria-pressed={settings[key]}
              title={title}
              className={`flex items-center gap-1.5 px-2.5 py-1 border text-[10px] uppercase font-sans font-bold tracking-wider transition-colors cursor-pointer ${
                settings[key]
                  ? "border-[#2D2A26] bg-[#2D2A26] text-[#F7F5F0]"
                  : "border-[#E5E1D8] text-[#5C564E] hover:border-[#2D2A26]"
              }`}
            >
              {settings[key] && <Check className="w-3 h-3" />}
              {label}
            </button>
          ))}
        </div>

        {/* Role Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          {module.speakers.map((sp) => (
            <button
              key={sp.name}
              onClick={() => handleStartRoleplay(sp.name)}
              className={`px-3 py-1.5 border text-[10px] uppercase tracking-widest font-sans font-bold transition-all cursor-pointer ${
                selectedRole === sp.name
                  ? "border-[#2D2A26] bg-[#2D2A26] text-[#F7F5F0]"
                  : "border-[#E5E1D8] bg-[#F7F5F0] text-[#5C564E] hover:border-[#2D2A26] hover:text-[#2D2A26]"
              }`}
            >
              Play {sp.name} ({sp.nameEn})
            </button>
          ))}
        </div>
      </div>

      {/* Progress Metric Bar */}
      <div>
        <div className="flex items-center justify-between text-[10px] uppercase font-sans font-bold text-[#8B7355] tracking-widest mb-1.5">
          <span>Dialogue Turn {currentStepIndex + 1} of {lines.length}</span>
          <span className="font-mono">{Math.round(((currentStepIndex + 1) / Math.max(1, lines.length)) * 100)}% Completed</span>
        </div>
        <div className="w-full bg-[#E5E1D8] h-1.5">
          <div
            className="bg-[#2D2A26] h-1.5 transition-all duration-300"
            style={{ width: `${((currentStepIndex + (isCompleted ? 1 : 0)) / Math.max(1, lines.length)) * 100}%` }}
          />
        </div>
      </div>

      {/* Current Turn Focus Card */}
      {!isCompleted && currentLine && (
        <div
          className={`p-6 border-2 transition-all ${
            isUserTurn
              ? "bg-[#F7F5F0] border-[#2D2A26]"
              : "bg-[#FAFAF7] border-[#E5E1D8]"
          }`}
        >
          {/* Status Indicator */}
          <div className="flex items-center justify-between pb-3 border-b border-[#E5E1D8]">
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 ${
                  isUserTurn ? "bg-[#8B7355] animate-pulse" : "bg-[#2D2A26]"
                }`}
              />
              <span className="text-[10px] font-sans font-bold uppercase tracking-widest text-[#2D2A26]">
                {isUserTurn ? `👉 Your Turn to Speak (${currentLine.speaker})` : `🤖 Gemini TTS Reciting (${currentLine.speaker})`}
              </span>
            </div>

            {/* Reference pronunciation */}
            <button
              id="roleplay-listen-line"
              onClick={() => onPlayLine(currentLine)}
              disabled={isPlayingAuto || withholdAnswer}
              title={
                withholdAnswer
                  ? "Hidden while you compose — the recital would give the line away."
                  : "Hear the line read aloud"
              }
              className="flex items-center gap-1.5 px-2.5 py-1 border border-[#2D2A26] bg-[#FFFFFF] text-[10px] uppercase font-sans font-bold tracking-wider text-[#2D2A26] hover:bg-[#2D2A26] hover:text-[#F7F5F0] transition-colors cursor-pointer"
            >
              <Volume2 className="w-3 h-3" />
              <span>Listen Prompt</span>
            </button>
          </div>

          {/* Greek Text to Speak — or the exercise that earns it */}
          <div className="mt-5">
            {hasExercise ? (
              <WordBankExercise
                key={currentLine.id}
                line={currentLine}
                onOpened={() => setLineOpened(true)}
              />
            ) : (
              <div className="space-y-2">
                <div className="text-2xl md:text-3xl font-serif font-normal text-[#2D2A26] leading-relaxed">
                  {currentLine.greekText}
                </div>
                <div className="text-xs font-mono text-[#5C564E] italic">
                  {currentLine.transliteration}
                </div>
              </div>
            )}
          </div>

          {/* The speaking half. Only once the line is visible: there is nothing
              to read aloud while it is still hidden behind the exercise. */}
          {isUserTurn && settings.roleplayRecord && !withholdAnswer && (
            <div className="mt-5 pt-4 border-t border-[#E5E1D8]">
              <SpeakAndCompare
                key={currentLine.id}
                line={currentLine}
                onFetchLineAudio={onFetchLineAudio}
                attempt={attempts.get(currentLine.id) ?? null}
                onAttempt={(buffer) =>
                  setAttempts((prev) => new Map(prev).set(currentLine.id, buffer))
                }
              />
            </div>
          )}

          {/* Translations. Hidden while composing: the exercise already carries
              the English as its prompt, and repeating it here would just be
              noise beside the word bank. */}
          <div
            className={`mt-5 pt-4 border-t border-[#E5E1D8] grid-cols-1 md:grid-cols-2 gap-3 text-xs font-sans ${
              withholdAnswer ? "hidden" : "grid"
            }`}
          >
            <div className="p-3 bg-[#FFFFFF] border border-[#E5E1D8]">
              <span className="font-bold text-[9px] text-[#8B7355] uppercase tracking-widest block mb-0.5">
                English Translation:
              </span>
              <span className="text-[#2D2A26] font-serif text-sm">
                "{currentLine.englishTranslation}"
              </span>
            </div>

            <div className="p-3 bg-[#FFFFFF] border border-[#E5E1D8]">
              <span className="font-bold text-[9px] text-[#5C564E] uppercase tracking-widest block mb-0.5">
                Modern Greek (Νέα Ελληνικά):
              </span>
              <span className="text-[#5C564E] italic font-sans text-xs">
                {currentLine.modernGreekTranslation}
              </span>
            </div>
          </div>

          {/* Control Footer */}
          <div className="mt-6 flex items-center justify-between pt-2">
            <button
              onClick={handleReset}
              className="flex items-center gap-1 text-[10px] uppercase font-sans font-bold tracking-widest text-[#5C564E] hover:text-[#2D2A26] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Dialogue</span>
            </button>

            <button
              id="btn-roleplay-next"
              onClick={handleNextStep}
              className="flex items-center gap-2 px-4 py-2 border border-[#2D2A26] bg-[#2D2A26] text-[#F7F5F0] text-[10px] uppercase tracking-widest font-sans font-bold hover:bg-transparent hover:text-[#2D2A26] transition-all cursor-pointer"
            >
              <span>{isUserTurn ? "Next Line →" : "Proceed →"}</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

        </div>
      )}

      {/* Completion View. The review sits below it: the card marks the end of
          the run, the review is what the learner came back for. */}
      {isCompleted && (
        <div className="text-center py-10 px-6 bg-[#F7F5F0] border-2 border-[#2D2A26] space-y-4">
          <div className="w-12 h-12 bg-[#2D2A26] text-[#F7F5F0] mx-auto flex items-center justify-center font-serif text-2xl font-bold">
            ✓
          </div>
          <h3 className="text-2xl font-serif font-normal text-[#2D2A26]">
            Καλῶς ἐποίησας! (Well recited!)
          </h3>
          <p className="text-[#5C564E] text-xs font-sans max-w-md mx-auto leading-relaxed">
            You completed the recitation of {module.title} ({module.titleEn}).
          </p>
          <div className="pt-2 flex justify-center gap-3">
            <button
              onClick={handleReset}
              className="px-4 py-2 border border-[#2D2A26] bg-[#2D2A26] text-[#F7F5F0] text-[10px] uppercase tracking-widest font-sans font-bold hover:bg-transparent hover:text-[#2D2A26] transition-colors cursor-pointer"
            >
              Restart Recitation
            </button>
          </div>
        </div>
      )}

      {isCompleted && (
        <PerformanceReview
          module={module}
          role={selectedRole}
          attempts={attempts}
          onFetchLineAudio={onFetchLineAudio}
        />
      )}

    </div>
  );
};

