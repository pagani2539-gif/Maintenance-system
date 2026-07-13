const { query } = require('../database/db');

const queryAll = async (sql, params = []) => (await query(sql, params)).rows;

// --- Formatting helpers -----------------------------------------------------

// Format a timestamp to Thai Buddhist-era short date (e.g. 07/07/2569).
// Returns '-' for empty values so report cells never render "null".
const formatThaiDate = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear() + 543;
  return `${day}/${month}/${year}`;
};

// Same as formatThaiDate but with HH:MM appended — used by the audit-log report.
const formatThaiDateTime = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${formatThaiDate(value)} ${hh}:${mm}`;
};

// Turn a month count into a Thai "X ปี Y เดือน" label.
const ageLabel = (months) => {
  const m = Number(months) || 0;
  if (m >= 12) {
    const years = Math.floor(m / 12);
    const rem = m % 12;
    return `${years} ปี${rem ? ` ${rem} เดือน` : ''}`;
  }
  return `${m} เดือน`;
};

const dash = (value) => {
  if (value === null || value === undefined) return '-';
  const str = String(value).trim();
  return str === '' ? '-' : str;
};

// Build a station/location display string that mirrors the frontend format.
const stationLabel = (row) => {
  const parts = [];
  if (row.station_code) parts.push(`[${row.station_code}]`);
  parts.push(row.station_name || row.location_snapshot || row.location || '-');
  if (row.station_area_name) parts.push(`- ${row.station_area_name}`);
  if (row.station_province) parts.push(`จ.${row.station_province}`);
  return parts.join(' ');
};

// Translate the human-readable period label shown on the printed header.
const buildPeriodLabel = (startDate, endDate) => {
  if (startDate && endDate) return `${formatThaiDate(startDate)} ถึง ${formatThaiDate(endDate)}`;
  if (startDate) return `ตั้งแต่ ${formatThaiDate(startDate)}`;
  if (endDate) return `จนถึง ${formatThaiDate(endDate)}`;
  return 'ข้อมูลทั้งหมด';
};

// Build a "created_at BETWEEN" style filter from the request query.
// Returns { clause, params } so callers can splice it into their SQL.
const buildDateFilter = (startDate, endDate, column = 'created_at') => {
  const params = [];
  let clause = '1=1';
  if (startDate && endDate) {
    clause = `${column} BETWEEN $1 AND $2`;
    params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
  } else if (startDate) {
    clause = `${column} >= $1`;
    params.push(`${startDate} 00:00:00`);
  } else if (endDate) {
    clause = `${column} <= $1`;
    params.push(`${endDate} 23:59:59`);
  }
  return { clause, params };
};

const TRANSACTION_TYPE_TH = {
  ADD_STOCK: 'รับเข้าคลัง',
  WITHDRAW: 'เบิกออก',
  BORROW: 'ยืมใช้งาน',
  RETURN: 'รับคืน'
};

// --- Report builders --------------------------------------------------------
// Each builder receives ({ startDate, endDate }) and returns the full payload
// the frontend feeds straight into CSV/PDF: no per-type formatting on the client.

const buildRepairsReport = async ({ startDate, endDate }, type) => {
  const isClaim = type === 'claims';
  const { clause, params } = buildDateFilter(startDate, endDate);
  const rowsData = await queryAll(`
    SELECT * FROM repairs_view
    WHERE type = $${params.length + 1} AND ${clause}
    ORDER BY created_at DESC, id DESC
  `, [...params, isClaim ? 'claim' : 'repair']);

  const headers = ['เลขที่ใบงาน', 'ผู้แจ้ง', 'อุปกรณ์', 'อาการ/ปัญหา', 'สถานที่/สถานี', 'ความเร่งด่วน', 'สถานะ', 'ช่างผู้รับผิดชอบ', 'วันที่แจ้ง'];
  const rows = rowsData.map(r => [
    dash(r.ticket_no),
    dash(r.reporter),
    dash(r.device_name),
    dash(r.problem),
    stationLabel(r),
    dash(r.priority),
    dash(r.status),
    dash(r.technician),
    formatThaiDate(r.created_at)
  ]);

  const completed = rowsData.filter(r => (r.status || '').trim() === 'เสร็จสิ้น').length;
  const title = isClaim
    ? 'รายงานสรุปงานเคลม (Warranty Claims)'
    : 'รายงานสรุปงานซ่อมบำรุง (Repair Jobs)';

  return {
    title,
    headers,
    rows,
    colWidths: ['11%', '11%', '13%', '20%', '17%', '8%', '9%', '11%', '10%'],
    totals: [
      { label: `จำนวน${isClaim ? 'งานเคลม' : 'งานซ่อม'}ทั้งหมด:`, value: `${rowsData.length} รายการ` },
      { label: 'เสร็จสิ้นแล้ว:', value: `${completed} รายการ` },
      { label: 'ยังไม่เสร็จ:', value: `${rowsData.length - completed} รายการ` }
    ],
    count: rowsData.length
  };
};

const buildTransactionsReport = async ({ startDate, endDate }) => {
  const { clause, params } = buildDateFilter(startDate, endDate);
  const rowsData = await queryAll(`
    SELECT * FROM transactions_view
    WHERE ${clause}
    ORDER BY created_at DESC, id DESC
  `, params);

  const headers = ['วันที่', 'ประเภทรายการ', 'พัสดุ/อุปกรณ์', 'รุ่น (Model)', 'จำนวน', 'สถานที่/โครงการ', 'ผู้ทำรายการ'];
  const rows = rowsData.map(t => {
    const qty = Number(t.quantity_added) - Number(t.quantity_withdrawn) - Number(t.quantity_borrowed) + Number(t.quantity_returned);
    const qtyStr = qty > 0 ? `+${qty}` : `${qty}`;
    const place = t.project_name
      ? `${t.project_name}${t.station_name ? ` (${t.station_name})` : ''}`
      : stationLabel(t);
    return [
      formatThaiDate(t.created_at),
      TRANSACTION_TYPE_TH[t.transaction_type] || dash(t.transaction_type),
      dash(t.product_name),
      dash(t.product_model),
      `${qtyStr} ชิ้น`,
      place || '-',
      dash(t.user_name)
    ];
  });

  return {
    title: 'รายงานประวัติการเคลื่อนไหวพัสดุคลัง (Stock Movement Ledger)',
    headers,
    rows,
    colWidths: ['12%', '14%', '20%', '15%', '11%', '18%', '10%'],
    totals: [
      { label: 'จำนวนรายการเคลื่อนไหวทั้งหมด:', value: `${rowsData.length} รายการ` }
    ],
    count: rowsData.length
  };
};

const MOVEMENT_TYPE_TH = {
  LOAD: 'รับเข้าชุดช่าง',
  INSTALL: 'ติดตั้งหน้างาน',
  RETURN: 'คืนคลัง',
  ADJUST: 'ปรับปรุงยอด'
};

// อะไหล่ในมือช่าง — technician van/trunk kit ledger (LOAD / INSTALL / RETURN).
const buildTechnicianStockReport = async ({ startDate, endDate }) => {
  const { clause, params } = buildDateFilter(startDate, endDate, 'm.created_at');
  const rowsData = await queryAll(`
    SELECT m.movement_no, m.movement_type, m.quantity, m.created_at, m.performed_by, m.note,
           t.full_name AS technician_name,
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
    WHERE ${clause}
    ORDER BY m.created_at DESC, m.id DESC
  `, params);

  const headers = ['วันที่', 'เลขที่เอกสาร', 'ประเภทรายการ', 'ช่าง', 'พัสดุ/อุปกรณ์', 'S/N', 'จำนวน', 'สถานที่ติดตั้ง', 'ผู้ทำรายการ'];
  const rows = rowsData.map(m => {
    const qty = Number(m.quantity);
    return [
      formatThaiDate(m.created_at),
      dash(m.movement_no),
      MOVEMENT_TYPE_TH[m.movement_type] || dash(m.movement_type),
      dash(m.technician_name),
      `${dash(m.product_name)}${m.product_model ? ` (${m.product_model})` : ''}`,
      dash(m.serial_number),
      `${qty > 0 ? `+${qty}` : qty} ชิ้น`,
      m.movement_type === 'INSTALL' ? stationLabel(m) : '-',
      dash(m.performed_by)
    ];
  });

  return {
    title: 'รายงานการเคลื่อนไหวอะไหล่ในมือช่าง (Technician Kit Ledger)',
    headers,
    rows,
    colWidths: ['9%', '12%', '13%', '12%', '17%', '10%', '8%', '11%', '8%'],
    totals: [{ label: 'จำนวนรายการเคลื่อนไหวทั้งหมด:', value: `${rowsData.length} รายการ` }],
    count: rowsData.length
  };
};

// ของยืม/เบิกค้างคืน — snapshot of everything not yet returned (ignores date range).
const buildPendingReturnsReport = async () => {
  const rowsData = await queryAll(`
    SELECT * FROM transactions_view
    WHERE (status IS NULL OR status != 'RETURNED')
      AND (
        transaction_type = 'BORROW'
        OR (transaction_type = 'WITHDRAW' AND withdrawal_type IN ('ทดสอบ', 'สำรองใช้งาน'))
      )
    ORDER BY return_due_date ASC NULLS LAST, created_at ASC
  `);

  const now = Date.now();
  const headers = ['ผู้ยืม/ผู้เบิก', 'พัสดุ/อุปกรณ์', 'รุ่น (Model)', 'S/N', 'ประเภท', 'วันที่นำออก', 'กำหนดคืน', 'ค้างมาแล้ว', 'สถานะ'];
  let overdueCount = 0;
  const rows = rowsData.map(t => {
    const outMs = t.created_at ? new Date(t.created_at).getTime() : now;
    const daysOut = Math.max(0, Math.floor((now - outMs) / 86400000));
    const dueMs = t.return_due_date ? new Date(t.return_due_date).getTime() : null;
    const isOverdue = dueMs !== null && now > dueMs;
    if (isOverdue) overdueCount++;
    const typeLabel = t.withdrawal_type || TRANSACTION_TYPE_TH[t.transaction_type] || dash(t.transaction_type);
    return [
      dash(t.user_name),
      dash(t.product_name),
      dash(t.product_model),
      dash(t.serial_number),
      typeLabel,
      formatThaiDate(t.created_at),
      t.return_due_date ? formatThaiDate(t.return_due_date) : 'ไม่กำหนด',
      `${daysOut} วัน`,
      isOverdue ? 'เกินกำหนด' : 'ยังไม่ถึงกำหนด'
    ];
  });

  return {
    title: 'รายงานพัสดุยืม/เบิกค้างคืน (Outstanding Returns)',
    headers,
    rows,
    colWidths: ['13%', '17%', '13%', '11%', '11%', '9%', '9%', '8%', '9%'],
    totals: [
      { label: 'จำนวนรายการค้างคืนทั้งหมด:', value: `${rowsData.length} รายการ` },
      { label: 'เกินกำหนดคืนแล้ว:', value: `${overdueCount} รายการ` }
    ],
    count: rowsData.length
  };
};

// ภาระงานช่าง — repair workload aggregated per technician.
const buildTechnicianWorkloadReport = async ({ startDate, endDate }) => {
  const { clause, params } = buildDateFilter(startDate, endDate);
  const rowsData = await queryAll(`
    SELECT technician,
           COUNT(*) AS total,
           SUM(CASE WHEN TRIM(status) = 'เสร็จสิ้น' THEN 1 ELSE 0 END) AS completed,
           SUM(CASE WHEN TRIM(status) = 'รออะไหล่' THEN 1 ELSE 0 END) AS on_hold,
           SUM(CASE WHEN TRIM(status) NOT IN ('เสร็จสิ้น') THEN 1 ELSE 0 END) AS active
    FROM repairs
    WHERE technician IS NOT NULL AND TRIM(technician) != '' AND ${clause}
    GROUP BY technician
    ORDER BY total DESC
  `, params);

  const headers = ['ช่างผู้รับผิดชอบ', 'งานทั้งหมด', 'เสร็จสิ้น', 'กำลังดำเนินการ', 'รออะไหล่', 'อัตรางานสำเร็จ'];
  let grandTotal = 0;
  let grandCompleted = 0;
  const rows = rowsData.map(r => {
    const total = Number(r.total);
    const completed = Number(r.completed);
    grandTotal += total;
    grandCompleted += completed;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return [
      dash(r.technician),
      `${total} งาน`,
      `${completed} งาน`,
      `${Number(r.active)} งาน`,
      `${Number(r.on_hold)} งาน`,
      `${rate}%`
    ];
  });

  const overallRate = grandTotal > 0 ? Math.round((grandCompleted / grandTotal) * 100) : 0;
  return {
    title: 'รายงานสรุปภาระงานช่างซ่อม (Technician Workload)',
    headers,
    rows,
    colWidths: ['25%', '15%', '15%', '15%', '15%', '15%'],
    totals: [
      { label: 'จำนวนช่างที่มีงาน:', value: `${rowsData.length} คน` },
      { label: 'งานซ่อมรวม:', value: `${grandTotal} งาน` },
      { label: 'อัตรางานสำเร็จเฉลี่ย:', value: `${overallRate}%` }
    ],
    count: rowsData.length
  };
};

const STOCK_COUNT_STATUS_TH = {
  IN_PROGRESS: 'กำลังตรวจนับ',
  COMPLETED: 'เสร็จสิ้น',
  CANCELLED: 'ยกเลิก'
};

// การตรวจนับสต็อก — one row per counting round, with variance summary.
const buildStockCountReport = async ({ startDate, endDate }) => {
  const { clause, params } = buildDateFilter(startDate, endDate, 'sc.created_at');
  const rowsData = await queryAll(`
    SELECT sc.count_no, sc.status, sc.created_at, sc.completed_at, sc.created_by,
           COUNT(sci.id)::int AS total_items,
           COUNT(sci.counted_qty)::int AS counted_items,
           COUNT(CASE WHEN sci.counted_qty IS NOT NULL AND sci.counted_qty <> sci.expected_qty THEN 1 END)::int AS variance_items
    FROM stock_counts sc
    LEFT JOIN stock_count_items sci ON sci.count_id = sc.id
    WHERE ${clause}
    GROUP BY sc.id
    ORDER BY sc.created_at DESC, sc.id DESC
  `, params);

  const headers = ['เลขที่รอบตรวจนับ', 'วันที่เปิดรอบ', 'วันที่ปิดรอบ', 'สถานะ', 'รายการทั้งหมด', 'นับแล้ว', 'พบผลต่าง', 'ผู้ดำเนินการ'];
  const rows = rowsData.map(sc => [
    dash(sc.count_no),
    formatThaiDate(sc.created_at),
    sc.completed_at ? formatThaiDate(sc.completed_at) : '-',
    STOCK_COUNT_STATUS_TH[sc.status] || dash(sc.status),
    `${sc.total_items} รายการ`,
    `${sc.counted_items} รายการ`,
    `${sc.variance_items} รายการ`,
    dash(sc.created_by)
  ]);

  const totalVariance = rowsData.reduce((sum, sc) => sum + Number(sc.variance_items), 0);
  return {
    title: 'รายงานสรุปการตรวจนับสต็อก (Stock Count Summary)',
    headers,
    rows,
    colWidths: ['15%', '12%', '12%', '13%', '13%', '11%', '11%', '13%'],
    totals: [
      { label: 'จำนวนรอบตรวจนับทั้งหมด:', value: `${rowsData.length} รอบ` },
      { label: 'รายการที่พบผลต่างสะสม:', value: `${totalVariance} รายการ` }
    ],
    count: rowsData.length
  };
};

// วงจรชีวิตสินทรัพย์ — snapshot of serialized units currently deployed at stations.
const buildAssetLifecycleReport = async () => {
  const rowsData = await queryAll(`
    SELECT ii.serial_number, COALESCE(ii.withdrawal_date, ii.created_at::date) AS installed_at,
           i.name AS device_name, i.model,
           st.name AS station_name, st.code AS station_code,
           ii.project_name_snapshot,
           COALESCE(ii.contract_no_snapshot, c.contract_no) AS contract_no,
           COALESCE(ii.contract_year_snapshot, c.year_be) AS contract_year,
           (SELECT COUNT(*) FROM repairs r WHERE r.instance_id = ii.id) AS repair_count
    FROM inventory_instances ii
    JOIN inventory i ON ii.inventory_id = i.id
    LEFT JOIN stations st ON ii.station_id = st.id
    LEFT JOIN contracts c ON ii.contract_id = c.id
    WHERE ii.status = 'Withdrawn' AND ii.station_id IS NOT NULL
    ORDER BY ii.created_at DESC
  `);

  const now = Date.now();
  const headers = ['S/N', 'อุปกรณ์', 'รุ่น (Model)', 'สถานีติดตั้ง', 'วันที่เบิกลงสถานี', 'โครงการ', 'สัญญา / ปี', 'อายุใช้งาน', 'จำนวนครั้งที่ซ่อม'];
  const rows = rowsData.map(a => {
    const inst = a.installed_at ? new Date(a.installed_at) : null;
    const months = inst ? Math.max(0, Math.floor((now - inst.getTime()) / (30.44 * 86400000))) : 0;
    return [
      dash(a.serial_number),
      dash(a.device_name),
      dash(a.model),
      `${a.station_code ? `[${a.station_code}] ` : ''}${dash(a.station_name)}`,
      formatThaiDate(a.installed_at),
      dash(a.project_name_snapshot),
      a.contract_no ? `${a.contract_no} (ปี ${a.contract_year || '-'})` : '-',
      ageLabel(months),
      `${Number(a.repair_count)} ครั้ง`
    ];
  });

  return {
    title: 'รายงานวงจรชีวิตสินทรัพย์ติดตั้ง (Asset Lifecycle)',
    headers,
    rows,
    colWidths: ['11%', '14%', '11%', '15%', '11%', '14%', '13%', '8%', '8%'],
    totals: [{ label: 'จำนวนสินทรัพย์ที่ติดตั้งใช้งาน:', value: `${rowsData.length} หน่วย` }],
    count: rowsData.length
  };
};

const AUDIT_ACTION_TH = {
  create: 'สร้าง',
  update: 'แก้ไข',
  delete: 'ลบ'
};

// บันทึกการใช้งานระบบ — audit trail of entity changes.
const buildAuditLogReport = async ({ startDate, endDate }) => {
  const { clause, params } = buildDateFilter(startDate, endDate);
  const rowsData = await queryAll(`
    SELECT created_at, user_name, entity_type, entity_id, action
    FROM audit_logs
    WHERE ${clause}
    ORDER BY created_at DESC, id DESC
  `, params);

  const headers = ['วันเวลา', 'ผู้ใช้งาน', 'ประเภทข้อมูล', 'การกระทำ', 'รหัสอ้างอิง'];
  const rows = rowsData.map(l => [
    formatThaiDateTime(l.created_at),
    dash(l.user_name),
    dash(l.entity_type),
    AUDIT_ACTION_TH[l.action] || dash(l.action),
    `#${dash(l.entity_id)}`
  ]);

  return {
    title: 'รายงานบันทึกการใช้งานระบบ (System Audit Log)',
    headers,
    rows,
    colWidths: ['20%', '20%', '22%', '20%', '18%'],
    totals: [{ label: 'จำนวนบันทึกกิจกรรมทั้งหมด:', value: `${rowsData.length} รายการ` }],
    count: rowsData.length
  };
};

// สรุปพัสดุคงคลัง — snapshot of every inventory item (ignores date range).
const buildInventorySummaryReport = async () => {
  const rowsData = await queryAll(`
    SELECT id, name, model, quantity, min_stock, requires_sn, updated_at
    FROM inventory
    ORDER BY name ASC, id ASC
  `);

  const headers = ['รหัส', 'ชื่อพัสดุ', 'รุ่น (Model)', 'คงเหลือในคลัง', 'เกณฑ์ขั้นต่ำ', 'สถานะสต็อก', 'อัปเดตล่าสุด'];
  const rows = rowsData.map(i => {
    const qty = Number(i.quantity);
    const min = Number(i.min_stock);
    // These exact status strings drive the red/orange cell coloring in the print template.
    const status = qty === 0 ? 'สินค้าหมด' : qty < min ? 'สต็อกต่ำกว่าเกณฑ์' : 'ปกติ';
    return [
      i.id,
      dash(i.name),
      dash(i.model),
      `${qty} ชิ้น`,
      `${min} ชิ้น`,
      status,
      formatThaiDate(i.updated_at)
    ];
  });

  return {
    title: 'รายงานสรุปพัสดุคงคลังทั้งหมด (Inventory Balance)',
    headers,
    rows,
    colWidths: ['8%', '25%', '19%', '13%', '13%', '13%', '9%'],
    totals: [{ label: 'จำนวนรายการพัสดุรวม:', value: `${rowsData.length} รายการ` }],
    count: rowsData.length
  };
};

// พัสดุสต็อกต่ำ — items below their min_stock threshold (snapshot).
const buildLowStockReport = async () => {
  const rowsData = await queryAll(`
    SELECT id, name, model, quantity, min_stock
    FROM inventory
    WHERE quantity < min_stock
    ORDER BY (min_stock - quantity) DESC, name ASC
  `);

  const headers = ['รหัส', 'ชื่อพัสดุอะไหล่', 'รุ่น (Model)', 'คงคลังปัจจุบัน', 'เกณฑ์ขั้นต่ำ', 'แนะนำสั่งซื้อเพิ่ม'];
  const rows = rowsData.map(i => {
    const qty = Number(i.quantity);
    const min = Number(i.min_stock);
    return [
      i.id,
      dash(i.name),
      dash(i.model),
      `${qty} ชิ้น`,
      `${min} ชิ้น`,
      `${min - qty} ชิ้น`
    ];
  });

  return {
    title: 'รายงานรายการพัสดุสต็อกต่ำที่จำเป็นต้องสั่งซื้อ (Low Stock Reorder)',
    headers,
    rows,
    colWidths: ['10%', '25%', '20%', '15%', '15%', '15%'],
    totals: [{ label: 'จำนวนรายการพัสดุที่วิกฤต:', value: `${rowsData.length} รายการ` }],
    count: rowsData.length
  };
};

// ประวัติเบิกจ่าย — withdrawals with an items summary (date-aware).
const buildWithdrawalsReport = async ({ startDate, endDate }) => {
  const { clause, params } = buildDateFilter(startDate, endDate, 'w.created_at');
  const rowsData = await queryAll(`
    SELECT w.*,
      (SELECT STRING_AGG(i.name || ' x' || wi.quantity, ', ')
       FROM withdrawal_items wi
       JOIN inventory i ON wi.inventory_id = i.id
       WHERE wi.withdrawal_id = w.id) AS items_summary
    FROM withdrawals_view w
    WHERE ${clause}
    ORDER BY w.created_at DESC, w.id DESC
  `, params);

  const headers = ['รหัสเบิก', 'ผู้รับ/ผู้เบิก', 'ประเภทเบิก', 'โครงการ/สถานที่', 'รายการพัสดุที่เบิก', 'วันที่เบิก'];
  const rows = rowsData.map(w => {
    const place = w.project_name ? `${w.project_name} (${stationLabel(w)})` : stationLabel(w);
    return [
      `#${w.id}`,
      dash(w.recipient),
      dash(w.type),
      place,
      dash(w.items_summary),
      formatThaiDate(w.created_at)
    ];
  });

  return {
    title: 'รายงานสรุปการเบิกจ่ายพัสดุคลัง (Stock Withdrawals)',
    headers,
    rows,
    colWidths: ['8%', '14%', '13%', '28%', '27%', '10%'],
    totals: [{ label: 'จำนวนรายการใบเบิกทั้งหมด:', value: `${rowsData.length} ใบงาน` }],
    count: rowsData.length
  };
};

const PO_STATUS_TH = {
  Draft: 'แบบร่าง',
  Pending: 'สั่งซื้อแล้ว/รอตรวจรับ',
  Approved: 'อนุมัติแล้ว',
  Ordered: 'สั่งซื้อแล้ว',
  Received: 'ตรวจรับเรียบร้อย',
  Cancelled: 'ยกเลิก'
};

// ประวัติจัดสั่งซื้อ — purchase orders with item counts (date-aware).
const buildPurchaseOrdersReport = async ({ startDate, endDate }) => {
  const { clause, params } = buildDateFilter(startDate, endDate, 'po.created_at');
  const rowsData = await queryAll(`
    SELECT po.*,
      (SELECT COUNT(*) FROM purchase_order_items WHERE po_id = po.id) AS item_count
    FROM purchase_orders po
    WHERE ${clause}
    ORDER BY po.created_at DESC, po.id DESC
  `, params);

  const headers = ['เลขที่ใบสั่งซื้อ', 'ออกโดย', 'จำนวนสินค้า', 'สถานะจัดซื้อ', 'ปรับปรุงล่าสุด', 'หมายเหตุ'];
  const rows = rowsData.map(po => [
    dash(po.po_no),
    po.created_by === 'System' ? 'ระบบอัตโนมัติ' : 'เจ้าหน้าที่คลัง',
    `${Number(po.item_count)} รายการ`,
    PO_STATUS_TH[po.status] || dash(po.status),
    formatThaiDate(po.updated_at),
    dash(po.note)
  ]);

  return {
    title: 'รายงานสรุปประวัติจัดสั่งซื้อสินค้าคลัง (Purchase Orders)',
    headers,
    rows,
    colWidths: ['16%', '15%', '12%', '18%', '12%', '27%'],
    totals: [{ label: 'จำนวนใบสั่งซื้อรวม:', value: `${rowsData.length} ฉบับ` }],
    count: rowsData.length
  };
};

const BUILDERS = {
  inventory_summary: buildInventorySummaryReport,
  low_stock: buildLowStockReport,
  withdrawals: buildWithdrawalsReport,
  purchase_orders: buildPurchaseOrdersReport,
  repairs: (opts) => buildRepairsReport(opts, 'repairs'),
  claims: (opts) => buildRepairsReport(opts, 'claims'),
  transactions: buildTransactionsReport,
  technician_stock: buildTechnicianStockReport,
  pending_returns: buildPendingReturnsReport,
  technician_workload: buildTechnicianWorkloadReport,
  stock_count: buildStockCountReport,
  asset_lifecycle: buildAssetLifecycleReport,
  audit_log: buildAuditLogReport
};

// GET /api/reports/:type?startDate=&endDate=
exports.generateReport = async (req, res) => {
  const { type } = req.params;
  const { startDate, endDate } = req.query;

  const builder = BUILDERS[type];
  if (!builder) {
    return res.status(400).json({ error: `ไม่รู้จักประเภทรายงาน: ${type}` });
  }

  try {
    const payload = await builder({ startDate, endDate });
    res.json({ ...payload, periodLabel: buildPeriodLabel(startDate, endDate) });
  } catch (err) {
    console.error('Report generation error:', err);
    res.status(500).json({ error: err.message });
  }
};

// GET /api/reports/summary/counts?startDate=&endDate=
// Returns { [type]: count } for every report — powers the live "found N rows"
// preview on the cards. Snapshot reports ignore the dates by design.
exports.getReportCounts = async (req, res) => {
  const { startDate, endDate } = req.query;
  try {
    const entries = await Promise.all(
      Object.entries(BUILDERS).map(async ([type, builder]) => {
        try {
          const payload = await builder({ startDate, endDate });
          return [type, payload.count];
        } catch (err) {
          console.error(`Report count error (${type}):`, err.message);
          return [type, null];
        }
      })
    );
    res.json(Object.fromEntries(entries));
  } catch (err) {
    console.error('Report counts error:', err);
    res.status(500).json({ error: err.message });
  }
};
