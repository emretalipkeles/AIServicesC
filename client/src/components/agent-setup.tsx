import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Bot, Plus, Trash2, Upload, FileText, MessageSquare,
  Sparkles, Settings, Settings2, Play, Pause, ChevronRight, 
  Brain, Zap, CheckCircle2, Clock, AlertCircle,
  FileUp, X, Loader2, Search, MoreVertical, FileArchive
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const MODEL_OPTIONS = [
  { value: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", provider: "Bedrock" },
  { value: "claude-opus-4-5", label: "Claude Opus 4.5", provider: "Bedrock" },
  { value: "gpt-5.4", label: "GPT-5.4", provider: "OpenAI" },
  { value: "gpt-5.4-high", label: "GPT-5.4 High Reasoning", provider: "OpenAI" },
] as const;

interface Agent {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

interface AgentDocument {
  id: string;
  agentId: string;
  tenantId: string;
  filename: string;
  contentType: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

function AgentCardSkeleton() {
  return (
    <Card className="p-6 animate-pulse">
      <div className="flex items-start gap-4">
        <Skeleton className="w-14 h-14 rounded-xl" />
        <div className="flex-1">
          <Skeleton className="h-5 w-32 mb-2" />
          <Skeleton className="h-4 w-48 mb-4" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        </div>
      </div>
    </Card>
  );
}

function DocumentItem({ doc, onDelete }: { doc: AgentDocument; onDelete: () => void }) {
  const statusColors = {
    pending: "bg-amber-500/10 text-amber-500",
    processing: "bg-primary/10 text-primary",
    indexed: "bg-emerald-500/10 text-emerald-500",
    error: "bg-red-500/10 text-red-500",
  };

  const statusIcons = {
    pending: Clock,
    processing: Loader2,
    indexed: CheckCircle2,
    error: AlertCircle,
  };

  const StatusIcon = statusIcons[doc.status as keyof typeof statusIcons] || Clock;
  const statusClass = statusColors[doc.status as keyof typeof statusColors] || statusColors.pending;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50 group transition-colors duration-200 hover-elevate">
      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
        <FileText className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate" data-testid={`doc-name-${doc.id}`}>
          {doc.filename}
        </p>
        <p className="text-xs text-muted-foreground">
          {new Date(doc.createdAt).toLocaleDateString()}
        </p>
      </div>
      <Badge variant="secondary" className={statusClass}>
        <StatusIcon className={`w-3 h-3 mr-1 ${doc.status === 'processing' ? 'animate-spin' : ''}`} />
        {doc.status}
      </Badge>
      <Button
        variant="ghost"
        size="icon"
        className="opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={onDelete}
        data-testid={`button-delete-doc-${doc.id}`}
      >
        <Trash2 className="w-4 h-4 text-muted-foreground" />
      </Button>
    </div>
  );
}

function AgentCard({ 
  agent, 
  onSelect, 
  onDelete,
  isSelected 
}: { 
  agent: Agent; 
  onSelect: () => void; 
  onDelete: () => void;
  isSelected: boolean;
}) {
  const { data: documents } = useQuery<AgentDocument[]>({
    queryKey: ["/api/agents", agent.id, "documents"],
  });

  const docCount = documents?.length || 0;
  const indexedCount = documents?.filter(d => d.status === "indexed").length || 0;

  return (
    <Card 
      className={`relative overflow-hidden p-6 cursor-pointer transition-colors duration-300 hover-elevate group ${
        isSelected ? 'ring-2 ring-primary shadow-lg shadow-primary/20' : ''
      }`}
      onClick={onSelect}
      data-testid={`agent-card-${agent.id}`}
    >
      <div className="absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 opacity-5 group-hover:opacity-10 transition-opacity">
        <Brain className="w-full h-full" />
      </div>

      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete(); }} data-testid={`menu-delete-agent-${agent.id}`}>
              <Trash2 className="w-4 h-4 mr-2 text-destructive" />
              <span className="text-destructive">Delete Agent</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-start gap-4">
        <div className={`w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center ${isSelected ? 'ring-2 ring-white/30' : ''}`}>
          <Bot className="w-7 h-7 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground mb-1 truncate" data-testid={`agent-name-${agent.id}`}>
            {agent.name}
          </h3>
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3" data-testid={`agent-desc-${agent.id}`}>
            {agent.description || "No description provided"}
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className={agent.model.includes("gpt") ? "bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-primary/10 text-primary"} data-testid={`badge-model-${agent.id}`}>
              <Sparkles className="w-3 h-3 mr-1" />
              {MODEL_OPTIONS.find(m => m.value === agent.model)?.label || agent.model}
            </Badge>
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              <FileText className="w-3 h-3 mr-1" />
              {docCount} docs
            </Badge>
            {docCount > 0 && (
              <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-500">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                {indexedCount} indexed
              </Badge>
            )}
          </div>
        </div>
      </div>

      {isSelected && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-primary/80 to-primary" />
      )}
    </Card>
  );
}

function CreateAgentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-5");
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; systemPrompt: string; model: string }) => {
      return apiRequest("POST", "/api/agents", {
        name: data.name,
        description: data.description,
        systemPrompt: data.systemPrompt,
        model: data.model,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "Agent created!", description: "Your new AI agent is ready to configure." });
      onOpenChange(false);
      setName("");
      setDescription("");
      setSystemPrompt("");
      setModel("claude-sonnet-4-5");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create agent. Please try again.", variant: "destructive" });
    },
  });

  const handleCreate = () => {
    if (!name.trim() || !systemPrompt.trim()) {
      toast({ title: "Missing fields", description: "Please fill in the name and system prompt.", variant: "destructive" });
      return;
    }
    createMutation.mutate({ name, description, systemPrompt, model });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="create-agent-dialog">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <DialogTitle>Create New Agent</DialogTitle>
              <DialogDescription>Build a specialized agent with custom knowledge</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Agent Name</label>
            <Input
              placeholder="e.g., ProCalc Expert, Sales Agent..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="transition-all duration-300 focus:ring-2 focus:ring-primary/20"
              data-testid="input-agent-name"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Description</label>
            <Input
              placeholder="What does this agent do?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="transition-all duration-300 focus:ring-2 focus:ring-primary/20"
              data-testid="input-agent-description"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">AI Model</label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="w-full" data-testid="select-agent-model">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {MODEL_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center gap-2">
                      <span>{option.label}</span>
                      <span className="text-xs text-muted-foreground">({option.provider})</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">
              Choose the AI model that powers this agent
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">System Prompt</label>
            <Textarea
              placeholder="You are an expert agent that helps users with..."
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="min-h-[120px] transition-all duration-300 focus:ring-2 focus:ring-primary/20"
              data-testid="input-agent-prompt"
            />
            <p className="text-xs text-muted-foreground mt-2">
              This prompt defines your agent's personality and expertise
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="button-cancel-create-agent">Cancel</Button>
          <Button 
            onClick={handleCreate} 
            disabled={createMutation.isPending}
            className="bg-gradient-to-r from-primary to-primary/80"
            data-testid="button-create-agent"
          >
            {createMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            Create Agent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface FileUploadResult {
  documents: { id: string; filename: string; status: string }[];
  errors: { filename: string; error: string }[];
  skipped: { filename: string; reason: string }[];
}

function AgentDetails({ agent }: { agent: Agent }) {
  const [uploadText, setUploadText] = useState("");
  const [filename, setFilename] = useState("");
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt);
  const [currentModel, setCurrentModel] = useState(agent.model);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    setSystemPrompt(agent.systemPrompt);
    setCurrentModel(agent.model);
    setEditingPrompt(false);
  }, [agent.id, agent.systemPrompt, agent.model]);

  const fileUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      setUploadProgress("Uploading file...");
      
      const response = await fetch(`/api/agents/${agent.id}/documents/upload`, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'text/event-stream',
        },
      });
      
      if (!response.ok) {
        setUploadProgress(null);
        let errorMessage = 'Upload failed';
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const error = await response.json();
            errorMessage = error.error || errorMessage;
          } else {
            const text = await response.text();
            if (text && text.length < 200 && !text.includes('<html') && !text.includes('<!DOCTYPE')) {
              errorMessage = text;
            } else {
              errorMessage = `Upload failed with status ${response.status}`;
            }
          }
        } catch {
          errorMessage = `Upload failed with status ${response.status}`;
        }
        throw new Error(errorMessage);
      }
      
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('text/event-stream')) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        
        if (!reader) {
          throw new Error('Failed to read response stream');
        }
        
        let result: FileUploadResult | null = null;
        let errorMessage: string | null = null;
        let buffer = '';
        
        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (value) {
              buffer += decoder.decode(value, { stream: true });
              
              // Process complete lines (SSE events end with double newline)
              const events = buffer.split('\n\n');
              // Keep the last potentially incomplete event in the buffer
              buffer = events.pop() || '';
              
              for (const event of events) {
                const lines = event.split('\n');
                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    try {
                      const data = JSON.parse(line.slice(6));
                      if (data.type === 'progress') {
                        setUploadProgress(data.message);
                      } else if (data.type === 'complete') {
                        result = data.result;
                      } else if (data.type === 'error') {
                        errorMessage = data.error;
                      }
                    } catch {
                      // Skip malformed JSON
                    }
                  }
                }
              }
            }
            
            if (done) {
              // Process any remaining buffer content
              if (buffer.trim()) {
                const lines = buffer.split('\n');
                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    try {
                      const data = JSON.parse(line.slice(6));
                      if (data.type === 'progress') {
                        setUploadProgress(data.message);
                      } else if (data.type === 'complete') {
                        result = data.result;
                      } else if (data.type === 'error') {
                        errorMessage = data.error;
                      }
                    } catch {
                      // Skip malformed JSON
                    }
                  }
                }
              }
              break;
            }
          }
        } finally {
          // Ensure reader is always released
          reader.releaseLock();
        }
        
        setUploadProgress(null);
        
        if (errorMessage) {
          throw new Error(errorMessage);
        }
        
        if (!result) {
          throw new Error('No result received from server');
        }
        
        return result;
      }
      
      // Fallback for non-streaming response
      setUploadProgress(null);
      return response.json() as Promise<FileUploadResult>;
    },
    onSuccess: (result) => {
      setUploadProgress(null);
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agent.id, "documents"] });
      
      if (result.documents.length > 0) {
        toast({ 
          title: "Files uploaded!", 
          description: `${result.documents.length} document(s) are being indexed.` 
        });
      }
      
      if (result.errors.length > 0) {
        toast({ 
          title: "Some files failed", 
          description: result.errors.map(e => e.error).join(', '),
          variant: "destructive"
        });
      }
      
      if (result.skipped.length > 0) {
        toast({ 
          title: "Some files skipped", 
          description: `${result.skipped.length} file(s) skipped due to unsupported format or size.`
        });
      }
    },
    onError: (error) => {
      setUploadProgress(null);
      toast({ 
        title: "Upload failed", 
        description: error instanceof Error ? error.message : "Please try again.", 
        variant: "destructive" 
      });
    },
  });

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    files.forEach(file => fileUploadMutation.mutate(file));
  }, [fileUploadMutation]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(file => fileUploadMutation.mutate(file));
    }
    e.target.value = '';
  }, [fileUploadMutation]);

  const updatePromptMutation = useMutation({
    mutationFn: async (newPrompt: string) => {
      return apiRequest("PATCH", `/api/agents/${agent.id}`, {
        systemPrompt: newPrompt,
      });
    },
    onSuccess: (_data, updatedPrompt) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      setSystemPrompt(updatedPrompt);
      toast({ title: "System prompt updated!", description: "Your agent's behavior has been updated." });
      setEditingPrompt(false);
    },
    onError: () => {
      toast({ title: "Update failed", description: "Please try again.", variant: "destructive" });
    },
  });

  const updateModelMutation = useMutation({
    mutationFn: async (newModel: string) => {
      return apiRequest("PATCH", `/api/agents/${agent.id}`, {
        model: newModel,
      });
    },
    onSuccess: (_data, updatedModel) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      setCurrentModel(updatedModel);
      const modelLabel = MODEL_OPTIONS.find(m => m.value === updatedModel)?.label || updatedModel;
      toast({ title: "Model updated!", description: `Agent now uses ${modelLabel}.` });
    },
    onError: () => {
      toast({ title: "Update failed", description: "Please try again.", variant: "destructive" });
    },
  });

  const { data: documents, isLoading: docsLoading } = useQuery<AgentDocument[]>({
    queryKey: ["/api/agents", agent.id, "documents"],
    refetchInterval: (query) => {
      const docs = query.state.data;
      if (docs && docs.some(d => d.status === 'processing')) {
        return 3000;
      }
      return false;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (data: { filename: string; content: string }) => {
      return apiRequest("POST", `/api/agents/${agent.id}/documents`, {
        filename: data.filename,
        contentType: "text/plain",
        rawContent: data.content,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agent.id, "documents"] });
      toast({ title: "Document uploaded!", description: "Your document is being indexed." });
      setUploadText("");
      setFilename("");
    },
    onError: () => {
      toast({ title: "Upload failed", description: "Please try again.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
      return apiRequest("DELETE", `/api/agents/${agent.id}/documents/${docId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agent.id, "documents"] });
      toast({ title: "Document deleted" });
    },
  });

  const handleUpload = () => {
    if (!filename.trim() || !uploadText.trim()) {
      toast({ title: "Missing content", description: "Please provide a filename and content.", variant: "destructive" });
      return;
    }
    uploadMutation.mutate({ filename: filename.endsWith('.txt') ? filename : `${filename}.txt`, content: uploadText });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4 p-6 rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20">
        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
          <Bot className="w-8 h-8 text-white" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-foreground" data-testid="selected-agent-name">{agent.name}</h2>
          <p className="text-muted-foreground">{agent.description || "Configure this agent with knowledge documents"}</p>
        </div>
        <Button variant="outline" className="gap-2" data-testid="button-test-agent">
          <MessageSquare className="w-4 h-4" />
          Test Chat
        </Button>
      </div>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">AI Model</h3>
              <p className="text-sm text-muted-foreground">Choose the AI model that powers this agent</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Select 
            value={currentModel} 
            onValueChange={(value) => {
              updateModelMutation.mutate(value);
            }}
            disabled={updateModelMutation.isPending}
          >
            <SelectTrigger className="w-[280px]" data-testid="select-edit-model">
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent>
              {MODEL_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <div className="flex items-center gap-2">
                    <span>{option.label}</span>
                    <span className="text-xs text-muted-foreground">({option.provider})</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {updateModelMutation.isPending && (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" data-testid="loader-model-update" />
          )}
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">System Prompt</h3>
              <p className="text-sm text-muted-foreground">Define your agent's personality and expertise</p>
            </div>
          </div>
          {!editingPrompt && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setEditingPrompt(true)}
              data-testid="button-edit-prompt"
            >
              <Settings className="w-4 h-4 mr-2" />
              Edit
            </Button>
          )}
        </div>

        {editingPrompt ? (
          <div className="space-y-4">
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="min-h-[150px]"
              placeholder="You are an expert agent that helps users with..."
              data-testid="input-system-prompt"
            />
            <div className="flex justify-end gap-2">
              <Button 
                variant="ghost" 
                onClick={() => {
                  setSystemPrompt(agent.systemPrompt);
                  setEditingPrompt(false);
                }}
                data-testid="button-cancel-prompt"
              >
                Cancel
              </Button>
              <Button 
                onClick={() => updatePromptMutation.mutate(systemPrompt)}
                disabled={updatePromptMutation.isPending}
                className="bg-gradient-to-r from-primary to-primary/80"
                data-testid="button-save-prompt"
              >
                {updatePromptMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                )}
                Save Changes
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-lg bg-muted/30 border border-border/50 max-h-[200px] overflow-y-auto">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap" data-testid="text-system-prompt">
              {systemPrompt || "No system prompt defined yet."}
            </p>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <Upload className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Add Knowledge</h3>
            <p className="text-sm text-muted-foreground">Upload documents to give your agent specialized knowledge</p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".txt,.md,.pdf,.docx,.doc,.xlsx,.xls,.zip"
          multiple
          onChange={handleFileSelect}
          data-testid="input-file-upload"
        />

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            relative cursor-pointer rounded-xl border-2 border-dashed p-8
            transition-all duration-300 mb-6
            ${isDragOver 
              ? 'border-primary bg-primary/10 scale-[1.02]' 
              : 'border-border/50 hover:border-primary/50 hover:bg-muted/30'
            }
            ${fileUploadMutation.isPending ? 'opacity-60 pointer-events-none' : ''}
          `}
          data-testid="dropzone-file-upload"
        >
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            {fileUploadMutation.isPending ? (
              <>
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                  <Loader2 className="w-7 h-7 text-primary animate-spin" />
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    {uploadProgress || "Processing files..."}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {uploadProgress ? "Please wait while we process your document" : "Extracting content and indexing"}
                  </p>
                </div>
              </>
            ) : isDragOver ? (
              <>
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                  <FileUp className="w-7 h-7 text-white" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Drop files here!</p>
                </div>
              </>
            ) : (
              <>
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                  <FileUp className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    Drag & drop files or <span className="text-primary">browse</span>
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Supports TXT, PDF, Word, Excel, and ZIP archives
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 mt-2">
                  <Badge variant="secondary" className="text-xs">
                    <FileText className="w-3 h-3 mr-1" />
                    .txt/.md
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    <FileText className="w-3 h-3 mr-1" />
                    .pdf
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    <FileText className="w-3 h-3 mr-1" />
                    .docx
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    <FileText className="w-3 h-3 mr-1" />
                    .xlsx
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    <FileArchive className="w-3 h-3 mr-1" />
                    .zip
                  </Badge>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border/50" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">or paste text content</span>
          </div>
        </div>

        <div className="space-y-4 mt-6">
          <Input
            placeholder="Document name (e.g., product_guide.txt)"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            data-testid="input-doc-filename"
          />
          <Textarea
            placeholder="Paste your document content here... This could be product documentation, FAQs, guides, or any text that will help your agent answer questions."
            value={uploadText}
            onChange={(e) => setUploadText(e.target.value)}
            className="min-h-[120px]"
            data-testid="input-doc-content"
          />
          <Button 
            onClick={handleUpload} 
            disabled={uploadMutation.isPending}
            className="w-full bg-gradient-to-r from-primary to-primary/80"
            data-testid="button-upload-doc"
          >
            {uploadMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <FileUp className="w-4 h-4 mr-2" />
            )}
            Upload & Index Text
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 flex items-center justify-center">
              <FileText className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Knowledge Base</h3>
              <p className="text-sm text-muted-foreground">{documents?.length || 0} documents indexed</p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {docsLoading ? (
            <>
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-16 rounded-lg" />
            </>
          ) : documents && documents.length > 0 ? (
            documents.map((doc) => (
              <DocumentItem
                key={doc.id}
                doc={doc}
                onDelete={() => deleteMutation.mutate(doc.id)}
              />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-muted-foreground" />
              </div>
              <h4 className="font-medium text-foreground mb-2">No documents yet</h4>
              <p className="text-sm text-muted-foreground max-w-xs">
                Upload documents to teach your agent specialized knowledge
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

export function AgentSetup() {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  const { data: agents, isLoading } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (agentId: string) => {
      return apiRequest("DELETE", `/api/agents/${agentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      setSelectedAgent(null);
      toast({ title: "Agent deleted" });
    },
  });

  const filteredAgents = agents?.filter(agent => 
    agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="text-center mb-8 animate-fade-in-up">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
          <Zap className="w-4 h-4" />
          <span data-testid="text-agent-setup-badge">Intelligent AI Agents</span>
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="text-agent-setup-title">
          Agent Setup
        </h1>
        <p className="text-muted-foreground max-w-lg mx-auto" data-testid="text-agent-setup-subtitle">
          Create and configure AI agents with custom knowledge bases for specialized assistance
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search agents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-agents"
              />
            </div>
            <Button 
              onClick={() => setCreateDialogOpen(true)}
              className="bg-gradient-to-r from-primary to-primary/80 gap-2"
              data-testid="button-new-agent"
            >
              <Plus className="w-4 h-4" />
              New Agent
            </Button>
          </div>

          <div className="space-y-3">
            {isLoading ? (
              <>
                <AgentCardSkeleton />
                <AgentCardSkeleton />
              </>
            ) : filteredAgents && filteredAgents.length > 0 ? (
              filteredAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onSelect={() => setSelectedAgent(agent)}
                  onDelete={() => deleteMutation.mutate(agent.id)}
                  isSelected={selectedAgent?.id === agent.id}
                />
              ))
            ) : (
              <Card className="p-12 text-center">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mx-auto mb-4">
                  <Bot className="w-10 h-10 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2" data-testid="text-no-agents">
                  {searchQuery ? "No matching agents" : "No agents yet"}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {searchQuery ? "Try a different search term" : "Create your first AI agent to get started"}
                </p>
                {!searchQuery && (
                  <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
                    <Plus className="w-4 h-4" />
                    Create Agent
                  </Button>
                )}
              </Card>
            )}
          </div>
        </div>

        <div>
          {selectedAgent ? (
            <AgentDetails agent={selectedAgent} />
          ) : (
            <Card className="p-12 text-center h-full flex flex-col items-center justify-center min-h-[400px]" data-testid="card-select-agent-placeholder">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center mb-4 animate-pulse">
                <Brain className="w-10 h-10 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-foreground mb-2" data-testid="text-select-agent">
                Select an Agent
              </h3>
              <p className="text-sm text-muted-foreground max-w-xs" data-testid="text-select-agent-desc">
                Choose an agent from the list to view details and manage its knowledge base
              </p>
            </Card>
          )}
        </div>
      </div>

      <CreateAgentDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
    </div>
  );
}
