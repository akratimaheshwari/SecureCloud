'use strict';
const File = require('../db/models/File');
const DlpResult = require('../db/models/DlpResult');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { HIGH_RISK_THRESHOLD } = require('../utils/constants');
const classificationService = require('../services/classificationService');
const riskService = require('../services/riskService');
const suspiciousService = require('../services/suspiciousService');
const securityEventService = require('../services/securityEventService');
const auditService = require('../services/auditService');
const { getFileForUser } = require('../services/fileAccessService');

// POST /api/dlp/scan-result   (Lambda only, protected by verifyLambdaKey)
// Saves the scan, computes severity -> classification -> risk, updates the File.
const saveScanResult = asyncHandler(async (req, res) => {
  const { fileId, detectedTypes, scanStatus, severity: hintedSeverity } = req.body;
  // Normalise count keys to upper case so "pan" and "PAN" cannot diverge
  const matchCounts = Object.fromEntries(
  Object.entries(req.body.matchCounts || {}).map(([k, v]) => [k.toUpperCase(), v])
);

  const file = await File.findById(fileId);
  if (!file || file.status === 'DELETED') throw new ApiError(404, 'File not found', 'FILE_NOT_FOUND');

  // Fill the PENDING record created by /confirm if there is one, otherwise create a new record
  const result = (await DlpResult.findOne({ fileId, scanStatus: 'PENDING' }).sort({ createdAt: -1 })) || new DlpResult({ fileId });
  result.detectedTypes = [...new Set(detectedTypes)];
  result.matchCounts = matchCounts;
  result.scanStatus = scanStatus;
  result.scannedAt = new Date();

  // FAILED / UNSUPPORTED scans carry no findings: classification and risk stay as they were.
  if (scanStatus !== 'COMPLETED') {
    result.severity = scanStatus === 'FAILED' ? 'HIGH' : 'NONE';
    await result.save();
    if (scanStatus === 'UNSUPPORTED' && file.status === 'SCANNING') { // nothing more to scan, so release the file
      file.status = 'ACTIVE';
      await file.save();
    } else if (scanStatus === 'FAILED' && file.status === 'SCANNING') {
      file.status = 'QUARANTINED';
      file.lockReason = 'DLP scan failed during processing; quarantined for administrator review';
      await file.save();
      await securityEventService.create({
        userId: file.ownerId,
        fileId: file._id,
        eventType: 'HIGH_RISK_UPLOAD',
        severity: 'HIGH',
        actionTaken: 'File quarantined due to scan failure',
        reason: 'Automated DLP scan reported failure during processing',
      });
    }
    await auditService.log(req, 'DLP_SCAN_RESULT', { type: 'File', id: file._id }, { scanStatus, status: file.status });
    return sendSuccess(res, { fileId: file._id, scanStatus, status: file.status });
  }

  // 1) severity (the API never goes below what the scanner hinted)  2) classification  3) risk
  const computed = classificationService.computeSeverity(result.detectedTypes, matchCounts);
  const severity = hintedSeverity ? classificationService.maxSeverity(hintedSeverity, computed.severity) : computed.severity;
  const { classification, reason: classificationReason } = classificationService.classify({ detectedTypes: result.detectedTypes, severity });
  const recentDownloads = await suspiciousService.countRecentDownloads(file.ownerId);
  const risk = riskService.calculateRisk({ detectedTypes: result.detectedTypes, classification, recentDownloads });

  result.severity = severity;
  await result.save();

  if (req.body.sha256Hash && !file.sha256Hash) file.sha256Hash = req.body.sha256Hash;
  file.classification = classification;
  file.riskScore = risk.score;
  if (file.status === 'SCANNING') file.status = 'ACTIVE'; // UPLOADING (scan beat /confirm) and LOCKED stay as they are
  await file.save();

  if (risk.score >= HIGH_RISK_THRESHOLD) {
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
    scanStatus, severity, classification, riskScore: risk.score, detectedTypes: result.detectedTypes,
  });

  return sendSuccess(res, {
    fileId: file._id,
    scanStatus,
    severity,
    classification,
    classificationReason,
    riskScore: risk.score,
    riskLevel: risk.level,
    breakdown: risk.breakdown,
    status: file.status,
  });
});

// GET /api/dlp/results/:fileId   (owner or admin) - newest first, last 10 scans
const getResults = asyncHandler(async (req, res) => {
  const file = await getFileForUser(req, req.params.fileId, { allowAdmin: true });
  const results = await DlpResult.find({ fileId: file._id }).sort({ createdAt: -1 }).limit(10).lean();
  return sendSuccess(res, { fileId: file._id, classification: file.classification, riskScore: file.riskScore, results });
});

module.exports = { saveScanResult, getResults };
