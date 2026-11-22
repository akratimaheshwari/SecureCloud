import { useState } from 'react';
import Modal from './Modal';
import Button from './Button';

// Confirm + optional reason box. onConfirm(reason) may be async; the dialog closes when it resolves.
export default function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger = false, askReason = false, reasonLabel = 'Reason (optional)', onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');

  const submit = async () => {
    setBusy(true);
    try {
      await onConfirm(reason.trim());
      setReason('');
      onClose();
    } catch {
      /* the caller shows the error toast; keep the dialog open so the user can retry */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={submit} loading={busy}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">{message}</p>
      {askReason && (
        <label className="mt-4 block text-sm font-medium text-slate-700">
          {reasonLabel}
          <textarea className="input mt-1" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      )}
    </Modal>
  );
}
