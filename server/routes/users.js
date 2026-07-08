const express = require('express');
const router = express.Router();
const usersController = require('../controllers/users');
const { requireFull } = require('../middlewares/auth');

// All user management endpoints require Full privileges
router.get('/', requireFull, usersController.list);
router.post('/', requireFull, usersController.create);
router.get('/audit-logs', requireFull, usersController.getAuditLogs);
router.put('/:id', requireFull, usersController.update);
router.delete('/:id', requireFull, usersController.remove);

module.exports = router;
