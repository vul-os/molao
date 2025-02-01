import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Scale } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/services/supabase-client';
import Message from './message';
import MessageInput from './message-input';

const ChatPage = () => {
  const { id: routeConversationId } = useParams();
  const navigate = useNavigate();
  const { activeFirm, createChat } = useAuth();
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState(routeConversationId);
  const scrollAreaRef = useRef(null);

  const fetchHistory = useCallback(async (chatId) => {
    if (!chatId || !activeFirm?.id) return;
    
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session');

      const { data, error } = await supabase.functions.invoke('chat-manager', {
        body: {
          action: 'get-history',
          conversationId: chatId,
          firmId: activeFirm.id,
        },
        headers: {
          Authorization: `Bearer ${session.session.access_token}`,
        },
      });
      
      if (error) throw error;
      
      // Handle the case where data might be a string
      let messageData;
      if (typeof data === 'string') {
        try {
          // If data is a string containing JSON, parse it
          messageData = JSON.parse(data.replace('Received non-array message data: ', ''));
        } catch (e) {
          console.error('Error parsing message data:', e);
          messageData = [];
        }
      } else {
        messageData = data || [];
      }
      
      // Ensure messageData is an array
      if (Array.isArray(messageData)) {
        // Sort messages by creation date
        const sortedMessages = messageData.sort(
          (a, b) => new Date(a.created_at) - new Date(b.created_at)
        );
        setMessages(sortedMessages);
      } else {
        console.warn('Invalid message data format:', messageData);
        setMessages([]);
      }
    } catch (error) {
      console.error('Error fetching conversation history:', error);
      setMessages([]);
    }
  }, [activeFirm?.id]);
  
  // Initialize conversation if none exists
  useEffect(() => {
    const initializeConversation = async () => {
      if (!routeConversationId && activeFirm?.id) {
        try {
          const newChat = await createChat();
          if (!newChat) throw new Error('Failed to create chat');
          
          setConversationId(newChat.id);
          navigate(`/${newChat.id}`);
        } catch (error) {
          console.error('Error creating initial chat:', error);
        }
      }
    };

    initializeConversation();
  }, [routeConversationId, activeFirm?.id, createChat, navigate]);

  useEffect(() => {
    if (!activeFirm?.id) {
      console.error('No active firm found');
      setMessages([]);
      return;
    }
  }, [activeFirm]);

  useEffect(() => {
    if (conversationId) {
      fetchHistory(conversationId);
    } else {
      setMessages([]);
    }
  }, [conversationId, fetchHistory]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  const ensureConversation = useCallback(async () => {
    if (conversationId) return conversationId;
    
    try {
      const newChat = await createChat();
      if (!newChat) throw new Error('Failed to create chat');
      
      setConversationId(newChat.id);
      navigate(`/${newChat.id}`);
      return newChat.id;
    } catch (error) {
      console.error('Error creating chat:', error);
      return null;
    }
  }, [conversationId, createChat, navigate]);

  const handleSendMessage = useCallback(
    async (input, files) => {
      console.log('=== handleSendMessage Started ===');
      console.log('Input:', input);
      console.log('Files:', files);

      // Validate required data
      if (!activeFirm?.id) {
        console.error('No active firm');
        return;
      }

      if (!input?.trim()) {
        console.error('Empty message');
        return;
      }

      // Get or create conversation
      const chatId = await ensureConversation();
      console.log('Conversation ID:', chatId);

      if (!chatId) {
        console.error('Failed to ensure conversation');
        const errorMessage = {
          id: `error-${Date.now()}`,
          role: 'system',
          content: 'Failed to create conversation. Please try again.',
          error: true,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => (Array.isArray(prev) ? [...prev, errorMessage] : [errorMessage]));
        return;
      }

      // Create temporary message
      const tempMessageId = `temp-${Date.now()}`;
      const tempMessage = {
        id: tempMessageId,
        role: 'user',
        content: input,
        files: files || [],
        timestamp: new Date().toISOString(),
        status: 'sending',
      };

      // Add temporary message
      setMessages((prev) =>
        Array.isArray(prev) ? [...prev, tempMessage] : [tempMessage]
      );
      setIsLoading(true);

      try {
        // Get authentication session
        const { data: session } = await supabase.auth.getSession();
        if (!session?.session?.access_token) {
          throw new Error('No active session');
        }

        // Send message to chat manager
        const response = await supabase.functions.invoke('chat-manager', {
          body: {
            action: 'send-message',
            message: input,
            files,
            firmId: activeFirm.id,
            conversationId: chatId,
          },
          headers: {
            Authorization: `Bearer ${session.session.access_token}`,
          },
        });

        console.log('Full response from chat-manager:', response);

        // Handle errors in response
        if (response.error) throw response.error;
        if (!response.data) throw new Error('No response data received');

        // Parse the data if it comes back as a string
        let responseData = response.data;
        if (typeof responseData === 'string') {
          try {
            responseData = JSON.parse(responseData);
          } catch (err) {
            console.error('Error parsing JSON response:', err);
            throw err;
          }
        }

        console.log('Response data structure:', responseData);

        // Update messages
        setMessages((prev) => {
          if (!Array.isArray(prev)) return [];

          // Remove temporary message
          const filteredMessages = prev.filter((msg) => msg.id !== tempMessageId);

          // Create new messages with the correct structure
          const newMessages = [
            {
              id: responseData.userMessageId,
              role: 'user',
              content: input,
              files: files || [],
              timestamp: new Date().toISOString(),
            },
            {
              id: responseData.assistantMessageId,
              role: 'assistant',
              content: responseData.content,
              timestamp: new Date().toISOString(),
            },
          ];

          console.log('New messages to be added:', newMessages);
          return [...filteredMessages, ...newMessages];
        });
      } catch (error) {
        console.error('Error in handleSendMessage:', error);

        // Handle error state
        setMessages((prev) => {
          if (!Array.isArray(prev)) return [];

          const filteredMessages = prev.filter((msg) => msg.id !== tempMessageId);
          return [
            ...filteredMessages,
            {
              id: `error-${Date.now()}`,
              role: 'system',
              content: 'Failed to send message. Please try again.',
              error: true,
              timestamp: new Date().toISOString(),
            },
          ];
        });
      } finally {
        setIsLoading(false);
        console.log('=== handleSendMessage Completed ===');
      }
    },
    [activeFirm?.id, ensureConversation]
  );

  const handleSearch = useCallback(
    async (input, files) => {
      if (!files.length || !activeFirm?.id) return;

      const chatId = await ensureConversation();
      if (!chatId) {
        setMessages((prev) =>
          Array.isArray(prev)
            ? [
                ...prev,
                {
                  role: 'system',
                  content: 'Failed to create conversation. Please try again.',
                  error: true,
                  timestamp: new Date().toISOString(),
                },
              ]
            : [
                {
                  role: 'system',
                  content: 'Failed to create conversation. Please try again.',
                  error: true,
                  timestamp: new Date().toISOString(),
                },
              ]
        );
        return;
      }

      setIsLoading(true);
      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session) throw new Error('No active session');

        const { data, error } = await supabase.functions.invoke('chat-manager', {
          body: {
            action: 'search',
            query: input,
            files,
            firmId: activeFirm.id,
            conversationId: chatId,
          },
          headers: {
            Authorization: `Bearer ${session.session.access_token}`,
          },
        });

        if (error) throw error;

        // If needed, parse `data` if you rely on it before fetching history
        // but since we're not using `data` directly here, we just fetch history:
        await fetchHistory(chatId);
      } catch (error) {
        console.error('Error during search:', error);
        setMessages((prev) =>
          Array.isArray(prev)
            ? [
                ...prev,
                {
                  role: 'system',
                  content: 'Failed to perform search. Please try again.',
                  error: true,
                  timestamp: new Date().toISOString(),
                },
              ]
            : [
                {
                  role: 'system',
                  content: 'Failed to perform search. Please try again.',
                  error: true,
                  timestamp: new Date().toISOString(),
                },
              ]
        );
      } finally {
        setIsLoading(false);
      }
    },
    [activeFirm?.id, ensureConversation, fetchHistory]
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-hidden relative">
        <ScrollArea ref={scrollAreaRef} className="absolute inset-0">
          <div className="pb-40">
            {/* Welcome Message */}
            {Array.isArray(messages) && messages.length === 0 && (
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
              {Array.isArray(messages) &&
                messages.map((message, index) => {
                  console.log('Rendering message:', message);
                  return <Message key={message.id || index} {...message} />;
                })}
              {isLoading && <Message role="assistant" isLoading={true} />}
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
