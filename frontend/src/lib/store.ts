import { create } from 'zustand';

interface User {
  id: string;
  name: string;
  role: 'caregiver' | 'admin' | 'psychiatrist';
}

interface AppState {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
}

export const useStore = create<AppState>((set) => ({
  user: null,
  token: typeof window !== 'undefined' ? localStorage.getItem('token') : null,
  setAuth: (user, token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    set({ user, token });
  },
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ user: null, token: null });
  },
}));

// Rehydrate user from localStorage on app load
if (typeof window !== 'undefined') {
  const stored = localStorage.getItem('user');
  if (stored) {
    try {
      useStore.setState({ user: JSON.parse(stored) });
    } catch {}
  }
}
