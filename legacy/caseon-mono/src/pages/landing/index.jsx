import React, { useEffect } from 'react';
import TopBar from '@/components/nav/top-bar';
import Hero from './hero';
import Features from './features';
import Pricing from './pricing';
import Footer from './footer';

const LandingPage = () => {
  // Handle scroll to section when hash changes
  useEffect(() => {
    // Function to scroll to element
    const scrollToSection = () => {
      const { hash } = window.location;
      if (hash) {
        const id = hash.replace('#', '');
        const element = document.getElementById(id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      }
    };

    // Scroll on initial load if hash exists
    scrollToSection();

    // Listen for hash changes
    window.addEventListener('hashchange', scrollToSection);
    return () => window.removeEventListener('hashchange', scrollToSection);
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <TopBar showPortalButton="true" />
      <div className="space-y-8 md:space-y-12">
        <div id="hero">
          <Hero />
        </div>
        <div id="features">
          <Features />
        </div>
        <div id="pricing">
          <Pricing />
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default LandingPage;
