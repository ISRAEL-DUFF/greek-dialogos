/**
 * Tests for attempt recording.
 *
 * The state machine is driven through injected fakes rather than a DOM, so the
 * assertions are about real behaviour: which state the recorder lands in, and —
 * the property that actually matters — whether the microphone track is released
 * on every path out. A recorder that stops capturing but leaves the track live
 * keeps the browser's recording indicator lit and the device held open, and no
 * happy-path test would ever notice.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  AttemptRecorder,
  AttemptRecorderDeps,
  MIME_CANDIDATES,
  RecorderError,
  describeRecorderError,
  pickMimeType,
  recorderAvailability,
} from "../src/utils/recorder";

/** A stream that records whether its track was ever stopped. */
function fakeStream() {
  const state = { stopped: 0 };
  return {
    state,
    stream: {
      getTracks: () => [{ stop: () => void state.stopped++ }],
    },
  };
}

interface FakeOpts {
  failGetUserMedia?: unknown;
  failCreate?: unknown;
  supported?: string[];
}

function harness(opts: FakeOpts = {}) {
  const s = fakeStream();
  let clock = 1000;
  const created: { mimeType: string | null }[] = [];
  let live: {
    ondataavailable: ((e: { data: Blob }) => void) | null;
    onstop: (() => void) | null;
    onerror: ((e: unknown) => void) | null;
    started: boolean;
  } | null = null;

  const deps: AttemptRecorderDeps = {
    getUserMedia: async () => {
      if (opts.failGetUserMedia) throw opts.failGetUserMedia;
      return s.stream;
    },
    createRecorder: (_stream, mimeType) => {
      if (opts.failCreate) throw opts.failCreate;
      created.push({ mimeType });
      const rec = {
        ondataavailable: null as ((e: { data: Blob }) => void) | null,
        onstop: null as (() => void) | null,
        onerror: null as ((e: unknown) => void) | null,
        started: false,
        mimeType: mimeType ?? "audio/webm",
        start() {
          this.started = true;
        },
        stop() {
          this.ondataavailable?.({ data: new Blob(["greek"], { type: "audio/webm" }) });
          this.onstop?.();
        },
      };
      live = rec;
      return rec;
    },
    isTypeSupported: (t) => (opts.supported ?? [...MIME_CANDIDATES]).includes(t),
    now: () => clock,
  };

  return {
    deps,
    tracks: s.state,
    created,
    get live() {
      return live;
    },
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe("container selection", () => {
  test("takes the first candidate the browser admits", () => {
    assert.equal(pickMimeType((t) => t === "audio/webm;codecs=opus"), "audio/webm;codecs=opus");
    // Safari rejects webm and accepts mp4.
    assert.equal(pickMimeType((t) => t === "audio/mp4"), "audio/mp4");
  });

  test("preference order is honoured when several are supported", () => {
    assert.equal(pickMimeType(() => true), MIME_CANDIDATES[0]);
  });

  test("null when none is supported — not an error", () => {
    // Passing no mimeType lets the browser choose, which some builds accept
    // while rejecting every explicit string.
    assert.equal(pickMimeType(() => false), null);
  });
});

describe("availability", () => {
  const env = (over: Partial<Parameters<typeof recorderAvailability>[0]>) =>
    recorderAvailability({
      hasMediaRecorder: true,
      hasGetUserMedia: true,
      isSecureContext: true,
      ...over,
    });

  test("ready when everything is present", () => {
    assert.equal(env({}), "ready");
  });

  test("an insecure page is reported as such, not as a missing API", () => {
    // getUserMedia is absent on an insecure origin, so checking that first
    // would send someone hunting entirely the wrong problem.
    assert.equal(env({ isSecureContext: false, hasGetUserMedia: false }), "insecure-context");
  });

  test("a missing MediaRecorder is distinguished from a missing microphone API", () => {
    assert.equal(env({ hasMediaRecorder: false }), "no-media-recorder");
    assert.equal(env({ hasGetUserMedia: false }), "no-microphone-api");
  });
});

describe("error descriptions", () => {
  const kindOf = (name: string) => describeRecorderError({ name }).kind;

  test("refusal is identified as refusal", () => {
    assert.equal(kindOf("NotAllowedError"), "denied");
    assert.equal(kindOf("PermissionDeniedError"), "denied");
  });

  test("the other failures are told apart", () => {
    assert.equal(kindOf("NotFoundError"), "no-device");
    assert.equal(kindOf("NotReadableError"), "device-busy");
    assert.equal(kindOf("SecurityError"), "insecure-context");
    assert.equal(kindOf("SomethingNew"), "unknown");
  });

  test("refusal reads as an ordinary outcome, not a failure", () => {
    const msg = describeRecorderError({ name: "NotAllowedError" }).message;
    assert.match(msg, /still compose/i);
  });
});

describe("the happy path", () => {
  test("start then stop yields a recording and returns to idle", async () => {
    const h = harness();
    const rec = new AttemptRecorder(h.deps);
    assert.equal(rec.state, "idle");

    await rec.start();
    assert.equal(rec.state, "recording");
    assert.equal(h.live?.started, true);

    h.advance(2500);
    const out = await rec.stop();
    assert.equal(rec.state, "idle");
    assert.ok(out.blob.size > 0);
    assert.equal(out.approxDurationMs, 2500);
  });

  test("the chosen container reaches the recorder", async () => {
    const h = harness({ supported: ["audio/mp4"] });
    await new AttemptRecorder(h.deps).start();
    assert.equal(h.created[0].mimeType, "audio/mp4");
  });
});

describe("the microphone is released on every path", () => {
  test("after a normal stop", async () => {
    const h = harness();
    const rec = new AttemptRecorder(h.deps);
    await rec.start();
    await rec.stop();
    assert.equal(h.tracks.stopped, 1);
  });

  test("after cancelling mid-recording", async () => {
    const h = harness();
    const rec = new AttemptRecorder(h.deps);
    await rec.start();
    rec.cancel();
    assert.equal(h.tracks.stopped, 1);
    assert.equal(rec.state, "idle");
  });

  test("when the microphone was granted but the recorder would not start", async () => {
    // The subtle leak: permission succeeded, so a track is live, and the
    // failure happens afterwards.
    const h = harness({ failCreate: { name: "NotSupportedError" } });
    const rec = new AttemptRecorder(h.deps);
    await assert.rejects(() => rec.start(), RecorderError);
    assert.equal(h.tracks.stopped, 1, "the granted track was left open");
    assert.equal(rec.state, "idle");
  });

  test("cancelling twice is safe and does not double-release", () => {
    const h = harness();
    const rec = new AttemptRecorder(h.deps);
    rec.cancel();
    rec.cancel();
    assert.equal(h.tracks.stopped, 0);
    assert.equal(rec.state, "idle");
  });
});

describe("refusal and misuse", () => {
  test("a declined microphone leaves the recorder idle and holds nothing", async () => {
    const h = harness({ failGetUserMedia: { name: "NotAllowedError" } });
    const rec = new AttemptRecorder(h.deps);
    await assert.rejects(
      () => rec.start(),
      (e: RecorderError) => e.kind === "denied"
    );
    assert.equal(rec.state, "idle");
    assert.equal(h.tracks.stopped, 0);
  });

  test("a refusal can be retried — the browser may ask again", async () => {
    const h = harness({ failGetUserMedia: { name: "NotAllowedError" } });
    const rec = new AttemptRecorder(h.deps);
    await assert.rejects(() => rec.start());
    await assert.rejects(() => rec.start(), RecorderError);
  });

  test("stopping when not recording rejects rather than throwing", async () => {
    const h = harness();
    await assert.rejects(() => new AttemptRecorder(h.deps).stop(), RecorderError);
  });

  test("starting twice rejects and does not disturb the recording in progress", async () => {
    const h = harness();
    const rec = new AttemptRecorder(h.deps);
    await rec.start();
    await assert.rejects(() => rec.start(), RecorderError);
    assert.equal(rec.state, "recording");
    assert.equal(h.tracks.stopped, 0);
  });
});
