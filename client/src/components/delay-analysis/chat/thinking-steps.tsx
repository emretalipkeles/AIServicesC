import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Search, FileText, Sparkles, Brain, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ThinkingStage = 
  | 'analyzing' 
  | 'searching_events' 
  | 'fetching_document' 
  | 'processing_tool' 
  | 'generating_response';

export interface ThinkingStep {
  stage: ThinkingStage;
  message: string;
  completed?: boolean;
}

interface ThinkingStepsProps {
  steps: ThinkingStep[];
  isComplete?: boolean;
}

const stageConfig: Record<ThinkingStage, { icon: typeof Loader2; label: string; color: string }> = {
  analyzing: {
    icon: Brain,
    label: "Analyzing",
    color: "text-blue-500"
  },
  searching_events: {
    icon: Search,
    label: "Searching",
    color: "text-purple-500"
  },
  fetching_document: {
    icon: FileText,
    label: "Reading Document",
    color: "text-amber-500"
  },
  processing_tool: {
    icon: Sparkles,
    label: "Processing",
    color: "text-green-500"
  },
  generating_response: {
    icon: Sparkles,
    label: "Generating",
    color: "text-primary"
  }
};

export function ThinkingSteps({ steps, isComplete = false }: ThinkingStepsProps) {
  if (steps.length === 0) return null;

  return (
    <div className="space-y-2 mb-3">
      <AnimatePresence mode="popLayout">
        {steps.map((step, index) => {
          const config = stageConfig[step.stage];
          const Icon = step.completed ? CheckCircle : config.icon;
          const isLast = index === steps.length - 1;
          const isActive = isLast && !isComplete;

          return (
            <motion.div
              key={`${step.stage}-${index}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "flex items-center gap-2 text-sm",
                step.completed || !isActive
                  ? "text-muted-foreground"
                  : config.color
              )}
            >
              {isActive && !step.completed ? (
                <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
              ) : (
                <Icon className={cn(
                  "w-4 h-4 flex-shrink-0",
                  step.completed ? "text-green-500" : ""
                )} />
              )}
              <span className={cn(
                "truncate",
                isActive && !step.completed ? "font-medium" : ""
              )}>
                {step.message}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export function ThinkingIndicator({ message }: { message?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center gap-2 text-sm text-muted-foreground"
    >
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      >
        <Loader2 className="w-4 h-4" />
      </motion.div>
      <span>{message || "Thinking..."}</span>
    </motion.div>
  );
}
