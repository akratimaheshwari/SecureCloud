'use strict';
// Validators need config/env, so set dummy values before loading (never real secrets).
Object.assign(process.env, {
  MONGO_URI: 'mongodb://localhost/test', JWT_SECRET: 'x'.repeat(40), AWS_REGION: 'ap-south-1',
  S3_BUCKET: 'test-bucket', LAMBDA_API_KEY: 'y'.repeat(30), FRONTEND_URL: 'http://localhost:3000',
});
const test = require('node:test');
const assert = require('node:assert/strict');
const schemas = require('../utils/validators');

const opts = { abortEarly: false, stripUnknown: true, convert: true };
const run = (schema, value) => schema.validate(value, opts);

test('register strips unknown fields such as role and rejects weak passwords', () => {
  const ok = run(schemas.register, { name: 'Asha', email: 'ASHA@Demo.com', password: 'Passw0rdOK', role: 'admin' });
  assert.equal(ok.error, undefined);
  assert.equal(ok.value.role, undefined);
  assert.equal(ok.value.email, 'asha@demo.com');
  assert.ok(run(schemas.register, { name: 'Asha', email: 'a@demo.com', password: 'allletters' }).error);
});

test('createShare applies defaults and rejects bad ids', () => {
  const ok = run(schemas.createShare, { fileId: 'a'.repeat(24), recipientEmail: 'x@y.com' });
  assert.equal(ok.value.expiresInHours, 24);
  assert.equal(ok.value.maxDownloads, 5);
  assert.ok(run(schemas.createShare, { fileId: 'not-an-id', recipientEmail: 'x@y.com' }).error);
});

test('scanResult uppercases types and validates count keys', () => {
  const ok = run(schemas.scanResult, { fileId: 'a'.repeat(24), detectedTypes: ['pan'], matchCounts: { PAN: 2 } });
  assert.deepEqual(ok.value.detectedTypes, ['PAN']);
  assert.equal(ok.value.scanStatus, 'COMPLETED');
  assert.ok(run(schemas.scanResult, { fileId: 'a'.repeat(24), matchCounts: { '$bad.key': 1 } }).error);
});

test('uploadUrl enforces MIME format and size limits', () => {
  assert.equal(run(schemas.uploadUrl, { fileName: 'a.pdf', fileType: 'application/pdf', size: 1000 }).error, undefined);
  assert.ok(run(schemas.uploadUrl, { fileName: 'a.pdf', fileType: 'pdf', size: 1000 }).error);
  assert.ok(run(schemas.uploadUrl, { fileName: 'a.pdf', fileType: 'application/pdf', size: 0 }).error);
});
