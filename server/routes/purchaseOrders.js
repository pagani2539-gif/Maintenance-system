const express = require('express');
const router = express.Router();
const poController = require('../controllers/purchaseOrders');
const { requirePermission } = require('../middlewares/auth');

router.get('/', poController.getAllPOs);
router.get('/vendors', poController.getVendors);
router.post('/auto-generate', requirePermission('manage.purchase_orders'), poController.triggerAutoPO);
router.get('/:id', poController.getPOById);
router.post('/', requirePermission('manage.purchase_orders'), poController.createPO);
router.patch('/:id', requirePermission('manage.purchase_orders'), poController.updatePO);
router.patch('/:id/company', requirePermission('manage.purchase_orders'), poController.updatePOCompany);
router.delete('/:id', requirePermission('delete.purchase_orders'), poController.deletePO);
router.post('/:id/receive', requirePermission('manage.purchase_orders'), poController.receivePO);

module.exports = router;
