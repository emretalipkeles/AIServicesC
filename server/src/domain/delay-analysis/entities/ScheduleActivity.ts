export interface ScheduleActivityProps {
  id: string;
  projectId: string;
  tenantId: string;
  sourceDocumentId?: string | null;
  activityId: string;
  wbs?: string | null;
  activityDescription: string;
  plannedStartDate?: Date | null;
  plannedFinishDate?: Date | null;
  actualStartDate?: Date | null;
  actualFinishDate?: Date | null;
  scheduleUpdateMonth?: string | null;
  isCriticalPath: string;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
}

export class ScheduleActivity {
  readonly id: string;
  readonly projectId: string;
  readonly tenantId: string;
  readonly sourceDocumentId: string | null;
  readonly activityId: string;
  readonly wbs: string | null;
  readonly activityDescription: string;
  readonly plannedStartDate: Date | null;
  readonly plannedFinishDate: Date | null;
  readonly actualStartDate: Date | null;
  readonly actualFinishDate: Date | null;
  readonly scheduleUpdateMonth: string | null;
  readonly isCriticalPath: string;
  readonly metadata: Record<string, unknown> | null;
  readonly createdAt: Date;

  constructor(props: ScheduleActivityProps) {
    this.id = props.id;
    this.projectId = props.projectId;
    this.tenantId = props.tenantId;
    this.sourceDocumentId = props.sourceDocumentId ?? null;
    this.activityId = props.activityId;
    this.wbs = props.wbs ?? null;
    this.activityDescription = props.activityDescription;
    this.plannedStartDate = props.plannedStartDate ?? null;
    this.plannedFinishDate = props.plannedFinishDate ?? null;
    this.actualStartDate = props.actualStartDate ?? null;
    this.actualFinishDate = props.actualFinishDate ?? null;
    this.scheduleUpdateMonth = props.scheduleUpdateMonth ?? null;
    this.isCriticalPath = props.isCriticalPath;
    this.metadata = props.metadata ?? null;
    this.createdAt = props.createdAt;
  }

  wasActiveOnDate(date: Date): boolean {
    const start = this.actualStartDate ?? this.plannedStartDate;
    const finish = this.actualFinishDate ?? this.plannedFinishDate;
    
    if (!start) return false;
    if (date < start) return false;
    if (finish && date > finish) return false;
    
    return true;
  }

  getPlannedDurationDays(): number | null {
    if (!this.plannedStartDate || !this.plannedFinishDate) return null;
    const diffMs = this.plannedFinishDate.getTime() - this.plannedStartDate.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  matchesDescription(searchText: string): boolean {
    const normalizedSearch = searchText.toLowerCase().trim();
    const normalizedDesc = this.activityDescription.toLowerCase();
    const normalizedId = this.activityId.toLowerCase();
    
    return normalizedDesc.includes(normalizedSearch) || 
           normalizedId.includes(normalizedSearch) ||
           (this.wbs?.toLowerCase().includes(normalizedSearch) ?? false);
  }
}
