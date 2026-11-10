'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const share = require('../services/shareService');

const hours = (h) => new Date(Date.now() + h * 3600000);
const link = (o = {}) => ({ status: 'ACTIVE', expiresAt: hours(1), downloadCount: 0, maxDownloads: 5, ...o });
const check = (l, f = { status: 'ACTIVE' }) => share.evaluateLinkAccess({ link: l, file: f });

test('valid link is allowed', () => assert.equal(check(link()).allowed, true));

test('revoked link is denied and recorded', () => {
  const r = check(link({ status: 'REVOKED' }));
  assert.equal(r.allowed, false);
  assert.equal(r.code, 'LINK_REVOKED');
  assert.equal(r.eventType, 'REVOKED_LINK_ACCESS');
});

test('expired link (by date) is denied', () => {
  const r = check(link({ expiresAt: hours(-1) }));
  assert.equal(r.code, 'LINK_EXPIRED');
  assert.equal(r.eventType, 'EXPIRED_LINK_ACCESS');
});

test('download limit is enforced at maxDownloads', () => {
  assert.equal(check(link({ downloadCount: 4 })).allowed, true);
  const r = check(link({ downloadCount: 5 }));
  assert.equal(r.code, 'DOWNLOAD_LIMIT_EXCEEDED');
  assert.equal(r.eventType, 'DOWNLOAD_LIMIT_EXCEEDED');
});

test('locked file is denied', () => {
  const r = check(link(), { status: 'LOCKED' });
  assert.equal(r.code, 'FILE_LOCKED');
  assert.equal(r.eventType, 'FILE_LOCKED_ACCESS');
});

test('blocked and pending links are denied', () => {
  assert.equal(check(link({ status: 'BLOCKED' })).code, 'LINK_BLOCKED');
  assert.equal(check(link({ status: 'PENDING_APPROVAL' })).code, 'LINK_PENDING_APPROVAL');
});

test('tokens are long, URL-safe and unique', () => {
  const a = share.generateToken();
  const b = share.generateToken();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
});

test('computeExpiry adds hours; remainingDownloads never negative', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  assert.equal(share.computeExpiry(24, now).toISOString(), '2026-01-02T00:00:00.000Z');
  assert.equal(share.remainingDownloads({ downloadCount: 7, maxDownloads: 5 }), 0);
});
