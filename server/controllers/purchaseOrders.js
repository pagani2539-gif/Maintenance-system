const { query, withTransaction } = require('../database/db');
const { checkAndGenerateAutoPOs } = require('../utils/autoPo');
const { generateDocNo } = require('../utils/docNumber');
const { sendLineNotify } = require('../utils/lineNotify');

exports.getAllPOs = async (req, res) => {
  try {
    const { status, search } = req.query;
    let sql = `
      SELECT po.*,
        (SELECT COUNT(*) FROM purchase_order_items WHERE po_id = po.id) as item_count
      FROM purchase_orders po
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      params.push(status);
      sql += ` AND po.status = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (po.po_no ILIKE $${params.length} OR po.note ILIKE $${params.length} OR po.company_name ILIKE $${params.length})`;
    }

    sql += ' ORDER BY po.created_at DESC, po.id DESC';

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getPOById = async (req, res) => {
  const { id } = req.params;
  try {
    const { rows: poRows } = await query(`
      SELECT po.*
      FROM purchase_orders po
      WHERE po.id = $1
    `, [id]);
    const po = poRows[0];
    if (!po) return res.status(404).json({ message: 'ไม่พบข้อมูลใบสั่งซื้อ' });

    const { rows: items } = await query(`
      SELECT poi.*, i.name as item_name, i.model as item_model, i.quantity as current_stock, i.min_stock
      FROM purchase_order_items poi
      JOIN inventory i ON poi.inventory_id = i.id
      WHERE poi.po_id = $1
    `, [id]);

    res.json({ ...po, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createPO = async (req, res) => {
  const {
    po_no, note, items, ordered_by, project_name, company_name, status, created_by,
    vendor_address, vendor_phone, vendor_contact_person, vendor_tax_id,
    buyer_department, buyer_phone, buyer_email
  } = req.body; // items is array of { inventory_id, quantity }

  if (!items || items.length === 0) {
    return res.status(400).json({ message: 'กรุณาเลือกรายการอุปกรณ์อย่างน้อย 1 รายการ' });
  }

  // Validate status — รองรับเฉพาะค่าใน enum (Draft / Pending / Approved / Ordered / Cancelled). Default = Draft (backward compat)
  const validStatuses = ['Draft', 'Pending', 'Approved', 'Ordered', 'Cancelled'];
  const poStatus = validStatuses.includes(status) ? status : 'Draft';
  const creator = (created_by && String(created_by).trim()) || 'User';

  let poNo;
  try {
    poNo = po_no || await generateDocNo('PO', { table: 'purchase_orders', column: 'po_no' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  try {
    const poId = await withTransaction(async (client) => {
      const { rows } = await client.query(`
        INSERT INTO purchase_orders (
          po_no, status, created_by, note, ordered_by, project_name, company_name,
          vendor_address, vendor_phone, vendor_contact_person, vendor_tax_id,
          buyer_department, buyer_phone, buyer_email
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id
      `, [
        poNo, poStatus, creator, note || null, ordered_by || null, project_name || null, company_name || null,
        vendor_address || null, vendor_phone || null, vendor_contact_person || null, vendor_tax_id || null,
        buyer_department || null, buyer_phone || null, buyer_email || null
      ]);

      const newPoId = rows[0].id;

      for (const item of items) {
        await client.query(`
          INSERT INTO purchase_order_items (po_id, inventory_id, quantity)
          VALUES ($1, $2, $3)
        `, [newPoId, item.inventory_id, item.quantity]);
      }

      return newPoId;
    });

    res.status(201).json({ id: poId, po_no: poNo, message: 'สร้างใบสั่งซื้อสำเร็จ' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updatePO = async (req, res) => {
  const { id } = req.params;
  const {
    status, note, items, ordered_by, project_name, company_name,
    vendor_address, vendor_phone, vendor_contact_person, vendor_tax_id,
    buyer_department, buyer_phone, buyer_email, approved_by
  } = req.body;

  try {
    const message = await withTransaction(async (client) => {
      const { rows: poRows } = await client.query('SELECT * FROM purchase_orders WHERE id = $1', [id]);
      const po = poRows[0];
      if (!po) {
        const err = new Error('ไม่พบใบสั่งซื้อ');
        err.status = 404;
        throw err;
      }
      if (po.status === 'Received') {
        const err = new Error('ไม่สามารถแก้ไขใบสั่งซื้อที่รับของแล้วได้');
        err.status = 400;
        throw err;
      }

      const params = [
        note !== undefined ? note : po.note,
        ordered_by !== undefined ? ordered_by : po.ordered_by,
        project_name !== undefined ? project_name : po.project_name,
        company_name !== undefined ? company_name : po.company_name,
        vendor_address !== undefined ? vendor_address : po.vendor_address,
        vendor_phone !== undefined ? vendor_phone : po.vendor_phone,
        vendor_contact_person !== undefined ? vendor_contact_person : po.vendor_contact_person,
        vendor_tax_id !== undefined ? vendor_tax_id : po.vendor_tax_id,
        buyer_department !== undefined ? buyer_department : po.buyer_department,
        buyer_phone !== undefined ? buyer_phone : po.buyer_phone,
        buyer_email !== undefined ? buyer_email : po.buyer_email
      ];
      let updateSql = 'UPDATE purchase_orders SET note = $1, ordered_by = $2, project_name = $3, company_name = $4, vendor_address = $5, vendor_phone = $6, vendor_contact_person = $7, vendor_tax_id = $8, buyer_department = $9, buyer_phone = $10, buyer_email = $11, updated_at = NOW()';

      if (status) {
        params.push(status);
        updateSql += `, status = $${params.length}`;
        if (status === 'Approved') {
          params.push(approved_by || req.user?.full_name || 'System');
          updateSql += `, approved_by = $${params.length}, approved_at = NOW()`;
        }
      }

      params.push(id);
      updateSql += ` WHERE id = $${params.length}`;

      await client.query(updateSql, params);

      if (items && Array.isArray(items)) {
        await client.query('DELETE FROM purchase_order_items WHERE po_id = $1', [id]);

        if (items.length === 0) {
          return 'อัปเดตใบสั่งซื้อเรียบร้อย (ไม่มีรายการ)';
        }

        for (const item of items) {
          await client.query(`
            INSERT INTO purchase_order_items (po_id, inventory_id, quantity, received_quantity)
            VALUES ($1, $2, $3, $4)
          `, [id, item.inventory_id, item.quantity, item.received_quantity || 0]);
        }
        return 'อัปเดตใบสั่งซื้อเรียบร้อย';
      }

      return 'อัปเดตข้อมูลใบสั่งซื้อเรียบร้อย';
    });

    res.json({ message });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    res.status(500).json({ error: err.message });
  }
};

exports.deletePO = async (req, res) => {
  const { id } = req.params;

  try {
    const { rows: poRows } = await query('SELECT * FROM purchase_orders WHERE id = $1', [id]);
    const po = poRows[0];
    if (!po) return res.status(404).json({ message: 'ไม่พบข้อมูลใบสั่งซื้อ' });

    await withTransaction(async (client) => {
      if (po.status === 'Received') {
        const { rows: poItems } = await client.query('SELECT * FROM purchase_order_items WHERE po_id = $1', [id]);

        for (const poItem of poItems) {
          const qtyToRevert = poItem.received_quantity || 0;
          if (qtyToRevert <= 0) continue;

          await client.query(
            'UPDATE inventory SET quantity = GREATEST(0, quantity - $1), updated_at = NOW() WHERE id = $2',
            [qtyToRevert, poItem.inventory_id]
          );

          await client.query(
            "DELETE FROM inventory_transactions WHERE inventory_id = $1 AND transaction_type = 'ADD_STOCK' AND quantity_added = $2 AND note ILIKE $3",
            [poItem.inventory_id, qtyToRevert, `%#${po.po_no}%`]
          );
        }
      }

      await client.query('DELETE FROM purchase_order_items WHERE po_id = $1', [id]);
      await client.query('DELETE FROM purchase_orders WHERE id = $1', [id]);
    });

    res.json({ message: 'ลบใบสั่งซื้อและปรับคืนยอดคลังเรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.receivePO = async (req, res) => {
  const { id } = req.params;
  const { items } = req.body;

  try {
    const { po, receivedSummaries } = await withTransaction(async (client) => {
      const { rows: poRows } = await client.query('SELECT * FROM purchase_orders WHERE id = $1', [id]);
      const po = poRows[0];
      if (!po) {
        const err = new Error('ไม่พบข้อมูลใบสั่งซื้อ');
        err.status = 404;
        throw err;
      }
      if (po.status === 'Received') {
        const err = new Error('ใบสั่งซื้อนี้เคยรับสินค้าเข้าระบบไปแล้ว');
        err.status = 400;
        throw err;
      }
      if (po.status !== 'Approved' && po.status !== 'Ordered') {
        const err = new Error('สามารถตรวจรับสินค้าได้เฉพาะใบสั่งซื้อที่ได้รับการอนุมัติหรือสั่งซื้อแล้วเท่านั้น');
        err.status = 400;
        throw err;
      }

      const { rows: poItems } = await client.query(`
        SELECT poi.*, i.name, i.model
        FROM purchase_order_items poi
        JOIN inventory i ON poi.inventory_id = i.id
        WHERE poi.po_id = $1
      `, [id]);

      if (!poItems || poItems.length === 0) {
        const err = new Error('ไม่พบรายการสินค้าในใบสั่งซื้อ');
        err.status = 400;
        throw err;
      }

      const receivedQuantities = {};
      if (items && Array.isArray(items)) {
        items.forEach(item => {
          receivedQuantities[item.inventory_id] = parseInt(item.received_quantity) || 0;
        });
      }

      const receivedSummaries = [];

      for (const poItem of poItems) {
        const receivedQty = receivedQuantities[poItem.inventory_id] !== undefined
          ? receivedQuantities[poItem.inventory_id]
          : poItem.quantity;

        if (receivedQty <= 0) continue;

        receivedSummaries.push(`• ${poItem.name} ${poItem.model ? `(${poItem.model})` : ''} x${receivedQty}`);

        await client.query('UPDATE purchase_order_items SET received_quantity = $1 WHERE id = $2', [receivedQty, poItem.id]);
        await client.query('UPDATE inventory SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2', [receivedQty, poItem.inventory_id]);
        await client.query(`
          INSERT INTO inventory_transactions (inventory_id, transaction_type, quantity_added, note)
          VALUES ($1, 'ADD_STOCK', $2, $3)
        `, [poItem.inventory_id, receivedQty, `รับสินค้าตามใบสั่งซื้อ #${po.po_no}`]);
      }

      await client.query("UPDATE purchase_orders SET status = 'Received', updated_at = NOW() WHERE id = $1", [id]);

      return { po, receivedSummaries };
    });

    // Send LINE Notify Alert
    const itemsList = receivedSummaries.join('\n');
    if (itemsList) {
      const lineMsg = `\n📥 *ตรวจรับสินค้าเข้าคลัง (PO)*\n🔢 เลขที่ใบสั่งซื้อ: #${po.po_no}\n🏢 โครงการ/บริษัท: ${po.project_name || po.company_name || '-'}\n📋 รายการที่ตรวจรับ:\n${itemsList}`;
      sendLineNotify('stock', lineMsg);
    }

    res.json({ message: 'รับสินค้าเข้าระบบและอัปเดตสต็อกเรียบร้อยแล้ว' });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    res.status(500).json({ error: err.message });
  }
};

exports.triggerAutoPO = async (req, res) => {
  try {
    await checkAndGenerateAutoPOs();
    res.json({ message: 'ระบบสแกนสต็อกและอัปเดตใบสั่งซื้ออัตโนมัติเรียบร้อย' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// คืนรายชื่อผู้ขายไม่ซ้ำ พร้อมข้อมูลล่าสุดของแต่ละราย — ใช้สำหรับ autocomplete ในฟอร์มสร้าง PO
exports.getVendors = async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT company_name, vendor_address, vendor_phone, vendor_contact_person, vendor_tax_id
      FROM purchase_orders po
      WHERE company_name IS NOT NULL AND TRIM(company_name) <> ''
        AND po.created_at = (
          SELECT MAX(created_at) FROM purchase_orders WHERE company_name = po.company_name
        )
      ORDER BY LOWER(company_name)
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updatePOCompany = async (req, res) => {
  const { id } = req.params;
  const { company_id } = req.body;
  try {
    await query(
      'UPDATE purchase_orders SET company_id = $1, updated_at = NOW() WHERE id = $2',
      [company_id || null, id]
    );
    res.json({ message: 'อัปเดตข้อมูลบริษัทของใบสั่งซื้อสำเร็จ' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
