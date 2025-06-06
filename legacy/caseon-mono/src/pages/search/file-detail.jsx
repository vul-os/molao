import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { FileText, DownloadCloud, ArrowLeft, ExternalLink, ZoomIn, ZoomOut, RotateCw, Maximize, AlertCircle, Bot, Sparkles, BookOpen, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/services/supabase-client";
import PDFRenderer from "@/components/pdf-renderer";

export default function FileDetailPage() {
  const { fileId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [fileData, setFileData] = useState({
    fileName: "Document",
    fileType: "pdf",
    mimeType: "application/pdf",
    sourceUrl: null,
    cdnUrl: null
  });
  const [summaries, setSummaries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSummariesLoading, setIsSummariesLoading] = useState(true);
  const [pdfBlob, setPdfBlob] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [fileNotFound, setFileNotFound] = useState(false);
  
  // Tab state - default to summary if URL param is set
  const [activeTab, setActiveTab] = useState(() => {
    return searchParams.get('view') === 'summary' ? 'summary' : 'document';
  });

  // Store the incoming search state to use when going back
  const [searchState, setSearchState] = useState({
    searchResults: location.state?.searchResults || [],
    searchQuery: location.state?.searchQuery || ""
  });

  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Handle tab changes and URL updates
  const handleTabChange = (value) => {
    setActiveTab(value);
    if (value === 'summary') {
      setSearchParams({ view: 'summary' });
    } else {
      setSearchParams({});
    }
  };

  // Handle URL parameter changes
  useEffect(() => {
    const view = searchParams.get('view');
    if (view === 'summary') {
      setActiveTab('summary');
    } else {
      setActiveTab('document');
    }
  }, [searchParams]);

  useEffect(() => {
    if (pdfBlob) {
      // Revoke the old URL if it exists
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
      // Create new URL
      const newUrl = URL.createObjectURL(pdfBlob);
      setPdfUrl(newUrl);
    }

    // Cleanup function
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfBlob]);

  // Debug log for tracking component lifecycle
  console.log('FileDetailPage render:', { fileId, hasUser: !!user, pdfBlob });

  useEffect(() => {
    // Store the search state when it changes in location
    if (location.state?.searchResults || location.state?.searchQuery) {
      setSearchState({
        searchResults: location.state.searchResults || [],
        searchQuery: location.state.searchQuery || ""
      });
      
      // If we have file details in the state (passed from search results), use them
      if (location.state.searchResults) {
        const fileFromResults = location.state.searchResults.find(file => file.id === fileId);
        if (fileFromResults) {
          setFileData(prevData => ({
            ...prevData,
            fileName: fileFromResults.file_title || fileFromResults.file_name || "Document"
          }));
          // Set summaries if available from search results
          if (fileFromResults.summaries) {
            setSummaries(fileFromResults.summaries);
            setIsSummariesLoading(false);
          }
        }
      }
    }
  }, [location.state, fileId]);

  useEffect(() => {
    let isMounted = true;

    const loadFileAndSummaries = async () => {
      if (!fileId || !user) return;
      
      setIsLoading(true);
      setIsSummariesLoading(true);
      setFileNotFound(false);
      
      try {
        // Fetch file metadata and summaries from Supabase
        const { data: fileRecord, error } = await supabase
          .from('files')
          .select(`
            *,
            file_summaries (
              model,
              content
            )
          `)
          .eq('id', fileId)
          .single();
        
        if (error) {
          console.error('Supabase query error:', error);
          throw new Error(`Failed to load file metadata: ${error.message}`);
        }
        
        if (!isMounted) return;

        if (!fileRecord) {
          throw new Error('File not found');
        }

        // Update file metadata
        const updatedFileData = {
          fileName: fileRecord.file_title || fileRecord.file_name || "Document",
          fileType: fileRecord.file_type || "pdf",
          mimeType: fileRecord.mime_type || "application/pdf",
          sourceUrl: fileRecord.source_url || null,
          cdnUrl: fileRecord.cdn_path ? `https://${fileRecord.cdn_path}` : null
        };
        setFileData(updatedFileData);

        // Set summaries
        const validSummaries = (fileRecord.file_summaries || []).filter(s => s?.content?.trim());
        setSummaries(validSummaries);
        setIsSummariesLoading(false);

        // Try to fetch PDF from CDN URL
        if (updatedFileData.cdnUrl) {
          const pdfUrl = updatedFileData.cdnUrl.replace(/\.rtf$/i, '.pdf');
          
          try {
            const pdfResponse = await fetch(pdfUrl);
            
            if (!pdfResponse.ok) {
              throw new Error(`PDF not found: ${pdfResponse.status}`);
            }

            const pdfBlob = await pdfResponse.blob();
            
            if (pdfBlob.type !== 'application/pdf' && !pdfBlob.type.includes('pdf')) {
              throw new Error('File is not a valid PDF');
            }
            
            if (!isMounted) return;
            
            setPdfBlob(pdfBlob);
            setIsLoading(false);
          } catch (pdfError) {
            console.error('PDF fetch error:', pdfError);
            if (isMounted) {
              setFileNotFound(true);
              setIsLoading(false);
            }
          }
        } else {
          if (isMounted) {
            setFileNotFound(true);
            setIsLoading(false);
          }
        }
      } catch (error) {
        console.error('File load error:', error);
        if (isMounted) {
          toast({
            title: "Error",
            description: error.message || "Failed to load the file. Please try again.",
            variant: "destructive"
          });
          setFileNotFound(true);
          setIsLoading(false);
          setIsSummariesLoading(false);
        }
      }
    };

    loadFileAndSummaries();

    return () => {
      isMounted = false;
    };
  }, [fileId, user]);

  const handleGoBack = () => {
    navigate('/search', { 
      state: searchState,
      replace: false
    });
  };

  const downloadPdf = () => {
    if (!pdfBlob) return;
    
    const linkElement = document.createElement('a');
    linkElement.href = pdfUrl;
    linkElement.setAttribute('download', `${fileData.fileName || 'document'}.pdf`);
    document.body.appendChild(linkElement);
    linkElement.click();
    document.body.removeChild(linkElement);
  };

  const openSourceUrl = () => {
    if (fileData.sourceUrl) {
      window.open(fileData.sourceUrl, '_blank', 'noopener,noreferrer');
    } else {
      toast({
        title: "Source not available",
        description: "No source URL is available for this document.",
        variant: "default"
      });
    }
  };

  const zoomIn = () => setScale(prev => Math.min(prev + 0.2, 3));
  const zoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.5));
  const rotate = () => setRotation(prev => (prev + 90) % 360);
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Markdown-like text formatter (simple implementation)
  const formatText = (text) => {
    if (!text) return '';
    
    // Simple markdown-like formatting
    return text
      .split('\n')
      .map((line, index) => {
        // Handle headers
        if (line.startsWith('# ')) {
          return <h1 key={index} className="text-2xl font-bold mb-4 text-slate-900">{line.slice(2)}</h1>;
        }
        if (line.startsWith('## ')) {
          return <h2 key={index} className="text-xl font-semibold mb-3 text-slate-800">{line.slice(3)}</h2>;
        }
        if (line.startsWith('### ')) {
          return <h3 key={index} className="text-lg font-medium mb-2 text-slate-700">{line.slice(4)}</h3>;
        }
        
        // Handle bullet points
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <li key={index} className="ml-4 mb-1 text-slate-700 list-disc">
              {line.slice(2)}
            </li>
          );
        }
        
        // Handle numbered lists
        if (/^\d+\.\s/.test(line)) {
          return (
            <li key={index} className="ml-4 mb-1 text-slate-700 list-decimal">
              {line.replace(/^\d+\.\s/, '')}
            </li>
          );
        }
        
        // Handle bold text
        const boldFormatted = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        // Regular paragraphs
        if (line.trim()) {
          return (
            <p 
              key={index} 
              className="mb-3 text-slate-700 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: boldFormatted }}
            />
          );
        }
        
        // Empty lines
        return <br key={index} />;
      });
  };

  // Summary Component
  const SummaryView = () => {
    if (isSummariesLoading) {
      return (
        <div className="flex items-center justify-center p-12">
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
            <p className="text-slate-500">Loading summaries...</p>
          </div>
        </div>
      );
    }

    if (!summaries || summaries.length === 0) {
      return (
        <div className="flex items-center justify-center p-12">
          <div className="text-center space-y-4 max-w-md">
            <Bot className="h-16 w-16 text-slate-300 mx-auto" />
            <h3 className="text-lg font-semibold text-slate-600">No AI Summaries Available</h3>
            <p className="text-slate-500">
              This document hasn't been processed by our AI models yet. Summaries will appear here once available.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center gap-2 bg-gradient-to-r from-purple-50 to-blue-50 px-3 py-2 rounded-lg border border-purple-100">
            <Bot className="h-5 w-5 text-purple-600" />
            <span className="font-medium text-purple-700">AI Generated Summaries</span>
          </div>
          <Badge variant="outline" className="bg-slate-50 text-slate-600">
            {summaries.length} {summaries.length === 1 ? 'model' : 'models'}
          </Badge>
        </div>

        <div className="grid gap-6">
          {summaries.map((summary, index) => (
            <Card key={index} className="border border-slate-200 bg-gradient-to-br from-white to-slate-50">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Sparkles className="h-5 w-5 text-purple-500" />
                  <span className="capitalize font-heading">{summary.model || 'AI Model'}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-slate max-w-none">
                  {formatText(summary.content)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  // File not found component
  const FileNotFoundView = () => (
    <div className="flex-1 bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4">
        <div className="flex justify-center">
          <AlertCircle className="h-16 w-16 text-slate-400" />
        </div>
        <h2 className="text-xl font-semibold text-slate-900">File Not Found</h2>
        <p className="text-slate-600">
          The PDF version of this document is not available. You can try viewing the original source.
        </p>
        
        {fileData.sourceUrl && (
          <div className="space-y-3">
            <Button
              onClick={openSourceUrl}
              className="flex items-center gap-2"
              size="lg"
            >
              <ExternalLink className="h-4 w-4" />
              View Original Source
            </Button>
            
            <div className="p-3 bg-white rounded-lg border border-slate-200">
              <p className="text-sm text-slate-500 mb-2">Source URL:</p>
              <a 
                href={fileData.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-800 underline break-all"
              >
                {fileData.sourceUrl}
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Add responsive styles */}
      <style>{`
        @media (max-width: 475px) {
          .xs\\:hidden { display: none !important; }
          .xs\\:inline { display: inline !important; }
        }
        @media (min-width: 476px) {
          .xs\\:hidden { display: inline !important; }
          .xs\\:inline { display: none !important; }
        }
        
        /* Improve touch targets for mobile */
        @media (max-width: 640px) {
          .touch-target {
            min-height: 44px;
            min-width: 44px;
          }
        }
        
        /* Better text scaling */
        .mobile-title {
          font-size: clamp(0.875rem, 4vw, 1.125rem);
        }

        /* Ensure sticky works properly */
        .file-detail-container {
          position: relative;
          height: 100%;
          overflow: hidden;
        }
        
        .file-detail-header {
          position: sticky;
          top: 0;
          z-index: 30;
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(8px);
        }
        
        .file-detail-content {
          height: calc(100vh - 64px); /* Account for MainLayout header */
          overflow-y: auto;
        }
      `}</style>

      {/* Sticky Header within the page */}
      <div className="file-detail-header border-b border-slate-200/80 shadow-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6">
          {/* Main Header Row */}
          <div className="flex items-center justify-between py-2 sm:py-3">
            {/* Left Section: Back button and file info */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <Button 
                variant="ghost" 
                onClick={handleGoBack}
                className="flex-shrink-0 h-8 w-8 p-0 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all"
                aria-label="Back to search"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="flex-shrink-0 bg-green-50 p-1.5 rounded-md border border-green-100">
                  <FileText className="h-4 w-4 text-green-700" />
                </div>
                <div className="min-w-0 flex-1">
                  <h1 
                    className="font-heading mobile-title font-semibold text-slate-900 truncate leading-tight"
                    title={fileData.fileName}
                  >
                    {fileData.fileName}
                  </h1>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Badge variant="outline" className="text-xs text-slate-600 border-slate-300 bg-slate-50 px-1.5 py-0.5">
                      PDF
                    </Badge>
                    {summaries.length > 0 && (
                      <Badge variant="outline" className="text-xs text-purple-600 border-purple-200 bg-purple-50 px-1.5 py-0.5">
                        <Bot className="h-3 w-3 mr-1" />
                        {summaries.length} AI
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Section: Actions - Hidden on mobile, shown in dropdown */}
            <div className="hidden sm:flex items-center gap-1.5">
              {/* File Actions */}
              {fileData.sourceUrl && (
                <Button
                  variant="outline"
                  onClick={openSourceUrl}
                  size="sm"
                  className="h-8 text-xs font-medium border-slate-300 hover:bg-slate-50 px-2.5"
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Source
                </Button>
              )}
              {!fileNotFound && (
                <Button
                  variant="outline"
                  onClick={downloadPdf}
                  size="sm"
                  disabled={!pdfBlob}
                  className="h-8 text-xs font-medium border-slate-300 hover:bg-slate-50 px-2.5"
                >
                  <DownloadCloud className="h-3 w-3 mr-1" />
                  Download
                </Button>
              )}
            </div>

            {/* Mobile Actions Menu */}
            <div className="flex sm:hidden">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                onClick={() => {
                  if (!fileNotFound && pdfBlob) {
                    downloadPdf();
                  }
                }}
              >
                <DownloadCloud className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Tabs Row - Compact Design */}
          <div className="pb-2 sm:pb-3">
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
              <TabsList className="grid w-full grid-cols-2 max-w-xs bg-slate-100 rounded-2xl p-0.5 h-10 shadow-sm border border-slate-200/50">
                <TabsTrigger 
                  value="document" 
                  className="flex items-center justify-center gap-1.5 h-9 px-3 text-sm font-medium rounded-xl transition-all duration-200 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm data-[state=inactive]:text-slate-600 data-[state=inactive]:hover:text-slate-800 data-[state=inactive]:hover:bg-white/50"
                >
                  <FileCheck className="h-3.5 w-3.5" />
                  <span className="font-heading hidden xs:inline">Document</span>
                  <span className="font-heading xs:hidden">Doc</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="summary" 
                  className="flex items-center justify-center gap-1.5 h-9 px-3 text-sm font-medium rounded-xl transition-all duration-200 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm data-[state=inactive]:text-slate-600 data-[state=inactive]:hover:text-slate-800 data-[state=inactive]:hover:bg-white/50"
                >
                  <Bot className="h-3.5 w-3.5" />
                  <span className="font-heading hidden xs:inline">AI Summary</span>
                  <span className="font-heading xs:hidden">AI</span>
                  {summaries.length > 0 && (
                    <Badge variant="secondary" className="ml-1 text-xs bg-purple-100 text-purple-700 border-purple-200 px-1 py-0 font-medium h-4 min-w-4 rounded-full flex items-center justify-center">
                      {summaries.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* PDF Controls Row - Only show on document tab and when PDF is available */}
          {!fileNotFound && activeTab === 'document' && (
            <div className="pb-2 sm:pb-3 border-t border-slate-100">
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-0.5 bg-slate-50 rounded-2xl p-0.5 border border-slate-200/60">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={zoomOut}
                    disabled={scale <= 0.5}
                    className="h-8 w-8 p-0 rounded-xl hover:bg-white disabled:opacity-50 transition-all"
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </Button>
                  <div className="px-2 py-1 text-xs font-medium text-slate-600 min-w-[3rem] text-center bg-white rounded-lg border border-slate-200/60 mx-0.5">
                    {Math.round(scale * 100)}%
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={zoomIn}
                    disabled={scale >= 3}
                    className="h-8 w-8 p-0 rounded-xl hover:bg-white disabled:opacity-50 transition-all"
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </Button>
                  <div className="w-px h-5 bg-slate-300 mx-1"></div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={rotate}
                    className="h-8 w-8 p-0 rounded-xl hover:bg-white transition-all"
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleFullscreen}
                    className="h-8 w-8 p-0 rounded-xl hover:bg-white transition-all"
                  >
                    <Maximize className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Mobile Actions for Document Tab */}
                <div className="flex sm:hidden items-center gap-1">
                  {fileData.sourceUrl && (
                    <Button
                      variant="outline"
                      onClick={openSourceUrl}
                      size="sm"
                      className="h-8 px-2.5 text-xs border-slate-300 rounded-lg"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={downloadPdf}
                    size="sm"
                    disabled={!pdfBlob}
                    className="h-8 px-2.5 text-xs border-slate-300 rounded-lg"
                  >
                    <DownloadCloud className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className="file-detail-content">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="h-full">
          <TabsContent value="document" className="h-full m-0 p-0">
            {fileNotFound ? (
              <FileNotFoundView />
            ) : (
              <div className="h-full bg-slate-50">
                <PDFRenderer
                  file={pdfBlob}
                  isLoading={isLoading}
                  scale={scale}
                  onScaleChange={setScale}
                  rotation={rotation}
                  onRotationChange={setRotation}
                  onFullscreenToggle={toggleFullscreen}
                />
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="summary" className="h-full m-0 p-0 overflow-y-auto bg-slate-50">
            <SummaryView />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
} 