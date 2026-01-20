import { useState } from "react";
import { Sparkles, Send, Check, Loader2, PartyPopper, Mail, Tag, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ParsedStructuredBlock } from "@/lib/structured-output-parser";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface StructuredOutputCardProps {
  blocks: ParsedStructuredBlock[];
  agentId: string | null;
  onSaved?: () => void;
}

const tableDisplayNames: Record<string, { title: string; icon: typeof Sparkles; successMessage: string }> = {
  feedback: { 
    title: "Ready to Submit Your Feedback", 
    icon: MessageSquare,
    successMessage: "Your feedback has been submitted! We truly appreciate you taking the time to help us improve."
  },
};

const fieldIcons: Record<string, typeof Mail> = {
  userEmail: Mail,
  category: Tag,
  sentiment: Sparkles,
};

function getSentimentColor(sentiment: string): string {
  switch (sentiment?.toLowerCase()) {
    case 'positive': return 'text-green-500';
    case 'negative': return 'text-red-500';
    case 'mixed': return 'text-amber-500';
    default: return 'text-muted-foreground';
  }
}

function formatFieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '-';
  const str = String(value);
  if (str.length > 60) return str.substring(0, 60) + '...';
  return str;
}

export function StructuredOutputCard({ blocks, agentId, onSaved }: StructuredOutputCardProps) {
  const [isSaved, setIsSaved] = useState(false);
  const { toast } = useToast();

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!agentId) {
        throw new Error("No agent context available");
      }
      
      const payload = {
        blocks: blocks.map(block => ({
          tableName: block.tableName,
          data: block.data,
        })),
      };

      return apiRequest("POST", `/api/agents/${agentId}/save-output`, payload);
    },
    onSuccess: () => {
      setIsSaved(true);
      const tableName = blocks[0]?.tableName || 'data';
      const config = tableDisplayNames[tableName];
      toast({
        title: "Success!",
        description: config?.successMessage || `Your ${tableName} has been saved successfully.`,
      });
      onSaved?.();
    },
    onError: (error) => {
      toast({
        title: "Oops! Something went wrong",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  if (blocks.length === 0) {
    return null;
  }

  const block = blocks[0];
  const config = tableDisplayNames[block.tableName] || { 
    title: "Ready to Save", 
    icon: Sparkles,
    successMessage: "Saved successfully!"
  };
  const IconComponent = config.icon;

  const priorityFields = ['userEmail', 'userName', 'category', 'sentiment'];
  const displayFields = priorityFields
    .filter(key => key in block.data)
    .map(key => ({ key, value: block.data[key] }));
  
  const summaryValue = 'summary' in block.data ? String(block.data.summary) : null;

  if (isSaved) {
    return (
      <Card className="p-4 mt-3 border-green-500/30 bg-gradient-to-br from-green-500/10 to-emerald-500/5">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-500/20">
            <PartyPopper className="w-5 h-5 text-green-500" />
          </div>
          <div>
            <p className="font-semibold text-green-600 dark:text-green-400" data-testid="text-save-success">
              Thank you!
            </p>
            <p className="text-sm text-muted-foreground">
              Your feedback has been submitted successfully
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 mt-3 border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent overflow-hidden relative">
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
      
      <div className="relative">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/20">
            <IconComponent className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-foreground">{config.title}</p>
            <p className="text-xs text-muted-foreground">Review your information below</p>
          </div>
        </div>
        
        <div className="space-y-2 mb-4 p-3 rounded-lg bg-background/60 backdrop-blur-sm border border-border/30">
          {displayFields.map(({ key, value }) => {
            const FieldIcon = fieldIcons[key] || Tag;
            const isSentiment = key === 'sentiment';
            
            return (
              <div key={key} className="flex items-center gap-3 text-sm">
                <FieldIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-muted-foreground min-w-[80px]">{formatLabel(key)}</span>
                <span className={`font-medium truncate ${isSentiment ? getSentimentColor(String(value)) : 'text-foreground'}`}>
                  {formatFieldValue(key, value)}
                </span>
              </div>
            );
          })}
          
          {summaryValue && (
            <div className="pt-2 mt-2 border-t border-border/30">
              <p className="text-xs text-muted-foreground mb-1">Summary</p>
              <p className="text-sm text-foreground line-clamp-2">{summaryValue}</p>
            </div>
          )}
        </div>

        {!agentId ? (
          <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 p-2 rounded-lg bg-amber-500/10" data-testid="text-no-agent-warning">
            <Sparkles className="w-4 h-4" />
            <span>Waiting for agent context...</span>
          </div>
        ) : (
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="w-full gap-2 shadow-lg shadow-primary/20"
            data-testid="button-save-structured-output"
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Submit Feedback
              </>
            )}
          </Button>
        )}
      </div>
    </Card>
  );
}

function formatLabel(key: string): string {
  const labels: Record<string, string> = {
    userEmail: 'Email',
    userName: 'Name',
    category: 'Category',
    sentiment: 'Sentiment',
    summary: 'Summary',
    currentPage: 'Page',
  };
  return labels[key] || key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}
