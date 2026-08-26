import React, { useState } from "react";
import { Volume2, Sparkles, AudioLines } from "lucide-react";
import { VoiceName } from "../types";
import { AVAILABLE_VOICES } from "../data/dialogueData";
import { convertToReconstructedPhonetics } from "../utils/phoneticConverter";

interface CustomTTSSectionProps {
  onSynthesizeTTS: (text: string, voice: VoiceName, emotion?: string) => Promise<void>;
}

const PRESET_QUOTES = [
  {
    author: "Σωκράτης (Socrates)",
    greek: "Ἓν οἶδα ὅτι οὐδὲν οἶδα.",
    english: "I know one thing, that I know nothing.",
    voice: "Fenrir" as VoiceName,
  },
  {
    author: "Σωκράτης (Socrates)",
    greek: "Ὁ ἀνεξέταστος βίος οὐ βιωτὸς ἀνθρώπῳ.",
    english: "The unexamined life is not worth living for a human.",
    voice: "Fenrir" as VoiceName,
  },
  {
    author: "Δελφικό Παράγγελμα (Delphic Maxim)",
    greek: "Γνῶθι σεαυτόν.",
    english: "Know thyself.",
    voice: "Charon" as VoiceName,
  },
  {
    author: "Ἀριστοτέλης (Aristotle)",
    greek: "Πάντες ἄνθρωποι τοῦ εἰδέναι ὀρέγονται φύσει.",
    english: "All human beings by nature desire to know.",
    voice: "Puck" as VoiceName,
  },
  {
    author: "Πλάτων (Plato)",
    greek: "Χαλεπὰ τὰ καλά.",
    english: "Noble things are difficult.",
    voice: "Zephyr" as VoiceName,
  },
];

export const CustomTTSSection: React.FC<CustomTTSSectionProps> = ({ onSynthesizeTTS }) => {
  const [customText, setCustomText] = useState("Χαῖρε, ὦ φίλε! Βούλομαι φιλοσοφεῖν.");
  const [selectedVoice, setSelectedVoice] = useState<VoiceName>("Fenrir");
  const [emotion, setEmotion] = useState("calm and philosophical");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleGenerate = async (textToSpeak = customText, voiceToUse = selectedVoice) => {
    if (!textToSpeak.trim()) return;
    try {
      setIsLoading(true);
      setErrorMsg(null);
      await onSynthesizeTTS(textToSpeak, voiceToUse, emotion);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to generate speech");
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyPreset = (preset: typeof PRESET_QUOTES[0]) => {
    setCustomText(preset.greek);
    setSelectedVoice(preset.voice);
  };

  return (
    <div className="bg-[#FFFFFF] border-2 border-[#2D2A26] p-6 shadow-none space-y-6">
      
      {/* Title & Introduction */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-[#E5E1D8]">
        <div>
          <span className="text-[10px] uppercase font-sans font-bold text-[#8B7355] tracking-[0.3em] block mb-1">
            Speech Synthesis Studio
          </span>
          <h2 className="text-2xl font-serif font-normal text-[#2D2A26]">
            Classical Greek TTS Generator
          </h2>
          <p className="text-xs text-[#5C564E] font-sans mt-1">
            Convert any Classical Greek sentence, philosophical aphorism, or custom dialogue line into lifelike speech via Gemini 3.1 Flash TTS.
          </p>
        </div>
        <div className="border border-[#2D2A26] px-2.5 py-1 text-[10px] font-mono uppercase font-bold text-[#2D2A26] bg-[#F7F5F0]">
          Model: gemini-3.1-flash-tts
        </div>
      </div>

      {/* Input Area */}
      <div className="space-y-4">
        <div>
          <label htmlFor="custom-tts-input" className="block text-[10px] font-bold uppercase tracking-[0.25em] font-sans text-[#8B7355] mb-1.5">
            Greek Text (Polytonic Unicode)
          </label>
          <textarea
            id="custom-tts-input"
            rows={3}
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="Type or paste Ancient Greek text here (e.g. Ἄρτον καὶ καρποὺς ἀγοράσω)..."
            className="w-full border-2 border-[#2D2A26] p-3.5 text-[#2D2A26] font-serif text-xl leading-relaxed focus:outline-hidden bg-[#F7F5F0]"
          />
        </div>

        {/* Reconstructed Phonetic Layout Preview Box */}
        {customText.trim() && (
          <div className="p-3.5 bg-[#F7F5F0] border border-[#2D2A26] space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[10px] font-sans font-bold uppercase tracking-wider text-[#8B7355]">
                <AudioLines className="w-3.5 h-3.5" />
                <span>Reconstructed Attic Phonetic Layout (Erasmian)</span>
              </div>
              <span className="px-2 py-0.5 bg-[#2D2A26] text-[#F7F5F0] text-[9px] font-mono uppercase font-bold tracking-widest">
                Modern Dictionary Bypassed
              </span>
            </div>
            
            <p className="font-mono text-sm text-[#2D2A26] font-medium bg-[#FFFFFF] p-2.5 border border-[#E5E1D8] break-words">
              {convertToReconstructedPhonetics(customText)}
            </p>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-sans text-[#5C564E]">
              <span>✓ <strong>Hard Stops:</strong> β=b, γ=g, δ=d</span>
              <span>✓ <strong>Restored Vowels:</strong> η=eh, ω=oh</span>
              <span>✓ <strong>Composite Diphthongs:</strong> αι, ει, οι, ου, αυ, ευ</span>
              <span>✓ <strong>Aspiration:</strong> ̔ = h-</span>
            </div>
          </div>
        )}

        {/* Options Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 font-sans text-xs">
          
          {/* Voice Selector */}
          <div>
            <label htmlFor="custom-voice-select" className="block text-[10px] font-bold uppercase tracking-wider text-[#5C564E] mb-1">
              Select Voice
            </label>
            <select
              id="custom-voice-select"
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value as VoiceName)}
              className="w-full bg-[#F7F5F0] border border-[#2D2A26] px-3 py-2 text-xs font-medium text-[#2D2A26] focus:outline-hidden cursor-pointer"
            >
              {AVAILABLE_VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.gender} - {v.tone})
                </option>
              ))}
            </select>
          </div>

          {/* Delivery Style */}
          <div>
            <label htmlFor="custom-emotion-select" className="block text-[10px] font-bold uppercase tracking-wider text-[#5C564E] mb-1">
              Delivery Tone & Cadence
            </label>
            <select
              id="custom-emotion-select"
              value={emotion}
              onChange={(e) => setEmotion(e.target.value)}
              className="w-full bg-[#F7F5F0] border border-[#2D2A26] px-3 py-2 text-xs font-medium text-[#2D2A26] focus:outline-hidden cursor-pointer"
            >
              <option value="calm and philosophical">Calm & Philosophical</option>
              <option value="energetic and lively">Energetic & Lively</option>
              <option value="solemn and authoritative">Solemn & Authoritative</option>
              <option value="slow and pedagogical for learners">Slow & Pedagogical (Clear)</option>
              <option value="conversational and friendly">Conversational & Friendly</option>
            </select>
          </div>

          {/* Action Button */}
          <div className="flex items-end">
            <button
              id="btn-generate-custom-tts"
              onClick={() => handleGenerate()}
              disabled={isLoading || !customText.trim()}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-[#2D2A26] bg-[#2D2A26] text-[#F7F5F0] text-[10px] uppercase tracking-widest font-sans font-bold hover:bg-transparent hover:text-[#2D2A26] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <span className="w-3 h-3 border-2 border-current border-t-transparent animate-spin" />
                  <span>Synthesizing...</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Synthesize & Recite</span>
                </>
              )}
            </button>
          </div>

        </div>

        {errorMsg && (
          <div className="p-3 border border-red-400 bg-red-50 text-red-800 text-xs font-sans">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Preset Famous Quotes */}
      <div className="pt-5 border-t border-[#E5E1D8] space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase font-sans font-bold text-[#8B7355] tracking-[0.25em]">
            Select Classical Quotation to Recite:
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PRESET_QUOTES.map((quote, idx) => (
            <div
              key={idx}
              className="p-3.5 border border-[#E5E1D8] bg-[#F7F5F0] hover:border-[#2D2A26] transition-all flex flex-col justify-between gap-2.5 text-left"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-[#8B7355]">
                    {quote.author}
                  </span>
                  <span className="text-[9px] font-mono text-[#5C564E]">
                    Voice: {quote.voice}
                  </span>
                </div>
                <p className="font-serif text-[#2D2A26] text-base font-normal mt-1">
                  «{quote.greek}»
                </p>
                <p className="text-[#5C564E] text-xs font-sans mt-0.5 italic">
                  "{quote.english}"
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-[#E5E1D8]">
                <button
                  id={`btn-quote-speak-${idx}`}
                  onClick={() => {
                    handleApplyPreset(quote);
                    handleGenerate(quote.greek, quote.voice);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 border border-[#2D2A26] bg-[#2D2A26] text-[#F7F5F0] text-[9px] uppercase tracking-widest font-sans font-bold hover:bg-transparent hover:text-[#2D2A26] transition-colors cursor-pointer"
                >
                  <Volume2 className="w-2.5 h-2.5" />
                  <span>Recite Now</span>
                </button>
                <button
                  onClick={() => handleApplyPreset(quote)}
                  className="px-2 py-1 text-[9px] uppercase font-sans font-bold tracking-wider text-[#5C564E] hover:text-[#2D2A26] cursor-pointer"
                >
                  Load in Editor
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
