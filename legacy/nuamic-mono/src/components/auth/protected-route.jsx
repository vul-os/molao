import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/auth-context';

const REDIRECT_STORAGE_KEY = 'auth_redirect_data';

const ProtectedRoute = ({
  children,
  redirectPath = '/signin',
  loadingComponent = (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-lg text-gray-500">Checking authorization...</div>
    </div>
  )
}) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  React.useEffect(() => {
    if (!loading && !user) {
      try {
        // Save the current path for post-login redirection
        const currentPath = `${location.pathname}${location.search}`;
        localStorage.setItem(REDIRECT_STORAGE_KEY, currentPath);
        
        // Redirect to sign-in
        navigate(redirectPath, {
          replace: true,
          state: { from: location }
        });
      } catch (error) {
        console.error('Error handling auth redirect:', error);
        // Fallback to basic redirect if localStorage fails
        navigate(redirectPath, { replace: true });
      }
    }
  }, [user, loading, location, navigate, redirectPath]);

  // Show loading state
  if (loading) {
    return loadingComponent;
  }

  // Only render children if user is authenticated
  return user ? children : null;
};

// Helper functions for managing redirect storage
export const getStoredRedirect = () => {
  try {
    return localStorage.getItem(REDIRECT_STORAGE_KEY);
  } catch (error) {
    console.error('Error reading stored redirect:', error);
    return null;
  }
};

export const clearStoredRedirect = () => {
  try {
    localStorage.removeItem(REDIRECT_STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing stored redirect:', error);
  }
};

export default ProtectedRoute;