'use strict';
// Loads .env and validates configuration once at startup (fails fast, never logs secret values).
require('dotenv').config();

const REQUIRED = ['MONGO_URI', 'JWT_SECRET', 'AWS_REGION', 'S3_BUCKET', 'LAMBDA_API_KEY', 'FRONTEND_URL'];

function loadEnv() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')} (see .env.example)`);
  }
  if (process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters (generate: openssl rand -hex 48)');
  }
  if (process.env.LAMBDA_API_KEY.length < 24) {
    throw new Error('LAMBDA_API_KEY must be at least 24 characters (generate: openssl rand -hex 32)');
  }

  const trustProxy = Number.parseInt(process.env.TRUST_PROXY, 10);
  const maxMb = Number.parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 100;

  return Object.freeze({
    nodeEnv: process.env.NODE_ENV || 'development',
    port: Number.parseInt(process.env.PORT, 10) || 5000,
    mongoUri: process.env.MONGO_URI,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
    awsRegion: process.env.AWS_REGION,
    s3Bucket: process.env.S3_BUCKET,
    s3KmsKeyId: process.env.S3_KMS_KEY_ID || null, // optional: omit to use the AWS-managed aws/s3 key
    lambdaApiKey: process.env.LAMBDA_API_KEY,
    // FRONTEND_URL may hold several comma-separated origins
    frontendOrigins: process.env.FRONTEND_URL.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean),
    trustProxy: Number.isNaN(trustProxy) ? false : trustProxy,
    bcryptRounds: Number.parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12,
    maxFileSizeBytes: maxMb * 1024 * 1024,
  });
}

module.exports = loadEnv();
