/**
 * Audio Player utility supporting Web Audio API for Gemini TTS 24kHz PCM and WAV audio
 * with real-time syllable-weighted word highlighting synchronization.
 */

export interface WordTiming {
  index: number;
  word: string;
  startTime: number;
  endTime: number;
}

export function calculateWordTimings(words: { greek: string }[], totalDuration: number): WordTiming[] {
  if (!words.length) return [];

  // Calculate weights based on character length, vowels/diphthongs, and punctuation pauses
  const weights = words.map((w) => {
    const raw = w.greek.trim();
    let weight = Math.max(raw.length, 2);
    
    // Add extra pause duration for punctuation marks (; . , · :)
    if (/[;.,·:!?]/.test(raw)) {
      weight += 3.5;
    }
    // Boost longer polysyllabic words
    const vowelCount = (raw.match(/[αειηουωάέήίόύώὰὲὴὶὸὺὼᾶῆῖῦῶ]/gi) || []).length;
    weight += vowelCount * 0.8;

    return weight;
  });

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

class AudioPlayerEngine {
  private ctx: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private audioCache: Map<string, AudioBuffer> = new Map();
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
  public async decodeAudio(base64Data: string, mimeType = "audio/pcm;rate=24000"): Promise<AudioBuffer> {
    const cacheKey = `${base64Data.slice(0, 48)}_${base64Data.length}`;
    if (this.audioCache.has(cacheKey)) {
      return this.audioCache.get(cacheKey)!;
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
        this.audioCache.set(cacheKey, decoded);
        return decoded;
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

    this.audioCache.set(cacheKey, audioBuffer);
    return audioBuffer;
  }

  /**
   * Play an AudioBuffer with speed, completion callback, and real-time word tracking
   */
  public playBuffer(
    buffer: AudioBuffer,
    speed = 1.0,
    onEnded?: () => void,
    words?: { greek: string }[],
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
