import { useEffect, useRef, useState } from 'react';
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import type { TranslationKey } from './i18n.js';

const api = '/plugins/dsh-decision-layer/api';
interface Config { url: string; model: string; apiKeySet: boolean; httpApprovedUrl: string; effectiveUrl: string }
interface GateMetrics { attempts: number; failures: number; ask: number; deny: number; allow: number; actual: { allow: number; deny: number; error: number } }
interface Metrics { hasAutomaticDecisions: boolean; attempts: number; failures: number; gate?: GateMetrics }
interface Session { enabled: boolean; capacityExceeded?: boolean }
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

function SessionPanel({ sessionId, t }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [capacityExceeded, setCapacityExceeded] = useState(false);
  const [config, setConfig] = useState<Config>({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai' });
  const [key, setKey] = useState('');
  const [removeKey, setRemoveKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [configReady, setConfigReady] = useState(false);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let live = true;
    void request<Session>(`session?sessionId=${encodeURIComponent(sessionId)}`)
      .then(value => { if (live) { setEnabled(value.enabled); setCapacityExceeded(Boolean(value.capacityExceeded)); } })
      .catch(() => { if (live) setMessage(t('error')); });
    return () => { live = false; };
  }, [sessionId, t]);

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    if (!element) return;
    if (!element.open) element.showModal();
    let live = true;
    setMessage('');
    setConfigReady(false);
    void request<Metrics>(`metrics?sessionId=${encodeURIComponent(sessionId)}`).then(value => { if (live) setMetrics(value); }).catch(() => {});
    void request<Config>('config').then(value => { if (live) { setConfig(value); setDirty(false); setConfigReady(true); } })
      .catch(() => { if (live) setMessage(t('error')); });
    return () => { live = false; element.close(); };
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

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const url = config.url.trim();
    const needsHttpConsent = url.startsWith('http://') && url !== config.httpApprovedUrl;
    if (needsHttpConsent && !window.confirm(`${t('httpWarning')}\n${url}`)) return;
    setBusy(true);
    try {
      const value = await request<Config>('config', { method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url, model: config.model, ...(removeKey ? { apiKey: '' } : key ? { apiKey: key } : {}),
          ...(needsHttpConsent ? { confirmHttpUrl: url } : {}) }) });
      setConfig(value);
      setKey(''); setRemoveKey(false); setDirty(false); setMessage(t('saved'));
    } catch { setMessage(t('error')); }
    finally { setBusy(false); }
  };

  const probe = async () => {
    setBusy(true);
    try {
      const value = await request<{ connected: boolean }>('probe', { method: 'POST' });
      setMessage(t(value.connected ? 'connected' : 'unavailable'));
    } catch { setMessage(t('error')); }
    finally { setBusy(false); }
  };

  return <>
    <button ref={trigger} className="decision-trigger" type="button" aria-haspopup="dialog" aria-expanded={open} aria-busy={enabled === null} onClick={() => setOpen(true)}>
      <span className={enabled ? 'decision-dot' : 'decision-dot decision-dot-off'} aria-hidden="true" />{t('button')}
    </button>
    <dialog ref={dialog} className="decision-dialog" aria-labelledby="decision-panel-title"
      onClose={() => { setKey(''); setRemoveKey(false); setOpen(false); trigger.current?.focus(); }}>
      <div className="decision-head"><h2 id="decision-panel-title">{t('title')}</h2>
        <button type="button" onClick={() => { dialog.current?.close(); }} aria-label={t('close')}>×</button></div>
      <section><h3>{t('metrics')}</h3>
        {!metrics?.gate ? <p role="status">{t('empty')}</p> : <dl className="decision-metrics">
          <div><dt>{t('attempts')}</dt><dd>{metrics.gate.attempts}</dd></div>
          <div><dt>{t('failures')}</dt><dd>{metrics.gate.failures}</dd></div>
          <div><dt>{t('suggestions')}</dt><dd>{metrics.gate.allow} / {metrics.gate.ask} / {metrics.gate.deny}</dd></div>
          <div><dt>{t('actual')}</dt><dd>{metrics.gate.actual.allow} / {metrics.gate.actual.deny}</dd></div>
        </dl>}</section>
      <section><h3>{t('settings')}</h3>
        {enabled === null && <p role="status">{t('loading')}</p>}
        {capacityExceeded && <p role="alert">{t('capacity')}</p>}
        <label className="decision-switch"><input type="checkbox" checked={enabled === true} disabled={busy || enabled === null || capacityExceeded}
          onChange={event => void updateEnabled(event.target.checked)} />{t('enabled')}</label>
        <p className="decision-muted">{t('future')}</p></section>
      <section><h3>{t('backend')}</h3>
        {configReady && <p className="decision-muted">{t('destination')} <code>{config.effectiveUrl}</code></p>}
        <form onSubmit={event => void save(event)}>
        <label>{t('url')}<input type="url" value={config.url} disabled={!configReady} placeholder="https://api.typesafe.ai"
          onChange={event => { setConfig({ ...config, url: event.target.value }); setDirty(true); }} /></label>
        <label>{t('model')}<input value={config.model} disabled={!configReady} placeholder="jev-latest"
          onChange={event => { setConfig({ ...config, model: event.target.value }); setDirty(true); }} /></label>
        <label>{t('key')}<input type="password" autoComplete="off" value={key} disabled={!configReady || removeKey}
          placeholder={config.apiKeySet ? '••••••••' : ''} onChange={event => { setKey(event.target.value); setDirty(true); }} /></label>
        <small className="decision-muted">{t('keyHint')}</small>
        {config.apiKeySet && <label className="decision-switch"><input type="checkbox" checked={removeKey} disabled={!configReady}
          onChange={event => { setRemoveKey(event.target.checked); setDirty(true); }} />{t('removeKey')}</label>}
        <div className="decision-actions"><button disabled={busy || !configReady} type="submit">{t('save')}</button>
          <button disabled={busy || !configReady || dirty} type="button" onClick={() => void probe()}>{t('probe')}</button></div>
      </form></section>
      {message && <p role="status" className="decision-message">{message}</p>}
    </dialog>
  </>;
}
