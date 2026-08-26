/**
 * Tests for phonological phrasing (pass 1) and seam joining (pass 2).
 *
 * The "regressions guarded" block pins three failures found in an externally
 * proposed implementation. All three came from fusing Greek words BEFORE
 * transcribing them, which severs the link between a word and its own
 * diacritics. They are kept as tests because the bugs are easy to reintroduce
 * by "simplifying" the pipeline back into a single pass.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  groupPhonologicalWords,
  isProclitic,
  isEnclitic,
} from "../src/utils/phrasing";
import { convertToSpokenForm } from "../src/utils/phoneticConverter";

const groupsOf = (text: string) =>
  groupPhonologicalWords(text).map((g) => g.words.join("+"));

describe("clitic recognition uses the accent, not just the letters", () => {
  test("unaccented indefinite τις is enclitic", () => {
    assert.equal(isEnclitic("τις"), true);
  });

  test("accented interrogative τίς is NOT enclitic", () => {
    assert.equal(isEnclitic("τίς"), false);
  });

  test("unaccented indefinite ποι is enclitic; interrogative ποῖ is not", () => {
    assert.equal(isEnclitic("ποι"), true);
    assert.equal(isEnclitic("ποῖ"), false);
  });

  test("unaccented ἐστι is enclitic; accented ἔστι is not", () => {
    assert.equal(isEnclitic("ἐστι"), true);
    assert.equal(isEnclitic("ἔστι"), false);
  });

  test("nominative article is proclitic, oblique forms are not", () => {
    assert.equal(isProclitic("οἱ"), true);
    assert.equal(isProclitic("τῷ"), false, "τῷ is accented and not in the proclitic list");
  });

  test("οὐκ is proclitic", () => {
    assert.equal(isProclitic("οὐκ"), true);
  });
});

describe("grouping", () => {
  test("a proclitic joins the word after it", () => {
    assert.deepEqual(groupsOf("οἱ ἄνθρωποι"), ["οἱ+ἄνθρωποι"]);
  });

  test("an enclitic joins the word before it", () => {
    assert.deepEqual(groupsOf("ἄνθρωπός τις"), ["ἄνθρωπός+τις"]);
  });

  test("an elided word joins what follows", () => {
    assert.deepEqual(groupsOf("ἀλλ' ἐν"), ["ἀλλ'+ἐν"]);
  });

  test("independent words stay separate", () => {
    assert.deepEqual(groupsOf("λόγος ἀγαθός"), ["λόγος", "ἀγαθός"]);
  });

  test("an accented interrogative is not swept into the previous group", () => {
    // The failure this prevents: binding τίς backwards as though it were the
    // enclitic indefinite.
    assert.deepEqual(groupsOf("ἄνθρωπος τίς"), ["ἄνθρωπος", "τίς"]);
  });

  test("groups never cross phrase-final punctuation", () => {
    assert.deepEqual(groupsOf("φίλε! Ποῖ βαδίζεις;"), ["φίλε!", "Ποῖ", "βαδίζεις;"]);
  });

  test("groups are bounded in size", () => {
    for (const g of groupPhonologicalWords("οἱ ἐν τῷ ἐν τῷ ἐν τῷ ἄνθρωποι")) {
      assert.ok(g.words.length <= 4, `group of ${g.words.length} exceeds the cap`);
    }
  });

  test("every word survives grouping exactly once, in order", () => {
    const line = "Οὐκ ἐν τῷ πολλῷ τὸ εὖ, ἀλλ' ἐν τῷ εὖ τὸ πολύ.";
    const flat = groupPhonologicalWords(line).flatMap((g) => g.words);
    assert.deepEqual(flat, line.split(/\s+/));
  });
});

describe("seam joining", () => {
  test("consonant + vowel resyllabifies", () => {
    assert.equal(convertToSpokenForm("οὐκ ἐν"), "ooken");
  });

  test("the elision apostrophe does not survive into speech", () => {
    const out = convertToSpokenForm("ἀλλ' ἐν");
    assert.equal(out, "allen");
    assert.ok(!out.includes("'"));
  });

  test("groups are separated by a single space", () => {
    assert.equal(convertToSpokenForm("οἱ ἄνθρωποι λόγος"), "hoianthrohpoi logos");
  });

  test("phrasing can be disabled, reproducing the previous behaviour", () => {
    assert.equal(convertToSpokenForm("οὐκ ἐν", { phrasing: false }), "ook en");
  });
});

describe("regressions guarded", () => {
  test("an aspirate never migrates to a neighbouring word", () => {
    // αὐτοῦ carries SMOOTH breathing; the rough breathing belongs to οὗ.
    // Fusing before transcribing produced "howtoo-oo", aspirating αὐτοῦ.
    const out = convertToSpokenForm("αὐτοῦ οὗ");
    assert.equal(out, "autoo hoo");
    assert.ok(!out.startsWith("h"), "aspirate leaked onto the first word");
  });

  test("a capitalized word keeps its capital when aspirated", () => {
    assert.equal(convertToSpokenForm("Ἑλλάς"), "Hellas");
    assert.equal(convertToSpokenForm("Ῥώμη"), "Hrohmeh");
  });

  test("fusion does not cross a sentence boundary", () => {
    const out = convertToSpokenForm("ὦ φίλε! Ποῖ βαδίζεις;");
    assert.ok(!/phile!Poi|phile!-Poi/i.test(out), `fused across "!": ${out}`);
  });
});

describe("fusion never invents a phoneme", () => {
  test("a long-vowel digraph is not fused onto a following vowel", () => {
    // ἐγώ transcribes to "egoh" and εἰμι to "eimi". Fusing gives "egoheimi",
    // which reads as an aspirate on a word that has SMOOTH breathing.
    const out = convertToSpokenForm("Ἐγώ εἰμι", { phrasing: true, preserveAccents: true });
    assert.ok(!/heimi/i.test(out), `fusion invented an aspirate: ${out}`);
    assert.equal(out, "Egóh eimi");
  });

  test("a genuine aspirate still fuses", () => {
    // ὁ carries real rough breathing, so "ho" + noun is correct.
    assert.equal(convertToSpokenForm("ὁ μῦθος", { phrasing: true }), "homuthos");
  });

  test("a capital inside a fused token is lowered", () => {
    // "HoBoréas" risks being read as an initialism.
    assert.equal(convertToSpokenForm("Ὁ Βορέας", { phrasing: true }), "Hoboreas");
  });
});

describe("stress marking", () => {
  test("acute and circumflex are marked as stress", () => {
    assert.equal(convertToSpokenForm("πολύ", { preserveAccents: true }), "polú");
    assert.equal(convertToSpokenForm("τῷ", { preserveAccents: true }), "tóh");
  });

  test("the grave is NOT marked — it is a suppressed accent", () => {
    assert.equal(convertToSpokenForm("τὸ", { preserveAccents: true }), "to");
    assert.equal(convertToSpokenForm("τὸν λόγον", { preserveAccents: true }), "ton lógon");
  });

  test("accents are off by default", () => {
    assert.equal(convertToSpokenForm("πολύ"), "polu");
  });
});
