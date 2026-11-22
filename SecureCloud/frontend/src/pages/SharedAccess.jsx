import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Download, FileLock2, ShieldCheck, XCircle } from 'lucide-react';
import { accessShare } from '../api/sharesApi';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import { getApiError } from '../utils/errors';
import { formatBytes, triggerDownload } from '../utils/format';

const DENIED = {
  LINK_REVOKED: 'The owner revoked this link.',
  LINK_EXPIRED: 'This link has expired. Ask the owner for a new one.',
  DOWNLOAD_LIMIT_EXCEEDED: 'This link has reached its download limit.',
  FILE_LOCKED: 'The file is locked by an administrator right now.',
  LINK_BLOCKED: 'A security policy or administrator blocked this link.',
  LINK_PENDING_APPROVAL: 'This link is waiting for administrator approval and cannot be opened yet.',
  LINK_NOT_FOUND: 'This link does not exist. Check that you copied the whole address.',
};

// Public page for share links. It never calls the API on load: every access uses up one download,
// so the person must click the button first.
export default function SharedAccess() {
  const { token } = useParams();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await accessShare(token);
      setResult(data);
      triggerDownload(data.downloadUrl, data.fileName);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setBusy(false);
    }
  };

  const goSignIn = () => {
    logout();
    navigate('/login', { state: { from: { pathname: `/shared/${token}` } } });
  };

  const needsLogin = error && (error.status === 401 || error.code === 'FORBIDDEN');

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-4 py-10">
      <div className="mb-6 flex items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-brand-600" aria-hidden="true" />
        <span className="text-lg font-semibold text-slate-900">SecureCloud</span>
      </div>

      <div className="card w-full max-w-md p-6 text-center">
        {result ? (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden="true" />
            <h1 className="mt-3 text-xl font-semibold">Your download has started</h1>
            <p className="mt-2 break-words text-sm font-medium text-slate-800">{result.fileName}</p>
            <p className="text-sm text-slate-500">{formatBytes(result.size)}</p>
            <p className="mt-3 text-sm text-slate-500">{result.remainingDownloads} download{result.remainingDownloads === 1 ? '' : 's'} left on this link.</p>
            <Button variant="secondary" className="mt-5" icon={Download} onClick={() => triggerDownload(result.downloadUrl, result.fileName)}>
              Download again
            </Button>
            <p className="mt-2 text-xs text-slate-400">Starting it again from this page does not use another download.</p>
          </>
        ) : (
          <>
            {error ? <XCircle className="mx-auto h-10 w-10 text-rose-500" aria-hidden="true" /> : <FileLock2 className="mx-auto h-10 w-10 text-brand-600" aria-hidden="true" />}
            <h1 className="mt-3 text-xl font-semibold">{error ? 'This link cannot be opened' : 'Someone shared a file with you'}</h1>
            {!error && <p className="mt-2 text-sm text-slate-500">The link is protected: it expires and has a download limit. Opening it counts as one download.</p>}
            {error && (
              <p className="mt-2 text-sm text-slate-600" role="alert">
                {needsLogin
                  ? (error.status === 401 ? 'This file was shared with a registered account. Sign in with the invited email to open it.' : 'This file was shared with a different account than the one you are signed in with.')
                  : DENIED[error.code] || error.message}
              </p>
            )}
            <div className="mt-5 flex flex-col items-center gap-2">
              {needsLogin ? (
                <Button onClick={goSignIn}>{user ? 'Sign in with another account' : 'Sign in'}</Button>
              ) : (
                !error && <Button onClick={open} loading={busy} icon={Download}>Download file</Button>
              )}
              {error && !needsLogin && error.code !== 'LINK_NOT_FOUND' && (
                <Button variant="secondary" onClick={open} loading={busy}>Try again</Button>
              )}
            </div>
          </>
        )}
      </div>

      <p className="mt-6 text-sm text-slate-500">
        {user ? <Link to="/" className="text-brand-700 hover:underline">Go to your files</Link> : <Link to="/login" className="text-brand-700 hover:underline">Sign in to SecureCloud</Link>}
      </p>
    </div>
  );
}
