'use strict';
// Error with an HTTP status and a machine-readable code. The errorHandler turns it into JSON.
class ApiError extends Error {
  constructor(statusCode, message, code = 'ERROR', details) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isApiError = true;
    if (Error.captureStackTrace) Error.captureStackTrace(this, ApiError);
  }
}
module.exports = ApiError;
