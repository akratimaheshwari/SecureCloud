'use strict';
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const securityEventService = require('../services/securityEventService');
const auditService = require('../services/auditService');

// Usage: router.get('/x', authenticate, authorizeRoles('admin'), handler)
module.exports = (...roles) =>
  asyncHandler(async (req, res, next) => {
    if (!req.user) throw new ApiError(401, 'Authentication required', 'AUTH_REQUIRED');
    if (roles.includes(req.user.role)) return next();

    await securityEventService.create({
      userId: req.user._id,
      eventType: 'UNAUTHORIZED_ACCESS',
      severity: 'MEDIUM',
      actionTaken: 'Request denied (403)',
      reason: `Role "${req.user.role}" tried ${req.method} ${req.baseUrl}${req.path}, which needs: ${roles.join(', ')}`,
    });
    await auditService.log(req, 'ACCESS_DENIED', { type: 'Route', id: undefined }, { path: `${req.baseUrl}${req.path}`, required: roles });
    throw new ApiError(403, 'You do not have permission to perform this action', 'FORBIDDEN');
  });
