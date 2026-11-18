'use strict';
const crypto = require('crypto');
const File = require('../db/models/File');
const DlpResult = require('../db/models/DlpResult');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { HIGH_RISK_THRESHOLD, CLASSIFICATIONS } = require('../utils/constants');
const policy = require('../services/dlpPolicyService');
const fileSecurityService = require('../services/fileSecurityService');
const classificationService = require('../services/classificationService');
const riskService = require('../services/riskService');
const suspiciousService = require('../services/suspiciousService');
const securityEventService = require('../services/securityEventService');
const auditService = require('../services/auditService');
const { getFileForUser } = require('../services/fileAccessService');

// Stable fingerprint of a callback: the same Lambda payload retried always hashes the same.
function payloadFingerprint({ scanStatus, types, matchCounts, sha256Hash, hintedSeverity }) {
  const counts = Object.keys(matchCounts).sort().map((k) => [k, matchCounts[k]]);
  const canonical = JSON.stringify({ scanStatus, types: [...types].sort(), counts, sha256Hash: sha256Hash || '', hintedSeverity: hintedSeverity || '' });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

const higherClassification = (a, b) => (CLASSIFICATIONS.indexOf(b) > CLASSIFICATIONS.indexOf(a) ? b : a);

// POST /api/dlp/scan-result   (Lambda only, protected by verifyLambdaKey)
// 1) idempotently store the scan  2) severity -> classification -> risk  3) update the File's DLP fields
// 4) let the central policy decide File.status (fileSecurityService). This handler never sets ACTIVE itself:
//    a finished scan is not an approval, and the same code path is used by confirmUpload.
const saveScanResult = asyncHandler(async (req, res) => {
  const { fileId, detectedTypes, scanStatus, severity: hintedSeverity, sha256Hash } = req.body;
  // Normalise count keys to upper case so "pan" and "PAN" cannot diverge
  const matchCounts = Object.fromEntries(
    Object.entries(req.body.matchCounts || {}).map(([k, v]) => [k.toUpperCase(), v]),
  );

  const file = await File.findById(fileId);
  if (!file || file.status === 'DELETED') throw new ApiError(404, 'File not found', 'FILE_NOT_FOUND');

  const types = [...new Set(detectedTypes)];

  // Severity: the API never goes below what the scanner hinted. FAILED/UNSUPPORTED carry no findings.
  let severity = scanStatus === 'FAILED' ? 'HIGH' : 'NONE';
  let classification = file.classification;
  let classificationReason;
  let risk = null;
  if (scanStatus === 'COMPLETED') {
    const computed = classificationService.computeSeverity(types, matchCounts);
    severity = hintedSeverity ? classificationService.maxSeverity(hintedSeverity, computed.severity) : computed.severity;
    ({ classification, reason: classificationReason } = classificationService.classify({ detectedTypes: types, severity }));
    const recentDownloads = await suspiciousService.countRecentDownloads(file.ownerId);
    // severity is passed so the score can never contradict the scanner's verdict (Issue 5)
    risk = riskService.calculateRisk({ detectedTypes: types, classification, severity, recentDownloads });
  }

  // ---- Idempotent persistence: a retried identical callback returns the existing record ----
  const payloadHash = payloadFingerprint({ scanStatus, types, matchCounts, sha256Hash, hintedSeverity });
  let result = await DlpResult.findOne({ fileId, payloadHash });
  let duplicate = Boolean(result);
  if (!result) {
    try {
      // Fill the PENDING record created by /confirm if there is one, otherwise create a new record
      result = (await DlpResult.findOne({ fileId, scanStatus: 'PENDING' }).sort({ createdAt: -1 })) || new DlpResult({ fileId });
      result.detectedTypes = types;
      result.matchCounts = matchCounts;
      result.scanStatus = scanStatus;
      result.severity = severity;
      result.scannedAt = new Date();
      result.payloadHash = payloadHash;
      await result.save();
    } catch (err) {
      if (err.code !== 11000) throw err; // two identical callbacks raced: the unique index let only one in
      result = await DlpResult.findOne({ fileId, payloadHash });
      duplicate = true;
    }
  }

  // ---- File DLP fields: only ever raised (a later cleaner scan cannot loosen an earlier finding) ----
  const fileUpdate = {};
  if (sha256Hash) fileUpdate.sha256Hash = sha256Hash; // the scanner's hash is authoritative over a client-supplied one
  if (scanStatus === 'COMPLETED') {
    fileUpdate.classification = higherClassification(file.classification, classification);
    fileUpdate.riskScore = Math.max(file.riskScore || 0, risk.score);
    fileUpdate.dlpSeverity = policy.maxSeverity(file.dlpSeverity || 'NONE', severity);
  }
  if (Object.keys(fileUpdate).length) await File.updateOne({ _id: file._id, status: { $ne: 'DELETED' } }, { $set: fileUpdate });
  if (sha256Hash && file.sha256Hash && file.sha256Hash !== sha256Hash) {
    await auditService.log(req, 'HASH_MISMATCH', { type: 'File', id: file._id }, { note: 'client-supplied hash differs from scanner hash; scanner value kept' });
  }

  // ---- Status: decided only by the policy, atomically, identical to the confirmUpload path ----
  const outcome = await fileSecurityService.reconcileStatus(file._id, { req });
  const current = outcome.file || file;

  if (!duplicate && !outcome.changed && risk && risk.score >= HIGH_RISK_THRESHOLD) {
    await securityEventService.create({
      userId: file.ownerId,
      fileId: file._id,
      eventType: 'HIGH_RISK_UPLOAD',
      severity: securityEventService.severityFromLevel(risk.level),
      actionTaken: 'Flagged for administrator review',
      reason: `Risk ${risk.score} (${risk.level}): ${risk.breakdown.map((b) => b.factor).join(', ')}`,
      riskScore: risk.score,
    });
  }

  await auditService.log(req, 'DLP_SCAN_RESULT', { type: 'File', id: file._id }, {
    scanStatus, severity, duplicate, status: current.status, classification: current.classification,
    riskScore: current.riskScore, detectedTypes: types,
  });

  return sendSuccess(res, {
    fileId: file._id,
    scanStatus,
    severity,
    duplicate,
    classification: current.classification,
    classificationReason,
    riskScore: current.riskScore,
    riskLevel: riskService.riskLevel(current.riskScore || 0),
    breakdown: risk ? risk.breakdown : [],
    status: current.status,
  });
});

// GET /api/dlp/results/:fileId   (owner or admin) - newest first, last 10 scans
const getResults = asyncHandler(async (req, res) => {
  const file = await getFileForUser(req, req.params.fileId, { allowAdmin: true });
  const results = await DlpResult.find({ fileId: file._id }).sort({ createdAt: -1 }).limit(10).lean();
  return sendSuccess(res, { fileId: file._id, classification: file.classification, riskScore: file.riskScore, results });
});

module.exports = { saveScanResult, getResults };
