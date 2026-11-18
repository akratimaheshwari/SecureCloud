'use strict';
const mongoose = require('mongoose');
const File = require('../db/models/File');
const DlpResult = require('../db/models/DlpResult');
const SharingLink = require('../db/models/SharingLink');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { parsePagination, pageMeta } = require('../utils/pagination');
const { escapeRegex, sanitizeFileName } = require('../utils/strings');
const { serializeFile } = require('../utils/serializers');
const env = require('../config/env');
const { DOWNLOAD_URL_TTL_SECONDS } = require('../utils/constants');
const policy = require('../services/dlpPolicyService');
const fileSecurityService = require('../services/fileSecurityService');
const s3Service = require('../services/s3Service');
const auditService = require('../services/auditService');
const suspiciousService = require('../services/suspiciousService');
const securityEventService = require('../services/securityEventService');
const { getFileForUser } = require('../services/fileAccessService');

// POST /api/files/upload-url
// The S3 key contains the fileId (uploads/<fileId>/<name>) so the DLP Lambda can read the fileId from the key.
const createUploadUrl = asyncHandler(async (req, res) => {
  const { fileName, fileType, size } = req.body;
  const fileId = new mongoose.Types.ObjectId();
  const s3Key = `uploads/${fileId}/${sanitizeFileName(fileName)}`;

  await File.create({ _id: fileId, ownerId: req.user._id, originalName: fileName, s3Key, size, mimeType: fileType, status: 'UPLOADING' });
  const { uploadUrl, headers, expiresIn } = await s3Service.createUploadUrl({ key: s3Key, contentType: fileType, size });

  await auditService.log(req, 'UPLOAD_URL_CREATE', { type: 'File', id: fileId }, { fileName, size, fileType });
  return sendSuccess(res, { fileId, uploadUrl, method: 'PUT', headers, expiresIn }, 201);
});

// True when the configured customer-managed key (if any) is the one S3 reports. Aliases cannot be
// compared against the key ARN S3 returns, so only key ids / ARNs are enforced.
function kmsKeyMatches(head) {
  const wanted = env.s3KmsKeyId;
  if (!wanted || wanted.startsWith('alias/') || !head.kmsKeyId) return true;
  return String(head.kmsKeyId).endsWith(wanted);
}

// POST /api/files/:id/confirm  (client calls this after the PUT to S3 succeeded)
// Moves UPLOADING -> SCANNING atomically, then asks the central DLP policy for the real status. If the
// Lambda already reported (it can finish first) the policy applies that result now; otherwise the Lambda
// callback applies it later. Both orders end in the same status. A file never becomes ACTIVE here
// just because a scan exists: CRITICAL -> QUARANTINED, HIGH -> RESTRICTED, FAILED -> QUARANTINED.
const confirmUpload = asyncHandler(async (req, res) => {
  const file = await getFileForUser(req, req.params.id);
  if (file.status !== 'UPLOADING') throw new ApiError(409, `Upload already confirmed (status: ${file.status})`, 'INVALID_STATE');

  const head = await s3Service.headObject(file.s3Key);
  if (!head) throw new ApiError(400, 'No uploaded object found. PUT the file to the pre-signed URL first.', 'UPLOAD_NOT_FOUND');

  // Reject = remove the object and the file record (only while still UPLOADING), then fail the request.
  const reject = async (code, message, reason) => {
    await s3Service.deleteObject(file.s3Key).catch((e) => console.error('[s3] cleanup failed:', e.message));
    await File.updateOne({ _id: file._id, status: 'UPLOADING' }, { $set: { status: 'DELETED' } });
    await auditService.log(req, 'UPLOAD_REJECTED', { type: 'File', id: file._id }, { reason });
    throw new ApiError(400, message, code);
  };

  // Enforce encryption at rest: anything not SSE-KMS (or under the wrong key) is removed.
  if (!String(head.serverSideEncryption || '').startsWith('aws:kms') || !kmsKeyMatches(head)) {
    await reject('ENCRYPTION_REQUIRED', 'Object was not encrypted with the required SSE-KMS key and has been removed', 'not encrypted with the required SSE-KMS key');
  }
  // The signed Content-Length should make this impossible; verify anyway so size limits cannot be bypassed.
  if (head.contentLength > env.maxFileSizeBytes || head.contentLength !== file.size) {
    await reject('SIZE_MISMATCH', 'Uploaded object size does not match the declared size or exceeds the limit and has been removed', 'size mismatch or over limit');
  }

  const $set = { status: 'SCANNING', size: head.contentLength, s3ETag: head.eTag };
  // A client hash is only a hint; the scanner's SHA-256 overwrites it (see saveScanResult)
  if (req.body && req.body.sha256Hash && !file.sha256Hash) $set.sha256Hash = req.body.sha256Hash;

  // Atomic claim: two parallel confirms cannot both proceed
  const claimed = await File.findOneAndUpdate({ _id: file._id, ownerId: req.user._id, status: 'UPLOADING' }, { $set }, { new: true });
  if (!claimed) throw new ApiError(409, 'Upload already confirmed', 'INVALID_STATE');

  if (!(await DlpResult.exists({ fileId: file._id }))) await DlpResult.create({ fileId: file._id, scanStatus: 'PENDING' });

  // If the Lambda reported before this confirm, apply its result now through the same policy as the callback.
  const { file: current } = await fileSecurityService.reconcileStatus(file._id, { req });
  const finalFile = current || claimed;
  const latestScan = await fileSecurityService.latestFinishedScan(file._id);
  const dlpStatus = latestScan ? latestScan.scanStatus : 'PENDING'; // reflects the real scan state

  await auditService.log(req, 'UPLOAD', { type: 'File', id: file._id }, { name: finalFile.originalName, size: finalFile.size, mimeType: finalFile.mimeType, status: finalFile.status });
  return sendSuccess(res, { file: serializeFile(finalFile), dlpStatus, dlpSeverity: finalFile.dlpSeverity });
});

// GET /api/files?page=&limit=&q=&classification=&status=   (own files only, soft-deleted hidden)
const listFiles = asyncHandler(async (req, res) => {
  const { q, classification, status } = req.query;
  const { page, limit, skip } = parsePagination(req.query);

  const filter = { ownerId: req.user._id, status: status || { $ne: 'DELETED' } };
  if (classification) filter.classification = classification;
  if (q) filter.originalName = { $regex: escapeRegex(q), $options: 'i' };

  const [items, total] = await Promise.all([
    File.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    File.countDocuments(filter),
  ]);
  return sendSuccess(res, items.map(serializeFile), 200, { pagination: pageMeta(total, page, limit) });
});

// GET /api/files/:id  (owner or admin)
const getFile = asyncHandler(async (req, res) => {
  const file = await getFileForUser(req, req.params.id, { allowAdmin: true });
  const dlpResult = await DlpResult.findOne({ fileId: file._id }).sort({ createdAt: -1 }).lean();
  return sendSuccess(res, { file: serializeFile(file), dlpResult });
});

// GET /api/files/:id/download-url  (owner only; only ACTIVE and RESTRICTED files; LOCKED, QUARANTINED, SCANNING, UPLOADING are denied)
const getDownloadUrl = asyncHandler(async (req, res) => {
  const file = await getFileForUser(req, req.params.id);

  if (file.status === 'LOCKED') {
    await securityEventService.create({
      userId: req.user._id, fileId: file._id, eventType: 'FILE_LOCKED_ACCESS', severity: 'MEDIUM',
      actionTaken: 'Download denied (403)', reason: `Download attempted on a locked file${file.lockReason ? `: ${file.lockReason}` : ''}`,
    });
    await auditService.log(req, 'ACCESS_DENIED', { type: 'File', id: file._id }, { reason: 'file locked' });
    throw new ApiError(403, 'This file is locked by an administrator', 'FILE_LOCKED');
  }
  if (file.status === 'QUARANTINED') {
    await auditService.log(req, 'ACCESS_DENIED', { type: 'File', id: file._id }, { reason: 'file quarantined' });
    throw new ApiError(403, 'This file is quarantined pending security review', 'FILE_QUARANTINED');
  }
  if (file.status === 'UPLOADING') throw new ApiError(409, 'Upload has not been confirmed yet', 'INVALID_STATE');
  if (file.status === 'SCANNING') throw new ApiError(409, 'File is undergoing DLP scanning. Please wait.', 'SCANNING_IN_PROGRESS');
  // Whitelist: only ACTIVE and RESTRICTED (owner-only, which getFileForUser enforced) may be downloaded.
  if (!policy.canDownload(file.status)) throw new ApiError(403, 'This file cannot be downloaded in its current state', 'FILE_NOT_AVAILABLE');

  // Presigned-PUT replay guard: quarantines the file if the stored object changed after it was scanned
  await fileSecurityService.verifyObjectIntegrity(file, req);

  const downloadUrl = await s3Service.createDownloadUrl({ key: file.s3Key, fileName: file.originalName });
  await auditService.log(req, 'DOWNLOAD', { type: 'File', id: file._id }, { name: file.originalName, via: 'owner' });
  await suspiciousService.checkDownloadBurst(req, req.user._id);

  return sendSuccess(res, { downloadUrl, expiresIn: DOWNLOAD_URL_TTL_SECONDS, fileName: file.originalName });
});

// DELETE /api/files/:id  (owner or admin)
// Soft delete of the metadata (status DELETED, kept for the audit trail); the S3 object is removed
// and every open share link is revoked. Enable S3 bucket versioning if you need recoverability.
const deleteFile = asyncHandler(async (req, res) => {
  const file = await getFileForUser(req, req.params.id, { allowAdmin: true });

  file.status = 'DELETED';
  await file.save();
  const revoked = await SharingLink.updateMany({ fileId: file._id, status: { $in: ['ACTIVE', 'PENDING_APPROVAL'] } }, { status: 'REVOKED' });

  let s3Deleted = true;
  try {
    await s3Service.deleteObject(file.s3Key);
  } catch (err) {
    s3Deleted = false;
    console.error('[s3] delete failed:', err.message);
  }

  await auditService.log(req, 'FILE_DELETE', { type: 'File', id: file._id }, { name: file.originalName, s3Deleted, linksRevoked: revoked.modifiedCount });
  return sendSuccess(res, { id: file._id, status: 'DELETED', s3Deleted, linksRevoked: revoked.modifiedCount });
});

// PATCH /api/files/:id/lock  (admin)
const LOCKABLE = ['ACTIVE', 'SCANNING', 'RESTRICTED'];
const lockFile = asyncHandler(async (req, res) => {
  const file = await File.findById(req.params.id);
  if (!file || file.status === 'DELETED') throw new ApiError(404, 'File not found', 'FILE_NOT_FOUND');
  if (!LOCKABLE.includes(file.status)) throw new ApiError(409, `Cannot lock a file in status ${file.status}`, 'INVALID_STATE');

  const reason = req.body.reason || 'Locked by administrator';
  // Remember the prior status so unlock can restore it; conditional so a concurrent scan result is not overwritten
  const locked = await File.findOneAndUpdate(
    { _id: file._id, status: file.status },
    { $set: { status: 'LOCKED', statusBeforeLock: file.status, lockedBy: req.user._id, lockReason: reason } },
    { new: true },
  );
  if (!locked) throw new ApiError(409, 'File status changed, please retry', 'INVALID_STATE');

  await auditService.log(req, 'FILE_LOCK', { type: 'File', id: file._id }, { reason, ownerId: file.ownerId, previousStatus: file.status });
  return sendSuccess(res, { file: serializeFile(locked) });
});

// PATCH /api/files/:id/unlock  (admin)
// SECURITY: unlock restores the pre-lock status but never below what the DLP policy requires, so it
// cannot turn a CRITICAL/HIGH/failed/unsupported file into an ACTIVE one.
const unlockFile = asyncHandler(async (req, res) => {
  const file = await File.findById(req.params.id);
  if (!file || file.status === 'DELETED') throw new ApiError(404, 'File not found', 'FILE_NOT_FOUND');
  if (file.status !== 'LOCKED') throw new ApiError(409, 'File is not locked', 'INVALID_STATE');

  const latestScan = await fileSecurityService.latestFinishedScan(file._id);
  const floor = policy.floorStatus({ latestScan, dlpSeverity: file.dlpSeverity, reviewed: Boolean(file.reviewedAt) });
  const target = policy.statusAfterUnlock({ before: file.statusBeforeLock, floor });

  const $set = { status: target };
  const $unset = { lockedBy: 1, statusBeforeLock: 1 };
  if (target === 'RESTRICTED' || target === 'QUARANTINED') $set.lockReason = `DLP policy keeps this file ${target} after unlock`;
  else $unset.lockReason = 1;

  const unlocked = await File.findOneAndUpdate({ _id: file._id, status: 'LOCKED' }, { $set, $unset }, { new: true });
  if (!unlocked) throw new ApiError(409, 'File status changed, please retry', 'INVALID_STATE');
  // A scan result may have arrived while locked/unlocking: re-apply the policy once more (idempotent)
  const { file: current } = await fileSecurityService.reconcileStatus(file._id, { req });

  await auditService.log(req, 'FILE_UNLOCK', { type: 'File', id: file._id }, { ownerId: file.ownerId, status: (current || unlocked).status });
  return sendSuccess(res, { file: serializeFile(current || unlocked) });
});

// PATCH /api/files/:id/release  (admin) - the security review step for a QUARANTINED file.
// Release goes to RESTRICTED (owner-only, sharing blocked), NEVER to ACTIVE. No endpoint can make a
// file that scanned HIGH/CRITICAL (or failed/unsupported) ACTIVE.
const releaseFile = asyncHandler(async (req, res) => {
  const file = await File.findById(req.params.id);
  if (!file || file.status === 'DELETED') throw new ApiError(404, 'File not found', 'FILE_NOT_FOUND');
  if (file.status !== 'QUARANTINED') throw new ApiError(409, 'Only QUARANTINED files can be released', 'INVALID_STATE');

  const head = await s3Service.headObject(file.s3Key);
  if (!head) throw new ApiError(409, 'The stored object is missing; delete the file instead', 'OBJECT_MISSING');

  const note = req.body.note || 'Released from quarantine by administrator review';
  const released = await File.findOneAndUpdate(
    { _id: file._id, status: 'QUARANTINED' },
    { $set: { status: 'RESTRICTED', reviewedBy: req.user._id, reviewedAt: new Date(), lockReason: note, s3ETag: head.eTag } }, // re-baseline the reviewed object
    { new: true },
  );
  if (!released) throw new ApiError(409, 'File status changed, please retry', 'INVALID_STATE');

  await auditService.log(req, 'FILE_RELEASE', { type: 'File', id: file._id }, { note, ownerId: file.ownerId, newStatus: 'RESTRICTED' });
  return sendSuccess(res, { file: serializeFile(released) });
});

module.exports = { createUploadUrl, confirmUpload, listFiles, getFile, getDownloadUrl, deleteFile, lockFile, unlockFile, releaseFile };
