import React from "react";
import { Search, X, ArrowRight, Loader2, Gavel, Mail, Bell, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { useEffect } from "react";

export default function SearchInput({
  searchQuery,
  setSearchQuery,
  handleSearch,
  isFocused,
  setIsFocused,
  textareaRef,
  isLoading,
  adjustTextareaHeight,
  toast,
  onInviteClick,
  onSettingsClick,
  cancelSearch,
  canCancel,
  clearSearch,
  scoreThreshold,
  searchLimit
}) {
  const { pendingInvites } = useAuth();
  const inviteCount = pendingInvites?.length || 0;

  // Auto-resize textarea when searchQuery changes
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [searchQuery, textareaRef]);

  return (
    <div className="sticky top-0 z-20 bg-gradient-to-b from-slate-50 to-transparent pt-6 pb-4 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex flex-col gap-3">
          {/* Invite notification - appears above search when there are pending invites */}
          {inviteCount > 0 && (
            <div className="flex justify-center">
              <Button
                onClick={onInviteClick}
                variant="outline"
                size="sm"
                className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200 hover:border-blue-300 hover:bg-gradient-to-r hover:from-blue-100 hover:to-purple-100 text-blue-700 transition-all duration-200 shadow-sm hover:shadow-md"
              >
                <Mail className="h-4 w-4 mr-2" />
                <span className="font-medium">
                  {inviteCount} Firm Invitation{inviteCount > 1 ? 's' : ''}
                </span>
                <Badge variant="secondary" className="ml-2 bg-blue-100 text-blue-800 border-blue-300">
                  {inviteCount}
                </Badge>
              </Button>
            </div>
          )}

          {/* Settings button row */}
          <div className="flex justify-end">
            <Button
              onClick={onSettingsClick}
              variant="outline"
              size="sm"
              className="bg-white/80 hover:bg-white/95 border-slate-200/80 text-slate-700 hover:text-slate-800 transition-all duration-200 shadow-sm hover:shadow-md backdrop-blur-sm group"
            >
              <Settings className="h-4 w-4 mr-2 text-slate-500 group-hover:text-slate-700" />
              <div className="text-xs text-slate-500 font-medium">
                {Math.round((scoreThreshold || 0.75) * 100)}% sensitivity • {searchLimit || 50} documents
              </div>
            </Button>
          </div>

          {/* Modern search input with subtle shadow */}
          <div className={cn(
            "relative transition-all duration-300 textarea-container",
            "hover:shadow-lg",
            isFocused ? "shadow-md ring-1 ring-slate-200" : "shadow-sm",
            searchQuery && searchQuery.includes('\n') 
              ? "rounded-lg" // Square with rounded corners for multiline
              : "rounded-full" // Keep semicircle for single line
          )}>
            <div className={cn(
              "relative flex items-center",
              searchQuery && searchQuery.includes('\n') ? "items-start" : "items-center" // Adjust alignment for multiline
            )}>
              {/* Search icon */}
              <div className={cn(
                "absolute left-4 text-slate-400 flex items-center justify-center w-5 h-5 pointer-events-none",
                searchQuery && searchQuery.includes('\n') ? "top-4" : "top-1/2 transform -translate-y-1/2"
              )}>
                <Search className="h-4 w-4" />
              </div>
              
              {/* Expandable textarea */}
              <textarea
                ref={textareaRef}
                placeholder="Search South African legal cases..."
                value={searchQuery}
                onChange={(e) => {
                  // Limit to 500 characters
                  if (e.target.value.length <= 500) {
                    setSearchQuery(e.target.value);
                  }
                }}
                onKeyDown={(e) => {
                  // Only submit on Enter if not holding Shift
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSearch();
                  }
                  // Show a visual hint if possible when user uses Shift+Enter
                  if (e.key === 'Enter' && e.shiftKey && !toast.isActive('multiline-hint')) {
                    toast({
                      id: 'multiline-hint',
                      description: "Using Shift+Enter for multi-line search query",
                      duration: 2000,
                    });
                  }
                }}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                rows={1}
                className={cn(
                  "w-full pl-12 pr-20 sm:pr-16 py-2.5 sm:py-3 bg-white border-0",
                  "expandable-textarea resize-none overflow-hidden min-h-[52px]",
                  "text-slate-800 placeholder:text-slate-400 focus:outline-none",
                  "transition-all duration-200 multi-line-input",
                  searchQuery && searchQuery.includes('\n') 
                    ? "pt-4 rounded-lg" // Square with rounded corners for multiline
                    : "rounded-full", // Keep semicircle for single line
                  "text-sm sm:text-base"
                )}
                style={{
                  height: 'auto',
                  minHeight: '52px',
                  boxShadow: 'none',
                }}
                maxLength={500}
              />
              
              {/* Action buttons - positioned on right with better spacing */}
              <div className={cn(
                "absolute right-3 flex items-center gap-2",
                searchQuery && searchQuery.includes('\n') ? "top-4" : "top-1/2 transform -translate-y-1/2"
              )}>
                {/* X button - Only show when search query exists */}
                {searchQuery && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="group flex items-center justify-center h-8 w-8 rounded-full 
                             bg-transparent p-0 hover:bg-slate-100 focus:bg-slate-100
                             transition-colors duration-200 z-10" // Added z-10 to ensure button stays above text
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4 text-slate-400 group-hover:text-slate-500" />
                  </button>
                )}
                
                {/* Search button - With animation on hover */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault(); // Prevent any form submission behavior
                    e.stopPropagation(); // Stop event bubbling
                    console.log('Search button clicked:', { 
                      isLoading, 
                      canCancel, 
                      searchQuery: searchQuery.trim(),
                      disabled: !isLoading && !searchQuery.trim()
                    });
                    if (isLoading && canCancel) {
                      console.log('Calling cancelSearch');
                      cancelSearch();
                    } else {
                      console.log('Calling handleSearch');
                      handleSearch();
                    }
                  }}
                  disabled={!isLoading && !searchQuery.trim()}
                  className={cn(
                    "flex items-center justify-center h-10 w-10 rounded-full",
                    "text-white transition-all duration-300 ease-out",
                    "transform hover:scale-105 active:scale-95",
                    "z-10", // Added z-10 to ensure button stays above text
                    isLoading && canCancel ? 
                      "bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-400 hover:to-orange-400" :
                      searchQuery.trim() ? 
                        "bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-500 hover:to-blue-500" : 
                        "bg-slate-200 text-slate-500"
                  )}
                  aria-label={isLoading && canCancel ? "Cancel search" : "Search"}
                >
                  {isLoading ? (
                    canCancel ? (
                      <X className="h-5 w-5" />
                    ) : (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    )
                  ) : (
                    <ArrowRight className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>
          </div>
          
          {/* Character counter or hint */}
          <div className="flex justify-between px-1">
            {isFocused && (
              <div className="text-xs text-slate-500">
                {searchQuery.includes('\n') ? 
                  <span>Press <kbd className="px-1.5 py-0.5 bg-slate-100 rounded border border-slate-300 text-slate-600 font-mono text-[10px]">Shift+Enter</kbd> for new line, <kbd className="px-1.5 py-0.5 bg-slate-100 rounded border border-slate-300 text-slate-600 font-mono text-[10px]">Enter</kbd> to search</span> : 
                  <span>Press <kbd className="px-1.5 py-0.5 bg-slate-100 rounded border border-slate-300 text-slate-600 font-mono text-[10px]">Enter</kbd> to search</span>
                }
              </div>
            )}
            
            {searchQuery && (
              <div className={cn(
                "text-xs font-medium transition-colors",
                searchQuery.length > 450 ? "text-amber-600" : "text-slate-400"
              )}>
                {searchQuery.length}/500
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 