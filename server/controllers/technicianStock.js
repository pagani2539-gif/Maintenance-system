const { query, withTransaction } = require('../database/db');
const { generateDocNo } = require('../utils/docNumber');
const { logAudit } = require('../utils/auditLogger');
const { sendLineNotify } = require('../utils/lineNotify');
const { checkAndGenerateAutoPOs } = require('../utils/autoPo');
const {
  validateStationExists,
  validateStationAreaBelongsToStation,
  getStationSnapshotName,
} = require('../utils/stationValidation');
const { INSTANCE_STATUS } = require('../utils/constants');

/*
 * Technician spare-stock ("van / trunk" inventory).
 *
 * INVARIANT (avoid double counting): a spare in a technician's kit is tracked
 * by THIS system only — never via a `withdrawals` row. `inventory.quantity`
 * means "physically in the central warehouse":
 *   LOAD    warehouse -> tech kit   => inventory.quantity -= qty   (leaves the shelf)
 *   INSTALL tech kit -> station     => inventory.quantity UNCHANGED (already left)
 *   RETURN  tech kit -> warehouse   => inventory.quantity += qty   (back on shelf)
 * A technician's on-hand balance is derived from technician_stock_movements
 * (SUM of signed quantity) — never stored as a counter.
 */

const MOVEMENT_NO_OPTS = { table: 'technician_stock_movements', column: 'movement_no' };

// Insert one ledger row. `client` must be a transaction client.
const insertMovement = (client, data) => {
  const {
    movement_no, technician_id, movement_type, inventory_id,
    instance_id = null, quantity, station_id = null, station_area_id = null,
    repair_id = null, removed_serial = null, removed_model = null,
    note = null, performed_by = null,
  } = data;
  return client.query(
    `INSERT INTO technician_stock_movements
       (movement_no, technician_id, movement_type, inventory_id, instance_id,
        quantity, station_id, station_area_id, repair_id, removed_serial,
        removed_model, note, performed_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [movement_no, technician_id, movement_type, inventory_id, instance_id,
     quantity, station_id, station_area_id, repair_id, removed_serial,
     removed_model, note, performed_by]
  );
};

// Current on-hand quantity of one item in one technician's kit (within a tx).
const getOnHand = async (client, technicianId, inventoryId) => {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(quantity), 0) AS bal
       FROM technician_stock_movements
       WHERE technician_id = $1 AND inventory_id = $2`,
    [technicianId, inventoryId]
  );
  return Number(rows[0].bal) || 0;
};

const getActiveTechnician = async (client, technicianId) => {
  const { rows } = await client.query('SELECT * FROM technicians WHERE id = $1', [technicianId]);
  const tech = rows[0];
  if (!tech) {
    const err = new Error('ไม่พบข้อมูลช่าง'); err.status = 400; throw err;
  }
  if (!tech.is_active) {
    const err = new Error('ช่างคนนี้ถูกปิดใช้งาน'); err.status = 400; throw err;
  }
  return tech;
};

const cleanSerials = (arr) => (arr || []).map(s => String(s || '').trim()).filter(Boolean);

// ── Reads ────────────────────────────────────────────────────────────────

// GET /holdings?technician_id=  → one technician's kit (items + serialized units)
// GET /holdings (no param)      → summary row per technician
exports.getHoldings = async (req, res) => {
  try {
    const { technician_id } = req.query;
    if (technician_id) {
      const { rows: holdings } = await query(
        `SELECT * FROM technician_holdings_view
           WHERE technician_id = $1 AND on_hand_qty > 0
           ORDER BY product_name`,
        [technician_id]
      );
      const { rows: instances } = await query(
        `SELECT * FROM technician_held_instances_view
           WHERE technician_id = $1
           ORDER BY product_name, serial_number`,
        [technician_id]
      );
      return res.json({ holdings, instances });
    }

    const { rows } = await query(`
      SELECT t.id AS technician_id, t.full_name, t.code, t.phone, t.is_active,
             COALESCE(h.item_count, 0) AS item_count,
             COALESCE(h.total_qty, 0) AS total_qty
      FROM technicians t
      LEFT JOIN (
        SELECT technician_id, COUNT(*) AS item_count, SUM(on_hand_qty) AS total_qty
        FROM technician_holdings_view WHERE on_hand_qty > 0
        GROUP BY technician_id
      ) h ON h.technician_id = t.id
      ORDER BY t.is_active DESC, t.full_name ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /movements?technician_id=&station_id=&type=  → the ledger (who / what / where / when)
exports.getMovements = async (req, res) => {
  try {
    const { technician_id, station_id, type, inventory_id } = req.query;
    const params = [];
    const conds = [];
    if (technician_id) { params.push(technician_id); conds.push(`m.technician_id = $${params.length}`); }
    if (station_id) { params.push(station_id); conds.push(`m.station_id = $${params.length}`); }
    if (type) { params.push(type); conds.push(`m.movement_type = $${params.length}`); }
    if (inventory_id) { params.push(inventory_id); conds.push(`m.inventory_id = $${params.length}`); }

    let sql = `
      SELECT m.*, t.full_name AS technician_name,
             i.name AS product_name, i.model AS product_model,
             inst.serial_number,
             s.name AS station_name, s.code AS station_code,
             sa.name AS station_area_name
      FROM technician_stock_movements m
      JOIN technicians t ON m.technician_id = t.id
      JOIN inventory i ON m.inventory_id = i.id
      LEFT JOIN inventory_instances inst ON m.instance_id = inst.id
      LEFT JOIN stations s ON m.station_id = s.id
      LEFT JOIN station_areas sa ON m.station_area_id = sa.id
    `;
    if (conds.length) sql += ` WHERE ` + conds.join(' AND ');
    sql += ` ORDER BY m.created_at DESC, m.id DESC`;
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── LOAD: warehouse -> technician kit ─────────────────────────────────────
exports.loadStock = async (req, res) => {
  const { technician_id, items, note } = req.body;
  const performed_by = req.user.full_name;
  if (!technician_id) return res.status(400).json({ error: 'กรุณาเลือกช่าง' });
  if (!items || items.length === 0) return res.status(400).json({ error: 'กรุณาเลือกอุปกรณ์ที่ต้องการโหลด' });

  try {
    const lowStockAlerts = [];
    await withTransaction(async (client) => {
      const tech = await getActiveTechnician(client, technician_id);
      const custodyLocation = `ช่าง: ${tech.full_name}`;

      for (const item of items) {
        const qty = Number(item.quantity) || 0;
        if (qty <= 0) { const e = new Error('จำนวนต้องมากกว่า 0'); e.status = 400; throw e; }

        const { rows: invRows } = await client.query(
          'SELECT name, quantity FROM inventory WHERE id = $1', [item.inventory_id]);
        const inv = invRows[0];
        if (!inv || inv.quantity < qty) {
          const e = new Error(inv ? `อุปกรณ์ "${inv.name}" ในคลังคงเหลือไม่เพียงพอ` : 'ไม่พบข้อมูลอุปกรณ์บางรายการ');
          e.status = 400; throw e;
        }

        // Leaves the central warehouse shelf → decrement inventory.quantity.
        await client.query('UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2', [qty, item.inventory_id]);

        const serials = cleanSerials(item.serial_numbers);
        if (serials.length > qty) { const e = new Error('จำนวน S/N มากกว่าจำนวนที่โหลด'); e.status = 400; throw e; }

        for (const sn of serials) {
          const { rows: snRows } = await client.query('SELECT id, inventory_id, status FROM inventory_instances WHERE serial_number = $1', [sn]);
          const existing = snRows[0];
          if (existing && existing.inventory_id !== item.inventory_id) {
            const e = new Error(`S/N '${sn}' ถูกใช้กับอุปกรณ์ประเภทอื่นแล้ว`); e.status = 400; throw e;
          }
          if (existing && (existing.status === INSTANCE_STATUS.WITH_TECHNICIAN || existing.status === INSTANCE_STATUS.WITHDRAWN)) {
            const e = new Error(`S/N '${sn}' กำลังถูกถือ/เบิกออกอยู่แล้ว ไม่สามารถโหลดซ้ำได้`); e.status = 400; throw e;
          }

          let instanceId;
          if (existing) {
            instanceId = existing.id;
            await client.query(
              `UPDATE inventory_instances SET status = $1, current_location = $2, station_id = NULL, updated_at = NOW() WHERE id = $3`,
              [INSTANCE_STATUS.WITH_TECHNICIAN, custodyLocation, instanceId]);
          } else {
            const { rows: ins } = await client.query(
              `INSERT INTO inventory_instances (inventory_id, serial_number, status, current_location)
               VALUES ($1, $2, $3, $4) RETURNING id`,
              [item.inventory_id, sn, INSTANCE_STATUS.WITH_TECHNICIAN, custodyLocation]);
            instanceId = ins[0].id;
          }

          const movement_no = await generateDocNo('TK', MOVEMENT_NO_OPTS);
          await insertMovement(client, {
            movement_no, technician_id, movement_type: 'LOAD', inventory_id: item.inventory_id,
            instance_id: instanceId, quantity: 1, note, performed_by,
          });
        }

        const bulk = qty - serials.length;
        if (bulk > 0) {
          const movement_no = await generateDocNo('TK', MOVEMENT_NO_OPTS);
          await insertMovement(client, {
            movement_no, technician_id, movement_type: 'LOAD', inventory_id: item.inventory_id,
            quantity: bulk, note, performed_by,
          });
        }

        const { rows: chk } = await client.query('SELECT name, quantity, min_stock FROM inventory WHERE id = $1', [item.inventory_id]);
        if (chk[0] && chk[0].quantity < chk[0].min_stock) {
          lowStockAlerts.push(`\n⚠️ *อุปกรณ์ต่ำกว่าเกณฑ์ขั้นต่ำ!*\nพัสดุ: ${chk[0].name}\nคงเหลือ: ${chk[0].quantity} ชิ้น (ขั้นต่ำ: ${chk[0].min_stock} ชิ้น)`);
        }
      }
    });

    lowStockAlerts.forEach(msg => sendLineNotify('stock', msg));
    checkAndGenerateAutoPOs().catch(e => console.error('Auto-PO after tech load failed:', e.message));
    res.status(201).json({ message: 'โหลดอะไหล่เข้าช่างเรียบร้อย' });
  } catch (err) {
    console.error('Technician loadStock error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
};

// ── INSTALL: technician kit -> installed at a station (the "swap") ─────────
exports.installStock = async (req, res) => {
  const { technician_id, items, station_id, station_area_id, removed_serial, removed_model, note } = req.body;
  const performed_by = req.user.full_name;
  if (!technician_id) return res.status(400).json({ error: 'กรุณาเลือกช่าง' });
  if (!items || items.length === 0) return res.status(400).json({ error: 'กรุณาเลือกอุปกรณ์ที่ติดตั้ง' });
  if (!station_id) return res.status(400).json({ error: 'กรุณาระบุสถานีที่ติดตั้ง' });

  try {
    await validateStationExists(station_id);
    await validateStationAreaBelongsToStation(station_id, station_area_id);
    const stationName = await getStationSnapshotName(station_id);

    await withTransaction(async (client) => {
      await getActiveTechnician(client, technician_id);
      // The optional removed/broken unit is captured once per swap; it is
      // attached to the first movement row and its instance marked Damaged.
      let removedAttached = false;

      if (removed_serial && String(removed_serial).trim()) {
        const { rows } = await client.query('SELECT id FROM inventory_instances WHERE serial_number = $1', [String(removed_serial).trim()]);
        if (rows[0]) {
          await client.query(
            `UPDATE inventory_instances SET status = $1, current_location = $2, updated_at = NOW() WHERE id = $3`,
            [INSTANCE_STATUS.DAMAGED, `ถอดจาก: ${stationName || station_id}`, rows[0].id]);
        }
      }

      for (const item of items) {
        const qty = Number(item.quantity) || 0;
        if (qty <= 0) { const e = new Error('จำนวนต้องมากกว่า 0'); e.status = 400; throw e; }

        const onHand = await getOnHand(client, technician_id, item.inventory_id);
        if (onHand < qty) {
          const { rows: nm } = await client.query('SELECT name FROM inventory WHERE id = $1', [item.inventory_id]);
          const e = new Error(`ช่างถืออุปกรณ์ "${nm[0] ? nm[0].name : item.inventory_id}" ไม่พอ (มี ${onHand}, ต้องใช้ ${qty})`);
          e.status = 400; throw e;
        }

        const serials = cleanSerials(item.serial_numbers);
        if (serials.length > qty) { const e = new Error('จำนวน S/N มากกว่าจำนวนที่ติดตั้ง'); e.status = 400; throw e; }

        for (const sn of serials) {
          const { rows: snRows } = await client.query(
            `SELECT id, status FROM inventory_instances WHERE serial_number = $1 AND inventory_id = $2`,
            [sn, item.inventory_id]);
          const inst = snRows[0];
          if (!inst || inst.status !== INSTANCE_STATUS.WITH_TECHNICIAN) {
            const e = new Error(`S/N '${sn}' ไม่ได้อยู่ในมือช่างคนนี้`); e.status = 400; throw e;
          }
          // Confirm custody belongs to this technician (latest movement).
          const { rows: heldRows } = await client.query(
            'SELECT technician_id FROM technician_held_instances_view WHERE instance_id = $1', [inst.id]);
          if (!heldRows[0] || String(heldRows[0].technician_id) !== String(technician_id)) {
            const e = new Error(`S/N '${sn}' ไม่ได้อยู่ในมือช่างคนนี้`); e.status = 400; throw e;
          }

          await client.query(
            `UPDATE inventory_instances SET status = $1, current_location = $2, station_id = $3, updated_at = NOW() WHERE id = $4`,
            [INSTANCE_STATUS.WITHDRAWN, stationName || String(station_id), station_id, inst.id]);

          const movement_no = await generateDocNo('TK', MOVEMENT_NO_OPTS);
          await insertMovement(client, {
            movement_no, technician_id, movement_type: 'INSTALL', inventory_id: item.inventory_id,
            instance_id: inst.id, quantity: -1, station_id, station_area_id: station_area_id || null,
            removed_serial: removedAttached ? null : (removed_serial || null),
            removed_model: removedAttached ? null : (removed_model || null),
            note, performed_by,
          });
          removedAttached = true;
        }

        const bulk = qty - serials.length;
        if (bulk > 0) {
          const movement_no = await generateDocNo('TK', MOVEMENT_NO_OPTS);
          await insertMovement(client, {
            movement_no, technician_id, movement_type: 'INSTALL', inventory_id: item.inventory_id,
            quantity: -bulk, station_id, station_area_id: station_area_id || null,
            removed_serial: removedAttached ? null : (removed_serial || null),
            removed_model: removedAttached ? null : (removed_model || null),
            note, performed_by,
          });
          removedAttached = true;
        }
      }
    });

    res.status(201).json({ message: 'บันทึกการติดตั้ง/เปลี่ยนอะไหล่เรียบร้อย' });
  } catch (err) {
    console.error('Technician installStock error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
};

// ── RETURN: technician kit -> back to warehouse ───────────────────────────
exports.returnStock = async (req, res) => {
  const { technician_id, items, note } = req.body;
  const performed_by = req.user.full_name;
  if (!technician_id) return res.status(400).json({ error: 'กรุณาเลือกช่าง' });
  if (!items || items.length === 0) return res.status(400).json({ error: 'กรุณาเลือกอุปกรณ์ที่คืน' });

  try {
    await withTransaction(async (client) => {
      await getActiveTechnician(client, technician_id);

      for (const item of items) {
        const qty = Number(item.quantity) || 0;
        if (qty <= 0) { const e = new Error('จำนวนต้องมากกว่า 0'); e.status = 400; throw e; }

        const onHand = await getOnHand(client, technician_id, item.inventory_id);
        if (onHand < qty) {
          const { rows: nm } = await client.query('SELECT name FROM inventory WHERE id = $1', [item.inventory_id]);
          const e = new Error(`ช่างถืออุปกรณ์ "${nm[0] ? nm[0].name : item.inventory_id}" ไม่พอสำหรับคืน (มี ${onHand})`);
          e.status = 400; throw e;
        }

        const serials = cleanSerials(item.serial_numbers);
        if (serials.length > qty) { const e = new Error('จำนวน S/N มากกว่าจำนวนที่คืน'); e.status = 400; throw e; }

        for (const sn of serials) {
          const { rows: snRows } = await client.query(
            `SELECT id, status FROM inventory_instances WHERE serial_number = $1 AND inventory_id = $2`,
            [sn, item.inventory_id]);
          const inst = snRows[0];
          if (!inst || inst.status !== INSTANCE_STATUS.WITH_TECHNICIAN) {
            const e = new Error(`S/N '${sn}' ไม่ได้อยู่ในมือช่างคนนี้`); e.status = 400; throw e;
          }
          await client.query(
            `UPDATE inventory_instances SET status = $1, current_location = 'Warehouse', station_id = NULL, updated_at = NOW() WHERE id = $2`,
            [INSTANCE_STATUS.IN_STOCK, inst.id]);
          await client.query('UPDATE inventory SET quantity = quantity + 1, updated_at = NOW() WHERE id = $1', [item.inventory_id]);

          const movement_no = await generateDocNo('TK', MOVEMENT_NO_OPTS);
          await insertMovement(client, {
            movement_no, technician_id, movement_type: 'RETURN', inventory_id: item.inventory_id,
            instance_id: inst.id, quantity: -1, note, performed_by,
          });
        }

        const bulk = qty - serials.length;
        if (bulk > 0) {
          await client.query('UPDATE inventory SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2', [bulk, item.inventory_id]);
          const movement_no = await generateDocNo('TK', MOVEMENT_NO_OPTS);
          await insertMovement(client, {
            movement_no, technician_id, movement_type: 'RETURN', inventory_id: item.inventory_id,
            quantity: -bulk, note, performed_by,
          });
        }
      }
    });

    res.status(201).json({ message: 'คืนอะไหล่เข้าคลังเรียบร้อย' });
  } catch (err) {
    console.error('Technician returnStock error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
};

// ── Reversal (admin correction) ───────────────────────────────────────────
// Reverses the inventory.quantity + instance-status effects a single movement
// applied, then deletes the row. Mirrors deleteWithdrawal's restore logic.
exports.deleteMovement = async (req, res) => {
  const { id } = req.params;
  try {
    await withTransaction(async (client) => {
      const { rows } = await client.query('SELECT * FROM technician_stock_movements WHERE id = $1', [id]);
      const m = rows[0];
      if (!m) { const e = new Error('ไม่พบรายการที่ต้องการลบ'); e.status = 404; throw e; }
      const absQty = Math.abs(Number(m.quantity) || 0);

      if (m.movement_type === 'LOAD') {
        // LOAD had: inventory -= qty, instance -> With Technician
        await client.query('UPDATE inventory SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2', [absQty, m.inventory_id]);
        if (m.instance_id) {
          await client.query(
            `UPDATE inventory_instances SET status = $1, current_location = 'Warehouse', station_id = NULL, updated_at = NOW() WHERE id = $2`,
            [INSTANCE_STATUS.IN_STOCK, m.instance_id]);
        }
      } else if (m.movement_type === 'INSTALL') {
        // INSTALL had: instance -> Withdrawn@station, inventory unchanged. Return to kit.
        if (m.instance_id) {
          await client.query(
            `UPDATE inventory_instances SET status = $1, current_location = 'คืนจากการยกเลิกติดตั้ง', station_id = NULL, updated_at = NOW() WHERE id = $2`,
            [INSTANCE_STATUS.WITH_TECHNICIAN, m.instance_id]);
        }
      } else if (m.movement_type === 'RETURN') {
        // RETURN had: inventory += qty, instance -> In Stock. Put back with tech.
        await client.query('UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2', [absQty, m.inventory_id]);
        if (m.instance_id) {
          await client.query(
            `UPDATE inventory_instances SET status = $1, current_location = 'คืนจากการยกเลิกคืนคลัง', station_id = NULL, updated_at = NOW() WHERE id = $2`,
            [INSTANCE_STATUS.WITH_TECHNICIAN, m.instance_id]);
        }
      }

      await client.query('DELETE FROM technician_stock_movements WHERE id = $1', [id]);
      logAudit('technician_stock_movement', id, 'reverse', m, null, req.user.full_name).catch(e => console.error(e));
    });
    res.json({ message: 'ยกเลิกรายการและปรับสต็อกเรียบร้อย' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};
