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
import UsageLimitDialog from "./usage-limit-dialog";
import SearchSettingsDialog from "./search-settings-dialog";
import SearchResultCard from "./search-result-card";
import SearchWelcome from "./search-welcome";
import SearchEmptyState from "./search-empty-state";

// Custom hook
import { useSearchState } from "./use-search-state";

export default function SearchPage() {
  const { user, refreshToken, activeFirm } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Use custom hook for search state management
  const searchState = useSearchState();
  
  // Add ref for header height measurement
  const headerRef = useRef(null);
  const [headerHeight, setHeaderHeight] = useState(120);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef(null);
  
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

  // Restore search state if auth context resets during search
  useEffect(() => {
    const activeSearchState = localStorage.getItem('activeSearchState');
    if (activeSearchState && !searchState.hasSearched && !searchState.searchQuery && searchState.searchResults.length === 0) {
      try {
        const state = JSON.parse(activeSearchState);
        console.log('Restoring search state after auth reset:', state);
        searchState.setSearchQuery(state.query);
        searchState.setHasSearched(state.hasSearched);
        searchState.setShowSuggestions(state.showSuggestions);
      } catch (error) {
        console.error('Error restoring search state:', error);
        localStorage.removeItem('activeSearchState');
      }
    }
  }, [user, activeFirm]);

  // Auto-scroll to bottom when results change
  useEffect(() => {
    if (searchState.searchResults.length > 0) {
      const resultsContainer = document.getElementById('search-results');
      if (resultsContainer) {
        resultsContainer.scrollTop = resultsContainer.scrollHeight;
      }
    }
  }, [searchState.searchResults]);

  // Add auto-resize functionality for textarea
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`; // Max height of 200px
    }
  };

  const handleSearch = async (queryOverride = null, skipSettingsReset = false) => {
    console.log('handleSearch called with:', { queryOverride, searchQuery: searchState.searchQuery, skipSettingsReset });
    const query = queryOverride || searchState.searchQuery;
    console.log('Query to search:', query);
    if (!query.trim()) {
      console.log('No query provided, returning early');
      return;
    }
    
    console.log('Starting search process...');
    
    // Only reset search settings to defaults when starting a completely new search query
    // Don't reset if user is adjusting settings and re-searching, or if this is a suggestion click with same query
    const isNewQuery = queryOverride && queryOverride !== searchState.searchQuery;
    const shouldResetSettings = !skipSettingsReset && isNewQuery;
    
    if (shouldResetSettings) {
      searchState.setScoreThreshold(0.75);
      searchState.setSearchLimit(50);
    }
    
    // Update the search query if we're using an override
    if (queryOverride) {
      searchState.setSearchQuery(queryOverride);
    }
    
    // Preserve current search state before starting
    const currentSearchState = {
      query: query,
      hasSearched: true,
      showSuggestions: false
    };
    
    // Cancel any existing search
    if (searchState.searchController) {
      searchState.searchController.abort();
    }
    
    // Create new AbortController for this search
    const controller = new AbortController();
    searchState.setSearchController(controller);
    
    // Set search state with explicit preservation
    searchState.setIsLoading(true);
    searchState.setShowSuggestions(false);
    searchState.setHasSearched(true);
    
    // Store search state in localStorage as backup
    localStorage.setItem('activeSearchState', JSON.stringify(currentSearchState));
    
    try {
      // Get firm_id from activeFirm in auth context
      const firmId = activeFirm?.id;
      
      console.log('Making search request with:', {
        query,
        limit: searchState.searchLimit,
        score_threshold: searchState.scoreThreshold,
        firm_id: firmId
      });
      
      // Use Supabase functions.invoke() which handles authentication automatically
      const { data, error } = await supabase.functions.invoke('search', {
        body: {
          query: query,
          limit: searchState.searchLimit,
          score_threshold: searchState.scoreThreshold,
          firm_id: firmId
        }
      });
      
      console.log('Search response received:', { data, error });
      
      // Check if the search was cancelled
      if (controller.signal.aborted) {
        console.log('Search was aborted');
        return;
      }
      
      if (error) {
        console.error('Search error:', error);
        
        // Clean up state before handling errors
        searchState.setIsLoading(false);
        searchState.setSearchController(null);
        
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
        
        // Handle other errors - but preserve search state
        toast({
          title: "Search failed",
          description: error.message || "Unable to perform search. Please try again.",
          variant: "destructive"
        });
        searchState.setSearchResults([]);
        searchState.setHasSearched(true);
        searchState.setShowSuggestions(false);
        return;
      }
      
      // Check if this is a billing limit response
      if (data && data.billing_limit_reached) {
        console.log('Billing limit reached:', data);
        setLimitErrorMessage(data.error || "You've reached your usage limit for this plan.");
        if (data.usage) {
          setUsageDetails(data.usage);
        }
        setShowLimitDialog(true);
        // Clean up state but preserve search state
        searchState.setIsLoading(false);
        searchState.setSearchController(null);
        searchState.setHasSearched(true);
        searchState.setShowSuggestions(false);
        return;
      }
      
      // Set search results and clean up state
      const results = data?.results || [];
      console.log('Setting search results:', results.length, 'results');
      searchState.setSearchResults(results);
      searchState.setIsLoading(false);
      searchState.setSearchController(null);
      
      // Explicitly maintain search state
      searchState.setHasSearched(true);
      searchState.setShowSuggestions(false);
      
      // Update URL only after successful search
      searchState.setSearchParams({ q: query }, { replace: true });
      
      // Clear backup search state on success
      localStorage.removeItem('activeSearchState');
      
    } catch (error) {
      console.error('Search error details:', error);
      
      // Don't show error toast if the request was aborted (cancelled)
      if (error.name === 'AbortError' || controller.signal.aborted) {
        console.log('Search was cancelled');
        searchState.setIsLoading(false);
        searchState.setSearchController(null); 
        return;
      }
      
      // Clean up state before showing error
      searchState.setIsLoading(false);
      searchState.setSearchController(null);
      
      toast({
        title: "Search failed",
        description: error.message || "Unable to perform search. Please try again.",
        variant: "destructive"
      });
      searchState.setSearchResults([]);
      searchState.setHasSearched(true);
      searchState.setShowSuggestions(false);
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
        searchResults: searchState.searchResults,
        searchQuery: searchState.searchQuery
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

    measureHeaderHeight();
    
    const resizeObserver = new ResizeObserver(measureHeaderHeight);
    if (headerRef.current) {
      resizeObserver.observe(headerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [searchState.searchQuery, searchState.searchResults.length]);

  // Clear search and return focus to textarea
  const clearSearchWithFocus = useCallback(() => {
    searchState.clearSearch();
    // Reset search settings to defaults
    searchState.setScoreThreshold(0.75);
    searchState.setSearchLimit(50);
    if (textareaRef.current) {
      textareaRef.current.style.height = '52px';
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [searchState]);

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-slate-50 to-slate-100">
      {/* Add global font styles */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap');
        body { font-family: 'Inter', system-ui, sans-serif; }
        .font-heading { font-family: 'Crimson Pro', Georgia, serif; }
        .expandable-textarea { transition: height 0.2s ease; }
        .multi-line-input { white-space: pre-wrap; word-break: break-word; line-height: 1.5; }
        .textarea-container.multi-line { border-radius: 16px; }
        .textarea-container.multi-line textarea { border-radius: 14px; padding-bottom: 12px; }
        .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .results-scroll::-webkit-scrollbar { width: 6px; }
        .results-scroll::-webkit-scrollbar-track { background: rgb(241 245 249); border-radius: 3px; }
        .results-scroll::-webkit-scrollbar-thumb { background: rgb(203 213 225); border-radius: 3px; }
        .results-scroll::-webkit-scrollbar-thumb:hover { background: rgb(148 163 184); }
      `}</style>

      {/* Usage Limit Dialog */}
      <UsageLimitDialog
        open={showLimitDialog}
        onOpenChange={setShowLimitDialog}
        limitErrorMessage={limitErrorMessage}
        usageDetails={usageDetails}
      />

      {/* Invite Dialog */}
      <InviteDialog
        open={showInviteDialog}
        onOpenChange={setShowInviteDialog}
      />

      {/* Search Settings Dialog */}
      <SearchSettingsDialog
        open={showSettingsDialog}
        onOpenChange={setShowSettingsDialog}
        scoreThreshold={searchState.scoreThreshold}
        setScoreThreshold={searchState.setScoreThreshold}
        searchLimit={searchState.searchLimit}
        setSearchLimit={searchState.setSearchLimit}
      />

      {/* Fixed search header area */}
      <div className="fixed top-16 left-0 right-0 z-10 bg-slate-50/95 backdrop-blur-sm" ref={headerRef}>
        {/* Search Input */}
        <SearchInput
          searchQuery={searchState.searchQuery}
          setSearchQuery={searchState.setSearchQuery}
          handleSearch={handleSearch}
          isFocused={isFocused}
          setIsFocused={setIsFocused}
          textareaRef={textareaRef}
          isLoading={searchState.isLoading}
          adjustTextareaHeight={adjustTextareaHeight}
          toast={toast}
          onInviteClick={() => setShowInviteDialog(true)}
          onSettingsClick={() => setShowSettingsDialog(true)}
          clearSearch={clearSearchWithFocus}
          cancelSearch={searchState.cancelSearch}
          canCancel={!!searchState.searchController}
          scoreThreshold={searchState.scoreThreshold}
          searchLimit={searchState.searchLimit}
        />
        
        {/* Fixed Results Header */}
        {searchState.searchResults.length > 0 && (
          <div className="px-4 pb-3 pt-1">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between">
                <h2 className="font-heading text-lg font-semibold text-slate-800">
                  Search Results
                </h2>
                <span className="text-sm text-slate-500 bg-white/60 px-3 py-1 rounded-full border border-slate-200/80">
                  {searchState.searchResults.length} {searchState.searchResults.length === 1 ? 'result' : 'results'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main content area */}
      <div className="flex-1" style={{ paddingTop: `${headerHeight}px` }}>
        <div className="h-full">
          {searchState.isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 pt-8">
              <LegalLoader isLoading={searchState.isLoading} />
            </div>
          ) : searchState.searchResults.length > 0 ? (
            /* Scrollable Results Container */
            <div className="h-full overflow-y-auto results-scroll pb-6" id="search-results">
              <div className="max-w-4xl mx-auto px-4 space-y-3">
                {searchState.searchResults.map((file) => (
                  <SearchResultCard
                    key={file.id}
                    file={file}
                    expandedSummaries={expandedSummaries}
                    onToggleSummary={toggleSummaryExpansion}
                    onFileClick={handleFileClick}
                  />
                ))}
              </div>
            </div>
          ) : searchState.searchQuery && searchState.hasSearched ? (
            <SearchEmptyState
              searchQuery={searchState.searchQuery}
              scoreThreshold={searchState.scoreThreshold}
              onReduceSensitivity={(newThreshold) => {
                searchState.setScoreThreshold(newThreshold);
                searchState.setShowSuggestions(false);
                searchState.setHasSearched(true);
                setTimeout(() => handleSearch(null, true), 100);
              }}
              onTryDifferentSearch={() => searchState.setShowSuggestions(true)}
              toast={toast}
            />
          ) : searchState.showSuggestions || (!searchState.hasSearched && searchState.searchQuery) ? (
            <SearchWelcome onSuggestionClick={handleSuggestionClick} />
          ) : (
            <SearchEmptyState
              searchQuery={searchState.searchQuery}
              scoreThreshold={searchState.scoreThreshold}
              onReduceSensitivity={(newThreshold) => {
                searchState.setScoreThreshold(newThreshold);
                searchState.setShowSuggestions(false);
                searchState.setHasSearched(true);
                setTimeout(() => handleSearch(null, true), 100);
              }}
              onTryDifferentSearch={() => searchState.setShowSuggestions(true)}
              toast={toast}
            />
          )}
        </div>
      </div>
    </div>
  );
} 