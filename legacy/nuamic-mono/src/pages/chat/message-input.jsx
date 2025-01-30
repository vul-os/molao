import React, { useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Upload, Search } from 'lucide-react';
import FileUploadPreview from './file-upload-preview';

const MessageInput = ({ isLoading, onSendMessage, onSearch, disabled }) => {
  const [input, setInput] = useState('');
  const [files, setFiles] = useState([]);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  const handleFileUpload = async (e) => {
    const uploadedFiles = Array.from(e.target.files);
    
    // Validate file types and sizes
    const validFiles = uploadedFiles.filter(file => {
      const maxSize = 10 * 1024 * 1024; // 10MB limit
      if (file.size > maxSize) {
        console.error(`File ${file.name} is too large. Maximum size is 10MB.`);
        return false;
      }
      return true;
    });

    if (validFiles.length !== uploadedFiles.length) {
      // Notify parent about error
      onSendMessage('', [], {
        role: 'system',
        content: 'Some files were too large and were not included. Maximum file size is 10MB.',
        error: true,
        timestamp: new Date().toISOString()
      });
    }
    
    // Convert files to base64 for upload
    const processedFiles = await Promise.all(validFiles.map(async (file) => {
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(file);
      });

      return {
        name: file.name,
        type: file.type,
        size: file.size,
        base64,
      };
    }));

    setFiles(prev => [...prev, ...processedFiles]);
    fileInputRef.current.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() && !files.length) return;

    const currentInput = input;
    const currentFiles = files;
    
    setInput('');
    setFiles([]);
    
    onSendMessage(currentInput, currentFiles);
  };

  const handleSearchClick = () => {
    if (!files.length) return;
    onSearch(input, files);
    setFiles([]);
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
              disabled={isLoading || disabled}
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
                disabled={isLoading || disabled}
              >
                <Upload className="h-5 w-5 text-gray-600" />
              </Button>
              <Button
                type="button"
                className="h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                onClick={handleSearchClick}
                disabled={!files.length || isLoading || disabled}
              >
                <Search className="h-5 w-5" />
              </Button>
              <Button
                type="submit"
                className="h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                disabled={(!input.trim() && !files.length) || isLoading || disabled}
              >
                <Send className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MessageInput;