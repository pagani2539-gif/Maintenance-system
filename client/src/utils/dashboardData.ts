import type { DashboardData } from '../types';

type DashboardRecord = Record<string, unknown>;

const asRecord = (value: unknown): DashboardRecord => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as DashboardRecord
    : {}
);

const toSnakeKey = (key: string) => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

const mapKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(mapKeys);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [toSnakeKey(key), mapKeys(item)])
  );
};

const firstArray = (source: DashboardRecord, key: string): unknown[] => (
  Array.isArray(source[key]) ? source[key] : []
);

const numberValue = (source: DashboardRecord, key: string) => {
  const value = source[key];
  if (value === null || value === undefined || value === '') return 0;

  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const stringValue = (source: DashboardRecord, key: string, fallback = '') => {
  const value = source[key];
  return value === null || value === undefined ? fallback : String(value);
};

const recordArray = (source: DashboardRecord, key: string) => (
  firstArray(source, key).map(asRecord)
);

const typedRecordArray = <T,>(source: DashboardRecord, key: string): T[] => (
  recordArray(source, key) as unknown as T[]
);

const createEmptyDashboard = (): DashboardData => ({
  kpis: {
    total: 0,
    pending: 0,
    in_progress: 0,
    completed: 0,
    critical_stock: 0
  },
  recentJobs: [],
  recentLogs: [],
  technicians: [],
  inventory: {
    topUsed: [],
    leastUsed: [],
    criticalItems: [],
    recentTransactions: [],
    recentWithdrawals: []
  },
  analysis: {
    mostBroken: [],
    overdue: [],
    monthlyTrend: []
  },
  withdrawalBreakdown: [],
  stockMovements: [],
  people: {
    topRecipients: [],
    pendingReturns: [],
    pendingReturnsCount: 0
  },
  purchaseOrders: {
    total_po: 0,
    pending_po: 0,
    received_po: 0
  },
  supervisors: [],
  unassignedStationsCount: 0,
  claimsKpis: {
    total: 0,
    pending: 0,
    in_progress: 0,
    completed: 0
  },
  inventoryConditions: []
});

const normalizeKpis = (source: DashboardRecord): DashboardData['kpis'] => ({
  total: numberValue(source, 'total'),
  pending: numberValue(source, 'pending'),
  in_progress: numberValue(source, 'in_progress'),
  completed: numberValue(source, 'completed'),
  critical_stock: numberValue(source, 'critical_stock')
});

const normalizeInventory = (source: DashboardRecord): DashboardData['inventory'] => ({
  topUsed: recordArray(source, 'top_used').map(item => ({
    ...item,
    name: stringValue(item, 'name'),
    count: numberValue(item, 'count')
  })),
  leastUsed: recordArray(source, 'least_used').map(item => ({
    ...item,
    name: stringValue(item, 'name'),
    days_idle: item.days_idle === null || item.days_idle === undefined
      ? null
      : numberValue(item, 'days_idle')
  })),
  criticalItems: recordArray(source, 'critical_items').map(item => ({
    ...item,
    name: stringValue(item, 'name'),
    quantity: numberValue(item, 'quantity'),
    min_stock: numberValue(item, 'min_stock')
  })),
  recentTransactions: recordArray(source, 'recent_transactions').map(item => ({
    ...item,
    product_name: stringValue(item, 'product_name'),
    transaction_type: stringValue(item, 'transaction_type')
  })) as DashboardData['inventory']['recentTransactions'],
  recentWithdrawals: typedRecordArray<DashboardData['inventory']['recentWithdrawals'][number]>(source, 'recent_withdrawals')
});

const normalizeAnalysis = (source: DashboardRecord): DashboardData['analysis'] => ({
  mostBroken: recordArray(source, 'most_broken').map(item => ({
    ...item,
    name: stringValue(item, 'name'),
    count: numberValue(item, 'count')
  })),
  overdue: recordArray(source, 'overdue').map(item => ({
    ...item,
    ticket_no: stringValue(item, 'ticket_no'),
    device_name: stringValue(item, 'device_name'),
    reporter: stringValue(item, 'reporter'),
    created_at: stringValue(item, 'created_at'),
    days_over: numberValue(item, 'days_over')
  })),
  monthlyTrend: recordArray(source, 'monthly_trend').map(item => ({
    ...item,
    month: stringValue(item, 'month'),
    count: numberValue(item, 'count')
  }))
});

const normalizePeople = (source: DashboardRecord): NonNullable<DashboardData['people']> => ({
  topRecipients: recordArray(source, 'top_recipients').map(item => ({
    ...item,
    name: stringValue(item, 'name'),
    count: numberValue(item, 'count'),
    items: numberValue(item, 'items'),
    last_withdrawal: stringValue(item, 'last_withdrawal')
  })),
  pendingReturns: recordArray(source, 'pending_returns').map(item => ({
    ...item,
    name: stringValue(item, 'name'),
    product_name: stringValue(item, 'product_name'),
    transaction_type: stringValue(item, 'transaction_type'),
    days_out: numberValue(item, 'days_out')
  })),
  pendingReturnsCount: numberValue(source, 'pending_returns_count')
});

const normalizePurchaseOrders = (source: DashboardRecord): NonNullable<DashboardData['purchaseOrders']> => ({
  total_po: numberValue(source, 'total_po'),
  pending_po: numberValue(source, 'pending_po'),
  received_po: numberValue(source, 'received_po')
});

const normalizeClaimsKpis = (source: DashboardRecord): NonNullable<DashboardData['claimsKpis']> => ({
  total: numberValue(source, 'total'),
  pending: numberValue(source, 'pending'),
  in_progress: numberValue(source, 'in_progress'),
  completed: numberValue(source, 'completed')
});

/**
 * Convert either the v2 camelCase payload or the legacy snake_case payload to
 * the single shape consumed by Dashboard and its child components.
 *
 * The API interceptor currently converts v2 envelopes to snake_case for the
 * rest of the client. Keeping this normalization at the API boundary makes
 * that compatibility detail invisible to pages and prevents undefined arrays
 * from reaching render-time reduce/map calls.
 */
export const normalizeDashboardData = (payload: unknown): DashboardData => {
  const root = asRecord(mapKeys(payload));
  const inventory = asRecord(root.inventory);
  const analysis = asRecord(root.analysis);
  const people = asRecord(root.people);
  const purchaseOrders = asRecord(root.purchase_orders);
  const claimsKpis = asRecord(root.claims_kpis);
  const dashboard = createEmptyDashboard();

  return {
    ...dashboard,
    kpis: normalizeKpis(asRecord(root.kpis)),
    recentJobs: typedRecordArray<DashboardData['recentJobs'][number]>(root, 'recent_jobs'),
    recentLogs: typedRecordArray<DashboardData['recentLogs'][number]>(root, 'recent_logs'),
    technicians: recordArray(root, 'technicians').map(item => ({
      ...item,
      name: stringValue(item, 'name'),
      completed: numberValue(item, 'completed'),
      active: numberValue(item, 'active'),
      total: numberValue(item, 'total')
    })),
    inventory: normalizeInventory(inventory),
    analysis: normalizeAnalysis(analysis),
    withdrawalBreakdown: recordArray(root, 'withdrawal_breakdown').map(item => ({
      ...item,
      name: stringValue(item, 'name'),
      count: numberValue(item, 'count')
    })),
    stockMovements: recordArray(root, 'stock_movements').map(item => ({
      ...item,
      month: stringValue(item, 'month'),
      added: numberValue(item, 'added'),
      withdrawn: numberValue(item, 'withdrawn'),
      borrowed: numberValue(item, 'borrowed'),
      returned: numberValue(item, 'returned')
    })),
    people: normalizePeople(people),
    purchaseOrders: normalizePurchaseOrders(purchaseOrders),
    supervisors: recordArray(root, 'supervisors').map(item => ({
      ...item,
      name: stringValue(item, 'name'),
      station_count: numberValue(item, 'station_count'),
      total_repairs: numberValue(item, 'total_repairs'),
      active_repairs: numberValue(item, 'active_repairs'),
      stations_list: stringValue(item, 'stations_list')
    })),
    unassignedStationsCount: numberValue(root, 'unassigned_stations_count'),
    claimsKpis: normalizeClaimsKpis(claimsKpis),
    inventoryConditions: recordArray(root, 'inventory_conditions').map(item => ({
      ...item,
      condition: stringValue(item, 'condition'),
      count: numberValue(item, 'count')
    }))
  };
};
