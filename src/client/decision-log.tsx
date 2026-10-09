import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import type { TranslationKey } from './i18n.js';
import type { LogEntry, Rating } from './api.js';

// Shared rendering for one session's decision log rows and the per-row
// annotation buttons. Extracted from the composer-dock panel so the
// conversation-view analysis tab renders identical rows and ratings.

interface RowProps { t: Translate<TranslationKey> }

const time = (at: number) => new Date(at).toLocaleTimeString();

function reasonText(t: Translate<TranslationKey>, reason?: string) {
  return reason === 'unavailable' || reason === 'unreachable' ? t('reasonUnavailable')
    : reason === 'http-error' ? t('reasonHttpError')
    : reason === 'invalid-response' ? t('reasonInvalidResponse')
    : reason === 'low-confidence' ? t('reasonLowConfidence')
    : reason === 'too-many-candidates' ? t('reasonTooMany')
    : reason === 'low-keep' ? t('reasonLowKeep')
    : reason === 'config' ? t('reasonConfig') : reason;
}

function actionText(t: Translate<TranslationKey>, action?: string) {
  return action === 'deny' ? t('actionDeny') : action === 'ask' ? t('actionAsk') : action === 'pass' ? t('actionPass') : action;
}

function failDetail(t: Translate<TranslationKey>, entry: LogEntry) {
  const reason = reasonText(t, entry.reason);
  if (entry.reason === 'low-confidence' && typeof entry.confidence === 'number') return `${reason}（${t('logConfidence')} ${entry.confidence}）`;
  return reason;
}

function gateArgs({ t }: RowProps, entry: LogEntry) {
  const value = entry.command || entry.path;
  if (!value) return null;
  const label = entry.command ? t('logCommandLabel') : t('logPathLabel');
  const preview = value.length > 160 ? `${value.slice(0, 160)}…` : value;
  return <code className="decision-log-cmd" title={`${label}${value}`}>{preview}</code>;
}

function renderGate({ t }: RowProps, entry: LogEntry) {
  const tool = <code className="decision-log-tool">{entry.tool ?? '—'}</code>;
  const args = gateArgs({ t }, entry);
  if (entry.outcome === 'error') return <>{t('logGate')} · {tool}{args ? <> {args}</> : null} <span className="decision-log-detail">{t('gatePassThrough')}{entry.reason ? ` · ${failDetail(t, entry)}` : ''}</span></>;
  if (entry.outcome === 'deny') {
    const suggestion = entry.suggestion && entry.suggestion !== 'deny'
      ? <span className="decision-log-detail"> · {t('logSuggested')} {actionText(t, entry.suggestion)}</span> : null;
    return <>{t('logGate')} · {tool}{args ? <> {args}</> : null} <span className="decision-log-verdict">→ {t('actionDeny')}</span>{suggestion}</>;
  }
  const suggestion = entry.suggestion ? <span className="decision-log-detail"> · {t('logSuggested')} {actionText(t, entry.suggestion)}</span> : null;
  const lowConf = entry.reason === 'low-confidence' && typeof entry.confidence === 'number'
    ? <span className="decision-log-detail"> · {t('reasonLowConfidence')} {entry.confidence}</span> : null;
  return <>{t('logGate')} · {tool}{args ? <> {args}</> : null} <span className="decision-log-verdict">{t('gatePassThrough')}</span>{suggestion}{lowConf}</>;
}

function renderCheck({ t }: RowProps, entry: LogEntry) {
  const label = <span title={t('logCheckHint')}>{t('logCheck')}</span>;
  // The request this self-check judged, so the reader knows which turn's output
  // was scored. Truncated inline; full text in the tooltip.
  const subject = entry.subject
    ? <code className="decision-log-cmd" title={`${t('logSubjectLabel')}${entry.subject}`}>{entry.subject.length > 60 ? `${entry.subject.slice(0, 60)}…` : entry.subject}</code>
    : null;
  if (entry.outcome === 'error') return <>{label}{subject ? <> {subject}</> : null} <span className="decision-log-detail">{t('logEvalFailed')}{entry.reason ? ` · ${failDetail(t, entry)}` : ''}</span></>;
  // A low score the model was not confident about is low-signal noise: it does not
  // advance the quality trend and triggers no intervention. Mark it plainly so the
  // reader does not mistake it for a real quality dip.
  const noisy = entry.outcome === 'low' && entry.lowConfidence === true;
  const result = entry.outcome === 'low' ? (noisy ? t('checkResultLowNoisy') : t('checkResultLow')) : t('checkResultOk');
  const verdict = <span className={noisy ? 'decision-log-muted-verdict' : 'decision-log-verdict'}>{result}</span>;
  const score = entry.score !== undefined ? <span className="decision-log-detail" title={t('logScoreHint')}> · {t('logScore')} {entry.score}/2</span> : null;
  const conf = typeof entry.confidence === 'number' ? <span className="decision-log-detail"> · {t('logConfidence')} {entry.confidence}</span> : null;
  const hint = noisy ? <span className="decision-log-detail" title={t('checkNoiseHint')}> · {t('checkNoiseTag')}</span> : null;
  return <>{label}{subject ? <> {subject}</> : null} · {verdict}{score}{conf}{hint}</>;
}

function renderNarrow({ t }: RowProps, entry: LogEntry) {
  const label = <span title={t('logNarrowHint')}>{t('logNarrow')}</span>;
  if (entry.outcome === 'error') return <>{label} <span className="decision-log-detail">{t('logEvalFailed')}{entry.reason ? ` · ${failDetail(t, entry)}` : ''}</span></>;
  const dropped = entry.dropped ?? 0;
  const kept = typeof entry.kept === 'number' ? entry.kept : undefined;
  const guardText = entry.reason === 'too-many-candidates'
    ? (typeof entry.candidates === 'number' ? t('reasonTooManyCount', { count: entry.candidates }) : t('reasonTooMany'))
    : entry.reason === 'low-keep' ? t('reasonLowKeep') : undefined;
  const guard = guardText ? <span className="decision-log-detail"> · {guardText}</span> : null;
  const modeTag = <span className="decision-log-detail"> · {entry.mode === 'enforce' ? t('narrowEnforce') : t('narrowObserve')}</span>;
  if (dropped === 0) {
    return <>{label} · <span className="decision-log-verdict">{t('narrowKept')}</span>{kept !== undefined ? <span className="decision-log-detail"> · {t('narrowKeptCount')} {kept}</span> : null}{guard}{modeTag}</>;
  }
  const names = Array.isArray(entry.tools) && entry.tools.length > 0 ? entry.tools.join('、') : undefined;
  const overflow = names && Array.isArray(entry.tools) && entry.tools.length < dropped ? t('narrowMore', { count: dropped }) : '';
  return <>{label} · <span className="decision-log-verdict">{t('narrowDropped')} {dropped}{kept !== undefined ? ` / ${t('narrowKeptCount')} ${kept}` : ''}</span>{names ? <span className="decision-log-detail"> · {names}{overflow}</span> : null}{guard}{modeTag}</>;
}

function renderComplete({ t }: RowProps, entry: LogEntry) {
  const label = <span>{t('logComplete')}</span>;
  if (entry.outcome === 'error') return <>{label} <span className="decision-log-detail">{t('logEvalFailed')}{entry.reason ? ` · ${failDetail(t, entry)}` : ''}</span></>;
  const result = entry.outcome === 'unsatisfied' ? t('completeResultUnsatisfied') : t('completeResultOk');
  const parts: string[] = [];
  if (typeof entry.satisfied === 'number') parts.push(`${t('completeSatisfied')} ${entry.satisfied}`);
  if (typeof entry.unsatisfied === 'number' && entry.unsatisfied > 0) parts.push(`${t('completeUnsatisfied')} ${entry.unsatisfied}`);
  if (typeof entry.insufficient === 'number' && entry.insufficient > 0) parts.push(`${t('completeInsufficient')} ${entry.insufficient}`);
  const tally = parts.length > 0 ? <span className="decision-log-detail"> · {parts.join(' / ')}</span> : null;
  const steer = entry.steered ? <span className="decision-log-detail"> · {t('completeSteered')}</span> : null;
  return <>{label} · <span className="decision-log-verdict">{result}</span>{typeof entry.conditions === 'number' ? <span className="decision-log-detail"> · {t('completeConditions')} {entry.conditions}</span> : null}{tally}{steer}</>;
}

function outcomeTagOf(entry: LogEntry) {
  if (entry.kind === 'narrow') return entry.outcome === 'error' ? 'error' : 'ok';
  if (entry.kind === 'complete') return entry.outcome === 'error' ? 'error' : entry.outcome === 'unsatisfied' ? 'warn' : 'ok';
  if (entry.outcome === 'deny') return 'deny';
  if (entry.outcome === 'error') return 'error';
  // A low-confidence low score is noise, not a real dip: render it neutral (muted)
  // rather than the amber warn accent so it does not read as a quality problem.
  if (entry.outcome === 'low') return entry.kind === 'check' && entry.lowConfidence === true ? 'muted' : 'warn';
  return 'ok';
}

function renderBody(props: RowProps, entry: LogEntry) {
  return entry.kind === 'gate' ? renderGate(props, entry)
    : entry.kind === 'narrow' ? renderNarrow(props, entry)
    : entry.kind === 'complete' ? renderComplete(props, entry)
    : renderCheck(props, entry);
}

// The three annotation buttons (correct / wrong / unsure) for one decision row.
function RatingButtons({ id, t, ratings, onRate }: { id: string; t: Translate<TranslationKey>; ratings: Record<string, Rating>; onRate: (id: string, rating: Rating) => void }) {
  return <span className="decision-rate" role="group" aria-label={t('rateGroup')}>
    <button type="button" className={`decision-rate-btn${ratings[id] === 'good' ? ' decision-rate-on decision-rate-good' : ''}`} aria-label={t('rateGood')} title={t('rateGood')} aria-pressed={ratings[id] === 'good'} onClick={() => onRate(id, 'good')}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5 7.2 8.1 2.4c.6-.9 2-.5 2 .6V6h3.2c.9 0 1.5.8 1.3 1.6l-1.1 4.6c-.2.8-.9 1.3-1.7 1.3H5V7.2Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M5 7.2H2.6v6.3H5" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
    </button>
    <button type="button" className={`decision-rate-btn${ratings[id] === 'bad' ? ' decision-rate-on decision-rate-bad' : ''}`} aria-label={t('rateBad')} title={t('rateBad')} aria-pressed={ratings[id] === 'bad'} onClick={() => onRate(id, 'bad')}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M11 8.8 7.9 13.6c-.6.9-2 .5-2-.6V10H2.7c-.9 0-1.5-.8-1.3-1.6l1.1-4.6C2.7 3 3.4 2.5 4.2 2.5H11v6.3Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M11 8.8h2.4V2.5H11" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
    </button>
    <button type="button" className={`decision-rate-btn${ratings[id] === 'unsure' ? ' decision-rate-on decision-rate-unsure' : ''}`} aria-label={t('rateUnsure')} title={t('rateUnsure')} aria-pressed={ratings[id] === 'unsure'} onClick={() => onRate(id, 'unsure')}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6.2" stroke="currentColor" stroke-width="1.2"/><path d="M6.3 6.2c0-1 .8-1.7 1.7-1.7s1.7.7 1.7 1.6c0 1.3-1.6 1.4-1.7 2.6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="11.4" r=".8" fill="currentColor"/></svg>
    </button>
  </span>;
}

// One decision row: timestamp, kind-specific body, and (when the row has a
// stable id) the annotation buttons. `newestFirst` reverses display order.
export function DecisionLogList({ entries, ratings, onRate, t, newestFirst = true }: {
  entries: LogEntry[]; ratings: Record<string, Rating>; onRate: (id: string, rating: Rating) => void; t: Translate<TranslationKey>; newestFirst?: boolean;
}) {
  const rows = newestFirst ? entries.slice().reverse() : entries.slice();
  return <ol className="decision-log">
    {rows.map((entry, index) => <li key={entry.id ?? `${entry.at}-${index}`} className={`decision-log-item decision-log-${outcomeTagOf(entry)}`}>
      <span className="decision-log-time">{time(entry.at)}</span>
      <span className="decision-log-body">{renderBody({ t }, entry)}</span>
      {entry.id && <RatingButtons id={entry.id} t={t} ratings={ratings} onRate={onRate} />}
    </li>)}
  </ol>;
}
