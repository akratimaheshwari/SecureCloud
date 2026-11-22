import { useCallback, useRef, useState } from 'react';
import axios from 'axios';
import { CheckCircle2, UploadCloud, XCircle, X } from 'lucide-react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import { StatusBadge, ClassificationBadge } from './ui/Badges';
import { Spinner } from './ui/Feedback';
import { confirmUpload, createUploadUrl, putToS3 } from '../api/filesApi';
import { errorMessage } from '../utils/errors';
import { formatBytes } from '../utils/format';

const STAGE_TEXT = {
  queued: 'Waiting',
  preparing: 'Preparing secure upload',
  uploading: 'Uploading',
  confirming: 'Verifying encryption and starting scan',
  done: 'Uploaded',
  error: 'Failed',
};

let counter = 0;

export default function UploadDialog({ open, onClose, onUploaded }) {
  const [items, setItems] = useState([]);
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const cancelRef = useRef(false);

  const patch = useCallback((id, changes) => {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...changes } : it)));
  }, []);

  const addFiles = (fileList) => {
    const added = Array.from(fileList || []).map((file) => ({ id: ++counter, file, stage: 'queued', progress: 0, error: null, result: null }));
    if (added.length) setItems((list) => [...list, ...added]);
  };

  const uploadOne = async (item) => {
    const { file } = item;
    if (file.size === 0) throw new Error('This file is empty.');
    patch(item.id, { stage: 'preparing', error: null });
    const target = await createUploadUrl({ fileName: file.name, fileType: file.type || 'application/octet-stream', size: file.size });

    patch(item.id, { stage: 'uploading', progress: 0 });
    abortRef.current = new AbortController();
    try {
      await putToS3({
        uploadUrl: target.uploadUrl,
        headers: target.headers,
        file,
        signal: abortRef.current.signal,
        onProgress: (progress) => patch(item.id, { progress }),
      });
    } catch (err) {
      if (axios.isCancel(err)) throw new Error('Upload cancelled.');
      if (err.response) throw new Error(`Storage rejected the upload (HTTP ${err.response.status}). The upload link may have expired, so try again.`);
      throw new Error('Could not reach storage. Check the S3 bucket CORS settings for this address.');
    }

    patch(item.id, { stage: 'confirming', progress: 100 });
    const result = await confirmUpload(target.fileId);
    patch(item.id, { stage: 'done', result });
  };

  const start = async () => {
    setRunning(true);
    cancelRef.current = false;
    for (const item of items.filter((i) => i.stage === 'queued' || i.stage === 'error')) {
      if (cancelRef.current) break;
      try {
        await uploadOne(item);
      } catch (err) {
        patch(item.id, { stage: 'error', error: err.response ? errorMessage(err) : err.message });
      }
    }
    setRunning(false);
    onUploaded?.();
  };

  const cancel = () => {
    cancelRef.current = true;
    abortRef.current?.abort();
  };

  const close = () => {
    if (running) return;
    setItems([]);
    onClose();
  };

  const pending = items.filter((i) => i.stage === 'queued' || i.stage === 'error').length;

  return (
    <Modal
      open={open}
      onClose={close}
      dismissible={!running}
      title="Upload files"
      size="lg"
      footer={
        <>
          {running ? (
            <Button variant="secondary" onClick={cancel}>Cancel upload</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={close}>{items.some((i) => i.stage === 'done') ? 'Close' : 'Cancel'}</Button>
              <Button onClick={start} disabled={pending === 0} icon={UploadCloud}>
                {pending > 0 ? `Upload ${pending} file${pending === 1 ? '' : 's'}` : 'Upload'}
              </Button>
            </>
          )}
        </>
      }
    >
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); if (!running) addFiles(e.dataTransfer.files); }}
        className={`flex flex-col items-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors ${dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50'}`}
      >
        <UploadCloud className="mb-2 h-8 w-8 text-slate-400" aria-hidden="true" />
        <p className="text-sm text-slate-700">Drag files here or</p>
        <Button variant="secondary" size="sm" className="mt-2" disabled={running} onClick={() => inputRef.current?.click()}>Choose files</Button>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        <p className="mt-3 text-xs text-slate-500">Files are encrypted at rest and scanned for sensitive data (PAN, bank accounts, salary data, emails, phone numbers).</p>
      </div>

      {items.length > 0 && (
        <ul className="mt-4 space-y-2">
          {items.map((it) => (
            <li key={it.id} className="rounded-md border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{it.file.name}</p>
                  <p className="text-xs text-slate-500">{formatBytes(it.file.size)}</p>
                </div>
                {it.stage === 'queued' && !running && (
                  <button type="button" aria-label={`Remove ${it.file.name}`} className="rounded p-1 text-slate-400 hover:bg-slate-100" onClick={() => setItems((l) => l.filter((x) => x.id !== it.id))}>
                    <X className="h-4 w-4" />
                  </button>
                )}
                {it.stage === 'done' && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-label="Uploaded" />}
                {it.stage === 'error' && <XCircle className="h-5 w-5 shrink-0 text-rose-600" aria-label="Failed" />}
                {['preparing', 'uploading', 'confirming'].includes(it.stage) && <Spinner />}
              </div>

              {it.stage === 'uploading' && (
                <div className="mt-2">
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${it.progress}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{it.progress}%</p>
                </div>
              )}
              {['preparing', 'confirming'].includes(it.stage) && <p className="mt-1.5 text-xs text-slate-500">{STAGE_TEXT[it.stage]}</p>}
              {it.stage === 'error' && <p className="mt-1.5 text-xs text-rose-700" role="alert">{it.error}</p>}
              {it.stage === 'done' && it.result && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <StatusBadge value={it.result.file?.status} />
                  {it.result.file?.status !== 'SCANNING' && <ClassificationBadge value={it.result.file?.classification} />}
                  {it.result.file?.status === 'SCANNING' && <span>Scan in progress. The classification appears when it finishes.</span>}
                  {it.result.file?.status === 'QUARANTINED' && <span>Held for administrator review.</span>}
                  {it.result.file?.status === 'RESTRICTED' && <span>Only you can download it, and sharing is blocked.</span>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
