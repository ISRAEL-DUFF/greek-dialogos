This is a brilliant and highly practical approach. You are absolutely right that Modern Greek pronunciation (specifically *iotacism*, where η, υ, ει, οι, ι all merge into /i/, and *betacism*, where β becomes /v/) creates massive hurdles for beginners trying to understand Ancient Greek morphology and grammar.

To "trick" an LLM-based TTS system, you need to bypass its Greek Grapheme-to-Phoneme (G2P) engine entirely by feeding it a **TTS-optimized Latin phonetic spelling**. 

Here is a comprehensive guide and pipeline to achieve this.

---

### Step 1: The Mapping Strategy (Greek → IPA → TTS Latin)

The biggest challenge is that TTS models are usually optimized for English or standard Latin. If you just feed it raw IPA, it might misinterpret the symbols. Instead, we map Erasmian IPA to a **pseudo-English/Latin orthography** that forces the TTS to produce the correct sounds using its native rules.

Here is the master mapping table for **Standard Erasmian / Restored Attic**:

#### Vowels & Diphthongs
| Greek | Erasmian IPA | TTS Latin Spelling | Notes for TTS |
| :--- | :--- | :--- | :--- |
| **α** | /a/ | `a` | Like "f**a**ther". |
| **ε** | /e/ | `eh` | Short e, like "b**e**d". Use "eh" to prevent TTS from saying /i/. |
| **η** | /ɛː/ | `air` | Long open e. "air" forces the English TTS to make a long, open sound. |
| **ι** | /i/ | `ee` | Like "s**ee**". Prevents the TTS from using a short /ɪ/. |
| **ο** | /o/ | `aw` | Short o. "aw" (like "l**aw**" but shorter) prevents it from becoming a diphthong /oʊ/. |
| **υ** | /y/ | `ü` or `ee` | **The hardest sound.** If TTS supports `ü` (like German), use it. If not, fallback to `ee` and accept a slight compromise, or use `yu`. |
| **ω** | /ɔː/ | `oh` | Long open o. "oh" forces a long, rounded sound. |
| **αι** | /ai/ | `eye` | Like "eye". |
| **ει** | /eː/ | `ay` | Like "d**ay**". |
| **οι** | /oi/ | `oy` | Like "b**oy**". |
| **ου** | /uː/ | `oo` | Like "m**oo**n". |
| **αυ** | /au/ | `ow` | Like "c**ow**". |
| **ευ** | /eu/ | `eh-oo` | Glide from "eh" to "oo". |

#### Consonants
| Greek | Erasmian IPA | TTS Latin Spelling | Notes for TTS |
| :--- | :--- | :--- | :--- |
| **β** | /b/ | `b` | Hard 'b'. Prevents Modern Greek /v/. |
| **γ** | /g/ (or /ŋ/) | `g` (or `ng`) | Hard 'g'. Use `ng` before γ, κ, χ, ξ. |
| **δ** | /d/ | `d` | Hard 'd'. |
| **ζ** | /z/ (or /zd/) | `z` (or `zd`) | Standard Erasmian is /z/. Use `zd` if you want strict historical. |
| **θ** | /tʰ/ | `t` | **Trick:** In English, a 't' at the start of a stressed syllable is naturally aspirated /tʰ/. Do *not* use "th", or the TTS will say /θ/ (Modern Greek). |
| **κ** | /k/ | `k` | Hard 'k'. |
| **π** | /p/ | `p` | Hard 'p'. Naturally aspirated /pʰ/ at the start of stressed syllables. |
| **τ** | /t/ | `t` | Hard 't'. |
| **φ** | /pʰ/ | `p` | **Crucial:** Do *not* use "ph" or "f", or it will say /f/. Just use `p`. English TTS will naturally aspirate it to /pʰ/ if stressed. *(Note: If your specific curriculum uses the later Erasmian /f/, use `f`)*. |
| **χ** | /kʰ/ | `k` | Same as phi. Use `k`, not "ch" (which makes /tʃ/ or /x/). |
| **ρ** | /r/ | `rr` | Use double `r` to encourage the TTS to attempt a trill/tap, though English TTS will likely default to an approximant /ɹ/. |
| **σ/ς** | /s/ | `s` | Standard 's'. |

---

### Step 2: Handling Stress and Prosody

Ancient Greek was a pitch-accent language, but Erasmian pedagogy converts this to a **stress accent**. TTS engines need to know exactly which syllable to stress, or they will apply default English stress rules, which will be completely wrong.

**How to force stress in TTS:**
1. **Capitalization (Most reliable):** Capitalize the stressed vowel. 
   * *Example:* λόγος (lógos) -> `loh-GOS` or `lo-GOS`.
2. **Apostrophes (If supported):** Some TTS engines use an apostrophe before the stressed syllable.
   * *Example:* `lo'gos`.
3. **SSML (Speech Synthesis Markup Language):** If your TTS API supports SSML, wrap the stressed syllable in an emphasis tag.
   * *Example:* `<emphasis level="strong">gos</emphasis>`

*Rule of thumb for your pipeline:* Always map the Greek accent (acute, circumflex) to a capitalized vowel in your Latinized string.

---

### Step 3: The Implementation Pipeline

Here is how you should architect the backend for your audio system:

#### 1. Text Normalization
* Input: Polytonic Greek text (e.g., `ὁ λόγος`).
* Action: Strip breathing marks (῾, ἁ). Convert rough breathings to an `h` at the start of the word (e.g., `ὁ` -> `ho`, `ὁράω` -> `horaō`). Strip punctuation or convert it to TTS-friendly pauses (commas, periods).

#### 2. Grapheme to Erasmian IPA (The Core Logic)
* Write a deterministic Python script (using regex or a library like `greek-utils`) to convert the normalized Greek string into Erasmian IPA. 
* *Do not use an LLM for this step.* LLMs will hallucinate or accidentally apply Modern Greek rules. Use a strict dictionary/regex mapping.

#### 3. IPA to TTS-Optimized Latin (The "Trick")
* Convert the IPA string into the TTS Latin spelling using the table above.
* Apply the stress capitalization based on the original Greek accents.
* *Example:* 
  * Greek: `ἄνθρωπος` (ánthrōpos)
  * IPA: `/ántʰrɔːpos/`
  * TTS Latin: `AN-thro-pos` (Assuming 'th' is accepted as /θ/ for theta in your specific dialect, or `AN-tro-pos` if strictly using aspirated /tʰ/).

#### 4. TTS Generation
* Pass the final Latin string to the TTS API.
* *Pro-tip:* Force the TTS language to **English** (or Latin) in the API call. If you pass `lang="el-GR"`, the TTS will ignore your Latin spelling and try to read it as Modern Greek!

---

### Example Walkthrough

Let's trace a full sentence: **`ὁ σοφὸς ἀνὴρ λέγει τὴν ἀλήθειαν.`** (The wise man speaks the truth.)

1. **Normalize:** `ho sophos anêr legei tên alêtheian.`
2. **Map to Erasmian IPA:** 
   `ho so.pʰos a.nɛːr le.gei tɛːn a.lɛː.tʰei.an.`
3. **Convert to TTS Latin & Apply Stress:**
   *(Using English TTS rules: p/t/k naturally aspirate, 'air' for eta, 'oh' for omega)*
   `ho so-POS a-NAIR leh-GAY tair a-LAIR-tay-ahn.`
4. **API Call:** 
   Send `"ho so-POS a-NAIR leh-GAY tair a-LAIR-tay-ahn."` to the TTS with `language="en-US"`.

### A Note on LLM TTS Capabilities
Before you build the Latinization step, check if your specific TTS provider (like ElevenLabs, Azure, or PlayHT) supports **native IPA input** via SSML. 
If they do, you can skip Step 3 entirely and just pass the Erasmian IPA directly using phoneme tags (e.g., `<phoneme alphabet="ipa" ph="antʰrɔːpos">`). It is much cleaner, but if your TTS doesn't support it, the Latinization "hack" above is the industry standard workaround.
