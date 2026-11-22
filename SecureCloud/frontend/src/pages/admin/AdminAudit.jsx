import { useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import { listAudit } from '../../api/eventsApi';
import Pagination from '../../components/ui/Pagination';
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from '../../components/ui/Feedback';
import { formatDate } from '../../utils/format';
import { dayEnd, dayStart } from './AdminEvents';

const ACTIONS = ['REGISTER', 'LOGIN', 'LOGIN_FAILED', 'UPLOAD_URL_CREATE', 'UPLOAD', 'UPLOAD_REJECTED', 'DOWNLOAD', 'FILE_DELETE', 'FILE_LOCK', 'FILE_UNLOCK',
  'SHARE_CREATE', 'SHARE_BLOCKED', 'SHARE_REVOKE', 'SHARE_APPROVED', 'SHARE_REJECTED', 'LINK_ACCESS_DENIED', 'ACCESS_DENIED', 'DLP_SCAN_RESULT', 'SUSPICIOUS_ACTIVITY', 'ROLE_CHANGE'];

const label = (a) => a.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export default function AdminAudit() {
  const [f, setF] = useState({ action: '', targetType: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const { data, loading, error, reload } = useFetch(() => listAudit({
    page, limit: 20,
    ...(f.action && { action: f.action }),
    ...(f.targetType && { targetType: f.targetType }),
    ...(f.from && { from: dayStart(f.from) }),
    ...(f.to && { to: dayEnd(f.to) }),
  }), [page, f]);
  const rows = data?.data || [];

  useEffect(() => { setPage(1); }, [f]);

  return (
    <>
      <PageHeader title="Audit log" description="A record of who did what, from where. Entries cannot be edited." />
      <div className="card">
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-4">
          <select className="input w-auto" aria-label="Action" value={f.action} onChange={set('action')}>
            <option value="">All actions</option>
            {ACTIONS.map((a) => <option key={a} value={a}>{label(a)}</option>)}
          </select>
          <select className="input w-auto" aria-label="Target type" value={f.targetType} onChange={set('targetType')}>
            <option value="">All targets</option>
            <option value="File">Files</option>
            <option value="SharingLink">Share links</option>
            <option value="User">Users</option>
          </select>
          <label className="text-xs text-slate-500">From<input type="date" className="input mt-1" value={f.from} max={f.to || undefined} onChange={set('from')} /></label>
          <label className="text-xs text-slate-500">To<input type="date" className="input mt-1" value={f.to} min={f.from || undefined} onChange={set('to')} /></label>
        </div>

        {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <LoadingBlock /> : rows.length === 0 ? (
          <EmptyState icon={ScrollText} title="No audit entries">Nothing matches these filters.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr><th className="th">When</th><th className="th">Action</th><th className="th">User</th><th className="th">Target</th><th className="th">IP address</th><th className="th">Details</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r._id} className="align-top">
                    <td className="td whitespace-nowrap text-slate-500">{formatDate(r.createdAt)}</td>
                    <td className="td font-medium text-slate-900">{label(r.action)}</td>
                    <td className="td">{r.userId && typeof r.userId === 'object' ? <><p>{r.userId.name}</p><p className="text-xs text-slate-500">{r.userId.email}</p></> : <span className="text-slate-400">System</span>}</td>
                    <td className="td">{r.targetType ? <><p>{r.targetType}</p><p className="font-mono text-xs text-slate-400">{String(r.targetId || '').slice(-8)}</p></> : '-'}</td>
                    <td className="td whitespace-nowrap font-mono text-xs">{r.ipAddress || '-'}</td>
                    <td className="td max-w-xs">
                      {r.metadata && Object.keys(r.metadata).length > 0 ? (
                        <details>
                          <summary className="cursor-pointer text-xs text-brand-700">Show details</summary>
                          <dl className="mt-1 space-y-0.5 text-xs">
                            {Object.entries(r.metadata).map(([k, v]) => (
                              <div key={k} className="flex gap-2"><dt className="shrink-0 text-slate-500">{k}</dt><dd className="break-all text-slate-800">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd></div>
                            ))}
                          </dl>
                        </details>
                      ) : <span className="text-slate-400">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination pagination={data?.pagination} onPage={setPage} />
      </div>
    </>
  );
}
