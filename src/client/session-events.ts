// One session's automatic-intervention flag is shown by two surfaces that can be
// mounted at the same time: the composer-dock panel and the analysis tab. Both
// write it through the same /session route, so after either one changes it the
// other must not keep rendering the old value. A window-level event keeps the
// two controls in sync without polling; the persisted flag remains the single
// source of truth and the event only mirrors a confirmed write.
const SESSION_ENABLED_EVENT = 'dsh-decision-layer:session-enabled';

export interface SessionEnabledChange { sessionId: string; enabled: boolean }

export function announceSessionEnabled(change: SessionEnabledChange): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new window.CustomEvent<SessionEnabledChange>(SESSION_ENABLED_EVENT, { detail: change }));
}

export function onSessionEnabled(listener: (change: SessionEnabledChange) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => {
    const change = (event as CustomEvent<SessionEnabledChange>).detail;
    if (change && typeof change.sessionId === 'string' && typeof change.enabled === 'boolean') listener(change);
  };
  window.addEventListener(SESSION_ENABLED_EVENT, handler);
  return () => window.removeEventListener(SESSION_ENABLED_EVENT, handler);
}
