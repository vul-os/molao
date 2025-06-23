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
import { Label } from "@/components/ui/label";
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

  // No need for complex state restoration - the hook handles it

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

  const handleSearch = async (queryOverride = null) => {
    const query = queryOverride || searchState.searchQuery;
    console.log('🔍 Starting search for:', query);
    
    if (!query.trim()) {
      console.log('No query provided, returning early');
      return;
    }
    
    // Update the search query if we're using an override
    if (queryOverride) {
      searchState.setSearchQuery(queryOverride);
    }
    
    // Cancel any existing operations
    if (searchState.searchController) {
      searchState.searchController.abort();
    }
    
    // Create new AbortController for this entire search+rerank operation
    const controller = new AbortController();
    searchState.setSearchController(controller);
    
    // Set initial search state
    searchState.setIsLoading(true);
    searchState.setHasSearched(true);
    searchState.setIsReranking(false); // Reset reranking state
    
    try {
      const firmId = activeFirm?.id;
      
      if (!firmId) {
        throw new Error('No active firm found. Please select a firm.');
      }
      
      console.log('🔍 Making search request...');
      
      const searchResponse = await supabase.functions.invoke('search', {
        body: {
          query: query,
          firm_id: firmId
        }
      });
      
      console.log('🔍 Search response received:', { data: searchResponse.data, error: searchResponse.error });
      
      // Check if the operation was cancelled
      if (controller.signal.aborted) {
        console.log('Search was aborted');
        return;
      }
      
      if (searchResponse.error) {
        console.error('Search error:', searchResponse.error);
        throw new Error(searchResponse.error.message || 'Search failed');
      }
      
      // Handle billing limit
      if (searchResponse.data?.billing_limit_reached) {
        console.log('Billing limit reached:', searchResponse.data);
        setLimitErrorMessage(searchResponse.data.error || "You've reached your usage limit for this plan.");
        if (searchResponse.data.usage) {
          setUsageDetails(searchResponse.data.usage);
        }
        setShowLimitDialog(true);
        
        searchState.setIsLoading(false);
        searchState.setSearchController(null);
        return;
      }
      
      // Get initial search results
      const initialResults = searchResponse.data?.results || [];
      const total = searchResponse.data?.total || initialResults.length;
      
      console.log('✅ Search successful:', initialResults.length, 'results');
      
      // Set initial results immediately
      searchState.setSearchResults(initialResults);
      searchState.setTotalResults(total);
      searchState.setOriginalSearchTotal(total);
      searchState.setIsLoading(false);
      
      // Now attempt reranking if we have enough results
      if (initialResults.length > 1 && !controller.signal.aborted) {
        console.log('🔄 Starting rerank phase...');
        searchState.setIsReranking(true);
        
        // Send ALL file IDs - rerank endpoint will rerank first 50 and return all in proper order
        const fileIds = initialResults.map(r => r.id);
        
        try {
          const rerankResponse = await supabase.functions.invoke('rerank', {
            body: {
              query: query,
              file_ids: fileIds,
              firm_id: firmId
            }
          });
          
          console.log('🔄 Rerank response:', { data: rerankResponse.data, error: rerankResponse.error });
          
          // Check if cancelled during rerank
          if (controller.signal.aborted) {
            console.log('Rerank was aborted');
            return;
          }
          
          // Apply reranked results if successful
          if (!rerankResponse.error && rerankResponse.data?.results?.length > 0) {
            const rerankedResults = rerankResponse.data.results.map(result => ({
              ...result,
              _rerankTimestamp: Date.now() // Keep only timestamp for React key stability
            }));
            
            console.log('✅ Applying reranked results:', rerankedResults.length);
            searchState.setSearchResults(rerankedResults);
            // Don't update originalSearchTotal - preserve it from initial search
            // Only update totalResults to reflect current results count
            searchState.setTotalResults(rerankedResults.length);
            
            toast({
              title: "Results reranked",
              description: `Reordered ${rerankedResults.length} results by relevance.`,
              duration: 2000,
            });
          } else {
            console.log('⚠️ Rerank failed or returned no results, keeping original order');
            if (rerankResponse.error) {
              console.error('Rerank error:', rerankResponse.error);
            }
          }
          
        } catch (rerankError) {
          console.error('❌ Rerank failed:', rerankError);
          // Don't show error toast for rerank failures - just keep original results
        } finally {
          searchState.setIsReranking(false);
        }
      }
      
      // Clear controller after successful completion
      searchState.setSearchController(null);
      
    } catch (error) {
      console.error('Search error details:', error);
      
      // Don't show error toast if the request was aborted
      if (error.name === 'AbortError' || controller.signal.aborted) {
        console.log('Search was cancelled');
        return;
      }
      
      // Handle errors
      searchState.setIsLoading(false);
      searchState.setIsReranking(false);
      searchState.setSearchController(null);
      
      toast({
        title: "Search failed",
        description: error.message || "Unable to perform search. Please try again.",
        variant: "destructive"
      });
      
      searchState.setSearchResults([]);
      searchState.setTotalResults(0);
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
    if (textareaRef.current) {
      textareaRef.current.style.height = '52px';
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [searchState]);

  // Debug: Log every render
  console.log('🎯 COMPONENT RENDER - isReranking:', searchState.isReranking, '| results:', searchState.searchResults.length);

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
        
        /* Smooth list reordering */
        .search-result-item {
          transition: all 0.6s cubic-bezier(0.25, 0.8, 0.25, 1);
        }
        
        /* Reranked badge animation */
        @keyframes badge-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); }
          50% { box-shadow: 0 0 0 4px rgba(59, 130, 246, 0); }
        }
        .reranked-badge {
          animation: badge-glow 2s ease-in-out 3;
        }
        
        /* Reranked item highlight */
        .reranked-item {
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(147, 51, 234, 0.06) 100%);
          border-color: rgba(59, 130, 246, 0.2) !important;
        }
        
        .reranked-item:hover {
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(147, 51, 234, 0.08) 100%);
          border-color: rgba(59, 130, 246, 0.3) !important;
        }
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



      {/* Fixed search header area */}
      <div 
        className="fixed left-0 right-0 z-10 bg-slate-50/95 backdrop-blur-sm" 
        style={{ top: '64px' }}
        ref={headerRef}
      >
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
          clearSearch={clearSearchWithFocus}
          cancelSearch={searchState.cancelSearch}
          canCancel={!!searchState.searchController}
        />
        
        {/* Fixed Results Header */}
        {searchState.searchResults.length > 0 && (
          <div className="px-4 pb-2 pt-1">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="font-heading text-lg font-semibold text-slate-800">
                    Search Results
                  </h2>
                  
                  {/* Reranking indicator */}
                  {searchState.isReranking && (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Reranking...</span>
                    </div>
                  )}
                </div>
                <span className="text-sm text-slate-500 bg-white/60 px-3 py-1 rounded-full border border-slate-200/80">
                  {searchState.originalSearchTotal && searchState.originalSearchTotal > searchState.searchResults.length ? (
                    <>Showing {searchState.searchResults.length} of {searchState.originalSearchTotal} results</>
                  ) : (
                    <>{searchState.searchResults.length} {searchState.searchResults.length === 1 ? 'result' : 'results'}</>
                  )}
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
              <div 
                className={`mt-4 max-w-4xl mx-auto px-4 space-y-3 transition-all duration-300 ${
                  searchState.isReranking ? 'opacity-90' : 'opacity-100'
                }`}
              >
                {searchState.searchResults.map((file, index) => (
                  <div
                    key={file._rerankTimestamp ? `${file.id}-${file._rerankTimestamp}` : `${file.id}-${index}`}
                    className={cn("search-result-item", file.reranked && "reranked-item")}
                  >
                    <SearchResultCard
                      file={file}
                      expandedSummaries={expandedSummaries}
                      onToggleSummary={toggleSummaryExpansion}
                      onFileClick={handleFileClick}
                      isReranking={searchState.isReranking}
                      showRerankBadge={!!file.reranked}
                      resultIndex={index + 1}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : searchState.searchQuery && searchState.hasSearched ? (
            <SearchEmptyState
              searchQuery={searchState.searchQuery}
              onTryDifferentSearch={() => searchState.setShowSuggestions(true)}
              toast={toast}
            />
          ) : searchState.showSuggestions || (!searchState.hasSearched && searchState.searchQuery) ? (
            <SearchWelcome onSuggestionClick={handleSuggestionClick} />
          ) : (
            <SearchEmptyState
              searchQuery={searchState.searchQuery}
              onTryDifferentSearch={() => searchState.setShowSuggestions(true)}
              toast={toast}
            />
          )}
        </div>
      </div>
    </div>
  );
} 