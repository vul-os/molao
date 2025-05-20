import { useState, useEffect, useRef } from "react";
import { Search, Loader2, Scale, ArrowUpRight, FileText, Send, Sparkles, X, ArrowRight, BookOpen, BookText, Gavel } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

// Suggested search queries with categories
const suggestedSearches = [
  {
    category: "Constitutional Law",
    queries: [
      "Show me landmark cases about freedom of expression in SA",
      "Find precedents for equality rights under the Constitution",
      "Search for cases about dignity in South African law"
    ]
  },
  {
    category: "Private Law",
    queries: [
      "Show me leading cases about contract breach in South Africa",
      "Find precedents for property disputes in South African law",
      "Search for cases about delict liability in SA courts"
    ]
  },
  {
    category: "Criminal Law",
    queries: [
      "Show me cases about unlawful arrests in South Africa",
      "Find precedents for bail applications in SA",
      "Search for cases about evidence admissibility in SA courts"
    ]
  }
];

// const API_BASE_URL = "https://caseon-160638720514.us-central1.run.app";
const API_BASE_URL = "http://localhost:8080";

export default function SearchPage() {
  const { user, refreshToken } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef(null);

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
        
        const response = await fetch(`${API_BASE_URL}/search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token.trim()}` // Ensure no whitespace
          },
          body: JSON.stringify({
            query: searchQuery,
            limit: 10
          })
        });
        
        // Log response status for debugging
        console.log("API response status:", response.status);
        
        if (response.status === 401) {
          throw new Error('unauthorized');
        }
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error("API error details:", errorData);
          throw new Error(errorData.description || 'Search request failed');
        }
        
        return await response.json();
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
      console.error('Search error details:', error);
      toast({
        title: "Search failed",
        description: error.message || "Unable to perform search. Please try again.",
        variant: "destructive"
      });
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    setSearchQuery(suggestion);
    handleSearch();
  };

  // Add error boundary for file content fetching
  const handleFileClick = async (file) => {
    setSelectedFile(file);
    setIsLoading(true);
    try {
      const response = await fetch(file.cdn_path, {
        headers: {
          'Authorization': `Bearer ${user.access_token}`
        }
      });

      if (response.status === 401) {
        toast({
          title: "Session expired",
          description: "Your session has expired. Please sign in again.",
          variant: "destructive"
        });
        navigate('/signin');
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to fetch file content');
      }

      const content = await response.text();
      setFileContent(content);
    } catch (error) {
      console.error('Error loading file:', error);
      toast({
        title: "Error",
        description: "Unable to load file content. Please try again.",
        variant: "destructive"
      });
      setSelectedFile(null);
    } finally {
      setIsLoading(false);
    }
  };

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
      `}</style>

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto pb-[65px]">
        <div className="max-w-4xl mx-auto px-4 py-8">
          {showSuggestions && !searchQuery && (
            <div>
              <div className="flex flex-col items-center text-center gap-3 mb-6">
                <div className="h-14 w-14 bg-gradient-to-br from-green-600 to-blue-700 p-3 rounded-full shadow-md flex items-center justify-center">
                  <Gavel className="h-8 w-8 text-white" />
                </div>
                <h1 className="font-heading text-2xl font-semibold tracking-tight text-slate-900">
                  South African Legal Research
                </h1>
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
          )}

          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 text-green-700 animate-spin" />
            </div>
          ) : searchResults.length > 0 ? (
            <div className="space-y-3 mt-6">
              <h2 className="font-heading text-lg font-medium text-slate-800 mb-4">
                Search Results
              </h2>
              {searchResults.map((file) => (
                <TooltipProvider key={file.id} delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Card
                        className={cn(
                          "cursor-pointer transition-all hover:shadow-md border-slate-200 bg-white/90 backdrop-blur-sm group",
                          selectedFile?.id === file.id ? "ring-2 ring-green-500 shadow-md" : ""
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
          ) : searchQuery ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <p className="font-heading text-sm text-slate-600">No cases found matching "{searchQuery}"</p>
              <Button
                variant="link"
                className="mt-2 text-green-700 font-medium"
                onClick={() => setShowSuggestions(true)}
              >
                Try a different search
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Improved search input - Fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 border-t bg-white/95 backdrop-blur-sm shadow-lg z-20 transition-all duration-200">
        <div className="max-w-4xl mx-auto p-3">
          <div className="flex flex-col gap-2">
            <div className="relative rounded-xl shadow-md hover:shadow-lg transition-shadow duration-200 overflow-hidden">
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  placeholder="Ask about any South African legal case or topic..."
                  value={searchQuery}
                  onChange={(e) => {
                    // Limit to 500 characters
                    if (e.target.value.length <= 500) {
                      setSearchQuery(e.target.value);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSearch();
                    }
                  }}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  rows={1}
                  className={cn(
                    "w-full pl-12 pr-14 py-3 bg-white border-slate-200 transition-all duration-200",
                    "focus:border-green-500 focus:ring-2 focus:ring-green-500/20 focus:ring-offset-0",
                    "rounded-xl text-base",
                    "resize-none overflow-y-auto min-h-[48px] max-h-[200px]",
                    "placeholder:text-slate-400",
                    isFocused ? "border-green-500/70" : "hover:border-slate-300"
                  )}
                  style={{
                    height: 'auto',
                    minHeight: '48px',
                    maxHeight: '200px'
                  }}
                  maxLength={500}
                />
                {/* Search icon that stays visible */}
                <div className="absolute left-3 top-3 text-slate-400 flex items-center justify-center w-6 h-6 pointer-events-none">
                  <Search className="h-5 w-5" />
                </div>
                
                {/* Button container with proper alignment */}
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
                  {searchQuery && (
                    <Button
                      onClick={() => {
                        setSearchQuery("");
                        if (textareaRef.current) {
                          textareaRef.current.style.height = '48px';
                        }
                      }}
                      className="h-8 w-8 rounded-full 
                               bg-slate-100 hover:bg-slate-200 text-slate-500 p-0 border border-slate-200
                               flex items-center justify-center transition-all duration-200"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                  
                  <Button
                    onClick={handleSearch}
                    disabled={isLoading || !searchQuery.trim()}
                    className={cn(
                      "h-10 w-10 rounded-full p-0 transition-all duration-200",
                      "bg-gradient-to-br from-green-600 to-blue-700",
                      "hover:from-green-700 hover:to-blue-800 hover:shadow-md",
                      "text-white flex items-center justify-center",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      "border border-green-700",
                      "transform transition-transform duration-200",
                      !isLoading && searchQuery.trim() && "hover:scale-105"
                    )}
                    aria-label="Search"
                  >
                    {isLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <ArrowRight className="h-5 w-5" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
            
            <div className="flex justify-between items-center px-1">
              {isFocused && !searchQuery && (
                <div className="text-xs text-slate-500">
                  Type your query and press Enter to search (Shift + Enter for new line)
                </div>
              )}
              
              {searchQuery && (
                <div className={cn(
                  "text-xs font-medium transition-colors",
                  searchQuery.length > 450 ? "text-amber-600" : "text-slate-500"
                )}>
                  {searchQuery.length}/500
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* File viewer modal */}
      {selectedFile && fileContent && (
        <div className="fixed inset-0 bg-black/50 z-30 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50 rounded-t-xl">
              <div className="pr-4">
                <h3 className="font-heading text-lg font-medium text-slate-900">{selectedFile.file_name}</h3>
                <p className="text-sm text-slate-500 mt-0.5">{selectedFile.file_type}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedFile(null);
                  setFileContent(null);
                }}
                className="text-slate-500 hover:text-slate-900 hover:bg-slate-200"
              >
                Close
              </Button>
            </div>
            <ScrollArea className="flex-1 p-6">
              <div className="prose prose-slate max-w-none font-heading">
                <pre className="whitespace-pre-wrap text-sm leading-relaxed">
                  {fileContent}
                </pre>
              </div>
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
}
