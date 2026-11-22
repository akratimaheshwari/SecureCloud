import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { AlertTriangle, FileText, Files, ScanSearch, ShieldAlert, UploadCloud } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import useFetch from '../hooks/useFetch';
import { listFiles } from '../api/filesApi';
import { listMyEvents } from '../api/eventsApi';
import Button from '../components/ui/Button';
import { ClassificationBadge, SeverityBadge, StatusBadge } from '../components/ui/Badges';
import { EmptyState, ErrorState, LoadingBlock, PageHeader, StatCard } from '../components/ui/Feedback';
import UploadDialog from '../components/UploadDialog';
import { CLASSIFICATIONS, eventLabel } from '../utils/constants';
import { formatBytes, timeAgo } from '../utils/format';

export default function Dashboard() {
  const { user } = useAuth();
  const [uploadOpen, setUploadOpen] = useState(false);
  const files = useFetch(() => listFiles({ limit: 100 }), []);
  const events = useFetch(() => listMyEvents({ limit: 5 }), []);

  const stats = useMemo(() => {
    const list = files.data?.data || [];
    const byClass = Object.keys(CLASSIFICATIONS).map((key) => ({
      key, name: CLASSIFICATIONS[key].label, value: list.filter((f) => f.classification === key && f.status !== 'SCANNING' && f.status !== 'UPLOADING').length, fill: CLASSIFICATIONS[key].hex,
    }));
    return {
      list,
      byClass,
      scanning: list.filter((f) => f.status === 'SCANNING').length,
      sensitive: list.filter((f) => (CLASSIFICATIONS[f.classification]?.rank ?? 0) >= 2 && f.status !== 'SCANNING').length,
      attention: list.filter((f) => ['RESTRICTED', 'QUARANTINED', 'LOCKED'].includes(f.status)),
      classified: byClass.reduce((n, c) => n + c.value, 0),
    };
  }, [files.data]);

  const total = files.data?.pagination?.total ?? 0;
  const firstName = (user?.name || '').split(' ')[0];

  return (
    <>
      <PageHeader
        title={`Welcome back${firstName ? `, ${firstName}` : ''}`}
        description="Your files, what the scanner found in them and what needs a look."
        actions={<Button icon={UploadCloud} onClick={() => setUploadOpen(true)}>Upload files</Button>}
      />

      {files.error ? (
        <div className="card"><ErrorState error={files.error} onRetry={files.reload} /></div>
      ) : files.loading && !files.data ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Files" value={total} icon={Files} tone="bg-ink-900/5 text-ink-800" />
            <StatCard label="Sensitive files" value={stats.sensitive} icon={ShieldAlert} tone="bg-amber-50 text-amber-700" hint="Confidential or higher" />
            <StatCard label="Being scanned" value={stats.scanning} icon={ScanSearch} tone="bg-blue-50 text-blue-700" />
            <StatCard label="Need attention" value={stats.attention.length} icon={AlertTriangle} tone="bg-rose-50 text-rose-700" hint="Restricted, quarantined or locked" />
          </div>
          {total > 100 && <p className="-mt-3 text-xs text-slate-400">Counts use your 100 most recent files.</p>}

          <div className="grid gap-6 lg:grid-cols-3">
            <section className="card lg:col-span-2">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <h2 className="font-semibold">Recent files</h2>
                <Link to="/files" className="text-sm font-medium text-brand-700 hover:underline">View all</Link>
              </div>
              {stats.list.length === 0 ? (
                <EmptyState icon={FileText} title="No files yet" action={<Button icon={UploadCloud} onClick={() => setUploadOpen(true)}>Upload your first file</Button>}>
                  Uploaded files are encrypted, scanned and classified automatically.
                </EmptyState>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {stats.list.slice(0, 6).map((f) => (
                    <li key={f.id}>
                      <Link to={`/files/${f.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">{f.originalName}</p>
                          <p className="text-xs text-slate-500">{formatBytes(f.size)} uploaded {timeAgo(f.createdAt)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {f.status === 'ACTIVE' ? <ClassificationBadge value={f.classification} /> : <StatusBadge value={f.status} />}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card">
              <div className="border-b border-slate-200 px-4 py-3"><h2 className="font-semibold">Files by classification</h2></div>
              {stats.classified === 0 ? (
                <EmptyState title="Nothing classified yet">Classifications appear after the first scan finishes.</EmptyState>
              ) : (
                <div className="p-4">
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={stats.byClass.filter((c) => c.value > 0)} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2} stroke="none">
                          {stats.byClass.filter((c) => c.value > 0).map((c) => <Cell key={c.key} fill={c.fill} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {stats.byClass.map((c) => (
                      <li key={c.key} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.fill }} aria-hidden="true" />{c.name}</span>
                        <span className="tabular-nums text-slate-900">{c.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </div>

          {stats.attention.length > 0 && (
            <section className="card border-amber-200">
              <div className="border-b border-amber-100 bg-amber-50 px-4 py-3 rounded-t-lg"><h2 className="font-semibold text-amber-900">Files that need attention</h2></div>
              <ul className="divide-y divide-slate-100">
                {stats.attention.map((f) => (
                  <li key={f.id}>
                    <Link to={`/files/${f.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                      <span className="truncate text-sm font-medium text-slate-900">{f.originalName}</span>
                      <StatusBadge value={f.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="font-semibold">Recent security events</h2>
              <Link to="/activity" className="text-sm font-medium text-brand-700 hover:underline">View all</Link>
            </div>
            {events.loading && !events.data ? <LoadingBlock /> : events.error ? <ErrorState error={events.error} onRetry={events.reload} /> : (events.data?.data || []).length === 0 ? (
              <EmptyState title="No security events">Blocked shares, failed sign-ins and other flagged actions on your account show up here.</EmptyState>
            ) : (
              <ul className="divide-y divide-slate-100">
                {events.data.data.map((ev) => (
                  <li key={ev._id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{eventLabel(ev.eventType)}</p>
                      <p className="truncate text-xs text-slate-500">{ev.fileId?.originalName ? `${ev.fileId.originalName}, ` : ''}{timeAgo(ev.createdAt)}</p>
                    </div>
                    <SeverityBadge value={ev.severity} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={() => files.reload(true)} />
    </>
  );
}
