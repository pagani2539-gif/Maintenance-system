const { query, withTransaction } = require('../database/db');
const { sendLineNotify } = require('../utils/lineNotify');
const { checkAndGenerateAutoPOs } = require('../utils/autoPo');
const { logAudit } = require('../utils/auditLogger');
const { badRequest, requirePositiveInteger } = require('../utils/stockValidation');

const ADJUSTMENT_OPERATIONS = new Set(['ADD', 'REMOVE']);
const ADJUSTMENT_STATUSES = new Set(['PENDING', 'APPROVED', 'REJECTED']);

const actorName = (req) => req.user?.full_name || 'Public API';

const adjustmentError = (message, status = 400) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

exports.getAllItems = async (req, res) => {
  try {
    const { search } = req.query;
    let sql = 'SELECT * FROM inventory WHERE 1=1';
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (name ILIKE $${params.length} OR model ILIKE $${params.length} OR description ILIKE $${params.length} OR storage_location ILIKE $${params.length})`;
    }

    sql += ' ORDER BY created_at DESC, id DESC';

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createItem = async (req, res) => {
  const { name, model, description, quantity, min_stock, serial_numbers, requires_sn, storage_location } = req.body;
  const image_path = req.file ? req.file.filename : null;
  const parsedSns = serial_numbers ? JSON.parse(serial_numbers) : [];
  const qty = parseInt(quantity) || 0;
  const reqSn = requires_sn === undefined ? 1 : parseInt(requires_sn);

  try {
    const newItem = await withTransaction(async (client) => {
      const { rows } = await client.query(`
        INSERT INTO inventory (name, model, description, quantity, min_stock, image_path, requires_sn, storage_location)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [name, model, description, qty, min_stock || 10, image_path, reqSn, storage_location || null]);

      const newId = rows[0].id;

      if (parsedSns.length > 0) {
        const valuesSql = parsedSns.map((_, i) => `($1, $${i + 2}, 'New', 'In Stock')`).join(', ');
        await client.query(`
          INSERT INTO inventory_instances (inventory_id, serial_number, condition, status)
          VALUES ${valuesSql}
        `, [newId, ...parsedSns]);

        await client.query(`
          INSERT INTO inventory_transactions (inventory_id, transaction_type, quantity_added, note)
          VALUES ($1, 'ADD_STOCK', $2, 'เพิ่มอุปกรณ์ใหม่เข้าระบบพร้อม S/N')
        `, [newId, qty]);
      } else {
        await client.query(`
          INSERT INTO inventory_transactions (inventory_id, transaction_type, quantity_added, note)
          VALUES ($1, 'ADD_STOCK', $2, 'เพิ่มอุปกรณ์ใหม่เข้าระบบ')
        `, [newId, qty]);
      }

      return rows[0];
    });

    if (qty > 0) {
      const lineMsg = `\n📥 *นำเข้าอุปกรณ์ใหม่*\n📦 ชื่ออุปกรณ์: ${name}\n🏷️ รุ่น/Model: ${model || '-'}\n🔢 จำนวน: ${qty} ชิ้น\n📍 สถานที่จัดเก็บ: ${storage_location || 'ไม่ระบุ'}\n💬 หมายเหตุ: ${parsedSns.length > 0 ? 'เพิ่มอุปกรณ์ใหม่เข้าระบบพร้อม S/N' : 'เพิ่มอุปกรณ์ใหม่เข้าระบบ'}`;
      sendLineNotify('stock', lineMsg);
    }

    res.status(201).json({
      ...newItem,
      message: parsedSns.length > 0 ? 'เพิ่มอุปกรณ์เรียบร้อยพร้อมหมายเลข Serial Number' : 'เพิ่มอุปกรณ์เรียบร้อย'
    });
  } catch (err) {
    // InventoryList.tsx's handleSaveItem reads `.response.data.message` for both create and update
    res.status(500).json({ message: err.message });
  }
};

exports.updateItem = async (req, res) => {
  const { id } = req.params;
  const { name, model, description, min_stock, requires_sn, storage_location } = req.body;

  try {
    // Quantity is intentionally excluded here. Stock changes must go through
    // the Admin-only adjustment flow so the ledger always has a reason and actor.
    const params = [name, model, description, min_stock, requires_sn === undefined ? 1 : parseInt(requires_sn), storage_location || null];
    let sql = 'UPDATE inventory SET name = $1, model = $2, description = $3, min_stock = $4, requires_sn = $5, storage_location = $6, updated_at = NOW()';

    if (req.file) {
      params.push(req.file.filename);
      sql += `, image_path = $${params.length}`;
    }

    params.push(id);
    sql += ` WHERE id = $${params.length}`;

    await query(sql, params);

    // Check and auto generate POs for low stock items in background
    checkAndGenerateAutoPOs().catch((autoPoErr) => {
      console.error('Error auto-generating POs after inventory update:', autoPoErr.message);
    });

    res.json({ message: 'อัปเดตข้อมูลอุปกรณ์เรียบร้อย' });
  } catch (err) {
    // InventoryList.tsx's handleSaveItem reads `.response.data.message` for both create and update
    res.status(500).json({ message: err.message });
  }
};

exports.getAdjustmentRequests = async (req, res) => {
  const status = String(req.query.status || '').trim().toUpperCase();
  if (status && !ADJUSTMENT_STATUSES.has(status)) {
    return res.status(400).json({ message: 'สถานะคำขอปรับยอดไม่ถูกต้อง' });
  }

  try {
    const params = [];
    let where = '';
    if (status) {
      params.push(status);
      where = `WHERE a.status = $${params.length}`;
    }
    const { rows } = await query(`
      SELECT a.*, i.name AS inventory_name, i.model AS inventory_model,
             i.quantity AS current_quantity
      FROM inventory_adjustments a
      JOIN inventory i ON i.id = a.inventory_id
      ${where}
      ORDER BY CASE WHEN a.status = 'PENDING' THEN 0 ELSE 1 END,
               a.requested_at DESC, a.id DESC
    `, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createAdjustmentRequest = async (req, res) => {
  const inventoryId = Number(req.params.id);
  const operation = String(req.body?.operation || '').trim().toUpperCase();
  const reason = String(req.body?.reason || '').trim();
  const note = String(req.body?.note || '').trim() || null;
  let quantity;

  try {
    if (!Number.isSafeInteger(inventoryId) || inventoryId <= 0) throw badRequest('รหัสอุปกรณ์ไม่ถูกต้อง');
    if (!ADJUSTMENT_OPERATIONS.has(operation)) throw badRequest('ประเภทการปรับยอดไม่ถูกต้อง');
    quantity = requirePositiveInteger(req.body?.quantity, 'จำนวนที่ปรับ');
    if (!reason) throw badRequest('กรุณาระบุเหตุผลการปรับยอด');
    if (reason.length > 120) throw badRequest('เหตุผลการปรับยอดยาวเกิน 120 ตัวอักษร');
    if (note && note.length > 1000) throw badRequest('รายละเอียดเพิ่มเติมยาวเกิน 1,000 ตัวอักษร');

    const requestedBy = actorName(req);
    const result = await withTransaction(async (client) => {
      const { rows: itemRows } = await client.query(
        'SELECT id, name, quantity FROM inventory WHERE id = $1 FOR UPDATE',
        [inventoryId]
      );
      const item = itemRows[0];
      if (!item) throw adjustmentError('ไม่พบข้อมูลอุปกรณ์', 404);

      const oldQuantity = Number(item.quantity) || 0;
      const delta = operation === 'ADD' ? quantity : -quantity;
      const newQuantity = oldQuantity + delta;
      if (newQuantity < 0) {
        throw adjustmentError(`ไม่สามารถปรับลดได้ เพราะยอดคงเหลือจะติดลบ (ปัจจุบัน ${oldQuantity} ชิ้น)`);
      }

      await client.query(
        'UPDATE inventory SET quantity = $1, updated_at = NOW() WHERE id = $2',
        [newQuantity, inventoryId]
      );

      const transactionNote = [
        `ปรับ${operation === 'ADD' ? 'เพิ่ม' : 'ลด'}โดย ${requestedBy}`,
        `เหตุผล: ${reason}`,
        note ? `รายละเอียด: ${note}` : null
      ].filter(Boolean).join(' | ');

      await client.query(`
        INSERT INTO inventory_transactions (
          inventory_id, transaction_type, quantity_added, quantity_withdrawn,
          user_name, note, status
        ) VALUES ($1, 'ADJUSTMENT', $2, $3, $4, $5, 'ADJUSTED')
      `, [
        inventoryId,
        operation === 'ADD' ? quantity : 0,
        operation === 'REMOVE' ? quantity : 0,
        requestedBy,
        transactionNote
      ]);

      const { rows } = await client.query(`
        INSERT INTO inventory_adjustments (
          inventory_id, operation, quantity, reason, note,
          status, requested_by_id, requested_by,
          reviewed_by_id, reviewed_by, reviewed_at, old_quantity, new_quantity
        ) VALUES ($1, $2, $3, $4, $5, 'APPROVED', $6, $7, $6, $7, NOW(), $8, $9)
        RETURNING *
      `, [inventoryId, operation, quantity, reason, note, req.user?.id || null, requestedBy, oldQuantity, newQuantity]);

      return { adjustment: rows[0], item, oldQuantity, newQuantity };
    });

    logAudit(
      'inventory_adjustment',
      result.adjustment.id,
      'adjustment applied',
      { quantity: result.oldQuantity },
      {
        inventory_id: inventoryId,
        operation,
        quantity,
        reason,
        note,
        status: 'APPROVED',
        new_quantity: result.newQuantity,
        adjusted_by: requestedBy
      },
      requestedBy
    ).catch((err) => console.error('Failed to write adjustment audit:', err.message));

    checkAndGenerateAutoPOs().catch((err) => console.error('Error auto-generating POs after adjustment:', err.message));

    res.status(201).json({
      ...result.adjustment,
      inventory_name: result.item.name,
      current_quantity: result.newQuantity,
      message: 'ปรับยอดคงเหลือเรียบร้อยแล้ว และบันทึกเหตุผลลงบัญชีคุมยอดอุปกรณ์แล้ว'
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

exports.approveAdjustment = async (req, res) => {
  const adjustmentId = Number(req.params.adjustmentId);
  const reviewNote = String(req.body?.review_note || '').trim() || null;
  const reviewer = actorName(req);

  try {
    if (!Number.isSafeInteger(adjustmentId) || adjustmentId <= 0) throw badRequest('รหัสคำขอปรับยอดไม่ถูกต้อง');

    const result = await withTransaction(async (client) => {
      const { rows: requestRows } = await client.query(
        'SELECT * FROM inventory_adjustments WHERE id = $1 FOR UPDATE',
        [adjustmentId]
      );
      const adjustment = requestRows[0];
      if (!adjustment) throw adjustmentError('ไม่พบคำขอปรับยอด', 404);
      if (adjustment.status !== 'PENDING') throw adjustmentError('คำขอนี้ถูกดำเนินการไปแล้ว');

      const { rows: inventoryRows } = await client.query(
        'SELECT id, name, quantity FROM inventory WHERE id = $1 FOR UPDATE',
        [adjustment.inventory_id]
      );
      const item = inventoryRows[0];
      if (!item) throw adjustmentError('ไม่พบอุปกรณ์ของคำขอปรับยอด', 404);

      const oldQuantity = Number(item.quantity) || 0;
      const delta = adjustment.operation === 'ADD' ? adjustment.quantity : -adjustment.quantity;
      const newQuantity = oldQuantity + delta;
      if (newQuantity < 0) throw adjustmentError(`ไม่สามารถอนุมัติได้ เพราะยอดคงเหลือจะติดลบ (ปัจจุบัน ${oldQuantity} ชิ้น)`);

      await client.query(
        'UPDATE inventory SET quantity = $1, updated_at = NOW() WHERE id = $2',
        [newQuantity, item.id]
      );

      const quantityAdded = adjustment.operation === 'ADD' ? adjustment.quantity : 0;
      const quantityWithdrawn = adjustment.operation === 'REMOVE' ? adjustment.quantity : 0;
      const transactionNote = [
        `ปรับ${adjustment.operation === 'ADD' ? 'เพิ่ม' : 'ลด'}ตามคำขอ #${adjustment.id}`,
        `เหตุผล: ${adjustment.reason}`,
        adjustment.note ? `รายละเอียด: ${adjustment.note}` : null,
        `ผู้ขอ: ${adjustment.requested_by}`,
        `ผู้อนุมัติ: ${reviewer}`
      ].filter(Boolean).join(' | ');

      await client.query(`
        INSERT INTO inventory_transactions (
          inventory_id, transaction_type, quantity_added, quantity_withdrawn,
          user_name, note, status
        ) VALUES ($1, 'ADJUSTMENT', $2, $3, $4, $5, 'ADJUSTED')
      `, [item.id, quantityAdded, quantityWithdrawn, reviewer, transactionNote]);

      const { rows: updatedRows } = await client.query(`
        UPDATE inventory_adjustments
        SET status = 'APPROVED', reviewed_by_id = $1, reviewed_by = $2,
            reviewed_at = NOW(), review_note = $3,
            old_quantity = $4, new_quantity = $5
        WHERE id = $6
        RETURNING *
      `, [req.user?.id || null, reviewer, reviewNote, oldQuantity, newQuantity, adjustment.id]);

      return { adjustment: updatedRows[0], item, oldQuantity, newQuantity };
    });

    logAudit(
      'inventory_adjustment',
      adjustmentId,
      'adjustment approved',
      { status: 'PENDING' },
      { status: 'APPROVED', old_quantity: result.oldQuantity, new_quantity: result.newQuantity, reviewed_by: reviewer, review_note: reviewNote },
      reviewer
    ).catch((err) => console.error('Failed to write adjustment approval audit:', err.message));
    checkAndGenerateAutoPOs().catch((err) => console.error('Error auto-generating POs after adjustment:', err.message));

    res.json({ ...result.adjustment, message: 'อนุมัติและปรับยอดคงเหลือเรียบร้อยแล้ว' });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

exports.rejectAdjustment = async (req, res) => {
  const adjustmentId = Number(req.params.adjustmentId);
  const reviewNote = String(req.body?.review_note || '').trim();
  const reviewer = actorName(req);

  try {
    if (!Number.isSafeInteger(adjustmentId) || adjustmentId <= 0) throw badRequest('รหัสคำขอปรับยอดไม่ถูกต้อง');
    if (!reviewNote) throw badRequest('กรุณาระบุเหตุผลที่ไม่อนุมัติ');
    if (reviewNote.length > 1000) throw badRequest('เหตุผลที่ไม่อนุมัติยาวเกิน 1,000 ตัวอักษร');

    const { rows } = await query(`
      UPDATE inventory_adjustments
      SET status = 'REJECTED', reviewed_by_id = $1, reviewed_by = $2,
          reviewed_at = NOW(), review_note = $3
      WHERE id = $4 AND status = 'PENDING'
      RETURNING *
    `, [req.user?.id || null, reviewer, reviewNote, adjustmentId]);
    if (!rows[0]) throw adjustmentError('ไม่พบคำขอที่รออนุมัติ หรือคำขอนี้ถูกดำเนินการไปแล้ว', 404);

    logAudit(
      'inventory_adjustment',
      adjustmentId,
      'adjustment rejected',
      { status: 'PENDING' },
      { status: 'REJECTED', reviewed_by: reviewer, review_note: reviewNote },
      reviewer
    ).catch((err) => console.error('Failed to write adjustment rejection audit:', err.message));

    res.json({ ...rows[0], message: 'ไม่อนุมัติคำขอปรับยอดแล้ว' });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

exports.deleteItem = async (req, res) => {
  const { id } = req.params;
  try {
    await query('DELETE FROM inventory WHERE id = $1', [id]);
    res.json({ message: 'ลบอุปกรณ์เรียบร้อย' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.bulkImport = async (req, res) => {
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'ไม่พบข้อมูลสำหรับนำเข้า' });
  }

  // Normalize and validate rows first
  const cleaned = [];
  for (let i = 0; i < items.length; i++) {
    const raw = items[i] || {};
    const name = String(raw.name || '').trim();
    if (!name) {
      return res.status(400).json({ message: `แถวที่ ${i + 1}: ไม่มีชื่ออุปกรณ์` });
    }
    cleaned.push({
      name,
      model: String(raw.model || '').trim() || null,
      description: String(raw.description || '').trim() || null,
      storage_location: String(raw.storage_location || '').trim() || null,
      quantity: Math.max(0, parseInt(raw.quantity, 10) || 0),
      min_stock: Math.max(0, parseInt(raw.min_stock, 10) || 10),
      requires_sn: raw.requires_sn === undefined || raw.requires_sn === null ? 1 : (parseInt(raw.requires_sn, 10) ? 1 : 0),
    });
  }

  const summary = { created: 0, updated: 0, total: cleaned.length };

  try {
    await withTransaction(async (client) => {
      for (const row of cleaned) {
        // A model is part of an item's identity: products with the same name
        // but different models must remain separate inventory records.
        const { rows: existingRows } = await client.query(
          `SELECT id, quantity FROM inventory
           WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
             AND LOWER(TRIM(COALESCE(model, ''))) = LOWER(TRIM(COALESCE($2, '')))
           ORDER BY id
           LIMIT 1`,
          [row.name, row.model]
        );
        const existing = existingRows[0];

        if (existing) {
          const oldQuantity = Number(existing.quantity) || 0;
          const quantityDelta = row.quantity - oldQuantity;
          await client.query(
            `UPDATE inventory SET model = $1, description = $2, quantity = $3, min_stock = $4, requires_sn = $5, storage_location = $6, updated_at = NOW() WHERE id = $7`,
            [row.model, row.description, row.quantity, row.min_stock, row.requires_sn, row.storage_location, existing.id]
          );
          summary.updated += 1;
          if (quantityDelta !== 0) {
            await client.query(
              `INSERT INTO inventory_transactions (
                inventory_id, transaction_type, quantity_added, quantity_withdrawn, note
              ) VALUES ($1, 'ADJUSTMENT', $2, $3, $4)`,
              [
                existing.id,
                quantityDelta > 0 ? quantityDelta : 0,
                quantityDelta < 0 ? Math.abs(quantityDelta) : 0,
                `นำเข้าข้อมูลผ่าน CSV (ปรับยอดจาก ${oldQuantity} เป็น ${row.quantity})`,
              ]
            );
          }
        } else {
          const { rows: inserted } = await client.query(
            `INSERT INTO inventory (name, model, description, quantity, min_stock, requires_sn, storage_location) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [row.name, row.model, row.description, row.quantity, row.min_stock, row.requires_sn, row.storage_location]
          );
          summary.created += 1;
          await client.query(
            `INSERT INTO inventory_transactions (inventory_id, transaction_type, quantity_added, note) VALUES ($1, 'ADD_STOCK', $2, 'นำเข้าข้อมูลผ่าน CSV')`,
            [inserted[0].id, row.quantity]
          );
        }
      }
    });

    const lineMsg = `\n📥 *นำเข้าอุปกรณ์แบบกลุ่ม (CSV)*\n➕ เพิ่มใหม่: ${summary.created} รายการ\n🔄 อัปเดตข้อมูล: ${summary.updated} รายการ\n📊 รวมทั้งหมด: ${summary.total} รายการ`;
    sendLineNotify('stock', lineMsg);

    checkAndGenerateAutoPOs().catch((autoPoErr) => {
      console.error('Error auto-generating POs after import:', autoPoErr.message);
    });

    res.json({
      message: `นำเข้าสำเร็จ: เพิ่มใหม่ ${summary.created} รายการ, อัปเดต ${summary.updated} รายการ`,
      ...summary,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getStats = async (req, res) => {
  try {
    // Thresholds mirror client/src/utils/stockStatus.ts getStockStatus() exactly —
    // update both places together if these ever change.
    const { rows } = await query(`
      SELECT
        COUNT(*) as total_items,
        SUM(CASE WHEN quantity = 0 THEN 1 ELSE 0 END) as out_of_stock,
        SUM(CASE WHEN quantity > 0 AND quantity <= GREATEST(min_stock, 1) THEN 1 ELSE 0 END) as critical,
        SUM(CASE WHEN quantity > GREATEST(min_stock, 1) AND quantity <= GREATEST(min_stock, 1) * 2 THEN 1 ELSE 0 END) as warning,
        SUM(CASE WHEN quantity > GREATEST(min_stock, 1) * 2 THEN 1 ELSE 0 END) as optimal
      FROM inventory
    `);
    const row = rows[0];
    const num = (v) => Number(v) || 0;
    res.json(row ? { total_items: num(row.total_items), out_of_stock: num(row.out_of_stock), critical: num(row.critical), warning: num(row.warning), optimal: num(row.optimal) } : { total_items: 0, out_of_stock: 0, critical: 0, warning: 0, optimal: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getInstancesInStock = async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await query(
      "SELECT id, serial_number, condition FROM inventory_instances WHERE inventory_id = $1 AND status = 'In Stock'",
      [id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const VALID_CONDITIONS = ['New', 'Good', 'Fair', 'Broken'];

exports.updateInstanceCondition = async (req, res) => {
  const { instanceId } = req.params;
  const { condition } = req.body;

  if (!condition || !VALID_CONDITIONS.includes(condition)) {
    return res.status(400).json({ message: `สภาพไม่ถูกต้อง (ต้องเป็น ${VALID_CONDITIONS.join(', ')})` });
  }

  try {
    const result = await query(
      "UPDATE inventory_instances SET condition = $1 WHERE id = $2",
      [condition, instanceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'ไม่พบชิ้นงาน (instance) นี้' });
    res.json({ message: 'อัปเดตสภาพชิ้นงานเรียบร้อยแล้ว', condition });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.addInventorySerialNumbers = async (req, res) => {
  const { id } = req.params;
  const { serial_numbers } = req.body; // Array of S/Ns

  if (!serial_numbers || !Array.isArray(serial_numbers) || serial_numbers.length === 0) {
    return res.status(400).json({ message: 'กรุณาระบุ Serial Numbers' });
  }

  try {
    await withTransaction(async (client) => {
      // Check if adding these S/Ns exceeds the current quantity
      const { rows: invRows } = await client.query('SELECT quantity, name FROM inventory WHERE id = $1', [id]);
      const inv = invRows[0];
      if (!inv) {
        const err = new Error('ไม่พบข้อมูลอุปกรณ์');
        err.status = 404;
        throw err;
      }

      const { rows: countRows } = await client.query(
        "SELECT COUNT(*) as count FROM inventory_instances WHERE inventory_id = $1 AND status = 'In Stock'",
        [id]
      );
      const registeredCount = Number(countRows[0].count) || 0;
      if (registeredCount + serial_numbers.length > inv.quantity) {
        const err = new Error(`ไม่สามารถเพิ่ม S/N ได้ เนื่องจากจะเกินจำนวนของในคลัง (มี ${inv.quantity} ชิ้น, ลงทะเบียนแล้ว ${registeredCount} ชิ้น, กำลังเพิ่มอีก ${serial_numbers.length} ชิ้น)`);
        err.status = 400;
        throw err;
      }

      const valuesSql = serial_numbers.map((_, i) => `($1, $${i + 2}, 'New', 'In Stock')`).join(', ');
      await client.query(`
        INSERT INTO inventory_instances (inventory_id, serial_number, condition, status)
        VALUES ${valuesSql}
      `, [id, ...serial_numbers]);

      await client.query(`
        INSERT INTO inventory_transactions (inventory_id, transaction_type, quantity_added, note)
        VALUES ($1, 'ADD_STOCK', 0, 'ลงทะเบียน Serial Numbers ย้อนหลัง')
      `, [id]);
    });

    res.json({ message: 'ลงทะเบียน Serial Numbers เรียบร้อยแล้ว' });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    res.status(500).json({ error: err.message });
  }
};

// GET /api/v2/inventory/instances/:instanceId/timeline
// "Asset passport" — a chronological history of one physical unit (by instance),
// merging stock movements, repair/claim tickets, and device swaps.
exports.getInstanceTimeline = async (req, res) => {
  const { instanceId } = req.params;

  try {
    const instance = await query(`
      SELECT ii.id AS instance_id, ii.serial_number, ii.condition, ii.status,
             ii.current_location, ii.station_id, ii.created_at, ii.updated_at,
             i.id AS inventory_id, i.name AS device_name, i.model,
             st.name AS station_name, st.code AS station_code, st.province AS station_province,
             c.contract_no, c.name AS contract_name, c.year_be AS contract_year,
             (SELECT COUNT(*) FROM repairs r WHERE r.instance_id = ii.id) AS repair_count
      FROM inventory_instances ii
      JOIN inventory i ON ii.inventory_id = i.id
      LEFT JOIN stations st ON ii.station_id = st.id
      LEFT JOIN contracts c ON ii.contract_id = c.id
      WHERE ii.id = $1
    `, [instanceId]);

    const head = instance.rows[0];
    if (!head) return res.status(404).json({ message: 'ไม่พบข้อมูลอุปกรณ์ (instance) นี้' });

    // 1. Stock movements tied to this specific unit
    const { rows: txs } = await query(`
      SELECT id, transaction_type, quantity_added, quantity_withdrawn, quantity_borrowed, quantity_returned,
             project_name, user_name, note, created_at, withdrawal_type, withdrawal_id,
             COALESCE(station_name, location) AS location, station_name, station_code
      FROM transactions_view
      WHERE instance_id = $1
      ORDER BY created_at ASC
    `, [instanceId]);

    // 2. Repair / claim tickets opened against this unit
    const { rows: repairs } = await query(`
      SELECT id, ticket_no, type, status, priority, problem, technician, repair_note,
             COALESCE(station_name, location) AS location, station_name, created_at, updated_at
      FROM repairs_view
      WHERE instance_id = $1
      ORDER BY created_at ASC
    `, [instanceId]);

    // 3. Device swaps referencing this unit's serial (in or out)
    const { rows: swaps } = head.serial_number ? await query(`
      SELECT dc.id, dc.old_serial, dc.old_model, dc.new_serial, dc.new_model, dc.changed_by, dc.changed_at,
             r.ticket_no
      FROM device_changes dc
      LEFT JOIN repairs r ON dc.repair_id = r.id
      WHERE dc.old_serial = $1 OR dc.new_serial = $1
      ORDER BY dc.changed_at ASC
    `, [head.serial_number]) : { rows: [] };

    const events = [];

    for (const t of txs) {
      const type = t.transaction_type;
      const qty = t.quantity_withdrawn || t.quantity_borrowed || t.quantity_added || t.quantity_returned || 1;
      let title, kind;
      if (type === 'ADD_STOCK') { title = 'นำเข้าคลัง'; kind = 'stock_in'; }
      else if (type === 'RETURN') { title = 'รับคืนเข้าคลัง'; kind = 'return'; }
      else if (type === 'BORROW') { title = 'เบิกยืมใช้งาน'; kind = 'withdraw'; }
      else { title = t.withdrawal_type ? `เบิก (${t.withdrawal_type})` : 'เบิกออกจากคลัง'; kind = 'withdraw'; }
      events.push({
        kind,
        timestamp: t.created_at,
        title,
        location: t.location || null,
        actor: t.user_name || null,
        project: t.project_name || null,
        note: t.note || null,
        quantity: qty,
        ref_type: 'transaction',
        ref_id: t.withdrawal_id || t.id
      });
    }

    for (const r of repairs) {
      events.push({
        kind: r.type === 'claim' ? 'claim' : 'repair',
        timestamp: r.created_at,
        title: `${r.type === 'claim' ? 'เปิดงานเคลม' : 'เปิดงานซ่อม'} ${r.ticket_no || ''}`.trim(),
        location: r.location || null,
        actor: r.technician || null,
        status: r.status || null,
        priority: r.priority || null,
        note: r.problem || null,
        ref_type: r.type === 'claim' ? 'claim' : 'repair',
        ref_id: r.id
      });
    }

    for (const s of swaps) {
      const swappedOut = s.old_serial === head.serial_number;
      events.push({
        kind: 'device_swap',
        timestamp: s.changed_at,
        title: swappedOut ? 'อุปกรณ์ถูกถอดเปลี่ยน (สลับออก)' : 'อุปกรณ์ถูกนำมาแทน (สลับเข้า)',
        actor: s.changed_by || null,
        note: swappedOut
          ? `แทนที่ด้วย S/N ${s.new_serial || '-'}${s.new_model ? ` (${s.new_model})` : ''}`
          : `แทนที่ S/N เดิม ${s.old_serial || '-'}${s.old_model ? ` (${s.old_model})` : ''}`,
        ref_type: 'repair',
        ref_id: null,
        ticket_no: s.ticket_no || null
      });
    }

    // Newest first for display
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json({
      instance: {
        ...head,
        repair_count: Number(head.repair_count) || 0
      },
      events
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getLifecycleReport = async (req, res) => {
  try {
    const { rows } = await query(`
      WITH serial_assets AS (
        SELECT
        ii.id as instance_id,
        ii.serial_number,
        ii.status,
        ii.current_location,
        ii.station_id,
        ii.created_at as installed_at,
        i.id as inventory_id,
        i.name as device_name,
        i.model,
        st.name as station_name,
        st.code as station_code,
        ii.contract_id,
        c.contract_no,
        c.name as contract_name,
        c.year_be as contract_year,
        (SELECT COUNT(*) FROM repairs r WHERE r.instance_id = ii.id) as repair_count,
        'serial'::TEXT AS asset_kind,
        1::INTEGER AS quantity,
        0::INTEGER AS untracked_quantity,
        i.requires_sn
        FROM inventory_instances ii
        JOIN inventory i ON ii.inventory_id = i.id
        LEFT JOIN stations st ON ii.station_id = st.id
        LEFT JOIN contracts c ON ii.contract_id = c.id
        WHERE ii.status = 'Withdrawn' AND ii.station_id IS NOT NULL
      ), station_items AS (
        SELECT
          NULL::BIGINT AS instance_id,
          NULL::TEXT AS serial_number,
          CASE WHEN i.requires_sn = 1 THEN 'Awaiting S/N' ELSE 'No S/N' END AS status,
          st.name AS current_location,
          si.station_id,
          COALESCE(latest_lot.withdrawal_date::timestamptz, si.updated_at) AS installed_at,
          i.id AS inventory_id,
          i.name AS device_name,
          i.model,
          st.name AS station_name,
          st.code AS station_code,
          latest_lot.contract_id,
          latest_lot.contract_no_snapshot AS contract_no,
          latest_lot.contract_name_snapshot AS contract_name,
          latest_lot.contract_year_snapshot AS contract_year,
          (SELECT COUNT(*) FROM repairs r WHERE r.station_id = si.station_id AND r.inventory_id = i.id) AS repair_count,
          'station_stock'::TEXT AS asset_kind,
          si.quantity,
          GREATEST(si.quantity - COUNT(ii.id)::INTEGER, 0) AS untracked_quantity,
          i.requires_sn
        FROM station_inventory si
        JOIN inventory i ON i.id = si.inventory_id
        JOIN stations st ON st.id = si.station_id
        LEFT JOIN LATERAL (
          SELECT l.withdrawal_date, l.contract_id, l.contract_no_snapshot,
                 l.contract_name_snapshot, l.contract_year_snapshot
          FROM station_inventory_lots l
          WHERE l.station_id = si.station_id
            AND l.inventory_id = si.inventory_id
            AND l.quantity_remaining > 0
          ORDER BY l.withdrawal_date DESC NULLS LAST, l.id DESC
          LIMIT 1
        ) latest_lot ON TRUE
        LEFT JOIN inventory_instances ii
          ON ii.inventory_id = si.inventory_id
          AND ii.station_id = si.station_id
          AND ii.status = 'Withdrawn'
        GROUP BY si.station_id, si.inventory_id, si.quantity, si.updated_at,
                 i.id, i.name, i.model, i.requires_sn, st.name, st.code,
                 latest_lot.withdrawal_date, latest_lot.contract_id,
                 latest_lot.contract_no_snapshot, latest_lot.contract_name_snapshot,
                 latest_lot.contract_year_snapshot
        HAVING GREATEST(si.quantity - COUNT(ii.id)::INTEGER, 0) > 0
      )
      SELECT * FROM serial_assets
      UNION ALL
      SELECT * FROM station_items
      ORDER BY installed_at DESC
    `);

    const reports = rows.map(row => {
      const installedDate = new Date(row.installed_at);
      const now = new Date();
      const age_months = Math.max(0, (now.getFullYear() - installedDate.getFullYear()) * 12 + now.getMonth() - installedDate.getMonth());
      const repair_count = Number(row.repair_count) || 0;

      return {
        ...row,
        repair_count,
        age_months
      };
    });

    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
