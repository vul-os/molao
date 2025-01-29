import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { FileText, Loader2, Download, Copy, Check } from 'lucide-react';

const Message = ({ role, content, files = [], isLoading, timestamp, maxWidth = "max-w-4xl", padding = "px-6" }) => {
  const isAssistant = role === 'assistant';
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!isAssistant || !content) return;
    
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const getUserInitial = () => {
    return 'J'; // This should be dynamic based on user name
  };
  
  return (
    <div className={`py-4 ${padding} ${isAssistant ? 'bg-gray-50/50' : 'bg-white'} transition-colors duration-200`}>
      <div className={`${maxWidth} mx-auto`}>
        <div className={`flex gap-6 ${!isAssistant && 'justify-end'}`}>
          {isAssistant ? (
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-blue-600 text-white shadow-sm">
              ⚖️
            </div>
          ) : null}
          <div className="flex-1 max-w-2xl space-y-3">
            <div className={`flex items-start gap-4 ${!isAssistant && 'flex-row-reverse'}`}>
              {!isAssistant && (
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-gray-100 text-gray-600 font-medium shadow-sm">
                  {getUserInitial()}
                </div>
              )}
              <div className="flex-1 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-900">
                    {isAssistant ? 'Legal Assistant' : 'You'}
                  </p>
                  {timestamp && (
                    <span className="text-xs text-gray-500 font-medium">
                      {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                
                {isLoading ? (
                  <div className="flex items-center gap-3 text-gray-500 bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm font-medium">Analyzing request...</span>
                  </div>
                ) : (
                  <>
                    <div 
                      onClick={handleCopy}
                      className={`relative group prose prose-gray max-w-none prose-p:leading-relaxed prose-p:text-gray-600
                        p-4 rounded-2xl border border-gray-200 bg-white shadow-sm
                        ${isAssistant && 'hover:border-blue-200 hover:bg-blue-50/20 cursor-pointer'}`}
                    >
                      <div className="text-left">
                        {content}
                      </div>
                      {isAssistant && (
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          {copied ? (
                            <div className="flex items-center gap-1 text-green-600 bg-white px-2 py-1 rounded-md text-xs font-medium border border-green-100">
                              <Check className="h-3 w-3" />
                              Copied!
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-gray-500 bg-white px-2 py-1 rounded-md text-xs font-medium border border-gray-100">
                              <Copy className="h-3 w-3" />
                              Copy
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {files?.length > 0 && (
                      <div className="mt-4 space-y-2">
                        {files.map((file, index) => (
                          <div key={index} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-200 shadow-sm hover:border-gray-300 transition-colors duration-200">
                            <FileText className="h-4 w-4 text-blue-600" />
                            <span className="text-sm text-gray-700 font-medium flex-1">{file.name}</span>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 w-8 p-0 hover:bg-gray-100"
                            >
                              <Download className="h-4 w-4 text-gray-600" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Message;