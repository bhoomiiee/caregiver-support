const cron = require('node-cron');
const supabase = require('../lib/supabase');
const { getCurrentWeekNumber, runMonthlyEvaluation } = require('./burnoutEngine');

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
  return QUESTION_BANK[(weekNumber - 1) % QUESTION_BANK.length];
}

function scheduleWeeklyEvaluation() {
  cron.schedule('0 9 * * 1', async () => {
    console.log('[Scheduler] Running weekly evaluation setup...');
    try {
      const { data: caregivers } = await supabase
        .from('profiles')
        .select('id, week_joined')
        .eq('role', 'caregiver');

      for (const user of caregivers || []) {
        const weekNumber = getCurrentWeekNumber(user.week_joined);

        // Create pending evaluation if not already exists
        const { data: existing } = await supabase
          .from('weekly_evaluations')
          .select('id')
          .eq('user_id', user.id)
          .eq('week_number', weekNumber)
          .maybeSingle();

        if (!existing) {
          await supabase.from('weekly_evaluations').insert({
            user_id: user.id,
            week_number: weekNumber,
            questions: getQuestionsForWeek(weekNumber),
            is_pending: true,
          });
          console.log(`[Scheduler] Created evaluation for ${user.id} week ${weekNumber}`);
        }

        // Monthly evaluation every 4th week
        if (weekNumber % 4 === 0) {
          const cycleStart = weekNumber - 3;
          const { data: cycleWeeks } = await supabase
            .from('burnout_scores')
            .select('*')
            .eq('user_id', user.id)
            .gte('week_number', cycleStart)
            .lte('week_number', weekNumber);

          if (cycleWeeks?.length >= 3) {
            const result = await runMonthlyEvaluation(user.id, cycleWeeks);
            console.log(`[Scheduler] Monthly eval ${user.id}: score=${result.monthlyScore}, escalate=${result.shouldEscalate}`);
          }
        }
      }
    } catch (err) {
      console.error('[Scheduler] Error:', err);
    }
  });

  console.log('[Scheduler] Weekly evaluation cron scheduled (Mon 9am)');
}

module.exports = { scheduleWeeklyEvaluation };
