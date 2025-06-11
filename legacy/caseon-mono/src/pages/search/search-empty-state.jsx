import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SearchEmptyState({ 
  searchQuery, 
  scoreThreshold, 
  onReduceSensitivity, 
  onTryDifferentSearch,
  toast
}) {
  const handleReduceSensitivity = () => {
    const newThreshold = Math.max(0.1, scoreThreshold - 0.05);
    onReduceSensitivity(newThreshold);
    toast({
      title: "Sensitivity reduced",
      description: `Search sensitivity lowered to ${Math.round(newThreshold * 100)}% for broader results.`,
    });
  };

  return (
    <div className="flex flex-col items-center justify-center h-64 text-center pt-8">
      <div className="text-slate-300 mb-4">
        <Search className="h-12 w-12" />
      </div>
      <p className="font-heading text-xl text-slate-600 mb-2">No cases found</p>
      <p className="text-sm text-slate-500 mb-2 max-w-md">
        We couldn't find any cases matching "<span className="font-medium text-slate-700">{searchQuery}</span>"
      </p>
      <p className="text-xs text-slate-400 mb-6">
        Current sensitivity: {Math.round(scoreThreshold * 100)}%
      </p>
      
      <div className="flex flex-col sm:flex-row gap-3 items-center">
        {/* Reduce Sensitivity Button - only show if sensitivity is above minimum */}
        {scoreThreshold > 0.1 && (
          <Button
            className="bg-gradient-to-r from-black to-gray-600 hover:from-gray-900 hover:to-gray-500 text-white font-medium transition-all duration-300 shadow-lg hover:shadow-xl"
            onClick={handleReduceSensitivity}
          >
            Reduce Sensitivity ({Math.round(Math.max(0.1, scoreThreshold - 0.05) * 100)}%)
          </Button>
        )}
        
        <Button
          variant="outline"
          className="text-slate-700 font-medium border-slate-300 hover:bg-slate-50 bg-white/80 hover:border-slate-400 transition-all duration-300"
          onClick={onTryDifferentSearch}
        >
          Try a different search
        </Button>
      </div>
      
      {scoreThreshold <= 0.1 && (
        <p className="text-xs text-amber-600 mt-4 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
          Sensitivity is at minimum (10%). Try different search terms or check search settings.
        </p>
      )}
    </div>
  );
} 