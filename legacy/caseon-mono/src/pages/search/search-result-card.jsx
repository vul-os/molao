import { ArrowUpRight, FileText, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import MarkdownRenderer from "@/components/markdown-renderer";

export default function SearchResultCard({ 
  file, 
  expandedSummaries, 
  onToggleSummary, 
  onFileClick,
  isReranking = false,
  showRerankBadge = false,
  resultIndex = 0
}) {
  const isExpanded = expandedSummaries.has(file.id);

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Card
            className={cn(
              "cursor-pointer transition-all hover:border-green-200 hover:bg-green-50/50 border-slate-200/80 bg-white/95 backdrop-blur-sm group overflow-hidden",
              "hover:shadow-lg hover:shadow-green-100/50 hover:-translate-y-0.5",
              isReranking && "ring-1 ring-blue-200 bg-blue-50/20",
              showRerankBadge && "ring-2 ring-blue-300 ring-offset-1"
            )}
            onClick={(e) => {
              // Don't toggle if clicking on summary expand button or arrow
              if (e.target.closest('.summary-expand-btn') || e.target.closest('.document-nav-btn')) {
                e.stopPropagation();
                return;
              }
              // Always navigate to document when clicking card
              onFileClick(file);
            }}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 bg-green-50 p-2.5 rounded-lg group-hover:bg-green-100 transition-colors">
                  <FileText className="h-5 w-5 text-green-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1">
                      <div className="flex items-start gap-2 mb-1">
                        {/* Position indicator */}
                        <span className="flex-shrink-0 w-6 h-6 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center text-xs font-medium">
                          {resultIndex}
                        </span>
                        <div className="flex-1">
                          <p className="font-heading text-sm font-semibold text-slate-900 line-clamp-2 leading-tight">
                            {file.file_title || file.file_name}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs text-slate-500">
                              PDF • {file.file_size ? `${(file.file_size / 1024).toFixed(1)} KB` : 'Unknown size'}
                            </p>
                            {showRerankBadge && (
                              <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full reranked-badge">
                                <Sparkles className="h-3 w-3" />
                                Reranked
                              </span>
                            )}
                            {file.score && (
                              <span className="text-xs text-slate-400">
                                {file.score.toFixed(1)}% match
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* AI Summary Toggle Button */}
                      {file.summaries && file.summaries.length > 0 && file.summaries.some(s => s?.content?.trim()) && (
                        <button
                          className={cn(
                            "summary-expand-btn flex items-center justify-center w-8 h-8 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full hover:from-purple-600 hover:to-blue-600 transition-all duration-300 hover:scale-110 hover:shadow-md",
                            "active:scale-95 active:shadow-lg",
                            isExpanded && "ring-2 ring-purple-300 ring-offset-2 shadow-lg scale-105"
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            // Add a small delay for the click animation
                            const button = e.currentTarget;
                            button.style.transform = 'scale(0.9)';
                            setTimeout(() => {
                              button.style.transform = '';
                              onToggleSummary(file.id);
                            }, 150);
                          }}
                          title="AI summary"
                        >
                          <Sparkles className={cn(
                            "h-3 w-3 text-white transition-transform duration-300",
                            isExpanded && "rotate-180"
                          )} />
                        </button>
                      )}
                      {/* View Document Button */}
                      <button
                        className="document-nav-btn bg-slate-100/80 rounded-full p-2 group-hover:bg-green-100 transition-all group-hover:scale-110 hover:shadow-md"
                        onClick={(e) => {
                          e.stopPropagation();
                          onFileClick(file);
                        }}
                        title="View full document"
                      >
                        <ArrowUpRight className="h-4 w-4 text-slate-500 group-hover:text-green-700 transition-colors" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* AI Summary Section - Full width on mobile */}
              {file.summaries && file.summaries.length > 0 && file.summaries.some(s => s?.content?.trim()) && isExpanded && (
                <div className="mt-0 pt-0 border-t border-slate-100 animate-in slide-in-from-top-2 duration-300 fade-in">
                  <div className="space-y-4 sm:space-y-5">
                    {file.summaries
                      .filter(summary => summary?.content?.trim()) // Filter out empty summaries
                      .map((summary, idx) => (
                        <div 
                          key={idx} 
                          className="bg-gradient-to-br from-slate-50/90 via-purple-50/30 to-blue-50/40 rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-slate-100/80 shadow-sm hover:shadow-lg transition-all duration-300 backdrop-blur-sm w-full animate-in slide-in-from-bottom-3 fade-in duration-300"
                          style={{ animationDelay: `${idx * 75 + 200}ms` }}
                        >
                          <div className="rounded-lg sm:rounded-xl">
                            <MarkdownRenderer
                              content={summary.content}
                              compact={false}
                              className="leading-relaxed text-xs sm:text-sm w-full"
                            />
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TooltipTrigger>
        <TooltipContent side="top" className="p-2 bg-slate-900 text-white max-w-md">
          <p className="text-sm font-medium">{file.file_title || file.file_name}</p>
          <p className="text-xs opacity-80">
            Click to view full document
            {file.summaries && file.summaries.length > 0 && " • AI summaries available"}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
} 