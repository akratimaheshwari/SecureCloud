'use strict';
// Shape DB documents for API responses (hide internals such as s3Key and __v).
const env = require('../config/env');

const plain = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : { ...doc });

function serializeFile(file) {
  const { s3Key, __v, _id, ...rest } = plain(file); // eslint-disable-line no-unused-vars
  return { id: _id, ...rest };
}

// includeToken: the secret token / URL is only shown for ACTIVE links (never for blocked/pending ones)
function serializeLink(link, { includeToken = true } = {}) {
  const o = plain(link);
  const populatedFile = o.fileId && o.fileId._id ? o.fileId : null;
  const creator = o.createdBy && o.createdBy._id ? o.createdBy : null;

  const out = {
    id: o._id,
    fileId: populatedFile ? populatedFile._id : o.fileId,
    recipientEmail: o.recipientEmail,
    isExternal: o.isExternal,
    expiresAt: o.expiresAt,
    maxDownloads: o.maxDownloads,
    downloadCount: o.downloadCount,
    remainingDownloads: Math.max(0, o.maxDownloads - o.downloadCount),
    status: o.status,
    policyDecision: o.policyDecision,
    riskScoreAtShare: o.riskScoreAtShare,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
  if (populatedFile) {
    out.file = {
      id: populatedFile._id,
      name: populatedFile.originalName,
      classification: populatedFile.classification,
      status: populatedFile.status,
    };
  }
  if (creator) out.createdBy = { id: creator._id, name: creator.name, email: creator.email };
  if (includeToken && o.status === 'ACTIVE') {
    out.token = o.token;
    out.url = `${env.frontendOrigins[0]}/shared/${o.token}`; // frontend route that calls GET /api/shares/access/:token
  }
  return out;
}

module.exports = { serializeFile, serializeLink };
