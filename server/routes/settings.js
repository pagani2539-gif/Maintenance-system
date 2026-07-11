const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settings');
const { uploadCompanyLogo } = require('../middlewares/upload');
const { requireAuth, requireFull, requirePermission } = require('../middlewares/auth');

// Companies
router.get('/companies', settingsController.getCompanies);
router.post('/companies', requirePermission('manage.companies'), settingsController.createCompany);
router.get('/companies/:id', settingsController.getCompanyById);
router.put('/companies/:id', requirePermission('manage.companies'), settingsController.updateCompany);
router.delete('/companies/:id', requirePermission('manage.companies'), settingsController.deleteCompany);
router.patch('/companies/:id/default', requirePermission('manage.companies'), settingsController.setDefaultCompany);

// Logos
router.get('/logos', settingsController.getLogos);
router.post('/logos', requirePermission('manage.companies'), uploadCompanyLogo, settingsController.uploadLogo);
router.patch('/logos/:id/default', requirePermission('manage.companies'), settingsController.setDefaultLogo);
router.delete('/logos/:id', requirePermission('manage.companies'), settingsController.deleteLogo);

// System Settings (LINE Tokens, etc.)
router.get('/system', requireAuth, settingsController.getSystemSettings);
router.put('/system', requireAuth, requireFull, settingsController.updateSystemSettings);

// Database Backup & Restore Manager
router.get('/backups', requireAuth, requireFull, settingsController.getBackups);
router.post('/backups', requireAuth, requireFull, settingsController.createBackup);
router.delete('/backups/:filename', requireAuth, requireFull, settingsController.deleteBackup);
router.get('/backups/download/:filename', requireAuth, requireFull, settingsController.downloadBackup);
router.post('/backups/restore', requireAuth, requireFull, settingsController.restoreBackup);

module.exports = router;
