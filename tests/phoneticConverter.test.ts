/**
 * Characterization tests for the Reconstructed Attic / Erasmian transcriber.
 *
 * WHY THESE ARE CHARACTERIZATION TESTS, NOT SPEC TESTS
 * ----------------------------------------------------
 * `convertToReconstructedPhonetics` is the single mechanism keeping the TTS
 * engine from reading polytonic Greek with Modern Greek phonology. Its output
 * is interpolated into the TTS prompt, so any change to that prompt risks
 * changing pronunciation — which is why this suite exists before the
 * contextual-delivery work (docs/FIX-PLAN.md P1-9) touches the prompt.
 *
 * The README's pronunciation table describes a DIFFERENT scheme from the one
 * implemented here (see the "README mismatch" block at the bottom). Until it is
 * decided which is authoritative, these tests lock in ACTUAL current behaviour.
 * Their job is to detect unintended change, not to ratify the scheme.
 *
 * If you deliberately change the transcription scheme, these tests SHOULD fail.
 * Update them in the same commit and say why.
 *
 * The two defects this suite originally pinned as wrong-but-current (P2-9,
 * P2-10) have since been fixed; their assertions now describe correct output.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { convertToReconstructedPhonetics as convert } from "../src/utils/phoneticConverter";

const check = (greek: string, expected: string) =>
  assert.equal(convert(greek), expected, `${greek} should transcribe to ${expected}`);

describe("aspirated stops", () => {
  test("θ becomes th", () => check("θεός", "theos"));
  test("φ becomes ph", () => check("φίλε", "phile"));
  test("χ becomes kh", () => check("χάρις", "kharis"));
  test("all three in one word", () => check("φθόγγος", "phthongos"));
});

describe("ζ is the Erasmian [z], not the reconstructed [zd]", () => {
  // [zd] is the Attic reconstruction. Keeping it here made this scheme a
  // hybrid — the reason the old label read "Reconstructed Attic/Erasmian".
  // Readers wanting [zd] choose Reconstructed, where the IPA path supplies it.
  test("initial", () => check("ζωή", "zoheh"));
  test("medial", () => check("βαδίζεις", "badizeis"));
  test("stays distinct from σ", () => {
    assert.notEqual(convert("ζωή"), convert("σοφός"));
  });
});

describe("long vowels are marked", () => {
  test("η becomes eh", () => check("ἡμέρα", "hehmera"));
  test("ω becomes oh", () => check("ἄνθρωπος", "anthrohpos"));
  test("both", () => check("ῥήτωρ", "hrehtohr"));
});

describe("diphthongs", () => {
  test("αι", () => check("Ἀθῆναι", "Athehnai"));
  test("ει", () => check("Εἰς", "Eis"));
  test("οι", () => check("Ποῖ", "Poi"));
  test("αυ", () => check("αὐτός", "autos"));
  test("ευ", () => check("εὐθύς", "euthus"));
  // ου is [uː] and maps to "oo", not "ou": English "ou" most often reads as
  // /aʊ/ (out), which is αυ's value, so the two would effectively swap.
  test("ου", () => check("οὐρανός", "ooranos"));
  test("ου and αυ stay distinct", () => {
    assert.notEqual(convert("οὐρανός").slice(0, 2), convert("αὐτός").slice(0, 2));
  });
  // υἱός carries rough breathing on the iota, so it aspirates: see the
  // word-initial aspiration block below.
  test("υι", () => check("υἱός", "huios"));
});

describe("breathing marks", () => {
  test("rough breathing prefixes h", () => check("Ἑλλάς", "Hellas"));
  test("rough breathing on a short vowel", () => check("ἵππος", "hippos"));
  test("smooth breathing adds nothing", () => check("ἀγοράν", "agoran"));
  test("rough breathing on the second element of αι", () => check("αἱ", "hai"));
  test("rough breathing on the second element of οι", () => check("οἱ", "hoi"));
  test("initial ῥ becomes hr", () => check("ῥήτωρ", "hrehtohr"));
});

describe("orthographic details", () => {
  test("γγ is rendered as the nasal ng", () => check("ἄγγελος", "angelos"));
  test("double rho is preserved", () => check("Πύρρος", "Purros"));
  test("final and medial sigma agree", () => {
    check("λόγος", "logos");
    check("σοφός", "sophos");
  });
  test("iota subscript is dropped", () => {
    check("χώρᾳ", "khohra");
    check("λόγῳ", "logoh");
  });
  test("leading capital is preserved", () => check("Χαῖρε", "Khaire"));
});

describe("passthrough", () => {
  test("empty string", () => check("", ""));
  test("whitespace is preserved exactly", () => check("   ", "   "));
  test("ASCII is untouched", () => check("Hello world 123", "Hello world 123"));
  test("mixed ASCII and Greek converts only the Greek", () =>
    check("Speak: Χαῖρε now", "Speak: Khaire now"));
  test("Greek question mark survives", () => check("τί;", "ti;"));
  test("raised dot survives", () => check("μέν· δέ", "men· de"));
});

describe("sentence level", () => {
  test("the opening line of the default module", () =>
    check("Χαῖρε, ὦ φίλε! Ποῖ βαδίζεις;", "Khaire, oh phile! Poi badizeis;"));
  test("punctuation and spacing are structurally preserved", () =>
    check(
      "Χαῖρε, ὦ Σώκρατες! Εἰς τὴν ἀγοράν βαδίζω.",
      "Khaire, oh Sohkrates! Eis tehn agoran badizoh."
    ));
});

describe("word-initial aspiration on diphthongs (P2-9, P2-10 — fixed)", () => {
  test("initial ῥ does not uppercase the following consonant", () => {
    check("Ῥώμη", "Hrohmeh");
    check("ῥήτωρ", "hrehtohr");
  });

  test("rough breathing on the second element of ηυ aspirates", () => {
    check("ηὗρον", "hehuron");
    check("ηὕρηκα", "hehurehka");
  });

  test("rough breathing on the second element of υι aspirates", () => {
    // υἱός was transcribed "uios" before the diphthong list was completed.
    check("υἱός", "huios");
  });

  test("the remaining diphthongs still aspirate correctly", () => {
    check("οὗτος", "hootos");
    check("εὑρίσκω", "heuriskoh");
    check("αἱ", "hai");
    check("οἱ", "hoi");
  });

  test("capitalized rough breathing on a vowel is unaffected", () => {
    check("Ἑλλάς", "Hellas");
    check("Ἡμέρα", "Hehmera");
  });
});

/**
 * README MISMATCH
 *
 * README.md's "Polytonic Greek & Erasmian Phonetics Reference" table documents
 * an English-respelling scheme; this module implements scholarly
 * transliteration. Eight of the table's ten rows disagree with the code:
 *
 *   letter   README says   code emits
 *   θ        t_h           th
 *   φ        p_h           ph
 *   χ        k_h           kh
 *   ζ        zd            zd          <- agrees
 *   αι       eye           ai
 *   ει       ey            ei
 *   οι       oy            oi
 *   αυ       ow            au
 *   ευ       eh-oo         eu
 *   rough    h-            h           <- agrees
 *
 * This matters beyond documentation accuracy: the output is read by a TTS
 * model, and "ai"/"ei"/"oi" invite English vowel values that differ from the
 * respellings the table prescribes. Deciding which scheme is correct is a
 * pronunciation-quality question that needs ears, not a doc edit.
 * Tracked as P2-4.
 */
