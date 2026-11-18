'use strict';
/**
 * DLP security policy: the ONE place that decides which File.status a scan result produces.
 * Pure functions (no DB, no I/O) so every controller shares identical, testable rules.
 *
 *   scan result                       -> file status
 *   --------------------------------------------------
 *   no result yet / PENDING           -> SCANNING
 *   COMPLETED, severity NONE or LOW   -> ACTIVE
 *   COMPLETED, severity MEDIUM        -> ACTIVE (+ warning flag shown to the owner)
 *   COMPLETED, severity HIGH          -> RESTRICTED  (owner-only, never shareable)
 *   COMPLETED, severity CRITICAL      -> QUARANTINED (nobody downloads or shares)
 *   FAILED                            -> QUARANTINED (fail closed)
 *   UNSUPPORTED                       -> UNSUPPORTED_SCAN_STATUS (RESTRICTED): not scannable != clean
 *
 * Completing a scan is NOT security approval: only the table above decides.
 */
const { SEVERITIES, DLP_STATUS_ORDER, UNSUPPORTED_SCAN_STATUS } = require('../utils/constants');

const sevRank = (s) => Math.max(0, SEVERITIES.indexOf(s));
const statusRank = (s) => DLP_STATUS_ORDER.indexOf(s); // -1 for SCANNING/LOCKED/etc.

// The stricter of two DLP statuses (ACTIVE < RESTRICTED < QUARANTINED). Unknown values lose.
function stricterStatus(a, b) {
  return statusRank(b) > statusRank(a) ? b : a;
}

/** Outcome of one scan result. Returns { status, warning, reason }. */
function decideOutcome({ scanStatus, severity } = {}) {
  switch (scanStatus) {
    case 'COMPLETED': {
      if (severity === 'CRITICAL') return { status: 'QUARANTINED', warning: false, reason: 'DLP severity CRITICAL: quarantined pending administrator security review' };
      if (severity === 'HIGH') return { status: 'RESTRICTED', warning: false, reason: 'DLP severity HIGH: restricted (owner-only, sharing blocked)' };
      if (severity === 'MEDIUM') return { status: 'ACTIVE', warning: true, reason: 'DLP severity MEDIUM: active with warning' };
      return { status: 'ACTIVE', warning: false, reason: 'DLP severity NONE/LOW' };
    }
    case 'FAILED':
      return { status: 'QUARANTINED', warning: false, reason: 'DLP scan failed: quarantined pending administrator security review' };
    case 'UNSUPPORTED':
      return { status: UNSUPPORTED_SCAN_STATUS, warning: false, reason: 'File format could not be scanned: restricted until reviewed' };
    default: // PENDING or nothing
      return { status: 'SCANNING', warning: false, reason: 'DLP scan not finished' };
  }
}

/**
 * Minimum status implied by the highest severity ever recorded on the File document. Protects
 * against a later, cleaner re-scan (e.g. the same object re-uploaded) loosening an earlier finding.
 */
function severityFloor(dlpSeverity) {
  if (dlpSeverity === 'CRITICAL') return 'QUARANTINED';
  if (dlpSeverity === 'HIGH') return 'RESTRICTED';
  return 'ACTIVE';
}

/**
 * The status a file must be at least as restrictive as, given its latest finished scan and the worst
 * severity recorded so far. Returns null when no scan has finished (stay SCANNING).
 * reviewed = an administrator already released it from quarantine: QUARANTINED is then capped at
 * RESTRICTED, so a review is never silently undone, but nothing ever returns to ACTIVE.
 */
function floorStatus({ latestScan, dlpSeverity, reviewed = false } = {}) {
  if (!latestScan || latestScan.scanStatus === 'PENDING') return null;
  let floor = stricterStatus(decideOutcome(latestScan).status, severityFloor(dlpSeverity));
  if (reviewed && floor === 'QUARANTINED') floor = 'RESTRICTED';
  return floor;
}

/** Highest of two severities (never lowers). */
const maxSeverity = (a, b) => (sevRank(a) >= sevRank(b) ? a : b);

/**
 * Status after an admin unlocks a LOCKED file. Never simply ACTIVE: it returns to what it was
 * before the lock, but not below what the DLP policy requires (unlock can't bypass DLP).
 */
function statusAfterUnlock({ before, floor }) {
  const prior = DLP_STATUS_ORDER.includes(before) ? before : null; // SCANNING/undefined -> no usable prior
  if (floor === null) return prior || 'SCANNING'; // scan still pending
  return prior ? stricterStatus(prior, floor) : floor;
}

// Whitelists (not blacklists): any status not listed here is denied, including future ones.
const canDownload = (status) => status === 'ACTIVE' || status === 'RESTRICTED'; // owner-only, checked by caller
const canShare = (status) => status === 'ACTIVE';

module.exports = { decideOutcome, floorStatus, severityFloor, stricterStatus, maxSeverity, statusAfterUnlock, canDownload, canShare };
