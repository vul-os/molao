import { useState, useEffect, useRef } from "react";
import { Search, Loader2, Scale, ArrowUpRight, FileText, Send, Sparkles, X, ArrowRight, BookOpen, BookText, Gavel, RefreshCw } from "lucide-react";
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
import ConversionStatus from "./conversion-status";
import SearchInput from "./search-input";
import LegalLoader from "./legal-loader";
import { API_BASE_URL, suggestedSearches } from "./constants";

export default function SearchPage() {
  const { user, refreshToken, accessToken } = useAuth();
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
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionError, setConversionError] = useState(false);

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

  const handleFileClick = async (file) => {
    setSelectedFile(file);
    setIsLoadingFile(true);
    setFileContent(null);
    setConversionError(false);

    const makeFileRequest = async (token) => {
      if (!token) {
        console.error("No access token available");
        throw new Error('missing_token');
      }

      console.log("Attempting file fetch with token length:", token.length);
      
      const response = await fetch(`${API_BASE_URL}/file/${file.id}`, {
        headers: {
          'Authorization': `Bearer ${token.trim()}`
        }
      });

      if (response.status === 401) {
        throw new Error('unauthorized');
      }

      if (!response.ok) {
        const errorData = await response.text();
        console.error("File fetch error details:", errorData);
        throw new Error(`Failed to fetch file: ${response.status}`);
      }

      return await response.text();
    };

    try {
      if (!user || !user.access_token) {
        toast({
          title: "Authentication error",
          description: "You need to sign in first.",
          variant: "destructive"
        });
        navigate('/signin');
        return;
      }

      // For RTF files, attempt conversion first
      if (file.mime_type === 'application/rtf') {
        await convertRtfToHtml(file.id);
      } else {
        // For other file types, use existing file fetch logic
        const content = await makeFileRequest(user.access_token);
        setFileContent(content);
      }
    } catch (error) {
      console.error('File fetch error details:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to load the file. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoadingFile(false);
    }
  };

  // Add RTF conversion function
  const convertRtfToHtml = async (fileId) => {
    setIsConverting(true);
    setConversionError(false);
    
    try {
      const response = await fetch(`${API_BASE_URL}/convert/rtf-to-html`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user.access_token.trim()}`
        },
        body: JSON.stringify({ file_id: fileId })
      });

      if (!response.ok) {
        throw new Error('Conversion failed');
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Conversion failed');
      }

      // Fetch the converted HTML file
      const htmlResponse = await fetch(`${API_BASE_URL}/download/html/${data.html_path}`, {
        headers: {
          'Authorization': `Bearer ${user.access_token.trim()}`
        }
      });

      if (!htmlResponse.ok) {
        throw new Error('Failed to fetch converted file');
      }

      const htmlContent = await htmlResponse.text();
      setFileContent(htmlContent);
    } catch (error) {
      console.error('RTF conversion error:', error);
      setConversionError(true);
      toast({
        title: "Conversion failed",
        description: "Failed to convert RTF file to HTML. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsConverting(false);
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
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 mt-8">
              <LegalLoader isLoading={isLoading} />
            </div>
          ) : searchResults.length > 0 ? (
            <div className="space-y-4 mt-6">
              <h2 className="font-heading text-lg font-medium text-slate-800 mb-4">
                Search Results
              </h2>
              <div className="grid gap-3">
                {searchResults.map((file) => (
                  <TooltipProvider key={file.id} delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Card
                          className={cn(
                            "cursor-pointer transition-all hover:border-green-100 hover:bg-green-50/30 border-slate-200 bg-white/90 backdrop-blur-sm group overflow-hidden",
                            selectedFile?.id === file.id ? "ring-2 ring-green-500 shadow-md" : "hover:shadow-md"
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

      {/* File viewer modal */}
      {selectedFile && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg w-[90vw] max-w-6xl h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50 rounded-t-lg">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 bg-green-50 p-2 rounded-md">
                  <FileText className="h-5 w-5 text-green-700" />
                </div>
                <div className="flex items-center gap-2">
                  <h3 className="font-heading text-lg font-medium text-slate-900">{selectedFile.file_name}</h3>
                  <Badge variant="outline" className="text-xs">
                    {selectedFile.mime_type === 'application/rtf' ? 'RTF Document' : selectedFile.file_type}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedFile(null);
                      setFileContent(null);
                      setConversionError(false);
                    }}
                    className="h-8 w-8 p-0 hover:bg-slate-100"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Content */}
            <ScrollArea className="flex-1">
              <div className="p-8">
                {isLoadingFile ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="h-6 w-6 text-green-700 animate-spin" />
                    <span className="ml-2 text-sm text-slate-600">Loading document...</span>
                  </div>
                ) : isConverting ? (
                  <ConversionStatus isConverting={true} />
                ) : conversionError ? (
                  <ConversionStatus 
                    isConverting={false} 
                    onRetry={() => convertRtfToHtml(selectedFile.id)} 
                  />
                ) : fileContent ? (
                  <div 
                    className="prose prose-slate max-w-none"
                    dangerouslySetInnerHTML={{ __html: fileContent }}
                  />
                ) : null}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
} 