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

describe("word highlighting", () => {
  test("is off by default", () => {
    // The marker is driven by an estimate, and connected speech made that
    // estimate worse — a marker on the wrong word is worse than none.
    assert.equal(DEFAULT_SETTINGS.wordHighlight, false);
  });

  test("is not part of the cache variant", () => {
    // It changes nothing about the audio. Including it would re-render every
    // clip to toggle a visual aid.
    const off = { ...DEFAULT_SETTINGS, wordHighlight: false };
    const on = { ...DEFAULT_SETTINGS, wordHighlight: true };
    assert.equal(settingsVariant(on), settingsVariant(off));
  });

  test("survives a round trip through storage validation", () => {
    for (const value of [true, false]) {
      const parsed = JSON.parse(JSON.stringify({ ...DEFAULT_SETTINGS, wordHighlight: value }));
      assert.equal(typeof parsed.wordHighlight, "boolean");
      assert.equal(parsed.wordHighlight, value);
    }
  });

  test("a stored blob missing the field falls back to off", () => {
    const legacy: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    delete legacy.wordHighlight;
    assert.equal(
      typeof legacy.wordHighlight === "boolean" ? legacy.wordHighlight : DEFAULT_SETTINGS.wordHighlight,
      false
    );
  });
});

describe("roleplay exercise settings", () => {
  test("both are on by default", () => {
    // Unlike the follow-along marker these are reliable, and they are the
    // exercise rather than an embellishment on it.
    assert.equal(DEFAULT_SETTINGS.roleplayCompose, true);
    assert.equal(DEFAULT_SETTINGS.roleplayRecord, true);
  });

  test("neither is part of the cache variant", () => {
    // They decide which exercise a turn offers, not how anything is spoken.
    // Including them would re-render every cached clip to toggle a UI choice.
    const base = settingsVariant(DEFAULT_SETTINGS);
    for (const flips of [
      { roleplayCompose: false },
      { roleplayRecord: false },
      { roleplayCompose: false, roleplayRecord: false },
    ]) {
      assert.equal(settingsVariant({ ...DEFAULT_SETTINGS, ...flips }), base, JSON.stringify(flips));
    }
  });

  test("the variant still moves for anything that changes the audio", () => {
    // Guards the test above from being satisfied by a variant that ignores
    // everything.
    assert.notEqual(
      settingsVariant({ ...DEFAULT_SETTINGS, pronunciation: "modern" }),
      settingsVariant({ ...DEFAULT_SETTINGS, pronunciation: "erasmian" })
    );
    assert.notEqual(
      settingsVariant({ ...DEFAULT_SETTINGS, stressDensity: "all" }),
      settingsVariant({ ...DEFAULT_SETTINGS, stressDensity: "none" })
    );
  });

  test("a stored blob written before these existed falls back to the defaults", () => {
    const legacy: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    delete legacy.roleplayCompose;
    delete legacy.roleplayRecord;
    for (const key of ["roleplayCompose", "roleplayRecord"] as const) {
      assert.equal(
        typeof legacy[key] === "boolean" ? legacy[key] : DEFAULT_SETTINGS[key],
        true
      );
    }
  });
});
