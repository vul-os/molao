import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail } from 'lucide-react';

const Contact = () => {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-serif font-bold text-slate-900 mb-4">Contact Us</h1>
      <p className="text-lg text-slate-600 mb-8">
        Have questions or need assistance? Our team is here to help you get the most out of CaseOn.
      </p>
      
      {/* Contact Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h2 className="text-xl font-medium text-slate-800 mb-4">Contact Information</h2>
          
          <div className="flex items-start">
            <Mail className="h-5 w-5 text-indigo-600 mr-3 mt-0.5" />
            <div>
              <p className="font-medium text-slate-800">Email</p>
              <a href="mailto:info@caseon.io" className="text-indigo-600 hover:text-indigo-700">
                info@caseon.io
              </a>
              <p className="text-sm text-slate-500 mt-1">
                We'll get back to you as soon as possible
              </p>
              <p className="text-sm text-slate-500 mt-1">
                Monday to Friday, 9am to 5pm
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-5">
          <h2 className="text-xl font-medium text-slate-800 mb-4">Quick Links</h2>
          
          <div className="space-y-3">
            <a href="/docs/faq" className="block text-indigo-600 hover:text-indigo-700 hover:underline">
              Frequently Asked Questions
            </a>
            <a href="/docs/getting-started" className="block text-indigo-600 hover:text-indigo-700 hover:underline">
              Getting Started Guide
            </a>
            <a href="/docs/search" className="block text-indigo-600 hover:text-indigo-700 hover:underline">
              Search Documentation
            </a>
            <a href="/docs/pricing" className="block text-indigo-600 hover:text-indigo-700 hover:underline">
              Pricing Plans
            </a>
            <a href="/docs/legal/terms-of-service" className="block text-indigo-600 hover:text-indigo-700 hover:underline">
              Terms of Service
            </a>
          </div>
          
          <div className="mt-6 pt-5 border-t border-indigo-200">
            <p className="text-slate-700 mb-2 font-medium">Need immediate help?</p>
            <p className="text-slate-600 text-sm">
              Our support team is available via live chat for all paid plans during business hours.
            </p>
          </div>
        </div>
      </div>
      
      <div className="border-t border-slate-200 pt-6 mt-8">
        <div className="flex justify-start items-center">
          <Link 
            to="/docs/search" 
            className="flex items-center text-indigo-600 hover:text-indigo-700 font-medium"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Previous: Search Guide
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Contact; 