// Shared client-side types and the fetch helper for the plugin's manager API.
// Used by both the composer-dock panel and the conversation-view analysis tab so
// the two surfaces agree on the decision-record and analysis shapes.

export const API_BASE = '/plugins/dsh-decision-layer/api';

export type Rating = 'good' | 'bad' | 'unsure';

export interface LogEntry {
  id?: string; at: number; kind: 'gate' | 'check' | 'narrow' | 'complete'; outcome: string;
  tool?: string; suggestion?: string; action?: string; reason?: string; score?: number; confidence?: number;
  mode?: string; dropped?: number; kept?: number; candidates?: number; tools?: string[];
  conditions?: number; satisfied?: number; unsatisfied?: number; insufficient?: number; steered?: boolean;
  lowConfidence?: boolean;
}

// The read-only aggregate the /logs route returns over the persisted decision
// logs for one session. It never carries raw log rows — only counts and buckets.
export interface Analysis {
  totalDecisions: number;
  annotations: { rated: number; good: number; bad: number; unsure: number };
  ratings: Record<string, Rating>;
  trendBacktest: { warnHits: number; severeHits: number; maxRun: number };
  profile?: {
    gate: { attempts: number; allow: number; ask: number; deny: number; error: number };
    check: { attempts: number; ok: number; low: number; error: number; scoreSum: number; scoreCount: number; confidence: Record<string, number> };
    narrow: { attempts: number; applied: number; error: number; droppedSum: number; tooManyCandidates: number };
    complete: { attempts: number; satisfied: number; unsatisfied: number; insufficient: number; error: number; steered: number };
  };
}

interface Envelope<T> { ok: boolean; value?: T; error?: string }

// One newest-first page of a session's full persisted decision rows, from the
// /logrows route. Backs the analysis tab's paginated log.
export interface LogRows { entries: LogEntry[]; total: number; page: number; pageSize: number; pages: number }

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}/${path}`, init);
  const body = await response.json() as Envelope<T>;
  if (!response.ok || !body.ok || body.value === undefined) throw new Error(body.error || 'Request failed');
  return body.value;
}
