import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

const SitemapPage = () => {
  const routes = [
    {
      title: 'Main Pages',
      links: [
        { path: '/', label: 'Home' },
        { path: '/search', label: 'Search', protected: true },
        { path: '/members', label: 'Team Members', protected: true },
        { path: '/billing', label: 'Billing', protected: true },
      ]
    },
    {
      title: 'Authentication',
      links: [
        { path: '/signin', label: 'Sign In' },
        { path: '/signup', label: 'Sign Up' },
        { path: '/forgot-password', label: 'Forgot Password' },
        { path: '/update-password', label: 'Update Password' },
      ]
    },
    {
      title: 'Documentation',
      links: [
        { path: '/docs', label: 'Documentation Home' },
        { path: '/docs/getting-started', label: 'Getting Started' },
        { path: '/docs/search', label: 'Search Guide' },
        { path: '/docs/members', label: 'Members Guide' },
        { path: '/docs/contact', label: 'Contact Us' },
      ]
    },
    {
      title: 'Legal',
      links: [
        { path: '/docs/legal/terms-of-service', label: 'Terms of Service' },
        { path: '/docs/legal/privacy-policy', label: 'Privacy Policy' },
        { path: '/docs/legal/cookie-policy', label: 'Cookie Policy' },
      ]
    }
  ];

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Sitemap
        </h1>
        <p className="mt-4 text-lg text-gray-500">
          A complete overview of all pages available on CaseOn
        </p>
      </div>

      <div className="space-y-12">
        {routes.map((section) => (
          <div key={section.title}>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              {section.title}
            </h2>
            <div className="bg-white shadow rounded-lg divide-y divide-gray-200">
              {section.links.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-gray-900">{link.label}</span>
                    {link.protected && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800">
                        Protected
                      </span>
                    )}
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SitemapPage; 