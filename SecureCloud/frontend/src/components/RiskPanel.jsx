import { RISK_FACTORS, riskLevel } from '../utils/constants';

// Score bar with the four bands marked (Low / Medium / High / Critical)
export function RiskMeter({ score = 0, showLabel = true }) {
  const level = riskLevel(score);
  const clamped = Math.max(0, Math.min(100, Number(score) || 0));
  return (
    <div>
      {showLabel && (
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className={`text-sm font-medium ${level.text}`}>{level.label} risk</span>
          <span className="text-sm tabular-nums text-slate-500">{clamped} / 100</span>
        </div>
      )}
      <div className="relative h-2 overflow-hidden rounded-full bg-slate-100" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={clamped} aria-label="Risk score">
        <div className={`h-full rounded-full ${level.bar}`} style={{ width: `${clamped}%` }} />
        {[30, 60, 80].map((p) => <span key={p} className="absolute top-0 h-full w-px bg-white" style={{ left: `${p}%` }} />)}
      </div>
    </div>
  );
}

// Explains how a score was reached: one row per factor with its points
export function RiskBreakdown({ breakdown = [] }) {
  if (!breakdown.length) return null;
  return (
    <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
      {breakdown.map((b, i) => (
        <li key={`${b.factor}-${i}`} className="flex items-start justify-between gap-3 px-3 py-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800">{RISK_FACTORS[b.factor] || b.factor}</p>
            {b.reason && <p className="text-xs text-slate-500">{b.reason}</p>}
          </div>
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums ${b.points < 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
            {b.points > 0 ? `+${b.points}` : b.points}
          </span>
        </li>
      ))}
    </ul>
  );
}
