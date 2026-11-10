'use strict';
const SecurityEvent = require('../db/models/SecurityEvent');

// Maps a risk level to an event severity
const SEVERITY_BY_LEVEL = { Low: 'LOW', Medium: 'MEDIUM', High: 'HIGH', Critical: 'CRITICAL' };
const severityFromLevel = (level) => SEVERITY_BY_LEVEL[level] || 'MEDIUM';

// Best effort: a failure to record an event must never break the user's request.
async function create({ userId, fileId, eventType, severity = 'MEDIUM', actionTaken, reason, riskScore }) {
  try {
    return await SecurityEvent.create({ userId, fileId, eventType, severity, actionTaken, reason, riskScore });
  } catch (err) {
    console.error('[security-event] failed to record event:', err.message);
    return null;
  }
}

module.exports = { create, severityFromLevel };
