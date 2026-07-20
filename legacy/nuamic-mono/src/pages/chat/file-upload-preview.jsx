import React from 'react';
import { Button } from "@/components/ui/button";
import { FileText, X } from 'lucide-react';

const FileUploadPreview = ({ files, onRemove }) => {
  if (!files.length) return null;
  
  return (
    <div className="mb-3 space-y-2">
      {files.map((file, index) => (
        <div key={index} className="flex items-center gap-3 p-2 bg-white rounded-lg border border-gray-200">
          <FileText className="h-4 w-4 text-blue-600" />
          <span className="text-sm text-gray-700 font-medium flex-1">{file.name}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 hover:bg-gray-100"
            onClick={() => onRemove(index)}
          >
            <X className="h-4 w-4 text-gray-600" />
          </Button>
        </div>
      ))}
    </div>
  );
};

export default FileUploadPreview;