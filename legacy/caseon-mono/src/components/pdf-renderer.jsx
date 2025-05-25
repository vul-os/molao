import { useState, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { useResizeObserver } from '@wojtekmaj/react-hooks';
import { Loader2, ZoomIn, ZoomOut, RotateCw, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// Configure PDF.js worker for Vite with ES modules
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const options = {
  cMapUrl: '/cmaps/',
  standardFontDataUrl: '/standard_fonts/',
};

const maxWidth = 800;

export default function PDFRenderer({ 
  file, 
  isLoading,
  scale,
  rotation,
  className = ""
}) {
  const [numPages, setNumPages] = useState(null);
  const [containerRef, setContainerRef] = useState(null);
  const [containerWidth, setContainerWidth] = useState();

  // Handle container resize
  const onResize = useCallback((entries) => {
    const [entry] = entries;
    if (entry) {
      setContainerWidth(entry.contentRect.width);
    }
  }, []);

  useResizeObserver(containerRef, {}, onResize);

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 text-green-700 animate-spin" />
        <span className="ml-2 text-sm text-slate-600">Loading document...</span>
      </div>
    );
  }

  if (!file) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-slate-500">No content available</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* PDF Document */}
      <div className="flex-1 overflow-auto p-4" ref={setContainerRef}>
        {/* Center container with max width */}
        <div className="max-w-4xl mx-auto min-h-full flex items-center justify-center">
          <Document
            file={file}
            onLoadSuccess={onDocumentLoadSuccess}
            options={options}
            loading={
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 text-green-700 animate-spin" />
              </div>
            }
            error={
              <div className="text-center p-4 text-red-600">
                Failed to load PDF. Please try again.
              </div>
            }
            className="flex flex-col items-center"
          >
            {Array.from(new Array(numPages), (_, index) => (
              <Page
                key={`page_${index + 1}`}
                pageNumber={index + 1}
                width={containerWidth ? Math.min(containerWidth - 32, maxWidth) : maxWidth} // Subtract padding
                scale={scale}
                rotate={rotation}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                className="shadow-lg mb-4 bg-white"
                loading={
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="h-6 w-6 text-green-700 animate-spin" />
                  </div>
                }
              />
            ))}
          </Document>
        </div>
      </div>
    </div>
  );
} 