import { useState } from 'react';
import { Check, Copy, Link2, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from './ui/Modal';
import Button from './ui/Button';
import { DecisionBadge } from './ui/Badges';
import { RiskBreakdown, RiskMeter } from './RiskPanel';
import { createShare } from '../api/sharesApi';
import { getApiError } from '../utils/errors';
import { copyText, formatDate } from '../utils/format';

const EXPIRY = [
  { value: 1, label: '1 hour' },
  { value: 6, label: '6 hours' },
  { value: 24, label: '1 day' },
  { value: 72, label: '3 days' },
  { value: 168, label: '7 days' },
  { value: 720, label: '30 days' },
];

export default function ShareDialog({ open, file, onClose, onShared }) {
  const [email, setEmail] = useState('');
  const [expiresInHours, setExpires] = useState(24);
  const [maxDownloads, setMax] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [outcome, setOutcome] = useState(null); // { decision, reason, riskScore, breakdown, link }
  const [copied, setCopied] = useState(false);

  const reset = () => { setOutcome(null); setError(null); setCopied(false); };
  const close = () => { reset(); setEmail(''); onClose(); };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await createShare({ fileId: file.id, recipientEmail: email.trim(), expiresInHours: Number(expiresInHours), maxDownloads: Number(maxDownloads) });
      setOutcome(data);
      onShared?.();
    } catch (err) {
      const apiErr = getApiError(err);
      if (apiErr.code === 'SHARE_BLOCKED' && apiErr.details) {
        setOutcome({ ...apiErr.details, decision: 'BLOCK', reason: apiErr.details.reason || apiErr.message });
        onShared?.(); // a blocked attempt is still logged as a security event
      } else {
        setError(apiErr.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    const ok = await copyText(outcome.link.url);
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); } else toast.error('Could not copy. Select the link and copy it manually.');
  };

  if (!file) return null;

  return (
    <Modal
      open={open}
      onClose={close}
      title={outcome ? 'Sharing result' : 'Share file'}
      size="lg"
      footer={
        outcome ? (
          <>
            <Button variant="secondary" onClick={reset}>Share with someone else</Button>
            <Button onClick={close}>Done</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>Cancel</Button>
            <Button type="submit" form="share-form" loading={busy} icon={Link2}>Create link</Button>
          </>
        )
      }
    >
      {!outcome ? (
        <form id="share-form" onSubmit={submit} className="space-y-4">
          <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Sharing <span className="font-medium text-slate-900">{file.originalName}</span>. Security policies decide whether the link is allowed, needs approval or is blocked.
          </p>
          <label className="block text-sm font-medium text-slate-700">
            Recipient email
            <input className="input mt-1" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Link expires after
              <select className="input mt-1" value={expiresInHours} onChange={(e) => setExpires(e.target.value)}>
                {EXPIRY.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Maximum downloads
              <input className="input mt-1" type="number" min={1} max={100} required value={maxDownloads} onChange={(e) => setMax(e.target.value)} />
            </label>
          </div>
          {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>}
        </form>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <DecisionBadge value={outcome.decision} />
          </div>
          {outcome.decision === 'BLOCK' && (
            <div className="flex gap-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>This file cannot be shared with that recipient. No link was created.</p>
            </div>
          )}
          {outcome.decision === 'REQUIRE_APPROVAL' && (
            <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">An administrator must approve this share first. The link is created after approval and appears under Shared by me.</p>
          )}
          {outcome.decision === 'WARN' && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">This file contains sensitive content. The link works, but the share was recorded as a warning.</p>
          )}
          {outcome.reason && <p className="text-sm text-slate-600">{outcome.reason}</p>}

          {typeof outcome.riskScore === 'number' && <RiskMeter score={outcome.riskScore} />}
          <RiskBreakdown breakdown={outcome.breakdown} />

          {outcome.link?.url && (
            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">Share link</p>
              <div className="flex gap-2">
                <input className="input font-mono text-xs" readOnly value={outcome.link.url} onFocus={(e) => e.target.select()} aria-label="Share link" />
                <Button variant="secondary" onClick={copy} icon={copied ? Check : Copy}>{copied ? 'Copied' : 'Copy'}</Button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                For {outcome.link.recipientEmail}. Expires {formatDate(outcome.link.expiresAt)}, up to {outcome.link.maxDownloads} downloads.
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
