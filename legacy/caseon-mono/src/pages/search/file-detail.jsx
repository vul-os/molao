import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Loader2, FileText, DownloadCloud, ArrowLeft, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL } from "./constants";

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
  
  // Store the incoming search state to use when going back
  const [searchState, setSearchState] = useState({
    searchResults: location.state?.searchResults || [],
    searchQuery: location.state?.searchQuery || ""
  });

  // Create URL for the PDF blob
  const pdfUrl = useMemo(() => {
    if (!pdfBlob) return '';
    return URL.createObjectURL(pdfBlob);
  }, [pdfBlob]);

  // Clean up the object URL when component unmounts
  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

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
    
    if (fileId && user?.access_token) {
      loadFileMetadata();
    }
  }, [fileId, user?.access_token]);

  const loadFileMetadata = async () => {
    console.log('Loading file metadata for:', fileId);
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

      // Single API call to fetch metadata
      const metadataEndpoint = `${API_BASE_URL}/file/${fileId}?include_metadata=true`;
      console.log('Fetching metadata from:', metadataEndpoint);
      
      const response = await fetch(metadataEndpoint, {
        headers: {
          'Authorization': `Bearer ${user.access_token.trim()}`
        }
      });
      
      console.log('Metadata API response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`Failed to load file metadata: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Metadata received:', data);
      
      // Update all file data at once to prevent multiple state updates
      if (data.metadata) {
        setFileData({
          fileName: data.metadata.file_name || "Document",
          fileType: data.metadata.file_type || "pdf",
          mimeType: data.metadata.mime_type || "application/pdf",
          sourceUrl: data.metadata.source?.source_url || null
        });
      }

      // Fetch the PDF content
      await fetchPdf();
    } catch (error) {
      console.error('File metadata load error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to load the file. Please try again.",
        variant: "destructive"
      });
      setIsLoading(false);
    }
  };

  const fetchPdf = async () => {
    try {
      const pdfEndpoint = `${API_BASE_URL}/file/${fileId}/pdf`;
      
      const response = await fetch(pdfEndpoint, {
        headers: {
          'Authorization': `Bearer ${user.access_token.trim()}`,
          'Accept': 'application/pdf'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.status}`);
      }
      
      const blob = await response.blob();
      setPdfBlob(blob);
      setIsLoading(false);
    } catch (error) {
      console.error('PDF fetch error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to load the PDF. Please try again.",
        variant: "destructive"
      });
      setIsLoading(false);
    }
  };

  const handleGoBack = () => {
    // Navigate explicitly back to search page with the preserved state
    navigate('/search', { 
      state: searchState,
      replace: false
    });
  };

  const downloadPdf = () => {
    if (!pdfBlob) return;
    
    // Create a download link for the blob
    const url = window.URL.createObjectURL(pdfBlob);
    const linkElement = document.createElement('a');
    linkElement.href = url;
    linkElement.setAttribute('download', `${fileData.fileName || 'document'}.pdf`);
    document.body.appendChild(linkElement);
    linkElement.click();
    window.URL.revokeObjectURL(url);
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

  return (
    <div className="flex flex-col h-full">
      {/* Compact header with integrated back button and actions */}
      <div className="bg-white border-b border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              onClick={handleGoBack}
              className="p-1 h-auto text-slate-600 hover:text-slate-900"
              aria-label="Back to search"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-green-700" />
              <h1 className="font-heading text-lg font-medium text-slate-900 line-clamp-1">
                {fileData.fileName}
              </h1>
              <Badge variant="outline" className="text-xs text-slate-600">
                PDF
              </Badge>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {fileData.sourceUrl && (
              <Button
                variant="outline"
                onClick={openSourceUrl}
                className="flex items-center gap-1 text-sm px-3"
                size="sm"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>View Source</span>
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
              <span>Download PDF</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Content area - make it fill remaining space */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full bg-slate-50">
            <Loader2 className="h-6 w-6 text-green-700 animate-spin" />
            <span className="ml-2 text-sm text-slate-600">Loading document...</span>
          </div>
        ) : pdfUrl ? (
          <iframe
            src={pdfUrl}
            className="w-full h-full border-0"
            title={fileData.fileName}
          />
        ) : (
          <div className="flex items-center justify-center h-full bg-slate-50">
            <p className="text-slate-500">No content available</p>
          </div>
        )}
      </div>
    </div>
  );
} 