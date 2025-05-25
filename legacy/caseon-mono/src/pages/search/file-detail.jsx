import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { FileText, DownloadCloud, ArrowLeft, ExternalLink, ZoomIn, ZoomOut, RotateCw, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL } from "./constants";
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
    sourceUrl: null
  });
  const [isLoading, setIsLoading] = useState(true);
  const [pdfBlob, setPdfBlob] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  
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
  console.log('FileDetailPage render:', { fileId, hasToken: !!user?.access_token, pdfBlob });

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
            fileName: fileFromResults.file_name || "Document"
          }));
        }
      }
    }
  }, [location.state, fileId]);

  useEffect(() => {
    // Debug log to verify if effect runs
    console.log('FileDetailPage useEffect triggered:', { fileId, hasToken: !!user?.access_token });
    
    let isMounted = true; // Add mounted check

    const loadFile = async () => {
      if (!fileId || !user?.access_token) return;
      
      setIsLoading(true);
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

        // First fetch metadata
        const metadataResponse = await fetch(`${API_BASE_URL}/file/${fileId}?include_metadata=true`, {
          headers: {
            'Authorization': `Bearer ${user.access_token.trim()}`,
            'Accept': 'application/json'
          }
        });
        
        if (!metadataResponse.ok) {
          throw new Error(`Failed to load file metadata: ${metadataResponse.status}`);
        }
        
        const metadata = await metadataResponse.json();
        
        if (!isMounted) return;

        // Update file metadata
        if (metadata.metadata) {
          setFileData({
            fileName: metadata.metadata.file_name || "Document",
            fileType: metadata.metadata.file_type || "pdf",
            mimeType: metadata.metadata.mime_type || "application/pdf",
            sourceUrl: metadata.metadata.source?.source_url || null
          });
        }

        // Then fetch PDF separately
        const pdfResponse = await fetch(`${API_BASE_URL}/file/${fileId}/pdf`, {
          headers: {
            'Authorization': `Bearer ${user.access_token.trim()}`,
            'Accept': 'application/pdf'
          }
        });
        
        if (!pdfResponse.ok) {
          throw new Error(`Failed to load PDF: ${pdfResponse.status}`);
        }

        const pdfBlob = await pdfResponse.blob();
        if (!isMounted) return;
        
        setPdfBlob(pdfBlob);
        setIsLoading(false);
      } catch (error) {
        console.error('File load error:', error);
        if (isMounted) {
          toast({
            title: "Error",
            description: error.message || "Failed to load the file. Please try again.",
            variant: "destructive"
          });
          setIsLoading(false);
        }
      }
    };

    loadFile();

    // Cleanup function
    return () => {
      isMounted = false;
    };
  }, [fileId, user?.access_token]); // Keep these dependencies

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
                <h1 className="font-heading text-base sm:text-lg font-medium text-slate-900 truncate">
                  {fileData.fileName}
                </h1>
                <Badge variant="outline" className="text-xs text-slate-600 flex-shrink-0">
                  PDF
                </Badge>
              </div>
            </div>

            {/* Right section: Actions and controls */}
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-end">
              {/* PDF Controls */}
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
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PDF Viewer - takes remaining height and scrolls internally */}
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
    </div>
  );
} 