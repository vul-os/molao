import React, { useState, useRef, useEffect } from 'react';
import { usePdf } from '@mikecousins/react-pdf';
import { Loader2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PDFViewer({ pdfBlob }) {
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // Determine initial scale based on screen size
  useEffect(() => {
    const setInitialScale = () => {
      if (window.innerWidth < 768) { // Mobile
        setScale(0.8);
      } else if (window.innerWidth < 1024) { // Tablet
        setScale(1.0);
      } else { // Desktop
        setScale(1.2);
      }
    };
    
    setInitialScale();
    
    // Update scale on window resize
    const handleResize = () => {
      setInitialScale();
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Use the PDF hook with the blob directly
  const { pdfDocument, pdfPage } = usePdf({
    file: pdfBlob,
    page,
    scale,
    canvasRef,
    workerSrc: '//cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js',
    onDocumentLoadSuccess: (pdf) => {
      setNumPages(pdf.numPages);
      setLoading(false);
    },
    onDocumentLoadFail: (error) => {
      console.error('Failed to load PDF document:', error);
      setError('Failed to load PDF document');
      setLoading(false);
    }
  });

  // Navigation functions
  const previousPage = () => {
    setPage((prev) => Math.max(prev - 1, 1));
  };

  const nextPage = () => {
    setPage((prev) => Math.min(prev + 1, numPages));
  };

  // Zoom functions
  const zoomIn = () => {
    setScale((prev) => Math.min(prev + 0.2, 2.5));
  };

  const zoomOut = () => {
    setScale((prev) => Math.max(prev - 0.2, 0.5));
  };

  return (
    <div className="flex flex-col h-full" ref={containerRef}>
      {/* PDF controls */}
      <div className="bg-white border-b border-slate-200 py-2 px-4 flex flex-wrap items-center justify-between">
        <div className="flex items-center gap-2 mb-2 sm:mb-0">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={previousPage} 
            disabled={page <= 1 || loading || !pdfDocument}
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <span className="text-sm text-slate-600">
            Page {page} of {numPages || '?'}
          </span>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={nextPage} 
            disabled={page >= numPages || loading || !pdfDocument}
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={zoomOut}
            disabled={loading || !pdfDocument}
            className="h-8 w-8 p-0"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          
          <span className="text-sm text-slate-600">
            {Math.round(scale * 100)}%
          </span>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={zoomIn}
            disabled={loading || !pdfDocument}
            className="h-8 w-8 p-0"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* PDF viewer */}
      <div className="flex-1 overflow-auto bg-slate-100">
        {(loading || !pdfDocument) && !error && (
          <div className="flex items-center justify-center h-full w-full">
            <Loader2 className="h-8 w-8 text-green-700 animate-spin" />
            <span className="ml-2 text-slate-600">Loading PDF...</span>
          </div>
        )}
        
        {error && (
          <div className="flex items-center justify-center h-full w-full">
            <p className="text-red-500">{error}</p>
          </div>
        )}
        
        <div className="flex justify-center items-start min-h-full p-2 md:p-4">
          <div className="bg-white shadow-lg max-w-full overflow-auto">
            {pdfDocument && <canvas ref={canvasRef} className="block max-w-full" />}
          </div>
        </div>
      </div>
    </div>
  );
} 