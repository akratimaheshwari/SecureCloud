'use strict';
const User = require('../db/models/User');
const DlpResult = require('../db/models/DlpResult');
const SecurityPolicy = require('../db/models/SecurityPolicy');
const riskService = require('./riskService');
const suspiciousService = require('./suspiciousService');
const securityEventService = require('./securityEventService');
const auditService = require('./auditService');
const shareService = require('./shareService');
const { selectPolicy } = require('../utils/policyMatcher');
const { normalizeEmail, getDomain } = require('../utils/email');

/**
 * Decide what happens when `owner` shares `file` with `recipientEmail`.
 *
 *  1. "External" = recipient domain differs from the owner's domain OR recipient is not a registered user.
 *  2. A LOCKED file is always BLOCKed.
 *  3. Otherwise enabled SecurityPolicy documents are checked by ascending priority; the first match wins.
 *     No match => ALLOW (the seeded catch-all policy normally covers this).
 *  4. A risk score + breakdown is always calculated (informational; stored on the link).
 *  5. BLOCK  => SecurityEvent BLOCKED_SHARE + AuditLog SHARE_BLOCKED.
 *     WARN   => SecurityEvent WARNED_SHARE.
 *     (pass record:false for a dry run with no side effects)
 *
 * Returns { decision, reason, riskScore, riskLevel, breakdown, isExternal, recipientRegistered, policy }.
 */
async function evaluate({ file, recipientEmail, owner, req = null, record = true }) {
  const email = normalizeEmail(recipientEmail);
  const recipient = await User.findOne({ email, isActive: true }).select('_id').lean();
  const recipientRegistered = Boolean(recipient);
  const isExternal = getDomain(email) !== getDomain(owner.email) || !recipientRegistered;

  const dlp = await DlpResult.findOne({ fileId: file._id, scanStatus: 'COMPLETED' }).sort({ scannedAt: -1 }).lean();
  const recentDownloads = await suspiciousService.countRecentDownloads(owner._id);

  const risk = riskService.calculateRisk({
    detectedTypes: dlp ? dlp.detectedTypes : [],
    classification: file.classification,
    isExternal,
    recentDownloads,
    recipientKnown: recipientRegistered,
  });

  let decision;
  let reason;
  let policy = null;

  if (file.status === 'LOCKED' || file.status === 'QUARANTINED') {
    decision = 'BLOCK';
    reason = file.status === 'QUARANTINED'
      ? 'File is quarantined due to a scan failure; sharing blocked'
      : `File is locked${file.lockReason ? `: ${file.lockReason}` : ''}`;
  } else {
    const policies = await SecurityPolicy.find({ enabled: true }).lean();
    const hit = selectPolicy(policies, { classification: file.classification, isExternal, recentDownloads });
    if (hit) {
      decision = hit.policy.action;
      policy = { id: hit.policy._id, name: hit.policy.name };
      reason = `Policy "${hit.policy.name}" matched${hit.details.length ? ` (${hit.details.join('; ')})` : ''}`;
    } else {
      decision = 'ALLOW';
      reason = 'No security policy matched; sharing allowed by default';
    }
  }

  const result = { decision, reason, riskScore: risk.score, riskLevel: risk.level, breakdown: risk.breakdown, isExternal, recipientRegistered, policy };

  if (record && (decision === 'BLOCK' || decision === 'WARN')) {
    const blocked = decision === 'BLOCK';
    await securityEventService.create({
      userId: owner._id,
      fileId: file._id,
      eventType: blocked ? 'BLOCKED_SHARE' : 'WARNED_SHARE',
      severity: securityEventService.severityFromLevel(risk.level),
      actionTaken: blocked ? 'Share blocked' : 'Share allowed with warning',
      reason,
      riskScore: risk.score,
    });
    if (blocked) {
      await auditService.log(req, 'SHARE_BLOCKED', { type: 'File', id: file._id }, { recipientEmail: email, reason, riskScore: risk.score, policy: policy && policy.name }, { userId: owner._id });
    }
  }
  return result;
}

// Expired or revoked links are denied (see shareService.evaluateLinkAccess for the full ordered checks)
const evaluateLinkAccess = (args) => shareService.evaluateLinkAccess(args);

module.exports = { evaluate, evaluateLinkAccess };
