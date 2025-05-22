import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, MapPin, Send } from 'lucide-react';

const Contact = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Simulate form submission
    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitSuccess(true);
      setFormData({
        name: '',
        email: '',
        subject: '',
        message: ''
      });
      
      // Reset success message after 5 seconds
      setTimeout(() => {
        setSubmitSuccess(false);
      }, 5000);
    }, 1500);
  };
  
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-serif font-bold text-slate-900 mb-4">Contact Us</h1>
      <p className="text-lg text-slate-600 mb-8">
        Have questions or need assistance? Our team is here to help you get the most out of CaseOn.
      </p>
      
      {/* Contact Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h2 className="text-xl font-medium text-slate-800 mb-4">Contact Information</h2>
          
          <div className="space-y-4">
            <div className="flex items-start">
              <Mail className="h-5 w-5 text-indigo-600 mr-3 mt-0.5" />
              <div>
                <p className="font-medium text-slate-800">Email</p>
                <a href="mailto:support@caseon.com" className="text-indigo-600 hover:text-indigo-700">
                  support@caseon.com
                </a>
              </div>
            </div>
            
            <div className="flex items-start">
              <Phone className="h-5 w-5 text-indigo-600 mr-3 mt-0.5" />
              <div>
                <p className="font-medium text-slate-800">Phone</p>
                <a href="tel:+27211234567" className="text-indigo-600 hover:text-indigo-700">
                  +27 21 123 4567
                </a>
                <p className="text-sm text-slate-500 mt-1">
                  Monday to Friday, 8am to 5pm SAST
                </p>
              </div>
            </div>
            
            <div className="flex items-start">
              <MapPin className="h-5 w-5 text-indigo-600 mr-3 mt-0.5" />
              <div>
                <p className="font-medium text-slate-800">Address</p>
                <address className="not-italic text-slate-600 leading-relaxed">
                  CaseOn Legal Tech<br />
                  12 Bree Street<br />
                  Cape Town, 8001<br />
                  South Africa
                </address>
              </div>
            </div>
          </div>
        </div>
        
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-5">
          <h2 className="text-xl font-medium text-slate-800 mb-4">Quick Links</h2>
          
          <div className="space-y-3">
            <a href="/docs/faq" className="block text-indigo-600 hover:text-indigo-700 hover:underline">
              Frequently Asked Questions
            </a>
            <a href="/docs/getting-started" className="block text-indigo-600 hover:text-indigo-700 hover:underline">
              Getting Started Guide
            </a>
            <a href="/docs/search" className="block text-indigo-600 hover:text-indigo-700 hover:underline">
              Search Documentation
            </a>
            <a href="/pricing" className="block text-indigo-600 hover:text-indigo-700 hover:underline">
              Pricing Plans
            </a>
            <a href="/docs/terms" className="block text-indigo-600 hover:text-indigo-700 hover:underline">
              Terms of Service
            </a>
          </div>
          
          <div className="mt-6 pt-5 border-t border-indigo-200">
            <p className="text-slate-700 mb-2 font-medium">Need immediate help?</p>
            <p className="text-slate-600 text-sm">
              Our support team is available via live chat for all paid plans during business hours.
            </p>
          </div>
        </div>
      </div>
      
      {/* Contact Form */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 mb-8">
        <h2 className="text-xl font-medium text-slate-800 mb-5">Send Us a Message</h2>
        
        {submitSuccess ? (
          <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4 text-emerald-700">
            <p className="font-medium">Message sent successfully!</p>
            <p className="text-sm mt-1">Thank you for contacting us. We'll get back to you as soon as possible.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
                  Your Name
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full rounded-md border border-slate-300 py-2 px-3 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
                  placeholder="John Doe"
                />
              </div>
              
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full rounded-md border border-slate-300 py-2 px-3 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
                  placeholder="john.doe@example.com"
                />
              </div>
            </div>
            
            <div className="mb-4">
              <label htmlFor="subject" className="block text-sm font-medium text-slate-700 mb-1">
                Subject
              </label>
              <input
                type="text"
                id="subject"
                name="subject"
                value={formData.subject}
                onChange={handleChange}
                required
                className="w-full rounded-md border border-slate-300 py-2 px-3 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
                placeholder="How can we help you?"
              />
            </div>
            
            <div className="mb-5">
              <label htmlFor="message" className="block text-sm font-medium text-slate-700 mb-1">
                Message
              </label>
              <textarea
                id="message"
                name="message"
                value={formData.message}
                onChange={handleChange}
                required
                rows="5"
                className="w-full rounded-md border border-slate-300 py-2 px-3 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
                placeholder="Please describe your question or issue in detail..."
              ></textarea>
            </div>
            
            <button
              type="submit"
              disabled={isSubmitting}
              className={`flex items-center justify-center w-full md:w-auto px-6 py-3 rounded-md text-white font-medium ${
                isSubmitting ? 'bg-indigo-400' : 'bg-indigo-600 hover:bg-indigo-700'
              } transition-colors duration-200`}
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Sending...
                </>
              ) : (
                <>
                  Send Message
                  <Send className="ml-2 h-4 w-4" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
      
      <div className="border-t border-slate-200 pt-6 mt-8">
        <div className="flex justify-start items-center">
          <Link 
            to="/docs/search" 
            className="flex items-center text-indigo-600 hover:text-indigo-700 font-medium"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Previous: Search Guide
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Contact; 