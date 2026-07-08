const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reports');

// GET /api/reports/summary/counts?startDate=&endDate= — must precede /:type
router.get('/summary/counts', reportsController.getReportCounts);

// GET /api/reports/:type?startDate=&endDate=
router.get('/:type', reportsController.generateReport);

module.exports = router;
