import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Sparkles, Bot, User, MoreHorizontal, Loader2, PanelLeftClose, Download, Brain, Search, FileText, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgentSelector } from "./agent-selector";
import { StructuredOutputCard } from "./structured-output-card";
import { Card, CardContent } from "@/components/ui/card";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Agent } from "@shared/schema";
import { parseStructuredBlocks, removeStructuredBlocks, hasStructuredBlocks } from "@/lib/structured-output-parser";
import { useOptionalTabContext } from "@/contexts/tab-context";
import { queryClient } from "@/lib/queryClient";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

function downloadTableAsCSV(tableElement: HTMLTableElement | null, filename: string = 'table-data') {
  if (!tableElement) return;
  
  const rows: string[][] = [];
  const headerRow = tableElement.querySelector('thead tr');
  if (headerRow) {
    const headers = Array.from(headerRow.querySelectorAll('th')).map(th => th.textContent?.trim() || '');
    rows.push(headers);
  }
  
  const bodyRows = tableElement.querySelectorAll('tbody tr');
  bodyRows.forEach(tr => {
    const cells = Array.from(tr.querySelectorAll('td')).map(td => td.textContent?.trim() || '');
    rows.push(cells);
  });
  
  const csvContent = rows.map(row => 
    row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')
  ).join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function TableWithDownload({ children }: { children: React.ReactNode }) {
  const tableRef = useRef<HTMLTableElement>(null);
  
  return (
    <div className="my-3 overflow-hidden rounded-lg shadow-md border border-blue-200/60 dark:border-blue-700/40 bg-gradient-to-b from-white to-slate-50/50 dark:from-slate-800 dark:to-slate-900 group relative">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => downloadTableAsCSV(tableRef.current)}
              className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-white/80 dark:bg-slate-700/80 border border-slate-200 dark:border-slate-600 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-50 dark:hover:bg-blue-900/30"
              aria-label="Download as CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>Download CSV</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <div className="max-h-[480px] overflow-y-auto overflow-x-auto discreet-scroll">
        <table ref={tableRef} className="min-w-full">{children}</table>
      </div>
    </div>
  );
}

interface ThinkingStep {
  stage: string;
  message: string;
  completed?: boolean;
  iteration?: number;
}

interface CostInfo {
  totalTokens: number;
  estimatedCostUsd: number;
  iterationCount: number;
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
  thinkingSteps?: ThinkingStep[];
  costInfo?: CostInfo;
}

interface AIChatPanelProps {
  onCollapse?: () => void;
}

export function AIChatPanel({ onCollapse }: AIChatPanelProps = {}) {
  const tabContext = useOptionalTabContext();
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "Welcome! I'm your AI Assistant, here to help you understand contractor delays better. What do you need?",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

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
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
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

      const hasActiveProject = !!tabContext?.activeDelayAnalysisProjectId;
      
      const streamEndpoint = '/api/ai/agent-loop/stream';
      const streamBody: Record<string, unknown> = {
        projectId: tabContext?.activeDelayAnalysisProjectId || '',
        message: inputValue,
        conversationHistory,
      };

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
        statusMessage: hasActiveProject ? "Starting analysis..." : undefined,
        thinkingSteps: hasActiveProject ? [] : undefined,
      };
      setMessages((prev) => [...prev, streamingMessage]);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = "";
      let buffer = "";
      
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
                
                const data = JSON.parse(jsonStr) as { type: string; content?: string; error?: string; message?: string; toolName?: string; toolArgs?: Record<string, unknown>; toolsUsed?: string[]; iterationCount?: number; iteration?: number; success?: boolean; totalTokens?: number; estimatedCostUsd?: number };
                
                switch (data.type) {
                  case 'thinking': {
                    const thinkingMsg = data.message || 'Analyzing...';
                    const iteration = data.iteration;
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantMessageId
                          ? {
                              ...msg,
                              statusMessage: thinkingMsg,
                              thinkingSteps: [
                                ...(msg.thinkingSteps || []).map(s => ({ ...s, completed: true })),
                                { stage: 'thinking', message: thinkingMsg, iteration },
                              ],
                            }
                          : msg
                      )
                    );
                    break;
                  }
                  case 'tool_invocation': {
                    const toolName = data.toolName || 'unknown';
                    const toolDisplayNames: Record<string, string> = {
                      'search_documents_by_filename': 'Searching documents',
                      'get_document_content': 'Reading document',
                      'get_delay_events_by_document': 'Checking delay events',
                      'get_schedule_activity_details': 'Looking up schedule activities',
                      'list_delay_events': 'Listing delay events',
                    };
                    const displayName = toolDisplayNames[toolName] || `Using ${toolName}`;
                    const iteration = data.iteration;
                    const stepLabel = iteration && iteration > 1 ? ` (step ${iteration})` : '';
                    setMessages((prev) =>
                      prev.map((msg) => {
                        if (msg.id !== assistantMessageId) return msg;
                        const steps = (msg.thinkingSteps || []);
                        const lastStep = steps[steps.length - 1];
                        const lastIsThinking = lastStep && lastStep.stage === 'thinking' && !lastStep.completed;
                        const updatedSteps = lastIsThinking
                          ? [...steps.slice(0, -1).map(s => ({ ...s, completed: true })), { stage: 'tool' as const, message: displayName + stepLabel }]
                          : [...steps.map(s => ({ ...s, completed: true })), { stage: 'tool' as const, message: displayName + stepLabel }];
                        return {
                          ...msg,
                          statusMessage: displayName + '...',
                          thinkingSteps: updatedSteps,
                        };
                      })
                    );
                    break;
                  }
                  case 'tool_result': {
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantMessageId
                          ? {
                              ...msg,
                              thinkingSteps: (msg.thinkingSteps || []).map((s, i, arr) =>
                                i === arr.length - 1 ? { ...s, completed: true } : s
                              ),
                            }
                          : msg
                      )
                    );
                    break;
                  }
                  case 'content': {
                    if (data.content) {
                      accumulatedContent += data.content;
                      setMessages((prev) =>
                        prev.map((msg) =>
                          msg.id === assistantMessageId
                            ? { ...msg, content: accumulatedContent, statusMessage: undefined }
                            : msg
                        )
                      );
                    }
                    break;
                  }
                  case 'done':
                  case 'loop_completed': {
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantMessageId
                          ? {
                              ...msg,
                              isStreaming: false,
                              statusMessage: undefined,
                              thinkingSteps: (msg.thinkingSteps || []).map(s => ({ ...s, completed: true })),
                            }
                          : msg
                      )
                    );
                    break;
                  }
                  case 'usage': {
                    if (data.totalTokens && data.estimatedCostUsd !== undefined) {
                      setMessages((prev) =>
                        prev.map((msg) =>
                          msg.id === assistantMessageId
                            ? {
                                ...msg,
                                costInfo: {
                                  totalTokens: data.totalTokens!,
                                  estimatedCostUsd: data.estimatedCostUsd!,
                                  iterationCount: data.iterationCount || 1,
                                },
                              }
                            : msg
                        )
                      );
                    }
                    break;
                  }
                  case 'error': {
                    throw new Error(data.message || 'Agent error');
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

  return (
    <div 
      className="chat-container bg-sidebar theme-transition relative"
      data-testid="chat-drop-zone"
    >
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
      <div ref={scrollAreaRef} className="flex-1 overflow-y-auto discreet-scroll">
        <div className="py-3 space-y-3 w-full min-w-0 max-w-full">
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
                  
                  {/* Thinking steps display */}
                  {message.thinkingSteps && message.thinkingSteps.length > 0 && (
                    <div className="mb-2 space-y-1">
                      {message.thinkingSteps.map((step, stepIndex) => {
                        const isLastStep = stepIndex === message.thinkingSteps!.length - 1;
                        const isActive = isLastStep && message.isStreaming && !message.content;
                        const StepIcon = step.stage === 'analyzing' ? Brain
                          : step.stage === 'thinking' ? Brain
                          : step.stage === 'searching_events' ? Search
                          : step.stage === 'fetching_document' ? FileText
                          : step.stage === 'tool' ? Search
                          : step.completed ? CheckCircle
                          : Sparkles;
                        
                        return (
                          <div
                            key={`${step.stage}-${stepIndex}`}
                            className={`flex items-center gap-2 text-xs ${
                              step.completed || !isActive
                                ? 'text-muted-foreground'
                                : 'text-primary'
                            }`}
                          >
                            {isActive && !step.completed ? (
                              <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                            ) : (
                              <StepIcon className={`w-3 h-3 flex-shrink-0 ${
                                step.completed ? 'text-green-500' : ''
                              }`} />
                            )}
                            <span className={isActive && !step.completed ? 'font-medium' : ''}>
                              {step.message}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  
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
                    className={`chat-bubble rounded-2xl px-3 py-2 max-w-[95%] min-w-0 ${
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
                                  <div className="max-h-[400px] overflow-y-auto overflow-x-auto bg-slate-900 discreet-scroll">
                                    <pre className="p-3 text-sm text-slate-100 font-mono whitespace-pre">{children}</pre>
                                  </div>
                                </div>
                              ),
                              blockquote: ({ children }) => (
                                <blockquote className="border-l-4 border-primary/50 pl-3 py-1 my-2 bg-muted/30 rounded-r">{children}</blockquote>
                              ),
                              table: ({ children }) => <TableWithDownload>{children}</TableWithDownload>,
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
                      </>
                    )}
                  </div>
                  )}
                  {!message.isStreaming && message.costInfo && (
                    <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground/60 select-none">
                      <span>${message.costInfo.estimatedCostUsd < 0.01 ? message.costInfo.estimatedCostUsd.toFixed(4) : message.costInfo.estimatedCostUsd.toFixed(3)}</span>
                      <span>·</span>
                      <span>{message.costInfo.totalTokens.toLocaleString()} tokens</span>
                      {message.costInfo.iterationCount > 1 && (
                        <>
                          <span>·</span>
                          <span>{message.costInfo.iterationCount} steps</span>
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
      </div>

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
              <Button
                size="icon"
                disabled={!inputValue.trim() || isLoading}
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
