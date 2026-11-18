'use strict';
/**
 * Applies the DLP policy (dlpPolicyService) to a File document, safely under concurrency.
 *
 * WHY THIS EXISTS: the Lambda callback (saveScanResult) and confirmUpload can run in either order,
 * and the Lambda can re-scan an object later. Both flows call reconcileStatus(), which
 *   1. re-reads the file and its latest finished scan,
 *   2. computes the required status,
 *   3. writes it with a status-conditioned atomic update (retrying if another request won the race).
 * Rules enforced here:
 *   - SCANNING resolves to exactly the policy outcome.
 *   - ACTIVE / RESTRICTED can only be TIGHTENED (e.g. a later CRITICAL scan quarantines an ACTIVE file).
 *   - QUARANTINED is never changed automatically; only an admin release (-> RESTRICTED) leaves it.
 *   - LOCKED stays locked; the stricter status is remembered for unlock.
 *   - UPLOADING is untouched: confirmUpload moves it to SCANNING and then calls reconcileStatus().
 * Nothing here can ever loosen a status, so confirm-after-scan and scan-after-confirm converge.
 */
const File = require('../db/models/File');
const DlpResult = require('../db/models/DlpResult');
const policy = require('./dlpPolicyService');
const securityEventService = require('./securityEventService');
const auditService = require('./auditService');
const ApiError = require('../utils/ApiError');
const s3Service = require('./s3Service');
const { DLP_STATUS_ORDER } = require('../utils/constants');

const MAX_ATTEMPTS = 3;
const rank = (s) => DLP_STATUS_ORDER.indexOf(s);

// Newest scan that actually finished (a PENDING placeholder is not a result).
const latestFinishedScan = (fileId) =>
  DlpResult.findOne({ fileId, scanStatus: { $ne: 'PENDING' } }).sort({ scannedAt: -1, createdAt: -1 });

function reasonFor(target, latestScan) {
  const outcome = policy.decideOutcome(latestScan);
  return outcome.status === target ? outcome.reason : `An earlier DLP finding requires status ${target}`;
}

async function recordTransition(req, file, from, to, reason) {
  if (to === 'RESTRICTED' || to === 'QUARANTINED') {
    await securityEventService.create({
      userId: file.ownerId,
      fileId: file._id,
      eventType: 'HIGH_RISK_UPLOAD',
      severity: to === 'QUARANTINED' ? 'CRITICAL' : 'HIGH',
      actionTaken: to === 'QUARANTINED' ? 'File quarantined automatically' : 'File restricted automatically',
      reason,
      riskScore: file.riskScore,
    });
  }
  await auditService.log(req, 'FILE_STATUS_CHANGE', { type: 'File', id: file._id }, { from, to, reason, dlpSeverity: file.dlpSeverity });
}

/**
 * Bring file.status in line with the DLP policy. Idempotent: calling it twice changes nothing the second time.
 * Returns { file, changed, from, to } where `file` is the freshest document.
 */
async function reconcileStatus(fileId, { req = null } = {}) {
  let file;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    file = await File.findById(fileId);
    if (!file || file.status === 'DELETED') return { file, changed: false };

    const latestScan = await latestFinishedScan(fileId);
    const floor = policy.floorStatus({ latestScan, dlpSeverity: file.dlpSeverity, reviewed: Boolean(file.reviewedAt) });
    if (floor === null) return { file, changed: false }; // no finished scan yet: stay as is

    const from = file.status;
    let filter = null;
    let update = null;

    if (from === 'SCANNING') {
      filter = { _id: file._id, status: 'SCANNING' };
      update = { status: floor };
      if (floor !== 'ACTIVE') update.lockReason = reasonFor(floor, latestScan);
    } else if ((from === 'ACTIVE' || from === 'RESTRICTED') && rank(floor) > rank(from)) {
      filter = { _id: file._id, status: from }; // tighten only
      update = { status: floor, lockReason: reasonFor(floor, latestScan) };
    } else if (from === 'LOCKED') {
      const before = policy.stricterStatus(DLP_STATUS_ORDER.includes(file.statusBeforeLock) ? file.statusBeforeLock : 'ACTIVE', floor);
      if (before !== file.statusBeforeLock) {
        filter = { _id: file._id, status: 'LOCKED' };
        update = { statusBeforeLock: before };
      }
    }
    if (!filter) return { file, changed: false }; // nothing to do (QUARANTINED, UPLOADING, already compliant)

    const res = await File.updateOne(filter, { $set: update });
    if (res.modifiedCount === 1) {
      const fresh = await File.findById(fileId);
      const to = update.status || from;
      if (update.status) await recordTransition(req, fresh, from, to, update.lockReason || reasonFor(to, latestScan));
      return { file: fresh, changed: Boolean(update.status), from, to };
    }
    // Someone else changed the status between our read and write: loop and decide again.
  }
  return { file: await File.findById(fileId), changed: false };
}

/**
 * Presigned-PUT replay guard. The upload URL stays valid for 15 minutes, so someone could PUT different
 * content to the same key after the file was scanned. The object's ETag is recorded at confirm time; if it
 * changed, the file is quarantined (no automatic way back) and the download is refused.
 * Used by every path that hands out a download URL (owner download and share links).
 */
async function verifyObjectIntegrity(file, req = null) {
  const head = await s3Service.headObject(file.s3Key);
  if (!head) throw new ApiError(404, 'File content is no longer available', 'OBJECT_MISSING');
  if (file.s3ETag && head.eTag !== file.s3ETag) {
    await File.updateOne({ _id: file._id, status: { $in: ['ACTIVE', 'RESTRICTED'] } }, { $set: { status: 'QUARANTINED', lockReason: 'Stored object changed after it was scanned; quarantined pending security review' } });
    await securityEventService.create({
      userId: file.ownerId, fileId: file._id, eventType: 'HIGH_RISK_UPLOAD', severity: 'HIGH',
      actionTaken: 'File quarantined', reason: 'S3 object was replaced after the DLP scan',
    });
    await auditService.log(req, 'ACCESS_DENIED', { type: 'File', id: file._id }, { reason: 'object modified after scan' });
    throw new ApiError(403, 'This file changed after it was scanned and is quarantined pending security review', 'FILE_MODIFIED');
  }
  // Files uploaded before this check existed have no baseline: record it on first access
  if (!file.s3ETag && head.eTag) await File.updateOne({ _id: file._id, s3ETag: { $exists: false } }, { $set: { s3ETag: head.eTag } });
}

module.exports = { reconcileStatus, latestFinishedScan, verifyObjectIntegrity };
