import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useLocation } from "react-router-dom";

export function useSearchState() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  
  // Initialize search query from URL params, session storage, or location state
  const [searchQuery, setSearchQuery] = useState(() => {
    const urlQuery = searchParams.get('q');
    if (urlQuery) return urlQuery;
    return sessionStorage.getItem('searchQuery') || location.state?.searchQuery || "";
  });

  // Initialize search results from session storage or location state
  const [searchResults, setSearchResults] = useState(() => {
    const storedResults = sessionStorage.getItem('searchResults');
    return storedResults ? JSON.parse(storedResults) : location.state?.searchResults || [];
  });

  // Show suggestions if no search results and no URL query
  const [showSuggestions, setShowSuggestions] = useState(() => {
    const urlQuery = searchParams.get('q');
    return !urlQuery && !(sessionStorage.getItem('searchResults') || location.state?.searchResults);
  });

  // Track if a search has been performed
  const [hasSearched, setHasSearchedState] = useState(() => {
    const hasActiveSearch = sessionStorage.getItem('hasActiveSearch') === 'true';
    const storedResults = sessionStorage.getItem('searchResults');
    const hasStoredResults = storedResults ? JSON.parse(storedResults).length > 0 : false;
    const hasLocationResults = location.state?.searchResults?.length > 0;
    
    return hasActiveSearch || hasStoredResults || hasLocationResults;
  });

  // Loading and search controller state
  const [isLoading, setIsLoading] = useState(false);
  const [searchController, setSearchController] = useState(null);

  // Search settings state with localStorage persistence
  const [scoreThreshold, setScoreThreshold] = useState(() => {
    const stored = localStorage.getItem('searchSettings');
    return stored ? JSON.parse(stored).scoreThreshold : 0.75;
  });

  const [searchLimit, setSearchLimit] = useState(() => {
    const stored = localStorage.getItem('searchSettings');
    return stored ? JSON.parse(stored).searchLimit : 50;
  });

  // Custom setter with logging and session storage
  const setHasSearched = useCallback((value) => {
    console.log('🔄 Setting hasSearched:', value, 'from:', hasSearched);
    setHasSearchedState(value);
    if (value) {
      sessionStorage.setItem('hasActiveSearch', 'true');
    } else {
      sessionStorage.removeItem('hasActiveSearch');
    }
  }, [hasSearched]);

  // Update search query without updating URL
  const updateSearchQuery = useCallback((newQuery) => {
    setSearchQuery(newQuery);
  }, []);

  // Clear search state
  const clearSearch = useCallback(() => {
    console.log('🧹 clearSearch called');
    setSearchQuery("");
    setSearchResults([]);
    setShowSuggestions(true);
    sessionStorage.removeItem('searchQuery');
    sessionStorage.removeItem('searchResults');
    sessionStorage.removeItem('hasActiveSearch');
    setSearchParams({}, { replace: true });
    setHasSearched(false);
  }, [setSearchParams, setHasSearched]);

  // Cancel search
  const cancelSearch = useCallback(() => {
    console.log('Cancelling search - before:', { searchController: !!searchController, isLoading });
    if (searchController) {
      searchController.abort();
      setSearchController(null);
      setIsLoading(false);
      setShowSuggestions(false);
    }
    console.log('Cancelling search - after cleanup');
  }, [searchController, isLoading]);

  // Save search settings to localStorage
  useEffect(() => {
    const settings = { scoreThreshold, searchLimit };
    localStorage.setItem('searchSettings', JSON.stringify(settings));
  }, [scoreThreshold, searchLimit]);

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
      if (!hasSearched && !isLoading) {
        setShowSuggestions(true);
      }
    }
  }, [searchResults, hasSearched, isLoading]);

  // Clean up search controller on unmount
  useEffect(() => {
    return () => {
      if (searchController) {
        searchController.abort();
      }
    };
  }, [searchController]);

  // Clear session storage on page refresh
  useEffect(() => {
    const handleBeforeUnload = () => {
      sessionStorage.removeItem('searchQuery');
      sessionStorage.removeItem('searchResults');
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  return {
    // State
    searchQuery,
    searchResults,
    showSuggestions,
    hasSearched,
    isLoading,
    searchController,
    scoreThreshold,
    searchLimit,
    
    // Actions
    setSearchQuery: updateSearchQuery,
    setSearchResults,
    setShowSuggestions,
    setHasSearched,
    setIsLoading,
    setSearchController,
    setScoreThreshold,
    setSearchLimit,
    clearSearch,
    cancelSearch,
    
    // URL params
    searchParams,
    setSearchParams
  };
} 