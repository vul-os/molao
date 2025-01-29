import React, { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Send, 
  FileText,
  Loader2,
  Upload,
  Download,
  Scale,
  X,
} from 'lucide-react';

const Message = ({ role, content, files = [], isLoading, timestamp }) => {
  const isAssistant = role === 'assistant';
  
  return (
    <div className={`py-6 ${isAssistant ? 'bg-gray-50/50' : 'bg-white'} transition-colors duration-200`}>
      <div className="max-w-4xl mx-auto px-6">
        <div className="flex gap-6">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 
            ${isAssistant ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 shadow-sm'}`}>
            {isAssistant ? '⚖️' : 'U'}
          </div>
          <div className="flex-1 space-y-3">
            <div className="flex justify-between items-center">
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
              <div className="flex items-center gap-3 text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm font-medium">Analyzing request...</span>
              </div>
            ) : (
              <>
                <div className="prose prose-gray max-w-none prose-p:leading-relaxed prose-p:text-gray-600">
                  {content}
                </div>
                
                {files?.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {files.map((file, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 shadow-sm hover:border-gray-300 transition-colors duration-200">
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
  );
};

const FileUploadPreview = ({ files, onRemove }) => {
  if (!files.length) return null;
  
  return (
    <div className="mb-3 space-y-2">
      {files.map((file, index) => (
        <div key={index} className="flex items-center gap-3 p-2 bg-white rounded-lg border border-gray-200">
          <FileText className="h-4 w-4 text-blue-600" />
          <span className="text-sm text-gray-700 font-medium flex-1">{file.name}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 hover:bg-gray-100"
            onClick={() => onRemove(index)}
          >
            <X className="h-4 w-4 text-gray-600" />
          </Button>
        </div>
      ))}
    </div>
  );
};

const ChatPage = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [files, setFiles] = useState([]);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() && !files.length) return;

    const newMessage = {
      role: 'user',
      content: input,
      files: [...files],
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, newMessage]);
    setInput('');
    setFiles([]);
    setIsLoading(true);

    // Simulate AI response
    setTimeout(() => {
      const aiResponse = {
        role: 'assistant',
        content: "I've analyzed your query and the provided documents. Here's my legal analysis and recommendation...",
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, aiResponse]);
      setIsLoading(false);
    }, 2000);
  };

  const handleFileUpload = (e) => {
    const newFiles = Array.from(e.target.files);
    setFiles(prev => [...prev, ...newFiles]);
    fileInputRef.current.value = '';
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  };

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Messages */}
      <ScrollArea className="flex-1">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center px-4">
            <div className="max-w-2xl w-full text-center space-y-6">
              <div className="w-20 h-20 bg-blue-50 rounded-full mx-auto flex items-center justify-center">
                <Scale className="h-10 w-10 text-blue-600" />
              </div>
              <h1 className="text-4xl font-semibold text-gray-900 tracking-tight">
                Legal AI Assistant
              </h1>
              <p className="text-lg text-gray-600 leading-relaxed max-w-xl mx-auto">
                Your intelligent legal research companion. Upload documents, ask questions, 
                and get comprehensive legal analysis and insights.
              </p>
            </div>
          </div>
        ) : (
          messages.map((message, index) => (
            <Message key={index} {...message} />
          ))
        )}
        {isLoading && <Message role="assistant" isLoading={true} />}
        <div ref={messagesEndRef} />
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t border-gray-200 bg-white p-6">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSubmit} className="relative">
            <FileUploadPreview files={files} onRemove={removeFile} />
            <div className="relative">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  adjustTextareaHeight();
                }}
                placeholder="Type your legal query..."
                className="min-h-[56px] max-h-[200px] py-4 px-4 pr-28 resize-none rounded-2xl bg-gray-50 border-gray-200 focus:bg-white transition-colors duration-200"
                disabled={isLoading}
              />
              <div className="absolute right-2 top-2 flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                  multiple
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-10 w-10 rounded-full bg-gray-100 hover:bg-gray-200"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                >
                  <Upload className="h-5 w-5 text-gray-600" />
                </Button>
                <Button
                  type="submit"
                  className="h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                  disabled={(!input.trim() && !files.length) || isLoading}
                >
                  <Send className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;