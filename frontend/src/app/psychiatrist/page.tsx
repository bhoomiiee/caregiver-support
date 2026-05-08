'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';

interface EmotionEntry { date: string; emotion: string; stress: number; sentiment: number; }
interface BurnoutScore { week_number: number; weekly_burnout_score: number; risk_level: string; }
interface Case {
  user: { id: string; name: string; week_joined: string };
  latestBurnout: BurnoutScore | null;
  recentEmotions: EmotionEntry[];
}

const riskBadge: Record<string, string> = {
  low: 'bg-emerald-100 text-emerald-700', moderate: 'bg-amber-100 text-amber-700',
  high: 'bg-orange-100 text-orange-700', critical: 'bg-red-100 text-red-700',
};
const emotionEmoji: Record<string, string> = {
  happiness: '😊', sadness: '😢', stress: '😰', anger: '😠',
  anxiety: '😟', loneliness: '😔', exhaustion: '😩', neutral: '😐',
};

export default function PsychiatristPage() {
  const router = useRouter();
  const { user, logout } = useStore();
  const [cases, setCases] = useState<Case[]>([]);
  const [selected, setSelected] = useState<Case | null>(null);
  const [history, setHistory] = useState<any>(null);
  const [note, setNote] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isJoined, setIsJoined] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [liveMessages, setLiveMessages] = useState<{ role: string; content: string }[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) { router.replace('/login'); return; }
    if (!['psychiatrist', 'admin'].includes(user.role)) { router.replace('/'); return; }
    api.get('/psychiatrist/cases')
      .then(({ data }) => { setCases(data.cases); setLoading(false); })
      .catch((err) => {
        console.error('Cases error:', err.response?.data || err.message);
        setLoading(false);
      });
  }, [user]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [liveMessages]);

  async function selectCase(c: Case) {
    if (selected && isJoined) await handleLeave();
    setSelected(c); setHistory(null); setNote(''); setNoteSaved(false);
    setIsJoined(false); setLiveMessages([]);
    const { data } = await api.get(`/psychiatrist/cases/${c.user.id}/history`);
    setHistory(data);
  }

  async function handleJoin() {
    if (!selected) return;
    try {
      await api.post(`/psychiatrist/cases/${selected.user.id}/join`);
      setIsJoined(true);
    } catch (err: any) {
      console.error('Join error:', err.response?.data || err.message);
      alert('Could not join session. Make sure your account has psychiatrist role.');
      return;
    }
    const channel = supabase.channel(`session-${selected.user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'active_sessions', filter: `caregiver_id=eq.${selected.user.id}` },
        (payload) => {
          const msg = payload.new as any;
          if (msg.last_message_role === 'caregiver' && msg.last_message)
            setLiveMessages(prev => [...prev, { role: 'caregiver', content: msg.last_message }]);
        }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }

  async function handleLeave() {
    if (!selected) return;
    await api.post(`/psychiatrist/cases/${selected.user.id}/leave`);
    setIsJoined(false);
  }

  async function sendMessage() {
    if (!message.trim() || !selected || sending) return;
    setSending(true);
    try {
      await api.post(`/psychiatrist/cases/${selected.user.id}/message`, { message });
      setLiveMessages(prev => [...prev, { role: 'psychiatrist', content: message }]);
      setMessage('');
    } catch (err: any) {
      console.error('Send error:', err.response?.data || err.message);
      alert('Could not send message: ' + (err.response?.data?.error || err.message));
    } finally { setSending(false); }
  }

  async function saveNote() {
    if (!note.trim() || !selected) return;
    await api.post(`/psychiatrist/cases/${selected.user.id}/notes`, { note });
    setNote(''); setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 3000);
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(145deg, #faf8ff 0%, #ede9ff 60%, #f3efff 100%)' }}>
      <div className="fixed top-0 right-0 w-96 h-96 rounded-full blur-3xl opacity-20 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #c4b5fd, transparent)' }} />

      <header className="relative z-10 bg-white border-b border-lavender-100 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shadow-soft"
            style={{ background: 'linear-gradient(135deg, #9b87f5, #7c5fe6)' }}>🌿</div>
          <span className="text-lavender-800 font-semibold">Psychiatrist Portal</span>
          {isJoined && selected && (
            <span className="ml-2 bg-emerald-100 text-emerald-700 text-xs px-3 py-1 rounded-full font-medium border border-emerald-200 animate-pulse">
              🟢 Live — supporting {selected.user.name}
            </span>
          )}
        </div>
        <button onClick={() => { logout(); router.push('/login'); }}
          className="text-xs text-lavender-400 hover:text-lavender-600 transition px-3 py-1.5 rounded-lg bg-lavender-50 border border-lavender-100">
          Sign out
        </button>
      </header>

      <div className="relative z-10 flex max-w-5xl mx-auto px-6 py-8 gap-6">
        {/* Case list */}
        <div className="w-64 shrink-0">
          <h2 className="text-xs font-semibold text-lavender-500 uppercase tracking-wide mb-3">
            Cases ({cases.length})
          </h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 rounded-full border-2 border-lavender-400 border-t-transparent animate-spin" />
            </div>
          ) : cases.length === 0 ? (
            <div className="bg-white rounded-2xl p-4 text-center shadow-card border border-lavender-100">
              <p className="text-lavender-400 text-sm font-light">No cases assigned yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cases.map(c => (
                <button key={c.user.id} onClick={() => selectCase(c)}
                  className={`w-full text-left bg-white rounded-2xl px-4 py-3 shadow-card border transition hover:shadow-soft ${selected?.user.id === c.user.id ? 'border-lavender-400 ring-2 ring-lavender-200' : 'border-lavender-100'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ background: 'linear-gradient(135deg, #9b87f5, #7c5fe6)' }}>
                      {c.user.name[0]?.toUpperCase()}
                    </div>
                    <p className="font-medium text-lavender-800 text-sm">{c.user.name}</p>
                  </div>
                  {c.latestBurnout && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${riskBadge[c.latestBurnout.risk_level]}`}>
                      {c.latestBurnout.risk_level} · {c.latestBurnout.weekly_burnout_score}/100
                    </span>
                  )}
                  <div className="flex gap-1 mt-2">
                    {c.recentEmotions.slice(0, 5).map((e, i) => (
                      <span key={i} title={e.emotion} className="text-sm">{emotionEmoji[e.emotion] || '😐'}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail */}
        <div className="flex-1 space-y-4">
          {!selected ? (
            <div className="flex items-center justify-center h-64 bg-white rounded-3xl shadow-card border border-lavender-100">
              <p className="text-lavender-300 text-sm font-light">Select a case to view details</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="bg-white rounded-3xl p-6 shadow-card border border-lavender-100">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-lavender-800">{selected.user.name}</h2>
                    {selected.latestBurnout && (
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium mt-1 inline-block ${riskBadge[selected.latestBurnout.risk_level]}`}>
                        {selected.latestBurnout.risk_level} risk · {selected.latestBurnout.weekly_burnout_score}/100
                      </span>
                    )}
                  </div>
                  {!isJoined ? (
                    <button onClick={handleJoin}
                      className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-soft transition hover:opacity-90"
                      style={{ background: 'linear-gradient(135deg, #34d399, #10b981)' }}>
                      🎧 Join Session
                    </button>
                  ) : (
                    <button onClick={handleLeave}
                      className="px-5 py-2.5 rounded-xl text-sm font-medium text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 transition">
                      Leave Session
                    </button>
                  )}
                </div>
                {isJoined && (
                  <div className="mt-3 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                    <p className="text-xs text-emerald-700 font-medium">
                      🟢 You have joined this session. The caregiver believes they are still talking to the AI. Your messages will be spoken as the AI voice.
                    </p>
                  </div>
                )}
              </div>

              {/* Live chat */}
              {isJoined && (
                <div className="bg-white rounded-3xl p-6 shadow-card border border-lavender-100">
                  <h3 className="text-sm font-semibold text-lavender-700 mb-3">Live Session</h3>
                  <div className="h-48 overflow-y-auto space-y-2 mb-4 bg-lavender-50 rounded-2xl p-3 border border-lavender-100">
                    {liveMessages.length === 0 && (
                      <p className="text-xs text-lavender-300 text-center mt-8 font-light">Waiting for caregiver to speak...</p>
                    )}
                    {liveMessages.map((m, i) => (
                      <div key={i} className={`flex ${m.role === 'psychiatrist' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-xs px-3 py-2 rounded-xl text-xs ${m.role === 'psychiatrist' ? 'text-white shadow-soft' : 'bg-white border border-lavender-100 text-lavender-700'}`}
                          style={m.role === 'psychiatrist' ? { background: 'linear-gradient(135deg, #9b87f5, #7c5fe6)' } : {}}>
                          <p className="text-xs opacity-60 mb-0.5">{m.role === 'psychiatrist' ? 'You (as AI)' : selected.user.name}</p>
                          {m.content}
                        </div>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                  <div className="flex gap-2">
                    <input value={message} onChange={e => setMessage(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && sendMessage()}
                      placeholder="Type a response (spoken as AI voice)..."
                      className="flex-1 rounded-xl px-4 py-2.5 text-sm text-lavender-800 placeholder-lavender-300 bg-lavender-50 border border-lavender-200 focus:outline-none focus:ring-2 focus:ring-lavender-400" />
                    <button onClick={sendMessage} disabled={!message.trim() || sending}
                      className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-soft disabled:opacity-40 transition hover:opacity-90"
                      style={{ background: 'linear-gradient(135deg, #9b87f5, #7c5fe6)' }}>
                      {sending ? '...' : 'Send'}
                    </button>
                  </div>
                </div>
              )}

              {/* Burnout trend */}
              {history?.burnoutHistory?.length > 0 && (
                <div className="bg-white rounded-3xl p-6 shadow-card border border-lavender-100">
                  <h3 className="text-sm font-semibold text-lavender-700 mb-4">Burnout Trend</h3>
                  <div className="flex items-end gap-2 h-16">
                    {history.burnoutHistory.slice(-8).map((w: any) => (
                      <div key={w.week_number} className="flex flex-col items-center gap-1 flex-1">
                        <div className="w-full rounded-t transition-all"
                          style={{
                            height: `${(w.weekly_burnout_score / 100) * 48}px`,
                            background: w.risk_level === 'critical' ? '#f87171' : w.risk_level === 'high' ? '#fb923c' : w.risk_level === 'moderate' ? '#fbbf24' : '#34d399',
                          }} />
                        <span className="text-xs text-lavender-400">W{w.week_number}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent emotions */}
              <div className="bg-white rounded-3xl p-6 shadow-card border border-lavender-100">
                <h3 className="text-sm font-semibold text-lavender-700 mb-3">Recent Emotional States</h3>
                {selected.recentEmotions.length === 0 ? (
                  <p className="text-lavender-300 text-sm font-light">No sessions yet</p>
                ) : (
                  <div className="space-y-2">
                    {selected.recentEmotions.map((e, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span>{emotionEmoji[e.emotion] || '😐'}</span>
                          <span className="text-lavender-700 text-sm capitalize">{e.emotion || 'unknown'}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-lavender-400">
                          <span>Stress {e.stress?.toFixed(1) ?? '—'}/10</span>
                          <span className={e.sentiment > 0 ? 'text-emerald-500' : 'text-red-400'}>
                            {e.sentiment > 0 ? '+' : ''}{e.sentiment?.toFixed(2) ?? '—'}
                          </span>
                          <span>{new Date(e.date).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="bg-white rounded-3xl p-6 shadow-card border border-lavender-100">
                <h3 className="text-sm font-semibold text-lavender-700 mb-3">Clinical Notes</h3>
                <textarea value={note} onChange={e => setNote(e.target.value)}
                  placeholder="Private clinical notes (not visible to caregiver)..."
                  rows={3}
                  className="w-full rounded-xl px-4 py-3 text-sm text-lavender-800 placeholder-lavender-300 bg-lavender-50 border border-lavender-200 resize-none focus:outline-none focus:ring-2 focus:ring-lavender-400" />
                <div className="flex items-center justify-between mt-2">
                  {noteSaved && <p className="text-xs text-emerald-500 font-medium">Saved ✓</p>}
                  <button onClick={saveNote} disabled={!note.trim()}
                    className="ml-auto px-4 py-2 rounded-xl text-xs font-semibold text-white shadow-soft disabled:opacity-40 transition hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #9b87f5, #7c5fe6)' }}>
                    Save note
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
