import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";

export default function SearchSettingsDialog({
  open,
  onOpenChange,
  scoreThreshold,
  setScoreThreshold,
  searchLimit,
  setSearchLimit
}) {
  const resetToDefaults = () => {
    setScoreThreshold(0.75);
    setSearchLimit(50);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-4">
          <DialogTitle className="flex items-center gap-3 text-lg sm:text-xl">
            <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-slate-100 to-slate-200 rounded-xl">
              <Settings className="h-4 w-4 sm:h-5 sm:w-5 text-slate-700" />
            </div>
            <div>
              <span className="font-heading">Search Configuration</span>
              <p className="text-xs sm:text-sm font-normal text-slate-600 mt-1">
                Customize search parameters for optimal legal research
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 sm:space-y-8 py-2">
          {/* Sensitivity Setting */}
          <div className="space-y-3 sm:space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base font-semibold text-slate-800">
                  Search Sensitivity
                </Label>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Controls how closely search results must match your query. Higher sensitivity returns fewer, more precise matches.
                </p>
              </div>
              <div className="flex flex-col items-center bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl px-3 py-2 sm:px-4 sm:py-3 border border-slate-200">
                <span className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-slate-700 to-slate-900 bg-clip-text text-transparent">
                  {Math.round(scoreThreshold * 100)}%
                </span>
                <span className="text-xs text-slate-500 font-medium">sensitivity</span>
              </div>
            </div>
            
            <div className="px-1">
              <Slider
                value={[scoreThreshold]}
                onValueChange={(value) => setScoreThreshold(value[0])}
                max={1.0}
                min={0.1}
                step={0.05}
                className="w-full"
              />
              <div className="flex justify-between mt-3 text-xs">
                <div className="text-center">
                  <div className="font-medium text-slate-700">10%</div>
                  <div className="text-slate-500">Broad</div>
                  <div className="text-slate-400 text-[10px] mt-0.5 hidden sm:block">More cases, less precise</div>
                </div>
                <div className="text-center">
                  <div className="font-medium text-slate-700">75%</div>
                  <div className="text-slate-500">Default</div>
                  <div className="text-slate-400 text-[10px] mt-0.5 hidden sm:block">Recommended</div>
                </div>
                <div className="text-center">
                  <div className="font-medium text-slate-700">100%</div>
                  <div className="text-slate-500">Precise</div>
                  <div className="text-slate-400 text-[10px] mt-0.5 hidden sm:block">Fewer cases, highly relevant</div>
                </div>
              </div>
            </div>
          </div>

          {/* Document Limit Setting */}
          <div className="space-y-3 sm:space-y-4">
            <div className="space-y-1">
              <Label className="text-sm sm:text-base font-semibold text-slate-800">
                Number of Documents
              </Label>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Maximum number of legal documents to return per search. More documents provide broader coverage but may take longer to review.
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
              <div className="flex-1">
                <Input
                  type="number"
                  value={searchLimit}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    if (value >= 1 && value <= 200) {
                      setSearchLimit(value);
                    }
                  }}
                  min={1}
                  max={200}
                  className="text-sm sm:text-base font-medium text-center h-10 sm:h-12"
                />
              </div>
              <div className="text-center sm:text-right">
                <div className="text-xs sm:text-sm text-slate-600">
                  <span className="font-medium">Range:</span> 1-200 documents
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {searchLimit <= 25 ? "Quick review" : 
                   searchLimit <= 75 ? "Standard research" : 
                   "Comprehensive analysis"}
                </div>
              </div>
            </div>
          </div>

          {/* Current Configuration Summary */}
          <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-3 sm:p-4 border border-slate-200">
            <h4 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <div className="w-2 h-2 bg-slate-500 rounded-full"></div>
              Current Configuration
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-sm">
              <div className="space-y-1">
                <div className="text-slate-600">Search Sensitivity</div>
                <div className="font-semibold text-slate-800">
                  {Math.round(scoreThreshold * 100)}%
                  <span className="text-xs font-normal text-slate-500 ml-1">
                    ({scoreThreshold <= 0.3 ? "Broad" : scoreThreshold <= 0.7 ? "Balanced" : "Precise"})
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-slate-600">Document Limit</div>
                <div className="font-semibold text-slate-800">
                  {searchLimit} documents
                </div>
              </div>
            </div>
            
            <div className="mt-3 pt-3 border-t border-slate-200">
              <div className="text-xs text-slate-600 leading-relaxed">
                <strong>Expected results:</strong> Your searches will return up to {searchLimit} documents 
                with {Math.round(scoreThreshold * 100)}% relevance matching, providing 
                {scoreThreshold <= 0.3 ? " comprehensive coverage with varied relevance" : 
                 scoreThreshold <= 0.7 ? " balanced results with good relevance" : 
                 " highly targeted results with strong relevance"}.
              </div>
            </div>
          </div>
        </div>
        
        <DialogFooter className="gap-2 sm:gap-3 pt-4 flex-col sm:flex-row">
          <Button
            variant="outline"
            onClick={resetToDefaults}
            className="w-full sm:w-auto order-2 sm:order-1"
          >
            Reset Defaults
          </Button>
          <Button
            onClick={() => onOpenChange(false)}
            className="bg-gradient-to-r from-black to-gray-600 hover:from-gray-900 hover:to-gray-500 text-white w-full sm:w-auto shadow-md hover:shadow-lg transition-all duration-300 order-1 sm:order-2"
          >
            Apply Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 