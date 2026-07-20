import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Quote, ExternalLink, Hash, List, CheckCircle } from 'lucide-react';

const MarkdownRenderer = ({ 
  content, 
  className = '', 
  compact = false,
  maxLength = null 
}) => {
  // Truncate content if maxLength is provided
  const processedContent = maxLength && content.length > maxLength 
    ? content.substring(0, maxLength) + '...'
    : content;

  const components = {
    // Headings with beautiful styling
    h1: ({ children, ...props }) => (
      <div className={cn(
        "space-y-2 sm:space-y-3 mb-4 sm:mb-6 first:mt-0",
        compact && "mb-3 sm:mb-4"
      )}>
        <h1 className={cn(
          "text-lg sm:text-xl font-bold text-slate-900 tracking-tight font-heading",
          compact && "text-base sm:text-lg"
        )} {...props}>
          <div className="flex items-center gap-2 sm:gap-3">
            <Hash className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 flex-shrink-0" />
            {children}
          </div>
        </h1>
        <Separator className="bg-gradient-to-r from-green-200 to-blue-200" />
      </div>
    ),
    h2: ({ children, ...props }) => (
      <div className={cn(
        "space-y-1 sm:space-y-2 mb-3 sm:mb-4 mt-4 sm:mt-6 first:mt-0",
        compact && "mb-2 sm:mb-3 mt-2 sm:mt-4"
      )}>
        <h2 className={cn(
          "text-base sm:text-lg font-semibold text-slate-800 tracking-tight font-heading",
          compact && "text-sm sm:text-base"
        )} {...props}>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-500 rounded-full flex-shrink-0"></div>
            {children}
          </div>
        </h2>
        <div className="h-px bg-gradient-to-r from-slate-200 to-transparent w-1/4 sm:w-1/3"></div>
      </div>
    ),
    h3: ({ children, ...props }) => (
      <h3 className={cn(
        "text-sm sm:text-base font-semibold text-slate-700 mb-2 sm:mb-3 mt-3 sm:mt-4 first:mt-0 font-heading tracking-tight",
        compact && "text-xs sm:text-sm mb-1 sm:mb-2 mt-1 sm:mt-2"
      )} {...props}>
        <div className="flex items-center gap-2">
          <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-purple-400 rounded-full flex-shrink-0"></div>
          {children}
        </div>
      </h3>
    ),
    
    // Beautiful paragraphs with proper spacing
    p: ({ children, ...props }) => (
      <p className={cn(
        "text-xs sm:text-sm text-slate-700 leading-relaxed mb-3 sm:mb-4 last:mb-0 font-medium",
        compact && "mb-2 sm:mb-3"
      )} {...props}>
        {children}
      </p>
    ),
    
    // Enhanced lists with icons
    ul: ({ children, ...props }) => (
      <Card className={cn(
        "mb-3 sm:mb-4 border-l-2 sm:border-l-4 border-l-green-200 bg-gradient-to-r from-green-50/30 to-transparent",
        compact && "mb-2 sm:mb-3"
      )}>
        <CardContent className="p-3 sm:p-4">
          <ul className="space-y-1 sm:space-y-2 list-none" {...props}>
            {children}
          </ul>
        </CardContent>
      </Card>
    ),
    ol: ({ children, ...props }) => (
      <Card className={cn(
        "mb-3 sm:mb-4 border-l-2 sm:border-l-4 border-l-blue-200 bg-gradient-to-r from-blue-50/30 to-transparent",
        compact && "mb-2 sm:mb-3"
      )}>
        <CardContent className="p-3 sm:p-4">
          <ol className="space-y-1 sm:space-y-2 list-none counter-reset-list" {...props}>
            {children}
          </ol>
        </CardContent>
      </Card>
    ),
    li: ({ children, ...props }) => (
      <li className="flex items-start gap-2 sm:gap-3 text-xs sm:text-sm text-slate-700 leading-relaxed" {...props}>
        <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 text-green-500 mt-0.5 flex-shrink-0" />
        <span>{children}</span>
      </li>
    ),
    
    // Enhanced emphasis with beautiful styling
    strong: ({ children, ...props }) => (
      <Badge variant="secondary" className="font-semibold bg-slate-100 text-slate-900 px-1.5 sm:px-2 py-0.5 text-xs font-mono inline-flex" {...props}>
        {children}
      </Badge>
    ),
    em: ({ children, ...props }) => (
      <em className="italic text-slate-800 font-medium bg-purple-50 px-1 py-0.5 rounded text-xs sm:text-sm" {...props}>
        {children}
      </em>
    ),
    
    // Beautiful code blocks
    code: ({ children, inline, ...props }) => 
      inline ? (
        <Badge variant="outline" className="bg-slate-50 text-slate-800 border-slate-200 font-mono text-xs px-1.5 sm:px-2 py-0.5 sm:py-1" {...props}>
          {children}
        </Badge>
      ) : (
        <Card className="mb-3 sm:mb-4 overflow-hidden">
          <CardContent className="p-0">
            <ScrollArea className="max-h-48 sm:max-h-64">
              <pre className="bg-slate-900 text-slate-100 p-3 sm:p-4 overflow-x-auto text-xs sm:text-sm font-mono leading-relaxed">
                <code {...props}>{children}</code>
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>
      ),
    
    // Stunning blockquotes
    blockquote: ({ children, ...props }) => (
      <Card className={cn(
        "mb-3 sm:mb-4 bg-gradient-to-r from-green-50 to-blue-50 border-l-2 sm:border-l-4 border-l-green-400 shadow-sm",
        compact && "mb-2 sm:mb-3"
      )}>
        <CardContent className="p-3 sm:p-4">
          <div className="flex gap-2 sm:gap-3">
            <Quote className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 mt-1 flex-shrink-0" />
            <div className="text-xs sm:text-sm text-slate-700 italic font-medium leading-relaxed" {...props}>
              {children}
            </div>
          </div>
        </CardContent>
      </Card>
    ),
    
    // Enhanced links
    a: ({ children, href, ...props }) => (
      <a 
        href={href} 
        className="inline-flex items-center gap-1 text-green-600 hover:text-green-700 font-medium transition-all hover:bg-green-50 px-1 py-0.5 rounded underline decoration-green-300 hover:decoration-green-500 text-xs sm:text-sm"
        target="_blank"
        rel="noopener noreferrer"
        {...props}
      >
        {children}
        <ExternalLink className="h-2.5 w-2.5 sm:h-3 sm:w-3 flex-shrink-0" />
      </a>
    ),
    
    // Beautiful tables - more mobile friendly
    table: ({ children, ...props }) => (
      <Card className="mb-3 sm:mb-4 overflow-hidden">
        <CardContent className="p-0">
          <ScrollArea className="w-full">
            <div className="min-w-full">
              <table className="w-full border-collapse text-xs sm:text-sm" {...props}>
                {children}
              </table>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    ),
    th: ({ children, ...props }) => (
      <th className="bg-gradient-to-r from-slate-100 to-slate-50 px-2 sm:px-4 py-2 sm:py-3 text-left font-semibold text-slate-800 text-xs sm:text-sm border-b border-slate-200" {...props}>
        {children}
      </th>
    ),
    td: ({ children, ...props }) => (
      <td className="px-2 sm:px-4 py-2 sm:py-3 text-slate-700 text-xs sm:text-sm border-b border-slate-100 last:border-b-0" {...props}>
        {children}
      </td>
    ),
    
    // Elegant horizontal rules
    hr: ({ ...props }) => (
      <div className="my-4 sm:my-6 flex items-center gap-3 sm:gap-4" {...props}>
        <Separator className="flex-1 bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
        <div className="flex gap-1">
          <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-400 rounded-full"></div>
          <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-400 rounded-full"></div>
          <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-purple-400 rounded-full"></div>
        </div>
        <Separator className="flex-1 bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
      </div>
    ),
  };

  return (
    <div className={cn(
      "prose prose-slate prose-sm max-w-none",
      "prose-headings:font-heading prose-headings:tracking-tight",
      "prose-p:text-slate-700 prose-p:leading-relaxed",
      "prose-li:text-slate-700 prose-li:leading-relaxed",
      "prose-strong:text-slate-900 prose-strong:font-semibold",
      className
    )}>
      <style>{`
        .counter-reset-list {
          counter-reset: list-counter;
        }
        .counter-reset-list li {
          counter-increment: list-counter;
        }
        .counter-reset-list li::before {
          content: counter(list-counter) ".";
          font-weight: 600;
          color: rgb(59 130 246);
          margin-right: 0.5rem;
          font-size: 0.75rem;
        }
        @media (min-width: 640px) {
          .counter-reset-list li::before {
            font-size: 0.875rem;
          }
        }
      `}</style>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer; 