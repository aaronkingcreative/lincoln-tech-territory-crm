export type ImportApiReadResult =
  | { ok: true; body: unknown }
  | { ok: false; message: string; body?: unknown; status: number; details?: string };

function previewText(text: string) {
  return text.replace(/\s+/g, ' ').trim().slice(0, 500);
}

function apiMessage(body: unknown) {
  if (typeof body !== 'object' || body === null) return undefined;
  const record = body as Record<string, unknown>;
  if (typeof record.error === 'string' && record.error.trim()) return record.error;
  if (typeof record.details === 'string' && record.details.trim()) return record.details;
  const failed = Array.isArray(record.failed) ? record.failed : [];
  const first = failed.find((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
  return typeof first?.reason === 'string' && first.reason.trim() ? first.reason : undefined;
}

export async function readImportApiResponse(response: Response): Promise<ImportApiReadResult> {
  const text = await response.text();
  if (!text.trim()) {
    return { ok: false, status: response.status, message: 'Importer API returned an empty response. Check server logs.' };
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    const details = `Status ${response.status}. Response preview: ${previewText(text) || '(blank)'}`;
    return { ok: false, status: response.status, message: 'Importer API returned non-JSON response.', details };
  }

  if (!response.ok) {
    return { ok: false, status: response.status, body, message: apiMessage(body) ?? `Importer API request failed with status ${response.status}.` };
  }

  return { ok: true, body };
}
