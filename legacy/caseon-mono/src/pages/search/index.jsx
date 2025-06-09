import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Loader2, Scale, ArrowUpRight, FileText, Send, AlertCircle, Sparkles, ChevronDown, ChevronUp, Bot, Settings } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import SearchInput from "./search-input";
import LegalLoader from "./legal-loader";
import MarkdownRenderer from "@/components/markdown-renderer";
import { suggestedSearches } from "./constants";
import { supabase } from "@/services/supabase-client";
import InviteDialog from "@/components/invite-dialog";

export default function SearchPage() {
  const { user, refreshToken, activeFirm } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Add ref for header height measurement
  const headerRef = useRef(null);
  const [headerHeight, setHeaderHeight] = useState(120);
  
  const [searchQuery, setSearchQuery] = useState(() => {
    // Initialize from URL params first, then fallback to session storage or location state
    const urlQuery = searchParams.get('q');
    if (urlQuery) return urlQuery;
    return sessionStorage.getItem('searchQuery') || location.state?.searchQuery || "";
  });
  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState(() => {
    // Initialize from session storage or location state
    const storedResults = sessionStorage.getItem('searchResults');
    return storedResults ? JSON.parse(storedResults) : location.state?.searchResults || [];
  });
  const [showSuggestions, setShowSuggestions] = useState(() => {
    // Show suggestions if no search results and no URL query
    const urlQuery = searchParams.get('q');
    return !urlQuery && !(sessionStorage.getItem('searchResults') || location.state?.searchResults);
  });
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef(null);
  
  // Add state for search cancellation
  const [searchController, setSearchController] = useState(null);
  
  // Add state to track if a search has been performed
  const [hasSearched, setHasSearched] = useState(() => {
    // Initialize based on whether we have results from session storage or location state
    const storedResults = sessionStorage.getItem('searchResults');
    const hasStoredResults = storedResults ? JSON.parse(storedResults).length > 0 : false;
    const hasLocationResults = location.state?.searchResults?.length > 0;
    return hasStoredResults || hasLocationResults;
  });
  
  // Add state for usage limits dialog
  const [showLimitDialog, setShowLimitDialog] = useState(false);
  const [limitErrorMessage, setLimitErrorMessage] = useState("");
  const [usageDetails, setUsageDetails] = useState(null);

  // Add state for invite dialog
  const [showInviteDialog, setShowInviteDialog] = useState(false);

  // Add state for expanded summaries
  const [expandedSummaries, setExpandedSummaries] = useState(new Set());

  // Add state for search settings
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [scoreThreshold, setScoreThreshold] = useState(() => {
    const stored = localStorage.getItem('searchSettings');
    return stored ? JSON.parse(stored).scoreThreshold : 0.70;
  });
  const [searchLimit, setSearchLimit] = useState(() => {
    const stored = localStorage.getItem('searchSettings');
    return stored ? JSON.parse(stored).searchLimit : 50;
  });

  // Save search settings to localStorage whenever they change
  useEffect(() => {
    const settings = { scoreThreshold, searchLimit };
    localStorage.setItem('searchSettings', JSON.stringify(settings));
  }, [scoreThreshold, searchLimit]);

  // Simple function to update search query without updating URL
  const updateSearchQuery = useCallback((newQuery) => {
    setSearchQuery(newQuery);
    // URL will only be updated when search is actually performed
  }, []);

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
      // Only show suggestions if no search has been performed
      if (!hasSearched) {
        setShowSuggestions(true);
      }
    }
  }, [searchResults, hasSearched]);

  // Clear search state
  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResults([]);
    setShowSuggestions(true);
    sessionStorage.removeItem('searchQuery');
    sessionStorage.removeItem('searchResults');
    // Clear URL parameters immediately when clearing
    setSearchParams({}, { replace: true });
    
    // Reset textarea height and focus
    if (textareaRef.current) {
      textareaRef.current.style.height = '52px';
      // Return focus to textarea after clearing
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
    setHasSearched(false);
  }, [setSearchParams]);

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
    console.log('handleSearch called with:', { queryOverride, searchQuery });
    const query = queryOverride || searchQuery;
    console.log('Query to search:', query);
    if (!query.trim()) {
      console.log('No query provided, returning early');
      return;
    }
    
    console.log('Starting search process...');
    
    // Update the search query if we're using an override
    if (queryOverride) {
      setSearchQuery(queryOverride);
    }
    
    // Don't update URL here - wait until search is successful
    
    // Cancel any existing search
    if (searchController) {
      searchController.abort();
    }
    
    // Create new AbortController for this search
    const controller = new AbortController();
    setSearchController(controller);
    
    setIsLoading(true);
    setShowSuggestions(false);
    setHasSearched(true);
    
    try {
      // Get firm_id from activeFirm in auth context
      const firmId = activeFirm?.id;
      
      // Use Supabase functions.invoke() which handles authentication automatically
      const { data, error } = await supabase.functions.invoke('search', {
        body: {
          query: query,
          limit: searchLimit,
          score_threshold: scoreThreshold,
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
      
      // Update URL only after successful search
      setSearchParams({ q: query }, { replace: true });
      
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
  const truncateText = (text, maxLength = 200) => {
    if (!text || text.length <= maxLength) return text;
    
    // Find the last space before the max length to avoid cutting words
    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastSpace > maxLength * 0.8) { // Only use space if it's not too far back
      return text.substring(0, lastSpace) + '…';
    }
    
    return truncated + '…';
  };

  // Function to format model name
  const formatModelName = (modelName) => {
    if (!modelName) return 'AI Model';
    
    // Handle Gemini models
    if (modelName.toLowerCase().includes('gemini')) {
      return 'Gemini';
    }
    
    // Handle other common model patterns
    if (modelName.toLowerCase().includes('gpt')) {
      return 'GPT';
    }
    
    if (modelName.toLowerCase().includes('claude')) {
      return 'Claude';
    }
    
    // For other models, take first word and capitalize
    return modelName.split('-')[0].split('_')[0].charAt(0).toUpperCase() + modelName.split('-')[0].split('_')[0].slice(1);
  };

  // Add useEffect to measure header height dynamically
  useEffect(() => {
    const measureHeaderHeight = () => {
      if (headerRef.current) {
        const height = headerRef.current.offsetHeight;
        setHeaderHeight(height);
      }
    };

    // Measure on mount and when search query changes
    measureHeaderHeight();
    
    // Use ResizeObserver to watch for header size changes
    const resizeObserver = new ResizeObserver(measureHeaderHeight);
    if (headerRef.current) {
      resizeObserver.observe(headerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [searchQuery, searchResults.length]);

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-slate-50 to-slate-100">
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

      {/* Search Settings Dialog */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent className="sm:max-w-lg max-w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-4">
            <DialogTitle className="flex items-center gap-3 text-lg sm:text-xl">
              <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-slate-100 to-slate-200 rounded-xl">
                <Settings className="h-4 w-4 sm:h-5 sm:w-5 text-slate-700" />
              </div>
              <div>
                <span className="font-heading">Search Configuration</span>
                <p className="text-xs sm:text-sm font-normal text-slate-600 mt-1">
                  Customize search parameters for optimal legal research
                </p>
              </div>
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 sm:space-y-8 py-2">
            {/* Sensitivity Setting */}
            <div className="space-y-3 sm:space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1 flex-1">
                  <Label className="text-sm sm:text-base font-semibold text-slate-800">
                    Search Sensitivity
                  </Label>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    Controls how closely search results must match your query. Higher sensitivity returns fewer, more precise matches.
                  </p>
                </div>
                <div className="flex flex-col items-center bg-gradient-to-br from-green-50 to-blue-50 rounded-xl px-3 py-2 sm:px-4 sm:py-3 border border-slate-200">
                  <span className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent">
                    {Math.round(scoreThreshold * 100)}%
                  </span>
                  <span className="text-xs text-slate-500 font-medium">sensitivity</span>
                </div>
              </div>
              
              <div className="px-1">
                <Slider
                  value={[scoreThreshold]}
                  onValueChange={(value) => setScoreThreshold(value[0])}
                  max={1.0}
                  min={0.1}
                  step={0.05}
                  className="w-full"
                />
                <div className="flex justify-between mt-3 text-xs">
                  <div className="text-center">
                    <div className="font-medium text-slate-700">10%</div>
                    <div className="text-slate-500">Broad</div>
                    <div className="text-slate-400 text-[10px] mt-0.5 hidden sm:block">More cases, less precise</div>
                  </div>
                  <div className="text-center">
                    <div className="font-medium text-slate-700">70%</div>
                    <div className="text-slate-500">Default</div>
                    <div className="text-slate-400 text-[10px] mt-0.5 hidden sm:block">Recommended</div>
                  </div>
                  <div className="text-center">
                    <div className="font-medium text-slate-700">90%</div>
                    <div className="text-slate-500">Precise</div>
                    <div className="text-slate-400 text-[10px] mt-0.5 hidden sm:block">Fewer cases, highly relevant</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Document Limit Setting */}
            <div className="space-y-3 sm:space-y-4">
              <div className="space-y-1">
                <Label className="text-sm sm:text-base font-semibold text-slate-800">
                  Number of Documents
                </Label>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Maximum number of legal documents to return per search. More documents provide broader coverage but may take longer to review.
                </p>
              </div>
              
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
                <div className="flex-1">
                  <Input
                    type="number"
                    value={searchLimit}
                    onChange={(e) => {
                      const value = parseInt(e.target.value);
                      if (value >= 1 && value <= 200) {
                        setSearchLimit(value);
                      }
                    }}
                    min={1}
                    max={200}
                    className="text-sm sm:text-base font-medium text-center h-10 sm:h-12"
                  />
                </div>
                <div className="text-center sm:text-right">
                  <div className="text-xs sm:text-sm text-slate-600">
                    <span className="font-medium">Range:</span> 1-200 documents
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {searchLimit <= 25 ? "Quick review" : 
                     searchLimit <= 70 ? "Standard research" : 
                     "Comprehensive analysis"}
                  </div>
                </div>
              </div>
            </div>

            {/* Current Configuration Summary */}
            <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-3 sm:p-4 border border-slate-200">
              <h4 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                Current Configuration
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-sm">
                <div className="space-y-1">
                  <div className="text-slate-600">Search Sensitivity</div>
                  <div className="font-semibold text-slate-800">
                    {Math.round(scoreThreshold * 100)}%
                    <span className="text-xs font-normal text-slate-500 ml-1">
                      ({scoreThreshold <= 0.3 ? "Broad" : scoreThreshold <= 0.7 ? "Balanced" : "Precise"})
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-slate-600">Document Limit</div>
                  <div className="font-semibold text-slate-800">
                    {searchLimit} documents
                  </div>
                </div>
              </div>
              
              <div className="mt-3 pt-3 border-t border-slate-200">
                <div className="text-xs text-slate-600 leading-relaxed">
                  <strong>Expected results:</strong> Your searches will return up to {searchLimit} documents 
                  with {Math.round(scoreThreshold * 100)}% relevance matching, providing 
                  {scoreThreshold <= 0.3 ? " comprehensive coverage with varied relevance" : 
                   scoreThreshold <= 0.7 ? " balanced results with good relevance" : 
                   " highly targeted results with strong relevance"}.
                </div>
              </div>
            </div>
          </div>
          
          <DialogFooter className="gap-2 sm:gap-3 pt-4 flex-col sm:flex-row">
            <Button
              variant="outline"
              onClick={() => {
                // Reset to defaults (70% sensitivity, 50 documents)
                setScoreThreshold(0.70);
                setSearchLimit(50);
              }}
              className="w-full sm:w-auto order-2 sm:order-1"
            >
              Reset Defaults
            </Button>
            <Button
              onClick={() => setShowSettingsDialog(false)}
              className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white w-full sm:w-auto shadow-md hover:shadow-lg transition-all order-1 sm:order-2"
            >
              Apply Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fixed search header area */}
      <div className="fixed top-16 left-0 right-0 z-10 bg-slate-50/95 backdrop-blur-sm" ref={headerRef}>
        {/* Search Input */}
        <SearchInput
          searchQuery={searchQuery}
          setSearchQuery={updateSearchQuery}
          handleSearch={handleSearch}
          isFocused={isFocused}
          setIsFocused={setIsFocused}
          textareaRef={textareaRef}
          isLoading={isLoading}
          adjustTextareaHeight={adjustTextareaHeight}
          toast={toast}
          onInviteClick={() => setShowInviteDialog(true)}
          onSettingsClick={() => setShowSettingsDialog(true)}
          clearSearch={clearSearch}
          cancelSearch={cancelSearch}
          canCancel={!!searchController}
          scoreThreshold={scoreThreshold}
          searchLimit={searchLimit}
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
      <div className="flex-1" style={{ paddingTop: `${headerHeight}px` }}>
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
                            // Don't toggle if clicking on summary expand button or arrow
                            if (e.target.closest('.summary-expand-btn') || e.target.closest('.document-nav-btn')) {
                              e.stopPropagation();
                              return;
                            }
                            // Always navigate to document when clicking card
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
                                  <div className="flex items-center gap-2">
                                    {/* AI Summary Toggle Button */}
                                    {file.summaries && file.summaries.length > 0 && file.summaries.some(s => s?.content?.trim()) && (
                                      <button
                                        className={cn(
                                          "summary-expand-btn flex items-center justify-center w-8 h-8 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full hover:from-purple-600 hover:to-blue-600 transition-all duration-300 hover:scale-110 hover:shadow-md",
                                          "active:scale-95 active:shadow-lg",
                                          expandedSummaries.has(file.id) && "ring-2 ring-purple-300 ring-offset-2 shadow-lg scale-105"
                                        )}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          // Add a small delay for the click animation
                                          const button = e.currentTarget;
                                          button.style.transform = 'scale(0.9)';
                                          setTimeout(() => {
                                            button.style.transform = '';
                                            toggleSummaryExpansion(file.id);
                                          }, 150);
                                        }}
                                        title="AI summary"
                                      >
                                        <Sparkles className={cn(
                                          "h-3 w-3 text-white transition-transform duration-300",
                                          expandedSummaries.has(file.id) && "rotate-180"
                                        )} />
                                      </button>
                                    )}
                                    {/* View Document Button */}
                                    <button
                                      className="document-nav-btn bg-slate-100/80 rounded-full p-2 group-hover:bg-green-100 transition-all group-hover:scale-110 hover:shadow-md"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleFileClick(file);
                                      }}
                                      title="View full document"
                                    >
                                      <ArrowUpRight className="h-4 w-4 text-slate-500 group-hover:text-green-700 transition-colors" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* AI Summary Section - Full width on mobile */}
                            {file.summaries && file.summaries.length > 0 && file.summaries.some(s => s?.content?.trim()) && expandedSummaries.has(file.id) && (
                              <div className="mt-0 pt-0 border-t border-slate-100 animate-in slide-in-from-top-2 duration-300 fade-in">
                                <div className="flex items-center justify-between mb-2">
                                  {file.summaries.length > 1 && (
                                    <Badge variant="outline" className="text-xs bg-gradient-to-r from-purple-50 to-blue-50 text-purple-700 border-purple-200 font-medium animate-in fade-in duration-300 delay-75">
                                      {file.summaries.length} models
                                    </Badge>
                                  )}
                                </div>
                                
                                <div className="space-y-4 sm:space-y-5">
                                  {file.summaries
                                    .filter(summary => summary?.content?.trim()) // Filter out empty summaries
                                    .map((summary, idx) => (
                                      <div 
                                        key={idx} 
                                        className="bg-gradient-to-br from-slate-50/90 via-purple-50/30 to-blue-50/40 rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-slate-100/80 shadow-sm hover:shadow-lg transition-all duration-300 backdrop-blur-sm w-full animate-in slide-in-from-bottom-3 fade-in duration-300"
                                        style={{ animationDelay: `${idx * 75 + 200}ms` }}
                                      >
                                        <div className="rounded-lg sm:rounded-xl">
                                          <MarkdownRenderer
                                            content={summary.content}
                                            compact={false}
                                            className="leading-relaxed text-xs sm:text-sm w-full"
                                          />
                                        </div>
                                      </div>
                                    ))}
                                </div>
                              </div>
                            )}
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
          ) : searchQuery && hasSearched ? (
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
          ) : showSuggestions || (!hasSearched && searchQuery) ? (
            <div className="pt-2 sm:pt-4 pb-6">
              <div className="max-w-4xl mx-auto px-4">
                <div className="flex flex-col items-center text-center gap-1 sm:gap-2 mb-4 sm:mb-8">
                  <div className="bg-white/60 p-3 sm:p-4 rounded-full border border-slate-200/80">
                    <Scale className="h-6 w-6 sm:h-8 sm:w-8 text-green-700" />
                  </div>
                  <div>
                    <h1 className="font-heading text-xl sm:text-2xl font-bold text-slate-800 mb-1 sm:mb-2">
                      Legal Case Search
                    </h1>
                    <p className="text-sm text-slate-600 max-w-lg">
                      Search through judgments from South African courts, including Constitutional Court,
                      Supreme Court of Appeal, and High Courts.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 justify-center mb-6 sm:mb-8">
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