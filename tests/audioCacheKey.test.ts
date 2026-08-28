/**
 * Tests for the audio cache key.
 *
 * The bug these guard against: the cached-lines indicator counted every record
 * stored for a module, ignoring voice and rendering variant, while playback
 * looked up the exact key. A line cached under one voice or one settings
 * combination was reported as ready under all of them, then regenerated on
 * play — a promise the lookup would not honour.
 *
 * IndexedDB is not available here, so these cover the key logic itself, which
 * is what the two paths must agree on.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { audioCacheKey, isLegacyRecord, variantOf } from "../src/utils/audioStorage";

describe("cache key identity", () => {
  test("voice is part of the key", () => {
    assert.notEqual(
      audioCacheKey("m", 1, "Fenrir", "efn"),
      audioCacheKey("m", 1, "Puck", "efn")
    );
  });

  test("rendering variant is part of the key", () => {
    // Erasmian vs Reconstructed produce genuinely different audio.
    assert.notEqual(
      audioCacheKey("m", 1, "Fenrir", "efn"),
      audioCacheKey("m", 1, "Fenrir", "rfn")
    );
  });

  test("line and module are part of the key", () => {
    assert.notEqual(audioCacheKey("m", 1, "F", "efn"), audioCacheKey("m", 2, "F", "efn"));
    assert.notEqual(audioCacheKey("a", 1, "F", "efn"), audioCacheKey("b", 1, "F", "efn"));
  });

  test("the same identity always yields the same key", () => {
    assert.equal(audioCacheKey("m", 3, "Kore", "rfp"), audioCacheKey("m", 3, "Kore", "rfp"));
  });

  test("an empty variant keeps the pre-variant key shape", () => {
    // So audio cached before variants existed is not orphaned by the change
    // itself — it is removed deliberately, by the purge.
    assert.equal(audioCacheKey("m", 1, "Fenrir"), "m__line_1__voice_Fenrir");
  });
});

describe("legacy records", () => {
  test("a key without a variant is legacy", () => {
    assert.equal(isLegacyRecord("m__line_1__voice_Fenrir"), true);
  });

  test("a key with a variant is not", () => {
    assert.equal(isLegacyRecord("m__line_1__voice_Fenrir__v_efn"), false);
  });

  test("every variant this app produces is recognised as current", () => {
    for (const scheme of ["m", "e", "r"]) {
      for (const flow of ["f", "-"]) {
        for (const stress of ["a", "p", "n"]) {
          const key = audioCacheKey("m", 1, "Fenrir", `${scheme}${flow}${stress}`);
          assert.equal(isLegacyRecord(key), false, key);
        }
      }
    }
  });
});

describe("export/import round-trip preserves the variant", () => {
  // The variant used to live only inside the composite key. Export reads
  // records, not keys, so it dropped the variant and every clip came back
  // under the legacy no-variant key.
  test("variantOf reads the stored field when present", () => {
    assert.equal(
      variantOf({ key: "m__line_1__voice_Fenrir__v_efn", variant: "efn" } as never),
      "efn"
    );
  });

  test("variantOf recovers the variant from a key written before the field", () => {
    assert.equal(variantOf({ key: "m__line_1__voice_Fenrir__v_efn" } as never), "efn");
  });

  test("a legacy record with no variant in its key reports none", () => {
    assert.equal(variantOf({ key: "m__line_1__voice_Fenrir" } as never), "");
  });

  test("a full round-trip lands on the key it started from", () => {
    const original = audioCacheKey("m", 3, "Fenrir", "efn");
    const exported = variantOf({ key: original } as never);
    assert.equal(audioCacheKey("m", 3, "Fenrir", exported), original);
  });
})
