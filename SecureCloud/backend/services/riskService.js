'use strict';
// Rule-based risk score (0-100). Every point is listed in `breakdown`, so a score can always be explained.
const { RISK_WEIGHTS: W, SENSITIVE_TYPES, DOWNLOAD_BURST_LIMIT } = require('../utils/constants');

// 0-30 Low, 31-60 Medium, 61-80 High, 81-100 Critical
function riskLevel(score) {
  if (score <= 30) return 'Low';
  if (score <= 60) return 'Medium';
  if (score <= 80) return 'High';
  return 'Critical';
}

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Inputs (all optional):
 *   detectedTypes   - DLP types found in the file
 *   classification  - file classification
 *   isExternal      - sharing outside the organisation
 *   recentDownloads - downloads by the user in the last hour
 *   recipientKnown  - false = unknown/unregistered recipient (leave undefined when not sharing)
 *   trustedApproved - true when an admin approved the action
 * Returns { score, level, breakdown: [{ factor, points, reason }] }.
 */
function calculateRisk({ detectedTypes = [], classification = 'PUBLIC', isExternal = false, recentDownloads = 0, recipientKnown, trustedApproved = false } = {}) {
  const breakdown = [];
  const add = (factor, points, reason) => breakdown.push({ factor, points, reason });

  const sensitive = detectedTypes.filter((t) => SENSITIVE_TYPES.includes(t));
  if (sensitive.length) add('SENSITIVE_CONTENT', W.SENSITIVE_CONTENT, `Sensitive personal/financial content detected: ${sensitive.join(', ')}`);
  if (classification === 'HIGHLY_CONFIDENTIAL') add('HIGHLY_CONFIDENTIAL', W.HIGHLY_CONFIDENTIAL, 'File is classified HIGHLY_CONFIDENTIAL');
  if (isExternal) add('EXTERNAL_SHARING', W.EXTERNAL_SHARING, 'Shared outside the owner\'s organisation');
  if (recentDownloads > DOWNLOAD_BURST_LIMIT) {
    add('UNUSUAL_DOWNLOAD_VOLUME', W.UNUSUAL_DOWNLOAD_VOLUME, `${recentDownloads} downloads in the last hour (limit ${DOWNLOAD_BURST_LIMIT})`);
  }
  if (recipientKnown === false) add('UNKNOWN_RECIPIENT', W.UNKNOWN_RECIPIENT, 'Recipient is not a registered user');
  if (trustedApproved) add('TRUSTED_APPROVED_ACTION', W.TRUSTED_APPROVED_ACTION, 'Action was approved by an administrator');

  const score = clamp(breakdown.reduce((sum, b) => sum + b.points, 0));
  return { score, level: riskLevel(score), breakdown };
}

// Used when an admin approves a pending share: the stored score drops by the trusted-approval weight.
function applyTrustedApproval(previousScore = 0) {
  const score = clamp(previousScore + W.TRUSTED_APPROVED_ACTION);
  return {
    score,
    level: riskLevel(score),
    breakdown: [{ factor: 'TRUSTED_APPROVED_ACTION', points: W.TRUSTED_APPROVED_ACTION, reason: 'Action was approved by an administrator' }],
  };
}

module.exports = { calculateRisk, applyTrustedApproval, riskLevel };
