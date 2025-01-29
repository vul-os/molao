import React, { useState, useEffect, useCallback, useMemo, useContext, createContext } from 'react';
import { supabase } from '@/services/supabase-client';

// Create AuthContext
const AuthContext = createContext(undefined);

// Add useAuth hook
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [firms, setFirms] = useState([]);
  const [activeFirm, setActiveFirm] = useState(null);
  const [hasLoadedFirms, setHasLoadedFirms] = useState(false);

  const fetchFirms = useCallback(async () => {
    if (!user) {
      setHasLoadedFirms(true);
      return;
    }
    
    try {
      const { data, error } = await supabase
      .from('firms')
      .select(`
          *
      `)

      if (error) throw error;
      console.log("data", data)
      setFirms(data || []);
      // Set first firm as active if none is selected and there are firms
      if (data && data.length > 0 && !activeFirm) {
        setActiveFirm(data[0]);
      }
    } catch (error) {
      console.error('Error fetching firms:', error);
    } finally {
      setHasLoadedFirms(true);
    }
  }, [user, activeFirm]);

  const handleAuthStateChange = useCallback((event, session) => {
    console.log('Auth state changed:', event);
    setTimeout(() => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session?.user) {
          setUser(session.user);
          setHasLoadedFirms(false);
        }
      } else if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
        setUser(null);
        setFirms([]);
        setActiveFirm(null);
        setHasLoadedFirms(true);
      } else if (event === 'USER_UPDATED') {
        setUser(session?.user ?? null);
      }
    }, 0);
  }, []);

  useEffect(() => {
    const initializeAuth = async () => {
      setLoading(true);
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) throw error;
        if (session) {
          setUser(session.user);
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthStateChange);
    return () => {
      subscription.unsubscribe();
    };
  }, [handleAuthStateChange]);

  useEffect(() => {
    if (!hasLoadedFirms) {
      fetchFirms();
    }
  }, [user, hasLoadedFirms, fetchFirms]);

  const switchFirmBySlug = (slug) => {
    const newActiveFirm = firms.find(firm => firm.slug === slug);
    if (newActiveFirm) {
      setActiveFirm(newActiveFirm);
    }
  };

  const getFirmBySlug = useCallback((slug) => {
    return firms.find(firm => firm.slug === slug);
  }, [firms]);

  const signUp = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
      },
    });
    if (error) throw error;
    return data;
  };

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;
    return data.user;
  };

  const forgotPassword = async (email) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/update-password`,
      });
      if (error) throw error;
      return { error: null };
    } catch (error) {
      return { error };
    }
  };

  const signInWithGoogle = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
      }
    });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const updateUserPassword = async (new_password) => {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        throw new Error('No valid authentication session found. Please sign in again.');
      }

      const { data, error } = await supabase.auth.updateUser({
        password: new_password
      });

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Password update failed:', error);
      return { data: null, error };
    }
  };

  const switchFirm = (firmId) => {
    const newActiveFirm = firms.find(firm => firm.id === firmId);
    if (newActiveFirm) {
      setActiveFirm(newActiveFirm);
    }
    return newActiveFirm;
  };

  const contextValue = useMemo(() => ({
    loading,
    user,
    firms,
    activeFirm,
    hasLoadedFirms,
    setHasLoadedFirms,
    switchFirm,
    switchFirmBySlug,
    getFirmBySlug,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    forgotPassword,
    updateUserPassword,
    fetchFirms,
  }), [loading, user, firms, activeFirm, hasLoadedFirms, getFirmBySlug]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthProvider;