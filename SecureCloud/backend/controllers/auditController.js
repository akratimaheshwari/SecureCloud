'use strict';
const AuditLog = require('../db/models/AuditLog');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { parsePagination, pageMeta } = require('../utils/pagination');

// GET /api/audit   (admin) filters: userId, action, targetType, from, to
const listAudit = asyncHandler(async (req, res) => {
  const { userId, action, targetType, from, to } = req.query;
  const { page, limit, skip } = parsePagination(req.query);

  const filter = {};
  if (userId) filter.userId = userId;
  if (action) filter.action = action;
  if (targetType) filter.targetType = targetType;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }

  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('userId', 'name email').lean(),
    AuditLog.countDocuments(filter),
  ]);
  return sendSuccess(res, items, 200, { pagination: pageMeta(total, page, limit) });
});

module.exports = { listAudit };
