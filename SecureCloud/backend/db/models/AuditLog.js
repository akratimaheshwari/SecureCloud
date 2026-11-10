'use strict';
const mongoose = require('mongoose');
const { Schema } = mongoose;

// Append-only record of who did what. Application code should only insert, never update/delete.
const AuditLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true }, // optional (e.g. failed login)
    // e.g. LOGIN, UPLOAD, DOWNLOAD, SHARE_CREATE, SHARE_REVOKE, FILE_LOCK, POLICY_CHANGE
    action: { type: String, required: true, trim: true },
    targetType: { type: String, trim: true }, // e.g. "File", "SharingLink", "SecurityPolicy"
    targetId: { type: Schema.Types.ObjectId }, // polymorphic: no ref, resolved via targetType
    ipAddress: { type: String, trim: true },
    userAgent: { type: String, trim: true },
    metadata: { type: Schema.Types.Mixed }, // free-form details (never store secrets here)
  },
  { timestamps: true }
);

// Newest-first listing
AuditLogSchema.index({ createdAt: -1 });
// "Downloads by user X in the last hour" (suspicious-download detection)
AuditLogSchema.index({ userId: 1, action: 1, createdAt: -1 });
// Action-based filtering and admin dashboard metrics
AuditLogSchema.index({ action: 1, createdAt: -1, userId: 1 });
// History of one object
AuditLogSchema.index({ targetType: 1, targetId: 1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
