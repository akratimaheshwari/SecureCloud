'use strict';
const Joi = require('joi');
const ApiError = require('../utils/ApiError');

const OPTIONS = { abortEarly: false, stripUnknown: true, convert: true };

/**
 * validate(schema)                       -> validates req.body
 * validate({ params, query, body })      -> validates each part with its own Joi schema
 * Validated (and converted) values replace the originals, so controllers can trust them.
 */
module.exports = (schemaOrMap) => {
  const map = Joi.isSchema(schemaOrMap) ? { body: schemaOrMap } : schemaOrMap;

  return (req, res, next) => {
    const problems = [];
    for (const source of ['params', 'query', 'body']) {
      if (!map[source]) continue;
      const { value, error } = map[source].validate(req[source] || {}, OPTIONS);
      if (error) {
        problems.push(...error.details.map((d) => ({ in: source, field: d.path.join('.'), message: d.message.replace(/"/g, "'") })));
      } else {
        req[source] = value; // Express 4: params/query/body are writable
      }
    }
    if (problems.length) return next(new ApiError(400, 'Validation failed', 'VALIDATION_ERROR', problems));
    return next();
  };
};
