import type { ITool, ToolDefinition, ToolExecutionContext, ToolExecutionResult } from '../../../../domain/delay-analysis/interfaces/ITool';
import type { IContractorDelayEventRepository } from '../../../../domain/delay-analysis/repositories/IContractorDelayEventRepository';
import type { ContractorDelayEvent } from '../../../../domain/delay-analysis/entities/ContractorDelayEvent';

export class ListDelayEventsTool implements ITool {
  readonly definition: ToolDefinition;

  constructor(private readonly repository: IContractorDelayEventRepository) {
    this.definition = {
      name: 'list_delay_events',
      description: "List all contractor delay events for the project, optionally filtered by month and year. Returns a summary of each event including description, category, dates, duration, confidence scores, matched activity ID, and source reference. Use this when the user asks to see delay events, wants an overview of delays, or asks about delays in a specific time period.",
      parameters: {
        type: 'object',
        properties: {
          month: {
            type: 'number',
            description: 'Optional month number (1-12) to filter events by their start date. Use together with year.',
            enum: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
          },
          year: {
            type: 'number',
            description: 'Optional 4-digit year to filter events by their start date. Use together with month. Example: 2025'
          },
          category: {
            type: 'string',
            description: 'Optional category to filter events. E.g., "weather", "labor_shortage", "equipment_failure", "material_delay", "subcontractor", "rework", "other"'
          }
        },
        required: []
      }
    };
  }

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const month = args.month as number | undefined;
    const year = args.year as number | undefined;
    const category = args.category as string | undefined;

    console.log(`[ListDelayEventsTool] Invoked with args: ${JSON.stringify(args).substring(0, 200)}`);

    try {
      const allEvents = await this.repository.findByProjectId(
        context.projectId,
        context.tenantId
      );

      let filtered = allEvents;

      if (month !== undefined && year !== undefined) {
        filtered = filtered.filter(event => {
          const date = event.eventStartDate;
          if (!date) return false;
          return date.getMonth() + 1 === month && date.getFullYear() === year;
        });
      } else if (year !== undefined) {
        filtered = filtered.filter(event => {
          const date = event.eventStartDate;
          if (!date) return false;
          return date.getFullYear() === year;
        });
      }

      if (category) {
        filtered = filtered.filter(event =>
          event.eventCategory?.toLowerCase() === category.toLowerCase()
        );
      }

      const summary = filtered.map((event: ContractorDelayEvent) => ({
        id: event.id,
        eventDescription: event.eventDescription,
        eventCategory: event.eventCategory,
        eventStartDate: event.eventStartDate?.toISOString()?.split('T')[0] ?? null,
        eventFinishDate: event.eventFinishDate?.toISOString()?.split('T')[0] ?? null,
        impactDurationHours: event.impactDurationHours,
        delayEventConfidence: event.delayEventConfidence,
        matchConfidence: event.matchConfidence,
        cpmActivityId: event.cpmActivityId,
        cpmActivityDescription: event.cpmActivityDescription,
        sourceReference: event.sourceReference,
        verificationStatus: event.verificationStatus,
      }));

      console.log(`[ListDelayEventsTool] Found ${summary.length} events (${allEvents.length} total, filtered by month=${month}, year=${year}, category=${category})`);

      return {
        success: true,
        output: {
          totalEventsInProject: allEvents.length,
          filteredCount: summary.length,
          filters: { month, year, category },
          events: summary
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`[ListDelayEventsTool] Error: ${message}`);
      return {
        success: false,
        output: null,
        error: message
      };
    }
  }
}
