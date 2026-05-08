'use client';
import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';

const TOTAL_QUESTIONS = 5;

export default function EvaluationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [currentQ, setCurrentQ] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'recording' | 'processing' | 'done'>('loading');
  const [currentQuestionText, setCurrentQuestionText] = useState('');
  const [lastAnswer, setLastAnswer] = useState('');
  const questionAudioRef = useRef<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => { loadQuestion(0); }, []);

  async function loadQuestion(index: number) {
    setStatus('loading'); setLastAnswer('');
    try {
      // Get question text first — this always works
      const { data: textData } = await api.get(`/evaluation/${id}/question/${index}/text`).catch(() => ({ data: null }));
      const questionText = textData?.question || '';
      if (questionText) {
        setCurrentQuestionText(questionText);
        // Immediately speak it via Google TTS
        playGoogleTTS(questionText);
      }

      // Also try server TTS audio in parallel (better quality if available)
      api.get(`/evaluation/${id}/question/${index}`, { responseType: 'arraybuffer' })
        .then(response => {
          const contentType = String(response.headers['content-type'] || '');
          if (!contentType.includes('application/json') && response.data?.byteLength > 100) {
            const blob = new Blob([response.data], { type: 'audio/mpeg' });
            const url = URL.createObjectURL(blob);
            if (questionAudioRef.current) URL.revokeObjectURL(questionAudioRef.current);
            questionAudioRef.current = url;
          }
        }).catch(() => {});

      setStatus('ready');
    } catch {
      setStatus('ready');
    }
  }

  function playGoogleTTS(text: string) {
    // Use browser speech synthesis — questions are always in English
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.92;
    window.speechSynthesis.speak(u);
  }

  function repeatQuestion() {
    if (status === 'recording' || status === 'processing') return;
    if (questionAudioRef.current) new Audio(questionAudioRef.current).play().catch(() => {});
    else if (currentQuestionText) playGoogleTTS(currentQuestionText);
  }

  async function startRecording() {
    if (status !== 'ready') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => { stream.getTracks().forEach(t => t.stop()); await submitAnswer(new Blob(chunksRef.current, { type: 'audio/webm' })); };
      recorder.start(100); mediaRecorderRef.current = recorder; setStatus('recording');
    } catch { alert('Microphone access required.'); }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && status === 'recording') { mediaRecorderRef.current.stop(); setStatus('processing'); }
  }

  async function submitAnswer(blob: Blob) {
    setStatus('processing');
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'answer.webm');
      formData.append('questionIndex', String(currentQ));
      const { data } = await api.post(`/evaluation/${id}/respond`, formData);
      setLastAnswer(data.answer || '');
      const nextQ = currentQ + 1;
      if (data.isComplete || nextQ >= TOTAL_QUESTIONS) {
        setStatus('done');
      } else {
        setCurrentQ(nextQ);
        await loadQuestion(nextQ);
      }
    } catch (err: any) {
      console.error('Submit error:', err.response?.data || err.message);
      // If it's the last question, show done screen anyway
      if (currentQ + 1 >= TOTAL_QUESTIONS) {
        setStatus('done');
      } else {
        setStatus('ready');
      }
    }
  }

  if (status === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center px-6"
        style={{ background: 'linear-gradient(145deg, #faf8ff 0%, #ede9ff 60%, #f3efff 100%)' }}>
        <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-soft border border-lavender-100">
          <div className="w-20 h-20 rounded-full flex items-center justify-center text-4xl mx-auto mb-5 float shadow-glow"
            style={{ background: 'linear-gradient(135deg, #9b87f5, #7c5fe6)' }}>💙</div>
          <h2 className="text-2xl font-bold text-lavender-800 mb-2">Check-in complete</h2>
          <p className="text-lavender-500 text-sm leading-relaxed mb-2 font-light">
            Thank you for taking the time to share how you're feeling. That takes courage.
          </p>
          <p className="text-lavender-400 text-xs mb-6 font-light">
            Your responses have been saved and will help us better support you.
          </p>
          <div className="rounded-2xl p-4 mb-6 text-left bg-lavender-50 border border-lavender-100">
            <p className="text-xs text-lavender-600 font-semibold mb-1">What happens next</p>
            <p className="text-xs text-lavender-500 leading-relaxed font-light">
              Your answers are analyzed to understand your emotional wellbeing and track how you're doing over time.
            </p>
          </div>
          <button onClick={() => router.push('/companion')}
            className="w-full py-3.5 rounded-2xl text-sm font-semibold text-white shadow-glow transition hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #9b87f5, #7c5fe6)' }}>
            Return to companion
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: 'linear-gradient(145deg, #faf8ff 0%, #ede9ff 60%, #f3efff 100%)' }}>

      {/* Blob */}
      <div className="fixed top-0 right-0 w-72 h-72 rounded-full blur-3xl opacity-30 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #c4b5fd, transparent)' }} />

      <div className="relative w-full max-w-sm">
        {/* Progress */}
        <div className="flex gap-2 mb-8">
          {Array.from({ length: TOTAL_QUESTIONS }).map((_, i) => (
            <div key={i} className="h-1.5 flex-1 rounded-full transition-all duration-500"
              style={{ background: i < currentQ ? '#9b87f5' : i === currentQ ? 'linear-gradient(90deg, #9b87f5, #c4b5fd)' : '#e9e3ff' }} />
          ))}
        </div>

        <p className="text-lavender-400 text-xs mb-3 font-medium">Question {currentQ + 1} of {TOTAL_QUESTIONS}</p>

        {/* Question card */}
        <div className="bg-white rounded-2xl p-5 mb-3 shadow-card border border-lavender-100 min-h-[80px]">
          <p className="text-lavender-800 text-base font-medium leading-relaxed">
            {status === 'loading' ? <span className="text-lavender-300">Loading question...</span>
              : currentQuestionText || 'Listen to the question, then share your answer.'}
          </p>
        </div>

        <button onClick={repeatQuestion} disabled={status === 'loading' || status === 'recording' || status === 'processing'}
          className="text-xs text-lavender-400 hover:text-lavender-600 mb-5 flex items-center gap-1.5 transition disabled:opacity-30 font-medium">
          🔁 Repeat question
        </button>

        {lastAnswer && (
          <div className="rounded-xl px-4 py-3 mb-5 bg-lavender-50 border border-lavender-100">
            <p className="text-xs text-lavender-500 italic font-light">You said: "{lastAnswer}"</p>
          </div>
        )}

        {/* Record button */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            {status === 'recording' && (
              <>
                <div className="absolute inset-0 rounded-full animate-ping opacity-25"
                  style={{ background: 'radial-gradient(circle, #f87171, transparent)' }} />
                <div className="absolute -inset-6 rounded-full animate-ping opacity-15"
                  style={{ background: 'radial-gradient(circle, #f87171, transparent)', animationDelay: '0.4s' }} />
              </>
            )}
            <button
              onMouseDown={startRecording} onMouseUp={stopRecording}
              onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
              onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
              disabled={status === 'loading' || status === 'processing'}
              className="relative w-28 h-28 rounded-full flex flex-col items-center justify-center transition-all duration-300 select-none disabled:opacity-50"
              style={{
                background: status === 'recording' ? 'linear-gradient(135deg, #f87171, #ef4444)' : 'linear-gradient(135deg, #9b87f5, #7c5fe6)',
                boxShadow: status === 'recording' ? '0 0 40px rgba(248,113,113,0.5)' : '0 0 30px rgba(155,135,245,0.4)',
                transform: status === 'recording' ? 'scale(1.08)' : 'scale(1)',
              }}>
              <span className="text-3xl">{status === 'recording' ? '🔴' : '🎙️'}</span>
              <span className="text-white text-xs font-medium mt-1">
                {status === 'processing' ? 'Saving...' : status === 'recording' ? 'Release' : 'Hold'}
              </span>
            </button>
          </div>
          <p className="text-lavender-300 text-xs font-light">Hold while speaking · release when done</p>
        </div>
      </div>
    </div>
  );
}
