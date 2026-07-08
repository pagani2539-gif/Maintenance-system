const { query } = require('../database/db');
const { generateDocNo } = require('./docNumber');

async function checkAndGenerateAutoPOs() {
  // 1. Get all low stock items
  const { rows: lowStockItems } = await query(
    'SELECT id, min_stock, quantity FROM inventory WHERE quantity < min_stock',
    []
  );

  if (!lowStockItems || lowStockItems.length === 0) {
    return;
  }

  // 2. Find if there is an active 'Draft' PO (we can use an auto-generated draft PO or any Draft PO)
  const { rows: draftRows } = await query(
    "SELECT id FROM purchase_orders WHERE status = 'Draft' ORDER BY created_at DESC LIMIT 1",
    []
  );
  const draftPo = draftRows[0];

  let poId;
  if (draftPo) {
    poId = draftPo.id;
  } else {
    // Create new Draft PO — same "PO-YYMMDD-NNN" format as manual POs
    // (the "auto" origin is shown via the note/badge, not a separate prefix)
    const note = 'สั่งซื้ออัตโนมัติเนื่องจากสินค้าต่ำกว่าเกณฑ์ขั้นต่ำ';
    const poNo = await generateDocNo('PO', { table: 'purchase_orders', column: 'po_no' });
    const { rows } = await query(
      `INSERT INTO purchase_orders (po_no, status, created_by, note) VALUES ($1, 'Draft', 'System', $2) RETURNING id`,
      [poNo, note]
    );
    poId = rows[0].id;
  }

  for (const item of lowStockItems) {
    const deficit = item.min_stock - item.quantity;

    const { rows: existingRows } = await query(
      'SELECT id, quantity FROM purchase_order_items WHERE po_id = $1 AND inventory_id = $2',
      [poId, item.id]
    );
    const poItem = existingRows[0];

    if (poItem) {
      if (poItem.quantity !== deficit) {
        await query('UPDATE purchase_order_items SET quantity = $1 WHERE id = $2', [deficit, poItem.id]);
      }
    } else {
      await query(
        'INSERT INTO purchase_order_items (po_id, inventory_id, quantity) VALUES ($1, $2, $3)',
        [poId, item.id, deficit]
      );
    }
  }
}

module.exports = {
  checkAndGenerateAutoPOs
};
