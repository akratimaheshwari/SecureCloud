'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/adminController');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/authenticate');
const authorizeRoles = require('../middleware/authorizeRoles');
const schemas = require('../utils/validators');

router.use(authenticate, authorizeRoles('admin'));

router.get('/stats', ctrl.getStats);
router.get('/users', validate({ query: schemas.listUsers }), ctrl.listUsers);
router.patch('/users/:id/role', validate({ params: schemas.idParam, body: schemas.changeRole }), ctrl.changeRole);

module.exports = router;
