const express = require('express');
const router = express.Router();
const repairController = require('../controllers/repairs');
const { uploadRepairImages } = require('../middlewares/upload');
const { hasPermission, requirePermission } = require('../middlewares/auth');

// Delete may be a repair OR a claim — gate by either delete.repairs or delete.claims
const requireDeleteRepairOrClaim = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'ไม่ได้เข้าสู่ระบบ' });
  if (hasPermission(req.user, 'delete.repairs') || hasPermission(req.user, 'delete.claims')) return next();
  return res.status(403).json({ error: 'ไม่มีสิทธิ์ลบรายการนี้' });
};

const requireManageRepairOrClaim = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (hasPermission(req.user, 'manage.repairs') || hasPermission(req.user, 'manage.claims')) return next();
  return res.status(403).json({ error: 'Insufficient permission' });
};

// Routes
router.get('/stats', repairController.getStats);
router.get('/dashboard-stats', repairController.getDashboardStats);
router.get('/unread-count', repairController.getUnreadCount);
router.get('/', repairController.getAllRepairs);
router.post('/', requirePermission('manage.repairs'), uploadRepairImages, repairController.createRepair);
router.post('/claim', requirePermission('manage.claims'), uploadRepairImages, repairController.createClaim);

router.get('/:id', repairController.getRepairById);
router.patch('/:id', requireManageRepairOrClaim, repairController.updateRepair);
router.patch('/:id/status', requireManageRepairOrClaim, repairController.updateStatus);
router.patch('/:id/read', requireManageRepairOrClaim, repairController.markAsRead);
router.patch('/:id/company', requireManageRepairOrClaim, repairController.updateRepairCompany);
router.delete('/remove/:id', requireDeleteRepairOrClaim, repairController.deleteRepair);
router.post('/:id/replace-device', requireManageRepairOrClaim, repairController.replaceDevice);

module.exports = router;
