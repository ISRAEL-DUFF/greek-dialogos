/**
 * Pass 1 — phonological phrasing.
 *
 * Greek is not spoken one orthographic word at a time. Proclitics lean forward
 * onto the following word, enclitics lean back onto the preceding one, and an
 * elided word fuses with what follows. Our transcriber split on whitespace and
 * converted each word alone, so the speech model received a list of isolated
 * tokens and pronounced them in citation form.
 *
 * This groups words into the units they are actually spoken as, before any
 * character mapping happens.
 *
 * WHY THE ACCENT IS THE DISAMBIGUATOR
 * -----------------------------------
 * The hard cases look unsolvable without parsing: interrogative τίς and
 * indefinite τις are the same letters, as are ποῖ and ποι, ἔστι and ἐστι.
 *
 * But Greek orthography already encodes the distinction. Clitics are, by
 * definition, words that carry no accent of their own — that is *why* they lean
 * on a neighbour. The interrogatives are accented; the indefinites are not.
 *
 * So the test is not "is this word in a list" but "is this word in the list AND
 * unaccented". Stripping diacritics before the lookup — as earlier drafts did —
 * throws away the one signal that separates the two, and produces exactly the
 * failures it should avoid (binding an interrogative as an enclitic).
 *
 * This is not a heuristic standing in for syntax. It is the rule the writing
 * system was designed to express.
 */

const ACUTE = "́";
const GRAVE = "̀";
const CIRCUMFLEX = "͂";
const CIRCUMFLEX_TILDE = "̃";

/** Any punctuation that ends a phrase. Greek uses ; as the question mark and · as the ano teleia. */
const PHRASE_BREAK = /[,.;·;!?:·«»""()—–]/;

/** Apostrophes marking elision, straight and typographic. */
const ELISION = /['’᾽ʼ]$/;

export type JoinReason = "proclitic" | "enclitic" | "elision" | "weak" | "postpositive" | "none";

export interface PhraseGroup {
  /** Original orthographic words, verbatim and in order. */
  words: string[];
  join: JoinReason;
}

/**
 * Proclitics: unaccented words that lean onto the word after them.
 * Compared against the accent-stripped form, but only for words that carry no
 * accent to begin with — see isAccented.
 */
const PROCLITICS = new Set([
  // article, nominative only — the oblique forms (τοῦ, τῷ, τόν …) are accented
  "ο", "η", "οι", "αι",
  // prepositions
  "εν", "εις", "ες", "εκ", "εξ",
  // conjunctions and particles
  "ως", "ει",
  // negative
  "ου", "ουκ", "ουχ",
]);

/** Enclitics: unaccented words that lean back onto the word before them. */
const ENCLITICS = new Set([
  // particles
  "τε", "γε", "τοι", "περ", "νυν",
  // pronouns (unaccented forms only; ἐμοῦ / ἐμοί / ἐμέ are emphatic and accented)
  "μου", "μοι", "με", "σου", "σοι", "σε", "ου", "οι", "ε",
  // indefinite τις and its inflections
  "τις", "τι", "τινος", "τινι", "τινα", "τινων", "τισι", "τισιν", "τινας",
  // indefinite adverbs — the interrogatives ποῦ, πότε, πῶς, ποῖ are accented
  "ποτε", "που", "πως", "ποθεν", "ποι", "πη", "πω",
  // present indicative of εἰμί and φημί (εἶ and φῄς are accented, so excluded)
  "ειμι", "εστι", "εστιν", "εσμεν", "εστε", "εισι", "εισιν",
  "φημι", "φησι", "φησιν", "φαμεν", "φατε", "φασι", "φασιν",
]);

/**
 * PROSODICALLY WEAK WORDS — the third category.
 *
 * The two lists above hold clitics *proper*: words with no accent at all. But
 * "not a clitic" is not "not bound". A sentence built entirely from articles,
 * prepositions and particles — every one of them bearing an accent mark — was
 * left completely ungrouped, because each word failed the unaccented test:
 *
 *   Ἐρυξίμαχε πρῶτον μὲν δεῖ ὑμᾶς μαθεῖν τὴν ἀνθρωπίνην φύσιν καὶ τὰ παθήματα αὐτῆς
 *
 * Thirteen words, thirteen groups, nothing joined. Yet μὲν, τὴν, καὶ and τὰ are
 * prosodically weak: they lean on a neighbour in speech whatever the page shows.
 *
 * The grave accent on several of them is the clue. A grave marks an accent that
 * is *suppressed in context* — τήν is oxytone alone, but written τὴν before its
 * noun the grave says the accent is not realised here. Keying on the grave alone
 * would be too narrow, though: τοῦ and τῷ are weak too and carry a circumflex.
 * So membership, not accent, is the test for this class — which is exactly why
 * it must stay a *closed* list, and why the clitic lists above keep their
 * unaccented requirement. Relaxing that test there would undo τίς / τις.
 */

/**
 * Function words that lean forward onto what follows, whatever accent they bear.
 *
 * This list holds ONLY words that carry an accent — the ones the unaccented test
 * above cannot reach. Anything already in PROCLITICS is deliberately absent:
 * repeating it here would match the accented homograph too and destroy the very
 * distinction that list exists to draw. Listing "ει" here, for instance, bound
 * εἶ ("you are") to its complement as though it were εἰ ("if").
 */
const WEAK_PROCLITICS = new Set([
  // the article — the oblique forms are not proclitics in the grammarian's
  // sense, but they are still bound to their noun in speech
  "το", "τα", "του", "της", "των", "τω", "τη", "τοις", "ταις", "τῳ", "τῃ",
  "τον", "την", "τους", "τας",
  // prepositions that bear an accent (ἐν, εἰς, ἐκ, ἐξ are unaccented proclitics)
  "προς", "δια", "κατα", "μετα", "παρα", "περι", "υπο", "επι", "απο",
  "συν", "ανα", "υπερ", "αντι", "προ", "αμφι", "ενεκα", "χωρις", "ανευ",
  // coordinators and subordinators that lean on what they introduce
  "και", "ουδε", "μηδε", "αλλα", "ουτε", "μητε", "εαν", "οτι", "ινα",
  // the accented negative (οὐ, οὐκ, οὐχ are unaccented proclitics)
  "μη",
]);

/**
 * Postpositives: never begin a clause, and lean back on the word before them.
 *
 * Not enclitics — they keep their own accent and do not throw it onto the host —
 * but they are unstressable and phonologically bound to the left.
 */
const POSTPOSITIVES = new Set([
  "μεν", "δε", "γαρ", "ουν", "δη", "μην", "τοινυν", "μεντοι", "καιτοι", "αρα", "αυ",
]);

/**
 * Homographs whose weak reading depends on which accent the word carries.
 *
 * Membership alone is too blunt for these: the bare forms collide with ordinary
 * content words, and binding a noun or a verb as though it were a particle is a
 * worse error than leaving a particle unbound. As with τίς / τις, the writing
 * system already records the difference — here in the shape and position of the
 * accent rather than its presence.
 *
 * Each predicate answers: is THIS spelling the weak one?
 */
const ACCENT_SENSITIVE: Record<string, (word: string) => boolean> = {
  // ἄρα (acute) is the inferential postpositive; ἆρα (circumflex) opens a
  // question and is a full word that must keep its own prominence.
  αρα: (w) => !w.normalize("NFD").includes(CIRCUMFLEX) &&
              !w.normalize("NFD").includes(CIRCUMFLEX_TILDE),
  // ἀλλά / ἀλλὰ, accented on the final syllable, is the conjunction;
  // ἄλλα, accented on the first, is "other things" — a noun.
  αλλα: (w) => accentOnLastVowel(w),
};

const GREEK_VOWEL = /[αεηιουωΑΕΗΙΟΥΩ]/;
const COMBINING = /[\u0300-\u036f]/;
const ANY_ACCENT = /[\u0301\u0300\u0342\u0303]/;

/**
 * Does the word's accent sit on its final vowel?
 *
 * Enough to separate oxytone from paroxytone for the handful of homographs
 * above, without needing real syllabification.
 */
function accentOnLastVowel(word: string): boolean {
  const nfd = word.normalize("NFD");
  let last = -1;
  for (let i = 0; i < nfd.length; i++) if (GREEK_VOWEL.test(nfd[i])) last = i;
  if (last === -1) return false;
  for (let i = last + 1; i < nfd.length && COMBINING.test(nfd[i]); i++) {
    if (ANY_ACCENT.test(nfd[i])) return true;
  }
  return false;
}

/** False when this spelling is the content word rather than the particle. */
function passesAccentTest(word: string): boolean {
  const test = ACCENT_SENSITIVE[bareForm(word)];
  return test ? test(word) : true;
}

/** True for a function word that leans forward regardless of its accent. */
export function isWeakProclitic(word: string): boolean {
  return WEAK_PROCLITICS.has(bareForm(word)) && passesAccentTest(word);
}

/** True for a particle that leans back regardless of its accent. */
export function isPostpositive(word: string): boolean {
  return POSTPOSITIVES.has(bareForm(word)) && passesAccentTest(word);
}

/**
 * True for any word that should never carry a stress mark.
 *
 * A bound function word taking the accent is worse than no grouping at all:
 * `téhn anthrohpínehn` puts the prominence on the article. Used by the
 * transcribers to keep the mark on the group's lexical head.
 */
export function isProsodicallyWeak(word: string): boolean {
  return (
    isWeakProclitic(word) ||
    isPostpositive(word) ||
    isProclitic(word) ||
    isEnclitic(word)
  );
}

/**
 * Words that appear in both lists. The proclitic reading wins, because the
 * article and the negative are far more frequent than the enclitic pronouns
 * οὗ / οἷ. Flagged rather than hidden: this is a genuine ambiguity that only
 * syntax resolves, and it is the one place a human or a model could help.
 */
export const AMBIGUOUS_CLITICS = new Set(["ου", "οι", "εις"]);

/** Strip every combining mark, leaving bare letters, lowercased. */
function bareForm(word: string): string {
  return word
    .normalize("NFD")
    .replace(/[̀-ͯͅ]/g, "")
    .replace(ELISION, "")
    .toLowerCase();
}

/**
 * Does this word carry an accent of its own?
 *
 * Grave counts as an accent here. A grave marks an oxytone whose accent is
 * suppressed *in context* — the word still has one, so it is not a clitic.
 * (For stress marking in the output, grave is treated as unstressed; that is a
 * different question, handled in the transcriber.)
 */
function isAccented(word: string): boolean {
  const nfd = word.normalize("NFD");
  return (
    nfd.includes(ACUTE) ||
    nfd.includes(GRAVE) ||
    nfd.includes(CIRCUMFLEX) ||
    nfd.includes(CIRCUMFLEX_TILDE)
  );
}

/** True when a word ends in an elision apostrophe. */
function isElided(word: string): boolean {
  return ELISION.test(word);
}

/**
 * True when the token ends a phrase. Fusing across a comma or a full stop
 * produced audibly wrong output in an earlier implementation — it joined
 * `φίλε!` to the `Ποῖ` beginning the next sentence.
 */
function endsPhrase(word: string): boolean {
  return PHRASE_BREAK.test(word.slice(-1));
}

/** A proclitic must be in the list AND carry no accent of its own. */
export function isProclitic(word: string): boolean {
  return !isAccented(word) && PROCLITICS.has(bareForm(word));
}

/** An enclitic must be in the list AND carry no accent of its own. */
export function isEnclitic(word: string): boolean {
  return !isAccented(word) && ENCLITICS.has(bareForm(word));
}

/**
 * Group a line into phonological words.
 *
 * Greedy left-to-right. A group never crosses phrase-final punctuation, and
 * never exceeds MAX_GROUP words — a longer run is far more likely to be a bug
 * than a real phonological word.
 */
const MAX_GROUP = 4;

export function groupPhonologicalWords(text: string): PhraseGroup[] {
  const words = text.split(/\s+/).filter(Boolean);
  const groups: PhraseGroup[] = [];

  let i = 0;
  while (i < words.length) {
    const group: string[] = [words[i]];
    let reason: JoinReason = "none";

    // Absorb following words while the current tail leans forward onto them.
    while (i + group.length < words.length && group.length < MAX_GROUP) {
      const tail = group[group.length - 1];
      const next = words[i + group.length];

      // A phrase boundary stops the group, whatever the tail is.
      if (endsPhrase(tail)) break;

      if (isElided(tail)) {
        group.push(next);
        reason = reason === "none" ? "elision" : reason;
        continue;
      }
      if (isProclitic(tail)) {
        group.push(next);
        reason = reason === "none" ? "proclitic" : reason;
        continue;
      }
      // A function word leaning forward, accent or no accent. Checked after the
      // true proclitics so the more specific reason is the one reported.
      if (isWeakProclitic(tail)) {
        group.push(next);
        reason = reason === "none" ? "weak" : reason;
        continue;
      }
      // The next word leans back onto this group.
      if (isEnclitic(next)) {
        group.push(next);
        reason = reason === "none" ? "enclitic" : reason;
        continue;
      }
      // A postpositive particle leans back too, but keeps its own accent.
      // It must not start a group, which the greedy scan already guarantees:
      // it is only ever absorbed as `next`, never reached as a fresh `i`
      // unless it genuinely opens the line.
      if (isPostpositive(next)) {
        group.push(next);
        reason = reason === "none" ? "postpositive" : reason;
        continue;
      }
      break;
    }

    groups.push({ words: group, join: reason });
    i += group.length;
  }

  return groups;
}
