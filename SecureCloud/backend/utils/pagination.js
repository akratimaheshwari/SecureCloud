'use strict';
function parsePagination(query = {}, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}
const pageMeta = (total, page, limit) => ({ page, limit, total, pages: Math.ceil(total / limit) || 0 });
module.exports = { parsePagination, pageMeta };
