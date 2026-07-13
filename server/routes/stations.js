const express = require('express');
const router = express.Router();
const stationController = require('../controllers/stations');
const { requirePermission } = require('../middlewares/auth');

// Routes
router.get('/', stationController.getUniqueStations);
router.get('/details', stationController.getStationDetails);
router.post('/', requirePermission('manage.stations'), stationController.createStation);
router.put('/:stationId/assets/:inventoryId/status', requirePermission('manage.stations'), stationController.upsertAssetStatus);
router.post('/:id/verify', requirePermission('manage.stations'), stationController.verifyStation);
router.post('/:stationId/assets/move', requirePermission('manage.stations'), stationController.moveAsset);
router.delete('/:id', requirePermission('delete.stations'), stationController.deleteStation);
router.patch('/:id', requirePermission('manage.stations'), stationController.updateStation);

module.exports = router;
