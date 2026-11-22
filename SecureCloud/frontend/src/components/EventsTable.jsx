import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { SeverityBadge } from './ui/Badges';
import { EmptyState } from './ui/Feedback';
import { eventLabel } from '../utils/constants';
import { formatDate, idOf } from '../utils/format';

// Shared by "My activity", the admin events page and dashboards.
export default function EventsTable({ events = [], showUser = false, linkFiles = false }) {
  if (!events.length) {
    return <EmptyState icon={ShieldCheck} title="No security events">Nothing matches these filters. Events appear here when a policy blocks, warns or flags an action.</EmptyState>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th className="th">When</th>
            <th className="th">Event</th>
            <th className="th">Severity</th>
            {showUser && <th className="th">User</th>}
            <th className="th">File</th>
            <th className="th">Risk</th>
            <th className="th">Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {events.map((ev) => {
            const file = ev.fileId && typeof ev.fileId === 'object' ? ev.fileId : null;
            return (
              <tr key={ev._id} className="align-top">
                <td className="td whitespace-nowrap text-slate-500">{formatDate(ev.createdAt)}</td>
                <td className="td">
                  <p className="font-medium text-slate-900">{eventLabel(ev.eventType)}</p>
                  {ev.actionTaken && <p className="text-xs text-slate-500">{ev.actionTaken}</p>}
                </td>
                <td className="td"><SeverityBadge value={ev.severity} /></td>
                {showUser && (
                  <td className="td">
                    {ev.userId && typeof ev.userId === 'object' ? (
                      <>
                        <p className="text-slate-900">{ev.userId.name}</p>
                        <p className="text-xs text-slate-500">{ev.userId.email}</p>
                      </>
                    ) : <span className="text-slate-400">Unknown</span>}
                  </td>
                )}
                <td className="td max-w-[14rem]">
                  {file ? (
                    linkFiles
                      ? <Link to={`/files/${idOf(file)}`} className="block truncate font-medium text-brand-700 hover:underline">{file.originalName}</Link>
                      : <span className="block truncate">{file.originalName}</span>
                  ) : <span className="text-slate-400">-</span>}
                </td>
                <td className="td tabular-nums">{typeof ev.riskScore === 'number' ? ev.riskScore : '-'}</td>
                <td className="td max-w-xs">
                  <p className="line-clamp-2 text-xs text-slate-600" title={ev.reason}>{ev.reason || '-'}</p>
                  {ev.resolved && <p className="mt-1 text-xs text-emerald-700">Resolved</p>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
