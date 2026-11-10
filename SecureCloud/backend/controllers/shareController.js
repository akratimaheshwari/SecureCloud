'use strict';
const SharingLink = require('../db/models/SharingLink');
const File = require('../db/models/File');
const User = require('../db/models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { parsePagination, pageMeta } = require('../utils/pagination');
const { serializeLink } = require('../utils/serializers');
const { DOWNLOAD_URL_TTL_SECONDS } = require('../utils/constants');
const s3Service = require('../services/s3Service');
const auditService = require('../services/auditService');
const policyService = require('../services/policyService');
const riskService = require('../services/riskService');
const shareService = require('../services/shareService');
const suspiciousService = require('../services/suspiciousService');
const securityEventService = require('../services/securityEventService');
const { getFileForUser } = require('../services/fileAccessService');

const STATUS_BY_DECISION = { ALLOW: 'ACTIVE', WARN: 'ACTIVE', REQUIRE_APPROVAL: 'PENDING_APPROVAL', BLOCK: 'BLOCKED' };

// POST /api/shares   -> runs the policy engine, then stores the link with the decision
const createShare = asyncHandler(async (req, res) => {
  const { fileId, recipientEmail, expiresInHours, maxDownloads } = req.body;

  const file = await getFileForUser(req, fileId); // owner only
  if (!['ACTIVE', 'LOCKED'].includes(file.status)) {
    throw new ApiError(409, `File is not ready to be shared (status: ${file.status}). Wait for the DLP scan to finish.`, 'FILE_NOT_READY');
  }
  if (recipientEmail === req.user.email) throw new ApiError(400, 'You cannot share a file with yourself', 'INVALID_RECIPIENT');

  const result = await policyService.evaluate({ file, recipientEmail, owner: req.user, req });
  const summary = { decision: result.decision, reason: result.reason, riskScore: result.riskScore, riskLevel: result.riskLevel, breakdown: result.breakdown };

  // Every attempt is stored (BLOCKED ones too) so admins can review them.
  const link = await SharingLink.create({
    fileId: file._id,
    createdBy: req.user._id,
    recipientEmail,
    isExternal: result.isExternal,
    token: shareService.generateToken(),
    expiresAt: shareService.computeExpiry(expiresInHours),
    maxDownloads,
    status: STATUS_BY_DECISION[result.decision],
    policyDecision: result.decision,
    riskScoreAtShare: result.riskScore,
  });

  if (result.decision === 'BLOCK') {
    throw new ApiError(403, result.reason, 'SHARE_BLOCKED', { ...summary, link: null });
  }

  await auditService.log(req, 'SHARE_CREATE', { type: 'SharingLink', id: link._id }, {
    fileId: file._id, recipientEmail, decision: result.decision, status: link.status, riskScore: result.riskScore, isExternal: result.isExternal,
  });
  const status = result.decision === 'REQUIRE_APPROVAL' ? 202 : 201; // 202 = accepted, waiting for admin approval
  return sendSuccess(res, { ...summary, link: serializeLink(link) }, status);
});

// GET /api/shares/mine
const listMine = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = { createdBy: req.user._id };
  if (req.query.status) filter.status = req.query.status;

  const [items, total] = await Promise.all([
    SharingLink.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('fileId', 'originalName classification status').lean(),
    SharingLink.countDocuments(filter),
  ]);
  return sendSuccess(res, items.map((l) => serializeLink(l)), 200, { pagination: pageMeta(total, page, limit) });
});

// GET /api/shares/with-me   (ACTIVE links addressed to my email)
const listWithMe = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = { recipientEmail: req.user.email, status: 'ACTIVE', expiresAt: { $gt: new Date() } };

  const [items, total] = await Promise.all([
    SharingLink.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate('fileId', 'originalName classification status').populate('createdBy', 'name email').lean(),
    SharingLink.countDocuments(filter),
  ]);
  return sendSuccess(res, items.map((l) => serializeLink(l)), 200, { pagination: pageMeta(total, page, limit) });
});

// A link shared with a REGISTERED account can only be used by that account (or its creator).
// Links for unregistered recipients are bearer links: whoever holds the token can use it.
async function enforceRecipient(req, link, file) {
  const registered = link.recipientEmail && (await User.exists({ email: link.recipientEmail, isActive: true }));
  if (!registered) return;
  if (!req.user) throw new ApiError(401, 'Log in with the account this file was shared with', 'AUTH_REQUIRED');
  if (req.user.email === link.recipientEmail || link.createdBy.equals(req.user._id)) return;

  await securityEventService.create({
    userId: req.user._id, fileId: file._id, eventType: 'UNAUTHORIZED_ACCESS', severity: 'MEDIUM',
    actionTaken: 'Access denied (403)', reason: `Share link ${link._id} used by an account other than its recipient`,
  });
  await auditService.log(req, 'ACCESS_DENIED', { type: 'SharingLink', id: link._id }, { reason: 'not the recipient' });
  throw new ApiError(403, 'This link was shared with a different account', 'FORBIDDEN');
}

// GET /api/shares/access/:token   (public bearer link; login optional, see enforceRecipient)
const accessShare = asyncHandler(async (req, res) => {
  const link = await SharingLink.findOne({ token: req.params.token });
  if (!link) throw new ApiError(404, 'Link not found', 'LINK_NOT_FOUND');
  const file = await File.findById(link.fileId);
  if (!file || file.status === 'DELETED') throw new ApiError(404, 'The shared file is no longer available', 'FILE_NOT_FOUND');

  await enforceRecipient(req, link, file);

  const deny = async (verdict) => {
    // Lazily mark expired links
    if (verdict.code === 'LINK_EXPIRED' && link.status === 'ACTIVE') {
      link.status = 'EXPIRED';
      await link.save();
    }
    if (verdict.eventType) {
      await securityEventService.create({
        userId: req.user && req.user._id, fileId: file._id, eventType: verdict.eventType, severity: verdict.severity,
        actionTaken: 'Access denied (403)', reason: `${verdict.reason} (link ${link._id})`,
      });
    }
    await auditService.log(req, 'LINK_ACCESS_DENIED', { type: 'SharingLink', id: link._id }, { code: verdict.code });
    throw new ApiError(403, verdict.reason, verdict.code);
  };

  const verdict = policyService.evaluateLinkAccess({ link, file });
  if (!verdict.allowed) return deny(verdict);

  // Atomic increment: the filter re-checks every condition, so two parallel requests can never exceed maxDownloads.
  const updated = await SharingLink.findOneAndUpdate(
    { _id: link._id, status: 'ACTIVE', expiresAt: { $gt: new Date() }, $expr: { $lt: ['$downloadCount', '$maxDownloads'] } },
    { $inc: { downloadCount: 1 } },
    { new: true },
  );
  if (!updated) {
    const fresh = await SharingLink.findById(link._id);
    if (!fresh) throw new ApiError(404, 'Share link is no longer available', 'LINK_NOT_FOUND');
    return deny(shareService.evaluateLinkAccess({ link: fresh, file }));
  }

  const downloadUrl = await s3Service.createDownloadUrl({ key: file.s3Key, fileName: file.originalName });
  await auditService.log(req, 'DOWNLOAD', { type: 'File', id: file._id }, { name: file.originalName, via: 'share', linkId: link._id });
  if (req.user) await suspiciousService.checkDownloadBurst(req, req.user._id);

  return sendSuccess(res, {
    downloadUrl,
    expiresIn: DOWNLOAD_URL_TTL_SECONDS,
    fileName: file.originalName,
    size: file.size,
    remainingDownloads: shareService.remainingDownloads(updated),
  });
});

// POST /api/shares/:id/revoke   (creator or admin)
const revokeShare = asyncHandler(async (req, res) => {
  const link = await SharingLink.findById(req.params.id);
  if (!link) throw new ApiError(404, 'Share not found', 'LINK_NOT_FOUND');

  const isOwner = link.createdBy.equals(req.user._id);
  if (!isOwner && req.user.role !== 'admin') {
    await securityEventService.create({
      userId: req.user._id, fileId: link.fileId, eventType: 'UNAUTHORIZED_ACCESS', severity: 'MEDIUM',
      actionTaken: 'Access denied (403)', reason: `Tried to revoke share ${link._id} created by another user`,
    });
    await auditService.log(req, 'ACCESS_DENIED', { type: 'SharingLink', id: link._id }, { action: 'revoke' });
    throw new ApiError(403, 'You cannot revoke this share', 'FORBIDDEN');
  }
  if (!['ACTIVE', 'PENDING_APPROVAL'].includes(link.status)) {
    throw new ApiError(409, `Share is already ${link.status}`, 'INVALID_STATE');
  }

  link.status = 'REVOKED';
  await link.save();
  await auditService.log(req, 'SHARE_REVOKE', { type: 'SharingLink', id: link._id }, { fileId: link.fileId, byAdmin: !isOwner });
  return sendSuccess(res, { link: serializeLink(link) });
});

// GET /api/shares/pending-approval   (admin)
const listPendingApproval = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = { status: 'PENDING_APPROVAL' };
  const [items, total] = await Promise.all([
    SharingLink.find(filter).sort({ createdAt: 1 }).skip(skip).limit(limit)
      .populate('fileId', 'originalName classification status').populate('createdBy', 'name email').lean(),
    SharingLink.countDocuments(filter),
  ]);
  return sendSuccess(res, items.map((l) => serializeLink(l)), 200, { pagination: pageMeta(total, page, limit) });
});

async function loadPending(id) {
  const link = await SharingLink.findById(id);
  if (!link) throw new ApiError(404, 'Share not found', 'LINK_NOT_FOUND');
  if (link.status !== 'PENDING_APPROVAL') throw new ApiError(409, `Share is not pending approval (status: ${link.status})`, 'INVALID_STATE');
  return link;
}

// POST /api/shares/:id/approve   (admin) -> link becomes ACTIVE; stored risk drops by the trusted-approval weight (-10)
const approveShare = asyncHandler(async (req, res) => {
  const link = await loadPending(req.params.id);
  const file = await File.findById(link.fileId);
  if (!file || ['DELETED', 'LOCKED'].includes(file.status)) throw new ApiError(409, 'The file is no longer available for sharing', 'INVALID_STATE');
  if (shareService.isExpired(link)) throw new ApiError(409, 'The link has already expired; ask the owner to create a new share', 'LINK_EXPIRED');

  const risk = riskService.applyTrustedApproval(link.riskScoreAtShare);
  link.status = 'ACTIVE';
  link.riskScoreAtShare = risk.score;
  await link.save();

  await auditService.log(req, 'SHARE_APPROVED', { type: 'SharingLink', id: link._id }, { fileId: link.fileId, riskScore: risk.score, breakdown: risk.breakdown });
  return sendSuccess(res, { link: serializeLink(link), riskScore: risk.score, riskLevel: risk.level, breakdown: risk.breakdown });
});

// POST /api/shares/:id/reject   (admin)
const rejectShare = asyncHandler(async (req, res) => {
  const link = await loadPending(req.params.id);
  link.status = 'BLOCKED';
  await link.save();

  await securityEventService.create({
    userId: link.createdBy, fileId: link.fileId, eventType: 'BLOCKED_SHARE', severity: 'MEDIUM',
    actionTaken: 'Share rejected by administrator', reason: req.body.reason || 'Rejected by administrator', riskScore: link.riskScoreAtShare,
  });
  await auditService.log(req, 'SHARE_REJECTED', { type: 'SharingLink', id: link._id }, { fileId: link.fileId, reason: req.body.reason });
  return sendSuccess(res, { link: serializeLink(link) });
});

module.exports = { createShare, listMine, listWithMe, accessShare, revokeShare, listPendingApproval, approveShare, rejectShare };
