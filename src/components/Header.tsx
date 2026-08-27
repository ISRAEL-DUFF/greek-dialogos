import React, { useState, useEffect } from "react";
import { Volume2, BookOpen, Sparkles, Sliders, Wand2, Compass, Cpu, WifiOff, Settings } from "lucide-react";
import { AncientGreekModule } from "../types";
import { useOnlineStatus } from "../utils/useOnlineStatus";

export type AppTab = "dialogue" | "book" | "roleplay" | "importer" | "customTTS" | "grammar";

interface HeaderProps {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  currentModule?: AncientGreekModule;
  onOpenSettings?: () => void;
  /** Module library / import controls, rendered in the header row. */
  moduleActions?: React.ReactNode;
}

interface ProviderStatus {
  openrouter: boolean;
  gemini: boolean;
  activeLlm: string;
  openrouterModel: string;
  ttsProvider: string;
  /** True when a primary provider is configured with no fallback behind it. */
  degraded?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab, currentModule, onOpenSettings, moduleActions }) => {
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const isOnline = useOnlineStatus();

  useEffect(() => {
    fetch("/api/providers")
      .then((res) => res.json())
      .then((data) => setProviderStatus(data))
      .catch((err) => console.warn("Failed to fetch provider status:", err));
  }, []);

  return (
    <header className="border-b-2 border-[#2D2A26] bg-[#F7F5F0] sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
        
        {/* Left Branding / Manuscript Title */}
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 bg-[#2D2A26] text-[#F7F5F0] flex items-center justify-center font-serif text-2xl font-bold border border-[#2D2A26] shrink-0">
            {currentModule ? currentModule.title.charAt(0) : "Σ"}
          </div>
          <div>
            <span className="text-[10px] sm:text-xs uppercase tracking-[0.35em] font-sans font-bold text-[#8B7355] block mb-0.5">
              {currentModule?.author || "Classical Dialogues • Vol. IV"}
            </span>
            {/* The Greek title leads; the module card below used to repeat it
                in Greek while this header showed only the English. */}
            <h1 className="text-lg sm:text-xl md:text-2xl font-serif font-normal tracking-tight text-[#2D2A26] leading-tight">
              {currentModule ? currentModule.title : "Σωκράτης & Ἀλέξανδρος"}
            </h1>
            <span className="text-[11px] sm:text-xs font-sans text-[#5C564E] flex flex-wrap items-center gap-x-2">
              <span>{currentModule?.titleEn}</span>
              {currentModule?.difficulty && (
                <span className="text-[9px] uppercase font-bold tracking-widest text-[#8B7355] border border-[#E5E1D8] px-1">
                  {currentModule.difficulty}
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Right Metadata & Tab Navigation */}
        <div className="flex flex-col items-start md:items-end gap-3 w-full md:w-auto">
          
          <div className="hidden sm:flex items-center gap-4 text-right">
            <div>
              <div className="text-[11px] font-sans font-bold uppercase tracking-widest text-[#2D2A26]">
                {currentModule?.stephanusRef || "Athens Agora • 399 BCE"}
              </div>
              <div className="text-[10px] font-sans text-[#8B7355] tracking-wider uppercase font-semibold flex items-center justify-end gap-1.5 mt-0.5">
                {!isOnline ? (
                  /* Offline is the most important thing to say, so it outranks
                     provider status: with no connection the provider is moot. */
                  <>
                    <WifiOff className="w-3 h-3 text-[#8B7355]" />
                    <span title="Reading and previously downloaded audio still work. New speech, word lookup audio, Ask AI, and module import need a connection.">
                      Offline • cached study only
                    </span>
                  </>
                ) : providerStatus?.openrouter ? (
                  <>
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full ${
                        providerStatus.degraded ? "bg-amber-500" : "bg-emerald-600"
                      }`}
                    ></span>
                    <span
                      title={
                        providerStatus.degraded
                          ? "No fallback provider is configured. If OpenRouter fails or a model is withdrawn, speech and AI features stop with no second path."
                          : "Primary and fallback providers are both configured."
                      }
                    >
                      OpenRouter • {providerStatus.openrouterModel.split("/").pop() || "LLM"} + Gemini TTS
                      {providerStatus.degraded ? " • no fallback" : ""}
                    </span>
                  </>
                ) : (
                  <>
                    <span>Reconstructed Erasmian TTS • Gemini Flash</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-1.5 pl-2 border-l border-[#E5E1D8]">
              <div className="w-2 h-2 rounded-full bg-[#2D2A26]"></div>
              <div className="w-2 h-2 rounded-full bg-[#8B7355]"></div>
              <div className="w-2 h-2 rounded-full bg-[#E5E1D8]"></div>
            </div>
          </div>

          {/* Tab Navigation - Geometric Rectangular Buttons */}
          <nav className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
            {moduleActions}
            {onOpenSettings && (
              <button
                id="btn-open-settings"
                onClick={onOpenSettings}
                aria-label="Open settings"
                title="Pronunciation, voices, downloads and export"
                className="px-2 py-1.5 border border-[#E5E1D8] text-[#5C564E] hover:border-[#2D2A26] hover:text-[#2D2A26] transition-all cursor-pointer order-last md:order-first"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              id="tab-dialogue"
              onClick={() => setActiveTab("dialogue")}
              className={`px-3 py-1.5 border text-[10px] sm:text-[11px] uppercase tracking-widest font-sans font-bold transition-all cursor-pointer ${
                activeTab === "dialogue"
                  ? "border-[#2D2A26] bg-[#2D2A26] text-[#F7F5F0]"
                  : "border-[#E5E1D8] bg-[#F7F5F0] text-[#5C564E] hover:border-[#2D2A26] hover:text-[#2D2A26]"
              }`}
            >
              Study Reader
            </button>

            <button
              id="tab-book"
              onClick={() => setActiveTab("book")}
              className={`flex items-center gap-1 px-3 py-1.5 border text-[10px] sm:text-[11px] uppercase tracking-widest font-sans font-bold transition-all cursor-pointer ${
                activeTab === "book"
                  ? "border-[#2D2A26] bg-[#2D2A26] text-[#F7F5F0]"
                  : "border-[#E5E1D8] bg-[#F7F5F0] text-[#5C564E] hover:border-[#2D2A26] hover:text-[#2D2A26]"
              }`}
            >
              <BookOpen className="w-3 h-3" />
              <span>Greek Codex</span>
            </button>

            <button
              id="tab-importer"
              onClick={() => setActiveTab("importer")}
              className={`flex items-center gap-1 px-3 py-1.5 border text-[10px] sm:text-[11px] uppercase tracking-widest font-sans font-bold transition-all cursor-pointer ${
                activeTab === "importer"
                  ? "border-[#2D2A26] bg-[#2D2A26] text-[#F7F5F0]"
                  : "border-[#8B7355] bg-[#F7F5F0] text-[#8B7355] hover:border-[#2D2A26] hover:text-[#2D2A26]"
              }`}
            >
              <Sparkles className="w-3 h-3" />
              <span>Import / AI</span>
            </button>

            <button
              id="tab-roleplay"
              onClick={() => setActiveTab("roleplay")}
              className={`px-3 py-1.5 border text-[10px] sm:text-[11px] uppercase tracking-widest font-sans font-bold transition-all cursor-pointer ${
                activeTab === "roleplay"
                  ? "border-[#2D2A26] bg-[#2D2A26] text-[#F7F5F0]"
                  : "border-[#E5E1D8] bg-[#F7F5F0] text-[#5C564E] hover:border-[#2D2A26] hover:text-[#2D2A26]"
              }`}
            >
              Roleplay
            </button>

            <button
              id="tab-customTTS"
              onClick={() => setActiveTab("customTTS")}
              className={`px-3 py-1.5 border text-[10px] sm:text-[11px] uppercase tracking-widest font-sans font-bold transition-all cursor-pointer ${
                activeTab === "customTTS"
                  ? "border-[#2D2A26] bg-[#2D2A26] text-[#F7F5F0]"
                  : "border-[#E5E1D8] bg-[#F7F5F0] text-[#5C564E] hover:border-[#2D2A26] hover:text-[#2D2A26]"
              }`}
            >
              TTS Studio
            </button>

            <button
              id="tab-grammar"
              onClick={() => setActiveTab("grammar")}
              className={`px-3 py-1.5 border text-[10px] sm:text-[11px] uppercase tracking-widest font-sans font-bold transition-all cursor-pointer ${
                activeTab === "grammar"
                  ? "border-[#2D2A26] bg-[#2D2A26] text-[#F7F5F0]"
                  : "border-[#E5E1D8] bg-[#F7F5F0] text-[#5C564E] hover:border-[#2D2A26] hover:text-[#2D2A26]"
              }`}
            >
              Grammar
            </button>
          </nav>

        </div>

      </div>
    </header>
  );
};

