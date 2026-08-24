// Foreman Diary domain entities.
//
// A DiaryReport is one calendar date's worth of foreman diary blocks extracted from a
// HeavyJob diary export: an ordered list of author-scoped DiaryEntry note blocks. A single
// uploaded PDF spans a date range, so parsing it produces many DiaryReport rows (one per
// date found), each tied back to its source document.
//
// Like PodReport, this entity carries no delay-analysis semantics — diaries never produce
// delay events themselves. They exist purely to enrich/corroborate delay events that
// IDR/NCR/Field Memo extraction already found, via a day-scoped evidence provider.

export type DiaryExtractionMethod = 'deterministic' | 'ai_fallback';

export interface DiaryEntry {
  sequence: number;
  authorName: string;
  weather: string | null;
  /** Empty string when the source PDF's Note block for this author was blank ("No notes found"). */
  noteText: string;
  /**
   * 1-based PDF page where this entry's Diary block began. Null when the source wasn't a
   * PDF walked page-by-page (e.g. an AI-fallback pass over already-flattened text) or the
   * page couldn't be determined.
   */
  pageNumber: number | null;
  /** 1-based PDF page where this entry's note text ended, only set when it differs from
   * `pageNumber` (i.e. the note continued across a page break). Null otherwise. */
  pageRangeEnd: number | null;
}

export interface DiaryReportProps {
  id: string;
  sourceDocumentId: string;
  projectId: string;
  tenantId: string;
  reportDate: Date;
  sequence: number;
  extractionMethod: DiaryExtractionMethod;
  entries: DiaryEntry[];
}

export class DiaryReport {
  readonly id: string;
  readonly sourceDocumentId: string;
  readonly projectId: string;
  readonly tenantId: string;
  readonly reportDate: Date;
  readonly sequence: number;
  readonly extractionMethod: DiaryExtractionMethod;
  readonly entries: DiaryEntry[];

  constructor(props: DiaryReportProps) {
    this.id = props.id;
    this.sourceDocumentId = props.sourceDocumentId;
    this.projectId = props.projectId;
    this.tenantId = props.tenantId;
    this.reportDate = props.reportDate;
    this.sequence = props.sequence;
    this.extractionMethod = props.extractionMethod;
    this.entries = props.entries;
    this.validate();
  }

  private validate(): void {
    if (!this.sourceDocumentId || this.sourceDocumentId.trim().length === 0) {
      throw new Error('Diary report requires a source document id');
    }
    if (!this.projectId || this.projectId.trim().length === 0) {
      throw new Error('Diary report requires a project id');
    }
    if (!this.tenantId || this.tenantId.trim().length === 0) {
      throw new Error('Diary report requires a tenant id');
    }
  }
}
