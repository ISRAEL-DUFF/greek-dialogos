import React, { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2, AlertCircle } from "lucide-react";
import { DialogueLine } from "../types";
import { audioPlayer } from "../utils/audioPlayer";
import { WaveformCompare } from "./WaveformCompare";
import {
  AttemptRecorder,
  RecorderError,
  browserDeps,
  browserRecorderEnv,
  recorderAvailability,
} from "../utils/recorder";

interface SpeakAndCompareProps {
  line: DialogueLine;
  onFetchLineAudio: (line: DialogueLine) => Promise<AudioBuffer>;
}

/**
 * Say the line, then hear it against the recital.
 *
 * The reference is fetched only when asked for, never on mount: on a cold cache
 * it costs a synthesis, and a learner who only wants to hear themselves should
 * not be charged for a recital they did not request.
 *
 * The microphone is likewise requested only from the record button. Refusal is
 * an ordinary outcome — the composing half of the turn stands on its own, so a
 * learner without a microphone still has a working exercise.
 */
export const SpeakAndCompare: React.FC<SpeakAndCompareProps> = ({
  line,
  onFetchLineAudio,
}) => {
  const recorderRef = useRef<AttemptRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [attempt, setAttempt] = useState<AudioBuffer | null>(null);
  const [reference, setReference] = useState<AudioBuffer | null>(null);
  const [loadingReference, setLoadingReference] = useState(false);
  const [playing, setPlaying] = useState<"reference" | "attempt" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const availability = recorderAvailability(browserRecorderEnv());
  const canRecord = availability === "ready";

  // Abandon any capture in progress when the turn changes, so the microphone is
  // never left open behind a component that has gone away.
  useEffect(() => {
    return () => {
      recorderRef.current?.cancel();
      audioPlayer.stop();
    };
  }, []);

  const start = async () => {
    setProblem(null);
    const recorder = new AttemptRecorder(browserDeps());
    recorderRef.current = recorder;
    try {
      await recorder.start();
      setRecording(true);
    } catch (err) {
      setProblem(err instanceof RecorderError ? err.message : "The microphone could not be started.");
      recorderRef.current = null;
    }
  };

  const stop = async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    try {
      const result = await recorder.stop();
      setRecording(false);
      recorderRef.current = null;
      setAttempt(await audioPlayer.decodeBlob(result.blob));
    } catch {
      setRecording(false);
      recorderRef.current = null;
      setProblem("That recording could not be read back.");
    }
  };

  const loadReference = async () => {
    setLoadingReference(true);
    setProblem(null);
    try {
      setReference(await onFetchLineAudio(line));
    } catch {
      setProblem("The recital could not be loaded.");
    } finally {
      setLoadingReference(false);
    }
  };

  const play = (which: "reference" | "attempt") => {
    const buffer = which === "reference" ? reference : attempt;
    if (!buffer) return;
    setPlaying(which);
    audioPlayer.playBuffer(buffer, 1, () => setPlaying(null));
  };

  const stopPlayback = () => {
    audioPlayer.stop();
    setPlaying(null);
  };

  const unavailableNote: Record<string, string> = {
    "insecure-context": "Recording needs a secure connection (https or localhost).",
    "no-media-recorder": "This browser cannot record audio.",
    "no-microphone-api": "This browser does not offer microphone access.",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[9px] uppercase font-sans font-bold tracking-[0.2em] text-[#8B7355]">
          Now say it aloud
        </span>

        {canRecord ? (
          <button
            onClick={recording ? stop : start}
            className={`flex items-center gap-1.5 px-3 py-1.5 border text-[10px] uppercase font-sans font-bold tracking-widest transition-colors cursor-pointer ${
              recording
                ? "border-[#8B7355] bg-[#8B7355] text-[#F7F5F0]"
                : "border-[#2D2A26] text-[#2D2A26] hover:bg-[#2D2A26] hover:text-[#F7F5F0]"
            }`}
          >
            {recording ? <Square className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
            {recording ? "Stop" : attempt ? "Record again" : "Record"}
          </button>
        ) : (
          <span className="text-[11px] font-sans text-[#8A8378] italic">
            {unavailableNote[availability] ?? "Recording is unavailable here."}
          </span>
        )}
      </div>

      {problem && (
        <p className="flex items-start gap-2 text-[11px] font-sans text-[#5C564E] leading-relaxed bg-[#FAF7F1] border-l-3 border-[#8B7355] p-2.5">
          <AlertCircle className="w-3.5 h-3.5 text-[#8B7355] shrink-0 mt-0.5" />
          <span>{problem}</span>
        </p>
      )}

      {attempt && (
        <>
          <WaveformCompare
            reference={reference}
            attempt={attempt}
            playing={playing}
            onPlay={play}
            onStop={stopPlayback}
          />

          {!reference && (
            <button
              onClick={loadReference}
              disabled={loadingReference}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-[#E5E1D8] text-[10px] uppercase font-sans font-bold tracking-widest text-[#5C564E] hover:border-[#2D2A26] hover:text-[#2D2A26] transition-colors cursor-pointer disabled:opacity-50"
            >
              {loadingReference && <Loader2 className="w-3 h-3 animate-spin" />}
              {loadingReference ? "Loading the recital…" : "Compare with the recital"}
            </button>
          )}
        </>
      )}
    </div>
  );
};
