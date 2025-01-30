import React, { useState, useRef, useEffect } from 'react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Scale } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/services/supabase-client';
import Message from './message';
import MessageInput from './message-input';

const ChatPage = ({ conversationId }) => {
  const { activeFirm } = useAuth();
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef(null);

  useEffect(() => {
    if (!activeFirm?.id) {
      console.error('No active firm found');
      return;
    }
  }, [activeFirm]);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!conversationId || !activeFirm?.id) return;
      
      try {
        const { data, error } = await supabase.functions.invoke('conversations', {
          body: {
            path: `conversations/${conversationId}/messages`,
            method: 'GET'
          }
        });
        
        if (error) throw error;
        setMessages(data);
      } catch (error) {
        console.error('Error fetching conversation history:', error);
      }
    };

    fetchHistory();
  }, [conversationId, activeFirm?.id]);

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

  const handleSendMessage = async (input, files) => {
    if (!activeFirm?.id) {
      console.error('No active firm');
      return;
    }

    const newMessage = {
      role: 'user',
      content: input,
      files: files,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, newMessage]);
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('conversations', {
        body: {
          path: `conversations/${conversationId}/messages`,
          method: 'POST',
          message: input,
          files: files,
          firm_id: activeFirm.id
        }
      });

      if (error) throw error;
      
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.content,
        timestamp: new Date().toISOString()
      }]);
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [...prev, {
        role: 'system',
        content: 'Failed to send message. Please try again.',
        error: true,
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async (input, files) => {
    if (!files.length || !activeFirm?.id) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('conversations', {
        body: {
          path: `conversations/${conversationId}/search`,
          method: 'POST',
          query: input,
          files: files,
          firm_id: activeFirm.id
        }
      });

      if (error) throw error;
      
      // Refresh messages to show search results
      const { data: historyData, error: historyError } = await supabase.functions.invoke('conversations', {
        body: {
          path: `conversations/${conversationId}/messages`,
          method: 'GET'
        }
      });
      
      if (historyError) throw historyError;
      setMessages(historyData);
      
    } catch (error) {
      console.error('Error during search:', error);
      setMessages(prev => [...prev, {
        role: 'system',
        content: 'Failed to perform search. Please try again.',
        error: true,
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setIsLoading(false);
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

      {/* Message Input */}
      <MessageInput
        isLoading={isLoading}
        onSendMessage={handleSendMessage}
        onSearch={handleSearch}
        disabled={!activeFirm?.id}
      />
    </div>
  );
};

export default ChatPage;