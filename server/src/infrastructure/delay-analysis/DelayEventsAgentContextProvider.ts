import type { IDelayEventsAgentContextProvider, DelayEventsContext } from '../../domain/interfaces/IDelayEventsAgentContextProvider';
import type { IContractorDelayEventRepository } from '../../domain/delay-analysis/repositories/IContractorDelayEventRepository';
import type { ContractorDelayEvent } from '../../domain/delay-analysis/entities/ContractorDelayEvent';

const DELAY_EVENTS_CONTEXT_PREFIX = `

## DELAY EVENTS DATA:
`;

function formatCategory(category: string | null): string {
  if (!category) return 'Unknown';
  return category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function formatDelayEventsForContext(events: ContractorDelayEvent[]): string {
  if (events.length === 0) {
    return "\n[No delay events have been recorded for this project yet.]\n";
  }

  const eventSummaries = events.map((event, index) => {
    const parts = [
      `${index + 1}. ${event.eventDescription}`,
      `   - Category: ${formatCategory(event.eventCategory)}`,
      `   - Date: ${event.eventStartDate ? new Date(event.eventStartDate).toLocaleDateString() : 'Not specified'}`,
      `   - Duration: ${event.impactDurationHours ? `${event.impactDurationHours} hours` : 'Not specified'}`,
      `   - Status: ${event.verificationStatus}`,
    ];
    
    if (event.cpmActivityId) {
      parts.push(`   - Matched Activity: ${event.cpmActivityId} - ${event.cpmActivityDescription || 'N/A'}`);
    }
    if (event.matchConfidence !== null) {
      parts.push(`   - Match Confidence: ${event.matchConfidence}%`);
    }
    if (event.sourceReference) {
      parts.push(`   - Source: ${event.sourceReference}`);
    }
    
    return parts.join('\n');
  });

  return `\nTotal Events: ${events.length}\n\n${eventSummaries.join('\n\n')}`;
}

export class DelayEventsAgentContextProvider implements IDelayEventsAgentContextProvider {
  constructor(
    private readonly delayEventRepository: IContractorDelayEventRepository
  ) {}

  async getContext(projectId: string, tenantId: string): Promise<DelayEventsContext> {
    const events = await this.delayEventRepository.findByProjectId(projectId, tenantId);
    const formattedEvents = formatDelayEventsForContext(events);
    
    return {
      systemPromptAddition: DELAY_EVENTS_CONTEXT_PREFIX + formattedEvents,
      eventCount: events.length,
      projectId,
    };
  }
}
