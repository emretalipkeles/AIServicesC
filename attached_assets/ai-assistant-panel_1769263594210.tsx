import React, { useState, useEffect, useRef } from "react";
import { ResizableDrawer, DrawerMode } from "@/components/ui/resizable-drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AiButton } from "@/components/ui/ai-button";
import { Send, Sparkles, User, AlertCircle, RotateCcw, Maximize2, PanelRightClose } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { McpTextFormatter } from "@/components/mcp-text-formatter";
import { useEntity } from "@/contexts/entity-context";
import { useAi } from "@/contexts/ai-context";
import { useI18n } from "@/lib/i18n";
import { AiLanguage, defaultAiLanguage, isValidAiLanguage } from "@shared/ai-types";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

interface ChatMessage {
  id: string;
  type: 'user' | 'ai' | 'error';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
}

// Loading text rotation
const LOADING_TEXTS = [
  "Thinking",
  "Collecting information",
  "Analyzing your data",
  "Thinking",
  "Analyzing your data",
  "This is taking longer than usual. Feel free to explore the app or grab a coffee ☕",
];

const LOADING_TEXT_INTERVAL = 9000; // 9 seconds

interface PollingState {
  correlationId: string;
  loadingMessageId: string;
  startTime: number;
  sessionId: string;
  entityId: number;
}

const MAX_POLLING_DURATION = 400000; // 400 seconds in milliseconds
const ALTERNATION_MESSAGE_FIRST_SHOW = 12; // Show message after 12 alternations
const ALTERNATION_MESSAGE_REPEAT_INTERVAL = 8; // Then show every 8 alternations

// LocalStorage helpers for polling persistence
const getPollingStorageKey = (entityId: number) => `mcp-polling-state-entity-${entityId}`;

const savePollingState = (state: PollingState) => {
  try {
    localStorage.setItem(getPollingStorageKey(state.entityId), JSON.stringify(state));
  } catch (error) {
    console.error('Failed to save polling state:', error);
  }
};

const loadPollingState = (entityId: number): PollingState | null => {
  try {
    const stored = localStorage.getItem(getPollingStorageKey(entityId));
    if (!stored) return null;
    return JSON.parse(stored);
  } catch (error) {
    console.error('Failed to load polling state:', error);
    return null;
  }
};

const clearPollingState = (entityId: number) => {
  try {
    localStorage.removeItem(getPollingStorageKey(entityId));
  } catch (error) {
    console.error('Failed to clear polling state:', error);
  }
};

// LocalStorage helpers for chat messages
const getChatStorageKey = (userId: number, entityId: number, sessionId: string) => 
  `ai-chat-messages-user-${userId}-entity-${entityId}-session-${sessionId}`;

const saveChatMessages = (userId: number, entityId: number, sessionId: string, messages: ChatMessage[]) => {
  try {
    localStorage.setItem(getChatStorageKey(userId, entityId, sessionId), JSON.stringify(messages));
  } catch (error) {
    console.error('Failed to save chat messages to localStorage:', error);
  }
};

const loadChatMessages = (userId: number, entityId: number, sessionId: string): ChatMessage[] | null => {
  try {
    const stored = localStorage.getItem(getChatStorageKey(userId, entityId, sessionId));
    if (!stored) return null;
    const messages = JSON.parse(stored);
    return messages.map((msg: any) => ({
      ...msg,
      timestamp: new Date(msg.timestamp),
    }));
  } catch (error) {
    console.error('Failed to load chat messages from localStorage:', error);
    return null;
  }
};

const clearChatMessages = (userId: number, entityId: number, sessionId: string) => {
  try {
    localStorage.removeItem(getChatStorageKey(userId, entityId, sessionId));
  } catch (error) {
    console.error('Failed to clear chat messages from localStorage:', error);
  }
};

export function AiAssistantPanel() {
  const { isOpen, pendingMessage, openPanel, closePanel, clearPendingMessage } = useAi();
  const [mode, setMode] = useState<DrawerMode>('docked');
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activePollingId, setActivePollingId] = useState<string | null>(null);
  const [loadingTextIndex, setLoadingTextIndex] = useState(0);
  const [alternationCount, setAlternationCount] = useState(0);
  const [isSyncingFromDb, setIsSyncingFromDb] = useState(false);
  
  const { language: uiLanguage } = useI18n();
  const { t } = useI18n();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const { selectedEntityId, selectedEntity } = useEntity();
  const { toast } = useToast();
  const { user } = useAuth();

  // Map UI language to AI language
  const mapUiToAiLanguage = (uiLang: string): AiLanguage => {
    return isValidAiLanguage(uiLang) ? (uiLang as AiLanguage) : defaultAiLanguage;
  };
  
  const currentAiLanguage = mapUiToAiLanguage(uiLanguage);

  // Generate UUID v4
  const generateUUID = (): string => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  // Initialize session ID and load messages when panel opens
  useEffect(() => {
    if (isOpen && selectedEntityId) {
      const userId = user?.id;
      
      if (!userId) return;
      
      if (!sessionId) {
        (async () => {
          const savedState = loadPollingState(selectedEntityId);
          if (savedState) {
            setSessionId(savedState.sessionId);
            
            const cachedMessages = loadChatMessages(userId, selectedEntityId, savedState.sessionId);
            if (cachedMessages && cachedMessages.length > 0) {
              setMessages(cachedMessages);
            }
            
            // Skip sync if we have a pending message to process (to avoid overwriting the loading indicator)
            if (!pendingMessage) {
              syncMessagesWithDb(userId, selectedEntityId, savedState.sessionId);
            }
          } else {
            const recentSession = await loadMostRecentSession(userId, selectedEntityId);
            if (recentSession) {
              setSessionId(recentSession.sessionId);
              setMessages(recentSession.messages);
              saveChatMessages(userId, selectedEntityId, recentSession.sessionId, recentSession.messages);
            } else {
              const newSessionId = generateUUID();
              setSessionId(newSessionId);
            }
          }
        })();
      } else {
        const cachedMessages = loadChatMessages(userId, selectedEntityId, sessionId);
        if (cachedMessages && cachedMessages.length > 0) {
          setMessages(cachedMessages);
        }
        
        // Skip sync if we have a pending message to process (to avoid overwriting the loading indicator)
        if (!pendingMessage) {
          syncMessagesWithDb(userId, selectedEntityId, sessionId);
        }
      }
      
      setMode('docked');
    }
  }, [isOpen, sessionId, selectedEntityId, user?.id]);

  // Handle pending message from context (auto-send when panel opens with pre-filled message)
  const pendingMessageProcessedRef = useRef<string | null>(null);
  useEffect(() => {
    // Only process if all prerequisites are met
    if (
      isOpen &&
      pendingMessage &&
      sessionId &&
      selectedEntityId &&
      selectedEntity &&
      !isProcessing &&
      pendingMessageProcessedRef.current !== pendingMessage
    ) {
      // Mark this message as processed to prevent duplicates
      pendingMessageProcessedRef.current = pendingMessage;
      
      // Set the query
      setQuery(pendingMessage);
      
      // Clear from context immediately
      clearPendingMessage();
      
      // Synchronously update UI state - add both messages in one update to avoid React batching issues
      const userMessage: ChatMessage = {
        id: generateUUID(),
        type: 'user',
        content: pendingMessage,
        timestamp: new Date(),
      };
      
      const loadingMessageId = generateUUID();
      const loadingMessage: ChatMessage = {
        id: loadingMessageId,
        type: 'ai',
        content: '',
        timestamp: new Date(),
        isLoading: true,
      };
      
      // Add both messages together to prevent React state batching issues
      updateMessages(prev => [...prev, userMessage, loadingMessage]);
      
      // Save user message to database asynchronously
      apiRequest("POST", "/api/ai/chat-messages", {
        entityId: selectedEntityId,
        sessionId,
        messageType: 'user',
        content: pendingMessage,
        timestamp: new Date(),
      }).catch(error => {
        console.error('Failed to save user message to database:', error);
      });
      setQuery("");
      setIsProcessing(true);
      setAlternationCount(0);

      const correlationId = generateUUID();
      apiRequest("POST", "/api/ai/mcp-assistant/process-message", {
        correlationId,
        sessionId,
        userMessage: pendingMessage,
        entityId: selectedEntityId,
        entityName: selectedEntity.name,
        language: currentAiLanguage,
      })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            startPolling(correlationId, loadingMessageId);
          } else {
            throw new Error("Failed to start processing");
          }
        })
        .catch(error => {
          setIsProcessing(false);
          updateMessages(prev => {
            const filtered = prev.filter(msg => msg.id !== loadingMessageId);
            const errorMessage: ChatMessage = {
              id: generateUUID(),
              type: 'error',
              content: error instanceof Error ? error.message : 'Failed to process your request',
              timestamp: new Date(),
            };
            return [...filtered, errorMessage];
          });
          toast({
            title: "Request failed",
            description: error instanceof Error ? error.message : 'Failed to send message',
            variant: "destructive",
          });
        });
    }
  }, [isOpen, pendingMessage, sessionId, selectedEntityId, selectedEntity, isProcessing, clearPendingMessage, currentAiLanguage, toast]);

  // Reset pending message guard when panel closes to allow re-submission of same prompts
  useEffect(() => {
    if (!isOpen) {
      pendingMessageProcessedRef.current = null;
    }
  }, [isOpen]);

  // Reset pending message guard when entity or session changes
  useEffect(() => {
    pendingMessageProcessedRef.current = null;
  }, [selectedEntityId, sessionId]);

  // Auto-scroll to bottom when messages change or panel opens
  useEffect(() => {
    if (scrollAreaRef.current && isOpen) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  // Clear polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Rotate loading text while processing
  useEffect(() => {
    if (!isProcessing) {
      setLoadingTextIndex(0);
      setAlternationCount(0);
      return;
    }

    const interval = setInterval(() => {
      setLoadingTextIndex((prev) => {
        // After showing first 3 texts, alternate between indices 3 and 4 (Thinking and Analyzing)
        if (prev >= 2) {
          setAlternationCount((count) => {
            const newCount = count + 1;
            
            // Check if we should show the "taking longer" message
            if (newCount === ALTERNATION_MESSAGE_FIRST_SHOW || 
                (newCount > ALTERNATION_MESSAGE_FIRST_SHOW && 
                 (newCount - ALTERNATION_MESSAGE_FIRST_SHOW) % ALTERNATION_MESSAGE_REPEAT_INTERVAL === 0)) {
              return newCount;
            }
            return newCount;
          });
          
          // Determine next index
          const nextCount = alternationCount + 1;
          const shouldShowLongMessage = 
            nextCount === ALTERNATION_MESSAGE_FIRST_SHOW || 
            (nextCount > ALTERNATION_MESSAGE_FIRST_SHOW && 
             (nextCount - ALTERNATION_MESSAGE_FIRST_SHOW) % ALTERNATION_MESSAGE_REPEAT_INTERVAL === 0);
          
          if (shouldShowLongMessage) {
            return 5; // Show the "taking longer" message
          }
          
          return prev === 3 ? 4 : 3;
        }
        return prev + 1;
      });
    }, LOADING_TEXT_INTERVAL);

    return () => clearInterval(interval);
  }, [isProcessing, alternationCount]);

  // Resume polling on mount if there's a saved state
  useEffect(() => {
    if (!selectedEntityId || !sessionId || !isOpen) return;

    const savedState = loadPollingState(selectedEntityId);
    if (!savedState) return;

    // Check if the saved session matches the current session
    if (savedState.sessionId !== sessionId) {
      // Different session, clear old polling state
      clearPollingState(selectedEntityId);
      return;
    }

    // Check if max duration has been exceeded
    const elapsedTime = Date.now() - savedState.startTime;
    if (elapsedTime > MAX_POLLING_DURATION) {
      console.warn('Saved polling state has expired, clearing...');
      clearPollingState(selectedEntityId);
      return;
    }

    // Resume polling if not already polling
    if (!activePollingId && !isProcessing) {
      console.log('Resuming polling for correlation:', savedState.correlationId);
      
      // Ensure loading message exists in messages
      const hasLoadingMessage = messages.some(msg => msg.id === savedState.loadingMessageId);
      if (!hasLoadingMessage) {
        // Add loading message back
        const loadingMessage: ChatMessage = {
          id: savedState.loadingMessageId,
          type: 'ai',
          content: '',
          timestamp: new Date(),
          isLoading: true,
        };
        updateMessages(prev => [...prev, loadingMessage]);
      }
      
      setIsProcessing(true);
      startPolling(savedState.correlationId, savedState.loadingMessageId, savedState.startTime);
    }
  }, [selectedEntityId, sessionId, isOpen, activePollingId, isProcessing, messages]);

  // Clear polling state when entity changes
  useEffect(() => {
    return () => {
      if (selectedEntityId) {
        // Clean up polling state for the old entity when switching
        const savedState = loadPollingState(selectedEntityId);
        if (savedState && savedState.sessionId !== sessionId) {
          clearPollingState(selectedEntityId);
        }
      }
    };
  }, [selectedEntityId, sessionId]);

  // Poll for result with timeout handling
  const pollForResult = async (correlationId: string, loadingMessageId: string, startTime: number) => {
    try {
      // Check if polling has exceeded max duration
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > MAX_POLLING_DURATION) {
        console.warn('Polling timeout reached for correlation:', correlationId);
        // Stop polling
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        setActivePollingId(null);
        setIsProcessing(false);
        
        // Clear polling state
        if (selectedEntityId) {
          clearPollingState(selectedEntityId);
        }

        // Remove loading message and add timeout error
        updateMessages(prev => {
          const filtered = prev.filter(msg => msg.id !== loadingMessageId);
          const errorMessage: ChatMessage = {
            id: generateUUID(),
            type: 'error',
            content: 'Request timed out after 400 seconds. Please try again.',
            timestamp: new Date(),
          };
          return [...filtered, errorMessage];
        });

        toast({
          title: "Request timeout",
          description: "The AI assistant took too long to respond. Please try again.",
          variant: "destructive",
        });
        return;
      }

      const response = await apiRequest("GET", `/api/ai/mcp-assistant/poll/${correlationId}`);
      const data = await response.json();

      if (!data.success) {
        throw new Error("Polling failed");
      }

      const result = data.data;

      if (result.found && result.result) {
        const aiResult = result.result;

        if (aiResult.status === 'completed') {
          // Stop polling
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          setActivePollingId(null);
          setIsProcessing(false);
          
          // Clear polling state
          if (selectedEntityId) {
            clearPollingState(selectedEntityId);
          }

          // Extract text from output
          // n8n stores output as: {"output": "..."}
          let responseText = "Response received";
          
          if (typeof aiResult.output === 'string') {
            responseText = aiResult.output;
          } else if (aiResult.output?.output) {
            // Extract from n8n format: {"output": "..."}
            responseText = aiResult.output.output;
          } else if (Array.isArray(aiResult.output) && aiResult.output.length > 0) {
            // Fallback: Extract from old array format: [{"json": {"output": "..."}}]
            responseText = aiResult.output[0]?.json?.output || "Response received";
          } else if (aiResult.output?.text) {
            responseText = aiResult.output.text;
          } else if (aiResult.output?.response) {
            responseText = aiResult.output.response;
          }

          // Remove loading message and add AI response
          updateMessages(prev => {
            const filtered = prev.filter(msg => msg.id !== loadingMessageId);
            const aiResponse: ChatMessage = {
              id: generateUUID(),
              type: 'ai',
              content: responseText,
              timestamp: new Date(),
            };
            return [...filtered, aiResponse];
          });

          // Save AI response to database
          try {
            await apiRequest("POST", "/api/ai/chat-messages", {
              entityId: selectedEntityId,
              sessionId,
              messageType: 'ai',
              content: responseText,
              timestamp: new Date(),
            });
          } catch (error) {
            console.error('Failed to save AI response to database:', error);
          }

        } else if (aiResult.status === 'failed') {
          // Stop polling
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          setActivePollingId(null);
          setIsProcessing(false);
          
          // Clear polling state
          if (selectedEntityId) {
            clearPollingState(selectedEntityId);
          }

          // Remove loading message and add error
          updateMessages(prev => {
            const filtered = prev.filter(msg => msg.id !== loadingMessageId);
            const errorMessage: ChatMessage = {
              id: generateUUID(),
              type: 'error',
              content: 'Failed to process your request. Please try again.',
              timestamp: new Date(),
            };
            return [...filtered, errorMessage];
          });

          toast({
            title: "Processing failed",
            description: "Please try asking your question again.",
            variant: "destructive",
          });
        }
        // If still pending, keep polling
      }
    } catch (error) {
      console.error('Polling error:', error);
      // Continue polling unless it's a critical error
    }
  };

  // Start polling with persistence
  const startPolling = (correlationId: string, loadingMessageId: string, startTime?: number) => {
    if (!selectedEntityId || !sessionId) return;
    
    const pollingStartTime = startTime || Date.now();
    setActivePollingId(correlationId);
    
    // Save polling state to localStorage
    const pollingState: PollingState = {
      correlationId,
      loadingMessageId,
      startTime: pollingStartTime,
      sessionId,
      entityId: selectedEntityId,
    };
    savePollingState(pollingState);
    
    // Clear any existing polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    // Poll immediately
    pollForResult(correlationId, loadingMessageId, pollingStartTime);

    // Then poll every 2 seconds
    pollingIntervalRef.current = setInterval(() => {
      pollForResult(correlationId, loadingMessageId, pollingStartTime);
    }, 2000);
  };

  // Auto-resize textarea as user types
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '44px';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = Math.min(scrollHeight, 200) + 'px';
    }
  }, [query]);

  // Handle keyboard events for textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !selectedEntityId || !selectedEntity || !sessionId || isProcessing) {
      return;
    }
    
    const userMessage: ChatMessage = {
      id: generateUUID(),
      type: 'user',
      content: query.trim(),
      timestamp: new Date(),
    };
    
    // Add user message
    updateMessages(prev => [...prev, userMessage]);
    
    // Save to database asynchronously
    try {
      await apiRequest("POST", "/api/ai/chat-messages", {
        entityId: selectedEntityId,
        sessionId,
        messageType: 'user',
        content: query.trim(),
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('Failed to save user message to database:', error);
    }
    
    // Add loading AI message
    const loadingMessageId = generateUUID();
    const loadingMessage: ChatMessage = {
      id: loadingMessageId,
      type: 'ai',
      content: '',
      timestamp: new Date(),
      isLoading: true,
    };
    
    updateMessages(prev => [...prev, loadingMessage]);
    setQuery("");
    setIsProcessing(true);
    setAlternationCount(0);

    try {
      const correlationId = generateUUID();

      // Start MCP processing
      const response = await apiRequest("POST", "/api/ai/mcp-assistant/process-message", {
        correlationId,
        sessionId,
        userMessage: query.trim(),
        entityId: selectedEntityId,
        entityName: selectedEntity.name,
        language: currentAiLanguage,
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error("Failed to start processing");
      }

      // Start polling for result
      startPolling(correlationId, loadingMessageId);

    } catch (error) {
      setIsProcessing(false);
      
      // Remove loading message and add error message
      updateMessages(prev => {
        const filtered = prev.filter(msg => msg.id !== loadingMessageId);
        const errorMessage: ChatMessage = {
          id: generateUUID(),
          type: 'error',
          content: error instanceof Error ? error.message : 'Failed to process your request',
          timestamp: new Date(),
        };
        return [...filtered, errorMessage];
      });

      toast({
        title: "Request failed",
        description: error instanceof Error ? error.message : 'Failed to send message',
        variant: "destructive",
      });
    }
  };

  // Load most recent session from database
  const loadMostRecentSession = async (userId: number, entityId: number): Promise<{ sessionId: string; messages: ChatMessage[] } | null> => {
    try {
      const response = await apiRequest("GET", `/api/ai/chat-messages?entityId=${entityId}&limit=100`);
      const data = await response.json();
      
      if (data.success && Array.isArray(data.data) && data.data.length > 0) {
        const dbMessages: ChatMessage[] = data.data.map((msg: any) => ({
          id: msg.id.toString(),
          type: msg.messageType,
          content: msg.content,
          timestamp: new Date(msg.timestamp),
        }));
        
        const mostRecentSessionId = data.data[0].sessionId;
        const sessionMessages = dbMessages.filter((msg: any, index: number) => 
          data.data[index].sessionId === mostRecentSessionId
        );
        
        return { sessionId: mostRecentSessionId, messages: sessionMessages };
      }
      
      return null;
    } catch (error) {
      console.error('Failed to load most recent session from database:', error);
      return null;
    }
  };

  // Sync messages with database
  const syncMessagesWithDb = async (userId: number, entityId: number, sessionId: string) => {
    if (!userId || !entityId || !sessionId) return;
    
    try {
      setIsSyncingFromDb(true);
      
      const response = await apiRequest("GET", `/api/ai/chat-messages?entityId=${entityId}&sessionId=${sessionId}`);
      const data = await response.json();
      
      if (data.success && Array.isArray(data.data)) {
        const dbMessages: ChatMessage[] = data.data.map((msg: any) => ({
          id: msg.id.toString(),
          type: msg.messageType,
          content: msg.content,
          timestamp: new Date(msg.timestamp),
        }));
        
        if (dbMessages.length > 0) {
          setMessages(dbMessages);
          saveChatMessages(userId, entityId, sessionId, dbMessages);
        }
      }
    } catch (error) {
      console.error('Failed to sync messages from database:', error);
    } finally {
      setIsSyncingFromDb(false);
    }
  };

  // Helper to update messages in both state and localStorage
  const updateMessages = (newMessages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    setMessages(prev => {
      const updated = typeof newMessages === 'function' ? newMessages(prev) : newMessages;
      
      if (selectedEntityId && sessionId && user?.id) {
        saveChatMessages(user.id, selectedEntityId, sessionId, updated);
      }
      
      return updated;
    });
  };

  // Handle new session
  const handleNewSession = async () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    
    if (sessionId) {
      try {
        await apiRequest("DELETE", `/api/ai/chat-messages/sessions/${sessionId}`);
      } catch (error) {
        console.error('Failed to clear session from database:', error);
      }
    }
    
    if (selectedEntityId && sessionId && user?.id) {
      clearChatMessages(user.id, selectedEntityId, sessionId);
      clearPollingState(selectedEntityId);
    }
    
    setActivePollingId(null);
    setIsProcessing(false);
    setMessages([]);
    setSessionId(generateUUID());
    setQuery("");
    
    toast({
      title: "New session started",
      description: "Previous conversation cleared",
    });
  };

  return (
    <>
      <AiButton 
        className="h-10"
        onClick={openPanel}
        tooltipText="LinkAI Financial Assistant"
        data-testid="button-open-ai-assistant"
      >
      </AiButton>
      
      <ResizableDrawer
        isOpen={isOpen}
        onClose={closePanel}
        mode={mode}
        onModeChange={setMode}
        headerClassName="relative bg-gradient-to-br from-white/95 via-cyan-50/60 to-blue-50/50 backdrop-blur-xl border-b-2 border-cyan-100/60 overflow-hidden before:absolute before:inset-0 before:opacity-[0.08] before:pointer-events-none before:bg-[linear-gradient(30deg,rgba(6,182,212,1)_1px,transparent_1px),linear-gradient(-30deg,rgba(6,182,212,1)_1px,transparent_1px),radial-gradient(circle_at_20%_50%,rgba(6,182,212,0.15)_0%,transparent_50%),radial-gradient(circle_at_80%_50%,rgba(59,130,246,0.15)_0%,transparent_50%)] before:bg-[length:40px_40px,40px_40px,100%_100%,100%_100%]"
        title={
          <>
            <div className="relative group/icon">
              {/* Icon glow effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-xl opacity-20 blur-lg group-hover/icon:opacity-40 transition-opacity"></div>
              
              <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-500 via-cyan-400 to-blue-500 flex items-center justify-center border-2 border-white/50 shadow-[inset_0_1px_2px_rgba(255,255,255,0.3),0_4px_12px_rgba(6,182,212,0.3)]">
                <Sparkles className="h-5 w-5 text-white drop-shadow-sm" />
              </div>
            </div>
            <div>
              <span className="text-lg font-bold bg-gradient-to-r from-gray-900 via-cyan-900 to-blue-900 bg-clip-text text-transparent">
                {t("aiPanel.title")}
                <span className="ml-2 inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase bg-white/95 text-cyan-600 border border-cyan-300 rounded-full shadow-sm align-middle">
                  Beta
                </span>
              </span>
              <p className="text-xs font-medium text-cyan-600/80">{t("aiPanel.subTitle")}</p>
            </div>
          </>
        }
        headerActions={
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleNewSession}
                  disabled={isProcessing}
                  data-testid="button-new-session"
                  className="h-9 w-9"
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("aiPanel.newSession")}</p>
              </TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMode(mode === 'docked' ? 'floating' : 'docked')}
                  data-testid="button-toggle-mode"
                  className="h-9 w-9"
                >
                  {mode === 'docked' ? (
                    <Maximize2 className="w-4 h-4" />
                  ) : (
                    <PanelRightClose className="w-4 h-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{mode === 'docked' ? 'Pop Out' : 'Dock'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        }
      >
        <div className="flex flex-col h-full">
          {/* Messages Area - scrollable */}
          <div ref={scrollAreaRef} className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-4">
              {messages.length === 0 && (
                <div className="flex items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                  <p className="text-center">
                    {t("aiPanel.startConversation")}
                  </p>
                </div>
              )}
              
              {messages.map((message, index) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex items-start gap-3 opacity-0 animate-[fadeInUp_0.4s_ease-out_forwards]",
                    message.type === "user" ? "justify-end" : "justify-start"
                  )}
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  {message.type === "ai" && (
                    <div className="relative w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 via-cyan-400 to-blue-500 flex items-center justify-center flex-shrink-0 mt-1 border-2 border-white/40 shadow-[inset_0_1px_2px_rgba(255,255,255,0.3),0_2px_8px_rgba(6,182,212,0.25)]">
                      <Sparkles className="w-4 h-4 text-white drop-shadow-sm" />
                    </div>
                  )}
                  
                  <div
                    className={cn(
                      "text-sm rounded-2xl max-w-[85%]",
                      message.type === "user"
                        ? "bg-gradient-to-br from-cyan-500 to-cyan-600 text-white rounded-br-md px-4 py-3 shadow-[0_2px_8px_rgba(6,182,212,0.2),0_1px_2px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_12px_rgba(6,182,212,0.3),0_2px_4px_rgba(0,0,0,0.08)] transition-shadow duration-200"
                        : message.type === "error"
                        ? "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 rounded-bl-md px-4 py-3 shadow-sm"
                        : message.isLoading
                        ? "" // No padding for loading
                        : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-md px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03)] hover:shadow-[0_4px_8px_rgba(0,0,0,0.08),0_2px_4px_rgba(0,0,0,0.04)] transition-all duration-200"
                    )}
                  >
                    {message.type === "error" ? (
                      <div>
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          <p className="leading-relaxed">{message.content}</p>
                        </div>
                        <div className="text-xs mt-2 opacity-70 text-red-500 dark:text-red-400">
                          {message.timestamp.toLocaleTimeString([], { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </div>
                      </div>
                    ) : message.type === "user" ? (
                      <div>
                        <p className="leading-[1.6] whitespace-pre-wrap">{message.content}</p>
                        <div className="text-xs mt-2.5 opacity-80 text-white/90">
                          {message.timestamp.toLocaleTimeString([], { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </div>
                      </div>
                    ) : message.isLoading ? (
                      <div className="flex items-center gap-2 py-4 animate-pulse">
                        <span className="text-sm text-gray-600 dark:text-gray-400 animate-in fade-in duration-500">
                          {LOADING_TEXTS[Math.min(loadingTextIndex, LOADING_TEXTS.length - 1)]}
                        </span>
                        <div className="flex gap-1">
                          <div className="w-1.5 h-1.5 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                          <div className="w-1.5 h-1.5 bg-gradient-to-r from-cyan-400 to-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                          <div className="w-1.5 h-1.5 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="leading-[1.6]">
                          <McpTextFormatter text={message.content} />
                        </div>
                        <div className="text-xs mt-2.5 opacity-60 text-gray-500 dark:text-gray-400">
                          {message.timestamp.toLocaleTimeString([], { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {message.type === "user" && (
                    <div className="w-8 h-8 rounded-full bg-gray-700 dark:bg-gray-600 flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
                      <User className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Input Area - sticky at bottom */}
          <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-4">
            <form onSubmit={handleSubmit} className="flex gap-2 items-end">
              <Textarea
                ref={textareaRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t("aiPanel.textboxPlaceholder")}
                className="flex-1 min-h-[44px] max-h-[200px] resize-none rounded-xl border-gray-300 dark:border-gray-700 focus:border-blue-500 focus:ring-blue-500 overflow-y-auto"
                disabled={isProcessing || !selectedEntityId}
                data-testid="input-ai-query"
                rows={1}
                style={{ height: '44px' }}
              />
              <Button
                type="submit"
                size="icon"
                disabled={!query.trim() || isProcessing || !selectedEntityId}
                className={cn(
                  "relative group overflow-hidden h-[44px] w-[44px]",
                  "bg-gradient-to-br from-cyan-500 via-cyan-400 to-blue-500",
                  "border-2 border-white/40",
                  "text-white",
                  "shadow-[inset_0_1px_2px_rgba(255,255,255,0.3),0_4px_12px_rgba(6,182,212,0.25)]",
                  "rounded-xl",
                  "transition-all duration-200",
                  "hover:scale-105 hover:border-white/60",
                  "hover:shadow-[inset_0_1px_2px_rgba(255,255,255,0.4),0_6px_20px_rgba(6,182,212,0.4),0_0_30px_rgba(6,182,212,0.2)]",
                  "active:scale-[0.97]",
                  "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                )}
                data-testid="button-send-query"
              >
                {/* Premium shimmer effect */}
                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
                
                {/* Subtle gradient overlay on hover */}
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                
                <Send className="w-4 h-4 relative z-10 drop-shadow-sm transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Button>
            </form>
            
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
              {!selectedEntityId 
                ? t("aiPanel.selectEntity")
                : isProcessing 
                ? t("aiPanel.processing")
                : t("aiPanel.footerMessage")}
            </p>
          </div>
        </div>
      </ResizableDrawer>
    </>
  );
}
