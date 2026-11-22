import { useEffect, useState } from 'react';
import useFetch from '../../hooks/useFetch';
import { listAllEvents } from '../../api/eventsApi';
import EventsTable from '../../components/EventsTable';
import Pagination from '../../components/ui/Pagination';
import { ErrorState, LoadingBlock, PageHeader } from '../../components/ui/Feedback';
import { EVENT_TYPES, SEVERITIES } from '../../utils/constants';

export const dayStart = (d) => (d ? new Date(`${d}T00:00:00`).toISOString() : undefined);
export const dayEnd = (d) => (d ? new Date(`${d}T23:59:59.999`).toISOString() : undefined);

export default function AdminEvents() {
  const [f, setF] = useState({ severity: '', type: '', resolved: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const { data, loading, error, reload } = useFetch(() => listAllEvents({
    page, limit: 20,
    ...(f.severity && { severity: f.severity }),
    ...(f.type && { type: f.type }),
    ...(f.resolved && { resolved: f.resolved }),
    ...(f.from && { from: dayStart(f.from) }),
    ...(f.to && { to: dayEnd(f.to) }),
  }), [page, f]);

  useEffect(() => { setPage(1); }, [f]);

  return (
    <>
      <PageHeader title="Security events" description="Everything the policy engine and monitors flagged, across all users." />
      <div className="card">
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-4">
          <select className="input w-auto" aria-label="Severity" value={f.severity} onChange={set('severity')}>
            <option value="">All severities</option>
            {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => <option key={s} value={s}>{SEVERITIES[s].label}</option>)}
          </select>
          <select className="input w-auto" aria-label="Event type" value={f.type} onChange={set('type')}>
            <option value="">All event types</option>
            {Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="input w-auto" aria-label="Resolution" value={f.resolved} onChange={set('resolved')}>
            <option value="">Resolved and open</option>
            <option value="false">Open</option>
            <option value="true">Resolved</option>
          </select>
          <label className="text-xs text-slate-500">From<input type="date" className="input mt-1" value={f.from} max={f.to || undefined} onChange={set('from')} /></label>
          <label className="text-xs text-slate-500">To<input type="date" className="input mt-1" value={f.to} min={f.from || undefined} onChange={set('to')} /></label>
        </div>
        {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <LoadingBlock /> : <EventsTable events={data?.data} showUser linkFiles />}
        <Pagination pagination={data?.pagination} onPage={setPage} />
      </div>
    </>
  );
}
