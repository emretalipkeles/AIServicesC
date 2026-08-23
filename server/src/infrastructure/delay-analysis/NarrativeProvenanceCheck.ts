/**
 * Post-extraction audit for narrative (diary) provenance.
 *
 * IDRs carry their richest delay information in timestamped narrative prose, and the IDR prompts
 * require any event taken from such an entry to cite that entry's timestamp in `sourceReference`.
 * This check does not modify or reject events — it logs when that contract is not being honoured so
 * a run can be audited from the workflow logs instead of by querying the database afterwards.
 */

/**
 * Matches a clock time, deliberately NOT a calendar date.
 *
 * The bare four-digit military form collides with years ("Date: 6/1/2022" parses as 20:22), which
 * would let an ordinary report header count as narrative provenance and make this audit useless.
 * So the bare form accepts only 0000-1859 and refuses anything touching date punctuation; later
 * evening times still register when written with a colon, an am/pm marker, or an "hrs" suffix.
 */
const TIME_PATTERN = new RegExp(
  [
    // 7:00, 07:00, 14:30, optionally with am/pm
    String.raw`\b(?:[01]?\d|2[0-3]):[0-5]\d\s*(?:[AaPp]\.?[Mm]\.?)?`,
    // 7am, 7 a.m.
    String.raw`\b(?:[01]?\d|2[0-3])\s*[AaPp]\.?[Mm]\.?`,
    // 0730hrs / 2015 hrs — explicit suffix removes any date ambiguity
    String.raw`\b(?:[01]\d|2[0-3])[0-5]\d\s*hrs\b`,
    // bare 0730 — restricted to 0000-1859 and kept clear of date separators
    String.raw`(?<![\d/.\-])(?:0\d|1[0-8])[0-5]\d(?![\d/.\-])`,
  ].join('|')
);

export interface NarrativeProvenanceStats {
  /** Document contains timestamped narrative entries. */
  documentHasTimestamps: boolean;
  eventsChecked: number;
  /** Events whose sourceReference carries a timestamp. */
  eventsWithTimestamp: number;
}

export function containsNarrativeTimestamps(documentContent: string): boolean {
  return TIME_PATTERN.test(documentContent);
}

export function sourceReferenceHasTimestamp(sourceReference: string | null | undefined): boolean {
  if (!sourceReference) return false;
  return TIME_PATTERN.test(sourceReference);
}

/**
 * Logs a summary of narrative-timestamp provenance for one extracted document.
 * Only meaningful for document types whose prompts demand timestamp citations (IDRs).
 */
export function auditNarrativeProvenance(
  logPrefix: string,
  documentType: string,
  documentFilename: string,
  documentContent: string,
  events: Array<{ sourceReference?: string | null; eventDescription: string }>
): NarrativeProvenanceStats {
  const documentHasTimestamps = containsNarrativeTimestamps(documentContent);
  const stats: NarrativeProvenanceStats = {
    documentHasTimestamps,
    eventsChecked: events.length,
    eventsWithTimestamp: 0,
  };

  if (documentType !== 'idr') {
    return stats;
  }

  for (const event of events) {
    if (sourceReferenceHasTimestamp(event.sourceReference)) {
      stats.eventsWithTimestamp++;
    }
  }

  if (documentHasTimestamps && events.length === 0) {
    console.warn(
      `${logPrefix} NARRATIVE AUDIT: "${documentFilename}" contains timestamped narrative entries but produced ZERO delay events. ` +
      `Verify this is a genuinely clean report and not a premature exit on a "None" summary field.`
    );
    return stats;
  }

  if (documentHasTimestamps && stats.eventsWithTimestamp < events.length) {
    const missing = events.length - stats.eventsWithTimestamp;
    console.warn(
      `${logPrefix} NARRATIVE AUDIT: "${documentFilename}" — ${missing} of ${events.length} event(s) have no timestamp in sourceReference ` +
      `even though the document has timestamped narrative entries. Durations for those events are likely estimated rather than calculated.`
    );
    for (const event of events) {
      if (!sourceReferenceHasTimestamp(event.sourceReference)) {
        console.warn(
          `${logPrefix} NARRATIVE AUDIT:   no timestamp -> "${event.eventDescription.substring(0, 90)}" (sourceReference: "${event.sourceReference ?? ''}")`
        );
      }
    }
  } else if (documentHasTimestamps && events.length > 0) {
    console.log(
      `${logPrefix} NARRATIVE AUDIT: "${documentFilename}" — all ${events.length} event(s) cite a narrative timestamp.`
    );
  }

  return stats;
}
