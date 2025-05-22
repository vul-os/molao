import React from 'react';
import { Link } from 'react-router-dom';
import { Check, ArrowRight } from 'lucide-react';

const GettingStarted = () => {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-serif font-bold text-slate-900 mb-4">Getting Started with CaseOn</h1>
      <p className="text-lg text-slate-600 mb-8">
        Welcome to CaseOn! This guide will help you get started with our AI-powered legal research platform.
      </p>

      {/* Step 1 */}
      <div className="mb-12">
        <div className="flex items-center mb-4">
          <div className="flex-shrink-0 h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center mr-3">
            <span className="text-indigo-700 font-semibold">1</span>
          </div>
          <h2 className="text-2xl font-serif font-bold text-slate-800">Create Your Account</h2>
        </div>
        <div className="pl-11">
          <p className="text-slate-600 mb-4">
            Getting started with CaseOn is simple. Sign up for a free account to access our basic features immediately.
          </p>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4">
            <h3 className="text-lg font-medium text-slate-800 mb-2">How to sign up:</h3>
            <ol className="space-y-2 text-slate-600">
              <li className="flex items-start">
                <Check className="h-5 w-5 text-emerald-500 mr-2 mt-0.5" />
                <span>Click the "Sign Up" button in the top right corner of the homepage</span>
              </li>
              <li className="flex items-start">
                <Check className="h-5 w-5 text-emerald-500 mr-2 mt-0.5" />
                <span>Enter your email address and create a secure password</span>
              </li>
              <li className="flex items-start">
                <Check className="h-5 w-5 text-emerald-500 mr-2 mt-0.5" />
                <span>Verify your email address by clicking the link sent to your inbox</span>
              </li>
              <li className="flex items-start">
                <Check className="h-5 w-5 text-emerald-500 mr-2 mt-0.5" />
                <span>Complete your profile with your name and professional details</span>
              </li>
            </ol>
          </div>
          <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4">
            <p className="text-indigo-700 font-medium">
              Pro Tip: You can start with our free Paralegal Plan and upgrade later as your needs grow.
            </p>
          </div>
        </div>
      </div>

      {/* Step 2 */}
      <div className="mb-12">
        <div className="flex items-center mb-4">
          <div className="flex-shrink-0 h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center mr-3">
            <span className="text-indigo-700 font-semibold">2</span>
          </div>
          <h2 className="text-2xl font-serif font-bold text-slate-800">Navigate the Dashboard</h2>
        </div>
        <div className="pl-11">
          <p className="text-slate-600 mb-4">
            Once you've signed up, you'll be taken to your dashboard. This is your home base for all legal research activities.
          </p>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4">
            <h3 className="text-lg font-medium text-slate-800 mb-2">Key dashboard features:</h3>
            <ul className="space-y-2 text-slate-600">
              <li className="flex items-start">
                <Check className="h-5 w-5 text-emerald-500 mr-2 mt-0.5" />
                <span><strong>Search Bar:</strong> Enter legal questions or keywords to find relevant cases</span>
              </li>
              <li className="flex items-start">
                <Check className="h-5 w-5 text-emerald-500 mr-2 mt-0.5" />
                <span><strong>Results View:</strong> See your search results with key information highlighted</span>
              </li>
              <li className="flex items-start">
                <Check className="h-5 w-5 text-emerald-500 mr-2 mt-0.5" />
                <span><strong>Account Settings:</strong> Manage your profile, subscription, and preferences</span>
              </li>
              <li className="flex items-start">
                <Check className="h-5 w-5 text-emerald-500 mr-2 mt-0.5" />
                <span><strong>Advanced Filters:</strong> Refine results by date, court, judge, or topic</span>
              </li>
            </ul>
          </div>
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <div className="bg-slate-100 px-4 py-2 text-xs font-medium text-slate-500 uppercase">
              Dashboard Preview
            </div>
            <div className="p-4 bg-white">
              <div className="relative max-w-md mx-auto rounded-lg overflow-hidden border border-slate-200">
                <img 
                  src="/portal.png" 
                  alt="CaseOn Dashboard" 
                  className="w-full object-contain" 
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Step 3 */}
      <div className="mb-12">
        <div className="flex items-center mb-4">
          <div className="flex-shrink-0 h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center mr-3">
            <span className="text-indigo-700 font-semibold">3</span>
          </div>
          <h2 className="text-2xl font-serif font-bold text-slate-800">Perform Your First Search</h2>
        </div>
        <div className="pl-11">
          <p className="text-slate-600 mb-4">
            Our AI-powered search is designed to understand legal language and context, making it easy to find relevant cases.
          </p>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4">
            <h3 className="text-lg font-medium text-slate-800 mb-2">Search tips:</h3>
            <ul className="space-y-2 text-slate-600">
              <li className="flex items-start">
                <Check className="h-5 w-5 text-emerald-500 mr-2 mt-0.5" />
                <span>Use natural language questions (e.g., "What is the standard for negligence in medical malpractice?")</span>
              </li>
              <li className="flex items-start">
                <Check className="h-5 w-5 text-emerald-500 mr-2 mt-0.5" />
                <span>Include relevant legal terms, acts, or case names when applicable</span>
              </li>
              <li className="flex items-start">
                <Check className="h-5 w-5 text-emerald-500 mr-2 mt-0.5" />
                <span>Be specific about jurisdiction if you're looking for cases from a particular court</span>
              </li>
              <li className="flex items-start">
                <Check className="h-5 w-5 text-emerald-500 mr-2 mt-0.5" />
                <span>Use the filters to narrow results by date, court, judge, or topic</span>
              </li>
            </ul>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-4">
            <p className="text-amber-700">
              <strong>Example Query:</strong> "Recent Constitutional Court judgments on privacy rights under POPI Act"
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200 pt-6 mt-8">
        <div className="flex justify-between items-center">
          <span className="text-slate-500 text-sm">Updated 2 days ago</span>
          <Link 
            to="/docs/search" 
            className="flex items-center text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Next: Search Guide
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default GettingStarted; 