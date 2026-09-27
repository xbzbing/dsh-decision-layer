import { useEffect, useRef, useState } from 'react';
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import type { TranslationKey } from './i18n.js';
import { request, type Analysis, type LogEntry, type Rating } from './api.js';
import { DecisionLogList } from './decision-log.js';
import { useAnnotations } from './use-annotations.js';

const api = '/plugins/dsh-decision-layer/api';
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
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
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
    // The analysis over persisted logs powers the annotation ratings shown on
    // each decision row; it is best-effort and never blocks the panel.
    void request<Analysis>(`logs?sessionId=${encodeURIComponent(sessionId)}`).then(value => { if (alive) { setAnalysis(value); seed(value); } }).catch(() => {});
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

  const time = (at: number) => new Date(at).toLocaleTimeString();

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
            <header className="decision-card-head">
              <span className="decision-card-title">{t('cardCheck')}</span>
              <span className="decision-card-total">{metrics.check.attempts}<small>{t('cardTimes')}</small></span>
            </header>
            <div className="decision-card-stats">
              <div className="decision-stat"><span className="decision-stat-num decision-stat-warn">{metrics.check.low}</span><span className="decision-stat-label">{t('checkLow')}</span></div>
              <div className="decision-stat"><span className="decision-stat-num">{metrics.check.attempts - metrics.check.low - metrics.check.failures}</span><span className="decision-stat-label">{t('checkOk')}</span></div>
              <div className="decision-stat"><span className="decision-stat-num decision-stat-muted">{metrics.check.failures}</span><span className="decision-stat-label">{t('failures')}</span></div>
            </div>
            <footer className="decision-card-foot decision-card-rate">
              <span>{t('checkPassRate')}<b>{checkPassRate === null ? t('rateNa') : `${checkPassRate}%`}</b></span>
            </footer>
          </article>}
          {metrics.narrow && <article className="decision-card">
            <header className="decision-card-head">
              <span className="decision-card-title">{t('cardNarrow')}</span>
              <span className="decision-card-total">{metrics.narrow.attempts}<small>{t('cardTimes')}</small></span>
            </header>
            <div className="decision-card-stats">
              <div className="decision-stat"><span className="decision-stat-num">{metrics.narrow.applied}</span><span className="decision-stat-label">{t('narrowAppliedLabel')}</span></div>
              <div className="decision-stat"><span className="decision-stat-num">{metrics.narrow.dropped}</span><span className="decision-stat-label">{t('narrowDroppedLabel')}</span></div>
              <div className="decision-stat"><span className="decision-stat-num decision-stat-muted">{metrics.narrow.failures}</span><span className="decision-stat-label">{t('failures')}</span></div>
            </div>
            <footer className="decision-card-foot decision-card-rate">
              <span>{t('narrowApplyRate')}<b>{narrowApplyRate === null ? t('rateNa') : `${narrowApplyRate}%`}</b></span>
            </footer>
          </article>}
          {metrics.complete && <article className="decision-card">
            <header className="decision-card-head">
              <span className="decision-card-title">{t('cardComplete')}</span>
              <span className="decision-card-total">{metrics.complete.attempts}<small>{t('cardTimes')}</small></span>
            </header>
            <div className="decision-card-stats">
              <div className="decision-stat"><span className="decision-stat-num">{metrics.complete.satisfied}</span><span className="decision-stat-label">{t('completeSatisfied')}</span></div>
              <div className="decision-stat"><span className="decision-stat-num decision-stat-warn">{metrics.complete.unsatisfied}</span><span className="decision-stat-label">{t('completeUnsatisfied')}</span></div>
              <div className="decision-stat"><span className="decision-stat-num decision-stat-muted">{metrics.complete.insufficient}</span><span className="decision-stat-label">{t('completeInsufficient')}</span></div>
            </div>
            <footer className="decision-card-foot decision-card-rate">
              <span>{t('failures')}<b>{metrics.complete.failures}</b></span>
            </footer>
          </article>}
        </div>}</section>
      <section><h3>{t('log')}</h3>
        {log.length === 0 ? <p className="decision-empty" role="status">{t('logEmpty')}</p>
          : <DecisionLogList entries={log} ratings={ratings} onRate={(id, rating) => void annotate(id, rating)} t={t} />}
        {analysis && analysis.annotations.rated > 0 && <p className="decision-muted decision-rate-summary">{t('rateSummary', { rated: analysis.annotations.rated, good: analysis.annotations.good, bad: analysis.annotations.bad, unsure: analysis.annotations.unsure })}</p>}
      </section>
      {message && <p role="status" className="decision-message decision-message-warn">{message}</p>}
      </div>
    </dialog>
  </>;
}
