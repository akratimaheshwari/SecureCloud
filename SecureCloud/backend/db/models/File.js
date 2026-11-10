'use strict';
const mongoose = require('mongoose');
const { Schema } = mongoose;

// Ordered lowest -> highest sensitivity (the policy engine can rank by array index)
const CLASSIFICATIONS = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'HIGHLY_CONFIDENTIAL'];
const FILE_STATUSES = ['UPLOADING', 'SCANNING', 'ACTIVE', 'LOCKED', 'QUARANTINED', 'DELETED'];

// File metadata only. The bytes live in S3 under `s3Key`.
const FileSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    originalName: { type: String, required: true, trim: true },
    s3Key: { type: String, required: true, unique: true }, // unique index
    size: { type: Number, min: 0 }, // bytes
    mimeType: { type: String, trim: true },
    // Set after upload/scan, so optional; validated only when present
    sha256Hash: {
      type: String,
      lowercase: true,
      match: [/^[a-f0-9]{64}$/, 'sha256Hash must be 64 hex characters'],
    },
    classification: { type: String, enum: CLASSIFICATIONS, default: 'PUBLIC' },
    riskScore: { type: Number, min: 0, max: 100, default: 0 },
    status: { type: String, enum: FILE_STATUSES, default: 'UPLOADING' },
    lockedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    lockReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

// High-frequency queries: "My files" sorted by createdAt desc
FileSchema.index({ ownerId: 1, status: 1, createdAt: -1 });
// Duplicate detection by content hash
FileSchema.index({ sha256Hash: 1 });
// Admin dashboards: "all locked / highly confidential files"
FileSchema.index({ status: 1, classification: 1 });

const File = mongoose.model('File', FileSchema);
File.CLASSIFICATIONS = CLASSIFICATIONS;
File.FILE_STATUSES = FILE_STATUSES;
module.exports = File;
