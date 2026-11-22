import { useEffect, useState } from 'react';
import useFetch from '../hooks/useFetch';
import { listMyEvents } from '../api/eventsApi';
import EventsTable from '../components/EventsTable';
import Pagination from '../components/ui/Pagination';
import { ErrorState, LoadingBlock, PageHeader } from '../components/ui/Feedback';
import { EVENT_TYPES, SEVERITIES } from '../utils/constants';

export default function MyActivity() {
  const [severity, setSeverity] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useFetch(() => listMyEvents({ page, limit: 15, ...(severity && { severity }), ...(type && { type }) }), [page, severity, type]);

  useEffect(() => { setPage(1); }, [severity, type]);

  return (
    <>
      <PageHeader title="My activity" description="Security events on your account: blocked or warned shares, failed sign-ins, high-risk uploads and similar." />
      <div className="card">
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <select className="input w-auto" aria-label="Filter by severity" value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="">All severities</option>
            {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => <option key={s} value={s}>{SEVERITIES[s].label}</option>)}
          </select>
          <select className="input w-auto" aria-label="Filter by event type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All event types</option>
            {Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <LoadingBlock /> : <EventsTable events={data?.data} />}
        <Pagination pagination={data?.pagination} onPage={setPage} />
      </div>
    </>
  );
}
