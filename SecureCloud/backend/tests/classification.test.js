'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeSeverity, classify, maxSeverity } = require('../services/classificationService');

const cls = (types, counts = {}) => classify({ detectedTypes: types, severity: computeSeverity(types, counts).severity });

test('PAN + salary keyword => CRITICAL severity and HIGHLY_CONFIDENTIAL', () => {
  const r = cls(['PAN', 'SALARY_KEYWORD']);
  assert.equal(computeSeverity(['PAN', 'SALARY_KEYWORD']).severity, 'CRITICAL');
  assert.equal(r.classification, 'HIGHLY_CONFIDENTIAL');
});

test('account number + salary keyword => HIGHLY_CONFIDENTIAL', () => {
  assert.equal(cls(['ACCOUNT_NUMBER', 'SALARY_KEYWORD', 'EMAIL']).classification, 'HIGHLY_CONFIDENTIAL');
});

test('bulk PAN matches alone => CRITICAL => HIGHLY_CONFIDENTIAL', () => {
  assert.equal(cls(['PAN'], { PAN: 12 }).classification, 'HIGHLY_CONFIDENTIAL');
});

test('single PAN => HIGH => CONFIDENTIAL', () => {
  assert.equal(computeSeverity(['PAN'], { PAN: 1 }).severity, 'HIGH');
  assert.equal(cls(['PAN'], { PAN: 1 }).classification, 'CONFIDENTIAL');
});

test('salary keyword only => MEDIUM => CONFIDENTIAL', () => {
  assert.equal(computeSeverity(['SALARY_KEYWORD']).severity, 'MEDIUM');
  assert.equal(cls(['SALARY_KEYWORD']).classification, 'CONFIDENTIAL');
});

test('email only => LOW => INTERNAL; email + phone => MEDIUM => CONFIDENTIAL', () => {
  assert.equal(cls(['EMAIL'], { EMAIL: 2 }).classification, 'INTERNAL');
  assert.equal(cls(['EMAIL', 'PHONE']).classification, 'CONFIDENTIAL');
});

test('nothing detected => NONE => PUBLIC', () => {
  assert.equal(computeSeverity([]).severity, 'NONE');
  assert.equal(cls([]).classification, 'PUBLIC');
});

test('matchCounts may be a Map', () => {
  assert.equal(computeSeverity(['PAN'], new Map([['PAN', 15]])).severity, 'CRITICAL');
});

test('maxSeverity never lowers', () => {
  assert.equal(maxSeverity('LOW', 'HIGH'), 'HIGH');
  assert.equal(maxSeverity('CRITICAL', 'NONE'), 'CRITICAL');
});
