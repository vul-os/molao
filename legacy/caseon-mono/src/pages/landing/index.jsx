import React from 'react';
import TopBar from '@/components/nav/top-bar';
import Hero from './hero';
import Features from './features';
import Pricing from './pricing';
import Footer from './footer';

const LandingPage = () => {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <TopBar showPortalButton="true" />
      <Hero />
      <Features />
      <Pricing />
      <Footer />
    </div>
  );
};

export default LandingPage;
