import React, { useState } from 'react';
import { FileText, Loader2, Download, Copy, Check, Scale } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const Message = ({
  role,
  content,
  files = [],
  isLoading,
  timestamp,
  maxWidth = "max-w-4xl",
  padding = "px-6"
}) => {
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

  const getUserInitial = () => 'J';

  const parseMarkdownLine = (text) => {
    if (!text) return null;

    // Handle bold text - improved to handle multiple bold sections
    const boldRegex = /\*\*(.*?)\*\*/g;
    let parts = text.split(boldRegex);
    if (parts.length > 1) {
      return (
        <span>
          {parts.map((part, i) => {
            if (i % 2 === 1) {
              return <strong key={i} className="font-semibold">{part}</strong>;
            }
            return <span key={i}>{part}</span>;
          })}
        </span>
      );
    }

    // Handle inline code
    const codeRegex = /`([^`]+)`/g;
    parts = text.split(codeRegex);
    if (parts.length > 1) {
      return (
        <span>
          {parts.map((part, i) => {
            if (i % 2 === 1) {
              return <code key={i} className="bg-gray-100 px-1 rounded text-sm">{part}</code>;
            }
            return <span key={i}>{part}</span>;
          })}
        </span>
      );
    }

    // Handle italics
    const italicRegex = /\*(.*?)\*/g;
    parts = text.split(italicRegex);
    if (parts.length > 1) {
      return (
        <span>
          {parts.map((part, i) => {
            if (i % 2 === 1) {
              return <em key={i}>{part}</em>;
            }
            return <span key={i}>{part}</span>;
          })}
        </span>
      );
    }

    return text;
  };

  const formatContent = (text) => {
    if (!text) return null;
    
    const lines = text.split('\n');
    let inCodeBlock = false;
    let codeBlockContent = [];
    
    return (
      <div className="w-full max-w-2xl space-y-2 text-base">
        {lines.map((line, index) => {
          // Handle code blocks
          if (line.startsWith('```')) {
            if (inCodeBlock) {
              const content = codeBlockContent.join('\n');
              codeBlockContent = [];
              inCodeBlock = false;
              return (
                <pre key={index} className="bg-gray-100 p-3 rounded-lg overflow-x-auto text-sm">
                  <code>{content}</code>
                </pre>
              );
            } else {
              inCodeBlock = true;
              return null;
            }
          }

          if (inCodeBlock) {
            codeBlockContent.push(line);
            return null;
          }

          // Handle headers
          if (line.startsWith('#')) {
            const level = line.match(/^#+/)[0].length;
            const text = line.replace(/^#+\s/, '');
            const sizes = {
              1: 'text-2xl',
              2: 'text-xl',
              3: 'text-lg',
              4: 'text-base',
              5: 'text-sm',
              6: 'text-xs'
            };
            return (
              <div key={index} className={`${sizes[level]} font-bold mb-2`}>
                {parseMarkdownLine(text)}
              </div>
            );
          }

          // Handle bullet points
          if (line.trim().startsWith('- ')) {
            return (
              <div key={index} className="flex pl-4">
                <span className="mr-2">•</span>
                <span>{parseMarkdownLine(line.trim().substring(2))}</span>
              </div>
            );
          }

          // Handle numbered lists
          if (line.match(/^\d+\./)) {
            return (
              <div key={index} className="flex pl-4">
                <span className="mr-2">{line.match(/^\d+/)[0]}.</span>
                <span>{parseMarkdownLine(line.replace(/^\d+\.\s/, ''))}</span>
              </div>
            );
          }

          // Regular paragraph
          return line.trim() ? (
            <p key={index} className="text-gray-700">
              {parseMarkdownLine(line)}
            </p>
          ) : (
            <div key={index} className="h-4" />
          );
        })}
      </div>
    );
  };

  return (
    <div className={`py-4 ${padding} ${isAssistant ? 'bg-gray-50/50' : 'bg-white'}`}>
      <div className={`${maxWidth} mx-auto`}>
        <div className={`flex gap-6 ${!isAssistant && 'justify-end'}`}>
          {isAssistant ? (
            <div className="w-10 h-10 bg-blue-600 rounded-full flex-shrink-0 flex items-center justify-center">
              <Scale className="h-5 w-5 text-white" />
            </div>
          ) : null}

          <div className="flex-1 max-w-2xl space-y-3">
            <div className={`flex items-start gap-4 ${!isAssistant && 'flex-row-reverse'}`}>
              {!isAssistant && (
                <div className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center bg-gray-100 text-gray-600 font-medium">
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
                      {new Date(timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  )}
                </div>

                {isLoading ? (
                  <div className="flex items-center gap-3 text-gray-500 bg-white p-4 rounded-2xl border border-gray-200">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm font-medium">
                      Analyzing request...
                    </span>
                  </div>
                ) : (
                  <>
                    <div
                      onClick={handleCopy}
                      className={`relative group p-4 rounded-2xl border border-gray-200 bg-white ${
                        isAssistant ? 'hover:border-blue-200 hover:bg-blue-50/20 cursor-pointer' : ''
                      }`}
                    >
                      <div className="text-left">
                        {formatContent(content)}
                      </div>

                      {isAssistant && (
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
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
                          <div
                            key={index}
                            className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-200 hover:border-gray-300"
                          >
                            <FileText className="h-4 w-4 text-blue-600" />
                            <span className="text-sm text-gray-700 font-medium flex-1">
                              {file.name}
                            </span>
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