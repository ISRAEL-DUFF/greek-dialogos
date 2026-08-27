/**
 * Reconstructed Attic IPA transcription.
 *
 * An alternative to the Latin respelling in phoneticConverter.ts. Latin
 * respelling is a workaround: it describes Greek sounds using English spelling
 * conventions, so every mapping is a guess about how the engine will read it,
 * and some sounds have no unambiguous spelling at all — English cannot write
 * the [t] / [tʰ] contrast, because aspiration is allophonic there.
 *
 * IPA states the sound directly. Nothing is inferred from orthography, so the
 * ambiguities the Latin scheme fights (ου as /aʊ/, th as /θ/, ai as /eɪ/)
 * simply do not arise.
 *
 * Target: reconstructed Attic of the 5th–4th century BCE.
 *
 * STATUS: implemented, tested, NOT the default.
 *
 * Compared by ear against the Latin scheme on real dialogue, Latin was judged
 * slightly better. Precision in the notation does not help if the engine does
 * not realise the symbols accurately, and a familiar pseudo-English string
 * evidently suits this model better than phonetic symbols do. That is a fact
 * about the current TTS model, not about IPA — so this path is kept: it is
 * reached with `notation: "ipa"` on /api/tts, and is worth re-testing whenever
 * the speech model changes.
 *
 * What it would buy if adopted: θ/τ, φ/π and χ/κ stay distinct (English
 * spelling cannot express that contrast at all); the iota subscript becomes
 * audible, so λόγῳ and λόγω differ; υ is a front rounded vowel rather than an
 * invented glide; and the circumflex recovers the length of α ι υ.
 */

import { groupPhonologicalWords } from "./phrasing.js";

const ROUGH = "̔";
const SMOOTH = "̓";
const ACUTE = "́";
const GRAVE = "̀";
const CIRCUMFLEX = "͂";
const CIRCUMFLEX_TILDE = "̃";
const IOTA_SUB = "ͅ";
const DIAERESIS = "̈";

const STRESS = "ˈ"; // ˈ primary stress, precedes the syllable
const LONG = "ː"; // ː
const NONSYL = "̯"; // ̯ marks the second element of a diphthong

/**
 * Diphthongs. ει and ου had already monophthongised in classical Attic —
 * ει to a close-mid long [eː], ου to a close long [uː] — which is why they
 * are not written with a glide.
 */
const DIPHTHONGS: Record<string, string> = {
  αι: "ai" + NONSYL,
  ει: "e" + LONG,
  οι: "oi" + NONSYL,
  υι: "yi" + NONSYL,
  αυ: "au" + NONSYL,
  ευ: "eu" + NONSYL,
  ου: "u" + LONG,
  ηυ: "ɛ" + LONG + "u" + NONSYL,
};

/** Single vowels. α ι υ are dichrona: length is unknowable from the spelling. */
const VOWELS: Record<string, string> = {
  α: "a",
  ε: "e",
  η: "ɛ" + LONG,
  ι: "i",
  ο: "o",
  υ: "y", // close front ROUNDED — not English "u"
  ω: "ɔ" + LONG,
};

const CONSONANTS: Record<string, string> = {
  β: "b",
  γ: "ɡ",
  δ: "d",
  ζ: "zd", // Attic cluster
  θ: "tʰ", // tʰ — aspirated stop, not the fricative [θ]
  κ: "k",
  λ: "l",
  μ: "m",
  ν: "n",
  ξ: "ks",
  π: "p",
  ρ: "r",
  σ: "s",
  ς: "s",
  τ: "t",
  φ: "pʰ", // pʰ
  χ: "kʰ", // kʰ
  ψ: "ps",
};

/** Consonants that may follow a stop in a Greek syllable onset. */
const LIQUID_OR_NASAL = new Set(["l", "r", "m", "n"]);
const STOPS = new Set(["p", "b", "t", "d", "k", "ɡ"]);

interface Segment {
  ipa: string;
  isVowel: boolean;
  accented: boolean;
}

function isMark(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return (c >= 0x0300 && c <= 0x036f) || ch === IOTA_SUB;
}

/**
 * Transcribe one word. Returns segments rather than a string so stress can be
 * positioned by structure instead of by counting characters — the arithmetic
 * that misplaced the accent in every implementation that tried it.
 */
function wordToSegments(word: string): Segment[] {
  const nfd = word.normalize("NFD");
  const chars = Array.from(nfd);

  // Which marks attach to which base character?
  const bases: { ch: string; marks: string[] }[] = [];
  for (const ch of chars) {
    if (isMark(ch)) {
      if (bases.length) bases[bases.length - 1].marks.push(ch);
    } else {
      bases.push({ ch, marks: [] });
    }
  }

  const segments: Segment[] = [];
  let roughBreathing = false;

  for (let i = 0; i < bases.length; i++) {
    const { ch, marks } = bases[i];
    const lower = ch.toLowerCase();
    const next = bases[i + 1];

    if (marks.includes(ROUGH)) roughBreathing = true;

    // A diphthong needs the second element to be free of a diaeresis, which
    // exists precisely to say "these two vowels are separate".
    if (next && !next.marks.includes(DIAERESIS) && !next.marks.includes(ROUGH + DIAERESIS)) {
      const pair = lower + next.ch.toLowerCase();
      if (DIPHTHONGS[pair]) {
        if (next.marks.includes(ROUGH)) roughBreathing = true;
        const accented =
          hasStress(marks) || hasStress(next.marks);
        segments.push({ ipa: DIPHTHONGS[pair], isVowel: true, accented });
        i++;
        continue;
      }
    }

    if (VOWELS[lower]) {
      let ipa = VOWELS[lower];
      // A circumflex can only sit on a long vowel or diphthong, so for the
      // dichrona — α ι υ, whose length the spelling never shows — the accent
      // itself tells us the quantity. Free information the Latin scheme
      // cannot express at all.
      if (
        (marks.includes(CIRCUMFLEX) || marks.includes(CIRCUMFLEX_TILDE)) &&
        !ipa.includes(LONG)
      ) {
        ipa += LONG;
      }
      // Iota subscript: the long diphthongs still had an audible glide in
      // classical Attic. Voiced here rather than dropped — the Latin scheme
      // drops it, which makes λόγῳ and λόγω identical.
      if (marks.includes(IOTA_SUB)) ipa += "i" + NONSYL;
      segments.push({ ipa, isVowel: true, accented: hasStress(marks) });
      continue;
    }

    if (lower === "γ" && next) {
      const n = next.ch.toLowerCase();
      if (n === "γ" || n === "κ" || n === "ξ" || n === "χ") {
        segments.push({ ipa: "ŋ", isVowel: false, accented: false });
        continue;
      }
    }

    if (CONSONANTS[lower]) {
      // Word-initial ῥ is voiceless.
      const ipa =
        lower === "ρ" && marks.includes(ROUGH) && segments.length === 0
          ? "r̥"
          : CONSONANTS[lower];
      segments.push({ ipa, isVowel: false, accented: false });
      continue;
    }

    // The elision apostrophe marks a vowel that is not there; it is
    // orthography, not sound, and must not reach the synthesiser.
    if (ch === "'" || ch === "\u2019" || ch === "\u1FBD" || ch === "\u02BC") continue;

    // Other punctuation passes through — it drives pausing.
    segments.push({ ipa: ch, isVowel: false, accented: false });
  }

  if (roughBreathing) {
    const first = segments[0];
    // ῥ already carries its aspiration as devoicing.
    if (!(first && first.ipa === "r̥")) {
      segments.unshift({ ipa: "h", isVowel: false, accented: false });
    }
  }

  return segments;
}

/**
 * Acute and circumflex mark stress; the grave does not. A grave is an accent
 * suppressed before a following word — the one syllable that should not be
 * emphasised.
 */
function hasStress(marks: string[]): boolean {
  return (
    marks.includes(ACUTE) ||
    marks.includes(CIRCUMFLEX) ||
    marks.includes(CIRCUMFLEX_TILDE)
  );
}

/**
 * Place the stress mark before the onset of the accented syllable.
 *
 * IPA puts ˈ before the whole syllable, not on the vowel, so we walk back from
 * the accented nucleus over the consonants that can legally begin a syllable:
 * one consonant always, two when the pair is a stop followed by a liquid or
 * nasal (πρ, τρ, κλ …), which Greek admits as an onset.
 */
function placeStress(segments: Segment[]): string {
  const nucleus = segments.findIndex((s) => s.isVowel && s.accented);
  if (nucleus < 0) return segments.map((s) => s.ipa).join("");

  let onset = nucleus;
  const prev = segments[nucleus - 1];
  if (prev && !prev.isVowel) {
    onset = nucleus - 1;
    const prev2 = segments[nucleus - 2];
    if (
      prev2 &&
      !prev2.isVowel &&
      STOPS.has(prev2.ipa.replace("ʰ", "")) &&
      LIQUID_OR_NASAL.has(prev.ipa)
    ) {
      onset = nucleus - 2;
    }
  }

  return segments
    .map((s, i) => (i === onset ? STRESS + s.ipa : s.ipa))
    .join("");
}

/** Transcribe a single word to IPA. */
export function convertWordToIPA(word: string): string {
  if (!word) return "";
  return placeStress(wordToSegments(word));
}

export interface IPAOptions {
  /** Group proclitics and enclitics with their hosts. Default true. */
  phrasing?: boolean;
}

/**
 * Transcribe a line to IPA, grouped into phonological words.
 *
 * Reuses the phrasing engine unchanged: which words fuse is a fact about
 * Greek, independent of the notation the result is written in. Fusion is a
 * plain concatenation here — the digraph hazard that forces a guard in the
 * Latin scheme (`egoh` + `eimi`) cannot arise, because IPA symbols are not
 * spellings and `h` is only ever [h].
 */
export function convertToIPAForm(text: string, options: IPAOptions = {}): string {
  if (!text) return "";
  const usePhrasing = options.phrasing !== false;

  if (!usePhrasing) {
    return text
      .split(/\s+/)
      .filter(Boolean)
      .map(convertWordToIPA)
      .join(" ");
  }

  return groupPhonologicalWords(text)
    .map((group) => group.words.map(convertWordToIPA).join(""))
    .join(" ");
}
