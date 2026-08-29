import type { GetMeasuredMilePeriodDetailQuery } from '../GetMeasuredMilePeriodDetailQuery';
import type {
  IMeasuredMileRepository,
  DelayEventSummaryForPeriod,
  ScheduleActivitySummaryForPeriod,
  DiaryContextForPeriod,
  PodContextForPeriod,
} from '../../../../domain/delay-analysis/repositories/IMeasuredMileRepository';

export interface MeasuredMilePeriodDetailResult {
  peNumber: number;
  periodStart: string | null;
  periodEnd: string | null;
  delayEvents: DelayEventSummaryForPeriod[];
  scheduleActivities: ScheduleActivitySummaryForPeriod[];
  diaryContext: DiaryContextForPeriod[];
  podContext: PodContextForPeriod[];
  citations: Array<{ documentName: string; note: string }>;
}

export class GetMeasuredMilePeriodDetailQueryHandler {
  constructor(private readonly repository: IMeasuredMileRepository) {}

  async execute(query: GetMeasuredMilePeriodDetailQuery): Promise<MeasuredMilePeriodDetailResult> {
    const periods = await this.repository.getPeriodQualities(query.projectId, query.tenantId);
    const period = periods.find((p) => p.peNumber === query.peNumber);
    if (!period) {
      throw new Error(`Pay-estimate period PE${query.peNumber} not found`);
    }

    const options = { verifiedOnly: query.verifiedOnly, wbsCodes: query.wbsCodes };
    const [delayEvents, scheduleActivities, diaryContext, podContext] = await Promise.all([
      this.repository.getDelayEventsForPeriod(query.projectId, query.tenantId, period.periodStart, period.periodEnd, options),
      this.repository.getScheduleActivitiesForPeriod(query.projectId, query.tenantId, period.periodStart, period.periodEnd),
      this.repository.getDiaryContextForPeriod(query.projectId, query.tenantId, period.periodStart, period.periodEnd),
      this.repository.getPodContextForPeriod(query.projectId, query.tenantId, period.periodStart, period.periodEnd),
    ]);

    const citations: Array<{ documentName: string; note: string }> = [
      { documentName: period.sourceFile, note: `Pay Estimate ${query.peNumber} progress detail` },
    ];
    for (const d of diaryContext) {
      if (d.documentName) citations.push({ documentName: d.documentName, note: `Foreman diary, ${d.reportDate}` });
    }
    for (const p of podContext) {
      if (p.documentName) citations.push({ documentName: p.documentName, note: `Plan of the Day, ${p.reportDate}` });
    }

    return {
      peNumber: query.peNumber,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      delayEvents,
      scheduleActivities,
      diaryContext,
      podContext,
      citations,
    };
  }
}
