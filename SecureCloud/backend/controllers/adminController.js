'use strict';
const User = require('../db/models/User');
const File = require('../db/models/File');
const SharingLink = require('../db/models/SharingLink');
const SecurityEvent = require('../db/models/SecurityEvent');
const AuditLog = require('../db/models/AuditLog');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { parsePagination, pageMeta } = require('../utils/pagination');
const { escapeRegex } = require('../utils/strings');
const { CLASSIFICATIONS, HIGH_RISK_THRESHOLD, SUSPICIOUS_EVENT_TYPES } = require('../utils/constants');
const auditService = require('../services/auditService');

const DAY_MS = 24 * 60 * 60 * 1000;
const NOT_DELETED = { status: { $ne: 'DELETED' } };

// Midnight UTC, n days ago (n = 13 gives a 14-day window including today)
const utcDayStart = (daysAgo) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() - daysAgo * DAY_MS);
};

// GET /api/admin/stats
const getStats = asyncHandler(async (req, res) => {
  const since = utcDayStart(13);

  const [totalFiles, highRiskFiles, blockedShares, suspiciousEvents, lockedFiles, bySensitivity, eventsByDay, downloads, decisions] = await Promise.all([
    File.countDocuments(NOT_DELETED),
    File.countDocuments({ ...NOT_DELETED, riskScore: { $gte: HIGH_RISK_THRESHOLD } }),
    SecurityEvent.countDocuments({ eventType: 'BLOCKED_SHARE' }),
    SecurityEvent.countDocuments({ eventType: { $in: SUSPICIOUS_EVENT_TYPES } }),
    File.countDocuments({ status: 'LOCKED' }),
    File.aggregate([{ $match: NOT_DELETED }, { $group: { _id: '$classification', count: { $sum: 1 } } }]),
    SecurityEvent.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } }, count: { $sum: 1 } } },
    ]),
    AuditLog.aggregate([
      { $match: { action: 'DOWNLOAD', userId: { $ne: null }, createdAt: { $gte: since } } },
      { $group: { _id: '$userId', downloads: { $sum: 1 } } },
      { $sort: { downloads: -1 } },
      { $limit: 10 },
      { $lookup: { from: User.collection.name, localField: '_id', foreignField: '_id', as: 'user' } },
      { $project: { _id: 0, userId: '$_id', downloads: 1, name: { $arrayElemAt: ['$user.name', 0] }, email: { $arrayElemAt: ['$user.email', 0] } } },
    ]),
    SharingLink.aggregate([{ $group: { _id: '$policyDecision', count: { $sum: 1 } } }]),
  ]);

  const filesBySensitivity = Object.fromEntries(CLASSIFICATIONS.map((c) => [c, 0]));
  bySensitivity.forEach((r) => { filesBySensitivity[r._id] = r.count; });

  // One entry per day for the last 14 days, zero-filled
  const dayCounts = Object.fromEntries(eventsByDay.map((r) => [r._id, r.count]));
  const eventsOverTime = Array.from({ length: 14 }, (_, i) => {
    const date = utcDayStart(13 - i).toISOString().slice(0, 10);
    return { date, count: dayCounts[date] || 0 };
  });

  const d = Object.fromEntries(decisions.map((r) => [r._id, r.count]));
  const allowedVsBlocked = {
    allowed: (d.ALLOW || 0) + (d.WARN || 0), // ALLOW + WARN (warned shares are still allowed)
    blocked: d.BLOCK || 0,
    pendingApproval: d.REQUIRE_APPROVAL || 0,
  };

  return sendSuccess(res, {
    totalFiles, highRiskFiles, blockedShares, suspiciousEvents, lockedFiles,
    filesBySensitivity, eventsOverTime, downloadsByUser: downloads, allowedVsBlocked,
  });
});

// GET /api/admin/users
const listUsers = asyncHandler(async (req, res) => {
  const { q, role } = req.query;
  const { page, limit, skip } = parsePagination(req.query);

  const filter = {};
  if (role) filter.role = role;
  if (q) {
    const rx = { $regex: escapeRegex(q), $options: 'i' };
    filter.$or = [{ name: rx }, { email: rx }];
  }
  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(), // passwordHash is select:false
    User.countDocuments(filter),
  ]);
  return sendSuccess(res, items, 200, { pagination: pageMeta(total, page, limit) });
});

// PATCH /api/admin/users/:id/role
const changeRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  if (req.params.id === String(req.user._id)) throw new ApiError(400, 'You cannot change your own role', 'INVALID_OPERATION');

  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');

  const previousRole = user.role;
  user.role = role;
  await user.save();

  await auditService.log(req, 'ROLE_CHANGE', { type: 'User', id: user._id }, { previousRole, newRole: role, email: user.email });
  return sendSuccess(res, { user });
});

module.exports = { getStats, listUsers, changeRole };
