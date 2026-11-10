'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/authController');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/authenticate');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimiter');
const schemas = require('../utils/validators');

router.post('/register', registerLimiter, validate(schemas.register), ctrl.register);
router.post('/login', loginLimiter, validate(schemas.login), ctrl.login);
router.get('/me', authenticate, ctrl.me);

module.exports = router;
