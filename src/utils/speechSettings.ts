/**
 * Speech settings — how a line is turned into sound.
 *
 * These were previously three ad-hoc toggles scattered through the playback
 * bar plus a constant in App.tsx. Collecting them here gives one place to
 * reason about, one place to persist, and one value to fold into the audio
 * cache key.
 */

import { StressDensity } from "./phoneticConverter";

/**
 * Which pronunciation of Ancient Greek to synthesize.
 *
 * These are genuinely different scholarly traditions, not presentation
 * options, and the choice changes what a learner can hear.
 */
export type PronunciationScheme = "modern" | "erasmian" | "reconstructed";

export interface SpeechSettings {
  pronunciation: PronunciationScheme;
  /** Group proclitics and enclitics with their hosts. */
  connectedSpeech: boolean;
  /** How many words carry a stress mark. */
  stressDensity: StressDensity;
  /** Tell the model who is speaking and what they are answering. */
  contextualDelivery: boolean;
  /**
   * Highlight each word as it is spoken.
   *
   * Off by default. The highlight is driven by an *estimate* — word timings are
   * predicted from the transcription's shape, since the engine returns audio
   * with no timing information. Connected speech made that estimate worse, not
   * better: once words are fused into phonological groups and the engine is
   * told not to pause between them, there are no longer per-word boundaries to
   * predict, and the marker drifts behind the voice.
   *
   * A marker pointing at the wrong word is worse than no marker, so this is
   * opt-in until the timings come from the audio rather than from a guess.
   */
  wordHighlight: boolean;
}

export const DEFAULT_SETTINGS: SpeechSettings = {
  pronunciation: "erasmian",
  connectedSpeech: true,
  stressDensity: "none",
  contextualDelivery: false,
  wordHighlight: false,
};

/** Reference material for the settings UI. Written for a learner, not a linguist. */
export const SCHEME_INFO: Record<
  PronunciationScheme,
  { label: string; summary: string; tradeoff: string; sample: string }
> = {
  modern: {
    label: "Modern Greek",
    summary:
      "How Greek is read aloud in Greece today, and the standard method in Greek schools and universities.",
    tradeoff:
      "Flows most naturally, because the model is reading a language it knows. But η ι υ ει οι all merge to “ee”, so λύει, λύῃ and λύοι sound identical — three different moods you can no longer hear apart.",
    sample: "Χαῖρε, ὦ φίλε! Ποῖ βαδίζεις;",
  },
  erasmian: {
    label: "Erasmian",
    summary:
      "The classroom pronunciation used in most English-speaking universities since the 16th century.",
    tradeoff:
      "Keeps every vowel distinct, so the grammar stays audible. Not historically authentic — it is a teaching convention from the 16th century, not a reconstruction.",
    sample: "Khaire, oh phile! Poi badizeis;",
  },
  reconstructed: {
    label: "Reconstructed Attic",
    summary:
      "Scholarly reconstruction of 5th-century Athenian speech, written in phonetic notation.",
    tradeoff:
      "The most accurate: aspirated θ φ χ stay distinct from τ π κ, vowel length is marked, υ is a rounded vowel, and the iota subscript is audible. The engine handles phonetic symbols less smoothly than letters, so it can sound more deliberate.",
    sample: "ˈkʰai̯re, ˈɔː ˈpʰile! ˈpoi̯ baˈdizdeːs;",
  },
};

const STORAGE_KEY = "greek_dialogos_speech_settings";

function isScheme(v: unknown): v is PronunciationScheme {
  return v === "modern" || v === "erasmian" || v === "reconstructed";
}
function isDensity(v: unknown): v is StressDensity {
  return v === "all" || v === "phrase" || v === "none";
}

export function loadSettings(): SpeechSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    // Validate each field rather than trusting the blob: a stale or
    // hand-edited value must not put the engine into an undefined state.
    return {
      pronunciation: isScheme(parsed?.pronunciation)
        ? parsed.pronunciation
        : DEFAULT_SETTINGS.pronunciation,
      connectedSpeech:
        typeof parsed?.connectedSpeech === "boolean"
          ? parsed.connectedSpeech
          : DEFAULT_SETTINGS.connectedSpeech,
      stressDensity: isDensity(parsed?.stressDensity)
        ? parsed.stressDensity
        : DEFAULT_SETTINGS.stressDensity,
      contextualDelivery:
        typeof parsed?.contextualDelivery === "boolean"
          ? parsed.contextualDelivery
          : DEFAULT_SETTINGS.contextualDelivery,
      wordHighlight:
        typeof parsed?.wordHighlight === "boolean"
          ? parsed.wordHighlight
          : DEFAULT_SETTINGS.wordHighlight,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: SpeechSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn("Could not persist speech settings:", err);
  }
}

/**
 * Short, stable fingerprint of everything that changes how a line sounds.
 *
 * Folded into the audio cache key so a settings change never serves a clip
 * rendered under different settings. Contextual delivery is excluded: it has
 * its own per-line hash, since it depends on the neighbouring line too. Word
 * highlighting is excluded because it changes nothing about the audio —
 * including it would re-render every clip to toggle a visual aid.
 */
/**
 * Bumped whenever the transcribers change what they emit for the same settings.
 *
 * Without this, improving the phrasing rules leaves every previously cached clip
 * keyed as if it were current, and the app confidently serves audio rendered by
 * the old engine — the same class of fault as a colliding cache key, just slower
 * to notice.
 *
 * Generation 6: both transcribed schemes carry fuller delivery instructions in
 * the speech prompt. The prompt is not part of the variant, so without this bump
 * a line already cached under the same settings would keep playing its old
 * delivery — and an A/B of a prompt edit would silently compare nothing.
 *
 * Generation 5: U+1FBF GREEK PSILI recognised as an elision mark, so `Ἆρ᾿
 * οἶσθα` fuses instead of leaking the bare mark to the engine; a form that is
 * both proclitic and enclitic now reads as proclitic.
 *
 * Generation 4: in Reconstructed, a rough breathing and a stress mark no longer
 * escape outside leading punctuation — «ὁ was transcribed h«o.
 *
 * Generation 3: a group with no live accent promotes its rightmost grave, so a
 * clause subject like ὁ Ζεὺς is no longer left flat; homograph gates for
 * ἆρα/ἄρα, ἀλλά/ἄλλα, εἰ/εἶ, ἡ/ἤ; an aspirate meeting a rough breathing writes
 * one h.
 *
 * Generation 2: prosodically weak function words (the article, prepositions,
 * καί, postpositive particles) now bind to their neighbours and never carry the
 * stress mark; stress density is honoured word-by-word and in Reconstructed.
 * Modern is deliberately excluded — it is passed through untranscribed, so none
 * of that changed a single byte of its output, and churning its cache would
 * cost real credits for identical audio.
 */
const TRANSCRIBER_GENERATION = "6";

export function settingsVariant(settings: SpeechSettings): string {
  const scheme = settings.pronunciation[0]; // m / e / r
  const flow = settings.connectedSpeech ? "f" : "-";
  const stress = settings.stressDensity[0]; // a / p / n
  const base = `${scheme}${flow}${stress}`;
  return settings.pronunciation === "modern" ? base : `${base}${TRANSCRIBER_GENERATION}`;
}
