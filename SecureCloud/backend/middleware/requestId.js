'use strict';
const { v4: uuidv4 } = require('uuid');
// Correlates logs, audit entries and error responses for one request.
module.exports = (req, res, next) => {
  req.id = uuidv4();
  res.setHeader('X-Request-Id', req.id);
  next();
};
