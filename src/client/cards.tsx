import type { ReactNode } from 'react';

// Shared metric-card primitives for the dock panel and the analysis view, so the
// two surfaces render identical cards. Behavior-preserving extraction: the markup
// matches what each surface emitted inline before.

// One card header: a title on the left and a total count on the right. When
// `rate` is given, an inline rate label sits left of the total on the same row
// (used by the dock panel's per-feature cards to keep them compact).
export function CardHead({ title, total, unit, rate }: {
  title: string; total: number; unit: string; rate?: { label: string; value: string };
}) {
  const totalSpan = <span className="decision-card-total">{total}<small>{unit}</small></span>;
  return <header className="decision-card-head">
    <span className="decision-card-title">{title}</span>
    {rate
      ? <span className="decision-card-head-metrics">
          <span className="decision-card-rate-inline">{rate.label} <b>{rate.value}</b></span>
          {totalSpan}
        </span>
      : totalSpan}
  </header>;
}

// One labelled stat in a card's stat row, with an optional share-of-total percent
// beneath the number. `pct` is null/undefined when there is nothing to compare.
export function Stat({ label, value, pct, tone }: {
  label: ReactNode; value: number | string; pct?: number | null; tone?: 'warn' | 'muted';
}) {
  return <div className="decision-stat">
    <span className={`decision-stat-num${tone ? ` decision-stat-${tone}` : ''}`}>{value}</span>
    {typeof pct === 'number' && <span className="decision-stat-pct">{pct}%</span>}
    <span className="decision-stat-label">{label}</span>
  </div>;
}

// Share of a total as a rounded whole percent, or null when there is no total.
export const share = (n: number, total: number) => total > 0 ? Math.round((n / total) * 100) : null;
