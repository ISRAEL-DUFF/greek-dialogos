/**
 * Tests for the reconstructed-Attic IPA transcriber.
 *
 * IPA is checked more strictly than the Latin scheme, because IPA has a
 * correct answer: a symbol denotes one sound. The Latin scheme can only be
 * checked for consistency, since "th" has no defined value outside a reader's
 * expectations.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { convertWordToIPA as ipa, convertToIPAForm as line } from "../src/utils/ipaConverter";

describe("distinctions the Latin scheme risks losing", () => {
  test("aspirated and plain stops stay apart", () => {
    assert.equal(ipa("θάλαττα"), "ˈtʰalatta");
    assert.equal(ipa("τάλαντα"), "ˈtalanta");
    assert.equal(ipa("φίλος"), "ˈpʰilos");
    assert.equal(ipa("πίλος"), "ˈpilos");
    assert.equal(ipa("ἔχω"), "ˈekʰɔː");
    assert.equal(ipa("ἔκω"), "ˈekɔː");
  });

  test("every vowel has its own symbol", () => {
    const vowels = ["ἄ", "ἔ", "ἤ", "ἴ", "ὄ", "ὔ", "ὤ"].map(ipa);
    assert.equal(new Set(vowels).size, vowels.length, `merged: ${vowels.join(" ")}`);
  });

  test("iota subscript is audible, so the dative is not lost", () => {
    assert.equal(ipa("λόγῳ"), "ˈloɡɔːi̯");
    assert.equal(ipa("λόγω"), "ˈloɡɔː");
    assert.notEqual(ipa("λόγῳ"), ipa("λόγω"));
  });
});

describe("vowel length", () => {
  test("η and ω are always long", () => {
    assert.ok(ipa("ἡμέρα").includes("ɛː"));
    assert.ok(ipa("λόγω").includes("ɔː"));
  });

  test("a circumflex reveals the length of a dichronon", () => {
    // α ι υ do not show quantity in the spelling — but a circumflex can only
    // sit on a long nucleus, so the accent itself carries the information.
    assert.equal(ipa("πρᾶγμα"), "ˈpraːɡma");
    assert.equal(ipa("πράγματα"), "ˈpraɡmata");
    assert.equal(ipa("μῦθος"), "ˈmyːtʰos");
    assert.equal(ipa("μύθος"), "ˈmytʰos");
  });

  test("ει and ου are monophthongs in classical Attic", () => {
    assert.ok(ipa("εἰς").includes("eː"));
    assert.ok(ipa("οὐκ").includes("uː"));
  });
});

describe("breathings", () => {
  test("rough breathing becomes [h]", () => {
    assert.equal(ipa("Ἑλλάς"), "helˈlas");
    assert.ok(ipa("ἡμέρα").startsWith("h"));
  });
  test("smooth breathing adds nothing", () => {
    assert.ok(!ipa("ἀγορά").startsWith("h"));
  });
  test("initial ῥ is voiceless, not [h] plus [r]", () => {
    assert.equal(ipa("Ῥώμη"), "ˈr̥ɔːmɛː");
  });
  test("breathing on a diphthong's second element still aspirates", () => {
    assert.ok(ipa("υἱός").startsWith("h"));
    assert.ok(ipa("αἱ").startsWith("h"));
  });
});

describe("stress", () => {
  test("the mark precedes the syllable, not the vowel", () => {
    assert.equal(ipa("λόγος"), "ˈloɡos");
    assert.equal(ipa("Ἑλλάς"), "helˈlas");
  });

  test("a stop-plus-liquid onset is kept together", () => {
    // Greek admits πρ as a syllable onset, so the stress falls before both.
    assert.equal(ipa("πρᾶγμα"), "ˈpraːɡma");
  });

  test("the grave is not stress", () => {
    assert.ok(!ipa("τὸ").includes("ˈ"));
  });

  test("an unaccented proclitic carries no stress", () => {
    assert.ok(!ipa("οὐκ").includes("ˈ"));
  });

  test("a fused group receives a single stress", () => {
    const out = line("ἄνθρωπός τις");
    assert.equal((out.match(/ˈ/g) || []).length, 1, out);
  });
});

describe("orthographic detail", () => {
  test("gamma before a velar is [ŋ]", () => {
    assert.equal(ipa("ἄγγελος"), "ˈaŋɡelos");
  });
  test("ζ is the Attic [zd] cluster", () => {
    assert.ok(ipa("ζωή").startsWith("zd"));
  });
  test("the elision apostrophe never reaches the output", () => {
    const out = line("ἀλλ' ἐν");
    assert.equal(out, "allen");
    assert.ok(!out.includes("'"));
  });
  test("punctuation survives, to drive pausing", () => {
    assert.ok(line("Χαῖρε, ὦ φίλε!").includes(","));
  });
});

describe("phrasing is shared with the Latin path", () => {
  test("proclitics fuse", () => {
    assert.equal(line("οὐκ ἐν"), "uːken");
  });
  test("phrasing can be disabled", () => {
    assert.equal(line("οὐκ ἐν", { phrasing: false }), "uːk en");
  });
  test("fusion needs no digraph guard here", () => {
    // "h" is only ever [h] in IPA, so ἐγώ + εἰμι cannot invent an aspirate.
    const out = line("ἐγώ εἰμι");
    assert.equal(out, "eˈɡɔːeːmi");
  });
});

describe("stress density in Reconstructed", () => {
  // convertToIPAForm never received stressDensity, so the control was inert on
  // this scheme: all three settings produced byte-identical IPA.
  const text = "Ἔστι δὴ οὖν τοῦ ὅλου ἐπιθυμία καὶ δίωξις Ἔρως καλούμενος.";
  const out = (stressDensity: "all" | "phrase" | "none") =>
    line(text, { phrasing: true, stressDensity });
  const marks = (s: string) => (s.match(/ˈ/g) || []).length;

  test("the three densities differ", () => {
    assert.equal(new Set([out("all"), out("phrase"), out("none")]).size, 3);
  });

  test("none removes every stress mark", () => {
    assert.equal(marks(out("none")), 0);
  });

  test("phrase keeps exactly one mark for a single sentence", () => {
    assert.equal(marks(out("phrase")), 1);
  });

  test("all keeps a mark on each lexical word", () => {
    assert.ok(marks(out("all")) > 1, out("all"));
  });

  test("defaults to full marking, the long-standing behaviour", () => {
    assert.equal(line(text, { phrasing: true }), out("all"));
  });

  test("weak function words carry no mark even at 'all'", () => {
    // τοῦ and καί are bound; the mark belongs on their heads.
    const all = out("all");
    assert.ok(!all.includes("ˈtuː"), all);
    assert.ok(!all.includes("ˈkai̯"), all);
  });
});
