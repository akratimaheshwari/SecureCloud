'use strict';
const AuditLog = require('../db/models/AuditLog');

// Never persist secrets, even if a caller passes them in metadata by mistake.
const SECRET_KEY = /pass(word)?|secret|authorization|api[-_]?key|^token$/i;

function sanitize(value, depth = 0) {
  if (value === null || value === undefined || depth > 4) return value;
  if (typeof value.toHexString === 'function') return value.toString(); // ObjectId
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SECRET_KEY.test(k) ? '[redacted]' : sanitize(v, depth + 1)]));
  }
  return value;
}

/**
 * auditService.log(req, action, target, metadata, opts)
 *   action   - e.g. LOGIN, UPLOAD, DOWNLOAD, SHARE_CREATE, SHARE_REVOKE, FILE_LOCK
 *   target   - { type: 'File', id: <ObjectId> }
 *   opts     - { userId } to attribute the entry when req.user is not set (login, register)
 * Best effort: a failed audit write is logged to the console but does not fail the request.
 */
async function log(req, action, target = {}, metadata = {}, opts = {}) {
  try {
    await AuditLog.create({
      userId: opts.userId || (req && req.user && req.user._id) || undefined,
      action,
      targetType: target.type,
      targetId: target.id,
      ipAddress: req && req.ip,
      userAgent: req && req.get ? (req.get('user-agent') || '').slice(0, 300) : undefined,
      metadata: sanitize({ requestId: req && req.id, ...metadata }),
    });
  } catch (err) {
    console.error('[audit] failed to write audit log:', err.message);
  }
}

module.exports = { log };
