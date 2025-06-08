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
    'Legal Basis for Cookie Use',
    'Third-Party Cookies and Services',
    'Google Services and Cookies',
    'Data Retention and Storage',
    'Cookie Management and Your Rights',
    'International Data Transfers',
    'Changes to This Policy',
    'Contact Information'
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
        
        {/* Section 4 */}
        <LegalSection 
          number="4"
          title="Legal Basis for Cookie Use" 
          icon={<Settings className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            Our use of cookies is based on the following legal grounds:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Consent:</strong> For non-essential cookies, we obtain your consent before placing them on your device</li>
            <li><strong>Legitimate Interest:</strong> For essential cookies necessary to provide our services and improve user experience</li>
            <li><strong>Contract Performance:</strong> For cookies required to deliver the services you've requested</li>
          </ul>
          <p className="mt-4">
            You can withdraw your consent at any time by adjusting your cookie preferences or contacting us directly.
          </p>
        </LegalSection>
        
        {/* Section 5 */}
        <LegalSection 
          number="5"
          title="Third-Party Cookies and Services" 
          icon={<Info className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            We work with third-party service providers who may place cookies on your device. These providers include:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Google Analytics:</strong> To understand website usage and improve our services</li>
            <li><strong>Google OAuth:</strong> For secure authentication and user management</li>
            <li><strong>Payment Processors:</strong> To handle subscription payments securely</li>
            <li><strong>Content Delivery Networks:</strong> To optimize website performance</li>
            <li><strong>Security Services:</strong> To protect against fraud and security threats</li>
          </ul>
          <p className="mt-4">
            These third parties have their own privacy policies and cookie practices. We encourage you to review their policies to understand how they use your data.
          </p>
        </LegalSection>
        
        {/* Section 6 */}
        <LegalSection 
          number="6"
          title="Google Services and Cookies" 
          icon={<Cookie className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            When you use Google OAuth to sign in to CaseOn, Google may set cookies on your device. We specifically use Google services for:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Authentication:</strong> Google OAuth cookies for secure sign-in</li>
            <li><strong>Analytics:</strong> Google Analytics cookies to understand usage patterns</li>
            <li><strong>Security:</strong> Google reCAPTCHA cookies to prevent spam and abuse</li>
          </ul>
          <p className="mt-4">
            <strong>Google API Services Compliance:</strong> Our use of Google services and any associated cookies complies with Google's API Services User Data Policy, including Limited Use requirements. We do not use Google cookies for advertising or marketing purposes.
          </p>
          <p className="mt-4">
            For more information about Google's use of cookies, please visit <a href="https://policies.google.com/technologies/cookies" className="text-indigo-600 hover:text-indigo-800 underline">Google's Cookie Policy</a>.
          </p>
        </LegalSection>
        
        {/* Section 7 */}
        <LegalSection 
          number="7"
          title="Data Retention and Storage" 
          icon={<Settings className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            Different types of cookies have different retention periods:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Session Cookies:</strong> Deleted when you close your browser</li>
            <li><strong>Persistent Cookies:</strong> Remain on your device for a set period (typically 30 days to 2 years)</li>
            <li><strong>Authentication Cookies:</strong> Expire when you log out or after 30 days of inactivity</li>
            <li><strong>Analytics Cookies:</strong> Typically stored for 2 years for trend analysis</li>
          </ul>
          <p className="mt-4">
            Cookie data is stored securely and encrypted where technically feasible. We regularly review and delete expired cookies in accordance with our data retention policies.
          </p>
        </LegalSection>
        
        {/* Section 8 */}
        <LegalSection 
          number="8"
          title="Cookie Management and Your Rights" 
          icon={<Check className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            You have several options for managing cookies:
          </p>
          
          <div className="mt-4">
            <h4 className="font-semibold text-slate-900 mb-2">Browser Controls:</h4>
            <ul className="list-disc pl-5 space-y-2">
              <li>Block all cookies through your browser settings</li>
              <li>Delete existing cookies from your device</li>
              <li>Set your browser to notify you when cookies are being sent</li>
              <li>Use private/incognito browsing mode</li>
            </ul>
          </div>
          
          <div className="mt-4">
            <h4 className="font-semibold text-slate-900 mb-2">Platform Controls:</h4>
            <ul className="list-disc pl-5 space-y-2">
              <li>Adjust cookie preferences in your account settings</li>
              <li>Opt out of non-essential cookies during registration</li>
              <li>Contact our Data Protection Officer to exercise your rights</li>
            </ul>
          </div>
          
          <div className="mt-4">
            <h4 className="font-semibold text-slate-900 mb-2">Your Rights Include:</h4>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Access:</strong> Request information about cookies we've placed</li>
              <li><strong>Deletion:</strong> Request deletion of cookie data</li>
              <li><strong>Withdraw Consent:</strong> Revoke consent for non-essential cookies</li>
              <li><strong>Objection:</strong> Object to cookie use based on legitimate interests</li>
            </ul>
          </div>
          
          <p className="mt-4 text-sm text-slate-600 bg-amber-50 p-3 rounded-lg">
            <strong>Important:</strong> Disabling essential cookies may affect the functionality of our platform, including your ability to log in or access certain features.
          </p>
        </LegalSection>
        
        {/* Section 9 */}
        <LegalSection 
          number="9"
          title="International Data Transfers" 
          icon={<Settings className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            Some of our third-party service providers may process cookie data in countries outside your residence. We ensure adequate protection through:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Adequacy decisions by relevant data protection authorities</li>
            <li>Standard Contractual Clauses with service providers</li>
            <li>Certification schemes and codes of conduct where applicable</li>
            <li>Google's compliance with applicable data protection frameworks</li>
          </ul>
        </LegalSection>
        
        {/* Section 10 */}
        <LegalSection 
          number="10"
          title="Changes to This Policy" 
          icon={<ArrowRight className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            We may update this Cookie Policy from time to time to reflect changes in our practices or for legal, operational, or regulatory reasons. We will notify you of material changes by:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Posting the updated policy on our website with a new "last updated" date</li>
            <li>Sending email notifications to registered users for significant changes</li>
            <li>Displaying prominent notices on our platform</li>
            <li>Requesting renewed consent where required by law</li>
          </ul>
          <p className="mt-4">
            We encourage you to review this Cookie Policy periodically to stay informed about how we use cookies.
          </p>
        </LegalSection>
        
        {/* Section 11 */}
        <LegalSection 
          number="11"
          title="Contact Information" 
          icon={<Info className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            If you have questions about this Cookie Policy or our cookie practices, please contact us:
          </p>
          <div className="mt-4 bg-slate-50 p-4 rounded-lg">
            <p><strong>Data Protection Officer</strong></p>
            <p>Email: <a href="mailto:dpo@caseon.co.za" className="text-indigo-600 hover:text-indigo-800">dpo@caseon.co.za</a></p>
            <p>Cookie concerns: <a href="mailto:privacy@caseon.co.za" className="text-indigo-600 hover:text-indigo-800">privacy@caseon.co.za</a></p>
            <p>General inquiries: <a href="mailto:info@caseon.io" className="text-indigo-600 hover:text-indigo-800">info@caseon.io</a></p>
            <p>Address: [Your business address]</p>
          </div>
          <p className="mt-4 text-sm text-slate-600">
            For immediate cookie management, you can also adjust your browser settings or use the cookie preference center in your account dashboard.
          </p>
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
            For questions about our Cookie Policy, please contact us at <a href="mailto:dpo@caseon.co.za" className="text-indigo-600 hover:text-indigo-800">dpo@caseon.co.za</a>.
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
