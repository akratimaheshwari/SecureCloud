import { Link } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Ban, CheckSquare, Files, Lock, ShieldAlert } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import { getStats } from '../../api/adminApi';
import { listPendingApprovals } from '../../api/sharesApi';
import { listAllEvents } from '../../api/eventsApi';
import EventsTable from '../../components/EventsTable';
import { ErrorState, LoadingBlock, PageHeader, StatCard } from '../../components/ui/Feedback';
import { CLASSIFICATIONS } from '../../utils/constants';

function ChartCard({ title, children, empty }) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {empty ? <p className="flex h-56 items-center justify-center text-sm text-slate-400">No data yet</p> : <div className="h-56">{children}</div>}
    </section>
  );
}

const shortDate = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

export default function AdminOverview() {
  const stats = useFetch(getStats, []);
  const pending = useFetch(() => listPendingApprovals({ limit: 1 }), []);
  const events = useFetch(() => listAllEvents({ limit: 6 }), []);

  if (stats.error) return <div className="card"><ErrorState error={stats.error} onRetry={stats.reload} /></div>;
  if (stats.loading && !stats.data) return <LoadingBlock />;
  const s = stats.data;
  if (!s) return null;

  const sensitivity = Object.keys(CLASSIFICATIONS).map((k) => ({ key: k, name: CLASSIFICATIONS[k].label, value: s.filesBySensitivity?.[k] || 0, fill: CLASSIFICATIONS[k].hex }));
  const av = s.allowedVsBlocked || {};
  const decisions = [
    { name: 'Allowed', value: av.allowed || 0, fill: '#10b981' },
    { name: 'Pending approval', value: av.pendingApproval || 0, fill: '#3b82f6' },
    { name: 'Blocked', value: av.blocked || 0, fill: '#e11d48' },
  ];
  const timeline = (s.eventsOverTime || []).map((d) => ({ ...d, label: shortDate(d.date) }));
  const downloads = (s.downloadsByUser || []).map((d) => ({ ...d, label: d.name || d.email }));
  const pendingTotal = pending.data?.pagination?.total;

  return (
    <>
      <PageHeader title="Security overview" description="Files, shares and security events across all users." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Total files" value={s.totalFiles} icon={Files} tone="bg-ink-900/5 text-ink-800" />
        <StatCard label="High-risk files" value={s.highRiskFiles} icon={AlertTriangle} tone="bg-orange-50 text-orange-700" hint="Risk score 61 or more" />
        <StatCard label="Blocked shares" value={s.blockedShares} icon={Ban} tone="bg-rose-50 text-rose-700" />
        <StatCard label="Suspicious events" value={s.suspiciousEvents} icon={ShieldAlert} tone="bg-amber-50 text-amber-700" hint="Suspicious downloads, unauthorized access, high-risk uploads" />
        <StatCard label="Locked files" value={s.lockedFiles} icon={Lock} tone="bg-slate-100 text-slate-700" />
        <Link to="/admin/approvals" className="rounded-lg focus-visible:outline-offset-4">
          <StatCard label="Waiting for approval" value={pendingTotal} icon={CheckSquare} tone="bg-blue-50 text-blue-700" hint="Review shares" />
        </Link>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ChartCard title="Security events, last 14 days" empty={timeline.every((d) => d.count === 0)}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timeline} margin={{ left: -20, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
              <Tooltip />
              <Area type="monotone" dataKey="count" name="Events" stroke="#0b7a6a" strokeWidth={2} fill="#12a08c" fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Files by classification" empty={sensitivity.every((d) => d.value === 0)}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sensitivity} margin={{ left: -20, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: '#f1f5f9' }} />
              <Bar dataKey="value" name="Files" radius={[4, 4, 0, 0]}>
                {sensitivity.map((d) => <Cell key={d.key} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Share decisions" empty={decisions.every((d) => d.value === 0)}>
          <div className="flex h-full items-center">
            <ResponsiveContainer width="55%" height="100%">
              <PieChart>
                <Pie data={decisions.filter((d) => d.value > 0)} dataKey="value" nameKey="name" innerRadius={42} outerRadius={78} paddingAngle={2} stroke="none">
                  {decisions.filter((d) => d.value > 0).map((d) => <Cell key={d.name} fill={d.fill} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <ul className="flex-1 space-y-2 text-sm">
              {decisions.map((d) => (
                <li key={d.name} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.fill }} aria-hidden="true" />{d.name}</span>
                  <span className="tabular-nums text-slate-900">{d.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </ChartCard>

        <ChartCard title="Top downloaders, last 14 days" empty={downloads.length === 0}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={downloads} layout="vertical" margin={{ left: 8, right: 16, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="label" width={90} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: '#f1f5f9' }} />
              <Bar dataKey="downloads" name="Downloads" fill="#1f3363" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <section className="card mt-6">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold">Latest security events</h2>
          <Link to="/admin/events" className="text-sm font-medium text-brand-700 hover:underline">View all</Link>
        </div>
        {events.loading && !events.data ? <LoadingBlock /> : events.error ? <ErrorState error={events.error} onRetry={events.reload} /> : <EventsTable events={events.data?.data} showUser linkFiles />}
      </section>
    </>
  );
}
