/**
 * Tests for inter-line pacing (docs/FIX-PLAN.md P1-8).
 *
 * These are spec tests, not characterization tests: the pacing rules are
 * defined by this plan, not inherited from existing behaviour. The exact
 * millisecond values are tunable by ear; the RELATIONSHIPS between them are
 * the contract and are asserted independently of the constants.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { gapAfter, loopRestartGap, lineRepeatGap } from "../src/utils/dialogueTiming";

const line = (speaker: string, greekText: string) => ({ speaker, greekText });

const SOCRATES = "Σωκράτης";
const ALEXANDER = "Ἀλέξανδρος";

const question = line(SOCRATES, "Ποῖ βαδίζεις;");
const shortStatement = line(SOCRATES, "Εἰς τὴν ἀγοράν.");
const longStatement = line(
  SOCRATES,
  "Ἐγὼ γὰρ οἶμαι τοῦτο εἶναι τὸ μέγιστον ἀγαθὸν ἀνθρώπῳ, περὶ ἀρετῆς τοὺς λόγους ποιεῖσθαι."
);
const reply = line(ALEXANDER, "Χαῖρε.");

describe("gapAfter", () => {
  test("returns 0 at the end of a sequence", () => {
    assert.equal(gapAfter(question, null), 0);
  });

  test("a reply to a question comes back faster than a normal turn", () => {
    assert.ok(
      gapAfter(question, reply) < gapAfter(shortStatement, reply),
      "question -> reply should be shorter than statement -> reply"
    );
  });

  test("a long statement gets more room than a short one", () => {
    assert.ok(
      gapAfter(longStatement, reply) > gapAfter(shortStatement, reply),
      "long statement should be followed by a longer pause"
    );
  });

  test("the same speaker continuing gets the shortest gap of all", () => {
    const continuation = gapAfter(shortStatement, line(SOCRATES, "καὶ γάρ."));
    assert.ok(continuation < gapAfter(question, reply));
    assert.ok(continuation < gapAfter(shortStatement, reply));
    assert.ok(continuation < gapAfter(longStatement, reply));
  });

  test("speaker continuation wins over punctuation", () => {
    // Same speaker after a question mark is still a continuation, not a reply.
    const sameSpeakerAfterQuestion = gapAfter(question, line(SOCRATES, "ἢ οὔ;"));
    const differentSpeakerAfterQuestion = gapAfter(question, reply);
    assert.ok(sameSpeakerAfterQuestion < differentSpeakerAfterQuestion);
  });

  test("recognizes the Greek question mark U+037E as well as ASCII ;", () => {
    // Written as escapes: the two characters are visually identical, and a
    // literal is silently normalized to ASCII by many editors and tools.
    const asciiSemicolon = line(SOCRATES, "\u03A0\u03BF\u1FD6 \u03B2\u03B1\u03B4\u03AF\u03B6\u03B5\u03B9\u03C2\u003B");
    const greekQuestion = line(SOCRATES, "\u03A0\u03BF\u1FD6 \u03B2\u03B1\u03B4\u03AF\u03B6\u03B5\u03B9\u03C2\u037E");
    assert.equal(asciiSemicolon.greekText.charCodeAt(asciiSemicolon.greekText.length - 1), 0x3b);
    assert.equal(greekQuestion.greekText.charCodeAt(greekQuestion.greekText.length - 1), 0x37e);
    assert.equal(gapAfter(greekQuestion, reply), gapAfter(asciiSemicolon, reply));
    // and both must be treated as questions, not as unterminated text
    assert.ok(gapAfter(greekQuestion, reply) < gapAfter(shortStatement, reply));
  });

  test("recognizes the ano teleia U+0387 as a statement ending", () => {
    const anoTeleia = line(SOCRATES, "\u0395\u1F30\u03C2 \u03C4\u1F74\u03BD \u1F00\u03B3\u03BF\u03C1\u03AC\u03BD\u0387");
    assert.equal(anoTeleia.greekText.charCodeAt(anoTeleia.greekText.length - 1), 0x387);
    assert.equal(gapAfter(anoTeleia, reply), gapAfter(shortStatement, reply));
  });

  test("unterminated text falls back to a normal turn gap", () => {
    assert.equal(gapAfter(line(SOCRATES, "Εἰς τὴν ἀγοράν"), reply), gapAfter(shortStatement, reply));
  });

  test("trailing whitespace does not defeat punctuation detection", () => {
    assert.equal(gapAfter(line(SOCRATES, "Ποῖ βαδίζεις;   "), reply), gapAfter(question, reply));
  });

  test("empty text does not throw", () => {
    assert.equal(typeof gapAfter(line(SOCRATES, ""), reply), "number");
  });
});

describe("speed scaling", () => {
  test("faster playback shortens gaps", () => {
    assert.ok(gapAfter(longStatement, reply, 1.25) < gapAfter(longStatement, reply, 1.0));
  });

  test("slower playback lengthens gaps", () => {
    assert.ok(gapAfter(shortStatement, reply, 0.75) > gapAfter(shortStatement, reply, 1.0));
  });

  test("all gaps stay within the clamp at every supported speed", () => {
    for (const speed of [0.75, 0.85, 1.0, 1.25]) {
      for (const prev of [question, shortStatement, longStatement]) {
        const gap = gapAfter(prev, reply, speed);
        assert.ok(gap >= 120 && gap <= 900, `gap ${gap} out of range at speed ${speed}`);
      }
    }
  });

  test("a zero or negative speed does not divide by zero", () => {
    assert.ok(Number.isFinite(gapAfter(shortStatement, reply, 0)));
    assert.ok(Number.isFinite(gapAfter(shortStatement, reply, -1)));
  });

  test("loop gaps scale and stay clamped", () => {
    assert.ok(loopRestartGap(1.25) < loopRestartGap(1.0));
    assert.ok(lineRepeatGap(1.25) < lineRepeatGap(1.0));
    for (const speed of [0.75, 1.0, 1.25]) {
      assert.ok(loopRestartGap(speed) <= 900 && loopRestartGap(speed) >= 120);
      assert.ok(lineRepeatGap(speed) <= 900 && lineRepeatGap(speed) >= 120);
    }
  });

  test("a loop restart is never shorter than an inter-line gap", () => {
    assert.ok(loopRestartGap(1.0) >= gapAfter(longStatement, reply, 1.0));
  });
});
