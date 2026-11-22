import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Inbox } from 'lucide-react';
import useFetch from '../hooks/useFetch';
import { listSharedWithMe } from '../api/sharesApi';
import Pagination from '../components/ui/Pagination';
import { ClassificationBadge } from '../components/ui/Badges';
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from '../components/ui/Feedback';
import { formatDate, timeUntil } from '../utils/format';

export default function SharedWithMe() {
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useFetch(() => listSharedWithMe({ page, limit: 15 }), [page]);
  const links = data?.data || [];

  return (
    <>
      <PageHeader title="Shared with me" description="Files other people shared with your email address. Each download uses one of the link's allowed downloads." />
      <div className="card">
        {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <LoadingBlock /> : links.length === 0 ? (
          <EmptyState icon={Inbox} title="Nothing shared with you yet">Active links addressed to your email appear here.</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {links.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-4 px-4 py-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{l.file?.name || 'File'}</p>
                  <p className="mt-0.5 text-sm text-slate-500">From {l.createdBy?.name || 'unknown'} ({l.createdBy?.email}). Shared {formatDate(l.createdAt, { time: false })}.</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    {l.file && <ClassificationBadge value={l.file.classification} />}
                    <span>{timeUntil(l.expiresAt)}</span>
                    <span>{l.remainingDownloads} download{l.remainingDownloads === 1 ? '' : 's'} left</span>
                  </div>
                </div>
                {l.token ? (
                  <Link to={`/shared/${l.token}`} className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700">
                    <Download className="h-4 w-4" aria-hidden="true" /> Open
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <Pagination pagination={data?.pagination} onPage={setPage} />
      </div>
    </>
  );
}
