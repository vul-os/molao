import React from 'react';
import { Gavel, Scale, Shield, Book, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import LegalHeader from '@/components/legal/legal-header';
import TableOfContents from '@/components/legal/table-of-contents';
import LegalSection from '@/components/legal/legal-section';

const TermsOfService = () => {
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
    'Acceptance of Terms', 
    'User Accounts', 
    'Service Usage', 
    'Intellectual Property', 
    'Privacy', 
    'Limitation of Liability', 
    'Termination', 
    'Governing Law', 
    'Changes to Terms'
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 font-serif">
      {/* Legal document header */}
      <LegalHeader title="Terms of Service" lastUpdated="Jan 2, 2025" />
      
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
            By accessing or using CaseOn's services, you agree to be bound by these Terms of Service, our Privacy Policy, and all applicable laws and regulations.
          </p>
        </motion.div>
        
        {/* Section 1 */}
        <LegalSection 
          number="1"
          title="Acceptance of Terms" 
          icon={<Scale className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            By accessing or using CaseOn's services, you agree to be bound by these Terms of Service ("Terms"), our Privacy Policy, and all applicable laws and regulations. If you do not agree with any of these terms, you are prohibited from using or accessing our service.
          </p>
          <p>
            These Terms constitute a legally binding agreement between you (whether an individual or entity) and CaseOn regarding your access to and use of the CaseOn website, mobile application, and services.
          </p>
        </LegalSection>
        
        {/* Section 2 */}
        <LegalSection 
          number="2"
          title="User Accounts" 
          icon={<Shield className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            To access certain features of our service, you must register for an account. You agree to provide accurate, current, and complete information during the registration process and to update such information to keep it accurate, current, and complete.
          </p>
          <p>
            You are responsible for safeguarding your password and for all activities that occur under your account. You agree not to disclose your password to any third party and to notify us immediately of any unauthorized use of your account.
          </p>
        </LegalSection>
        
        {/* Section 3 */}
        <LegalSection 
          number="3"
          title="Service Usage" 
          icon={<Book className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            CaseOn's services are intended for legal research purposes only. You agree to use our services in accordance with all applicable laws and regulations.
          </p>
          <p>
            You agree not to:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Use our services for any illegal purpose or in violation of any local, state, national, or international law</li>
            <li>Violate or infringe other's rights, including intellectual property rights</li>
            <li>Interfere with or disrupt the integrity or performance of our services</li>
            <li>Attempt to gain unauthorized access to our services or related systems</li>
            <li>Reproduce, duplicate, copy, sell, resell, or exploit any portion of our services without express written permission</li>
          </ul>
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
            For questions about these Terms of Service, please contact us at <a href="mailto:legal@caseon.co.za" className="text-indigo-600 hover:text-indigo-800">legal@caseon.co.za</a>.
          </p>
          
          <div className="flex flex-wrap gap-4 mt-5 sm:mt-6">
            <Link to="/docs/legal/privacy-policy" className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-800">
              Privacy Policy
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
          <Gavel className="h-4 w-4 sm:h-5 sm:w-5 text-slate-400 mr-2" />
          <p className="text-xs sm:text-sm text-slate-500">
            This document is for informational purposes only and does not constitute legal advice.
          </p>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;
