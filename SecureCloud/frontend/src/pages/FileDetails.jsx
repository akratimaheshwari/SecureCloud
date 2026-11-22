import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Lock, LockOpen, ShieldCheck, Share2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import useFetch from '../hooks/useFetch';
import { deleteFile, getDownloadUrl, getFile, lockFile, releaseFile, unlockFile } from '../api/filesApi';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { ClassificationBadge, SeverityBadge, StatusBadge } from '../components/ui/Badges';
import { ErrorState, LoadingBlock } from '../components/ui/Feedback';
import { RiskMeter } from '../components/RiskPanel';
import ShareDialog from '../components/ShareDialog';
import { dlpLabel, FILE_STATUSES } from '../utils/constants';
import { errorMessage } from '../utils/errors';
import { formatBytes, formatDate, idOf, triggerDownload } from '../utils/format';

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-right text-slate-900">{children}</dd>
    </div>
  );
}

export default function FileDetails() {
  const { id } = useParams();
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useFetch(() => getFile(id), [id]);
  const [dialog, setDialog] = useState(null); // 'share' | 'delete' | 'lock' | 'release'
  const [busy, setBusy] = useState(false);

  const file = data?.file;
  const dlp = data?.dlpResult;

  // Refresh quietly while the scan is still running
  const scanning = file && (file.status === 'SCANNING' || file.status === 'UPLOADING');
  useEffect(() => {
    if (!scanning) return undefined;
    const t = setInterval(() => { if (document.visibilityState === 'visible') reload(true); }, 5000);
    return () => clearInterval(t);
  }, [scanning, reload]);

  if (error) return <div className="card"><ErrorState error={error} onRetry={reload} /></div>;
  if (loading && !data) return <LoadingBlock />;
  if (!file) return null;

  const isOwner = String(idOf(file.ownerId)) === String(user?._id);
  const classified = !scanning;
  const counts = dlp?.matchCounts && typeof dlp.matchCounts === 'object' ? Object.entries(dlp.matchCounts) : [];
  const findings = counts.length ? counts : (dlp?.detectedTypes || []).map((t) => [t, null]);
  const canDownload = isOwner && !['UPLOADING', 'SCANNING', 'LOCKED', 'QUARANTINED'].includes(file.status);

  const act = (fn, success) => async (...args) => {
    try {
      await fn(...args);
      if (success) toast.success(success);
      reload(true);
    } catch (err) {
      toast.error(errorMessage(err));
      throw err;
    }
  };

  const download = async () => {
    setBusy(true);
    try {
      const { downloadUrl, fileName } = await getDownloadUrl(file.id);
      triggerDownload(downloadUrl, fileName);
    } catch (err) {
      toast.error(errorMessage(err));
      reload(true); // a locked file changes status
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => (isOwner ? navigate('/files') : navigate(-1))} className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-semibold">{file.originalName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge value={file.status} />
            {classified && <ClassificationBadge value={file.classification} />}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isOwner && <Button variant="secondary" icon={Download} onClick={download} loading={busy} disabled={!canDownload} title={canDownload ? undefined : FILE_STATUSES[file.status]?.hint}>Download</Button>}
          {isOwner && <Button variant="secondary" icon={Share2} onClick={() => setDialog('share')} disabled={file.status !== 'ACTIVE'} title={file.status === 'ACTIVE' ? undefined : FILE_STATUSES[file.status]?.hint}>Share</Button>}
          {(isOwner || isAdmin) && <Button variant="secondary" icon={Trash2} onClick={() => setDialog('delete')} className="text-rose-700!">Delete</Button>}
        </div>
      </div>

      {file.warning && <p className="mb-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">{file.warning}</p>}
      {file.status === 'LOCKED' && (
        <p className="mb-4 rounded-md bg-slate-800 px-4 py-3 text-sm text-white">
          This file is locked by an administrator{file.lockReason ? `: ${file.lockReason}` : '.'}
        </p>
      )}
      {file.status === 'QUARANTINED' && <p className="mb-4 rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-800">The scan found critical content, so this file is held for an administrator security review. It cannot be downloaded or shared until then.</p>}
      {file.status === 'RESTRICTED' && <p className="mb-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">This file contains high-severity content (or its format could not be scanned). Only you can download it and sharing is blocked.</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-1 font-semibold">File details</h2>
          <dl className="divide-y divide-slate-100">
            <Row label="Size">{formatBytes(file.size)}</Row>
            <Row label="Type">{file.mimeType || '-'}</Row>
            <Row label="Uploaded">{formatDate(file.createdAt)}</Row>
            <Row label="Last changed">{formatDate(file.updatedAt)}</Row>
            {file.sha256Hash && <Row label="SHA-256"><span className="font-mono text-xs">{file.sha256Hash.slice(0, 16)}...</span></Row>}
            {file.reviewedAt && <Row label="Reviewed">{formatDate(file.reviewedAt)}</Row>}
          </dl>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 font-semibold">Risk</h2>
          {classified ? (
            <>
              <RiskMeter score={file.riskScore} />
              <p className="mt-3 text-xs text-slate-500">The score rises with sensitive content, higher classification and, when sharing, external or unregistered recipients. The reasons for each share are shown when you create the link.</p>
            </>
          ) : (
            <p className="text-sm text-slate-500">The risk score appears when the scan finishes. This page refreshes on its own.</p>
          )}
        </section>

        <section className="card p-5 lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Scan findings</h2>
            {dlp?.severity && dlp.scanStatus === 'COMPLETED' && <SeverityBadge value={dlp.severity} />}
          </div>
          {!dlp || dlp.scanStatus === 'PENDING' ? (
            <p className="text-sm text-slate-500">The DLP scan has not reported yet.</p>
          ) : dlp.scanStatus === 'FAILED' ? (
            <p className="text-sm text-rose-700">The scan failed, so the file stays on hold. An administrator can retry it.</p>
          ) : dlp.scanStatus === 'UNSUPPORTED' ? (
            <p className="text-sm text-amber-700">This file format cannot be scanned, so it is restricted until an administrator reviews it.</p>
          ) : findings.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-emerald-700"><ShieldCheck className="h-4 w-4" aria-hidden="true" /> No sensitive data was found.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {findings.map(([type, count]) => (
                <li key={type} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
                  <span className="text-sm text-slate-700">{dlpLabel(type)}</span>
                  {count !== null && <span className="text-sm font-semibold tabular-nums text-slate-900">{count}</span>}
                </li>
              ))}
            </ul>
          )}
          {dlp?.scannedAt && <p className="mt-3 text-xs text-slate-400">Scanned {formatDate(dlp.scannedAt)}</p>}
        </section>

        {isAdmin && (
          <section className="card p-5 lg:col-span-2">
            <h2 className="mb-1 font-semibold">Administrator actions</h2>
            <p className="mb-4 text-sm text-slate-500">Locking blocks downloads and share links until you unlock the file. Releasing a quarantined file makes it restricted, never active.</p>
            <div className="flex flex-wrap gap-2">
              {file.status === 'LOCKED' ? (
                <Button variant="secondary" icon={LockOpen} onClick={act(() => unlockFile(file.id), 'File unlocked.')}>Unlock file</Button>
              ) : (
                <Button variant="secondary" icon={Lock} onClick={() => setDialog('lock')} disabled={['UPLOADING', 'DELETED'].includes(file.status)}>Lock file</Button>
              )}
              {file.status === 'QUARANTINED' && <Button icon={ShieldCheck} onClick={() => setDialog('release')}>Release from quarantine</Button>}
            </div>
          </section>
        )}
      </div>

      <ShareDialog open={dialog === 'share'} file={file} onClose={() => setDialog(null)} />
      <ConfirmDialog
        open={dialog === 'delete'} danger title="Delete this file?" confirmLabel="Delete file"
        message="The file is removed from storage and open share links are revoked. This cannot be undone."
        onConfirm={async () => { try { await deleteFile(file.id); toast.success('File deleted.'); navigate(isOwner ? '/files' : '/admin', { replace: true }); } catch (err) { toast.error(errorMessage(err)); throw err; } }}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === 'lock'} askReason title="Lock this file?" confirmLabel="Lock file"
        message="The owner and anyone with a share link will not be able to download it."
        onConfirm={(reason) => act(() => lockFile(file.id, reason), 'File locked.')()}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === 'release'} askReason reasonLabel="Review note (optional)" title="Release from quarantine?" confirmLabel="Release file"
        message="After release the file becomes restricted: only the owner can download it and sharing stays blocked."
        onConfirm={(note) => act(() => releaseFile(file.id, note), 'File released from quarantine.')()}
        onClose={() => setDialog(null)}
      />
    </>
  );
}
