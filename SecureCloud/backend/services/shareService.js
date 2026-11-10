'use strict';
// Pure helpers for share links (no DB access): token, expiry, download limit and access verdict.
const crypto = require('crypto');

// 256-bit random token, URL-safe (43 chars)
const generateToken = () => crypto.randomBytes(32).toString('base64url');

const computeExpiry = (hours, now = new Date()) => new Date(now.getTime() + hours * 60 * 60 * 1000);
const isExpired = (link, now = new Date()) => link.status === 'EXPIRED' || new Date(link.expiresAt) <= now;
const isDownloadLimitReached = (link) => link.downloadCount >= link.maxDownloads;
const remainingDownloads = (link) => Math.max(0, link.maxDownloads - link.downloadCount);

/**
 * Can this link be used right now? Checks run in a fixed order, first failure wins:
 *   revoked -> blocked -> pending approval -> expired -> download limit -> file locked
 * Returns { allowed:true } or { allowed:false, code, reason, eventType, severity }.
 * eventType is the SecurityEvent to record (null = nothing to record).
 */
function evaluateLinkAccess({ link, file, now = new Date() }) {
  const deny = (code, reason, eventType = null, severity = 'MEDIUM') => ({ allowed: false, code, reason, eventType, severity });

  if (!link) return deny('LINK_NOT_FOUND', 'Share link not found');
  if (link.status === 'REVOKED') return deny('LINK_REVOKED', 'This link has been revoked', 'REVOKED_LINK_ACCESS');
  if (link.status === 'BLOCKED') return deny('LINK_BLOCKED', 'This link was blocked by a security policy');
  if (link.status === 'PENDING_APPROVAL') return deny('LINK_PENDING_APPROVAL', 'This link is waiting for administrator approval');
  if (isExpired(link, now)) return deny('LINK_EXPIRED', 'This link has expired', 'EXPIRED_LINK_ACCESS', 'LOW');
  if (isDownloadLimitReached(link)) return deny('DOWNLOAD_LIMIT_EXCEEDED', 'The download limit for this link has been reached', 'DOWNLOAD_LIMIT_EXCEEDED');
  if (file && file.status === 'LOCKED') return deny('FILE_LOCKED', 'This file is locked by an administrator', 'FILE_LOCKED_ACCESS');
  if (file && file.status === 'QUARANTINED') return deny('FILE_QUARANTINED', 'This file is quarantined pending security review');
  return { allowed: true };
}

module.exports = { generateToken, computeExpiry, isExpired, isDownloadLimitReached, remainingDownloads, evaluateLinkAccess };
