'use strict';
const ApiError = require('../utils/ApiError');
const env = require('../config/env');

// 404 for unknown routes
const notFound = (req, res, next) => next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`, 'ROUTE_NOT_FOUND'));

// Every error leaves the API as: { success:false, error:{ code, message, details?, requestId } }
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Internal server error';
  let details;

  if (err.isApiError) {
    ({ statusCode: status, code, message, details } = err);
  } else if (err.name === 'ValidationError' && err.errors) { // Mongoose schema validation
    status = 400; code = 'VALIDATION_ERROR'; message = 'Validation failed';
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err.name === 'CastError') {
    status = 400; code = 'INVALID_ID'; message = `Invalid value for ${err.path}`;
  } else if (err.code === 11000) { // duplicate key
    status = 409; code = 'DUPLICATE_KEY'; message = 'A record with this value already exists';
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    status = 401; code = 'INVALID_TOKEN'; message = 'Invalid or expired token';
  } else if (err.type === 'entity.parse.failed') {
    status = 400; code = 'INVALID_JSON'; message = 'Request body is not valid JSON';
  } else if (err.type === 'entity.too.large') {
    status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Request body is too large';
  }

  if (status >= 500) {
    console.error(`[error] ${req.id} ${req.method} ${req.originalUrl}`, err.stack || err);
    if (env.nodeEnv !== 'production') details = { hint: err.message }; // never expose internals in production
  }

  res.status(status).json({ success: false, error: { code, message, ...(details !== undefined && { details }), requestId: req.id } });
};

module.exports = { notFound, errorHandler };
