import { Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { suggestedSearches } from "./constants";

export default function SearchWelcome({ onSuggestionClick }) {
  return (
    <div className="pt-2 sm:pt-4 pb-6">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex flex-col items-center text-center gap-1 sm:gap-2 mb-4 sm:mb-8">
          <div className="bg-white/60 p-3 sm:p-4 rounded-full border border-slate-200/80">
            <Scale className="h-6 w-6 sm:h-8 sm:w-8 text-slate-700" />
          </div>
          <div>
            <h1 className="font-heading text-xl sm:text-2xl font-bold text-slate-800 mb-1 sm:mb-2">
              Legal Case Search
            </h1>
            <p className="text-sm text-slate-600 max-w-lg">
              Search through judgments from South African courts, including Constitutional Court,
              Supreme Court of Appeal, and High Courts.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 justify-center mb-6 sm:mb-8">
          <Badge variant="outline" className="bg-white/80 hover:bg-slate-50 cursor-pointer text-slate-700 hover:text-slate-800 border-slate-200/80 backdrop-blur-sm">Constitutional cases</Badge>
          <Badge variant="outline" className="bg-white/80 hover:bg-slate-50 cursor-pointer text-slate-700 hover:text-slate-800 border-slate-200/80 backdrop-blur-sm">Human rights</Badge>
          <Badge variant="outline" className="bg-white/80 hover:bg-slate-50 cursor-pointer text-slate-700 hover:text-slate-800 border-slate-200/80 backdrop-blur-sm">Property law</Badge>
          <Badge variant="outline" className="bg-white/80 hover:bg-slate-50 cursor-pointer text-slate-700 hover:text-slate-800 border-slate-200/80 backdrop-blur-sm">Contract law</Badge>
          <Badge variant="outline" className="bg-white/80 hover:bg-slate-50 cursor-pointer text-slate-700 hover:text-slate-800 border-slate-200/80 backdrop-blur-sm">Criminal procedure</Badge>
        </div>
        
        <div className="grid grid-cols-1 gap-8">
          {suggestedSearches.map((category, idx) => (
            <div key={idx} className="bg-white/40 backdrop-blur-sm rounded-xl p-6 border border-slate-200/60">
              <h3 className="font-heading text-lg font-semibold text-slate-800 tracking-wide mb-4 pb-2 border-b border-slate-200/80">
                {category.category}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {category.queries.map((suggestion, index) => (
                  <TooltipProvider key={index} delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          className="justify-start h-auto min-h-[60px] py-3 px-4 text-left text-sm text-slate-700 
                                hover:bg-slate-50/80 hover:text-slate-900 hover:border-slate-300
                                transition-all duration-200 border-slate-200/80 bg-white/60 backdrop-blur-sm whitespace-normal
                                hover:shadow-md hover:-translate-y-0.5"
                          onClick={() => onSuggestionClick(suggestion)}
                        >
                          <div className="flex items-start gap-3 w-full">
                            <Scale className="h-4 w-4 text-slate-700 mt-1 flex-shrink-0" />
                            <span className="leading-relaxed font-medium">{suggestion}</span>
                          </div>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs p-3 bg-slate-900 text-white">
                        <p className="text-sm">Click to search</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
} 