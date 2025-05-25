import React from 'react';
import { ChevronRight, FileText } from 'lucide-react';

const TableOfContents = ({ sections }) => {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 sm:p-5 mb-8 sm:mb-10">
      <h2 className="text-base sm:text-lg font-medium text-slate-900 mb-3 sm:mb-4 flex items-center">
        <FileText className="h-4 w-4 sm:h-5 sm:w-5 mr-2 text-indigo-600" />
        Table of Contents
      </h2>
      
      <ul className="space-y-1.5 sm:space-y-2 text-sm">
        {sections.map((item, index) => (
          <li key={index}>
            <a 
              href={`#section-${index + 1}`} 
              className="flex items-center text-slate-700 hover:text-indigo-700 transition-colors group"
            >
              <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2 text-slate-400 group-hover:text-indigo-500" />
              <span>{item}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default TableOfContents; 