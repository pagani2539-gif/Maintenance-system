const express = require('express');
const { z } = require('zod');

const authController = require('../controllers/auth');
const repairController = require('../controllers/repairs');
const inventoryController = require('../controllers/inventory');
const withdrawalsController = require('../controllers/withdrawals');
const transactionsController = require('../controllers/transactions');
const poController = require('../controllers/purchaseOrders');
const searchController = require('../controllers/search');
const stationController = require('../controllers/stations');
const contractController = require('../controllers/contracts');
const settingsController = require('../controllers/settings');
const stockCountController = require('../controllers/stockCounts');
const usersController = require('../controllers/users');
const techniciansController = require('../controllers/technicians');
const technicianStockController = require('../controllers/technicianStock');
const reportsController = require('../controllers/reports');
const v2Controller = require('../controllers/v2');

const { requireAuth, requireFull, requirePermission, requireAdmin, hasPermission } = require('../middlewares/auth');
const { loginRateLimit } = require('../middlewares/loginRateLimit');
const { uploadV2Files, uploadV2LogoFiles } = require('../middlewares/upload');
const { idempotency } = require('../middlewares/idempotency');
const {
  pagination,
  parseMultipartPayload,
  normalizeLegacyRequest,
  validate,
  responseContract,
  v2Error,
} = require('../middlewares/apiV2');
const schemas = require('../schemas/v2');

const router = express.Router();
const empty = z.object({}).strict();
const freeform = z.object({}).passthrough();
const dateQuery = z.object({
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
}).passthrough();
const searchQuery = z.object({ q: z.string().trim().min(1).max(200) }).passthrough();
const companyId = z.object({ companyId: z.coerce.number().int().positive() }).strict();
const reviewWithRequiredNote = z.object({ reviewNote: z.string().trim().min(1).max(1000) }).strict();
const restore = z.object({
  filename: z.string().trim().min(1).max(255),
  password: z.string().max(200).optional(),
  confirmText: z.string().max(100).optional(),
}).strict();
const logo = z.object({
  label: z.string().trim().max(300).optional(),
  companyId: z.coerce.number().int().positive().optional(),
}).strict();

const json = (schema, handler, options = {}) => [
  validate(schema),
  ...(options.idempotent ? [idempotency] : []),
  normalizeLegacyRequest,
  handler,
];

const patchJson = (schema, table, fields, handler) => [
  validate(schema),
  normalizeLegacyRequest,
  v2Controller.mergeBodyFromRow(table, fields),
  handler,
];

const query = (schema = schemas.pagination, handler, options = {}) => [
  pagination,
  validate(schema, 'query'),
  ...(options.auditPagination ? [normalizeLegacyRequest, (req, _res, next) => {
    if (req.query.q) req.query.search = req.query.q;
    req.query.limit = String(req.v2Pagination.pageSize);
    req.query.offset = String(req.v2Pagination.offset);
    req.v2Pagination.skipResponseSlicing = true;
    next();
  }] : [normalizeLegacyRequest]),
  handler,
];

const multipart = (schema, handler, mode = 'single', options = {}) => [
  options.uploader || uploadV2Files,
  parseMultipartPayload,
  validate(schema),
  ...(options.idempotent ? [idempotency] : []),
  normalizeLegacyRequest,
  (req, _res, next) => {
    if (mode === 'single' && Array.isArray(req.files) && req.files.length > 1) {
      const error = new Error('endpoint นี้รับไฟล์ได้เพียง 1 ไฟล์');
      error.statusCode = 400;
      error.code = 'TOO_MANY_FILES';
      return next(error);
    }
    if (mode === 'single') req.file = Array.isArray(req.files) ? req.files[0] : undefined;
    next();
  },
  handler,
];

const requireRepairWrite = (req, res, next) => {
  if (hasPermission(req.user, 'manage.repairs') || hasPermission(req.user, 'manage.claims')) return next();
  return res.status(403).json({ error: 'ไม่มีสิทธิ์ดำเนินการนี้' });
};

router.use(responseContract);

// Authentication is intentionally outside the authenticated resource group.
router.post('/auth/login', loginRateLimit, ...json(schemas.login, authController.login));
router.get('/auth/me', requireAuth, authController.me);
router.post('/auth/password', requireAuth, ...json(schemas.changePassword, authController.changePassword));

// Repairs and claims
const repairs = express.Router();
repairs.get('/stats', normalizeLegacyRequest, repairController.getStats);
repairs.get('/dashboard-stats', ...query(dateQuery, repairController.getDashboardStats));
repairs.get('/unread-count', repairController.getUnreadCount);
repairs.get('/', ...query(schemas.pagination, repairController.getAllRepairs));
repairs.post('/', requirePermission('manage.repairs'), ...multipart(schemas.repair, repairController.createRepair, 'many', { idempotent: true }));
repairs.get('/:id', repairController.getRepairById);
repairs.patch('/:id', requireRepairWrite, ...[
  validate(schemas.repair),
  normalizeLegacyRequest,
  (req, res, next) => {
  if (Object.prototype.hasOwnProperty.call(req.body, 'company_id') && Object.keys(req.body).every((key) => key === 'company_id')) {
    return repairController.updateRepairCompany(req, res, next);
  }
  return v2Controller.mergeBodyFromRow('repairs', [
    'location', 'station_id', 'station_area_id', 'device_name', 'problem', 'priority', 'project_name'
  ])(req, res, () => repairController.updateRepair(req, res, next));
  },
]);
repairs.post('/:id/actions/status-transition', requireRepairWrite, ...json(schemas.statusTransition, repairController.updateStatus, { idempotent: true }));
repairs.post('/:id/actions/mark-read', requireRepairWrite, ...json(empty, repairController.markAsRead, { idempotent: true }));
repairs.post('/:id/actions/replace-device', requireRepairWrite, ...json(schemas.replacement, repairController.replaceDevice, { idempotent: true }));
repairs.delete('/:id', (req, res, next) => {
  if (hasPermission(req.user, 'delete.repairs') || hasPermission(req.user, 'delete.claims')) return repairController.deleteRepair(req, res, next);
  return res.status(403).json({ error: 'ไม่มีสิทธิ์ลบรายการนี้' });
});
router.use('/repairs', requireAuth, repairs);

const claims = express.Router();
claims.get('/', ...query(schemas.pagination, (req, res, next) => {
  req.query.type = 'claim';
  return repairController.getAllRepairs(req, res, next);
}));
claims.post('/', requirePermission('manage.claims'), ...multipart(schemas.repair, repairController.createClaim, 'many', { idempotent: true }));
claims.get('/:id', repairController.getRepairById);
claims.patch('/:id', requirePermission('manage.claims'), ...json(schemas.repair, repairController.updateRepair));
claims.post('/:id/actions/status-transition', requirePermission('manage.claims'), ...json(schemas.statusTransition, repairController.updateStatus, { idempotent: true }));
claims.post('/:id/actions/mark-read', requirePermission('manage.claims'), ...json(empty, repairController.markAsRead, { idempotent: true }));
claims.post('/:id/actions/replace-device', requirePermission('manage.claims'), ...json(schemas.replacement, repairController.replaceDevice, { idempotent: true }));
claims.delete('/:id', requirePermission('delete.claims'), repairController.deleteRepair);
router.use('/claims', requireAuth, claims);

// Inventory
const inventory = express.Router();
inventory.get('/stats', inventoryController.getStats);
inventory.get('/reports/lifecycle', ...query(schemas.pagination, inventoryController.getLifecycleReport));
inventory.get('/lifecycle-report', ...query(schemas.pagination, inventoryController.getLifecycleReport));
inventory.get('/adjustments', requireAdmin, ...query(schemas.pagination, inventoryController.getAdjustmentRequests));
inventory.get('/', ...query(schemas.pagination, inventoryController.getAllItems));
inventory.post('/', requirePermission('manage.inventory'), ...multipart(schemas.inventoryItem, inventoryController.createItem, 'single', { idempotent: true }));
inventory.patch('/:id', requirePermission('manage.inventory'), ...multipart(schemas.inventoryItem, (req, res, next) => (
  v2Controller.mergeBodyFromRow('inventory', [
    'name', 'model', 'description', 'min_stock', 'requires_sn', 'storage_location'
  ])(req, res, () => inventoryController.updateItem(req, res, next))
), 'single'));
inventory.delete('/:id', requirePermission('delete.inventory'), inventoryController.deleteItem);
inventory.get('/:id', v2Controller.getInventoryById);
inventory.get('/:id/instances', inventoryController.getInstancesInStock);
inventory.post('/:id/instances', requirePermission('manage.inventory'), ...json(schemas.serialNumbers, inventoryController.addInventorySerialNumbers, { idempotent: true }));
inventory.post('/:id/adjustments', requireAdmin, ...json(schemas.adjustment, inventoryController.createAdjustmentRequest, { idempotent: true }));
inventory.get('/instances/:instanceId/timeline', inventoryController.getInstanceTimeline);
inventory.patch('/instances/:instanceId', requirePermission('manage.inventory'), ...json(schemas.condition, inventoryController.updateInstanceCondition, { idempotent: true }));
inventory.post('/imports', requirePermission('manage.inventory'), ...json(z.object({ items: z.array(schemas.inventoryItem).min(1).max(500) }).strict(), inventoryController.bulkImport, { idempotent: true }));
const inventoryAdjustments = express.Router();
inventoryAdjustments.post('/:adjustmentId/actions/approve', requireAdmin, ...json(schemas.review, inventoryController.approveAdjustment, { idempotent: true }));
inventoryAdjustments.post('/:adjustmentId/actions/reject', requireAdmin, ...json(reviewWithRequiredNote, inventoryController.rejectAdjustment, { idempotent: true }));
router.use('/inventory-adjustments', requireAuth, inventoryAdjustments);
router.use('/inventory', requireAuth, inventory);

// Withdrawals and returns
const withdrawals = express.Router();
withdrawals.get('/', ...query(schemas.pagination, withdrawalsController.getAllWithdrawals));
withdrawals.get('/:id', withdrawalsController.getWithdrawalById);
withdrawals.post('/', requirePermission('manage.withdrawals'), ...json(schemas.withdrawal, withdrawalsController.createWithdrawal, { idempotent: true }));
withdrawals.patch('/:id', requirePermission('manage.withdrawals'), ...json(companyId, withdrawalsController.updateWithdrawalCompany));
withdrawals.patch('/:id/items/:itemId', requirePermission('manage.withdrawals'), ...json(schemas.serialNumbers, withdrawalsController.updateItemSerialNumbers, { idempotent: true }));
withdrawals.delete('/:id', requirePermission('delete.withdrawals'), withdrawalsController.deleteWithdrawal);
router.use('/withdrawals', requireAuth, withdrawals);

const returns = express.Router();
returns.post('/', requirePermission('manage.transactions'), ...multipart(schemas.returnItem, transactionsController.returnItem, 'single', { idempotent: true }));
router.use('/returns', requireAuth, returns);

const transactions = express.Router();
transactions.get('/latest', transactionsController.getLatestTransaction);
transactions.get('/', ...query(schemas.pagination, transactionsController.getAllTransactions));
transactions.delete('/:id', requirePermission('delete.transactions'), transactionsController.deleteTransaction);
router.use('/transactions', requireAuth, transactions);

// Purchase orders
const purchaseOrders = express.Router();
purchaseOrders.get('/vendors', poController.getVendors);
purchaseOrders.get('/', ...query(schemas.pagination, poController.getAllPOs));
purchaseOrders.get('/:id', poController.getPOById);
purchaseOrders.post('/', requirePermission('manage.purchase_orders'), ...json(schemas.purchaseOrder, poController.createPO, { idempotent: true }));
purchaseOrders.patch('/:id', requirePermission('manage.purchase_orders'), ...json(schemas.purchaseOrder, (req, res, next) => {
  if (Object.keys(req.body).length === 1 && Object.prototype.hasOwnProperty.call(req.body, 'company_id')) return poController.updatePOCompany(req, res, next);
  return poController.updatePO(req, res, next);
}));
purchaseOrders.delete('/:id', requirePermission('delete.purchase_orders'), poController.deletePO);
purchaseOrders.post('/:id/receipts', requirePermission('manage.purchase_orders'), ...json(schemas.receive, poController.receivePO, { idempotent: true }));
purchaseOrders.post('/actions/auto-generate', requirePermission('manage.purchase_orders'), ...json(empty, poController.triggerAutoPO, { idempotent: true }));
router.use('/purchase-orders', requireAuth, purchaseOrders);

// Search and reports
router.get('/search', requireAuth, ...query(searchQuery, searchController.globalSearch));
router.get('/reports/summary/counts', requireAuth, ...query(dateQuery, reportsController.getReportCounts));
router.get('/reports/:type', requireAuth, ...query(dateQuery, reportsController.generateReport));

// Stations
const stations = express.Router();
stations.get('/details', ...query(schemas.pagination, stationController.getStationDetails));
stations.get('/', ...query(schemas.pagination, stationController.getUniqueStations));
stations.post('/', requirePermission('manage.stations'), ...json(schemas.station, stationController.createStation, { idempotent: true }));
stations.get('/:id', (req, res, next) => {
  req.query.station_id = req.params.id;
  return stationController.getStationDetails(req, res, next);
});
stations.patch('/:id', requirePermission('manage.stations'), ...patchJson(schemas.station, 'stations', [
  'name', 'station_type', 'highway_no', 'direction', 'region', 'province',
  'responsible_person', 'operational_start_date', 'gps_coordinates'
], stationController.updateStation));
stations.delete('/:id', requirePermission('delete.stations'), stationController.deleteStation);
stations.patch('/:stationId/assets/:inventoryId', requirePermission('manage.stations'), ...json(schemas.assetStatus, stationController.upsertAssetStatus, { idempotent: true }));
stations.post('/:id/actions/verify', requirePermission('manage.stations'), ...json(empty, stationController.verifyStation, { idempotent: true }));
stations.post('/:id/asset-movements', requirePermission('manage.stations'), ...json(schemas.assetMove, (req, res, next) => {
  req.params.stationId = req.params.id;
  return stationController.moveAsset(req, res, next);
}, { idempotent: true }));
router.use('/stations', requireAuth, stations);

// Contracts
const contracts = express.Router();
contracts.get('/', ...query(schemas.pagination, contractController.getAllContracts));
contracts.get('/:id', v2Controller.getContractById);
contracts.post('/', requirePermission('manage.contracts'), ...json(schemas.contract, contractController.createContract, { idempotent: true }));
contracts.patch('/:id', requirePermission('manage.contracts'), ...patchJson(schemas.contract.partial(), 'contracts', [
  'contract_no', 'name', 'year_be', 'company_id', 'start_date', 'end_date', 'note'
], contractController.updateContract));
contracts.delete('/:id', requirePermission('delete.contracts'), contractController.deleteContract);
router.use('/contracts', requireAuth, contracts);

// Settings, companies, logos and backups
const settings = express.Router();
settings.get('/companies', ...query(schemas.pagination, settingsController.getCompanies));
settings.get('/companies/:id', settingsController.getCompanyById);
settings.post('/companies', requirePermission('manage.companies'), ...json(schemas.company, settingsController.createCompany, { idempotent: true }));
settings.patch('/companies/:id', requirePermission('manage.companies'), ...patchJson(schemas.company, 'companies', [
  'name_th', 'name_en', 'name_short', 'address', 'phone', 'email', 'tax_id', 'website'
], settingsController.updateCompany));
settings.delete('/companies/:id', requirePermission('manage.companies'), settingsController.deleteCompany);
settings.post('/companies/:id/actions/set-default', requirePermission('manage.companies'), ...json(empty, settingsController.setDefaultCompany, { idempotent: true }));
settings.get('/logos', ...query(schemas.pagination, settingsController.getLogos));
settings.post('/logos', requirePermission('manage.companies'), ...multipart(logo, settingsController.uploadLogo, 'single', {
  idempotent: true,
  uploader: uploadV2LogoFiles,
}));
settings.post('/logos/:id/actions/set-default', requirePermission('manage.companies'), ...json(empty, settingsController.setDefaultLogo, { idempotent: true }));
settings.delete('/logos/:id', requirePermission('manage.companies'), settingsController.deleteLogo);
settings.get('/system', settingsController.getSystemSettings);
settings.patch('/system', requireFull, ...json(freeform, settingsController.updateSystemSettings));
settings.get('/backups', requireFull, settingsController.getBackups);
settings.post('/backups', requireFull, ...json(empty, settingsController.createBackup, { idempotent: true }));
settings.delete('/backups/:filename', requireFull, settingsController.deleteBackup);
settings.get('/backups/download/:filename', requireFull, settingsController.downloadBackup);
settings.post('/backups/actions/restore', requireFull, ...json(restore, settingsController.restoreBackup, { idempotent: true }));
router.use('/settings', requireAuth, settings);

// Users and audit logs
const users = express.Router();
users.get('/audit-logs', requireFull, ...query(schemas.pagination, usersController.getAuditLogs, { auditPagination: true }));
users.get('/', requireFull, ...query(schemas.pagination, usersController.list));
users.get('/:id', requireFull, v2Controller.getUserById);
users.post('/', requireFull, ...json(schemas.user, usersController.create, { idempotent: true }));
users.patch('/:id', requireFull, ...json(schemas.user, usersController.update));
users.delete('/:id', requireFull, usersController.remove);
router.use('/users', requireAuth, users);

// Stock counts
const stockCounts = express.Router();
stockCounts.get('/', ...query(schemas.pagination, stockCountController.getAllCounts));
stockCounts.get('/:id', stockCountController.getCountById);
stockCounts.post('/', requirePermission('manage.stock_counts'), ...json(z.object({ note: z.string().trim().max(1000).nullable().optional() }).strict(), stockCountController.createCount, { idempotent: true }));
stockCounts.patch('/:id/items/:itemId', requirePermission('manage.stock_counts'), ...json(schemas.stockCountItem, stockCountController.updateCountItem, { idempotent: true }));
stockCounts.post('/:id/actions/complete', requirePermission('manage.stock_counts'), ...json(empty, stockCountController.completeCount, { idempotent: true }));
stockCounts.post('/:id/actions/cancel', requirePermission('manage.stock_counts'), ...json(empty, stockCountController.cancelCount, { idempotent: true }));
router.use('/stock-counts', requireAuth, stockCounts);

// Technicians and technician stock
const technicians = express.Router();
technicians.get('/', ...query(schemas.pagination, techniciansController.getAllTechnicians));
technicians.get('/:id', v2Controller.getTechnicianById);
technicians.post('/', requirePermission('manage.technicianStock'), ...json(schemas.technician, techniciansController.createTechnician, { idempotent: true }));
technicians.patch('/:id', requirePermission('manage.technicianStock'), ...patchJson(schemas.technician, 'technicians', [
  'full_name', 'code', 'phone', 'user_id', 'is_active'
], techniciansController.updateTechnician));
router.use('/technicians', requireAuth, technicians);

const technicianStock = express.Router();
technicianStock.get('/holdings', ...query(schemas.pagination, technicianStockController.getHoldings));
technicianStock.get('/movements', ...query(schemas.pagination, technicianStockController.getMovements));
technicianStock.post('/actions/load', requirePermission('manage.technicianStock'), ...json(schemas.technicianStock, technicianStockController.loadStock, { idempotent: true }));
technicianStock.post('/actions/install', requirePermission('manage.technicianStock'), ...json(schemas.technicianStock, technicianStockController.installStock, { idempotent: true }));
technicianStock.post('/actions/return', requirePermission('manage.technicianStock'), ...json(schemas.technicianStock, technicianStockController.returnStock, { idempotent: true }));
technicianStock.delete('/movements/:id', requirePermission('delete.technicianStock'), technicianStockController.deleteMovement);
router.use('/technician-stock', requireAuth, technicianStock);

router.use((_req, res) => res.status(404).json({
  error: {
    code: 'NOT_FOUND',
    message: 'ไม่พบ endpoint ที่ร้องขอ',
    details: [],
    requestId: _req.requestId,
  },
}));
router.use(v2Error);

module.exports = router;
