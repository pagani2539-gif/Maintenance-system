const express = require('express');
const router = express.Router();
const transactionsController = require('../controllers/transactions');
const { uploadReturnImage } = require('../middlewares/upload');
const { requirePermission } = require('../middlewares/auth');

router.get('/latest', transactionsController.getLatestTransaction);
router.get('/', transactionsController.getAllTransactions);
router.post('/return', requirePermission('manage.transactions'), uploadReturnImage, transactionsController.returnItem);
router.delete('/:id', requirePermission('delete.transactions'), transactionsController.deleteTransaction);

module.exports = router;
