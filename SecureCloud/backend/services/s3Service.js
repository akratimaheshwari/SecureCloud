'use strict';
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const s3 = require('../config/s3');
const env = require('../config/env');
const { UPLOAD_URL_TTL_SECONDS, DOWNLOAD_URL_TTL_SECONDS } = require('../utils/constants');
const { contentDisposition } = require('../utils/strings');

const SSE_HEADER = 'x-amz-server-side-encryption';
const SSE_KEY_HEADER = 'x-amz-server-side-encryption-aws-kms-key-id';

/**
 * Pre-signed PUT URL that REQUIRES SSE-KMS. The SSE headers are kept as signed headers
 * (not moved into the query string), so the browser must send them exactly as returned in
 * `headers`; otherwise S3 rejects the upload. ContentLength pins the declared size.
 */
async function createUploadUrl({ key, contentType, size }) {
  const command = new PutObjectCommand({
    Bucket: env.s3Bucket,
    Key: key,
    ContentType: contentType,
    ContentLength: size,
    ServerSideEncryption: 'aws:kms',
    ...(env.s3KmsKeyId && { SSEKMSKeyId: env.s3KmsKeyId }),
  });
  const uploadUrl = await getSignedUrl(s3, command, {
    expiresIn: UPLOAD_URL_TTL_SECONDS,
    unhoistableHeaders: new Set([SSE_HEADER, SSE_KEY_HEADER]),
  });
  const headers = { 'Content-Type': contentType, [SSE_HEADER]: 'aws:kms', ...(env.s3KmsKeyId && { [SSE_KEY_HEADER]: env.s3KmsKeyId }) };
  return { uploadUrl, headers, expiresIn: UPLOAD_URL_TTL_SECONDS };
}

// Pre-signed GET URL (5 minutes) that forces a download with the original file name
async function createDownloadUrl({ key, fileName, expiresIn = DOWNLOAD_URL_TTL_SECONDS }) {
  const command = new GetObjectCommand({
    Bucket: env.s3Bucket,
    Key: key,
    ResponseContentDisposition: contentDisposition(fileName),
  });
  return getSignedUrl(s3, command, { expiresIn });
}

async function deleteObject(key) {
  await s3.send(new DeleteObjectCommand({ Bucket: env.s3Bucket, Key: key }));
}

// Used on upload confirmation. Returns null when the object does not exist.
async function headObject(key) {
  try {
    const out = await s3.send(new HeadObjectCommand({ Bucket: env.s3Bucket, Key: key }));
    return { contentLength: out.ContentLength, contentType: out.ContentType, serverSideEncryption: out.ServerSideEncryption };
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

module.exports = { createUploadUrl, createDownloadUrl, deleteObject, headObject };
