'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useStore } from '@/lib/store';

interface WeekScore {
  week_number: number;
  weekly_burnout_score: number;
  risk_level: string;
  average_sentiment: number;
  average_stress: number;
  evaluation_completed: boolean;
}

interface Cycle {
  cycleNumber: number;
  weeks: WeekScore[];
  averageScore: number;
  peakScore: number;
  riskLevel: string;
  escalationTriggered: boolean;
}

interface Report {
  profile: { id: string; name: string; week_joined: string };
  scores: WeekScore[];
  evaluations: { week_number: number; overall_score: number; completed_at: string }[];
  cycles: Cycle[];
}

const riskColors: Record<string, string> = {
  low: 'bg-green-400', moderate: 'bg-yellow-400',
  high: 'bg-orange-400', critical: 'bg-red-500',
};
const riskText: Record<string, string> = {
  low: 'text-green-700 bg-green-100', moderate: 'text-yellow-700 bg-yellow-100',
  high: 'text-orange-700 bg-orange-100', critical: 'text-red-700 bg-red-100',
};

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useStore();
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    if (!user || user.role !== 'admin') { router.replace('/login'); return; }
    api.get(`/admin/users/${id}/report`).then(({ data }) => setReport(data));
  }, [user]);

  if (!report) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Loading report...</p>
    </div>
  );

  const maxScore = Math.max(...(report.scores.map(s => s.weekly_burnout_score) || [100]), 1);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center gap-4">
        <button onClick={() => router.push('/admin')} className="text-sm text-indigo-500 hover:underline">← Admin</button>
        <span className="font-semibold text-gray-800">{report.profile.name} — Burnout Report</span>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">

        {/* Burnout chart */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Weekly Burnout Score</h2>
          {report.scores.length === 0 ? (
            <p className="text-gray-400 text-sm">No data yet</p>
          ) : (
            <div className="flex items-end gap-2 h-32">
              {report.scores.map(w => (
                <div key={w.week_number} className="flex flex-col items-center gap-1 flex-1 min-w-0">
                  <span className="text-xs text-gray-500 font-medium">{w.weekly_burnout_score}</span>
                  <div
                    className={`w-full rounded-t transition-all ${riskColors[w.risk_level]}`}
                    style={{ height: `${(w.weekly_burnout_score / 100) * 80}px` }}
                    title={`Week ${w.week_number}: ${w.weekly_burnout_score}/100 (${w.risk_level})`}
                  />
                  <span className="text-xs text-gray-400">W{w.week_number}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-4 mt-3 text-xs">
            {['low', 'moderate', 'high', 'critical'].map(r => (
              <div key={r} className="flex items-center gap-1">
                <div className={`w-3 h-3 rounded ${riskColors[r]}`} />
                <span className="text-gray-500 capitalize">{r}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Monthly cycles */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Monthly Cycles</h2>
          {report.cycles.length === 0 ? (
            <p className="text-gray-400 text-sm">Not enough data for monthly analysis yet (need 4 weeks)</p>
          ) : (
            <div className="space-y-3">
              {report.cycles.map(c => (
                <div key={c.cycleNumber} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Month {c.cycleNumber}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${riskText[c.riskLevel]}`}>
                        {c.riskLevel}
                      </span>
                      {c.escalationTriggered && (
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-medium">
                          Escalated
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-lg font-bold text-gray-800">{c.averageScore}</p>
                      <p className="text-xs text-gray-400">Avg score</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-gray-800">{c.peakScore}</p>
                      <p className="text-xs text-gray-400">Peak score</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-gray-800">{c.weeks.filter(w => w.evaluation_completed).length}/{c.weeks.length}</p>
                      <p className="text-xs text-gray-400">Check-ins done</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Weekly detail table */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Week by Week</h2>
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-400 uppercase">
              <tr>
                <th className="text-left pb-2">Week</th>
                <th className="text-left pb-2">Score</th>
                <th className="text-left pb-2">Risk</th>
                <th className="text-left pb-2">Stress</th>
                <th className="text-left pb-2">Check-in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {report.scores.map(w => (
                <tr key={w.week_number}>
                  <td className="py-2 text-gray-600">Week {w.week_number}</td>
                  <td className="py-2 font-medium text-gray-800">{w.weekly_burnout_score}/100</td>
                  <td className="py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${riskText[w.risk_level]}`}>{w.risk_level}</span>
                  </td>
                  <td className="py-2 text-gray-500">{w.average_stress?.toFixed(1) ?? '—'}/10</td>
                  <td className="py-2">{w.evaluation_completed ? '✅' : '—'}</td>
                </tr>
              ))}
              {report.scores.length === 0 && (
                <tr><td colSpan={5} className="py-4 text-center text-gray-400">No data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
