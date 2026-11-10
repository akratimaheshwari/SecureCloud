'use strict';
const mongoose = require('mongoose');
const { Schema } = mongoose;

// Reference list only: detectedTypes stays free-form so new rules need no migration
const DETECTION_TYPES = [
  'EMAIL',
  'PHONE',
  'PAN',
  'ACCOUNT_NUMBER',
  'SALARY_KEYWORD',
  'CONFIDENTIAL_KEYWORD',
];

// Output of the rule-based (regex/keyword) DLP scan of one file.
const DlpResultSchema = new Schema(
  {
    fileId: { type: Schema.Types.ObjectId, ref: 'File', required: true, index: true },
    detectedTypes: [{ type: String, uppercase: true, trim: true }],
    // e.g. { EMAIL: 12, PAN: 2 }. Counts only, never the matched values themselves.
    matchCounts: { type: Map, of: Number, default: {} },
    severity: {
      type: String,
      enum: ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'NONE',
    },
    scanStatus: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'FAILED', 'UNSUPPORTED'],
      default: 'PENDING',
    },
    scannedAt: { type: Date },
  },
  { timestamps: true }
);

// Reports: recent high-severity findings
DlpResultSchema.index({ severity: 1, createdAt: -1 });

const DlpResult = mongoose.model('DlpResult', DlpResultSchema);
DlpResult.DETECTION_TYPES = DETECTION_TYPES;
module.exports = DlpResult;
