'use strict';
const jwt = require('jsonwebtoken');
const env = require('../config/env');

// HS256 is pinned on both sign and verify to block algorithm-confusion attacks.
const signToken = (user) =>
  jwt.sign({ role: user.role }, env.jwtSecret, {
    subject: String(user._id),
    expiresIn: env.jwtExpiresIn,
    algorithm: 'HS256',
  });

const verifyToken = (token) => jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });

module.exports = { signToken, verifyToken };
