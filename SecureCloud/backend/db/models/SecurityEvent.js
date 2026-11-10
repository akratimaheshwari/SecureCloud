'use strict';
const mongoose = require('mongoose');
const { Schema } = mongoose;

// Security-relevant incidents shown on the admin dashboard.
const SecurityEventSchema = new Schema(
  {
    // Optional: a FAILED_LOGIN for an unknown email has no user to reference
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    fileId: { type: Schema.Types.ObjectId, ref: 'File' },
    eventType: {
      type: String,
      required: true,
      enum: [
        'BLOCKED_SHARE',
        'WARNED_SHARE',
        'FAILED_LOGIN',
        'UNAUTHORIZED_ACCESS',
        'EXPIRED_LINK_ACCESS',
        'REVOKED_LINK_ACCESS',
        'DOWNLOAD_LIMIT_EXCEEDED',
        'SUSPICIOUS_DOWNLOADS',
        'HIGH_RISK_UPLOAD',
        'FILE_LOCKED_ACCESS',
      ],
    },
    severity: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'MEDIUM' },
    actionTaken: { type: String, trim: true }, // e.g. "Share blocked"
    reason: { type: String, trim: true },
    riskScore: { type: Number, min: 0, max: 100 },
    resolved: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Dashboard: open events, worst first, newest first
SecurityEventSchema.index({ resolved: 1, severity: 1, createdAt: -1 });
// Filter by event type over time
SecurityEventSchema.index({ eventType: 1, createdAt: -1 });

module.exports = mongoose.model('SecurityEvent', SecurityEventSchema);
