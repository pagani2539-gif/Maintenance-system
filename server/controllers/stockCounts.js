const { query, withTransaction } = require('../database/db');
const { generateDocNo } = require('../utils/docNumber');
const { logAudit } = require('../utils/auditLogger');
const { sendLineNotify } = require('../utils/lineNotify');
const { checkAndGenerateAutoPOs } = require('../utils/autoPo');

const userName = (req) => (req.user && (req.user.full_name || req.user.username)) || 'System/Admin';

// POST /api/stock-counts — เปิดรอบตรวจนับใหม่ พร้อม snapshot ยอดคงคลังทุกรายการ
exports.createCount = async (req, res) => {
  const { note } = req.body || {};

  try {
    const created = await withTransaction(async (client) => {
      // Only one active counting session at a time — adjustments from two
      // overlapping sessions would double-apply against the same snapshot.
      const { rows: activeRows } = await client.query(
        "SELECT id, count_no FROM stock_counts WHERE status = 'IN_PROGRESS' LIMIT 1"
      );
      if (activeRows[0]) {
        const err = new Error(`มีรอบตรวจนับ ${activeRows[0].count_no} ที่ยังไม่เสร็จสิ้น กรุณาปิดรอบเดิมก่อนเปิดรอบใหม่`);
        err.status = 409;
        throw err;
      }

      const countNo = await generateDocNo('SC', { table: 'stock_counts', column: 'count_no' });
      const { rows } = await client.query(
        `INSERT INTO stock_counts (count_no, note, created_by) VALUES ($1, $2, $3) RETURNING *`,
        [countNo, (note || '').trim() || null, userName(req)]
      );
      const count = rows[0];

      const snapshot = await client.query(
        `INSERT INTO stock_count_items (count_id, inventory_id, expected_qty)
         SELECT $1, id, quantity FROM inventory
         RETURNING id`,
        [count.id]
      );
      if (snapshot.rowCount === 0) {
        const err = new Error('ไม่มีรายการพัสดุในคลัง จึงไม่สามารถเปิดรอบตรวจนับได้');
        err.status = 400;
        throw err;
      }

      return { ...count, total_items: snapshot.rowCount };
    });

    logAudit('stock_count', created.id, 'stock count created', null, { count_no: created.count_no, total_items: created.total_items }, userName(req)).catch(e => console.error(e));

    res.status(201).json(created);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    res.status(500).json({ message: err.message });
  }
};

// GET /api/stock-counts — รายการรอบตรวจนับพร้อมสรุปความคืบหน้า
exports.getAllCounts = async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT sc.*,
        COUNT(sci.id)::int AS total_items,
        COUNT(sci.counted_qty)::int AS counted_items,
        COUNT(CASE WHEN sci.counted_qty IS NOT NULL AND sci.counted_qty <> sci.expected_qty THEN 1 END)::int AS variance_items
      FROM stock_counts sc
      LEFT JOIN stock_count_items sci ON sci.count_id = sc.id
      GROUP BY sc.id
      ORDER BY sc.created_at DESC, sc.id DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/stock-counts/:id — รายละเอียดรอบตรวจนับพร้อมรายการนับ
exports.getCountById = async (req, res) => {
  const { id } = req.params;
  try {
    const { rows: countRows } = await query('SELECT * FROM stock_counts WHERE id = $1', [id]);
    const count = countRows[0];
    if (!count) return res.status(404).json({ message: 'ไม่พบรอบตรวจนับนี้' });

    const { rows: items } = await query(`
      SELECT sci.*, i.name, i.model, i.storage_location, i.image_path, i.requires_sn,
             i.quantity AS current_qty
      FROM stock_count_items sci
      JOIN inventory i ON sci.inventory_id = i.id
      WHERE sci.count_id = $1
      ORDER BY i.name ASC, i.id ASC
    `, [id]);

    res.json({ ...count, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /api/stock-counts/:id/items/:itemId — บันทึกจำนวนที่นับได้
exports.updateCountItem = async (req, res) => {
  const { id, itemId } = req.params;
  const { counted_qty, note } = req.body || {};

  const cleared = counted_qty === null || counted_qty === undefined || counted_qty === '';
  const qty = cleared ? null : parseInt(counted_qty, 10);
  if (!cleared && (!Number.isInteger(qty) || qty < 0)) {
    return res.status(400).json({ message: 'จำนวนที่นับได้ต้องเป็นเลขจำนวนเต็มตั้งแต่ 0 ขึ้นไป' });
  }

  try {
    const { rows: countRows } = await query('SELECT status FROM stock_counts WHERE id = $1', [id]);
    if (!countRows[0]) return res.status(404).json({ message: 'ไม่พบรอบตรวจนับนี้' });
    if (countRows[0].status !== 'IN_PROGRESS') {
      return res.status(400).json({ message: 'รอบตรวจนับนี้ปิดไปแล้ว ไม่สามารถแก้ไขการนับได้' });
    }

    const { rows } = await query(`
      UPDATE stock_count_items
      SET counted_qty = $1,
          note = $2,
          counted_by = CASE WHEN $1::int IS NULL THEN NULL ELSE $3 END,
          counted_at = CASE WHEN $1::int IS NULL THEN NULL ELSE NOW() END
      WHERE id = $4 AND count_id = $5
      RETURNING *
    `, [qty, (note || '').trim() || null, userName(req), itemId, id]);

    if (!rows[0]) return res.status(404).json({ message: 'ไม่พบรายการนับนี้ในรอบตรวจนับ' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/stock-counts/:id/complete — ปิดรอบและปรับยอดตามผลนับ
exports.completeCount = async (req, res) => {
  const { id } = req.params;
  const actor = userName(req);

  try {
    const summary = await withTransaction(async (client) => {
      const { rows: countRows } = await client.query(
        'SELECT * FROM stock_counts WHERE id = $1 FOR UPDATE',
        [id]
      );
      const count = countRows[0];
      if (!count) {
        const err = new Error('ไม่พบรอบตรวจนับนี้');
        err.status = 404;
        throw err;
      }
      if (count.status !== 'IN_PROGRESS') {
        const err = new Error('รอบตรวจนับนี้ปิดไปแล้ว');
        err.status = 400;
        throw err;
      }

      const { rows: items } = await client.query(`
        SELECT sci.*, i.name
        FROM stock_count_items sci
        JOIN inventory i ON sci.inventory_id = i.id
        WHERE sci.count_id = $1
        ORDER BY i.name ASC
      `, [id]);

      const counted = items.filter(it => it.counted_qty !== null);
      if (counted.length === 0) {
        const err = new Error('ยังไม่มีรายการที่นับเลย กรุณานับอย่างน้อย 1 รายการก่อนปิดรอบ');
        err.status = 400;
        throw err;
      }

      const adjustments = [];
      for (const it of counted) {
        const variance = it.counted_qty - it.expected_qty;
        if (variance === 0) continue;

        // Apply the variance relative to the *current* quantity (not the
        // snapshot) so stock movements made while counting are preserved.
        const { rows: updated } = await client.query(
          `UPDATE inventory SET quantity = GREATEST(0, quantity + $1), updated_at = NOW()
           WHERE id = $2 RETURNING quantity`,
          [variance, it.inventory_id]
        );

        const noteText = `ปรับยอดจากการตรวจนับ ${count.count_no}` + (it.note ? ` — ${it.note}` : '');
        if (variance > 0) {
          await client.query(
            `INSERT INTO inventory_transactions (inventory_id, transaction_type, quantity_added, user_name, note)
             VALUES ($1, 'ADD_STOCK', $2, $3, $4)`,
            [it.inventory_id, variance, it.counted_by || actor, noteText]
          );
        } else {
          await client.query(
            `INSERT INTO inventory_transactions (inventory_id, transaction_type, quantity_withdrawn, user_name, note, status)
             VALUES ($1, 'WITHDRAW', $2, $3, $4, 'ADJUSTED')`,
            [it.inventory_id, Math.abs(variance), it.counted_by || actor, noteText]
          );
        }

        adjustments.push({
          inventory_id: it.inventory_id,
          name: it.name,
          expected_qty: it.expected_qty,
          counted_qty: it.counted_qty,
          variance,
          new_quantity: updated[0].quantity
        });
      }

      await client.query(
        `UPDATE stock_counts SET status = 'COMPLETED', completed_by = $1, completed_at = NOW() WHERE id = $2`,
        [actor, id]
      );

      return {
        count_no: count.count_no,
        total_items: items.length,
        counted_items: counted.length,
        uncounted_items: items.length - counted.length,
        adjustments
      };
    });

    logAudit('stock_count', id, 'stock count completed', null, summary, actor).catch(e => console.error(e));

    if (summary.adjustments.length > 0) {
      const lines = summary.adjustments.slice(0, 10)
        .map(a => `• ${a.name}: ${a.expected_qty} → ${a.counted_qty} (${a.variance > 0 ? '+' : ''}${a.variance})`)
        .join('\n');
      const more = summary.adjustments.length > 10 ? `\n...และอีก ${summary.adjustments.length - 10} รายการ` : '';
      sendLineNotify('stock', `\n📋 *ปิดรอบตรวจนับสต็อก ${summary.count_no}*\n👤 ผู้ปิดรอบ: ${actor}\n✅ นับแล้ว: ${summary.counted_items}/${summary.total_items} รายการ\n⚠️ พบยอดต่าง ${summary.adjustments.length} รายการ (ปรับยอดแล้ว):\n${lines}${more}`);

      // Negative adjustments may have dropped items below min_stock
      checkAndGenerateAutoPOs().catch((autoPoErr) => {
        console.error('Error auto-generating POs after stock count:', autoPoErr.message);
      });
    } else {
      sendLineNotify('stock', `\n📋 *ปิดรอบตรวจนับสต็อก ${summary.count_no}*\n👤 ผู้ปิดรอบ: ${actor}\n✅ นับแล้ว: ${summary.counted_items}/${summary.total_items} รายการ\n🎯 ยอดตรงทั้งหมด ไม่มีการปรับยอด`);
    }

    res.json({ message: `ปิดรอบตรวจนับเรียบร้อย ปรับยอด ${summary.adjustments.length} รายการ`, ...summary });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    res.status(500).json({ message: err.message });
  }
};

// POST /api/stock-counts/:id/cancel — ยกเลิกรอบตรวจนับ (ไม่ปรับยอดใด ๆ)
exports.cancelCount = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await query(
      `UPDATE stock_counts SET status = 'CANCELLED', completed_by = $1, completed_at = NOW()
       WHERE id = $2 AND status = 'IN_PROGRESS' RETURNING count_no`,
      [userName(req), id]
    );
    if (result.rowCount === 0) {
      return res.status(400).json({ message: 'ไม่พบรอบตรวจนับที่กำลังดำเนินการอยู่' });
    }

    logAudit('stock_count', id, 'stock count cancelled', null, { count_no: result.rows[0].count_no }, userName(req)).catch(e => console.error(e));
    res.json({ message: 'ยกเลิกรอบตรวจนับเรียบร้อย' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
