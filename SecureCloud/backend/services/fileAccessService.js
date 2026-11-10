'use strict';
const File = require('../db/models/File');
const ApiError = require('../utils/ApiError');
const securityEventService = require('./securityEventService');
const auditService = require('./auditService');

/**
 * Loads a file and enforces ownership. Deleted files look like they do not exist (404).
 * Another user's file => 403, a UNAUTHORIZED_ACCESS event and an audit entry.
 * allowAdmin: let admins through (metadata views, delete) - downloads stay owner-only.
 */
async function getFileForUser(req, id, { allowAdmin = false } = {}) {
  const file = await File.findById(id);
  if (!file || file.status === 'DELETED') throw new ApiError(404, 'File not found', 'FILE_NOT_FOUND');

  const isOwner = file.ownerId.equals(req.user._id);
  const isAdmin = req.user.role === 'admin';
  if (isOwner || (allowAdmin && isAdmin)) return file;

  await securityEventService.create({
    userId: req.user._id,
    fileId: file._id,
    eventType: 'UNAUTHORIZED_ACCESS',
    severity: 'MEDIUM',
    actionTaken: 'Access denied (403)',
    reason: `User tried to access a file they do not own (${req.method} ${req.baseUrl}${req.path})`,
  });
  await auditService.log(req, 'ACCESS_DENIED', { type: 'File', id: file._id }, { path: `${req.baseUrl}${req.path}` });
  throw new ApiError(403, 'You do not have access to this file', 'FORBIDDEN');
}

module.exports = { getFileForUser };
