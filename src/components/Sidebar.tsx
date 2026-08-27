import React, { useEffect, useState } from "react";
import {
  Volume2, BookOpen, Sparkles, Wand2, Compass, Cpu,
  Settings, SlidersHorizontal, X, WifiOff,
} from "lucide-react";
import { AncientGreekModule } from "../types";
import { useOnlineStatus } from "../utils/useOnlineStatus";

export type AppTab = "dialogue" | "book" | "roleplay" | "importer" | "customTTS" | "grammar";

interface ProviderStatus {
  openrouter: boolean;
  gemini: boolean;
  openrouterModel: string;
  degraded?: boolean;
}

interface SidebarProps {
  activeTab: AppTab;
  setActiveTab: (t: AppTab) => void;
  currentModule: AncientGreekModule;
  onOpenSettings: () => void;
  /** Library picker, rendered compactly. */
  moduleActions?: React.ReactNode;
  /** Reading controls, shown only on the tabs that read a text. */
  readingControls?: React.ReactNode;
}

const TABS: { id: AppTab; label: string; icon: React.ElementType }[] = [
  { id: "dialogue", label: "Study Reader", icon: Volume2 },
  { id: "book", label: "Greek Codex", icon: BookOpen },
  { id: "roleplay", label: "Roleplay", icon: Compass },
  { id: "customTTS", label: "TTS Studio", icon: Wand2 },
  { id: "grammar", label: "Grammar", icon: Cpu },
  { id: "importer", label: "Import / AI", icon: Sparkles },
];

/**
 * Application sidebar.
 *
 * Replaces a 160px sticky header. On a reading app, horizontal space is the
 * cheaper currency: a column costs width the page was not using, while a bar
 * costs height from every screen of text.
 *
 * It carries navigation, so it renders on every tab — a rail that appeared only
 * on some views would strand the reader on the others. Reading controls are
 * passed in and shown only where they apply.
 *
 * Below lg it becomes a bottom bar. Navigation stays one tap: burying six
 * destinations behind a sheet would tax every move through the app.
 */
export const Sidebar: React.FC<SidebarProps> = ({
  activeTab, setActiveTab, currentModule, onOpenSettings, moduleActions, readingControls,
}) => {
  const isOnline = useOnlineStatus();
  const [provider, setProvider] = useState<ProviderStatus | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    fetch("/api/providers")
      .then((r) => r.json())
      .then(setProvider)
      .catch((err) => console.warn("Failed to fetch provider status:", err));
  }, []);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSheetOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  const navButtons = (onNavigate?: () => void) =>
    TABS.map(({ id, label, icon: Icon }) => (
      <button
        key={id}
        id={`tab-${id}`}
        onClick={() => { setActiveTab(id); onNavigate?.(); }}
        aria-current={activeTab === id ? "page" : undefined}
        className={`flex items-center gap-2 px-2.5 py-1.5 border text-[10px] uppercase font-sans font-bold tracking-wider transition-all cursor-pointer whitespace-nowrap ${
          activeTab === id
            ? "border-[#2D2A26] bg-[#2D2A26] text-[#F7F5F0]"
            : "border-transparent text-[#5C564E] hover:border-[#2D2A26] hover:text-[#2D2A26]"
        }`}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span>{label}</span>
      </button>
    ));

  /** A single row, not a sentence: the warning must survive losing the header. */
  const statusRow = (
    <div className="flex items-center gap-1.5 text-[9px] font-mono text-[#5C564E]">
      {!isOnline ? (
        <>
          <WifiOff className="w-3 h-3 text-[#8B7355]" />
          <span title="Reading and downloaded audio still work; new speech and AI need a connection.">
            Offline
          </span>
        </>
      ) : (
        <>
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              provider?.degraded ? "bg-amber-500" : provider?.openrouter ? "bg-emerald-600" : "bg-[#BFCBC9]"
            }`}
          />
          <span
            title={
              provider?.degraded
                ? "No fallback provider configured. If OpenRouter fails or a model is withdrawn, speech and AI stop with no second path."
                : provider?.openrouterModel || "Checking providers…"
            }
          >
            {provider?.degraded ? "No fallback" : provider?.openrouterModel?.split("/").pop() || "…"}
          </span>
        </>
      )}
    </div>
  );

  return (
    <>
      {/* Wide screens: a sticky column. */}
      <aside className="hidden lg:block">
        <div className="sticky top-6 space-y-4">
          <div className="bg-[#FFFFFF] border-2 border-[#2D2A26] p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="w-8 h-8 bg-[#2D2A26] text-[#F7F5F0] flex items-center justify-center font-serif text-lg font-bold shrink-0">
                Δ
              </span>
              <button
                id="btn-open-settings"
                onClick={onOpenSettings}
                aria-label="Open settings"
                title="Pronunciation, voices, downloads and export"
                className="p-1.5 border border-[#E5E1D8] text-[#5C564E] hover:border-[#2D2A26] hover:text-[#2D2A26] cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>

            <nav className="flex flex-col gap-0.5">{navButtons()}</nav>

            {moduleActions && <div className="pt-1 border-t border-[#E5E1D8]">{moduleActions}</div>}

            <div className="pt-1 border-t border-[#E5E1D8]">{statusRow}</div>
          </div>

          {readingControls}
        </div>
      </aside>

      {/* Narrow screens: a bottom bar. Content scrolls beneath it, so it costs
          no reading height, and navigation stays a single tap. */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-[#F7F5F0] border-t-2 border-[#2D2A26]">
        <div className="flex items-center gap-1 overflow-x-auto px-2 py-1.5">
          {navButtons()}
          <div className="ml-auto flex items-center gap-1 pl-2 border-l border-[#E5E1D8]">
            {readingControls && (
              <button
                id="btn-open-controls-sheet"
                onClick={() => setSheetOpen(true)}
                aria-label="Reading controls"
                className="p-1.5 border border-[#E5E1D8] text-[#5C564E] hover:border-[#2D2A26] cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={onOpenSettings}
              aria-label="Open settings"
              className="p-1.5 border border-[#E5E1D8] text-[#5C564E] hover:border-[#2D2A26] cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {sheetOpen && readingControls && (
        <div className="lg:hidden fixed inset-0 z-40 flex items-end">
          <div className="absolute inset-0 bg-[#2D2A26]/50" onClick={() => setSheetOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Reading controls"
            className="relative w-full max-h-[80vh] overflow-y-auto bg-[#F7F5F0] border-t-2 border-[#2D2A26] p-4 pb-20"
          >
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#E5E1D8]">
              <span className="text-[10px] uppercase font-sans font-bold tracking-[0.2em] text-[#2D2A26]">
                Reading
              </span>
              <button
                onClick={() => setSheetOpen(false)}
                aria-label="Close controls"
                className="p-1 border border-transparent hover:border-[#8B7355] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {readingControls}
          </div>
        </div>
      )}
    </>
  );
};
