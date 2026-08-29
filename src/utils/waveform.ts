/**
 * Reducing audio to something comparable by eye.
 *
 * The learner hears their attempt beside the reference recital and judges it
 * themselves — there is no speech recognition for Ancient Greek, so the app
 * offers no score. What it can do honestly is draw both clips on one time axis
 * and report the one quantity it genuinely measures: how long each took.
 *
 * TWO DECISIONS THAT MAKE THE PICTURE HONEST
 * ------------------------------------------
 * Each waveform is peak-normalised, because microphone gain is arbitrary. An
 * un-normalised comparison mostly shows how close the learner sat to the
 * microphone, which teaches nothing; normalised, the shape and timing show.
 *
 * But the two are drawn against a SHARED time axis, so length is not
 * normalised away. Fitting each clip to the same width would hide exactly the
 * difference worth seeing — an attempt half again as long as the model's is the
 * signature of reading word by word rather than speaking a phrase.
 */

export interface PeakBucket {
  min: number;
  max: number;
}

/**
 * The waveform envelope: the extremes within each horizontal bucket.
 *
 * Sampling every nth value instead would alias badly — a 24kHz clip drawn over
 * 600 pixels would miss most transients and render a quiet, wrong picture.
 */
export function toPeaks(samples: Float32Array, buckets: number): PeakBucket[] {
  if (buckets <= 0 || samples.length === 0) return [];

  const out: PeakBucket[] = [];
  const per = samples.length / buckets;

  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * per);
    const end = Math.min(samples.length, Math.max(start + 1, Math.floor((b + 1) * per)));

    let min = samples[start];
    let max = samples[start];
    for (let i = start + 1; i < end; i++) {
      const v = samples[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    out.push({ min, max });
  }
  return out;
}

/** Loudest excursion in the clip, either direction. */
export function peakAmplitude(samples: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i]);
    if (v > peak) peak = v;
  }
  return peak;
}

/**
 * Scale the envelope so its loudest point reaches full height.
 *
 * A silent clip is returned untouched rather than amplified into noise:
 * dividing by a peak of zero would produce NaN, and dividing by a near-zero
 * peak would draw random room tone as though it were speech.
 */
export function normalizePeaks(peaks: PeakBucket[], peak: number): PeakBucket[] {
  if (!(peak > 0.0001)) return peaks;
  const scale = 1 / peak;
  return peaks.map((p) => ({ min: p.min * scale, max: p.max * scale }));
}

export type PaceKind = "close" | "slower" | "faster" | "unknown";

export interface PaceVerdict {
  kind: PaceKind;
  /** Attempt duration over reference duration. */
  ratio: number;
  /** An observation, never a grade. */
  note: string;
}

/** Below this the clip is too short to say anything about. */
const MIN_MEANINGFUL_MS = 300;

/**
 * Compare the two durations.
 *
 * Deliberately an observation rather than a judgement. A learner may pause on
 * purpose, or take a breath mid-line, and the app cannot tell that from
 * hesitation — so it reports the ratio and what it commonly indicates, and
 * leaves the conclusion to the person who just spoke.
 */
export function comparePace(attemptMs: number, referenceMs: number): PaceVerdict {
  if (
    !Number.isFinite(attemptMs) ||
    !Number.isFinite(referenceMs) ||
    referenceMs < MIN_MEANINGFUL_MS ||
    attemptMs < MIN_MEANINGFUL_MS
  ) {
    return { kind: "unknown", ratio: 0, note: "Too short to compare." };
  }

  const ratio = attemptMs / referenceMs;

  if (ratio >= 1.35) {
    return {
      kind: "slower",
      ratio,
      note: `Yours ran ${ratio.toFixed(1)}× longer. Often that means the words are being read one at a time rather than run together.`,
    };
  }
  if (ratio <= 0.7) {
    return {
      kind: "faster",
      ratio,
      note: `Yours ran ${(1 / ratio).toFixed(1)}× quicker. Worth checking that the long vowels are still getting their length.`,
    };
  }
  return { kind: "close", ratio, note: "Close to the recital in pace." };
}

/** Fraction of the shared axis this clip occupies. */
export function relativeWidth(ms: number, longestMs: number): number {
  if (!(longestMs > 0)) return 0;
  return Math.max(0, Math.min(1, ms / longestMs));
}
