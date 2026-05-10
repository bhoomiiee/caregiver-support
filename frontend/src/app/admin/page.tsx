'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useStore } from '@/lib/store';

interface CaregiverRow {
  id: string; name: string; is_escalated: boolean;
  crisis_escalated?: boolean; escalation_reason?: string;
  assigned_psychiatrist: string | null;
  psychiatrist?: { name: string } | null;
  week_joined: string;
  latestBurnout: { weekNumber: number; score: number; riskLevel: string } | null;
}
interface Psychiatrist { id: string; name: string; }
type Tab = 'caregivers' | 'high-risk' | 'create';

const riskBadge: Record<string, string> = {
  low: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  moderate: 'bg-amber-100 text-amber-700 border-amber-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  critical: 'bg-red-100 text-red-700 border-red-200',
};

export default function AdminPage() {
  const router = useRouter();
  const { user, logout } = useStore();
  const [tab, setTab] = useState<Tab>('caregivers');
  const [users, setUsers] = useState<CaregiverRow[]>([]);
  const [psychiatrists, setPsychiatrists] = useState<Psychiatrist[]>([]);
  const [loading, setLoading] = useState(true);
  const [escalateModal, setEscalateModal] = useState<CaregiverRow | null>(null);
  const [selectedPsych, setSelectedPsych] = useState('');
  const [createForm, setCreateForm] = useState({ name: '', email: '', password: '', role: 'psychiatrist' });
  const [createMsg, setCreateMsg] = useState('');

  useEffect(() => {
    if (!user) { router.replace('/login'); return; }
    if (user.role !== 'admin') { router.replace('/'); return; }
    fetchData();
  }, [user]);

  async function fetchData() {
    setLoading(true);
    try {
      const [u, p] = await Promise.all([api.get('/admin/users'), api.get('/admin/psychiatrists')]);
      setUsers(u.data.users); setPsychiatrists(p.data.psychiatrists);
    } finally { setLoading(false); }
  }

  async function handleEscalate() {
    if (!escalateModal) return;
    await api.post(`/admin/escalate/${escalateModal.id}`, { psychiatristId: selectedPsych || null });
    setEscalateModal(null); setSelectedPsych(''); fetchData();
  }

  async function handleDeescalate(id: string) { await api.post(`/admin/deescalate/${id}`, {}); fetchData(); }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setCreateMsg('');
    try {
      await api.post('/admin/users', createForm);
      setCreateMsg(`✓ ${createForm.role} account created`);
      setCreateForm({ name: '', email: '', password: '', role: 'psychiatrist' }); fetchData();
    } catch (err: any) { setCreateMsg(`Error: ${err.response?.data?.error || err.message}`); }
  }

  const highRisk = users.filter(u => ['high', 'critical'].includes(u.latestBurnout?.riskLevel ?? ''));
  const displayed = tab === 'high-risk' ? highRisk : users;

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(145deg, #faf8ff 0%, #ede9ff 60%, #f3efff 100%)' }}>
      <div className="fixed top-0 right-0 w-96 h-96 rounded-full blur-3xl opacity-20 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #c4b5fd, transparent)' }} />

      <header className="relative z-10 bg-white border-b border-lavender-100 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shadow-soft"
            style={{ background: 'linear-gradient(135deg, #9b87f5, #7c5fe6)' }}>🌿</div>
          <span className="text-lavender-800 font-semibold">Admin Dashboard</span>
        </div>
        <button onClick={() => { logout(); router.push('/login'); }}
          className="text-xs text-lavender-400 hover:text-lavender-600 transition px-3 py-1.5 rounded-lg bg-lavender-50 border border-lavender-100">
          Sign out
        </button>
      </header>

      <main className="relative z-10 max-w-5xl mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Total Caregivers', value: users.length, icon: '👥', color: 'text-lavender-700', bg: 'bg-lavender-100' },
            { label: 'High Risk', value: highRisk.length, icon: '⚠️', color: 'text-orange-700', bg: 'bg-orange-50' },
            { label: 'Escalated', value: users.filter(u => u.is_escalated).length, icon: '🔴', color: 'text-purple-700', bg: 'bg-purple-50' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl p-5 shadow-card border border-lavender-100">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3 ${s.bg}`}>{s.icon}</div>
              <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-lavender-400 text-xs mt-1 font-light">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {(['caregivers', 'high-risk', 'create'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-all border"
              style={tab === t
                ? { background: 'linear-gradient(135deg, #9b87f5, #7c5fe6)', color: 'white', borderColor: 'transparent' }
                : { background: 'white', color: '#9b87f5', borderColor: '#e9e3ff' }}>
              {t === 'caregivers' ? '👥 All Caregivers' : t === 'high-risk' ? '⚠️ High Risk' : '+ Create Account'}
            </button>
          ))}
        </div>

        {/* Create form */}
        {tab === 'create' && (
          <div className="bg-white rounded-3xl p-6 max-w-md shadow-card border border-lavender-100">
            <h2 className="text-lavender-800 font-semibold mb-5">Create Admin or Psychiatrist Account</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              {[['name', 'text', 'Full name'], ['email', 'email', 'Email address'], ['password', 'password', 'Password']].map(([field, type, placeholder]) => (
                <input key={field} type={type} placeholder={placeholder} required
                  value={(createForm as any)[field]}
                  onChange={e => setCreateForm({ ...createForm, [field]: e.target.value })}
                  className="w-full rounded-xl px-4 py-3 text-sm text-lavender-800 placeholder-lavender-300 bg-lavender-50 border border-lavender-200 focus:outline-none focus:ring-2 focus:ring-lavender-400 transition" />
              ))}
              <select value={createForm.role} onChange={e => setCreateForm({ ...createForm, role: e.target.value })}
                className="w-full rounded-xl px-4 py-3 text-sm text-lavender-800 bg-lavender-50 border border-lavender-200 focus:outline-none focus:ring-2 focus:ring-lavender-400">
                <option value="psychiatrist">Psychiatrist</option>
                <option value="admin">Admin</option>
              </select>
              {createMsg && <p className={`text-xs font-medium ${createMsg.startsWith('✓') ? 'text-emerald-600' : 'text-red-500'}`}>{createMsg}</p>}
              <button type="submit" className="w-full py-3 rounded-xl text-sm font-semibold text-white shadow-glow transition hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #9b87f5, #7c5fe6)' }}>
                Create Account
              </button>
            </form>
          </div>
        )}

        {/* Table */}
        {tab !== 'create' && (
          loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 rounded-full border-2 border-lavender-400 border-t-transparent animate-spin" />
            </div>
          ) : (
            <div className="bg-white rounded-3xl overflow-hidden shadow-card border border-lavender-100">
              <table className="w-full text-sm">
                <thead className="bg-lavender-50 border-b border-lavender-100">
                  <tr>
                    {['Name', 'Risk Level', 'Score', 'Status', 'Actions'].map(h => (
                      <th key={h} className="px-5 py-4 text-left text-xs font-semibold text-lavender-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(u => (
                    <tr key={u.id} className="border-t border-lavender-50 hover:bg-lavender-50/50 transition">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-soft"
                            style={{ background: 'linear-gradient(135deg, #9b87f5, #7c5fe6)' }}>
                            {u.name[0]?.toUpperCase()}
                          </div>
                          <span className="text-lavender-800 font-medium">{u.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {u.latestBurnout ? (
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${riskBadge[u.latestBurnout.riskLevel]}`}>
                            {u.latestBurnout.riskLevel}
                          </span>
                        ) : <span className="text-lavender-300 text-xs">no data</span>}
                      </td>
                      <td className="px-5 py-4 text-lavender-700 font-semibold">
                        {u.latestBurnout ? `${u.latestBurnout.score}/100` : '—'}
                      </td>
                      <td className="px-5 py-4">
                        {u.is_escalated ? (
                          <div className="flex flex-col gap-0.5">
                            {u.crisis_escalated ? (
                              <span className="text-xs text-red-600 font-bold flex items-center gap-1">
                                🚨 Crisis Escalated
                              </span>
                            ) : (
                              <span className="text-xs text-purple-600 font-medium flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 inline-block" />Escalated
                              </span>
                            )}
                            {u.escalation_reason === 'crisis_voice_conversation' && (
                              <span className="text-xs text-red-400">via voice conversation</span>
                            )}
                            {u.psychiatrist?.name && (
                              <span className="text-xs text-lavender-400">
                                Dr. {u.psychiatrist.name}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-emerald-600 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />Active
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          {!u.is_escalated
                            ? <button onClick={() => { setEscalateModal(u); setSelectedPsych(''); }} className="text-xs text-lavender-500 hover:text-lavender-700 font-medium transition">Escalate</button>
                            : <button onClick={() => handleDeescalate(u.id)} className="text-xs text-lavender-300 hover:text-lavender-500 transition">Remove</button>}
                          <button onClick={() => router.push(`/admin/report/${u.id}`)}
                            className={`text-xs transition font-medium ${u.crisis_escalated ? 'text-red-500 hover:text-red-700' : 'text-lavender-400 hover:text-lavender-600'}`}>
                            {u.is_escalated && u.psychiatrist?.name
                              ? `Report → ${u.psychiatrist.name}`
                              : 'Report →'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {displayed.length === 0 && (
                    <tr><td colSpan={5} className="px-5 py-12 text-center text-lavender-300 text-sm">No users found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )
        )}
      </main>

      {/* Modal */}
      {escalateModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 px-4"
          style={{ background: 'rgba(155,135,245,0.15)', backdropFilter: 'blur(8px)' }}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-soft border border-lavender-200">
            <h3 className="text-lavender-800 font-semibold mb-1">Escalate {escalateModal.name}</h3>
            <p className="text-lavender-400 text-xs mb-5 font-light">Assign a psychiatrist to support this caregiver.</p>
            <select value={selectedPsych} onChange={e => setSelectedPsych(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-sm text-lavender-800 bg-lavender-50 border border-lavender-200 mb-5 focus:outline-none focus:ring-2 focus:ring-lavender-400">
              <option value="">No specific psychiatrist</option>
              {psychiatrists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="flex gap-3">
              <button onClick={() => setEscalateModal(null)}
                className="flex-1 py-3 rounded-xl text-sm text-lavender-500 bg-lavender-50 border border-lavender-200 hover:bg-lavender-100 transition">Cancel</button>
              <button onClick={handleEscalate}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-white shadow-glow transition hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #9b87f5, #7c5fe6)' }}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
