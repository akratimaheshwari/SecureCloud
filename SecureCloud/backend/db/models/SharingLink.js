'use strict';
const mongoose = require('mongoose');
const { Schema } = mongoose;

// A share link for a file. The policy engine fills policyDecision / status at creation.
const SharingLinkSchema = new Schema(
  {
    fileId: { type: Schema.Types.ObjectId, ref: 'File', required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recipientEmail: { type: String, trim: true, lowercase: true },
    isExternal: { type: Boolean, default: false },
    // Store a random, unguessable value (e.g. crypto.randomBytes(32).toString('hex'))
    token: { type: String, required: true, unique: true }, // unique index
    expiresAt: { type: Date, required: true, index: true },
    maxDownloads: { type: Number, default: 5, min: 1 },
    downloadCount: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['ACTIVE', 'REVOKED', 'EXPIRED', 'BLOCKED', 'PENDING_APPROVAL'],
      default: 'ACTIVE',
    },
    policyDecision: {
      type: String,
      enum: ['ALLOW', 'WARN', 'REQUIRE_APPROVAL', 'BLOCK'],
      required: true,
    },
    riskScoreAtShare: { type: Number, min: 0, max: 100 }, // snapshot of File.riskScore
  },
  { timestamps: true }
);

// "My shares" listing
SharingLinkSchema.index({ createdBy: 1, createdAt: -1 });
// "Shared with me" listing
SharingLinkSchema.index({ recipientEmail: 1, status: 1, expiresAt: 1, createdAt: -1 });

// True while the link can still be used (check at download time)
SharingLinkSchema.virtual('isUsable').get(function () {
  return (
    this.status === 'ACTIVE' &&
    this.expiresAt > new Date() &&
    this.downloadCount < this.maxDownloads
  );
});

module.exports = mongoose.model('SharingLink', SharingLinkSchema);
