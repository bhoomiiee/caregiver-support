/**
 * AI Service — Multi-provider with automatic fallback
 *
 * STT  (Speech-to-Text):   Groq Whisper  →  OpenAI Whisper
 * Chat (Conversation):     Groq LLaMA    →  Gemini Flash  →  OpenAI GPT-4o
 * Emotion/Sentiment:       Groq LLaMA    →  Gemini Flash  →  OpenAI GPT-4o
 * TTS  (Text-to-Speech):   OpenAI TTS    →  Browser Web Speech (client-side fallback)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// ── Provider clients (lazy-initialized only if key is present) ──────────────

function getGroq() {
  if (!process.env.GROQ_API_KEY) return null;
  const Groq = require('groq-sdk');
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

function getGemini() {
  if (!process.env.GEMINI_API_KEY) return null;
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) return null;
  const OpenAI = require('openai');
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// ── Utility ──────────────────────────────────────────────────────────────────

function writeTmp(buffer, filename) {
  const tmpPath = path.join(os.tmpdir(), `${Date.now()}_${filename}`);
  fs.writeFileSync(tmpPath, buffer);
  return tmpPath;
}

function cleanTmp(tmpPath) {
  try { fs.unlinkSync(tmpPath); } catch {}
}

/**
 * Run providers in order, returning the first successful result.
 * @param {Array<() => Promise<any>>} providers
 * @param {string} label - for logging
 */
async function withFallback(providers, label) {
  let lastError;
  for (const fn of providers) {
    try {
      return await fn();
    } catch (err) {
      console.warn(`[AI:${label}] provider failed: ${err.message}`);
      lastError = err;
    }
  }
  throw new Error(`[AI:${label}] All providers failed. Last error: ${lastError?.message}`);
}

// ── Speech-to-Text ────────────────────────────────────────────────────────────
// Primary: Groq Whisper (whisper-large-v3) — fast, generous free tier
// Fallback: OpenAI Whisper-1

async function transcribeAudio(audioBuffer, filename = 'audio.webm') {
  const tmpPath = writeTmp(audioBuffer, filename);

  try {
    return await withFallback([
      // 1. Groq Whisper
      async () => {
        const groq = getGroq();
        if (!groq) throw new Error('No GROQ_API_KEY');
        const transcription = await groq.audio.transcriptions.create({
          file: fs.createReadStream(tmpPath),
          model: 'whisper-large-v3',
          response_format: 'text',
        });
        return typeof transcription === 'string' ? transcription : transcription.text;
      },
      // 2. OpenAI Whisper
      async () => {
        const openai = getOpenAI();
        if (!openai) throw new Error('No OPENAI_API_KEY');
        const transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(tmpPath),
          model: 'whisper-1',
        });
        return transcription.text;
      },
    ], 'STT');
  } finally {
    cleanTmp(tmpPath);
  }
}

// ── Chat / Conversation ───────────────────────────────────────────────────────
// Primary: Groq (llama-3.3-70b-versatile) — very fast inference
// Fallback 1: Gemini 1.5 Flash
// Fallback 2: OpenAI GPT-4o

const COMPANION_SYSTEM_PROMPT = (language = 'en') => {
  const langInstruction = language !== 'en'
    ? `\n\nIMPORTANT: You MUST respond ONLY in ${LANGUAGE_NAMES[language] || language}. Do not use English unless the user speaks English to you.`
    : '';
  return `You are a warm, empathetic AI companion specifically designed to support caregivers — people who dedicate their lives to caring for others. Your role is to:

- Listen deeply and respond with genuine empathy and compassion
- Provide emotional support, encouragement, and validation
- Gently encourage self-care, rest, and mental wellness
- Never be dismissive of their feelings or struggles
- Keep responses conversational, warm, and concise (2-4 sentences max for voice)
- Never mention burnout scores, risk levels, or clinical assessments
- If the user seems distressed, respond with extra care and gentleness
- Occasionally (not every message) gently remind them to drink water, take a short break, breathe deeply, or do something kind for themselves
- If they mention being tired, suggest rest. If they mention stress, suggest a breathing moment.

Remember: You are their safe space. Make them feel heard and valued.${langInstruction}`;
};

const LANGUAGE_NAMES = {
  en: 'English', hi: 'Hindi', es: 'Spanish', fr: 'French',
  ar: 'Arabic', zh: 'Chinese', de: 'German', pt: 'Portuguese',
  ta: 'Tamil', te: 'Telugu', kn: 'Kannada', ml: 'Malayalam',
  bn: 'Bengali', mr: 'Marathi', ur: 'Urdu', ja: 'Japanese',
};

async function generateResponse(conversationHistory, emotionContext = {}, language = 'en') {
  const systemContent = `${COMPANION_SYSTEM_PROMPT(language)}\n\nCurrent emotional context: ${JSON.stringify(emotionContext)}`;

  return withFallback([
    // 1. Groq — LLaMA 3.3 70B
    async () => {
      const groq = getGroq();
      if (!groq) throw new Error('No GROQ_API_KEY');
      const res = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemContent },
          ...conversationHistory,
        ],
        max_tokens: 200,
        temperature: 0.8,
      });
      return res.choices[0].message.content;
    },
    // 2. Gemini 1.5 Flash
    async () => {
      const genAI = getGemini();
      if (!genAI) throw new Error('No GEMINI_API_KEY');
      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        systemInstruction: systemContent,
      });
      // Build Gemini-format history (no system role in history)
      const geminiHistory = conversationHistory.slice(0, -1).map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
      const lastMsg = conversationHistory[conversationHistory.length - 1];
      const chat = model.startChat({ history: geminiHistory });
      const result = await chat.sendMessage(lastMsg.content);
      return result.response.text();
    },
    // 3. OpenAI GPT-4o
    async () => {
      const openai = getOpenAI();
      if (!openai) throw new Error('No OPENAI_API_KEY');
      const res = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemContent },
          ...conversationHistory,
        ],
        max_tokens: 200,
        temperature: 0.8,
      });
      return res.choices[0].message.content;
    },
  ], 'Chat');
}

// ── Emotion & Sentiment Analysis ──────────────────────────────────────────────
// Primary: Groq (llama-3.3-70b) with JSON mode
// Fallback 1: Gemini 1.5 Flash
// Fallback 2: OpenAI GPT-4o

const EMOTION_SYSTEM = `You are an emotion analysis engine. Analyze the given text and return ONLY a valid JSON object with these exact fields:
{
  "dominantEmotion": "one of: happiness, sadness, stress, anger, anxiety, loneliness, exhaustion, neutral",
  "sentimentScore": <number from -1.0 (very negative) to 1.0 (very positive)>,
  "stressLevel": <number from 0 to 10>,
  "emotionalIntensity": <number from 0 to 10>,
  "flags": ["array of detected flags from: fatigue_mention, sleep_complaint, overwhelm, isolation, hopelessness, positive_outlook, seeking_help"]
}`;

function parseJsonSafe(text) {
  // Strip markdown code fences if present
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

async function analyzeEmotion(text) {
  return withFallback([
    // 1. Groq
    async () => {
      const groq = getGroq();
      if (!groq) throw new Error('No GROQ_API_KEY');
      const res = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: EMOTION_SYSTEM },
          { role: 'user', content: text },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });
      return parseJsonSafe(res.choices[0].message.content);
    },
    // 2. Gemini
    async () => {
      const genAI = getGemini();
      if (!genAI) throw new Error('No GEMINI_API_KEY');
      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        generationConfig: { responseMimeType: 'application/json' },
      });
      const result = await model.generateContent(
        `${EMOTION_SYSTEM}\n\nText to analyze: ${text}`
      );
      return parseJsonSafe(result.response.text());
    },
    // 3. OpenAI
    async () => {
      const openai = getOpenAI();
      if (!openai) throw new Error('No OPENAI_API_KEY');
      const res = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: EMOTION_SYSTEM },
          { role: 'user', content: text },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });
      return parseJsonSafe(res.choices[0].message.content);
    },
  ], 'Emotion');
}

// ── Weekly Evaluation Response Analysis ──────────────────────────────────────

const EVAL_SYSTEM = `Analyze this caregiver's response to a wellness evaluation question. Return ONLY valid JSON:
{
  "sentimentScore": <-1.0 to 1.0>,
  "emotionDetected": "primary emotion",
  "wellnessScore": <0 to 100, where 100 is perfectly well>
}`;

async function analyzeEvaluationResponse(question, answer) {
  const userContent = `Question: ${question}\nAnswer: ${answer}`;

  return withFallback([
    // 1. Groq
    async () => {
      const groq = getGroq();
      if (!groq) throw new Error('No GROQ_API_KEY');
      const res = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: EVAL_SYSTEM },
          { role: 'user', content: userContent },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });
      return parseJsonSafe(res.choices[0].message.content);
    },
    // 2. Gemini
    async () => {
      const genAI = getGemini();
      if (!genAI) throw new Error('No GEMINI_API_KEY');
      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        generationConfig: { responseMimeType: 'application/json' },
      });
      const result = await model.generateContent(`${EVAL_SYSTEM}\n\n${userContent}`);
      return parseJsonSafe(result.response.text());
    },
    // 3. OpenAI
    async () => {
      const openai = getOpenAI();
      if (!openai) throw new Error('No OPENAI_API_KEY');
      const res = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: EVAL_SYSTEM },
          { role: 'user', content: userContent },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });
      return parseJsonSafe(res.choices[0].message.content);
    },
  ], 'EvalAnalysis');
}

// ── Text-to-Speech ────────────────────────────────────────────────────────────
// Primary: OpenAI TTS (Nova voice) — best quality
// Fallback: returns null → frontend falls back to Web Speech API
// Note: Groq has no TTS. Gemini TTS is not yet in the public API.

// ElevenLabs → OpenAI TTS → browser fallback
async function textToSpeech(text) {
  return withFallback([
    // 1. ElevenLabs Multilingual v2 — supports Hindi, Kannada, Tamil, Telugu etc.
    async () => {
      if (!process.env.ELEVENLABS_API_KEY) throw new Error('No ELEVENLABS_API_KEY');
      const response = await fetch(
        'https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL',
        {
          method: 'POST',
          headers: {
            'xi-api-key': process.env.ELEVENLABS_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_multilingual_v2',
            voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3 },
          }),
        }
      );
      if (!response.ok) throw new Error(`ElevenLabs ${response.status}: ${await response.text()}`);
      return Buffer.from(await response.arrayBuffer());
    },
    // 2. OpenAI TTS fallback
    async () => {
      const openai = getOpenAI();
      if (!openai) throw new Error('No OPENAI_API_KEY');
      const mp3 = await openai.audio.speech.create({ model: 'tts-1', voice: 'nova', input: text });
      return Buffer.from(await mp3.arrayBuffer());
    },
    // 3. Browser fallback
    async () => {
      console.warn('[AI:TTS] No TTS provider available, returning null for client-side fallback');
      return null;
    },
  ], 'TTS');
}

module.exports = {
  transcribeAudio,
  generateResponse,
  analyzeEmotion,
  analyzeEvaluationResponse,
  textToSpeech,
};
