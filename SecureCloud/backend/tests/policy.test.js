'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { conditionMatches, selectPolicy } = require('../utils/policyMatcher');

// Same shape as the seeded default policies
const policies = [
  { name: 'Allow all other shares', condition: { recipientType: 'ANY' }, action: 'ALLOW', priority: 100, enabled: true },
  { name: 'Warn internal confidential', condition: { minClassification: 'CONFIDENTIAL', recipientType: 'INTERNAL' }, action: 'WARN', priority: 30, enabled: true },
  { name: 'Approval external confidential', condition: { minClassification: 'CONFIDENTIAL', recipientType: 'EXTERNAL' }, action: 'REQUIRE_APPROVAL', priority: 20, enabled: true },
  { name: 'Block external highly confidential', condition: { minClassification: 'HIGHLY_CONFIDENTIAL', recipientType: 'EXTERNAL' }, action: 'BLOCK', priority: 10, enabled: true },
];
const decide = (ctx) => selectPolicy(policies, { recentDownloads: 0, ...ctx })?.policy.action;

test('external + HIGHLY_CONFIDENTIAL => BLOCK', () => assert.equal(decide({ classification: 'HIGHLY_CONFIDENTIAL', isExternal: true }), 'BLOCK'));
test('external + CONFIDENTIAL => REQUIRE_APPROVAL', () => assert.equal(decide({ classification: 'CONFIDENTIAL', isExternal: true }), 'REQUIRE_APPROVAL'));
test('internal + CONFIDENTIAL => WARN', () => assert.equal(decide({ classification: 'CONFIDENTIAL', isExternal: false }), 'WARN'));
test('internal + HIGHLY_CONFIDENTIAL => WARN (min classification means "or higher")', () => assert.equal(decide({ classification: 'HIGHLY_CONFIDENTIAL', isExternal: false }), 'WARN'));
test('external + INTERNAL file => ALLOW', () => assert.equal(decide({ classification: 'INTERNAL', isExternal: true }), 'ALLOW'));
test('PUBLIC file => ALLOW', () => assert.equal(decide({ classification: 'PUBLIC', isExternal: true }), 'ALLOW'));

test('disabled policies are skipped', () => {
  const list = policies.map((p) => (p.action === 'BLOCK' ? { ...p, enabled: false } : p));
  assert.equal(selectPolicy(list, { classification: 'HIGHLY_CONFIDENTIAL', isExternal: true, recentDownloads: 0 }).policy.action, 'REQUIRE_APPROVAL');
});

test('no policies => null', () => assert.equal(selectPolicy([], { classification: 'PUBLIC', isExternal: false, recentDownloads: 0 }), null));

test('maxDownloadsPerHour matches only above the limit', () => {
  const cond = { maxDownloadsPerHour: 10 };
  assert.equal(conditionMatches(cond, { classification: 'PUBLIC', isExternal: false, recentDownloads: 10 }).matched, false);
  assert.equal(conditionMatches(cond, { classification: 'PUBLIC', isExternal: false, recentDownloads: 11 }).matched, true);
});

test('details explain why a condition matched', () => {
  const r = conditionMatches({ minClassification: 'CONFIDENTIAL', recipientType: 'EXTERNAL' }, { classification: 'CONFIDENTIAL', isExternal: true, recentDownloads: 0 });
  assert.equal(r.matched, true);
  assert.equal(r.details.length, 2);
});
