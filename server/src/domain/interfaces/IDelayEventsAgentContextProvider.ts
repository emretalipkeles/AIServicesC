export interface DelayEventsContext {
  systemPromptAddition: string;
  eventCount: number;
  projectId: string;
}

export interface IDelayEventsAgentContextProvider {
  getContext(projectId: string, tenantId: string): Promise<DelayEventsContext>;
}
