const { query, withTransaction } = require('../database/db');
const { sendLineNotify } = require('../utils/lineNotify');
const { checkAndGenerateAutoPOs } = require('../utils/autoPo');

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
  const { name, model, description, quantity, min_stock, requires_sn, storage_location } = req.body;

  try {
    const params = [name, model, description, quantity, min_stock, requires_sn === undefined ? 1 : parseInt(requires_sn), storage_location || null];
    let sql = 'UPDATE inventory SET name = $1, model = $2, description = $3, quantity = $4, min_stock = $5, requires_sn = $6, storage_location = $7, updated_at = NOW()';

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
        // Upsert by name (case-insensitive, trimmed)
        const { rows: existingRows } = await client.query('SELECT id FROM inventory WHERE LOWER(TRIM(name)) = LOWER($1)', [row.name]);
        const existing = existingRows[0];

        if (existing) {
          await client.query(
            `UPDATE inventory SET model = $1, description = $2, quantity = $3, min_stock = $4, requires_sn = $5, storage_location = $6, updated_at = NOW() WHERE id = $7`,
            [row.model, row.description, row.quantity, row.min_stock, row.requires_sn, row.storage_location, existing.id]
          );
          summary.updated += 1;
          await client.query(
            `INSERT INTO inventory_transactions (inventory_id, transaction_type, quantity_added, note) VALUES ($1, 'ADD_STOCK', $2, 'นำเข้าข้อมูลผ่าน Excel (อัปเดต)')`,
            [existing.id, row.quantity]
          );
        } else {
          const { rows: inserted } = await client.query(
            `INSERT INTO inventory (name, model, description, quantity, min_stock, requires_sn, storage_location) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [row.name, row.model, row.description, row.quantity, row.min_stock, row.requires_sn, row.storage_location]
          );
          summary.created += 1;
          await client.query(
            `INSERT INTO inventory_transactions (inventory_id, transaction_type, quantity_added, note) VALUES ($1, 'ADD_STOCK', $2, 'นำเข้าข้อมูลผ่าน Excel')`,
            [inserted[0].id, row.quantity]
          );
        }
      }
    });

    const lineMsg = `\n📥 *นำเข้าอุปกรณ์แบบกลุ่ม (Excel)*\n➕ เพิ่มใหม่: ${summary.created} รายการ\n🔄 อัปเดตข้อมูล: ${summary.updated} รายการ\n📊 รวมทั้งหมด: ${summary.total} รายการ`;
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

// GET /api/inventory/instances/:instanceId/timeline
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
        (SELECT COUNT(*) FROM repairs r WHERE r.instance_id = ii.id) as repair_count
      FROM inventory_instances ii
      JOIN inventory i ON ii.inventory_id = i.id
      LEFT JOIN stations st ON ii.station_id = st.id
      LEFT JOIN contracts c ON ii.contract_id = c.id
      WHERE ii.status = 'Withdrawn' AND ii.station_id IS NOT NULL
      ORDER BY ii.created_at DESC
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
