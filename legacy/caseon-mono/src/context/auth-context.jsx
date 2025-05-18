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
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hosts, setHosts] = useState([]);
  const [activeHost, setActiveHost] = useState(null);
  const [hasLoadedHosts, setHasLoadedHosts] = useState(false);

  const fetchHosts = useCallback(async () => {
    if (!user) {
      setHasLoadedHosts(true);
      return;
    }
    
    try {
      const { data, error } = await supabase
      .from('hosts')
      .select(`
          *
      `)

      if (error) throw error;
      console.log("data", data)
      setHosts(data || []);
      // Set first host as active if none is selected and there are hosts
      if (data && data.length > 0 && !activeHost) {
        setActiveHost(data[0]);
      }
    } catch (error) {
      console.error('Error fetching hosts:', error);
    } finally {
      setHasLoadedHosts(true);
    }
  }, [user, activeHost]);

  const handleAuthStateChange = useCallback((event, session) => {
    console.log('Auth state changed:', event);
    setTimeout(() => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session?.user) {
          setUser(session.user);
          setSession(session);
          setHasLoadedHosts(false);
        }
      } else if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
        setUser(null);
        setSession(null);
        setHosts([]);
        setActiveHost(null);
        setHasLoadedHosts(true);
      } else if (event === 'USER_UPDATED') {
        setUser(session?.user ?? null);
        setSession(session);
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
          setSession(session);
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
    if (!hasLoadedHosts) {
      fetchHosts();
    }
  }, [user, hasLoadedHosts, fetchHosts]);

  const switchHostBySlug = (slug) => {
    const newActiveHost = hosts.find(host => host.slug === slug);
    if (newActiveHost) {
      setActiveHost(newActiveHost);
    }
  };

  const getHostBySlug = useCallback((slug) => {
    return hosts.find(host => host.slug === slug);
  }, [hosts]);

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

  const switchHost = (hostId) => {
    const newActiveHost = hosts.find(host => host.id === hostId);
    if (newActiveHost) {
      setActiveHost(newActiveHost);
    }
    return newActiveHost;
  };

  const contextValue = useMemo(() => ({
    loading,
    user,
    session,
    hosts,
    activeHost,
    hasLoadedHosts,
    setHasLoadedHosts,
    switchHost,
    switchHostBySlug,
    getHostBySlug,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    forgotPassword,
    updateUserPassword,
    fetchHosts,
  }), [loading, user, session, hosts, activeHost, hasLoadedHosts, getHostBySlug]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthProvider;