import React from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { Settings, MessageSquare } from 'lucide-react';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from '@/context/auth-context';

const NavItem = ({ title, lastMessage, timestamp, isActive, isExpanded, onClick }) => {
  const getTimeString = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days > 0) {
      return `${days}d ago`;
    }
    
    const hours = date.getHours();
    const minutes = date.getMinutes();
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-2 rounded-lg transition-colors",
        "hover:bg-gray-50",
        isActive && "bg-gray-50",
        !isExpanded && "px-2"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-1">
          <MessageSquare className={cn(
            "w-5 h-5",
            isActive ? "text-gray-900" : "text-gray-500"
          )} />
        </div>
        
        {isExpanded && (
          <div className="min-w-0 flex-1">
            <div className="flex justify-between gap-2">
              <p className={cn(
                "text-sm font-medium truncate",
                isActive ? "text-gray-900" : "text-gray-700"
              )}>
                {title || 'New Chat'}
              </p>
              {timestamp && (
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  {getTimeString(timestamp)}
                </span>
              )}
            </div>
            {lastMessage && (
              <p className="text-xs text-gray-500 truncate mt-0.5">
                {lastMessage}
              </p>
            )}
          </div>
        )}
      </div>
    </button>
  );
};

const SideNav = ({ isExpanded, isMobile }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { 
    recentChats, 
    isLoadingChats, 
    activeChat,
  } = useAuth();

  const getCurrentChatId = () => {
    const match = location.pathname.match(/\/chat\/(.+)/);
    return match ? match[1] : null;
  };

  const handleChatClick = (chatId) => {
    navigate(`/chat/${chatId}`);
  };

  return (
    <aside
      className={cn(
        "fixed top-16 left-0 h-[calc(100vh-4rem)] bg-white border-r border-gray-200",
        "flex flex-col transition-all duration-300 ease-in-out",
        isExpanded ? "w-64" : isMobile ? "w-0" : "w-16",
        !isExpanded && !isMobile && "hover:w-64 hover:shadow-lg group"
      )}
    >
      {/* New Chat Button */}
      <div className={cn(
        "p-4 border-b border-gray-100",
        isMobile && !isExpanded && "hidden"
      )}>
        <RouterLink to="/chat/new">
          <Button
            variant="default"
            className={cn(
              "w-full bg-black text-white hover:bg-gray-900",
              !isExpanded && !isMobile && "w-8 p-0 group-hover:w-full group-hover:px-4"
            )}
          >
            <span className={cn(
              "transition-opacity",
              (!isExpanded && !isMobile) ? "opacity-0 group-hover:opacity-100" : "opacity-100"
            )}>
              New Chat
            </span>
            {(!isExpanded && !isMobile) && (
              <MessageSquare className="h-4 w-4 absolute group-hover:hidden" />
            )}
          </Button>
        </RouterLink>
      </div>

      {/* Chat List */}
      <ScrollArea className={cn(
        "flex-1",
        isMobile && !isExpanded && "hidden"
      )}>
        <nav className="p-2">
          {isLoadingChats ? (
            <div className="flex items-center justify-center h-20">
              <p className="text-sm text-gray-500">Loading chats...</p>
            </div>
          ) : recentChats.length > 0 ? (
            <div className="space-y-1">
              {recentChats.map((chat) => (
                <NavItem
                  key={chat.id}
                  title={chat.title}
                  lastMessage={chat.last_message_content}
                  timestamp={chat.last_message_at}
                  isActive={getCurrentChatId() === chat.id}
                  isExpanded={isExpanded || (!isMobile && document.querySelector('aside:hover'))}
                  onClick={() => handleChatClick(chat.id)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-20 text-center px-4">
              <p className="text-sm text-gray-500">No recent chats</p>
            </div>
          )}
        </nav>
      </ScrollArea>

      {/* Settings Button */}
      <div className={cn(
        "p-2 border-t border-gray-100",
        "transition-opacity duration-200",
        isMobile && !isExpanded && "hidden"
      )}>
        <RouterLink to="/settings">
          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start text-gray-700 hover:text-gray-900 hover:bg-gray-50",
              !isExpanded && "justify-center"
            )}
          >
            <Settings className="h-5 w-5" />
            {isExpanded && <span className="ml-3">Settings</span>}
          </Button>
        </RouterLink>
      </div>
    </aside>
  );
};

export default SideNav;