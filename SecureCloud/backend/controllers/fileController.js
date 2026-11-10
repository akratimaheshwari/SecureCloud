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
const { DOWNLOAD_URL_TTL_SECONDS } = require('../utils/constants');
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

// POST /api/files/:id/confirm  (client calls this after the PUT to S3 succeeded)
const confirmUpload = asyncHandler(async (req, res) => {
  const file = await getFileForUser(req, req.params.id);
  if (file.status !== 'UPLOADING') throw new ApiError(409, `Upload already confirmed (status: ${file.status})`, 'INVALID_STATE');

  const head = await s3Service.headObject(file.s3Key);
  if (!head) throw new ApiError(400, 'No uploaded object found. PUT the file to the pre-signed URL first.', 'UPLOAD_NOT_FOUND');

  // Enforce encryption at rest: anything not SSE-KMS encrypted is removed.
  if (!String(head.serverSideEncryption || '').startsWith('aws:kms')) {
    await s3Service.deleteObject(file.s3Key).catch((e) => console.error('[s3] cleanup failed:', e.message));
    file.status = 'DELETED';
    await file.save();
    await auditService.log(req, 'UPLOAD_REJECTED', { type: 'File', id: file._id }, { reason: 'not encrypted with SSE-KMS' });
    throw new ApiError(400, 'Object was not encrypted with SSE-KMS and has been removed', 'ENCRYPTION_REQUIRED');
  }

  file.size = head.contentLength ?? file.size;
  if (req.body && req.body.sha256Hash) {
    file.sha256Hash = req.body.sha256Hash;
  }

  // The S3-triggered Lambda can finish before the client confirms; then the file goes straight to ACTIVE.
 const latestScan = await DlpResult.findOne({
  fileId: file._id
}).sort({ createdAt: -1 });

let dlpStatus;

if (
  latestScan &&
  ['COMPLETED', 'UNSUPPORTED'].includes(latestScan.scanStatus)
) {
  file.status = 'ACTIVE';
  dlpStatus = latestScan.scanStatus;
} else if (latestScan?.scanStatus === 'FAILED') {
  file.status = 'QUARANTINED';
  file.lockReason = 'DLP scan failed. Security review required.';
  dlpStatus = 'FAILED';
} else {
  file.status = 'SCANNING';
  dlpStatus = 'PENDING';

  if (!latestScan || latestScan.scanStatus !== 'PENDING') {
    await DlpResult.create({
      fileId: file._id,
      scanStatus: 'PENDING'
    });
  }
}

  await file.save();

  await auditService.log(req, 'UPLOAD', { type: 'File', id: file._id }, { name: file.originalName, size: file.size, mimeType: file.mimeType });
  return sendSuccess(res, { file: serializeFile(file), dlpStatus: scanned ? 'COMPLETED' : 'PENDING' });
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

// GET /api/files/:id/download-url  (owner only; LOCKED, QUARANTINED, and SCANNING files are denied)
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
const lockFile = asyncHandler(async (req, res) => {
  const file = await File.findById(req.params.id);
  if (!file || file.status === 'DELETED') throw new ApiError(404, 'File not found', 'FILE_NOT_FOUND');
  if (!['ACTIVE', 'SCANNING'].includes(file.status)) throw new ApiError(409, `Cannot lock a file in status ${file.status}`, 'INVALID_STATE');

  file.status = 'LOCKED';
  file.lockedBy = req.user._id;
  file.lockReason = req.body.reason || 'Locked by administrator';
  await file.save();

  await auditService.log(req, 'FILE_LOCK', { type: 'File', id: file._id }, { reason: file.lockReason, ownerId: file.ownerId });
  return sendSuccess(res, { file: serializeFile(file) });
});

// PATCH /api/files/:id/unlock  (admin)
const unlockFile = asyncHandler(async (req, res) => {
  const file = await File.findById(req.params.id);
  if (!file || file.status === 'DELETED') throw new ApiError(404, 'File not found', 'FILE_NOT_FOUND');
  if (file.status !== 'LOCKED') throw new ApiError(409, 'File is not locked', 'INVALID_STATE');

  // Back to SCANNING if the scan never finished, otherwise ACTIVE
  const scanned = await DlpResult.exists({ fileId: file._id, scanStatus: { $in: ['COMPLETED', 'UNSUPPORTED'] } });
  file.status = scanned ? 'ACTIVE' : 'SCANNING';
  file.lockedBy = undefined;
  file.lockReason = undefined;
  await file.save();

  await auditService.log(req, 'FILE_UNLOCK', { type: 'File', id: file._id }, { ownerId: file.ownerId });
  return sendSuccess(res, { file: serializeFile(file) });
});

module.exports = { createUploadUrl, confirmUpload, listFiles, getFile, getDownloadUrl, deleteFile, lockFile, unlockFile };
