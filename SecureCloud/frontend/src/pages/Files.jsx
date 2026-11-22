import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Eye, FileText, Search, Share2, Trash2, UploadCloud } from 'lucide-react';
import toast from 'react-hot-toast';
import useFetch from '../hooks/useFetch';
import useDebounce from '../hooks/useDebounce';
import { deleteFile, getDownloadUrl, listFiles } from '../api/filesApi';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Pagination from '../components/ui/Pagination';
import { ClassificationBadge, StatusBadge } from '../components/ui/Badges';
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from '../components/ui/Feedback';
import { RiskMeter } from '../components/RiskPanel';
import UploadDialog from '../components/UploadDialog';
import ShareDialog from '../components/ShareDialog';
import { CLASSIFICATIONS, FILE_STATUSES } from '../utils/constants';
import { errorMessage } from '../utils/errors';
import { formatBytes, formatDate, triggerDownload } from '../utils/format';

const FILTER_STATUSES = ['ACTIVE', 'SCANNING', 'RESTRICTED', 'QUARANTINED', 'LOCKED'];
const iconBtn = 'inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent';

export default function Files() {
  const [search, setSearch] = useState('');
  const [classification, setClassification] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [shareFile, setShareFile] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const q = useDebounce(search.trim());

  useEffect(() => { setPage(1); }, [q, classification, status]);

  const { data, loading, error, reload } = useFetch(
    () => listFiles({ page, limit: 15, ...(q && { q }), ...(classification && { classification }), ...(status && { status }) }),
    [page, q, classification, status]
  );
  const files = data?.data || [];

  // While a scan is running, refresh quietly until the DLP result arrives
  const scanning = files.some((f) => f.status === 'SCANNING' || f.status === 'UPLOADING');
  useEffect(() => {
    if (!scanning) return undefined;
    const t = setInterval(() => { if (document.visibilityState === 'visible') reload(true); }, 6000);
    return () => clearInterval(t);
  }, [scanning, reload]);

  const download = async (f) => {
    setBusyId(f.id);
    try {
      const { downloadUrl, fileName } = await getDownloadUrl(f.id);
      triggerDownload(downloadUrl, fileName);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async () => {
    try {
      const res = await deleteFile(toDelete.id);
      toast.success(res.linksRevoked ? `File deleted. ${res.linksRevoked} share link${res.linksRevoked === 1 ? '' : 's'} revoked.` : 'File deleted.');
      reload(true);
    } catch (err) {
      toast.error(errorMessage(err));
      throw err;
    }
  };

  const canDownload = (f) => !['UPLOADING', 'SCANNING', 'LOCKED', 'QUARANTINED'].includes(f.status);

  return (
    <>
      <PageHeader
        title="My files"
        description="Every file is encrypted, scanned and classified before you can share it."
        actions={<Button icon={UploadCloud} onClick={() => setUploadOpen(true)}>Upload files</Button>}
      />

      <div className="card">
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input className="input pl-9" placeholder="Search by file name" aria-label="Search files" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input w-auto" aria-label="Filter by classification" value={classification} onChange={(e) => setClassification(e.target.value)}>
            <option value="">All classifications</option>
            {Object.entries(CLASSIFICATIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="input w-auto" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {FILTER_STATUSES.map((s) => <option key={s} value={s}>{FILE_STATUSES[s].label}</option>)}
          </select>
        </div>

        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading && !data ? (
          <LoadingBlock />
        ) : files.length === 0 ? (
          <EmptyState icon={FileText} title={q || classification || status ? 'No files match these filters' : 'No files yet'} action={!(q || classification || status) && <Button icon={UploadCloud} onClick={() => setUploadOpen(true)}>Upload files</Button>}>
            {q || classification || status ? 'Try a different search or clear the filters.' : 'Upload a file to see its classification and risk score.'}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Name</th>
                  <th className="th">Classification</th>
                  <th className="th">Status</th>
                  <th className="th w-40">Risk</th>
                  <th className="th">Uploaded</th>
                  <th className="th"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {files.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50/60">
                    <td className="td max-w-xs">
                      <Link to={`/files/${f.id}`} className="block truncate font-medium text-slate-900 hover:text-brand-700">{f.originalName}</Link>
                      <p className="text-xs text-slate-500">{formatBytes(f.size)}</p>
                    </td>
                    <td className="td">{f.status === 'SCANNING' || f.status === 'UPLOADING' ? <span className="text-xs text-slate-400">Pending scan</span> : <ClassificationBadge value={f.classification} />}</td>
                    <td className="td"><StatusBadge value={f.status} /></td>
                    <td className="td">{f.status === 'SCANNING' || f.status === 'UPLOADING' ? <span className="text-xs text-slate-400">-</span> : <RiskMeter score={f.riskScore} showLabel={false} />}{f.status !== 'SCANNING' && f.status !== 'UPLOADING' && <p className="mt-1 text-xs tabular-nums text-slate-500">{f.riskScore ?? 0} / 100</p>}</td>
                    <td className="td whitespace-nowrap text-slate-500">{formatDate(f.createdAt)}</td>
                    <td className="td">
                      <div className="flex justify-end gap-0.5">
                        <Link to={`/files/${f.id}`} className={iconBtn} aria-label={`View details of ${f.originalName}`} title="Details"><Eye className="h-4 w-4" /></Link>
                        <button type="button" className={iconBtn} disabled={!canDownload(f) || busyId === f.id} onClick={() => download(f)} aria-label={`Download ${f.originalName}`} title={canDownload(f) ? 'Download' : FILE_STATUSES[f.status]?.hint}><Download className="h-4 w-4" /></button>
                        <button type="button" className={iconBtn} disabled={f.status !== 'ACTIVE'} onClick={() => setShareFile(f)} aria-label={`Share ${f.originalName}`} title={f.status === 'ACTIVE' ? 'Share' : FILE_STATUSES[f.status]?.hint}><Share2 className="h-4 w-4" /></button>
                        <button type="button" className={`${iconBtn} hover:bg-rose-50! hover:text-rose-600!`} onClick={() => setToDelete(f)} aria-label={`Delete ${f.originalName}`} title="Delete"><Trash2 className="h-4 w-4" /></button>
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

      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={() => { setPage(1); reload(true); }} />
      <ShareDialog open={Boolean(shareFile)} file={shareFile} onClose={() => setShareFile(null)} />
      <ConfirmDialog
        open={Boolean(toDelete)}
        danger
        title="Delete this file?"
        message={toDelete ? `${toDelete.originalName} will be removed from storage and any open share links for it will be revoked. This cannot be undone.` : ''}
        confirmLabel="Delete file"
        onConfirm={remove}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}
