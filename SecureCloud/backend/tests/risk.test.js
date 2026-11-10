'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateRisk, applyTrustedApproval, riskLevel } = require('../services/riskService');

test('levels: 0-30 Low, 31-60 Medium, 61-80 High, 81-100 Critical', () => {
  assert.deepEqual([0, 30, 31, 60, 61, 80, 81, 100].map(riskLevel),
    ['Low', 'Low', 'Medium', 'Medium', 'High', 'High', 'Critical', 'Critical']);
});

test('nothing risky => 0 / Low', () => {
  const r = calculateRisk({});
  assert.equal(r.score, 0);
  assert.equal(r.level, 'Low');
  assert.deepEqual(r.breakdown, []);
});

test('sensitive content (+30) and HIGHLY_CONFIDENTIAL (+20) at upload = 50 (Medium)', () => {
  const r = calculateRisk({ detectedTypes: ['PAN', 'SALARY_KEYWORD'], classification: 'HIGHLY_CONFIDENTIAL' });
  assert.equal(r.score, 50);
  assert.equal(r.level, 'Medium');
  assert.deepEqual(r.breakdown.map((b) => b.factor), ['SENSITIVE_CONTENT', 'HIGHLY_CONFIDENTIAL']);
});

test('external share of a salary file to an unknown recipient = 90 (Critical)', () => {
  const r = calculateRisk({ detectedTypes: ['PAN', 'SALARY_KEYWORD'], classification: 'HIGHLY_CONFIDENTIAL', isExternal: true, recipientKnown: false });
  assert.equal(r.score, 90);
  assert.equal(r.level, 'Critical');
});

test('more than 10 downloads in an hour adds 20; exactly 10 does not', () => {
  assert.equal(calculateRisk({ recentDownloads: 10 }).score, 0);
  assert.equal(calculateRisk({ recentDownloads: 11 }).score, 20);
});

test('score is clamped to 100', () => {
  const r = calculateRisk({ detectedTypes: ['PAN'], classification: 'HIGHLY_CONFIDENTIAL', isExternal: true, recentDownloads: 50, recipientKnown: false });
  assert.equal(r.score, 100); // raw 110
});

test('trusted approval subtracts 10 and never goes below 0', () => {
  assert.equal(calculateRisk({ detectedTypes: ['EMAIL'], trustedApproved: true }).score, 20);
  assert.equal(calculateRisk({ trustedApproved: true }).score, 0);
  assert.equal(applyTrustedApproval(70).score, 60);
  assert.equal(applyTrustedApproval(5).score, 0);
});
