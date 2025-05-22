import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Search as SearchIcon, Filter, BookOpen, Tag, Save } from 'lucide-react';

const Search = () => {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-serif font-bold text-slate-900 mb-4">Search Guide</h1>
      <p className="text-lg text-slate-600 mb-8">
        Learn how to make the most of CaseOn's powerful AI-driven search capabilities to find relevant South African legal precedents quickly and accurately.
      </p>
      
      <div className="mb-10">
        <h2 className="text-2xl font-serif font-bold text-slate-800 mb-4">Understanding AI-Powered Search</h2>
        <p className="text-slate-600 mb-4">
          Our search engine uses advanced natural language processing and machine learning algorithms specifically trained on South African legal documents. This allows the system to understand the semantic meaning of your query rather than just matching keywords.
        </p>
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 mb-6">
          <div className="flex items-start">
            <SearchIcon className="h-5 w-5 text-indigo-600 mr-2 mt-0.5 flex-shrink-0" />
            <p className="text-indigo-700">
              <strong>Key Advantage:</strong> CaseOn can find relevant cases even when they don't contain the exact terms you searched for, by understanding the legal concepts and principles you're looking for.
            </p>
          </div>
        </div>
      </div>
      
      <div className="mb-10">
        <h2 className="text-2xl font-serif font-bold text-slate-800 mb-4">Basic Search Techniques</h2>
        
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="text-xl font-medium text-slate-800 mb-3 flex items-center">
              <SearchIcon className="h-5 w-5 text-indigo-600 mr-2" />
              Natural Language Queries
            </h3>
            <p className="text-slate-600 mb-3">
              Enter your legal research question in plain language, just as you would ask a colleague.
            </p>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-sm text-slate-700 font-medium">Examples:</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                <li>"What is the current position on vicarious liability in South Africa?"</li>
                <li>"Recent judgments on environmental impact assessments under NEMA"</li>
                <li>"Constitutional Court approach to dignity in equality cases"</li>
              </ul>
            </div>
          </div>
          
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="text-xl font-medium text-slate-800 mb-3 flex items-center">
              <Filter className="h-5 w-5 text-indigo-600 mr-2" />
              Using Filters
            </h3>
            <p className="text-slate-600 mb-3">
              Narrow your search results using our comprehensive filtering options.
            </p>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-sm text-slate-700 font-medium">Available filters:</p>
              <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
                <li><strong>Date Range:</strong> Limit results to specific time periods</li>
                <li><strong>Court:</strong> Filter by specific courts (Constitutional Court, SCA, High Courts, etc.)</li>
                <li><strong>Judge:</strong> Find judgments by specific judges</li>
                <li><strong>Topic:</strong> Filter by legal topic categories</li>
                <li><strong>Citation:</strong> Search by formal citation</li>
              </ul>
            </div>
          </div>
          
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="text-xl font-medium text-slate-800 mb-3 flex items-center">
              <BookOpen className="h-5 w-5 text-indigo-600 mr-2" />
              Citation Search
            </h3>
            <p className="text-slate-600 mb-3">
              Find specific cases using standard citation formats recognized in South African legal practice.
            </p>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-sm text-slate-700 font-medium">Supported citation formats:</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                <li><strong>SALR:</strong> 2021 (4) SA 234 (CC)</li>
                <li><strong>BCLR:</strong> 2020 (2) BCLR 123 (SCA)</li>
                <li><strong>Case Numbers:</strong> CCT 23/19</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      
      <div className="mb-10">
        <h2 className="text-2xl font-serif font-bold text-slate-800 mb-4">Advanced Search Features</h2>
        
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="text-xl font-medium text-slate-800 mb-3 flex items-center">
              <Tag className="h-5 w-5 text-indigo-600 mr-2" />
              Boolean Operators
            </h3>
            <p className="text-slate-600 mb-3">
              Refine your search with precise boolean logic for more targeted results.
            </p>
            <div className="bg-slate-50 rounded-lg p-3">
              <ul className="space-y-2 text-sm text-slate-600">
                <li><strong>AND:</strong> Find cases containing all specified terms (e.g., "negligence AND medical")</li>
                <li><strong>OR:</strong> Find cases containing any of the specified terms (e.g., "contract OR agreement")</li>
                <li><strong>NOT:</strong> Exclude specific terms (e.g., "privacy NOT digital")</li>
                <li><strong>Quotes:</strong> Search for exact phrases (e.g., "beyond reasonable doubt")</li>
              </ul>
            </div>
          </div>
          
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="text-xl font-medium text-slate-800 mb-3 flex items-center">
              <Save className="h-5 w-5 text-indigo-600 mr-2" />
              Saving and Organizing Results
            </h3>
            <p className="text-slate-600 mb-3">
              Create collections to organize and save your research findings for easy reference.
            </p>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-sm text-slate-700 mb-2">With CaseOn, you can:</p>
              <ul className="space-y-1.5 text-sm text-slate-600">
                <li>Save individual cases to named collections</li>
                <li>Add custom notes and annotations to cases</li>
                <li>Tag cases with custom labels for categorization</li>
                <li>Share collections with team members (on Associate and Partner plans)</li>
                <li>Export collections as formatted PDF reports</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-100 rounded-lg p-5 mb-10">
        <h3 className="text-lg font-medium text-amber-800 mb-2">Search Tips for Better Results</h3>
        <ul className="space-y-2 text-amber-700">
          <li className="flex items-start">
            <span className="font-bold mr-2">•</span>
            <span>Be specific about legal issues rather than general topics</span>
          </li>
          <li className="flex items-start">
            <span className="font-bold mr-2">•</span>
            <span>Include relevant legislation (e.g., "Section 14 of POPI Act")</span>
          </li>
          <li className="flex items-start">
            <span className="font-bold mr-2">•</span>
            <span>Use legal terminology when appropriate for more precise results</span>
          </li>
          <li className="flex items-start">
            <span className="font-bold mr-2">•</span>
            <span>Start broad, then refine with filters rather than overly specific initial queries</span>
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
            to="/docs/contact" 
            className="flex items-center text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Next: Contact Us
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Search; 