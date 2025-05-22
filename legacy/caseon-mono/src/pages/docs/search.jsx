import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Search as SearchIcon, FileText, RotateCcw, Download } from 'lucide-react';

const Search = () => {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-serif font-bold text-slate-900 mb-4">Search Guide</h1>
      <p className="text-lg text-slate-600 mb-8">
        Learn how to use CaseOn's simple search interface to quickly find relevant South African legal precedents.
      </p>
      
      <div className="mb-10">
        <h2 className="text-2xl font-serif font-bold text-slate-800 mb-4">Simple 3-Step Search Process</h2>
        <p className="text-slate-600 mb-6">
          CaseOn features a streamlined search process designed to get you to the information you need with minimal friction.
        </p>
        
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="text-xl font-medium text-slate-800 mb-3 flex items-center">
              <SearchIcon className="h-5 w-5 text-indigo-600 mr-2" />
              Step 1: Enter Your Search Prompt
            </h3>
            <p className="text-slate-600 mb-3">
              Simply type your legal research question in plain language into the search bar.
            </p>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-sm text-slate-700 font-medium">Example prompts:</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                <li>"What is the current position on vicarious liability in South Africa?"</li>
                <li>"Recent judgments on environmental impact assessments under NEMA"</li>
                <li>"Constitutional Court approach to dignity in equality cases"</li>
              </ul>
            </div>
          </div>
          
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="text-xl font-medium text-slate-800 mb-3 flex items-center">
              <FileText className="h-5 w-5 text-indigo-600 mr-2" />
              Step 2: View Your Results
            </h3>
            <p className="text-slate-600 mb-3">
              Results appear instantly as a list of relevant files. Each result shows basic information about the document.
            </p>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-sm text-slate-700 font-medium">What you'll see:</p>
              <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
                <li><strong>File Name:</strong> Document title with case citation</li>
                <li><strong>Brief Preview:</strong> Snippet of the most relevant content</li>
                <li><strong>Date:</strong> When the document was published</li>
              </ul>
            </div>
          </div>
          
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="text-xl font-medium text-slate-800 mb-3 flex items-center">
              <RotateCcw className="h-5 w-5 text-indigo-600 mr-2" />
              Step 3: View Document & Return
            </h3>
            <p className="text-slate-600 mb-3">
              Click any file to view the full document. When finished, easily return to your search results.
            </p>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-sm text-slate-700 font-medium">Document actions:</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                <li><strong>View:</strong> Read the full document text</li>
                <li><strong>Download:</strong> Save the document for reference</li>
                <li><strong>Return:</strong> Go back to your search results</li>
                <li><strong>Reference:</strong> Copy citation for legal documentation</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      
      <div className="mb-10">
        <h2 className="text-2xl font-serif font-bold text-slate-800 mb-4">PDF Export</h2>
        <p className="text-slate-600 mb-4">
          Download any document as a professionally formatted PDF for your records or submissions.
        </p>
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h3 className="text-xl font-medium text-slate-800 mb-3 flex items-center">
            <Download className="h-5 w-5 text-indigo-600 mr-2" />
            Export Options
          </h3>
          <p className="text-slate-600 mb-3">
            Generate professional legal documentation from any search result.
          </p>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-sm text-slate-700 mb-2">PDF features:</p>
            <ul className="space-y-1.5 text-sm text-slate-600">
              <li>Proper legal citations and formatting</li>
              <li>Full document text with key passages highlighted</li>
              <li>Partner plan includes advanced formatting options</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-100 rounded-lg p-5 mb-10">
        <h3 className="text-lg font-medium text-amber-800 mb-2">Search Tips</h3>
        <ul className="space-y-2 text-amber-700">
          <li className="flex items-start">
            <span className="font-bold mr-2">•</span>
            <span>Be specific about legal issues in your prompt</span>
          </li>
          <li className="flex items-start">
            <span className="font-bold mr-2">•</span>
            <span>Include relevant legislation when appropriate</span>
          </li>
          <li className="flex items-start">
            <span className="font-bold mr-2">•</span>
            <span>Use natural language questions for best results</span>
          </li>
        </ul>
      </div>
      
      <div className="border-t border-slate-200 pt-6 mt-8">
        <div className="flex justify-between items-center">
          <Link 
            to="/docs/getting-started" 
            className="flex items-center text-indigo-600 hover:text-indigo-700 font-medium"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Previous: Getting Started
          </Link>
          <Link 
            to="/docs/members" 
            className="flex items-center text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Next: Team Management
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Search; 