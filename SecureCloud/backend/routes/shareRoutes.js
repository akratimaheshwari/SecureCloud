'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/shareController');
const validate = require('../middleware/validate');
const { authenticate, optionalAuthenticate } = require('../middleware/authenticate');
const authorizeRoles = require('../middleware/authorizeRoles');
const schemas = require('../utils/validators');

// Token link: public, login optional (see enforceRecipient in the controller)
router.get('/access/:token', optionalAuthenticate, validate({ params: schemas.tokenParam }), ctrl.accessShare);

router.use(authenticate);

router.post('/', validate(schemas.createShare), ctrl.createShare);
router.get('/mine', validate({ query: schemas.listShares }), ctrl.listMine);
router.get('/with-me', validate({ query: schemas.pageOnly }), ctrl.listWithMe);
router.post('/:id/revoke', validate({ params: schemas.idParam }), ctrl.revokeShare);

// Admin approval flow for REQUIRE_APPROVAL decisions
router.get('/pending-approval', authorizeRoles('admin'), validate({ query: schemas.pageOnly }), ctrl.listPendingApproval);
router.post('/:id/approve', authorizeRoles('admin'), validate({ params: schemas.idParam }), ctrl.approveShare);
router.post('/:id/reject', authorizeRoles('admin'), validate({ params: schemas.idParam, body: schemas.rejectShare }), ctrl.rejectShare);

module.exports = router;
