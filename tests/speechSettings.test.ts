/**
 * Tests for speech settings.
 *
 * The variant fingerprint is the important part: it is what stops a settings
 * change from serving audio rendered under different settings.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS,
  settingsVariant,
  SCHEME_INFO,
  SpeechSettings,
  PronunciationScheme,
} from "../src/utils/speechSettings";
import { StressDensity } from "../src/utils/phoneticConverter";

const SCHEMES: PronunciationScheme[] = ["modern", "erasmian", "reconstructed"];
const DENSITIES: StressDensity[] = ["all", "phrase", "none"];

describe("cache variant", () => {
  test("every distinct combination gets a distinct fingerprint", () => {
    const seen = new Set<string>();
    let count = 0;
    for (const pronunciation of SCHEMES) {
      for (const stressDensity of DENSITIES) {
        for (const connectedSpeech of [true, false]) {
          seen.add(settingsVariant({ ...DEFAULT_SETTINGS, pronunciation, stressDensity, connectedSpeech }));
          count++;
        }
      }
    }
    assert.equal(seen.size, count, "two settings combinations share a cache key");
  });

  test("contextual delivery is excluded — it has its own per-line hash", () => {
    const a: SpeechSettings = { ...DEFAULT_SETTINGS, contextualDelivery: false };
    const b: SpeechSettings = { ...DEFAULT_SETTINGS, contextualDelivery: true };
    assert.equal(settingsVariant(a), settingsVariant(b));
  });

  test("changing pronunciation changes the key", () => {
    assert.notEqual(
      settingsVariant({ ...DEFAULT_SETTINGS, pronunciation: "modern" }),
      settingsVariant({ ...DEFAULT_SETTINGS, pronunciation: "reconstructed" })
    );
  });
});

describe("scheme descriptions", () => {
  test("every scheme is described for the UI", () => {
    for (const s of SCHEMES) {
      const info = SCHEME_INFO[s];
      assert.ok(info.label && info.summary && info.tradeoff && info.sample, `${s} incomplete`);
    }
  });

  test("Modern names the merger it causes, since that is the reason to avoid it", () => {
    assert.match(SCHEME_INFO.modern.tradeoff, /merge|identical/i);
  });
});

describe("defaults", () => {
  test("Erasmian, connected, no stress marks", () => {
    assert.equal(DEFAULT_SETTINGS.pronunciation, "erasmian");
    assert.equal(DEFAULT_SETTINGS.connectedSpeech, true);
    assert.equal(DEFAULT_SETTINGS.stressDensity, "none");
  });
});
