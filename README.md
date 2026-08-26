# 🏛️ Classical & Ancient Greek Philology & Dialogue TTS System

An interactive philological reader, dialogue player, and pedagogical study workstation for Classical Ancient Greek (Attic, Koine, Homeric, and Aesopic). The application features **Reconstructed Attic & Erasmian Text-to-Speech (TTS)** powered by **Gemini 3.1 Flash TTS** (accessible directly or via **OpenRouter**), complete grammatical and morphological analysis (Liddell-Scott-Jones standard), Stephanus/Bekker citation apparatus, interactive Socratic roleplay, and an AI-powered module generator and importer.

---

## 🌟 Key Features

### 1. 🎙️ Reconstructed Attic & Erasmian TTS Engine
* **Authentic Classical Pronunciation**: Automatically transforms polytonic Greek into an exact Latin-phonetic IPA/Erasmian transposition before synthesis, preventing modern Greek phonological shifts (e.g. distinguishing aspirated stops $\theta, \phi, \chi$, diphthongs $\alpha\iota, \epsilon\iota, o\iota, \alpha\upsilon, \epsilon\upsilon$, and rough breathing $h-$).
* **Multi-Voice Cast**: Rich pre-built voice characters (`Fenrir`, `Puck`, `Kore`, `Charon`, `Zephyr`, `Aoede`) mapped to philosophical persona archetypes (e.g., Socrates, Plato, Chaerephon, Alexander, Aesopic narrators).
* **Multi-Speaker Dialogue Synthesis**: Seamless dual-speaker audio generation with natural conversational cadence, dramatic pacing, and rhetorical pauses.
* **Granular Playback Controls**: Line-by-line playback, word-by-word synchronized audio highlighting, variable speeds ($0.75\times$, $0.85\times$, $1.0\times$, $1.25\times$), and raw audio WAV/MP3 export.

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
* **Custom Module Persistence**: Imported and generated modules are saved locally and can be exported as JSON or shared.

### 5. 🧠 Flexible AI Provider Architecture (OpenRouter & Gemini)
* **OpenRouter First**: Complete support for OpenRouter across both LLM intelligence (`chat/completions`) and speech synthesis (`/api/v1/audio/speech` using `google/gemini-3.1-flash-tts-preview`).
* **Gemini Native Fallback**: Seamless fallback to native `@google/genai` SDK using `GEMINI_API_KEY` if configured.
* **Live Provider Indicator**: Real-time status in the header showing active LLM engines and TTS pipelines.

---

## 🛠️ Architecture & Tech Stack

```
├── server.ts                    # Express backend: OpenRouter / Gemini API proxy, TTS & Phonetics
├── src/
│   ├── main.tsx                 # React 19 application root
│   ├── App.tsx                  # Top-level state, active module & view controller
│   ├── types.ts                 # Full TypeScript definitions for modules, words, commentary
│   ├── components/
│   │   ├── Header.tsx           # Navigation bar with live provider status
│   │   ├── DialogueCard.tsx     # Turn-by-turn dialogue & word click handlers
│   │   ├── BookFormatView.tsx   # Critical Stephanus edition book reader
│   │   ├── RoleplayMode.tsx     # Socratic dialogue rehearsal & voice practice
│   │   ├── CustomTTSSection.tsx # Polytonic Greek TTS sandbox & audio generator
│   │   ├── ModuleImporter.tsx   # AI module generator & raw text importer
│   │   ├── ModuleSelector.tsx   # Library catalogue (Socratic, Aesopic, Aristotelian)
│   │   ├── LinguisticNotes.tsx  # Philology, historical context & syntax viewer
│   │   ├── WordGlossModal.tsx   # LSJ morphological word breakdown modal
│   │   └── AudioControls.tsx    # Universal playback bar & speed adjustments
│   ├── data/
│   │   └── modules.ts           # Curated built-in Classical Greek modules
│   └── utils/
│       ├── audioPlayer.ts       # Web Audio API PCM decoder & MP3 streaming player
│       └── phonetics.ts         # Erasmian / Reconstructed Attic phonological engine
├── vite.config.ts               # Vite configuration with Tailwind CSS v4
├── package.json                 # Dependencies and build scripts
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

# Optional: Direct Gemini API key (fallback)
GEMINI_API_KEY=""

# Application URL
APP_URL="http://localhost:3000"
```

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

### Run Type Checking & Linting
```bash
npm run lint
```

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

| Greek Letter / Diphthong | Erasmian / Reconstructed Phonetic Transposition | Pronunciation Notes |
| :--- | :--- | :--- |
| **θ (Theta)** | `t_h` / [tʰ] | Voiceless aspirated dental stop (as in *tin*, not English *thin*) |
| **φ (Phi)** | `p_h` / [pʰ] | Voiceless aspirated labial stop (as in *pin*, not English *fin*) |
| **χ (Chi)** | `k_h` / [kʰ] | Voiceless aspirated velar stop (as in *kin*, not Scottish *loch*) |
| **ζ (Zeta)** | `zd` / [zd] | Voiced alveolar fricative + stop cluster |
| **αι (ai)** | `eye` / [ai] | True diphthong as in *aisle* |
| **ει (ei)** | `ey` / [eː] | Close-mid front unrounded long vowel |
| **οι (oi)** | `oy` / [oi] | True diphthong as in *boy* |
| **αυ (au)** | `ow` / [au] | True diphthong as in *cow* |
| **ευ (eu)** | `eh-oo` / [eu] | True diphthong with distinct glide |
| **῾ (Rough Breathing)** | `h-` / [h] | Voiceless glottal fricative aspiration |

---

## 📄 License
This project is open-source and available under the **MIT License**.
