'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/fileController');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/authenticate');
const authorizeRoles = require('../middleware/authorizeRoles');
const schemas = require('../utils/validators');

router.use(authenticate);

router.post('/upload-url', validate(schemas.uploadUrl), ctrl.createUploadUrl);
router.get('/', validate({ query: schemas.listFiles }), ctrl.listFiles);
router.post('/:id/confirm', validate({ params: schemas.idParam, body: schemas.confirmUpload }), ctrl.confirmUpload);
router.get('/:id/download-url', validate({ params: schemas.idParam }), ctrl.getDownloadUrl);
router.get('/:id', validate({ params: schemas.idParam }), ctrl.getFile);
router.delete('/:id', validate({ params: schemas.idParam }), ctrl.deleteFile);

// Admin only
router.patch('/:id/lock', authorizeRoles('admin'), validate({ params: schemas.idParam, body: schemas.lockFile }), ctrl.lockFile);
router.patch('/:id/unlock', authorizeRoles('admin'), validate({ params: schemas.idParam }), ctrl.unlockFile);
router.patch('/:id/release', authorizeRoles('admin'), validate({ params: schemas.idParam, body: schemas.releaseFile }), ctrl.releaseFile);

module.exports = router;
