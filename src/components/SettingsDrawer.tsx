import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { AncientGreekModule, VoiceName } from "../types";
import { AVAILABLE_VOICES } from "../data/dialogueData";
import { SpeechSettings } from "../utils/speechSettings";
import { SpeechSettingsPanel } from "./SpeechSettingsPanel";
import { OfflineStoragePanel } from "./OfflineStoragePanel";

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  settings: SpeechSettings;
  onSettingsChange: (next: SpeechSettings) => void;
  currentModule: AncientGreekModule;
  modules: AncientGreekModule[];
  speakerVoices: Record<string, VoiceName>;
  onSetSpeakerVoice: (speakerName: string, voice: VoiceName) => void;
  onStorageChanged?: () => void;
  onExportModule?: () => void;
  onExportLibrary?: () => void;
  busy?: boolean;
}

/**
 * Settings drawer.
 *
 * Everything here was previously stacked above the text: speech settings alone
 * ran to 739px, and the whole column pushed the first line of Greek 1.7 screens
 * down. The frequency profile was inverted — play and speed are used constantly,
 * pronunciation is set once — so the rarely-touched controls now live behind a
 * button, and the reading surface starts near the top.
 *
 * It opens from the header, so it is reachable from every tab. Previously the
 * settings rendered only on Study Reader, while affecting audio in Roleplay,
 * Codex, TTS Studio and the word-gloss modal.
 */
export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  open,
  onClose,
  settings,
  onSettingsChange,
  currentModule,
  modules,
  speakerVoices,
  onSetSpeakerVoice,
  onStorageChanged,
  onExportModule,
  onExportLibrary,
  busy = false,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes. A drawer that traps the reader is worse than no drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Move focus into the panel so keyboard users are not left behind the overlay.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div
        className="absolute inset-0 bg-[#2D2A26]/50 backdrop-blur-xs"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="relative w-full max-w-lg h-full overflow-y-auto bg-[#F7F5F0] border-l-2 border-[#2D2A26] focus:outline-none"
      >
        <div className="sticky top-0 z-10 bg-[#2D2A26] text-[#F7F5F0] px-5 py-3 flex items-center justify-between">
          <span className="font-serif text-base tracking-wide uppercase">Settings</span>
          <button
            id="btn-close-settings"
            onClick={onClose}
            aria-label="Close settings"
            className="p-1 border border-transparent hover:border-[#8B7355] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <SpeechSettingsPanel
            settings={settings}
            onChange={onSettingsChange}
            disabled={busy}
          />

          {/* Voices sit with speech settings rather than in the playback bar:
              they are chosen per module, not adjusted while listening. */}
          <div className="bg-[#FFFFFF] border-2 border-[#2D2A26] p-5 space-y-3">
            <span className="block text-[10px] uppercase font-sans font-bold tracking-[0.2em] text-[#2D2A26] border-b border-[#E5E1D8] pb-2">
              Voices
            </span>
            {currentModule.speakers.map((speaker) => (
              <label key={speaker.name} className="flex flex-col gap-1">
                <span className="text-[11px] font-sans font-bold uppercase tracking-wider text-[#5C564E]">
                  <span className="font-serif normal-case text-[13px] text-[#2D2A26]">
                    {speaker.name}
                  </span>
                  {speaker.role ? ` · ${speaker.role}` : ""}
                </span>
                <select
                  value={speakerVoices[speaker.name] || speaker.defaultVoice}
                  onChange={(e) => onSetSpeakerVoice(speaker.name, e.target.value as VoiceName)}
                  disabled={busy}
                  className="px-2 py-1.5 bg-[#F7F5F0] border border-[#2D2A26] text-xs font-sans disabled:opacity-50"
                >
                  {AVAILABLE_VOICES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.tone})
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <OfflineStoragePanel
            modules={modules}
            currentModuleId={currentModule.id}
            onStorageChanged={onStorageChanged}
          />

          <div className="bg-[#FFFFFF] border-2 border-[#2D2A26] p-5 space-y-2">
            <span className="block text-[10px] uppercase font-sans font-bold tracking-[0.2em] text-[#2D2A26] border-b border-[#E5E1D8] pb-2">
              Export
            </span>
            <div className="flex flex-wrap gap-2 pt-1">
              {onExportModule && (
                <button
                  onClick={onExportModule}
                  className="px-3 py-1.5 border border-[#2D2A26] text-[10px] uppercase font-sans font-bold tracking-wider hover:bg-[#2D2A26] hover:text-[#F7F5F0] cursor-pointer"
                >
                  This module + audio
                </button>
              )}
              {onExportLibrary && (
                <button
                  onClick={onExportLibrary}
                  className="px-3 py-1.5 border border-[#2D2A26] text-[10px] uppercase font-sans font-bold tracking-wider hover:bg-[#2D2A26] hover:text-[#F7F5F0] cursor-pointer"
                >
                  Whole library
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
