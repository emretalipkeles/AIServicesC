// Play of the Day (POD) domain entities.
//
// A PodReport is the normalized tree extracted from a POD PDF: a header plus an
// ordered list of repeating sections (e.g. "CIVIL #1", "SUBCONTRACTORS", "UPO"),
// each with its own crew members, equipment, and task/cost-code lines. The tree
// mirrors the pod_reports -> pod_sections -> crew/equipment/task-line schema.
//
// This entity carries no delay-analysis semantics (no confidence, no delay
// certainty) — POD documents are excluded from delay-event extraction entirely.

export interface PodCrewMember {
  sequence: number;
  name: string;
  workerId?: string | null;
}

export interface PodEquipmentItem {
  sequence: number;
  name: string;
  isRental: boolean;
}

export interface PodTaskLine {
  sequence: number;
  description: string;
  costCode?: string | null;
}

export interface PodSection {
  sequence: number;
  crewNumber?: string | null;
  label: string;
  category?: string | null;
  trucking?: string | null;
  traffic?: string | null;
  notes?: string | null;
  crewMembers: PodCrewMember[];
  equipment: PodEquipmentItem[];
  taskLines: PodTaskLine[];
}

export interface PodReportProps {
  id: string;
  sourceDocumentId: string;
  projectId: string;
  tenantId: string;
  reportDate: Date | null;
  title: string | null;
  sections: PodSection[];
}

export class PodReport {
  readonly id: string;
  readonly sourceDocumentId: string;
  readonly projectId: string;
  readonly tenantId: string;
  readonly reportDate: Date | null;
  readonly title: string | null;
  readonly sections: PodSection[];

  constructor(props: PodReportProps) {
    this.id = props.id;
    this.sourceDocumentId = props.sourceDocumentId;
    this.projectId = props.projectId;
    this.tenantId = props.tenantId;
    this.reportDate = props.reportDate;
    this.title = props.title;
    this.sections = props.sections;
    this.validate();
  }

  private validate(): void {
    if (!this.sourceDocumentId || this.sourceDocumentId.trim().length === 0) {
      throw new Error('POD report requires a source document id');
    }
    if (!this.projectId || this.projectId.trim().length === 0) {
      throw new Error('POD report requires a project id');
    }
    if (!this.tenantId || this.tenantId.trim().length === 0) {
      throw new Error('POD report requires a tenant id');
    }
  }
}
