const { query } = require('../database/db');

const validateStationExists = async (stationId) => {
  if (!stationId) return;
  const { rows } = await query('SELECT status FROM stations WHERE id = $1', [stationId]);
  const row = rows[0];
  if (!row) {
    const err = new Error('ไม่พบสถานีที่เลือกในระบบ');
    err.status = 400;
    throw err;
  }
  if (row.status !== 1) {
    const err = new Error('สถานีที่เลือกถูกปิดใช้งานหรือลบออกแล้ว');
    err.status = 400;
    throw err;
  }
};

const validateStationAreaBelongsToStation = async (stationId, stationAreaId) => {
  if (!stationAreaId) return;
  if (!stationId) {
    const err = new Error('กรุณาระบุสถานีสำหรับพื้นที่ย่อยที่เลือก');
    err.status = 400;
    throw err;
  }

  // First ensure station exists and is active
  await validateStationExists(stationId);

  const { rows } = await query('SELECT id, status FROM station_areas WHERE id = $1 AND station_id = $2', [stationAreaId, stationId]);
  const row = rows[0];
  if (!row) {
    const err = new Error('พื้นที่ย่อยที่เลือกไม่อยู่ในสถานีนี้');
    err.status = 400;
    throw err;
  }
  if (row.status === 0) {
    const err = new Error('พื้นที่ย่อยที่เลือกถูกปิดใช้งานหรือลบออกแล้ว');
    err.status = 400;
    throw err;
  }
};

const getStationSnapshotName = async (stationId) => {
  if (!stationId) return null;
  const { rows } = await query('SELECT name FROM stations WHERE id = $1', [stationId]);
  return rows[0] ? rows[0].name : null;
};

module.exports = {
  validateStationExists,
  validateStationAreaBelongsToStation,
  getStationSnapshotName
};
