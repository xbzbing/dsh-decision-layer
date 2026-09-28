import { useEffect, useRef, useState } from 'react';
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import type { TranslationKey } from './i18n.js';
import { request, type Analysis, type LogEntry } from './api.js';
import { DecisionLogList } from './decision-log.js';
import { CardHead, Stat } from './cards.js';
import { useAnnotations } from './use-annotations.js';

interface GateMetrics { attempts: number; failures: number; ask: number; deny: number; allow: number; actual: { allow: number; deny: number; error: number } }
interface CheckMetrics { attempts: number; failures: number; low: number; trend?: { run: number; severity: 'normal' | 'warn' | 'severe' } }
interface NarrowMetrics { attempts: number; failures: number; applied: number; dropped: number }
interface CompleteMetrics { attempts: number; failures: number; unsatisfied: number; satisfied: number; insufficient: number; steered: number }
interface Metrics { hasAutomaticDecisions: boolean; attempts: number; failures: number; gate?: GateMetrics; check?: CheckMetrics; narrow?: NarrowMetrics; complete?: CompleteMetrics }
interface Session { enabled: boolean }
interface Probe { connected: boolean; model?: string; effectiveUrl?: string; reason?: string }
interface Props { sessionId: string; t: Translate<TranslationKey> }

export function DecisionPanel(props: Props) {
  return <SessionPanel key={props.sessionId} {...props} />;
}

function Bar({ allow, ask, deny }: { allow: number; ask: number; deny: number }) {
  const total = allow + ask + deny;
  if (total === 0) return <div className="decision-bar decision-bar-empty" aria-hidden="true" />;
  const pct = (n: number) => `${(n / total) * 100}%`;
  return <div className="decision-bar" aria-hidden="true">
    {allow > 0 && <span className="decision-bar-allow" style={{ width: pct(allow) }} />}
    {ask > 0 && <span className="decision-bar-ask" style={{ width: pct(ask) }} />}
    {deny > 0 && <span className="decision-bar-deny" style={{ width: pct(deny) }} />}
  </div>;
}

function SessionPanel({ sessionId, t }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<'idle' | 'checking' | 'ok' | 'down'>('idle');
  const [message, setMessage] = useState('');
  const { ratings, seed, annotate } = useAnnotations(sessionId, () => setMessage(t('annotateFailed')));

  useEffect(() => {
    let live = true;
    void request<Session>(`session?sessionId=${encodeURIComponent(sessionId)}`)
      .then(value => { if (live) setEnabled(value.enabled); })
      .catch(() => { if (live) setMessage(t('error')); });
    void request<Metrics>(`metrics?sessionId=${encodeURIComponent(sessionId)}`)
      .then(value => { if (live) setMetrics(value); }).catch(() => {});
    return () => { live = false; };
  }, [sessionId, t]);

  const checkStatus = (live: () => boolean) => {
    setStatus('checking');
    void request<Probe>('probe', { method: 'POST' })
      .then(value => { if (!live()) return; setStatus(value.connected ? 'ok' : 'down'); })
      .catch(() => { if (live()) setStatus('down'); });
  };

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    if (!element) return;
    if (!element.open) element.showModal();
    let alive = true;
    setMessage('');
    void request<Metrics>(`metrics?sessionId=${encodeURIComponent(sessionId)}`).then(value => { if (alive) setMetrics(value); }).catch(() => {});
    void request<{ entries: LogEntry[] }>(`log?sessionId=${encodeURIComponent(sessionId)}`).then(value => { if (alive) setLog(value.entries); }).catch(() => {});
    // The analysis over persisted logs seeds the annotation ratings shown on
    // each decision row; it is best-effort and never blocks the panel. The
    // rated-count summary lives in the "Decision analysis" tab, not here.
    void request<Analysis>(`logs?sessionId=${encodeURIComponent(sessionId)}`).then(value => { if (alive) seed(value); }).catch(() => {});
    return () => { alive = false; element.close(); };
  }, [open, t, sessionId, seed]);

  const updateEnabled = async (next: boolean) => {
    setBusy(true);
    try {
      const value = await request<Session>('session', { method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, enabled: next }) });
      setEnabled(value.enabled);
    } catch { setMessage(t('error')); }
    finally { setBusy(false); }
  };

  const statusLabel = status === 'ok' ? t('statusOk') : status === 'down' ? t('statusDown') : status === 'checking' ? t('statusChecking') : t('statusIdle');

  const attempts = metrics?.attempts ?? 0;
  // Quality-trend severity from the self-check run; drives the radar-triangle
  // icon color (normal grey → warn amber → severe red). Absent trend = normal.
  const severity = metrics?.check?.trend?.severity ?? 'normal';
  const trendTitle = severity === 'severe' ? t('trendSevereHint') : severity === 'warn' ? t('trendWarnHint') : undefined;

  // Per-card rates exclude fallback failures from the denominator, matching the
  // ROADMAP metric definitions: self-check pass rate = passed / valid results;
  // narrow rate = passes that dropped a tool / valid narrowing evaluations. The
  // dock trigger shows only the total count, not a mixed cross-feature rate.
  const checkValid = metrics?.check ? metrics.check.attempts - metrics.check.failures : 0;
  const checkPassRate = metrics?.check && checkValid > 0
    ? Math.round(((checkValid - metrics.check.low) / checkValid) * 100) : null;
  const narrowValid = metrics?.narrow ? metrics.narrow.attempts - metrics.narrow.failures : 0;
  const narrowApplyRate = metrics?.narrow && narrowValid > 0
    ? Math.round((metrics.narrow.applied / narrowValid) * 100) : null;

  return <>
    <button ref={trigger} className={`decision-trigger decision-trend-${severity}`} type="button" aria-haspopup="dialog" aria-expanded={open} aria-busy={enabled === null} aria-label={t('button')} title={trendTitle} onClick={() => setOpen(true)}>
      <svg className="decision-trigger-icon" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6.4" stroke="currentColor" stroke-width="1.3"/>
        <path d="M8 4.6 11.3 11H4.7L8 4.6Z" fill="currentColor" stroke="none"/>
      </svg>
      <span className="decision-trigger-text">
        {t('triggerDecisions')} <b>{attempts}</b>
      </span>
    </button>
    <dialog ref={dialog} className="decision-dialog" aria-labelledby="decision-panel-title"
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); dialog.current?.close(); } }}
      onCancel={event => { event.preventDefault(); dialog.current?.close(); }}
      onClick={event => { if (event.target === dialog.current) dialog.current?.close(); }}
      onClose={() => { setOpen(false); trigger.current?.focus(); }}>
      <div className="decision-head"><h2 id="decision-panel-title">{t('title')}</h2>
        <button type="button" onClick={() => { dialog.current?.close(); }} aria-label={t('close')}>×</button></div>
      <div className="decision-body">
      <section>
        {enabled === null && <p role="status">{t('loading')}</p>}
        <label className="decision-toggle"><span className="decision-toggle-text">{t('enabled')}</span>
          <span className="decision-toggle-box"><input className="decision-toggle-input" type="checkbox" checked={enabled === true} disabled={busy || enabled === null}
            onChange={event => void updateEnabled(event.target.checked)} /><span className="decision-toggle-track" aria-hidden="true" /></span></label>
        <div className="decision-status">
          <span className={`decision-status-dot decision-status-${status}`} aria-hidden="true" />
          <span className="decision-status-label">{t('backendStatus')}：{statusLabel}</span>
          <button type="button" className="decision-status-recheck" disabled={status === 'checking'} onClick={() => checkStatus(() => true)}>{t('recheck')}</button>
        </div></section>
      <section><h3>{t('metrics')}</h3>
        {!metrics?.gate && !metrics?.check && !metrics?.narrow && !metrics?.complete ? <p className="decision-empty" role="status">{t('empty')}</p> : <div className="decision-cards">
          {metrics.gate && <article className="decision-card decision-card-wide">
            <header className="decision-card-head">
              <span className="decision-card-title">{t('cardGate')}</span>
              <span className="decision-card-total">{metrics.gate.attempts}<small>{t('cardTimes')}</small></span>
            </header>
            <Bar allow={metrics.gate.allow} ask={metrics.gate.ask} deny={metrics.gate.deny} />
            <ul className="decision-legend">
              <li><span className="decision-legend-dot decision-dot-allow" aria-hidden="true" />{t('allow')}<b>{metrics.gate.allow}</b></li>
              <li><span className="decision-legend-dot decision-dot-ask" aria-hidden="true" />{t('ask')}<b>{metrics.gate.ask}</b></li>
              <li><span className="decision-legend-dot decision-dot-deny" aria-hidden="true" />{t('deny')}<b>{metrics.gate.deny}</b></li>
            </ul>
            <footer className="decision-card-foot">
              <span>{t('actualShort')}<b>{metrics.gate.actual.allow} / {metrics.gate.actual.deny}</b></span>
              <span>{t('failures')}<b>{metrics.gate.failures}</b></span>
            </footer>
          </article>}
          {metrics.check && <article className="decision-card">
            <CardHead title={t('cardCheck')} total={metrics.check.attempts} unit={t('cardTimes')}
              rate={{ label: t('checkPassRate'), value: checkPassRate === null ? t('rateNa') : `${checkPassRate}%` }} />
            <div className="decision-card-stats">
              <Stat label={t('checkLow')} value={metrics.check.low} tone="warn" />
              <Stat label={t('checkOk')} value={metrics.check.attempts - metrics.check.low - metrics.check.failures} />
              <Stat label={t('failures')} value={metrics.check.failures} tone="muted" />
            </div>
          </article>}
          {metrics.narrow && <article className="decision-card">
            <CardHead title={t('cardNarrow')} total={metrics.narrow.attempts} unit={t('cardTimes')}
              rate={{ label: t('narrowApplyRate'), value: narrowApplyRate === null ? t('rateNa') : `${narrowApplyRate}%` }} />
            <div className="decision-card-stats">
              <Stat label={t('narrowAppliedLabel')} value={metrics.narrow.applied} />
              <Stat label={t('narrowDroppedLabel')} value={metrics.narrow.dropped} />
              <Stat label={t('failures')} value={metrics.narrow.failures} tone="muted" />
            </div>
          </article>}
          {metrics.complete && <article className="decision-card">
            <CardHead title={t('cardComplete')} total={metrics.complete.attempts} unit={t('cardTimes')}
              rate={{ label: t('failures'), value: `${metrics.complete.failures}` }} />
            <div className="decision-card-stats">
              <Stat label={t('completeSatisfied')} value={metrics.complete.satisfied} />
              <Stat label={t('completeUnsatisfied')} value={metrics.complete.unsatisfied} tone="warn" />
              <Stat label={t('completeInsufficient')} value={metrics.complete.insufficient} tone="muted" />
            </div>
          </article>}
        </div>}</section>
      <section><h3>{t('log')}</h3>
        {log.length === 0 ? <p className="decision-empty" role="status">{t('logEmpty')}</p>
          : <DecisionLogList entries={log} ratings={ratings} onRate={(id, rating) => void annotate(id, rating)} t={t} />}
      </section>
      {message && <p role="status" className="decision-message decision-message-warn">{message}</p>}
      </div>
    </dialog>
  </>;
}
