'use strict';
const h = require('./helpers/harness'); // also provides env vars + model fakes for policyService
const test = require('node:test');
const assert = require('node:assert/strict');
const p = require('../services/dlpPolicyService');
const risk = require('../services/riskService');
const cls = require('../services/classificationService');
const share = require('../services/shareService');
const policyService = require('../services/policyService');
const C = require('../utils/constants');

test('policy table: severity/scanStatus -> status', () => {
  const d = (scanStatus, severity) => p.decideOutcome({ scanStatus, severity }).status;
  assert.equal(d('COMPLETED', 'NONE'), 'ACTIVE');
  assert.equal(d('COMPLETED', 'LOW'), 'ACTIVE');
  assert.equal(d('COMPLETED', 'MEDIUM'), 'ACTIVE');
  assert.equal(p.decideOutcome({ scanStatus: 'COMPLETED', severity: 'MEDIUM' }).warning, true);
  assert.equal(d('COMPLETED', 'HIGH'), 'RESTRICTED');
  assert.equal(d('COMPLETED', 'CRITICAL'), 'QUARANTINED');
  assert.equal(d('FAILED'), 'QUARANTINED');
  assert.equal(d('UNSUPPORTED'), 'RESTRICTED'); // never ACTIVE: unsupported is not clean
  assert.equal(d('PENDING'), 'SCANNING');
  assert.equal(d(undefined), 'SCANNING');
});

test('no scan result can ever yield ACTIVE for HIGH/CRITICAL/FAILED/UNSUPPORTED', () => {
  for (const [scanStatus, severity] of [['COMPLETED', 'HIGH'], ['COMPLETED', 'CRITICAL'], ['FAILED', 'NONE'], ['UNSUPPORTED', 'NONE'], ['FAILED', 'CRITICAL']]) {
    assert.notEqual(p.decideOutcome({ scanStatus, severity }).status, 'ACTIVE');
  }
});

test('floorStatus: never loosens a recorded severity, null while no scan finished', () => {
  assert.equal(p.floorStatus({ latestScan: null }), null);
  assert.equal(p.floorStatus({ latestScan: { scanStatus: 'PENDING' } }), null);
  assert.equal(p.floorStatus({ latestScan: { scanStatus: 'COMPLETED', severity: 'NONE' }, dlpSeverity: 'CRITICAL' }), 'QUARANTINED');
  assert.equal(p.floorStatus({ latestScan: { scanStatus: 'COMPLETED', severity: 'CRITICAL' }, reviewed: true }), 'RESTRICTED');
  assert.equal(p.floorStatus({ latestScan: { scanStatus: 'FAILED' }, reviewed: true }), 'RESTRICTED');
});

test('statusAfterUnlock never returns ACTIVE when policy requires more', () => {
  assert.equal(p.statusAfterUnlock({ before: 'ACTIVE', floor: 'QUARANTINED' }), 'QUARANTINED');
  assert.equal(p.statusAfterUnlock({ before: 'RESTRICTED', floor: 'ACTIVE' }), 'RESTRICTED');
  assert.equal(p.statusAfterUnlock({ before: 'SCANNING', floor: null }), 'SCANNING');
  assert.equal(p.statusAfterUnlock({ before: undefined, floor: 'ACTIVE' }), 'ACTIVE');
});

test('download/share whitelists', () => {
  for (const s of ['UPLOADING', 'SCANNING', 'LOCKED', 'QUARANTINED', 'DELETED', 'SOMETHING_NEW']) assert.equal(p.canDownload(s), false, s);
  assert.equal(p.canDownload('ACTIVE'), true);
  assert.equal(p.canDownload('RESTRICTED'), true);
  assert.equal(p.canShare('ACTIVE'), true);
  for (const s of ['RESTRICTED', 'QUARANTINED', 'LOCKED', 'SCANNING']) assert.equal(p.canShare(s), false, s);
});

// ---- Issue 5: risk vs severity ----
test('risk: CRITICAL severity can no longer score only 50', () => {
  const types = ['EMAIL', 'PHONE', 'PAN', 'ACCOUNT_NUMBER', 'SALARY_KEYWORD', 'CONFIDENTIAL_KEYWORD'];
  const counts = { EMAIL: 1, PHONE: 1, PAN: 1, ACCOUNT_NUMBER: 1, SALARY_KEYWORD: 1, CONFIDENTIAL_KEYWORD: 1 };
  const { severity } = cls.computeSeverity(types, counts);
  assert.equal(severity, 'CRITICAL');
  const { classification } = cls.classify({ detectedTypes: types, severity });
  assert.equal(classification, 'HIGHLY_CONFIDENTIAL');
  const old = risk.calculateRisk({ detectedTypes: types, classification }); // old inputs: no severity
  assert.equal(old.score, 50); // documents the root cause
  const fixed = risk.calculateRisk({ detectedTypes: types, classification, severity });
  assert.equal(fixed.score, 81);
  assert.equal(fixed.level, 'Critical');
  assert.equal(fixed.breakdown.reduce((s, b) => s + b.points, 0), fixed.score); // still fully explainable
});

test('risk floor per severity matches the level bands and never lowers an existing score', () => {
  const lvl = (severity) => risk.calculateRisk({ severity });
  assert.equal(lvl('NONE').score, 0);
  assert.equal(lvl('LOW').level, 'Low');
  assert.equal(lvl('MEDIUM').level, 'Medium');
  assert.equal(lvl('HIGH').level, 'High');
  assert.equal(lvl('CRITICAL').level, 'Critical');
  // additive score above the floor is untouched
  assert.equal(risk.calculateRisk({ detectedTypes: ['PAN'], classification: 'HIGHLY_CONFIDENTIAL', isExternal: true, recipientKnown: false, severity: 'HIGH' }).score, 90);
});

test('CONFIDENTIAL_KEYWORD-only file: MEDIUM severity now yields a non-zero risk', () => {
  assert.ok(risk.calculateRisk({ detectedTypes: ['CONFIDENTIAL_KEYWORD'], classification: 'CONFIDENTIAL', severity: 'MEDIUM' }).score >= 31);
});

// ---- sharing gates (Issue 7) ----
test('share links never serve RESTRICTED, QUARANTINED, LOCKED, SCANNING or UPLOADING files', () => {
  const link = { status: 'ACTIVE', expiresAt: new Date(Date.now() + 3600000), downloadCount: 0, maxDownloads: 5 };
  const check = (status) => share.evaluateLinkAccess({ link, file: { status } });
  assert.equal(check('ACTIVE').allowed, true);
  assert.equal(check('RESTRICTED').code, 'FILE_RESTRICTED');
  assert.equal(check('QUARANTINED').code, 'FILE_QUARANTINED');
  assert.equal(check('LOCKED').code, 'FILE_LOCKED');
  assert.equal(check('SCANNING').allowed, false);
  assert.equal(check('UPLOADING').allowed, false);
});

test('policy engine blocks sharing of RESTRICTED/QUARANTINED files and records the attempt', async () => {
  h.resetAll();
  const owner = { _id: h.makeUser()._id, email: 'o@demo.com' };
  for (const status of ['RESTRICTED', 'QUARANTINED']) {
    const file = await h.File.create({ ownerId: owner._id, originalName: 'x', s3Key: `k-${status}`, status, classification: 'PUBLIC' });
    const r = await policyService.evaluate({ file, recipientEmail: 'someone@demo.com', owner, record: true });
    assert.equal(r.decision, 'BLOCK', status);
  }
  assert.equal(h.SecurityEvent.store.filter((e) => e.eventType === 'BLOCKED_SHARE').length, 2);
});

test('constants: RESTRICTED exists in the shared status list and DLP order is ACTIVE < RESTRICTED < QUARANTINED', () => {
  assert.ok(C.FILE_STATUSES.includes('RESTRICTED'));
  assert.deepEqual(C.DLP_STATUS_ORDER, ['ACTIVE', 'RESTRICTED', 'QUARANTINED']);
  assert.equal(C.UNSUPPORTED_SCAN_STATUS, 'RESTRICTED');
});
