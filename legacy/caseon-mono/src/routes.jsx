import React, { Suspense, lazy } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import ProtectedRoute from './components/auth/protected-route';

import { Progress as LoadingComponent } from './components/ui/progress';
// Layouts
import BlankLayout from './components/layout/blank-layout';
import MainLayout from './components/layout/main-layout';

import SearchPage from './pages/search';
import LandingPage from './pages/landing';
import MembersPage from './pages/members';
import FileDetailPage from './pages/search/file-detail';
import BillingPage from './pages/billing';

// Documentation pages
import DocsPage from './pages/docs';
import GettingStarted from './pages/docs/getting-started';
import SearchDocs from './pages/docs/search';
import Contact from './pages/docs/contact';

// Loading message mapping
const getLoadingMessage = (pathname) => {
  if (pathname.includes('/signin')) return 'Loading sign in...';
  if (pathname.includes('/signup')) return 'Loading sign up...';
  if (pathname === '/') return 'Loading homepage...';
  if (pathname.includes('/billing')) return 'Loading billing information...';
  if (pathname.includes('/docs')) return 'Loading documentation...';
  return 'Loading...';
};

// Custom Suspense wrapper with dynamic message
const CustomSuspense = ({ children }) => {
  const location = useLocation();
  const message = getLoadingMessage(location.pathname);
  
  return (
    <Suspense fallback={<LoadingComponent message={message} />}>
      {children}
    </Suspense>
  );
};

// Lazy imports
const lazyImport = (importFn) => {
  const Component = lazy(importFn);
  return Component;
};

// Lazy loaded components
const SignIn = lazyImport(() => import('./pages/auth/signin'));
const SignUp = lazyImport(() => import('./pages/auth/signup'));
const ForgotPassword = lazyImport(() => import('./pages/auth/forgot-password'));
const UpdatePassword = lazyImport(() => import('./pages/auth/update-password'));
const NotFound = lazyImport(() => import('./pages/not-found'));

const Protected = ({ children }) => (
  <ProtectedRoute>{children}</ProtectedRoute>
);

const AppRoutes = () => {
  return (
    <CustomSuspense>
      <Routes>
        <Route element={<BlankLayout />}>
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/update-password" element={<UpdatePassword />} />
        </Route>

        {/* Documentation Routes */}
        <Route path="/docs" element={<DocsPage />}>
          <Route index element={<DocsPage />} />
          <Route path="getting-started" element={<GettingStarted />} />
          <Route path="search" element={<SearchDocs />} />
          <Route path="contact" element={<Contact />} />
        </Route>

        <Route element={<MainLayout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/search" element={<Protected><SearchPage /></Protected>} />
          <Route path="/search/file/:fileId" element={<Protected><FileDetailPage /></Protected>} />
          <Route path="/members" element={<Protected><MembersPage /></Protected>} />
          <Route path="/billing" element={<Protected><BillingPage /></Protected>} />
        </Route>

        {/* Global catch-all route */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </CustomSuspense>
  );
};

export default AppRoutes;