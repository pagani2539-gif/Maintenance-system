const express = require('express');
const router = express.Router();
const withdrawalsController = require('../controllers/withdrawals');
const { requirePermission } = require('../middlewares/auth');

router.get('/', withdrawalsController.getAllWithdrawals);
router.get('/:id', withdrawalsController.getWithdrawalById);
router.post('/', requirePermission('manage.withdrawals'), withdrawalsController.createWithdrawal);
router.put('/:id/items/:itemId/serial-numbers', requirePermission('manage.withdrawals'), withdrawalsController.updateItemSerialNumbers);
router.patch('/:id/company', requirePermission('manage.withdrawals'), withdrawalsController.updateWithdrawalCompany);
router.delete('/:id', requirePermission('delete.withdrawals'), withdrawalsController.deleteWithdrawal);

module.exports = router;
