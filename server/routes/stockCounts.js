const express = require('express');
const router = express.Router();
const stockCountsController = require('../controllers/stockCounts');
const { requirePermission } = require('../middlewares/auth');

router.get('/', stockCountsController.getAllCounts);
router.get('/:id', stockCountsController.getCountById);
router.post('/', requirePermission('manage.stock_counts'), stockCountsController.createCount);
router.patch('/:id/items/:itemId', requirePermission('manage.stock_counts'), stockCountsController.updateCountItem);
router.post('/:id/complete', requirePermission('manage.stock_counts'), stockCountsController.completeCount);
router.post('/:id/cancel', requirePermission('manage.stock_counts'), stockCountsController.cancelCount);

module.exports = router;
