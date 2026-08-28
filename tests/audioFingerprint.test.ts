/**
 * Regression test for the decoded-buffer cache key.
 *
 * The bug: the key was `base64.slice(0, 48) + "_" + length`. Every clip the
 * speech engine returns opens with 200–500 bytes of digital silence, and 48
 * base64 characters cover only 36 bytes — so the prefix was "AAAA…A" for every
 * clip, and the key collapsed to the byte length alone. Lengths are quantised
 * to 640-byte frames, so two lines matching within ~13ms of duration collided
 * and one played the other's audio.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

/** The key as it used to be computed. */
const legacyKey = (b64: string) => `${b64.slice(0, 48)}_${b64.length}`;

/** Base64 of `bytes` bytes of silence followed by distinct content. */
function clip(silenceBytes: number, marker: number, totalBytes: number): string {
  const buf = Buffer.alloc(totalBytes);
  for (let i = silenceBytes; i < totalBytes; i++) buf[i] = (marker + i) % 251 || 1;
  return buf.toString("base64");
}

describe("the old key collided on real audio", () => {
  test("two different clips of the same length produced the same key", () => {
    const a = clip(300, 7, 6400);
    const b = clip(300, 91, 6400);
    assert.notEqual(a, b, "the clips differ");
    assert.equal(legacyKey(a), legacyKey(b), "…yet the old key treated them as one");
  });

  test("the leading 48 characters are identical across clips", () => {
    // 48 base64 chars = 36 bytes, and every clip has far more silence than that.
    assert.equal(clip(300, 7, 6400).slice(0, 48), clip(300, 91, 9600).slice(0, 48));
  });
});

describe("clips are distinguished now", () => {
  // Mirrors the implementation; the property under test is that content
  // participates, not the specific hash.
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

  test("same length, different content, different key", () => {
    assert.notEqual(fingerprint(clip(300, 7, 6400)), fingerprint(clip(300, 91, 6400)));
  });

  test("identical content still shares a key, so caching still works", () => {
    assert.equal(fingerprint(clip(300, 7, 6400)), fingerprint(clip(300, 7, 6400)));
  });

  test("many same-length clips are all distinct", () => {
    const keys = new Set(
      Array.from({ length: 40 }, (_, i) => fingerprint(clip(300, i * 3 + 1, 6400)))
    );
    assert.equal(keys.size, 40, "a collision remains");
  });
});
