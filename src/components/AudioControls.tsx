import React from "react";
import { Play, Square, Volume2, Users, Repeat, Download, HardDrive, Check, Loader2, X } from "lucide-react";
import { VoiceName, DisplayMode, AncientGreekModule } from "../types";
import { AVAILABLE_VOICES } from "../data/dialogueData";

interface AudioControlsProps {
  isPlaying: boolean;
  isBuffering: boolean;
  activeLineId: number | null;
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  isLooping: boolean;
  onToggleLoop: () => void;
  currentModule: AncientGreekModule;
  speakerVoices: Record<string, VoiceName>;
  onSetSpeakerVoice: (speakerName: string, voice: VoiceName) => void;
  displayMode: DisplayMode;
  setDisplayMode: (mode: DisplayMode) => void;
  onPlayFullDialogue: () => void;
  onStopPlayback: () => void;
  cachedLineCount?: number;
  totalLineCount?: number;
  isPrecaching?: boolean;
  precacheProgress?: { current: number; total: number } | null;
  onPrecacheAudio?: () => void;
  onCancelPrecache?: () => void;
  precacheResult?: { cached: number; failed: number; skipped: number; cancelled: boolean } | null;
  onExportModule?: () => void;
}

export const AudioControls: React.FC<AudioControlsProps> = ({
  isPlaying,
  isBuffering,
  activeLineId,
  playbackSpeed,
  setPlaybackSpeed,
  isLooping,
  onToggleLoop,
  currentModule,
  speakerVoices,
  onSetSpeakerVoice,
  displayMode,
  setDisplayMode,
  onPlayFullDialogue,
  onStopPlayback,
  cachedLineCount = 0,
  totalLineCount = 0,
  isPrecaching = false,
  precacheProgress = null,
  onPrecacheAudio,
  onCancelPrecache,
  precacheResult = null,
  onExportModule,
}) => {
  const isFullyCached = totalLineCount > 0 && cachedLineCount >= totalLineCount;

  return (
    <div className="bg-[#FFFFFF] border-2 border-[#2D2A26] p-5 shadow-none space-y-4">
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-5">
        
        {/* Main Action & Playback */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            id="btn-play-full-dialogue"
            onClick={isPlaying ? onStopPlayback : onPlayFullDialogue}
            disabled={isBuffering || isPrecaching}
            className={`flex items-center gap-2 px-4 py-2.5 border border-[#2D2A26] text-[10px] sm:text-xs uppercase tracking-widest font-sans font-bold transition-all cursor-pointer ${
              isPlaying
                ? "bg-[#8B7355] text-[#F7F5F0] hover:bg-[#2D2A26]"
                : "bg-[#2D2A26] text-[#F7F5F0] hover:bg-transparent hover:text-[#2D2A26]"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isBuffering ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent animate-spin" />
                <span>Synthesizing (Gemini TTS)...</span>
              </>
            ) : isPlaying ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop Playback</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Recite Full Text ({currentModule.lines.length} lines)</span>
              </>
            )}
          </button>

          {isPlaying && (
            <div className="flex items-center gap-2 px-3 py-1.5 border border-[#8B7355] bg-[#F7F5F0] text-[11px] font-sans font-bold uppercase tracking-wider text-[#2D2A26]">
              <span className="w-2 h-2 rounded-full bg-[#8B7355] animate-ping"></span>
              <span>
                {activeLineId ? `Line #${activeLineId} Active` : "Playback Running"}
              </span>
              {isLooping && (
                <span className="ml-1 text-[9px] px-1 py-0.2 bg-[#2D2A26] text-[#8B7355] font-mono">
                  [LOOP]
                </span>
              )}
            </div>
          )}

          {/* Speed Selector */}
          <div className="flex items-center gap-1 border border-[#E5E1D8] p-1 bg-[#F7F5F0]">
            <span className="text-[9px] uppercase tracking-widest font-sans font-bold text-[#8B7355] px-1">
              Speed
            </span>
            {[0.75, 1.0, 1.25].map((speed) => (
              <button
                key={speed}
                id={`speed-${speed}x`}
                onClick={() => setPlaybackSpeed(speed)}
                className={`px-2 py-1 text-[10px] font-mono font-bold transition-all cursor-pointer ${
                  playbackSpeed === speed
                    ? "bg-[#2D2A26] text-[#F7F5F0]"
                    : "text-[#5C564E] hover:text-[#2D2A26] hover:bg-[#E5E1D8]"
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>

          {/* Loop Mode Toggle Button */}
          <button
            id="btn-toggle-loop"
            onClick={onToggleLoop}
            className={`flex items-center gap-1.5 px-3 py-1.5 border text-[10px] uppercase font-sans font-bold tracking-wider transition-all cursor-pointer ${
              isLooping
                ? "border-[#2D2A26] bg-[#2D2A26] text-[#F7F5F0] ring-1 ring-[#8B7355]"
                : "border-[#E5E1D8] bg-[#F7F5F0] text-[#5C564E] hover:border-[#2D2A26] hover:text-[#2D2A26]"
            }`}
            title={
              isLooping
                ? "Loop Active: Dialogue or selected line will replay continuously until stopped"
                : "Enable Loop: Replay dialogue or individual lines continuously for shadowing and pronunciation practice"
            }
          >
            <Repeat className={`w-3.5 h-3.5 ${isLooping ? "text-[#8B7355]" : ""}`} />
            <span>Loop:</span>
            <span className={isLooping ? "text-[#8B7355] font-extrabold" : "font-normal text-[#5C564E]"}>
              {isLooping ? "ON" : "OFF"}
            </span>
          </button>


        </div>

        {/* Voice and View Options */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-sans">
          
          {/* Dynamic Speaker Voice Pickers */}
          {currentModule.speakers.map((sp) => {
            const currentVoice = speakerVoices[sp.name] || sp.defaultVoice || "Fenrir";

            return (
              <div key={sp.name} className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase font-sans font-bold text-[#8B7355] tracking-wider whitespace-nowrap">
                  {sp.name}:
                </span>
                <select
                  value={currentVoice}
                  onChange={(e) => onSetSpeakerVoice(sp.name, e.target.value as VoiceName)}
                  className="bg-[#F7F5F0] border border-[#2D2A26] px-2 py-1 text-[11px] font-sans font-medium text-[#2D2A26] focus:outline-hidden cursor-pointer"
                >
                  {AVAILABLE_VOICES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.tone})
                    </option>
                  ))}
                </select>
              </div>
            );
          })}

          {/* Display Mode Toggle */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase font-sans font-bold text-[#8B7355] tracking-wider whitespace-nowrap">
              View:
            </span>
            <div className="flex items-center gap-1 border border-[#E5E1D8] p-0.5 bg-[#F7F5F0]">
              <button
                id="view-all"
                onClick={() => setDisplayMode("all")}
                className={`px-2 py-1 text-[10px] uppercase font-sans font-bold tracking-wider transition-all cursor-pointer ${
                  displayMode === "all"
                    ? "bg-[#2D2A26] text-[#F7F5F0]"
                    : "text-[#5C564E] hover:text-[#2D2A26]"
                }`}
              >
                Study
              </button>
              <button
                id="view-greek-english"
                onClick={() => setDisplayMode("greek-english")}
                className={`px-2 py-1 text-[10px] uppercase font-sans font-bold tracking-wider transition-all cursor-pointer ${
                  displayMode === "greek-english"
                    ? "bg-[#2D2A26] text-[#F7F5F0]"
                    : "text-[#5C564E] hover:text-[#2D2A26]"
                }`}
              >
                GR + EN
              </button>
              <button
                id="view-greek-only"
                onClick={() => setDisplayMode("greek-only")}
                className={`px-2 py-1 text-[10px] uppercase font-sans font-bold tracking-wider transition-all cursor-pointer ${
                  displayMode === "greek-only"
                    ? "bg-[#2D2A26] text-[#F7F5F0]"
                    : "text-[#5C564E] hover:text-[#2D2A26]"
                }`}
              >
                Greek Text
              </button>
            </div>
          </div>

        </div>

      </div>

      {/* Audio Persistence & Package Export Bar */}
      <div className="pt-3 border-t border-[#E5E1D8] flex flex-wrap items-center justify-between gap-3 text-xs">
        
        {/* Cache status & Precache button */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#F7F5F0] border border-[#E5E1D8] text-[11px] font-mono">
            <HardDrive className="w-3.5 h-3.5 text-[#8B7355]" />
            <span className="text-[#5C564E]">Audio Cache (IndexedDB):</span>
            <span className="font-bold text-[#2D2A26]">
              {cachedLineCount}/{totalLineCount || currentModule.lines.length} lines
            </span>
            {isFullyCached && (
              <span className="ml-1 text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded-xs">
                OFFLINE READY
              </span>
            )}
          </div>

          {isPrecaching && onCancelPrecache && (
            <button
              id="btn-cancel-precache"
              onClick={onCancelPrecache}
              className="flex items-center gap-1.5 px-3 py-1 bg-[#F7F5F0] border border-[#2D2A26] text-[10px] uppercase font-sans font-bold tracking-wider hover:bg-[#2D2A26] hover:text-[#F7F5F0] transition-all cursor-pointer"
              title="Stop caching. Lines already saved are kept."
            >
              <X className="w-3 h-3" />
              <span>Cancel</span>
            </button>
          )}

          {onPrecacheAudio && !isFullyCached && (
            <button
              id="btn-precache-module-audio"
              onClick={onPrecacheAudio}
              disabled={isPrecaching || isPlaying}
              className="flex items-center gap-1.5 px-3 py-1 bg-[#F7F5F0] border border-[#2D2A26] text-[10px] uppercase font-sans font-bold tracking-wider hover:bg-[#2D2A26] hover:text-[#F7F5F0] transition-all cursor-pointer disabled:opacity-50"
              title="Synthesize and save all remaining lines to IndexedDB for instant offline recitation"
            >
              {isPrecaching ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>
                    Caching {precacheProgress ? `${precacheProgress.current}/${precacheProgress.total}` : "..."}
                  </span>
                </>
              ) : (
                <>
                  <HardDrive className="w-3 h-3" />
                  <span>Cache All Audio</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Pre-cache outcome. Reported explicitly: a run in which every request
            failed previously finished silently and looked like a success. */}
        {precacheResult && !isPrecaching && (
          <div
            className={`mt-2 px-3 py-1.5 border text-[10px] font-sans tracking-wide ${
              precacheResult.failed > 0
                ? "border-red-700 bg-red-50 text-red-900"
                : "border-[#2D2A26] bg-[#F7F5F0] text-[#2D2A26]"
            }`}
          >
            {precacheResult.cancelled ? "Cancelled — " : ""}
            {precacheResult.cached} cached
            {precacheResult.skipped > 0 ? `, ${precacheResult.skipped} already saved` : ""}
            {precacheResult.failed > 0 ? `, ${precacheResult.failed} failed` : ""}
            {precacheResult.failed > 0 && " — check the browser console for details."}
          </div>
        )}

        {/* Export Module Button */}
        {onExportModule && (
          <button
            id="btn-export-module-package"
            onClick={onExportModule}
            className="flex items-center gap-1.5 px-3 py-1 bg-[#F7F5F0] border border-[#8B7355] text-[10px] uppercase font-sans font-bold tracking-wider text-[#2D2A26] hover:bg-[#8B7355] hover:text-[#F7F5F0] transition-all cursor-pointer"
            title="Download complete JSON package containing text, phonetic models, grammatical analysis, and embedded audio base64 clips"
          >
            <Download className="w-3 h-3 text-[#8B7355]" />
            <span>Export Module (.json + audio)</span>
          </button>
        )}

      </div>
    </div>
  );
};

