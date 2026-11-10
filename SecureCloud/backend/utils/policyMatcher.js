'use strict';
// Pure policy-matching logic (no DB access) so it is easy to test and explain.
const { CLASSIFICATIONS } = require('./constants');

const rank = (c) => CLASSIFICATIONS.indexOf(c);

/**
 * Does one policy condition match this share context?
 * ctx = { classification, isExternal, recentDownloads }
 * All fields present in the condition must match; an empty condition matches everything.
 * Returns { matched, details[] } where details explain each check in plain English.
 */
function conditionMatches(condition, ctx) {
  const c = condition || {};
  const checks = [];

  if (c.minClassification) {
    const ok = rank(ctx.classification) >= rank(c.minClassification);
    checks.push({ ok, text: `classification ${ctx.classification} ${ok ? 'is at least' : 'is below'} ${c.minClassification}` });
  }

  const wanted = c.recipientType || 'ANY';
  if (wanted !== 'ANY') {
    const actual = ctx.isExternal ? 'EXTERNAL' : 'INTERNAL';
    checks.push({ ok: actual === wanted, text: `recipient is ${actual} (policy needs ${wanted})` });
  }

  if (c.maxDownloadsPerHour !== undefined && c.maxDownloadsPerHour !== null) {
    const ok = ctx.recentDownloads > c.maxDownloadsPerHour;
    checks.push({ ok, text: `${ctx.recentDownloads} downloads in the last hour (limit ${c.maxDownloadsPerHour})` });
  }

  return { matched: checks.every((x) => x.ok), details: checks.map((x) => x.text) };
}

/**
 * First enabled policy (lowest priority number) whose condition matches wins.
 * Returns { policy, details } or null when nothing matches.
 */
function selectPolicy(policies, ctx) {
  const ordered = [...policies]
    .filter((p) => p.enabled !== false)
    .sort((a, b) => a.priority - b.priority);
  for (const policy of ordered) {
    const { matched, details } = conditionMatches(policy.condition, ctx);
    if (matched) return { policy, details };
  }
  return null;
}

module.exports = { conditionMatches, selectPolicy, rank };
