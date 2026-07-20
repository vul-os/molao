import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, BookOpen, Users, Search, ArrowRight, Sparkles } from 'lucide-react';

const PricingFeature = ({ children }) => (
  <div className="flex items-center space-x-2 py-1.5">
    <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
    <span className="text-sm text-slate-600">{children}</span>
  </div>
);

const PricingPage = () => {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-serif font-bold text-slate-900 mb-4">Pricing & Plans</h1>
      <p className="text-lg text-slate-600 mb-8">
        Get started with CaseOn for free and explore our AI-powered legal research platform.
      </p>

      {/* Free Tier Card */}
      <div className="mb-12">
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-50 to-slate-50 px-6 py-4 border-b border-slate-200">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <BookOpen className="h-8 w-8 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-2xl font-serif font-bold text-slate-900">Paralegal Plan</h2>
                <p className="text-slate-600">Perfect for getting started with legal research</p>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-baseline">
                <span className="text-4xl font-bold text-slate-900">Free</span>
                <span className="text-lg text-slate-500 ml-2">forever</span>
              </div>
            </div>
          </div>
          
          <div className="px-6 py-6">
            <h3 className="text-lg font-medium text-slate-800 mb-4">What's included:</h3>
            <div className="space-y-3">
              <PricingFeature>
                <span><strong>Limited search queries</strong> - Up to 10 searches per month</span>
              </PricingFeature>
              <PricingFeature>
                <span><strong>Case summaries</strong> - AI-generated summaries of legal cases</span>
              </PricingFeature>
              <PricingFeature>
                <span><strong>Invite team members</strong> - Collaborate with up to 3 colleagues</span>
              </PricingFeature>
              <PricingFeature>
                <span><strong>Basic search tools</strong> - Essential filtering and search capabilities</span>
              </PricingFeature>
              <PricingFeature>
                <span><strong>Online documentation</strong> - Access to help guides and tutorials</span>
              </PricingFeature>
              <PricingFeature>
                <span><strong>Community support</strong> - Access to user forums and resources</span>
              </PricingFeature>
            </div>
          </div>
          
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200">
            <button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200">
              Get Started for Free
            </button>
          </div>
        </div>
      </div>

      {/* Feature Breakdown */}
      <div className="mb-12">
        <h2 className="text-2xl font-serif font-bold text-slate-900 mb-6">Feature Breakdown</h2>
        
        <div className="grid gap-6 md:grid-cols-2">
          {/* Search Feature */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-6">
            <div className="flex items-center space-x-3 mb-4">
              <Search className="h-6 w-6 text-indigo-600" />
              <h3 className="text-lg font-medium text-slate-800">Limited Search</h3>
            </div>
            <p className="text-slate-600 text-sm mb-3">
              Perform up to 10 AI-powered searches per month to find relevant legal cases and precedents.
            </p>
            <ul className="text-sm text-slate-500 space-y-1">
              <li>• Natural language queries</li>
              <li>• Basic filtering options</li>
              <li>• Relevance-based results</li>
            </ul>
          </div>

          {/* Summaries Feature */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-6">
            <div className="flex items-center space-x-3 mb-4">
              <Sparkles className="h-6 w-6 text-indigo-600" />
              <h3 className="text-lg font-medium text-slate-800">Case Summaries</h3>
            </div>
            <p className="text-slate-600 text-sm mb-3">
              Get AI-generated summaries of legal cases to quickly understand key points and precedents.
            </p>
            <ul className="text-sm text-slate-500 space-y-1">
              <li>• Key facts extraction</li>
              <li>• Legal principles highlighted</li>
              <li>• Judgment outcomes</li>
            </ul>
          </div>

          {/* Team Feature */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 md:col-span-2">
            <div className="flex items-center space-x-3 mb-4">
              <Users className="h-6 w-6 text-indigo-600" />
              <h3 className="text-lg font-medium text-slate-800">Team Collaboration</h3>
            </div>
            <p className="text-slate-600 text-sm mb-3">
              Invite up to 3 team members to collaborate on legal research projects and share findings.
            </p>
            <ul className="text-sm text-slate-500 space-y-1 grid md:grid-cols-2 gap-1">
              <li>• Share search results</li>
              <li>• Collaborative annotations</li>
              <li>• Team workspace</li>
              <li>• Basic access controls</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Getting Started Section */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-6 mb-8">
        <h3 className="text-lg font-medium text-slate-800 mb-2">Ready to get started?</h3>
        <p className="text-slate-600 mb-4">
          Sign up for your free Paralegal Plan account and start exploring CaseOn's AI-powered legal research capabilities today.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200">
            Create Free Account
          </button>
          <Link 
            to="/docs/getting-started"
            className="border border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-medium py-2 px-4 rounded-lg transition-colors duration-200 text-center"
          >
            View Getting Started Guide
          </Link>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="mb-8">
        <h3 className="text-lg font-medium text-slate-800 mb-4">Frequently Asked Questions</h3>
        <div className="space-y-4">
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900">
              Is the free plan really free forever?
            </div>
            <div className="px-4 py-3 bg-white text-sm text-slate-700">
              Yes! Our Paralegal Plan is completely free with no time limits. You get 10 searches per month, case summaries, and team collaboration features at no cost.
            </div>
          </div>
          
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900">
              Can I upgrade to more searches later?
            </div>
            <div className="px-4 py-3 bg-white text-sm text-slate-700">
              Absolutely! You can upgrade to our paid plans at any time to get unlimited searches, advanced features, and priority support.
            </div>
          </div>
          
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900">
              How does team collaboration work?
            </div>
            <div className="px-4 py-3 bg-white text-sm text-slate-700">
              You can invite up to 3 colleagues to join your workspace, share search results, and collaborate on research projects. Each team member gets their own search quota.
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200 pt-6 mt-8">
        <div className="flex justify-between items-center">
          <span className="text-slate-500 text-sm">Updated 1 day ago</span>
          <Link 
            to="/docs/getting-started" 
            className="flex items-center text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Get Started Guide
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PricingPage; 