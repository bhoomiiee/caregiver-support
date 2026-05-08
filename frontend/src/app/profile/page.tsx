'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useStore } from '@/lib/store';

interface ProfileData {
  user: { id: string; name: string; role: string; week_joined: string };
  stats: { currentWeek: number; totalSessions: number; completedCheckIns: number; latestRisk: string | null };
}

const riskConfig: Record<string, { bg: string; label: string; emoji: string; text: string }> = {
  low:      { bg: 'linear-gradient(135deg, #34d399, #10b981)', label: 'Doing well', emoji: '🌱', text: 'text-emerald-700' },
  moderate: { bg: 'linear-gradient(135deg, #fbbf24, #f59e0b)', label: 'Some stress detected', emoji: '🌤️', text: 'text-amber-700' },
  high:     { bg: 'linear-gradient(135deg, #fb923c, #ea580c)', label: 'High stress — take care', emoji: '⚡', text: 'text-orange-700' },
  critical: { bg: 'linear-gradient(135deg, #f87171, #dc2626)', label: 'Please rest and seek support', emoji: '🆘', text: 'text-red-700' },
};

export default function ProfilePage() {
  const router = useRouter();
  const { user, logout } = useStore();
  const [profile, setProfile] = useState<ProfileData | null>(null);

  useEffect(() => {
    if (!user) { router.replace('/login'); return; }
    api.get('/auth/profile').then(({ data }) => setProfile(data)).catch(() => {});
  }, [user]);

  if (!profile) return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(145deg, #faf8ff 0%, #ede9ff 60%, #f3efff 100%)' }}>
      <div className="w-8 h-8 rounded-full border-2 border-lavender-400 border-t-transparent animate-spin" />
    </div>
  );

  const risk = profile.stats.latestRisk ? riskConfig[profile.stats.latestRisk] : null;
  const joinDate = new Date(profile.user.week_joined).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(145deg, #faf8ff 0%, #ede9ff 60%, #f3efff 100%)' }}>
      <div className="fixed top-0 right-0 w-72 h-72 rounded-full blur-3xl opacity-30 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #c4b5fd, transparent)' }} />

      <header className="relative z-10 flex items-center justify-between px-6 py-5">
        <button onClick={() => router.push('/companion')}
          className="flex items-center gap-2 text-lavender-500 hover:text-lavender-700 transition text-sm font-medium">
          ← Back
        </button>
        <button onClick={() => { logout(); router.push('/login'); }}
          className="text-xs text-lavender-400 hover:text-lavender-600 transition px-3 py-1.5 rounded-lg bg-white border border-lavender-100 shadow-sm">
          Sign out
        </button>
      </header>

      <main className="relative z-10 max-w-sm mx-auto px-6 pb-10 space-y-4">
        {/* Avatar */}
        <div className="bg-white rounded-3xl p-6 text-center shadow-card border border-lavender-100">
          <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold text-white mx-auto mb-4 float shadow-glow"
            style={{ background: 'linear-gradient(135deg, #9b87f5, #7c5fe6)' }}>
            {profile.user.name[0]?.toUpperCase()}
          </div>
          <h1 className="text-xl font-bold text-lavender-800">{profile.user.name}</h1>
          <p className="text-lavender-400 text-xs mt-1 font-light">Caregiver since {joinDate}</p>
          <p className="text-lavender-300 text-xs font-light">Week {profile.stats.currentWeek} of your journey</p>
        </div>

        {/* Wellness */}
        {risk && (
          <div className="rounded-3xl p-5 shadow-soft" style={{ background: risk.bg }}>
            <div className="flex items-center gap-3">
              <span className="text-3xl">{risk.emoji}</span>
              <div>
                <p className="text-white text-xs font-semibold opacity-80 uppercase tracking-wide">Current wellness</p>
                <p className="text-white text-lg font-bold">{risk.label}</p>
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Week', value: profile.stats.currentWeek, icon: '📅' },
            { label: 'Sessions', value: profile.stats.totalSessions, icon: '🎙️' },
            { label: 'Check-ins', value: profile.stats.completedCheckIns, icon: '✅' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl p-4 text-center shadow-card border border-lavender-100">
              <p className="text-xl mb-1">{s.icon}</p>
              <p className="text-2xl font-bold text-lavender-700">{s.value}</p>
              <p className="text-xs text-lavender-400 font-light">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Self-care */}
        <div className="bg-white rounded-3xl p-5 shadow-card border border-lavender-100">
          <p className="text-lavender-800 text-sm font-semibold mb-4">Daily reminders 💙</p>
          <div className="space-y-3">
            {[
              { icon: '💧', text: 'Drink a glass of water right now' },
              { icon: '🌬️', text: 'Take 3 deep breaths before your next task' },
              { icon: '🚶', text: 'Step outside for 5 minutes today' },
              { icon: '😴', text: 'Aim for 7-8 hours of sleep tonight' },
              { icon: '🍎', text: 'Eat something nourishing today' },
            ].map((r, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xl w-8 text-center">{r.icon}</span>
                <span className="text-lavender-600 text-sm font-light">{r.text}</span>
              </div>
            ))}
          </div>
        </div>

        <button onClick={() => router.push('/companion')}
          className="w-full py-3.5 rounded-2xl text-sm font-semibold text-white shadow-glow transition hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #9b87f5, #7c5fe6)' }}>
          Return to companion
        </button>
      </main>
    </div>
  );
}
