'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/dlpController');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/authenticate');
const verifyLambdaKey = require('../middleware/verifyLambdaKey');
const { lambdaLimiter } = require('../middleware/rateLimiter');
const schemas = require('../utils/validators');

// Lambda callback: x-api-key only, no JWT
router.post('/scan-result', lambdaLimiter, verifyLambdaKey, validate(schemas.scanResult), ctrl.saveScanResult);

router.get('/results/:fileId', authenticate, validate({ params: schemas.fileIdParam }), ctrl.getResults);

module.exports = router;
