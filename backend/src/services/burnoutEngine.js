const supabase = require('../lib/supabase');

function computeWeeklyBurnout({
  averageSentiment = 0,
  averageStress = 0,
  negativeSessionRatio = 0,
  fatigueFlags = 0,
  emotionalInstability = 0,
  evaluationScore,
}) {
  const sentimentBurnout = ((1 - averageSentiment) / 2) * 100;
  const stressBurnout = averageStress * 10;
  const negativeBurnout = negativeSessionRatio * 100;
  const fatigueBurnout = Math.min(fatigueFlags * 5, 30);
  const instabilityBurnout = emotionalInstability * 5;
  const evalBurnout = evaluationScore != null ? 100 - evaluationScore : 50;

  const score =
    sentimentBurnout * 0.25 +
    stressBurnout * 0.20 +
    negativeBurnout * 0.15 +
    fatigueBurnout * 0.10 +
    instabilityBurnout * 0.10 +
    evalBurnout * 0.20;

  return Math.min(Math.round(score), 100);
}

function getRiskLevel(score) {
  if (score < 30) return 'low';
  if (score < 55) return 'moderate';
  if (score < 75) return 'high';
  return 'critical';
}

async function updateWeeklyBurnout(userId, weekNumber, weekStartDate, sessionData) {
  const score = computeWeeklyBurnout(sessionData);
  const riskLevel = getRiskLevel(score);

  const { data, error } = await supabase
    .from('burnout_scores')
    .upsert(
      {
        user_id: userId,
        week_number: weekNumber,
        week_start_date: weekStartDate instanceof Date ? weekStartDate.toISOString() : weekStartDate,
        average_sentiment: sessionData.averageSentiment,
        average_stress: sessionData.averageStress,
        negative_session_ratio: sessionData.negativeSessionRatio,
        fatigue_flags: sessionData.fatigueFlags,
        emotional_instability: sessionData.emotionalInstability,
        evaluation_score: sessionData.evaluationScore,
        evaluation_completed: sessionData.evaluationCompleted ?? false,
        weekly_burnout_score: score,
        risk_level: riskLevel,
      },
      { onConflict: 'user_id,week_number' }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function runMonthlyEvaluation(userId, cycleWeeks) {
  const avgScore = cycleWeeks.reduce((sum, w) => sum + w.weekly_burnout_score, 0) / cycleWeeks.length;
  const monthlyRisk = getRiskLevel(avgScore);
  const shouldEscalate = avgScore >= 75;

  const lastWeek = cycleWeeks[cycleWeeks.length - 1];
  await supabase
    .from('burnout_scores')
    .update({
      is_monthly_evaluation: true,
      monthly_burnout_score: Math.round(avgScore),
      escalation_triggered: shouldEscalate,
    })
    .eq('id', lastWeek.id);

  if (shouldEscalate) {
    await supabase.from('profiles').update({ is_escalated: true }).eq('id', userId);
  }

  return { monthlyScore: Math.round(avgScore), riskLevel: monthlyRisk, shouldEscalate };
}

function getCurrentWeekNumber(weekJoined) {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksSince = Math.floor((Date.now() - new Date(weekJoined).getTime()) / msPerWeek);
  return weeksSince + 1;
}

module.exports = { computeWeeklyBurnout, getRiskLevel, updateWeeklyBurnout, runMonthlyEvaluation, getCurrentWeekNumber };
