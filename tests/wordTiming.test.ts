/**
 * Tests for word-highlight timing.
 *
 * The load-bearing test is the first one: Modern pronunciation sends the Greek
 * itself, and its highlighting was correct. Reweighting from the spoken form
 * must not disturb it, so the new formula is checked against the old one
 * reproduced literally below.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { calculateWordTimings, spokenWeight } from "../src/utils/audioPlayer";

/** The pre-change formula, kept verbatim as the reference for Modern. */
function legacyGreekWeight(greek: string): number {
  const raw = greek.trim();
  let weight = Math.max(raw.length, 2);
  if (/[;.,·:!?]/.test(raw)) weight += 3.5;
  const vowelCount = (raw.match(/[αειηουωάέήίόύώὰὲὴὶὸὺὼᾶῆῖῦῶ]/gi) || []).length;
  weight += vowelCount * 0.8;
  return weight;
}

const GREEK_WORDS = [
  "Χαῖρε", "ὦ", "φίλε", "Ποῖ", "βαδίζεις", "ἄνθρωπος", "λόγῳ",
  "θάλαττα", "ζωή", "πρᾶγμα", "οὐρανός", "ἀλλ'", "ἡμέρα,", "τί;",
];

describe("Modern pronunciation is unchanged", () => {
  test("weights match the previous Greek-only formula exactly", () => {
    for (const w of GREEK_WORDS) {
      assert.equal(spokenWeight(w), legacyGreekWeight(w), `weight changed for ${w}`);
    }
  });

  test("timings are identical whether spoken form is supplied or omitted", () => {
    const words = GREEK_WORDS.map((g) => ({ greek: g }));
    const withSpoken = GREEK_WORDS.map((g) => ({ greek: g, spoken: g }));
    assert.deepEqual(calculateWordTimings(withSpoken, 10), calculateWordTimings(words, 10));
  });
});

describe("the spoken form drives the weight", () => {
  test("a digraph does not inflate the estimate the way raw length would", () => {
    // η→"eh" adds a character without adding a syllable.
    const asGreek = spokenWeight("ἡμέρα");
    const asLatin = spokenWeight("hehmera");
    assert.notEqual(asGreek, asLatin, "spoken form should change the weight");
  });

  test("IPA length marks add duration", () => {
    // ɔː is roughly twice ɔ, but only one character longer.
    assert.ok(
      spokenWeight("ˈɔː") > spokenWeight("ˈɔ"),
      "a long vowel should outweigh a short one"
    );
  });

  test("stress marks carry no duration of their own", () => {
    assert.equal(spokenWeight("ˈpʰile"), spokenWeight("pʰile"));
  });

  test("a non-syllabic glide weighs less than a full vowel", () => {
    assert.ok(spokenWeight("ai̯") < spokenWeight("ai"));
  });
});

describe("timing invariants", () => {
  const words = [
    { greek: "Χαῖρε", spoken: "ˈkʰai̯re" },
    { greek: "ὦ", spoken: "ˈɔː" },
    { greek: "βαδίζεις", spoken: "baˈdizdeːs" },
  ];

  test("timings fill exactly the clip duration", () => {
    const t = calculateWordTimings(words, 5);
    assert.equal(t[0].startTime, 0);
    assert.ok(Math.abs(t[t.length - 1].endTime - 5) < 1e-9);
  });

  test("timings are contiguous and ordered", () => {
    const t = calculateWordTimings(words, 5);
    for (let i = 1; i < t.length; i++) {
      assert.equal(t[i].startTime, t[i - 1].endTime);
      assert.ok(t[i].endTime > t[i].startTime);
    }
  });

  test("the label stays the Greek word, not the transcription", () => {
    // The highlight matches text on screen, which is Greek in every mode.
    assert.equal(calculateWordTimings(words, 5)[0].word, "Χαῖρε");
  });

  test("an empty list is handled", () => {
    assert.deepEqual(calculateWordTimings([], 5), []);
  });
});
