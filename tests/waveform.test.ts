/**
 * Tests for the waveform reduction and the pace comparison.
 *
 * The properties that matter are the ones that keep the picture honest:
 * envelopes must capture transients rather than alias past them, normalisation
 * must not amplify silence, and the pace report must stay an observation about
 * a quantity actually measured.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  comparePace,
  normalizePeaks,
  peakAmplitude,
  relativeWidth,
  toPeaks,
} from "../src/utils/waveform";

const f32 = (...v: number[]) => Float32Array.from(v);

/** Float32 cannot hold 0.9 exactly, so sample values compare approximately. */
const near = (actual: number, expected: number, msg?: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, msg ?? `${actual} !~ ${expected}`);

describe("envelope reduction", () => {
  test("each bucket keeps the extremes it spans", () => {
    const peaks = toPeaks(f32(0, 1, -1, 0), 2);
    assert.deepEqual(peaks, [
      { min: 0, max: 1 },
      { min: -1, max: 0 },
    ]);
  });

  test("a transient inside a bucket survives", () => {
    // Sampling every nth value instead of taking extremes would miss this
    // entirely and draw a quiet, wrong picture.
    const samples = new Float32Array(1000);
    samples[437] = 0.9;
    const peaks = toPeaks(samples, 10);
    near(peaks[4].max, 0.9, "the spike was aliased away");
  });

  test("produces exactly the requested number of buckets", () => {
    for (const n of [1, 7, 64, 601]) {
      assert.equal(toPeaks(new Float32Array(5000), n).length, n);
    }
  });

  test("more buckets than samples still yields one bucket each", () => {
    const peaks = toPeaks(f32(0.5, -0.5), 8);
    assert.equal(peaks.length, 8);
    assert.ok(peaks.every((p) => Number.isFinite(p.min) && Number.isFinite(p.max)));
  });

  test("degenerate input is empty, not a crash", () => {
    assert.deepEqual(toPeaks(new Float32Array(0), 10), []);
    assert.deepEqual(toPeaks(f32(1, 2, 3), 0), []);
    assert.deepEqual(toPeaks(f32(1, 2, 3), -4), []);
  });
});

describe("normalisation", () => {
  test("the loudest point reaches full height", () => {
    const peaks = [{ min: -0.25, max: 0.5 }];
    assert.deepEqual(normalizePeaks(peaks, 0.5), [{ min: -0.5, max: 1 }]);
  });

  test("microphone gain stops dominating the comparison", () => {
    // The same shape recorded quietly and loudly must draw identically.
    const quiet = normalizePeaks([{ min: -0.02, max: 0.04 }], 0.04);
    const loud = normalizePeaks([{ min: -0.5, max: 1.0 }], 1.0);
    assert.deepEqual(quiet, loud);
  });

  test("silence is left alone rather than amplified into noise", () => {
    const silent = [{ min: 0, max: 0 }];
    assert.deepEqual(normalizePeaks(silent, 0), silent);
    // Near-silent room tone must not be blown up to look like speech.
    const tone = [{ min: -0.00002, max: 0.00003 }];
    assert.deepEqual(normalizePeaks(tone, 0.00003), tone);
  });

  test("peak amplitude reads either direction", () => {
    near(peakAmplitude(f32(0.1, -0.8, 0.3)), 0.8);
    assert.equal(peakAmplitude(new Float32Array(0)), 0);
  });
});

describe("pace comparison", () => {
  test("a similar pace is reported as close", () => {
    const v = comparePace(3000, 3000);
    assert.equal(v.kind, "close");
    assert.equal(v.ratio, 1);
  });

  test("the band tolerates ordinary variation", () => {
    // A learner is not a metronome; small differences must not be flagged.
    assert.equal(comparePace(3300, 3000).kind, "close");
    assert.equal(comparePace(2400, 3000).kind, "close");
  });

  test("a markedly longer attempt is identified", () => {
    const v = comparePace(6000, 3000);
    assert.equal(v.kind, "slower");
    assert.equal(v.ratio, 2);
    assert.match(v.note, /one at a time/);
  });

  test("a markedly quicker attempt is identified", () => {
    const v = comparePace(1500, 3000);
    assert.equal(v.kind, "faster");
    assert.match(v.note, /long vowels/);
  });

  test("it observes rather than grades", () => {
    // The app cannot tell a deliberate pause from hesitation, so it must not
    // pronounce on the attempt.
    for (const v of [comparePace(6000, 3000), comparePace(1500, 3000), comparePace(3000, 3000)]) {
      assert.doesNotMatch(v.note, /wrong|bad|incorrect|poor|fail/i, v.note);
    }
  });

  test("clips too short to mean anything say so", () => {
    assert.equal(comparePace(120, 3000).kind, "unknown");
    assert.equal(comparePace(3000, 90).kind, "unknown");
    assert.equal(comparePace(NaN, 3000).kind, "unknown");
    assert.equal(comparePace(3000, Infinity).kind, "unknown");
  });
});

describe("the shared time axis", () => {
  test("the longer clip fills the axis and the shorter is proportionate", () => {
    // Length must not be normalised away — it is the difference worth seeing.
    assert.equal(relativeWidth(6000, 6000), 1);
    assert.equal(relativeWidth(3000, 6000), 0.5);
  });

  test("degenerate values stay in range", () => {
    assert.equal(relativeWidth(1000, 0), 0);
    assert.equal(relativeWidth(9000, 3000), 1);
    assert.equal(relativeWidth(-5, 3000), 0);
  });
});
