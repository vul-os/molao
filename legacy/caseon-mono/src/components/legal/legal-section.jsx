import React from 'react';
import { motion } from 'framer-motion';

const LegalSection = ({ id, number, title, icon, children }) => {
  return (
    <motion.div 
      id={id || `section-${number}`} 
      className="legal-section"
      variants={{
        hidden: { y: 20, opacity: 0 },
        visible: { 
          y: 0, 
          opacity: 1,
          transition: { duration: 0.5 }
        }
      }}
    >
      <div className="flex items-start sm:items-center mb-3 sm:mb-4">
        <span className="mt-0.5 sm:mt-0 shrink-0">
          {icon}
        </span>
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 ml-2.5 sm:ml-3">
          {number && `${number}. `}{title}
        </h2>
      </div>
      
      <div className="pl-6 sm:pl-9 space-y-3 sm:space-y-4 text-slate-700">
        {children}
      </div>

      <style jsx="true">{`
        .legal-section {
          position: relative;
          margin-bottom: 2.5rem;
        }
        
        .legal-section::before {
          content: "";
          position: absolute;
          left: 0.75rem;
          top: 2.25rem;
          bottom: 0;
          width: 1px;
          background: linear-gradient(to bottom, rgba(99, 102, 241, 0.5), rgba(99, 102, 241, 0.1));
          z-index: 0;
        }
        
        @media (min-width: 640px) {
          .legal-section::before {
            left: 0.875rem;
          }
        }
      `}</style>
    </motion.div>
  );
};

export default LegalSection; 