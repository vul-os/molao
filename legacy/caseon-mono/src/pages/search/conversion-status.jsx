import React from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ConversionStatus({ isConverting, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center h-32 gap-3">
      {isConverting ? (
        <>
          <Loader2 className="h-6 w-6 text-green-700 animate-spin" />
          <span className="text-sm text-slate-600">Converting RTF to HTML...</span>
        </>
      ) : (
        <>
          <div className="text-amber-600 bg-amber-50 p-3 rounded-full">
            <RefreshCw className="h-6 w-6" />
          </div>
          <div className="text-center">
            <p className="text-sm text-slate-600">Failed to convert RTF file</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRetry}
              className="mt-2 text-green-700 hover:text-green-800"
            >
              Try again
            </Button>
          </div>
        </>
      )}
    </div>
  );
} 