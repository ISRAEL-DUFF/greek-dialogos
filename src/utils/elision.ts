/**
 * The marks Greek uses for elision, in one place.
 *
 * This set was previously written out four times — in phrasing, in both
 * transcribers and in the word-display alignment — and the copies had drifted.
 * All four listed U+1FBD GREEK KORONIS but none listed U+1FBF GREEK PSILI,
 * which is visually near-identical and just as common in real texts. A line
 * beginning `Ἆρ᾿ οἶσθα` was therefore not recognised as elided at all: the two
 * words never fused, and the bare `᾿` was passed through to the speech engine.
 *
 * Anything that has to recognise an elision mark imports from here.
 */

/** Every codepoint seen marking elision, straight, curly, and Greek-specific. */
export const ELISION_MARKS = [
  "'", // APOSTROPHE
  "’", // RIGHT SINGLE QUOTATION MARK
  "‘", // LEFT SINGLE QUOTATION MARK — appears in some typesettings
  "᾽", // GREEK KORONIS
  "᾿", // GREEK PSILI
  "ʼ", // MODIFIER LETTER APOSTROPHE
] as const;

const CLASS = `[${ELISION_MARKS.join("")}]`;

/** Matches an elision mark anywhere. Fresh instance: the flag is stateful. */
export const elisionAnywhere = (): RegExp => new RegExp(CLASS, "g");

/** Matches an elision mark only at the end of a token. */
export const ELISION_FINAL = new RegExp(`${CLASS}$`);

/** Is this character an elision mark? */
export function isElisionMark(ch: string): boolean {
  return (ELISION_MARKS as readonly string[]).includes(ch);
}
