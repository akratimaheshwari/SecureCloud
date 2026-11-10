'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/eventController');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/authenticate');
const authorizeRoles = require('../middleware/authorizeRoles');
const schemas = require('../utils/validators');

router.use(authenticate);
router.get('/mine', validate({ query: schemas.eventsMine }), ctrl.listMine);
router.get('/', authorizeRoles('admin'), validate({ query: schemas.eventsAdmin }), ctrl.listAll);

module.exports = router;
