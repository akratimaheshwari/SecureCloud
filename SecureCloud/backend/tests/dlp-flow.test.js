'use strict';
const h = require('./helpers/harness');
const test = require('node:test');
const assert = require('node:assert/strict');
const fileCtrl = require('../controllers/fileController');
const dlpCtrl = require('../controllers/dlpController');
const { serializeFile } = require('../utils/serializers');

const { File, DlpResult, SecurityEvent, s3, call, newUpload, makeUser, PAYLOADS } = h;
test.beforeEach(() => h.resetAll());

// helpers ----------------------------------------------------------------------------------------
const confirm = (user, file, body = {}) => call(fileCtrl.confirmUpload, { user, params: { id: file._id }, body });
const scan = (file, payload) => call(dlpCtrl.saveScanResult, { body: { fileId: file._id, ...payload } });
const download = (user, file) => call(fileCtrl.getDownloadUrl, { user, params: { id: file._id } });
const status = async (file) => (await File.findById(file._id)).status;

// run one file through both execution orders and return the final status of each
async function bothOrders(payload) {
  const u = makeUser();
  const a = await newUpload(u); // Scenario A: Lambda first, then confirm
  await scan(a, payload); await confirm(u, a);
  const b = await newUpload(u); // Scenario B: confirm first, then Lambda
  await confirm(u, b); await scan(b, payload);
  return { A: await File.findById(a._id), B: await File.findById(b._id) };
}

// ---- Policy table, in BOTH orders (tests 1-7, 15, 16) ----------------------------------------------
const EXPECTED = { clean: 'ACTIVE', low: 'ACTIVE', medium: 'ACTIVE', high: 'RESTRICTED', critical: 'QUARANTINED', failed: 'QUARANTINED', unsupported: 'RESTRICTED' };
for (const [name, expected] of Object.entries(EXPECTED)) {
  test(`policy: ${name} scan => ${expected} regardless of whether the scan or confirm runs first`, async () => {
    const { A, B } = await bothOrders(PAYLOADS[name]);
    assert.equal(A.status, expected, 'scenario A (scan before confirm)');
    assert.equal(B.status, expected, 'scenario B (confirm before scan)');
  });
}

test('CRITICAL bug-report file: classification, risk and status are consistent (Issues 1 and 5)', async () => {
  const { A, B } = await bothOrders(PAYLOADS.critical);
  for (const f of [A, B]) {
    assert.equal(f.status, 'QUARANTINED');
    assert.equal(f.classification, 'HIGHLY_CONFIDENTIAL');
    assert.equal(f.dlpSeverity, 'CRITICAL');
    assert.ok(f.riskScore >= 81, `risk ${f.riskScore} should be in the Critical band (was 50 before the fix)`);
  }
  assert.ok(SecurityEvent.store.some((e) => e.eventType === 'HIGH_RISK_UPLOAD' && e.severity === 'CRITICAL'));
});

test('MEDIUM stays ACTIVE but the owner sees a warning', async () => {
  const { A } = await bothOrders(PAYLOADS.medium);
  assert.equal(A.status, 'ACTIVE');
  assert.match(serializeFile(A).warning, /medium/i);
  assert.equal(serializeFile((await bothOrders(PAYLOADS.low)).A).warning, undefined);
});

// ---- confirmUpload response (Issue 3) ---------------------------------------------------------------
test('confirmUpload returns the real dlpStatus and never throws ReferenceError', async () => {
  const u = makeUser();
  const f1 = await newUpload(u);
  const pending = await confirm(u, f1);
  assert.equal(pending.error, undefined);
  assert.equal(pending.body.data.dlpStatus, 'PENDING');
  assert.equal(pending.body.data.file.status, 'SCANNING');

  const f2 = await newUpload(u);
  await scan(f2, PAYLOADS.critical);
  const done = await confirm(u, f2);
  assert.equal(done.body.data.dlpStatus, 'COMPLETED');
  assert.equal(done.body.data.file.status, 'QUARANTINED');

  const f3 = await newUpload(u);
  await scan(f3, PAYLOADS.failed);
  assert.equal((await confirm(u, f3)).body.data.dlpStatus, 'FAILED');
});

test('confirm after a CRITICAL scan can NOT overwrite QUARANTINED with ACTIVE (Issue 2/4)', async () => {
  const u = makeUser(); const f = await newUpload(u);
  await scan(f, PAYLOADS.critical);
  assert.equal(await status(f), 'UPLOADING'); // the scan alone never activates an unconfirmed upload
  await confirm(u, f);
  assert.equal(await status(f), 'QUARANTINED');
  assert.equal((await confirm(u, f)).status, 409); // a second confirm is rejected, status untouched
  assert.equal(await status(f), 'QUARANTINED');
});

test('race: Lambda reports between confirm\'s claim and its re-check => still resolved, not stuck in SCANNING', async () => {
  const u = makeUser(); const f = await newUpload(u);
  let fired = false;
  File.hooks.afterFindOneAndUpdate = async () => { // runs right after confirm moved UPLOADING -> SCANNING
    if (fired) return; fired = true;
    await scan(f, PAYLOADS.critical); // the callback lands inside the race window
  };
  await confirm(u, f);
  assert.equal(await status(f), 'QUARANTINED');
});

test('race: two parallel confirms - exactly one wins', async () => {
  const u = makeUser(); const f = await newUpload(u);
  const [r1, r2] = await Promise.all([confirm(u, f), confirm(u, f)]);
  assert.deepEqual([r1.status === 409 || r1.error?.statusCode === 409, r2.status === 409 || r2.error?.statusCode === 409].filter(Boolean).length, 1);
});

// ---- Lambda callback reliability (13, 14) -----------------------------------------------------------
test('duplicate Lambda callback: one DlpResult, same outcome, one security event', async () => {
  const u = makeUser(); const f = await newUpload(u);
  await confirm(u, f);
  const first = await scan(f, PAYLOADS.critical);
  const second = await scan(f, PAYLOADS.critical);
  assert.equal(first.body.data.duplicate, false);
  assert.equal(second.body.data.duplicate, true);
  assert.equal(DlpResult.store.filter((r) => r.scanStatus === 'COMPLETED').length, 1);
  assert.equal(SecurityEvent.store.filter((e) => e.eventType === 'HIGH_RISK_UPLOAD').length, 1);
  assert.equal(await status(f), 'QUARANTINED');
  assert.equal((await File.findById(f._id)).riskScore, first.body.data.riskScore);
});

test('Lambda callback that fails midway is safe to retry', async () => {
  const u = makeUser(); const f = await newUpload(u);
  await confirm(u, f);
  let boom = true;
  File.hooks.beforeUpdateOne = async () => { if (boom) { boom = false; throw new Error('simulated DB outage'); } };
  const failed = await scan(f, PAYLOADS.critical);
  assert.ok(failed.error, 'first attempt reports failure so the Lambda retries');
  const retry = await scan(f, PAYLOADS.critical);
  assert.equal(retry.error, undefined);
  assert.equal(retry.body.data.duplicate, true); // result was already stored by the failed attempt
  assert.equal(await status(f), 'QUARANTINED');  // ...and the retry still applied the policy
  assert.equal(DlpResult.store.filter((r) => r.scanStatus === 'COMPLETED').length, 1);
});

test('callback for an unknown or deleted file is 404', async () => {
  const u = makeUser(); const f = await newUpload(u);
  await call(fileCtrl.deleteFile, { user: u, params: { id: f._id } });
  assert.equal((await scan(f, PAYLOADS.clean)).code, 'FILE_NOT_FOUND');
});

// ---- later scans can only tighten ------------------------------------------------------------------
test('a later CRITICAL scan quarantines an ACTIVE file; a later clean scan never loosens it', async () => {
  const u = makeUser(); const f = await newUpload(u);
  await confirm(u, f); await scan(f, PAYLOADS.clean);
  assert.equal(await status(f), 'ACTIVE');
  await scan(f, PAYLOADS.critical); // object re-uploaded with sensitive content
  assert.equal(await status(f), 'QUARANTINED');
  await scan(f, PAYLOADS.clean);
  assert.equal(await status(f), 'QUARANTINED');
  assert.equal((await File.findById(f._id)).dlpSeverity, 'CRITICAL');
});

// ---- download / access control (10, 11, 12) ---------------------------------------------------------
test('QUARANTINED file cannot be downloaded, even by its owner; no presigned URL is created', async () => {
  const u = makeUser(); const f = await newUpload(u);
  await confirm(u, f); await scan(f, PAYLOADS.critical);
  const r = await download(u, f);
  assert.equal(r.code, 'FILE_QUARANTINED'); assert.equal(r.status, 403);
});

test('RESTRICTED file: owner can download; others and share links cannot', async () => {
  const u = makeUser(); const f = await newUpload(u);
  await confirm(u, f); await scan(f, PAYLOADS.high);
  assert.ok((await download(u, f)).body.data.downloadUrl);
  assert.equal((await download(makeUser(), f)).status, 403);
});

test('SCANNING and UPLOADING files cannot be downloaded', async () => {
  const u = makeUser(); const f = await newUpload(u);
  assert.equal((await download(u, f)).code, 'INVALID_STATE');
  await confirm(u, f);
  assert.equal((await download(u, f)).code, 'SCANNING_IN_PROGRESS');
});

test('another user cannot download, confirm or read a file (IDOR) and an UNAUTHORIZED_ACCESS event is logged', async () => {
  const owner = makeUser(); const other = makeUser(); const f = await newUpload(owner);
  assert.equal((await confirm(other, f)).status, 403);
  await confirm(owner, f); await scan(f, PAYLOADS.clean);
  assert.equal((await download(other, f)).status, 403);
  assert.equal((await call(fileCtrl.getFile, { user: other, params: { id: f._id } })).status, 403);
  assert.ok(SecurityEvent.store.some((e) => e.eventType === 'UNAUTHORIZED_ACCESS'));
});

test('an ordinary user object replaced after the scan is quarantined at download time', async () => {
  const u = makeUser(); const f = await newUpload(u);
  await confirm(u, f); await scan(f, PAYLOADS.clean);
  assert.ok((await download(u, f)).body.data.downloadUrl);
  s3.objects[f.s3Key].eTag = '"replaced"'; // presigned PUT replayed with different content
  const r = await download(u, f);
  assert.equal(r.code, 'FILE_MODIFIED');
  assert.equal(await status(f), 'QUARANTINED');
});

// ---- encryption, size (8, 9) ------------------------------------------------------------------------
test('object without SSE-KMS is rejected, deleted from S3 and the record is DELETED', async () => {
  const u = makeUser(); const f = await newUpload(u, { put: { serverSideEncryption: undefined } });
  const r = await confirm(u, f);
  assert.equal(r.code, 'ENCRYPTION_REQUIRED');
  assert.deepEqual(s3.deleted, [f.s3Key]);
  assert.equal(await File.findById(f._id).then((x) => x.status), 'DELETED');
});

test('AES256 (SSE-S3) is not accepted as SSE-KMS', async () => {
  const u = makeUser(); const f = await newUpload(u, { put: { serverSideEncryption: 'AES256' } });
  assert.equal((await confirm(u, f)).code, 'ENCRYPTION_REQUIRED');
});

test('oversized or size-mismatched object is rejected and removed (limit is 1 MB in tests)', async () => {
  const u = makeUser();
  const big = await newUpload(u, { size: 5 * 1024 * 1024 });
  assert.equal((await confirm(u, big)).code, 'SIZE_MISMATCH');
  const liar = await newUpload(u, { size: 100, put: { contentLength: 900 } });
  assert.equal((await confirm(u, liar)).code, 'SIZE_MISMATCH');
  assert.equal(s3.deleted.length, 2);
});

test('confirm with nothing in S3 is a 400 UPLOAD_NOT_FOUND', async () => {
  const u = makeUser(); const f = await newUpload(u); delete s3.objects[f.s3Key];
  assert.equal((await confirm(u, f)).code, 'UPLOAD_NOT_FOUND');
});

// ---- admin lock / unlock / release (17, Issue 7) --------------------------------------------------------
const lock = (admin, f) => call(fileCtrl.lockFile, { user: admin, params: { id: f._id }, body: { reason: 'review' } });
const unlock = (admin, f) => call(fileCtrl.unlockFile, { user: admin, params: { id: f._id } });
const release = (admin, f) => call(fileCtrl.releaseFile, { user: admin, params: { id: f._id }, body: { note: 'checked' } });

test('lock then unlock restores ACTIVE for a clean file', async () => {
  const u = makeUser(); const admin = makeUser('admin'); const f = await newUpload(u);
  await confirm(u, f); await scan(f, PAYLOADS.clean);
  assert.equal((await lock(admin, f)).body.data.file.status, 'LOCKED');
  assert.equal((await download(u, f)).code, 'FILE_LOCKED');
  assert.equal((await unlock(admin, f)).body.data.file.status, 'ACTIVE');
});

test('unlock can NOT bypass DLP: a RESTRICTED file returns to RESTRICTED, never ACTIVE', async () => {
  const u = makeUser(); const admin = makeUser('admin'); const f = await newUpload(u);
  await confirm(u, f); await scan(f, PAYLOADS.high);
  await lock(admin, f);
  assert.equal((await unlock(admin, f)).body.data.file.status, 'RESTRICTED');
});

test('unlock of a legacy ACTIVE file that scanned CRITICAL ends QUARANTINED (old bad data)', async () => {
  const u = makeUser(); const admin = makeUser('admin');
  const f = await newUpload(u);
  await DlpResult.create({ fileId: f._id, scanStatus: 'COMPLETED', severity: 'CRITICAL', detectedTypes: ['PAN', 'SALARY_KEYWORD'], scannedAt: new Date() });
  await File.updateOne({ _id: f._id }, { $set: { status: 'ACTIVE' } }); // how the bug left it
  await lock(admin, f);
  assert.equal((await unlock(admin, f)).body.data.file.status, 'QUARANTINED');
});

test('scan arriving while LOCKED is not lost: unlock lands on the policy status', async () => {
  const u = makeUser(); const admin = makeUser('admin'); const f = await newUpload(u);
  await confirm(u, f);
  await lock(admin, f);               // locked while SCANNING
  await scan(f, PAYLOADS.critical);   // callback arrives during the lock
  assert.equal(await status(f), 'LOCKED');
  assert.equal((await unlock(admin, f)).body.data.file.status, 'QUARANTINED');
});

test('lock rejects QUARANTINED files; unlock rejects files that are not locked', async () => {
  const u = makeUser(); const admin = makeUser('admin'); const f = await newUpload(u);
  await confirm(u, f); await scan(f, PAYLOADS.critical);
  assert.equal((await lock(admin, f)).status, 409);
  assert.equal((await unlock(admin, f)).status, 409);
});

test('admin release: QUARANTINED -> RESTRICTED only (never ACTIVE) and it is not undone by lock/unlock or later scans', async () => {
  const u = makeUser(); const admin = makeUser('admin'); const f = await newUpload(u);
  await confirm(u, f); await scan(f, PAYLOADS.critical);
  assert.equal((await release(admin, f)).body.data.file.status, 'RESTRICTED');
  assert.ok((await download(u, f)).body.data.downloadUrl); // owner-only access after review
  await lock(admin, f);
  assert.equal((await unlock(admin, f)).body.data.file.status, 'RESTRICTED');
  await scan(f, { ...PAYLOADS.clean, sha256Hash: 'a'.repeat(64) });
  assert.equal(await status(f), 'RESTRICTED');
  assert.equal((await release(admin, f)).status, 409); // only QUARANTINED files can be released
});

// ---- deletion (18) -----------------------------------------------------------------------------------
test('delete: soft-deletes, removes the S3 object, hides the file', async () => {
  const u = makeUser(); const f = await newUpload(u);
  await confirm(u, f); await scan(f, PAYLOADS.clean);
  const r = await call(fileCtrl.deleteFile, { user: u, params: { id: f._id } });
  assert.equal(r.body.data.status, 'DELETED'); assert.equal(r.body.data.s3Deleted, true);
  assert.deepEqual(s3.deleted, [f.s3Key]);
  assert.equal((await download(u, f)).code, 'FILE_NOT_FOUND');
  assert.equal((await call(fileCtrl.deleteFile, { user: makeUser(), params: { id: f._id } })).code, 'FILE_NOT_FOUND');
});

test('another user cannot delete your file', async () => {
  const u = makeUser(); const f = await newUpload(u);
  assert.equal((await call(fileCtrl.deleteFile, { user: makeUser(), params: { id: f._id } })).status, 403);
  assert.notEqual(await status(f), 'DELETED');
});

test('share-link access path also refuses an object replaced after the scan', async () => {
  const fileSecurity = require('../services/fileSecurityService');
  const u = makeUser(); const f = await newUpload(u);
  await confirm(u, f); await scan(f, PAYLOADS.clean);
  const fresh = await File.findById(f._id);
  await fileSecurity.verifyObjectIntegrity(fresh); // unchanged object passes
  s3.objects[f.s3Key].eTag = '"swapped"';
  await assert.rejects(() => fileSecurity.verifyObjectIntegrity(fresh), (e) => e.code === 'FILE_MODIFIED');
  assert.equal(await status(f), 'QUARANTINED');
});
