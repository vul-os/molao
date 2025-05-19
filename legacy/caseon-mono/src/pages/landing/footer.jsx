import React from 'react';
import { ArrowRight } from 'lucide-react';

const Footer = () => {
  return (
    <footer className="py-12 px-4 md:px-8 bg-white border-t border-slate-100 text-slate-600">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between gap-8">
          <div className="max-w-xs">
            <div className="flex items-center gap-2 text-slate-900 mb-4">
              <img src="/icon.svg" alt="CaseOn Logo" className="h-8 w-8" />
              <div className="flex flex-col">
                <span className="text-lg font-serif font-bold tracking-tight">CaseOn</span>
                <span className="text-[10px] font-medium tracking-wider text-slate-500 uppercase">Legal Intelligence</span>
              </div>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              Transforming legal research with cutting-edge technology and comprehensive case databases.
            </p>
            <div className="flex space-x-3 mt-6">
              <a href="#" aria-label="Twitter" className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84"></path></svg>
              </a>
              <a href="#" aria-label="LinkedIn" className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"></path></svg>
              </a>
            </div>
          </div>
          
          <div className="mt-8 md:mt-0">
            <div>
              <h3 className="text-slate-900 font-medium mb-4">Account</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="#" className="flex items-center group hover:text-indigo-600 transition-colors">
                    Sign In
                    <ArrowRight className="ml-1 h-3 w-3 opacity-0 group-hover:opacity-100 transform group-hover:translate-x-1 transition-all" />
                  </a>
                </li>
                <li>
                  <a href="#" className="flex items-center group hover:text-indigo-600 transition-colors">
                    Sign Up
                    <ArrowRight className="ml-1 h-3 w-3 opacity-0 group-hover:opacity-100 transform group-hover:translate-x-1 transition-all" />
                  </a>
                </li>
                <li><a href="#" className="hover:text-indigo-600 transition-colors">Documentation</a></li>
              </ul>
            </div>
          </div>
        </div>
        
        <div className="mt-12 pt-8 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-slate-500">© {new Date().getFullYear()} CaseOn. All rights reserved.</p>
          <div className="flex items-center flex-wrap justify-center gap-6">
            <a href="#" className="text-xs hover:text-indigo-600 transition-colors">Terms of Service</a>
            <a href="#" className="text-xs hover:text-indigo-600 transition-colors">Privacy Policy</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer; 