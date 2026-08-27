# Fix Plan — Ancient Greek Dialogue TTS

Status: draft, awaiting review.
Scope: correctness and deployment defects found in a read-through of `server.ts`, `src/`, and the deployment config. No feature work.

Items are grouped by severity and given stable IDs (`P0-1`, `P1-2`, …) so they can be referenced, reordered, or dropped without renumbering the rest.

---

## Decisions

Recorded 2026-08-26. These resolve the questions this document opened with and are assumed by every item below.

| # | Question | Decision |
|---|---|---|
| D1 | Provider hierarchy | **OpenRouter stays primary; populate `GEMINI_API_KEY` so the fallback is real.** |
| D2 | Continuous multi-speaker scene audio | ~~Build it.~~ **Superseded by D7.** |
| D3 | Offline study | **A real goal.** The cache is not merely a cost optimization. |
| D4 | 3+ speaker modules | ~~Windowed segmentation.~~ **Moot under D7** — per-line playback has no speaker cap. |
| D5 | Ask AI offline | **Cache responses** in IndexedDB by `(moduleId, phrase)` hash; disable new queries when offline. |
| D6 | Provider split if P0-2 fails | **Resolved — the endpoint is real.** OpenRouter stays primary for both LLM and TTS. See Verification results. |
| D7 | Scene audio vs. per-line | **Keep per-line playback as-is.** Delete `/api/tts-dialogue`. Improve naturalness by giving the TTS model conversational context per line, and by varying inter-line gaps. |

**D7 dissolves the D1 × D2 problem.** The earlier plan noted that `callOpenRouterTTS()` accepts exactly one `voice` ([`server.ts:37-41`](../server.ts#L37)), so multi-speaker scene audio could only run through Gemini's `multiSpeakerVoiceConfig` — which made `GEMINI_API_KEY` a prerequisite for a shipped feature rather than a fallback. **D7 removes that dependency entirely.** Per-line playback already assigns a distinct voice per speaker ([`App.tsx:141`](../src/App.tsx#L141)) with no speaker cap, no segmentation, and no provider constraint. Multi-voice dialogue is not a feature to be built — it works today.

`GEMINI_API_KEY` therefore reverts to being a genuine fallback. It is still **P0-4**, but for the original reason: combined with P0-2, its absence means a single OpenRouter failure takes down all speech with no recovery path.

**D3 widens P1-6 substantially** and adds P1-7: if offline is a goal, every network-dependent surface needs a defined offline behaviour, not a failed `fetch`.

**Correction to an earlier reading in this document:** `WordGlossModal` was previously described here as AI-dependent. It is not. It renders the static `WordGloss` data bundled in each module ([`WordGlossModal.tsx:1-30`](../src/components/WordGlossModal.tsx#L1)) and its only network dependency is the pronunciation button. The genuinely network-bound AI surfaces are the free-text Ask AI box ([`LinguisticNotes.tsx:39`](../src/components/LinguisticNotes.tsx#L39)) and the module importer. P1-7 is scoped to those.

**D6 is closed.** The `curl` ran on 2026-08-26; the OpenRouter audio endpoint exists and works. D1 stands unchanged: OpenRouter primary for both LLM and TTS, Gemini as fallback.

---

## Verification results

Run against the live OpenRouter API on 2026-08-26 with the project's own key. These supersede several assumptions the first draft of this plan was built on.

**Re-confirmed after the user updated `.env`** (`OPENROUTER_MODEL` → `google/gemini-3.7-flash`). Current state: **LLM restored, TTS still broken.** See P0-5 for what remains stale outside `.env`.

| Check | Result |
|---|---|
| `POST /api/v1/audio/speech` exists | **Yes.** The endpoint is real and documented behaviour matches. |
| `response_format: "mp3"` | **HTTP 400** — `Gemini TTS only supports response_format="pcm". Got "mp3".` |
| `response_format: "pcm"` | **HTTP 200**, `content-type: audio/pcm;rate=24000;channels=1`, 134 400 bytes |
| `response_format` **omitted** | **HTTP 200**, `audio/pcm;rate=24000;channels=1`. PCM is the default. |
| `wav`, `opus`, `aac`, `flac` | **HTTP 400** each. `pcm` is the *only* accepted value. |
| Returned audio format | Raw headerless 16-bit signed LE mono @ 24 kHz. 67 200 samples = 2.80 s, peak 18 188, RMS 2 329 — valid speech. |
| Voice name casing | Both `fenrir` and `Fenrir` return 200. The `.toLowerCase()` at [`server.ts:61`](../server.ts#L61) is harmless. |
| Invalid voice name | **HTTP 500**, opaque `Internal Server Error`. No validation, no useful message. |
| TTS model `google/gemini-3.1-flash-tts-preview` | **Works**, and is documented on OpenRouter's site with sample code. Absent from the `/api/v1/models` response (417 models, no Google TTS model listed) — a gap in that endpoint, not a sign the model is unsupported. |
| LLM model `google/gemini-2.0-flash-001` | **HTTP 404** — `No endpoints found for google/gemini-2.0-flash-001.` |
| `google/gemini-3.7-flash` | **Works**, now configured. Reasoning model — 62 tokens for "OK"; **260 tokens and $0.000507** for a 3-word Greek translation. `json_object` mode confirmed working. |
| `google/gemini-3.1-flash-lite` | **Works.** No reasoning tokens. Cost $0.00000275 — roughly 44× cheaper on trivial calls. |

**Bottom line: the app cannot currently produce any output at all.** Every TTS call 400s on the mp3 format, and every LLM call 404s on a decommissioned model. With `GEMINI_API_KEY` empty there is no fallback for either. This is worse than the first draft assessed — it diagnosed the TTS path as producing *noise*, when in fact it produces *nothing*.

---

## P0 — Broken on the primary code path

### P0-1 · ✅ DONE — Every TTS call failed: `response_format: "mp3"` was rejected
**Where:** [`server.ts:63`](../server.ts#L63) · **Verified 2026-08-26**

`callOpenRouterTTS` requests `response_format: "mp3"`. The API rejects it outright:

```
HTTP 400 — {"error":{"message":"Gemini TTS only supports response_format=\"pcm\". Got \"mp3\".","code":400}}
```

Every single TTS request in the application returns 400. Because `GEMINI_API_KEY` is empty (P0-4), the fallback at [`server.ts:231`](../server.ts#L231) is unreachable and the error rethrows. **There is currently no path to audio in this app.**

**Fix — one word:** change `"mp3"` to `"pcm"` at [`server.ts:63`](../server.ts#L63). Verified exhaustively: `pcm` is the *only* accepted value — `wav`, `opus`, `aac`, and `flac` all return 400 — and omitting the field entirely also yields PCM. Setting it explicitly is preferable to omitting it: self-documenting, and immune to a future change in the default.

**Where this bug came from.** OpenRouter's own published sample for this model omits `response_format` and then writes the result to `output.mp3`:

```ts
const stream = await openrouter.tts.createSpeech({ speechRequest: {
  model: "google/gemini-3.1-flash-tts-preview", input: "...", voice: "Zephyr" }});
// ...
await fs.promises.writeFile("output.mp3", buffer);
```

That filename is wrong. Requesting exactly what the sample requests returns `audio/pcm;rate=24000;channels=1`, and the bytes carry no `ID3` tag and no MPEG frame sync — they are raw 16-bit PCM (verified: 84 480 samples, 3.52 s @ 24 kHz, peak 23 543). Following that sample produces a `.mp3` file no player can open. It is a documentation defect on OpenRouter's side, and it is the most likely origin of the `"mp3"` in this codebase.

**Correction to this plan's first draft.** It claimed the returned mp3 bytes were being misdecoded as PCM and played as white noise, and proposed a mime-type branching rewrite of `decodeAudio()`. That was wrong in a way worth recording: the request never succeeds, so no bytes ever reach the decoder. **The elaborate decoder rewrite is unnecessary.** Verified against the live response:

- Returned `content-type` is `audio/pcm;rate=24000;channels=1`.
- The payload is raw headerless 16-bit signed little-endian mono PCM — no `RIFF` header, first 16 bytes are silence padding.
- `decodeAudio()`'s existing sample-rate parse (`mimeType.split("rate=")[1]` → `parseInt`) yields `24000` correctly even with the trailing `;channels=1`.
- Its PCM branch already assumes 16-bit signed LE mono at 24 kHz.

**The existing decoder is correct for this payload.** Once the format string is fixed, playback works with no client change.

**Optional hardening, not required:** keep a defensive `decodeAudioData()` branch for `audio/mpeg` and `audio/wav` in case the format is ever changed, and strip the 44-byte header if a `RIFF` buffer ever fails `decodeAudioData`. Low priority — no current code path produces either.

**Verify:** synthesize one line and confirm intelligible speech. A regression test asserting the request body contains `"pcm"` is cheap insurance against this recurring.

### P0-2 · RESOLVED — the OpenRouter TTS endpoint is real
**Where:** [`server.ts:51-77`](../server.ts#L51) · **Closed 2026-08-26**

`https://openrouter.ai/api/v1/audio/speech` exists and works with the project's key. **D6 resolves in favour of keeping OpenRouter primary for both LLM and TTS.** No provider restructuring is needed.

Two residual items fall out of the verification, neither blocking:

- **`.toLowerCase()` at [`server.ts:61`](../server.ts#L61) is harmless** — both `fenrir` and `Fenrir` return 200. Leave it or remove it; no behavioural difference. The concern raised in the first draft was unfounded.
- **An invalid voice name returns an opaque HTTP 500**, not a validation error. Tracked as P2-8.

### P0-3 · ✅ MOSTLY DONE — model ids hoisted; two Gemini-native ids still unverified
**Where:** [`server.ts:84`](../server.ts#L84), [`server.ts:156`](../server.ts#L156), [`server.ts:236`](../server.ts#L236), [`server.ts:320`](../server.ts#L320) · **Partly verified 2026-08-26**

| Id | Where | Status |
|---|---|---|
| `google/gemini-2.0-flash-001` | `.env`, `.env.example`, default at [`server.ts:84`](../server.ts#L84) | **Dead — 404.** See P0-5. |
| `google/gemini-3.1-flash-tts-preview` | `.env`, default at [`server.ts:52`](../server.ts#L52) | **Works. Documented on OpenRouter's site**, absent from `/api/v1/models`. |
| `gemini-3.7-flash` (Gemini-native) | [`server.ts:156`](../server.ts#L156) | **Unverified** — needs a Gemini key (P0-4). Its OpenRouter counterpart `google/gemini-3.7-flash` does exist, which is encouraging but not proof. |
| `gemini-3.1-flash-tts-preview` (Gemini-native) | [`server.ts:236`](../server.ts#L236), [`server.ts:320`](../server.ts#L320) | **Unverified** — same reason. |

**On the TTS model's absence from `/api/v1/models`:** an earlier revision of this plan treated this as evidence of an undocumented endpoint at risk of silent withdrawal. That was an over-read. The model is documented on OpenRouter's site with published sample code; the gap is in that one API endpoint's coverage of TTS models (no Google TTS model appears there at all). Treat it as a listing gap, not a stability signal.

It does still mean one practical thing: **you cannot discover or validate the TTS model id programmatically.** A health check that verifies model availability by querying `/api/v1/models` will produce a false negative. Validate by making a real synthesis call instead.

The genuine stability lesson comes from `gemini-2.0-flash-001` (P0-5), which *was* listed and was withdrawn anyway.

**Fix:**
1. Hoist all model ids into named constants or env vars with defaults at the top of `server.ts`, so there is one place to change them.
2. Have `/api/health` report the resolved ids (P2-3).
3. Given the withdrawal risk, make TTS failure degrade *visibly* — a clear "speech unavailable, check model configuration" state rather than a generic 500.

### P0-4 · `GEMINI_API_KEY` is empty, so the documented fallback does not exist
**Where:** `.env` (untracked), [`server.ts:17`](../server.ts#L17), [`.env.example:11`](../.env.example#L11)

`isGeminiConfigured()` returns false today. Every fallback branch in `server.ts` — `generateLlmText` ([`server.ts:145`](../server.ts#L145)), `/api/tts` ([`server.ts:231`](../server.ts#L231)), `/api/tts-dialogue` ([`server.ts:316`](../server.ts#L316)) — is unreachable, and each rethrows the OpenRouter error instead. The README's "seamless fallback" is currently fiction, and combined with P0-2 it means a single OpenRouter outage or a fake audio endpoint takes down all speech with no recovery path.

Under **D7** this no longer gates a feature — per-line multi-voice playback needs no Gemini-specific capability. And with P0-2 resolved, OpenRouter TTS is confirmed working, so the key is not needed to restore basic function either.

It stays P0 for a different reason the verification exposed: **`google/gemini-2.0-flash-001` was withdrawn out from under this app with no notice** (P0-5), silently killing both LLM features. The TTS model is a `-preview` id, which carries the same risk by definition. A single-vendor dependency with no configured fallback is how the app arrived at its current broken state, and nothing prevents a repeat. The Gemini key is the insurance.

**Fix:**
1. Obtain a Gemini API key and set it in `.env` locally and in Vercel project env vars.
2. Change `.env.example` to stop labelling it "Optional" — it is the only fallback for a core feature. Say so in the comment.
3. Make `/api/providers` distinguish *"fallback configured"* from *"fallback missing"* so the header badge can warn when the app is running without a safety net.

**Verify:** unset `OPENROUTER_API_KEY`, restart, and confirm both `/api/tts` and `/api/gemini/explain` still return 200 via Gemini.

### P0-5 · ✅ DONE — the decommissioned LLM model has been purged
**Where:** [`server.ts:88`](../server.ts#L88), [`server.ts:764`](../server.ts#L764), [`server.ts:775`](../server.ts#L775), [`.env.example:5-6`](../.env.example#L5), [`README.md:98`](../README.md#L98), [`README.md:155`](../README.md#L155) · **Re-verified 2026-08-26**

`google/gemini-2.0-flash-001` returns `HTTP 404 — No endpoints found`. It has been decommissioned.

**Fixed:** `.env` now sets `OPENROUTER_MODEL="google/gemini-3.7-flash"`. Verified live — a Greek translation request returns `"Greetings, O friend!"`, and `response_format: {type: "json_object"}` (required by module import, [`server.ts:565`](../server.ts#L565)) returns valid JSON. **Ask AI and module import work again on this machine.**

**Still broken everywhere else.** The dead id remains in six locations, so any environment that does not set `OPENROUTER_MODEL` explicitly still 404s:

| Location | Impact |
|---|---|
| [`server.ts:88`](../server.ts#L88) | `callOpenRouter` default — a fresh clone or a deploy without the env var set fails on every LLM call |
| [`server.ts:764`](../server.ts#L764), [`server.ts:775`](../server.ts#L775) | `/api/providers` reports a dead model to the header badge |
| [`.env.example:5-6`](../.env.example#L5) | every new developer starts broken |
| [`README.md:98`](../README.md#L98), [`README.md:155`](../README.md#L155) | the Vercel deployment instructions tell you to set a 404 |

**Fix:** replace all six with `google/gemini-3.7-flash`. Also set `OPENROUTER_MODEL` in the Vercel project environment — `.env` is untracked and does not deploy.

**Cost caveat, now measured.** `google/gemini-3.7-flash` is a reasoning model and the overhead is not trivial: **260 reasoning tokens and $0.000507 to translate three Greek words.** Module generation produces a large structured JSON document, so budget for materially more than the visible output suggests. `google/gemini-3.1-flash-lite` costs roughly 44× less with zero reasoning tokens, but reasoning is likely worth paying for on morphological parsing, where a wrong answer is the failure mode. Document both in `.env.example` and let the operator choose.

**Latent trap:** `callOpenRouter` sends no `max_tokens`. If anyone adds one, reasoning tokens will consume the budget, `content` will return empty, and [`server.ts:129`](../server.ts#L129) throws `"No response generated by OpenRouter"` with no hint why. Add a comment there.

---

## P1 — Real defects, off the default path

### P1-1 · ✅ DONE — `/api/tts-dialogue` deleted
**Where:** [`server.ts:279-374`](../server.ts#L279) · **Decision:** D7

Nothing in `src/` calls this endpoint. It normalizes every speaker to `"Socrates"` or `"Alexander"` ([`server.ts:288-292`](../server.ts#L288)), so it cannot serve the Aesop or *Apology* modules, and its `socratesVoice` / `alexanderVoice` parameters bake that assumption into the API contract.

An earlier revision of this plan proposed rebuilding it as a windowed multi-speaker scene renderer. **D7 reverses that.** The rebuild would have cost per-line word highlighting, per-line cache reuse, and single-line replay — all working features — in exchange for smoother conversational flow, in a study tool where word highlighting is a headline capability. The naturalness gain is pursued instead through P1-8 and P1-9, which keep every existing feature intact.

**Fix:** delete the route and `callOpenRouterTTS`'s unused multi-speaker framing. Remove the corresponding claim from the README (see P2-4). Keep `multiSpeakerVoiceConfig` out of the codebase entirely — its 2-speaker cap conflicts with the 3-speaker Aesop module ([`dialogueData.ts:588-591`](../src/data/dialogueData.ts#L588)) and there is now no caller that needs it.

**Verify:** `grep -rn "tts-dialogue" .` returns nothing outside this document; all three built-in modules still play end to end.

### P1-2 · ✅ DONE — pre-cache is cancellable and reports failures
**Where:** [`src/App.tsx:183-224`](../src/App.tsx#L183)

`handlePrecacheAudio()` loops every line with a sequential `await fetch`, checking only `isPrecaching` at entry. There is no way to cancel a run in progress, navigating away leaves it running, and a module with many lines issues that many billed TTS calls with no ceiling. Failures are swallowed to `console.warn` ([`src/App.tsx:216`](../src/App.tsx#L216)), so a run where every call 401s still reports as complete.

**Fix:** add an `AbortController` stored in a ref, check it each iteration, abort on module change and unmount, and surface a cancel button in the progress UI. Count failures and report them (`"cached 8 of 12 lines, 4 failed"`) instead of silently finishing.

### P1-3 · ✅ DONE — playback race replaced with a generation counter
**Where:** [`src/App.tsx:255-258`](../src/App.tsx#L255), [`src/App.tsx:345-348`](../src/App.tsx#L345)

Both play handlers set `stopSequenceRef.current = true`, call `audioPlayer.stop()`, `await new Promise(r => setTimeout(r, 20))`, then reset the flag. The comment calls it a "brief microtask for previous loop to exit". It is a timing guess: if the previous loop is awaiting a slow `fetchLineAudioBuffer`, it has not reached its stop check within 20 ms and will resume playing after the new sequence starts, producing two overlapping playbacks.

**Fix:** replace the boolean ref plus sleep with a monotonically increasing generation counter. Each sequence captures its generation at entry and bails whenever `generationRef.current !== myGeneration`. No sleep, and correct regardless of how long a fetch takes.

### P1-4 · ✅ DONE (documented, not fixed) — word highlighting is now described as an estimate
**Where:** [`src/utils/audioPlayer.ts:13-45`](../src/utils/audioPlayer.ts#L13)

`calculateWordTimings()` distributes total duration by character count, vowel count, and a punctuation bonus. It is not derived from the audio. Drift accumulates across a long line, so the last words in a sentence are visibly out of step.

**Fix:** no cheap correct fix exists without timestamps from the TTS provider. Two options:
- Accept it, and soften the README wording from "word-by-word synchronized audio highlighting" to "estimated word highlighting".
- If the provider can return word-level timestamps, use them and keep the heuristic as fallback.

Decide the wording change at minimum; the code change is optional.

### P1-5 · ✅ DONE — decoded-buffer cache is bounded
**Where:** [`src/utils/audioPlayer.ts:50`](../src/utils/audioPlayer.ts#L50)

`audioCache: Map<string, AudioBuffer>` grows for the lifetime of the page and is never evicted. Decoded 24 kHz mono buffers are roughly 48 KB per audio-second; a long pre-cached session holds tens of megabytes of decoded PCM on top of what IndexedDB already stores.

**Fix:** cap it (LRU, ~30 entries) or drop the map entirely — IndexedDB is already the durable cache and decode is fast.

### P1-6 · ✅ DONE (service worker unverified) — audio cache is now a managed offline store
**Where:** [`src/utils/audioStorage.ts`](../src/utils/audioStorage.ts) · **Decision:** D3 (offline is a goal)

Audio accumulates per `(module, line, voice)` with no cap, no eviction, and no UI showing how much is stored. Switching voices multiplies entries. Crucially for D3: browsers evict an origin's storage under pressure, and they do it wholesale — a user who pre-cached a module for a flight can lose all of it silently.

Because offline is a real goal, this is no longer just hygiene:

1. **`navigator.storage.persist()`** — request persistent storage on first pre-cache. Without it, nothing here is durable, and every other item in this list is built on sand. Do this first.
2. **`getStorageStats()` plus a storage UI** — bytes used, quota remaining, per-module breakdown, and a per-module "remove downloaded audio" control. Users cannot manage an offline library they cannot see.
3. **Eviction policy** — LRU by `createdAt`/last-access, but *never* evict a module the user explicitly marked for offline use. That distinction requires a "keep offline" flag per module in localStorage.
4. **Service worker** — the app shell (`index.html`, the Vite bundle, CSS) must be cached or the page will not even load offline. Built-in modules ship in the JS bundle; custom modules are already in localStorage. Consider `vite-plugin-pwa` rather than hand-rolling.
5. **Integrity check** — on load, reconcile IndexedDB against the module list and drop orphaned entries from deleted custom modules.

**Verify:** pre-cache a module, go offline in DevTools, hard-reload, and confirm the app loads and plays every cached line.

### P1-7 · ✅ DONE — offline behaviour is defined and signposted
**Where:** [`src/components/LinguisticNotes.tsx:39-66`](../src/components/LinguisticNotes.tsx#L39), [`src/components/ModuleImporter.tsx:200`](../src/components/ModuleImporter.tsx#L200), [`src/App.tsx:417`](../src/App.tsx#L417) · **Decisions:** D3, D5

D3 splits the app into two halves that behave very differently without a network, and nothing in the UI currently marks the boundary:

| Works offline (once cached) | Requires network |
|---|---|
| Reading all module text, commentary, Stephanus/book view | Ask AI free-text queries — *new* ones only, see D5 |
| **The full word-gloss modal** — it is static data, not AI | `/api/ai-import-module` (module generation and raw-text import) |
| Playing pre-cached line audio, roleplay against it | `/api/tts` for any *uncached* line or word |
| Previously-asked Ask AI answers (under D5) | Custom TTS sandbox (never cached — see below) |

`handlePlayWordTTS` ([`src/App.tsx:417`](../src/App.tsx#L417)) has no `try`/`catch` at all, so an offline click rejects unhandled — the modal's own handler catches to `console.error` ([`WordGlossModal.tsx:22-30`](../src/components/WordGlossModal.tsx#L22)) and the user sees the button spin and stop with no explanation.

**Fix:**
- **Cache Ask AI responses (D5).** Add an `explanations` object store keyed by a hash of `(moduleId, normalized phrase)`, written on every successful `/api/gemini/explain`. On submit, check the cache first — this also stops users re-paying for a question they already asked online. Show a "cached answer" marker so nobody mistakes a stored response for a fresh one.
- **Disable new Ask AI queries when offline** with a tooltip naming the reason, rather than letting the fetch fail into the current `Error: …` string rendered in the response pane ([`LinguisticNotes.tsx:61`](../src/components/LinguisticNotes.tsx#L61)).
- **Add an online/offline indicator** (`navigator.onLine` plus the `online`/`offline` events) and gate every network-only control on it.
- **Wrap `handlePlayWordTTS`** in error handling that routes into the existing `playbackError` state instead of rejecting.
- **Distinguish "not cached yet" from "failed"** in line-level UI so users know what a pre-cache pass would fix.
- **Cache custom-TTS sandbox output** keyed by `(text, voice, emotion)` hash — it is currently the one synthesis path that never persists ([`src/App.tsx:438-459`](../src/App.tsx#L438)).

**Note on cache invalidation:** Ask AI answers are tied to module content. If a custom module is edited, its cached explanations are stale. Key them by module *content* hash, or clear a module's explanations whenever it is re-imported.

### P1-8 · ✅ DONE — inter-line gaps now derive from punctuation and speaker change
**Where:** [`src/App.tsx:375`](../src/App.tsx#L375), [`src/App.tsx:295`](../src/App.tsx#L295) · **Decision:** D7

`handlePlayFullDialogue` sleeps a hardcoded 400 ms between every pair of lines, and 800 ms between loop repetitions. Every turn boundary gets identical spacing — the same pause after a casual greeting as after a weighty philosophical claim. This is likely a **larger** contributor to the mechanical feel of sequential playback than intonation is, and unlike P1-9 it needs no model involvement at all.

**Fix:** derive the gap from the punctuation ending the *previous* line and the relationship between the two turns.
- Question mark (`;` in Greek — note that Greek uses `;` for the interrogative, not `?`) → shorter gap, ~250 ms. A reply follows a question promptly.
- Full stop / raised dot (`.` `·`) ending a long line → longer gap, ~600 ms.
- Same speaker continuing across two lines → shortest gap, ~150 ms. It is one continuous utterance, not a turn exchange.
- Clamp the whole range and scale it inversely with `playbackSpeed`, or fast playback will feel gappy.

**Why this comes first:** it is deterministic, unit-testable, free of API cost, has no cache implications, and cannot degrade pronunciation. Ship it and listen before committing to P1-9 — it may resolve enough of the problem on its own.

**Verify:** a pure function `gapAfter(prevLine, nextLine, speed) → ms` with table-driven tests. Subjective A/B by ear for the final tuning.

### P1-9 · ✅ DONE (behind a flag, default off) — contextual delivery per line
**Where:** [`server.ts:190-273`](../server.ts#L190), [`src/App.tsx:139-180`](../src/App.tsx#L139) · **Decision:** D7

Each line is synthesized in an isolated request, so the model generating Alexander's *"Χαῖρε, ὦ Σώκρατες! Εἰς τὴν ἀγοράν βαδίζω."* has never seen the question it answers. It reads a reply as a standalone sentence.

**The data for this already exists and is unused:**
- `speakerName` is destructured at [`server.ts:192`](../server.ts#L192) and **never referenced**. The client sends it on every call ([`App.tsx:155`](../src/App.tsx#L155)) and the server discards it.
- Every one of the 17 lines in `dialogueData.ts` has a `contextNote` — *"Socrates greets his acquaintance in typical Athenian fashion, inquiring about his destination"* — and it is rendered **nowhere in the application**. Fully authored, entirely dead.
- Every line has `speakerRole` ("Athenian Philosopher"), used only as a display label ([`DialogueCard.tsx:58`](../src/components/DialogueCard.tsx#L58)).

So this is mostly wiring, not authoring.

**Critical constraint — do not send the previous line's Greek text.** `/api/tts` builds a natural-language instruction and the model speaks whatever follows it ([`server.ts:203`](../server.ts#L203)). There is no enforced boundary between "instruction" and "content to be spoken." Including foreign text as context risks the model voicing it too, producing doubled audio. Send **English stage direction only**:

> Speak with authentic Reconstructed Attic/Erasmian pronunciation. You are Socrates, an Athenian philosopher, replying to a companion who has just stated where he is going. Deliver warmly and promptly. Speak only the following: `[phonetic text]`

Built from `speakerName` + `speakerRole` + the previous line's `contextNote` + the current line's `contextNote`. No Greek other than the target line.

**Cache invalidation — do not skip this.** Line N's audio now depends on line N−1, so the key `(moduleId, lineId, voice)` ([`audioStorage.ts:14`](../src/utils/audioStorage.ts#L14)) becomes wrong: edit line 3 and line 4 silently serves stale audio. Add a context hash to the key. This is the same class of problem the abandoned windowing design had, but far smaller — the dependency is one line deep and fixed, not content-dependent.

**Risk specific to this app:** the prompt already carries the phonetic transliteration that is the sole reason pronunciation is not Modern Greek. Piling delivery instructions on top dilutes it, and an emotional instruction could pull vowel quality away from Erasmian. **Test that pronunciation does not degrade, not merely that delivery improves** — this is the one item in this plan that can damage the app's core premise.

**Build it behind a flag.** There is no automated test for "sounds more natural"; evaluation is subjective A/B listening. Make it switchable so the two renderings can be compared directly, and be genuinely prepared to revert — the improvement may be inaudible.

**Verify:** synthesize the same line with and without context and confirm (a) no doubled or extra speech, (b) the phonetic transcription is unchanged in the response payload, (c) aspirated stops and diphthongs still sound correct by ear.

---

## P2 — Deployment, hygiene, and documentation

### P2-1 · `package-lock.json` is untracked
It exists in the working tree but is not committed and is not ignored (`git status` shows it as `??`). Vercel and any CI cannot reproduce the dependency tree without it, and `npm ci` fails outright.

**Fix:** commit it.

### P2-2 · ⚠️ PARTIALLY DONE — vite import fixed; the rewrite still needs a preview deployment
**Where:** [`vercel.json`](../vercel.json), [`api/index.ts`](../api/index.ts)

`"/api/(.*)"` rewrites to `"/api"`, which resolves to `api/index.ts` exporting the Express app. Express routes are registered at full paths (`/api/tts`, `/api/providers`). This works only if the function receives the *original* request path in `req.url` rather than the rewrite destination. Confirm on a preview deployment before relying on it.

**Fix if it does not hold:** mount the router at `/` inside the function, or replace the rewrite with filesystem routing (`api/tts.ts`, `api/providers.ts`, …).

**Also:** `server.ts` imports `createViteServer` from `vite` at module scope ([`server.ts:3`](../server.ts#L3)). Even though `startServer()` is guarded by `!process.env.VERCEL`, the import is still evaluated in the serverless bundle, pulling Vite into the function and slowing cold starts. Move it to a dynamic `await import("vite")` inside the dev branch.

**Verify:** `GET /api/health` on a preview deployment.

### P2-3 · ✅ DONE — health and provider endpoints now report resolved model ids
**Where:** [`server.ts:756-790`](../server.ts#L756)

`/api/providers` reports which keys are present, not whether they work. A revoked key shows as green in the header. `/api/health` does not report the LLM model id.

**Fix:** report all resolved model ids from `/api/health`. Optionally add an opt-in `?probe=1` that makes one cheap live call per provider so the badge reflects reality.

### P2-4 · ✅ DONE — README rewritten against the code
**Where:** [`README.md`](../README.md)

- Lists `src/data/modules.ts` and `src/utils/phonetics.ts`; the real files are `src/data/dialogueData.ts` and `src/utils/phoneticConverter.ts`.
- Omits `src/utils/audioStorage.ts` and `src/utils/modulePackage.ts` entirely.
- Claims "raw audio WAV/MP3 export" — no such export exists; audio leaves the app only as base64 inside a JSON module package.
- Claims a "Universal Custom TTS Laboratory" that inspects transliteration; confirm the sandbox actually surfaces the returned `phoneticText` (the API returns it; check the component renders it).
- The pronunciation table gives ζ as `[zd]` and ει as `[eː]`; confirm those match what `phoneticConverter.ts` actually emits, since the table reads as a spec.

**Fix:** correct the tree, delete the unimplemented claims, and reconcile the table against the converter.

### P2-5 · ✅ DONE — package renamed, duplicate dependency removed
**Where:** [`package.json`](../package.json)

`"name": "react-example"`, and `vite` is listed in both `dependencies` and `devDependencies`.

**Fix:** rename the package; keep `vite` in one list (it must stay a dependency only if the serverless bundle genuinely imports it — see P2-2, after which it belongs in `devDependencies`).

### P2-6 · ✅ DONE — test suite added
`convertToReconstructedPhonetics()` is deterministic, self-contained, and the heart of the product. It has no tests, so any regression in breathing marks, diphthongs, or iota subscript handling is invisible until someone listens.

**Fix:** add a small table-driven test file — rough breathing, all six diphthongs, the aspirated stops, ζ, final-position iota subscript, capitalization, and punctuation passthrough. Wire `npm test` alongside the existing `npm run lint`.

### P2-7 · ✅ DONE — `APP_URL` placeholder replaced
**Where:** `.env`, [`.env.example:16`](../.env.example#L16)

`APP_URL="MY_APP_URL"` is sent verbatim as the `HTTP-Referer` header on every OpenRouter call ([`server.ts:56`](../server.ts#L56), [`server.ts:115`](../server.ts#L115)). OpenRouter uses that header for app attribution and rankings; a placeholder value is at best useless and at worst rejected.

**Fix:** set it to `http://localhost:3000` locally and to the real deployment origin in Vercel. The code already falls back to `http://localhost:3000` when the var is unset, so *deleting* the line is strictly better than leaving the placeholder.

### P2-8 · ✅ DONE — invalid voice names now return a 400 that names the valid options
**Where:** [`server.ts:37-77`](../server.ts#L37) · **Verified 2026-08-26**

Posting `voice: "NotARealVoice"` returns `HTTP 500 {"error":{"message":"Internal Server Error"}}` — no validation, no indication that the voice is the problem. Since `VoiceName` is a closed union of six values in [`types.ts:98`](../src/types.ts#L98) but `/api/tts` accepts `voice` as an unchecked string from the request body ([`server.ts:192`](../server.ts#L192)), a typo anywhere in the client — or in an AI-generated module's `recommendedVoice` / `defaultVoice` field — surfaces as an unexplained server error.

This is a live risk, not hypothetical: `/api/ai-import-module` asks the LLM to assign voices, and nothing validates what comes back before it is persisted to localStorage and used for synthesis.

**Fix:** validate `voice` against the six-value union at the top of `/api/tts` and return a 400 naming the valid options. Validate `recommendedVoice` and `defaultVoice` in the module-import response handler ([`server.ts:700-714`](../server.ts#L700)), falling back to a default rather than persisting an invalid value.

---

## Phase 1 completion log — 2026-08-26

All three Phase 1 items applied and verified end to end against a running dev server.

| Change | File |
|---|---|
| `response_format: "mp3"` → `"pcm"` | [`server.ts:64`](../server.ts#L64) |
| `google/gemini-2.0-flash-001` → `google/gemini-3.7-flash` | [`server.ts:88`](../server.ts#L88), [`server.ts:764`](../server.ts#L764), [`server.ts:775`](../server.ts#L775), [`.env.example:5-6`](../.env.example#L5), [`README.md:98`](../README.md#L98), [`README.md:155`](../README.md#L155) |
| `APP_URL="MY_APP_URL"` → `"http://localhost:3000"` | `.env`, [`.env.example:16`](../.env.example#L16) |

**Verification — live requests through the actual server, not direct API calls:**

- `tsc --noEmit` clean.
- `GET /api/health` → 200, `openrouterConfigured: true`.
- `POST /api/tts` with `Χαῖρε, ὦ φίλε! Ποῖ βαδίζεις;` → **200**, `audio/pcm;rate=24000;channels=1`, 107 520 samples = **4.48 s of valid speech** (peak 24 369, RMS 2 672). Decoded and inspected, not merely status-checked.
- `POST /api/gemini/explain` → 200, 2 234 characters of correct philological analysis via `google/gemini-3.7-flash`.
- `GET /api/providers` → reports the live model ids correctly.

**Speech and AI features are both restored.** The app produces audio for the first time in this investigation.

**Still outstanding before deploying:** `.env` is untracked and does not deploy — Vercel needs `OPENROUTER_MODEL` set in project environment variables, or production runs on the (now correct) hardcoded default. Also `dist/` is stale; rebuild before `npm start`.

**Incidental finding — the README phonetic table does not match the converter.** `/api/phonetic-transcribe` on `Χαῖρε, ὦ φίλε! Ποῖ βαδίζεις; Εἰς τὴν ἀγοράν.` returns:

```
Khaire, oh phile! Poi badizdeis; Eis tehn agoran.
```

ζ → `zd` matches the table ✓. But αι → `ai` (table says `eye`), ει → `ei` (table says `ey`), and οι → `oi` (table says `oy`). Three of the ten rows in [`README.md`](../README.md) describe behaviour the code does not implement. Evidence for **P2-4**; decide whether the table or the converter is authoritative before writing P2-6's tests against either.

---

## Phase 2 completion log — 2026-08-26

Four of five items applied and verified live. **P0-4 is blocked on a human — see below.**

| Item | Change |
|---|---|
| **P0-3** | All model ids hoisted into a single `MODELS` object at [`server.ts:20-30`](../server.ts#L20), replacing ~20 inlined literals. Each is env-overridable; two new vars (`GEMINI_MODEL`, `GEMINI_TTS_MODEL`) expose the previously hardcoded Gemini-native ids. TTS failures now return **502 naming the model and fallback state** instead of a bare 500, and the 503 "no key" paths name both env vars. |
| **P2-8** | `resolveVoice()` validates against `VOICE_NAMES`, now a runtime `as const` array in [`types.ts:76`](../src/types.ts#L76) from which `VoiceName` is derived — one source of truth for client and server. `/api/tts` and `/api/tts-dialogue` reject unknown voices with 400. AI-generated modules have `recommendedVoice` and `defaultVoice` sanitized on import, with substitutions logged and returned as `warnings`. |
| **P2-3** | `/api/health` returns the full resolved `models` object and `fallbackConfigured`; `status` is `"unconfigured"` when no provider is set. `/api/providers` adds `fallbackConfigured` and `degraded`. |
| **P2-1** | `package-lock.json` verified consistent (lockfileVersion 3, 311 packages, name matches `package.json`). Ready to commit. |

**Verification — live requests:**

```
GET  /api/health     → models: {openrouterLlm, openrouterTts, geminiLlm, geminiTts}, fallbackConfigured: false
GET  /api/providers  → degraded: true          (correctly flags primary-with-no-fallback)
POST /api/tts  voice="NotARealVoice" → 400 "Unknown voice. Valid voices are: Fenrir, Puck, Kore, Charon, Zephyr, Aoede."
POST /api/tts  voice="fenrir"        → 200     (case-insensitive)
POST /api/tts  voice="Zephyr"        → 200
```

`tsc --noEmit` clean.

### Still open from Phase 2

**P0-4 cannot be completed without the operator.** Obtaining and installing a `GEMINI_API_KEY` requires signing into a Google account and handling a live credential — not something to be automated on someone's behalf. Everything *around* it is now in place: the fallback code paths exist, the model ids are configurable, `/api/health` and `/api/providers` report the missing fallback, and `.env.example` documents why it matters. **Add the key to `.env` and to the Vercel project environment, then re-run the Phase 2 verification** — `geminiConfigured` and `fallbackConfigured` should flip to `true` and `degraded` to `false`.

**Two Gemini-native model ids remain unverified** — `gemini-3.7-flash` and `gemini-3.1-flash-tts-preview` ([`server.ts:28-29`](../server.ts#L28)). They cannot be tested without that key. Confirm them immediately after adding it; if either is wrong, the fallback will fail at the exact moment it is needed, which is the worst possible time to discover it.

---

## Phase 3 completion log — 2026-08-26

All three items applied and verified, including in the running UI.

| Item | Change |
|---|---|
| **P1-1** | `/api/tts-dialogue` removed — 116 lines. A comment at [`server.ts:328`](../server.ts#L328) records why it was deleted rather than rebuilt, so the rejected design does not get re-proposed. The multi-speaker claim is gone from the README. |
| **P1-3** | `stopSequenceRef` boolean + 20 ms sleep replaced by a generation counter (`playbackGenerationRef`) in [`App.tsx`](../src/App.tsx). Each sequence claims a generation and bails at every await boundary once superseded. Also fixes two latent bugs the boolean had: a superseded sequence could overwrite the new one's `playbackError`, and could clear shared playback state out from under it. |
| **P1-2** | Pre-cache now uses an `AbortController`, aborts on cancel / module change / unmount, and counts `cached` / `failed` / `skipped` / `cancelled` instead of swallowing errors to `console.warn`. A Cancel button appears during a run, and the outcome is reported in the UI. |

**Verification:**

- `tsc --noEmit` clean; `/api/tts-dialogue` returns 404, `/api/tts`, `/api/health`, `/api/providers` still 200.
- **The race in P1-3 was reproduced before and after.** A standalone simulation of both schemes with a 200 ms synthesis and a second play action at t=20 ms:

  ```
  old (boolean + 20ms sleep): ["A","B"]   <- BOTH PLAYED: overlapping audio
  new (generation counter)  : ["B"]       <- only the newest sequence plays
  ```

  This is the concrete failure the fixed sleep allowed: any synthesis slower than 20 ms — which is all of them — left the old sequence alive.

- **Pre-cache cancellation driven in the browser.** Started a run on the 8-line default module, cancelled mid-flight: the Cancel button appeared during the run, the summary read **"Cancelled — 5 cached"**, and the cache counter moved 0/8 → **5/8** with completed lines preserved and the in-flight request abandoned.

### P2-9 · ✅ DONE — initial ῥ no longer uppercases the following consonant
**Where:** [`phoneticConverter.ts`](../src/utils/phoneticConverter.ts) · **Found 2026-08-26**

`Ῥώμη` transcribes to `HRohmeh`. The rough-breathing `h` prefix is applied with the word's original capitalization, so the `R` is uppercased too. Expected `Hrohmeh`.

Cosmetic in the UI, but this string is fed to a TTS model, and `HR` may be read as an initialism. Low frequency — word-initial ῥ is uncommon — but cheap to fix.

Locked in by a characterization test in [`tests/phoneticConverter.test.ts`](../tests/phoneticConverter.test.ts) so a fix trips the test rather than passing unnoticed.

### P2-10 · ✅ DONE — the diphthong list used by the breathing check is complete
**Where:** [`phoneticConverter.ts`](../src/utils/phoneticConverter.ts) · **Found 2026-08-26**

`ηὗρον` → `ehuron` and `ηὕρηκα` → `ehurehka`, both missing the initial aspirate. The word-initial rough-breathing check recognizes breathing on the second element of αι and οι (`αἱ` → `hai`, `οἱ` → `hoi`) but not ηυ, so the diphthong list used by that check is incomplete.

Rare in Attic prose, but wrong, and the same gap may affect other diphthongs not covered by the check. Audit the full list rather than special-casing ηυ.

Also locked in by a characterization test.

---

## Phase 4 completion log — 2026-08-26

All three items applied. **P1-9 ships disabled; the listening comparison is now yours to make.**

### P2-6 — test suite

53 tests, `npm test` (`node --import tsx --test`, no new dependency).

- [`tests/phoneticConverter.test.ts`](../tests/phoneticConverter.test.ts) — 37 tests covering aspirated stops, ζ→zd, long vowels, all seven diphthongs, breathing marks, γγ, iota subscript, capitalization, ASCII passthrough, punctuation, and full sentences.
- [`tests/dialogueTiming.test.ts`](../tests/dialogueTiming.test.ts) — 16 tests for P1-8.

**These are characterization tests, and the file says so.** The README table and the implementation disagree, so the suite locks in *actual* behaviour to detect unintended change rather than ratifying a contested scheme. Their purpose is to make a pronunciation regression from P1-9 impossible to miss.

**The README mismatch is worse than first reported.** With the full transcription scheme now probed, **eight of the table's ten rows** disagree with the code — not three:

| letter | README | code |
|---|---|---|
| θ | `t_h` | `th` |
| φ | `p_h` | `ph` |
| χ | `k_h` | `kh` |
| ζ | `zd` | `zd` ✓ |
| αι | `eye` | `ai` |
| ει | `ey` | `ei` |
| οι | `oy` | `oi` |
| αυ | `ow` | `au` |
| ευ | `eh-oo` | `eu` |
| rough | `h-` | `h` ✓ |

The code implements scholarly transliteration; the README describes English respelling. This is not merely a doc defect: the output is read by a TTS model, and `ai`/`ei`/`oi` invite English vowel values that differ from what the table prescribes. Deciding which is correct needs ears. Tracked as **P2-4**.

**Two genuine converter bugs surfaced while probing** — see **P2-9** and **P2-10**.

### P1-8 — inter-line pacing

New pure module [`dialogueTiming.ts`](../src/utils/dialogueTiming.ts): `gapAfter(previous, next, speed)`.

- Same speaker continuing → 150 ms (one utterance, not a turn exchange)
- After a question → 250 ms (replies come back promptly)
- After a long statement (> 60 chars) → 600 ms
- Otherwise → 400 ms
- Scaled by `1/speed`, clamped to 120–900 ms

Recognizes **both** `;` (U+003B) and `;` (U+037E) as question marks — the built-in modules use ASCII, but text imported from Perseus/TLG will use the Greek codepoint, and a rule keyed only on `?` would never have fired on any of this app's data.

Measured on the default module: 4 of 7 gaps are post-question (it is a Socratic dialogue, so it is question-dense), cutting total inter-line silence from 2800 ms to 2200 ms.

Loop pauses now scale with speed too, and a loop restart is asserted never shorter than any inter-line gap.

### P1-9 — contextual delivery, default OFF

- **Server**: `buildSpokenPrompt()` composes an English stage direction from `speakerName`, `speakerRole`, the line's `contextNote`, and the *previous* line's speaker and `contextNote`. `speakerName` had been accepted and discarded since the app was written; `contextNote` existed on all 17 lines and was rendered nowhere.
- **No Greek other than the target line ever enters the prompt**, and it closes with "Speak only the following, and nothing else".
- **Cache keys carry a variant**: `makeKey` takes a `variant` that folds in a hash of the full context fingerprint. The empty default keeps pre-existing keys byte-identical, so no already-cached audio is orphaned, and the two modes never serve each other's renderings.
- **UI**: a `Context: ON/OFF` toggle beside the loop control, disabled during playback and pre-caching.

**Verified — the leak risk did not materialize.** The danger was the model voicing the English stage direction, since nothing enforces a boundary between instruction and content. Tested a one-word line (`Χαῖρε`) against a ~60-word stage direction, three runs:

```
plain (no context)              : 1.36s
contextual run 1                : 2.00s   1.47x
contextual run 2                : 1.72s   1.26x
contextual run 3                : 1.96s   1.44x
```

Reading the direction aloud would have produced 15 s or more. It does not.

**Verified — pronunciation is unchanged.** `phoneticText` in the response is byte-identical between modes, confirming the transliteration is untouched; only the surrounding instruction differs.

### The listening checkpoint

This plan committed to shipping P1-8 and listening before P1-9. P1-9 is built but **disabled by default**, which preserves that: nothing changes until the toggle is flipped, and audio is cached per mode so the same line can be compared directly.

**What to do:** play a dialogue with `Context: OFF`, then again with `Context: ON`, and decide whether the difference is audible. It may not be. Reverting P1-9 is a planned-for outcome, not a failure — the flag makes removal a one-line change.

---

## Phase 5 completion log — 2026-08-26

Both items applied. **One piece could not be verified here — see the service worker note.**

### P1-6 — offline storage

| Piece | Where |
|---|---|
| `navigator.storage.persist()` requested before the first bulk download | [`audioStorage.ts`](../src/utils/audioStorage.ts), called from `handlePrecacheAudio` |
| `getStorageStats()` — clips, bytes, per-module rollup, browser quota, persisted flag | [`audioStorage.ts`](../src/utils/audioStorage.ts) |
| Storage UI — usage, durability warning, budget bar, per-module remove, keep-offline toggle | [`OfflineStoragePanel.tsx`](../src/components/OfflineStoragePanel.tsx) |
| LRU eviction against a 250 MB budget, never touching kept-offline modules | `evictLeastRecentlyUsed()`, run after each pre-cache |
| Orphan pruning — clips belonging to deleted modules | `pruneOrphans()`, run on mount |
| App-shell service worker | [`public/sw.js`](../public/sw.js), registered in production only |

Records now carry `lastAccessedAt`, updated on every cache hit as a fire-and-forget write — bookkeeping must never fail a cache read. Records written before this field existed fall back to `createdAt`.

The service worker is runtime-populated rather than build-manifest driven: Vite content-hashes asset filenames, so a hand-maintained precache list would rot on the next build. It never caches `/api/` — audio and explanations have their own IndexedDB caches with their own invalidation rules, and a second, dumber copy in the worker would serve stale results those rules cannot reach.

**⚠️ The service worker is unverified.** Registration fails in the preview browser used for testing:

```
TypeError: Failed to register a ServiceWorker for scope ('http://localhost:3000/')
  with script ('http://localhost:3000/sw.js'): An unknown error occurred when fetching the script.
```

This is environmental, not a defect in the worker: a one-line minimal `sw.js` fails with the identical error, and the file is served correctly (HTTP 200, `application/javascript`, 2430 bytes, correct body). The registration code itself is confirmed to run — its own `catch` produced the warning, proving the `import.meta.env.PROD` guard evaluates true in a production build.

**This must be verified in a real browser before offline study can be claimed to work.** Build, serve `dist/`, load the page, confirm a worker is active in DevTools → Application → Service Workers, then go offline and hard-reload. Everything else in D3 rests on the shell loading without a network.

### P1-7 — offline behaviour

- **Ask AI responses cached** in a dedicated IndexedDB store keyed by module id plus normalized question ([`explanationCache.ts`](../src/utils/explanationCache.ts)). `invalidateModule()` exists for re-import, since answers are written against a specific text.
- **New questions blocked offline** with an explanation, rather than a raw fetch failure.
- **Cached answers marked** "· saved answer" so a stored response is never mistaken for a fresh one.
- **Online/offline indicator** in the header, outranking provider status — with no connection the provider is moot.
- **Degraded-provider warning**: the header dot turns amber and reads "no fallback" when `/api/providers` reports `degraded`.
- **`handlePlayWordTTS` wrapped** — it previously had no error handling at all, so an offline click rejected unhandled and the modal spinner stopped with no explanation.

**Verified in the running app:**

```
offline event dispatched      -> header switches to "Offline • cached study only"
ask question (online)         -> answered, 1x POST /api/gemini/explain, no cache marker
re-ask offline, different
  case and whitespace         -> answered from cache, "· saved answer" shown,
                                 STILL 1x POST total — no second network call
ask a NEW question offline    -> explanatory notice, no raw fetch error
```

The case/whitespace variation confirms question normalization works — otherwise the cache would miss on trivially different phrasings and re-bill the user.

The storage panel reads: `5 clips · 1.1 MB of 2.5 GB available`, `Storage is not persistent — the browser may clear downloads when space runs low` with a Request button, and a per-module row with Keep offline / Remove.

---

## Phase 6 completion log — 2026-08-26

Cleanup. Six items closed, one partially — the Vercel rewrite still needs a deployment.

### P2-9 / P2-10 — two transcription bugs, one shared root

Both came from the word-initial rough-breathing logic, and fixing them changed the pronunciation of a common word:

```
Ῥώμη    HRohmeh   -> Hrohmeh
ηὗρον   ehuron    -> hehuron
ηὕρηκα  ehurehka  -> hehurehka
υἱός    uios      -> huios      <- common word, silently unaspirated
```

**P2-10** was not really about ηυ. The breathing check listed only six diphthongs (`αι ει οι ου αυ ευ`); Attic has eight. Adding `υι` and `ηυ` fixed `ηὗρον` *and* `υἱός`, which had been transcribed without its aspirate all along. Auditing the whole list, as this plan specified, was what surfaced the second case.

**P2-9** was a capitalization interaction: the prepended aspirate carries the word's capital, so a capitalized initial rho produced `HR`. Vowels already transcribe lowercase, which is why only rho showed it — and `HR` is read as an initialism by a TTS engine, not as an aspirated rho.

**The test suite did its job.** The pre-existing `υι` case asserted `uios`, so the fix tripped it — exactly what a regression net is for. Assertions were updated in the same commit, and the "known defects" block now describes correct behaviour.

### P1-5 — bounded decoded-buffer cache

`audioCache` is now a 24-entry LRU. Decoded 24 kHz mono PCM costs roughly 96 KB per audio-second, so the unbounded map held tens of megabytes of decoded audio for the page's lifetime, duplicating what IndexedDB already stores durably. A `Map` preserves insertion order, so re-inserting on a hit and evicting the first key is sufficient.

### P1-4 — documented rather than fixed

As this plan anticipated, there is no cheap correct fix: real synchronization needs word-level timestamps the speech endpoint does not return. `calculateWordTimings` now carries a docblock saying plainly that nothing in it derives from the audio and that error accumulates left to right, and the README has a matching caveat. The claim of "word-by-word synchronized highlighting" is gone.

### P2-5 — package metadata

`"name": "react-example"` → `"greek-dialogos"`, and `vite` removed from `dependencies` (it remains in `devDependencies`, where a build tool belongs).

### P2-2 — half done

**Fixed:** `createViteServer` was a top-level import, so Vite was evaluated in the serverless bundle even though `startServer` never runs there. It is now `await import("vite")` inside the development branch. Confirmed in `dist/server.cjs`: the only remaining reference is the dynamic import inside that branch.

**Still unverified:** whether `vercel.json`'s `/api/(.*)` → `/api` rewrite preserves the original request path. Express registers routes at full paths, so it works only if the function receives `/api/tts` rather than `/api`. **This cannot be settled locally — it needs a preview deployment.** Check that `GET /api/health` returns JSON rather than the SPA shell. If it does not, mount the router at `/` inside the function or switch to filesystem routing (`api/[...path].ts`). Documented in the README deployment section as well.

### P2-4 — README rewritten against the code

- **File tree corrected.** It listed `src/data/modules.ts` and `src/utils/phonetics.ts`, neither of which exists, and omitted nine real modules. Now matches the repository.
- **Unimplemented claims removed**: "raw audio WAV/MP3 export" (audio leaves only as base64 inside a JSON package) and multi-speaker dialogue synthesis (deleted in P1-1).
- **Phonetics table replaced.** The old table's `t_h` / `eye` / `ey` / `oy` / `ow` / `eh-oo` describe a scheme the code has never implemented. The new table documents actual output with a worked example per row, every one covered by a test.
- **The open question is stated, not buried.** A dedicated section explains that the code does scholarly transliteration while the old table described English respelling, and that because the output is *read aloud*, which is correct is an empirical question needing ears.
- **New sections** for offline study and the pacing/contextual-delivery work.
- **Cost note** on the reasoning model, and the reminder that `.env` does not deploy.

---

## Incident — 2026-08-26: `/api/*` returning HTML locally

**Reported:** module generation failed with `Failed to fetch provider status: SyntaxError: Unexpected token '<', "<!doctype "... is not valid JSON`, a 404, and `Module import error: Failed to generate module from text`.

**Cause: the app was served without its backend.** `npm run preview` was `vite preview`, which serves `dist/` statically with an SPA fallback and no Express. Reproduced exactly:

```
vite preview:      GET  /api/providers        -> 200 text/html  "<!doctype html>"
                   POST /api/ai-import-module -> 404
node dist/server.cjs:  GET /api/providers     -> 200 application/json
```

**Worth noting: these symptoms are indistinguishable from a broken Vercel `/api/*` rewrite** — the failure mode P2-2 warns about. It was local this time. **P2-2 is still unverified**, and a deployment showing this exact console output should be diagnosed as the rewrite, not as this bug.

**Fixed:**
1. `preview` now runs `npm run build && npm run start`, so previewing a production build exercises the production path.
2. **A second bug found while confirming it:** `npm start` runs `dist/server.cjs` without setting `NODE_ENV`, so the production server took the *development* branch and served from source through Vite, never exercising the built assets. The API happened to work, which is why it looked correct. `NODE_ENV` was the wrong signal — esbuild now substitutes `IS_BUNDLED` at build time, so the bundle knows what it is regardless of host environment, while `tsx` still gets the dev path.

**Verified on the rebuilt bundle:** built assets and `sw.js` served from `dist`, `/src/main.tsx` falling through to the SPA shell (proving Vite is not running), `/api/providers` returning JSON, and module generation producing a 5-line dialogue via `google/gemini-3.7-flash`.

**Lesson for P2-2:** a static-only serve and a misrouted serverless function produce identical console errors. Diagnose by checking whether the server process is answering `/api/health` with JSON, not by the browser error alone.

---

## Superseded — P1-9's approach to juncture

The contextual-delivery work (P1-9) shipped and is flagged off. Separately, the user reported that playback pronounces every word in isolation, which contextual delivery does not address: it changes *how* a line is delivered, not how its words are joined.

That defect has its own specification: **[PHRASING-SPEC.md](PHRASING-SPEC.md)**. It splits the problem by tool — an LLM decides phonological grouping at import time (validated as an exact partition of the input, with fallback to today's behaviour), while deterministic code keeps the character mapping. Handing the whole transliteration to an LLM was considered and rejected on this project's own standard: an intermittent `ῃ` error reintroduces exactly the merger that Modern pronunciation was declined for, and a learner cannot adapt to an error that appears in one line and not the next.

One finding from that work belongs here as a defect in its own right: **`ου` is transcribed `ou`, which an English-oriented model reads as /aʊ/ (*out*) where it should be [uː]**, and `αυ → au` invites /ɔː/ (*caught*) where it should be [au]. The two are effectively swapped. This reframes **P2-4** — the old README table was describing English respelling, which for this pipeline may be more accurate than scholarly transliteration, not less. Tracked in the spec as the mapping-version question.

---

## Connected speech — implemented 2026-08-26

The juncture defect is fixed and **on by default**. `PHRASING-SPEC.md` described an LLM-assisted design; most of it turned out to be unnecessary, for a reason worth recording.

### The accent is the disambiguator

The spec routed clitic detection to an LLM because `τίς`/`τις`, `ποῖ`/`ποι` and `ἔστι`/`ἐστι` are homographs that seemed to need syntax. They do not. **Clitics are by definition unaccented — that is *why* they lean on a neighbour.** The interrogatives carry an accent; the indefinites do not. So the test is not "is this word in a list" but "is it in the list **and unaccented**".

An externally proposed implementation stripped diacritics before the lookup, discarding exactly that signal, and consequently bound interrogative `Ποῖ` backwards across an exclamation mark. This is not a heuristic standing in for syntax; it is the rule Greek orthography exists to express. **No LLM call is required for the common cases.**

### What shipped

- [`src/utils/phrasing.ts`](../src/utils/phrasing.ts) — groups words into phonological units. Accent-aware clitic tests, phrase-final punctuation as a hard barrier, a 4-word group cap.
- `convertToSpokenForm()` in [`phoneticConverter.ts`](../src/utils/phoneticConverter.ts) — transcribes each word **independently**, then joins at the seam.
- The grave is no longer marked as stress (`hasStressAccentInRange`), so `τὸ` → `to`, not `tó`.
- A `Flow: ON/OFF` control, cached as a separate audio variant.

### Transcribe first, join second

The ordering is the design. An earlier implementation fused the Greek and then transcribed the fused token, which severs a word from its own diacritics: scanning `αὐτοῦ-οὗ` finds the rough breathing belonging to `οὗ` and prepends the aspirate to the front of the phrase, giving `howtoo-oo` for a word with smooth breathing. Three such failures are pinned as regression tests.

### Fusion must never invent a phoneme

Running the whole corpus before enabling the default caught a defect the fixtures had not: our long vowels are digraphs, so `ἐγώ` (`egoh`) fused to `εἰμι` (`eimi`) yields `egoheimi` — an aspirate before a vowel, on a smooth-breathing word. **Fusion is now skipped wherever it would create a sound present in neither word.** Losing one juncture costs a little smoothness; a spurious aspirate is the exact error class this project rejected Modern pronunciation to avoid.

Mid-token capitals are also lowered — `HoBoréas` risks being read as an initialism.

### Effect on the corpus

All 17 lines change; 16 multi-word groups form. `Εἰς τὴν` → `Eistehn`, `ἐν τῇ` → `entéh`, `ὁδοιπόρος τις` → `hodoipórostis`, `σμικρῷ τινι` → `smikróhtini`.

### Still open

`Οὐκ ἐν τῷ` groups but `πολλῷ` stands alone: `τῷ` is accented, and only the *nominative* article is classically proclitic. Correct by the textbook, and it means real choppiness survives. Whether grouping should extend further is with the external reviewer.

### `ου → oo` adopted; the rest of the family held

The diphthong question is not uniform, and treating it as one decision was wrong.

**`ου` is adopted.** It is [uː]. `ou` is among the most ambiguous vowel spellings in English — /aʊ/ (*out*), /uː/ (*soup*), /ʌ/ (*touch*), /oʊ/ (*soul*) — and its most frequent reading, /aʊ/, is precisely **αυ's** value, so the two were effectively swapped. `oo` is near-unambiguous for /uː/ and collides with nothing (ο is `o`, ω is `oh`, υ is `u`). This change strictly *reduces* ambiguity, so it cannot make matters worse however the engine reads it — an argument that does not require hearing the result. A test now asserts ου and αυ stay distinct.

**The rest are held**, because each trades one ambiguity for another rather than removing it:

| | current | proposed | why it is a gamble |
|---|---|---|---|
| αι [ai] | `ai` (English /eɪ/) | `eye` | `eye` is an English *word*; mid-token (`Kheyre`) it may be read as one |
| ει [eː] | `ei` (/aɪ/ or /eɪ/) | `ey` | swaps one ambiguous spelling for another |
| αυ [au] | `au` (English /ɔː/) | `ow` | `ow` is itself split — /aʊ/ (*cow*) vs /oʊ/ (*know*) |
| ευ [eu] | `eu` | `ew` | `ew` reads as /juː/ (*few*) — inserts a glide that is not there |

These need the listening test. `ου` did not.


---

## IPA notation — built, evaluated, not adopted (2026-08-27)

Three successive external implementations proposed Latin respelling schemes; all three were unusable (fabricated outputs, broken rough breathing, and mergers of θ/τ, φ/π, χ/κ). But one idea buried in them was worth more than the code: **if the engine accepts IPA, the respelling layer is unnecessary altogether.**

Latin respelling describes Greek sounds through English spelling conventions, so every mapping is a wager on how the engine will read it — and some contrasts cannot be written at all, because English aspiration is allophonic and `t`/`th` are the only levers available.

[`src/utils/ipaConverter.ts`](../src/utils/ipaConverter.ts) emits reconstructed-Attic IPA instead, reusing the phrasing engine unchanged: which words fuse is a fact about Greek, not about notation. Reached with `notation: "ipa"` on `/api/tts`. 22 tests.

### What it solved, in principle

| | Latin | IPA |
|---|---|---|
| θ/τ, φ/π, χ/κ | inexpressible in English spelling | `tʰ` vs `t` |
| iota subscript | dropped — `λόγῳ` = `λόγω` | `ˈloɡɔːi̯` vs `ˈloɡɔː` |
| υ | `u`, or an invented `yu` glide | `y`, front rounded |
| ου | argued from English orthography | `uː`, because that is the sound |

**And a free win on Gap 1.** A circumflex can only sit on a long nucleus, so for the dichrona — α ι υ, whose quantity the spelling never shows — the accent itself carries the length: `πρᾶγμα → ˈpraːɡma` against `πράγματα → ˈpraɡmata`, `μῦθος → ˈmyːtʰos` against `μύθος → ˈmytʰos`. That insight is notation-independent, but only IPA can express it.

### Why it is not the default

Compared by ear on real dialogue, **the Latin rendering was judged slightly better**. Precision in the notation buys nothing if the model does not realise the symbols accurately, and a familiar pseudo-English string evidently suits this model better than phonetic symbols.

This is a fact about the current TTS model, not about IPA. The path is kept and tested so it can be re-evaluated whenever the model changes — the work is done, and the comparison is one request away.

**Consequence: the phoneme questions stay open.** θ/τ, φ/π and χ/κ remain unresolved in the shipping path, and vowel length remains unrepresented. Gaps 1 and 2 in the engine document are still live, and the reviewer's ruling still matters.

---

## Stress density — reduced to none (2026-08-27)

Connected speech shipped marking **every** accented word. On listening, that was too much stress.

That report settled a question an acoustic probe had left open: **the marks are honoured by the engine.** Earlier I could only measure one variant before the provider began returning `502: empty audio stream`, so whether a combining acute moved the prominence was unknown. It does.

### Why marking everything is wrong

Greek orthography accents nearly every word, but speech gives a phrase one nuclear prominence. Marking them all instructs the engine to emphasise everything — which sounds hammered and, because prominence is relative, flattens the contour it was meant to create.

### Three levels

`stressDensity` on `/api/tts`:

| | behaviour | example |
|---|---|---|
| `all` | every accented word | `Kháire, óh phíle! Pói badízdeis;` |
| `phrase` | one nuclear stress per sentence, on its last accented word | `Khaire, oh phíle! Poi badízdeis;` |
| `none` | **default** — no marks; phrasing alone | `Khaire, oh phile! Poi badizdeis;` |

**A comma does not start an intonational phrase.** The first implementation split on commas, so `Χαῖρε,` took its own nucleus and a three-word greeting still carried two prominences. Sentence-final punctuation only.

**`ὦ` is never stressed.** A vocative particle leaning on the name after it, yet written with a circumflex — so it was taking full prominence in every greeting. It sits on a never-stressed list.

### Cache safety

`stressDensity` is folded into the audio cache variant (`flow-none`), so changing it invalidates clips rendered under the previous setting instead of serving them for the new one. Both cache-key sites carry it — the first patch missed the playback path, which would have served stale audio for every line already heard.

### Status

`none` is the current default, chosen provisionally. `phrase` and `all` remain on the API, and the levels are cheap to switch between — the constant lives at the top of `App.tsx` and the cache key follows it automatically.

---

## Pronunciation settings (2026-08-27)

Three pronunciation traditions are now selectable, replacing a fixed scheme and three ad-hoc toggles scattered through the playback bar.

| Setting | Sent to the engine | What it costs |
|---|---|---|
| **Modern Greek** | the Greek itself, untranscribed | Flows best — the model knows the language. But η ι υ ει οι merge to [i], so `λύει / λύῃ / λύοι` are homophones: three moods, one sound. |
| **Erasmian** *(default)* | `Khaire, oh phile! Poi badizdeis;` | Every vowel stays distinct. Not historically authentic — a teaching convention. |
| **Reconstructed Attic** | `ˈkʰai̯re, ˈɔː ˈpʰile! ˈpoi̯ baˈdizdeːs;` | Aspirates distinct from plain stops, vowel length, [y], audible iota subscript. The engine handles symbols less smoothly than letters. |

Each maps onto machinery that already existed: Modern needs no transcription at all, Erasmian is the Latin engine, and Reconstructed is the IPA converter — which is the only notation able to state its distinctions.

### Why the trade-offs are shown in the UI

These are competing scholarly traditions, not display preferences, and the ranking is counter-intuitive: **Modern Greek sounds best and teaches least.** Nobody would guess that from a dropdown of three names, so each option carries its cost and a worked sample.

### Consolidation

`connectedSpeech`, `stressDensity` and `contextualDelivery` moved into the same panel and into one persisted object ([`speechSettings.ts`](../src/utils/speechSettings.ts)). The old `Flow` and `Context` buttons are deleted rather than left unreachable. Settings are validated field by field on load, so a stale or hand-edited value cannot put the engine into an undefined state.

### Cache correctness

`settingsVariant()` fingerprints every setting that changes how a line sounds, and it is folded into the audio cache key. A test asserts all 18 combinations produce distinct fingerprints — without that, switching schemes would replay audio rendered under the previous one. Contextual delivery is deliberately excluded: it already has a per-line hash, because it depends on the neighbouring line too.

**Consequence for offline users:** each combination caches separately, so switching schemes re-synthesizes. Returning to a scheme you have used before plays instantly. The panel says so.

---

## Three schemes, each coherent (2026-08-27)

The settings offered Modern / Erasmian / Reconstructed, but the Erasmian option was not purely Erasmian and the prompts made two options claim the same ground.

### The label was hiding a real hybrid

The prompt read **"Reconstructed Attic/Erasmian"** — a hedge from when there was one scheme. With all three selectable it was contradictory: the Erasmian setting named Reconstructed too.

But the label was not merely sloppy. **ζ → `zd` is a reconstruction, not an Erasmian convention** — Erasmian teaching gives [z] or [dz], while [zd] is the scholarly Attic value. One reconstructed mapping was sitting inside an otherwise Erasmian scheme, which is exactly what the slash was papering over.

**Erasmian now emits `z`.** Readers who want [zd] select Reconstructed, where the IPA path already supplies it. Every other mapping in the scheme was already Erasmian — θ φ χ as `th ph kh` read as the fricatives Erasmian teaching uses, υ as `u`, ει as a diphthong.

```
              ζωή          Χαῖρε, ὦ φίλε! Ποῖ βαδίζεις;
Modern        (untranscribed)  Χαῖρε, ὦ φίλε! Ποῖ βαδίζεις;
Erasmian      zoheh            Khaire, oh phile! Poi badizeis;
Reconstructed zdɔːˈɛː          ˈkʰai̯re, ˈɔː ˈpʰile! ˈpoi̯ baˈdizdeːs;
```

### Prompts name only their own scheme, and all ask for the same delivery

The Modern branch had asked the model to read "naturally and fluently" while the others asked for authenticity. That is a difference in **what is requested**, not in the notation, and it made the schemes incomparable.

The fix was first to remove the adverbs entirely. That was over-correction: comparability is a *testing* concern, and each shipped scheme should get whatever prompt makes it sound best. All three now ask for **"fluently"** — the same delivery, so they remain comparable, and each benefits.

**Correcting an earlier claim.** A 2×2 had suggested the fluency wording moved Greek but did nothing for transcribed text. That cell was underpowered (n=2, high variance) and the conclusion was wrong. Measured directly:

| | plain | fluently |
|---|---|---|
| Erasmian | 4.82s | 4.48s (−7%) |
| Reconstructed | 5.74s | 4.42s (−23%) |

**Reconstructed benefits most**, which reframes its main drawback: sounding slow and deliberate was largely an artifact of carrying the most demanding instruction, not something intrinsic to reading IPA.

**"Fluently" only, not "friendly and fluently".** Fluency concerns rate and connectedness; friendliness is an emotional register that risks pulling vowels toward English and softening the aspirates — the same dilution hazard that keeps contextual delivery behind a flag. The half with the phonetic risk was dropped.

That test also settled why transcription sounds slower: under a common prompt, Latin transcription takes **~34% longer** than Greek. Unfamiliar tokens are read in citation form, and the model cannot be talked out of it — the fluency wording sped up Greek and did nothing for Latin. Slowness and the original word-by-word complaint are one phenomenon, not two.

---

## UI restructure — controls behind a drawer (2026-08-27)

Measured at 1280×900, the Study Reader stacked **1258px of controls above the first line of Greek**, so content began at y=1532 — **1.7 screens** of chrome before a word of text.

```
                      before    after
header (sticky)         147      160
module card             106        —   merged into the header
playback bar            207      136   voices and export moved out
speech settings         739        —   moved to the drawer
offline library         206        —   moved to the drawer
─────────────────────────────────────
content starts at      1532      352
screens of chrome       1.70     0.39
```

### What was wrong

The frequency profile was inverted. Play, speed and loop are used constantly; pronunciation is set once and rarely revisited; storage is checked occasionally. The three rarest controls occupied 1051 of the 1258 pixels — and the largest, the 739px speech settings panel, was written as a teaching surface with a summary, trade-off and sample per option. Right for a first encounter, wrong for something permanently pinned above the text.

The module identity was also duplicated: the header carried the English title while the card beneath repeated it in Greek.

### What changed

- **Settings drawer**, opened from a gear in the header, holding pronunciation, delivery, voices, offline storage and export. Escape closes it and focus moves into the panel on open.
- **Module title merged into the header** — Greek leading, English and difficulty beneath. `ModuleSelector` gained a `compact` mode rendering only the Library and Import controls, which now sit in the header row.
- **Playback bar slimmed** to the controls used while listening. Voice pickers and the export button were removed rather than duplicated, since both now live in the drawer.

### It also fixes a reachability bug

The settings previously rendered only on Study Reader, while affecting audio in Roleplay, Codex, TTS Studio and the word-gloss modal — so a reader practising in Roleplay had to navigate away to change pronunciation. The gear is in the header, so it is present on every tab; verified across all five.

**A note on verifying that:** the first check reported the panel present on every tab. It clicked each tab and queried the DOM in the same synchronous tick, before React re-rendered. Adding a wait flipped five of six results. A passing check is not the same as a true one.

---

## Control rail — one set of controls, beside the text (2026-08-27)

The drawer removed the stacked panels but left two problems visible in the reading view: **card and book views each carried their own playback bar**, and a full-width banner was spent on a single Cards/Book toggle.

Two bars for one job is the duplication that drifts — book view had a `0.9×` speed step that cards did not.

### Desktop: a sticky column

`ControlRail` sits beside the text on `lg` and up, 240px, using horizontal space that was empty. Its contents follow the active view:

```
cards  RECITE · SPEED · LOOP · FORMAT · SHOW              · OFFLINE
book   RECITE · SPEED · LOOP · FORMAT · PAGE LAYOUT ·
                                        TYPE SIZE · PHONETICS · OFFLINE
```

Playback stays constant; only the view-specific controls swap.

### Narrow screens: a sheet

Below `lg` the rail collapses to a floating **Controls** button raising a bottom sheet, so the reading column keeps the full width. Verified at 375×812: rail `display: none`, button visible, **no horizontal overflow**.

### Structural changes

- `BookFormatView`'s 176-line control ribbon deleted; its `layoutMode`, `fontSize` and `showTransliteration` lifted into `App` so the rail can drive them.
- The Cards/Book banner is now a two-button segment in the rail.
- The duplicate **Import / AI** button was removed from the compact module actions — the header already has an Import tab, and two buttons for one destination is how they diverge.

### Measured

```
                content starts at    screens of chrome
original              1532                 1.70
after drawer           352                 0.39
after rail             192                 0.21
```

---

## Book view rendered nothing — and why nothing caught it (2026-08-27)

**Symptom:** switching Format to Book showed the page furniture but no dialogue lines. Main text dropped from 3367 to 859 characters.

**Cause:** when lifting `layoutMode` / `fontSize` / `showTransliteration` out of `BookFormatView`, the edit anchored on `onSelectWord={handleOpenWordModal}` — which occurs in **`DialogueCard` first**. The three props landed on the card, and `BookFormatView` received no `layoutMode`. It is `undefined`, so none of the three `layoutMode === …` branches matched and every line was skipped.

### The real finding: JSX has never been type-checked in this project

That should have been two compile errors — a component receiving three undeclared props, and another missing three required ones. `tsc --noEmit` exited **0**.

**`@types/react` was never in `devDependencies`.** Without it, JSX resolves to `any`, so **no component props in this codebase have ever been checked**. A canary confirmed the shape of the blindness precisely: a plain `const x: number = "str"` in `App.tsx` errors as expected, while `<DialogueCard totallyBogusProp={123} />` passes silently. `tsc` was reading the file; it just could not see across the JSX boundary.

This is the project's only static check — `npm run lint` is `tsc --noEmit` — and every component boundary was outside it.

**Fixed:** `@types/react` and `@types/react-dom` added. The codebase is clean under real checking (**0 errors**), and the canary now correctly rejects both an unknown prop and missing required ones.

**Verified in the browser:** all three book layouts render distinct content — Bilingual 2456, Folio 2145, Codex 2058 characters — with the Greek lines present in each.

### Worth noting about the verification itself

`innerText` reported the codex header absent while `innerHTML` showed it present. Two checks in this session have now disagreed with reality in the same direction — this one, and the tab-reachability check that queried the DOM before React re-rendered. A green check deserves the same scepticism as a red one.

---

## Three more duplicates removed (2026-08-27)

The control rail consolidated the two visible playback bars, but three redundancies survived because they were nested inside view branches rather than sitting at the top level.

**A third playback bar.** The codex layout carried its own *Play Entire Codex* and *Loop* buttons, inside the `greek-manuscript` branch — so there had been **three** copies of play/loop, not two. Its block also repeated the module title and description, in a column so narrow the heading wrapped across five lines. Removed, 62 lines.

**The context card.** Cards view opened with a dark panel carrying the module title, description, line count and difficulty. The header now shows title, English title and difficulty, so it repeated three of the four. Removed.

**`AudioControls.tsx` was dead.** Once the rail replaced it, nothing referenced the file — but it still contained a full play/loop implementation, so a future reader would have found two plausible-looking playback components. Deleted rather than left as a decoy.

### Verified

```
playback controls outside the rail   none
duplicate play buttons in cards      0
PLAY ENTIRE CODEX in book view       absent
cards content starts at              y=182
```

The module title now renders once as page identity, plus once as the folio's own title page in book view — which is the book's frontispiece rather than chrome, and is kept deliberately.

---

## Header removed; navigation moved to a sidebar (2026-08-27)

The 160px sticky header is gone. Navigation, module picker, settings and provider status live in a left sidebar; reading controls sit beneath them.

```
                content starts at
original              1532
settings drawer        352
control rail           192
sidebar                 24
```

### Why a column rather than a bar

On a reading app horizontal space is the cheaper currency. A column takes width the page was not using; a bar takes height from every screen of text. At 1440px the sidebar costs 256px of width and nothing vertical.

### Two consequences the plan implied

**The rail had to become global.** It rendered only on the dialogue and book tabs. Holding navigation, it must exist everywhere — a reader reaching Roleplay could otherwise not leave. Reading controls are passed in and appear only where they apply.

**Mobile needed navigation in one tap.** Below `lg` the rail was a sheet behind a button; burying six destinations there taxes every move through the app. Mobile now gets a bottom bar with all six tabs — content scrolls beneath it, so it costs no reading height — with reading controls still behind a sheet, where a tap is acceptable.

### What was checked before removing it

Every other tab already prints the module title itself: Roleplay at line 71, Grammar at line 123, book view on its folio page. So removing the global header orphaned nothing, and only **cards** needed a title added.

### Book is the default

It carries every teaching feature the cards do — word glossing, per-line replay, translations, transliteration — with less chrome, so nothing pedagogical is lost. The choice persists in `localStorage`.

### The `NO FALLBACK` warning survives

Reduced to one row in the sidebar rather than dropped. A silent single-provider setup is how this app broke; the warning should outlive a layout change.

### An unrelated defect the change exposed

With book as the default, mobile opens on the folio — where the per-line **Listen Line** buttons were overflowing their cards, because the speaker row could not wrap. Fixed with `flex-wrap` and `shrink-0`; 22 cards checked, 0 overflowing. Pre-existing, but only visible once this view became what mobile users meet first.

---

## The sidebar was never actually sticky (2026-08-27)

It carried `sticky top-6` and looked implemented. It was not:

```
aside height 871px · inner height 871px · viewport 800px
aside top:  y=24  →  scroll 1500  →  −1352      (scrolled clean away)
```

**A sticky element can only travel inside its containing block, and the sticky div filled its parent exactly** — zero room to move, so it scrolled with the page. Sticky on a child that fills its parent is always a no-op; the class has to sit on the grid item.

The measurement also caught a second problem that would have turned the naive fix into a regression: **the sidebar is 871px against an 800px viewport.** Pinning it without a height bound puts the offline and download controls permanently out of reach.

**Fixed:** `sticky` moved to the `<aside>` itself, with `max-h-[calc(100vh-3rem)]` and `overflow-y-auto` so a sidebar taller than the screen scrolls internally. The grid's existing `items-start` is what lets the aside keep its content height while its grid area spans the row, giving sticky somewhere to travel.

```
scrollY     0    400    900   1376
asideTop   24     24     24   −112
pinned      ✓      ✓      ✓      ✗
```

The release at maximum scroll is inherent, not a bug: an 88px footer sits after the grid, so the grid ends before the viewport does and sticky clamps to its container. Every sticky sidebar behaves this way, and the alternative — `fixed` — would overlap the footer instead.

### A note on the verification

The first diagnostic reported the grid bottom at 2040 in a viewport of 800. That was impossible, and the cause was mine: the rects were read inside the return object, which evaluated *after* the scroll had been reset to zero. Re-measured properly. Third time this session an initially convincing check turned out to be measuring the wrong moment.

---

## Word highlighting weighted from the spoken form (2026-08-27)

**Reported:** highlighting tracks correctly under Modern pronunciation but drifts under Erasmian and Reconstructed.

**Cause:** `calculateWordTimings` weighted each word from `w.greek` — Greek character count, Greek vowel count, punctuation. In Modern the string sent to the engine *is* the Greek, so the estimate matched its input. In the other two schemes we send a transformed string, and the transformation is exactly what changes relative durations: `η→eh` and `ω→oh` add characters without adding syllables, while IPA writes vowel length as `ː`, one character denoting roughly double the time.

**Fixed:** weights now come from the string the engine actually reads, with duration-aware terms — `ː` adds, stress marks (`ˈ ˌ`) add nothing, non-syllabic glides subtract, and aspiration is excluded from raw length.

### Modern is unchanged by construction, not by luck

Greek in NFC contains no stress, length, non-syllabic or aspiration marks, so every new term evaluates to zero and the formula reduces to `length + 0.8·vowels` (+3.5 punctuation) — the original. A test asserts this against the previous formula reproduced verbatim, and a second asserts identical timings whether a spoken form is supplied or omitted.

### The first measurement was wrong, and said the opposite

Scoring the new weights against **character-count share** suggested Reconstructed had got *worse* (10pp → 17pp). That yardstick is unsound for IPA, where `ˈ`, `ʰ` and `̯` are characters carrying no duration.

Re-measured against **real audio**, synthesising each word and timing it:

```
                 old error   new error
Erasmian            32pp   →   30pp
Reconstructed       29pp   →   23pp
```

Reconstructed improves clearly; Erasmian marginally.

### What the audio also revealed

Short words are badly underestimated in every mode: `ὦ` takes **14–17%** of the line but is predicted at **6%**. Duration has a fixed articulation overhead that no length-proportional model captures.

Adding a constant per word would likely help more than the notation change did — but it would alter Modern's relative weights, so it breaks the invariant this change was asked to preserve. **Left undone deliberately**; it needs its own decision.

Two caveats on the ground truth: durations were measured on **isolated** words, which overstates short ones because connected speech compresses them; and errors remain large in absolute terms. The underlying limitation from **P1-4** stands — nothing here derives from the audio, and only word-level timestamps from the provider would make this exact.

---

## Cached-audio indicator counted clips playback would not use (2026-08-27)

**It does.** Measured on a running build, audio survives a reload and replays with **zero** TTS requests, for a built-in module and for a custom module alike. A synthetic custom module's records also survive the mount-time `pruneOrphans` pass, so that is not the cause either.

### What is actually wrong: the indicator counts audio playback will not use

`getModuleAudioMap` gathers records by **`moduleId` only**, keyed by `lineId`, discarding voice and variant:

```ts
const index = store.index("moduleId");
...
audioMap[rec.lineId] = { ... };   // any voice, any variant
```

Playback looks up the exact key, `moduleId__line_N__voice_V__v_VARIANT`. So a line cached under one voice or one settings combination is counted as cached under every other — and then regenerates on play.

Reproduced deliberately: with line 1 cached, switching pronunciation from Erasmian to Reconstructed left the indicator reading **1/8 lines** while playback issued a fresh TTS request. Both records now exist, `…__v_efn` and `…__v_rfn`.

```
socrates-alexander-agora__line_1__voice_Fenrir__v_efn
socrates-alexander-agora__line_1__voice_Fenrir__v_rfn
```

### Why it looked like a save failure

Anything cached before the variant scheme existed has no `__v_` suffix at all — five such records were still present at the start of this investigation. Every one of them is counted by the indicator and missed by playback, so a module that reports as downloaded regenerates line by line. From the outside that is indistinguishable from audio never having been saved.

The behaviour is correct in the sense that different settings genuinely need different audio. **The defect is the count**, which promises something the lookup will not honour.

### Fixed

The user confirmed the regeneration was a settings change, not a save failure — persistence was working. The indicator was the defect, and it still mattered: **offline study rests on being able to trust it.** A module reporting "8/8 lines" with zero usable clips means going offline and finding nothing plays.

- **One place computes a line's cache identity.** `audioIdentityFor(line, module)` returns `{ voice, context, variant }`, and playback, pre-caching and the indicator all read it. They previously derived it separately, and the indicator did not derive it at all.
- **`getCachedLineIds` counts exact matches**, taking the identities each line would be looked up under. Without them it falls back to the old permissive count rather than silently reporting nothing.
- **Settings are a dependency of the count.** A module can go from fully downloaded to not downloaded without the module changing, so the effect watches `speechSettings` and `speakerVoices` as well as the module id.
- **Pre-variant records are purged on mount.** They were produced word-by-word under the older transcription rules and no current setting reproduces them, so they can never be served — they only inflated the count and occupied quota.

Verified end to end. Seeding one legacy record and one current one, then reloading: the legacy record is removed, and the count tracks the settings exactly.

```
Reconstructed   0/8      (stored clip is Erasmian)
Erasmian        1/8      matches
Modern          0/8
Erasmian        1/8      returns
```

Eight tests cover the key logic — voice, variant, line and module all participating, and every variant this app can produce recognised as current.

---

## Apparatus replaced with real notes and stated provenance (2026-08-27)

The book view ended with a section headed **Apparatus Criticus & Philological Notes**. Three things were wrong with it.

### It was hardcoded

Four notes were literal JSX in `BookFormatView`, so **every module rendered the same ones**. Opening Aesop's fable or the *Apology* still displayed `128a 1 Χαῖρε, ὦ φίλε`, which belongs to neither.

Meanwhile every module already carries authored `commentary.philologicalNotes` — with citation, term, commentary and rhetorical device — which the book view never read. It now does.

### It was not an apparatus criticus

An apparatus records **variant readings across manuscript witnesses**:

```
128a  ὦ φίλε ω : om. B          21d  οἶδα BTW : οἶμαι Stob.
```

What was displayed is grammatical commentary in Latin — a different genre, nearer scholia. The heading is now **Philological Notes**, which is what the content is. A true apparatus would need real collation data; it cannot be generated, and inventing it would be worse than omitting it.

### Most of these texts have no manuscript tradition at all

| module | reference | provenance |
|---|---|---|
| Dialogue of Two Friends | `Dial. Ath. 128a–129c` | **composed** — imitates a Stephanus reference, names no real work |
| Aesop, Boreas & Helios | `Fab. Aesop. 46` | **adapted** — genuine fable (Perry 46), simplified wording |
| Plato, *Apology* | `Apol. 21d` | **adapted** — near-Platonic but reordered; the vocative is moved and γάρ dropped |

None is strictly transmitted. In a tool that sets its pages as a critical edition, a learner has no way to tell `Apol. 21d` from `Dial. Ath. 128a`, and Latin notes made both look equally authoritative.

`AncientGreekModule` now records `provenance`, stated in the book view and as a badge in cards. AI-generated modules are **forced** to `"composed"` server-side rather than trusted: the generator is asked for Stephanus-style references and will happily invent one.

Defaulting to `"composed"` when the field is absent is deliberate — it is the safer claim.

### Verified

Notes now differ per module: the *Apology* shows *"Ὦ ἄνδρες Ἀθηναῖοι: Standard formal opening for Attic oratory…"* where the default module shows its greeting note, and the hardcoded `128a 1` string is gone. The *Apology* page reads *"Adapted text. … Apol. 21d locates the source passage; the wording here is not the transmitted text."*

### Left open

The *Apology* module is labelled `Apol. 21d`, but its opening line corresponds to the σοφία passage nearer **20d**. Flagged in a code comment rather than changed — pinning the cited range is a philological judgement, not a code fix.

---

## Notes set as a commentary; fabricated section refs removed (2026-08-27)

Two changes, and the second is the one that mattered more.

### Notes now read like a commentary

Authored citations read `Line 1 (Greeting Formula)`. A commentary keeps the number and drops the topic label, which is editorial furniture rather than a reference. The section is now a definition list — line number, lemma in Greek, note:

```
 1   Χαῖρε (Khaîre)        Imperative of χαίρω ('rejoice!')… (Polite civic salutation)
 2   τὴν ἀγορὰν            The Agora was not merely a commercial marketplace…
```

The number column is monospaced and right-aligned with `tabular-nums`, so references line up down the page as they do in a printed apparatus.

### Every line carried an invented page reference

Found while doing the above. `stephanusSection` was:

```ts
const stephanusSection = `128${String.fromCharCode(97 + (idx % 5))}`;
```

It generated `128a`–`128e` cycling by line index **for every module, in three separate layouts**. Plato's *Apology* and Aesop's fable both displayed `[128a]` — a page reference belonging to neither, and to no real text at all, since `128` came from the invented default dialogue.

Worse than the hardcoded notes: those sat once at the foot of the page, while this decorated **every line of every text** with a fabricated citation.

Replaced with the actual line number, which is real, verifiable, and standard apparatus practice.

### Verified

Notes render as `1 / Χαῖρε (Khaîre) / Imperative of χαίρω…`, no `Line N` remains, and no `[128x]` appears anywhere in the page.

---

## Vercel: ESM imports needed explicit extensions (2026-08-27) — FIXED

**The logs named it exactly:**

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/server'
  imported from /var/task/api/index.js
```

**Vercel compiles the TypeScript but does not bundle it.** `package.json` sets `"type": "module"`, so the emitted `.js` is ESM — and **Node ESM performs no extension inference**. `import app from "../server"` survives compilation unchanged and cannot resolve at runtime.

It fails only when deployed because every local path fills the extension in: Vite for the frontend, `tsx` for `npm run dev`, and esbuild for `dist/server.cjs`, which bundles everything into one file so the question never arises.

### Every import along the path, not just the first

```
api/index.ts        ../server                     → ../server.js
server.ts           ./src/utils/phoneticConverter → …/phoneticConverter.js
server.ts           ./src/utils/ipaConverter      → …/ipaConverter.js
server.ts           ./src/types                   → ./src/types.js
phoneticConverter   ./phrasing                    → ./phrasing.js
ipaConverter        ./phrasing                    → ./phrasing.js
```

Fixing only `api/index.ts` would have moved the failure one module along.

### Verified by simulating the deployment

Reasoning about ESM resolution is easy to get wrong, so the fix was checked against the real mechanism: compile with `tsc` **without bundling**, into a clean directory, and load `api/index.js` with Node under `VERCEL=1`.

```
before   ERR_MODULE_NOT_FOUND  Cannot find module '…/server'
after    RESOLVED OK — default export is a function
```

The intermediate state is what confirmed the diagnosis: with only the entry fixed, resolution advanced past `../server` and failed on the next unextended specifier instead.

Also confirmed unaffected: frontend build, 137 tests, `dist/server.cjs` serving `/api/health`, `/api/providers` and `/` at 200, and the `tsx` dev path.

### Note

`api/index.ts` carries a comment saying the `.js` extension is required and must not be removed. It looks like a mistake — the file it names is `.ts` — and would otherwise be a natural thing for someone to "correct".

---

## Suggested order

Verification is done. The sequence below starts from a known-broken baseline and restores function before improving it.

**Phase 1 — restore basic function ✅ COMPLETE (2026-08-26)**

The app produces no audio today. AI output was restored by the `.env` edit, but only on this machine — the dead model id is still hardcoded in six places.

1. **P0-1** — `"mp3"` → `"pcm"` at [`server.ts:63`](../server.ts#L63). One word. **Still outstanding — re-confirmed failing.** Restores all speech.
2. **P0-5** — purge `google/gemini-2.0-flash-001` from the remaining six locations (`server.ts` ×3, `.env.example` ×2, `README.md` ×2). `.env` is already fixed, so this machine works; nothing else does.
3. **P2-7** — fix or delete the `APP_URL` placeholder. Still `MY_APP_URL`, still sent as `HTTP-Referer` on every call.

Stop here and confirm the app actually works end to end before touching anything else. Everything below assumes a functioning baseline.

**Phase 2 — resilience against a repeat ✅ COMPLETE except P0-4 (2026-08-26)**
4. **P0-4** — install a Gemini key. The insurance against another silent model withdrawal.
5. **P0-3** — hoist model ids to constants; make TTS failure degrade visibly.
6. **P2-8** — validate voice names; stop returning opaque 500s.
7. **P2-1** — commit `package-lock.json`.
8. **P2-3** — report resolved model ids from `/api/health`, so the next withdrawal is diagnosable in one request.

**Phase 3 — subtraction and correctness ✅ COMPLETE (2026-08-26)**
9. **P1-1** — delete `/api/tts-dialogue`.
10. **P1-3** — replace the 20 ms sleep with a generation counter.
11. **P1-2** — cancellable pre-cache with honest failure reporting.

**Phase 4 — naturalness (D7) ✅ COMPLETE (2026-08-26)**
12. **P2-6** — phonetic converter tests. The regression net for P1-9.
13. **P1-8** — variable inter-line gaps. **Ship and listen before starting P1-9.**
14. **P1-9** — contextual delivery prompts, behind a flag, with the context hash added to cache keys.

**Phase 5 — offline (D3) ✅ COMPLETE (2026-08-26, service worker unverified)**
15. **P1-6** — offline storage foundation, starting with `navigator.storage.persist()`.
16. **P1-7** — offline degradation, online/offline indicator, Ask AI response caching (D5).

**Phase 6 — cleanup ✅ COMPLETE except P2-2's rewrite check (2026-08-26)**
17. P1-4 (word-timing honesty), P1-5 (in-memory cache cap), P2-2 (Vercel rewrite check), P2-4 (README drift), P2-5 (package metadata).

## Open items

All seven decisions are resolved. No blocking questions remain.

Three things are deliberately provisional:

- **P0-3** — the two Gemini-native model ids cannot be verified until a Gemini key exists (P0-4). Confirm them as part of Phase 2, not before.
- **P1-9** ships behind a flag because its benefit is subjective and may prove inaudible. Reverting is a planned-for outcome, not a failure.
- **P1-4** — word-timing accuracy has no cheap correct fix; the minimum deliverable is honest README wording, not better code.

## What this exercise established

Worth recording, because it changes how the rest of this plan should be read.

The first draft of this document was written by reading the code. It correctly identified structural problems — the dead endpoint, the playback race, the uncancellable pre-cache — but it was **wrong about the severity and the cause of the single most important bug**. It diagnosed TTS as producing noise via a decoder mismatch, and proposed a decoder rewrite. The real defect was a rejected request parameter, the decoder was already correct, and the app was not degraded but entirely non-functional. It also missed the dead LLM model completely, because a decommissioned model id is indistinguishable from a live one by inspection.

Ten minutes of `curl` against the live API changed one P0, closed another, added a new one, and deleted a substantial piece of proposed work. **Verify external dependencies before planning around them.**
