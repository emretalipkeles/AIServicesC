/**
 * Shared helper for extracting a single JSON object from a raw AI chat response.
 *
 * Model responses often wrap JSON in a markdown code fence and/or include leading or
 * trailing prose. This strips an optional ```json fence and then extracts the first
 * balanced-brace object. Used by the POD/Diary extraction handlers.
 *
 * NOTE: the delay-event extractors (AIDelayEventExtractorWithTools and the legacy
 * AIDelayEventExtractor) do not use this helper. Their response_format/schema already
 * constrains the model to a single JSON object or a bare array, so they only strip a
 * markdown fence and hand the result straight to JSON.parse plus the shared Zod schema in
 * DelayEventExtractionContract.ts — a JSON.parse failure or a schema violation is a thrown
 * AIResponseSchemaViolationError, not brace-scanned recovery. See that module for the
 * single source of truth both extractors and every extraction prompt now share.
 */
export function extractJsonObjectFromResponse(response: string): Record<string, unknown> | null {
  const jsonBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  const cleaned = jsonBlockMatch ? jsonBlockMatch[1].trim() : response;

  const objectStartIndex = cleaned.indexOf('{');
  if (objectStartIndex === -1) {
    return null;
  }

  let braceCount = 0;
  let objectEndIndex = -1;

  for (let i = objectStartIndex; i < cleaned.length; i++) {
    if (cleaned[i] === '{') braceCount++;
    if (cleaned[i] === '}') braceCount--;
    if (braceCount === 0) {
      objectEndIndex = i + 1;
      break;
    }
  }

  if (objectEndIndex === -1) {
    return null;
  }

  const objectStr = cleaned.substring(objectStartIndex, objectEndIndex);

  try {
    const parsed = JSON.parse(objectStr);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
