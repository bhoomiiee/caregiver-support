const express = require('express');
const multer = require('multer');
const { authenticate, requireRole } = require('../middleware/auth');
const { transcribeAudio, generateResponse, analyzeEmotion, textToSpeech } = require('../services/aiService');
const { getCurrentWeekNumber, updateWeeklyBurnout } = require('../services/burnoutEngine');
const { detectCrisis, handleCrisis } = require('../services/crisisDetection');
const supabase = require('../lib/supabase');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// POST /api/voice/interact
router.post('/interact', authenticate, requireRole('caregiver'), upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file provided' });

    // Check if psychiatrist has joined this session
    let psychiatristActive = false;
    try {
      const { data: activeSession } = await supabase
        .from('active_sessions')
        .select('is_psychiatrist_active, psychiatrist_id')
        .eq('caregiver_id', req.user.id)
        .maybeSingle();
      psychiatristActive = activeSession?.is_psychiatrist_active === true;
    } catch {
      // active_sessions table may not exist yet — ignore
    }

    // 1. Transcribe
    const userText = await transcribeAudio(req.file.buffer, req.file.originalname);

    // 2. Analyze emotion
    const emotionAnalysis = await analyzeEmotion(userText);

    // 2b. Crisis detection — check for self-harm/suicidal keywords
    if (detectCrisis(userText)) {
      console.log(`[Crisis] Detected crisis keywords for user ${req.user.name}`);
      // Auto-escalate and notify admin in background
      handleCrisis(req.user).catch(console.error);
    }

    // If psychiatrist is active, relay message to them and wait for their response
    if (psychiatristActive) {
      // Save caregiver message to active_session so psychiatrist sees it
      await supabase.from('active_sessions').update({
        last_message: userText,
        last_message_role: 'caregiver',
        updated_at: new Date().toISOString(),
      }).eq('caregiver_id', req.user.id);

      // Save to session transcript
      const { data: latestSession } = await supabase
        .from('sessions')
        .select('id, transcript')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestSession) {
        const transcript = [...(latestSession.transcript || []),
          { role: 'user', content: userText, timestamp: new Date().toISOString() }
        ];
        await supabase.from('sessions').update({ transcript }).eq('id', latestSession.id);
      }

      // Return acknowledgment — psychiatrist will send response separately via their portal
      return res.json({
        fallbackText: '...',
        sessionId: latestSession?.id,
        useBrowserTTS: false,
        waitingForPsychiatrist: true,
      });
    }

    // 3. Build conversation history from existing session
    const sessionId = req.body.sessionId;
    let conversationHistory = [];
    let existingTranscript = [];

    if (sessionId) {
      const { data: session } = await supabase
        .from('sessions')
        .select('transcript')
        .eq('id', sessionId)
        .eq('user_id', req.user.id)
        .single();

      if (session?.transcript) {
        existingTranscript = session.transcript;
        conversationHistory = existingTranscript.slice(-10).map((t) => ({
          role: t.role,
          content: t.content,
        }));
      }
    }

    conversationHistory.push({ role: 'user', content: userText });

    // 4. Generate AI response — use language from request or profile
    const lang = req.body.language || req.user.preferred_language || 'en';
    const aiText = await generateResponse(conversationHistory, emotionAnalysis, lang);

    // 5. TTS
    const audioBuffer = await textToSpeech(aiText);

    // 6. Save/update session
    const newTranscript = [
      ...existingTranscript,
      { role: 'user', content: userText, timestamp: new Date().toISOString() },
      { role: 'assistant', content: aiText, timestamp: new Date().toISOString() },
    ];

    let savedSessionId = sessionId;
    if (sessionId) {
      const { error: updateErr } = await supabase
        .from('sessions')
        .update({ transcript: newTranscript, emotion_analysis: emotionAnalysis })
        .eq('id', sessionId);
      if (updateErr) console.error('Session update error:', updateErr.message);
    } else {
      const { data: newSession, error: insertErr } = await supabase
        .from('sessions')
        .insert({ user_id: req.user.id, transcript: newTranscript, emotion_analysis: emotionAnalysis })
        .select('id')
        .single();
      if (insertErr) console.error('Session insert error:', insertErr.message);
      savedSessionId = newSession?.id;
    }

    // 7. Update burnout in background
    updateBurnoutFromSession(req.user, emotionAnalysis).catch(console.error);

    // 8. Respond — always return JSON with text, let frontend handle TTS
    return res.json({
      text: aiText,
      sessionId: savedSessionId,
      language: lang,
    });
  } catch (err) {
    console.error('Voice interact error:', err);
    res.status(500).json({ error: 'Failed to process voice interaction' });
  }
});

// GET /api/voice/sessions
router.get('/sessions', authenticate, requireRole('caregiver'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('sessions')
      .select('id, emotion_analysis, session_date, burnout_delta')
      .eq('user_id', req.user.id)
      .order('session_date', { ascending: false })
      .limit(20);

    if (error) throw error;
    res.json({ sessions: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function updateBurnoutFromSession(user, emotionAnalysis) {
  const weekNumber = getCurrentWeekNumber(user.week_joined);
  const weekStartDate = new Date();
  weekStartDate.setDate(weekStartDate.getDate() - weekStartDate.getDay() + 1);

  const { data: weekSessions } = await supabase
    .from('sessions')
    .select('emotion_analysis')
    .eq('user_id', user.id)
    .gte('session_date', weekStartDate.toISOString());

  if (!weekSessions?.length) return;

  const sentiments = weekSessions.map((s) => s.emotion_analysis?.sentimentScore ?? 0);
  const stresses = weekSessions.map((s) => s.emotion_analysis?.stressLevel ?? 0);
  const allFlags = weekSessions.flatMap((s) => s.emotion_analysis?.flags ?? []);

  const avgSentiment = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;
  const avgStress = stresses.reduce((a, b) => a + b, 0) / stresses.length;
  const negativeRatio = sentiments.filter((s) => s < -0.2).length / sentiments.length;
  const fatigueCount = allFlags.filter((f) => ['fatigue_mention', 'sleep_complaint'].includes(f)).length;

  const mean = avgSentiment;
  const variance = sentiments.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / sentiments.length;
  const instability = Math.min(Math.sqrt(variance) * 10, 10);

  await updateWeeklyBurnout(user.id, weekNumber, weekStartDate, {
    averageSentiment: avgSentiment,
    averageStress: avgStress,
    negativeSessionRatio: negativeRatio,
    fatigueFlags: fatigueCount,
    emotionalInstability: instability,
  });
}

module.exports = router;
