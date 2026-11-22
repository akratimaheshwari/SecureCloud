import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import useFetch from '../hooks/useFetch';
import { listMyShares, revokeShare } from '../api/sharesApi';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Pagination from '../components/ui/Pagination';
import { ClassificationBadge, DecisionBadge, LinkStatusBadge } from '../components/ui/Badges';
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from '../components/ui/Feedback';
import { LINK_STATUSES } from '../utils/constants';
import { errorMessage } from '../utils/errors';
import { copyText, formatDate, timeUntil } from '../utils/format';

export default function SharedByMe() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [toRevoke, setToRevoke] = useState(null);
  const { data, loading, error, reload } = useFetch(() => listMyShares({ page, limit: 15, ...(status && { status }) }), [page, status]);
  const links = data?.data || [];

  useEffect(() => { setPage(1); }, [status]);

  const copy = async (url) => {
    if (await copyText(url)) toast.success('Link copied.');
    else toast.error('Could not copy. Open the file and copy the link manually.');
  };

  const revoke = async () => {
    try {
      await revokeShare(toRevoke.id);
      toast.success('Link revoked.');
      reload(true);
    } catch (err) {
      toast.error(errorMessage(err));
      throw err;
    }
  };

  return (
    <>
      <PageHeader title="Shared by me" description="Links you created. Revoke a link at any time to stop further downloads." />
      <div className="card">
        <div className="flex gap-3 border-b border-slate-200 p-4">
          <select className="input w-auto" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {Object.entries(LINK_STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <LoadingBlock /> : links.length === 0 ? (
          <EmptyState icon={Send} title="No shared links">Open a file and choose Share to create one.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">File</th>
                  <th className="th">Recipient</th>
                  <th className="th">Policy decision</th>
                  <th className="th">Status</th>
                  <th className="th">Downloads</th>
                  <th className="th">Expires</th>
                  <th className="th"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {links.map((l) => (
                  <tr key={l.id}>
                    <td className="td max-w-[14rem]">
                      {l.file ? <Link to={`/files/${l.file.id}`} className="block truncate font-medium text-slate-900 hover:text-brand-700">{l.file.name}</Link> : '-'}
                      {l.file && <div className="mt-1"><ClassificationBadge value={l.file.classification} /></div>}
                    </td>
                    <td className="td">
                      <p className="break-all">{l.recipientEmail}</p>
                      <p className="text-xs text-slate-500">{l.isExternal ? 'External' : 'Internal'}</p>
                    </td>
                    <td className="td"><DecisionBadge value={l.policyDecision} /><p className="mt-1 text-xs tabular-nums text-slate-500">Risk {l.riskScoreAtShare ?? 0}</p></td>
                    <td className="td"><LinkStatusBadge value={l.status} /></td>
                    <td className="td tabular-nums">{l.downloadCount} / {l.maxDownloads}</td>
                    <td className="td whitespace-nowrap">
                      <p>{l.status === 'ACTIVE' ? timeUntil(l.expiresAt) : '-'}</p>
                      <p className="text-xs text-slate-500">{formatDate(l.expiresAt)}</p>
                    </td>
                    <td className="td">
                      <div className="flex justify-end gap-2">
                        {l.url && <Button size="sm" variant="secondary" icon={Copy} onClick={() => copy(l.url)}>Copy link</Button>}
                        {['ACTIVE', 'PENDING_APPROVAL'].includes(l.status) && <Button size="sm" variant="ghost" className="text-rose-700!" onClick={() => setToRevoke(l)}>Revoke</Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination pagination={data?.pagination} onPage={setPage} />
      </div>

      <ConfirmDialog
        open={Boolean(toRevoke)} danger title="Revoke this link?" confirmLabel="Revoke link"
        message={toRevoke ? `${toRevoke.recipientEmail} will no longer be able to download ${toRevoke.file?.name || 'the file'} with this link.` : ''}
        onConfirm={revoke} onClose={() => setToRevoke(null)}
      />
    </>
  );
}
