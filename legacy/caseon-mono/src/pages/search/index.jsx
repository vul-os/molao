import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Loader2, Scale, ArrowUpRight, FileText, Send, AlertCircle, Sparkles, ChevronDown, ChevronUp, Bot } from "lucide-react";
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
import { suggestedSearches } from "./constants";
import { supabase } from "@/services/supabase-client";
import InviteDialog from "@/components/invite-dialog";

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
  
  // Add state for search cancellation
  const [searchController, setSearchController] = useState(null);
  
  // Add state for usage limits dialog
  const [showLimitDialog, setShowLimitDialog] = useState(false);
  const [limitErrorMessage, setLimitErrorMessage] = useState("");
  const [usageDetails, setUsageDetails] = useState(null);

  // Add state for invite dialog
  const [showInviteDialog, setShowInviteDialog] = useState(false);

  // Add state for expanded summaries
  const [expandedSummaries, setExpandedSummaries] = useState(new Set());

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
    
    // Reset textarea height and focus
    if (textareaRef.current) {
      textareaRef.current.style.height = '52px';
      // Return focus to textarea after clearing
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
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

  // Add function to cancel search
  const cancelSearch = () => {
    console.log('Cancelling search - before:', { searchController: !!searchController, isLoading });
    if (searchController) {
      searchController.abort();
      setSearchController(null);
      setIsLoading(false);
      // Ensure we can search again after cancelling
      setShowSuggestions(false);
    }
    console.log('Cancelling search - after cleanup');
  };

  // Clean up search controller on unmount
  useEffect(() => {
    return () => {
      if (searchController) {
        searchController.abort();
      }
    };
  }, [searchController]);

  const handleSearch = async (queryOverride = null) => {
    const query = queryOverride || searchQuery;
    if (!query.trim()) return;
    
    // Cancel any existing search
    if (searchController) {
      searchController.abort();
    }
    
    // Create new AbortController for this search
    const controller = new AbortController();
    setSearchController(controller);
    
    setIsLoading(true);
    setShowSuggestions(false);
    
    // Update the search query state if we're using an override
    if (queryOverride) {
      setSearchQuery(queryOverride);
    }
    
    try {
      // Get firm_id from activeFirm in auth context
      const firmId = activeFirm?.id;
      
      // Use Supabase functions.invoke() which handles authentication automatically
      const { data, error } = await supabase.functions.invoke('search', {
        body: {
          query: query,
          limit: 10,
          firm_id: firmId
        }
      });
      
      // Check if the search was cancelled
      if (controller.signal.aborted) {
        return;
      }
      
      if (error) {
        console.error('Search error:', error);
        console.log('Error details:', {
          status: error.status,
          message: error.message,
          details: error.details,
          responseData: data
        });
        
        // Clean up state before handling errors
        setIsLoading(false);
        setSearchController(null);
        
        // Handle unauthorized (401)
        if (error.status === 401) {
          toast({
            title: "Session expired",
            description: "Your session has expired. Please sign in again.",
            variant: "destructive"
          });
          navigate('/signin');
          return;
        }
        
        // Handle other errors
        toast({
          title: "Search failed",
          description: error.message || "Unable to perform search. Please try again.",
          variant: "destructive"
        });
        setSearchResults([]);
        return;
      }
      
      // Check if this is a billing limit response (now returns 200 with billing_limit_reached flag)
      if (data && data.billing_limit_reached) {
        console.log('Billing limit reached:', data);
        setLimitErrorMessage(data.error || "You've reached your usage limit for this plan.");
        if (data.usage) {
          setUsageDetails(data.usage);
        }
        setShowLimitDialog(true);
        // Clean up state
        setIsLoading(false);
        setSearchController(null);
        return;
      }
      
      // Set search results and clean up state
      setSearchResults(data?.results || []);
      setIsLoading(false);
      setSearchController(null);
      
    } catch (error) {
      console.error('Search error details:', error);
      
      // Don't show error toast if the request was aborted (cancelled)
      if (error.name === 'AbortError' || controller.signal.aborted) {
        console.log('Search was cancelled');
        // Ensure state is clean after cancellation
        setIsLoading(false);
        setSearchController(null);
        return;
      }
      
      // Clean up state before showing error
      setIsLoading(false);
      setSearchController(null);
      
      toast({
        title: "Search failed",
        description: error.message || "Unable to perform search. Please try again.",
        variant: "destructive"
      });
      setSearchResults([]);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    handleSearch(suggestion);
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

  // Function to toggle summary expansion
  const toggleSummaryExpansion = (fileId) => {
    setExpandedSummaries(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });
  };

  // Function to truncate text
  const truncateText = (text, maxLength = 100) => {
    if (!text || text.length <= maxLength) return text;
    
    // Find the last space before the max length to avoid cutting words
    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastSpace > maxLength * 0.8) { // Only use space if it's not too far back
      return text.substring(0, lastSpace) + '…';
    }
    
    return truncated + '…';
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

        /* Line clamp utility for truncating case titles */
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        /* Custom scrollbar for results */
        .results-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .results-scroll::-webkit-scrollbar-track {
          background: rgb(241 245 249);
          border-radius: 3px;
        }
        .results-scroll::-webkit-scrollbar-thumb {
          background: rgb(203 213 225);
          border-radius: 3px;
        }
        .results-scroll::-webkit-scrollbar-thumb:hover {
          background: rgb(148 163 184);
        }
      `}</style>

      {/* Usage Limit Dialog */}
      <Dialog open={showLimitDialog} onOpenChange={setShowLimitDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <div className="flex items-center justify-center w-10 h-10 bg-amber-100 rounded-full">
                <AlertCircle className="h-5 w-5 text-amber-600" />
              </div>
              <span className="font-heading">Usage Limit Reached</span>
            </DialogTitle>
            <DialogDescription className="text-slate-600 text-sm leading-relaxed">
              You've reached your plan's search limit. Upgrade to continue accessing legal documents and cases.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            {/* Plan Information */}
            {usageDetails && (
              <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">Current Plan</span>
                  <Badge variant="outline" className="bg-white border-slate-300 text-slate-700">
                    {usageDetails.plan_name || 'Current Plan'}
                  </Badge>
                </div>
                
                {/* Usage Stats */}
                <div className="space-y-3">
                  {/* Daily Usage */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">Daily Usage</span>
                      <span className="font-medium text-slate-700">
                        {usageDetails.daily_usage || 0} / {usageDetails.daily_limit || 0}
                      </span>
                    </div>
                    <Progress 
                      value={(usageDetails.daily_usage / usageDetails.daily_limit) * 100} 
                      className="h-2"
                      style={{
                        background: 'rgb(226 232 240)',
                      }}
                    />
                  </div>
                  
                  {/* Monthly Usage */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">Monthly Usage</span>
                      <span className="font-medium text-slate-700">
                        {usageDetails.monthly_usage || 0} / {usageDetails.monthly_limit || 0}
                      </span>
                    </div>
                    <Progress 
                      value={(usageDetails.monthly_usage / usageDetails.monthly_limit) * 100} 
                      className="h-2"
                      style={{
                        background: 'rgb(226 232 240)',
                      }}
                    />
                    {usageDetails.monthly_remaining === 0 && (
                      <p className="text-xs text-amber-600 font-medium">
                        Monthly limit reached
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {/* Error Message */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-800">
                {limitErrorMessage}
              </p>
            </div>
            
            {/* Benefits of upgrading */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Upgrade to unlock:</p>
              <ul className="text-sm text-slate-600 space-y-1">
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                  More monthly searches
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                  Higher daily limits
                </li>
              </ul>
            </div>
          </div>
          
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowLimitDialog(false)}
              className="flex-1 sm:flex-none"
            >
              Close
            </Button>
            <Button
              onClick={() => {
                setShowLimitDialog(false);
                navigate('/billing');
              }}
              className="bg-green-600 hover:bg-green-700 text-white flex-1 sm:flex-none"
            >
              Upgrade Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Dialog */}
      <InviteDialog
        open={showInviteDialog}
        onOpenChange={setShowInviteDialog}
      />

      {/* Fixed search header area */}
      <div className="fixed top-16 left-0 right-0 z-10 bg-slate-50/95 backdrop-blur-sm">
        {/* Search Input */}
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
          onInviteClick={() => setShowInviteDialog(true)}
          clearSearch={clearSearch}
          cancelSearch={cancelSearch}
          canCancel={!!searchController}
        />
        
        {/* Fixed Results Header */}
        {searchResults.length > 0 && (
          <div className="px-4 pb-3 pt-1">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between">
                <h2 className="font-heading text-lg font-semibold text-slate-800">
                  Search Results
                </h2>
                <span className="text-sm text-slate-500 bg-white/60 px-3 py-1 rounded-full border border-slate-200/80">
                  {searchResults.length} {searchResults.length === 1 ? 'result' : 'results'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main content area */}
      <div className="flex-1" style={{ paddingTop: searchResults.length > 0 ? '200px' : '140px' }}>
        <div className="h-full">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 pt-8">
              <LegalLoader isLoading={isLoading} />
            </div>
          ) : searchResults.length > 0 ? (
            /* Scrollable Results Container */
            <div className="h-full overflow-y-auto results-scroll pb-6">
              <div className="max-w-4xl mx-auto px-4 space-y-3">
                {searchResults.map((file) => (
                  <TooltipProvider key={file.id} delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Card
                          className={cn(
                            "cursor-pointer transition-all hover:border-green-200 hover:bg-green-50/50 border-slate-200/80 bg-white/95 backdrop-blur-sm group overflow-hidden",
                            "hover:shadow-lg hover:shadow-green-100/50 hover:-translate-y-0.5"
                          )}
                          onClick={(e) => {
                            // Don't navigate if clicking on summary expand button
                            if (e.target.closest('.summary-expand-btn')) {
                              e.stopPropagation();
                              return;
                            }
                            handleFileClick(file);
                          }}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 bg-green-50 p-2.5 rounded-lg group-hover:bg-green-100 transition-colors">
                                <FileText className="h-5 w-5 text-green-700" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-3 mb-2">
                                  <div className="flex-1">
                                    <p className="font-heading text-sm font-semibold text-slate-900 line-clamp-2 leading-tight mb-1">
                                      {file.file_title || file.file_name}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      PDF • {file.file_size ? `${(file.file_size / 1024).toFixed(1)} KB` : 'Unknown size'}
                                    </p>
                                  </div>
                                  <div className="bg-slate-100/80 rounded-full p-2 group-hover:bg-green-100 transition-all group-hover:scale-110">
                                    <ArrowUpRight className="h-4 w-4 text-slate-500 group-hover:text-green-700 transition-colors" />
                                  </div>
                                </div>

                                {/* AI Summary Section */}
                                {file.summaries && file.summaries.length > 0 && file.summaries.some(s => s?.content?.trim()) && (
                                  <div className="mt-3 pt-3 border-t border-slate-100">
                                    <div className="flex items-center gap-2 mb-3">
                                      <div className="flex items-center gap-1.5 bg-gradient-to-r from-purple-50 to-blue-50 px-2.5 py-1.5 rounded-full border border-purple-100/80 shadow-sm">
                                        <Bot className="h-3.5 w-3.5 text-purple-600" />
                                        <span className="text-xs font-semibold text-purple-700 tracking-wide">AI Summary</span>
                                      </div>
                                      {file.summaries.length > 1 && (
                                        <Badge variant="outline" className="text-xs bg-slate-50 text-slate-600 border-slate-200 font-medium">
                                          {file.summaries.length} models
                                        </Badge>
                                      )}
                                    </div>
                                    
                                    <div className="space-y-3">
                                      {file.summaries
                                        .filter(summary => summary?.content?.trim()) // Filter out empty summaries
                                        .slice(0, expandedSummaries.has(file.id) ? file.summaries.length : 1)
                                        .map((summary, idx) => (
                                          <div key={idx} className="bg-gradient-to-r from-slate-50/90 to-purple-50/50 rounded-xl p-4 border border-slate-100/80 shadow-sm hover:shadow-md transition-all duration-200">
                                            <div className="flex items-center gap-2 mb-2">
                                              <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                                              <span className="text-xs font-semibold text-slate-700 capitalize tracking-wide">
                                                {summary.model || 'AI Model'}
                                              </span>
                                            </div>
                                            <div className="prose prose-slate prose-sm max-w-none">
                                              <p className="text-sm text-slate-700 leading-relaxed font-medium mb-0 line-height-loose">
                                                {expandedSummaries.has(file.id) 
                                                  ? summary.content 
                                                  : truncateText(summary.content, 120)
                                                }
                                              </p>
                                            </div>
                                          </div>
                                        ))}
                                      
                                      {/* Action Buttons */}
                                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100/60">
                                        {/* Expand/Collapse Button */}
                                        {(() => {
                                          const validSummaries = file.summaries.filter(s => s?.content?.trim());
                                          return (validSummaries.length > 1 || validSummaries[0]?.content.length > 120) ? (
                                            <button
                                              className="summary-expand-btn flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-700 font-semibold transition-colors hover:bg-purple-50 px-2 py-1 rounded-md"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                toggleSummaryExpansion(file.id);
                                              }}
                                            >
                                              {expandedSummaries.has(file.id) ? (
                                                <>
                                                  <ChevronUp className="h-3.5 w-3.5" />
                                                  <span>Show less</span>
                                                </>
                                              ) : (
                                                <>
                                                  <ChevronDown className="h-3.5 w-3.5" />
                                                  <span>
                                                    {validSummaries.length > 1 
                                                      ? `Show all ${validSummaries.length} summaries` 
                                                      : 'Show more'
                                                    }
                                                  </span>
                                                </>
                                              )}
                                            </button>
                                          ) : <div></div>;
                                        })()}
                                        
                                        {/* View Full Summaries Button */}
                                        <button
                                          className="summary-expand-btn flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-700 font-semibold transition-all bg-gradient-to-r from-purple-50 to-blue-50 hover:from-purple-100 hover:to-blue-100 px-3 py-2 rounded-lg border border-purple-200/60 shadow-sm hover:shadow-md hover:-translate-y-0.5"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            navigate(`/search/file/${file.id}?view=summary`, {
                                              state: {
                                                searchResults: searchResults,
                                                searchQuery: searchQuery
                                              }
                                            });
                                          }}
                                        >
                                          <Bot className="h-3.5 w-3.5" />
                                          <span>View full summaries</span>
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="p-2 bg-slate-900 text-white max-w-md">
                        <p className="text-sm font-medium">{file.file_title || file.file_name}</p>
                        <p className="text-xs opacity-80">
                          Click to view full document
                          {file.summaries && file.summaries.length > 0 && " • AI summaries available"}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </div>
            </div>
          ) : searchQuery ? (
            <div className="flex flex-col items-center justify-center h-64 text-center pt-8">
              <div className="text-slate-300 mb-4">
                <Search className="h-12 w-12" />
              </div>
              <p className="font-heading text-xl text-slate-600 mb-2">No cases found</p>
              <p className="text-sm text-slate-500 mb-6 max-w-md">
                We couldn't find any cases matching "<span className="font-medium text-slate-700">{searchQuery}</span>"
              </p>
              <Button
                variant="outline"
                className="text-green-700 font-medium border-green-200 hover:bg-green-50 bg-white/80"
                onClick={() => setShowSuggestions(true)}
              >
                Try a different search
              </Button>
            </div>
          ) : showSuggestions && !searchQuery ? (
            <div className="pt-8 pb-6">
              <div className="max-w-4xl mx-auto px-4">
                <div className="flex flex-col items-center text-center gap-4 mb-8">
                  <div className="bg-white/60 p-4 rounded-full border border-slate-200/80">
                    <Scale className="h-8 w-8 text-green-700" />
                  </div>
                  <div>
                    <h1 className="font-heading text-2xl font-bold text-slate-800 mb-2">
                      Legal Case Search
                    </h1>
                    <p className="text-sm text-slate-600 max-w-lg">
                      Search through judgments from South African courts, including Constitutional Court,
                      Supreme Court of Appeal, and High Courts.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 justify-center mb-8">
                  <Badge variant="outline" className="bg-white/80 hover:bg-green-50 cursor-pointer text-slate-700 hover:text-green-800 border-slate-200/80 backdrop-blur-sm">Constitutional cases</Badge>
                  <Badge variant="outline" className="bg-white/80 hover:bg-green-50 cursor-pointer text-slate-700 hover:text-green-800 border-slate-200/80 backdrop-blur-sm">Human rights</Badge>
                  <Badge variant="outline" className="bg-white/80 hover:bg-green-50 cursor-pointer text-slate-700 hover:text-green-800 border-slate-200/80 backdrop-blur-sm">Property law</Badge>
                  <Badge variant="outline" className="bg-white/80 hover:bg-green-50 cursor-pointer text-slate-700 hover:text-green-800 border-slate-200/80 backdrop-blur-sm">Contract law</Badge>
                  <Badge variant="outline" className="bg-white/80 hover:bg-green-50 cursor-pointer text-slate-700 hover:text-green-800 border-slate-200/80 backdrop-blur-sm">Criminal procedure</Badge>
                </div>
                
                <div className="grid grid-cols-1 gap-8">
                  {suggestedSearches.map((category, idx) => (
                    <div key={idx} className="bg-white/40 backdrop-blur-sm rounded-xl p-6 border border-slate-200/60">
                      <h3 className="font-heading text-lg font-semibold text-slate-800 tracking-wide mb-4 pb-2 border-b border-slate-200/80">
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
                                        hover:bg-green-50/80 hover:text-green-900 hover:border-green-200
                                        transition-all duration-200 border-slate-200/80 bg-white/60 backdrop-blur-sm whitespace-normal
                                        hover:shadow-md hover:-translate-y-0.5"
                                  onClick={() => handleSuggestionClick(suggestion)}
                                >
                                  <div className="flex items-start gap-3 w-full">
                                    <Scale className="h-4 w-4 text-green-700 mt-1 flex-shrink-0" />
                                    <span className="leading-relaxed font-medium">{suggestion}</span>
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
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
} 