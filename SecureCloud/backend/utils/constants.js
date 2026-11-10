'use strict';
// Central place for every tunable rule value so behaviour stays explainable.
const HOUR_MS = 60 * 60 * 1000;

module.exports = Object.freeze({
  // Keep in sync with models/File.js (ordered low -> high sensitivity)
  CLASSIFICATIONS: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'HIGHLY_CONFIDENTIAL'],
  SEVERITIES: ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
  EVENT_SEVERITIES: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
  EVENT_TYPES: [
    'BLOCKED_SHARE', 'WARNED_SHARE', 'FAILED_LOGIN', 'UNAUTHORIZED_ACCESS', 'EXPIRED_LINK_ACCESS',
    'REVOKED_LINK_ACCESS', 'DOWNLOAD_LIMIT_EXCEEDED', 'SUSPICIOUS_DOWNLOADS', 'HIGH_RISK_UPLOAD',
    'FILE_LOCKED_ACCESS',
  ],

  // --- DLP / classification ---
  FINANCIAL_ID_TYPES: ['PAN', 'ACCOUNT_NUMBER'],
  // Detected types that count as "sensitive personal/financial content" for the risk score
  SENSITIVE_TYPES: ['PAN', 'ACCOUNT_NUMBER', 'SALARY_KEYWORD', 'EMAIL', 'PHONE'],
  BULK_FINANCIAL_THRESHOLD: 10, // this many PAN/account matches in one file => CRITICAL
  BULK_PERSONAL_THRESHOLD: 20, // this many EMAIL+PHONE matches in one file => MEDIUM

  // --- Risk scoring (points added to a 0-100 score) ---
  RISK_WEIGHTS: Object.freeze({
    SENSITIVE_CONTENT: 30,
    HIGHLY_CONFIDENTIAL: 20,
    EXTERNAL_SHARING: 20,
    UNUSUAL_DOWNLOAD_VOLUME: 20,
    UNKNOWN_RECIPIENT: 20,
    TRUSTED_APPROVED_ACTION: -10,
  }),
  HIGH_RISK_THRESHOLD: 61, // >= this on upload creates a HIGH_RISK_UPLOAD event

  // --- Download abuse ---
  DOWNLOAD_BURST_LIMIT: 10, // more than this many downloads...
  DOWNLOAD_WINDOW_MS: HOUR_MS, // ...within this window is suspicious

  // --- Login protection ---
  LOGIN_FAIL_THRESHOLD: 5,
  LOGIN_FAIL_WINDOW_MS: 15 * 60 * 1000,

  // --- Pre-signed URL lifetimes ---
  UPLOAD_URL_TTL_SECONDS: 15 * 60,
  DOWNLOAD_URL_TTL_SECONDS: 5 * 60,

  // Counted as "suspicious" on the admin dashboard
  SUSPICIOUS_EVENT_TYPES: ['SUSPICIOUS_DOWNLOADS', 'UNAUTHORIZED_ACCESS', 'HIGH_RISK_UPLOAD'],
});
