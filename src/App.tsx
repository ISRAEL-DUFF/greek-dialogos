import React, { useState, useRef, useEffect } from "react";
import { Sidebar, AppTab } from "./components/Sidebar";
import { DialogueCard } from "./components/DialogueCard";
import { BookFormatView, BookLayoutMode, FontSizeOption } from "./components/BookFormatView";
import { WordGlossModal } from "./components/WordGlossModal";
import { CustomTTSSection } from "./components/CustomTTSSection";
import { RoleplayMode } from "./components/RoleplayMode";
import { LinguisticNotes } from "./components/LinguisticNotes";
import { ModuleSelector } from "./components/ModuleSelector";
import { ModuleImporter } from "./components/ModuleImporter";
import { DEFAULT_MODULE, BUILTIN_MODULES, getStoredCustomModules } from "./data/dialogueData";
import { DialogueLine, DisplayMode, VoiceName, WordGloss, AncientGreekModule } from "./types";
import { audioPlayer } from "./utils/audioPlayer";
import { audioStorage } from "./utils/audioStorage";
import { exportModuleWithAudio, exportLibraryWithAudio, downloadJsonFile } from "./utils/modulePackage";
import { gapAfter, loopRestartGap, lineRepeatGap } from "./utils/dialogueTiming";
import { useOnlineStatus } from "./utils/useOnlineStatus";
import { AUDIO_CACHE_BUDGET_BYTES, getKeepOfflineIds } from "./utils/offlinePrefs";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { ControlRail } from "./components/ControlRail";
import { SpeechSettings, loadSettings, saveSettings, settingsVariant } from "./utils/speechSettings";


export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>("dialogue");
  const isOnline = useOnlineStatus();
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  // Active Module & Library State
  const [customModules, setCustomModules] = useState<AncientGreekModule[]>([]);
  const [currentModule, setCurrentModule] = useState<AncientGreekModule>(DEFAULT_MODULE);

  // Audio cache state
  const [cachedLineIds, setCachedLineIds] = useState<Set<number>>(new Set());
  const [isPrecaching, setIsPrecaching] = useState(false);
  const [precacheProgress, setPrecacheProgress] = useState<{ current: number; total: number } | null>(null);
  const [precacheResult, setPrecacheResult] = useState<
    { cached: number; failed: number; skipped: number; cancelled: boolean } | null
  >(null);
  const precacheAbortRef = useRef<AbortController | null>(null);

  // Dynamic speaker voices map: { [speakerName]: VoiceName }
  const [speakerVoices, setSpeakerVoices] = useState<Record<string, VoiceName>>(() => {
    const initialVoices: Record<string, VoiceName> = {};
    DEFAULT_MODULE.speakers.forEach((s) => {
      initialVoices[s.name] = s.defaultVoice || "Fenrir";
    });
    return initialVoices;
  });

  // Audio settings
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [bufferingLineId, setBufferingLineId] = useState<number | null>(null);
  const [activeLineId, setActiveLineId] = useState<number | null>(null);
  const [activeWordIndex, setActiveWordIndex] = useState<number | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [isLooping, setIsLooping] = useState<boolean>(false);
  /**
   * Contextual delivery (docs/FIX-PLAN.md P1-9), off by default.
   *
   * Tells the TTS model who is speaking and what they are responding to, so a
   * reply is not synthesized as an isolated sentence. The benefit is
   * subjective and may be inaudible, so this stays switchable: turn it on and
   * off on the same line to compare. Cached audio is keyed separately for each
   * mode, so switching does not serve the other mode's rendering.
   */
  /**
   * Speech settings, persisted. Replaces three scattered toggles and a
   * constant; see utils/speechSettings.
   */
  const [speechSettings, setSpeechSettings] = useState<SpeechSettings>(() => loadSettings());

  const handleSettingsChange = (next: SpeechSettings) => {
    setSpeechSettings(next);
    saveSettings(next);
  };

  const useContextualDelivery = speechSettings.contextualDelivery;

  
  // Display mode
  const [displayMode, setDisplayMode] = useState<DisplayMode>("all");
  const [dialogueLayoutView, setDialogueLayoutView] = useState<"cards" | "book">(() => {
    // Book is the default: it carries every teaching feature the cards do -
    // word glossing, per-line replay, translations, transliteration - with less
    // chrome. The choice is remembered.
    try {
      const saved = localStorage.getItem("greek_dialogos_layout");
      return saved === "cards" ? "cards" : "book";
    } catch {
      return "book";
    }
  });

  const handleSetLayout = (l: "cards" | "book") => {
    setDialogueLayoutView(l);
    try { localStorage.setItem("greek_dialogos_layout", l); } catch { /* private mode */ }
  };
  // Book-view controls live here so the shared rail can drive them; they used
  // to be local state inside BookFormatView with their own duplicate toolbar.
  const [bookLayout, setBookLayout] = useState<BookLayoutMode>("greek-manuscript");
  const [bookFontSize, setBookFontSize] = useState<FontSizeOption>("base");
  const [showTransliteration, setShowTransliteration] = useState(true);
  
  // Word gloss inspection modal
  const [selectedWord, setSelectedWord] = useState<WordGloss | null>(null);
  const [selectedWordLine, setSelectedWordLine] = useState<DialogueLine | null>(null);

  // Error state for playback
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  /**
   * Playback sequence generation.
   *
   * Every play action claims a new generation number. A running sequence
   * compares its own generation against the current one at each await
   * boundary and bails the moment it is superseded.
   *
   * This replaces a boolean stop flag that was reset after a fixed 20ms
   * sleep. That sleep was a guess: a sequence awaiting a slow synthesis
   * request had not reached its stop check within 20ms, so it resumed after
   * the next sequence began and both played at once. A generation counter is
   * correct no matter how long a fetch takes, and needs no sleep.
   */
  const playbackGenerationRef = useRef<number>(0);
  const isLoopingRef = useRef<boolean>(false);
  const playbackSpeedRef = useRef<number>(playbackSpeed);

  /** Claim a new generation, invalidating any sequence already running. */
  const beginPlaybackSequence = (): number => {
    const generation = playbackGenerationRef.current + 1;
    playbackGenerationRef.current = generation;
    audioPlayer.stop();
    return generation;
  };

  /** True while this sequence is still the active one. */
  const isCurrentSequence = (generation: number): boolean =>
    playbackGenerationRef.current === generation;

  useEffect(() => {
    isLoopingRef.current = isLooping;
  }, [isLooping]);

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  const handleToggleLoop = () => {
    setIsLooping((prev) => !prev);
  };

  // Load custom modules from localStorage on mount, then reconcile the audio
  // cache against them: a deleted custom module leaves clips behind that are
  // unreachable but still count against the origin's quota, bringing eviction
  // of everything else closer.
  useEffect(() => {
    const stored = getStoredCustomModules();
    setCustomModules(stored);

    const knownIds = [...BUILTIN_MODULES, ...stored].map((m) => m.id);
    audioStorage
      .pruneOrphans(knownIds)
      .then((removed) => {
        if (removed > 0) console.info(`Removed ${removed} orphaned audio clip(s).`);
      })
      .catch(() => {});
  }, []);

  // Refresh cached line IDs when module changes
  const refreshCacheStatus = async (moduleId = currentModule.id) => {
    try {
      const ids = await audioStorage.getCachedLineIds(moduleId);
      setCachedLineIds(ids);
    } catch (e) {
      console.warn("Failed to check cached lines:", e);
    }
  };

  useEffect(() => {
    refreshCacheStatus(currentModule.id);
  }, [currentModule.id]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      playbackGenerationRef.current += 1;
      audioPlayer.stop();
      precacheAbortRef.current?.abort();
    };
  }, []);

  // Handle module selection
  const handleSelectModule = (mod: AncientGreekModule) => {
    handleStopPlayback();
    // A pre-cache run is scoped to one module; abandon it when leaving.
    precacheAbortRef.current?.abort();
    setPrecacheResult(null);
    setCurrentModule(mod);
    // Update default voices for the new module's speakers
    const newVoices: Record<string, VoiceName> = {};
    mod.speakers.forEach((s) => {
      newVoices[s.name] = s.defaultVoice || "Fenrir";
    });
    setSpeakerVoices(newVoices);
    refreshCacheStatus(mod.id);
  };

  const handleCustomModulesChange = () => {
    const updated = getStoredCustomModules();
    setCustomModules(updated);
  };

  const handleModuleImported = (newMod: AncientGreekModule) => {
    const updated = getStoredCustomModules();
    setCustomModules(updated);
    handleSelectModule(newMod);
    setActiveTab("dialogue");
  };

  const handleSetSpeakerVoice = (speakerName: string, voice: VoiceName) => {
    setSpeakerVoices((prev) => ({
      ...prev,
      [speakerName]: voice,
    }));
  };

  /**
   * Build the English stage direction for a line, plus the cache variant that
   * identifies the resulting audio.
   *
   * The variant folds in the previous line's identity: contextual audio for
   * line N depends on line N-1, so an edit upstream must not leave line N
   * serving audio generated under the old context.
   */
  const buildLineContext = (line: DialogueLine, mod: AncientGreekModule) => {
    if (!useContextualDelivery) return { context: undefined, variant: "" };

    const index = mod.lines.findIndex((l) => l.id === line.id);
    const previous = index > 0 ? mod.lines[index - 1] : null;
    const speaker = mod.speakers.find((sp) => sp.name === line.speaker);

    const context = {
      speakerName: line.speakerEn,
      speakerRole: speaker?.role || line.speakerRole,
      contextNote: line.contextNote,
      previousSpeakerName: previous?.speakerEn,
      previousContextNote: previous?.contextNote,
    };

    // Short, stable fingerprint of everything the rendering depends on.
    const fingerprint = JSON.stringify([
      context.speakerName,
      context.speakerRole,
      context.contextNote,
      context.previousSpeakerName,
      context.previousContextNote,
    ]);
    let hash = 0;
    for (let i = 0; i < fingerprint.length; i++) {
      hash = (hash * 31 + fingerprint.charCodeAt(i)) | 0;
    }

    return { context, variant: `ctx${(hash >>> 0).toString(36)}` };
  };

  /**
   * Fetch TTS audio for a line with IndexedDB caching
   */
  const fetchLineAudioBuffer = async (line: DialogueLine): Promise<AudioBuffer> => {
    const voice = speakerVoices[line.speaker] || line.recommendedVoice || "Fenrir";
    const { context, variant: ctxVariant } = buildLineContext(line, currentModule);
    const variant = `${ctxVariant}${settingsVariant(speechSettings)}`;

    // 1. Check IndexedDB cache first
    const cached = await audioStorage.getCachedAudio(currentModule.id, line.id, voice, variant);
    if (cached && cached.audioBase64) {
      return await audioPlayer.decodeAudio(cached.audioBase64, cached.mimeType);
    }

    // 2. Fetch from backend API
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: line.greekText,
        voice,
        speakerName: line.speakerEn,
        context,
        phrasing: speechSettings.connectedSpeech,
        accents: true,
        stressDensity: speechSettings.stressDensity,
        pronunciation: speechSettings.pronunciation,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to fetch speech for line #${line.id}`);
    }

    const data = await res.json();

    // 3. Save to IndexedDB cache
    await audioStorage.saveCachedAudio(
      currentModule.id,
      line.id,
      voice,
      data.audio,
      data.mimeType,
      line.greekText,
      variant
    );

    // Update cached lines set
    setCachedLineIds((prev) => new Set([...prev, line.id]));

    return await audioPlayer.decodeAudio(data.audio, data.mimeType);
  };

  /**
   * Pre-cache all audio lines of a module for offline and instantaneous playback.
   *
   * Cancellable: each iteration is a billed synthesis request, so a long run
   * must be stoppable and must abandon its in-flight request rather than
   * waiting for it. Failures are counted and reported instead of being
   * swallowed to the console - a run where every request 401s previously
   * reported as a clean completion.
   */
  const handlePrecacheAudio = async (mod: AncientGreekModule = currentModule) => {
    if (isPrecaching) return;

    const controller = new AbortController();
    precacheAbortRef.current = controller;

    // Ask for persistent storage before the first bulk download. Without it
    // the browser may evict this origin's storage wholesale under pressure,
    // losing a module the user deliberately downloaded.
    await audioStorage.requestPersistentStorage();

    setIsPrecaching(true);
    setPrecacheResult(null);
    setPrecacheProgress({ current: 0, total: mod.lines.length });

    let current = 0;
    let cached = 0;
    let failed = 0;
    let skipped = 0;

    for (const line of mod.lines) {
      if (controller.signal.aborted) break;

      const voice = speakerVoices[line.speaker] || line.recommendedVoice || "Fenrir";
      const { context, variant: ctxVariant } = buildLineContext(line, mod);
      const variant = `${ctxVariant}${settingsVariant(speechSettings)}`;
      const existing = await audioStorage.getCachedAudio(mod.id, line.id, voice, variant);

      if (existing) {
        skipped++;
      } else {
        try {
          const res = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: line.greekText,
              voice,
              speakerName: line.speakerEn,
              context,
              phrasing: speechSettings.connectedSpeech,
              accents: true,
              stressDensity: speechSettings.stressDensity,
              pronunciation: speechSettings.pronunciation,
            }),
            signal: controller.signal,
          });

          if (res.ok) {
            const data = await res.json();
            await audioStorage.saveCachedAudio(
              mod.id,
              line.id,
              voice,
              data.audio,
              data.mimeType,
              line.greekText,
              variant
            );
            cached++;
          } else {
            failed++;
            const err = await res.json().catch(() => ({}));
            console.warn(`Pre-cache failed for line #${line.id}:`, err.error || res.status);
          }
        } catch (err: any) {
          // An abort is a user action, not a failure.
          if (err?.name === "AbortError") break;
          failed++;
          console.warn(`Pre-cache failed for line #${line.id}:`, err);
        }
      }

      current++;
      setPrecacheProgress({ current, total: mod.lines.length });
    }

    // Keep the cache within budget, never evicting modules the user marked to
    // keep offline - automatic cleanup must not undo a deliberate download.
    try {
      const evicted = await audioStorage.evictLeastRecentlyUsed(
        AUDIO_CACHE_BUDGET_BYTES,
        [...getKeepOfflineIds(), mod.id]
      );
      if (evicted.removedClips > 0) {
        console.info(`Evicted ${evicted.removedClips} least-recently-used clip(s) to stay within budget.`);
      }
    } catch (err) {
      console.warn("Eviction pass failed:", err);
    }

    await refreshCacheStatus(mod.id);

    setPrecacheResult({ cached, failed, skipped, cancelled: controller.signal.aborted });
    precacheAbortRef.current = null;
    setIsPrecaching(false);
    setPrecacheProgress(null);
  };

  /** Stop a pre-cache run and abandon its in-flight request. */
  const handleCancelPrecache = () => {
    precacheAbortRef.current?.abort();
  };

  /**
   * Export the active module with full audio clips as a portable JSON package
   */
  const handleExportCurrentModule = async (mod: AncientGreekModule = currentModule) => {
    try {
      const pkg = await exportModuleWithAudio(mod, true);
      const safeId = mod.id.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
      downloadJsonFile(pkg, `greek-module-${safeId}.json`);
    } catch (err) {
      console.error("Export module error:", err);
      alert("Failed to export module package.");
    }
  };

  /**
   * Export the full library backup with all cached audio
   */
  const handleExportFullLibrary = async () => {
    try {
      const allModules = [...BUILTIN_MODULES, ...customModules];
      const pkg = await exportLibraryWithAudio(allModules, true);
      const dateStr = new Date().toISOString().slice(0, 10);
      downloadJsonFile(pkg, `ancient-greek-library-backup-${dateStr}.json`);
    } catch (err) {
      console.error("Export library error:", err);
      alert("Failed to export library backup.");
    }
  };

  /**
   * Play single line with synchronized word highlighting (supports loop repetition when isLooping is enabled)
   */
  const handlePlayLine = async (line: DialogueLine) => {
    const generation = beginPlaybackSequence();

    setPlaybackError(null);

    do {
      if (!isCurrentSequence(generation)) break;

      setBufferingLineId(line.id);
      setIsBuffering(true);
      setActiveWordIndex(null);

      try {
        const audioBuffer = await fetchLineAudioBuffer(line);
        if (!isCurrentSequence(generation)) break;

        setBufferingLineId(null);
        setIsBuffering(false);
        setActiveLineId(line.id);
        setIsPlaying(true);

        await new Promise<void>((resolve) => {
          audioPlayer.playBuffer(
            audioBuffer,
            playbackSpeedRef.current,
            () => {
              setActiveWordIndex(null);
              resolve();
            },
            line.words,
            (wordIndex) => {
              setActiveWordIndex(wordIndex);
            }
          );
        });

        // Small pause between line loops
        if (isLoopingRef.current && isCurrentSequence(generation)) {
          await new Promise((res) => setTimeout(res, lineRepeatGap(playbackSpeedRef.current)));
        }
      } catch (err: any) {
        console.error(err);
        // A superseded sequence must not report its error over the new one.
        if (!isCurrentSequence(generation)) break;
        setBufferingLineId(null);
        setIsBuffering(false);
        setActiveLineId(null);
        setActiveWordIndex(null);
        setIsPlaying(false);
        setPlaybackError(err.message || "Speech synthesis failed");
        break;
      }
    } while (isLoopingRef.current && isCurrentSequence(generation));

    // Only clear shared playback state if no newer sequence has taken over.
    if (isCurrentSequence(generation)) {
      setActiveLineId(null);
      setActiveWordIndex(null);
      setBufferingLineId(null);
      setIsBuffering(false);
      setIsPlaying(false);
    }
  };

  /**
   * Play entire dialogue sequentially with live line and word highlighting (supports continuous full module loop)
   */
  const handlePlayFullDialogue = async () => {
    const generation = beginPlaybackSequence();

    setIsPlaying(true);
    setPlaybackError(null);

    const lines = currentModule.lines;

    do {
      for (let i = 0; i < lines.length; i++) {
        if (!isCurrentSequence(generation)) break;

        const line = lines[i];
        setActiveLineId(line.id);
        setBufferingLineId(line.id);
        setIsBuffering(true);
        setActiveWordIndex(null);

        try {
          const audioBuffer = await fetchLineAudioBuffer(line);
          if (!isCurrentSequence(generation)) break;

          setIsBuffering(false);
          setBufferingLineId(null);

          // Wait for line to finish playing with live word updates
          await new Promise<void>((resolve) => {
            audioPlayer.playBuffer(
              audioBuffer,
              playbackSpeedRef.current,
              () => {
                setActiveWordIndex(null);
                resolve();
              },
              line.words,
              (wordIndex) => {
                setActiveWordIndex(wordIndex);
              }
            );
          });

          // Pause between dialogue turns, sized from punctuation and speaker
          // change rather than a fixed interval. See utils/dialogueTiming.
          if ((i < lines.length - 1 || isLoopingRef.current) && isCurrentSequence(generation)) {
            const nextLine = lines[i + 1] ?? (isLoopingRef.current ? lines[0] : null);
            await new Promise((res) =>
              setTimeout(res, gapAfter(line, nextLine, playbackSpeedRef.current))
            );
          }
        } catch (err: any) {
          console.error(err);
          // A superseded sequence must not report its error over the new one.
          if (!isCurrentSequence(generation)) break;
          setPlaybackError(err.message || "Failed during sequential playback");
          playbackGenerationRef.current += 1;
          break;
        }
      }

      // Pause between complete module loops
      if (isLoopingRef.current && isCurrentSequence(generation)) {
        await new Promise((res) => setTimeout(res, loopRestartGap(playbackSpeedRef.current)));
      }
    } while (isLoopingRef.current && isCurrentSequence(generation));

    // Only clear shared playback state if no newer sequence has taken over.
    if (isCurrentSequence(generation)) {
      setActiveLineId(null);
      setActiveWordIndex(null);
      setBufferingLineId(null);
      setIsBuffering(false);
      setIsPlaying(false);
    }
  };

  /**
   * Stop any running playback
   */
  const handleStopPlayback = () => {
    // Claim a generation nobody is running: every live sequence is invalidated.
    playbackGenerationRef.current += 1;
    audioPlayer.stop();
    setActiveLineId(null);
    setActiveWordIndex(null);
    setBufferingLineId(null);
    setIsBuffering(false);
    setIsPlaying(false);
  };

  /**
   * Pronounce a single word in the modal
   */
  const handlePlayWordTTS = async (wordText: string) => {
    // This had no error handling: an offline click rejected unhandled and the
    // modal's spinner simply stopped with no explanation. Route failures into
    // the same playbackError channel everything else uses.
    try {
      await synthesizeAndPlayWord(wordText);
    } catch (err: any) {
      console.error(err);
      setPlaybackError(
        isOnline
          ? err?.message || "Word pronunciation failed"
          : "You are offline. Words that have not been synthesized before need a connection."
      );
      throw err;
    }
  };

  const synthesizeAndPlayWord = async (wordText: string) => {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: wordText,
        voice: speakerVoices[currentModule.speakers[0]?.name] || "Fenrir",
        emotion: "clear, slow, and precise pedagogical pronunciation",
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Word pronunciation failed");
    }

    const data = await res.json();
    const buffer = await audioPlayer.decodeAudio(data.audio, data.mimeType);
    audioPlayer.playBuffer(buffer, 0.9);
  };

  /**
   * Custom TTS Synthesis
   */
  const handleSynthesizeCustomTTS = async (text: string, voice: VoiceName, emotion?: string) => {
    audioPlayer.stop();
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        voice,
        emotion,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to synthesize speech");
    }

    const data = await res.json();
    const buffer = await audioPlayer.decodeAudio(data.audio, data.mimeType);
    audioPlayer.playBuffer(buffer, playbackSpeed);
  };

  const handleOpenWordModal = (word: WordGloss, line: DialogueLine) => {
    setSelectedWord(word);
    setSelectedWordLine(line);
  };

  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#2D2A26] font-serif selection:bg-[#2D2A26] selection:text-[#F7F5F0] flex flex-col">
      
      {/* Top Header with Module Title */}

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={speechSettings}
        onSettingsChange={handleSettingsChange}
        currentModule={currentModule}
        modules={[...BUILTIN_MODULES, ...customModules]}
        speakerVoices={speakerVoices}
        onSetSpeakerVoice={handleSetSpeakerVoice}
        onStorageChanged={() => refreshCacheStatus(currentModule.id)}
        onExportModule={() => handleExportCurrentModule(currentModule)}
        onExportLibrary={handleExportFullLibrary}
        busy={isPlaying || isPrecaching}
      />

      {/* Main Container */}
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] items-start">

        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          currentModule={currentModule}
          onOpenSettings={() => setSettingsOpen(true)}
          moduleActions={
            <ModuleSelector
              compact
              currentModule={currentModule}
              customModules={customModules}
              onSelectModule={handleSelectModule}
              onOpenImporter={() => setActiveTab("importer")}
              onCustomModulesChange={handleCustomModulesChange}
            />
          }
          readingControls={
            activeTab === "dialogue" || activeTab === "book" ? (
              <ControlRail
                isPlaying={isPlaying}
                isBuffering={isBuffering}
                onPlayFullDialogue={handlePlayFullDialogue}
                onStopPlayback={handleStopPlayback}
                lineCount={currentModule.lines.length}
                playbackSpeed={playbackSpeed}
                setPlaybackSpeed={setPlaybackSpeed}
                isLooping={isLooping}
                onToggleLoop={handleToggleLoop}
                layout={activeTab === "book" ? "book" : dialogueLayoutView}
                setLayout={(l) => {
                  if (activeTab === "book") setActiveTab("dialogue");
                  handleSetLayout(l);
                }}
                displayMode={displayMode}
                setDisplayMode={setDisplayMode}
                bookLayout={bookLayout}
                setBookLayout={setBookLayout}
                fontSize={bookFontSize}
                setFontSize={setBookFontSize}
                showTransliteration={showTransliteration}
                setShowTransliteration={setShowTransliteration}
                cachedLineCount={cachedLineIds.size}
                isPrecaching={isPrecaching}
                precacheProgress={precacheProgress}
                onPrecacheAudio={() => handlePrecacheAudio(currentModule)}
                onCancelPrecache={handleCancelPrecache}
              />
            ) : undefined
          }
        />

        <main className="min-w-0 space-y-6 pb-20 lg:pb-0">
        
        {playbackError && (
          <div className="p-4 border-2 border-red-500 bg-[#FFFFFF] text-red-800 text-xs font-sans flex items-center justify-between">
            <span>{playbackError}</span>
            <button
              onClick={() => setPlaybackError(null)}
              className="text-xs uppercase font-bold tracking-widest text-[#2D2A26] border border-[#2D2A26] px-2 py-1 hover:bg-[#2D2A26] hover:text-[#F7F5F0] cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}



        {/* Tab 1: Interactive Dialogue View.
            Two columns on wide screens: the reading column keeps a comfortable
            measure while the controls occupy space that was empty. Below lg the
            rail collapses to a button that raises a sheet. */}
        {activeTab === "dialogue" && (
          <div className="space-y-6">
            
            {dialogueLayoutView === "cards" ? (
              <div className="space-y-4">
                {/* Cards has no frontispiece of its own, so it carries a slim
                    title. The book view prints one on its folio page. */}
                <div className="pb-1">
                  <span className="text-[10px] uppercase font-sans font-bold text-[#8B7355] tracking-[0.25em] block mb-1">
                    {currentModule.author || "Classical Text"} · {currentModule.stephanusRef || currentModule.genre.toUpperCase()}
                  </span>
                  <h1 className="text-xl sm:text-2xl font-serif text-[#2D2A26] leading-tight">
                    {currentModule.title}
                  </h1>
                  <p className="text-xs font-sans text-[#5C564E] mt-0.5">
                    {currentModule.titleEn} · {currentModule.lines.length} lines · {currentModule.difficulty}
                  </p>
                </div>

                {/* List of Dialogue Lines */}
                <div className="space-y-3.5">
                  {currentModule.lines.map((line) => (
                    <DialogueCard
                      key={line.id}
                      line={line}
                      isActive={activeLineId === line.id}
                      activeWordIndex={activeLineId === line.id ? activeWordIndex : null}
                      isLineBuffering={bufferingLineId === line.id}
                      isCached={cachedLineIds.has(line.id)}
                      displayMode={displayMode}
                      onPlayLine={handlePlayLine}
                      onSelectWord={handleOpenWordModal}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <BookFormatView
                module={currentModule}
                isPlaying={isPlaying}
                isBuffering={isBuffering}
                activeLineId={activeLineId}
                activeWordIndex={activeWordIndex}
                playbackSpeed={playbackSpeed}
                setPlaybackSpeed={setPlaybackSpeed}
                isLooping={isLooping}
                onToggleLoop={handleToggleLoop}
                onPlayLine={handlePlayLine}
                onPlayFullDialogue={handlePlayFullDialogue}
                onStopPlayback={handleStopPlayback}
                onSelectWord={handleOpenWordModal}
                layoutMode={bookLayout}
                fontSize={bookFontSize}
                showTransliteration={showTransliteration}
              />
            )}

          </div>
        )}

        {/* Tab: Standalone Book Edition */}
        {activeTab === "book" && (
          <BookFormatView
                module={currentModule}
                isPlaying={isPlaying}
                isBuffering={isBuffering}
                activeLineId={activeLineId}
                activeWordIndex={activeWordIndex}
                playbackSpeed={playbackSpeed}
                setPlaybackSpeed={setPlaybackSpeed}
                isLooping={isLooping}
                onToggleLoop={handleToggleLoop}
                onPlayLine={handlePlayLine}
                onPlayFullDialogue={handlePlayFullDialogue}
                onStopPlayback={handleStopPlayback}
                onSelectWord={handleOpenWordModal}
                layoutMode={bookLayout}
                fontSize={bookFontSize}
                showTransliteration={showTransliteration}
          />
        )}

        {/* Tab: AI Importer & Generator (Option 2) */}
        {activeTab === "importer" && (
          <ModuleImporter
            onModuleImported={handleModuleImported}
            onCancel={() => setActiveTab("dialogue")}
          />
        )}

        {/* Tab 2: Roleplay & Conversational Practice */}
        {activeTab === "roleplay" && (
          <RoleplayMode
            module={currentModule}
            onPlayLine={handlePlayLine}
            playbackSpeed={playbackSpeed}
          />
        )}

        {/* Tab 3: Custom TTS Studio */}
        {activeTab === "customTTS" && (
          <CustomTTSSection
            onSynthesizeTTS={handleSynthesizeCustomTTS}
          />
        )}

        {/* Tab 4: Grammar & Cultural Notes */}
        {activeTab === "grammar" && (
          <LinguisticNotes currentModule={currentModule} />
        )}

        </main>
      </div>

      {/* Word Morphology & Lexicon Modal */}
      <WordGlossModal
        word={selectedWord}
        line={selectedWordLine}
        onClose={() => {
          setSelectedWord(null);
          setSelectedWordLine(null);
        }}
        onPlayWordTTS={handlePlayWordTTS}
      />

      {/* Footer */}
      <footer className="border-t border-[#E5E1D8] bg-[#FFFFFF] py-6 mt-12 text-center text-xs font-sans text-[#5C564E]">
        <p className="font-serif text-[#2D2A26] text-sm">
          {currentModule.title} ({currentModule.titleEn})
        </p>
        <p className="text-[11px] font-mono text-[#5C564E] mt-1">
          Polytonic Ancient Greek Text-to-Speech synthesized with Google Gemini Flash TTS & Reconstructed Erasmian Phonetics
        </p>
      </footer>

    </div>
  );
}
