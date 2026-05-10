# 🌿 Caregiver Support — AI Emotional Wellness System

> *"Caring for the people who care for everyone else."*

**AI-powered caregiver burnout support system with hidden escalation architecture.**

Live Demo: [caregiver-support-rouge.vercel.app](https://caregiver-support-rouge.vercel.app)

---

## 🔴 Problem Statement

Caregivers — people who dedicate their lives to caring for elderly relatives, patients, or individuals with special needs — are among the most emotionally exhausted professionals in the world. Yet they are the least likely to seek help.

**Why existing systems fail:**
- Mental health apps require typing, which feels clinical and cold
- Caregivers don't have time to fill forms or attend therapy sessions
- Burnout builds silently over weeks before it becomes a crisis
- The stigma around mental health makes caregivers reluctant to admit they are struggling
- There is no system that monitors emotional health passively and intervenes before it's too late

**The result:** Caregivers burn out in silence, and by the time someone notices, it's already a crisis.

---

## 💡 Solution

A voice-first AI companion that feels like talking to a trusted friend — not a clinical tool.

**How it works:**

- The caregiver speaks naturally to the AI through a microphone
- The AI listens, responds with empathy, and quietly analyzes emotional patterns
- A burnout score is calculated in the background — the caregiver never sees it
- Weekly emotional check-ins track mental health over time
- When burnout reaches a critical level, a psychiatrist is silently brought in
- The caregiver continues believing they are talking to the AI — no stigma, no resistance

---

## ✨ Features

### 🎙️ AI Emotional Support Chatbot
Voice-only interaction — no typing required. The caregiver speaks, the AI responds with warmth and empathy in real time. Supports 16 languages including Hindi, Kannada, Tamil, Telugu, and more.

### 📋 Weekly Emotional Check-ins
Every week, the AI asks 5 rotating emotional wellness questions. Responses are analyzed for sentiment and emotional health. 4 different question sets rotate weekly to avoid repetition.

### 📊 Burnout Score Analysis
A hidden burnout score (0–100) is calculated from:
- Voice sentiment and emotional tone
- Stress frequency and intensity
- Fatigue and sleep-related mentions
- Weekly evaluation responses
- Emotional instability over time

The score is never shown to the caregiver. Only admins and psychiatrists can see it.

### 🛡️ Admin Escalation Dashboard
Admins monitor all caregivers, view burnout scores, risk levels (Low / Moderate / High / Critical), and escalate high-risk users to psychiatrists. Crisis escalations triggered by voice conversations are flagged separately in red.

### 🚨 Automatic Crisis Detection
When a caregiver expresses thoughts of self-harm or suicidal ideation during a conversation, the system:
1. Responds with deep compassion and crisis support resources
2. Silently auto-escalates the caregiver to a psychiatrist
3. Sends an immediate email alert to the admin
4. The caregiver never knows any of this happened

### 🧠 Silent Psychiatrist Intervention
When a caregiver is escalated, a psychiatrist can join their session invisibly. The caregiver continues talking to what they believe is the AI. The psychiatrist types responses which are converted to voice and spoken back to the caregiver through ElevenLabs TTS.

### 💬 Sentiment Analysis
Every voice message is analyzed for:
- Dominant emotion (happiness, sadness, stress, anxiety, exhaustion, etc.)
- Sentiment score (-1.0 to +1.0)
- Stress level (0–10)
- Emotional intensity
- Crisis flags (fatigue mentions, sleep complaints, hopelessness, etc.)

---

## 🛠️ Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| **Next.js 14** | React framework, App Router, SSR |
| **TypeScript** | Type safety |
| **Tailwind CSS** | Lavender/white UI design system |
| **Zustand** | Auth state management |
| **Axios** | API calls with JWT interceptors |
| **Supabase JS** | Realtime subscriptions for live sessions |

### Backend
| Technology | Purpose |
|---|---|
| **Node.js + Express** | REST API server |
| **Multer** | Audio file upload handling |
| **node-cron** | Weekly evaluation scheduling (Mon 9am) |
| **jsonwebtoken** | Local JWT verification |
| **Resend** | Crisis alert emails |

### Database & Auth
| Technology | Purpose |
|---|---|
| **Supabase (PostgreSQL)** | Database, auth, realtime |
| **Supabase Auth** | JWT-based email/password auth |
| **Supabase Realtime** | Live psychiatrist session takeover |

### AI & Voice
| Technology | Purpose |
|---|---|
| **Groq (LLaMA 3.3 70B)** | Primary AI — ultra-fast inference |
| **Gemini 1.5 Flash** | AI fallback |
| **OpenAI GPT-4o** | AI last resort fallback |
| **Groq Whisper** | Speech-to-Text (primary) |
| **OpenAI Whisper** | STT fallback |
| **ElevenLabs Multilingual v2** | Text-to-Speech — all Indian languages |
| **Browser Web Speech API** | TTS fallback |

### Deployment
| Service | Purpose |
|---|---|
| **Vercel** | Frontend hosting |
| **Render** | Backend hosting |
| **Supabase** | Database + Auth (hosted) |

---

## 🏗️ Architecture

```
Caregiver (Voice)
      │
      ▼
[Groq Whisper STT] ──► Text
      │
      ▼
[Crisis Detection] ──► If crisis: auto-escalate + email admin
      │
      ▼
[Groq LLaMA / Gemini / GPT-4o] ──► AI Response (in selected language)
      │
      ├──► [Sentiment Analysis] ──► Emotion flags, stress level
      │           │
      │           ▼
      │    [Burnout Engine] ──► Weekly score (hidden from caregiver)
      │           │
      │           ▼
      │    [Supabase DB] ──► Admin Dashboard
      │                           │
      │                           ▼
      │                    [Psychiatrist Portal]
      │                           │
      ▼                           ▼
[ElevenLabs TTS] ◄──── [Silent Takeover via Realtime]
      │
      ▼
Caregiver hears response
```

**Flow:** Caregiver speaks → STT → Crisis check → AI generates response → Sentiment analyzed → Burnout score updated → Admin monitors → Psychiatrist intervenes silently if needed → Caregiver hears AI voice

---

## 🚀 Installation Guide

### Prerequisites
- Node.js 20+
- Supabase account
- API keys: Groq, Gemini, ElevenLabs (OpenAI optional)

### 1. Clone the repository
```bash
git clone https://github.com/bhoomiiee/caregiver-support.git
cd caregiver-support
```

### 2. Set up the database
- Create a project on [supabase.com](https://supabase.com)
- Run `supabase/schema.sql` in the Supabase SQL Editor
- Disable RLS on all tables (service role key bypasses it anyway)

### 3. Backend setup
```bash
cd backend
npm install
cp .env.example .env
# Fill in all API keys in .env
npm run dev
```

### 4. Frontend setup
```bash
cd frontend
npm install
cp .env.example .env.local
# Fill in Supabase URL, anon key, API URL, ElevenLabs key
npm run dev
```

### 5. Create admin account
```bash
cd backend
node -r dotenv/config -e "
const supabase = require('./src/lib/supabase');
supabase.auth.admin.createUser({
  email: 'admin@yourapp.com',
  password: 'YourPassword123',
  email_confirm: true,
  user_metadata: { name: 'Admin', role: 'admin' }
}).then(({data}) => {
  supabase.from('profiles').upsert({ id: data.user.id, name: 'Admin', role: 'admin' });
  console.log('Admin created');
});
"
```

### Environment Variables

**backend/.env**
```
PORT=5000
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GROQ_API_KEY=
GEMINI_API_KEY=
OPENAI_API_KEY=
ELEVENLABS_API_KEY=
RESEND_API_KEY=
ADMIN_EMAIL=
NODE_ENV=development
```

**frontend/.env.local**
```
NEXT_PUBLIC_API_URL=http://localhost:5000/api
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_ELEVENLABS_API_KEY=
```

---

## 📸 Screenshots

| Login Page | Voice Companion | Admin Dashboard |
|---|---|---|
| Illustrated lavender background with centered login card | Hold-to-speak orb with real-time emotion response | Burnout scores, risk levels, crisis escalation flags |

---

## 🔮 Future Scope

- **Psychiatrist voice response** — Instead of typing, the psychiatrist speaks directly into their microphone. Their voice is captured, converted to the AI's voice using ElevenLabs voice cloning, and played back to the caregiver — making the intervention completely seamless and indistinguishable from the AI
- **Smartwatch integration** — Real-time heart rate and stress monitoring via wearables to feed into burnout scoring
- **Proactive check-ins** — AI initiates conversations when it detects the caregiver hasn't spoken in several days
- **Family support network** — Extend the platform to family members of caregivers
- **Emergency SOS** — One-tap emergency alert to a trusted contact during crisis moments
- **Personalized wellness plans** — AI-generated self-care routines based on burnout patterns
- **Multi-device sync** — Continue conversations seamlessly across phone, tablet, and desktop
- **Analytics dashboard for psychiatrists** — Longitudinal emotional health charts, session summaries, and intervention effectiveness tracking
- **Offline mode** — Core emotional support available without internet using on-device models

---

## 👩‍💻 Team

**Bhoomika Srikanth**
Solo participant — designed, built, and deployed the entire system independently.

*Built with care for the people who care for everyone else. 🌿*
