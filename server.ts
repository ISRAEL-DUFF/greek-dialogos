import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { convertToReconstructedPhonetics } from "./src/utils/phoneticConverter";
import { VOICE_NAMES, VoiceName } from "./src/types";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

/**
 * Model configuration.
 *
 * Every model id used anywhere in this file resolves through this object.
 * They were previously inlined at ~20 call sites, which is how
 * `google/gemini-2.0-flash-001` survived being decommissioned upstream: it was
 * dead in five places at once and no single request reported which id it used.
 * Each is env-overridable so a withdrawal is a config change, not a deploy.
 */
const MODELS = {
  openrouterLlm: process.env.OPENROUTER_MODEL || "google/gemini-3.7-flash",
  openrouterTts: process.env.OPENROUTER_TTS_MODEL || "google/gemini-3.1-flash-tts-preview",
  geminiLlm: process.env.GEMINI_MODEL || "gemini-3.7-flash",
  geminiTts: process.env.GEMINI_TTS_MODEL || "gemini-3.1-flash-tts-preview",
} as const;

/**
 * Validate an incoming `voice` value against the six supported voices.
 *
 * The upstream API answers an unknown voice with an opaque HTTP 500, so an
 * invalid value — a client typo, or a voice hallucinated by the module
 * generator — surfaces as an unexplained server error. Reject it here instead.
 * Matching is case-insensitive; the canonical capitalization is returned.
 */
function resolveVoice(input: unknown): VoiceName | null {
  if (typeof input !== "string") return null;
  const match = VOICE_NAMES.find((v) => v.toLowerCase() === input.trim().toLowerCase());
  return match ?? null;
}

const INVALID_VOICE_ERROR = `Unknown voice. Valid voices are: ${VOICE_NAMES.join(", ")}.`;

const DEFAULT_VOICE: VoiceName = "Fenrir";

// Provider configuration checks
const isOpenRouterConfigured = () => Boolean(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim().length > 0);
const isGeminiConfigured = () => Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);

// Initialize Gemini Client
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is missing");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
};

/**
 * OpenRouter Audio Speech (TTS) call. Model id resolves via MODELS.openrouterTts.
 */
async function callOpenRouterTTS({
  text,
  voice = "Fenrir",
}: {
  text: string;
  voice?: string;
}): Promise<{ audioBase64: string; mimeType: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY environment variable is missing");
  }

  const model = MODELS.openrouterTts;

  const response = await fetch("https://openrouter.ai/api/v1/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
      "X-Title": "Classical Greek Philology Study System",
    },
    body: JSON.stringify({
      model,
      input: text,
      voice: voice.toLowerCase(),
      response_format: "pcm",
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter TTS error (${response.status}): ${errText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const audioBase64 = buffer.toString("base64");
  const contentType = response.headers.get("content-type") || "audio/mp3";

  return { audioBase64, mimeType: contentType };
}

/**
 * OpenRouter Chat Completion API call
 */
async function callOpenRouter({
  systemInstruction,
  userPrompt,
  jsonMode = false,
  model = MODELS.openrouterLlm,
}: {
  systemInstruction?: string;
  userPrompt: string;
  jsonMode?: boolean;
  model?: string;
}): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY environment variable is missing");
  }

  const messages: Array<{ role: string; content: string }> = [];
  if (systemInstruction) {
    messages.push({ role: "system", content: systemInstruction });
  }
  messages.push({ role: "user", content: userPrompt });

  const bodyPayload: any = {
    model,
    messages,
    temperature: 0.3,
  };

  if (jsonMode) {
    bodyPayload.response_format = { type: "json_object" };
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
      "X-Title": "Classical Greek Philology Study System",
    },
    body: JSON.stringify(bodyPayload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
  }

  const jsonResult = await response.json();
  const content = jsonResult.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("No response generated by OpenRouter");
  }

  return content;
}

/**
 * Unified text generation helper: prefers OpenRouter if OPENROUTER_API_KEY is configured,
 * otherwise falls back to Gemini.
 */
async function generateLlmText(systemInstruction: string, userPrompt: string): Promise<{ text: string; provider: string }> {
  if (isOpenRouterConfigured()) {
    try {
      const text = await callOpenRouter({ systemInstruction, userPrompt });
      return { text, provider: `OpenRouter (${MODELS.openrouterLlm})` };
    } catch (err: any) {
      console.warn("OpenRouter failed, attempting fallback to Gemini if available:", err?.message);
      if (!isGeminiConfigured()) {
        throw err;
      }
    }
  }

  if (isGeminiConfigured()) {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: MODELS.geminiLlm,
      contents: userPrompt,
      config: {
        systemInstruction,
      },
    });
    return { text: response.text || "", provider: `Gemini (${MODELS.geminiLlm})` };
  }

  throw new Error("Neither OPENROUTER_API_KEY nor GEMINI_API_KEY is configured in the environment settings.");
}

/**
 * Phonetic layout transformation endpoint
 */
app.post("/api/phonetic-transcribe", (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }
    const phoneticText = convertToReconstructedPhonetics(text);
    res.json({ original: text, phoneticText });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Transcribe failed" });
  }
});

// Single speaker TTS endpoint with Reconstructed Attic/Erasmian pronunciation
app.post("/api/tts", async (req, res) => {
  try {
    const { text, voice: rawVoice = "Fenrir", speakerName, emotion } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    const voice = resolveVoice(rawVoice);
    if (!voice) {
      return res.status(400).json({ error: INVALID_VOICE_ERROR, received: rawVoice });
    }

    // Transform incoming Greek text into customized Latin-character phonetic string
    // to force the TTS engine to bypass Modern Greek phonology and output Reconstructed Attic / Erasmian pronunciation.
    const phoneticText = convertToReconstructedPhonetics(text);

    // Spoken prompt tuned specifically for Reconstructed Attic pronunciation
    const spokenPrompt = emotion 
      ? `Speak with authentic Reconstructed Attic/Erasmian Ancient Greek pronunciation (${emotion}): ${phoneticText}`
      : `Speak with authentic Reconstructed Attic/Erasmian Ancient Greek pronunciation: ${phoneticText}`;

    // 1. OpenRouter TTS if OPENROUTER_API_KEY is configured
    if (isOpenRouterConfigured()) {
      try {
        const { audioBase64, mimeType } = await callOpenRouterTTS({
          text: spokenPrompt,
          voice,
        });

        return res.json({
          audio: audioBase64,
          mimeType,
          voice,
          text,
          phoneticText,
          provider: `OpenRouter (${MODELS.openrouterTts})`,
          pronunciation: "Reconstructed Attic/Erasmian",
        });
      } catch (openRouterErr: any) {
        console.warn("OpenRouter TTS failed, attempting fallback to Gemini if available:", openRouterErr?.message);
        if (!isGeminiConfigured()) {
          throw openRouterErr;
        }
      }
    }

    // 2. Fallback to Gemini SDK
    if (isGeminiConfigured()) {
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: MODELS.geminiTts,
        contents: [{ parts: [{ text: spokenPrompt }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice },
            },
          },
        },
      });

      const candidate = response.candidates?.[0];
      const part = candidate?.content?.parts?.[0];
      const audioData = part?.inlineData?.data;
      const mimeType = part?.inlineData?.mimeType || "audio/pcm;rate=24000";

      if (!audioData) {
        return res.status(500).json({ error: "No audio was generated by the model" });
      }

      return res.json({
        audio: audioData,
        mimeType,
        voice,
        text,
        phoneticText,
        provider: `Gemini TTS (${MODELS.geminiTts})`,
        pronunciation: "Reconstructed Attic/Erasmian",
      });
    }

    return res.status(503).json({
      error: "Speech synthesis is unavailable: no API key is configured. Set OPENROUTER_API_KEY (or GEMINI_API_KEY as a fallback) in your environment.",
      ttsModel: MODELS.openrouterTts,
      openrouterConfigured: isOpenRouterConfigured(),
      fallbackConfigured: isGeminiConfigured(),
    });
  } catch (error: any) {
    console.error("TTS generation error:", error);
    // Name the model and the fallback state: a model withdrawn upstream is
    // otherwise indistinguishable from a network blip in the client UI.
    res.status(502).json({
      error: error?.message || "Failed to generate speech audio",
      ttsModel: MODELS.openrouterTts,
      fallbackConfigured: isGeminiConfigured(),
      hint: isGeminiConfigured()
        ? undefined
        : "No fallback provider is configured. Set GEMINI_API_KEY so speech survives an OpenRouter outage or model withdrawal.",
    });
  }
});

// NOTE: /api/tts-dialogue (multi-speaker scene synthesis) was removed here.
// It had no caller, and it normalized every speaker to "Socrates" or
// "Alexander", so it could not serve the 3-speaker Aesop module at all.
// Rebuilding it was considered and rejected: Gemini's multiSpeakerVoiceConfig
// caps at two voices, and a single merged audio blob gives up per-line word
// highlighting, per-line caching, and single-line replay. Per-line playback
// already assigns a distinct voice per speaker with no speaker cap.
// See docs/FIX-PLAN.md, decisions D2/D4/D7 and item P1-1.

// Helper to extract JSON from text that might be wrapped in code fences
function parseJsonFromLlm(text: string): any {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      return JSON.parse(jsonMatch[1]);
    }
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    }
    throw new Error("Could not parse valid JSON from AI response.");
  }
}

// AI Module Import & Generation endpoint
app.post("/api/ai-import-module", async (req, res) => {
  try {
    const { rawText, prompt, topicPrompt, genre = "dialogue", difficulty = "Intermediate", titleHint } = req.body;
    const effectivePrompt = prompt || topicPrompt;

    if (!rawText && !effectivePrompt) {
      return res.status(400).json({ error: "Either rawText or prompt is required to generate a module" });
    }

    const systemInstruction = "You are a master Hellenist scholar, philologist, and Ancient Greek educator. You specialize in Classical Attic Greek, Aesopic fables, and Socratic dialogues. You produce impeccably accurate polytonic Greek texts, precise morphological parsing (Liddell-Scott-Jones standard), and rich pedagogical insights. ALWAYS return your output as a valid JSON object matching the requested schema.";

    let userInstruction = "";
    if (rawText) {
      userInstruction = `Analyze and transform the following raw Ancient Greek text into a complete, structured pedagogical study module.
RAW ANCIENT GREEK TEXT:
"""
${rawText}
"""
Instructions:
1. Normalize and verify accurate polytonic Greek orthography (correct breathing marks, accents, iota subscripts).
2. Segment the text logically into dialogue turns or sequential narrative sentences (aim for 4 to 10 sequential lines).
3. If it is a dialogue, identify the distinct speakers (or assign appropriate dramatic characters). If narrative/prose/fable, use "Διηγητής" ("Narrator") and character dialogue lines.
4. For EVERY single word in every line, provide exhaustive morphological glossing (root lemma, part of speech, contextual meaning, exact grammatical parsing).
5. Provide accurate Reconstructed Attic transliterations, natural English translations, and equivalent Modern Greek translations (Νέα Ελληνικά).
6. Provide a comprehensive commentary object including:
   - historicalContext (period, historicalSetting, authorialBackground, culturalSignificance, stephanusOrBekkerNote)
   - grammaticalSyntax (array of 3-5 key syntax points with title, greekExample, transliteration, explanation)
   - philologicalNotes (array of 3-5 philological notes with citation, greekTerm, commentary, rhetoricalDevice)
   - dialectNotes (overview of dialectal peculiarities, phonological contractions, etc.)
7. Difficulty: ${difficulty}. Genre: ${genre}.

Return a JSON object with this structure:
{
  "id": "module-custom",
  "title": "Greek title",
  "titleEn": "English title",
  "author": "Author or origin",
  "genre": "${genre}",
  "difficulty": "${difficulty}",
  "stephanusRef": "Stephanus or standard citation ref",
  "description": "Pedagogical overview",
  "speakers": [
    { "name": "Greek Name", "nameEn": "English Name", "role": "Role description", "defaultVoice": "Fenrir" }
  ],
  "lines": [
    {
      "id": 1,
      "speaker": "Greek speaker",
      "speakerEn": "English speaker",
      "greekText": "Ancient Greek sentence with polytonic accents",
      "transliteration": "Reconstructed Attic transliteration",
      "englishTranslation": "Natural English translation",
      "modernGreekTranslation": "Modern Greek translation",
      "recommendedVoice": "Fenrir",
      "words": [
        {
          "greek": "word",
          "transliteration": "transliteration",
          "partOfSpeech": "Noun (Masc. Nom.)",
          "root": "lemma",
          "meaning": "contextual English meaning",
          "grammarDetails": "exact parsing details"
        }
      ]
    }
  ],
  "commentary": {
    "historicalContext": {
      "period": "Period",
      "historicalSetting": "Setting",
      "authorialBackground": "Author background",
      "culturalSignificance": "Significance",
      "stephanusOrBekkerNote": "Citation apparatus"
    },
    "grammaticalSyntax": [
      { "title": "Syntax point", "greekExample": "Greek snippet", "transliteration": "Latin", "explanation": "Grammar rule" }
    ],
    "philologicalNotes": [
      { "citation": "Line ref", "greekTerm": "term", "commentary": "note", "rhetoricalDevice": "device" }
    ],
    "dialectNotes": "Dialect summary"
  }
}`;
    } else {
      userInstruction = `Create an authentic, historically and linguistically rigorous Classical Ancient Greek study module based on this request:
TOPIC / PROMPT: "${effectivePrompt}"
${titleHint ? `TITLE HINT: ${titleHint}` : ""}
Instructions:
1. Compose an engaging, authentic Classical Attic Greek text (fable, Socratic dialogue, historical narrative, philosophical discourse, or everyday conversational exchange) with 5 to 8 sequential lines.
2. Use accurate polytonic Greek spelling (breathings, acute/circumflex accents, iota subscripts).
3. Provide distinct named speakers with distinct voices assigned from: Fenrir, Puck, Kore, Charon, Zephyr, Aoede.
4. For EVERY single word in every line, provide exhaustive morphological breakdown (root lemma, part of speech, contextual meaning, exact grammatical parsing).
5. Provide Reconstructed Attic transliterations, natural English translations, and Modern Greek translations (Νέα Ελληνικά).
6. Provide a comprehensive commentary object including:
   - historicalContext (period, historicalSetting, authorialBackground, culturalSignificance, stephanusOrBekkerNote)
   - grammaticalSyntax (array of 3-5 key syntax points with title, greekExample, transliteration, explanation)
   - philologicalNotes (array of 3-5 philological notes with citation, greekTerm, commentary, rhetoricalDevice)
   - dialectNotes (overview of dialectal peculiarities, contractions, particle usage)
7. Difficulty: ${difficulty}. Genre: ${genre}.

Return a JSON object with this structure:
{
  "id": "module-custom",
  "title": "Greek title",
  "titleEn": "English title",
  "author": "Author or origin",
  "genre": "${genre}",
  "difficulty": "${difficulty}",
  "stephanusRef": "Stephanus or standard citation ref",
  "description": "Pedagogical overview",
  "speakers": [
    { "name": "Greek Name", "nameEn": "English Name", "role": "Role description", "defaultVoice": "Fenrir" }
  ],
  "lines": [
    {
      "id": 1,
      "speaker": "Greek speaker",
      "speakerEn": "English speaker",
      "greekText": "Ancient Greek sentence with polytonic accents",
      "transliteration": "Reconstructed Attic transliteration",
      "englishTranslation": "Natural English translation",
      "modernGreekTranslation": "Modern Greek translation",
      "recommendedVoice": "Fenrir",
      "words": [
        {
          "greek": "word",
          "transliteration": "transliteration",
          "partOfSpeech": "Noun (Masc. Nom.)",
          "root": "lemma",
          "meaning": "contextual English meaning",
          "grammarDetails": "exact parsing details"
        }
      ]
    }
  ],
  "commentary": {
    "historicalContext": {
      "period": "Period",
      "historicalSetting": "Setting",
      "authorialBackground": "Author background",
      "culturalSignificance": "Significance",
      "stephanusOrBekkerNote": "Citation apparatus"
    },
    "grammaticalSyntax": [
      { "title": "Syntax point", "greekExample": "Greek snippet", "transliteration": "Latin", "explanation": "Grammar rule" }
    ],
    "philologicalNotes": [
      { "citation": "Line ref", "greekTerm": "term", "commentary": "note", "rhetoricalDevice": "device" }
    ],
    "dialectNotes": "Dialect summary"
  }
}`;
    }

    let parsedModule: any = null;
    let providerName = "";

    // 1. If OpenRouter is available, execute via OpenRouter
    if (isOpenRouterConfigured()) {
      try {
        const rawJsonText = await callOpenRouter({
          systemInstruction,
          userPrompt: userInstruction,
          jsonMode: true,
        });
        parsedModule = parseJsonFromLlm(rawJsonText);
        providerName = `OpenRouter (${MODELS.openrouterLlm})`;
      } catch (openRouterErr: any) {
        console.warn("OpenRouter execution encountered an error, trying Gemini fallback:", openRouterErr?.message);
        if (!isGeminiConfigured()) {
          throw openRouterErr;
        }
      }
    }

    // 2. Fallback or primary to Gemini if not yet parsed
    if (!parsedModule && isGeminiConfigured()) {
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: MODELS.geminiLlm,
        contents: userInstruction,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              title: { type: Type.STRING, description: "Polytonic Ancient Greek title" },
              titleEn: { type: Type.STRING, description: "English title" },
              author: { type: Type.STRING, description: "Author or historical origin" },
              genre: { type: Type.STRING, description: "dialogue | fable | philosophy | narrative | epic | history" },
              difficulty: { type: Type.STRING, description: "Beginner | Intermediate | Advanced" },
              stephanusRef: { type: Type.STRING, description: "Stephanus or standard citation ref" },
              description: { type: Type.STRING, description: "Brief English overview and historical/pedagogical context" },
              speakers: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: "Greek speaker name, or Διηγητής" },
                    nameEn: { type: Type.STRING, description: "English speaker name" },
                    role: { type: Type.STRING, description: "Character role or identity" },
                    defaultVoice: { type: Type.STRING, description: "Fenrir | Puck | Kore | Charon | Zephyr | Aoede" },
                  },
                  required: ["name", "nameEn", "defaultVoice"],
                },
              },
              lines: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.INTEGER },
                    speaker: { type: Type.STRING, description: "Greek speaker name" },
                    speakerEn: { type: Type.STRING, description: "English speaker name" },
                    speakerRole: { type: Type.STRING },
                    greekText: { type: Type.STRING, description: "Polytonic Ancient Greek sentence/turn" },
                    transliteration: { type: Type.STRING, description: "Reconstructed Attic phonetic transliteration" },
                    englishTranslation: { type: Type.STRING, description: "Idiomatic English translation" },
                    modernGreekTranslation: { type: Type.STRING, description: "Modern Greek translation" },
                    recommendedVoice: { type: Type.STRING, description: "Fenrir | Puck | Kore | Charon | Zephyr | Aoede" },
                    contextNote: { type: Type.STRING, description: "Grammatical or rhetorical note" },
                    words: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          greek: { type: Type.STRING, description: "Individual Greek word" },
                          transliteration: { type: Type.STRING },
                          partOfSpeech: { type: Type.STRING, description: "e.g. Noun (Masc. Nom.), Verb (Pres. Act.), Conjunction" },
                          root: { type: Type.STRING, description: "Dictionary lemma in Greek" },
                          meaning: { type: Type.STRING, description: "Contextual English meaning" },
                          grammarDetails: { type: Type.STRING, description: "Full case, tense, mood, gender parsing" },
                        },
                        required: ["greek", "transliteration", "partOfSpeech", "root", "meaning", "grammarDetails"],
                      },
                    },
                  },
                  required: ["id", "speaker", "speakerEn", "greekText", "transliteration", "englishTranslation", "modernGreekTranslation", "words"],
                },
              },
              commentary: {
                type: Type.OBJECT,
                properties: {
                  historicalContext: {
                    type: Type.OBJECT,
                    properties: {
                      period: { type: Type.STRING },
                      historicalSetting: { type: Type.STRING },
                      authorialBackground: { type: Type.STRING },
                      culturalSignificance: { type: Type.STRING },
                      stephanusOrBekkerNote: { type: Type.STRING },
                    },
                    required: ["period", "historicalSetting", "authorialBackground", "culturalSignificance"],
                  },
                  grammaticalSyntax: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        title: { type: Type.STRING },
                        greekExample: { type: Type.STRING },
                        transliteration: { type: Type.STRING },
                        explanation: { type: Type.STRING },
                      },
                      required: ["title", "greekExample", "explanation"],
                    },
                  },
                  philologicalNotes: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        citation: { type: Type.STRING },
                        greekTerm: { type: Type.STRING },
                        commentary: { type: Type.STRING },
                        rhetoricalDevice: { type: Type.STRING },
                      },
                      required: ["greekTerm", "commentary"],
                    },
                  },
                  dialectNotes: { type: Type.STRING },
                },
              },
            },
            required: ["id", "title", "titleEn", "genre", "difficulty", "description", "speakers", "lines"],
          },
        },
      });

      parsedModule = JSON.parse(response.text || "{}");
      providerName = `Gemini (${MODELS.geminiLlm})`;
    }

    if (!parsedModule) {
      throw new Error("Neither OPENROUTER_API_KEY nor GEMINI_API_KEY is available for module generation.");
    }
    
    // Ensure unique ID and flags
    if (!parsedModule.id || parsedModule.id === "string" || parsedModule.id === "module-custom") {
      parsedModule.id = "module-" + Date.now();
    }
    parsedModule.isCustom = true;
    parsedModule.createdAt = new Date().toISOString();

    // Verify lines and IDs, and sanitize any voice the model invented.
    // An unrecognized voice is persisted to localStorage and then fails at
    // synthesis time with an opaque upstream 500, far from its cause.
    const invalidVoices = new Set<string>();

    if (Array.isArray(parsedModule.lines)) {
      parsedModule.lines = parsedModule.lines.map((line: any, idx: number) => {
        const resolved = line.recommendedVoice ? resolveVoice(line.recommendedVoice) : null;
        if (line.recommendedVoice && !resolved) invalidVoices.add(String(line.recommendedVoice));
        return {
          ...line,
          id: typeof line.id === "number" ? line.id : idx + 1,
          recommendedVoice: resolved ?? DEFAULT_VOICE,
        };
      });
    }

    if (Array.isArray(parsedModule.speakers)) {
      parsedModule.speakers = parsedModule.speakers.map((speaker: any) => {
        const resolved = speaker.defaultVoice ? resolveVoice(speaker.defaultVoice) : null;
        if (speaker.defaultVoice && !resolved) invalidVoices.add(String(speaker.defaultVoice));
        return { ...speaker, defaultVoice: resolved ?? DEFAULT_VOICE };
      });
    }

    if (invalidVoices.size > 0) {
      console.warn(
        `AI module import: replaced unsupported voice(s) [${[...invalidVoices].join(", ")}] with ${DEFAULT_VOICE}.`
      );
    }

    res.json({
      success: true,
      provider: providerName,
      module: parsedModule,
      ...(invalidVoices.size > 0
        ? { warnings: [`Unsupported voice(s) ${[...invalidVoices].join(", ")} were replaced with ${DEFAULT_VOICE}.`] }
        : {}),
    });
  } catch (error: any) {
    console.error("AI Import Module error:", error);
    res.status(500).json({ error: error?.message || "Failed to generate study module" });
  }
});

// Linguistic Insights & Custom Greek Translation endpoint
app.post("/api/gemini/explain", async (req, res) => {
  try {
    const { phrase } = req.body;
    if (!phrase) {
      return res.status(400).json({ error: "Phrase is required" });
    }

    const systemInstruction = "You are a master Hellenist scholar and Classical Greek philologist. Provide concise, clear, and academically rigorous linguistic and cultural analyses.";
    const userPrompt = `Provide an informative, concise linguistic and cultural breakdown of this Ancient Greek passage/phrase: "${phrase}".
Include:
1. Exact English Translation
2. Modern Greek translation (Νέα Ελληνικά)
3. Word-by-word grammatical gloss (root, case/tense/mood)
4. Cultural & philosophical context in Classical Athens`;

    const result = await generateLlmText(systemInstruction, userPrompt);

    res.json({
      text: result.text,
      provider: result.provider,
    });
  } catch (error: any) {
    console.error("Explanation error:", error);
    res.status(500).json({ error: error?.message || "Failed to generate explanation" });
  }
});

// Provider status & configuration endpoint
app.get("/api/providers", (req, res) => {
  const openrouter = isOpenRouterConfigured();
  const gemini = isGeminiConfigured();

  let activeLlm = "none";
  let ttsProvider = "None";

  if (openrouter) {
    activeLlm = `OpenRouter (${MODELS.openrouterLlm})`;
    ttsProvider = `OpenRouter (${MODELS.openrouterTts})`;
  } else if (gemini) {
    activeLlm = `Gemini (${MODELS.geminiLlm})`;
    ttsProvider = `Gemini TTS (${MODELS.geminiTts})`;
  }

  res.json({
    openrouter,
    gemini,
    activeLlm,
    openrouterModel: MODELS.openrouterLlm,
    openrouterTtsModel: MODELS.openrouterTts,
    ttsProvider,
    // A configured primary with no fallback is the state that took this app
    // down when `gemini-2.0-flash-001` was withdrawn. Surface it so the header
    // can warn rather than showing an unqualified green light.
    fallbackConfigured: gemini,
    degraded: openrouter && !gemini,
  });
});

// Health check
app.get("/api/health", (req, res) => {
  const openrouter = isOpenRouterConfigured();
  const gemini = isGeminiConfigured();

  res.json({
    status: openrouter || gemini ? "ok" : "unconfigured",
    openrouterConfigured: openrouter,
    geminiConfigured: gemini,
    fallbackConfigured: gemini,
    // Every model id the process will actually use. Reported so a model
    // withdrawal is diagnosable in one request instead of by reading source.
    // Note these are the *configured* ids, not proof they still resolve
    // upstream — the TTS model does not appear in OpenRouter's /models
    // listing, so availability can only be confirmed by a real call.
    models: MODELS,
    ttsModel: MODELS.openrouterTts,
  });
});

export { app };

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

// Only start the standalone HTTP listener if not running as a Vercel serverless function
if (!process.env.VERCEL) {
  startServer();
}

export default app;

