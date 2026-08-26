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

### P1-1 · Delete `/api/tts-dialogue`
**Where:** [`server.ts:279-374`](../server.ts#L279) · **Decision:** D7

Nothing in `src/` calls this endpoint. It normalizes every speaker to `"Socrates"` or `"Alexander"` ([`server.ts:288-292`](../server.ts#L288)), so it cannot serve the Aesop or *Apology* modules, and its `socratesVoice` / `alexanderVoice` parameters bake that assumption into the API contract.

An earlier revision of this plan proposed rebuilding it as a windowed multi-speaker scene renderer. **D7 reverses that.** The rebuild would have cost per-line word highlighting, per-line cache reuse, and single-line replay — all working features — in exchange for smoother conversational flow, in a study tool where word highlighting is a headline capability. The naturalness gain is pursued instead through P1-8 and P1-9, which keep every existing feature intact.

**Fix:** delete the route and `callOpenRouterTTS`'s unused multi-speaker framing. Remove the corresponding claim from the README (see P2-4). Keep `multiSpeakerVoiceConfig` out of the codebase entirely — its 2-speaker cap conflicts with the 3-speaker Aesop module ([`dialogueData.ts:588-591`](../src/data/dialogueData.ts#L588)) and there is now no caller that needs it.

**Verify:** `grep -rn "tts-dialogue" .` returns nothing outside this document; all three built-in modules still play end to end.

### P1-2 · Pre-cache ignores the stop control and has no cancel
**Where:** [`src/App.tsx:183-224`](../src/App.tsx#L183)

`handlePrecacheAudio()` loops every line with a sequential `await fetch`, checking only `isPrecaching` at entry. There is no way to cancel a run in progress, navigating away leaves it running, and a module with many lines issues that many billed TTS calls with no ceiling. Failures are swallowed to `console.warn` ([`src/App.tsx:216`](../src/App.tsx#L216)), so a run where every call 401s still reports as complete.

**Fix:** add an `AbortController` stored in a ref, check it each iteration, abort on module change and unmount, and surface a cancel button in the progress UI. Count failures and report them (`"cached 8 of 12 lines, 4 failed"`) instead of silently finishing.

### P1-3 · Playback race is handled by a 20 ms sleep
**Where:** [`src/App.tsx:255-258`](../src/App.tsx#L255), [`src/App.tsx:345-348`](../src/App.tsx#L345)

Both play handlers set `stopSequenceRef.current = true`, call `audioPlayer.stop()`, `await new Promise(r => setTimeout(r, 20))`, then reset the flag. The comment calls it a "brief microtask for previous loop to exit". It is a timing guess: if the previous loop is awaiting a slow `fetchLineAudioBuffer`, it has not reached its stop check within 20 ms and will resume playing after the new sequence starts, producing two overlapping playbacks.

**Fix:** replace the boolean ref plus sleep with a monotonically increasing generation counter. Each sequence captures its generation at entry and bails whenever `generationRef.current !== myGeneration`. No sleep, and correct regardless of how long a fetch takes.

### P1-4 · Word highlighting is a length heuristic presented as synchronization
**Where:** [`src/utils/audioPlayer.ts:13-45`](../src/utils/audioPlayer.ts#L13)

`calculateWordTimings()` distributes total duration by character count, vowel count, and a punctuation bonus. It is not derived from the audio. Drift accumulates across a long line, so the last words in a sentence are visibly out of step.

**Fix:** no cheap correct fix exists without timestamps from the TTS provider. Two options:
- Accept it, and soften the README wording from "word-by-word synchronized audio highlighting" to "estimated word highlighting".
- If the provider can return word-level timestamps, use them and keep the heuristic as fallback.

Decide the wording change at minimum; the code change is optional.

### P1-5 · Unbounded in-memory audio cache
**Where:** [`src/utils/audioPlayer.ts:50`](../src/utils/audioPlayer.ts#L50)

`audioCache: Map<string, AudioBuffer>` grows for the lifetime of the page and is never evicted. Decoded 24 kHz mono buffers are roughly 48 KB per audio-second; a long pre-cached session holds tens of megabytes of decoded PCM on top of what IndexedDB already stores.

**Fix:** cap it (LRU, ~30 entries) or drop the map entirely — IndexedDB is already the durable cache and decode is fast.

### P1-6 · Make the audio cache an actual offline store
**Where:** [`src/utils/audioStorage.ts`](../src/utils/audioStorage.ts) · **Decision:** D3 (offline is a goal)

Audio accumulates per `(module, line, voice)` with no cap, no eviction, and no UI showing how much is stored. Switching voices multiplies entries. Crucially for D3: browsers evict an origin's storage under pressure, and they do it wholesale — a user who pre-cached a module for a flight can lose all of it silently.

Because offline is a real goal, this is no longer just hygiene:

1. **`navigator.storage.persist()`** — request persistent storage on first pre-cache. Without it, nothing here is durable, and every other item in this list is built on sand. Do this first.
2. **`getStorageStats()` plus a storage UI** — bytes used, quota remaining, per-module breakdown, and a per-module "remove downloaded audio" control. Users cannot manage an offline library they cannot see.
3. **Eviction policy** — LRU by `createdAt`/last-access, but *never* evict a module the user explicitly marked for offline use. That distinction requires a "keep offline" flag per module in localStorage.
4. **Service worker** — the app shell (`index.html`, the Vite bundle, CSS) must be cached or the page will not even load offline. Built-in modules ship in the JS bundle; custom modules are already in localStorage. Consider `vite-plugin-pwa` rather than hand-rolling.
5. **Integrity check** — on load, reconcile IndexedDB against the module list and drop orphaned entries from deleted custom modules.

**Verify:** pre-cache a module, go offline in DevTools, hard-reload, and confirm the app loads and plays every cached line.

### P1-7 · Network-dependent features have no defined offline behaviour
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

### P1-8 · Vary the inter-line gap instead of a fixed 400 ms
**Where:** [`src/App.tsx:375`](../src/App.tsx#L375), [`src/App.tsx:295`](../src/App.tsx#L295) · **Decision:** D7

`handlePlayFullDialogue` sleeps a hardcoded 400 ms between every pair of lines, and 800 ms between loop repetitions. Every turn boundary gets identical spacing — the same pause after a casual greeting as after a weighty philosophical claim. This is likely a **larger** contributor to the mechanical feel of sequential playback than intonation is, and unlike P1-9 it needs no model involvement at all.

**Fix:** derive the gap from the punctuation ending the *previous* line and the relationship between the two turns.
- Question mark (`;` in Greek — note that Greek uses `;` for the interrogative, not `?`) → shorter gap, ~250 ms. A reply follows a question promptly.
- Full stop / raised dot (`.` `·`) ending a long line → longer gap, ~600 ms.
- Same speaker continuing across two lines → shortest gap, ~150 ms. It is one continuous utterance, not a turn exchange.
- Clamp the whole range and scale it inversely with `playbackSpeed`, or fast playback will feel gappy.

**Why this comes first:** it is deterministic, unit-testable, free of API cost, has no cache implications, and cannot degrade pronunciation. Ship it and listen before committing to P1-9 — it may resolve enough of the problem on its own.

**Verify:** a pure function `gapAfter(prevLine, nextLine, speed) → ms` with table-driven tests. Subjective A/B by ear for the final tuning.

### P1-9 · Give the TTS model conversational context per line
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

### P2-2 · Verify Vercel path handling for the API rewrite
**Where:** [`vercel.json`](../vercel.json), [`api/index.ts`](../api/index.ts)

`"/api/(.*)"` rewrites to `"/api"`, which resolves to `api/index.ts` exporting the Express app. Express routes are registered at full paths (`/api/tts`, `/api/providers`). This works only if the function receives the *original* request path in `req.url` rather than the rewrite destination. Confirm on a preview deployment before relying on it.

**Fix if it does not hold:** mount the router at `/` inside the function, or replace the rewrite with filesystem routing (`api/tts.ts`, `api/providers.ts`, …).

**Also:** `server.ts` imports `createViteServer` from `vite` at module scope ([`server.ts:3`](../server.ts#L3)). Even though `startServer()` is guarded by `!process.env.VERCEL`, the import is still evaluated in the serverless bundle, pulling Vite into the function and slowing cold starts. Move it to a dynamic `await import("vite")` inside the dev branch.

**Verify:** `GET /api/health` on a preview deployment.

### P2-3 · ✅ DONE — health and provider endpoints now report resolved model ids
**Where:** [`server.ts:756-790`](../server.ts#L756)

`/api/providers` reports which keys are present, not whether they work. A revoked key shows as green in the header. `/api/health` does not report the LLM model id.

**Fix:** report all resolved model ids from `/api/health`. Optionally add an opt-in `?probe=1` that makes one cheap live call per provider so the badge reflects reality.

### P2-4 · README describes files and features that do not exist
**Where:** [`README.md`](../README.md)

- Lists `src/data/modules.ts` and `src/utils/phonetics.ts`; the real files are `src/data/dialogueData.ts` and `src/utils/phoneticConverter.ts`.
- Omits `src/utils/audioStorage.ts` and `src/utils/modulePackage.ts` entirely.
- Claims "raw audio WAV/MP3 export" — no such export exists; audio leaves the app only as base64 inside a JSON module package.
- Claims a "Universal Custom TTS Laboratory" that inspects transliteration; confirm the sandbox actually surfaces the returned `phoneticText` (the API returns it; check the component renders it).
- The pronunciation table gives ζ as `[zd]` and ει as `[eː]`; confirm those match what `phoneticConverter.ts` actually emits, since the table reads as a spec.

**Fix:** correct the tree, delete the unimplemented claims, and reconcile the table against the converter.

### P2-5 · Package metadata is scaffold leftovers
**Where:** [`package.json`](../package.json)

`"name": "react-example"`, and `vite` is listed in both `dependencies` and `devDependencies`.

**Fix:** rename the package; keep `vite` in one list (it must stay a dependency only if the serverless bundle genuinely imports it — see P2-2, after which it belongs in `devDependencies`).

### P2-6 · No test coverage on the one piece of pure logic
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

**Phase 3 — subtraction and correctness**
9. **P1-1** — delete `/api/tts-dialogue`.
10. **P1-3** — replace the 20 ms sleep with a generation counter.
11. **P1-2** — cancellable pre-cache with honest failure reporting.

**Phase 4 — naturalness (D7), cheapest first**
12. **P2-6** — phonetic converter tests. The regression net for P1-9.
13. **P1-8** — variable inter-line gaps. **Ship and listen before starting P1-9.**
14. **P1-9** — contextual delivery prompts, behind a flag, with the context hash added to cache keys.

**Phase 5 — offline (D3)**
15. **P1-6** — offline storage foundation, starting with `navigator.storage.persist()`.
16. **P1-7** — offline degradation, online/offline indicator, Ask AI response caching (D5).

**Phase 6 — cleanup, any order**
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
