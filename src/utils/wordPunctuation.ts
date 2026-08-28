/**
 * Restore the punctuation that word-splitting drops.
 *
 * The generator is asked for "Individual Greek word" per entry in `words[]`,
 * so it strips punctuation — reasonably, since that field also feeds dictionary
 * lookup and the gloss. But every reading view renders `line.words`, not
 * `line.greekText`, so what the reader sees is unpunctuated Greek:
 *
 *   shown:  Πάνυ μὲν οὖν ἐπεὶ δὲ τὸ σῶμα δίχα ἐτμήθη ποθοῦν ἕκαστον
 *   actual: Πάνυ μὲν οὖν· ἐπεὶ δὲ τὸ σῶμα δίχα ἐτμήθη, ποθοῦν ἕκαστον
 *
 * On a text where the question mark is a semicolon and the ano teleia carries a
 * clause break, that is a real loss for a reader.
 *
 * `greekText` already holds the punctuation, so nothing needs regenerating and
 * no prompt changes: align the two and hand back the affixes. The word itself
 * stays clean, so lookup and audio are untouched.
 */

/** Punctuation Greek texts use, including the guillemets and the ano teleia. */
const PUNCTUATION = /[,.;·:!?«»“”"'()\[\]—–]/g;

/** Apostrophes marking elision. Part of the word visually, absent from lookup. */
const ELISION = /['’᾽ʼ]/g;

export interface WordAffix {
  /** Punctuation printed before the word, e.g. an opening guillemet. */
  before: string;
  /** Punctuation printed after it, e.g. a comma or the ano teleia. */
  after: string;
}

/** No punctuation. Exported so callers can index defensively. */
export const EMPTY_AFFIX: WordAffix = { before: "", after: "" };
const EMPTY = EMPTY_AFFIX;

/** Compare on letters alone: the generator may differ in punctuation and form. */
function core(token: string): string {
  return token.normalize("NFC").replace(PUNCTUATION, "").replace(ELISION, "").trim();
}

/**
 * Punctuation to print around each word, positionally.
 *
 * Returns one entry per word. If the line cannot be aligned confidently — the
 * generator split differently, or the words do not match the sentence — every
 * entry is empty, so the view renders exactly what it renders today. A wrong
 * comma is worse than a missing one.
 */
export function wordAffixes(
  greekText: string,
  words: { greek: string }[]
): WordAffix[] {
  const blank = words.map(() => EMPTY);
  if (!greekText || words.length === 0) return blank;

  const tokens = greekText.split(/\s+/).filter(Boolean);
  if (tokens.length !== words.length) return blank;

  const affixes: WordAffix[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (core(tokens[i]) !== core(words[i].greek)) return blank;

    // Everything before the first letter, and from the last letter onward.
    const token = tokens[i].normalize("NFC");
    // Elision marks come off too, so the apostrophe lands in `after` rather
    // than being swallowed: the word is "ἀλλ" for lookup, "ἀλλ’" on the page.
    const stripped = token.replace(PUNCTUATION, "").replace(ELISION, "");
    const firstLetter = stripped.length ? token.indexOf(stripped[0]) : -1;
    if (firstLetter === -1) {
      affixes.push(EMPTY);
      continue;
    }
    const lastLetter = token.lastIndexOf(stripped[stripped.length - 1]);
    affixes.push({
      before: token.slice(0, firstLetter),
      after: token.slice(lastLetter + 1),
    });
  }
  return affixes;
}
