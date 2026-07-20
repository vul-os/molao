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
    'Legal Basis for Processing',
    'How We Use Your Information', 
    'Data Sharing and Disclosure',
    'Google OAuth Integration',
    'Data Retention',
    'Data Storage and Security', 
    'Your Rights and Controls', 
    'International Data Transfers',
    'Third-Party Services', 
    "Children's Privacy", 
    'California Privacy Rights',
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
          title="Legal Basis for Processing" 
          icon={<Lock className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            We process your personal data based on the following legal grounds:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Contract Performance:</strong> Processing necessary to provide our services under our Terms of Service</li>
            <li><strong>Legitimate Interest:</strong> Improving our services, security monitoring, and business operations</li>
            <li><strong>Consent:</strong> For marketing communications and optional features (which you may withdraw at any time)</li>
            <li><strong>Legal Compliance:</strong> Meeting our legal obligations under applicable laws</li>
          </ul>
        </LegalSection>
        
        {/* Section 3 */}
        <LegalSection 
          number="3"
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
            <li>Complying with legal obligations and enforcing our policies</li>
          </ul>
        </LegalSection>
        
        {/* Section 4 */}
        <LegalSection 
          number="4"
          title="Data Sharing and Disclosure" 
          icon={<Users className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            We do not sell, trade, or rent your personal information to third parties. We may share your information only in the following limited circumstances:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Service Providers:</strong> With trusted third-party vendors who assist us in operating our platform, subject to strict confidentiality agreements</li>
            <li><strong>Legal Compliance:</strong> When required by law, court order, or government regulation</li>
            <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets (with advance notice to users)</li>
            <li><strong>Safety and Security:</strong> To protect our rights, property, or safety, or that of our users or others</li>
            <li><strong>Consent:</strong> With your explicit consent for any other purpose</li>
          </ul>
          <p className="mt-4">
            <strong>No Data Selling:</strong> We do not and will never sell your personal data to advertisers or data brokers.
          </p>
        </LegalSection>
        
        {/* Section 5 */}
        <LegalSection 
          number="5"
          title="Google OAuth Integration" 
          icon={<Shield className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            When you choose to sign in with Google, we access only the minimum necessary information:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Basic Profile Information:</strong> Your name, email address, and profile picture for account creation and identification</li>
            <li><strong>Email Address:</strong> Used solely for account authentication and essential service communications</li>
          </ul>
          <p className="mt-4">
            <strong>Limited Use Disclosure:</strong> CaseOn's use of information received from Google APIs will adhere to <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-indigo-600 hover:text-indigo-800 underline">Google API Services User Data Policy</a>, including the Limited Use requirements.
          </p>
          <p>
            We do not:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Access your Google Drive, Gmail, or other Google services beyond basic profile information</li>
            <li>Store or transfer your Google data to any third parties</li>
            <li>Use your Google data for advertising or marketing purposes</li>
            <li>Allow humans to read your Google data unless for security purposes or with your explicit consent</li>
          </ul>
        </LegalSection>
        
        {/* Section 6 */}
        <LegalSection 
          number="6"
          title="Data Retention" 
          icon={<Server className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            We retain your personal data only as long as necessary for the purposes outlined in this policy:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Account Data:</strong> Retained while your account is active and for 30 days after deletion</li>
            <li><strong>Usage Data:</strong> Aggregated and anonymized data may be retained for analytics purposes</li>
            <li><strong>Legal Requirements:</strong> Some data may be retained longer to comply with legal obligations</li>
            <li><strong>Google OAuth Data:</strong> Basic profile information is deleted within 30 days of account closure</li>
          </ul>
          <p className="mt-4">
            You can request immediate deletion of your account and associated data by contacting our Data Protection Officer.
          </p>
        </LegalSection>
        
        {/* Section 7 */}
        <LegalSection 
          number="7"
          title="Data Storage and Security" 
          icon={<Shield className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            We implement comprehensive security measures to protect your data:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Encryption:</strong> Data is encrypted in transit (TLS 1.3) and at rest (AES-256)</li>
            <li><strong>Access Controls:</strong> Strict role-based access controls and regular access reviews</li>
            <li><strong>Infrastructure Security:</strong> Secure cloud hosting with regular security audits</li>
            <li><strong>Monitoring:</strong> 24/7 security monitoring and incident response procedures</li>
            <li><strong>Employee Training:</strong> Regular security awareness training for all staff</li>
          </ul>
          <p className="mt-4">
            Your data is stored on secure servers and we maintain strict access controls to protect your information. We retain your personal data only for as long as necessary to fulfill the purposes outlined in this Privacy Policy, unless a longer retention period is required by law.
          </p>
        </LegalSection>
        
        {/* Section 8 */}
        <LegalSection 
          number="8"
          title="Your Rights and Controls" 
          icon={<Eye className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            You have the following rights regarding your personal data:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Access:</strong> Request a copy of the personal data we hold about you</li>
            <li><strong>Correction:</strong> Request correction of inaccurate or incomplete data</li>
            <li><strong>Deletion:</strong> Request deletion of your personal data (subject to legal requirements)</li>
            <li><strong>Portability:</strong> Request your data in a machine-readable format</li>
            <li><strong>Restriction:</strong> Request restriction of processing in certain circumstances</li>
            <li><strong>Objection:</strong> Object to processing based on legitimate interests</li>
            <li><strong>Withdraw Consent:</strong> Withdraw consent for consent-based processing</li>
          </ul>
          <p className="mt-4">
            To exercise these rights, contact our Data Protection Officer at <a href="mailto:info@caseon.io" className="text-indigo-600 hover:text-indigo-800">info@caseon.io</a>. We will respond within 30 days.
          </p>
        </LegalSection>
        
        {/* Section 9 */}
        <LegalSection 
          number="9"
          title="International Data Transfers" 
          icon={<Server className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            Your data may be transferred to and processed in countries other than your country of residence. We ensure adequate protection through:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Standard Contractual Clauses approved by relevant data protection authorities</li>
            <li>Adequacy decisions by the European Commission or equivalent authorities</li>
            <li>Certification schemes and codes of conduct where applicable</li>
          </ul>
        </LegalSection>
        
        {/* Section 10 */}
        <LegalSection 
          number="10"
          title="Third-Party Services" 
          icon={<MessageCircle className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            Our platform may contain links to third-party websites or integrate with third-party services. We are not responsible for the privacy practices of these third parties. We encourage you to review their privacy policies.
          </p>
          <p className="mt-4">
            Current third-party integrations include:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Google OAuth for authentication</li>
            <li>Analytics services for platform improvement</li>
            <li>Payment processors for subscription management</li>
          </ul>
        </LegalSection>
        
        {/* Section 11 */}
        <LegalSection 
          number="11"
          title="Children's Privacy" 
          icon={<Shield className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            Our services are not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13. If you are a parent or guardian and believe your child has provided us with personal information, please contact us immediately.
          </p>
        </LegalSection>
        
        {/* Section 12 */}
        <LegalSection 
          number="12"
          title="California Privacy Rights" 
          icon={<Eye className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            California residents have additional rights under the California Consumer Privacy Act (CCPA):
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Right to know what personal information is collected and how it's used</li>
            <li>Right to delete personal information</li>
            <li>Right to opt-out of the sale of personal information (we do not sell personal information)</li>
            <li>Right to non-discrimination for exercising CCPA rights</li>
          </ul>
          <p className="mt-4">
            To exercise these rights, contact us at <a href="mailto:info@caseon.io" className="text-indigo-600 hover:text-indigo-800">info@caseon.io</a>.
          </p>
        </LegalSection>
        
        {/* Section 13 */}
        <LegalSection 
          number="13"
          title="Changes to This Policy" 
          icon={<ArrowRight className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            We may update this Privacy Policy from time to time. We will notify you of any material changes by:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Posting the updated policy on our website</li>
            <li>Sending an email notification to registered users</li>
            <li>Providing in-app notifications for significant changes</li>
          </ul>
          <p className="mt-4">
            Continued use of our services after the effective date constitutes acceptance of the updated policy.
          </p>
        </LegalSection>
        
        {/* Section 14 */}
        <LegalSection 
          number="14"
          title="Contact Us" 
          icon={<MessageCircle className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-700" />}
        >
          <p>
            If you have questions about this Privacy Policy or our data practices, please contact us:
          </p>
          <div className="mt-4 bg-slate-50 p-4 rounded-lg">
            <p><strong>Data Protection Officer</strong></p>
            <p>Email: <a href="mailto:info@caseon.io" className="text-indigo-600 hover:text-indigo-800">info@caseon.io</a></p>
            <p>General inquiries: <a href="mailto:info@caseon.io" className="text-indigo-600 hover:text-indigo-800">info@caseon.io</a></p>
            <p>Address: [Your business address]</p>
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
            For questions about our Privacy Policy, please contact our Data Protection Officer at <a href="mailto:info@caseon.io" className="text-indigo-600 hover:text-indigo-800">info@caseon.io</a>.
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
