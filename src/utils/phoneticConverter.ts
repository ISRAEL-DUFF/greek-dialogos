/**
 * Reconstructed Ancient Greek Phonetic Transcriber
 * 
 * Transforms polytonic Ancient Greek script into a customized Latin-character phonetic string
 * strictly following the Reconstructed Attic / Erasmian pronunciation rules to bypass Modern Greek
 * phonology in TTS engines.
 */

// Decomposition combining marks
const ROUGH_BREATHING = "\u0314"; // Dasia
const SMOOTH_BREATHING = "\u0313"; // Psili
const ACUTE_ACCENT = "\u0301"; // Oxia / Tonos
const GRAVE_ACCENT = "\u0300"; // Varia
const CIRCUMFLEX = "\u0342"; // Perispomeni
const CIRCUMFLEX_COMBINING = "\u0303"; // Tilde / Perispomeni
const IOTA_SUBSCRIPT = "\u0345"; // Ypogegrammeni
const DIAERESIS = "\u0308"; // Dialytika

export interface PhoneticOptions {
  preserveAccents?: boolean;
}

/**
 * Transforms an Ancient Greek word or sentence into Reconstructed Attic Latin phonetics.
 */
export function convertToReconstructedPhonetics(text: string, options: PhoneticOptions = {}): string {
  if (!text) return "";

  // Split by word boundaries while preserving punctuation and spacing
  const tokens = text.split(/([\s,.;·:!?«»"“”()—]+)/);

  return tokens
    .map((token) => {
      // If whitespace or punctuation, return as-is
      if (!token || /^[\s,.;·:!?«»"“”()—]+$/.test(token)) {
        return token;
      }
      return convertSingleGreekWord(token, options);
    })
    .join("");
}

function convertSingleGreekWord(word: string, options: PhoneticOptions = {}): string {
  if (!word) return "";

  // Normalize to NFD to separate base characters from breathing marks and accents
  const nfd = word.normalize("NFD");
  
  // Check if word begins with rough breathing on initial vowel/consonant or initial diphthong
  const hasInitialRoughBreathing = checkWordInitialRoughBreathing(nfd);
  
  let result = "";
  let i = 0;
  const chars = Array.from(nfd);
  const len = chars.length;

  const isFirstCharCapital = word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase();

  // If initial rough breathing was detected, prepend 'h' / 'H'
  if (hasInitialRoughBreathing) {
    result += isFirstCharCapital ? "H" : "h";
  }

  while (i < len) {
    const ch = chars[i];

    // Skip standalone combining marks as they are handled contextually
    if (
      ch === ROUGH_BREATHING ||
      ch === SMOOTH_BREATHING ||
      ch === IOTA_SUBSCRIPT ||
      ch === "\u0304" || // Macron
      ch === "\u0306" // Breve
    ) {
      i++;
      continue;
    }

    // 1. COMPOSITE DIPHTHONGS (Check 2-vowel pairs first)
    const nextBaseIndex = findNextBaseCharIndex(chars, i + 1);
    if (nextBaseIndex !== -1) {
      const base1 = ch.toLowerCase();
      const base2 = chars[nextBaseIndex].toLowerCase();
      const pair = base1 + base2;

      let diphthongReplacement: string | null = null;

      if (pair === "αι") diphthongReplacement = "ai";
      else if (pair === "ει") diphthongReplacement = "ei";
      else if (pair === "οι") diphthongReplacement = "oi";
      // ου is [uː]. "ou" is one of the most ambiguous vowel spellings in
      // English — /aʊ/ (out), /uː/ (soup), /ʌ/ (touch), /oʊ/ (soul) — and its
      // most frequent reading, /aʊ/, is the one we least want, because that is
      // αυ's value. "oo" is near-unambiguous for /uː/ (moon, food, soon).
      //
      // Adopted independently of the rest of the diphthong family: this one
      // strictly REDUCES ambiguity and collides with nothing (ο is "o", ω is
      // "oh", υ is "u"), so it cannot make matters worse however the engine
      // reads it. The others trade one ambiguity for another and are still
      // pending a listening test — see docs/FIX-PLAN.md P2-4.
      else if (pair === "ου") diphthongReplacement = "oo";
      else if (pair === "αυ") diphthongReplacement = "au";
      else if (pair === "ευ") diphthongReplacement = "eu";

      if (diphthongReplacement) {
        // Check for accent on first or second vowel
        const hasAccent1 = hasStressAccentInRange(chars, i + 1, nextBaseIndex);
        const hasAccent2 = hasStressAccentInRange(chars, nextBaseIndex + 1, findNextBaseCharIndex(chars, nextBaseIndex + 1));
        
        let out = diphthongReplacement;
        if (options.preserveAccents && (hasAccent1 || hasAccent2)) {
          out = diphthongReplacement[0] + "\u0301" + diphthongReplacement.slice(1);
        }

        // Preserve capitalization if first character was capitalized and no initial 'H' was prepended
        if (ch === ch.toUpperCase() && ch !== ch.toLowerCase() && !hasInitialRoughBreathing) {
          out = out.charAt(0).toUpperCase() + out.slice(1);
        }

        result += out;
        i = (findNextBaseCharIndex(chars, nextBaseIndex + 1) === -1) 
          ? len 
          : findNextBaseCharIndex(chars, nextBaseIndex + 1);
        continue;
      }
    }

    // 2. NASAL GAMMA COMBINATIONS (γγ -> ng, γκ -> nk, γξ -> nx, γχ -> nkh)
    if (ch.toLowerCase() === "γ" && nextBaseIndex !== -1) {
      const nextBase = chars[nextBaseIndex].toLowerCase();
      if (nextBase === "γ" || nextBase === "κ" || nextBase === "ξ" || nextBase === "χ") {
        const isCap = ch === "Γ" && !hasInitialRoughBreathing && result.length === 0;
        result += isCap ? "N" : "n";
        i++;
        continue;
      }
    }

    // 3. VOWEL RESTORATION (Maintain open and long vowel values)
    const lowerCh = ch.toLowerCase();
    const isCapital = ch === ch.toUpperCase() && ch !== ch.toLowerCase();

    // Check accent on this character
    const nextBoundary = findNextBaseCharIndex(chars, i + 1);
    const hasAcute = hasStressAccentInRange(chars, i + 1, nextBoundary);

    if (lowerCh === "η") {
      // η -> "eh" (Prevents modern "ee" shifting)
      let val = "eh";
      if (options.preserveAccents && hasAcute) val = "éh";
      if (isCapital && result.length === 0 && !hasInitialRoughBreathing) val = "Eh";
      result += val;
      i = nextBoundary === -1 ? len : nextBoundary;
      continue;
    }

    if (lowerCh === "ω") {
      // ω -> "oh" (Prevents clipping to short modern "o")
      let val = "oh";
      if (options.preserveAccents && hasAcute) val = "óh";
      if (isCapital && result.length === 0 && !hasInitialRoughBreathing) val = "Oh";
      result += val;
      i = nextBoundary === -1 ? len : nextBoundary;
      continue;
    }

    if (lowerCh === "α") {
      let val = options.preserveAccents && hasAcute ? "á" : "a";
      if (isCapital && result.length === 0 && !hasInitialRoughBreathing) val = val.toUpperCase();
      result += val;
      i = nextBoundary === -1 ? len : nextBoundary;
      continue;
    }

    if (lowerCh === "ε") {
      let val = options.preserveAccents && hasAcute ? "é" : "e";
      if (isCapital && result.length === 0 && !hasInitialRoughBreathing) val = val.toUpperCase();
      result += val;
      i = nextBoundary === -1 ? len : nextBoundary;
      continue;
    }

    if (lowerCh === "ι") {
      let val = options.preserveAccents && hasAcute ? "í" : "i";
      if (isCapital && result.length === 0 && !hasInitialRoughBreathing) val = val.toUpperCase();
      result += val;
      i = nextBoundary === -1 ? len : nextBoundary;
      continue;
    }

    if (lowerCh === "ο") {
      let val = options.preserveAccents && hasAcute ? "ó" : "o";
      if (isCapital && result.length === 0 && !hasInitialRoughBreathing) val = val.toUpperCase();
      result += val;
      i = nextBoundary === -1 ? len : nextBoundary;
      continue;
    }

    if (lowerCh === "υ") {
      let val = options.preserveAccents && hasAcute ? "ú" : "u";
      if (isCapital && result.length === 0 && !hasInitialRoughBreathing) val = val.toUpperCase();
      result += val;
      i = nextBoundary === -1 ? len : nextBoundary;
      continue;
    }

    // 4. CONSONANT RECLAMATION (Force hard ancient stops instead of modern fricatives)
    if (lowerCh === "β") {
      result += isCapital ? "B" : "b";
    } else if (lowerCh === "γ") {
      result += isCapital ? "G" : "g";
    } else if (lowerCh === "δ") {
      result += isCapital ? "D" : "d";
    } else if (lowerCh === "ζ") {
      // [z], the Erasmian classroom value. The Attic [zd] cluster is a
      // *reconstruction*, not an Erasmian convention, and it was the one
      // mapping here that belonged to the other tradition — which is why the
      // scheme used to be labelled "Reconstructed Attic/Erasmian".
      // Readers who want [zd] select Reconstructed, where the IPA path gives it.
      result += isCapital ? "Z" : "z";
    } else if (lowerCh === "θ") {
      result += isCapital ? "Th" : "th";
    } else if (lowerCh === "φ") {
      result += isCapital ? "Ph" : "ph";
    } else if (lowerCh === "χ") {
      result += isCapital ? "Kh" : "kh";
    } else if (lowerCh === "ρ") {
      // If ῥ, rough breathing was handled at word start, or if internal ῤ/ῥ
      result += isCapital ? "R" : "r";
    } else if (lowerCh === "κ") {
      result += isCapital ? "K" : "k";
    } else if (lowerCh === "λ") {
      result += isCapital ? "L" : "l";
    } else if (lowerCh === "μ") {
      result += isCapital ? "M" : "m";
    } else if (lowerCh === "ν") {
      result += isCapital ? "N" : "n";
    } else if (lowerCh === "ξ") {
      result += isCapital ? "X" : "x";
    } else if (lowerCh === "π") {
      result += isCapital ? "P" : "p";
    } else if (lowerCh === "σ" || lowerCh === "ς") {
      result += isCapital ? "S" : "s";
    } else if (lowerCh === "τ") {
      result += isCapital ? "T" : "t";
    } else if (lowerCh === "ψ") {
      result += isCapital ? "Ps" : "ps";
    } else if (/^[a-zA-Z0-9]$/.test(ch)) {
      // Latin character or digit passed as-is
      result += ch;
    } else if (!isCombiningMark(ch)) {
      result += ch;
    }

    i = nextBoundary === -1 ? len : nextBoundary;
  }

  // The prepended aspirate carries the word's capital, so the letter after it
  // must not also be capitalized: Ῥώμη is Hrohmeh, not HRohmeh. Vowels already
  // transcribe lowercase, so this only shows up on initial rho — but "HR" is
  // read as an initialism by a TTS engine, not as an aspirated rho.
  if (hasInitialRoughBreathing && isFirstCharCapital && result.length > 1) {
    return result[0] + result[1].toLowerCase() + result.slice(2);
  }

  return result;
}

/**
 * Checks whether the word begins with rough breathing ( ̔ )
 * Either on first letter, or on second letter if it's an initial diphthong (e.g. αἱ, οἱ, οὑ, εὑ).
 */
function checkWordInitialRoughBreathing(nfdWord: string): boolean {
  const chars = Array.from(nfdWord);
  if (chars.length === 0) return false;

  // Check combining marks attached to 1st base character
  const firstBase = chars[0];
  const secondBaseIndex = findNextBaseCharIndex(chars, 1);

  // If first character is rho and has rough breathing (ῥ / Ῥ)
  if (firstBase.toLowerCase() === "ρ") {
    const endOfFirstMarks = secondBaseIndex === -1 ? chars.length : secondBaseIndex;
    for (let k = 1; k < endOfFirstMarks; k++) {
      if (chars[k] === ROUGH_BREATHING) return true;
    }
  }

  // Check marks on first vowel
  const endFirst = secondBaseIndex === -1 ? chars.length : secondBaseIndex;
  for (let k = 1; k < endFirst; k++) {
    if (chars[k] === ROUGH_BREATHING) return true;
  }

  // A word-initial diphthong carries its breathing on the SECOND vowel, so the
  // mark must be looked for there. This list is the eight Attic diphthongs:
  // ηυ and υι were previously missing, which silently dropped the aspirate
  // from words like ηὗρον and υἱός.
  if (secondBaseIndex !== -1) {
    const b1 = firstBase.toLowerCase();
    const b2 = chars[secondBaseIndex].toLowerCase();
    const pair = b1 + b2;
    if (["αι", "ει", "οι", "υι", "ου", "αυ", "ευ", "ηυ"].includes(pair)) {
      const thirdBaseIndex = findNextBaseCharIndex(chars, secondBaseIndex + 1);
      const endSecond = thirdBaseIndex === -1 ? chars.length : thirdBaseIndex;
      for (let k = secondBaseIndex + 1; k < endSecond; k++) {
        if (chars[k] === ROUGH_BREATHING) return true;
      }
    }
  }

  return false;
}

function findNextBaseCharIndex(chars: string[], fromIndex: number): number {
  for (let idx = fromIndex; idx < chars.length; idx++) {
    if (!isCombiningMark(chars[idx])) {
      return idx;
    }
  }
  return -1;
}

function isCombiningMark(char: string): boolean {
  const code = char.charCodeAt(0);
  // Unicode combining diacritical marks block 0300-036F and 0340-034F
  return (code >= 0x0300 && code <= 0x036f) || (code >= 0x1dc0 && code <= 0x1dff) || (code >= 0x20d0 && code <= 0x20ff);
}

/**
 * Does this range carry an accent that should be SPOKEN as stress?
 *
 * Acute and circumflex are stresses. The grave is not: it marks an oxytone
 * whose accent is suppressed before a following word — precisely a syllable
 * that should NOT be emphasised. Marking it would place stress exactly where
 * Greek removes it.
 *
 * Note this is a different question from "does this word carry an accent at
 * all", which is what clitic detection needs — there a grave still counts,
 * because a word with a suppressed accent is not a clitic. That check lives in
 * phrasing.ts as isAccented.
 */
function hasStressAccentInRange(chars: string[], start: number, end: number): boolean {
  const limit = end === -1 ? chars.length : end;
  for (let k = start; k < limit; k++) {
    if (
      chars[k] === ACUTE_ACCENT ||
      chars[k] === CIRCUMFLEX ||
      chars[k] === CIRCUMFLEX_COMBINING
    ) {
      return true;
    }
  }
  return false;
}


/**
 * Pass 2 — transcribe a phonologically grouped line into the string sent to TTS.
 *
 * Each word is transcribed INDEPENDENTLY and only then joined at the seam.
 * That ordering is the whole point.
 *
 * An earlier implementation fused the Greek words first and transcribed the
 * fused token, which loses the association between a word and its own
 * diacritics: scanning `αὐτοῦ-οὗ` as one token finds the rough breathing that
 * belongs to οὗ and prepends the aspirate to the front of the phrase, giving
 * `howtoo-oo` for a word that carries smooth breathing. Transcribing first
 * keeps every mark attached to the word that owns it.
 */

import { groupPhonologicalWords, isProsodicallyWeak, PhraseGroup } from "./phrasing.js";

const VOWEL_START = /^[aeiouāēīōū]/i;
const CONSONANT_END = /[bcdfghjklmnpqrstvwxyz]$/i;
const TRAILING_ELISION = /['’᾽ʼ]$/;

/**
 * Would fusing these two transcriptions create a sound that is in neither word?
 *
 * Our long vowels are digraphs — η is `eh`, ω is `oh` — so a word ending in one
 * followed by a vowel-initial word produces an `h` sitting directly before a
 * vowel, which reads as an aspirate. `ἐγώ` + `εἰμι` fuses to `egoheimi`, and an
 * English-reading engine says *ego-HAY-mee*, inventing a rough breathing on a
 * word that has smooth breathing.
 *
 * Fusion must never introduce a phoneme. Where it would, the words stay
 * separate: losing one juncture costs some smoothness, while a spurious
 * aspirate is the exact class of error this project rejected Modern
 * pronunciation to avoid.
 */
function fusionWouldDistort(left: string, right: string): boolean {
  return /h$/i.test(left) && VOWEL_START.test(right);
}

/**
 * Join two already-transcribed words at a phonological seam.
 *
 * Greek word-final consonants are limited to ν, ρ, ς plus the κ/ξ of οὐκ and
 * ἐκ, so the set of resyllabification sites is small and enumerable.
 *
 * The second element is lowercased: a capital inside a token (`HoBoréas`) can
 * be read as an initialism, and case carries no phonological information here.
 * Display capitalization lives in the separate `transliteration` field.
 */
function joinAtSeam(left: string, right: string): string {
  const tail = right.charAt(0).toLowerCase() + right.slice(1);

  // An elided word has lost its final vowel; the apostrophe is orthography,
  // not sound, and must not survive into speech.
  if (TRAILING_ELISION.test(left)) {
    const stem = left.replace(TRAILING_ELISION, "");
    return fusionWouldDistort(stem, tail) ? `${stem} ${tail}` : stem + tail;
  }

  if (fusionWouldDistort(left, tail)) return `${left} ${tail}`;

  // An aspirate meeting a rough breathing writes the same sound twice:
  // οὐχ αὑτή gave "ookhhauteh". The χ of οὐχ is aspirated *because* of the
  // following h, so one h carries both. Restricted to the aspirate digraphs —
  // "eh"/"oh" are long vowels, and dropping their h would delete the vowel.
  if (/(kh|th|ph)$/i.test(left) && /^h/i.test(tail)) {
    return left + tail.slice(1);
  }

  // Consonant + vowel: the consonant becomes the onset of the next syllable.
  // This is why οὐκ exists at all — the κ is there to avoid hiatus.
  return left + tail;
}

/**
 * How many words carry a stress mark.
 *
 * Greek orthography accents nearly every word, but speech does not give every
 * word prominence. Marking them all tells the engine to emphasise everything,
 * which sounds hammered and — because prominence is relative — flattens the
 * contour it was meant to create.
 *
 *  - "all"    every accented word. Orthographically faithful, prosodically wrong.
 *  - "phrase" one nuclear stress per phrase, on its last accented word. Closest
 *             to how a sentence is actually spoken.
 *  - "none"   no marks; rely on phrasing alone.
 */
export type StressDensity = "all" | "phrase" | "none";

/**
 * Words that never carry the nuclear stress, even though the orthography
 * accents them. ὦ is the clear case: a vocative particle leaning on the name
 * that follows, yet written with a circumflex.
 */
const NEVER_STRESSED = new Set(["ω", "ωι"]);

/**
 * May this word carry the group's stress mark?
 *
 * A bound function word taking the accent is worse than leaving the group
 * unmarked — `téhn anthrohpínehn` puts the prominence on the article. The
 * mark belongs on the group's lexical head.
 */
function canTakeStress(word: string): boolean {
  return !NEVER_STRESSED.has(bareWord(word)) && !isProsodicallyWeak(word);
}

/**
 * Sentence-final punctuation only. A comma is a minor break that does not
 * start a new intonational phrase — treating it as one gives "Χαῖρε," its own
 * nuclear stress, so a three-word greeting ends up with two prominences.
 */
const PHRASE_FINAL = /[.;·;!?]$/;

export interface SpokenFormOptions extends PhoneticOptions {
  /** Set false to transcribe word-by-word, i.e. the pre-phrasing behaviour. */
  phrasing?: boolean;
  /** Default "phrase". Ignored unless preserveAccents is on. */
  stressDensity?: StressDensity;
}

/** Strip diacritics and punctuation for a lexical lookup. */
function bareWord(word: string): string {
  return word
    .normalize("NFD")
    .replace(/[\u0300-\u036f\u0345]/g, "")
    .replace(/[^\p{L}]/gu, "")
    .toLowerCase();
}

function isAccentedWord(word: string): boolean {
  const nfd = word.normalize("NFD");
  return /[\u0301\u0342\u0303]/.test(nfd) && !NEVER_STRESSED.has(bareWord(word));
}

/**
 * Produce the string handed to the speech engine.
 *
 * With `phrasing: false` this is byte-identical to
 * convertToReconstructedPhonetics, so the previous behaviour remains available
 * for comparison and as a fallback.
 */
export function convertToSpokenForm(text: string, options: SpokenFormOptions = {}): string {
  if (!text) return "";
  // Word-by-word still respects the stress setting. Previously this returned
  // early, so with phrasing off all three densities produced the same fully
  // accented string and the control silently did nothing.
  const groups: PhraseGroup[] =
    options.phrasing === false
      ? text.split(/\s+/).filter(Boolean).map((w) => ({ words: [w], join: "none" as const }))
      : groupPhonologicalWords(text);
  const density: StressDensity = options.stressDensity ?? "phrase";
  const wantAccents = Boolean(options.preserveAccents) && density !== "none";

  // Decide, per group, whether it may carry a stress mark.
  const allowed = new Array<boolean>(groups.length).fill(wantAccents);

  if (wantAccents && density === "phrase") {
    allowed.fill(false);
    let start = 0;
    for (let i = 0; i < groups.length; i++) {
      const isLast = i === groups.length - 1;
      const endsHere = PHRASE_FINAL.test(groups[i].words[groups[i].words.length - 1]);
      if (!endsHere && !isLast) continue;

      // Nuclear stress falls on the last accented word of the phrase.
      for (let j = i; j >= start; j--) {
        if (groups[j].words.some((w) => isAccentedWord(w) && canTakeStress(w))) {
          allowed[j] = true;
          break;
        }
      }
      start = i + 1;
    }
  }

  return groups
    .map((group, index) => {
      const groupOptions = { ...options, preserveAccents: allowed[index] };
      return group.words
        .map((word) =>
          convertToReconstructedPhonetics(
            word,
            // Never let an excluded particle take the mark within its group.
            groupOptions.preserveAccents && canTakeStress(word)
              ? groupOptions
              : { ...groupOptions, preserveAccents: false }
          )
        )
        .reduce((acc, part) => (acc ? joinAtSeam(acc, part) : part), "");
    })
    .join(" ");
}
