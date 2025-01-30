import React, { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Upload, Scale, Search } from 'lucide-react';
import Message from './message';
import FileUploadPreview from './file-upload-preview';

const ChatPage = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [files, setFiles] = useState([]);
  const fileInputRef = useRef(null);
  const scrollAreaRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
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
        content: "I've analyzed your query. Here's my response...",
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

  const handleSearch = () => {
    console.log('Search clicked');
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
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-hidden relative">
        <ScrollArea 
          ref={scrollAreaRef}
          className="absolute inset-0"
        >
          <div className="pb-40">
            {/* Welcome Message */}
            {messages.length === 0 && (
              <div className="py-8">
                <div className="max-w-2xl mx-auto px-4 text-center space-y-1">
                  <div className="w-20 h-20 bg-blue-50 rounded-full mx-auto flex items-center justify-center">
                    <Scale className="h-10 w-10 text-blue-600" />
                  </div>
                  <h1 className="text-4xl font-semibold text-gray-900 tracking-tight">
                    AI Assistant
                  </h1>
                  <p className="text-lg text-gray-600 leading-relaxed">
                    Your intelligent research companion. Upload documents, ask questions, 
                    and get comprehensive analysis and insights.
                  </p>
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="max-w-2xl mx-auto px-4 pt-2">
              {messages.map((message, index) => (
                <Message 
                  key={index} 
                  {...message}
                />
              ))}
              {isLoading && (
                <Message 
                  role="assistant" 
                  isLoading={true}
                />
              )}
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* Input Area - Now using sticky positioning */}
      <div className="sticky bottom-0 flex-none z-10 bg-white/80 backdrop-blur border-t border-gray-200">
        <div className="max-w-2xl mx-auto">
          <form onSubmit={handleSubmit} className="p-4">
            <FileUploadPreview files={files} onRemove={removeFile} />
            <div className="relative">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  adjustTextareaHeight();
                }}
                placeholder="Type your message..."
                className="w-full min-h-[56px] max-h-[200px] py-4 px-4 pr-36 resize-none rounded-2xl bg-gray-50 border-gray-200 focus:bg-white transition-colors duration-200 shadow-lg"
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
                  type="button"
                  className="h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                  onClick={handleSearch}
                  disabled={isLoading}
                >
                  <Search className="h-5 w-5" />
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