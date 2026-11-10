'use strict';
// Rule-based DLP classification. Pure functions: same input always gives the same, explainable output.
const { SEVERITIES, FINANCIAL_ID_TYPES, BULK_FINANCIAL_THRESHOLD, BULK_PERSONAL_THRESHOLD } = require('../utils/constants');

const count = (matchCounts, type) => {
  if (!matchCounts) return 0;
  const v = matchCounts instanceof Map ? matchCounts.get(type) : matchCounts[type];
  return Number(v) || 0;
};
const sevRank = (s) => SEVERITIES.indexOf(s);
const maxSeverity = (a, b) => (sevRank(a) >= sevRank(b) ? a : b);

/**
 * Step 1: DLP severity from what the scanner found.
 *   CRITICAL: PAN/account number together with salary keywords, or >= 10 PAN/account matches (bulk)
 *   HIGH:     any PAN/account number, or salary + confidential keywords together
 *   MEDIUM:   salary keyword or confidential keyword, or email + phone together, or >= 20 email/phone matches
 *   LOW:      an email or phone number on its own
 *   NONE:     nothing detected
 * Returns { severity, reasons[] }.
 */
function computeSeverity(detectedTypes = [], matchCounts = {}) {
  const types = new Set(detectedTypes);
  const has = (t) => types.has(t);
  const hasFinancialId = FINANCIAL_ID_TYPES.some(has);
  const financialMatches = FINANCIAL_ID_TYPES.reduce((n, t) => n + count(matchCounts, t), 0);
  const personalMatches = count(matchCounts, 'EMAIL') + count(matchCounts, 'PHONE');

  if (hasFinancialId && has('SALARY_KEYWORD')) {
    return { severity: 'CRITICAL', reasons: ['PAN/account number found together with salary keywords'] };
  }
  if (financialMatches >= BULK_FINANCIAL_THRESHOLD) {
    return { severity: 'CRITICAL', reasons: [`${financialMatches} PAN/account number matches (bulk financial data)`] };
  }
  if (hasFinancialId) return { severity: 'HIGH', reasons: ['PAN or account number found'] };
  if (has('SALARY_KEYWORD') && has('CONFIDENTIAL_KEYWORD')) {
    return { severity: 'HIGH', reasons: ['Salary and confidential keywords found together'] };
  }
  if (has('SALARY_KEYWORD') || has('CONFIDENTIAL_KEYWORD')) {
    return { severity: 'MEDIUM', reasons: ['Salary or confidential keyword found'] };
  }
  if (has('EMAIL') && has('PHONE')) return { severity: 'MEDIUM', reasons: ['Email addresses and phone numbers found together'] };
  if (personalMatches >= BULK_PERSONAL_THRESHOLD) {
    return { severity: 'MEDIUM', reasons: [`${personalMatches} email/phone matches (bulk personal data)`] };
  }
  if (has('EMAIL') || has('PHONE')) return { severity: 'LOW', reasons: ['Email or phone number found'] };
  return { severity: 'NONE', reasons: ['No sensitive content detected'] };
}

/**
 * Step 2: file classification from detected types + severity.
 *   HIGHLY_CONFIDENTIAL: (PAN or ACCOUNT_NUMBER) together with SALARY_KEYWORD, or severity CRITICAL
 *   CONFIDENTIAL:        severity HIGH or MEDIUM
 *   INTERNAL:            severity LOW
 *   PUBLIC:              anything else
 * Returns { classification, reason }.
 */
function classify({ detectedTypes = [], severity = 'NONE' } = {}) {
  const types = new Set(detectedTypes);
  const financialWithSalary = FINANCIAL_ID_TYPES.some((t) => types.has(t)) && types.has('SALARY_KEYWORD');

  if (financialWithSalary || severity === 'CRITICAL') {
    return { classification: 'HIGHLY_CONFIDENTIAL', reason: financialWithSalary ? 'Financial identifier with salary keywords' : 'DLP severity is CRITICAL' };
  }
  if (severity === 'HIGH' || severity === 'MEDIUM') {
    return { classification: 'CONFIDENTIAL', reason: `DLP severity is ${severity}` };
  }
  if (severity === 'LOW') return { classification: 'INTERNAL', reason: 'DLP severity is LOW' };
  return { classification: 'PUBLIC', reason: 'No sensitive content detected' };
}

module.exports = { computeSeverity, classify, maxSeverity };
