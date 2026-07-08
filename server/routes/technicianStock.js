const express = require('express');
const router = express.Router();
const controller = require('../controllers/technicianStock');
const { requirePermission } = require('../middlewares/auth');

router.get('/holdings', controller.getHoldings);
router.get('/movements', controller.getMovements);
router.post('/load', requirePermission('manage.technicianStock'), controller.loadStock);
router.post('/install', requirePermission('manage.technicianStock'), controller.installStock);
router.post('/return', requirePermission('manage.technicianStock'), controller.returnStock);
router.delete('/movements/:id', requirePermission('delete.technicianStock'), controller.deleteMovement);

module.exports = router;
