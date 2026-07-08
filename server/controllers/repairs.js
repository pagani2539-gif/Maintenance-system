const { query } = require('../database/db');
const { validateStationExists, validateStationAreaBelongsToStation, getStationSnapshotName } = require('../utils/stationValidation');
const { logAudit } = require('../utils/auditLogger');
const { sendLineNotify } = require('../utils/lineNotify');
const { generateDocNo } = require('../utils/docNumber');
const { REPAIR_STATUS, INSTANCE_STATUS } = require('../utils/constants');

const queryAll = async (sql, params = []) => (await query(sql, params)).rows;
const queryGet = async (sql, params = []) => (await query(sql, params)).rows[0];

// Repair tickets use "RP-", claims use "CL-" — both stored in repairs.ticket_no
const generateRepairNo = () => generateDocNo('RP', { table: 'repairs', column: 'ticket_no' });
const generateClaimNo = () => generateDocNo('CL', { table: 'repairs', column: 'ticket_no' });

exports.getDashboardStats = async (req, res) => {
  const { startDate, endDate } = req.query;
  const params = [];
  let timeCondition = "1=1";

  if (startDate && endDate) {
    timeCondition = "created_at BETWEEN $1 AND $2";
    params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
  } else if (startDate) {
    timeCondition = "created_at >= $1";
    params.push(`${startDate} 00:00:00`);
  } else if (endDate) {
    timeCondition = "created_at <= $1";
    params.push(`${endDate} 23:59:59`);
  }

  try {
    const [
      kpis,
      recentJobs,
      recentLogs,
      technicians,
      topUsed,
      leastUsed,
      criticalStock,
      mostBroken,
      overdue,
      monthlyTrend,
      recentTransactions,
      recentWithdrawals,
      withdrawalBreakdown,
      stockMovements,
      purchaseOrderKpis,
      topRecipients,
      pendingReturns,
      pendingReturnsCount,
      supervisors,
      unassignedStationsCount,
      claimsKpis,
      inventoryConditions
    ] = await Promise.all([
      // 1. KPIs
      queryGet(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN TRIM(status) = 'รอดำเนินการ' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN TRIM(status) = 'กำลังซ่อม' THEN 1 ELSE 0 END) as in_progress,
          SUM(CASE WHEN TRIM(status) = 'เสร็จสิ้น' THEN 1 ELSE 0 END) as completed
        FROM repairs
        WHERE ${timeCondition}
      `, params),
      // 2. Recent Jobs
      queryAll("SELECT * FROM repairs ORDER BY created_at DESC, id DESC LIMIT 10"),
      // 3. Recent Logs
      queryAll(`
        SELECT l.*, r.ticket_no, r.device_name
        FROM repair_logs l
        JOIN repairs r ON l.repair_id = r.id
        ORDER BY l.created_at DESC, l.id DESC LIMIT 10
      `),
      // 4. Technicians Workload
      queryAll(`
        SELECT
          technician as name,
          SUM(CASE WHEN TRIM(status) = 'เสร็จสิ้น' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN TRIM(status) != 'เสร็จสิ้น' THEN 1 ELSE 0 END) as active,
          COUNT(*) as total
        FROM repairs
        WHERE technician IS NOT NULL AND technician != '' AND ${timeCondition}
        GROUP BY technician
        ORDER BY total DESC
      `, params),
      // 5. Top Used Items
      queryAll(`
        SELECT i.name, SUM(wi.quantity) as count
        FROM withdrawal_items wi
        JOIN inventory i ON wi.inventory_id = i.id
        JOIN withdrawals w ON wi.withdrawal_id = w.id
        WHERE w.created_at >= $1 AND w.created_at <= $2
        GROUP BY wi.inventory_id, i.name
        ORDER BY count DESC LIMIT 5
      `, [startDate ? `${startDate} 00:00:00` : '1970-01-01', endDate ? `${endDate} 23:59:59` : '9999-12-31']),
      // 6. Dead Stock (no inventory movement in the last 90 days, or never moved)
      queryAll(`
        SELECT
          i.name,
          EXTRACT(DAY FROM NOW() - MAX(t.created_at))::INTEGER as days_idle
        FROM inventory i
        LEFT JOIN inventory_transactions t ON t.inventory_id = i.id
        GROUP BY i.id
        HAVING MAX(t.created_at) IS NULL OR MAX(t.created_at) < NOW() - INTERVAL '90 days'
        ORDER BY (MAX(t.created_at) IS NULL) DESC, days_idle DESC
        LIMIT 5
      `),
      // 7. Critical Stock Count
      queryGet("SELECT COUNT(*) as count FROM inventory WHERE quantity < min_stock"),
      // 8. Most Broken Devices
      queryAll(`
        SELECT device_name as name, COUNT(*) as count
        FROM repairs
        WHERE ${timeCondition}
        GROUP BY device_name
        ORDER BY count DESC LIMIT 5
      `, params),
      // 9. Overdue (older than 3 days and not completed)
      queryAll(`
        SELECT id, ticket_no, device_name, reporter, created_at,
        EXTRACT(DAY FROM NOW() - created_at)::INTEGER as days_over
        FROM repairs
        WHERE status != 'เสร็จสิ้น' AND created_at < NOW() - INTERVAL '3 days'
        ORDER BY days_over DESC LIMIT 5
      `),
      // 10. Monthly Trend (last 6 months)
      queryAll(`
        SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COUNT(*) as count
        FROM repairs
        WHERE created_at > NOW() - INTERVAL '6 months'
        GROUP BY month
        ORDER BY month ASC
      `),
      // 11. Recent Transactions
      queryAll(`
        SELECT t.*, i.name as product_name
        FROM inventory_transactions t
        JOIN inventory i ON t.inventory_id = i.id
        ORDER BY t.created_at DESC, t.id DESC LIMIT 10
      `),
      // 12. Recent Withdrawals
      queryAll("SELECT * FROM withdrawals ORDER BY created_at DESC, id DESC LIMIT 10"),
      // 13. Withdrawal Breakdown by type/reason
      queryAll(`
        SELECT type as name, COUNT(*) as count
        FROM withdrawals
        WHERE ${timeCondition}
        GROUP BY type
        ORDER BY count DESC
      `, params),
      // 14. Stock Movements Trend over 6 months
      queryAll(`
        SELECT
          TO_CHAR(created_at, 'YYYY-MM') as month,
          SUM(CASE WHEN transaction_type = 'ADD_STOCK' THEN quantity_added ELSE 0 END) as added,
          SUM(CASE WHEN transaction_type = 'WITHDRAW' THEN quantity_withdrawn ELSE 0 END) as withdrawn,
          SUM(CASE WHEN transaction_type = 'BORROW' THEN quantity_borrowed ELSE 0 END) as borrowed,
          SUM(CASE WHEN transaction_type = 'RETURN' THEN quantity_returned ELSE 0 END) as returned
        FROM inventory_transactions
        WHERE created_at > NOW() - INTERVAL '6 months'
        GROUP BY month
        ORDER BY month ASC
      `),
      // 15. Purchase Order KPIs
      queryGet(`
        SELECT
          COUNT(*) as total_po,
          SUM(CASE WHEN status IN ('Draft', 'Pending', 'Approved', 'Ordered') THEN 1 ELSE 0 END) as pending_po,
          SUM(CASE WHEN status = 'Received' THEN 1 ELSE 0 END) as received_po
        FROM purchase_orders
        WHERE ${timeCondition}
      `, params),
      // 16. Top Recipients (ผู้เบิกบ่อยที่สุด)
      queryAll(`
        SELECT
          w.recipient as name,
          COUNT(DISTINCT w.id) as count,
          COALESCE(SUM(wi.quantity), 0) as items,
          MAX(w.created_at) as last_withdrawal
        FROM withdrawals w
        LEFT JOIN withdrawal_items wi ON wi.withdrawal_id = w.id
        WHERE w.recipient IS NOT NULL AND w.recipient != ''
          AND ${timeCondition === "1=1" ? "1=1" : timeCondition.replace(/created_at/g, 'w.created_at')}
        GROUP BY w.recipient
        ORDER BY count DESC, items DESC
        LIMIT 5
      `, params),
      // 19. Pending Returns (อุปกรณ์ค้างคืน — ยืม หรือ เบิกแบบทดสอบ/สำรอง ที่ยังไม่คืน)
      // ต้อง JOIN withdrawals เพื่อดึง withdrawal_type และ JOIN inventory_instances เพื่อดึง serial_number
      queryAll(`
        SELECT
          t.user_name as name,
          i.name as product_name,
          inst.serial_number,
          t.transaction_type,
          w.type as withdrawal_type,
          EXTRACT(DAY FROM NOW() - t.created_at)::INTEGER as days_out
        FROM inventory_transactions t
        JOIN inventory i ON t.inventory_id = i.id
        LEFT JOIN inventory_instances inst ON t.instance_id = inst.id
        LEFT JOIN withdrawals w ON t.withdrawal_id = w.id
        WHERE (t.status IS NULL OR t.status != 'RETURNED')
          AND (
            t.transaction_type = 'BORROW'
            OR (t.transaction_type = 'WITHDRAW' AND w.type IN ('ทดสอบ', 'สำรองใช้งาน'))
          )
        ORDER BY days_out DESC
        LIMIT 6
      `),
      // 20. Pending Returns Count (จำนวนรวมที่ค้างคืน)
      queryGet(`
        SELECT COUNT(*) as count
        FROM inventory_transactions t
        LEFT JOIN withdrawals w ON t.withdrawal_id = w.id
        WHERE (t.status IS NULL OR t.status != 'RETURNED')
          AND (
            t.transaction_type = 'BORROW'
            OR (t.transaction_type = 'WITHDRAW' AND w.type IN ('ทดสอบ', 'สำรองใช้งาน'))
          )
      `),
      // 21. Station Supervisors Workload (สถิติผู้ดูแลด่าน)
      queryAll(`
        SELECT
          s.responsible_person as name,
          COUNT(DISTINCT s.id) as station_count,
          STRING_AGG(DISTINCT s.name, ', ') as stations_list,
          COUNT(r.id) as total_repairs,
          SUM(CASE WHEN r.status != 'เสร็จสิ้น' THEN 1 ELSE 0 END) as active_repairs
        FROM stations s
        LEFT JOIN repairs r ON s.id = r.station_id AND ${timeCondition === "1=1" ? "1=1" : timeCondition.replace(/created_at/g, 'r.created_at')}
        WHERE s.responsible_person IS NOT NULL AND TRIM(s.responsible_person) != ''
        GROUP BY s.responsible_person
        ORDER BY active_repairs DESC, station_count DESC
      `, params),
      // 22. Unassigned Stations Count (ด่านที่ไม่มีผู้ดูแล)
      queryGet(`
        SELECT COUNT(*) as count
        FROM stations
        WHERE responsible_person IS NULL OR TRIM(responsible_person) = ''
      `),
      // 23. Claims KPIs (สถิติการส่งเคลมแยก)
      queryGet(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN TRIM(status) = 'รอดำเนินการ' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN TRIM(status) = 'กำลังซ่อม' THEN 1 ELSE 0 END) as in_progress,
          SUM(CASE WHEN TRIM(status) = 'เสร็จสิ้น' THEN 1 ELSE 0 END) as completed
        FROM repairs
        WHERE type = 'claim' AND ${timeCondition === "1=1" ? "1=1" : timeCondition}
      `, params),
      // 24. Inventory Conditions Breakdown (สภาพพัสดุในคลัง)
      queryAll(`
        SELECT
          COALESCE(condition, 'New') as condition,
          COUNT(*) as count
        FROM inventory_instances
        GROUP BY condition
      `)
    ]);

    // Additional query for critical items list
    const criticalItems = await queryAll("SELECT name, quantity, min_stock FROM inventory WHERE quantity < min_stock ORDER BY (min_stock - quantity) DESC LIMIT 5");

    // Postgres returns COUNT()/SUM() as strings (bigint/numeric) — coerce to Number for JSON output
    const num = (v) => Number(v) || 0;

    res.json({
      kpis: {
        total: num(kpis.total),
        pending: num(kpis.pending),
        in_progress: num(kpis.in_progress),
        completed: num(kpis.completed),
        critical_stock: num(criticalStock.count)
      },
      recentJobs,
      recentLogs,
      technicians: technicians.map(t => ({ ...t, completed: num(t.completed), active: num(t.active), total: num(t.total) })),
      inventory: {
        topUsed: topUsed.map(x => ({ ...x, count: num(x.count) })),
        leastUsed,
        criticalItems,
        recentTransactions,
        recentWithdrawals
      },
      analysis: {
        mostBroken: mostBroken.map(x => ({ ...x, count: num(x.count) })),
        overdue,
        monthlyTrend: monthlyTrend.map(x => ({ ...x, count: num(x.count) }))
      },
      withdrawalBreakdown: withdrawalBreakdown.map(x => ({ ...x, count: num(x.count) })),
      stockMovements: stockMovements.map(x => ({ ...x, added: num(x.added), withdrawn: num(x.withdrawn), borrowed: num(x.borrowed), returned: num(x.returned) })),
      people: {
        topRecipients: topRecipients.map(x => ({ ...x, count: num(x.count), items: num(x.items) })),
        pendingReturns,
        pendingReturnsCount: num(pendingReturnsCount.count)
      },
      purchaseOrders: {
        total_po: num(purchaseOrderKpis.total_po),
        pending_po: num(purchaseOrderKpis.pending_po),
        received_po: num(purchaseOrderKpis.received_po)
      },
      supervisors: supervisors.map(x => ({ ...x, station_count: num(x.station_count), total_repairs: num(x.total_repairs), active_repairs: num(x.active_repairs) })),
      unassignedStationsCount: num(unassignedStationsCount.count),
      claimsKpis: {
        total: num(claimsKpis?.total),
        pending: num(claimsKpis?.pending),
        in_progress: num(claimsKpis?.in_progress),
        completed: num(claimsKpis?.completed)
      },
      inventoryConditions: inventoryConditions.map(x => ({ ...x, count: num(x.count) }))
    });
  } catch (err) {
    console.error('Dashboard Stats Error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getUnreadCount = async (req, res) => {
  try {
    const rows = await queryAll("SELECT type, COUNT(*) as count FROM repairs WHERE is_read = 0 GROUP BY type");
    const invRow = await queryGet("SELECT COUNT(*) as count FROM inventory WHERE quantity < min_stock");
    const pendingRow = await queryGet(`
      SELECT COUNT(*) as count
      FROM inventory_transactions t
      LEFT JOIN withdrawals w ON t.withdrawal_id = w.id
      WHERE (t.status IS NULL OR t.status != 'RETURNED')
        AND (
          t.transaction_type = 'BORROW'
          OR (t.transaction_type = 'WITHDRAW' AND w.type IN ('ทดสอบ', 'สำรองใช้งาน', 'ยืมใช้งาน', 'ยืม'))
        )
    `);
    const myTasksRow = await queryGet(
      `SELECT COUNT(*) as count FROM repairs WHERE technician = $1 AND status != 'เสร็จสิ้น'`,
      [req.user.full_name]
    );

    const repairUnread = Number((rows && rows.find(r => r.type === 'repair')?.count)) || 0;
    const claimUnread = Number((rows && rows.find(r => r.type === 'claim')?.count)) || 0;
    const lowStock = Number(invRow && invRow.count) || 0;
    const pendingReturns = Number(pendingRow && pendingRow.count) || 0;
    const myTasks = Number(myTasksRow && myTasksRow.count) || 0;

    res.json({
      repair: repairUnread,
      claim: claimUnread,
      lowStock: lowStock,
      pendingReturns: pendingReturns,
      myTasks: myTasks,
      total: repairUnread + claimUnread,
      count: repairUnread + claimUnread
    });
  } catch (err) {
    console.error("Database error in getUnreadCount:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getAllRepairs = async (req, res) => {
  try {
    const { status, location, station_id, search, type, priority, sortBy, technician, unassigned } = req.query;
    let sql = `SELECT * FROM repairs_view WHERE 1=1`;
    const params = [];

    if (type) {
      params.push(type);
      sql += ` AND type = $${params.length}`;
    }

    if (status && status !== 'All' && status !== 'ทั้งหมด') {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    if (station_id) {
      params.push(station_id);
      sql += ` AND station_id = $${params.length}`;
    } else if (location && location !== 'All' && location !== 'ทั้งหมด') {
      params.push(location);
      const p = params.length;
      sql += ` AND (location = $${p} OR location_snapshot = $${p} OR station_name = $${p})`;
    }

    if (priority && priority !== 'All' && priority !== 'ทั้งหมด') {
      params.push(priority);
      sql += ` AND priority = $${params.length}`;
    }

    if (technician) {
      params.push(technician);
      sql += ` AND technician = $${params.length}`;
    }

    if (unassigned === 'true' || unassigned === '1') {
      sql += ` AND (technician IS NULL OR technician = '')`;
    }

    if (search) {
      params.push(`%${search}%`);
      const p = params.length;
      sql += ` AND (ticket_no ILIKE $${p} OR reporter ILIKE $${p} OR problem ILIKE $${p} OR device_name ILIKE $${p} OR location ILIKE $${p} OR location_snapshot ILIKE $${p} OR project_name ILIKE $${p} OR station_name ILIKE $${p})`;
    }

    if (sortBy === 'oldest') {
      sql += ' ORDER BY created_at ASC, id ASC';
    } else if (sortBy === 'priority') {
      sql += ` ORDER BY CASE priority WHEN 'วิกฤต' THEN 1 WHEN 'ด่วนมาก' THEN 2 WHEN 'ด่วน' THEN 3 ELSE 4 END ASC, created_at DESC, id DESC`;
    } else {
      sql += ' ORDER BY created_at DESC, id DESC'; // default newest
    }

    const rows = await queryAll(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getStats = async (req, res) => {
  try {
    const rows = await queryAll(`
      SELECT
        type,
        COUNT(*) as total,
        SUM(CASE WHEN TRIM(status) = 'รอดำเนินการ' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN TRIM(status) = 'กำลังซ่อม' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN TRIM(status) = 'รออะไหล่' THEN 1 ELSE 0 END) as on_hold,
        SUM(CASE WHEN TRIM(status) = 'เสร็จสิ้น' THEN 1 ELSE 0 END) as completed
      FROM repairs
      GROUP BY type
    `);

    const num = (v) => Number(v) || 0;
    const format = (r) => ({ total: num(r.total), pending: num(r.pending), in_progress: num(r.in_progress), on_hold: num(r.on_hold), completed: num(r.completed) });

    // Format output to be easy for client to map
    const stats = {
      repair: format(rows.find(r => r.type === 'repair') || {}),
      claim: format(rows.find(r => r.type === 'claim') || {})
    };
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getRepairById = async (req, res) => {
  try {
    const { id } = req.params;

    const repair = await queryGet('SELECT * FROM repairs_view WHERE id = $1', [id]);
    if (!repair) return res.status(404).json({ message: 'ไม่พบข้อมูล' });

    const logs = await queryAll('SELECT * FROM repair_logs WHERE repair_id = $1 ORDER BY created_at DESC, id DESC', [id]);
    const images = await queryAll('SELECT * FROM repair_images WHERE repair_id = $1', [id]);
    const devices = await queryAll('SELECT * FROM device_changes WHERE repair_id = $1', [id]);

    res.json({ ...repair, logs, images, devices });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createRepair = async (req, res) => {
  const { location, station_id, station_area_id, device_name, problem, priority, received_at, project_name, instance_id, inventory_id } = req.body;
  const reporter = req.user.full_name;

  try {
    await validateStationExists(station_id);
    await validateStationAreaBelongsToStation(station_id, station_area_id);
    let officialLocation = (station_id ? await getStationSnapshotName(station_id) : null) || location;
    if (station_id && location && typeof location === 'string' && officialLocation && location.startsWith(officialLocation)) {
      officialLocation = location;
    }

    const ticket_no = await generateRepairNo();

    const { rows } = await query(`
      INSERT INTO repairs (ticket_no, reporter, location, station_id, station_area_id, device_name, problem, priority, status, is_read, type, received_at, project_name, instance_id, inventory_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 'repair', $10, $11, $12, $13)
      RETURNING id
    `, [ticket_no, reporter, officialLocation, station_id || null, station_area_id || null, device_name, problem, priority || 'ปกติ', REPAIR_STATUS.PENDING, received_at || new Date().toISOString(), project_name, instance_id || null, inventory_id || null]);

    const repairId = rows[0].id;

    // Update inventory instance status if provided
    if (instance_id) {
      await query('UPDATE inventory_instances SET status = $1 WHERE id = $2', [INSTANCE_STATUS.UNDER_REPAIR, instance_id]);
    }

    // Log creation
    await query('INSERT INTO repair_logs (repair_id, action, "user", note) VALUES ($1, $2, $3, $4)',
      [repairId, 'เปิดตั๋วแจ้งซ่อม', reporter, 'ส่งข้อมูลแจ้งซ่อมใหม่เข้าสู่ระบบ']);

    // Handle images if any
    if (req.files && req.files.length > 0) {
      const valuesSql = req.files.map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`).join(', ');
      const imgParams = [repairId];
      req.files.forEach(file => imgParams.push(file.filename, 'รูปก่อนซ่อม'));
      await query(`INSERT INTO repair_images (repair_id, file_path, image_type) VALUES ${valuesSql}`, imgParams);
    }

    // Send LINE Notify Alert
    const lineMsg = `\n🔧 *แจ้งซ่อมใหม่*\n🔢 เลขใบงาน: ${ticket_no}\n💻 อุปกรณ์: ${device_name}\n⚠️ อาการเสีย: ${problem}\n⚡ ระดับความสำคัญ: ${priority || 'ปกติ'}\n📍 สถานที่: ${officialLocation || 'ไม่ได้ระบุ'}\n👤 ผู้แจ้ง: ${reporter}`;
    sendLineNotify('repair', lineMsg);

    res.status(201).json({ id: repairId, ticket_no });
  } catch (err) {
    console.error('Create Repair Error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.createClaim = async (req, res) => {
  const { location, station_id, station_area_id, device_name, problem, priority, received_at, project_name, instance_id, inventory_id } = req.body;
  const reporter = req.user.full_name;

  try {
    await validateStationExists(station_id);
    await validateStationAreaBelongsToStation(station_id, station_area_id);
    let officialLocation = (station_id ? await getStationSnapshotName(station_id) : null) || location;
    if (station_id && location && typeof location === 'string' && officialLocation && location.startsWith(officialLocation)) {
      officialLocation = location;
    }

    const ticket_no = await generateClaimNo();

    const { rows } = await query(`
      INSERT INTO repairs (ticket_no, reporter, location, station_id, station_area_id, device_name, problem, priority, status, is_read, type, received_at, project_name, instance_id, inventory_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 'claim', $10, $11, $12, $13)
      RETURNING id
    `, [ticket_no, reporter, officialLocation, station_id || null, station_area_id || null, device_name, problem, priority || 'ปกติ', REPAIR_STATUS.PENDING, received_at || new Date().toISOString(), project_name, instance_id || null, inventory_id || null]);

    const repairId = rows[0].id;

    // Update inventory instance status if provided
    if (instance_id) {
      await query('UPDATE inventory_instances SET status = $1 WHERE id = $2', [INSTANCE_STATUS.CLAIMING, instance_id]);
    }

    // Log creation
    await query('INSERT INTO repair_logs (repair_id, action, "user", note) VALUES ($1, $2, $3, $4)',
      [repairId, 'เปิดตั๋วแจ้งเคลม', reporter, 'ส่งข้อมูลแจ้งเคลมใหม่เข้าสู่ระบบ']);

    // Handle images if any
    if (req.files && req.files.length > 0) {
      const valuesSql = req.files.map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`).join(', ');
      const imgParams = [repairId];
      req.files.forEach(file => imgParams.push(file.filename, 'รูปก่อนเคลม'));
      await query(`INSERT INTO repair_images (repair_id, file_path, image_type) VALUES ${valuesSql}`, imgParams);
    }

    // Send LINE Notify Alert
    const lineMsg = `\n🛡️ *แจ้งเคลมใหม่*\n🔢 เลขใบงาน: ${ticket_no}\n💻 อุปกรณ์: ${device_name}\n⚠️ อาการเสีย/ปัญหา: ${problem}\n⚡ ระดับความสำคัญ: ${priority || 'ปกติ'}\n📍 สถานที่: ${officialLocation || 'ไม่ได้ระบุ'}\n👤 ผู้แจ้ง: ${reporter}`;
    sendLineNotify('repair', lineMsg);

    res.status(201).json({ id: repairId, ticket_no });
  } catch (err) {
    console.error('Create Claim Error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.markAsRead = async (req, res) => {
  const { id } = req.params;
  try {
    await query('UPDATE repairs SET is_read = 1 WHERE id = $1', [id]);
    res.json({ message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateStatus = async (req, res) => {
  const { id } = req.params;
  const { status, note, repair_note } = req.body;
  const actor = req.user.full_name;
  const normalizedStatus = String(status || '').trim();

  try {
    const oldRepair = await queryGet('SELECT * FROM repairs WHERE id = $1', [id]);
    if (!oldRepair) return res.status(404).json({ error: 'ไม่พบใบงาน' });

    // Technician is the logged-in user performing the work
    let sql = 'UPDATE repairs SET status = $1, technician = $2, updated_at = NOW()';
    const params = [normalizedStatus, actor];

    if (repair_note) {
      params.push(repair_note);
      sql += `, repair_note = $${params.length}`;
    }

    params.push(id);
    sql += ` WHERE id = $${params.length}`;

    await query(sql, params);

    const logNote = repair_note || note || '';
    await query('INSERT INTO repair_logs (repair_id, action, "user", note) VALUES ($1, $2, $3, $4)',
      [id, `เปลี่ยนสถานะเป็น ${normalizedStatus}`, actor, logNote]);

    // If status is completed ('เสร็จสิ้น'), update instance statuses if no swap happened
    if (normalizedStatus === REPAIR_STATUS.COMPLETED) {
      const changes = await queryAll('SELECT * FROM device_changes WHERE repair_id = $1', [id]);
      if ((!changes || changes.length === 0) && oldRepair.instance_id) {
        try {
          await query("UPDATE inventory_instances SET status = $1 WHERE id = $2", [INSTANCE_STATUS.WITHDRAWN, oldRepair.instance_id]);
        } catch (errUpd) {
          console.error('Failed to update instance status on complete:', errUpd.message);
        }
      }
    }

    const row = await queryGet('SELECT * FROM repairs WHERE id = $1', [id]);
    if (row) {
      const actionType = row.type === 'claim' ? 'claim update' : 'repair update';
      logAudit(row.type || 'repair', id, actionType, oldRepair, row, actor).catch(e => console.error(e));
    }

    // Send LINE Notify Alert
    const typeLabel = oldRepair.type === 'claim' ? 'งานเคลม' : 'งานซ่อม';
    const lineMsg = `\n🔧 *อัปเดตสถานะ${typeLabel}*\n🔢 เลขใบงาน: ${oldRepair.ticket_no}\n💻 อุปกรณ์: ${oldRepair.device_name}\n📈 สถานะใหม่: ${status}\n👤 ผู้รับผิดชอบ: ${actor}\n💬 หมายเหตุ: ${repair_note || note || 'ไม่มี'}`;
    sendLineNotify('repair', lineMsg);

    res.json({ message: 'อัปเดตสถานะเรียบร้อย' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateRepair = async (req, res) => {
  const { id } = req.params;
  const { location, station_id, station_area_id, device_name, problem, priority, project_name } = req.body;
  const actor = req.user.full_name;

  try {
    await validateStationExists(station_id);
    await validateStationAreaBelongsToStation(station_id, station_area_id);
    let officialLocation = (station_id ? await getStationSnapshotName(station_id) : null) || location;
    if (station_id && location && typeof location === 'string' && officialLocation && location.startsWith(officialLocation)) {
      officialLocation = location;
    }

    const oldRepair = await queryGet('SELECT * FROM repairs WHERE id = $1', [id]);
    if (!oldRepair) return res.status(404).json({ error: 'ไม่พบใบงานที่ต้องการแก้ไข' });

    // Editor's identity tracked in logs; original reporter is preserved
    await query(`
      UPDATE repairs
      SET location = $1, station_id = $2, station_area_id = $3, device_name = $4, problem = $5, priority = $6, project_name = $7, updated_at = NOW()
      WHERE id = $8
    `, [officialLocation, station_id || null, station_area_id || null, device_name, problem, priority, project_name, id]);

    await query('INSERT INTO repair_logs (repair_id, action, "user", note) VALUES ($1, $2, $3, $4)',
      [id, 'แก้ไขข้อมูลใบงานซ่อม', actor, 'แก้ไขรายละเอียดพื้นฐานของใบแจ้งซ่อม']);

    const row = await queryGet('SELECT * FROM repairs WHERE id = $1', [id]);
    if (row) {
      const actionType = row.type === 'claim' ? 'claim update' : 'repair update';
      logAudit(row.type || 'repair', id, actionType, oldRepair, row, actor).catch(e => console.error(e));
    }

    res.json({ message: 'แก้ไขข้อมูลเรียบร้อย' });
  } catch (err) {
    console.error('Update Repair Error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.replaceDevice = async (req, res) => {
  const { id } = req.params;
  const { old_serial, old_model, new_serial, new_model } = req.body;
  const actor = req.user.full_name;

  try {
    await query(`
      INSERT INTO device_changes (repair_id, old_serial, old_model, new_serial, new_model, changed_by)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [id, old_serial, old_model, new_serial, new_model, actor]);

    // Update old and new device status immediately
    const repair = await queryGet('SELECT * FROM repairs WHERE id = $1', [id]);
    if (repair) {
      if (old_serial) {
        await query(
          "UPDATE inventory_instances SET status = $1, station_id = NULL, current_location = 'Warehouse' WHERE serial_number = $2",
          [INSTANCE_STATUS.DAMAGED, old_serial]
        );
      }
      if (new_serial) {
        await query(
          "UPDATE inventory_instances SET status = $1, station_id = $2, current_location = $3 WHERE serial_number = $4",
          [INSTANCE_STATUS.WITHDRAWN, repair.station_id, repair.location, new_serial]
        );
      }
    }

    await query('INSERT INTO repair_logs (repair_id, action, "user", note) VALUES ($1, $2, $3, $4)',
      [id, 'เปลี่ยนอะไหล่/อุปกรณ์', actor, `เปลี่ยน ${old_model} (${old_serial}) เป็น ${new_model} (${new_serial})`]);

    res.json({ message: 'บันทึกการเปลี่ยนอะไหล่เรียบร้อย' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteRepair = async (req, res) => {
  const { id } = req.params;
  try {
    const repair = await queryGet('SELECT * FROM repairs WHERE id = $1', [id]);
    if (repair && repair.instance_id && String(repair.status || '').trim() !== REPAIR_STATUS.COMPLETED) {
      await query("UPDATE inventory_instances SET status = $1 WHERE id = $2", [INSTANCE_STATUS.WITHDRAWN, repair.instance_id]);
    }
    await query('DELETE FROM repairs WHERE id = $1', [id]);
    res.json({ message: 'ลบรายการแจ้งซ่อมสำเร็จ' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateRepairCompany = async (req, res) => {
  const { id } = req.params;
  const { company_id } = req.body;
  try {
    await query(
      'UPDATE repairs SET company_id = $1, updated_at = NOW() WHERE id = $2',
      [company_id || null, id]
    );
    res.json({ message: 'อัปเดตข้อมูลบริษัทของใบแจ้งซ่อมสำเร็จ' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
