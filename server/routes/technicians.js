const express = require('express');
const router = express.Router();
const controller = require('../controllers/technicians');
const { requirePermission } = require('../middlewares/auth');

router.get('/', controller.getAllTechnicians);
router.post('/', requirePermission('manage.technicianStock'), controller.createTechnician);
router.patch('/:id', requirePermission('manage.technicianStock'), controller.updateTechnician);

module.exports = router;
