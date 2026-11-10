'use strict';
const rateLimit = require('express-rate-limit');
const ApiError = require('../utils/ApiError');

// Common options. Answers go through the central errorHandler so the JSON shape stays consistent.
const base = (message) => ({
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res, next) => next(new ApiError(429, message, 'RATE_LIMITED')),
});

// General API limit (the Lambda callback is exempt: it is protected by its API key + lambdaLimiter)
const apiLimiter = rateLimit({
  ...base('Too many requests, please slow down'),
  windowMs: 15 * 60 * 1000,
  limit: 300,
  skip: (req) => req.originalUrl.startsWith('/api/dlp/scan-result'),
});

// Stricter on login: 10 failed attempts per IP per 15 minutes (successful logins are not counted)
const loginLimiter = rateLimit({
  ...base('Too many login attempts, try again in 15 minutes'),
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
});

// Registration: 20 per IP per hour
const registerLimiter = rateLimit({
  ...base('Too many registrations from this IP, try again later'),
  windowMs: 60 * 60 * 1000,
  limit: 20,
});

// Brute-force guard for the Lambda API key: only failed calls count
const lambdaLimiter = rateLimit({
  ...base('Too many invalid API key attempts'),
  windowMs: 15 * 60 * 1000,
  limit: 30,
  skipSuccessfulRequests: true,
});

module.exports = { apiLimiter, loginLimiter, registerLimiter, lambdaLimiter };
