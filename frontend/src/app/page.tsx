'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';

export default function Home() {
  const router = useRouter();
  const { user, token } = useStore();

  useEffect(() => {
    if (!token) {
      router.replace('/login');
      return;
    }
    if (user?.role === 'caregiver') router.replace('/companion');
    else if (user?.role === 'admin') router.replace('/admin');
    else if (user?.role === 'psychiatrist') router.replace('/psychiatrist');
  }, [user, token, router]);

  return null;
}
