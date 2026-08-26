# Spec — Phonological Phrasing for Speech Synthesis

Status: proposed, not implemented.
Supersedes the approach sketched in [FIX-PLAN.md](FIX-PLAN.md) P1-8/P1-9 for the juncture problem.
Related: the review document *The Juncture Problem*.

---

## The decision this encodes

Two things are wrong with our speech output, and they need different tools:

| Defect | Nature | Right tool |
|---|---|---|
| **Juncture** — every word spoken in isolation | Requires parsing. `τίς` vs `τις` cannot be resolved from a lookup table. | LLM judgement |
| **Phoneme mapping** — vowels possibly misread by an English-oriented model | Mechanical, exhaustive, must never vary | Deterministic code |

Handing both to an LLM was considered and rejected. The reason is the project's own standard: we declined Modern Greek pronunciation because `λύει / λύῃ / λύοι` would merge. An LLM that transcribes `ῃ` correctly 97% of the time reintroduces that merger **intermittently** — and a learner who can adapt to a systematic convention cannot adapt to an error that appears in one line and not the next, nor even detect it.

There is also a validation asymmetry that decides the architecture:

- A **grouping** can be verified mechanically — same words, same order, nothing added or dropped.
- A **free-form transliteration** cannot be verified without reimplementing the transliterator.

So the LLM is asked only for the thing that can be checked.

---

## Architecture

Three stages, and the middle one never runs at playback time.

```
IMPORT TIME (once per line, reviewable)
  Polytonic Greek
        │
        ▼
  [ LLM: phrasing ]  ──► groups of words + reason
        │
        ▼
  [ validate ]  ──► reject → fallback to one-word-per-group
        │
        ▼
  phrasing stored on the line   ◄── human may edit

BUILD / RUNTIME (deterministic, no model)
  phrasing + mapping table
        │
        ▼
  [ transcribe + join at seams ]
        │
        ▼
  spokenForm ──► TTS
```

**Why phrasing is stored, not the final string.** Phrasing is expensive and requires judgement; the character mapping is cheap and deterministic. Keeping them separate means every future mapping fix — `ου → oo`, an accent correction, a diphthong change — regenerates every line's `spokenForm` **with no further LLM calls and no re-review**. Store only the final string and every mapping fix costs another pass over the corpus.

---

## Data model

Added to `DialogueLine` in [`src/types.ts`](../src/types.ts):

```ts
export type JoinReason =
  | "proclitic"      // ὁ ἡ οἱ αἱ, ἐν εἰς ἐκ, ὡς, εἰ, οὐ/οὐκ/οὐχ — leans forward
  | "enclitic"       // τε γε τοι περ, μου μοι με, τις, ποτέ πού πως, εἰμί/φημί — leans back
  | "elision"        // ἀλλ' ἐν — final vowel already elided in the text
  | "crasis"         // κἀγώ — already fused orthographically
  | "none";          // an independent phonological word

export interface PhraseGroup {
  /** The original orthographic words, verbatim and in order. */
  words: string[];
  join: JoinReason;
  /** Short justification, shown to a human reviewer. */
  note?: string;
}

export interface DialogueLine {
  // ...existing fields
  /** Reviewed phonological grouping. Source of truth for speech. */
  phrasing?: PhraseGroup[];
  phrasingSource?: "llm" | "manual" | "fallback";
}
```

`spokenForm` is **not** stored. It is derived from `phrasing` + the mapping table on demand, so it can never drift out of sync with the mapping.

Note the existing `transliteration` field stays exactly as it is — it is display-only, used in five components, and is a *reading aid for humans*. It is not the speech input and must not be conflated with one.

---

## The LLM contract

One call per line, at import. Model: the configured `MODELS.openrouterLlm`.

**No new runtime dependency:** `/api/ai-import-module` already makes an LLM call. Phrasing rides the same import path. Built-in modules get their phrasing generated once and **committed as data**, so the shipped app never calls a model to speak.

### Request

System instruction states the task narrowly: group the given words into phonological phrases; do not transliterate, translate, correct, or reorder anything.

```
Input:  ["Οὐκ", "ἐν", "τῷ", "πολλῷ", "τὸ", "εὖ"]
```

### Response schema

```json
{
  "groups": [
    { "words": ["Οὐκ", "ἐν"],   "join": "proclitic",
      "note": "οὐκ is proclitic; the κ resyllabifies before the vowel" },
    { "words": ["τῷ", "πολλῷ"], "join": "proclitic", "note": "article leans on its noun" },
    { "words": ["τὸ", "εὖ"],     "join": "proclitic", "note": "article leans on its noun" }
  ]
}
```

Use the structured-output path (`response_format: json_object`), which is already verified working against `google/gemini-3.7-flash`.

---

## Validation — the load-bearing part

Applied to every response before it is stored. **Any failure discards the whole response for that line** and falls back; a partially-trusted grouping is not accepted.

1. **Exact partition.** `groups.flatMap(g => g.words)` must equal the input word array — same length, same order, byte-identical strings after NFC normalization. This single check catches hallucinated words, dropped words, reordering, silent transliteration, accent "corrections", and whitespace tampering.
2. **Closed vocabulary.** Every `join` is one of the `JoinReason` values.
3. **Group size ceiling.** No group longer than **4** words. A longer group is far more likely to be a model error than a real phonological word.
4. **Non-empty.** No group with zero words.

Failing any check logs the line id and the reason, then applies the fallback. Validation failures are counted and surfaced in the import result alongside the existing `warnings` array.

### Fallback

`phrasing = words.map(w => ({ words: [w], join: "none" }))`, `phrasingSource: "fallback"`.

That is **exactly today's behaviour**, so a failed or unavailable model degrades to the current output rather than to silence. Import never blocks on phrasing.

---

## Deterministic stage

### Seam rules

Within a group, transcribe each word with the existing converter, then join adjacent members:

| Left ends with | Right begins with | Action | Example |
|---|---|---|---|
| consonant | vowel | concatenate directly (resyllabification) | `ouk` + `en` → `ouken` |
| elision apostrophe | vowel | drop the apostrophe, concatenate | `all'` + `en` → `allen` |
| vowel | vowel | concatenate | `to` + `eu` → `toeu` |
| consonant | consonant | concatenate | — |

Groups are separated by a single space. Punctuation attaches to the group it followed.

### Accent within a group

A proclitic carries no accent and an enclitic normally throws its accent onto the host, so **a group receives exactly one stress mark**, on the host word. This is the payoff: a single accented token tells the model "one word, stressed here" — which is precisely the information missing today.

Where the host is unaccented in the source, leave the group unmarked rather than inventing a stress.

### Mapping table is versioned

```ts
export const MAPPING_VERSION = 2;
```

Bumped whenever any character mapping changes. It participates in the audio cache key, so a mapping fix invalidates stale audio automatically instead of silently serving the old pronunciation.

**The diphthong respellings are not settled by this spec.** `ου → oo` is adopted (English `ou` invites /aʊ/ where we need [uː]). The `αι / ει / αυ` family is still open pending a listening test — see [FIX-PLAN.md](FIX-PLAN.md) P2-4. This spec's job is to make that decision cheap to apply later, which the version constant does.

---

## Caching

Audio cache key gains the phrasing dimension, reusing the existing `variant` mechanism from P1-9:

```
variant = `m${MAPPING_VERSION}-${hash(spokenForm)}`
```

Hashing the derived `spokenForm` rather than the phrasing means the key changes if and only if the audio would actually differ. Empty variant continues to mean "pre-phrasing audio", so nothing already cached is orphaned.

---

## Testing

| Layer | Approach |
|---|---|
| Character mapping | Extend the existing 56-test suite. Add the `ου → oo` family. |
| Seam joining | Pure function, table-driven — every row of the seam table above. |
| Validation | Adversarial: dropped word, added word, reordered, oversized group, altered accent, empty group. Each must reject and fall back. |
| Corpus | **Golden file** of every built-in line's `spokenForm`, committed. Any mapping or seam change shows up as a reviewable diff rather than a silent shift. |

The golden file is what makes an LLM-adjacent pipeline reviewable: the model's contribution is frozen into data, and everything downstream of it is diffable.

---

## Rollout

1. **Deterministic work first** — seam logic, `MAPPING_VERSION`, `ου → oo`, grave/circumflex accent fix. Fully testable with no model involved. Ship and listen.
2. **Phrasing for built-in modules** — generate once, **review by a philologist**, commit as data. Still no runtime model.
3. **Import path** — wire phrasing into `/api/ai-import-module` for user-imported text, with validation and fallback.
4. **Review UI** — let a user see and correct a line's grouping, setting `phrasingSource: "manual"`. Human correction must outrank the model permanently.

Steps 1 and 2 deliver most of the benefit with no runtime dependency and no non-determinism. Step 3 is the only place a model touches speech, and only for text the user supplied themselves.

---

## Open questions

1. **Pedagogy.** A learner reads `οὐκ ἐν` as two words and hears one. Does that teach the real rhythm, or obscure word division at the stage they most need it? Outstanding with the external reviewer; it could change step 2.
2. **Liaison scope.** Greek word-final consonants are limited to `ν ρ ς` plus the `κ/ξ` of `οὐκ`/`ἐκ`, so the set of sites is small and enumerable. Do we link at all of them, or only within proclitic groups?
3. **Hyphen vs. fusion.** `ook-en` or `ooken`? Not a philology question — it depends on how this model tokenizes, and a listening test settles it in minutes.
4. **Diphthong respelling.** Unresolved; see P2-4.
