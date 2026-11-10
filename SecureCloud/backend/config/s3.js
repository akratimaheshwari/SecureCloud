'use strict';
const { S3Client } = require('@aws-sdk/client-s3');
const env = require('./env');

// No access keys here: the SDK uses the default credential chain (IAM role on EC2/ECS/Lambda,
// or your local AWS profile / SSO session during development).
// WHEN_REQUIRED stops newer SDK versions from adding checksum parameters to pre-signed PUT URLs,
// which would otherwise break plain browser uploads.
module.exports = new S3Client({
  region: env.awsRegion,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});
