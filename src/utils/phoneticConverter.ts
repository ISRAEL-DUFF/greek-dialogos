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
      else if (pair === "ου") diphthongReplacement = "ou";
      else if (pair === "αυ") diphthongReplacement = "au";
      else if (pair === "ευ") diphthongReplacement = "eu";

      if (diphthongReplacement) {
        // Check for accent on first or second vowel
        const hasAccent1 = hasAccentInRange(chars, i + 1, nextBaseIndex);
        const hasAccent2 = hasAccentInRange(chars, nextBaseIndex + 1, findNextBaseCharIndex(chars, nextBaseIndex + 1));
        
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
    const hasAcute = hasAccentInRange(chars, i + 1, nextBoundary);

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
      result += isCapital ? "Zd" : "zd"; // Archaic double-consonant cluster
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

  // If first two characters form an initial diphthong (ai, ei, oi, ou, au, eu), check breathing on 2nd vowel
  if (secondBaseIndex !== -1) {
    const b1 = firstBase.toLowerCase();
    const b2 = chars[secondBaseIndex].toLowerCase();
    const pair = b1 + b2;
    if (["αι", "ει", "οι", "ου", "αυ", "ευ"].includes(pair)) {
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

function hasAccentInRange(chars: string[], start: number, end: number): boolean {
  const limit = end === -1 ? chars.length : end;
  for (let k = start; k < limit; k++) {
    if (
      chars[k] === ACUTE_ACCENT ||
      chars[k] === CIRCUMFLEX ||
      chars[k] === CIRCUMFLEX_COMBINING ||
      chars[k] === GRAVE_ACCENT
    ) {
      return true;
    }
  }
  return false;
}
