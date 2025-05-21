import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Loader2, FileText, DownloadCloud, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL } from "./constants";

// Improved PDF Viewer component
const PDFViewer = ({ url, token, title }) => {
  const [pdfObjectUrl, setPdfObjectUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    if (!url || !token) return;
    
    setIsLoading(true);
    
    // Create a new URL with query parameter to indicate inline viewing
    const viewUrl = new URL(url);
    viewUrl.searchParams.append('view', 'inline');
    
    // Fetch the PDF with authentication
    fetch(viewUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${token.trim()}`,
        'Accept': 'application/pdf'
      }
    })
    .then(response => {
      // Log response headers for debugging
      console.log('PDF Response headers:', {
        type: response.headers.get('content-type'),
        disposition: response.headers.get('content-disposition')
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.status}`);
      }
      return response.blob();
    })
    .then(blob => {
      // Create an object URL from the blob
      const objectUrl = window.URL.createObjectURL(
        new Blob([blob], { type: 'application/pdf' })
      );
      setPdfObjectUrl(objectUrl);
      setIsLoading(false);
    })
    .catch(err => {
      console.error('Error loading PDF:', err);
      setError(err.message);
      setIsLoading(false);
    });
    
    // Clean up object URL when component unmounts
    return () => {
      if (pdfObjectUrl) {
        window.URL.revokeObjectURL(pdfObjectUrl);
      }
    };
  }, [url, token]);
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 text-green-700 animate-spin" />
        <span className="ml-2 text-sm text-slate-600">Loading PDF...</span>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-red-500">Error loading PDF: {error}</p>
      </div>
    );
  }
  
  return (
    <iframe
      src={pdfObjectUrl}
      type="application/pdf"
      className="w-full h-full border-0"
      title={title}
    />
  );
};

export default function FileDetailPage() {
  const { fileId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [fileName, setFileName] = useState("Document");
  const [isLoading, setIsLoading] = useState(true);
  const [pdfUrl, setPdfUrl] = useState(null);
  
  // Store the incoming search state to use when going back
  const [searchState, setSearchState] = useState({
    searchResults: location.state?.searchResults || [],
    searchQuery: location.state?.searchQuery || ""
  });

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
          setFileName(fileFromResults.file_name || "Document");
        }
      }
    }
  }, [location.state, fileId]);

  useEffect(() => {
    if (fileId) {
      loadPdf();
    }
  }, [fileId]);

  const loadPdf = async () => {
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

      // Direct PDF file endpoint
      const pdfEndpoint = `${API_BASE_URL}/file/${fileId}/pdf`;
      setPdfUrl(pdfEndpoint);
      setIsLoading(false);
    } catch (error) {
      console.error('PDF load error:', error);
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
    if (!pdfUrl) return;
    
    // Add the auth token to the request
    fetch(pdfUrl, {
      headers: {
        'Authorization': `Bearer ${user.access_token.trim()}`
      }
    })
    .then(response => response.blob())
    .then(blob => {
      const url = window.URL.createObjectURL(blob);
      const linkElement = document.createElement('a');
      linkElement.href = url;
      linkElement.setAttribute('download', `${fileName || 'document'}.pdf`);
      document.body.appendChild(linkElement);
      linkElement.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(linkElement);
    })
    .catch(error => {
      console.error('Download error:', error);
      toast({
        title: "Download failed",
        description: "Failed to download the PDF. Please try again.",
        variant: "destructive"
      });
    });
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
                {fileName}
              </h1>
              <Badge variant="outline" className="text-xs text-slate-600">
                PDF
              </Badge>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={downloadPdf}
              className="flex items-center gap-1 text-sm px-3"
              size="sm"
            >
              <DownloadCloud className="h-3.5 w-3.5" />
              <span>Download PDF</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Content area - make it fill remaining space */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full bg-slate-50">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 text-green-700 animate-spin" />
              <span className="ml-2 text-sm text-slate-600">Loading PDF...</span>
            </div>
          ) : pdfUrl ? (
            <div className="h-full">
              <PDFViewer 
                url={pdfUrl} 
                token={user.access_token} 
                title={fileName}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-slate-500">No content available</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 