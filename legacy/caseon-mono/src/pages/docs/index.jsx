import React, { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronRight, Book, Search, Users, Mail, Home, Gavel, HelpCircle } from 'lucide-react';
import TopBar from '@/components/nav/top-bar';

const DocsPage = () => {
  const location = useLocation();
  const [activeCategory, setActiveCategory] = useState('faq');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLegalMenuOpen, setIsLegalMenuOpen] = useState(false);

  // Close mobile menu when route changes
  React.useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

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
      title: 'Team Members',
      icon: <Users className="h-4 w-4" />,
      path: '/docs/members',
      id: 'members'
    },
    {
      title: 'Contact Us',
      icon: <Mail className="h-4 w-4" />,
      path: '/docs/contact',
      id: 'contact'
    },
    {
      title: 'FAQ',
      icon: <HelpCircle className="h-4 w-4" />,
      path: '/docs',
      id: 'faq'
    }
  ];

  // Legal pages navigation
  const legalNavigation = [
    {
      title: 'Terms of Service',
      icon: <ChevronRight className="h-4 w-4" />,
      path: '/docs/legal/terms-of-service',
      id: 'terms-of-service'
    },
    {
      title: 'Privacy Policy',
      icon: <ChevronRight className="h-4 w-4" />,
      path: '/docs/legal/privacy-policy',
      id: 'privacy-policy'
    },
    {
      title: 'Cookie Policy',
      icon: <ChevronRight className="h-4 w-4" />,
      path: '/docs/legal/cookie-policy',
      id: 'cookie-policy'
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
      answer: "We offer multiple plans to suit different needs, from free access to comprehensive professional solutions. For detailed pricing information and plan features, please visit our pricing page at caseon.co.za/#pricing."
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
  const isLegalPage = location.pathname.includes('/docs/legal');

  return (
    <div className="min-h-screen bg-white">
      {/* Top Bar - Added padding for mobile */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200 pt-2 sm:pt-0">
        <TopBar showPortalButton="true" />
      </div>

      {/* Mobile Menu Button - Adjusted top position */}
      <div className="md:hidden fixed top-[4.5rem] left-0 right-0 z-40 bg-white border-b border-slate-200">
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50"
          aria-expanded={isMobileMenuOpen}
          aria-controls="mobile-menu"
        >
          <span className="flex items-center">
            {isFaqPage ? (
              <>
                <HelpCircle className="h-4 w-4 mr-2" />
                Frequently Asked Questions
              </>
            ) : isLegalPage ? (
              <>
                <Gavel className="h-4 w-4 mr-2" />
                Legal Documentation
              </>
            ) : (
              <>
                <Book className="h-4 w-4 mr-2" />
                Documentation
              </>
            )}
          </span>
          <ChevronDown 
            className={`h-4 w-4 transition-transform duration-200 ${isMobileMenuOpen ? 'transform rotate-180' : ''}`} 
            aria-hidden="true"
          />
        </button>
      </div>

      {/* Mobile Menu Overlay - Adjusted top position */}
      {isMobileMenuOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black bg-opacity-25 z-40"
          style={{ top: '6.5rem' }}
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile Menu - Adjusted top position */}
      <div 
        id="mobile-menu"
        className={`md:hidden fixed top-[6.5rem] left-0 bottom-0 w-64 bg-white shadow-xl z-50 transform transition-transform duration-200 ease-in-out ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-full overflow-y-auto py-4">
          <div className="px-4 mb-4">
            <Link 
              to="/" 
              className="flex items-center px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-md"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <Home className="h-4 w-4 mr-2" />
              <span>Back to Home</span>
            </Link>
          </div>

          <div className="px-2">
            <h3 className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Documentation
            </h3>
            <nav className="space-y-1">
              {navigation.map((item) => (
                <Link
                  key={item.id}
                  to={item.path}
                  className={`flex items-center px-3 py-2 text-sm rounded-md ${
                    (isFaqPage && item.id === 'faq') || (!isFaqPage && !isLegalPage && location.pathname === item.path)
                      ? 'bg-indigo-50 text-indigo-700 font-medium'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <span className="mr-2">{item.icon}</span>
                  {item.title}
                </Link>
              ))}
            </nav>

            <div className="mt-6">
              <h3 className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Legal
              </h3>
              <nav className="space-y-1">
                {legalNavigation.map((item) => (
                  <Link
                    key={item.id}
                    to={item.path}
                    className={`flex items-center px-3 py-2 text-sm rounded-md ${
                      location.pathname === item.path
                        ? 'bg-indigo-50 text-indigo-700 font-medium'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <span className="mr-2">{item.icon}</span>
                    {item.title}
                  </Link>
                ))}
              </nav>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Sidebar - Adjusted top position */}
      <aside className="hidden md:flex flex-col w-64 border-r border-slate-200 bg-slate-50 p-6 h-[calc(100vh-4rem)] fixed top-16 left-0 overflow-y-auto">
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
                (isFaqPage && item.id === 'faq') || (!isFaqPage && !isLegalPage && location.pathname === item.path)
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span className="mr-2">{item.icon}</span>
              {item.title}
            </Link>
          ))}
          
          {/* Legal pages section */}
          <div className="pt-4">
            <button
              onClick={() => setIsLegalMenuOpen(!isLegalMenuOpen)}
              className={`flex items-center justify-between w-full px-3 py-2 text-sm rounded-md ${
                isLegalPage ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center">
                <Gavel className="h-4 w-4 mr-2" />
                <span>Legal</span>
              </div>
              <ChevronDown className={`h-4 w-4 transition-transform ${isLegalMenuOpen ? 'transform rotate-180' : ''}`} />
            </button>
            
            {isLegalMenuOpen && (
              <div className="pl-6 mt-1 space-y-1">
                {legalNavigation.map((item) => (
                  <Link
                    key={item.id}
                    to={item.path}
                    className={`flex items-center px-3 py-2 text-sm rounded-md ${
                      location.pathname === item.path
                        ? 'bg-indigo-50 text-indigo-700 font-medium'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="mr-2">{item.icon}</span>
                    {item.title}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>
      </aside>

      {/* Main Content - Adjusted padding for mobile */}
      <main className={`pt-20 md:pt-16 ${isMobileMenuOpen ? 'md:pl-64' : ''} md:pl-64`}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          {isFaqPage ? (
            <>
              <h1 className="text-2xl sm:text-3xl font-serif font-bold text-slate-900 mb-6 sm:mb-8">
                Frequently Asked Questions
              </h1>
              
              <div className="space-y-4 sm:space-y-6">
                {faqs.map((faq, index) => (
                  <div key={index} className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="bg-slate-50 px-3 sm:px-4 py-2 sm:py-3 text-base sm:text-lg font-medium text-slate-900">
                      {faq.question}
                    </div>
                    <div className="px-3 sm:px-4 py-3 sm:py-4 bg-white text-sm sm:text-base text-slate-700">
                      <p>{faq.answer}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <Outlet />
          )}
        </div>
      </main>
    </div>
  );
};

export default DocsPage;
