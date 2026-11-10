'use strict';
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const User = require('../db/models/User');
const AuditLog = require('../db/models/AuditLog');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { signToken } = require('../utils/token');
const { LOGIN_FAIL_THRESHOLD, LOGIN_FAIL_WINDOW_MS } = require('../utils/constants');
const auditService = require('../services/auditService');
const securityEventService = require('../services/securityEventService');

// Precomputed 12-round bcrypt hash used when an email is unknown,
// preventing user enumeration timing attacks without blocking startup.
const DUMMY_HASH = '$2b$12$zvWzSY6LCxkSyNwAGQY4Ue9g0qUmf1GI1RZYpTPzQ.q35KCeP4ORO';

// POST /api/auth/register  (role is always "user"; admins are created via seed or PATCH /admin/users/:id/role)
const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (await User.exists({ email })) throw new ApiError(409, 'Email is already registered', 'EMAIL_TAKEN');

  const passwordHash = await bcrypt.hash(password, env.bcryptRounds);
  const user = await User.create({ name, email, passwordHash });

  await auditService.log(req, 'REGISTER', { type: 'User', id: user._id }, {}, { userId: user._id });
  return sendSuccess(res, { user, token: signToken(user) }, 201); // User.toJSON removes passwordHash
});

// After 5 failures within 15 minutes for the same email, record a FAILED_LOGIN security event
// (again at every further multiple of 5; HIGH severity from 10 failures).
async function recordFailedLogin(req, email, user) {
  await auditService.log(req, 'LOGIN_FAILED', { type: 'User', id: user ? user._id : undefined }, { email });

  const failures = await AuditLog.countDocuments({
    action: 'LOGIN_FAILED',
    'metadata.email': email,
    createdAt: { $gte: new Date(Date.now() - LOGIN_FAIL_WINDOW_MS) },
  });
  if (failures >= LOGIN_FAIL_THRESHOLD && failures % LOGIN_FAIL_THRESHOLD === 0) {
    await securityEventService.create({
      userId: user ? user._id : undefined,
      eventType: 'FAILED_LOGIN',
      severity: failures >= 2 * LOGIN_FAIL_THRESHOLD ? 'HIGH' : 'MEDIUM',
      actionTaken: 'Logged; login rate limiting is active',
      reason: `${failures} failed login attempts for ${email} in the last ${LOGIN_FAIL_WINDOW_MS / 60000} minutes (IP ${req.ip})`,
    });
  }
}

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+passwordHash');

  const passwordOk = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !passwordOk) {
    await recordFailedLogin(req, email, user);
    throw new ApiError(401, 'Invalid email or password', 'INVALID_CREDENTIALS'); // same message for both cases
  }
  if (!user.isActive) throw new ApiError(403, 'Account is disabled', 'ACCOUNT_DISABLED');

  await auditService.log(req, 'LOGIN', { type: 'User', id: user._id }, {}, { userId: user._id });
  return sendSuccess(res, { user, token: signToken(user) });
});

// GET /api/auth/me
const me = asyncHandler(async (req, res) => sendSuccess(res, { user: req.user }));

module.exports = { register, login, me };
