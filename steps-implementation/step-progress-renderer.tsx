import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown, ChevronRight, CheckCircle2, Loader2, Cog, Circle } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { ThinkingBars } from "./ui/animated-thinking-indicator";

interface StepProgressRendererProps {
  content: string;
  isStreaming?: boolean;
  isRunning?: boolean;
}

type StepStatus = 'started' | 'completed' | 'needs_input' | 'failed';

interface StepMeta {
  id: string;
  status: StepStatus;
}

interface ProgressLine {
  type: 'planning' | 'executing' | 'completed' | 'error';
  text: string;
  stepMeta?: StepMeta;
}

interface ParsedContent {
  progressLines: ProgressLine[];
  finalResponse: string;
  hasProgress: boolean;
  stepStateMap: Map<string, StepStatus>;
}

const STEP_META_REGEX = /<!-- stepMeta:(\{[^}]+\}) -->/;

const STATUS_PRIORITY: Record<StepStatus, number> = {
  'started': 0,
  'needs_input': 1,
  'failed': 2,
  'completed': 3,
};

function extractStepMeta(text: string): { cleanText: string; stepMeta?: StepMeta } {
  const match = text.match(STEP_META_REGEX);
  if (match) {
    try {
      const meta = JSON.parse(match[1]) as StepMeta;
      return {
        cleanText: text.replace(STEP_META_REGEX, '').trim(),
        stepMeta: meta,
      };
    } catch {
      return { cleanText: text.replace(STEP_META_REGEX, '').trim() };
    }
  }
  return { cleanText: text };
}

const STEP_UPDATE_REGEX = /<!-- stepUpdate:(\{[^}]+\}) -->/;

function parseProgressContent(content: string): ParsedContent {
  const lines = content.split('\n\n');
  const progressLines: ProgressLine[] = [];
  const stepStateMap = new Map<string, StepStatus>();
  let finalResponse = '';
  let inFinalResponse = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed === '---') {
      inFinalResponse = !inFinalResponse;
      continue;
    }
    
    const stepUpdateMatch = trimmed.match(STEP_UPDATE_REGEX);
    if (stepUpdateMatch) {
      try {
        const meta = JSON.parse(stepUpdateMatch[1]) as StepMeta;
        if (meta.id) {
          updateStepState(stepStateMap, meta.id, meta.status);
        }
      } catch { /* ignore parse errors */ }
      continue;
    }
    
    if (inFinalResponse) {
      finalResponse += (finalResponse ? '\n\n' : '') + line;
    } else if (trimmed.startsWith('**Planning:**')) {
      const rawText = trimmed.replace('**Planning:**', '').trim();
      const { cleanText, stepMeta } = extractStepMeta(rawText);
      progressLines.push({ type: 'planning', text: cleanText, stepMeta });
      if (stepMeta?.id) {
        updateStepState(stepStateMap, stepMeta.id, stepMeta.status);
      }
    } else if (trimmed.startsWith('**Executing:**')) {
      const rawText = trimmed.replace('**Executing:**', '').trim();
      const { cleanText, stepMeta } = extractStepMeta(rawText);
      progressLines.push({ type: 'executing', text: cleanText, stepMeta });
      if (stepMeta?.id) {
        updateStepState(stepStateMap, stepMeta.id, stepMeta.status);
      }
    } else if (trimmed.startsWith('**Completed:**')) {
      const rawText = trimmed.replace('**Completed:**', '').trim();
      const { cleanText, stepMeta } = extractStepMeta(rawText);
      progressLines.push({ type: 'completed', text: cleanText, stepMeta });
      if (stepMeta?.id) {
        updateStepState(stepStateMap, stepMeta.id, stepMeta.status);
      }
    } else if (trimmed.startsWith('**Error:**')) {
      const rawText = trimmed.replace('**Error:**', '').trim();
      const { cleanText, stepMeta } = extractStepMeta(rawText);
      progressLines.push({ type: 'error', text: cleanText, stepMeta });
      if (stepMeta?.id) {
        updateStepState(stepStateMap, stepMeta.id, stepMeta.status);
      }
    } else if (trimmed) {
      finalResponse += (finalResponse ? '\n\n' : '') + line;
    }
  }
  
  return {
    progressLines,
    finalResponse,
    hasProgress: progressLines.length > 0,
    stepStateMap,
  };
}

function updateStepState(map: Map<string, StepStatus>, stepId: string, status: StepStatus) {
  const existing = map.get(stepId);
  if (!existing || STATUS_PRIORITY[status] > STATUS_PRIORITY[existing]) {
    map.set(stepId, status);
  }
}

function ProgressIcon({ type, isLast, isStreaming, stepMeta }: { 
  type: string; 
  isLast: boolean; 
  isStreaming?: boolean;
  stepMeta?: StepMeta;
}) {
  if (!stepMeta) {
    if (type === 'completed') {
      return (
        <div className="relative flex items-center justify-center motion-safe:animate-scale-in">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
        </div>
      );
    }
    if (type === 'error') {
      return <span className="w-3.5 h-3.5 text-red-500 flex items-center justify-center font-bold text-xs">x</span>;
    }
    if (type === 'planning') {
      return (
        <div className="relative flex items-center justify-center">
          <Cog className="w-3.5 h-3.5 text-muted-foreground/50" />
        </div>
      );
    }
    return (
      <div className="relative flex items-center justify-center">
        <Circle className="w-3 h-3 text-muted-foreground/40" />
      </div>
    );
  }
  
  if (stepMeta.status === 'failed') {
    return <span className="w-3.5 h-3.5 text-red-500 flex items-center justify-center font-bold text-xs">x</span>;
  }
  
  if (stepMeta.status === 'completed') {
    return (
      <div className="relative flex items-center justify-center motion-safe:animate-scale-in">
        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
      </div>
    );
  }
  
  if (isStreaming && isLast && stepMeta.status === 'started') {
    if (type === 'executing') {
      return (
        <div className="relative flex items-center justify-center">
          <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
        </div>
      );
    }
    if (type === 'planning') {
      return (
        <div className="relative flex items-center justify-center">
          <Cog className="w-3.5 h-3.5 text-blue-400 animate-spin" />
        </div>
      );
    }
  }
  
  if (stepMeta.status === 'started' || stepMeta.status === 'needs_input') {
    return (
      <div className="relative flex items-center justify-center">
        <Circle className="w-3.5 h-3.5 text-muted-foreground/50" />
      </div>
    );
  }
  
  return (
    <div className="relative flex items-center justify-center motion-safe:animate-scale-in">
      <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
    </div>
  );
}

function StepItem({ line, idx, isLast, isStreaming = false, isNew, stepStateMap }: { 
  line: ProgressLine; 
  idx: number; 
  isLast: boolean; 
  isStreaming?: boolean;
  isNew: boolean;
  stepStateMap: Map<string, StepStatus>;
}) {
  const finalStatus = line.stepMeta?.id 
    ? stepStateMap.get(line.stepMeta.id) || line.stepMeta?.status
    : line.stepMeta?.status;
  
  const effectiveStepMeta = line.stepMeta 
    ? { ...line.stepMeta, status: finalStatus || line.stepMeta.status }
    : undefined;
  
  const showsIcon = true;
  
  const isActive = isStreaming && isLast && line.type !== 'completed' && line.type !== 'error' &&
    (!effectiveStepMeta || effectiveStepMeta.status === 'started');
  
  return (
    <div 
      key={idx} 
      className={`flex items-start gap-2 py-0.5 transition-all duration-300 ${isNew ? 'motion-safe:animate-step-fade-in' : ''}`}
      data-testid={`progress-step-${idx}`}
    >
      {showsIcon && (
        <div className="flex-shrink-0 mt-0.5">
          <ProgressIcon 
            type={line.type} 
            isLast={isLast}
            isStreaming={isStreaming}
            stepMeta={effectiveStepMeta}
          />
        </div>
      )}
      <span className={`transition-colors duration-200 ${
        isActive 
          ? 'text-foreground' 
          : 'text-muted-foreground/70'
      }`}>
        {line.text}
      </span>
    </div>
  );
}

export function StepProgressRenderer({ content, isStreaming, isRunning }: StepProgressRendererProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const prevStepCountRef = useRef(0);
  const parsed = parseProgressContent(content);
  
  const newStepStartIndex = prevStepCountRef.current;
  
  useEffect(() => {
    prevStepCountRef.current = parsed.progressLines.length;
  }, [parsed.progressLines.length]);
  
  const showThinkingIndicator = isRunning === true;
  
  if (!parsed.hasProgress) {
    return (
      <div className="flex flex-col gap-2 w-full" data-testid="step-message-no-progress">
        {showThinkingIndicator && (
          <div className="motion-safe:animate-step-fade-in" data-testid="step-thinking-indicator">
            <ThinkingBars />
          </div>
        )}
        {content && (
          <div 
            className="max-w-full px-2.5 py-1.5 overflow-hidden assistant-message motion-safe:animate-step-fade-in"
          >
            <div className="prose prose-sm dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 w-full min-w-0 max-w-full overflow-hidden break-words [&_*]:min-w-0 [&_*]:max-w-full text-[14px] leading-snug text-foreground">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    );
  }
  
  const activelyStreaming = isStreaming && !parsed.finalResponse;
  
  return (
    <div className="flex flex-col gap-2 w-full" data-testid="step-progress-container">
      {parsed.progressLines.length > 0 && (
        <div className="border-l-2 border-primary/30 pl-2.5 space-y-0.5">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
            data-testid="button-toggle-progress"
          >
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
            <span className="font-medium">
              {activelyStreaming ? (
                <span className="flex items-center gap-1.5">
                  <span>Working...</span>
                  <span className="text-muted-foreground/60">({parsed.progressLines.length} steps)</span>
                </span>
              ) : (
                `${parsed.progressLines.length} steps completed`
              )}
            </span>
          </button>
          
          {isExpanded && (
            <div className="space-y-0.5 text-xs" data-testid="progress-steps-list">
              {parsed.progressLines.map((line, idx) => (
                <StepItem
                  key={`${idx}-${line.text.substring(0, 20)}`}
                  line={line}
                  idx={idx}
                  isLast={idx === parsed.progressLines.length - 1}
                  isStreaming={activelyStreaming}
                  isNew={idx >= newStepStartIndex}
                  stepStateMap={parsed.stepStateMap}
                />
              ))}
            </div>
          )}
        </div>
      )}
      
      {showThinkingIndicator && (
        <div className="mt-1 motion-safe:animate-step-fade-in" data-testid="step-thinking-indicator">
          <ThinkingBars />
        </div>
      )}
      
      {parsed.finalResponse && (
        <div 
          className="max-w-full px-2.5 py-1.5 overflow-hidden assistant-message motion-safe:animate-step-fade-in"
          data-testid="step-final-response"
        >
          <div className="prose prose-sm dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 w-full min-w-0 max-w-full overflow-hidden break-words [&_*]:min-w-0 [&_*]:max-w-full text-[15px] leading-snug text-foreground">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {parsed.finalResponse}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
