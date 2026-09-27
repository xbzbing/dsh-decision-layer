import { useEffect, useRef, useState } from 'react';
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import type { TranslationKey } from './i18n.js';

const api = '/plugins/dsh-decision-layer/api';
interface GateMetrics { attempts: number; failures: number; ask: number; deny: number; allow: number; actual: { allow: number; deny: number; error: number } }
interface CheckMetrics { attempts: number; failures: number; low: number }
interface NarrowMetrics { attempts: number; failures: number; applied: number; dropped: number }
interface LogEntry { at: number; kind: 'gate' | 'check' | 'narrow'; outcome: string; tool?: string; suggestion?: string; action?: string; reason?: string; score?: number; confidence?: number; mode?: string; dropped?: number; kept?: number; tools?: string[] }
interface Metrics { hasAutomaticDecisions: boolean; attempts: number; failures: number; gate?: GateMetrics; check?: CheckMetrics; narrow?: NarrowMetrics }
interface Session { enabled: boolean; capacityExceeded?: boolean }
interface Probe { connected: boolean; model?: string; effectiveUrl?: string; reason?: string }
interface Envelope<T> { ok: boolean; value?: T; error?: string }
interface Props { sessionId: string; t: Translate<TranslationKey> }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${api}/${path}`, init);
  const body = await response.json() as Envelope<T>;
  if (!response.ok || !body.ok || body.value === undefined) throw new Error(body.error || 'Request failed');
  return body.value;
}

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
  const [capacityExceeded, setCapacityExceeded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<'idle' | 'checking' | 'ok' | 'down'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let live = true;
    void request<Session>(`session?sessionId=${encodeURIComponent(sessionId)}`)
      .then(value => { if (live) { setEnabled(value.enabled); setCapacityExceeded(Boolean(value.capacityExceeded)); } })
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
    return () => { alive = false; element.close(); };
  }, [open, t, sessionId]);

  const updateEnabled = async (next: boolean) => {
    setBusy(true);
    try {
      const value = await request<Session>('session', { method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, enabled: next }) });
      setEnabled(value.enabled); setCapacityExceeded(Boolean(value.capacityExceeded));
    } catch { setMessage(t('error')); }
    finally { setBusy(false); }
  };

  const time = (at: number) => new Date(at).toLocaleTimeString();
  const reasonText = (reason?: string) => reason === 'unavailable' || reason === 'unreachable' ? t('reasonUnavailable')
    : reason === 'http-error' ? t('reasonHttpError')
    : reason === 'invalid-response' ? t('reasonInvalidResponse')
    : reason === 'low-confidence' ? t('reasonLowConfidence')
    : reason === 'capacity' ? t('reasonCapacity')
    : reason === 'too-many-candidates' ? t('reasonTooMany')
    : reason === 'low-keep' ? t('reasonLowKeep')
    : reason === 'config' ? t('reasonConfig') : reason;
  const actionText = (action?: string) => action === 'deny' ? t('actionDeny') : action === 'ask' ? t('actionAsk') : action;
  const failDetail = (entry: LogEntry) => {
    const reason = reasonText(entry.reason);
    if (entry.reason === 'low-confidence' && typeof entry.confidence === 'number') return `${reason}（${t('logConfidence')} ${entry.confidence}）`;
    return reason;
  };
  const outcomeTag = (entry: LogEntry) => entry.outcome === 'deny' ? 'deny'
    : entry.outcome === 'error' ? 'error'
    : entry.outcome === 'low' ? 'warn' : 'ok';

  const renderGate = (entry: LogEntry) => {
    const tool = <code className="decision-log-tool">{entry.tool ?? '—'}</code>;
    if (entry.outcome === 'error') return <>{t('logGate')} · {tool} <span className="decision-log-detail">{t('logEvalFailed')}{entry.reason ? ` · ${failDetail(entry)}` : ''}</span></>;
    const verdict = entry.outcome === 'deny' ? t('actionDeny') : actionText(entry.action) ?? entry.outcome;
    const suggestion = entry.suggestion && entry.suggestion !== entry.action
      ? <span className="decision-log-detail"> · {t('logSuggested')} {actionText(entry.suggestion)}</span> : null;
    return <>{t('logGate')} · {tool} <span className="decision-log-verdict">→ {verdict}</span>{suggestion}</>;
  };

  const renderCheck = (entry: LogEntry) => {
    const label = <span title={t('logCheckHint')}>{t('logCheck')}</span>;
    if (entry.outcome === 'error') return <>{label} <span className="decision-log-detail">{t('logEvalFailed')}{entry.reason ? ` · ${failDetail(entry)}` : ''}</span></>;
    const result = entry.outcome === 'low' ? t('checkResultLow') : t('checkResultOk');
    return <>{label} · <span className="decision-log-verdict">{result}</span>{entry.score !== undefined ? <span className="decision-log-detail" title={t('logScoreHint')}> · {t('logScore')} {entry.score}/2</span> : null}{typeof entry.confidence === 'number' ? <span className="decision-log-detail"> · {t('logConfidence')} {entry.confidence}</span> : null}</>;
  };

  const renderNarrow = (entry: LogEntry) => {
    const label = <span title={t('logNarrowHint')}>{t('logNarrow')}</span>;
    if (entry.outcome === 'error') return <>{label} <span className="decision-log-detail">{t('logEvalFailed')}{entry.reason ? ` · ${failDetail(entry)}` : ''}</span></>;
    const dropped = entry.dropped ?? 0;
    const modeTag = entry.mode === 'enforce' ? t('narrowEnforce') : t('narrowObserve');
    const kept = typeof entry.kept === 'number' ? entry.kept : undefined;
    // Advisory note when a safeguard prevented an enforce (too many candidates / too few kept).
    const guard = entry.reason === 'too-many-candidates' ? <span className="decision-log-detail"> · {t('reasonTooMany')}</span>
      : entry.reason === 'low-keep' ? <span className="decision-log-detail"> · {t('reasonLowKeep')}</span> : null;
    if (dropped === 0) {
      return <>{label} · <span className="decision-log-verdict">{t('narrowKept')}</span>{kept !== undefined ? <span className="decision-log-detail"> · {t('narrowKeptCount')} {kept}</span> : null}<span className="decision-log-detail"> · {modeTag}</span>{guard}</>;
    }
    const names = Array.isArray(entry.tools) && entry.tools.length > 0 ? entry.tools.join('、') : undefined;
    // The stored name list is capped, so append "…等 N 个" when it is shorter than the dropped count.
    const overflow = names && Array.isArray(entry.tools) && entry.tools.length < dropped ? t('narrowMore', { count: dropped }) : '';
    return <>{label} · <span className="decision-log-verdict">{t('narrowDropped')} {dropped}{kept !== undefined ? ` / ${t('narrowKeptCount')} ${kept}` : ''}</span>{names ? <span className="decision-log-detail"> · {names}{overflow}</span> : null}<span className="decision-log-detail"> · {modeTag}</span>{guard}</>;
  };

  const outcomeTagOf = (entry: LogEntry) => entry.kind === 'narrow'
    ? (entry.outcome === 'error' ? 'error' : entry.outcome === 'applied' ? 'ok' : 'ok')
    : outcomeTag(entry);

  const statusLabel = status === 'ok' ? t('statusOk') : status === 'down' ? t('statusDown') : status === 'checking' ? t('statusChecking') : t('statusIdle');

  const attempts = metrics?.attempts ?? 0;
  const passed = (metrics?.gate?.allow ?? 0)
    + (metrics?.check ? metrics.check.attempts - metrics.check.low - metrics.check.failures : 0);
  const passRate = attempts > 0 ? Math.round((passed / attempts) * 100) : null;

  return <>
    <button ref={trigger} className="decision-trigger" type="button" aria-haspopup="dialog" aria-expanded={open} aria-busy={enabled === null} aria-label={t('button')} onClick={() => setOpen(true)}>
      <svg className="decision-trigger-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 1.5 2 4.2v3.6c0 3.3 2.3 5.6 6 6.7 3.7-1.1 6-3.4 6-6.7V4.2L8 1.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
        <path d="m5.6 8 1.7 1.8L10.6 6.3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span className="decision-trigger-text">
        {t('triggerDecisions')} <b>{attempts}</b>
        <span className="decision-trigger-sep" aria-hidden="true"> - </span>
        <b title={t('triggerPassRate')}>{passRate === null ? '—' : `${passRate}%`}</b>
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
        {capacityExceeded && <p role="alert">{t('capacity')}</p>}
        <label className="decision-toggle"><span className="decision-toggle-text">{t('enabled')}</span>
          <span className="decision-toggle-box"><input className="decision-toggle-input" type="checkbox" checked={enabled === true} disabled={busy || enabled === null || capacityExceeded}
            onChange={event => void updateEnabled(event.target.checked)} /><span className="decision-toggle-track" aria-hidden="true" /></span></label>
        <div className="decision-status">
          <span className={`decision-status-dot decision-status-${status}`} aria-hidden="true" />
          <span className="decision-status-label">{t('backendStatus')}：{statusLabel}</span>
          <button type="button" className="decision-status-recheck" disabled={status === 'checking'} onClick={() => checkStatus(() => true)}>{t('recheck')}</button>
        </div></section>
      <section><h3>{t('metrics')}</h3>
        {!metrics?.gate && !metrics?.check && !metrics?.narrow ? <p className="decision-empty" role="status">{t('empty')}</p> : <div className="decision-cards">
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
          </article>}
        </div>}</section>
      <section><h3>{t('log')}</h3>
        {log.length === 0 ? <p className="decision-empty" role="status">{t('logEmpty')}</p> : <ol className="decision-log">
          {log.slice().reverse().map((entry, index) => <li key={`${entry.at}-${index}`} className={`decision-log-item decision-log-${outcomeTagOf(entry)}`}>
            <span className="decision-log-time">{time(entry.at)}</span>
            <span className="decision-log-body">{entry.kind === 'gate' ? renderGate(entry) : entry.kind === 'narrow' ? renderNarrow(entry) : renderCheck(entry)}</span>
          </li>)}
        </ol>}</section>
      {message && <p role="status" className="decision-message decision-message-warn">{message}</p>}
      </div>
    </dialog>
  </>;
}
