import React from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Settings } from 'lucide-react';
import Logo from '@/assets/icon.svg';
import { Link as RouterLink } from 'react-router-dom';

// Header Component
const Header = () => {
  return (
    <header className="fixed top-0 z-50 w-full bg-white border-b border-gray-200">
      <div className="w-full max-w-7xl mx-auto flex items-center h-16 px-4 lg:px-8">
        {/* Logo Section */}
        <RouterLink to="/" className="flex items-center">
          <img src={Logo} alt="Nuamic" className="h-8 w-8" />
          <span className="ml-2 text-xl font-semibold text-gray-900">
            Nuamic
          </span>
        </RouterLink>

      </div>
    </header>
  );
};

// Footer Component
const Footer = () => {
  const currentYear = new Date().getFullYear();
  const footerLinks = [
    {
      title: 'Product',
      links: [
        { label: 'Features', href: '/features' },
        { label: 'Security', href: '/security' },
        { label: 'Enterprise', href: '/enterprise' }
      ]
    },
    {
      title: 'Company',
      links: [
        { label: 'About', href: '/about' },
        { label: 'Blog', href: '/blog' },
        { label: 'Careers', href: '/careers' }
      ]
    },
    {
      title: 'Resources',
      links: [
        { label: 'Documentation', href: '/docs' },
        { label: 'Support', href: '/support' },
        { label: 'Status', href: '/status' }
      ]
    },
    {
      title: 'Legal',
      links: [
        { label: 'Privacy', href: '/privacy' },
        { label: 'Terms', href: '/terms' },
        { label: 'Cookie Policy', href: '/cookies' }
      ]
    }
  ];

  return (
    <footer className="bg-white border-t border-gray-200">
      <div className="max-w-7xl mx-auto py-12 px-4 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {footerLinks.map((section) => (
            <div key={section.title}>
              <h3 className="text-sm font-semibold text-gray-900 tracking-wider uppercase">
                {section.title}
              </h3>
              <ul className="mt-4 space-y-3">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <a 
                      href={link.href}
                      className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        
        <div className="mt-8 pt-8 border-t border-gray-200">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center">
              <img src={Logo} alt="" className="h-8 w-8" />
              <span className="ml-2 text-lg font-semibold text-gray-900">
                Nuamic
              </span>
            </div>
            <p className="text-sm text-gray-500">
              © {currentYear} Nuamic Technologies, Inc. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

// Layout Component
export const Layout = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <main className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
};

export { Header, Footer };