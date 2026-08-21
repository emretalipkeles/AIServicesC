/**
 * Shared helper for extracting a single JSON object from a raw AI chat response.
 *
 * Model responses often wrap JSON in a markdown code fence and/or include leading or
 * trailing prose. This strips an optional ```json fence and then extracts the first
 * balanced-brace object, mirroring the parsing approach already used by
 * AIDelayEventExtractor.parseExtractionResponse for its object-shaped (IDR) responses.
 *
 * NOTE: AIDelayEventExtractor is not refactored to use this helper — its parsing is
 * interleaved with delay-event-specific fallback logic (array-shaped responses, work
 * activity extraction) closely enough that adopting this helper there risked a behavior
 * change. The small duplication is intentional; see extraction pipeline notes.
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
