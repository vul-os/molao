import React from 'react';
import { Button } from "@/components/ui/button";
import { Facebook, Twitter, Instagram, Mail, MapPin, Phone, ExternalLink, Send, Globe, ArrowRight, ChevronRight } from "lucide-react";

export function Footer() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="bg-slate-50 border-t border-slate-200 pt-16 pb-8 w-full">
      <div className="w-full max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 mb-16">
          {/* Logo and company description */}
          <div className="col-span-1 md:col-span-4">
            <div className="flex items-center mb-5">
              <div className="h-9 w-9 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-sm flex items-center justify-center">
                <img src="/icon.svg" alt="StorNxtDoor Logo" className="h-6 w-auto brightness-0 invert" />
              </div>
              <div className="ml-2 flex flex-col">
                <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-blue-500">
                  StorNxtDoor
                </span>
                <span className="text-[10px] text-slate-500 -mt-1 tracking-wider">STORAGE MARKETPLACE</span>
              </div>
            </div>
            <p className="text-slate-600 text-sm mb-6">
              Connecting communities through shared spaces. Find secure storage or earn extra income by listing your unused space on our marketplace.
            </p>
            <div className="flex mt-4 space-x-3">
              <a href="#" className="text-slate-500 hover:text-blue-600 transition-all hover:scale-110 duration-300 bg-white p-2 rounded-full shadow-sm border border-slate-100">
                <Facebook size={18} />
              </a>
              <a href="#" className="text-slate-500 hover:text-blue-600 transition-all hover:scale-110 duration-300 bg-white p-2 rounded-full shadow-sm border border-slate-100">
                <Twitter size={18} />
              </a>
              <a href="#" className="text-slate-500 hover:text-blue-600 transition-all hover:scale-110 duration-300 bg-white p-2 rounded-full shadow-sm border border-slate-100">
                <Instagram size={18} />
              </a>
              <a href="#" className="text-slate-500 hover:text-blue-600 transition-all hover:scale-110 duration-300 bg-white p-2 rounded-full shadow-sm border border-slate-100">
                <Globe size={18} />
              </a>
            </div>
          </div>

          {/* Navigation sections */}
          <div className="col-span-1 md:col-span-5">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
              <div>
                <h3 className="font-semibold text-slate-900 mb-5 text-sm uppercase tracking-wider">Product</h3>
                <ul className="space-y-3 text-sm">
                  <li>
                    <a href="#" className="text-slate-600 hover:text-blue-600 transition-colors flex items-center gap-1 group">
                      <span>Features</span>
                      <ChevronRight className="w-3 h-3 opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                    </a>
                  </li>
                  <li>
                    <a href="#" className="text-slate-600 hover:text-blue-600 transition-colors flex items-center gap-1 group">
                      <span>Pricing</span>
                      <ChevronRight className="w-3 h-3 opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                    </a>
                  </li>
                  <li>
                    <a href="#" className="text-slate-600 hover:text-blue-600 transition-colors flex items-center gap-1 group">
                      <span>Security</span>
                      <ChevronRight className="w-3 h-3 opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                    </a>
                  </li>
                  <li>
                    <a href="#" className="text-slate-600 hover:text-blue-600 transition-colors flex items-center gap-1 group">
                      <span>For Hosts</span>
                      <ChevronRight className="w-3 h-3 opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                    </a>
                  </li>
                  <li>
                    <a href="#" className="text-slate-600 hover:text-blue-600 transition-colors flex items-center gap-1 group">
                      <span>For Renters</span>
                      <ChevronRight className="w-3 h-3 opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 mb-5 text-sm uppercase tracking-wider">Resources</h3>
                <ul className="space-y-3 text-sm">
                  <li>
                    <a href="#" className="text-slate-600 hover:text-blue-600 transition-colors flex items-center gap-1 group">
                      <span>Blog</span>
                      <ChevronRight className="w-3 h-3 opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                    </a>
                  </li>
                  <li>
                    <a href="#" className="text-slate-600 hover:text-blue-600 transition-colors flex items-center gap-1 group">
                      <span>Help Center</span>
                      <ChevronRight className="w-3 h-3 opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                    </a>
                  </li>
                  <li>
                    <a href="#" className="text-slate-600 hover:text-blue-600 transition-colors flex items-center gap-1 group">
                      <span>Community</span>
                      <ChevronRight className="w-3 h-3 opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                    </a>
                  </li>
                  <li>
                    <a href="#" className="text-slate-600 hover:text-blue-600 transition-colors flex items-center gap-1 group">
                      <span>Testimonials</span>
                      <ChevronRight className="w-3 h-3 opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                    </a>
                  </li>
                  <li>
                    <a href="#" className="text-slate-600 hover:text-blue-600 transition-colors flex items-center gap-1 group">
                      <span>Partners</span>
                      <ChevronRight className="w-3 h-3 opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 mb-5 text-sm uppercase tracking-wider">Company</h3>
                <ul className="space-y-3 text-sm">
                  <li>
                    <a href="#" className="text-slate-600 hover:text-blue-600 transition-colors flex items-center gap-1 group">
                      <span>About Us</span>
                      <ChevronRight className="w-3 h-3 opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                    </a>
                  </li>
                  <li>
                    <a href="#" className="text-slate-600 hover:text-blue-600 transition-colors flex items-center gap-1 group">
                      <span>Careers</span>
                      <ChevronRight className="w-3 h-3 opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                    </a>
                  </li>
                  <li>
                    <a href="#" className="text-slate-600 hover:text-blue-600 transition-colors flex items-center gap-1 group">
                      <span>Press</span>
                      <ChevronRight className="w-3 h-3 opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                    </a>
                  </li>
                  <li>
                    <a href="#" className="text-slate-600 hover:text-blue-600 transition-colors flex items-center gap-1 group">
                      <span>Privacy</span>
                      <ChevronRight className="w-3 h-3 opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                    </a>
                  </li>
                  <li>
                    <a href="#" className="text-slate-600 hover:text-blue-600 transition-colors flex items-center gap-1 group">
                      <span>Terms</span>
                      <ChevronRight className="w-3 h-3 opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          
          {/* Newsletter signup */}
          <div className="col-span-1 md:col-span-3">
            <h3 className="font-semibold text-slate-900 mb-5 text-sm uppercase tracking-wider">Stay Updated</h3>
            <p className="text-slate-600 text-sm mb-5">
              Get the latest storage tips and exclusive offers delivered to your inbox.
            </p>
            <div className="flex mb-5">
              <input 
                type="email" 
                placeholder="Your email" 
                className="text-sm flex-grow px-4 py-3 rounded-l-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-r-lg transition-colors relative group overflow-hidden">
                <div className="absolute inset-0 w-0 bg-white opacity-20 transition-all duration-300 group-hover:w-full"></div>
                <Send size={18} />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              By subscribing, you agree to our Privacy Policy and consent to receive updates from our company.
            </p>
          </div>
        </div>
        
        {/* Contact information */}
        <div className="border-t border-slate-200 py-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="flex items-center gap-8">
              <div className="flex items-center">
                <MapPin size={16} className="mr-2 text-blue-600 flex-shrink-0" />
                <span className="text-sm text-slate-600">123 Neighborhood St, Cape Town, South Africa</span>
              </div>
              <div className="flex items-center">
                <Phone size={16} className="mr-2 text-blue-600 flex-shrink-0" />
                <span className="text-sm text-slate-600">+27 83 123 4567</span>
              </div>
              <div className="flex items-center">
                <Mail size={16} className="mr-2 text-blue-600 flex-shrink-0" />
                <span className="text-sm text-slate-600">contact@stornxtdoor.com</span>
              </div>
            </div>
            <div>
              <a href="#" className="inline-flex items-center gap-1 text-blue-600 text-sm hover:underline">
                <span>View locations</span>
                <ArrowRight size={14} />
              </a>
            </div>
          </div>
        </div>
        
        {/* Bottom bar with copyright */}
        <div className="border-t border-slate-200 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-sm text-slate-500 mb-4 md:mb-0">
            © {currentYear} StorNxtDoor. All rights reserved.
          </p>
          <div className="flex flex-wrap justify-center space-x-6">
            <a href="#" className="text-sm text-slate-500 hover:text-blue-600 transition-colors mb-2 md:mb-0">Privacy Policy</a>
            <a href="#" className="text-sm text-slate-500 hover:text-blue-600 transition-colors mb-2 md:mb-0">Terms of Service</a>
            <a href="#" className="text-sm text-slate-500 hover:text-blue-600 transition-colors mb-2 md:mb-0">Cookies</a>
            <a href="#" className="text-sm text-slate-500 hover:text-blue-600 transition-colors mb-2 md:mb-0">Accessibility</a>
          </div>
        </div>
      </div>
    </footer>
  );
}