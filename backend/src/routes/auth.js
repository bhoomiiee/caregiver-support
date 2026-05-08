const express = require('express');
const supabase = require('../lib/supabase');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email and password are required' });
    }

    // Create user via admin API — auto-confirms email
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role: 'caregiver' },
    });

    if (error) return res.status(400).json({ error: error.message });

    // Create profile
    await supabase.from('profiles').upsert({
      id: data.user.id,
      name,
      role: 'caregiver',
    });

    // Sign in to get session token
    const { data: session, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) return res.status(400).json({ error: signInError.message });

    res.status(201).json({
      token: session.session.access_token,
      user: { id: data.user.id, name, role: 'caregiver' },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Auto-confirm email using admin API
    const { data: userList } = await supabase.auth.admin.listUsers();
    const targetUser = userList?.users?.find(u => u.email === email);

    if (!targetUser) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Confirm email if not confirmed
    if (!targetUser.email_confirmed_at) {
      await supabase.auth.admin.updateUserById(targetUser.id, { email_confirm: true });
    }

    // Ensure profile exists
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', targetUser.id)
      .maybeSingle();

    if (!existingProfile) {
      await supabase.from('profiles').insert({
        id: targetUser.id,
        name: targetUser.user_metadata?.name || email.split('@')[0],
        role: 'caregiver',
      });
    }

    // Sign in
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: 'Invalid credentials' });

    // Get profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, role')
      .eq('id', data.user.id)
      .single();

    if (profileError || !profile) {
      console.error('Profile fetch error:', profileError?.message);
      // Return basic user info from auth if profile missing
      return res.json({
        token: data.session.access_token,
        user: {
          id: data.user.id,
          name: data.user.user_metadata?.name || email.split('@')[0],
          role: 'caregiver',
        },
      });
    }

    res.json({
      token: data.session.access_token,
      user: { id: profile.id, name: profile.name, role: profile.role },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      role: req.user.role,
    },
  });
});

// GET /api/auth/profile — caregiver profile with stats
router.get('/profile', authenticate, async (req, res) => {
  try {
    const supabase = require('../lib/supabase');
    const { getCurrentWeekNumber } = require('../services/burnoutEngine');

    const weekNumber = getCurrentWeekNumber(req.user.week_joined);

    const [{ data: sessions }, { data: evaluations }, { data: latestScore }] = await Promise.all([
      supabase.from('sessions').select('id', { count: 'exact' }).eq('user_id', req.user.id),
      supabase.from('weekly_evaluations').select('id', { count: 'exact' }).eq('user_id', req.user.id).eq('is_pending', false),
      supabase.from('burnout_scores').select('weekly_burnout_score, risk_level').eq('user_id', req.user.id).order('week_number', { ascending: false }).limit(1).maybeSingle(),
    ]);

    res.json({
      user: {
        id: req.user.id,
        name: req.user.name,
        role: req.user.role,
        week_joined: req.user.week_joined,
      },
      stats: {
        currentWeek: weekNumber,
        totalSessions: sessions?.length || 0,
        completedCheckIns: evaluations?.length || 0,
        latestRisk: latestScore?.risk_level || null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/token-debug — temporary debug endpoint
router.get('/token-debug', (req, res) => {
  const header = req.headers.authorization || 'none';
  const token = header.replace('Bearer ', '');
  res.json({
    headerPresent: !!req.headers.authorization,
    tokenSegments: token.split('.').length,
    tokenStart: token.substring(0, 40),
  });
});

// PATCH /api/auth/language — update preferred language
router.patch('/language', authenticate, async (req, res) => {
  try {
    const { language } = req.body;
    const supabase = require('../lib/supabase');
    await supabase.from('profiles').update({ preferred_language: language }).eq('id', req.user.id);
    res.json({ success: true, language });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
