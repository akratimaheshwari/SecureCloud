'use strict';
const SecurityEvent = require('../db/models/SecurityEvent');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { parsePagination, pageMeta } = require('../utils/pagination');

function buildFilter(q, base = {}) {
  const filter = { ...base };
  if (q.severity) filter.severity = q.severity;
  if (q.type) filter.eventType = q.type;
  if (q.userId) filter.userId = q.userId;
  if (q.resolved !== undefined) filter.resolved = q.resolved;
  if (q.from || q.to) {
    filter.createdAt = {};
    if (q.from) filter.createdAt.$gte = q.from;
    if (q.to) filter.createdAt.$lte = q.to;
  }
  return filter;
}

async function list(req, res, filter) {
  const { page, limit, skip } = parsePagination(req.query);
  const [items, total] = await Promise.all([
    SecurityEvent.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate('userId', 'name email').populate('fileId', 'originalName classification').lean(),
    SecurityEvent.countDocuments(filter),
  ]);
  return sendSuccess(res, items, 200, { pagination: pageMeta(total, page, limit) });
}

// GET /api/events/mine   (a user's own events only; userId filter is not accepted here)
const listMine = asyncHandler((req, res) => list(req, res, buildFilter(req.query, { userId: req.user._id })));

// GET /api/events   (admin) filters: severity, type, userId, resolved, from, to
const listAll = asyncHandler((req, res) => list(req, res, buildFilter(req.query)));

module.exports = { listMine, listAll };
