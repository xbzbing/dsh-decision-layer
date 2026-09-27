import { useEffect, useState } from 'react';
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import type { TranslationKey } from './i18n.js';
import { request, type Analysis, type LogEntry } from './api.js';
import { DecisionLogList } from './decision-log.js';
import { useAnnotations } from './use-annotations.js';

// The session-scoped "Decision analysis" conversation view tab. It reads the
// read-only aggregate over the persisted decision logs (/logs) plus the recent
// in-memory decision rows (/log), and shares the annotation writer + row
// rendering with the composer-dock panel so a rating made here is identical to
// one made there. It is read-only over logs and append-only over annotations;
// it never touches the agent loop.
interface Props { sessionId: string; t: Translate<TranslationKey> }

// A single labelled number in the profile grid.
function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'warn' | 'muted' }) {
  return <div className="decision-stat">
    <span className={`decision-stat-num${tone ? ` decision-stat-${tone}` : ''}`}>{value}</span>
    <span className="decision-stat-label">{label}</span>
  </div>;
}

export function AnalysisView({ sessionId, t }: Props) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const { ratings, seed, annotate } = useAnnotations(sessionId, () => setMessage(t('annotateFailed')));

  useEffect(() => {
    let alive = true;
    setMessage('');
    setLoaded(false);
    void Promise.allSettled([
      request<Analysis>(`logs?sessionId=${encodeURIComponent(sessionId)}`).then(value => { if (alive) { setAnalysis(value); seed(value); } }),
      request<{ entries: LogEntry[] }>(`log?sessionId=${encodeURIComponent(sessionId)}`).then(value => { if (alive) setLog(value.entries); }),
    ]).finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [sessionId, seed]);

  const profile = analysis?.profile;
  const backtest = analysis?.trendBacktest;
  const annotations = analysis?.annotations;
  // Mean self-check score across evaluated turns, to one decimal.
  const meanScore = profile && profile.check.scoreCount > 0
    ? Math.round((profile.check.scoreSum / profile.check.scoreCount) * 10) / 10 : null;

  return <div className="decision-analysis" role="region" aria-label={t('analysisTitle')}>
    <div className="decision-analysis-inner">
      <h2 className="decision-analysis-title">{t('analysisTitle')}</h2>
      <p className="decision-muted decision-analysis-intro">{t('analysisIntro')}</p>

      {loaded && (!analysis || analysis.totalDecisions === 0)
        ? <p className="decision-empty" role="status">{t('logEmpty')}</p>
        : <>
          {profile && <section className="decision-analysis-section">
            <h3>{t('analysisProfile')}</h3>
            <div className="decision-analysis-cards">
              {profile.gate.attempts > 0 && <article className="decision-card">
                <header className="decision-card-head"><span className="decision-card-title">{t('cardGate')}</span>
                  <span className="decision-card-total">{profile.gate.attempts}<small>{t('cardTimes')}</small></span></header>
                <div className="decision-card-stats">
                  <Stat label={t('deny')} value={profile.gate.deny} tone="warn" />
                  <Stat label={t('allow')} value={profile.gate.allow} />
                  <Stat label={t('ask')} value={profile.gate.ask} />
                  <Stat label={t('failures')} value={profile.gate.error} tone="muted" />
                </div>
              </article>}
              {profile.check.attempts > 0 && <article className="decision-card">
                <header className="decision-card-head"><span className="decision-card-title">{t('cardCheck')}</span>
                  <span className="decision-card-total">{profile.check.attempts}<small>{t('cardTimes')}</small></span></header>
                <div className="decision-card-stats">
                  <Stat label={t('checkLow')} value={profile.check.low} tone="warn" />
                  <Stat label={t('checkOk')} value={profile.check.ok} />
                  <Stat label={t('analysisMeanScore')} value={meanScore === null ? t('rateNa') : `${meanScore}/2`} />
                  <Stat label={t('failures')} value={profile.check.error} tone="muted" />
                </div>
              </article>}
              {profile.narrow.attempts > 0 && <article className="decision-card">
                <header className="decision-card-head"><span className="decision-card-title">{t('cardNarrow')}</span>
                  <span className="decision-card-total">{profile.narrow.attempts}<small>{t('cardTimes')}</small></span></header>
                <div className="decision-card-stats">
                  <Stat label={t('narrowAppliedLabel')} value={profile.narrow.applied} />
                  <Stat label={t('narrowDroppedLabel')} value={profile.narrow.droppedSum} />
                  <Stat label={t('failures')} value={profile.narrow.error} tone="muted" />
                </div>
              </article>}
              {profile.complete.attempts > 0 && <article className="decision-card">
                <header className="decision-card-head"><span className="decision-card-title">{t('cardComplete')}</span>
                  <span className="decision-card-total">{profile.complete.attempts}<small>{t('cardTimes')}</small></span></header>
                <div className="decision-card-stats">
                  <Stat label={t('completeSatisfied')} value={profile.complete.satisfied} />
                  <Stat label={t('completeUnsatisfied')} value={profile.complete.unsatisfied} tone="warn" />
                  <Stat label={t('completeInsufficient')} value={profile.complete.insufficient} tone="muted" />
                </div>
              </article>}
            </div>
          </section>}

          {backtest && <section className="decision-analysis-section">
            <h3>{t('analysisTrend')}</h3>
            <div className="decision-card-stats decision-analysis-trend">
              <Stat label={t('analysisTrendWarn')} value={backtest.warnHits} />
              <Stat label={t('analysisTrendSevere')} value={backtest.severeHits} tone="warn" />
              <Stat label={t('analysisTrendMaxRun')} value={backtest.maxRun} />
            </div>
            <p className="decision-muted decision-analysis-note">{t('analysisTrendNote')}</p>
          </section>}

          {annotations && <section className="decision-analysis-section">
            <h3>{t('analysisAccuracy')}</h3>
            {annotations.rated === 0
              ? <p className="decision-muted">{t('analysisAccuracyEmpty')}</p>
              : <p className="decision-muted decision-rate-summary">{t('rateSummary', { rated: annotations.rated, good: annotations.good, bad: annotations.bad, unsure: annotations.unsure })}</p>}
          </section>}

          <section className="decision-analysis-section">
            <h3>{t('log')}</h3>
            {log.length === 0
              ? <p className="decision-empty" role="status">{t('analysisLogTruncated')}</p>
              : <>
                <DecisionLogList entries={log} ratings={ratings} onRate={(id, rating) => void annotate(id, rating)} t={t} />
                <p className="decision-muted decision-analysis-note">{t('analysisLogNote')}</p>
              </>}
          </section>
        </>}

      {message && <p role="status" className="decision-message decision-message-warn">{message}</p>}
    </div>
  </div>;
}
