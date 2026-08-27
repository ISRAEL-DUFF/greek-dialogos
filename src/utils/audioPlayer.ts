/**
 * Audio Player utility supporting Web Audio API for Gemini TTS 24kHz PCM and WAV audio,
 * with estimated word highlighting. See calculateWordTimings for why the
 * highlight is an approximation rather than true synchronization.
 */

export interface WordTiming {
  index: number;
  word: string;
  startTime: number;
  endTime: number;
}

/**
 * Vowels across every notation we emit: Greek (Modern), Latin respelling
 * (Erasmian) and IPA (Reconstructed). A string only ever contains one of
 * these alphabets, so there is no double counting.
 */
const VOWEL_PATTERN =
  /[aeiouy]|[αειηουωάέήίόύώὰὲὴὶὸὺὼᾶῆῖῦῶ]|[ɛɔɑæøœʌəɨʉɯ]/gi;

/** Stress marks: positional, no duration of their own. */
const STRESS_MARKS = /[ˈˌ]/g;
/** Length mark: a long vowel takes roughly twice the time of a short one. */
const LENGTH_MARK = /ː/g;
/** Non-syllabic mark: the second element of a diphthong, shorter than a vowel. */
const NONSYLLABIC = /\u032F/g;
/** Aspiration: real but brief. */
const ASPIRATION = /ʰ/g;

/**
 * Relative duration of one spoken token.
 *
 * IMPORTANT — this must reduce exactly to the previous Greek-only formula when
 * given Greek text, because that is what Modern pronunciation sends and its
 * highlighting was correct. Greek in NFC contains no stress, length,
 * non-syllabic or aspiration marks, so every term added for the other
 * notations evaluates to zero and the result is `length + 0.8·vowels`
 * (+3.5 for punctuation) as before.
 */
export function spokenWeight(text: string): number {
  const raw = text.trim();
  const core = raw.replace(STRESS_MARKS, "");

  const longMarks = (core.match(LENGTH_MARK) || []).length;
  const glides = (core.match(NONSYLLABIC) || []).length;

  // Modifier symbols carry duration through their own terms, not through length.
  const base = Math.max(
    core.replace(LENGTH_MARK, "").replace(NONSYLLABIC, "").replace(ASPIRATION, "").length,
    2
  );
  const vowels = (core.match(VOWEL_PATTERN) || []).length;

  let weight = base + vowels * 0.8 + longMarks * 1.5 - glides * 0.4;
  if (/[;.,·:!?]/.test(raw)) weight += 3.5;
  return Math.max(weight, 1);
}

/**
 * ESTIMATE word boundaries by distributing the clip's duration across words.
 *
 * Weighted from the string the engine actually READ, not from the Greek source.
 * Those differ in two of the three pronunciation schemes, and the difference is
 * exactly what changes relative durations: η→"eh" and ω→"oh" add characters
 * without adding syllables, while IPA writes vowel length as "ː" — a single
 * character denoting roughly double the time. Weighting from the Greek made the
 * highlighting correct in Modern and systematically wrong in the other two.
 *
 * Still an estimate: nothing here is derived from the audio, so error
 * accumulates left to right. Real synchronisation needs word-level timestamps
 * the speech endpoint does not return. See docs/FIX-PLAN.md P1-4.
 */
export function calculateWordTimings(
  words: { greek: string; spoken?: string }[],
  totalDuration: number
): WordTiming[] {
  if (!words.length) return [];

  // Fall back to the Greek when no spoken form is supplied, so a caller that
  // predates this behaves exactly as before.
  const weights = words.map((w) => spokenWeight(w.spoken ?? w.greek));

  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || 1;
  let currentStart = 0;

  return words.map((w, idx) => {
    const duration = (weights[idx] / totalWeight) * totalDuration;
    const item: WordTiming = {
      index: idx,
      word: w.greek,
      startTime: currentStart,
      endTime: currentStart + duration,
    };
    currentStart += duration;
    return item;
  });
}

/**
 * Content fingerprint for the decoded-buffer cache.
 *
 * The previous key was `base64.slice(0, 48) + "_" + length`. Every clip this
 * engine returns opens with 200–500 bytes of digital silence, and 48 base64
 * characters cover only 36 bytes — so the prefix was "AAAA…A" for every clip
 * ever produced, and the key collapsed to the byte length alone.
 *
 * Lengths are quantised to 640-byte frames, so two lines needed only to match
 * within about 13ms of duration to collide, at which point one line played
 * another's audio. Later lines were the likeliest victims, having more earlier
 * clips to collide with.
 *
 * Hashing the whole string is O(n) over roughly a megabyte — a few milliseconds,
 * paid once per decode, and it cannot collide on length alone.
 */
function fingerprint(data: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < data.length; i++) {
    const c = data.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 + c, 0x85ebca6b) ^ (h2 >>> 13);
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}_${data.length}`;
}

class AudioPlayerEngine {
  private ctx: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  /**
   * Decoded-buffer cache, bounded.
   *
   * Decoded 24kHz mono PCM costs roughly 96KB per audio-second, so an
   * unbounded map held tens of megabytes of decoded audio for the lifetime of
   * the page - on top of the base64 copies already in IndexedDB. IndexedDB is
   * the durable cache; this only spares a repeat decode, so a small LRU is
   * enough.
   */
  private audioCache: Map<string, AudioBuffer> = new Map();
  private static readonly MAX_DECODED_BUFFERS = 24;
  private isCurrentlyPlaying = false;
  private onEndCallbacks: Set<() => void> = new Set();
  private animationFrameId: number | null = null;
  private startTime = 0;
  private playbackSpeed = 1.0;
  private wordTimings: WordTiming[] = [];
  private onWordChangeCallback: ((wordIndex: number, progress: number) => void) | null = null;

  private getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === "closed") {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtxClass({ sampleRate: 24000 });
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  /**
   * Convert base64 string (either WAV or raw 24kHz PCM 16-bit LE) to AudioBuffer
   */
  public async decodeAudio(
    base64Data: string,
    mimeType = "audio/pcm;rate=24000",
    /**
     * Identity of this clip, when the caller knows it. Playback passes the
     * same key the durable cache uses, which is unique by construction.
     */
    identity?: string
  ): Promise<AudioBuffer> {
    const cacheKey = identity ?? fingerprint(base64Data);
    const hit = this.audioCache.get(cacheKey);
    if (hit) {
      // Re-insert to mark as most recently used: Map preserves insertion order,
      // so the oldest key is always the first one.
      this.audioCache.delete(cacheKey);
      this.audioCache.set(cacheKey, hit);
      return hit;
    }

    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const ctx = this.getContext();

    // Check for WAV header 'RIFF'
    const isWav = bytes.length > 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;

    if (isWav) {
      try {
        const decoded = await ctx.decodeAudioData(bytes.buffer.slice(0));
        return this.remember(cacheKey, decoded);
      } catch (err) {
        console.warn("WAV decode failed, falling back to PCM parsing:", err);
      }
    }

    // Default: 16-bit linear PCM little-endian, mono, 24000Hz (standard for Gemini TTS)
    const sampleRate = mimeType.includes("rate=") 
      ? parseInt(mimeType.split("rate=")[1], 10) || 24000 
      : 24000;

    const numSamples = Math.floor(bytes.length / 2);
    const audioBuffer = ctx.createBuffer(1, numSamples, sampleRate);
    const channelData = audioBuffer.getChannelData(0);
    const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    for (let i = 0; i < numSamples; i++) {
      // 16-bit signed integer to [-1.0, 1.0] float
      const intSample = dataView.getInt16(i * 2, true);
      channelData[i] = intSample / 32768.0;
    }

    return this.remember(cacheKey, audioBuffer);
  }

  /** Insert into the decoded-buffer cache, evicting the least recently used. */
  private remember(key: string, buffer: AudioBuffer): AudioBuffer {
    this.audioCache.set(key, buffer);
    while (this.audioCache.size > AudioPlayerEngine.MAX_DECODED_BUFFERS) {
      const oldest = this.audioCache.keys().next().value;
      if (oldest === undefined) break;
      this.audioCache.delete(oldest);
    }
    return buffer;
  }

  /**
   * Play an AudioBuffer with speed, completion callback, and real-time word tracking
   */
  public playBuffer(
    buffer: AudioBuffer,
    speed = 1.0,
    onEnded?: () => void,
    words?: { greek: string; spoken?: string }[],
    onWordChange?: (wordIndex: number, progress: number) => void
  ): void {
    this.stop();
    const ctx = this.getContext();

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = speed;

    source.connect(ctx.destination);

    this.currentSource = source;
    this.isCurrentlyPlaying = true;
    this.playbackSpeed = speed;
    this.startTime = ctx.currentTime;
    this.onWordChangeCallback = onWordChange || null;

    if (words && words.length > 0 && onWordChange) {
      this.wordTimings = calculateWordTimings(words, buffer.duration);
      this.startTrackingLoop(buffer.duration);
    } else {
      this.wordTimings = [];
    }

    source.onended = () => {
      this.stopTrackingLoop();
      this.isCurrentlyPlaying = false;
      this.currentSource = null;
      if (onEnded) onEnded();
      this.onEndCallbacks.forEach((cb) => cb());
      this.onEndCallbacks.clear();
    };

    source.start(0);
  }

  private startTrackingLoop(totalDuration: number): void {
    this.stopTrackingLoop();

    const track = () => {
      if (!this.isCurrentlyPlaying || !this.ctx || !this.currentSource) return;

      const elapsed = (this.ctx.currentTime - this.startTime) * this.playbackSpeed;
      const progress = Math.min(elapsed / totalDuration, 1.0);

      if (this.wordTimings.length > 0 && this.onWordChangeCallback) {
        // Find matching word
        let activeIdx = this.wordTimings.findIndex(
          (t) => elapsed >= t.startTime && elapsed < t.endTime
        );
        if (activeIdx === -1) {
          if (elapsed >= totalDuration) {
            activeIdx = this.wordTimings.length - 1;
          } else {
            activeIdx = 0;
          }
        }
        this.onWordChangeCallback(activeIdx, progress);
      }

      if (elapsed < totalDuration) {
        this.animationFrameId = requestAnimationFrame(track);
      }
    };

    this.animationFrameId = requestAnimationFrame(track);
  }

  private stopTrackingLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Stop any currently playing audio
   */
  public stop(): void {
    this.stopTrackingLoop();
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {
        // Source already ended or stopped
      }
      this.currentSource = null;
    }
    this.isCurrentlyPlaying = false;
    this.onWordChangeCallback = null;
    this.wordTimings = [];
  }

  public isPlaying(): boolean {
    return this.isCurrentlyPlaying;
  }
}

export const audioPlayer = new AudioPlayerEngine();
