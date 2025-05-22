import React from 'react';
import { Lock, Eye, Server, ArrowRight, Shield, MessageCircle, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import LegalHeader from '@/components/legal/legal-header';
import TableOfContents from '@/components/legal/table-of-contents';
import LegalSection from '@/components/legal/legal-section';

const PrivacyPolicy = () => {
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
    'Information We Collect', 
    'How We Use Your Information', 
    'Data Storage and Security', 
    'Your Rights', 
    'Third-Party Services', 
    "Children's Privacy", 
    'Changes to This Policy', 
    'Contact Us'
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 font-serif">
      {/* Legal document header */}
      <LegalHeader title="Privacy Policy" lastUpdated="Jan 4, 2025" />
      
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
            At CaseOn, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our legal research platform. Please read this policy carefully to understand our practices regarding your personal data.
          </p>
        </motion.div>
        
        {/* Section 1 */}
        <LegalSection 
          number="1"
          title="Information We Collect" 
          icon={<Eye className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            We collect several types of information from and about users of our platform, including:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Personal Information:</strong> When you register for an account, we collect your name, email address, password, and professional information such as your firm or organization.</li>
            <li><strong>Usage Data:</strong> We automatically collect information about your usage patterns, including pages visited, search queries, documents viewed, and time spent on various platform features.</li>
            <li><strong>Device Information:</strong> We collect information about the device and browser you use to access our platform, including IP address, browser type, and operating system.</li>
            <li><strong>Cookies and Similar Technologies:</strong> We use cookies and similar technologies to enhance your experience, analyze usage patterns, and remember your preferences.</li>
          </ul>
        </LegalSection>
        
        {/* Section 2 */}
        <LegalSection 
          number="2"
          title="How We Use Your Information" 
          icon={<Server className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            We use the information we collect for various purposes, including:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Providing, maintaining, and improving our services</li>
            <li>Processing your subscription and payment information</li>
            <li>Personalizing your experience and delivering content relevant to your interests</li>
            <li>Sending you technical notices, updates, security alerts, and administrative messages</li>
            <li>Monitoring and analyzing trends, usage, and activities in connection with our services</li>
            <li>Responding to your comments, questions, and requests</li>
            <li>Protecting our legal rights and preventing misuse of the platform</li>
          </ul>
        </LegalSection>
        
        {/* Section 3 */}
        <LegalSection 
          number="3"
          title="Data Storage and Security" 
          icon={<Shield className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            We implement appropriate technical and organizational measures to protect the security of your personal information. However, please note that no method of transmission over the Internet or electronic storage is completely secure.
          </p>
          <p>
            Your data is stored on secure servers and we maintain strict access controls to protect your information. We retain your personal data only for as long as necessary to fulfill the purposes outlined in this Privacy Policy, unless a longer retention period is required by law.
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
            For questions about our Privacy Policy, please contact our Data Protection Officer at <a href="mailto:caseonza@gmail.com" className="text-indigo-600 hover:text-indigo-800">caseonza@gmail.com</a>.
          </p>
          
          <div className="flex flex-wrap gap-4 mt-5 sm:mt-6">
            <Link to="/docs/legal/terms-of-service" className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-800">
              Terms of Service
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
            <Link to="/docs/legal/cookie-policy" className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-800">
              Cookie Policy
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </div>
        </motion.div>
      </motion.div>
      
      {/* Legal footer */}
      <div className="mt-8 sm:mt-10 text-center">
        <div className="inline-flex items-center">
          <Lock className="h-4 w-4 sm:h-5 sm:w-5 text-slate-400 mr-2" />
          <p className="text-xs sm:text-sm text-slate-500">
            Your privacy is important to us. We are committed to protecting your personal information.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
