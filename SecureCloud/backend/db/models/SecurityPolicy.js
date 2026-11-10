'use strict';
const mongoose = require('mongoose');
const { Schema } = mongoose;
const File = require('./File');

// Admin-editable rules. Evaluate enabled policies by ascending `priority`;
// the FIRST policy whose condition matches decides the action.
const SecurityPolicySchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true }, // unique index
    description: { type: String, trim: true },
    condition: {
      // Matches this classification level OR HIGHER (ranked by File.CLASSIFICATIONS order)
      minClassification: { type: String, enum: File.CLASSIFICATIONS },
      recipientType: { type: String, enum: ['INTERNAL', 'EXTERNAL', 'ANY'], default: 'ANY' },
      // Optional rate limit used by download-abuse rules
      maxDownloadsPerHour: { type: Number, min: 1 },
    },
    action: {
      type: String,
      enum: ['ALLOW', 'WARN', 'REQUIRE_APPROVAL', 'BLOCK'],
      required: true,
    },
    enabled: { type: Boolean, default: true },
    priority: { type: Number, required: true, default: 100 }, // lower number = evaluated first
  },
  { timestamps: true }
);

// Policy engine query: { enabled: true } sorted by priority
SecurityPolicySchema.index({ enabled: 1, priority: 1 });

module.exports = mongoose.model('SecurityPolicy', SecurityPolicySchema);
