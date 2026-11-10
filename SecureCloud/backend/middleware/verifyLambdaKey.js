'use strict';
const crypto = require('crypto');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const securityEventService = require('../services/securityEventService');

// Hash both sides so timingSafeEqual always compares equal-length buffers (no length leak).
const digest = (v) => crypto.createHash('sha256').update(String(v)).digest();

// Server-to-server auth for the DLP Lambda: header "x-api-key" must equal LAMBDA_API_KEY.
module.exports = asyncHandler(async (req, res, next) => {
  const provided = req.get('x-api-key');
  if (provided && crypto.timingSafeEqual(digest(provided), digest(env.lambdaApiKey))) return next();

  await securityEventService.create({
    eventType: 'UNAUTHORIZED_ACCESS',
    severity: 'HIGH',
    actionTaken: 'Request rejected (401)',
    reason: `Missing or invalid x-api-key on ${req.method} ${req.originalUrl} from ${req.ip}`,
  });
  throw new ApiError(401, 'Invalid or missing API key', 'INVALID_API_KEY');
});
