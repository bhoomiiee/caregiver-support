# AI Caregiver Emotional Support System

Voice-based AI companion for caregiver mental wellness and burnout detection.

## Stack
- Frontend: Next.js
- Backend: Node.js + Express
- Database: MongoDB
- AI: OpenAI (GPT-4, Whisper STT, TTS)

## Setup

### Backend
```bash
cd backend
npm install
cp .env.example .env   # fill in your keys
npm run dev
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

## User Roles
- **Caregiver** — voice interaction, weekly evaluations
- **Admin** — burnout score monitoring, escalation management
- **Psychiatrist** — silent intervention for high-risk users
