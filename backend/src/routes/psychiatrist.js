const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const supabase = require('../lib/supabase');

const router = express.Router();

// GET /api/psychiatrist/cases
router.get('/cases', authenticate, requireRole('psychiatrist', 'admin'), async (req, res) => {
  try {
    let query = supabase
      .from('profiles')
      .select('id, name, week_joined')
      .eq('is_escalated', true);

    if (req.user.role === 'psychiatrist') {
      query = query.eq('assigned_psychiatrist', req.user.id);
    }

    const { data: users, error } = await query;
    if (error) throw error;

    const cases = await Promise.all(
      users.map(async (user) => {
        const { data: latestScore } = await supabase
          .from('burnout_scores')
          .select('weekly_burnout_score, risk_level, week_number')
          .eq('user_id', user.id)
          .order('week_number', { ascending: false })
          .limit(1)
          .maybeSingle();

        const { data: recentSessions } = await supabase
          .from('sessions')
          .select('emotion_analysis, session_date')
          .eq('user_id', user.id)
          .order('session_date', { ascending: false })
          .limit(5);

        return {
          user,
          latestBurnout: latestScore,
          recentEmotions: (recentSessions || []).map((s) => ({
            date: s.session_date,
            emotion: s.emotion_analysis?.dominantEmotion,
            stress: s.emotion_analysis?.stressLevel,
            sentiment: s.emotion_analysis?.sentimentScore,
          })),
        };
      })
    );

    res.json({ cases });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/psychiatrist/cases/:userId/history
router.get('/cases/:userId/history', authenticate, requireRole('psychiatrist', 'admin'), async (req, res) => {
  try {
    const { data: user } = await supabase
      .from('profiles')
      .select('id, name, week_joined, role')
      .eq('id', req.params.userId)
      .single();

    if (!user) return res.status(404).json({ error: 'User not found' });

    const [{ data: burnoutHistory }, { data: evaluations }, { data: sessions }] = await Promise.all([
      supabase.from('burnout_scores').select('*').eq('user_id', user.id).order('week_number', { ascending: true }),
      supabase.from('weekly_evaluations').select('*').eq('user_id', user.id).eq('is_pending', false).order('week_number', { ascending: true }),
      supabase.from('sessions').select('emotion_analysis, session_date, transcript').eq('user_id', user.id).order('session_date', { ascending: false }).limit(20),
    ]);

    res.json({ user, burnoutHistory, evaluations, sessions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/psychiatrist/cases/:userId/notes
router.post('/cases/:userId/notes', authenticate, async (req, res) => {
  try {
    const { note } = req.body;
    await supabase.from('sessions').insert({
      user_id: req.params.userId,
      transcript: [{ role: 'assistant', content: `[CLINICAL NOTE] ${note}`, timestamp: new Date().toISOString() }],
      emotion_analysis: {},
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/psychiatrist/cases/:userId/join
router.post('/cases/:userId/join', authenticate, async (req, res) => {
  try {
    await supabase.from('active_sessions').upsert({
      caregiver_id: req.params.userId,
      psychiatrist_id: req.user.id,
      is_psychiatrist_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'caregiver_id' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/psychiatrist/cases/:userId/leave
router.post('/cases/:userId/leave', authenticate, async (req, res) => {
  try {
    await supabase.from('active_sessions')
      .update({ is_psychiatrist_active: false, updated_at: new Date().toISOString() })
      .eq('caregiver_id', req.params.userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/psychiatrist/cases/:userId/message — send message as AI to caregiver
router.post('/cases/:userId/message', authenticate, async (req, res) => {
  try {
    const { message } = req.body;
    const { textToSpeech } = require('../services/aiService');

    // Update active_session — caregiver's page listens to this via realtime
    await supabase.from('active_sessions').upsert({
      caregiver_id: req.params.userId,
      psychiatrist_id: req.user.id,
      is_psychiatrist_active: true,
      last_message: message,
      last_message_role: 'assistant',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'caregiver_id' });

    // Convert to speech and return audio
    const audioBuffer = await textToSpeech(message);

    if (!audioBuffer) {
      return res.json({ fallbackText: message, useBrowserTTS: true });
    }

    res.set('Content-Type', 'audio/mpeg');
    res.set('X-Transcript', encodeURIComponent(message));
    res.send(audioBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
