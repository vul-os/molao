import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Loader2, Scale, ArrowUpRight, FileText, Send, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useLocation } from "react-router-dom";
import SearchInput from "./search-input";
import LegalLoader from "./legal-loader";
import { API_BASE_URL, suggestedSearches } from "./constants";

export default function SearchPage() {
  const { user, refreshToken, activeFirm } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState(() => {
    // Initialize from session storage or location state
    return sessionStorage.getItem('searchQuery') || location.state?.searchQuery || "";
  });
  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState(() => {
    // Initialize from session storage or location state
    const storedResults = sessionStorage.getItem('searchResults');
    return storedResults ? JSON.parse(storedResults) : location.state?.searchResults || [];
  });
  const [showSuggestions, setShowSuggestions] = useState(() => {
    // Show suggestions if no search results
    return !(sessionStorage.getItem('searchResults') || location.state?.searchResults);
  });
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef(null);
  
  // Add state for usage limits dialog
  const [showLimitDialog, setShowLimitDialog] = useState(false);
  const [limitErrorMessage, setLimitErrorMessage] = useState("");
  const [usageStats, setUsageStats] = useState(null);

  // Update session storage when search state changes
  useEffect(() => {
    if (searchQuery) {
      sessionStorage.setItem('searchQuery', searchQuery);
    } else {
      sessionStorage.removeItem('searchQuery');
    }
  }, [searchQuery]);

  useEffect(() => {
    if (searchResults.length > 0) {
      sessionStorage.setItem('searchResults', JSON.stringify(searchResults));
      setShowSuggestions(false);
    } else {
      sessionStorage.removeItem('searchResults');
      setShowSuggestions(true);
    }
  }, [searchResults]);

  // Clear search state
  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResults([]);
    setShowSuggestions(true);
    sessionStorage.removeItem('searchQuery');
    sessionStorage.removeItem('searchResults');
  }, []);

  // Handle refresh
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Clear session storage on page refresh
      sessionStorage.removeItem('searchQuery');
      sessionStorage.removeItem('searchResults');
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Handle navigation state changes
  useEffect(() => {
    if (location.state?.searchResults?.length > 0) {
      setSearchResults(location.state.searchResults);
      setShowSuggestions(false);
      if (location.state.searchQuery) {
        setSearchQuery(location.state.searchQuery);
      }
    } else if (!location.state) {
      // If no state in navigation, clear the search
      clearSearch();
    }
  }, [location.state, clearSearch]);

  // Auto-scroll to bottom when results change
  useEffect(() => {
    if (searchResults.length > 0) {
      const resultsContainer = document.getElementById('search-results');
      if (resultsContainer) {
        resultsContainer.scrollTop = resultsContainer.scrollHeight;
      }
    }
  }, [searchResults]);

  // Add auto-resize functionality for textarea
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`; // Max height of 200px
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [searchQuery]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsLoading(true);
    setShowSuggestions(false);
    
    try {
      const makeSearchRequest = async (token) => {
        // Check for null or undefined token
        if (!token) {
          console.error("No access token available");
          throw new Error('missing_token');
        }
        
        console.log("Attempting API request with token length:", token.length);
        
        // Get firm_id from activeFirm in auth context
        const firmId = activeFirm?.id;
        
        const response = await fetch(`${API_BASE_URL}/search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token.trim()}` // Ensure no whitespace
          },
          body: JSON.stringify({
            query: searchQuery,
            limit: 10,
            firm_id: firmId
          })
        });
        
        // Log response status for debugging
        console.log("API response status:", response.status);
        
        if (response.status === 401) {
          throw new Error('unauthorized');
        }
        
        // Handle rate limit exceeded (429)
        if (response.status === 429) {
          const errorData = await response.json();
          setLimitErrorMessage(errorData.detail || "You've reached your usage limit for this plan.");
          setShowLimitDialog(true);
          throw new Error('rate_limited');
        }
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error("API error details:", errorData);
          throw new Error(errorData.detail || 'Search request failed');
        }
        
        const data = await response.json();
        
        // Store usage statistics if available
        if (data.usage) {
          setUsageStats(data.usage);
          console.log("Usage stats:", data.usage);
        }
        
        return data;
      };
      
      // Try with current token
      try {
        // Check if user exists and has access_token
        if (!user || !user.access_token) {
          toast({
            title: "Authentication error",
            description: "You need to sign in first.",
            variant: "destructive"
          });
          navigate('/signin');
          return;
        }
        
        const data = await makeSearchRequest(user.access_token);
        setSearchResults(data.results || []);
      } catch (error) {
        console.log("Search error:", error.message);
        
        // If rate limited, dialog is already shown, no need for toast
        if (error.message === 'rate_limited') {
          return;
        }
        
        // If unauthorized, try to refresh token and retry once
        if (error.message === 'unauthorized' || error.message === 'missing_token') {
          console.log("Attempting token refresh...");
          // Call the refreshToken function from auth context
          const newToken = await refreshToken();
          if (newToken) {
            console.log("Token refreshed successfully");
            // Retry with new token
            const data = await makeSearchRequest(newToken);
            setSearchResults(data.results || []);
          } else {
            console.log("Token refresh failed");
            // Token refresh failed, redirect to sign in
            toast({
              title: "Session expired",
              description: "Your session has expired. Please sign in again.",
              variant: "destructive"
            });
            navigate('/signin');
          }
        } else {
          // Not an auth error or refresh failed
          throw error;
        }
      }
    } catch (error) {
      // Skip showing toast for rate limit errors since we show a dialog
      if (error.message !== 'rate_limited') {
        console.error('Search error details:', error);
        toast({
          title: "Search failed",
          description: error.message || "Unable to perform search. Please try again.",
          variant: "destructive"
        });
        setSearchResults([]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    setSearchQuery(suggestion);
    handleSearch();
  };

  const handleFileClick = (file) => {
    // Navigate to file detail page with file ID
    navigate(`/search/file/${file.id}`, {
      state: {
        // Pass the current search results and query as state so we can restore them when returning
        searchResults: searchResults,
        searchQuery: searchQuery
      }
    });
  };

  const navigateToBilling = () => {
    setShowLimitDialog(false);
    navigate('/billing');
  };

  return (
    <div key={location.pathname} className="flex flex-col h-full bg-gradient-to-b from-slate-50 to-slate-100">
      {/* Add global font styles */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap');

        body {
          font-family: 'Inter', system-ui, sans-serif;
        }
        
        .font-heading {
          font-family: 'Crimson Pro', Georgia, serif;
        }

        /* Add smooth expanding animation */
        .expandable-textarea {
          transition: height 0.2s ease;
        }
        
        /* Add styles for multi-line textarea */
        .multi-line-input {
          white-space: pre-wrap;
          word-break: break-word;
          line-height: 1.5;
        }
        
        /* Add subtle styling for multi-line state */
        .textarea-container.multi-line {
          border-radius: 16px;
        }
        
        .textarea-container.multi-line textarea {
          border-radius: 14px;
          padding-bottom: 12px;
        }
      `}</style>

      {/* Usage Limit Dialog */}
      <Dialog open={showLimitDialog} onOpenChange={setShowLimitDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              <span>Usage Limit Reached</span>
            </DialogTitle>
            <DialogDescription>
              {limitErrorMessage}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <p className="text-sm text-slate-600 mb-4">
              Upgrade your plan to continue searching and accessing more legal documents.
            </p>
          </div>
          
          <DialogFooter className="sm:justify-between">
            <Button
              variant="outline"
              onClick={() => setShowLimitDialog(false)}
            >
              Close
            </Button>
            <Button
              onClick={navigateToBilling}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              Upgrade Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Search input component */}
      <SearchInput
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        handleSearch={handleSearch}
        isFocused={isFocused}
        setIsFocused={setIsFocused}
        textareaRef={textareaRef}
        isLoading={isLoading}
        adjustTextareaHeight={adjustTextareaHeight}
        toast={toast}
      />

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto -mt-2 pb-6">
        <div className="max-w-4xl mx-auto px-4">
          {/* Usage stats display when available */}
          {usageStats && (
            <div className="mb-4 bg-white rounded-lg border border-slate-200 p-3 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-slate-700">Daily Search Usage</h3>
                <span className="text-xs text-slate-500">
                  {usageStats.daily_usage} / {usageStats.daily_limit} searches
                </span>
              </div>
              <Progress 
                value={(usageStats.daily_usage / usageStats.daily_limit) * 100} 
                className="h-2 bg-slate-200"
                indicatorClassName={cn(
                  "bg-green-500",
                  usageStats.daily_usage / usageStats.daily_limit > 0.8 && "bg-amber-500",
                  usageStats.daily_usage / usageStats.daily_limit > 0.95 && "bg-red-500"
                )}
              />
              <div className="flex justify-end mt-1">
                <span className="text-xs text-slate-500">
                  {usageStats.daily_remaining} searches remaining today
                </span>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 mt-8">
              <LegalLoader isLoading={isLoading} />
            </div>
          ) : searchResults.length > 0 ? (
            <div className="space-y-4 mt-6">
              <h2 className="font-heading text-lg font-medium text-slate-800 mb-4">
                Search Results
              </h2>
              <div className="grid gap-3" id="search-results">
                {searchResults.map((file) => (
                  <TooltipProvider key={file.id} delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Card
                          className={cn(
                            "cursor-pointer transition-all hover:border-green-100 hover:bg-green-50/30 border-slate-200 bg-white/90 backdrop-blur-sm group overflow-hidden",
                            "hover:shadow-md"
                          )}
                          onClick={() => handleFileClick(file)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="flex-shrink-0 bg-green-50 p-2 rounded-md group-hover:bg-green-100 transition-colors">
                                <FileText className="h-5 w-5 text-green-700" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-heading text-sm font-medium text-slate-900 truncate">
                                  {file.file_name}
                                </p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  {file.file_type} • {file.file_size ? `${(file.file_size / 1024).toFixed(1)} KB` : 'Unknown size'}
                                </p>
                              </div>
                              <div className="bg-slate-100 rounded-full p-1.5 group-hover:bg-green-100 transition-colors">
                                <ArrowUpRight className="h-3.5 w-3.5 text-slate-500 group-hover:text-green-700 transition-colors" />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="p-2 bg-slate-900 text-white">
                        <p className="text-sm font-medium">{file.file_name}</p>
                        <p className="text-xs opacity-80">{file.file_type}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </div>
            </div>
          ) : searchQuery ? (
            <div className="flex flex-col items-center justify-center h-64 text-center mt-8">
              <div className="text-slate-300 mb-4">
                <Search className="h-10 w-10" />
              </div>
              <p className="font-heading text-lg text-slate-600 mb-2">No cases found</p>
              <p className="text-sm text-slate-500 mb-4 max-w-md">
                We couldn't find any cases matching "{searchQuery}"
              </p>
              <Button
                variant="outline"
                className="text-green-700 font-medium border-green-100 hover:bg-green-50"
                onClick={() => setShowSuggestions(true)}
              >
                Try a different search
              </Button>
            </div>
          ) : showSuggestions && !searchQuery ? (
            <div>
              <div className="flex flex-col items-center text-center gap-3 mb-6 mt-2">
                <p className="text-sm text-slate-600 max-w-lg">
                  Search through judgments from South African courts, including Constitutional Court,
                  Supreme Court of Appeal, and High Courts.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 justify-center mb-6">
                <Badge variant="outline" className="bg-white hover:bg-green-50 cursor-pointer text-slate-700 hover:text-green-800 border-slate-200">Constitutional cases</Badge>
                <Badge variant="outline" className="bg-white hover:bg-green-50 cursor-pointer text-slate-700 hover:text-green-800 border-slate-200">Human rights</Badge>
                <Badge variant="outline" className="bg-white hover:bg-green-50 cursor-pointer text-slate-700 hover:text-green-800 border-slate-200">Property law</Badge>
                <Badge variant="outline" className="bg-white hover:bg-green-50 cursor-pointer text-slate-700 hover:text-green-800 border-slate-200">Contract law</Badge>
                <Badge variant="outline" className="bg-white hover:bg-green-50 cursor-pointer text-slate-700 hover:text-green-800 border-slate-200">Criminal procedure</Badge>
              </div>
              
              <div className="grid grid-cols-1 gap-6">
                {suggestedSearches.map((category, idx) => (
                  <div key={idx}>
                    <h3 className="font-heading text-base font-medium text-slate-800 tracking-wide mb-3 pb-2 border-b border-slate-200">
                      {category.category}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {category.queries.map((suggestion, index) => (
                        <TooltipProvider key={index} delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                className="justify-start h-auto min-h-[60px] py-3 px-4 text-left text-sm text-slate-700 
                                      hover:bg-green-50 hover:text-green-900 hover:border-green-200
                                      transition-all duration-200 border-slate-200 bg-white/80 whitespace-normal"
                                onClick={() => handleSuggestionClick(suggestion)}
                              >
                                <div className="flex items-start gap-3 w-full">
                                  <Scale className="h-4 w-4 text-green-700 mt-1 flex-shrink-0" />
                                  <span className="leading-relaxed">{suggestion}</span>
                                </div>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs p-3 bg-slate-900 text-white">
                              <p className="text-sm">Click to search</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
} 