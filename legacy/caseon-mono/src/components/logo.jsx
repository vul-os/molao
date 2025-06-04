import React from 'react';

const Logo = ({ className = "" }) => {
  return (
    <div className={`text-center ${className}`}>
      <div className="flex justify-center items-center mb-3">
        <div className="flex items-center -space-x-2">
          <span className="text-4xl font-serif font-bold tracking-tight text-gray-900">
            Case
          </span>
          <img 
            src="/icon.svg" 
            alt="CaseOn Logo" 
            className="h-14 w-14 mt-3" 
          />
        </div>
      </div>
      <p className="text-base text-gray-600 font-medium tracking-wide uppercase">
        LEGAL INTELLIGENCE
      </p>
    </div>
  );
};

export default Logo; 