import React, { useState, useEffect, useRef } from 'react';
import { Search, ArrowRight, Book, Scale, Bookmark, Gavel, FileText, Sparkles, Zap, BarChart, Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';

const Hero = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [activeHighlight, setActiveHighlight] = useState(0);
  const deviceRef = useRef(null);
  
  const searchSuggestions = [
    'POPI Act compliance insights',
    'Latest on Consumer Protection Act',
    'Analysis of Labour Relations Amendments',
    'Prescription Act judgments 2023'
  ];
  
  // Cycle through highlight animations
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveHighlight((prev) => (prev + 1) % 3);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative flex flex-col justify-center items-center py-8 md:py-12 px-4 md:px-8 overflow-hidden bg-white">
      {/* Abstract legal-themed patterns */}
      <div className="absolute inset-0 z-0 overflow-hidden opacity-5">
        {/* Law-inspired patterns */}
        <div className="absolute w-full h-full">
          <svg className="absolute top-0 left-0 w-full h-full" viewBox="0 0 1000 1000" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
            {/* Subtle horizontal lines like legal documents */}
            {[...Array(40)].map((_, i) => (
              <line 
                key={i} 
                x1="0" 
                y1={25 * i} 
                x2="1000" 
                y2={25 * i} 
                stroke="#1e293b" 
                strokeWidth="0.5" 
                strokeDasharray={i % 10 === 0 ? "none" : "1,3"}
              />
            ))}
            
            <g transform="translate(700, 700) scale(0.15)">
              <path d="M250,100 L750,100 M500,100 V500" stroke="#1e293b" strokeWidth="20" />
              <circle cx="250" cy="200" r="100" fill="none" stroke="#1e293b" strokeWidth="10" />
              <circle cx="750" cy="200" r="100" fill="none" stroke="#1e293b" strokeWidth="10" />
              <rect x="400" y="500" width="200" height="100" fill="none" stroke="#1e293b" strokeWidth="10" />
            </g>
        </svg>
        </div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        
        {/* Left Column: Text Content */}
        <motion.div 
          className="lg:col-span-6 space-y-6 md:space-y-8 text-center lg:text-left"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
        >
          <div className="flex items-center justify-center lg:justify-start gap-2">
            <motion.div
              className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-full bg-indigo-50"
              animate={{ 
                scale: activeHighlight === 0 ? [1, 1.1, 1] : 1,
                backgroundColor: activeHighlight === 0 ? ["#eef2ff", "#e0e7ff", "#eef2ff"] : "#eef2ff"
              }}
              transition={{ duration: 1.5, ease: "easeInOut" }}
            >
              <Scale className="h-5 w-5 md:h-6 md:w-6 text-indigo-700" />
            </motion.div>
            <Badge 
              variant="outline" 
              className="border-indigo-200 text-indigo-700 bg-indigo-50 px-3 py-1 text-sm font-medium"
            >
              AI-Powered Legal Research
            </Badge>
          </div>
          
          <div>
            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-tight text-slate-900">
              <span className="relative inline-block">
                Search
              </span>{" "}
              South African Cases 
              <span className="block text-indigo-700 mt-1 md:mt-2 relative">
                With AI Precision
                <motion.div 
                  className="absolute -bottom-1 left-0 h-2 bg-amber-200 rounded-full z-[-1]"
                  initial={{ width: 0 }}
                  animate={{ width: activeHighlight === 1 ? "100%" : "100%" }}
                  transition={{ duration: 1.5, delay: 0.3 }}
                />
              </span>
            </h1>
            <motion.div 
              className="h-[3px] w-24 bg-amber-400 rounded-full mx-auto lg:mx-0 mt-6"
              initial={{ width: 0 }}
              animate={{ width: 96 }}
              transition={{ duration: 1, delay: 0.8 }}
            />
          </div>
          
          <div className="text-base md:text-lg text-slate-600 max-w-xl mx-auto lg:mx-0 leading-relaxed font-serif">
            CaseOn's AI searches through thousands of South African legal judgments to find the exact precedents you need, understanding context and nuance beyond simple keyword matching to deliver
            <span className="relative text-indigo-700 font-medium">
              {' '}truly relevant results
              <motion.div 
                className="absolute bottom-0 left-0 h-[5px] w-full bg-amber-100"
                initial={{ width: 0 }}
                animate={{ width: activeHighlight === 2 ? "100%" : "100%" }}
                style={{ zIndex: -1 }}
              />
            </span>.
          </div>

          <div 
            className={`relative w-full max-w-md mx-auto lg:mx-0 transition-all duration-300 mt-8 ${isSearchFocused ? 'scale-105' : ''}`}
          >
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-100 to-indigo-50 rounded-xl blur-sm"></div>
            
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-indigo-400 pointer-events-none" />
                <Input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setIsSearchFocused(false)}
                placeholder="Search case law, acts or legal concepts..." 
                className="pl-12 pr-12 py-4 w-full border border-indigo-100 bg-white rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 text-slate-800 placeholder-slate-400 text-base shadow"
                />
                <Button 
                  size="sm" 
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg py-1 px-3 transition-all duration-200"
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
            </div>
              </div>
              
          {isSearchFocused && searchQuery.length === 0 && (
                <motion.div 
              initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="w-full max-w-md mx-auto lg:mx-0 mt-3 p-4 bg-white rounded-xl shadow-lg border border-indigo-50"
                >
              <p className="text-xs uppercase text-indigo-500 font-semibold mb-2">Popular searches:</p>
              <ul className="space-y-1.5">
                    {searchSuggestions.map((suggestion, idx) => (
                      <li key={idx}>
                    <motion.button 
                      className="w-full text-left px-3 py-2 hover:bg-indigo-50 rounded-lg text-sm text-slate-700 flex items-center transition-colors duration-150"
                      whileHover={{ x: 5 }}
                      onClick={() => {
                        setSearchQuery(suggestion);
                      }}
                    >
                      <Bookmark className="h-4 w-4 mr-2.5 text-indigo-500 flex-shrink-0" />
                          {suggestion}
                    </motion.button>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}

          <div className="flex flex-wrap justify-center lg:justify-start gap-4 md:gap-5 pt-4">
            <motion.div 
              className="flex items-center gap-2 text-sm font-medium text-slate-700 bg-white px-4 py-2.5 rounded-lg border border-slate-200 shadow-sm"
              whileHover={{ y: -2, boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.05)" }}
            >
              <Brain className="h-4 w-4 text-indigo-600" />
              <span>AI Understanding</span>
            </motion.div>
            <motion.div 
              className="flex items-center gap-2 text-sm font-medium text-slate-700 bg-white px-4 py-2.5 rounded-lg border border-slate-200 shadow-sm"
              whileHover={{ y: -2, boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.05)" }}
            >
              <Gavel className="h-4 w-4 text-amber-600" />
              <span>Comprehensive Coverage</span>
            </motion.div>
          </div>
        </motion.div>

        {/* Right Column: Legal Document Interface */}
        <motion.div
          className="lg:col-span-6 relative flex justify-center items-center lg:mt-0 mt-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          {/* Document-styled frame */}
          <div className="absolute w-[90%] h-[95%] bg-slate-50 rounded-xl shadow-lg transform rotate-6 z-0"></div>
          <div className="absolute w-[90%] h-[95%] bg-slate-100 rounded-xl shadow-lg transform -rotate-3 z-10"></div>
          
          {/* Device container styled like a legal document or law book */}
          <motion.div 
            ref={deviceRef}
            className="relative z-20 bg-white w-[300px] h-[600px] sm:w-[320px] sm:h-[640px] rounded-xl shadow-2xl overflow-hidden border border-slate-200"
            whileHover={{ y: -5 }}
            transition={{ duration: 0.3 }}
          >
            {/* Document header styling */}
            <div className="absolute top-0 left-0 right-0 h-7 bg-indigo-700 flex items-center justify-center">
              <div className="w-16 h-1 bg-white rounded-full opacity-50"></div>
            </div>
            
            {/* Page styling */}
            <div className="pt-7 px-0 h-full flex flex-col">
              {/* Create a container with proper aspect ratio for the 373×664 image */}
              <div className="relative w-full h-full" style={{ aspectRatio: '373/664' }}>
                <img 
                  src="/portal.png" 
                  alt="CaseOn Legal Research Interface" 
                  className="w-full h-full object-contain" 
                />
                
                {/* Legal document overlay effects */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-b from-white to-transparent"></div>
                  <div className="absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-t from-white to-transparent"></div>
                  <div className="absolute top-0 bottom-0 left-0 w-2 bg-gradient-to-r from-white to-transparent"></div>
                  <div className="absolute top-0 bottom-0 right-0 w-2 bg-gradient-to-l from-white to-transparent"></div>
                  </div>
              </div>
            </div>
            
            {/* Document binding/edge styling */}
            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-amber-500"></div>
            
            {/* Page number styling */}
            <div className="absolute bottom-2 right-2 text-xs text-slate-400 font-serif">§ 1</div>
          </motion.div>
          
          {/* Decorative legal elements */}
          <motion.div
            className="absolute top-[5%] -right-4 flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg shadow-md border border-slate-100 z-30"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6, duration: 0.5 }}
          >
            <Zap className="h-4 w-4 text-indigo-600" />
            <span className="text-xs font-medium text-slate-700">AI Search</span>
          </motion.div>
          
          <motion.div
            className="absolute -bottom-1 -left-4 bg-white px-3 py-1.5 rounded-lg shadow-md border border-slate-100 z-30"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.7, duration: 0.5 }}
          >
            <div className="flex items-center gap-2">
              <Book className="h-4 w-4 text-amber-600" />
              <span className="text-xs font-medium text-slate-700">Legal Citations</span>
            </div>
          </motion.div>
          
          {/* Subtle animated paragraph lines (like legal text) */}
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute rounded-md bg-slate-200 h-1.5"
              style={{
                width: 60 + Math.random() * 80,
                top: `${60 + i * 8}%`,
                right: `-${30 + Math.random() * 40}px`
              }}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 0.6, x: 0 }}
              transition={{ delay: 0.8 + i * 0.1, duration: 0.5 }}
            />
          ))}
        </motion.div>
      </div>

      <style>{`
        /* Legal document inspired fonts */
        .font-serif {
          font-family: 'Libre Baskerville', 'Georgia', 'Times New Roman', serif;
        }
        
        @media (max-width: 640px) {
          .font-serif {
            font-weight: 600; /* Slightly bolder on mobile for legibility */
          }
        }
      `}</style>
    </section>
  );
};

export default Hero; 