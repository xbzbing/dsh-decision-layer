import { useEffect, useState } from 'react';
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import type { TranslationKey } from './i18n.js';

const api = '/plugins/dsh-decision-layer/api';
interface CheckSettings { mode: 'observe' | 'steer'; lowScoreThreshold: number }
interface NarrowSettings { mode: 'observe' | 'enforce'; threshold: number; keepPrefixes?: string[]; maxCandidates?: number }
interface CompleteSettings { mode: 'observe' | 'steer'; minConditions?: number }
interface Features { gate?: boolean; check?: boolean; narrow?: boolean; complete?: boolean }
interface Config { url: string; model: string; apiKeySet: boolean; httpApprovedUrl: string; effectiveUrl: string; checkSettings?: CheckSettings; narrowSettings?: NarrowSettings; completeSettings?: CompleteSettings; features?: Features }
interface Envelope<T> { ok: boolean; value?: T; error?: string }
export interface ConfigFormProps { t: Translate<TranslationKey>; fetchFn?: typeof fetch }

async function request<T>(path: string, fetchFn: typeof fetch, init?: RequestInit): Promise<T> {
  const response = await fetchFn(`${api}/${path}`, init);
  const body = await response.json() as Envelope<T>;
  if (!response.ok || !body.ok || body.value === undefined) throw new Error(body.error || 'Request failed');
  return body.value;
}

// The built-in default keep-prefix; shown when the config has none stored yet so
// the effective set is always visible and editable.
const DEFAULT_KEEP_PREFIXES = ['mcp__openviking', 'team_task_'];
// The built-in optional-candidate ceiling; above it, enforce downgrades to observe.
const DEFAULT_MAX_CANDIDATES = 20;
// The built-in drop threshold: a tool is dropped only when its relevance
// probability is below this; conservative by default so uncertain tools stay.
const DEFAULT_THRESHOLD = 0.3;
// Prefixes may be separated by newlines or English commas; blanks and duplicates
// are dropped so the stored list is clean regardless of how the user typed it.
const parsePrefixes = (text: string) => Array.from(new Set(text.split(/[,\r\n]+/).map(line => line.trim()).filter(Boolean)));
const prefixesText = (settings?: NarrowSettings) => (settings?.keepPrefixes ?? DEFAULT_KEEP_PREFIXES).join('\n');
const maxCandidatesOf = (settings?: NarrowSettings) => settings?.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
const thresholdOf = (settings?: NarrowSettings) => settings?.threshold ?? DEFAULT_THRESHOLD;

// Small section-heading glyphs in a shared 16-viewBox line style. Each sits in a
// tinted rounded badge with its own accent color so the three sections are
// visually distinct at a glance: features (brand green, the on/off switches),
// advanced (amber, the tuning sliders), backend (indigo, the server stack).
function HeadIcon({ name }: { name: 'features' | 'advanced' | 'backend' }) {
  const glyphs = {
    features: <>
      <rect x="2" y="3" width="12" height="4.2" rx="2.1" stroke="currentColor" stroke-width="1.3" />
      <circle cx="11.9" cy="5.1" r="1.25" fill="currentColor" />
      <rect x="2" y="8.8" width="12" height="4.2" rx="2.1" stroke="currentColor" stroke-width="1.3" />
      <circle cx="4.1" cy="10.9" r="1.25" fill="currentColor" />
    </>,
    advanced: <>
      <path d="M2.5 5h11M2.5 11h11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
      <circle cx="10.5" cy="5" r="1.9" fill="var(--dsw-alias-bg-layer-2,#fff)" stroke="currentColor" stroke-width="1.3" />
      <circle cx="5.5" cy="11" r="1.9" fill="var(--dsw-alias-bg-layer-2,#fff)" stroke="currentColor" stroke-width="1.3" />
    </>,
    backend: <>
      <rect x="2.3" y="2.6" width="11.4" height="4.6" rx="1.1" stroke="currentColor" stroke-width="1.3" />
      <rect x="2.3" y="8.8" width="11.4" height="4.6" rx="1.1" stroke="currentColor" stroke-width="1.3" />
      <circle cx="5" cy="4.9" r=".7" fill="currentColor" />
      <circle cx="5" cy="11.1" r=".7" fill="currentColor" />
    </>,
  };
  return <span className={`decision-head-icon decision-head-icon-${name}`} aria-hidden="true">
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">{glyphs[name]}</svg>
  </span>;
}

function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (next: boolean) => void }) {
  return <label className="decision-toggle">
    <span className="decision-toggle-text">{label}</span>
    <span className="decision-toggle-box">
      <input className="decision-toggle-input" type="checkbox" checked={checked} disabled={disabled}
        onChange={event => onChange(event.target.checked)} />
      <span className="decision-toggle-track" aria-hidden="true" />
    </span>
  </label>;
}

export function ConfigForm({ t, fetchFn = fetch }: ConfigFormProps) {
  const [config, setConfig] = useState<Config>({ url: '', model: '', apiKeySet: false, httpApprovedUrl: '', effectiveUrl: 'https://api.typesafe.ai' });
  const [checkMode, setCheckMode] = useState<'observe' | 'steer'>('observe');
  const [narrowMode, setNarrowMode] = useState<'observe' | 'enforce'>('enforce');
  const [keepPrefixes, setKeepPrefixes] = useState(DEFAULT_KEEP_PREFIXES.join('\n'));
  const [maxCandidates, setMaxCandidates] = useState(String(DEFAULT_MAX_CANDIDATES));
  const [threshold, setThreshold] = useState(String(DEFAULT_THRESHOLD));
  const [gateOn, setGateOn] = useState(true);
  const [checkOn, setCheckOn] = useState(true);
  const [narrowOn, setNarrowOn] = useState(true);
  const [completeOn, setCompleteOn] = useState(true);
  const [completeMode, setCompleteMode] = useState<'observe' | 'steer'>('observe');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  // Two independent dirty flags: the advanced section (features + self-check +
  // narrowing) and the backend section (url/model/key) save separately.
  const [advancedDirty, setAdvancedDirty] = useState(false);
  const [backendDirty, setBackendDirty] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  // The connection-test result lives next to the Test button, not in the shared
  // bottom message, so a probe verdict reads inline with the action.
  const [probeResult, setProbeResult] = useState<{ text: string; ok: boolean } | null>(null);

  const applyFeatures = (features?: Features) => {
    setGateOn(features?.gate !== false);
    setCheckOn(features?.check !== false);
    setNarrowOn(features?.narrow !== false);
    setCompleteOn(features?.complete !== false);
  };

  // Reflect a saved config back into the form and clear both dirty flags.
  const applyConfig = (value: Config) => {
    setConfig(value);
    setCheckMode(value.checkSettings?.mode ?? 'observe');
    setNarrowMode(value.narrowSettings?.mode ?? 'enforce');
    setCompleteMode(value.completeSettings?.mode ?? 'observe');
    setKeepPrefixes(prefixesText(value.narrowSettings));
    setMaxCandidates(String(maxCandidatesOf(value.narrowSettings)));
    setThreshold(String(thresholdOf(value.narrowSettings)));
    applyFeatures(value.features);
  };

  useEffect(() => {
    let live = true;
    setMessage(null); setReady(false);
    void request<Config>('config', fetchFn).then(value => { if (live) { applyConfig(value); setAdvancedDirty(false); setBackendDirty(false); setReady(true); } })
      .catch(() => { if (live) setMessage({ text: t('error'), ok: false }); });
    return () => { live = false; };
  }, [t, fetchFn]);

  // Persist only the advanced section (features + self-check + narrowing);
  // backend url/model/key are left untouched by omitting them from the body.
  const saveAdvanced = async (event: React.FormEvent) => {
    event.preventDefault();
    // Clamp the candidate ceiling to the backend's accepted range; a blank or
    // unparseable value falls back to the default.
    const parsedCap = Number.parseInt(maxCandidates, 10);
    const cap = Number.isFinite(parsedCap) ? Math.min(200, Math.max(1, parsedCap)) : DEFAULT_MAX_CANDIDATES;
    // Clamp the drop threshold to [0, 1]; a blank or unparseable value falls back.
    const parsedThreshold = Number.parseFloat(threshold);
    const thresh = Number.isFinite(parsedThreshold) ? Math.min(1, Math.max(0, parsedThreshold)) : DEFAULT_THRESHOLD;
    setBusy(true);
    try {
      const value = await request<Config>('config', fetchFn, { method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ checkSettings: { mode: checkMode }, narrowSettings: { mode: narrowMode, keepPrefixes: parsePrefixes(keepPrefixes), maxCandidates: cap, threshold: thresh },
          completeSettings: { mode: completeMode },
          features: { gate: gateOn, check: checkOn, narrow: narrowOn, complete: completeOn } }) });
      applyConfig(value); setAdvancedDirty(false); setMessage({ text: t('saved'), ok: true });
    } catch { setMessage({ text: t('error'), ok: false }); }
    finally { setBusy(false); }
  };

  // Persist only the backend section (url/model/key); the advanced settings are
  // omitted so an unsaved advanced edit is not written by this button.
  const saveBackend = async (event: React.FormEvent) => {
    event.preventDefault();
    const url = config.url.trim();
    const needsHttpConsent = url.startsWith('http://') && url !== config.httpApprovedUrl;
    if (needsHttpConsent && !window.confirm(`${t('httpWarning')}\n${url}`)) return;
    setBusy(true);
    try {
      const value = await request<Config>('config', fetchFn, { method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url, model: config.model,
          ...(key ? { apiKey: key } : {}),
          ...(needsHttpConsent ? { confirmHttpUrl: url } : {}) }) });
      applyConfig(value); setKey(''); setBackendDirty(false); setMessage({ text: t('saved'), ok: true });
    } catch { setMessage({ text: t('error'), ok: false }); }
    finally { setBusy(false); }
  };

  const probe = async () => {
    setBusy(true); setProbeResult(null);
    try {
      const value = await request<{ connected: boolean }>('probe', fetchFn, { method: 'POST' });
      setProbeResult({ text: t(value.connected ? 'connected' : 'unavailable'), ok: value.connected });
    } catch { setProbeResult({ text: t('error'), ok: false }); }
    finally { setBusy(false); }
  };

  const removeSavedKey = async () => {
    if (!window.confirm(t('removeKeyConfirm'))) return;
    setBusy(true);
    try {
      const value = await request<Config>('config', fetchFn, { method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey: '' }) });
      setConfig(value); setKey(''); setMessage({ text: t('removeKeyDone'), ok: true });
    } catch { setMessage({ text: t('error'), ok: false }); }
    finally { setBusy(false); }
  };

  return <div className="decision-config">
    <details className="decision-collapse" open>
      <summary className="decision-collapse-head"><h3><HeadIcon name="features" />{t('basicFeatures')}</h3>
        <span className="decision-collapse-icon" aria-hidden="true" /></summary>
      <div className="decision-collapse-body">
        <Toggle label={t('featureGate')} checked={gateOn} disabled={!ready}
          onChange={next => { setGateOn(next); setAdvancedDirty(true); }} />
        <p className="decision-muted">{t('featureGateHint')}</p>
        <Toggle label={t('featureCheck')} checked={checkOn} disabled={!ready}
          onChange={next => { setCheckOn(next); setAdvancedDirty(true); }} />
        <p className="decision-muted">{t('featureCheckHint')}</p>
        <Toggle label={t('featureNarrow')} checked={narrowOn} disabled={!ready}
          onChange={next => { setNarrowOn(next); setAdvancedDirty(true); }} />
        <p className="decision-muted">{t('featureNarrowHint')}</p>
        <Toggle label={t('featureComplete')} checked={completeOn} disabled={!ready}
          onChange={next => { setCompleteOn(next); setAdvancedDirty(true); }} />
        <p className="decision-muted">{t('featureCompleteHint')}</p>
      </div>
    </details>
    <details className="decision-collapse">
      <summary className="decision-collapse-head"><h3><HeadIcon name="advanced" />{t('advancedConfig')}</h3>
        <span className="decision-collapse-icon" aria-hidden="true" /></summary>
      <form className="decision-collapse-body" onSubmit={event => void saveAdvanced(event)}>
        <div className="decision-advanced-grid">
          <div className="decision-field-block">
            <span className="decision-subhead">{t('advancedSwitches')}</span>
            <Toggle label={t('selfCheckSteer')} checked={checkMode === 'steer'} disabled={!ready || !checkOn}
              onChange={next => { setCheckMode(next ? 'steer' : 'observe'); setAdvancedDirty(true); }} />
            <p className="decision-muted">{t('selfCheckHint')}</p>
            <Toggle label={t('narrowObserveLabel')} checked={narrowMode === 'observe'} disabled={!ready || !narrowOn}
              onChange={next => { setNarrowMode(next ? 'observe' : 'enforce'); setAdvancedDirty(true); }} />
            <p className="decision-muted">{t('narrowHint')}</p>
            <Toggle label={t('completeSteer')} checked={completeMode === 'steer'} disabled={!ready || !completeOn}
              onChange={next => { setCompleteMode(next ? 'steer' : 'observe'); setAdvancedDirty(true); }} />
            <p className="decision-muted">{t('completeHint')}</p>
          </div>
          <div className="decision-field-block">
            <span className="decision-subhead">{t('advancedParams')}</span>
            <label className="decision-field">{t('narrowKeepLabel')}
              <textarea className="decision-prefixes" rows={3} value={keepPrefixes} disabled={!ready || !narrowOn}
                placeholder="mcp__openviking" onChange={event => { setKeepPrefixes(event.target.value); setAdvancedDirty(true); }} />
              <small className="decision-muted">{t('narrowKeepHint')}</small></label>
            <label className="decision-field decision-field-inline">{t('narrowMaxLabel')}
              <input className="decision-narrow-cap" type="number" min={1} max={200} step={1} value={maxCandidates} disabled={!ready || !narrowOn}
                placeholder="20" onChange={event => { setMaxCandidates(event.target.value); setAdvancedDirty(true); }} />
              <small className="decision-muted">{t('narrowMaxHint')}</small></label>
            <label className="decision-field decision-field-inline">{t('narrowThresholdLabel')}
              <input className="decision-narrow-cap" type="number" min={0} max={1} step={0.05} value={threshold} disabled={!ready || !narrowOn}
                placeholder="0.3" onChange={event => { setThreshold(event.target.value); setAdvancedDirty(true); }} />
              <small className="decision-muted">{t('narrowThresholdHint')}</small></label>
          </div>
        </div>
        <div className="decision-actions">
          <button disabled={busy || !ready || !advancedDirty} type="submit">{t('saveAdvanced')}</button>
        </div>
      </form>
    </details>
    <section>
      <h3><HeadIcon name="backend" />{t('backend')}</h3>
      {ready && <p className="decision-muted decision-destination">{t('destination')}<code>{config.effectiveUrl}</code></p>}
      <form onSubmit={event => void saveBackend(event)}>
        <label className="decision-field">{t('url')}
          <input type="url" value={config.url} disabled={!ready} placeholder="https://api.typesafe.ai"
            onChange={event => { setConfig({ ...config, url: event.target.value }); setBackendDirty(true); setProbeResult(null); }} /></label>
        <label className="decision-field">{t('model')}
          <input value={config.model} disabled={!ready} placeholder="jev-latest"
            onChange={event => { setConfig({ ...config, model: event.target.value }); setBackendDirty(true); setProbeResult(null); }} /></label>
        <label className="decision-field">{t('key')}
          <input type="password" autoComplete="off" value={key} disabled={!ready}
            placeholder={config.apiKeySet ? '••••••••' : ''} onChange={event => { setKey(event.target.value); setBackendDirty(true); setProbeResult(null); }} />
          <small className="decision-muted">{config.apiKeySet ? t('keyHintSaved') : t('keyHintEmpty')}</small></label>
        <div className="decision-actions">
          <button disabled={busy || !ready} type="submit">{t('save')}</button>
          <button className="decision-secondary" disabled={busy || !ready || backendDirty} type="button" onClick={() => void probe()}>{t('probe')}</button>
          {probeResult && <span role="status" className={`decision-probe-result${probeResult.ok ? ' decision-message-ok' : ' decision-message-warn'}`}>{probeResult.text}</span>}
        </div>
      </form>
      {config.apiKeySet && <div className="decision-danger-row">
        <div className="decision-danger-text">
          <span className="decision-danger-title">{t('removeKey')}</span>
          <small className="decision-muted">{t('removeKeyHint')}</small>
        </div>
        <button type="button" className="decision-danger-button" disabled={busy || !ready} onClick={() => void removeSavedKey()}>{t('removeKeyButton')}</button>
      </div>}
    </section>
    {message && <p role="status" className={`decision-message${message.ok ? ' decision-message-ok' : ' decision-message-warn'}`}>{message.text}</p>}
  </div>;
}
