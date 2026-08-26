import React, { useState, useRef } from "react";
import { Sparkles, BookOpen, Wand2, UploadCloud, CheckCircle2, AlertCircle, ArrowRight, Loader2, RotateCcw, FileText, ChevronRight, Download, HardDrive, Volume2, FileCode, Check } from "lucide-react";
import { AncientGreekModule, VoiceName } from "../types";
import { AVAILABLE_VOICES, saveCustomModule } from "../data/dialogueData";
import { parseImportPayload, ParsedImportResult } from "../utils/modulePackage";
import { audioStorage } from "../utils/audioStorage";

interface ModuleImporterProps {
  onModuleImported: (module: AncientGreekModule) => void;
  onCancel?: () => void;
}

const PRESET_TOPICS = [
  {
    title: "Diogenes & Alexander the Great",
    description: "Diogenes tells Alexander to get out of his sunlight in Corinth.",
    genre: "dialogue",
    difficulty: "Beginner",
    prompt: "A lively classical dialogue between the Cynic philosopher Diogenes and the young King Alexander the Great in Corinth, where Alexander asks if he can do any favor, and Diogenes replies 'Stand a little out of my sun'.",
  },
  {
    title: "Xenophon's Anabasis: Thalatta! Thalatta!",
    description: "The Ten Thousand Greeks finally reach the Black Sea shouting 'The Sea! The Sea!'.",
    genre: "narrative",
    difficulty: "Intermediate",
    prompt: "A dramatic historical narrative and dialogue of the Greek Ten Thousand reaching Mount Theches and shouting 'Θάλαττα! Θάλαττα!' (The Sea! The Sea!) upon seeing the Euxine Sea.",
  },
  {
    title: "Symposium: Aristophanes on Soulmates",
    description: "Plato's myth of the original human nature and the pursuit of wholeness.",
    genre: "philosophy",
    difficulty: "Intermediate",
    prompt: "An excerpt dialogue from Plato's Symposium where Aristophanes explains the ancient myth of original human spherical nature and how love is the pursuit of our missing half.",
  },
  {
    title: "Aesop: The Fox and the Grapes",
    description: "The classic fable on rationalizing disappointment (ὄμφακες εἰσιν).",
    genre: "fable",
    difficulty: "Beginner",
    prompt: "The classic Aesop's fable of the hungry Fox and the high-hanging grapes, concluding with the famous proverb that the grapes were sour anyway.",
  },
];

const PRESET_RAW_GREEK = [
  {
    title: "Gospel of John 1:1-3 (Koine / Atticized)",
    author: "Biblical Greek",
    text: "Ἐν ἀρχῇ ἦν ὁ λόγος, καὶ ὁ λόγος ἦν πρὸς τὸν θεόν, καὶ θεὸς ἦν ὁ λόγος. οὗτος ἦν ἐν ἀρχῇ πρὸς τὸν θεόν. πάντα δι' αὐτοῦ ἐγένετο, καὶ χωρὶς αὐτοῦ ἐγένετο οὐδὲ ἕν.",
  },
  {
    title: "Plato's Meno: Socratic Questioning",
    author: "Plato",
    text: "ΜΕΝΩΝ: Ἔχεις μοι εἰπεῖν, ὦ Σώκρατες, ἆρα διδακτὸν ἡ ἀρετή; ἢ οὐ διδακτόν, ἀλλ' ἀσκητόν; ΣΩΚΡΑΤΗΣ: Ὦ Μένων, πρὸ τοῦ μὲν Θετταλοὶ εὐδόκιμοι ἦσαν ἐν τοῖς Ἕλλησι καὶ ἐθαυμάζοντο ἐφ' ἱππικῇ τε καὶ πλούτῳ, νῦν δέ, ὡς ἐμοὶ δοκεῖ, καὶ ἐπὶ σοφίᾳ.",
  },
];

export const ModuleImporter: React.FC<ModuleImporterProps> = ({
  onModuleImported,
  onCancel,
}) => {
  const [mode, setMode] = useState<"generate" | "paste" | "package">("generate");
  const [prompt, setPrompt] = useState("");
  const [rawGreekText, setRawGreekText] = useState("");
  const [pastedJson, setPastedJson] = useState("");
  const [genre, setGenre] = useState<"dialogue" | "fable" | "philosophy" | "narrative" | "drama">("dialogue");
  const [difficulty, setDifficulty] = useState<"Beginner" | "Intermediate" | "Advanced">("Beginner");
  
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [generatedModule, setGeneratedModule] = useState<AncientGreekModule | null>(null);
  const [parsedPackage, setParsedPackage] = useState<ParsedImportResult | null>(null);
  const [importedAudioCount, setImportedAudioCount] = useState<number>(0);
  const [isImportingPackage, setIsImportingPackage] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleApplyPresetPrompt = (preset: typeof PRESET_TOPICS[0]) => {
    setPrompt(preset.prompt);
    setGenre(preset.genre as any);
    setDifficulty(preset.difficulty as any);
  };

  const handleApplyPresetGreek = (preset: typeof PRESET_RAW_GREEK[0]) => {
    setRawGreekText(preset.text);
    setGenre("philosophy");
  };

  const handleProcessJsonText = (jsonStr: string) => {
    setError(null);
    setPastedJson(jsonStr);
    const result = parseImportPayload(jsonStr);
    if (!result.success) {
      setError(result.error || "Failed to parse JSON module package.");
      setParsedPackage(null);
    } else {
      setParsedPackage(result);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      handleProcessJsonText(text);
    };
    reader.onerror = () => {
      setError("Failed to read file.");
    };
    reader.readAsText(file);
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      handleProcessJsonText(text);
    };
    reader.onerror = () => {
      setError("Failed to read dropped file.");
    };
    reader.readAsText(file);
  };

  const handleExecutePackageImport = async () => {
    if (!parsedPackage || parsedPackage.modules.length === 0) return;
    setIsImportingPackage(true);
    setError(null);

    try {
      let audioTracksSaved = 0;

      for (const mod of parsedPackage.modules) {
        // Mark as custom if not default
        const moduleToSave: AncientGreekModule = {
          ...mod,
          isCustom: true,
          createdAt: mod.createdAt || new Date().toISOString(),
        };
        saveCustomModule(moduleToSave);

        // Import associated audio map into IndexedDB
        const modAudioMap = parsedPackage.audioMaps[mod.id];
        if (modAudioMap && Object.keys(modAudioMap).length > 0) {
          const count = await audioStorage.importModuleAudioMap(mod.id, modAudioMap);
          audioTracksSaved += count;
        }
      }

      setImportedAudioCount(audioTracksSaved);
      // Select the first imported module and open it
      onModuleImported(parsedPackage.modules[0]);
    } catch (err: any) {
      console.error("Error importing package:", err);
      setError(err.message || "Failed to complete package import.");
    } finally {
      setIsImportingPackage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setGeneratedModule(null);

    if (mode === "package") {
      if (parsedPackage) {
        await handleExecutePackageImport();
      } else {
        setError("Please upload a .json file or paste valid JSON first.");
      }
      return;
    }

    const input = mode === "generate" ? prompt.trim() : rawGreekText.trim();
    if (!input) {
      setError(mode === "generate" ? "Please enter a topic or description." : "Please paste Greek text.");
      return;
    }

    setIsLoading(true);
    setLoadingStep("Connecting to Attic Philology Engine with Gemini 3.7 Flash...");

    try {
      const stepTimer1 = setTimeout(() => {
        setLoadingStep("Structuring polytonic orthography and speaker dialogue turns...");
      }, 1500);

      const stepTimer2 = setTimeout(() => {
        setLoadingStep("Synthesizing Reconstructed Erasmian phonetics and LSJ morphological glosses...");
      }, 3500);

      const res = await fetch("/api/ai-import-module", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText: mode === "paste" ? rawGreekText : undefined,
          topicPrompt: mode === "generate" ? prompt : undefined,
          genre,
          difficulty,
        }),
      });

      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to generate module from text.");
      }

      const data = await res.json();
      if (!data.module || !data.module.lines || data.module.lines.length === 0) {
        throw new Error("Received empty or malformed module from AI engine.");
      }

      const mod: AncientGreekModule = data.module;
      setGeneratedModule(mod);
      setIsLoading(false);
    } catch (err: any) {
      console.error("Module import error:", err);
      setError(err.message || "An unexpected error occurred while generating the study module.");
      setIsLoading(false);
    }
  };

  const handleSaveAndStudy = () => {
    if (!generatedModule) return;
    saveCustomModule(generatedModule);
    onModuleImported(generatedModule);
  };

  return (
    <div className="bg-[#FFFFFF] border-2 border-[#2D2A26] p-6 sm:p-8 space-y-6">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-[#E5E1D8]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#2D2A26] text-[#F7F5F0] flex items-center justify-center font-serif text-xl font-bold border border-[#2D2A26]">
            <Wand2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-sans font-bold text-[#8B7355] tracking-[0.25em] block">
              AI Module Importer & Synthesizer
            </span>
            <h2 className="text-xl sm:text-2xl font-serif font-normal text-[#2D2A26]">
              Import New Ancient Greek Text
            </h2>
          </div>
        </div>

        {onCancel && (
          <button
            onClick={onCancel}
            className="px-3 py-1.5 border border-[#2D2A26] text-[10px] font-sans font-bold uppercase tracking-widest text-[#2D2A26] hover:bg-[#2D2A26] hover:text-[#F7F5F0] cursor-pointer"
          >
            Close
          </button>
        )}
      </div>

      {!generatedModule ? (
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Mode Switcher */}
          <div className="flex flex-wrap items-center gap-2 p-1.5 bg-[#F7F5F0] border border-[#2D2A26]">
            <button
              type="button"
              onClick={() => setMode("generate")}
              className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 py-2 px-3 text-xs uppercase font-sans font-bold tracking-wider transition-all cursor-pointer ${
                mode === "generate"
                  ? "bg-[#2D2A26] text-[#F7F5F0]"
                  : "text-[#5C564E] hover:text-[#2D2A26]"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Topic Generation</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("paste")}
              className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 py-2 px-3 text-xs uppercase font-sans font-bold tracking-wider transition-all cursor-pointer ${
                mode === "paste"
                  ? "bg-[#2D2A26] text-[#F7F5F0]"
                  : "text-[#5C564E] hover:text-[#2D2A26]"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>AI Parse Greek Passage</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("package")}
              className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 py-2 px-3 text-xs uppercase font-sans font-bold tracking-wider transition-all cursor-pointer ${
                mode === "package"
                  ? "bg-[#2D2A26] text-[#F7F5F0]"
                  : "text-[#5C564E] hover:text-[#2D2A26]"
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>Import JSON Package + Audio</span>
            </button>
          </div>

          {/* Package Mode (Drag-and-Drop or Paste JSON with embedded audio) */}
          {mode === "package" && (
            <div className="space-y-4">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".json,application/json"
                className="hidden"
              />

              {/* Drag and drop zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed p-6 text-center transition-all cursor-pointer ${
                  isDragOver
                    ? "border-[#8B7355] bg-[#F7F5F0]"
                    : "border-[#2D2A26] bg-[#FAFAF7] hover:bg-[#FFFFFF]"
                }`}
              >
                <UploadCloud className="w-8 h-8 mx-auto text-[#8B7355] mb-2" />
                <span className="text-xs uppercase font-sans font-bold text-[#2D2A26] tracking-wider block">
                  Drop .JSON Module or Library Backup File Here
                </span>
                <span className="text-[11px] text-[#5C564E] font-sans mt-1 block">
                  or click to browse your files (supports modules exported with full audio tracks)
                </span>
              </div>

              {/* Or paste raw JSON */}
              <div>
                <label className="block text-[11px] uppercase font-sans font-bold text-[#2D2A26] tracking-wider mb-1.5">
                  Or Paste JSON Export Payload
                </label>
                <textarea
                  rows={4}
                  value={pastedJson}
                  onChange={(e) => handleProcessJsonText(e.target.value)}
                  placeholder='Paste {"packageType": "single-module", "module": {...}, "audioMap": {...}} or raw module JSON...'
                  className="w-full bg-[#F7F5F0] border-2 border-[#2D2A26] p-3 text-xs font-mono text-[#2D2A26] placeholder-[#8B7355]/60 focus:outline-none focus:bg-[#FFFFFF] transition-colors"
                />
              </div>

              {/* Parsed Package Preview */}
              {parsedPackage && parsedPackage.success && (
                <div className="p-4 bg-[#F7F5F0] border-2 border-[#2D2A26] space-y-3">
                  <div className="flex items-center justify-between border-b border-[#E5E1D8] pb-2">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-700" />
                      <span className="text-xs font-sans font-bold uppercase tracking-wider text-emerald-800">
                        Valid Package Detected ({parsedPackage.modules.length} {parsedPackage.modules.length === 1 ? "module" : "modules"})
                      </span>
                    </div>
                    {parsedPackage.totalAudioTracks > 0 ? (
                      <span className="text-[10px] font-mono font-bold bg-[#2D2A26] text-[#F7F5F0] px-2 py-0.5 flex items-center gap-1">
                        <Volume2 className="w-3 h-3 text-[#8B7355]" />
                        {parsedPackage.totalAudioTracks} Audio Tracks (Offline Ready)
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-[#5C564E] bg-[#FFFFFF] border border-[#E5E1D8] px-2 py-0.5">
                        Text-Only (Audio synthesizes on demand)
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    {parsedPackage.modules.map((m, idx) => (
                      <div key={idx} className="p-3 bg-[#FFFFFF] border border-[#E5E1D8] flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-serif font-bold text-[#2D2A26]">{m.title}</h4>
                          <p className="text-[11px] font-sans italic text-[#5C564E]">{m.titleEn} • {m.lines.length} lines • {m.difficulty}</p>
                        </div>
                        <span className="text-[10px] font-mono text-[#8B7355] border border-[#8B7355] px-1.5 py-0.5">
                          {parsedPackage.audioMaps[m.id] ? Object.keys(parsedPackage.audioMaps[m.id]).length : 0} audio clips
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Prompt Mode Fields */}
          {mode === "generate" && (
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] uppercase font-sans font-bold text-[#2D2A26] tracking-wider mb-1.5">
                  Topic, Scene, or Classical Dialogue Prompt
                </label>
                <textarea
                  rows={4}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. A conversation between Aristotle and Alexander the Great discussing the ethics of friendship and leadership in the Lyceum..."
                  className="w-full bg-[#F7F5F0] border-2 border-[#2D2A26] p-3 text-sm font-serif text-[#2D2A26] placeholder-[#8B7355]/60 focus:outline-none focus:bg-[#FFFFFF] transition-colors"
                />
              </div>

              {/* Inspiration Presets */}
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase font-sans font-bold text-[#8B7355] tracking-widest block">
                  Quick Classical Presets (Click to load):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PRESET_TOPICS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleApplyPresetPrompt(preset)}
                      className="text-left p-2.5 border border-[#E5E1D8] bg-[#F7F5F0] hover:border-[#2D2A26] hover:bg-[#FFFFFF] transition-all cursor-pointer flex flex-col"
                    >
                      <span className="text-xs font-serif font-bold text-[#2D2A26]">{preset.title}</span>
                      <span className="text-[11px] text-[#5C564E] font-sans mt-0.5 line-clamp-1">{preset.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Paste Greek Mode Fields */}
          {mode === "paste" && (
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] uppercase font-sans font-bold text-[#2D2A26] tracking-wider mb-1.5">
                  Ancient Greek Text (Polytonic or standard)
                </label>
                <textarea
                  rows={5}
                  value={rawGreekText}
                  onChange={(e) => setRawGreekText(e.target.value)}
                  placeholder="Paste any Classical Greek passage (Plato, Homer, Lysias, Aesop, New Testament, Xenophon)..."
                  className="w-full bg-[#F7F5F0] border-2 border-[#2D2A26] p-3 text-sm font-serif text-[#2D2A26] placeholder-[#8B7355]/60 focus:outline-none focus:bg-[#FFFFFF] transition-colors font-greek"
                />
              </div>

              {/* Greek Presets */}
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase font-sans font-bold text-[#8B7355] tracking-widest block">
                  Sample Greek Passages:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PRESET_RAW_GREEK.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleApplyPresetGreek(preset)}
                      className="text-left p-2.5 border border-[#E5E1D8] bg-[#F7F5F0] hover:border-[#2D2A26] hover:bg-[#FFFFFF] transition-all cursor-pointer flex flex-col"
                    >
                      <span className="text-xs font-serif font-bold text-[#2D2A26]">{preset.title}</span>
                      <span className="text-[11px] text-[#5C564E] font-sans mt-0.5 font-mono">{preset.author}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Parameters: Genre & Difficulty (only for generate & paste modes) */}
          {mode !== "package" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#E5E1D8]">
              <div>
                <label className="block text-[10px] uppercase font-sans font-bold text-[#2D2A26] tracking-wider mb-1">
                  Literary Genre
                </label>
                <select
                  value={genre}
                  onChange={(e) => setGenre(e.target.value as any)}
                  className="w-full bg-[#F7F5F0] border border-[#2D2A26] p-2 text-xs font-sans font-semibold text-[#2D2A26] focus:outline-none cursor-pointer"
                >
                  <option value="dialogue">Philosophical / Conversational Dialogue</option>
                  <option value="fable">Aesopic Fable (Mythos)</option>
                  <option value="philosophy">Philosophical Discourse</option>
                  <option value="narrative">Historical Narrative (Herodotus/Xenophon style)</option>
                  <option value="drama">Classical Drama / Tragedy Excerpt</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-sans font-bold text-[#2D2A26] tracking-wider mb-1">
                  Pedagogical Difficulty
                </label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as any)}
                  className="w-full bg-[#F7F5F0] border border-[#2D2A26] p-2 text-xs font-sans font-semibold text-[#2D2A26] focus:outline-none cursor-pointer"
                >
                  <option value="Beginner">Beginner (Clear syntax, standard Attic vocabulary)</option>
                  <option value="Intermediate">Intermediate (Participles, subjunctive, varied idiom)</option>
                  <option value="Advanced">Advanced (Complex periodic sentences, rare vocabulary)</option>
                </select>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3.5 border-2 border-red-500 bg-[#FFFFFF] text-red-700 text-xs font-sans flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Submit Action */}
          <div className="pt-2">
            {mode === "package" ? (
              <button
                type="submit"
                disabled={!parsedPackage || isImportingPackage}
                className="w-full py-3.5 bg-[#2D2A26] text-[#F7F5F0] border-2 border-[#2D2A26] text-xs font-sans font-bold uppercase tracking-[0.2em] hover:bg-[#8B7355] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isImportingPackage ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Unpacking Modules & Caching Audio in IndexedDB...</span>
                  </>
                ) : (
                  <>
                    <HardDrive className="w-4 h-4 text-[#8B7355]" />
                    <span>
                      Import {parsedPackage ? `${parsedPackage.modules.length} Module(s)` : "JSON Package"} & Store Audio (IndexedDB)
                    </span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 bg-[#2D2A26] text-[#F7F5F0] border-2 border-[#2D2A26] text-xs font-sans font-bold uppercase tracking-[0.2em] hover:bg-[#8B7355] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{loadingStep || "Synthesizing Module via Gemini AI..."}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Generate Complete Study Module</span>
                  </>
                )}
              </button>
            )}
            <p className="text-[11px] text-[#5C564E] font-sans text-center mt-2">
              {mode === "package"
                ? "Restores full classical texts, glosses, phonetic models, and embedded audio tracks locally for instant zero-latency playback."
                : "Powered by Gemini 3.7 Flash with strict polytonic Greek parsing, Reconstructed Erasmian phonetic transliteration, and Liddell-Scott-Jones lexicon morphological tagging."}
            </p>
          </div>

        </form>
      ) : (
        /* Generated Module Preview Card */
        <div className="space-y-6">
          
          <div className="p-5 bg-[#F7F5F0] border-2 border-[#2D2A26] space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-[#E5E1D8] pb-3">
              <div className="flex items-center gap-2 text-[#2D2A26]">
                <CheckCircle2 className="w-5 h-5 text-emerald-700" />
                <span className="text-xs uppercase font-sans font-bold tracking-widest text-emerald-800">
                  Module Successfully Generated & Parsed
                </span>
              </div>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 border border-[#2D2A26] bg-[#FFFFFF]">
                {generatedModule.lines.length} Dialogue Lines • {generatedModule.difficulty}
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-sans font-bold text-[#8B7355] tracking-widest block">
                {generatedModule.author} • {generatedModule.stephanusRef || "Classical Text"}
              </span>
              <h3 className="text-xl font-serif text-[#2D2A26] font-normal mt-0.5">
                {generatedModule.title}
              </h3>
              <p className="text-xs font-serif italic text-[#5C564E] mt-0.5">
                {generatedModule.titleEn}
              </p>
              <p className="text-xs font-sans text-[#2D2A26] mt-2 leading-relaxed bg-[#FFFFFF] p-3 border border-[#E5E1D8]">
                {generatedModule.description}
              </p>
            </div>

            {/* Speakers */}
            <div className="space-y-1.5">
              <span className="text-[10px] uppercase font-sans font-bold text-[#8B7355] tracking-widest block">
                Speakers in Module:
              </span>
              <div className="flex flex-wrap gap-2">
                {generatedModule.speakers.map((sp, idx) => (
                  <div key={idx} className="flex items-center gap-2 px-3 py-1 bg-[#FFFFFF] border border-[#2D2A26] text-xs">
                    <span className="font-serif font-bold text-[#2D2A26]">{sp.name}</span>
                    <span className="text-[#8B7355] text-[10px] font-sans">({sp.nameEn} - {sp.role})</span>
                    <span className="text-[10px] font-mono text-[#5C564E] border-l border-[#E5E1D8] pl-2">Voice: {sp.defaultVoice || "Fenrir"}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview of first 2 lines */}
            <div className="space-y-2 pt-2 border-t border-[#E5E1D8]">
              <span className="text-[10px] uppercase font-sans font-bold text-[#8B7355] tracking-widest block">
                Sample Excerpt:
              </span>
              {generatedModule.lines.slice(0, 2).map((l) => (
                <div key={l.id} className="p-3 bg-[#FFFFFF] border border-[#E5E1D8] space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-sans font-bold text-[#8B7355]">
                    <span>{l.speaker} ({l.speakerEn})</span>
                    <span className="font-mono text-[10px]">#{l.id}</span>
                  </div>
                  <p className="text-sm font-serif text-[#2D2A26] font-greek">{l.greekText}</p>
                  <p className="text-xs font-sans text-[#5C564E] italic">"{l.englishTranslation}"</p>
                </div>
              ))}
            </div>

          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={handleSaveAndStudy}
              className="flex-1 w-full py-3.5 bg-[#2D2A26] text-[#F7F5F0] border-2 border-[#2D2A26] text-xs font-sans font-bold uppercase tracking-[0.2em] hover:bg-[#8B7355] transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <BookOpen className="w-4 h-4" />
              <span>Load & Study In Interactive Reader</span>
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => setGeneratedModule(null)}
              className="w-full sm:w-auto px-5 py-3.5 border-2 border-[#2D2A26] bg-[#FFFFFF] text-[#2D2A26] text-xs font-sans font-bold uppercase tracking-wider hover:bg-[#F7F5F0] cursor-pointer flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Generate Another</span>
            </button>
          </div>

        </div>
      )}

    </div>
  );
};
