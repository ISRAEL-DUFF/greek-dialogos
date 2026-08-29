/**
 * Word-bank assembly — the composing half of the roleplay exercise.
 *
 * The learner is shown the English and a shuffled set of the line's own words,
 * and rebuilds the Greek. Everything this needs already exists: the importer
 * generates full per-word morphology for every line and has been storing it all
 * along, so the exercise costs no model call and works offline.
 *
 * WHY THIS DOES NOT SIMPLY DIFF AGAINST THE ORIGINAL
 * --------------------------------------------------
 * Greek word order is free. Marking every deviation from the module's ordering
 * as an error would be pedagogically false and would teach the learner a rule
 * the language does not have.
 *
 * But some placements *are* decidable, and the rules are already implemented and
 * tested in phrasing.ts: a proclitic leans onto the word after it, an enclitic
 * and a postpositive lean back on the word before. Those cannot begin or end a
 * clause respectively — not as a matter of style, but by definition.
 *
 * So the response comes in three tiers: certainty where the text was reproduced,
 * a real grammatical objection where a clitic rule is broken, and a deliberate
 * refusal to judge anything else. Deciding whether an arbitrary reordering is
 * grammatical needs syntax this app does not have, so it will not pretend to.
 */

import {
  isProclitic,
  isWeakProclitic,
  isEnclitic,
  isPostpositive,
} from "./phrasing.js";
import { wordAffixes, wordsAlign } from "./wordPunctuation.js";

/** Sentence-final punctuation. Mirrors the transcribers. */
const CLAUSE_END = /[.;·;!?]$/;

/** A line shorter than this makes no puzzle worth solving. */
export const MIN_BANK_WORDS = 2;

export interface BankWord {
  /** Position in the line's own `words[]`. The tile's identity. */
  index: number;
  /** The bare word — feeds lookup and the gloss, never displayed alone. */
  greek: string;
  /** What the tile shows, punctuation restored from `greekText`. */
  display: string;
}

export interface WordBank {
  /** Tiles in presentation order. Empty when the line cannot be used. */
  tiles: BankWord[];
  /** The answer, in the module's own order. */
  solution: BankWord[];
  /**
   * False when this line cannot be made into a puzzle — too short, or its
   * `words[]` does not line up with its `greekText`. The caller should skip the
   * assembly stage rather than present something unsolvable.
   */
  usable: boolean;
}

export type ViolationKind =
  | "postpositive-initial"
  | "enclitic-initial"
  | "proclitic-final";

export interface Violation {
  /** Position in the learner's arrangement. */
  at: number;
  word: string;
  kind: ViolationKind;
}

export type AssemblyResult =
  /** Not every tile has been placed yet. */
  | { tier: "incomplete"; placed: number; total: number }
  /** The text was reproduced. */
  | { tier: "exact" }
  /** A clitic cannot sit where it was put, and we can say why. */
  | { tier: "rule"; violations: Violation[] }
  /** A different order. Not asserted to be wrong. */
  | { tier: "variant" };

/** Leans onto the word that follows, so it cannot end a clause. */
function leansForward(word: string): boolean {
  return isProclitic(word) || isWeakProclitic(word);
}

/** Leans onto the word before, so it cannot begin a clause. */
function leansBack(word: string): boolean {
  return isEnclitic(word) || isPostpositive(word);
}

/**
 * Deterministic PRNG, so a shuffle can be reproduced in a test and a learner
 * returning to a line sees the tiles where they left them.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], seed: number): T[] {
  const out = items.slice();
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Build the tiles for a line.
 *
 * The shuffle is retried until it differs from the solution, so the puzzle is
 * never handed over pre-solved. Bounded, because a line whose words are all
 * identical has no distinguishable arrangement and would otherwise spin.
 */
export function buildWordBank(
  greekText: string,
  words: { greek: string }[],
  seed = 1
): WordBank {
  const usable =
    words.length >= MIN_BANK_WORDS && wordsAlign(greekText, words);

  if (!usable) return { tiles: [], solution: [], usable: false };

  const affixes = wordAffixes(greekText, words);
  const solution: BankWord[] = words.map((w, index) => ({
    index,
    greek: w.greek,
    display: affixes[index].before + w.greek + affixes[index].after,
  }));

  const answer = solution.map((t) => t.display).join(" ");
  let tiles = shuffled(solution, seed);
  for (let attempt = 1; attempt < 12; attempt++) {
    if (tiles.map((t) => t.display).join(" ") !== answer) break;
    tiles = shuffled(solution, seed + attempt * 7919);
  }

  return { tiles, solution, usable: true };
}

/**
 * Where does a clause begin in this arrangement?
 *
 * Index 0 always, and anything following a tile that ends a sentence. Tiles
 * carry their punctuation with them, so the clause structure is the one the
 * learner actually built rather than the one the original had.
 */
function clauseStarts(arrangement: BankWord[]): Set<number> {
  const starts = new Set<number>([0]);
  arrangement.forEach((tile, i) => {
    if (CLAUSE_END.test(tile.display) && i + 1 < arrangement.length) {
      starts.add(i + 1);
    }
  });
  return starts;
}

/** Positions that close a clause: the last tile, and any sentence-final one. */
function clauseEnds(arrangement: BankWord[]): Set<number> {
  const ends = new Set<number>();
  arrangement.forEach((tile, i) => {
    if (CLAUSE_END.test(tile.display) || i === arrangement.length - 1) {
      ends.add(i);
    }
  });
  return ends;
}

/**
 * Judge an arrangement.
 *
 * Comparison is on the rendered text, not on tile identity: a line containing
 * the same word twice offers two visually identical tiles, and requiring the
 * learner to have picked a particular one would fail a correct answer.
 */
export function checkAssembly(
  arrangement: BankWord[],
  bank: WordBank
): AssemblyResult {
  const total = bank.solution.length;
  if (arrangement.length < total) {
    return { tier: "incomplete", placed: arrangement.length, total };
  }

  const rendered = arrangement.map((t) => t.display).join(" ");
  if (rendered === bank.solution.map((t) => t.display).join(" ")) {
    return { tier: "exact" };
  }

  const starts = clauseStarts(arrangement);
  const ends = clauseEnds(arrangement);
  const violations: Violation[] = [];

  arrangement.forEach((tile, at) => {
    if (starts.has(at) && leansBack(tile.greek)) {
      violations.push({
        at,
        word: tile.display,
        kind: isPostpositive(tile.greek) ? "postpositive-initial" : "enclitic-initial",
      });
    }
    if (ends.has(at) && leansForward(tile.greek)) {
      violations.push({ at, word: tile.display, kind: "proclitic-final" });
    }
  });

  return violations.length ? { tier: "rule", violations } : { tier: "variant" };
}

/**
 * The teaching sentence for a violation.
 *
 * Kept beside the rule that produces it so the two cannot drift, and so the
 * wording is testable. The explanation is the point of the exercise: "wrong"
 * teaches nothing, "μέν is postpositive and never begins a clause" does.
 */
export function explainViolation(v: Violation): string {
  switch (v.kind) {
    case "postpositive-initial":
      return `${v.word} is postpositive — it leans back on the word before it, so it never begins a clause.`;
    case "enclitic-initial":
      return `${v.word} is enclitic — it has no accent of its own and leans on the preceding word, so it cannot start a clause.`;
    case "proclitic-final":
      return `${v.word} is proclitic — it leans forward onto the word after it, so it cannot stand at the end.`;
  }
}
