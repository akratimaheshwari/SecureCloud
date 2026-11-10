'use strict';
const normalizeEmail = (e) => String(e || '').trim().toLowerCase();
const getDomain = (e) => normalizeEmail(e).split('@')[1] || '';
module.exports = { normalizeEmail, getDomain };
