export interface Repair {
  id: number;
  ticket_no: string;
  reporter: string;
  location: string;
  station_id?: number;
  station_area_id?: number;
  station_name?: string;
  station_code?: string;
  station_area_name?: string;
  station_province?: string;
  station_region?: string;
  location_snapshot?: string;
  device_name: string;
  problem: string;
  priority: 'ปกติ' | 'ด่วน' | 'ด่วนมาก' | 'วิกฤต';
  status: 'รอดำเนินการ' | 'กำลังซ่อม' | 'รออะไหล่' | 'เสร็จสิ้น';
  technician?: string;
  repair_note?: string;
  received_at: string;
  created_at: string;
  updated_at: string;
  is_read: number;
  project_name?: string;
  type?: 'repair' | 'claim';
  instance_id?: number;
  inventory_id?: number;
}

export interface RepairLog {
  id: number;
  repair_id: number;
  action: string;
  user: string;
  note: string;
  created_at: string;
}

export interface DeviceChange {
  id: number;
  repair_id: number;
  old_serial: string;
  old_model: string;
  new_serial: string;
  new_model: string;
  changed_by: string;
  changed_at: string;
}

export interface RepairImage {
  id: number;
  repair_id: number;
  file_path: string;
  image_type: string;
  uploaded_at: string;
}

export interface RepairDetail extends Repair {
  logs: RepairLog[];
  images: RepairImage[];
  devices: DeviceChange[];
}

export interface RepairStats {
  total: number;
  pending: number;
  in_progress: number;
  on_hold: number;
  completed: number;
}

export interface RepairStatsResponse {
  repair: RepairStats;
  claim: RepairStats;
}

export interface InventoryItem {
  id: number;
  name: string;
  model?: string;
  description?: string;
  quantity: number;
  min_stock: number;
  requires_sn: number;
  image_path?: string;
  storage_location?: string;
  created_at: string;
  updated_at: string;
}

export interface WithdrawalItem {
  id: number;
  withdrawal_id: number;
  inventory_id: number;
  quantity: number;
  item_name: string;
  item_model?: string;
  item_description?: string;
  item_image?: string;
  serial_numbers?: string;
  requires_sn?: number;
}

export interface Withdrawal {
  id: number;
  recipient: string;
  project_name?: string;
  location?: string;
  station_id?: number;
  station_area_id?: number;
  station_name?: string;
  station_code?: string;
  station_area_name?: string;
  station_province?: string;
  station_region?: string;
  location_snapshot?: string;
  type: string;
  note?: string;
  return_due_date?: string;
  contract_id?: number;
  contract_no?: string;
  contract_name?: string;
  contract_year?: number;
  created_at: string;
  items_summary?: string;
  items_missing_sn?: number;
  items: WithdrawalItem[];
}

export interface Contract {
  id: number;
  contract_no: string;
  name: string;
  year_be: number;
  company_id?: number;
  company_name?: string;
  start_date?: string;
  end_date?: string;
  note?: string;
  status: number;
  created_at?: string;
  updated_at?: string;
}

export interface InventoryStats {
  total_items: number;
  out_of_stock: number; // quantity = 0
  critical: number;     // 0 < quantity <= min_stock (วิกฤต)
  warning: number;      // min_stock < quantity <= min_stock * 2 (ใกล้หมด)
  optimal: number;      // quantity > min_stock * 2 (พร้อมใช้งาน)
}

export interface DashboardData {
  kpis: {
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
    critical_stock: number;
  };
  recentJobs: Repair[];
  recentLogs: (RepairLog & { ticket_no: string; device_name: string })[];
  technicians: { name: string; completed: number; active: number; total: number }[];
  inventory: {
    topUsed: { name: string; count: number }[];
    leastUsed: { name: string; days_idle: number | null }[];
    criticalItems: { name: string; quantity: number; min_stock: number }[];
    recentTransactions: (InventoryTransaction & { product_name: string })[];
    recentWithdrawals: Withdrawal[];
  };
  analysis: {
    mostBroken: { name: string; count: number }[];
    overdue: { id?: number; ticket_no: string; device_name: string; reporter: string; created_at: string; days_over: number }[];
    monthlyTrend: { month: string; count: number }[];
  };
  withdrawalBreakdown: { name: string; count: number }[];
  stockMovements: { month: string; added: number; withdrawn: number; borrowed: number; returned: number }[];
  people?: {
    topRecipients: { name: string; count: number; items: number; last_withdrawal: string }[];
    pendingReturns: { name: string; product_name: string; serial_number?: string; transaction_type: string; withdrawal_type?: string; days_out: number }[];
    pendingReturnsCount: number;
  };
  purchaseOrders?: {
    total_po: number;
    pending_po: number;
    received_po: number;
  };
  supervisors?: {
    name: string;
    station_count: number;
    stations_list: string;
    total_repairs: number;
    active_repairs: number;
  }[];
  unassignedStationsCount?: number;
  claimsKpis?: {
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
  };
  inventoryConditions?: {
    condition: string;
    count: number;
  }[];
}

export interface GlobalSearchResults {
  inventory: InventoryItem[];
  repairs: Repair[];
  claims: Repair[];
}

export interface InventoryInstance {
  id: number;
  inventory_id: number;
  serial_number?: string;
  condition: 'New' | 'Good' | 'Fair' | 'Broken';
  status: 'In Stock' | 'Withdrawn' | 'Under Repair' | 'Claiming' | 'Damaged';
  current_location?: string;
  station_id?: number;
  created_at: string;
}

export interface InventoryTransaction {
  id: number;
  inventory_id: number;
  instance_id?: number;
  transaction_type: 'ADD_STOCK' | 'WITHDRAW' | 'BORROW' | 'RETURN';
  quantity_added: number;
  quantity_withdrawn: number;
  quantity_borrowed: number;
  quantity_returned: number;
  project_name?: string;
  location?: string;
  location_snapshot?: string;
  station_id?: number;
  station_name?: string;
  station_code?: string;
  station_province?: string;
  station_area_name?: string;
  user_name?: string;
  note?: string;
  created_at: string;
  product_name: string;
  product_model?: string;
  serial_number?: string;
  condition?: string;
  withdrawal_type?: string;
  withdrawal_id?: number;
  status?: string;
  return_image?: string;
  return_due_date?: string;
  contract_id?: number;
  contract_no?: string;
  contract_name?: string;
  contract_year?: number;
}

export interface PurchaseOrderItem {
  id?: number;
  po_id?: number;
  inventory_id: number;
  quantity: number;
  received_quantity?: number;
  item_name?: string;
  item_model?: string;
  current_stock?: number;
  min_stock?: number;
}

export interface PurchaseOrder {
  id: number;
  po_no: string;
  status: 'Draft' | 'Pending' | 'Approved' | 'Ordered' | 'Received' | 'Cancelled';
  created_by: string;
  note?: string;
  ordered_by?: string;
  project_name?: string;
  company_name?: string;
  vendor_address?: string;
  vendor_phone?: string;
  vendor_contact_person?: string;
  vendor_tax_id?: string;
  buyer_department?: string;
  buyer_phone?: string;
  buyer_email?: string;
  created_at: string;
  updated_at: string;
  approved_by?: string;
  approved_at?: string;
  item_count?: number;
  items?: PurchaseOrderItem[];
}

export interface VendorContact {
  company_name: string;
  vendor_address?: string;
  vendor_phone?: string;
  vendor_contact_person?: string;
  vendor_tax_id?: string;
}

export interface Station {
  id: number;
  code: string;
  name: string;
  station_type: string;
  highway_no: string;
  km_post?: string;
  direction: 'INBOUND' | 'OUTBOUND' | 'BOTH' | 'NONE';
  region: string;
  province: string;
  responsible_person?: string; // ชื่อผู้รับผิดชอบสถานี — optional ในเลเยอร์ type เพราะสถานีเก่าอาจไม่มี
  status: number;
  created_at?: string;
  updated_at?: string;
}

export interface StationArea {
  id: number;
  station_id: number;
  name: string;
  status: number;
}

export interface StationStats {
  repair_total: number;
  claim_total: number;
  pending: number;
  in_progress: number;
  on_hold: number;
  completed: number;
  withdrawal_total: number;
}

export interface AssetManualStatus {
  inventory_id: number;
  status: string;
  note?: string;
  updated_by?: string;
  updated_at?: string;
}

export interface StationDetailResponse {
  station: Station;
  stats: StationStats;
  repairs: Repair[];
  claims: Repair[];
  withdrawals: Withdrawal[];
  transactions: InventoryTransaction[];
  asset_statuses?: AssetManualStatus[];
  instances?: Array<{
    id: number;
    inventory_id: number;
    serial_number: string;
    condition: string;
    status: string;
    updated_at?: string;
  }>;
}

export interface Company {
  id: number;
  name_th: string;
  name_en: string;
  name_short?: string;
  address: string;
  phone: string;
  email: string;
  tax_id: string;
  website: string;
  is_default: number;
  created_at?: string;
  updated_at?: string;
}

export interface Permissions {
  delete?: {
    repairs?: boolean;
    claims?: boolean;
    withdrawals?: boolean;
    inventory?: boolean;
    purchase_orders?: boolean;
    transactions?: boolean;
    stations?: boolean;
  };
  manage?: {
    settings?: boolean;
    stations?: boolean;
    companies?: boolean;
    users?: boolean;
    stock_counts?: boolean;
  };
}

export interface StockCount {
  id: number;
  count_no: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  note?: string;
  created_by?: string;
  created_at: string;
  completed_by?: string;
  completed_at?: string;
  total_items?: number;
  counted_items?: number;
  variance_items?: number;
}

export interface StockCountItem {
  id: number;
  count_id: number;
  inventory_id: number;
  expected_qty: number;
  counted_qty: number | null;
  note?: string;
  counted_by?: string;
  counted_at?: string;
  name: string;
  model?: string;
  storage_location?: string;
  image_path?: string;
  requires_sn: number;
  current_qty: number;
}

export interface StockCountDetailResponse extends StockCount {
  items: StockCountItem[];
}

export interface StockCountCompleteSummary {
  message: string;
  count_no: string;
  total_items: number;
  counted_items: number;
  uncounted_items: number;
  adjustments: Array<{
    inventory_id: number;
    name: string;
    expected_qty: number;
    counted_qty: number;
    variance: number;
    new_quantity: number;
  }>;
}

export interface User {
  id: number;
  username: string;
  full_name: string;
  is_full: boolean;
  permissions: Permissions;
  force_password_change: boolean;
  is_active: boolean;
  last_login?: string | null;
  created_by?: number | null;
  created_at?: string;
}

export interface CompanyLogo {
  id: number;
  label: string;
  file_path: string;
  is_default: number;
  company_id: number | null;
  uploaded_at?: string;
}

export interface SystemSettings {
  line_token_repair?: string;
  line_token_stock?: string;
  [key: string]: string | undefined;
}


export interface AuditLog {
  id: number;
  entity_type: string;
  entity_id: number;
  action: string;
  old_data?: string | Record<string, unknown> | null;
  new_data?: string | Record<string, unknown> | null;
  user_name: string;
  created_at: string;
}

export interface AssetLifecycleItem {
  instance_id: number;
  serial_number: string;
  status: string;
  current_location: string;
  station_id: number;
  installed_at: string;
  inventory_id: number;
  device_name: string;
  model?: string;
  station_name?: string;
  station_code?: string;
  contract_id?: number;
  contract_no?: string;
  contract_name?: string;
  contract_year?: number;
  repair_count: number;
  age_months: number;
}

export type AssetTimelineEventKind =
  | 'stock_in' | 'withdraw' | 'return' | 'repair' | 'claim' | 'device_swap';

export interface AssetTimelineEvent {
  kind: AssetTimelineEventKind;
  timestamp: string;
  title: string;
  location?: string | null;
  actor?: string | null;
  project?: string | null;
  status?: string | null;
  priority?: string | null;
  note?: string | null;
  quantity?: number;
  ref_type?: 'transaction' | 'repair' | 'claim';
  ref_id?: number | null;
  ticket_no?: string | null;
}

export interface AssetTimelineInstance {
  instance_id: number;
  serial_number?: string;
  condition?: string;
  status?: string;
  current_location?: string;
  station_id?: number;
  created_at: string;
  updated_at?: string;
  inventory_id: number;
  device_name: string;
  model?: string;
  station_name?: string;
  station_code?: string;
  station_province?: string;
  contract_no?: string;
  contract_name?: string;
  contract_year?: number;
  repair_count: number;
}

export interface AssetTimelineResponse {
  instance: AssetTimelineInstance;
  events: AssetTimelineEvent[];
}

// ── Technician spare-stock (คลังอะไหล่ประจำตัวช่าง) ──
export interface Technician {
  id: number;
  user_id?: number | null;
  user_username?: string | null;
  full_name: string;
  code?: string | null;
  phone?: string | null;
  is_active: number;
  item_count?: number;
  created_at?: string;
  updated_at?: string;
}

// Summary row per technician (holdings list without technician_id filter)
export interface TechnicianKitSummary {
  technician_id: number;
  full_name: string;
  code?: string | null;
  phone?: string | null;
  is_active: number;
  item_count: number;
  total_qty: number;
}

export interface TechnicianHolding {
  technician_id: number;
  full_name: string;
  inventory_id: number;
  product_name: string;
  model?: string | null;
  requires_sn: number;
  on_hand_qty: number;
}

export interface TechnicianHeldInstance {
  instance_id: number;
  technician_id: number;
  full_name: string;
  inventory_id: number;
  product_name: string;
  model?: string | null;
  serial_number: string;
  condition?: string | null;
  instance_status: string;
}

export interface TechnicianHoldingsDetail {
  holdings: TechnicianHolding[];
  instances: TechnicianHeldInstance[];
}

export type TechnicianMovementType = 'LOAD' | 'INSTALL' | 'RETURN' | 'ADJUST';

export interface TechnicianStockMovement {
  id: number;
  movement_no: string;
  technician_id: number;
  technician_name: string;
  movement_type: TechnicianMovementType;
  inventory_id: number;
  product_name: string;
  product_model?: string | null;
  instance_id?: number | null;
  serial_number?: string | null;
  quantity: number;
  station_id?: number | null;
  station_name?: string | null;
  station_code?: string | null;
  station_area_id?: number | null;
  station_area_name?: string | null;
  repair_id?: number | null;
  removed_serial?: string | null;
  removed_model?: string | null;
  note?: string | null;
  performed_by?: string | null;
  created_at: string;
}

// Item shape shared by load / install / return request bodies
export interface TechnicianStockItemInput {
  inventory_id: number;
  quantity: number;
  serial_numbers?: string[];
}

