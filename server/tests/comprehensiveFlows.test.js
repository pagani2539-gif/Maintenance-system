const request = require('supertest');
const app = require('../index');
const { query } = require('../database/db');
const bcrypt = require('bcryptjs');

describe('Comprehensive Business Flows', () => {
  let token = '';
  const testUsername = 'test_admin_comp';
  const testPassword = 'test_admin_comp_password';

  beforeAll(async () => {
    // Wait for migrations and seeding to complete
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Create a temporary test admin user
    const hash = bcrypt.hashSync(testPassword, 10);
    await query(
      `INSERT INTO users (username, password_hash, full_name, is_full, is_active)
       VALUES ($1, $2, $3, 1, 1)
       ON CONFLICT (username) DO UPDATE SET password_hash = excluded.password_hash, full_name = excluded.full_name, is_full = excluded.is_full, is_active = excluded.is_active`,
      [testUsername, hash, 'Comprehensive Test Admin']
    );

    // Login to get token
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: testUsername, password: testPassword });

    if (res.body && res.body.token) {
      token = res.body.token;
    }
  });

  afterAll(async () => {
    // Clean up temporary user
    await query(`DELETE FROM users WHERE username = $1`, [testUsername]);
  });

  // Test 1: Station Code Auto-Generation
  it('should auto-generate station code based on direction', async () => {
    const directions = [
      { dir: 'BOTH', expected: 'BOTH' },
      { dir: 'INBOUND', expected: 'IN' },
      { dir: 'OUTBOUND', expected: 'OUT' },
      { dir: 'NONE', expected: 'NONE' }
    ];

    for (const d of directions) {
      const uniqueName = `Station-CompTest-${d.dir}-${Math.random().toString(36).substring(7)}`;
      const res = await request(app)
        .post('/api/stations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: uniqueName,
          station_type: 'ประเภท ก',
          highway_no: '9',
          direction: d.dir,
          region: 'กลาง',
          province: 'กรุงเทพมหานคร',
          responsible_person: 'ผู้ดูแลจำลอง'
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body).toHaveProperty('code');
      expect(res.body.code).toContain(`-${d.expected}`);
      expect(res.body.name).toEqual(uniqueName);

      // Clean up station
      const stationId = res.body.id;
      await query('DELETE FROM stations WHERE id = $1', [stationId]);
    }
  });

  // Test 2: Auto PO Generation on Stock Deficit
  it('should auto-generate draft PO items when stock falls below min_stock', async () => {
    // 1. Create a mock inventory item
    const { rows: invRows } = await query(
      `INSERT INTO inventory (name, model, quantity, min_stock, requires_sn) VALUES ('CompTest Item PO', 'Model PO-1', 20, 15, 0) RETURNING id`
    );
    const invId = Number(invRows[0].id);

    // 2. Perform a withdrawal that drops it below min_stock
    const resWithdraw = await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'ติดตั้งใหม่',
        note: 'CompTest withdrawal',
        items: [
          { inventory_id: invId, quantity: 10 } // Drops stock from 20 -> 10, which is < min_stock (15)
        ]
      });
    expect(resWithdraw.statusCode).toEqual(201);

    // 3. Give background process checkAndGenerateAutoPOs a moment
    await new Promise(resolve => setTimeout(resolve, 500));

    // 4. Query draft POs to check if the item is present with a quantity of 5 (min_stock 15 - remaining 10)
    const resPos = await request(app)
      .get('/api/purchase-orders')
      .set('Authorization', `Bearer ${token}`);

    expect(resPos.statusCode).toEqual(200);
    const draftPos = resPos.body.filter(po => po.status === 'Draft');
    expect(draftPos.length).toBeGreaterThan(0);

    // Get the details of the latest Draft PO
    const latestDraftPoId = draftPos[0].id;
    const resPoDetail = await request(app)
      .get(`/api/purchase-orders/${latestDraftPoId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(resPoDetail.statusCode).toEqual(200);
    const poItems = resPoDetail.body.items;
    const matchItem = poItems.find(item => Number(item.inventory_id) === invId);
    expect(matchItem).toBeDefined();
    expect(matchItem.quantity).toEqual(5); // Deficit = 15 - 10 = 5

    // Clean up
    await query('DELETE FROM purchase_order_items WHERE po_id = $1', [latestDraftPoId]);
    await query('DELETE FROM purchase_orders WHERE id = $1', [latestDraftPoId]);
    await query('DELETE FROM inventory_transactions WHERE inventory_id = $1', [invId]);
    await query('DELETE FROM withdrawal_items WHERE inventory_id = $1', [invId]);
    await query('DELETE FROM withdrawals WHERE id = $1', [resWithdraw.body.id]);
    await query('DELETE FROM inventory WHERE id = $1', [invId]);
  });

  // Test 3: Withdrawal Return Due Date and Return Flow
  it('should handle return due dates and return process', async () => {
    // 1. Create a mock inventory item
    const { rows: invRows } = await query(
      `INSERT INTO inventory (name, model, quantity, min_stock, requires_sn) VALUES ('CompTest Item Return', 'Model RT-1', 10, 2, 0) RETURNING id`
    );
    const invId = Number(invRows[0].id);

    const dueDate = '2026-07-20';

    // 2. Create withdrawal with type = 'ยืมใช้งาน' and return_due_date
    const resWithdraw = await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'ยืมใช้งาน',
        note: 'CompTest borrow withdrawal',
        return_due_date: dueDate,
        items: [
          { inventory_id: invId, quantity: 2 }
        ]
      });
    expect(resWithdraw.statusCode).toEqual(201);
    const withdrawalId = Number(resWithdraw.body.id);

    // 3. Query withdrawals and verify due date is present
    const resGetWithdrawal = await request(app)
      .get(`/api/withdrawals/${withdrawalId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(resGetWithdrawal.statusCode).toEqual(200);
    expect(resGetWithdrawal.body.return_due_date).toEqual(dueDate);

    // 4. Query pending returns transactions
    const resGetPending = await request(app)
      .get('/api/transactions?pending_only=true')
      .set('Authorization', `Bearer ${token}`);

    expect(resGetPending.statusCode).toEqual(200);
    const pendingTx = resGetPending.body.find(tx => Number(tx.withdrawal_id) === withdrawalId && Number(tx.inventory_id) === invId);
    expect(pendingTx).toBeDefined();
    expect(pendingTx.return_due_date).toEqual(dueDate);

    // 5. Return the item
    const resReturn = await request(app)
      .post('/api/transactions/return')
      .set('Authorization', `Bearer ${token}`)
      .send({
        inventory_id: invId,
        quantity: 2,
        condition: 'Good',
        note: 'Returned CompTest borrow',
        transaction_id: pendingTx.id
      });
    expect(resReturn.statusCode).toEqual(200);

    // 6. Verify original transaction status is RETURNED
    const { rows: updatedTxRows } = await query('SELECT status FROM inventory_transactions WHERE id = $1', [pendingTx.id]);
    expect(updatedTxRows[0].status).toEqual('RETURNED');

    // 7. Verify inventory quantity restored to 10
    const { rows: finalQtyRows } = await query('SELECT quantity FROM inventory WHERE id = $1', [invId]);
    expect(finalQtyRows[0].quantity).toEqual(10);

    // Clean up
    await query('DELETE FROM inventory_transactions WHERE inventory_id = $1', [invId]);
    await query('DELETE FROM withdrawal_items WHERE inventory_id = $1', [invId]);
    await query('DELETE FROM withdrawals WHERE id = $1', [withdrawalId]);
    await query('DELETE FROM inventory WHERE id = $1', [invId]);
  });
});
