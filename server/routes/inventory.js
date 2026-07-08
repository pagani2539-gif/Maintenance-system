const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventory');
const { uploadInventoryImage } = require('../middlewares/upload');
const { requirePermission } = require('../middlewares/auth');

router.get('/stats', inventoryController.getStats);
router.get('/lifecycle-report', inventoryController.getLifecycleReport);
router.get('/', inventoryController.getAllItems);
router.get('/:id/instances', inventoryController.getInstancesInStock);
router.get('/instances/:instanceId/timeline', inventoryController.getInstanceTimeline);
router.patch('/instances/:instanceId/condition', inventoryController.updateInstanceCondition);
router.post('/:id/serial-numbers', inventoryController.addInventorySerialNumbers);
router.post('/import', inventoryController.bulkImport);
router.post('/', uploadInventoryImage, inventoryController.createItem);
router.patch('/:id', uploadInventoryImage, inventoryController.updateItem);
router.delete('/:id', requirePermission('delete.inventory'), inventoryController.deleteItem);

module.exports = router;
