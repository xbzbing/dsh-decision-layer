import { useEffect, useState } from 'react';
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import type { TranslationKey } from './i18n.js';
import { request, type Analysis, type LogRows } from './api.js';
import { DecisionLogList } from './decision-log.js';
import { CardHead, Stat, share } from './cards.js';
import { useAnnotations } from './use-annotations.js';

// The session-scoped "Decision analysis" conversation view tab. It reads the
// read-only aggregate over the persisted decision logs (/logs) plus the full
// persisted decision rows, paginated (/logrows), and shares the annotation
// writer + row rendering with the composer-dock panel so a rating made here is
// identical to one made there. It is read-only over logs and append-only over
// annotations; it never touches the agent loop.
interface Props { sessionId: string; t: Translate<TranslationKey> }

const LOG_PAGE_SIZE = 100;

export function AnalysisView({ sessionId, t }: Props) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [rows, setRows] = useState<LogRows | null>(null);
  const [logPage, setLogPage] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const { ratings, seed, annotate } = useAnnotations(sessionId, () => setMessage(t('annotateFailed')));

  useEffect(() => {
    let alive = true;
    setMessage('');
    setLoaded(false);
    setLogPage(1);
    setRows(null);
    void request<Analysis>(`logs?sessionId=${encodeURIComponent(sessionId)}`)
      .then(value => { if (alive) { setAnalysis(value); seed(value); } })
      .catch(() => {})
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [sessionId, seed]);

  // The decision log is a separate, paginated fetch so paging never refetches the
  // aggregate. The analysis tab shows the full persisted history (the dock panel
  // keeps only the in-memory recent rows with its own scroll).
  useEffect(() => {
    let alive = true;
    void request<LogRows>(`logrows?sessionId=${encodeURIComponent(sessionId)}&page=${logPage}&pageSize=${LOG_PAGE_SIZE}`)
      .then(value => { if (alive) setRows(value); })
      .catch(() => {});
    return () => { alive = false; };
  }, [sessionId, logPage]);

  const profile = analysis?.profile;
  const backtest = analysis?.trendBacktest;
  const annotations = analysis?.annotations;
  // Mean self-check score across evaluated turns, to one decimal.
  const meanScore = profile && profile.check.scoreCount > 0
    ? Math.round((profile.check.scoreSum / profile.check.scoreCount) * 10) / 10 : null;
  // Task-completion tallies are per-condition, so their percentages compare
  // against the total conditions judged, not against the evaluation count.
  const completeTotal = profile ? profile.complete.satisfied + profile.complete.unsatisfied + profile.complete.insufficient : 0;

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
                <CardHead title={t('cardGate')} total={profile.gate.attempts} unit={t('cardTimes')} />
                <div className="decision-card-stats">
                  <Stat label={t('deny')} value={profile.gate.deny} pct={share(profile.gate.deny, profile.gate.attempts)} tone="warn" />
                  <Stat label={t('allow')} value={profile.gate.allow} pct={share(profile.gate.allow, profile.gate.attempts)} />
                  <Stat label={t('ask')} value={profile.gate.ask} pct={share(profile.gate.ask, profile.gate.attempts)} />
                  <Stat label={t('failures')} value={profile.gate.error} pct={share(profile.gate.error, profile.gate.attempts)} tone="muted" />
                </div>
              </article>}
              {profile.check.attempts > 0 && <article className="decision-card">
                <CardHead title={t('cardCheck')} total={profile.check.attempts} unit={t('cardTimes')} />
                <div className="decision-card-stats">
                  <Stat label={t('checkLow')} value={profile.check.low} pct={share(profile.check.low, profile.check.attempts)} tone="warn" />
                  <Stat label={t('checkOk')} value={profile.check.ok} pct={share(profile.check.ok, profile.check.attempts)} />
                  <Stat label={t('analysisMeanScore')} value={meanScore === null ? t('rateNa') : `${meanScore}/2`} />
                  <Stat label={t('failures')} value={profile.check.error} pct={share(profile.check.error, profile.check.attempts)} tone="muted" />
                </div>
              </article>}
              {profile.narrow.attempts > 0 && <article className="decision-card">
                <CardHead title={t('cardNarrow')} total={profile.narrow.attempts} unit={t('cardTimes')} />
                <div className="decision-card-stats">
                  <Stat label={t('narrowAppliedLabel')} value={profile.narrow.applied} pct={share(profile.narrow.applied, profile.narrow.attempts)} />
                  <Stat label={t('narrowDroppedLabel')} value={profile.narrow.droppedSum} />
                  <Stat label={t('failures')} value={profile.narrow.error} pct={share(profile.narrow.error, profile.narrow.attempts)} tone="muted" />
                </div>
              </article>}
              {profile.complete.attempts > 0 && <article className="decision-card">
                <CardHead title={t('cardComplete')} total={profile.complete.attempts} unit={t('cardTimes')} />
                <div className="decision-card-stats">
                  <Stat label={t('completeSatisfied')} value={profile.complete.satisfied} pct={share(profile.complete.satisfied, completeTotal)} />
                  <Stat label={t('completeUnsatisfied')} value={profile.complete.unsatisfied} pct={share(profile.complete.unsatisfied, completeTotal)} tone="warn" />
                  <Stat label={t('completeInsufficient')} value={profile.complete.insufficient} pct={share(profile.complete.insufficient, completeTotal)} tone="muted" />
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
            {!rows || rows.total === 0
              ? <p className="decision-empty" role="status">{t('analysisLogTruncated')}</p>
              : <>
                <DecisionLogList entries={rows.entries} ratings={ratings} onRate={(id, rating) => void annotate(id, rating)} t={t} newestFirst={false} />
                {rows.pages > 1 && <nav className="decision-pager" aria-label={t('log')}>
                  <button type="button" disabled={rows.page <= 1} onClick={() => setLogPage(page => Math.max(1, page - 1))}>{t('pagerPrev')}</button>
                  <span className="decision-pager-status">{t('pagerStatus', { page: rows.page, pages: rows.pages, total: rows.total })}</span>
                  <button type="button" disabled={rows.page >= rows.pages} onClick={() => setLogPage(page => page + 1)}>{t('pagerNext')}</button>
                </nav>}
                <p className="decision-muted decision-analysis-note">{t('analysisLogNote')}</p>
              </>}
          </section>
        </>}

      {message && <p role="status" className="decision-message decision-message-warn">{message}</p>}
    </div>
  </div>;
}
