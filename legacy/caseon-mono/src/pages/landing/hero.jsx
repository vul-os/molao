import React, { useState, useEffect } from 'react';
import { Search, ArrowRight, Book, Clock, Sparkles, Send, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';

const Hero = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const [loadingResults, setLoadingResults] = useState(false);
  const [resultsVisible, setResultsVisible] = useState(false);
  
  const searchSuggestions = [
    'POPI Act compliance',
    'Consumer Protection Act',
    'Labour Relations Amendment',
    'Prescription Act judgments'
  ];

  const mockResults = [
    { id: 1, name: 'Information Regulator v Standard Bank', year: '2021', court: 'High Court', relevance: '98%', preview: 'The case establishes guidelines for determining what constitutes "adequate protection of personal information" under Section 19 of POPI...' },
    { id: 2, name: 'Harms v Discovery Health', year: '2022', court: 'SCA', relevance: '91%', preview: 'The court held that consent under POPI must be specific, informed and unambiguous...' },
    { id: 3, name: 'Vodacom v Information Regulator', year: '2020', court: 'Constitutional Court', relevance: '87%', preview: 'The court\'s interpretation of "personal information" extends to device identifiers and location data...' }
  ];

  useEffect(() => {
    if (searchActive) {
      setLoadingResults(true);
      
      const resultsTimer = setTimeout(() => {
        setLoadingResults(false);
        setResultsVisible(true);
      }, 2000);
      
      return () => clearTimeout(resultsTimer);
    }
  }, [searchActive]);

  const startDemoSearch = () => {
    setSearchActive(true);
  };

  return (
    <section className="pt-16 md:pt-24 pb-16 md:pb-20 px-4 md:px-8 bg-gradient-to-br from-indigo-50 via-white to-slate-50 relative overflow-hidden min-h-screen">
      {/* Background elements - optimized for mobile */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[20%] -left-[10%] w-[90%] md:w-[70%] h-[50%] md:h-[70%] rounded-full bg-gradient-to-br from-indigo-200/30 to-violet-100/20 blur-3xl"></div>
        <div className="absolute -bottom-[20%] -right-[10%] w-[90%] md:w-[70%] h-[50%] md:h-[70%] rounded-full bg-gradient-to-tl from-indigo-100/30 to-cyan-100/20 blur-3xl"></div>
        <svg className="absolute right-0 top-0 text-indigo-50 w-24 h-24 md:w-64 md:h-64 opacity-50" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <path fill="currentColor" d="M42.8,-60.2C54.9,-54.3,63.7,-41.4,69.8,-27.3C76,-13.1,79.5,2.3,74.5,14.8C69.5,27.4,56,37.1,42.4,44.9C28.8,52.6,14.4,58.5,0.2,58.3C-14.1,58,-28.1,51.5,-40.9,42.4C-53.7,33.2,-65.2,21.3,-68.8,7.3C-72.4,-6.7,-68.1,-22.9,-58.7,-34.4C-49.3,-45.9,-34.8,-52.8,-21.4,-58.1C-8,-63.4,4.2,-67.1,17.3,-67.1C30.4,-67.2,44.3,-63.4,55.4,-55.4L42.8,-60.2Z" transform="translate(100 100)" />
        </svg>
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-12 items-start">
          {/* Left column - Main content - mobile optimized */}
          <div className="lg:col-span-5 space-y-4 md:space-y-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <Badge variant="outline" className="text-indigo-700 border-indigo-200 bg-indigo-50/80 backdrop-blur-sm mb-3 md:mb-4 px-2.5 md:px-3 py-1 md:py-1.5 text-xs md:text-sm font-medium">
                <Sparkles className="h-3 w-3 md:h-3.5 md:w-3.5 mr-1 md:mr-1.5" />
                SA Legal Research Reimagined
              </Badge>
              <h1 className="text-3xl md:text-5xl lg:text-6xl font-serif font-bold tracking-tight text-slate-900 leading-tight">
                Find South African <span className="text-indigo-700 relative">
                  Case Law
                  <span className="absolute -bottom-1 left-0 w-full h-1.5 md:h-2 bg-indigo-200/50 -z-10 rounded-sm"></span>
                </span> in Seconds
              </h1>
              <p className="mt-4 md:mt-6 text-base md:text-lg text-slate-600 max-w-lg leading-relaxed">
                CaseOn delivers intelligent legal research tools tailored for South African legal professionals to quickly find relevant judgments and precedents.
              </p>
            </motion.div>

            <motion.div 
              className="relative w-full"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <div className={`relative w-full transition-all duration-300 ${isSearchFocused ? 'scale-105' : ''}`}>
                <Search className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 h-4 w-4 md:h-5 md:w-5 text-indigo-400" />
                <Input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setIsSearchFocused(false)}
                  placeholder="Search for cases, acts, or legal concepts..." 
                  className="pl-10 md:pl-12 pr-16 md:pr-20 py-4 md:py-7 w-full border border-slate-200 shadow-lg rounded-xl md:rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white/80 backdrop-blur-sm text-sm md:text-base"
                />
                <Button 
                  size="sm" 
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg md:rounded-xl bg-indigo-700 hover:bg-indigo-800 px-3 md:px-5 py-1.5 md:py-6 transition-all duration-300 hover:shadow-indigo-200 hover:shadow-md"
                >
                  <span className="hidden md:inline mr-2">Search</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
              
              {isSearchFocused && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute w-full mt-2 p-3 bg-white rounded-xl shadow-xl border border-slate-100 z-20"
                >
                  <p className="text-xs uppercase text-slate-500 font-medium mb-2">Popular Searches</p>
                  <ul className="space-y-1">
                    {searchSuggestions.map((suggestion, idx) => (
                      <li key={idx}>
                        <button 
                          className="w-full text-left px-3 py-2 hover:bg-indigo-50 rounded-lg text-sm text-slate-700 flex items-center"
                          onClick={() => setSearchQuery(suggestion)}
                        >
                          <Search className="h-3.5 w-3.5 mr-2 text-slate-400" />
                          {suggestion}
                        </button>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}

              <p className="text-xs md:text-sm text-slate-500 mt-2 ml-2 md:ml-4 flex items-center">
                <Sparkles className="h-3 w-3 md:h-3.5 md:w-3.5 mr-1.5 text-indigo-400" />
                <span className="truncate">Trending: "POPI Act compliance" • "Competition Tribunal rulings"</span>
              </p>
            </motion.div>

            <motion.div 
              className="flex flex-wrap gap-y-2 gap-x-3 md:gap-y-3 md:gap-x-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <div className="flex items-center gap-2 text-xs md:text-sm font-medium text-slate-700 bg-white/60 backdrop-blur-sm px-2.5 md:px-3 py-1.5 md:py-2 rounded-lg shadow-sm border border-slate-100">
                <div className="p-1 md:p-1.5 bg-indigo-50 rounded-full">
                  <Clock className="h-3 w-3 md:h-4 md:w-4 text-indigo-600" />
                </div>
                <span>50% Faster Research</span>
              </div>
              <div className="flex items-center gap-2 text-xs md:text-sm font-medium text-slate-700 bg-white/60 backdrop-blur-sm px-2.5 md:px-3 py-1.5 md:py-2 rounded-lg shadow-sm border border-slate-100">
                <div className="p-1 md:p-1.5 bg-indigo-50 rounded-full">
                  <Book className="h-3 w-3 md:h-4 md:w-4 text-indigo-600" />
                </div>
                <span>Over 100k Cases</span>
              </div>
            </motion.div>
          </div>

          {/* Right column - Search interface demo - mobile optimized */}
          <motion.div 
            className="lg:col-span-7 relative lg:order-last mt-4 lg:mt-0"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-indigo-600 to-violet-500 rounded-xl md:rounded-2xl opacity-10 blur-2xl transform -rotate-6"></div>
            
            <div className="relative bg-white/80 backdrop-blur-md border border-slate-200 rounded-xl md:rounded-2xl shadow-xl overflow-hidden h-[350px] sm:h-[400px] md:h-[500px] lg:h-[600px] flex flex-col">
              {/* Results display area */}
              <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3 md:space-y-4 bg-slate-50">
                {!searchActive && (
                  <div className="h-full flex flex-col items-center justify-center text-center p-4 md:p-8">
                    <div className="w-12 h-12 md:w-16 md:h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-3 md:mb-4">
                      <Search className="h-6 w-6 md:h-8 md:w-8 text-indigo-600" />
                    </div>
                    <h3 className="text-lg md:text-xl font-medium text-slate-900 mb-2">Discover South African Case Law</h3>
                    <p className="text-sm md:text-base text-slate-600 max-w-md mb-4 md:mb-6">
                      Type your legal query below to see relevant cases and judgments from South African courts.
                    </p>
                    <ArrowDown className="h-4 w-4 md:h-5 md:w-5 text-indigo-400 animate-bounce" />
                  </div>
                )}
                
                {loadingResults && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-full flex justify-center items-center"
                  >
                    <div className="flex flex-col items-center">
                      <div className="flex items-center gap-2 mb-3 md:mb-4">
                        <div className="w-2.5 h-2.5 md:w-3 md:h-3 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2.5 h-2.5 md:w-3 md:h-3 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2.5 h-2.5 md:w-3 md:h-3 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                      <p className="text-xs md:text-sm text-slate-600">Searching South African case law...</p>
                    </div>
                  </motion.div>
                )}
                
                {resultsVisible && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-3 pt-2 md:pt-4"
                  >
                    <div className="flex items-center justify-between mb-3 md:mb-4">
                      <h3 className="text-base md:text-lg font-medium text-slate-900">Results for "POPI Act compliance"</h3>
                      <Badge variant="outline" className="text-xs px-1.5 md:px-2 py-0.5 md:py-1">
                        <Clock className="h-2.5 w-2.5 md:h-3 md:w-3 mr-1" /> 0.38s
                      </Badge>
                    </div>
                    
                    {mockResults.map((result, idx) => (
                      <motion.div
                        key={result.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.15 }}
                        className="bg-white rounded-lg border border-slate-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                      >
                        <div className="p-3 md:p-4">
                          <div className="flex flex-wrap md:flex-nowrap md:items-center justify-between gap-y-1 mb-2">
                            <Badge className={`text-xs md:text-sm mb-1 md:mb-0 ${
                              result.court === 'Constitutional Court' 
                                ? 'bg-indigo-600 text-white' 
                                : result.court === 'SCA' 
                                  ? 'bg-violet-600 text-white' 
                                  : 'bg-blue-600 text-white'
                            }`}>
                              {result.court}
                            </Badge>
                            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-100">
                              {result.relevance}
                            </Badge>
                          </div>
                          <div className="text-sm md:text-base font-medium text-slate-900 mb-1">{result.name} ({result.year})</div>
                          <p className="text-xs md:text-sm text-slate-600 line-clamp-2 md:line-clamp-none">{result.preview}</p>
                          <div className="flex justify-end mt-2 md:mt-3">
                            <Button variant="ghost" size="sm" className="text-xs h-6 md:h-7 text-indigo-700 hover:bg-indigo-50">
                              View Full Case
                              <ArrowRight className="ml-1 h-2.5 w-2.5 md:h-3 md:w-3" />
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                    
                    <div className="flex justify-center mt-4 md:mt-6">
                      <Button variant="outline" size="sm" className="text-xs h-8 flex items-center gap-1 text-slate-600">
                        <ArrowDown className="h-2.5 w-2.5 md:h-3 md:w-3" />
                        Load more results
                      </Button>
                    </div>
                  </motion.div>
                )}
              </div>
              
              {/* Search input area - larger touch targets for mobile */}
              <div className="p-2 md:p-3 border-t border-slate-200 bg-white sticky bottom-0">
                {!searchActive ? (
                  <div className="flex items-center gap-2">
                    <Input 
                      type="text" 
                      placeholder="Type your legal question..." 
                      className="flex-1 py-3 md:py-5 pl-3 md:pl-4 pr-8 md:pr-10 bg-slate-50 text-sm"
                      value="I need information on POPI Act compliance for my company"
                    />
                    <Button 
                      className="bg-indigo-600 hover:bg-indigo-700 rounded-full p-2 h-10 w-10 flex-shrink-0"
                      onClick={startDemoSearch}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input 
                      type="text" 
                      placeholder="Try another search..." 
                      className="flex-1 py-3 md:py-5 pl-3 md:pl-4 pr-8 md:pr-10 bg-slate-50 text-sm"
                    />
                    <Button className="bg-indigo-600 hover:bg-indigo-700 rounded-full p-2 h-10 w-10 flex-shrink-0">
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
            
            {/* Floating elements for visual interest - adjusted for mobile */}
            <div className="absolute -top-2 -right-2 md:-top-6 md:-right-6 w-6 h-6 md:w-12 md:h-12 bg-yellow-300/20 rounded-full backdrop-blur-xl"></div>
            <div className="absolute -bottom-2 -left-2 md:-bottom-8 md:-left-8 w-8 h-8 md:w-16 md:h-16 bg-indigo-300/20 rounded-full backdrop-blur-xl"></div>
            
            {/* Disclaimer - adjusted for mobile */}
            <div className="mt-2 md:mt-4 text-center">
              <p className="text-[10px] md:text-xs text-slate-500 px-2">* These are sample results for demonstration purposes. Try the tool for free to see actual South African case law results.</p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Hero; 