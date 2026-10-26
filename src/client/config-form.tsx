import { useEffect, useState } from 'react';
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import type { TranslationKey } from './i18n.js';

const api = '/plugins/dsh-decision-layer/api';
type BatchMode = 'auto' | 'single' | 'split';
interface GateSettings { minConfidence?: number }
interface CheckSettings {
  mode: 'observe' | 'steer'; rubric?: string[]; lowScoreThreshold?: number; minConfidence?: number;
  trendMinConfidence?: number; trendRun?: number; trendSevereRun?: number;
}
interface NarrowSettings { mode: 'observe' | 'enforce'; threshold?: number; keepPrefixes?: string[]; maxCandidates?: number; batchMode?: BatchMode }
interface CompleteSettings { mode: 'observe' | 'steer'; minConditions?: number; minConfidence?: number }
interface Features { gate?: boolean; check?: boolean; narrow?: boolean; complete?: boolean }
interface Config { url: string; model: string; apiKeySet: boolean; httpApprovedUrl: string; effectiveUrl: string; gateSettings?: GateSettings; checkSettings?: CheckSettings; narrowSettings?: NarrowSettings; completeSettings?: CompleteSettings; features?: Features }
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
const DEFAULT_BATCH_MODE: BatchMode = 'auto';
// The built-in grading levels, mirroring service/self-check.mjs DEFAULT_RUBRIC.
const DEFAULT_RUBRIC = [
  '明显答非所问，或存在严重遗漏 / 自相矛盾',
  '基本答到问题，但有可察觉的遗漏或不严谨',
  '完整、准确、无自相矛盾地回应了请求',
];
// Every intervention threshold with the service-side default it falls back to.
// Kept in one record so an unset field renders its effective value instead of a
// blank box, and a save never silently writes a different number. Mirrors
// MIN_CONFIDENCE in danger-gate.mjs (gateMin), self-check.mjs (checkMin,
// lowScore, trendMin/trendRun/trendSevere), task-completion.mjs (completeMin,
// minConditions).
const THRESHOLD_DEFAULTS = {
  gateMin: 0.6, checkMin: 0.4, lowScore: 1, trendMin: 0.6, trendRun: 3, trendSevere: 5,
  completeMin: 0.4, minConditions: 2,
};
type ThresholdKey = keyof typeof THRESHOLD_DEFAULTS;
type ThresholdFields = Record<ThresholdKey, string>;
const defaultThresholds = (): ThresholdFields => Object.fromEntries(
  Object.entries(THRESHOLD_DEFAULTS).map(([name, value]) => [name, String(value)]),
) as ThresholdFields;
// The service's rubric limits (config-store.mjs validCheck / self-check.mjs
// boundedRubric). Enforced here too so an invalid list is caught with a specific
// message instead of being silently rewritten or failing the whole save opaquely.
const RUBRIC_MAX_LEVELS = 10;
const RUBRIC_MAX_LEVEL_LENGTH = 256;
const thresholdsOf = (value: Config): ThresholdFields => {
  const trendRun = value.checkSettings?.trendRun ?? THRESHOLD_DEFAULTS.trendRun;
  return {
    gateMin: String(value.gateSettings?.minConfidence ?? THRESHOLD_DEFAULTS.gateMin),
    checkMin: String(value.checkSettings?.minConfidence ?? THRESHOLD_DEFAULTS.checkMin),
    lowScore: String(value.checkSettings?.lowScoreThreshold ?? THRESHOLD_DEFAULTS.lowScore),
    trendMin: String(value.checkSettings?.trendMinConfidence ?? THRESHOLD_DEFAULTS.trendMin),
    trendRun: String(trendRun),
    // The service derives an unset severe tier from the warn tier
    // (self-check.mjs: Math.max(trendRun + 1, 5)), so mirror that here or the box
    // reports a value the service is not using.
    trendSevere: String(value.checkSettings?.trendSevereRun ?? Math.max(trendRun + 1, THRESHOLD_DEFAULTS.trendSevere)),
    completeMin: String(value.completeSettings?.minConfidence ?? THRESHOLD_DEFAULTS.completeMin),
    minConditions: String(value.completeSettings?.minConditions ?? THRESHOLD_DEFAULTS.minConditions),
  };
};
// Parse a numeric field into range; a blank or unparseable value falls back to
// the default so a half-typed box never posts NaN.
const clampNumber = (raw: string, fallback: number, min: number, max: number, integer = false): number => {
  const parsed = integer ? Number.parseInt(raw, 10) : Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return fallback;
  const clamped = Math.min(max, Math.max(min, parsed));
  return integer ? Math.round(clamped) : clamped;
};
// Grading levels, one per line. Returns the levels when they are valid, or a
// translation key naming what is wrong — never a silent substitution: a save
// that rewrote what the user typed while reporting success is worse than a
// blocked save that says why.
const rubricLevels = (text: string) => text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
const rubricOf = (settings?: CheckSettings) => (settings?.rubric ?? DEFAULT_RUBRIC).join('\n');
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
  const [batchMode, setBatchMode] = useState<BatchMode>(DEFAULT_BATCH_MODE);
  const [rubric, setRubric] = useState(DEFAULT_RUBRIC.join('\n'));
  const [thresholds, setThresholds] = useState<ThresholdFields>(defaultThresholds);
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

  // Reflect the backend section (url/model/key state) from a saved config.
  const applyBackend = (value: Config) => {
    setConfig(value);
  };

  // Reflect the advanced section (self-check / narrowing / completion tuning)
  // from a saved config.
  const applyAdvanced = (value: Config) => {
    setCheckMode(value.checkSettings?.mode ?? 'observe');
    setNarrowMode(value.narrowSettings?.mode ?? 'enforce');
    setCompleteMode(value.completeSettings?.mode ?? 'observe');
    setKeepPrefixes(prefixesText(value.narrowSettings));
    setMaxCandidates(String(maxCandidatesOf(value.narrowSettings)));
    setThreshold(String(thresholdOf(value.narrowSettings)));
    setBatchMode(value.narrowSettings?.batchMode ?? DEFAULT_BATCH_MODE);
    setRubric(rubricOf(value.checkSettings));
    setThresholds(thresholdsOf(value));
  };

  // One numeric threshold field changed: store the raw text so the box can be
  // emptied while typing, and arm the section's save.
  const setThresholdField = (key: ThresholdKey, next: string) => {
    setThresholds(previous => ({ ...previous, [key]: next }));
    setAdvancedDirty(true);
  };

  // Full reflect, used only on initial load. Each save handler applies just its
  // own section afterward so a save never resets another section's unsaved edits.
  const applyConfig = (value: Config) => {
    applyBackend(value);
    applyAdvanced(value);
    applyFeatures(value.features);
  };

  useEffect(() => {
    let live = true;
    setMessage(null); setReady(false);
    void request<Config>('config', fetchFn).then(value => { if (live) { applyConfig(value); setAdvancedDirty(false); setBackendDirty(false); setReady(true); } })
      .catch(() => { if (live) setMessage({ text: t('error'), ok: false }); });
    return () => { live = false; };
  }, [t, fetchFn]);

  // The four basic feature switches save immediately on toggle (like the session
  // master switch), so they need no save button and are never reset by the
  // section save buttons. Optimistic: flip locally, PUT only the features, and on
  // failure revert to the server's truth. `features` carries the full set so the
  // server view round-trips the other three unchanged.
  const toggleFeature = async (features: Features, revert: () => void) => {
    setBusy(true);
    try {
      const value = await request<Config>('config', fetchFn, { method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ features }) });
      applyFeatures(value.features);
    } catch { revert(); setMessage({ text: t('error'), ok: false }); }
    finally { setBusy(false); }
  };
  const featureState = () => ({ gate: gateOn, check: checkOn, narrow: narrowOn, complete: completeOn });
  // A field edited while a save is in flight would be overwritten by the echoed
  // config when the response lands, so every editable control waits for idle.
  const canEdit = ready && !busy;
  // Rubric problems block the save with a specific message, rather than letting
  // the server reject the whole write with an opaque error or silently rewriting
  // the user's levels.
  const rubricIssue = (() => {
    const levels = rubricLevels(rubric);
    if (levels.length < 2) return t('rubricTooFew');
    if (levels.length > RUBRIC_MAX_LEVELS) return t('rubricTooMany');
    const tooLong = levels.findIndex(level => level.length > RUBRIC_MAX_LEVEL_LENGTH);
    return tooLong >= 0 ? t('rubricLevelTooLong', { line: tooLong + 1 }) : undefined;
  })();

  // Persist only the advanced section (self-check + narrowing + completion tuning);
  // backend url/model/key and the basic feature switches are left untouched by
  // omitting them from the body, and only the advanced section is reflected back
  // so an unsaved backend edit or a just-toggled feature is never reset.
  const saveAdvanced = async (event: React.FormEvent) => {
    event.preventDefault();
    if (rubricIssue) { setMessage({ text: rubricIssue, ok: false }); return; }
    // Clamp every numeric field into the range the service accepts; a blank or
    // unparseable value falls back to the default.
    const cap = clampNumber(maxCandidates, DEFAULT_MAX_CANDIDATES, 1, 200, true);
    const thresh = clampNumber(threshold, DEFAULT_THRESHOLD, 0, 1);
    const trendRun = clampNumber(thresholds.trendRun, THRESHOLD_DEFAULTS.trendRun, 2, 10, true);
    // The backend requires the severe run to sit strictly above the warn run;
    // clamp here so editing only one of the two cannot produce a rejected save.
    const trendSevereRun = Math.max(trendRun + 1,
      clampNumber(thresholds.trendSevere, THRESHOLD_DEFAULTS.trendSevere, 2, 20, true));
    setBusy(true);
    try {
      // The server REPLACES each settings object wholesale (see the contract note
      // on saveConfig), so every field of every section is sent: the fields this
      // form edits explicitly, and everything else spread from the loaded config
      // so a field this client does not know about survives instead of vanishing.
      const value = await request<Config>('config', fetchFn, { method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          gateSettings: {
            ...config.gateSettings,
            minConfidence: clampNumber(thresholds.gateMin, THRESHOLD_DEFAULTS.gateMin, 0, 1),
          },
          checkSettings: {
            ...config.checkSettings,
            mode: checkMode, rubric: rubricLevels(rubric),
            lowScoreThreshold: clampNumber(thresholds.lowScore, THRESHOLD_DEFAULTS.lowScore, 0, 9, true),
            minConfidence: clampNumber(thresholds.checkMin, THRESHOLD_DEFAULTS.checkMin, 0, 1),
            trendMinConfidence: clampNumber(thresholds.trendMin, THRESHOLD_DEFAULTS.trendMin, 0, 1),
            trendRun, trendSevereRun,
          },
          narrowSettings: {
            ...config.narrowSettings,
            mode: narrowMode, keepPrefixes: parsePrefixes(keepPrefixes), maxCandidates: cap, threshold: thresh, batchMode,
          },
          completeSettings: {
            ...config.completeSettings,
            mode: completeMode,
            minConditions: clampNumber(thresholds.minConditions, THRESHOLD_DEFAULTS.minConditions, 2, 20, true),
            minConfidence: clampNumber(thresholds.completeMin, THRESHOLD_DEFAULTS.completeMin, 0, 1),
          },
        }) });
      // Refresh the echoed sections (not the backend one, which may hold unsaved
      // edits) so the next save spreads server truth rather than a stale copy.
      setConfig(previous => ({ ...previous,
        gateSettings: value.gateSettings ?? previous.gateSettings,
        checkSettings: value.checkSettings ?? previous.checkSettings,
        narrowSettings: value.narrowSettings ?? previous.narrowSettings,
        completeSettings: value.completeSettings ?? previous.completeSettings }));
      applyAdvanced(value); setAdvancedDirty(false); setMessage({ text: t('saved'), ok: true });
    } catch (error) {
      // Surface the server's reason (e.g. "Invalid self-check settings") instead of
      // only "request failed", so a rejected save is diagnosable.
      const reason = error instanceof Error && error.message && error.message !== 'Request failed' ? error.message : '';
      setMessage({ text: reason ? `${t('error')} (${reason})` : t('error'), ok: false });
    }
    finally { setBusy(false); }
  };

  // Persist only the backend section (url/model/key); the advanced settings and
  // feature switches are omitted, and only the backend section is reflected back
  // so an unsaved advanced edit or a just-toggled feature is never reset.
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
      applyBackend(value); setKey(''); setBackendDirty(false); setMessage({ text: t('saved'), ok: true });
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
        <Toggle label={t('featureGate')} checked={gateOn} disabled={!canEdit}
          onChange={next => { setGateOn(next); void toggleFeature({ ...featureState(), gate: next }, () => setGateOn(!next)); }} />
        <p className="decision-muted">{t('featureGateHint')}</p>
        <Toggle label={t('featureCheck')} checked={checkOn} disabled={!canEdit}
          onChange={next => { setCheckOn(next); void toggleFeature({ ...featureState(), check: next }, () => setCheckOn(!next)); }} />
        <p className="decision-muted">{t('featureCheckHint')}</p>
        <Toggle label={t('featureNarrow')} checked={narrowOn} disabled={!canEdit}
          onChange={next => { setNarrowOn(next); void toggleFeature({ ...featureState(), narrow: next }, () => setNarrowOn(!next)); }} />
        <p className="decision-muted">{t('featureNarrowHint')}</p>
        <Toggle label={t('featureComplete')} checked={completeOn} disabled={!canEdit}
          onChange={next => { setCompleteOn(next); void toggleFeature({ ...featureState(), complete: next }, () => setCompleteOn(!next)); }} />
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
            <Toggle label={t('selfCheckSteer')} checked={checkMode === 'steer'} disabled={!canEdit || !checkOn}
              onChange={next => { setCheckMode(next ? 'steer' : 'observe'); setAdvancedDirty(true); }} />
            <p className="decision-muted">{t('selfCheckHint')}</p>
            <Toggle label={t('narrowObserveLabel')} checked={narrowMode === 'observe'} disabled={!canEdit || !narrowOn}
              onChange={next => { setNarrowMode(next ? 'observe' : 'enforce'); setAdvancedDirty(true); }} />
            <p className="decision-muted">{t('narrowHint')}</p>
            <Toggle label={t('completeSteer')} checked={completeMode === 'steer'} disabled={!canEdit || !completeOn}
              onChange={next => { setCompleteMode(next ? 'steer' : 'observe'); setAdvancedDirty(true); }} />
            <p className="decision-muted">{t('completeHint')}</p>
          </div>
          <div className="decision-field-block">
            <span className="decision-subhead">{t('advancedParams')}</span>
            <label className="decision-field">{t('narrowKeepLabel')}
              <textarea className="decision-prefixes" rows={3} value={keepPrefixes} disabled={!canEdit || !narrowOn}
                placeholder="mcp__openviking" onChange={event => { setKeepPrefixes(event.target.value); setAdvancedDirty(true); }} />
              <small className="decision-muted">{t('narrowKeepHint')}</small></label>
            <label className="decision-field decision-field-inline">{t('narrowMaxLabel')}
              <input className="decision-narrow-cap" type="number" min={1} max={200} step={1} value={maxCandidates} disabled={!canEdit || !narrowOn}
                placeholder="20" onChange={event => { setMaxCandidates(event.target.value); setAdvancedDirty(true); }} />
              <small className="decision-muted">{t('narrowMaxHint')}</small></label>
            <label className="decision-field decision-field-inline">{t('narrowThresholdLabel')}
              <input className="decision-narrow-cap" type="number" min={0} max={1} step="any" value={threshold} disabled={!canEdit || !narrowOn}
                placeholder="0.3" onChange={event => { setThreshold(event.target.value); setAdvancedDirty(true); }} />
              <small className="decision-muted">{t('narrowThresholdHint')}</small></label>
            <label className="decision-field decision-field-inline">{t('batchModeLabel')}
              <select className="decision-select" value={batchMode} disabled={!canEdit || !narrowOn}
                onChange={event => { setBatchMode(event.target.value as BatchMode); setAdvancedDirty(true); }}>
                <option value="auto">{t('batchModeAuto')}</option>
                <option value="single">{t('batchModeSingle')}</option>
                <option value="split">{t('batchModeSplit')}</option>
              </select>
              <small className="decision-muted">{t('batchModeHint')}</small></label>
          </div>
          <div className="decision-field-block decision-field-block-wide">
            <span className="decision-subhead">{t('advancedThresholds')}</span>
            <div className="decision-threshold-grid">
            <label className="decision-field decision-field-inline">{t('gateMinConfidenceLabel')}
              <input className="decision-narrow-cap" type="number" min={0} max={1} step="any" value={thresholds.gateMin} disabled={!canEdit || !gateOn}
                onChange={event => setThresholdField('gateMin', event.target.value)} />
              <small className="decision-muted">{t('gateMinConfidenceHint')}</small></label>
            <label className="decision-field decision-field-inline">{t('checkMinConfidenceLabel')}
              <input className="decision-narrow-cap" type="number" min={0} max={1} step="any" value={thresholds.checkMin} disabled={!canEdit || !checkOn}
                onChange={event => setThresholdField('checkMin', event.target.value)} />
              <small className="decision-muted">{t('checkMinConfidenceHint')}</small></label>
            <label className="decision-field decision-field-inline">{t('lowScoreThresholdLabel')}
              <input className="decision-narrow-cap" type="number" min={0} max={9} step={1} value={thresholds.lowScore} disabled={!canEdit || !checkOn}
                onChange={event => setThresholdField('lowScore', event.target.value)} />
              <small className="decision-muted">{t('lowScoreThresholdHint')}</small></label>
            <label className="decision-field decision-field-inline">{t('trendMinConfidenceLabel')}
              <input className="decision-narrow-cap" type="number" min={0} max={1} step="any" value={thresholds.trendMin} disabled={!canEdit || !checkOn}
                onChange={event => setThresholdField('trendMin', event.target.value)} />
              <small className="decision-muted">{t('trendMinConfidenceHint')}</small></label>
            <label className="decision-field decision-field-inline">{t('trendRunLabel')}
              <input className="decision-narrow-cap" type="number" min={2} max={10} step={1} value={thresholds.trendRun} disabled={!canEdit || !checkOn}
                onChange={event => setThresholdField('trendRun', event.target.value)} />
              <small className="decision-muted">{t('trendRunHint')}</small></label>
            <label className="decision-field decision-field-inline">{t('trendSevereRunLabel')}
              <input className="decision-narrow-cap" type="number" min={2} max={20} step={1} value={thresholds.trendSevere} disabled={!canEdit || !checkOn}
                onChange={event => setThresholdField('trendSevere', event.target.value)} />
              <small className="decision-muted">{t('trendSevereRunHint')}</small></label>
            <label className="decision-field decision-field-inline">{t('completeMinConfidenceLabel')}
              <input className="decision-narrow-cap" type="number" min={0} max={1} step="any" value={thresholds.completeMin} disabled={!canEdit || !completeOn}
                onChange={event => setThresholdField('completeMin', event.target.value)} />
              <small className="decision-muted">{t('completeMinConfidenceHint')}</small></label>
            <label className="decision-field decision-field-inline">{t('minConditionsLabel')}
              <input className="decision-narrow-cap" type="number" min={2} max={20} step={1} value={thresholds.minConditions} disabled={!canEdit || !completeOn}
                onChange={event => setThresholdField('minConditions', event.target.value)} />
              <small className="decision-muted">{t('minConditionsHint')}</small></label>
            </div>
          </div>
          <div className="decision-field-block decision-field-block-wide">
            <span className="decision-subhead">{t('advancedRubric')}</span>
            <label className="decision-field">{t('selfCheckRubricLabel')}
              <textarea className="decision-prefixes" rows={4} value={rubric} disabled={!canEdit || !checkOn}
                onChange={event => { setRubric(event.target.value); setAdvancedDirty(true); }} />
              <small className="decision-muted">{t('selfCheckRubricHint')}</small></label>
            {rubricIssue && <p role="status" className="decision-muted decision-message-warn">{rubricIssue}</p>}
          </div>
        </div>
        <div className="decision-actions">
          <button disabled={!canEdit || !advancedDirty || Boolean(rubricIssue)} type="submit">{t('saveAdvanced')}</button>
        </div>
      </form>
    </details>
    <section>
      <h3><HeadIcon name="backend" />{t('backend')}</h3>
      {ready && <p className="decision-muted decision-destination">{t('destination')}<code>{config.effectiveUrl}</code></p>}
      <form onSubmit={event => void saveBackend(event)}>
        <label className="decision-field">{t('url')}
          <input type="url" value={config.url} disabled={!canEdit} placeholder="https://api.typesafe.ai"
            onChange={event => { setConfig({ ...config, url: event.target.value }); setBackendDirty(true); setProbeResult(null); }} /></label>
        <label className="decision-field">{t('model')}
          <input value={config.model} disabled={!canEdit} placeholder="jev-latest"
            onChange={event => { setConfig({ ...config, model: event.target.value }); setBackendDirty(true); setProbeResult(null); }} /></label>
        <label className="decision-field">{t('key')}
          <input type="password" autoComplete="off" value={key} disabled={!canEdit}
            placeholder={config.apiKeySet ? '••••••••' : ''} onChange={event => { setKey(event.target.value); setBackendDirty(true); setProbeResult(null); }} />
          <small className="decision-muted">{config.apiKeySet ? t('keyHintSaved') : t('keyHintEmpty')}</small></label>
        <div className="decision-actions">
          <button disabled={!canEdit} type="submit">{t('save')}</button>
          <button className="decision-secondary" disabled={!canEdit || backendDirty} type="button" onClick={() => void probe()}>{t('probe')}</button>
          {probeResult && <span role="status" className={`decision-probe-result${probeResult.ok ? ' decision-message-ok' : ' decision-message-warn'}`}>{probeResult.text}</span>}
        </div>
      </form>
      {config.apiKeySet && <div className="decision-danger-row">
        <div className="decision-danger-text">
          <span className="decision-danger-title">{t('removeKey')}</span>
          <small className="decision-muted">{t('removeKeyHint')}</small>
        </div>
        <button type="button" className="decision-danger-button" disabled={!canEdit} onClick={() => void removeSavedKey()}>{t('removeKeyButton')}</button>
      </div>}
    </section>
    {message && <p role="status" className={`decision-message${message.ok ? ' decision-message-ok' : ' decision-message-warn'}`}>{message.text}</p>}
  </div>;
}
