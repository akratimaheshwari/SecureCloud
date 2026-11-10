'use strict';
const User = require('../db/models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken } = require('../utils/token');

// Reads "Authorization: Bearer <jwt>". The user is re-loaded from the DB on every request so that
// disabled accounts and role changes take effect immediately.
async function resolveUser(req) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) return null;

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    const expired = err.name === 'TokenExpiredError';
    throw new ApiError(401, expired ? 'Token expired' : 'Invalid token', expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN');
  }

  const user = await User.findById(payload.sub);
  if (!user) throw new ApiError(401, 'Invalid token', 'INVALID_TOKEN');
  if (!user.isActive) throw new ApiError(403, 'Account is disabled', 'ACCOUNT_DISABLED');
  return user;
}

// Login required
const authenticate = asyncHandler(async (req, res, next) => {
  const user = await resolveUser(req);
  if (!user) throw new ApiError(401, 'Authentication required', 'AUTH_REQUIRED');
  req.user = user;
  next();
});

// Login optional (used by token-based share links): anonymous if no header, 401 if header is bad
const optionalAuthenticate = asyncHandler(async (req, res, next) => {
  const user = await resolveUser(req);
  if (user) req.user = user;
  next();
});

module.exports = { authenticate, optionalAuthenticate };
