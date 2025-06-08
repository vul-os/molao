import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Mail, Scale, Shield, Cookie } from 'lucide-react';

const Footer = () => {
  return (
    <footer className="py-12 px-4 md:px-8 bg-white border-t border-slate-100 text-slate-600">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Company Information */}
          <div className="col-span-1">
            <div className="flex items-center gap-2 text-slate-900 mb-4">
              <div className="flex items-center -space-x-1">
                <span className="text-2xl font-serif font-bold tracking-tight text-slate-900">
                  Case
                </span>
                <img 
                  src="/icon.svg" 
                  alt="CaseOn Logo" 
                  className="h-8 w-8 mt-1" 
                />
              </div>
            </div>
            <p className="text-xs font-medium tracking-wider text-slate-500 uppercase mb-4">
              LEGAL INTELLIGENCE
            </p>
            <div className="flex items-center gap-2 mb-4">
              <p className="text-sm text-slate-500">
                Transforming legal research in South Africa with cutting-edge technology.
              </p>
              <img 
                src="/sa.svg" 
                alt="South African Flag" 
                className="h-6 w-8 rounded-sm shadow-sm" 
              />
            </div>
            <div className="flex space-x-3 mt-4">
              <a href="/" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path fillRule="evenodd" d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" clipRule="evenodd" />
                </svg>
              </a>
              <a href="/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path fillRule="evenodd" d="M12.017 0C8.396 0 7.929.013 6.71.06 5.487.107 4.65.274 3.927.515a5.942 5.942 0 0 0-2.148 1.4 5.942 5.942 0 0 0-1.4 2.148C.133 4.787-.034 5.624.013 6.847.06 8.066.074 8.533.074 12.154c0 3.621.014 4.088.06 5.307.047 1.223.214 2.06.455 2.783a5.942 5.942 0 0 0 1.4 2.148 5.942 5.942 0 0 0 2.148 1.4c.724.241 1.56.408 2.784.455 1.219.047 1.686.06 5.307.06 3.621 0 4.088-.013 5.307-.06 1.223-.047 2.06-.214 2.783-.455a5.942 5.942 0 0 0 2.148-1.4 5.942 5.942 0 0 0 1.4-2.148c.241-.724.408-1.56.455-2.784.047-1.219.06-1.686.06-5.307 0-3.621-.013-4.088-.06-5.307-.047-1.223-.214-2.06-.455-2.783a5.942 5.942 0 0 0-1.4-2.148A5.942 5.942 0 0 0 20.083.515C19.36.274 18.523.107 17.3.06 16.081.013 15.614 0 11.993 0h.024zM12.017 2.156c3.57 0 3.996.013 5.403.06 1.304.06 2.013.273 2.487.453.624.243 1.07.533 1.537 1s.757.913 1 1.537c.18.474.393 1.183.453 2.487.047 1.407.06 1.833.06 5.403s-.013 3.996-.06 5.403c-.06 1.304-.273 2.013-.453 2.487-.243.624-.533 1.07-1 1.537s-.913.757-1.537 1c-.474.18-1.183.393-2.487.453-1.407.047-1.833.06-5.403.06s-3.996-.013-5.403-.06c-1.304-.06-2.013-.273-2.487-.453-.624-.243-1.07-.533-1.537-1s-.757-.913-1-1.537c-.18-.474-.393-1.183-.453-2.487-.047-1.407-.06-1.833-.06-5.403s.013-3.996.06-5.403c.06-1.304.273-2.013.453-2.487.243-.624.533-1.07 1-1.537s.913-.757 1.537-1c.474-.18 1.183-.393 2.487-.453 1.407-.047 1.833-.06 5.403-.06z" clipRule="evenodd" />
                  <path fillRule="evenodd" d="M12.017 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12.017 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8z" clipRule="evenodd" />
                  <circle cx="18.406" cy="5.594" r="1.44" />
                </svg>
              </a>
            </div>
          </div>
          
          {/* Pages */}
          <div>
            <h3 className="text-slate-900 font-medium mb-4">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#" className="flex items-center group hover:text-indigo-600 transition-colors">
                  Home
                  <ArrowRight className="ml-1 h-3 w-3 opacity-0 group-hover:opacity-100 transform group-hover:translate-x-1 transition-all" />
                </a>
              </li>
              <li>
                <a href="#features" className="flex items-center group hover:text-indigo-600 transition-colors">
                  Features
                  <ArrowRight className="ml-1 h-3 w-3 opacity-0 group-hover:opacity-100 transform group-hover:translate-x-1 transition-all" />
                </a>
              </li>
            </ul>
          </div>
          
          {/* Resources & Account */}
          <div>
            <h3 className="text-slate-900 font-medium mb-4">Resources & Account</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/docs" className="flex items-center group hover:text-indigo-600 transition-colors">
                  Documentation
                  <ArrowRight className="ml-1 h-3 w-3 opacity-0 group-hover:opacity-100 transform group-hover:translate-x-1 transition-all" />
                </Link>
              </li>
              <li>
                <a href="/docs/sitemap" className="flex items-center group hover:text-indigo-600 transition-colors">
                  Sitemap
                  <ArrowRight className="ml-1 h-3 w-3 opacity-0 group-hover:opacity-100 transform group-hover:translate-x-1 transition-all" />
                </a>
              </li>
              <li>
                <Link to="/signin" className="flex items-center group hover:text-indigo-600 transition-colors">
                  Sign In
                  <ArrowRight className="ml-1 h-3 w-3 opacity-0 group-hover:opacity-100 transform group-hover:translate-x-1 transition-all" />
                </Link>
              </li>
              <li>
                <Link to="/signup" className="flex items-center group hover:text-indigo-600 transition-colors">
                  Sign Up
                  <ArrowRight className="ml-1 h-3 w-3 opacity-0 group-hover:opacity-100 transform group-hover:translate-x-1 transition-all" />
                </Link>
              </li>
              <li className="flex items-center pt-2 text-slate-500">
                <Mail className="h-4 w-4 mr-2" />
                <span>info@caseon.io</span>
              </li>
            </ul>
          </div>
        </div>
        
        {/* Legal links section */}
        <div className="mt-10 pt-8 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex items-center space-x-2 text-slate-700">
            <Scale className="h-5 w-5 text-indigo-600" />
            <Link to="/docs/legal/terms-of-service" className="text-sm font-medium hover:text-indigo-600 transition-colors">
              Terms of Service
            </Link>
          </div>
          
          <div className="flex items-center space-x-2 text-slate-700">
            <Shield className="h-5 w-5 text-indigo-600" />
            <Link to="/docs/legal/privacy-policy" className="text-sm font-medium hover:text-indigo-600 transition-colors">
              Privacy Policy
            </Link>
          </div>
          
          <div className="flex items-center space-x-2 text-slate-700">
            <Cookie className="h-5 w-5 text-indigo-600" />
            <Link to="/docs/legal/cookie-policy" className="text-sm font-medium hover:text-indigo-600 transition-colors">
              Cookie Policy
            </Link>
          </div>
        </div>
        
        {/* Bottom footer */}
        <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-slate-500">© {new Date().getFullYear()} CaseOn. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer; 