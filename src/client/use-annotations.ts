import { useCallback, useState } from 'react';
import { request, type Analysis, type Rating } from './api.js';

// Shared annotation state and writer for both the composer-dock panel and the
// conversation-view analysis tab, so a rating made on one surface uses the same
// /annotate route and the same optimistic-then-reconcile behaviour. The two
// surfaces each hold their own copy of the state; a fresh /logs read on open
// re-syncs them, which is enough for this local single-user research tool.
export function useAnnotations(sessionId: string, onFail: () => void) {
  const [ratings, setRatings] = useState<Record<string, Rating>>({});

  // Seed from a /logs analysis result (persisted ratings map).
  const seed = useCallback((analysis: Analysis | null) => {
    setRatings(analysis?.ratings ?? {});
  }, []);

  // Append one annotation for a decision and reflect it locally. Explicit user
  // intent: a failed write is rolled back and surfaced, never swallowed.
  const annotate = useCallback(async (id: string, rating: Rating) => {
    setRatings(prev => ({ ...prev, [id]: rating }));
    try {
      await request<{ ok: boolean }>('annotate', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, target: id, rating }) });
    } catch {
      onFail();
      setRatings(prev => { const next = { ...prev }; delete next[id]; return next; });
    }
  }, [sessionId, onFail]);

  return { ratings, seed, annotate };
}
