import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Bot, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Agent } from "@shared/schema";

interface AgentSelectorProps {
  selectedAgentId: string | null;
  onAgentSelect: (agent: Agent | null) => void;
}

export function AgentSelector({ selectedAgentId, onAgentSelect }: AgentSelectorProps) {
  const [open, setOpen] = useState(false);

  const { data: agents, isLoading } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const selectedAgent = agents?.find(a => a.id === selectedAgentId) || null;

  const handleSelect = (agent: Agent | null) => {
    onAgentSelect(agent);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs bg-muted/50 dark:bg-muted/30 text-muted-foreground"
          data-testid="button-agent-selector"
        >
          <Bot className={`w-3.5 h-3.5 ${selectedAgent ? 'text-primary' : ''}`} />
          <span>{selectedAgent?.name || "Phix AI"}</span>
          <ChevronDown className="w-3 h-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-80 p-0" 
        align="start"
        side="top"
        sideOffset={8}
      >
        <div className="px-4 py-3 border-b">
          <p className="text-sm font-semibold">Select Agent</p>
          <p className="text-xs text-muted-foreground mt-0.5">Choose a specialized agent for your task</p>
        </div>
        <ScrollArea className="max-h-72">
          <div className="p-2">
            <button
              onClick={() => handleSelect(null)}
              className="flex items-start gap-3 w-full px-3 py-3 text-sm rounded-md hover-elevate text-left"
              data-testid="option-agent-default"
            >
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium">Phix AI</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  Intelligent orchestrator - automatically selects the best agents for your query
                </p>
              </div>
              {!selectedAgentId && (
                <Check className="w-4 h-4 text-primary flex-shrink-0 mt-1" />
              )}
            </button>
            
            {isLoading && (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                Loading agents...
              </div>
            )}
            
            {agents?.map((agent) => (
              <button
                key={agent.id}
                onClick={() => handleSelect(agent)}
                className="flex items-start gap-3 w-full px-3 py-3 text-sm rounded-md hover-elevate text-left"
                data-testid={`option-agent-${agent.id}`}
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{agent.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {agent.description || "Custom agent"}
                  </p>
                </div>
                {selectedAgentId === agent.id && (
                  <Check className="w-4 h-4 text-primary flex-shrink-0 mt-1" />
                )}
              </button>
            ))}
            
            {!isLoading && (!agents || agents.length === 0) && (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                No agents configured. Create one in the Agents tab.
              </div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
