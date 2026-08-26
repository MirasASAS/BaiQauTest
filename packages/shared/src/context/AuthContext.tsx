import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { supabase } from '../supabase';
import i18n from '../i18n';
import type { User, Profile } from '../types';

export class AccountBlockedError extends Error {
  constructor() {
    super('ACCOUNT_BLOCKED');
    this.name = 'AccountBlockedError';
  }
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, profile: Partial<Profile>) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateProfile: (profile: Partial<Profile>) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email! });
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email! });
        fetchProfile(session.user.id);
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string) {
    userIdRef.current = userId;
    for (let i = 0; i < 10; i++) {
      if (userIdRef.current !== userId) return;
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (userIdRef.current !== userId) return;
      if (data) {
        setProfile(data as Profile);
        if (data.preferred_lang === 'kz' || data.preferred_lang === 'ru') {
          i18n.changeLanguage(data.preferred_lang);
        }
        return;
      }
      await new Promise(r => setTimeout(r, 300));
    }
  }

  async function signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error };

    if (data.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_blocked')
        .eq('id', data.user.id)
        .maybeSingle();
      if (profile?.is_blocked) {
        await supabase.auth.signOut();
        setUser(null);
        setProfile(null);
        return { error: new AccountBlockedError() };
      }
    }

    return { error: null };
  }

  async function signUp(email: string, password: string, profileData: Partial<Profile>) {
    // Create auth user - trigger will create profile automatically
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error };

    if (!data.user) {
      // Аккаунт не создан (например, email уже занят) — не выдаём ложный успех
      return { error: new Error('Не удалось создать аккаунт. Возможно, этот email уже зарегистрирован.') };
    }

    // Wait for trigger to create profile (up to 5 seconds)
    let attempts = 0;
    let profileCreated = false;

    while (attempts < 10 && !profileCreated) {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', data.user.id)
        .single();

      if (existingProfile) {
        profileCreated = true;
      } else {
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
      }
    }

    // Update profile with additional data (trigger created it with defaults)
    if (!profileData.first_name || !profileData.last_name) {
      return { error: new Error('First name and last name are required') };
    }
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        first_name: profileData.first_name,
        last_name: profileData.last_name,
        middle_name: profileData.middle_name || null,
        phone: profileData.phone || null,
        gender: profileData.gender || null,
      })
      .eq('id', data.user.id);

    if (updateError) return { error: updateError };

    await fetchProfile(data.user.id);
    return { error: null };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }

  async function updateProfile(profileData: Partial<Profile>) {
    if (!user) return { error: new Error('Не авторизован') };
    const { error } = await supabase.from('profiles').update(profileData).eq('id', user.id);
    if (!error) {
      setProfile(prev => prev ? { ...prev, ...profileData } : null);
    }
    return { error };
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signOut, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth должен использоваться внутри AuthProvider');
  return context;
}
