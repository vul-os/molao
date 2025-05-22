import React, { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronRight, Book, Search, Users, Mail, Home } from 'lucide-react';
import TopBar from '@/components/nav/top-bar';

const DocsPage = () => {
  const location = useLocation();
  const [activeCategory, setActiveCategory] = useState('faq');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Navigation structure
  const navigation = [
    {
      title: 'Getting Started',
      icon: <Book className="h-4 w-4" />,
      path: '/docs/getting-started',
      id: 'getting-started'
    },
    {
      title: 'Search',
      icon: <Search className="h-4 w-4" />,
      path: '/docs/search',
      id: 'search'
    },
    {
      title: 'Contact Us',
      icon: <Mail className="h-4 w-4" />,
      path: '/docs/contact',
      id: 'contact'
    },
    {
      title: 'FAQ',
      icon: <ChevronRight className="h-4 w-4" />,
      path: '/docs',
      id: 'faq'
    }
  ];

  // FAQ data
  const faqs = [
    {
      question: "What is CaseOn?",
      answer: "CaseOn is an AI-powered legal research platform designed specifically for South African legal professionals. It helps you search through thousands of legal judgments to find relevant precedents quickly and accurately."
    },
    {
      question: "How does the AI search work?",
      answer: "Our AI understands legal context and nuance beyond simple keyword matching. It analyzes the semantic meaning of your query and matches it with relevant legal documents, providing truly relevant results even when exact keywords aren't present."
    },
    {
      question: "What plans do you offer?",
      answer: "We offer three plans: Paralegal (Free), Associate (R100/month), and Partner (R345/month). Each plan provides different levels of access and features to meet your specific needs. Visit our pricing page for more details."
    },
    {
      question: "How do I get started?",
      answer: "Simply sign up for a free account to get started with our Paralegal plan. You can upgrade to a paid plan at any time. Once registered, you'll have immediate access to our basic search functionality."
    },
    {
      question: "Can I export or share my research?",
      answer: "Yes, depending on your plan, you can export cases with proper citations and formatting. You can create professional PDF reports with your branding to share directly with clients or the court."
    },
    {
      question: "Is my data secure?",
      answer: "Yes, we take data security very seriously. All your data is encrypted and stored securely. We never share your information with third parties without your explicit consent."
    }
  ];

  // Determine if the current page is the FAQ (index) page
  const isFaqPage = location.pathname === '/docs';

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <TopBar showPortalButton="true" />
      
      <div className="flex flex-1">
        {/* Sidebar - Desktop */}
        <aside className="hidden md:flex flex-col w-64 border-r border-slate-200 bg-slate-50 p-6">
          <div className="mb-6">
            <Link to="/" className="flex items-center text-slate-700 hover:text-indigo-600 transition-colors">
              <Home className="h-4 w-4 mr-2" />
              <span className="text-sm font-medium">Back to Home</span>
            </Link>
          </div>
          
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">Documentation</h3>
          <nav className="space-y-1">
            {navigation.map((item) => (
              <Link
                key={item.id}
                to={item.path}
                className={`flex items-center px-3 py-2 text-sm rounded-md ${
                  (isFaqPage && item.id === 'faq') || (!isFaqPage && location.pathname === item.path)
                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span className="mr-2">{item.icon}</span>
                {item.title}
              </Link>
            ))}
          </nav>
        </aside>
        
        {/* Mobile nav toggle */}
        <div className="md:hidden border-b border-slate-200 p-4">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="flex items-center justify-between w-full px-4 py-2 text-sm font-medium text-slate-700 bg-slate-50 rounded-md border border-slate-200 hover:bg-slate-100"
          >
            <span>Documentation</span>
            <ChevronDown className="h-4 w-4" />
          </button>
          
          {isMobileMenuOpen && (
            <div className="absolute z-10 mt-2 w-full left-0 right-0 bg-white shadow-lg border border-slate-200 rounded-b-md p-2">
              {navigation.map((item) => (
                <Link
                  key={item.id}
                  to={item.path}
                  className={`flex items-center px-3 py-2 text-sm ${
                    (isFaqPage && item.id === 'faq') || (!isFaqPage && location.pathname === item.path)
                      ? 'bg-indigo-50 text-indigo-700 font-medium'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <span className="mr-2">{item.icon}</span>
                  {item.title}
                </Link>
              ))}
            </div>
          )}
        </div>
        
        {/* Main content area */}
        <div className="flex-1 overflow-auto">
          {isFaqPage ? (
            <div className="max-w-3xl mx-auto px-4 py-8">
              <h1 className="text-3xl font-serif font-bold text-slate-900 mb-8">Frequently Asked Questions</h1>
              
              <div className="space-y-6">
                {faqs.map((faq, index) => (
                  <div key={index} className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="bg-slate-50 px-4 py-3 text-lg font-medium text-slate-900">
                      {faq.question}
                    </div>
                    <div className="px-4 py-4 bg-white text-slate-700">
                      <p>{faq.answer}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Outlet />
          )}
        </div>
      </div>
    </div>
  );
};

export default DocsPage;
