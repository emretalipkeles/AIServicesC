import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Sparkles, Bot, User, Paperclip, MoreHorizontal, Loader2, Package, ExternalLink, Upload, PanelLeftClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AgentSelector } from "./agent-selector";
import { StructuredOutputCard } from "./structured-output-card";
import { Card, CardContent } from "@/components/ui/card";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Agent } from "@shared/schema";
import { parseStructuredBlocks, removeStructuredBlocks, hasStructuredBlocks } from "@/lib/structured-output-parser";
import { useOptionalTabContext } from "@/contexts/tab-context";
import { queryClient } from "@/lib/queryClient";

interface PackageInfo {
  packageId: string;
  packageName: string;
  redirectUrl: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  agentName?: string;
  agentId?: string;
  isStreaming?: boolean;
  statusMessage?: string;
  packageInfo?: PackageInfo;
}

interface OrchestrationProgress {
  type: 'discovery' | 'planning' | 'agent-start' | 'agent-chunk' | 'agent-done' | 'synthesis-start' | 'synthesis-chunk' | 'synthesis-done' | 'fallback' | 'error' | 'memory-optimizing' | 'memory-optimized' | 'package-updated';
  agentId?: string;
  agentName?: string;
  content?: string;
  conversationId?: string;
  packageId?: string;
}

interface AIChatPanelProps {
  onCollapse?: () => void;
}

export function AIChatPanel({ onCollapse }: AIChatPanelProps = {}) {
  const tabContext = useOptionalTabContext();
  const openPackageTab = tabContext?.openPackageTab;
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "Welcome! I'm AI Assistant, here to help you get FP&A Plus up and running smoothly. What do you need?",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const newHeight = Math.min(Math.max(textarea.scrollHeight, 44), 200);
      textarea.style.height = `${newHeight}px`;
    }
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [inputValue, adjustTextareaHeight]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  const handleSubmit = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue,
      timestamp: new Date(),
    };

    const assistantMessageId = (Date.now() + 1).toString();
    
    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      const conversationHistory = messages.slice(-10).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      const isOrchestrated = !selectedAgent;
      
      const streamEndpoint = selectedAgent 
        ? `/api/agents/${selectedAgent.id}/chat/stream`
        : '/api/ai/orchestrate/stream';
      
      const orchestrationContext = tabContext?.activeDelayAnalysisProjectId 
        ? { activeDelayAnalysisProjectId: tabContext.activeDelayAnalysisProjectId }
        : undefined;

      const streamBody = selectedAgent
        ? { messages: [...conversationHistory, { role: 'user', content: inputValue }] }
        : { message: inputValue, conversationId, context: orchestrationContext };

      console.log('[AIChatPanel] Sending message with conversationId:', conversationId);

      const response = await fetch(streamEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(streamBody),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const streamingMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        agentName: selectedAgent?.name || "AI Assistant",
        isStreaming: true,
        statusMessage: isOrchestrated ? "Discovering agents..." : undefined,
      };
      setMessages((prev) => [...prev, streamingMessage]);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = "";
      let buffer = "";
      let currentAgentName = "";
      let currentAgentId = "";
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        
        const events = buffer.split('\n\n');
        buffer = events.pop() || "";

        for (const event of events) {
          const lines = event.split('\n');
          for (const line of lines) {
            if (line.startsWith(':')) continue;
            
            if (line.startsWith('data:')) {
              try {
                const jsonStr = line.slice(5).trim();
                if (!jsonStr || jsonStr === '[DONE]') continue;
                
                const data = JSON.parse(jsonStr) as OrchestrationProgress | { type: string; content?: string; error?: string };
                
                if (isOrchestrated) {
                  switch (data.type) {
                    case 'discovery':
                      if ((data as OrchestrationProgress).conversationId) {
                        setConversationId((data as OrchestrationProgress).conversationId!);
                      }
                      setMessages((prev) => 
                        prev.map((msg) =>
                          msg.id === assistantMessageId
                            ? { ...msg, statusMessage: "Discovering agents..." }
                            : msg
                        )
                      );
                      break;
                    case 'planning':
                      setMessages((prev) => 
                        prev.map((msg) =>
                          msg.id === assistantMessageId
                            ? { ...msg, statusMessage: "Planning response..." }
                            : msg
                        )
                      );
                      break;
                    case 'agent-start':
                      currentAgentName = (data as OrchestrationProgress).agentName || '';
                      currentAgentId = (data as OrchestrationProgress).agentId || '';
                      setMessages((prev) => 
                        prev.map((msg) =>
                          msg.id === assistantMessageId
                            ? { ...msg, statusMessage: `Consulting ${currentAgentName}...`, agentName: currentAgentName, agentId: currentAgentId }
                            : msg
                        )
                      );
                      break;
                    case 'agent-chunk':
                      if ((data as OrchestrationProgress).content) {
                        accumulatedContent += (data as OrchestrationProgress).content;
                        setMessages((prev) => 
                          prev.map((msg) =>
                            msg.id === assistantMessageId
                              ? { ...msg, content: accumulatedContent, statusMessage: undefined }
                              : msg
                          )
                        );
                      }
                      break;
                    case 'agent-done':
                      break;
                    case 'synthesis-start':
                      setMessages((prev) => 
                        prev.map((msg) =>
                          msg.id === assistantMessageId
                            ? { ...msg, statusMessage: "Synthesizing response...", agentName: "AI Assistant" }
                            : msg
                        )
                      );
                      accumulatedContent = "";
                      break;
                    case 'synthesis-chunk':
                      if ((data as OrchestrationProgress).content) {
                        accumulatedContent += (data as OrchestrationProgress).content;
                        setMessages((prev) => 
                          prev.map((msg) =>
                            msg.id === assistantMessageId
                              ? { ...msg, content: accumulatedContent, statusMessage: undefined }
                              : msg
                          )
                        );
                      }
                      break;
                    case 'synthesis-done':
                      setMessages((prev) => 
                        prev.map((msg) =>
                          msg.id === assistantMessageId
                            ? { ...msg, isStreaming: false, statusMessage: undefined }
                            : msg
                        )
                      );
                      break;
                    case 'fallback':
                      accumulatedContent = (data as OrchestrationProgress).content || '';
                      setMessages((prev) => 
                        prev.map((msg) =>
                          msg.id === assistantMessageId
                            ? { ...msg, content: accumulatedContent, isStreaming: false, statusMessage: undefined }
                            : msg
                        )
                      );
                      break;
                    case 'error':
                      throw new Error((data as OrchestrationProgress).content || 'Orchestration error');
                    case 'memory-optimizing':
                      setMessages((prev) => 
                        prev.map((msg) =>
                          msg.id === assistantMessageId
                            ? { ...msg, statusMessage: "Memory optimizing...", isStreaming: true }
                            : msg
                        )
                      );
                      break;
                    case 'memory-optimized':
                      setMessages((prev) => 
                        prev.map((msg) =>
                          msg.id === assistantMessageId
                            ? { ...msg, statusMessage: undefined, isStreaming: false }
                            : msg
                        )
                      );
                      break;
                    case 'package-updated':
                      if ((data as OrchestrationProgress).packageId) {
                        const pkgId = (data as OrchestrationProgress).packageId;
                        console.log('[AIChatPanel] Package updated, invalidating queries for:', pkgId);
                        queryClient.invalidateQueries({ queryKey: ['/api/pret/packages', pkgId, 'analyze'] });
                      }
                      break;
                  }
                } else {
                  if (data.type === 'content' && data.content) {
                    accumulatedContent += data.content;
                    setMessages((prev) => 
                      prev.map((msg) =>
                        msg.id === assistantMessageId
                          ? { ...msg, content: accumulatedContent }
                          : msg
                      )
                    );
                  } else if (data.type === 'done') {
                    setMessages((prev) => 
                      prev.map((msg) =>
                        msg.id === assistantMessageId
                          ? { ...msg, isStreaming: false }
                          : msg
                      )
                    );
                  } else if (data.type === 'error') {
                    throw new Error((data as { error?: string }).error || 'Stream error');
                  }
                }
              } catch (parseError) {
                if (parseError instanceof Error && !parseError.message.includes('Stream error') && !parseError.message.includes('Orchestration error')) {
                  continue;
                }
                throw parseError;
              }
            }
          }
        }
      }

      setMessages((prev) => 
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, content: accumulatedContent || msg.content, isStreaming: false, statusMessage: undefined }
            : msg
        )
      );
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) => {
        const existingMsg = prev.find(m => m.id === assistantMessageId);
        if (existingMsg && existingMsg.content) {
          return prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, isStreaming: false, statusMessage: undefined }
              : msg
          );
        }
        const filtered = prev.filter(m => m.id !== assistantMessageId);
        const errorMsg: Message = {
          id: (Date.now() + 2).toString(),
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
          timestamp: new Date(),
        };
        return [...filtered, errorMsg];
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const processFileUpload = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: "I can only accept ZIP files containing PRET packages. Please select a valid .zip file.",
        timestamp: new Date(),
        agentName: "AI Assistant",
      };
      setMessages((prev) => [...prev, errorMessage]);
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: "The file is too large. Maximum file size is 100MB.",
        timestamp: new Date(),
        agentName: "AI Assistant",
      };
      setMessages((prev) => [...prev, errorMessage]);
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: `Uploading package: ${file.name}`,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);

    const uploadingMessageId = (Date.now() + 1).toString();
    const uploadingMessage: Message = {
      id: uploadingMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      agentName: "AI Assistant",
      isStreaming: true,
      statusMessage: "Uploading and validating package...",
    };
    setMessages((prev) => [...prev, uploadingMessage]);

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/pret/packages/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Upload failed');
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === uploadingMessageId
            ? { ...msg, statusMessage: "Generating response..." }
            : msg
        )
      );

      const streamResponse = await fetch(`/api/pret/packages/${result.packageId}/narrate/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          packageName: result.packageName,
          conversationId,
        }),
      });

      if (!streamResponse.ok) {
        throw new Error('Failed to start narrator stream');
      }

      const reader = streamResponse.body?.getReader();
      if (!reader) throw new Error('No stream reader available');

      const decoder = new TextDecoder();
      let accumulatedContent = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const event of events) {
          const lines = event.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                if (data.type === 'content' && data.content) {
                  accumulatedContent += data.content;
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === uploadingMessageId
                        ? { ...msg, content: accumulatedContent, statusMessage: undefined }
                        : msg
                    )
                  );
                } else if (data.type === 'done') {
                  console.log('[AIChatPanel] Received done event with conversationId:', data.conversationId);
                  if (data.conversationId) {
                    console.log('[AIChatPanel] Setting conversationId:', data.conversationId);
                    setConversationId(data.conversationId);
                  }
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === uploadingMessageId
                        ? {
                            ...msg,
                            content: accumulatedContent || `I've successfully imported your PRET package "${result.packageName}".`,
                            isStreaming: false,
                            statusMessage: undefined,
                            packageInfo: {
                              packageId: result.packageId,
                              packageName: result.packageName,
                              redirectUrl: `/pret/${result.packageId}`,
                            },
                          }
                        : msg
                    )
                  );
                } else if (data.type === 'error') {
                  throw new Error(data.error || 'Stream error');
                }
              } catch (parseError) {
                // Skip invalid JSON lines (like heartbeat comments)
              }
            }
          }
        }
      }

      if (buffer.trim()) {
        const lines = buffer.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              console.log('[AIChatPanel] Processing remaining buffer event:', data.type, 'conversationId:', data.conversationId);
              if (data.type === 'done' && data.conversationId) {
                console.log('[AIChatPanel] Setting conversationId from remaining buffer:', data.conversationId);
                setConversationId(data.conversationId);
              }
            } catch {
            }
          }
        }
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === uploadingMessageId
            ? {
                ...msg,
                isStreaming: false,
                packageInfo: msg.packageInfo || {
                  packageId: result.packageId,
                  packageName: result.packageName,
                  redirectUrl: `/pret/${result.packageId}`,
                },
              }
            : msg
        )
      );
    } catch (error) {
      const errorContent = error instanceof Error ? error.message : 'Unknown error occurred';
      const packageName = file.name.replace('.zip', '');
      
      try {
        const streamResponse = await fetch(`/api/pret/packages/failed_${Date.now()}/narrate/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: false,
            packageName,
            error: errorContent,
            conversationId,
          }),
        });

        if (streamResponse.ok && streamResponse.body) {
          const reader = streamResponse.body.getReader();
          const decoder = new TextDecoder();
          let accumulatedContent = '';
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            buffer = events.pop() || '';

            for (const event of events) {
              const lines = event.split('\n');
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6));
                    if (data.type === 'content' && data.content) {
                      accumulatedContent += data.content;
                      setMessages((prev) =>
                        prev.map((msg) =>
                          msg.id === uploadingMessageId
                            ? { ...msg, content: accumulatedContent, statusMessage: undefined }
                            : msg
                        )
                      );
                    } else if (data.type === 'done') {
                      if (data.conversationId) {
                        setConversationId(data.conversationId);
                      }
                      setMessages((prev) =>
                        prev.map((msg) =>
                          msg.id === uploadingMessageId
                            ? { ...msg, isStreaming: false, statusMessage: undefined }
                            : msg
                        )
                      );
                    }
                  } catch {
                    // Skip invalid JSON
                  }
                }
              }
            }
          }

          if (buffer.trim()) {
            const lines = buffer.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.type === 'done' && data.conversationId) {
                    setConversationId(data.conversationId);
                  }
                } catch {
                }
              }
            }
          }
        } else {
          throw new Error('Stream failed');
        }
      } catch {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === uploadingMessageId
              ? {
                  ...msg,
                  content: `Failed to import package: ${errorContent}`,
                  isStreaming: false,
                  statusMessage: undefined,
                }
              : msg
          )
        );
      }
    } finally {
      setIsUploading(false);
    }
  }, [conversationId, messages]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (e.target) {
      e.target.value = '';
    }
    processFileUpload(file);
  };

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFileUpload(files[0]);
    }
  }, [processFileUpload]);

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div 
      className="chat-container bg-sidebar theme-transition relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      data-testid="chat-drop-zone"
    >
      {isDragging && (
        <div 
          className="absolute inset-0 z-50 bg-primary/10 border-2 border-dashed border-primary rounded-lg flex flex-col items-center justify-center pointer-events-none"
          data-testid="drop-overlay"
          role="region"
          aria-label="Drop zone for PRET package files"
        >
          <Upload className="w-12 h-12 text-primary mb-3" />
          <p className="text-lg font-medium text-primary" data-testid="text-drop-instruction">Drop your PRET package here</p>
          <p className="text-sm text-muted-foreground mt-1" data-testid="text-drop-format">ZIP files only</p>
        </div>
      )}
      
      {/* Header region - fixed */}
      <div className="chat-header flex items-center justify-between px-3 sm:px-4 h-12 border-b border-sidebar-border">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-md bg-primary/10">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-sidebar-foreground leading-tight truncate" data-testid="text-chat-title">AI Assistant</h2>
          </div>
        </div>
        <div className="flex-shrink-0 flex items-center gap-1">
          <Button variant="ghost" size="icon" data-testid="button-chat-options">
            <MoreHorizontal className="w-4 h-4" />
          </Button>
          {onCollapse && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onCollapse}
              title="Collapse panel"
              data-testid="button-collapse-panel"
            >
              <PanelLeftClose className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Messages region - scrollable, takes remaining space */}
      <ScrollArea className="chat-messages px-2 sm:px-3 discreet-scroll" ref={scrollAreaRef}>
        <div className="py-3 space-y-3 w-full min-w-0 max-w-full overflow-hidden">
          {messages.map((message, index) => {
            const isUser = message.role === "user";
            return (
              <div
                key={message.id}
                className={`chat-message-row animate-fade-in ${isUser ? 'user' : ''}`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* Avatar */}
                <div
                  className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center overflow-hidden ${
                    isUser
                      ? "bg-primary"
                      : message.isStreaming && !message.content
                        ? "ai-thinking-indicator"
                        : "bg-primary/10"
                  }`}
                >
                  {isUser ? (
                    <User className="w-3 h-3 text-primary-foreground" />
                  ) : message.isStreaming && !message.content ? (
                    <Sparkles className="w-3 h-3 text-primary" />
                  ) : (
                    <Bot className="w-3 h-3 text-primary" />
                  )}
                </div>
                
                {/* Message content */}
                <div className={`chat-message-content ${isUser ? 'flex flex-col items-end' : ''}`}>
                  {/* Message header: name + timestamp */}
                  <div className={`flex items-center gap-1.5 mb-0.5 ${isUser ? 'flex-row-reverse' : ''}`}>
                    <span className="text-[11px] font-medium text-sidebar-foreground" data-testid={`text-message-role-${message.id}`}>
                      {isUser ? "You" : (message.agentName || "AI Assistant")}
                    </span>
                    {message.isStreaming && !message.content ? (
                      <span className="text-[10px] text-muted-foreground" data-testid={`text-message-thinking-${message.id}`}>
                        {message.statusMessage || "thinking..."}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground" data-testid={`text-message-timestamp-${message.id}`}>
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  
                  {/* Message bubble */}
                  {message.isStreaming && !message.content ? (
                    <div 
                      className="chat-bubble px-2.5 py-1.5 assistant-message"
                      data-testid={`text-message-${message.id}`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  ) : (
                  <div 
                    className={`chat-bubble rounded-2xl px-3 py-2 max-w-[85%] min-w-0 ${
                      isUser 
                        ? 'user-message' 
                        : 'assistant-message bg-muted/50 dark:bg-muted/30 border border-border/30'
                    }`}
                    data-testid={`text-message-${message.id}`}
                  >
                    {isUser ? (
                      <p className="text-[13px] leading-snug whitespace-pre-wrap break-words text-primary-foreground">
                        {message.content}
                      </p>
                    ) : (
                      <>
                        <div className="text-[13px] leading-snug text-foreground prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-headings:break-words">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              h1: ({ children }) => <h1 className="text-lg font-bold break-words">{children}</h1>,
                              h2: ({ children }) => <h2 className="text-base font-bold break-words">{children}</h2>,
                              h3: ({ children }) => <h3 className="text-sm font-bold break-words">{children}</h3>,
                              p: ({ children }) => <p className="break-words">{children}</p>,
                              code: ({ className, children, ...props }) => {
                                const isInline = !className;
                                if (isInline) {
                                  return (
                                    <code className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono" {...props}>
                                      {children}
                                    </code>
                                  );
                                }
                                return <code className={`${className} font-mono block`} {...props}>{children}</code>;
                              },
                              pre: ({ children }) => (
                                <div className="my-3 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                                  <div className="max-h-[400px] overflow-y-auto overflow-x-auto bg-slate-900">
                                    <pre className="p-3 text-sm text-slate-100 font-mono whitespace-pre">{children}</pre>
                                  </div>
                                </div>
                              ),
                              blockquote: ({ children }) => (
                                <blockquote className="border-l-4 border-primary/50 pl-3 py-1 my-2 bg-muted/30 rounded-r">{children}</blockquote>
                              ),
                              table: ({ children }) => (
                                <div className="my-3 overflow-hidden rounded-lg shadow-md border border-blue-200/60 dark:border-blue-700/40 bg-gradient-to-b from-white to-slate-50/50 dark:from-slate-800 dark:to-slate-900">
                                  <div className="max-h-[480px] overflow-y-auto overflow-x-auto">
                                    <table className="min-w-full">{children}</table>
                                  </div>
                                </div>
                              ),
                              thead: ({ children }) => (
                                <thead className="bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600 dark:from-blue-700 dark:via-blue-600 dark:to-blue-700 sticky top-0">{children}</thead>
                              ),
                              th: ({ children }) => (
                                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border-b-2 border-blue-400/30 text-left">{children}</th>
                              ),
                              td: ({ children }) => (
                                <td className="px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 whitespace-nowrap border-b border-slate-100 dark:border-slate-700/50">{children}</td>
                              ),
                              tr: ({ children }) => (
                                <tr className="hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-colors even:bg-slate-50/80 dark:even:bg-slate-800/30">{children}</tr>
                              ),
                            }}
                          >
                            {hasStructuredBlocks(message.content) ? removeStructuredBlocks(message.content) : message.content}
                          </ReactMarkdown>
                          {message.isStreaming && (
                            <span className="inline-block w-2 h-4 ml-0.5 bg-primary animate-pulse align-text-bottom" />
                          )}
                        </div>
                        {!message.isStreaming && hasStructuredBlocks(message.content) && (
                          <StructuredOutputCard
                            blocks={parseStructuredBlocks(message.content)}
                            agentId={message.agentId || selectedAgent?.id || null}
                          />
                        )}
                        {!message.isStreaming && message.packageInfo && (
                          <Card className="mt-2 border-primary/20 bg-primary/5">
                            <CardContent className="p-3">
                              <div className="flex items-center gap-3">
                                <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10">
                                  <Package className="w-5 h-5 text-primary" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate" data-testid={`text-package-name-${message.id}`}>
                                    {message.packageInfo.packageName}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    PRET Package imported successfully
                                  </p>
                                </div>
                                <Button
                                  size="sm"
                                  onClick={() => openPackageTab?.(message.packageInfo!.packageId, message.packageInfo!.packageName)}
                                  data-testid={`button-open-package-${message.id}`}
                                >
                                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                                  Open
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        )}
                      </>
                    )}
                  </div>
                  )}
                </div>
              </div>
            );
          })}
          
          {isLoading && !messages.some(m => m.isStreaming) && (
            <div className="chat-message-row animate-fade-in" data-testid="ai-thinking-indicator">
              <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center overflow-hidden ai-thinking-indicator">
                <Sparkles className="w-3 h-3 text-primary" />
              </div>
              <div className="chat-message-content">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[11px] font-medium text-sidebar-foreground">
                    {selectedAgent?.name || "AI Assistant"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">thinking...</span>
                </div>
                <div className="chat-bubble px-2.5 py-1.5 assistant-message">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input region - fixed at bottom */}
      <div className="chat-input p-2 sm:p-3 border-t border-sidebar-border">
        <div
          className={`rounded-lg border-2 theme-transition bg-muted/50 dark:bg-muted/30 ${
            isFocused
              ? "border-primary brand-glow"
              : "border-muted-foreground/20"
          }`}
        >
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            placeholder={selectedAgent ? `Message ${selectedAgent.name}...` : "Message AI Assistant..."}
            className="ai-input w-full px-3 sm:px-4 py-2 sm:py-3 text-[13px] bg-transparent resize-none focus:outline-none text-sidebar-foreground placeholder:text-muted-foreground"
            style={{ minHeight: "60px", maxHeight: "200px" }}
            rows={2}
            data-testid="input-ai-message"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-2 border-t border-muted-foreground/10">
            <AgentSelector
              selectedAgentId={selectedAgent?.id || null}
              onAgentSelect={setSelectedAgent}
            />
            <div className="flex items-center gap-1">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept=".zip"
                className="hidden"
                data-testid="input-file-upload"
              />
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground"
                onClick={handleAttachClick}
                disabled={isUploading || isLoading}
                data-testid="button-attach-file"
              >
                <Paperclip className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                disabled={!inputValue.trim() || isLoading || isUploading}
                onClick={handleSubmit}
                data-testid="button-send-message"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>
        <p className="mt-2 text-xs text-center text-muted-foreground hidden sm:block" data-testid="text-input-hint">
          Press Enter to send, Shift + Enter for new line
        </p>
      </div>
    </div>
  );
}
