import React from 'react';
import { Cookie, Settings, ArrowRight, Info, Check, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import LegalHeader from '@/components/legal/legal-header';
import TableOfContents from '@/components/legal/table-of-contents';
import LegalSection from '@/components/legal/legal-section';

const CookiePolicy = () => {
  // Animation variants for container
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { 
        staggerChildren: 0.1,
        delayChildren: 0.2
      } 
    }
  };

  // Table of contents sections
  const sections = [
    'What Are Cookies', 
    'How We Use Cookies', 
    'Types of Cookies', 
    'Cookie Management', 
    'Updates to This Policy'
  ];

  // Cookie types for display in table
  const cookieTypes = [
    {
      name: "Essential Cookies",
      purpose: "These cookies are necessary for the website to function and cannot be switched off in our systems.",
      examples: ["Authentication", "Security", "Load balancing"],
      required: true
    },
    {
      name: "Functional Cookies",
      purpose: "These cookies enable the website to provide enhanced functionality and personalization.",
      examples: ["Preferences", "Language settings", "User interface customization"],
      required: false
    },
    {
      name: "Analytics Cookies",
      purpose: "These cookies help us understand how visitors interact with our website.",
      examples: ["Page visits", "Traffic sources", "User behavior"],
      required: false
    },
    {
      name: "Marketing Cookies",
      purpose: "These cookies are used to track visitors across websites to display relevant advertisements.",
      examples: ["Ad targeting", "Campaign effectiveness", "Conversion tracking"],
      required: false
    }
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 font-serif">
      {/* Legal document header */}
      <LegalHeader title="Cookie Policy" lastUpdated="Jan 2, 2025" />
      
      {/* Document navigation */}
      <TableOfContents sections={sections} />
      
      {/* Legal document content */}
      <motion.div 
        className="space-y-8 sm:space-y-10 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 md:p-8 shadow-sm"
        initial="hidden"
        animate="visible"
        variants={containerVariants}
      >
        {/* Introduction */}
        <motion.div 
          variants={{
            hidden: { y: 20, opacity: 0 },
            visible: { y: 0, opacity: 1, transition: { duration: 0.5 } }
          }} 
          className="text-slate-700"
        >
          <p>
            This Cookie Policy explains how CaseOn ("we", "us", or "our") uses cookies and similar technologies to recognize you when you visit our website and legal research platform. It explains what these technologies are and why we use them, as well as your rights to control our use of them.
          </p>
        </motion.div>
        
        {/* Section 1 */}
        <LegalSection 
          number="1"
          title="What Are Cookies" 
          icon={<Cookie className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            Cookies are small data files that are placed on your computer or mobile device when you visit a website. Cookies are widely used by website owners to make their websites work, or to work more efficiently, as well as to provide reporting information.
          </p>
          <p>
            Cookies set by the website owner (in this case, CaseOn) are called "first-party cookies". Cookies set by parties other than the website owner are called "third-party cookies". Third-party cookies enable third-party features or functionality to be provided on or through the website (e.g., advertising, interactive content, and analytics).
          </p>
        </LegalSection>
        
        {/* Section 2 */}
        <LegalSection 
          number="2"
          title="How We Use Cookies" 
          icon={<Info className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            We use cookies for several reasons. Some cookies are required for technical reasons for our platform to operate, and we refer to these as "essential" or "strictly necessary" cookies. Other cookies enable us to track and target the interests of our users to enhance the experience on our platform.
          </p>
          <p>
            We also use cookies to:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Remember your preferences and settings</li>
            <li>Understand how you navigate through our platform</li>
            <li>Determine if you have interacted with our messaging</li>
            <li>Gather usage and performance data to improve our services</li>
            <li>Deliver targeted and relevant content based on your interests</li>
          </ul>
        </LegalSection>
        
        {/* Section 3 */}
        <LegalSection 
          number="3"
          title="Types of Cookies" 
          icon={<Settings className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            The specific types of cookies served through our platform and the purposes they perform are described below:
          </p>
          
          <div className="overflow-x-auto mt-4">
            <table className="min-w-full divide-y divide-slate-200 border border-slate-200 rounded-lg text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Cookie Type</th>
                  <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Purpose</th>
                  <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Examples</th>
                  <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Required</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {cookieTypes.map((cookie, index) => (
                  <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium text-slate-900">{cookie.name}</td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-slate-700">{cookie.purpose}</td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-slate-700">
                      <ul className="list-disc pl-4 sm:pl-5">
                        {cookie.examples.map((example, i) => (
                          <li key={i}>{example}</li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-slate-700 text-center">
                      {cookie.required ? 
                        <Check className="inline-block h-4 w-4 sm:h-5 sm:w-5 text-green-600" /> : 
                        <X className="inline-block h-4 w-4 sm:h-5 sm:w-5 text-amber-600" />
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </LegalSection>
        
        {/* Footer links and contact */}
        <motion.div 
          variants={{
            hidden: { y: 20, opacity: 0 },
            visible: { y: 0, opacity: 1, transition: { duration: 0.5 } }
          }}
          className="py-5 sm:py-6 mt-8 sm:mt-10 border-t border-slate-200"
        >
          <p className="text-slate-600 text-sm">
            For questions about our Cookie Policy, please contact us at <a href="mailto:caseonza@gmail.com" className="text-indigo-600 hover:text-indigo-800">caseonza@gmail.com</a>.
          </p>
          
          <div className="flex flex-wrap gap-4 mt-5 sm:mt-6">
            <Link to="/docs/legal/terms-of-service" className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-800">
              Terms of Service
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
            <Link to="/docs/legal/privacy-policy" className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-800">
              Privacy Policy
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </div>
        </motion.div>
      </motion.div>
      
      {/* Legal footer */}
      <div className="mt-8 sm:mt-10 text-center">
        <div className="inline-flex items-center">
          <Cookie className="h-4 w-4 sm:h-5 sm:w-5 text-slate-400 mr-2" />
          <p className="text-xs sm:text-sm text-slate-500">
            By continuing to use our website, you consent to our use of cookies as described in this policy.
          </p>
        </div>
      </div>
    </div>
  );
};

export default CookiePolicy;
