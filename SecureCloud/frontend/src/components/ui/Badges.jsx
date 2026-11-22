import { CLASSIFICATIONS, DECISIONS, FILE_STATUSES, LINK_STATUSES, SEVERITIES } from '../../utils/constants';

function Pill({ tone, children, title, pulse }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}>
      {pulse && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

const fallback = 'bg-slate-100 text-slate-700 ring-slate-500/20';

export const ClassificationBadge = ({ value }) => {
  const m = CLASSIFICATIONS[value];
  return <Pill tone={m?.tone || fallback}>{m?.label || value || '-'}</Pill>;
};
export const StatusBadge = ({ value }) => {
  const m = FILE_STATUSES[value];
  return <Pill tone={m?.tone || fallback} title={m?.hint} pulse={m?.pulse}>{m?.label || value || '-'}</Pill>;
};
export const LinkStatusBadge = ({ value }) => {
  const m = LINK_STATUSES[value];
  return <Pill tone={m?.tone || fallback}>{m?.label || value || '-'}</Pill>;
};
export const DecisionBadge = ({ value }) => {
  const m = DECISIONS[value];
  return <Pill tone={m?.tone || fallback}>{m?.label || value || '-'}</Pill>;
};
export const SeverityBadge = ({ value }) => {
  const m = SEVERITIES[value];
  return <Pill tone={m?.tone || fallback}>{m?.label || value || '-'}</Pill>;
};
