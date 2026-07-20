import React, { Suspense, lazy } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import ProtectedRoute from './components/auth/protected-route';

import { Progress as LoadingComponent } from './components/ui/progress';
// Layouts
import BlankLayout from './components/layout/blank-layout';
import MainLayout from './components/layout/main-layout';

// Loading message mapping
const getLoadingMessage = (pathname) => {
  if (pathname.includes('/signin')) return 'Loading sign in...';
  if (pathname.includes('/signup')) return 'Loading sign up...';
  if (pathname === '/') return 'Loading homepage...';
  if (pathname.includes('/billing')) return 'Loading billing information...';
  if (pathname.includes('/docs')) return 'Loading documentation...';
  if (pathname.includes('/legal')) return 'Loading legal information...';
  if (pathname.includes('/sitemap')) return 'Loading sitemap...';
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
const VerifyEmail = lazyImport(() => import('./pages/auth/verify-email'));
const NotFound = lazyImport(() => import('./pages/not-found'));

// Main pages
const SearchPage = lazyImport(() => import('./pages/search'));
const LandingPage = lazyImport(() => import('./pages/landing'));
const MembersPage = lazyImport(() => import('./pages/members'));
const FileDetailPage = lazyImport(() => import('./pages/search/file-detail'));
const BillingPage = lazyImport(() => import('./pages/billing'));

// Documentation pages
const DocsPage = lazyImport(() => import('./pages/docs'));
const GettingStarted = lazyImport(() => import('./pages/docs/getting-started'));
const SearchDocs = lazyImport(() => import('./pages/docs/search'));
const PricingDocs = lazyImport(() => import('./pages/docs/pricing'));
const Members = lazyImport(() => import('./pages/docs/members'));
const Contact = lazyImport(() => import('./pages/docs/contact'));
const SitemapPage = lazyImport(() => import('./pages/docs/sitemap'));

// Legal pages
const TermsOfService = lazyImport(() => import('./pages/docs/legal/terms-of-service'));
const PrivacyPolicy = lazyImport(() => import('./pages/docs/legal/privacy-policy'));
const CookiePolicy = lazyImport(() => import('./pages/docs/legal/cookie-policy'));

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
          <Route path="/verify-email" element={<VerifyEmail />} />
        </Route>

        {/* Documentation Routes */}
        <Route path="/docs" element={<DocsPage />}>
          <Route index element={null} />
          <Route path="getting-started" element={<GettingStarted />} />
          <Route path="search" element={<SearchDocs />} />
          <Route path="pricing" element={<PricingDocs />} />
          <Route path="members" element={<Members />} />
          <Route path="contact" element={<Contact />} />
          <Route path="sitemap" element={<SitemapPage />} />
          
          {/* Legal Routes */}
          <Route path="legal/terms-of-service" element={<TermsOfService />} />
          <Route path="legal/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="legal/cookie-policy" element={<CookiePolicy />} />
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