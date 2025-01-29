import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Search,
  X,
  UserCircle
} from 'lucide-react';
import Logo from '@/assets/icon.svg';

// Header Component
const Header = () => {
  const [searchValue, setSearchValue] = useState('');

  return (
    <header className="fixed top-0 z-50 w-full bg-white border-b">
      <div className="w-full max-w-7xl mx-auto flex items-center h-16 px-4">
        {/* Logo Section */}
        <div className="flex items-center space-x-2">
          <a href="/" className="flex items-center space-x-2">
            <img src={Logo} alt="NeighbourSpace" className="h-8 w-8" />
            <h1 className="text-xl font-bold text-blue-600">NeighbourSpace</h1>
          </a>
        </div>

        {/* Search Bar */}
        <div className="flex flex-1 mx-8">
          <div className="w-full max-w-2xl relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <Input
              type="search"
              placeholder="Enter address"
              className="pl-10 pr-10 h-10 w-full"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
            />
            {searchValue && (
              <button
                type="button"
                onClick={() => setSearchValue('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-500"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {/* Right Navigation */}
        <div className="hidden md:flex items-center space-x-4">
          <Button 
            variant="ghost" 
            className="text-sm font-medium"
            onClick={() => window.location.href = '/search'}
          >
            Find Storage
          </Button>
          <Button 
            variant="outline" 
            className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50"
            onClick={() => window.location.href = '/host'}
          >
            Become a host
          </Button>
          <Button 
            variant="ghost" 
            className="text-sm font-medium flex items-center gap-2"
            onClick={() => window.location.href = '/login'}
          >
            <UserCircle className="h-5 w-5" />
            Log in
          </Button>
        </div>
      </div>
    </header>
  );
};

// Footer Component
const Footer = () => {
  return (
    <footer className="bg-gray-50 border-t border-gray-200">
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Company Info */}
          <div>
            <h3 className="text-sm font-semibold text-gray-600 tracking-wider uppercase">Company</h3>
            <ul className="mt-4 space-y-4">
              <li>
                <a href="/about" className="text-base text-gray-500 hover:text-gray-900">
                  About
                </a>
              </li>
              <li>
                <a href="/careers" className="text-base text-gray-500 hover:text-gray-900">
                  Careers
                </a>
              </li>
              <li>
                <a href="/press" className="text-base text-gray-500 hover:text-gray-900">
                  Press
                </a>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="text-sm font-semibold text-gray-600 tracking-wider uppercase">Support</h3>
            <ul className="mt-4 space-y-4">
              <li>
                <a href="/help" className="text-base text-gray-500 hover:text-gray-900">
                  Help Center
                </a>
              </li>
              <li>
                <a href="/safety" className="text-base text-gray-500 hover:text-gray-900">
                  Safety
                </a>
              </li>
              <li>
                <a href="/contact" className="text-base text-gray-500 hover:text-gray-900">
                  Contact Us
                </a>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-sm font-semibold text-gray-600 tracking-wider uppercase">Legal</h3>
            <ul className="mt-4 space-y-4">
              <li>
                <a href="/privacy" className="text-base text-gray-500 hover:text-gray-900">
                  Privacy
                </a>
              </li>
              <li>
                <a href="/terms" className="text-base text-gray-500 hover:text-gray-900">
                  Terms
                </a>
              </li>
              <li>
                <a href="/cookie-policy" className="text-base text-gray-500 hover:text-gray-900">
                  Cookie Policy
                </a>
              </li>
            </ul>
          </div>

          {/* Social */}
          <div>
            <h3 className="text-sm font-semibold text-gray-600 tracking-wider uppercase">Social</h3>
            <ul className="mt-4 space-y-4">
              <li>
                <a href="https://twitter.com/neighbourspace" className="text-base text-gray-500 hover:text-gray-900">
                  Twitter
                </a>
              </li>
              <li>
                <a href="https://facebook.com/neighbourspace" className="text-base text-gray-500 hover:text-gray-900">
                  Facebook
                </a>
              </li>
              <li>
                <a href="https://instagram.com/neighbourspace" className="text-base text-gray-500 hover:text-gray-900">
                  Instagram
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-8 border-t border-gray-200 pt-8">
          <p className="text-base text-gray-400 xl:text-center">
            &copy; {new Date().getFullYear()} NeighbourSpace. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

// Layout Component
export const Layout = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 pt-16">
        {children}
      </main>
      <Footer />
    </div>
  );
};

export { Header, Footer };