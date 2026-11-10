'use strict';
// Joi schemas used with the validate() middleware. Unknown fields are stripped (no mass assignment).
const Joi = require('joi');
const env = require('../config/env');
const { EVENT_TYPES, EVENT_SEVERITIES, SEVERITIES } = require('./constants');

const objectId = Joi.string().hex().length(24);
const email = Joi.string().trim().lowercase().email({ tlds: { allow: false } }).max(254);
const page = Joi.number().integer().min(1).default(1);
const limit = (max = 100) => Joi.number().integer().min(1).max(max).default(20);
const isoDate = Joi.date().iso();

const schemas = {
  // ---- params ----
  idParam: Joi.object({ id: objectId.required() }),
  fileIdParam: Joi.object({ fileId: objectId.required() }),
  tokenParam: Joi.object({ token: Joi.string().pattern(/^[A-Za-z0-9_-]{20,128}$/).required() }),

  // ---- auth ----
  register: Joi.object({
    name: Joi.string().trim().min(2).max(80).required(),
    email: email.required(),
    // bcrypt only uses the first 72 bytes, so cap the length
    password: Joi.string().min(8).max(72).pattern(/[A-Za-z]/).pattern(/\d/).required()
      .messages({ 'string.pattern.base': 'password must contain at least one letter and one number' }),
  }),
  login: Joi.object({ email: email.required(), password: Joi.string().max(72).required() }),

  // ---- files ----
  uploadUrl: Joi.object({
    fileName: Joi.string().trim().min(1).max(255).required(),
    fileType: Joi.string().trim().pattern(/^[\w.+-]+\/[\w.+-]+$/).max(127).required(),
    size: Joi.number().integer().min(1).max(env.maxFileSizeBytes).required(),
  }),
  listFiles: Joi.object({
    page, limit: limit(),
    q: Joi.string().trim().max(100),
    classification: Joi.string().valid('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'HIGHLY_CONFIDENTIAL'),
    status: Joi.string().valid('UPLOADING', 'SCANNING', 'ACTIVE', 'LOCKED', 'QUARANTINED'),
  }),
  confirmUpload: Joi.object({
    sha256Hash: Joi.string().lowercase().pattern(/^[a-f0-9]{64}$/),
  }).default({}),
  lockFile: Joi.object({ reason: Joi.string().trim().max(500) }),

  // ---- shares ----
  createShare: Joi.object({
    fileId: objectId.required(),
    recipientEmail: email.required(),
    expiresInHours: Joi.number().integer().min(1).max(720).default(24),
    maxDownloads: Joi.number().integer().min(1).max(100).default(5),
  }),
  listShares: Joi.object({
    page, limit: limit(),
    status: Joi.string().valid('ACTIVE', 'REVOKED', 'EXPIRED', 'BLOCKED', 'PENDING_APPROVAL'),
  }),
  pageOnly: Joi.object({ page, limit: limit() }),
  rejectShare: Joi.object({ reason: Joi.string().trim().max(500) }),

  // ---- DLP (called by Lambda) ----
  scanResult: Joi.object({
    fileId: objectId.required(),
    detectedTypes: Joi.array().items(Joi.string().trim().uppercase().max(50)).max(50).default([]),
    // { PAN: 3, EMAIL: 12 }. Keys become Mongo Map keys, so keep them simple.
    matchCounts: Joi.object()
      .pattern(Joi.string().pattern(/^[A-Za-z0-9_]{1,50}$/), Joi.number().integer().min(0).max(1e7))
      .unknown(false)
      .default({}),
    scanStatus: Joi.string().valid('COMPLETED', 'FAILED', 'UNSUPPORTED').default('COMPLETED'),
    severity: Joi.string().valid(...SEVERITIES), // optional hint from the scanner; the API never lowers its own result
    sha256Hash: Joi.string().lowercase().pattern(/^[a-f0-9]{64}$/),
  }),

  // ---- events / audit ----
  eventsMine: Joi.object({
    page, limit: limit(),
    severity: Joi.string().valid(...EVENT_SEVERITIES),
    type: Joi.string().valid(...EVENT_TYPES),
    from: isoDate, to: isoDate.min(Joi.ref('from')),
  }),
  eventsAdmin: Joi.object({
    page, limit: limit(),
    severity: Joi.string().valid(...EVENT_SEVERITIES),
    type: Joi.string().valid(...EVENT_TYPES),
    userId: objectId,
    resolved: Joi.boolean(),
    from: isoDate, to: isoDate.min(Joi.ref('from')),
  }),
  auditQuery: Joi.object({
    page, limit: limit(),
    userId: objectId,
    action: Joi.string().trim().uppercase().max(60),
    targetType: Joi.string().trim().max(60),
    from: isoDate, to: isoDate.min(Joi.ref('from')),
  }),

  // ---- admin ----
  listUsers: Joi.object({
    page, limit: limit(),
    q: Joi.string().trim().max(100),
    role: Joi.string().valid('user', 'admin'),
  }),
  changeRole: Joi.object({ role: Joi.string().valid('user', 'admin').required() }),
};

module.exports = schemas;
