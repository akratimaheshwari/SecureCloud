'use strict';
const router = require('express').Router();

router.use('/auth', require('./authRoutes'));
router.use('/files', require('./fileRoutes'));
router.use('/shares', require('./shareRoutes'));
router.use('/dlp', require('./dlpRoutes'));
router.use('/events', require('./eventRoutes'));
router.use('/audit', require('./auditRoutes'));
router.use('/admin', require('./adminRoutes'));

module.exports = router;
