import React from 'react';
import { Gavel, Scale, Shield, Book, ArrowRight, Users } from 'lucide-react';
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
    'Privacy and Data Protection',
    'User Content and Conduct',
    'Limitation of Liability', 
    'Termination', 
    'Governing Law and Dispute Resolution',
    'Changes to Terms',
    'Miscellaneous'
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
          <p className="mt-4">
            <strong>Support Staff Protection:</strong> CaseOn reserves the right to protect the identities of our support staff by using pseudonyms, fake names, and stock or altered images in certain instances. This practice is implemented for the safety and security of our personnel and does not affect the quality or authenticity of the support services provided.
          </p>
        </LegalSection>
        
        {/* Section 4 */}
        <LegalSection 
          number="4"
          title="Intellectual Property" 
          icon={<Book className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            CaseOn and its original content, features, and functionality are and will remain the exclusive property of CaseOn and its licensors. The service is protected by copyright, trademark, and other laws.
          </p>
          <p>
            You may not:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Reproduce, distribute, modify, create derivative works of, publicly display, publicly perform, republish, download, store, or transmit any of the material on our service</li>
            <li>Use our trademarks, logos, or brand names without explicit written permission</li>
            <li>Reverse engineer, decompile, or disassemble any part of our software</li>
            <li>Remove or modify any proprietary notices or labels</li>
          </ul>
        </LegalSection>
        
        {/* Section 5 */}
        <LegalSection 
          number="5"
          title="Privacy and Data Protection" 
          icon={<Shield className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            Your privacy is important to us. Our Privacy Policy explains how we collect, use, and protect your information when you use our service. By using our service, you agree to the collection and use of information in accordance with our Privacy Policy.
          </p>
          <p>
            <strong>Google OAuth Data:</strong> When you sign in with Google, we access only the minimum necessary information as detailed in our Privacy Policy. We comply with Google's API Services User Data Policy and Limited Use requirements.
          </p>
          <p>
            We implement appropriate security measures to protect your personal information and maintain strict data protection standards in compliance with applicable privacy laws.
          </p>
        </LegalSection>
        
        {/* Section 6 */}
        <LegalSection 
          number="6"
          title="User Content and Conduct" 
          icon={<Users className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            You retain ownership of any content you submit, post, or display on or through the service ("User Content"). By posting User Content, you grant us a worldwide, non-exclusive, royalty-free license to use, reproduce, modify, and distribute such content solely for providing and improving our services.
          </p>
          <p>
            You agree that your User Content will not:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Violate any third-party rights, including copyright, trademark, privacy, or other proprietary rights</li>
            <li>Contain unlawful, threatening, abusive, defamatory, or obscene content</li>
            <li>Include spam, commercial solicitation, or mass distribution content</li>
            <li>Contain viruses, malware, or other harmful computer code</li>
            <li>Impersonate any person or entity or misrepresent your affiliation</li>
          </ul>
        </LegalSection>
        
        {/* Section 7 */}
        <LegalSection 
          number="7"
          title="Limitation of Liability" 
          icon={<Shield className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            <strong>DISCLAIMER:</strong> Our service is provided on an "as is" and "as available" basis. We make no representations or warranties of any kind, express or implied, regarding the service.
          </p>
          <p>
            To the fullest extent permitted by law, CaseOn shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, use, goodwill, or other intangible losses.
          </p>
          <p>
            Our total liability to you for all claims arising from these terms or your use of the service shall not exceed the amount you paid us in the twelve months preceding the claim.
          </p>
          <p className="mt-4">
            <strong>Professional Use Notice:</strong> CaseOn is a research tool and does not provide legal advice. Always consult with qualified legal professionals for specific legal matters.
          </p>
        </LegalSection>
        
        {/* Section 8 */}
        <LegalSection 
          number="8"
          title="Termination" 
          icon={<ArrowRight className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            We may terminate or suspend your account and access to the service immediately, without prior notice or liability, for any reason, including if you breach these Terms.
          </p>
          <p>
            You may terminate your account at any time by contacting us. Upon termination, your right to use the service will stop immediately.
          </p>
          <p>
            Upon termination:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Your access to the service will be discontinued</li>
            <li>Your personal data will be deleted in accordance with our Privacy Policy</li>
            <li>Any outstanding fees will remain due and payable</li>
            <li>Provisions that should survive termination will remain in effect</li>
          </ul>
        </LegalSection>
        
        {/* Section 9 */}
        <LegalSection 
          number="9"
          title="Governing Law and Dispute Resolution" 
          icon={<Scale className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            These Terms are governed by and construed in accordance with the laws of South Africa, without regard to conflict of law principles.
          </p>
          <p>
            Any disputes arising from these Terms or your use of the service will be resolved through binding arbitration in accordance with the rules of the Arbitration Foundation of Southern Africa, except that you may assert claims in small claims court if they qualify.
          </p>
          <p>
            The arbitration will be conducted in English and held in Cape Town, South Africa, unless otherwise agreed by both parties.
          </p>
        </LegalSection>
        
        {/* Section 10 */}
        <LegalSection 
          number="10"
          title="Changes to Terms" 
          icon={<ArrowRight className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            We reserve the right to modify these Terms at any time. We will notify users of material changes by:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Posting the updated Terms on our website</li>
            <li>Sending email notifications to registered users</li>
            <li>Providing in-app notifications for significant changes</li>
          </ul>
          <p className="mt-4">
            Your continued use of the service after the effective date of the revised Terms constitutes acceptance of the changes. If you do not agree to the modified Terms, you must stop using the service.
          </p>
        </LegalSection>
        
        {/* Section 11 */}
        <LegalSection 
          number="11"
          title="Miscellaneous" 
          icon={<Book className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            <strong>Entire Agreement:</strong> These Terms, together with our Privacy Policy, constitute the complete agreement between you and CaseOn regarding the service.
          </p>
          <p>
            <strong>Severability:</strong> If any provision of these Terms is found to be unenforceable, the remaining provisions will continue in full force and effect.
          </p>
          <p>
            <strong>Waiver:</strong> No waiver of any term or condition will be deemed a continuing waiver of such term or any other term.
          </p>
          <p>
            <strong>Assignment:</strong> You may not assign these Terms without our written consent. We may assign these Terms without restriction.
          </p>
          <p>
            <strong>Contact Information:</strong> For legal notices, contact us at <a href="mailto:legal@caseon.co.za" className="text-indigo-600 hover:text-indigo-800">legal@caseon.co.za</a>.
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
