'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { useStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type Status = 'idle' | 'listening' | 'processing' | 'speaking';

const LANGUAGES = [
  { code: 'en', label: '🇬🇧 English' },
  { code: 'hi', label: '🇮🇳 Hindi' },
  { code: 'ta', label: '🇮🇳 Tamil' },
  { code: 'te', label: '🇮🇳 Telugu' },
  { code: 'kn', label: '🇮🇳 Kannada' },
  { code: 'ml', label: '🇮🇳 Malayalam' },
  { code: 'bn', label: '🇮🇳 Bengali' },
  { code: 'mr', label: '🇮🇳 Marathi' },
  { code: 'ur', label: '🇵🇰 Urdu' },
  { code: 'es', label: '🇪🇸 Spanish' },
  { code: 'fr', label: '🇫🇷 French' },
  { code: 'ar', label: '🇸🇦 Arabic' },
  { code: 'zh', label: '🇨🇳 Chinese' },
  { code: 'de', label: '🇩🇪 German' },
  { code: 'pt', label: '🇧🇷 Portuguese' },
  { code: 'ja', label: '🇯🇵 Japanese' },
];

const LANG_BCP47: Record<string, string> = {
  en: 'en-US', hi: 'hi-IN', ta: 'ta-IN', te: 'te-IN',
  kn: 'kn-IN', ml: 'ml-IN', bn: 'bn-IN', mr: 'mr-IN',
  ur: 'ur-PK', es: 'es-ES', fr: 'fr-FR', ar: 'ar-SA',
  zh: 'zh-CN', de: 'de-DE', pt: 'pt-BR', ja: 'ja-JP',
};

export default function CompanionPage() {
  const router = useRouter();
  const { user, logout } = useStore();
  const [status, setStatus] = useState<Status>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [hasPendingEval, setHasPendingEval] = useState(false);
  const [evalId, setEvalId] = useState<string | null>(null);
  const [psychiatristActive, setPsychiatristActive] = useState(false);
  const [language, setLanguage] = useState('en');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const isRecordingRef = useRef(false);

  useEffect(() => {
    if (!user) { router.replace('/login'); return; }
    if (!localStorage.getItem('token')) { router.replace('/login'); return; }

    api.get('/evaluation/pending').then(({ data }) => {
      if (data.hasPending) { setHasPendingEval(true); setEvalId(data.evaluation.id); }
    }).catch(() => {});

    api.get('/auth/profile').then(({ data }) => {
      const savedLang = data.user?.preferred_language;
      if (savedLang && savedLang !== 'en') setLanguage(savedLang);
    }).catch(() => {});

    const channel = supabase.channel(`companion-${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'active_sessions',
        filter: `caregiver_id=eq.${user.id}`,
      }, (payload) => {
        const s = payload.new as any;
        setPsychiatristActive(s?.is_psychiatrist_active === true);
        if (s?.last_message_role === 'assistant' && s?.last_message) {
          setLastMessage(s.last_message);
          speak(s.last_message, 'en'); // psychiatrist messages always in English
        }
      }).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, router]);

  const startRecording = useCallback(async () => {
    if (status !== 'idle' || isRecordingRef.current) return;
    setErrorMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = []; isRecordingRef.current = true;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop()); isRecordingRef.current = false;
        if (!chunksRef.current.length) { setStatus('idle'); return; }
        await sendAudio(new Blob(chunksRef.current, { type: 'audio/webm' }));
      };
      recorder.start(100); mediaRecorderRef.current = recorder; setStatus('listening');
    } catch { setErrorMsg('Microphone access denied.'); setStatus('idle'); }
  }, [status]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && status === 'listening') {
      // Unlock speech synthesis during user gesture
      if ('speechSynthesis' in window) {
        const unlock = new SpeechSynthesisUtterance('');
        window.speechSynthesis.speak(unlock);
        window.speechSynthesis.cancel();
      }
      mediaRecorderRef.current.stop(); setStatus('processing');
    }
  }, [status]);

  async function sendAudio(blob: Blob) {
    setStatus('processing');
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'recording.webm');
      if (sessionId) formData.append('sessionId', sessionId);
      formData.append('language', language);

      const response = await api.post('/voice/interact', formData, { responseType: 'arraybuffer' });
      const contentType = String(response.headers['content-type'] || '');

      if (contentType.includes('application/json')) {
        const json = JSON.parse(new TextDecoder().decode(response.data));
        if (json.sessionId) setSessionId(json.sessionId);
        if (json.waitingForPsychiatrist) { setStatus('idle'); return; }
        if (json.fallbackText) {
          setLastMessage(json.fallbackText);
          speak(json.fallbackText, language);
        } else {
          setStatus('idle');
        }
        return;
      }

      // Audio response from server TTS
      const sid = response.headers['x-session-id'];
      const transcript = decodeURIComponent(response.headers['x-transcript'] || '');
      if (sid) setSessionId(String(sid));
      if (transcript) setLastMessage(transcript);

      const audioBlob = new Blob([response.data], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      setStatus('speaking');
      audio.onended = () => { URL.revokeObjectURL(audioUrl); setStatus('idle'); };
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        // Server audio failed — fall back to browser speech
        if (transcript) speak(transcript, language);
        else setStatus('idle');
      };
      audio.play().catch(() => {
        if (transcript) speak(transcript, language);
        else setStatus('idle');
      });
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Something went wrong. Please try again.');
      setStatus('idle');
    }
  }

  function speak(text: string, lang: string) {
    if (!('speechSynthesis' in window)) { setStatus('idle'); return; }
    window.speechSynthesis.cancel();

    const targetLang = LANG_BCP47[lang] || 'en-US';
    const voices = window.speechSynthesis.getVoices();

    // Find best matching voice
    const match = voices.find(v => v.lang === targetLang)
      || voices.find(v => v.lang.startsWith(targetLang.split('-')[0]))
      || voices.find(v => v.lang.startsWith('en'))  // fallback to English voice
      || voices[0];

    const u = new SpeechSynthesisUtterance(text);
    u.lang = match?.lang || 'en-US';
    u.voice = match || null as any;
    u.rate = 0.92;
    u.pitch = 1.0;
    u.volume = 1;

    setStatus('speaking');
    u.onend = () => setStatus('idle');
    u.onerror = (e) => { console.warn('Speech error:', e.error); setStatus('idle'); };

    if (voices.length > 0) {
      window.speechSynthesis.speak(u);
    } else {
      window.speechSynthesis.onvoiceschanged = () => {
        const vs = window.speechSynthesis.getVoices();
        const v = vs.find(v => v.lang === targetLang) || vs.find(v => v.lang.startsWith('en')) || vs[0];
        if (v) { u.voice = v; u.lang = v.lang; }
        window.speechSynthesis.speak(u);
      };
    }
  }

  // Keep speakWithBrowser as alias for realtime messages
  function speakWithBrowser(text: string) { speak(text, language); }

  async function handleLanguageChange(lang: string) {
    setLanguage(lang);
    await api.patch('/auth/language', { language: lang }).catch(() => {});
  }

  async function startEvaluation() {
    try {
      const { data } = await api.post('/evaluation/start');
      router.push(`/evaluation/${data.id}`);
    } catch (err: any) {
      setErrorMsg('Could not start check-in. Please try again.');
    }
  }

  const orbConfig = {
    idle:       { bg: 'linear-gradient(135deg, #9b87f5, #7c5fe6)', shadow: '0 0 40px rgba(155,135,245,0.4)', icon: '🎙️', label: 'Hold to speak' },
    listening:  { bg: 'linear-gradient(135deg, #f87171, #ef4444)', shadow: '0 0 50px rgba(248,113,113,0.5)', icon: '🔴', label: 'Listening...' },
    processing: { bg: 'linear-gradient(135deg, #fbbf24, #f59e0b)', shadow: '0 0 40px rgba(251,191,36,0.4)', icon: '💭', label: 'Thinking...' },
    speaking:   { bg: 'linear-gradient(135deg, #34d399, #10b981)', shadow: '0 0 40px rgba(52,211,153,0.4)', icon: '🔊', label: 'Speaking...' },
  };
  const orb = orbConfig[status];

  return (
    <div className="min-h-screen flex flex-col"
      style={{ background: 'linear-gradient(145deg, #faf8ff 0%, #ede9ff 60%, #f3efff 100%)' }}>

      <div className="fixed top-10 right-10 w-72 h-72 rounded-full blur-3xl opacity-30 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #c4b5fd, transparent)' }} />
      <div className="fixed bottom-10 left-10 w-64 h-64 rounded-full blur-3xl opacity-20 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #a78bfa, transparent)' }} />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5">
        <button onClick={() => router.push('/profile')} className="flex items-center gap-2.5 hover:opacity-80 transition">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-soft"
            style={{ background: 'linear-gradient(135deg, #9b87f5, #7c5fe6)' }}>
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <span className="text-lavender-700 font-medium text-sm">Hello, {user?.name?.split(' ')[0]} 👋</span>
        </button>
        <div className="flex items-center gap-2">
          <select value={language} onChange={e => handleLanguageChange(e.target.value)}
            className="text-xs text-lavender-600 bg-white border border-lavender-100 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-lavender-300 shadow-sm cursor-pointer">
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
          <button onClick={() => { logout(); router.push('/login'); }}
            className="text-xs text-lavender-400 hover:text-lavender-600 transition px-3 py-1.5 rounded-lg bg-white border border-lavender-100 shadow-sm">
            Sign out
          </button>
        </div>
      </header>

      {/* Eval banner */}
      {hasPendingEval && (
        <div className="relative z-10 mx-6 mb-2 rounded-2xl px-5 py-3.5 flex items-center justify-between bg-white border border-lavender-200 shadow-card">
          <div className="flex items-center gap-2">
            <span className="text-lg">💙</span>
            <span className="text-lavender-700 text-sm font-medium">Your weekly check-in is ready</span>
          </div>
          <button onClick={() => router.push(`/evaluation/${evalId}`)}
            className="text-xs font-semibold text-white px-3 py-1.5 rounded-lg shadow-soft"
            style={{ background: 'linear-gradient(135deg, #9b87f5, #7c5fe6)' }}>
            Start
          </button>
        </div>
      )}

      {/* Main */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center gap-8 px-6">
        <p className="text-lavender-500 text-sm text-center max-w-xs leading-relaxed font-light">
          I'm here for you. Share how you're feeling — I'm listening.
        </p>

        {/* Orb */}
        <div className="relative flex items-center justify-center">
          {status === 'listening' && (
            <>
              <div className="absolute w-60 h-60 rounded-full opacity-20 animate-ping"
                style={{ background: 'radial-gradient(circle, #f87171, transparent)' }} />
              <div className="absolute w-48 h-48 rounded-full opacity-25 animate-ping"
                style={{ background: 'radial-gradient(circle, #f87171, transparent)', animationDelay: '0.4s' }} />
            </>
          )}
          {status === 'speaking' && (
            <div className="absolute w-52 h-52 rounded-full opacity-20 animate-pulse"
              style={{ background: 'radial-gradient(circle, #34d399, transparent)' }} />
          )}
          {status === 'processing' && (
            <div className="absolute w-48 h-48 rounded-full opacity-15 animate-spin"
              style={{ background: 'conic-gradient(from 0deg, transparent, #9b87f5, transparent)' }} />
          )}

          <button
            onMouseDown={startRecording} onMouseUp={stopRecording}
            onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
            onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
            disabled={status === 'processing' || status === 'speaking'}
            className="relative w-44 h-44 rounded-full flex flex-col items-center justify-center transition-all duration-300 select-none disabled:cursor-not-allowed"
            style={{ background: orb.bg, boxShadow: orb.shadow, transform: status === 'listening' ? 'scale(1.06)' : 'scale(1)' }}>
            <span className="text-5xl mb-1">{orb.icon}</span>
            <span className="text-white text-xs font-medium">{orb.label}</span>
          </button>
        </div>

        {/* Response */}
        {lastMessage && (
          <div className="max-w-sm w-full bg-white rounded-2xl px-5 py-4 shadow-card border border-lavender-100">
            <div className="flex items-start gap-2">
              <span className="text-lavender-400 text-lg mt-0.5">🌿</span>
              <p className="text-lavender-700 text-sm leading-relaxed">{lastMessage}</p>
            </div>
          </div>
        )}

        {errorMsg && <p className="text-red-400 text-xs text-center max-w-xs">{errorMsg}</p>}

        <p className="text-lavender-300 text-xs text-center font-light">Hold while speaking · release when done</p>

        <button onClick={hasPendingEval ? () => router.push(`/evaluation/${evalId}`) : startEvaluation}
          className="text-xs text-lavender-500 hover:text-lavender-700 transition flex items-center gap-1.5 font-medium">
          <span>📋</span>
          {hasPendingEval ? 'Continue weekly check-in' : 'Start weekly check-in'}
        </button>
      </main>
    </div>
  );
}
