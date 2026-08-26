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

describe("ζ becomes the zd cluster", () => {
  test("initial", () => check("ζωή", "zdoheh"));
  test("medial", () => check("βαδίζεις", "badizdeis"));
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
  test("ου", () => check("οὐρανός", "ouranos"));
  test("υι", () => check("υἱός", "uios"));
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
    check("Χαῖρε, ὦ φίλε! Ποῖ βαδίζεις;", "Khaire, oh phile! Poi badizdeis;"));
  test("punctuation and spacing are structurally preserved", () =>
    check(
      "Χαῖρε, ὦ Σώκρατες! Εἰς τὴν ἀγοράν βαδίζω.",
      "Khaire, oh Sohkrates! Eis tehn agoran badizdoh."
    ));
});

/**
 * KNOWN DEFECTS — these assert wrong-but-current behaviour on purpose.
 *
 * They are here so the bugs are visible and so a fix trips a test rather than
 * passing unnoticed. If you fix one, update its assertion in the same commit.
 * Tracked as P2-9 and P2-10 in docs/FIX-PLAN.md.
 */
describe("known defects (characterization only)", () => {
  test("BUG: initial ῥ uppercases the following consonant — should be 'Hrohmeh'", () => {
    check("Ῥώμη", "HRohmeh");
  });

  test("BUG: rough breathing on the second element of ηυ is dropped — should aspirate", () => {
    check("ηὗρον", "ehuron");
    check("ηὕρηκα", "ehurehka");
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
