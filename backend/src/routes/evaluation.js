const express = require('express');
const multer = require('multer');
const { authenticate, requireRole } = require('../middleware/auth');
const { transcribeAudio, analyzeEvaluationResponse, textToSpeech } = require('../services/aiService');
const { getCurrentWeekNumber, updateWeeklyBurnout } = require('../services/burnoutEngine');
const supabase = require('../lib/supabase');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const WEEKLY_QUESTIONS = [
  'How emotionally tired have you felt this week?',
  'Have you felt overwhelmed while taking care of others?',
  'Did you get enough time for yourself this week?',
  'How often did you feel mentally exhausted?',
  'What made you feel happiest or most stressed this week?',
];

// Question bank — 4 sets of 5, rotated by week number
const QUESTION_BANK = [
  [
    'How emotionally tired have you felt this week?',
    'Have you felt overwhelmed while taking care of others?',
    'Did you get enough time for yourself this week?',
    'How often did you feel mentally exhausted?',
    'What made you feel happiest or most stressed this week?',
  ],
  [
    'How well did you sleep this week overall?',
    'Did you feel supported by the people around you this week?',
    'Were there moments this week where you felt at peace?',
    'How often did you feel like you had no energy left?',
    'What was the most emotionally draining part of your week?',
  ],
  [
    'Did you take any time to do something just for yourself this week?',
    'How often did you feel anxious or worried this week?',
    'Were you able to ask for help when you needed it?',
    'How connected did you feel to others this week?',
    'What emotion came up most often for you this week?',
  ],
  [
    'How would you describe your overall mood this week?',
    'Did you feel like your efforts were appreciated this week?',
    'Were there moments you felt like giving up or burning out?',
    'How often did you feel calm and in control this week?',
    'What would have made this week easier for you emotionally?',
  ],
];

function getQuestionsForWeek(weekNumber) {
  const setIndex = (weekNumber - 1) % QUESTION_BANK.length;
  return QUESTION_BANK[setIndex];
}

// GET /api/evaluation/pending
router.get('/pending', authenticate, requireRole('caregiver'), async (req, res) => {
  try {
    const weekNumber = getCurrentWeekNumber(req.user.week_joined);

    const { data: evaluation } = await supabase
      .from('weekly_evaluations')
      .select('id, week_number, questions')
      .eq('user_id', req.user.id)
      .eq('week_number', weekNumber)
      .eq('is_pending', true)
      .single();

    res.json({
      hasPending: !!evaluation,
      evaluation: evaluation
        ? { id: evaluation.id, weekNumber, questions: evaluation.questions }
        : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/evaluation/start — create or return existing pending evaluation
router.post('/start', authenticate, requireRole('caregiver'), async (req, res) => {
  try {
    const weekNumber = getCurrentWeekNumber(req.user.week_joined);

    // Check if one already exists
    const { data: existing } = await supabase
      .from('weekly_evaluations')
      .select('id, week_number, questions')
      .eq('user_id', req.user.id)
      .eq('week_number', weekNumber)
      .eq('is_pending', true)
      .maybeSingle();

    if (existing) {
      return res.json({ id: existing.id, weekNumber, questions: existing.questions });
    }

    // Create new evaluation
    const { data: created, error } = await supabase
      .from('weekly_evaluations')
      .insert({
        user_id: req.user.id,
        week_number: weekNumber,
        questions: getQuestionsForWeek(weekNumber),
        is_pending: true,
      })
      .select('id, week_number, questions')
      .single();

    if (error) throw error;

    res.json({ id: created.id, weekNumber: created.week_number, questions: created.questions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/evaluation/:id/question/:index/text — just the question text, no TTS
router.get('/:id/question/:index/text', authenticate, requireRole('caregiver'), async (req, res) => {
  try {
    const { data: evaluation } = await supabase
      .from('weekly_evaluations')
      .select('questions')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (!evaluation) return res.status(404).json({ error: 'Evaluation not found' });
    const question = evaluation.questions[parseInt(req.params.index)];
    if (!question) return res.status(404).json({ error: 'Question not found' });
    res.json({ question });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/evaluation/:id/question/:index — returns TTS audio for a question
router.get('/:id/question/:index', authenticate, requireRole('caregiver'), async (req, res) => {
  try {
    const { data: evaluation } = await supabase
      .from('weekly_evaluations')
      .select('questions')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (!evaluation) return res.status(404).json({ error: 'Evaluation not found' });

    const question = evaluation.questions[parseInt(req.params.index)];
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const audio = await textToSpeech(question);
    if (!audio) return res.json({ fallbackText: question, useBrowserTTS: true });

    res.set('Content-Type', 'audio/mpeg');
    res.send(audio);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/evaluation/:id/respond
router.post('/:id/respond', authenticate, requireRole('caregiver'), upload.single('audio'), async (req, res) => {
  try {
    const { data: evaluation } = await supabase
      .from('weekly_evaluations')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .eq('is_pending', true)
      .single();

    if (!evaluation) return res.status(404).json({ error: 'Evaluation not found' });

    const qIndex = parseInt(req.body.questionIndex);
    const question = evaluation.questions[qIndex];
    if (!question) return res.status(400).json({ error: 'Invalid question index' });

    const answerText = await transcribeAudio(req.file.buffer, req.file.originalname);
    const analysis = await analyzeEvaluationResponse(question, answerText);

    const responses = [...(evaluation.responses || [])];
    responses[qIndex] = {
      question,
      answer: answerText,
      sentimentScore: analysis.sentimentScore,
      emotionDetected: analysis.emotionDetected,
    };

    const filledResponses = responses.filter(Boolean);
    const isComplete = filledResponses.length >= evaluation.questions.length;

    const updateData = { responses };

    if (isComplete) {
      const avgSentiment = filledResponses.reduce((sum, r) => sum + (r.sentimentScore ?? 0), 0) / filledResponses.length;
      updateData.overall_score = Math.round(((avgSentiment + 1) / 2) * 100);
      updateData.is_pending = false;
      updateData.completed_at = new Date().toISOString();

      const weekNumber = getCurrentWeekNumber(req.user.week_joined);
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);

      await updateWeeklyBurnout(req.user.id, weekNumber, weekStart, {
        evaluationScore: updateData.overall_score,
        evaluationCompleted: true,
      });
    }

    await supabase.from('weekly_evaluations').update(updateData).eq('id', req.params.id);

    res.json({
      success: true,
      answer: answerText,
      isComplete,
      nextQuestionIndex: isComplete ? null : qIndex + 1,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.WEEKLY_QUESTIONS = WEEKLY_QUESTIONS;
module.exports = router;
