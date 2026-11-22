// Labels and colours for every enum the backend returns. Colour carries meaning, so each value has one fixed look.

export const CLASSIFICATIONS = {
  PUBLIC: { label: 'Public', tone: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20', hex: '#10b981', rank: 0 },
  INTERNAL: { label: 'Internal', tone: 'bg-sky-50 text-sky-800 ring-sky-600/20', hex: '#0ea5e9', rank: 1 },
  CONFIDENTIAL: { label: 'Confidential', tone: 'bg-amber-50 text-amber-800 ring-amber-600/25', hex: '#f59e0b', rank: 2 },
  HIGHLY_CONFIDENTIAL: { label: 'Highly confidential', tone: 'bg-rose-50 text-rose-800 ring-rose-600/20', hex: '#e11d48', rank: 3 },
};

export const FILE_STATUSES = {
  UPLOADING: { label: 'Uploading', tone: 'bg-slate-100 text-slate-700 ring-slate-500/20', hint: 'Waiting for the upload to finish' },
  SCANNING: { label: 'Scanning', tone: 'bg-blue-50 text-blue-800 ring-blue-600/20', hint: 'The DLP scan is checking this file for sensitive data', pulse: true },
  ACTIVE: { label: 'Active', tone: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20', hint: 'Ready to download and share' },
  RESTRICTED: { label: 'Restricted', tone: 'bg-amber-50 text-amber-800 ring-amber-600/25', hint: 'Only you can download this file and sharing is blocked until it is reviewed' },
  LOCKED: { label: 'Locked', tone: 'bg-slate-800 text-white ring-slate-900/20', hint: 'An administrator locked this file' },
  QUARANTINED: { label: 'Quarantined', tone: 'bg-rose-50 text-rose-800 ring-rose-600/20', hint: 'Held for an administrator security review' },
  DELETED: { label: 'Deleted', tone: 'bg-slate-100 text-slate-500 ring-slate-400/20', hint: 'This file was deleted' },
};

export const LINK_STATUSES = {
  ACTIVE: { label: 'Active', tone: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20' },
  PENDING_APPROVAL: { label: 'Awaiting approval', tone: 'bg-blue-50 text-blue-800 ring-blue-600/20' },
  REVOKED: { label: 'Revoked', tone: 'bg-slate-100 text-slate-600 ring-slate-500/20' },
  EXPIRED: { label: 'Expired', tone: 'bg-slate-100 text-slate-600 ring-slate-500/20' },
  BLOCKED: { label: 'Blocked', tone: 'bg-rose-50 text-rose-800 ring-rose-600/20' },
};

export const DECISIONS = {
  ALLOW: { label: 'Allowed', tone: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20' },
  WARN: { label: 'Allowed with warning', tone: 'bg-amber-50 text-amber-800 ring-amber-600/25' },
  REQUIRE_APPROVAL: { label: 'Needs approval', tone: 'bg-blue-50 text-blue-800 ring-blue-600/20' },
  BLOCK: { label: 'Blocked', tone: 'bg-rose-50 text-rose-800 ring-rose-600/20' },
};

export const SEVERITIES = {
  NONE: { label: 'None', tone: 'bg-slate-100 text-slate-600 ring-slate-500/20' },
  LOW: { label: 'Low', tone: 'bg-slate-100 text-slate-700 ring-slate-500/20' },
  MEDIUM: { label: 'Medium', tone: 'bg-amber-50 text-amber-800 ring-amber-600/25' },
  HIGH: { label: 'High', tone: 'bg-orange-50 text-orange-800 ring-orange-600/25' },
  CRITICAL: { label: 'Critical', tone: 'bg-rose-50 text-rose-800 ring-rose-600/20' },
};

export const EVENT_TYPES = {
  BLOCKED_SHARE: 'Share blocked',
  WARNED_SHARE: 'Share warning',
  FAILED_LOGIN: 'Failed sign-in',
  UNAUTHORIZED_ACCESS: 'Unauthorized access',
  EXPIRED_LINK_ACCESS: 'Expired link opened',
  REVOKED_LINK_ACCESS: 'Revoked link opened',
  DOWNLOAD_LIMIT_EXCEEDED: 'Download limit reached',
  SUSPICIOUS_DOWNLOADS: 'Suspicious downloads',
  HIGH_RISK_UPLOAD: 'High-risk upload',
  FILE_LOCKED_ACCESS: 'Locked file access attempt',
};

export const RISK_FACTORS = {
  SENSITIVE_CONTENT: 'Sensitive content',
  HIGHLY_CONFIDENTIAL: 'Highly confidential file',
  EXTERNAL_SHARING: 'External recipient',
  UNUSUAL_DOWNLOAD_VOLUME: 'Unusual download volume',
  UNKNOWN_RECIPIENT: 'Unregistered recipient',
  TRUSTED_APPROVED_ACTION: 'Approved by an administrator',
};

export const DLP_TYPES = {
  PAN: 'PAN number',
  ACCOUNT_NUMBER: 'Bank account number',
  SALARY_KEYWORD: 'Salary keywords',
  EMAIL: 'Email addresses',
  PHONE: 'Phone numbers',
};

// Risk bands match the backend: Low 0-30, Medium 31-60, High 61-80, Critical 81-100
export function riskLevel(score = 0) {
  if (score >= 81) return { label: 'Critical', bar: 'bg-rose-600', text: 'text-rose-700' };
  if (score >= 61) return { label: 'High', bar: 'bg-orange-500', text: 'text-orange-700' };
  if (score >= 31) return { label: 'Medium', bar: 'bg-amber-500', text: 'text-amber-700' };
  return { label: 'Low', bar: 'bg-emerald-500', text: 'text-emerald-700' };
}

export const dlpLabel = (type) => DLP_TYPES[type] || type.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
export const eventLabel = (type) => EVENT_TYPES[type] || type;
