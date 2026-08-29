/**
 * Tests for word-bank assembly.
 *
 * The interesting property is not that correct answers pass — it is that the
 * checker only asserts what it can actually decide. Greek word order is free,
 * so a reordering must not be called wrong unless a clitic rule makes it wrong.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildWordBank,
  checkAssembly,
  explainViolation,
  MIN_BANK_WORDS,
  BankWord,
} from "../src/utils/wordBank";

const w = (...gs: string[]) => gs.map((greek) => ({ greek }));

/** Arrange a bank's tiles by the words named, in the order given. */
const arrange = (bank: { solution: BankWord[] }, ...display: string[]): BankWord[] =>
  display.map((d) => {
    const tile = bank.solution.find((t) => t.display === d);
    assert.ok(tile, `no tile renders as ${d}`);
    return tile!;
  });

describe("building the bank", () => {
  const text = "Χαῖρε, ὦ φίλε.";
  const words = w("Χαῖρε", "ὦ", "φίλε");

  test("tiles carry punctuation but the word stays clean for lookup", () => {
    const bank = buildWordBank(text, words);
    const kh = bank.solution[0];
    assert.equal(kh.display, "Χαῖρε,");
    assert.equal(kh.greek, "Χαῖρε");
    assert.equal(bank.solution[2].display, "φίλε.");
  });

  test("every word becomes exactly one tile", () => {
    const bank = buildWordBank(text, words);
    assert.equal(bank.tiles.length, words.length);
    assert.deepEqual(
      bank.tiles.map((t) => t.index).sort((a, b) => a - b),
      [0, 1, 2]
    );
  });

  test("the shuffle is deterministic for a given seed", () => {
    const a = buildWordBank(text, words, 42).tiles.map((t) => t.index);
    const b = buildWordBank(text, words, 42).tiles.map((t) => t.index);
    assert.deepEqual(a, b);
  });

  test("the puzzle is never handed over already solved", () => {
    // Every seed must produce tiles that differ from the answer.
    for (let seed = 1; seed <= 60; seed++) {
      const bank = buildWordBank(text, words, seed);
      assert.notEqual(
        bank.tiles.map((t) => t.display).join(" "),
        bank.solution.map((t) => t.display).join(" "),
        `seed ${seed} was pre-solved`
      );
    }
  });
});

describe("lines that cannot make a puzzle", () => {
  test("a line whose words do not match its text is refused", () => {
    // Better no exercise than an unsolvable one.
    const bank = buildWordBank("Χαῖρε, ὦ φίλε.", w("Χαῖρε", "φίλε"));
    assert.equal(bank.usable, false);
    assert.deepEqual(bank.tiles, []);
  });

  test("a line too short to rearrange is refused", () => {
    assert.equal(buildWordBank("Χαῖρε.", w("Χαῖρε")).usable, false);
    assert.equal(MIN_BANK_WORDS, 2);
  });

  test("a usable line reports so", () => {
    assert.equal(buildWordBank("Χαῖρε, ὦ φίλε.", w("Χαῖρε", "ὦ", "φίλε")).usable, true);
  });
});

describe("judging an arrangement", () => {
  const text = "Χαῖρε, ὦ φίλε.";
  const bank = buildWordBank(text, w("Χαῖρε", "ὦ", "φίλε"));

  test("an unfinished arrangement is reported, not marked wrong", () => {
    const r = checkAssembly(arrange(bank, "Χαῖρε,"), bank);
    assert.deepEqual(r, { tier: "incomplete", placed: 1, total: 3 });
  });

  test("the original order is exact", () => {
    const r = checkAssembly(arrange(bank, "Χαῖρε,", "ὦ", "φίλε."), bank);
    assert.deepEqual(r, { tier: "exact" });
  });

  test("a different but defensible order is not called wrong", () => {
    // Nothing here breaks a clitic rule, and the app has no syntax with which
    // to judge it further — so it must not pretend to.
    const r = checkAssembly(arrange(bank, "ὦ", "φίλε.", "Χαῖρε,"), bank);
    assert.equal(r.tier, "variant");
  });
});

describe("clitic rules the checker can actually decide", () => {
  test("a postpositive cannot begin a clause", () => {
    const bank = buildWordBank("πρῶτον μὲν δεῖ", w("πρῶτον", "μὲν", "δεῖ"));
    const r = checkAssembly(arrange(bank, "μὲν", "πρῶτον", "δεῖ"), bank);
    assert.equal(r.tier, "rule");
    if (r.tier !== "rule") return;
    assert.equal(r.violations[0].kind, "postpositive-initial");
    assert.equal(r.violations[0].at, 0);
    assert.match(explainViolation(r.violations[0]), /postpositive/);
  });

  test("an enclitic cannot begin a clause", () => {
    const bank = buildWordBank("ἄνθρωπός τις ἦλθεν", w("ἄνθρωπός", "τις", "ἦλθεν"));
    const r = checkAssembly(arrange(bank, "τις", "ἄνθρωπός", "ἦλθεν"), bank);
    assert.equal(r.tier, "rule");
    if (r.tier !== "rule") return;
    assert.equal(r.violations[0].kind, "enclitic-initial");
  });

  test("a proclitic cannot stand at the end", () => {
    const bank = buildWordBank("εἰς τὴν πόλιν", w("εἰς", "τὴν", "πόλιν"));
    const r = checkAssembly(arrange(bank, "πόλιν", "τὴν", "εἰς"), bank);
    assert.equal(r.tier, "rule");
    if (r.tier !== "rule") return;
    assert.ok(
      r.violations.some((v) => v.kind === "proclitic-final"),
      JSON.stringify(r.violations)
    );
  });

  test("the accent still decides — an interrogative is not a clitic", () => {
    // τίς is accented, so it is the interrogative and may open the clause.
    // Were this treated as the enclitic τις, a correct answer would be failed.
    const bank = buildWordBank("τίς ἐστιν οὗτος", w("τίς", "ἐστιν", "οὗτος"));
    const r = checkAssembly(arrange(bank, "τίς", "οὗτος", "ἐστιν"), bank);
    assert.notEqual(r.tier, "rule");
  });

  test("a clause boundary inside the line is respected", () => {
    // The tile carries its full stop, so μὲν placed after it still begins a
    // clause and is still wrong.
    const bank = buildWordBank(
      "λέγει. πρῶτον μὲν δεῖ",
      w("λέγει", "πρῶτον", "μὲν", "δεῖ")
    );
    const r = checkAssembly(arrange(bank, "λέγει.", "μὲν", "πρῶτον", "δεῖ"), bank);
    assert.equal(r.tier, "rule");
    if (r.tier !== "rule") return;
    assert.equal(r.violations[0].at, 1);
  });
});

describe("repeated words", () => {
  // Two tiles rendering the same text are indistinguishable on screen, so a
  // correct answer must not depend on which one was picked.
  const bank = buildWordBank(
    "καὶ ἄνδρες καὶ γυναῖκες",
    w("καὶ", "ἄνδρες", "καὶ", "γυναῖκες")
  );

  test("either identical tile satisfies the answer", () => {
    const [a, b, c, d] = bank.solution;
    assert.deepEqual(checkAssembly([a, b, c, d], bank), { tier: "exact" });
    // The two καὶ tiles swapped: same text, different identities.
    assert.deepEqual(checkAssembly([c, b, a, d], bank), { tier: "exact" });
  });
});

describe("the explanations", () => {
  test("each kind gets a sentence naming the word and the rule", () => {
    const kinds = ["postpositive-initial", "enclitic-initial", "proclitic-final"] as const;
    for (const kind of kinds) {
      const text = explainViolation({ at: 0, word: "μὲν", kind });
      assert.ok(text.startsWith("μὲν"), text);
      assert.ok(text.length > 40, `too terse to teach anything: ${text}`);
    }
  });
});

describe("real lines in their own order are never flagged", () => {
  // The property most likely to break in silence: extend the clitic lists in
  // phrasing.ts and the checker could start objecting to Plato. The `exact`
  // short-circuit would hide it, so the rule pass is exercised directly by
  // judging the canonical order against a deliberately mismatched solution.
  const LINES: [string, string][] = [
    ["Ἐρυξίμαχε, πρῶτον μὲν δεῖ ὑμᾶς μαθεῖν τὴν ἀνθρωπίνην φύσιν.", "Symposium, μὲν postpositive"],
    ["Πῶς δὲ ἔχει, ὦ Ἀριστόφανες; λέγε ἡμῖν.", "δὲ postpositive, clause break"],
    ["Ἆρα οὖν διὰ τὴν ὕβριν αὐτῶν ὁ Ζεὺς δίχα ἔτεμεν ἕκαστον;", "οὖν postpositive, article"],
    ["Πάνυ μὲν οὖν· ἐπεὶ δὲ τὸ σῶμα δίχα ἐτμήθη.", "ano teleia, two postpositives"],
    ["ὁ ἀγαθὸς βασιλεὺς οὐ μόνον δυνάμει ἀλλὰ καὶ φιλίᾳ ἄρχει.", "οὐ proclitic mid-line"],
    ["Χαῖρε, ὦ φίλε! Ποῖ βαδίζεις;", "exclamation, interrogative"],
  ];

  for (const [text, why] of LINES) {
    test(`${why}`, () => {
      const words = text
        .split(/\s+/)
        .map((g) => ({ greek: g.replace(/[,.;·!?]/g, "") }));
      const bank = buildWordBank(text, words);
      assert.equal(bank.usable, true, `not usable: ${text}`);

      // Force the rule pass rather than short-circuiting on exact.
      const result = checkAssembly(bank.solution, {
        ...bank,
        solution: [...bank.solution].reverse(),
      });
      assert.notEqual(
        result.tier,
        "rule",
        `the author's own order was objected to: ${JSON.stringify(
          result.tier === "rule" ? result.violations : null
        )}`
      );
    });
  }
});
