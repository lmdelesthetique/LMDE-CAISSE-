'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

const AuthContext = createContext<any>({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    return { user: data.user, session: data.session, error };
  };
  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { user: data.user, session: data.session, error };
  };
  const signOut = async () => { await supabase.auth.signOut(); };
  const getCurrentUser = async () => { const { data: { user } } = await supabase.auth.getUser(); return user; };
  const isEmailVerified = () => !!user?.email_confirmed_at;
  const getUserProfile = async () => {
    if (!user) return null;
    const meta = user.user_metadata || {};
    return { id: user.id, email: user.email, full_name: meta.full_name || meta.name || user.email?.split('@')[0] || '' };
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut, getCurrentUser, isEmailVerified, getUserProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
