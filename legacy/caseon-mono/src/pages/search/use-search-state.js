import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useLocation } from "react-router-dom";

export function useSearchState() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const hasInitialized = useRef(false);
  
  // Simple, stable state management that doesn't reinitialize on URL changes
  const [searchQuery, setSearchQuery] = useState(() => {
    const initial = searchParams.get('q') || location.state?.searchQuery || "";
    hasInitialized.current = true;
    return initial;
  });

  const [searchResults, setSearchResults] = useState(() => {
    return location.state?.searchResults || [];
  });

  const [totalResults, setTotalResults] = useState(0);
  const [originalSearchTotal, setOriginalSearchTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [searchController, setSearchController] = useState(null);
  const [isReranking, setIsReranking] = useState(false);
  const [hasSearched, setHasSearched] = useState(() => {
    return !!(searchParams.get('q') || location.state?.searchResults?.length > 0);
  });

  // Only sync query from URL params on initial load, not on subsequent URL updates
  useEffect(() => {
    if (!hasInitialized.current) {
      const urlQuery = searchParams.get('q');
      if (urlQuery && urlQuery !== searchQuery) {
        setSearchQuery(urlQuery);
        setHasSearched(true);
      }
      hasInitialized.current = true;
    }
  }, [searchParams, searchQuery]);

  // Computed state
  const showSuggestions = !hasSearched && searchResults.length === 0 && !searchQuery;

  // Simple clear function
  const clearSearch = useCallback(() => {
    console.log('🧹 Clearing search state');
    setSearchQuery("");
    setSearchResults([]);
    setTotalResults(0);
    setOriginalSearchTotal(0);
    setHasSearched(false);
    setIsReranking(false);
    setIsLoading(false);
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  // Simple cancel function
  const cancelSearch = useCallback(() => {
    console.log('🚫 Cancelling search');
    if (searchController) {
      searchController.abort();
      setSearchController(null);
    }
    setIsLoading(false);
    setIsReranking(false);
  }, [searchController]);

  // Clean up controller on unmount
  useEffect(() => {
    return () => {
      if (searchController) {
        searchController.abort();
      }
    };
  }, [searchController]);

  return {
    // State
    searchQuery,
    searchResults,
    totalResults,
    originalSearchTotal,
    showSuggestions,
    hasSearched,
    isLoading,
    searchController,
    isReranking,
    
    // Actions - direct setters for stability
    setSearchQuery,
    setSearchResults,
    setTotalResults,
    setOriginalSearchTotal,
    setHasSearched,
    setIsLoading,
    setSearchController,
    setIsReranking,
    clearSearch,
    cancelSearch,
    
    // URL params
    searchParams,
    setSearchParams
  };
} 