'use strict';
// Escape user input before using it inside a RegExp (prevents regex injection / ReDoS patterns)
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Safe S3 key segment: no slashes, no odd characters, bounded length
function sanitizeFileName(name) {
  const base = String(name).split(/[\\/]/).pop();
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(-100);
  return cleaned || 'file';
}

// Content-Disposition value with ASCII fallback + RFC 5987 UTF-8 name
function contentDisposition(name) {
  const ascii = String(name).replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

module.exports = { escapeRegex, sanitizeFileName, contentDisposition };
