const supabase = require('../lib/supabase');

const CRISIS_KEYWORDS = [
  'suicide', 'suicidal', 'kill myself', 'end my life', 'want to die',
  'no reason to live', 'better off dead', 'hurt myself', 'self harm',
  'self-harm', 'cutting myself', 'overdose', 'not worth living',
  'आत्महत्या', 'मरना चाहता', 'मरना चाहती', 'जीना नहीं',
  'ಆತ್ಮಹತ್ಯೆ', 'ಸಾಯಬೇಕು', 'ಬದುಕಬೇಕಿಲ್ಲ',
  'ఆత్మహత్య', 'చనిపోవాలి',
  'தற்கொலை', 'இறந்துவிட',
];

function detectCrisis(text) {
  const lower = text.toLowerCase();
  return CRISIS_KEYWORDS.some(keyword => lower.includes(keyword.toLowerCase()));
}

async function sendCrisisAlert(caregiverName, caregiverId, psychiatristName) {
  if (!process.env.RESEND_API_KEY || !process.env.ADMIN_EMAIL) {
    console.warn('[Crisis] No RESEND_API_KEY or ADMIN_EMAIL — skipping email');
    return;
  }
  try {
    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: 'Caregiver Support <onboarding@resend.dev>',
      to: process.env.ADMIN_EMAIL,
      subject: `🚨 CRISIS ALERT — ${caregiverName} needs immediate support`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#dc2626;color:white;padding:20px;border-radius:8px 8px 0 0;">
            <h1 style="margin:0;font-size:20px;">🚨 Crisis Alert — Immediate Action Required</h1>
          </div>
          <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 8px 8px;">
            <p style="color:#374151;font-size:16px;">
              A caregiver has expressed distress indicating a possible mental health crisis during a <strong>voice conversation</strong> (not a weekly check-in).
            </p>
            <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:16px;margin:16px 0;border-radius:4px;">
              <p style="margin:0;color:#991b1b;font-weight:bold;">Caregiver: ${caregiverName}</p>
              <p style="margin:8px 0 0;color:#7f1d1d;font-size:14px;">Escalation type: <strong>Crisis — Voice Conversation</strong></p>
              <p style="margin:4px 0 0;color:#7f1d1d;font-size:14px;">Assigned to: <strong>${psychiatristName || 'Unassigned — please assign immediately'}</strong></p>
            </div>
            <p style="color:#374151;"><strong>Immediate actions required:</strong></p>
            <ul style="color:#374151;">
              <li>Log into the admin dashboard</li>
              <li>Review the crisis escalation marked in red</li>
              <li>${psychiatristName ? `${psychiatristName} has been automatically assigned` : 'Assign a psychiatrist immediately'}</li>
              <li>Ensure the caregiver is contacted within the hour</li>
            </ul>
            <div style="margin-top:16px;padding:12px;background:#f3f4f6;border-radius:8px;">
              <p style="margin:0;color:#6b7280;font-size:12px;">
                This alert was triggered by crisis keywords detected in a live voice session.<br>
                User ID: ${caregiverId}
              </p>
            </div>
          </div>
        </div>
      `,
    });
    console.log(`[Crisis] Email sent to ${process.env.ADMIN_EMAIL}`);
  } catch (err) {
    console.error('[Crisis] Email error:', err.message);
  }
}

async function handleCrisis(user) {
  try {
    // Find first available psychiatrist
    const { data: psychiatrists } = await supabase
      .from('profiles')
      .select('id, name')
      .eq('role', 'psychiatrist')
      .limit(1);

    const psychiatrist = psychiatrists?.[0] || null;

    // Mark as crisis escalated (separate from burnout escalation)
    await supabase.from('profiles').update({
      is_escalated: true,
      crisis_escalated: true,
      escalation_reason: 'crisis_voice_conversation',
      assigned_psychiatrist: psychiatrist?.id || null,
    }).eq('id', user.id);

    await sendCrisisAlert(user.name, user.id, psychiatrist?.name);
    console.log(`[Crisis] Auto-escalated ${user.name} → ${psychiatrist?.name || 'unassigned'}`);
  } catch (err) {
    console.error('[Crisis] handleCrisis error:', err.message);
  }
}

module.exports = { detectCrisis, handleCrisis };
