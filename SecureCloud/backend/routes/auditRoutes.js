'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/auditController');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/authenticate');
const authorizeRoles = require('../middleware/authorizeRoles');
const schemas = require('../utils/validators');

router.get('/', authenticate, authorizeRoles('admin'), validate({ query: schemas.auditQuery }), ctrl.listAudit);

module.exports = router;
