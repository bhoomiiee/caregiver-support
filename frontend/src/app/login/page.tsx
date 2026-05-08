'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import api from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useStore((s) => s.setAuth);
  const [isRegister, setIsRegister] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      if (isRegister) {
        const { data } = await api.post('/auth/register', form);
        setAuth(data.user, data.token);
        router.push('/companion');
      } else {
        const { data } = await api.post('/auth/login', { email: form.email, password: form.password });
        setAuth(data.user, data.token);
        if (data.user.role === 'caregiver') router.push('/companion');
        else if (data.user.role === 'admin') router.push('/admin');
        else router.push('/psychiatrist');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Something went wrong');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{
        backgroundImage: 'url(/login-bg.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundColor: '#f5f3ff',
      }}>

      {/* Subtle overlay to ensure card readability */}
      <div className="absolute inset-0" style={{ background: 'rgba(245,243,255,0.15)' }} />

      {/* Login card — perfectly centered */}
      <div className="relative z-10 w-full max-w-sm mx-auto px-4">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-3 float"
            style={{ background: 'linear-gradient(135deg, #9b87f5, #7c5fe6)', boxShadow: '0 0 30px rgba(155,135,245,0.4)' }}>
            <span className="text-2xl">🌿</span>
          </div>
          <h1 className="text-2xl font-bold text-lavender-800">Caregiver Support</h1>
          <p className="text-lavender-500 text-sm mt-1 font-light">Your emotional wellness companion</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl p-7 border border-lavender-100"
          style={{ boxShadow: '0 8px 40px rgba(155,135,245,0.2), 0 2px 8px rgba(0,0,0,0.04)' }}>
          <h2 className="text-lavender-800 font-semibold text-base mb-5">
            {isRegister ? 'Create your account' : 'Welcome back ✨'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div>
                <label className="text-xs text-lavender-500 font-medium mb-1.5 block">Your name</label>
                <input type="text" placeholder="Enter your name" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })} required
                  className="w-full rounded-xl px-4 py-3 text-sm text-lavender-800 placeholder-lavender-300 bg-lavender-50 border border-lavender-200 focus:outline-none focus:ring-2 focus:ring-lavender-400 transition" />
              </div>
            )}
            <div>
              <label className="text-xs text-lavender-500 font-medium mb-1.5 block">Email address</label>
              <input type="email" placeholder="you@example.com" value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })} required
                className="w-full rounded-xl px-4 py-3 text-sm text-lavender-800 placeholder-lavender-300 bg-lavender-50 border border-lavender-200 focus:outline-none focus:ring-2 focus:ring-lavender-400 transition" />
            </div>
            <div>
              <label className="text-xs text-lavender-500 font-medium mb-1.5 block">Password</label>
              <input type="password" placeholder="••••••••" value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })} required
                className="w-full rounded-xl px-4 py-3 text-sm text-lavender-800 placeholder-lavender-300 bg-lavender-50 border border-lavender-200 focus:outline-none focus:ring-2 focus:ring-lavender-400 transition" />
            </div>

            {error && (
              <div className="rounded-xl px-4 py-3 text-sm text-red-600 bg-red-50 border border-red-200">{error}</div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 mt-1"
              style={{ background: 'linear-gradient(135deg, #9b87f5, #7c5fe6)', boxShadow: '0 4px 20px rgba(155,135,245,0.4)' }}>
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Please wait...
                </span>
              ) : isRegister ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-sm text-lavender-400 mt-5">
            {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button onClick={() => { setIsRegister(!isRegister); setError(''); }}
              className="text-lavender-600 font-semibold hover:text-lavender-700 transition">
              {isRegister ? 'Sign in' : 'Sign up'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
