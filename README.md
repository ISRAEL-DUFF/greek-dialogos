# 🏛️ Classical & Ancient Greek Philology & Dialogue TTS System

An interactive philological reader, dialogue player, and pedagogical study workstation for Classical Ancient Greek (Attic, Koine, Homeric, and Aesopic). The application features **Reconstructed Attic & Erasmian Text-to-Speech (TTS)** powered by **Gemini 3.1 Flash TTS** (accessible directly or via **OpenRouter**), complete grammatical and morphological analysis (Liddell-Scott-Jones standard), Stephanus/Bekker citation apparatus, interactive Socratic roleplay, and an AI-powered module generator and importer.

---

## 🌟 Key Features

### 1. 🎙️ Reconstructed Attic & Erasmian TTS Engine
* **Authentic Classical Pronunciation**: Automatically transforms polytonic Greek into an exact Latin-phonetic IPA/Erasmian transposition before synthesis, preventing modern Greek phonological shifts (e.g. distinguishing aspirated stops $\theta, \phi, \chi$, diphthongs $\alpha\iota, \epsilon\iota, o\iota, \alpha\upsilon, \epsilon\upsilon$, and rough breathing $h-$).
* **Multi-Voice Cast**: Rich pre-built voice characters (`Fenrir`, `Puck`, `Kore`, `Charon`, `Zephyr`, `Aoede`) mapped to philosophical persona archetypes (e.g., Socrates, Plato, Chaerephon, Alexander, Aesopic narrators).
* **Granular Playback Controls**: Line-by-line playback, *estimated* word-by-word highlighting (see the note under Phonetics below), variable speeds ($0.75\times$, $0.85\times$, $1.0\times$, $1.25\times$), and conversational pacing that varies the pause between turns by punctuation and speaker change.
* **Optional Contextual Delivery**: An experimental toggle that tells the TTS model who is speaking and what they are responding to, so a reply is not synthesized as an isolated sentence. Off by default; audio is cached separately per mode so the two can be compared by ear.

### 2. 📖 Multiple Reading & Study Modes
* **Interactive Dialogue Theater**: Turn-by-turn conversational display with collapsible transliteration, interlinear literal & idiomatic English translations, Modern Greek parallels (Νέα Ελληνικά), and contextual rhetorical notes.
* **Classical Critical Edition (Book / Stephanus View)**: Traditional philological layout with Greek text on the left, commentary and English translation on the right, Stephanus/Bekker margin references, and critical apparatus footnotes.
* **Interactive Socratic Roleplay**: Choose your persona (e.g. Socrates vs. interlocutor), rehearse lines aloud with native audio reference, track recitation progress, and receive instant linguistic feedback.
* **Universal Custom TTS Laboratory**: Type or paste any polytonic Ancient Greek passage, choose a voice character, customize emotional tone (dramatic, solemn, philosophical, inquisitive), inspect the phonetic transliteration, and generate audio on-demand.
* **Philological Commentary & Grammatical Syntax**: Deep dives into historical context, grammatical syntax points with examples, rhetorical device analysis (hyperbaton, chiasmus, aposiopesis), and dialectal contraction notes.

### 3. 🔍 Deep Word-Level Morphological Glossing
* Click any Greek word in any module to trigger the **Liddell-Scott-Jones (LSJ) Morphological Inspector**.
* Complete lemma extraction, part-of-speech categorization, grammatical parsing (case, number, gender, tense, voice, mood), contextual translation, and dictionary definition.
* One-click AI philological explanation for any selected sentence or phrase.

### 4. 🪄 AI Module Creator & Custom Importer
* **AI Module Generation**: Create curriculum modules on any topic (e.g. *The Allegory of the Cave*, *The Funeral Oration of Pericles*, *The Fox and the Grapes*, *Socrates and Euthyphro*) with complete polytonic Greek text, vocabulary breakdowns, and commentary.
* **Raw Greek Text Importer**: Paste any Ancient Greek passage from Perseus, TLG, or Loeb Classical Library; the system will automatically parse lines, align English translations, reconstruct transliteration, and index vocabulary.
* **Custom Module Persistence**: Imported and generated modules are saved to `localStorage` and can be exported as a JSON package with the synthesized audio embedded as base64.

### 5. 🧠 Flexible AI Provider Architecture (OpenRouter & Gemini)
* **OpenRouter First**: Complete support for OpenRouter across both LLM intelligence (`chat/completions`) and speech synthesis (`/api/v1/audio/speech` using `google/gemini-3.1-flash-tts-preview`, which returns 24 kHz 16-bit PCM).
* **Gemini Native Fallback**: Seamless fallback to native `@google/genai` SDK using `GEMINI_API_KEY` if configured.
* **Live Provider Indicator**: Header status showing the active LLM and TTS models, and a warning when a primary provider is configured with no fallback behind it.

### 6. 📴 Offline Study
* **Downloadable Modules**: Pre-cache every line of a module to IndexedDB for instant, connection-free recitation. Cancellable mid-run, with a report of what succeeded and what failed.
* **Managed Storage**: Usage and quota readout, per-module size breakdown, per-module removal, and a *Keep offline* flag that protects a module from automatic cleanup.
* **Durable by Request**: Persistent storage is requested before the first bulk download, so the browser does not clear downloads under space pressure.
* **Cached Explanations**: Ask AI answers are stored per module and question, so previously-asked questions remain readable offline and are not re-billed.
* **Honest Degradation**: An offline indicator in the header, and network-only actions explain themselves rather than failing silently.

---

## 🛠️ Architecture & Tech Stack

```
├── server.ts                    # Express backend: OpenRouter / Gemini proxy, TTS & phonetics
├── api/
│   └── index.ts                 # Vercel serverless entry point (re-exports the Express app)
├── public/
│   └── sw.js                    # App-shell service worker (registered in production only)
├── src/
│   ├── main.tsx                 # React 19 application root + service worker registration
│   ├── App.tsx                  # Top-level state, active module & view controller
│   ├── types.ts                 # TypeScript definitions; VOICE_NAMES is the single source of truth
│   ├── components/
│   │   ├── Header.tsx           # Navigation, provider status, offline indicator
│   │   ├── DialogueCard.tsx     # Turn-by-turn dialogue & word click handlers
│   │   ├── BookFormatView.tsx   # Critical Stephanus edition book reader
│   │   ├── RoleplayMode.tsx     # Socratic dialogue rehearsal & voice practice
│   │   ├── CustomTTSSection.tsx # Polytonic Greek TTS sandbox
│   │   ├── ModuleImporter.tsx   # AI module generator & raw text importer
│   │   ├── ModuleSelector.tsx   # Library catalogue
│   │   ├── LinguisticNotes.tsx  # Philology, historical context, syntax & Ask AI
│   │   ├── WordGlossModal.tsx   # LSJ morphological breakdown (static data; works offline)
│   │   ├── OfflineStoragePanel.tsx # Storage usage, per-module removal, keep-offline
│   │   └── AudioControls.tsx    # Playback bar, speed, loop, contextual-delivery toggle
│   ├── data/
│   │   └── dialogueData.ts      # Built-in modules + custom-module localStorage helpers
│   └── utils/
│       ├── phoneticConverter.ts # Erasmian / Reconstructed Attic transcription engine
│       ├── audioPlayer.ts       # Web Audio PCM decoder, bounded LRU, word-highlight estimator
│       ├── audioStorage.ts      # IndexedDB audio cache: stats, LRU eviction, persistence
│       ├── explanationCache.ts  # IndexedDB cache for Ask AI answers
│       ├── dialogueTiming.ts    # Inter-line pacing rules
│       ├── offlinePrefs.ts      # Keep-offline flags & cache budget
│       ├── modulePackage.ts     # JSON export/import of modules with embedded audio
│       └── useOnlineStatus.ts   # Connectivity hook
├── tests/                       # node:test suites (npm test)
├── docs/FIX-PLAN.md             # Prioritized defect log and decision record
├── vite.config.ts               # Vite configuration with Tailwind CSS v4
├── vercel.json                  # Vercel build & routing configuration
└── .env.example                 # Environment variable templates
```

---

## 🚀 Getting Started (Local Installation)

### Prerequisites
* **Node.js**: v18.0.0 or higher (Node 20+ recommended)
* **npm**, **pnpm**, or **bun**

### 1. Clone & Install Dependencies
```bash
# Clone the repository
git clone <repository-url>
cd <repository-folder>

# Install dependencies
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to create your `.env` file:
```bash
cp .env.example .env
```

Add your API credentials:
```env
# OpenRouter API key (powers both LLM morphology and Gemini Flash TTS)
OPENROUTER_API_KEY="sk-or-v1-xxxxxxxxxxxxxxxxxxxx"

# Optional: Preferred OpenRouter LLM model for text & morphology
OPENROUTER_MODEL="google/gemini-3.7-flash"

# Optional: TTS model on OpenRouter
OPENROUTER_TTS_MODEL="google/gemini-3.1-flash-tts-preview"

# Strongly recommended: fallback provider used when OpenRouter fails.
# google/gemini-2.0-flash-001 was withdrawn upstream with no notice and took
# every LLM feature down with it; this key is the insurance against a repeat.
GEMINI_API_KEY=""

# Optional: model ids on the Gemini fallback path
GEMINI_MODEL="gemini-3.7-flash"
GEMINI_TTS_MODEL="gemini-3.1-flash-tts-preview"

# Sent as the HTTP-Referer header on OpenRouter requests. Defaults to
# http://localhost:3000 when unset.
APP_URL="http://localhost:3000"
```

> **Note on cost.** `google/gemini-3.7-flash` is a reasoning model: it bills
> reasoning tokens beyond the visible output (roughly 260 tokens / \$0.0005 for a
> three-word translation). `google/gemini-3.1-flash-lite` costs about 44× less
> with no reasoning overhead, at some cost to morphological accuracy.

### 3. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📦 Production Build & Testing

### Build the Project
```bash
npm run build
```
This builds both the client Vite assets (`dist/`) and compiles the standalone backend server (`dist/server.cjs`) using `esbuild`.

### Run the Production Server
```bash
npm run start
```
The server will bind to `0.0.0.0:3000`.

### Run Type Checking & Tests
```bash
npm run lint
```
```bash
npm test
```
`npm test` runs the transcription and pacing suites on Node's built-in test runner via `tsx`. The transcription suite is the regression net for pronunciation: if you change the transcription scheme, those tests are *supposed* to fail — update them in the same commit and say why.

---

## 🚢 Deployment Guide

### Option 1: Deploy to Vercel (One-Click / Git Import)

This repository includes built-in Vercel support with Serverless API routing (`vercel.json` & `api/index.ts`):

1. **Push your code to GitHub / GitLab / Bitbucket**.
2. Go to [Vercel Dashboard](https://vercel.com/new) and click **"Import Project"**.
3. **Framework Preset**: Select **Vite** (or leave as Other).
4. **Build & Output Settings**:
   - **Build Command**: `vite build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`
5. **Environment Variables**:
   Add the following under **Project Settings > Environment Variables**:
   - `OPENROUTER_API_KEY`: Your OpenRouter API Key (e.g. `sk-or-v1-...`)
   - `OPENROUTER_MODEL`: `google/gemini-3.7-flash` (or your preferred LLM)
   - `OPENROUTER_TTS_MODEL`: `google/gemini-3.1-flash-tts-preview`
   - `GEMINI_API_KEY`: *(Optional fallback)*
6. Click **Deploy**. Vercel will serve the static React frontend and route `/api/*` endpoints to the serverless function.

> **`.env` is untracked and does not deploy.** `OPENROUTER_MODEL` must be set in the Vercel project environment, or the deployment falls back to the hardcoded default in `server.ts`.

> **⚠️ Unverified: the `/api/*` rewrite.** `vercel.json` rewrites `/api/(.*)` to `/api`, which resolves to `api/index.ts` exporting the Express app. Express registers its routes at full paths (`/api/tts`, `/api/providers`), so this works only if the function receives the *original* request path rather than the rewrite destination. **Confirm on a preview deployment before relying on it** — `GET /api/health` should return JSON, not the SPA shell. If it does not hold, either mount the router at `/` inside the function or replace the rewrite with filesystem routing (`api/[...path].ts`).

#### Deploy with Vercel CLI:
```bash
# Install Vercel CLI if needed
npm i -g vercel

# Deploy to preview
vercel

# Deploy to production with environment variables
vercel --prod -e OPENROUTER_API_KEY="your-key-here"
```

---

### Option 2: Deploy to Google Cloud Run / Container Platforms

The application is structured for standalone container deployment.

#### Dockerfile (Reference)
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/server.cjs"]
```

#### Deploy via Google Cloud Run CLI:
```bash
gcloud run deploy ancient-greek-tts \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars OPENROUTER_API_KEY="your-key-here"
```

---

## 📜 Polytonic Greek & Erasmian Phonetics Reference

Polytonic Greek is transcribed to Latin characters *before* synthesis, so the TTS engine does not apply Modern Greek phonology. The table below documents what [`phoneticConverter.ts`](src/utils/phoneticConverter.ts) actually emits, verified by [`tests/phoneticConverter.test.ts`](tests/phoneticConverter.test.ts).

| Greek | Emitted | Example | Notes |
| :--- | :--- | :--- | :--- |
| **θ** | `th` | θεός → `theos` | Voiceless aspirated dental stop [tʰ], as in *tin*, not English *thin* |
| **φ** | `ph` | φίλε → `phile` | Voiceless aspirated labial stop [pʰ], as in *pin*, not English *fin* |
| **χ** | `kh` | χάρις → `kharis` | Voiceless aspirated velar stop [kʰ], as in *kin*, not Scottish *loch* |
| **ζ** | `z` | ζωή → `zoheh` | Erasmian classroom value. The Attic [zd] cluster is a *reconstruction*, available under the Reconstructed setting |
| **η** | `eh` | ἡμέρα → `hehmera` | Long open-mid front vowel, distinguished from ε |
| **ω** | `oh` | ἄνθρωπος → `anthrohpos` | Long open-mid back vowel, distinguished from ο |
| **αι** | `ai` | Ἀθῆναι → `Athehnai` | True diphthong [ai] |
| **ει** | `ei` | Εἰς → `Eis` | [eː] / [ei] |
| **οι** | `oi` | Ποῖ → `Poi` | True diphthong [oi] |
| **υι** | `ui` | υἱός → `huios` | Aspirated here — the breathing sits on the iota |
| **αυ** | `au` | αὐτός → `autos` | True diphthong [au] |
| **ευ** | `eu` | εὐθύς → `euthus` | True diphthong [eu] |
| **ου** | `ou` | οὐρανός → `ouranos` | [uː] |
| **῾ (rough breathing)** | `h` prefix | Ἑλλάς → `Hellas` | Word-initial aspiration, including on a diphthong's second element |
| **ῥ** | `hr` | ῥήτωρ → `hrehtohr` | Aspirated initial rho |
| **γγ** | `ng` | ἄγγελος → `angelos` | Gamma nasal |
| **ᾳ ῃ ῳ (iota subscript)** | dropped | λόγῳ → `logoh` | Not represented in the output |

### ⚠️ Open question: transcription vs. respelling

The scheme above is **scholarly transliteration**. An earlier version of this document described a different, **English-respelling** scheme (`t_h`, `eye`, `ey`, `oy`, `ow`, `eh-oo`) that the code has never implemented.

This is not merely a documentation discrepancy. The output is read aloud by a TTS model, and an English-speaking voice may give `ai`, `ei`, and `oi` English vowel values rather than the Greek ones — which is exactly what the respelling scheme was trying to force. Which approach actually sounds more authentically Erasmian is an empirical question that needs listening, not a doc edit. Tracked as **P2-4** in [docs/FIX-PLAN.md](docs/FIX-PLAN.md).

### ⚠️ Word highlighting is an estimate

Word-by-word highlighting distributes each clip's duration across its words by character count, vowel count, and punctuation. **Nothing in it is derived from the audio.** Error accumulates left to right, so the final words of a long line drift out of step. True synchronization needs word-level timestamps from the TTS provider, which the current speech endpoint does not return. Tracked as **P1-4**.

---

## 📄 License
This project is open-source and available under the **MIT License**.
