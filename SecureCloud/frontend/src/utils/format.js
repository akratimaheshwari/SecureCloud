export function formatBytes(bytes) {
  if (bytes === undefined || bytes === null || Number.isNaN(Number(bytes))) return '-';
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i += 1; }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`;
}

export function formatDate(iso, { time = true } = {}) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
    ...(time ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export function timeAgo(iso) {
  if (!iso) return '-';
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (Number.isNaN(seconds)) return '-';
  if (seconds < 60) return 'just now';
  const steps = [['minute', 60], ['hour', 24], ['day', 30]];
  let value = seconds / 60;
  for (const [unit, size] of steps) {
    if (value < size) { const n = Math.floor(value); return `${n} ${unit}${n === 1 ? '' : 's'} ago`; }
    value /= size;
  }
  return formatDate(iso, { time: false });
}

// "in 3 hours" / "expired" for link expiry
export function timeUntil(iso) {
  if (!iso) return '-';
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return '-';
  if (ms <= 0) return 'Expired';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${Math.max(mins, 1)} min left`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} h left`;
  return `${Math.floor(hours / 24)} days left`;
}

export const idOf = (v) => (v && typeof v === 'object' ? v._id || v.id : v);

// Only allow same-site relative paths as post-login destinations
export const safeNext = (value) => (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : null);

export function triggerDownload(url, fileName) {
  const a = document.createElement('a');
  a.href = url;
  if (fileName) a.download = fileName;
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
