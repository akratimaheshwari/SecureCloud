'use strict';
const AuditLog = require('../db/models/AuditLog');
const SecurityEvent = require('../db/models/SecurityEvent');
const auditService = require('./auditService');
const securityEventService = require('./securityEventService');
const { DOWNLOAD_BURST_LIMIT, DOWNLOAD_WINDOW_MS } = require('../utils/constants');

// Downloads by this user in the last hour (counted from DOWNLOAD audit entries)
async function countRecentDownloads(userId, now = new Date()) {
  if (!userId) return 0;
  return AuditLog.countDocuments({ userId, action: 'DOWNLOAD', createdAt: { $gte: new Date(now.getTime() - DOWNLOAD_WINDOW_MS) } });
}

/**
 * Rule: more than 10 downloads by one user within 1 hour => SUSPICIOUS_DOWNLOADS event.
 * Call AFTER the DOWNLOAD audit entry is written so the current download is counted.
 * At most one open event per user per hour is created, to avoid flooding the dashboard.
 */
async function checkDownloadBurst(req, userId) {
  const count = await countRecentDownloads(userId);
  if (count <= DOWNLOAD_BURST_LIMIT) return { suspicious: false, count };

  const since = new Date(Date.now() - DOWNLOAD_WINDOW_MS);
  const alreadyFlagged = await SecurityEvent.exists({ userId, eventType: 'SUSPICIOUS_DOWNLOADS', resolved: false, createdAt: { $gte: since } });
  if (!alreadyFlagged) {
    await securityEventService.create({
      userId,
      eventType: 'SUSPICIOUS_DOWNLOADS',
      severity: 'HIGH',
      actionTaken: 'Flagged for administrator review',
      reason: `${count} downloads in the last hour (limit ${DOWNLOAD_BURST_LIMIT})`,
    });
    await auditService.log(req, 'SUSPICIOUS_ACTIVITY', { type: 'User', id: userId }, { downloadsLastHour: count });
  }
  return { suspicious: true, count };
}

module.exports = { countRecentDownloads, checkDownloadBurst };
