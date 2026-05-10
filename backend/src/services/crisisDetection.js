const supabase = require('../lib/supabase');

// Crisis keywords across multiple languages
const CRISIS_KEYWORDS = [
  // English
  'suicide', 'suicidal', 'kill myself', 'end my life', 'want to die',
  'no reason to live', 'better off dead', 'hurt myself', 'self harm',
  'self-harm', 'cutting myself', 'overdose', 'not worth living',
  // Hindi
  'आत्महत्या', 'मरना चाहता', 'मरना चाहती', 'जीना नहीं',
  // Kannada
  'ಆತ್ಮಹತ್ಯೆ', 'ಸಾಯಬೇಕು', 'ಬದುಕಬೇಕಿಲ್ಲ',
  // Telugu
  'ఆత్మహత్య', 'చనిపోవాలి',
  // Tamil
  'தற்கொலை', 'இறந்துவிட',
];

/**
 * Check if text contains crisis indicators
 */
function detectCrisis(text) {
  const lower = text.toLowerCase();
  return CRISIS_KEYWORDS.some(keyword => lower.includes(keyword.toLowerCase()));
}

/**
 * Send email alert to admin via Resend
 */
async function sendCrisisAlert(caregiverName, caregiverId, triggerText) {
  if (!process.env.RESEND_API_KEY || !process.env.ADMIN_EMAIL) {
    console.warn('[Crisis] No RESEND_API_KEY or ADMIN_EMAIL set — skipping email alert');
    return;
  }

  try {
    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    await resend.emails.send({
      from: 'Caregiver Support <onboarding@resend.dev>',
      to: process.env.ADMIN_EMAIL,
      subject: `🚨 URGENT: Crisis Alert — ${caregiverName} needs immediate support`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #ef4444; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 20px;">🚨 Crisis Alert — Immediate Action Required</h1>
          </div>
          <div style="background: #fff; padding: 24px; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
            <p style="color: #374151; font-size: 16px;">
              A caregiver has expressed distress that may indicate a mental health crisis.
            </p>
            <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin: 16px 0; border-radius: 4px;">
              <p style="margin: 0; color: #991b1b; font-weight: bold;">Caregiver: ${caregiverName}</p>
              <p style="margin: 8px 0 0; color: #7f1d1d; font-size: 14px;">Trigger phrase detected in conversation</p>
            </div>
            <p style="color: #374151;">
              <strong>Immediate action required:</strong>
            </p>
            <ul style="color: #374151;">
              <li>Log into the admin dashboard immediately</li>
              <li>Escalate ${caregiverName} to a psychiatrist</li>
              <li>Ensure a mental health professional contacts them within the hour</li>
            </ul>
            <div style="margin-top: 24px; padding: 16px; background: #f3f4f6; border-radius: 8px;">
              <p style="margin: 0; color: #6b7280; font-size: 12px;">
                This is an automated alert from the Caregiver Support System.<br>
                User ID: ${caregiverId}
              </p>
            </div>
          </div>
        </div>
      `,
    });

    console.log(`[Crisis] Email alert sent to ${process.env.ADMIN_EMAIL} for user ${caregiverName}`);
  } catch (err) {
    console.error('[Crisis] Failed to send email alert:', err.message);
  }
}

/**
 * Auto-escalate caregiver and notify admin
 */
async function handleCrisis(user) {
  try {
    // Auto-escalate in DB
    await supabase
      .from('profiles')
      .update({ is_escalated: true })
      .eq('id', user.id);

    // Send email alert
    await sendCrisisAlert(user.name, user.id, '');

    console.log(`[Crisis] Auto-escalated user ${user.name} (${user.id})`);
  } catch (err) {
    console.error('[Crisis] handleCrisis error:', err.message);
  }
}

module.exports = { detectCrisis, handleCrisis };
