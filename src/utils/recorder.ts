/**
 * Capturing the learner's attempt.
 *
 * Half of the roleplay exercise: having composed the line, say it, then hear it
 * back against the reference recital. No transcription and no score — there is
 * no speech recognition for Ancient Greek, so the app does not pretend to judge
 * the attempt. It shows you your own voice beside the model's and lets you
 * decide, which is how recitation has always been practised.
 *
 * TWO RULES THIS MODULE EXISTS TO ENFORCE
 * ---------------------------------------
 * 1. The microphone is requested only from an explicit action. Nothing here runs
 *    on mount, so the permission prompt never appears unasked.
 *
 * 2. Every path releases the microphone track. A recorder that stops producing
 *    audio but leaves the track live keeps the browser's recording indicator lit
 *    and the device held open — the single most common defect in code like this,
 *    and invisible in a happy-path test.
 *
 * Refusal is an ordinary outcome, not an error: the composing half of the
 * exercise stands on its own, so a learner who declines the microphone, or has
 * none, keeps a working turn.
 */

/** Container preference. The first the browser admits wins. */
export const MIME_CANDIDATES = [
  "audio/webm;codecs=opus", // Chromium
  "audio/webm",
  "audio/mp4", // Safari
  "audio/ogg;codecs=opus", // Firefox
] as const;

export type RecorderAvailability =
  | "ready"
  | "no-media-recorder"
  | "no-microphone-api"
  | "insecure-context";

export type RecorderErrorKind =
  | "denied"
  | "no-device"
  | "device-busy"
  | "insecure-context"
  | "unsupported"
  | "unknown";

export interface Recording {
  blob: Blob;
  mimeType: string;
  /**
   * Elapsed wall-clock time, in milliseconds.
   *
   * An approximation for display while the clip is being prepared. The exact
   * figure comes from decoding the blob, because MediaRecorder's own webm
   * output routinely carries no duration in its metadata.
   */
  approxDurationMs: number;
}

export class RecorderError extends Error {
  constructor(readonly kind: RecorderErrorKind, message: string) {
    super(message);
    this.name = "RecorderError";
  }
}

/** Minimal shapes, so the state machine can be driven in a test without a DOM. */
export interface RecorderEnv {
  hasMediaRecorder: boolean;
  hasGetUserMedia: boolean;
  isSecureContext: boolean;
}

export function recorderAvailability(env: RecorderEnv): RecorderAvailability {
  // Order matters: an insecure page hides getUserMedia entirely, so reporting
  // "no microphone API" there would send someone hunting the wrong problem.
  if (!env.isSecureContext) return "insecure-context";
  if (!env.hasMediaRecorder) return "no-media-recorder";
  if (!env.hasGetUserMedia) return "no-microphone-api";
  return "ready";
}

/** Read the current browser's capabilities. Safe to call anywhere. */
export function browserRecorderEnv(): RecorderEnv {
  const g = globalThis as unknown as {
    MediaRecorder?: unknown;
    isSecureContext?: boolean;
    navigator?: { mediaDevices?: { getUserMedia?: unknown } };
  };
  return {
    hasMediaRecorder: typeof g.MediaRecorder !== "undefined",
    hasGetUserMedia: typeof g.navigator?.mediaDevices?.getUserMedia === "function",
    isSecureContext: g.isSecureContext !== false,
  };
}

/**
 * The first container this browser will actually record.
 *
 * Returns null when none of the candidates is supported, which is not a
 * failure: passing no mimeType lets the browser pick its own default, and some
 * builds accept that while rejecting every explicit string.
 */
export function pickMimeType(
  isSupported: (type: string) => boolean,
  candidates: readonly string[] = MIME_CANDIDATES
): string | null {
  for (const type of candidates) {
    if (isSupported(type)) return type;
  }
  return null;
}

/** Turn a getUserMedia rejection into something a learner can act on. */
export function describeRecorderError(err: unknown): RecorderError {
  const name = (err as { name?: string } | null)?.name ?? "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return new RecorderError(
        "denied",
        "Microphone access was declined. You can still compose and read the line aloud — the browser will ask again if you change your mind."
      );
    case "NotFoundError":
    case "DevicesNotFoundError":
      return new RecorderError("no-device", "No microphone was found on this device.");
    case "NotReadableError":
    case "TrackStartError":
      return new RecorderError(
        "device-busy",
        "The microphone is in use by another application."
      );
    case "SecurityError":
      return new RecorderError(
        "insecure-context",
        "Recording needs a secure connection (https or localhost)."
      );
    default:
      return new RecorderError("unknown", "The microphone could not be started.");
  }
}

export type RecorderState = "idle" | "requesting" | "recording" | "stopping";

/** The slice of MediaRecorder this uses, named so a fake can stand in. */
interface RecorderLike {
  start(): void;
  stop(): void;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
  readonly mimeType?: string;
}

interface StreamLike {
  getTracks(): { stop(): void }[];
}

export interface AttemptRecorderDeps {
  getUserMedia: () => Promise<StreamLike>;
  createRecorder: (stream: StreamLike, mimeType: string | null) => RecorderLike;
  isTypeSupported: (type: string) => boolean;
  now: () => number;
}

/** Wire to the real browser APIs. */
export function browserDeps(): AttemptRecorderDeps {
  const g = globalThis as unknown as {
    MediaRecorder: {
      new (stream: unknown, opts?: { mimeType?: string }): RecorderLike;
      isTypeSupported(type: string): boolean;
    };
    navigator: { mediaDevices: { getUserMedia(c: unknown): Promise<StreamLike> } };
  };
  return {
    getUserMedia: () => g.navigator.mediaDevices.getUserMedia({ audio: true }),
    createRecorder: (stream, mimeType) =>
      new g.MediaRecorder(stream, mimeType ? { mimeType } : undefined),
    isTypeSupported: (type) => g.MediaRecorder.isTypeSupported(type),
    now: () => Date.now(),
  };
}

export class AttemptRecorder {
  private deps: AttemptRecorderDeps;
  private recorder: RecorderLike | null = null;
  private stream: StreamLike | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private _state: RecorderState = "idle";

  constructor(deps: AttemptRecorderDeps) {
    this.deps = deps;
  }

  get state(): RecorderState {
    return this._state;
  }

  /**
   * Request the microphone and begin.
   *
   * Throws a RecorderError describing what went wrong; the caller decides
   * whether that is worth showing. On any failure the state returns to idle and
   * nothing is left held.
   */
  async start(): Promise<void> {
    if (this._state !== "idle") {
      throw new RecorderError("unknown", "Already recording.");
    }
    this._state = "requesting";

    let stream: StreamLike;
    try {
      stream = await this.deps.getUserMedia();
    } catch (err) {
      this._state = "idle";
      throw describeRecorderError(err);
    }

    try {
      const mimeType = pickMimeType(this.deps.isTypeSupported);
      const recorder = this.deps.createRecorder(stream, mimeType);
      this.chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) this.chunks.push(e.data);
      };
      recorder.start();

      this.stream = stream;
      this.recorder = recorder;
      this.startedAt = this.deps.now();
      this._state = "recording";
    } catch (err) {
      // The microphone was granted but the recorder would not start. Hand the
      // device back rather than holding it open behind a failed attempt.
      this.releaseStream(stream);
      this._state = "idle";
      throw describeRecorderError(err);
    }
  }

  /** Stop and resolve with what was captured. */
  stop(): Promise<Recording> {
    if (this._state !== "recording" || !this.recorder) {
      return Promise.reject(new RecorderError("unknown", "Not recording."));
    }
    const recorder = this.recorder;
    this._state = "stopping";

    return new Promise<Recording>((resolve, reject) => {
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || this.chunks[0]?.type || "audio/webm";
        const blob = new Blob(this.chunks, { type: mimeType });
        const approxDurationMs = this.deps.now() - this.startedAt;
        this.teardown();
        resolve({ blob, mimeType, approxDurationMs });
      };
      recorder.onerror = (e) => {
        this.teardown();
        reject(describeRecorderError(e));
      };
      recorder.stop();
    });
  }

  /** Abandon the attempt. Safe to call in any state, including twice. */
  cancel(): void {
    if (this.recorder && this._state === "recording") {
      try {
        this.recorder.stop();
      } catch {
        // Already stopped; the release below is what matters.
      }
    }
    this.teardown();
  }

  private teardown(): void {
    if (this.recorder) {
      this.recorder.ondataavailable = null;
      this.recorder.onstop = null;
      this.recorder.onerror = null;
    }
    this.releaseStream(this.stream);
    this.recorder = null;
    this.stream = null;
    this.chunks = [];
    this._state = "idle";
  }

  private releaseStream(stream: StreamLike | null): void {
    if (!stream) return;
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        // Nothing useful to do; the reference is dropped either way.
      }
    }
  }
}
