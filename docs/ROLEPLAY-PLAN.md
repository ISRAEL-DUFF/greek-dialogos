# Roleplay: Assemble and Speak (A1 + B2)

Plan of record. Shareable version:
https://claude.ai/code/artifact/0c43ba2c-28ef-407f-a876-555aeab752c5

## The problem

Roleplay walks a fixed script: it plays the other speaker's lines, stops on
yours, shows the Greek, and waits for Proceed. It never perceives the learner —
there is no microphone anywhere in the codebase, and `isUserTurn` only changes
the styling and the button caption. The header says "Interactive Conversational
Roleplay"; the interaction is a Next button.

## The constraint that shapes everything

**There is no speech recognition for Ancient Greek.** Not in the browser, not in
Whisper, nowhere. The Web Speech API offers `el-GR` — Modern Greek — and nothing
older.

So the question is not "how do we grade the learner's Attic" but "what can the
app genuinely perceive, and what can it genuinely teach". Both halves below
avoid asserting anything the software cannot actually know.

## Scope

**B2 — assemble the line from a word bank.** Show the English, shuffle the
line's words as tiles, rebuild the Greek. Every module already carries the
morphology: the importer generates `partOfSpeech`, `root`, `meaning` and
`grammarDetails` per word and has been storing them all along.

**A1 — record and compare.** `MediaRecorder` captures the attempt; it is drawn
as a waveform beside the reference clip and played back against it. No
transcription, no score.

Neither needs a model call. The tiles come from data already generated; the
waveform is compared against the TTS clip already in IndexedDB.

## The design problem worth solving well

Greek word order is free, so "wrong order" is usually not wrong. Marking any
deviation from the module's ordering as an error would be pedagogically false.

But `phrasing.ts` already owns a rule set that *can* judge placement honestly —
proclitics, enclitics and postpositives genuinely cannot move. Three tiers:

1. **Exact match** — confirm and move on.
2. **A clitic rule is violated** — real, earned feedback. A postpositive placed
   first, or an enclitic separated from its host: the app can say exactly what is
   wrong and why (μέν is postpositive and never begins a clause). Grammar
   teaching grounded in code that already exists and is already tested.
3. **A different but defensible order** — do not call it wrong. Show the original
   beside the attempt and let the learner compare. Deciding whether an arbitrary
   reordering is grammatical needs real syntax, which the app does not have, so
   it will not pretend to.

## Phases

Phases 1–2 deliver a working exercise with no browser permissions at all. If the
recording half is ever abandoned, the first half still stands.

| # | Phase | Size | Files |
|---|---|---|---|
| 1 | Word-bank core | small | **new** `src/utils/wordBank.ts`, `tests/wordBank.test.ts` |
| 2 | Assembly UI in the turn card | medium | **edit** `src/components/RoleplayMode.tsx` |
| 3 | Recorder core | small | **new** `src/utils/recorder.ts`, `tests/recorder.test.ts` |
| 4 | Waveform comparison | medium | **new** `src/components/WaveformCompare.tsx` |
| 5 | Settings and persistence | small | **edit** `src/utils/speechSettings.ts`, `tests/speechSettings.test.ts` |
| 6 | Honest labelling | tiny | **edit** `src/components/RoleplayMode.tsx` |

**1 — Word-bank core.** Deterministic seeded shuffle so tests are stable.
`checkAssembly()` returns the tier plus the specific clitic violation when there
is one. Punctuation is rendered onto tiles by reusing `wordAffixes()`.

**2 — Assembly UI.** Tiles are buttons, not drag targets: click to place, click
to remove. Dragging would exclude keyboard and touch users for no pedagogical
gain. The Greek stays hidden until the learner commits or asks to reveal.

**3 — Recorder core.** A `MediaRecorder` wrapper with feature-detected mime type
— Safari prefers mp4, Chromium webm. The microphone is requested only on an
explicit click, never on mount. Denial is a supported state, not an error path.

**4 — Waveform comparison.** Both clips decoded to `AudioBuffer` and drawn on
canvas, each peak-normalised so microphone gain does not swamp the comparison —
the point is shape and timing, not loudness. Duration delta is reported because
it is genuinely measurable: an attempt twice the reference length means the
learner is still reading word by word.

**5 — Settings.** Two toggles on `SpeechSettings`, validated on load like the
rest. Both **excluded from `settingsVariant`** — they change nothing about the
audio, and including them would re-render every cached clip to toggle an
exercise. A test pins that, as it does for `wordHighlight`.

**6 — Honest labelling.** "Interactive Conversational Roleplay" oversells it:
the app listens but does not understand. The eyebrow text already reads
"Recitation & Dialectic Exercise", which is accurate. Also removes the dead
`playbackSpeed` prop, declared and destructured but never used.

## Risks

| Risk | Mitigation |
|---|---|
| Microphone denied or unavailable | A first-class state, not an error path. Phases 1–2 stand alone. |
| Safari and Chromium disagree on recording formats | Feature-detect `isTypeSupported`; decode through the existing `AudioContext`. |
| Recordings filling the storage quota | Held in memory for the session only, never written to IndexedDB. The audio cache budget is untouched. |
| Word-order feedback teaching a falsehood | The three-tier response. Only clitic placement is asserted, because only that is provably decidable here. |
| A line whose `words[]` does not match its `greekText` | Reuse the alignment check written for punctuation; when it cannot align, skip assembly for that line rather than build a broken puzzle. |

## Explicitly out of scope

- **Speech recognition and pronunciation scoring.** Only meaningful on the Modern
  setting, and misleading on Erasmian or Reconstructed, where keeping the vowels
  apart is the entire point.
- **Model-generated audio critique.** No model has heard authentic Attic; its
  feedback would be fluent, confident and unverifiable. It would need testing
  against deliberately wrong pronunciations before it could be trusted.
- **Branching conversation.** A good next step once this lands, and separate work.

## Open decisions

- Should assembly be skippable per line, or always required on the learner's turn?
- Should the reference clip auto-play once before the attempt, or only on request?
- Word tiles: the line's own words only, or salted with distractors from elsewhere
  in the module?

---

## Added after the six phases: the performance review

At the end of a run, the whole dialogue laid out and playable straight through,
with the learner's own voice in their part and the recital in the rest — the
reading they actually took part in, rather than the one the app would have
produced on its own.

### Three decisions, taken with the user

| question | decision |
|---|---|
| How long do recordings live? | **This session only**, in memory. Reloading loses them; nothing of the learner's voice reaches disk, and the audio cache's quota is untouched. Keeps the commitment made in the risk table above. |
| What plays for a line they never recorded? | **The recital, clearly marked.** The dialogue runs unbroken, and the line carries a "Not recorded" badge — a review that quietly passed the model's voice off as the learner's would be worse than useless. |
| Can they re-record from the review? | **No.** Review only; restarting the dialogue is how a line gets redone. Keeps the completion screen a clear endpoint. |

### What had to move

Recordings were owned by `SpeakAndCompare`, which is remounted on every turn
(`key={currentLine.id}`), so each one was discarded the moment the learner
advanced. They now live in `RoleplayMode` as a `Map<lineId, AudioBuffer>`, which
also means returning to a line you already recorded shows your attempt again.

Playback reuses `gapAfter` from `dialogueTiming`, so the spacing between turns is
derived from punctuation and speaker change exactly as it is in the Study Reader,
rather than being a fixed interval invented for this screen. A run counter
guards the playthrough: stopping mid-way cannot leave a stale loop fighting the
next one for the speaker.

### Verified

Walked all eight turns to completion. All eight rows render with correct badges
(Socrates → "Not recorded", Alexander → "Recital"), and the summary reads
"0 of 4 of your lines in your own voice". Per-line playback flips only that
line's button and costs nothing for a cached clip. The playthrough advanced
1 → 4 with pacing, disabled the per-line buttons while running, and Stop
restored every control.

**Unverified:** the "Your voice" badge and any playback of an actual recording.
The Browser pane blocks microphone access, so no attempt can be captured here.

Cost of the whole verification: 7 TTS calls.
