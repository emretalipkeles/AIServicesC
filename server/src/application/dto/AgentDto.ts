export interface AgentDto {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  model: string;
  allowedTables: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentDocumentDto {
  id: string;
  agentId: string;
  tenantId: string;
  filename: string;
  contentType: string;
  status: string;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatWithAgentResponseDto {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  retrievedChunks: {
    content: string;
    score: number;
    documentId: string;
  }[];
}
