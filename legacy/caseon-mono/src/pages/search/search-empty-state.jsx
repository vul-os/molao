import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SearchEmptyState({ 
  searchQuery, 
  onTryDifferentSearch,
  toast
}) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center pt-8">
      <div className="text-slate-300 mb-4">
        <Search className="h-12 w-12" />
      </div>
      <p className="font-heading text-xl text-slate-600 mb-2">No cases found</p>
      <p className="text-sm text-slate-500 mb-6 max-w-md">
        We couldn't find any cases matching "<span className="font-medium text-slate-700">{searchQuery}</span>"
      </p>
      
      <div className="flex flex-col sm:flex-row gap-3 items-center">
        <Button
          variant="outline"
          className="text-slate-700 font-medium border-slate-300 hover:bg-slate-50 bg-white/80 hover:border-slate-400 transition-all duration-300"
          onClick={onTryDifferentSearch}
        >
          Try a different search
        </Button>
      </div>
    </div>
  );
} 