export interface WordGloss {
  greek: string;
  transliteration: string;
  partOfSpeech: string;
  root: string;
  meaning: string;
  grammarDetails: string;
}

export interface DialogueLine {
  id: number;
  speaker: string;
  speakerEn: string;
  speakerRole?: string;
  greekText: string;
  transliteration: string;
  englishTranslation: string;
  modernGreekTranslation: string;
  words: WordGloss[];
  recommendedVoice?: VoiceName;
  contextNote?: string;
}

export interface ModuleSpeaker {
  name: string;
  nameEn: string;
  role?: string;
  defaultVoice: VoiceName;
}

export interface SyntaxPoint {
  title: string;
  greekExample: string;
  transliteration?: string;
  explanation: string;
}

export interface PhilologicalNote {
  citation?: string;
  greekTerm: string;
  commentary: string;
  rhetoricalDevice?: string;
}

export interface ModuleHistoricalContext {
  period: string;
  historicalSetting: string;
  authorialBackground: string;
  culturalSignificance: string;
  stephanusOrBekkerNote?: string;
}

export interface ModuleCommentary {
  historicalContext?: ModuleHistoricalContext;
  grammaticalSyntax?: SyntaxPoint[];
  philologicalNotes?: PhilologicalNote[];
  dialectNotes?: string;
}

/**
 * Where a module's Greek comes from.
 *
 * This matters in a tool that presents text in the visual language of a
 * critical edition. A learner has no way to tell a genuine citation from an
 * invented one, and a Stephanus-style reference makes both look equally
 * authoritative — so the distinction is recorded rather than implied.
 *
 *  - "transmitted" — quoted from a text with a manuscript tradition
 *  - "adapted"     — based on a real work, but reworded or simplified
 *  - "composed"    — written for teaching; no manuscript tradition exists
 */
export type TextProvenance = "transmitted" | "adapted" | "composed";

export interface AncientGreekModule {
  id: string;
  title: string;
  titleEn: string;
  author?: string;
  genre: "dialogue" | "fable" | "philosophy" | "narrative" | "epic" | "history";
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  stephanusRef?: string;
  description: string;
  speakers: ModuleSpeaker[];
  lines: DialogueLine[];
  commentary?: ModuleCommentary;
  isCustom?: boolean;
  createdAt?: string;
  /** Defaults to "composed" when absent: the safer claim to make. */
  provenance?: TextProvenance;
}

/**
 * The six prebuilt voices supported by the TTS backend.
 * Declared as a runtime array so the server can validate incoming `voice`
 * values against the same source of truth the client's types derive from.
 */
export const VOICE_NAMES = ["Fenrir", "Puck", "Kore", "Charon", "Zephyr", "Aoede"] as const;

export type VoiceName = (typeof VOICE_NAMES)[number];

export interface VoiceOption {
  id: VoiceName;
  name: string;
  gender: "Male" | "Female";
  tone: string;
  idealFor: string;
}

export type DisplayMode = "all" | "greek-only" | "greek-english" | "interlinear";

export interface AudioPlaybackState {
  isPlaying: boolean;
  activeLineId: number | null;
  playbackSpeed: number;
  isBuffering: boolean;
  currentMode: "idle" | "full-dialogue" | "line-by-line" | "custom";
}

export interface CachedAudioExportItem {
  audioBase64: string;
  mimeType: string;
  voice: VoiceName | string;
  text?: string;
}

export interface ModuleExportPackage {
  formatVersion: "1.0" | "2.0";
  packageType: "single-module";
  exportedAt: string;
  module: AncientGreekModule;
  audioMap?: Record<number, CachedAudioExportItem>;
}

export interface LibraryExportPackage {
  formatVersion: "1.0" | "2.0";
  packageType: "library-backup";
  exportedAt: string;
  modules: AncientGreekModule[];
  audioMaps?: Record<string, Record<number, CachedAudioExportItem>>;
}

