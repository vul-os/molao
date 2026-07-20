import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Loader2, Scale, ArrowUpRight, FileText, Send, AlertCircle, Sparkles, ChevronDown, ChevronUp, Bot, BookOpen, X, RotateCcw } from "lucide-react";
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

  // Add summary-related state
  const [summaryData, setSummaryData] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(null);
  const [showMobileSummary, setShowMobileSummary] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

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

  // Check if device is mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024); // lg breakpoint
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Restore summary state from navigation if returning from file detail
  useEffect(() => {
    if (location.state) {
      const { summaryData: navSummaryData, summaryError: navSummaryError } = location.state;
      if (navSummaryData) {
        setSummaryData(navSummaryData);
      }
      if (navSummaryError) {
        setSummaryError(navSummaryError);
      }
    }
  }, [location.state]);

  // Function to fetch summary
  const fetchSummary = async (query) => {
    if (!query.trim()) return;
    
    setSummaryLoading(true);
    setSummaryError(null);
    
    try {
      const response = await supabase.functions.invoke('summary', {
        body: { query: query }
      });
      
      if (response.error) {
        throw new Error(response.error.message || 'Failed to generate summary');
      }
      
      setSummaryData(response.data);
    } catch (error) {
      console.error('Summary error:', error);
      setSummaryError(error.message);
    } finally {
      setSummaryLoading(false);
    }
  };

  // Modify handleSearch to also fetch summary
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
    
    // Create new AbortController for this entire search operation
    const controller = new AbortController();
    searchState.setSearchController(controller);
    
    // Set initial search state
    searchState.setSearchResults([]);
    searchState.setIsLoading(true);
    searchState.setHasSearched(true);
    searchState.setIsReranking(false); // Reset reranking state
    
    // Start summary fetch in parallel
    fetchSummary(query);
    
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

  // Separate rerank function
  const handleRerank = async () => {
    if (!searchState.searchQuery.trim() || searchState.searchResults.length <= 1) {
      return;
    }

    // Cancel any existing operations
    if (searchState.searchController) {
      searchState.searchController.abort();
    }

    // Create new AbortController for reranking
    const controller = new AbortController();
    searchState.setSearchController(controller);
    searchState.setIsReranking(true);

    try {
      const firmId = activeFirm?.id;
      
      if (!firmId) {
        throw new Error('No active firm found. Please select a firm.');
      }

      console.log('🔄 Starting manual rerank...');
      
      // Send ALL file IDs - rerank endpoint will rerank first 50 and return all in proper order
      const fileIds = searchState.searchResults.map(r => r.id);
      
      const rerankResponse = await supabase.functions.invoke('rerank', {
        body: {
          query: searchState.searchQuery,
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
        console.log('⚠️ Rerank failed or returned no results');
        if (rerankResponse.error) {
          console.error('Rerank error:', rerankResponse.error);
          toast({
            title: "Rerank failed",
            description: rerankResponse.error.message || "Unable to rerank results. Please try again.",
            variant: "destructive"
          });
        }
      }
      
    } catch (rerankError) {
      console.error('❌ Rerank failed:', rerankError);
      
      // Don't show error toast if the request was aborted
      if (rerankError.name === 'AbortError' || controller.signal.aborted) {
        console.log('Rerank was cancelled');
        return;
      }
      
      toast({
        title: "Rerank failed",
        description: rerankError.message || "Unable to rerank results. Please try again.",
        variant: "destructive"
      });
    } finally {
      searchState.setIsReranking(false);
      searchState.setSearchController(null);
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
        searchQuery: searchState.searchQuery,
        // Also preserve summary state
        summaryData: summaryData,
        summaryError: summaryError
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
    setSummaryData(null);
    setSummaryError(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = '52px';
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [searchState]);

  // Summary Component
  const SummarySection = ({ className = "", hideHeader = false }) => {
    if (!summaryData && !summaryLoading && !summaryError) {
      return null;
    }

    return (
      <div className={cn("bg-white rounded-lg border border-slate-200 shadow-sm", className)}>
        {!hideHeader && (
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-slate-600" />
              <h3 className="font-heading text-base font-semibold text-slate-800">
                Summary
              </h3>
              {summaryLoading && (
                <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
              )}
            </div>
          </div>
        )}
        
        <div className="p-4 space-y-4">
          {summaryLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-slate-400" />
                <p className="text-sm text-slate-500">Generating summary...</p>
              </div>
            </div>
          ) : summaryError ? (
            <div className="text-center py-6">
              <AlertCircle className="h-5 w-5 mx-auto mb-2 text-red-400" />
              <p className="text-sm text-red-600 mb-2">Failed to generate summary</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchSummary(searchState.searchQuery)}
                className="text-xs"
              >
                Retry
              </Button>
            </div>
          ) : summaryData ? (
                         <div className="space-y-6">
               {/* Case Names */}
               {summaryData.case_names && summaryData.case_names.length > 0 && (
                 <div>
                   <h4 className="font-heading font-semibold text-base text-slate-800 mb-3 flex items-center gap-2">
                     <Scale className="h-4 w-4 text-blue-600" />
                     Relevant Cases
                   </h4>
                   <div className="space-y-2">
                     {summaryData.case_names.map((caseName, index) => (
                       <div key={index} className="text-sm bg-blue-50 rounded-lg px-3 py-2 text-slate-700 border border-blue-100 font-medium">
                         {caseName}
                       </div>
                     ))}
                   </div>
                 </div>
               )}

               {/* Condensed Summary */}
               {summaryData.condensed_summary && (
                 <div>
                   <h4 className="font-heading font-bold text-lg text-slate-800 mb-3">Quick Overview</h4>
                   <div className="summary-content text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-lg p-4 border border-slate-200">
                     <MarkdownRenderer content={summaryData.condensed_summary} />
                   </div>
                 </div>
               )}

               {/* Long Summary */}
               {summaryData.long_summary && (
                 <div>
                   <h4 className="font-heading font-bold text-lg text-slate-800 mb-3">Detailed Analysis</h4>
                   <div className="summary-content text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-lg p-4 border border-slate-200">
                     <MarkdownRenderer content={summaryData.long_summary} />
                   </div>
                 </div>
               )}
             </div>
          ) : null}
          
          {/* AI Disclaimer - only show when we have summary data */}
          {summaryData && (
            <div className="mt-6 pt-4 border-t border-slate-100">
                              <p className="text-xs text-slate-500 leading-relaxed flex items-start gap-1">
                  <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0 text-slate-400" />
                  AI summaries may contain inaccuracies or hallucinations. Please verify important information with documents from search results.
                </p>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Mobile Summary Snippet
  const MobileSummarySnippet = () => {
    if (isMobile === false || (!summaryData && !summaryLoading && !summaryError)) return null;

    const getSnippetText = () => {
      if (summaryLoading) return "Generating summary...";
      if (summaryError) return "Failed to generate summary. Tap to retry.";
      if (summaryData?.condensed_summary) {
        // Extract first two sentences or truncate at ~100 chars
        const text = summaryData.condensed_summary.replace(/[#*_`]/g, '').trim();
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        if (sentences.length >= 2) {
          return sentences.slice(0, 2).join('. ') + '.';
        }
        return text.length > 100 ? text.substring(0, 100) + '...' : text;
      }
      return "Summary available. Tap to view.";
    };

    const handleSnippetClick = () => {
      if (summaryError) {
        // Retry summary generation on error
        fetchSummary(searchState.searchQuery);
      } else {
        // Open dialog for normal cases
        setShowMobileSummary(true);
      }
    };

    return (
      <div 
        className="mx-4 mb-2 bg-white rounded-lg border border-slate-200 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
        onClick={handleSnippetClick}
      >
        <div className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="h-3 w-3 text-blue-600 flex-shrink-0" />
            <span className="text-xs font-medium text-slate-700">Summary</span>
            {summaryLoading && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
          </div>
          <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
            {getSnippetText()}
          </p>
        </div>
      </div>
    );
  };

  // Mobile Summary Dialog
  const MobileSummaryDialog = () => {
    if (isMobile === false) return null;

    return (
      <Dialog open={showMobileSummary} onOpenChange={setShowMobileSummary}>
        <DialogContent className="max-w-[95vw] max-h-[85vh] overflow-y-auto p-4">
          <DialogHeader className="pb-2">
            <DialogTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4" />
              Summary
            </DialogTitle>
          </DialogHeader>
          
          <div className="-mx-4">
            <SummarySection className="border-0 shadow-none rounded-none" hideHeader={true} />
          </div>
        </DialogContent>
      </Dialog>
    );
  };

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
        
        /* Summary section markdown styling */
        .summary-content h1, .summary-content h2, .summary-content h3 {
          font-weight: 600;
          color: rgb(30 41 59);
          margin-top: 1rem;
          margin-bottom: 0.5rem;
        }
        .summary-content h1 { font-size: 1.125rem; }
        .summary-content h2 { font-size: 1rem; }
        .summary-content h3 { font-size: 0.875rem; }
        .summary-content p {
          margin-bottom: 0.75rem;
          line-height: 1.6;
        }
        .summary-content ul, .summary-content ol {
          margin-left: 1rem;
          margin-bottom: 0.75rem;
        }
        .summary-content li {
          margin-bottom: 0.25rem;
        }
        .summary-content strong {
          font-weight: 600;
          color: rgb(30 41 59);
        }
        .summary-content em {
          font-style: italic;
          color: rgb(51 65 85);
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

      {/* Mobile Summary Dialog */}
      <MobileSummaryDialog />

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
        
        {/* Mobile Summary Snippet */}
        <MobileSummarySnippet />
        
        {/* Fixed Results Header */}
        {searchState.searchResults.length > 0 && (
          <div className="px-4 pb-2 pt-1">
            <div className={cn("mx-auto", isMobile ? "max-w-4xl" : "max-w-7xl")}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="font-heading text-lg font-semibold text-slate-800">
                    Search Results
                  </h2>
                </div>
                
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-500 bg-white/60 px-3 py-1 rounded-full border border-slate-200/80">
                    {searchState.originalSearchTotal && searchState.originalSearchTotal > searchState.searchResults.length ? (
                      <>{searchState.searchResults.length} of {searchState.originalSearchTotal} results</>
                    ) : (
                      <>{searchState.searchResults.length} {searchState.searchResults.length === 1 ? 'result' : 'results'}</>
                    )}
                  </span>
                  
                  {/* Manual Rerank Button */}
                  {searchState.searchResults.length > 1 && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleRerank}
                            disabled={searchState.isReranking || searchState.isLoading}
                            className="bg-white/80 hover:bg-white border-slate-200 hover:border-slate-300"
                          >
                            {searchState.isReranking ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Reranking...
                              </>
                            ) : (
                              <>
                                <RotateCcw className="h-4 w-4 mr-2" />
                                Rerank
                              </>
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{searchState.isReranking ? 'Reranking results...' : 'Rerank results by relevance'}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main content area */}
      <div className="flex-1" style={{ paddingTop: `${headerHeight}px` }}>
        <div className="h-full">
          {searchState.isLoading && searchState.searchResults.length === 0 ? (
            /* Show loader with summary if available */
            <div className={cn("h-full", isMobile ? "" : "lg:flex lg:gap-8 lg:justify-center lg:max-w-7xl lg:mx-auto lg:px-4")}>
              {/* Loading area for results */}
              <div className={cn("h-full", isMobile ? "" : "lg:flex-1 lg:max-w-4xl")}>
                <div className="flex flex-col items-center justify-center h-64 pt-8 px-4">
                  <LegalLoader isLoading={searchState.isLoading} />
                </div>
              </div>
              
              {/* Summary Column (Desktop Only) - Show even during loading */}
              {!isMobile && (
                <div className="hidden lg:block lg:w-80 xl:w-96 lg:flex-shrink-0 h-full overflow-y-auto results-scroll pb-6">
                  <div className="mt-4">
                    <SummarySection className="sticky top-4" />
                  </div>
                </div>
              )}
            </div>
          ) : searchState.searchResults.length > 0 ? (
            /* Two-column layout for desktop, single column for mobile */
            <div className={cn("h-full", isMobile ? "" : "lg:flex lg:gap-8 lg:justify-center lg:max-w-7xl lg:mx-auto lg:px-4")}>
              {/* Search Results Column */}
              <div className={cn("h-full overflow-y-auto results-scroll pb-6", isMobile ? "" : "lg:flex-1 lg:max-w-4xl")}>
                <div 
                  className={cn("mt-4 space-y-3 transition-all duration-300", 
                    isMobile ? "max-w-4xl mx-auto px-4" : "max-w-none px-4",
                    searchState.isReranking ? 'opacity-90' : 'opacity-100'
                  )}
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

              {/* Summary Column (Desktop Only) */}
              {!isMobile && (
                <div className="hidden lg:block lg:w-80 xl:w-96 lg:flex-shrink-0 h-full overflow-y-auto results-scroll pb-6">
                  <div className="mt-4">
                    <SummarySection className="sticky top-4" />
                  </div>
                </div>
              )}
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