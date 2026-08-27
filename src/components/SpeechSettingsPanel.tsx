import React from "react";
import { Settings2, Check } from "lucide-react";
import { StressDensity } from "../utils/phoneticConverter";
import {
  PronunciationScheme,
  SpeechSettings,
  SCHEME_INFO,
} from "../utils/speechSettings";

interface SpeechSettingsPanelProps {
  settings: SpeechSettings;
  onChange: (next: SpeechSettings) => void;
  /** Disabled while audio is playing or caching, since changes re-synthesize. */
  disabled?: boolean;
}

const SCHEMES: PronunciationScheme[] = ["modern", "erasmian", "reconstructed"];

const STRESS_LABELS: Record<StressDensity, string> = {
  none: "None",
  phrase: "One per sentence",
  all: "Every word",
};

/**
 * Speech settings.
 *
 * The pronunciation choice is presented with its trade-off rather than as a
 * bare list: these are competing scholarly traditions, and which one suits a
 * learner is a real decision. Modern Greek in particular sounds best and
 * teaches least, which nobody would guess from the name alone.
 */
export const SpeechSettingsPanel: React.FC<SpeechSettingsPanelProps> = ({
  settings,
  onChange,
  disabled = false,
}) => {
  const set = <K extends keyof SpeechSettings>(key: K, value: SpeechSettings[K]) =>
    onChange({ ...settings, [key]: value });

  return (
    <div className="bg-[#FFFFFF] border-2 border-[#2D2A26] p-5 space-y-5">
      <div className="flex items-center gap-2 border-b border-[#E5E1D8] pb-2">
        <Settings2 className="w-3.5 h-3.5 text-[#8B7355]" />
        <span className="text-[10px] uppercase font-sans font-bold tracking-[0.2em] text-[#2D2A26]">
          Speech Settings
        </span>
        {disabled && (
          <span className="text-[10px] font-sans text-[#8B7355] ml-auto">
            Stop playback to change
          </span>
        )}
      </div>

      {/* ---- Pronunciation ---- */}
      <fieldset disabled={disabled} className="space-y-2 disabled:opacity-50">
        <legend className="text-[10px] uppercase font-sans font-bold tracking-[0.15em] text-[#5C564E] mb-2">
          Pronunciation
        </legend>

        <div className="grid gap-2">
          {SCHEMES.map((scheme) => {
            const info = SCHEME_INFO[scheme];
            const active = settings.pronunciation === scheme;
            return (
              <button
                key={scheme}
                id={`btn-pronunciation-${scheme}`}
                onClick={() => set("pronunciation", scheme)}
                aria-pressed={active}
                className={`text-left border p-3 transition-all cursor-pointer ${
                  active
                    ? "border-[#2D2A26] bg-[#F7F5F0] ring-1 ring-[#8B7355]"
                    : "border-[#E5E1D8] hover:border-[#2D2A26]"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`w-3 h-3 border flex items-center justify-center shrink-0 ${
                      active ? "border-[#2D2A26] bg-[#2D2A26]" : "border-[#8B7355]"
                    }`}
                  >
                    {active && <Check className="w-2.5 h-2.5 text-[#F7F5F0]" />}
                  </span>
                  <span className="font-sans font-bold text-xs uppercase tracking-wider text-[#2D2A26]">
                    {info.label}
                  </span>
                </span>
                <span className="block text-[11px] font-sans text-[#5C564E] mt-1.5 leading-relaxed">
                  {info.summary}
                </span>
                <span className="block text-[11px] font-sans text-[#2D2A26] mt-1 leading-relaxed">
                  {info.tradeoff}
                </span>
                <span className="block font-mono text-[10px] text-[#8B7355] mt-1.5 break-words">
                  {info.sample}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* ---- Delivery ---- */}
      <fieldset disabled={disabled} className="space-y-3 disabled:opacity-50">
        <legend className="text-[10px] uppercase font-sans font-bold tracking-[0.15em] text-[#5C564E] mb-2">
          Delivery
        </legend>

        <label className="flex items-start gap-2 cursor-pointer">
          <input
            id="chk-connected-speech"
            type="checkbox"
            checked={settings.connectedSpeech}
            onChange={(e) => set("connectedSpeech", e.target.checked)}
            className="mt-0.5 accent-[#2D2A26]"
          />
          <span>
            <span className="block font-sans font-bold text-[11px] uppercase tracking-wider text-[#2D2A26]">
              Connected speech
            </span>
            <span className="block text-[11px] font-sans text-[#5C564E] leading-relaxed">
              Joins words that Greek speaks as one unit — <span className="font-serif">οὐκ ἐν</span> becomes a
              single word rather than two. Without it, every word is pronounced in isolation.
            </span>
          </span>
        </label>

        <div>
          <span className="block font-sans font-bold text-[11px] uppercase tracking-wider text-[#2D2A26] mb-1">
            Stress marking
          </span>
          <span className="block text-[11px] font-sans text-[#5C564E] leading-relaxed mb-1.5">
            Greek writes an accent on nearly every word, but speech emphasises only one per phrase.
          </span>
          <div className="flex flex-wrap gap-1.5">
            {(["none", "phrase", "all"] as StressDensity[]).map((d) => (
              <button
                key={d}
                onClick={() => set("stressDensity", d)}
                aria-pressed={settings.stressDensity === d}
                className={`px-2.5 py-1 border text-[10px] uppercase font-sans font-bold tracking-wider cursor-pointer transition-all ${
                  settings.stressDensity === d
                    ? "border-[#2D2A26] bg-[#2D2A26] text-[#F7F5F0]"
                    : "border-[#E5E1D8] text-[#5C564E] hover:border-[#2D2A26]"
                }`}
              >
                {STRESS_LABELS[d]}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-start gap-2 cursor-pointer">
          <input
            id="chk-contextual-delivery"
            type="checkbox"
            checked={settings.contextualDelivery}
            onChange={(e) => set("contextualDelivery", e.target.checked)}
            className="mt-0.5 accent-[#2D2A26]"
          />
          <span>
            <span className="block font-sans font-bold text-[11px] uppercase tracking-wider text-[#2D2A26]">
              Contextual delivery <span className="text-[#8B7355] font-normal normal-case">(experimental)</span>
            </span>
            <span className="block text-[11px] font-sans text-[#5C564E] leading-relaxed">
              Tells the voice who is speaking and what they are answering, so a reply is not read as an
              isolated sentence.
            </span>
          </span>
        </label>
      </fieldset>

      <p className="text-[10px] font-sans text-[#8B7355] border-t border-[#E5E1D8] pt-2 leading-relaxed">
        Each combination is stored separately, so switching back to a setting you have used before plays
        instantly from your downloaded audio.
      </p>
    </div>
  );
};
