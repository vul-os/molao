import React from 'react';
import { motion } from 'framer-motion';

const LegalHeader = ({ title, lastUpdated }) => {
  return (
    <div className="text-center mb-8 md:mb-10">
      <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 relative inline-block">
        {title}
        <motion.div 
          className="absolute -bottom-1 left-0 h-1.5 md:h-2 bg-amber-200 rounded-full z-[-1] w-full"
          initial={{ width: 0 }}
          animate={{ width: '100%' }}
          transition={{ duration: 1.2, delay: 0.5 }}
        />
      </h1>
      
      <div className="mt-4">
        <span className="text-xs md:text-sm uppercase tracking-wider text-slate-600 font-sans font-medium px-3 py-1 bg-slate-50 rounded-md border border-slate-100">
          Legal Document
        </span>
      </div>
      
      {lastUpdated && (
        <p className="text-sm md:text-base text-slate-600 mt-4 max-w-2xl mx-auto">
          Last Updated: {lastUpdated}
        </p>
      )}
    </div>
  );
};

export default LegalHeader; 