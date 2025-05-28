import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { FileText, DownloadCloud, ArrowLeft, ExternalLink, ZoomIn, ZoomOut, RotateCw, Maximize, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/services/supabase-client";
import PDFRenderer from "@/components/pdf-renderer";

export default function FileDetailPage() {
  const { fileId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [fileData, setFileData] = useState({
    fileName: "Document",
    fileType: "pdf",
    mimeType: "application/pdf",
    sourceUrl: null,
    cdnUrl: null
  });
  const [isLoading, setIsLoading] = useState(true);
  const [pdfBlob, setPdfBlob] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [fileNotFound, setFileNotFound] = useState(false);
  
  // Store the incoming search state to use when going back
  const [searchState, setSearchState] = useState({
    searchResults: location.state?.searchResults || [],
    searchQuery: location.state?.searchQuery || ""
  });

  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
        }
      }
    }
  }, [location.state, fileId]);

  useEffect(() => {
    // Debug log to verify if effect runs
    console.log('FileDetailPage useEffect triggered:', { fileId, hasUser: !!user });
    
    let isMounted = true; // Add mounted check

    const loadFile = async () => {
      if (!fileId || !user) return;
      
      setIsLoading(true);
      setFileNotFound(false);
      
      try {
        if (!user) {
          // navigate('/sigenin');
          return;
        }

        // Fetch file metadata from Supabase
        const { data: fileRecord, error } = await supabase
          .from('files')
          .select('*')
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

        // Try to fetch PDF from CDN URL
        if (updatedFileData.cdnUrl) {
          // Replace .rtf with .pdf in the CDN URL
          const pdfUrl = updatedFileData.cdnUrl.replace(/\.rtf$/i, '.pdf');
          
          try {
            // Fetch directly from CDN URL without proxy
            const pdfResponse = await fetch(pdfUrl);
            
            if (!pdfResponse.ok) {
              throw new Error(`PDF not found: ${pdfResponse.status}`);
            }

            const pdfBlob = await pdfResponse.blob();
            
            // Verify it's actually a PDF
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
          // No CDN URL available
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
        }
      }
    };

    loadFile();

    // Cleanup function
    return () => {
      isMounted = false;
    };
  }, [fileId, user]); // Keep these dependencies

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
      {/* Header - not fixed since we're inside MainLayout */}
      <div className="bg-white border-b border-slate-200 px-4 py-2">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            {/* Left section: Back button and file info */}
            <div className="flex items-center gap-2 sm:gap-4">
              <Button 
                variant="ghost" 
                onClick={handleGoBack}
                className="p-1 h-auto text-slate-600 hover:text-slate-900"
                aria-label="Back to search"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-5 w-5 text-green-700 flex-shrink-0" />
                <h1 
                  className="font-heading text-base sm:text-lg font-medium text-slate-900 truncate max-w-xs sm:max-w-md lg:max-w-lg"
                  title={fileData.fileName}
                >
                  {fileData.fileName}
                </h1>
                <Badge variant="outline" className="text-xs text-slate-600 flex-shrink-0">
                  PDF
                </Badge>
              </div>
            </div>

            {/* Right section: Actions and controls */}
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-end">
              {/* PDF Controls - only show if PDF is loaded */}
              {!fileNotFound && (
                <div className="flex items-center gap-1 sm:gap-2 bg-slate-50 rounded-lg p-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={zoomOut}
                    disabled={scale <= 0.5}
                    className="h-8 w-8 p-0"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-slate-600 min-w-[3rem] text-center">
                    {Math.round(scale * 100)}%
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={zoomIn}
                    disabled={scale >= 3}
                    className="h-8 w-8 p-0"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={rotate}
                    className="h-8 w-8 p-0"
                  >
                    <RotateCw className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleFullscreen}
                    className="h-8 w-8 p-0"
                  >
                    <Maximize className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* File Actions */}
              <div className="flex items-center gap-2">
                {fileData.sourceUrl && (
                  <Button
                    variant="outline"
                    onClick={openSourceUrl}
                    className="flex items-center gap-1 text-sm px-3"
                    size="sm"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">View Source</span>
                  </Button>
                )}
                {!fileNotFound && (
                  <Button
                    variant="outline"
                    onClick={downloadPdf}
                    className="flex items-center gap-1 text-sm px-3"
                    size="sm"
                    disabled={!pdfBlob}
                  >
                    <DownloadCloud className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Download</span>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PDF Viewer or File Not Found - takes remaining height and scrolls internally */}
      {fileNotFound ? (
        <FileNotFoundView />
      ) : (
        <div className="flex-1 bg-slate-50 overflow-hidden">
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
    </div>
  );
} 