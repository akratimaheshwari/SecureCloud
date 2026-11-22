import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, CheckSquare, X } from 'lucide-react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import { approveShare, listPendingApprovals, rejectShare } from '../../api/sharesApi';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Pagination from '../../components/ui/Pagination';
import { ClassificationBadge } from '../../components/ui/Badges';
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from '../../components/ui/Feedback';
import { RiskMeter } from '../../components/RiskPanel';
import { errorMessage } from '../../utils/errors';
import { formatDate, timeAgo } from '../../utils/format';

export default function AdminApprovals() {
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState(null);
  const [toReject, setToReject] = useState(null);
  const { data, loading, error, reload } = useFetch(() => listPendingApprovals({ page, limit: 15 }), [page]);
  const links = data?.data || [];

  const approve = async (l) => {
    setBusyId(l.id);
    try {
      const res = await approveShare(l.id);
      toast.success(`Approved. The link is active (risk now ${res.riskScore}).`);
      reload(true);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (reason) => {
    try {
      await rejectShare(toReject.id, reason);
      toast.success('Share rejected and recorded as a blocked share.');
      reload(true);
    } catch (err) {
      toast.error(errorMessage(err));
      throw err;
    }
  };

  return (
    <>
      <PageHeader title="Approvals" description="Shares that policy sent to an administrator, oldest first. Approving creates the link; rejecting blocks it." />
      <div className="card">
        {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <LoadingBlock /> : links.length === 0 ? (
          <EmptyState icon={CheckSquare} title="Nothing waiting for approval">Shares that need a decision appear here.</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {links.map((l) => (
              <li key={l.id} className="grid gap-4 px-4 py-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {l.file ? <Link to={`/files/${l.file.id}`} className="truncate font-medium text-slate-900 hover:text-brand-700">{l.file.name}</Link> : <span className="font-medium">File</span>}
                    {l.file && <ClassificationBadge value={l.file.classification} />}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {l.createdBy?.name || 'A user'} wants to share it with <span className="break-all font-medium">{l.recipientEmail}</span> ({l.isExternal ? 'external' : 'internal'}).
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">Requested {timeAgo(l.createdAt)} ({formatDate(l.createdAt)}). Up to {l.maxDownloads} downloads, valid until {formatDate(l.expiresAt)} once approved.</p>
                </div>
                <RiskMeter score={l.riskScoreAtShare} />
                <div className="flex gap-2">
                  <Button size="sm" icon={Check} loading={busyId === l.id} onClick={() => approve(l)}>Approve</Button>
                  <Button size="sm" variant="secondary" icon={X} disabled={busyId === l.id} onClick={() => setToReject(l)}>Reject</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Pagination pagination={data?.pagination} onPage={setPage} />
      </div>

      <ConfirmDialog
        open={Boolean(toReject)} danger askReason title="Reject this share?" confirmLabel="Reject share"
        message={toReject ? `${toReject.recipientEmail} will not receive access to ${toReject.file?.name || 'the file'}.` : ''}
        reasonLabel="Reason (optional, recorded in the audit log)"
        onConfirm={reject} onClose={() => setToReject(null)}
      />
    </>
  );
}
