import axios from 'axios';
import type { ApiV2Meta } from './types';
import type { Repair, RepairDetail, RepairStatsResponse, InventoryItem, InventoryAdjustment, InventoryTransaction, Withdrawal, InventoryStats, DashboardApiPayload, GlobalSearchResults, PurchaseOrder, StationDetailResponse, Station, StationArea, VendorContact, Company, CompanyLogo, User, SystemSettings, AuditLog, AssetLifecycleItem, Contract, AssetManualStatus, StockCount, StockCountItem, StockCountDetailResponse, StockCountCompleteSummary, AssetTimelineResponse, Technician, TechnicianKitSummary, TechnicianHoldingsDetail, TechnicianStockMovement, TechnicianStockItemInput } from './types';
import { normalizeDashboardData } from './utils/dashboardData';

const TOKEN_KEY = 'maintenance_auth_token';

export const tokenStorage = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

const configuredApiUrl = String(import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
const devApiOrigin = typeof window !== 'undefined'
  ? `${window.location.protocol}//${window.location.hostname}:5221`
  : 'http://localhost:5221';
const apiV2Url = (value: string) => {
  if (value.endsWith('/api/v2')) return value;
  if (value.endsWith('/api')) return `${value}/v2`;
  return `${value}/api/v2`;
};
const API_URL = configuredApiUrl
  ? apiV2Url(configuredApiUrl)
  : (import.meta.env.DEV ? `${devApiOrigin}/api/v2` : '/api/v2');

export const UPLOAD_URL = configuredApiUrl
  ? configuredApiUrl.replace(/\/api(?:\/v2)?$/, '')
  : (import.meta.env.DEV ? devApiOrigin : window.location.origin);

const toCamelKey = (key: string) => key.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
const toSnakeKey = (key: string) => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
const mapKeys = (value: unknown, mapper: (key: string) => string): unknown => {
  if (Array.isArray(value)) return value.map((item) => mapKeys(item, mapper));
  if (!value || typeof value !== 'object' || value instanceof Date
    || (typeof Blob !== 'undefined' && value instanceof Blob)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [mapper(key), mapKeys(item, mapper)]));
};

const toApiKeys = <T>(value: T): T => mapKeys(value, toCamelKey) as T;
const toClientKeys = <T>(value: T): T => mapKeys(value, toSnakeKey) as T;

const createIdempotencyKey = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `idem_${Date.now()}_${Math.random().toString(36).slice(2)}`;
};

const toV2Multipart = (source: FormData) => {
  const payload: Record<string, unknown> = {};
  const files: Blob[] = [];
  source.forEach((value, key) => {
    if (typeof value === 'string') {
      payload[key] = value;
    } else {
      files.push(value);
    }
  });

  const result = new FormData();
  result.append('payload', JSON.stringify(toApiKeys(payload)));
  files.forEach((file) => result.append('files', file));
  return result;
};

const api = axios.create({
  baseURL: API_URL,
});

type PaginatedResponse<T> = Awaited<ReturnType<typeof api.get<T>>> & { v2Meta?: ApiV2Meta };

const getAllPages = async <T>(resource: string, params?: Record<string, unknown>): Promise<T[]> => {
  const firstResponse = await api.get<T[]>(resource, {
    params: { ...(params || {}), page: 1, pageSize: 100 }
  }) as PaginatedResponse<T[]>;
  const totalPages = firstResponse.v2Meta?.totalPages ?? 1;
  if (totalPages <= 1) return firstResponse.data;

  const remainingResponses = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) => api.get<T[]>(resource, {
      params: { ...(params || {}), page: index + 2, pageSize: 100 }
    }))
  );
  return [firstResponse.data, ...remainingResponses.map(response => response.data)].flat();
};

// Attach JWT to every request when available
api.interceptors.request.use((config) => {
  const token = tokenStorage.get();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (config.params) config.params = toApiKeys(config.params);
  if (config.data instanceof FormData) {
    config.data = toV2Multipart(config.data);
    if (config.headers) delete config.headers['Content-Type'];
  } else if (config.data && typeof config.data === 'object') {
    config.data = toApiKeys(config.data);
  }

  const method = String(config.method || 'get').toUpperCase();
  if (['POST', 'PATCH', 'DELETE'].includes(method) && !config.headers?.['Idempotency-Key']) {
    config.headers = config.headers || {};
    config.headers['Idempotency-Key'] = createIdempotencyKey();
  }
  return config;
});

// On 401, clear token + redirect to /login (skip if already on auth pages)
api.interceptors.response.use(
  (response) => {
    const envelope = response.data;
    if (envelope && typeof envelope === 'object' && !Array.isArray(envelope)
      && Object.prototype.hasOwnProperty.call(envelope, 'data')
      && Object.prototype.hasOwnProperty.call(envelope, 'meta')) {
      (response as typeof response & { v2Meta?: unknown }).v2Meta = envelope.meta;
      response.data = toClientKeys(envelope.data);
    }
    return response;
  },
  (error) => {
    const errorBody = error.response?.data;
    if (errorBody?.error && typeof errorBody.error === 'object') {
      error.response.data = {
        ...errorBody,
        error: errorBody.error.message,
        message: errorBody.error.message,
        errorCode: errorBody.error.code,
        errorDetails: errorBody.error.details,
      };
    }
    if (error.response?.status === 401) {
      tokenStorage.clear();
      const path = window.location.pathname;
      if (path !== '/login' && path !== '/change-password') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const repairApi = {
  getAll: async (params: { status?: string; location?: string; station_id?: number | string; search?: string; type?: string; priority?: string; sortBy?: string; technician?: string; unassigned?: boolean }) => {
    const resource = params?.type === 'claim' ? '/claims' : '/repairs';
    const requestParams = params?.type === 'claim' ? { ...params, type: undefined } : params;
    return getAllPages<Repair>(resource, requestParams || {});
  },
  
  getStats: async () => {
    const response = await api.get<RepairStatsResponse>('/repairs/stats');
    return response.data;
  },
  
  getDashboardStats: async (params?: { startDate?: string; endDate?: string }) => {
    const response = await api.get<DashboardApiPayload>('/repairs/dashboard-stats', { params });
    return normalizeDashboardData(response.data);
  },
  
  getUnreadCount: async () => {
    const response = await api.get<{ repair: number; claim: number; lowStock: number; total: number; count: number; pendingReturns?: number; myTasks?: number }>('/repairs/unread-count');
    return response.data;
  },
  
  getById: async (id: number | string) => {
    const response = await api.get<RepairDetail>(`/repairs/${id}`);
    return response.data;
  },
  
  create: async (formData: FormData) => {
    const response = await api.post<{ id: number; ticket_no: string }>('/repairs', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  createClaim: async (formData: FormData) => {
    const response = await api.post<{ id: number; ticket_no: string }>('/claims', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
  
  updateStatus: async (id: number | string, data: { 
    status: string; 
    user: string; 
    note: string; 
    technician?: string; 
    repair_note?: string 
  }) => {
    const response = await api.post(`/repairs/${id}/actions/status-transition`, data);
    return response.data;
  },

  update: async (id: number | string, data: {
    reporter: string;
    project_name?: string;
    location: string;
    station_id?: number;
    station_area_id?: number;
    device_name: string;
    problem: string;
    priority: string;
  }) => {
    const response = await api.patch(`/repairs/${id}`, data);
    return response.data;
  },
  
  replaceDevice: async (id: number | string, data: {
    old_serial: string;
    old_model: string;
    new_serial: string;
    new_model: string;
    technician: string;
  }) => {
    const response = await api.post(`/repairs/${id}/actions/replace-device`, data);
    return response.data;
  },

  delete: async (id: number | string) => {
    const response = await api.delete(`/repairs/${id}`);
    return response.data;
  },

  updateCompany: async (id: number | string, companyId: number) => {
    const response = await api.patch(`/repairs/${id}`, { companyId });
    return response.data;
  },

  markAsRead: async (id: number | string) => {
    const response = await api.post(`/repairs/${id}/actions/mark-read`);
    return response.data;
  }
};

export const inventoryApi = {
  getAll: async (params?: { search?: string }) => {
    return getAllPages<InventoryItem>('/inventory', params || {});
  },
  getInstances: async (id: number | string) => {
    const response = await api.get<Array<{ id: number; serial_number: string; condition: string }>>(`/inventory/${id}/instances`);
    return response.data;
  },
  getStats: async () => {
    const response = await api.get<InventoryStats>('/inventory/stats');
    return response.data;
  },
  create: async (formData: FormData) => {
    const response = await api.post('/inventory', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  update: async (id: number | string, formData: FormData) => {
    const response = await api.patch(`/inventory/${id}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  addSerialNumbers: async (id: number | string, serialNumbers: string[]) => {
    const response = await api.post(`/inventory/${id}/instances`, {
      serialNumbers
    });
    return response.data;
  },
  importBulk: async (items: Array<{ name: string; model?: string; description?: string; storage_location?: string; quantity?: number; min_stock?: number; requires_sn?: number }>) => {
    const response = await api.post<{ message: string; created: number; updated: number; total: number }>('/inventory/imports', { items });
    return response.data;
  },
  getAdjustments: async (status?: 'PENDING' | 'APPROVED' | 'REJECTED') => {
    const response = await api.get<InventoryAdjustment[]>('/inventory/adjustments', { params: status ? { status } : undefined });
    return response.data;
  },
  createAdjustment: async (id: number | string, data: { operation: 'ADD' | 'REMOVE'; quantity: number; reason: string; note?: string }) => {
    const response = await api.post(`/inventory/${id}/adjustments`, data);
    return response.data;
  },
  approveAdjustment: async (id: number | string, review_note?: string) => {
    const response = await api.post(`/inventory-adjustments/${id}/actions/approve`, { reviewNote: review_note });
    return response.data;
  },
  rejectAdjustment: async (id: number | string, review_note: string) => {
    const response = await api.post(`/inventory-adjustments/${id}/actions/reject`, { reviewNote: review_note });
    return response.data;
  },
  updateInstanceCondition: async (instanceId: number | string, condition: string) => {
    const response = await api.patch(`/inventory/instances/${instanceId}`, { condition });
    return response.data;
  },
  delete: async (id: number | string) => {
    const response = await api.delete(`/inventory/${id}`);
    return response.data;
  },
  getLifecycleReport: async () => {
    return getAllPages<AssetLifecycleItem>('/inventory/reports/lifecycle');
  },
  getInstanceTimeline: async (instanceId: number | string) => {
    const response = await api.get<AssetTimelineResponse>(`/inventory/instances/${instanceId}/timeline`);
    return response.data;
  }
};

export const stockCountApi = {
  getAll: async () => {
    return getAllPages<StockCount>('/stock-counts');
  },
  getById: async (id: number | string) => {
    const response = await api.get<StockCountDetailResponse>(`/stock-counts/${id}`);
    return response.data;
  },
  create: async (data: { note?: string }) => {
    const response = await api.post<StockCount>('/stock-counts', data);
    return response.data;
  },
  updateItem: async (countId: number | string, itemId: number | string, data: { counted_qty: number | null; note?: string }) => {
    const response = await api.patch<StockCountItem>(`/stock-counts/${countId}/items/${itemId}`, data);
    return response.data;
  },
  complete: async (id: number | string) => {
    const response = await api.post<StockCountCompleteSummary>(`/stock-counts/${id}/actions/complete`);
    return response.data;
  },
  cancel: async (id: number | string) => {
    const response = await api.post<{ message: string }>(`/stock-counts/${id}/actions/cancel`);
    return response.data;
  }
};

export const withdrawalApi = {
  getAll: async () => {
    return getAllPages<Withdrawal>('/withdrawals');
  },
  getById: async (id: number | string) => {
    const response = await api.get<Withdrawal>(`/withdrawals/${id}`);
    return response.data;
  },
  updateItemSn: async (withdrawalId: number | string, itemId: number | string, serialNumbers: string[]) => {
    const response = await api.patch(`/withdrawals/${withdrawalId}/items/${itemId}`, {
      serialNumbers
    });
    return response.data;
  },
  updateCompany: async (id: number | string, companyId: number) => {
    const response = await api.patch(`/withdrawals/${id}`, { companyId });
    return response.data;
  },
  create: async (data: {
    recipient: string;
    project_name?: string;
    location?: string;
    station_id?: number;
    station_area_id?: number;
    contract_id?: number;
    withdrawal_date?: string;
    contract_reference_type?: 'contract' | 'none' | 'legacy';
    contract_reference_note?: string;
    type: string;
    note?: string;
    return_due_date?: string;
    items: Array<{ inventory_id: number; quantity: number; serial_numbers?: string[] }>;
  }) => {
    const response = await api.post('/withdrawals', data);
    return response.data;
  },
  delete: async (id: number | string) => {
    const response = await api.delete(`/withdrawals/${id}`);
    return response.data;
  }
};

export const transactionApi = {
  getAll: async (params?: { inventory_id?: number | string; withdrawal_id?: number | string; station_id?: number | string; pending_only?: boolean }) => {
    return getAllPages<InventoryTransaction>('/transactions', params || {});
  },
  getLatest: async () => {
    const response = await api.get<{
      id: number;
      transaction_type: 'ADD_STOCK' | 'WITHDRAW' | 'BORROW' | 'RETURN' | 'ADJUSTMENT';
      quantity_added: number;
      quantity_withdrawn: number;
      quantity_borrowed: number;
      quantity_returned: number;
      product_name: string;
      user_name?: string;
    } | null>('/transactions/latest');
    return response.data;
  },
  return: async (data: FormData | Record<string, unknown>) => {
    const response = await api.post('/returns', data, {
      headers: data instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : undefined
    });
    return response.data;
  },
  delete: async (id: number | string) => {
    const response = await api.delete(`/transactions/${id}`);
    return response.data;
  }
};

export const searchApi = {
  globalSearch: async (q: string) => {
    const response = await api.get<GlobalSearchResults>('/search', { params: { q } });
    return response.data;
  }
};

export const purchaseOrderApi = {
  getAll: async (params?: { status?: string; search?: string }) => {
    return getAllPages<PurchaseOrder>('/purchase-orders', params || {});
  },
  getById: async (id: number | string) => {
    const response = await api.get<PurchaseOrder>(`/purchase-orders/${id}`);
    return response.data;
  },
  getVendors: async () => {
    const response = await api.get<VendorContact[]>('/purchase-orders/vendors');
    return response.data;
  },
  create: async (data: {
    company_name?: string;
    ordered_by?: string;
    project_name?: string;
    note?: string;
    status?: 'Draft' | 'Pending';
    created_by?: string;
    vendor_address?: string;
    vendor_phone?: string;
    vendor_contact_person?: string;
    vendor_tax_id?: string;
    buyer_department?: string;
    buyer_phone?: string;
    buyer_email?: string;
    items: { inventory_id: number; quantity: number }[];
  }) => {
    const response = await api.post<{ id: number; po_no: string; message: string }>('/purchase-orders', data);
    return response.data;
  },
  update: async (id: number | string, data: {
    status?: 'Draft' | 'Pending' | 'Approved' | 'Ordered' | 'Cancelled';
    note?: string;
    items?: { inventory_id: number; quantity: number }[];
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
    approved_by?: string;
  }) => {
    const response = await api.patch(`/purchase-orders/${id}`, data);
    return response.data;
  },
  updateCompany: async (id: number | string, companyId: number) => {
    const response = await api.patch(`/purchase-orders/${id}`, { companyId });
    return response.data;
  },
  delete: async (id: number | string) => {
    const response = await api.delete(`/purchase-orders/${id}`);
    return response.data;
  },
  receive: async (id: number | string, data?: { items?: { inventory_id: number; received_quantity: number }[] }) => {
    const response = await api.post(`/purchase-orders/${id}/receipts`, data);
    return response.data;
  },
  autoGenerate: async () => {
    const response = await api.post('/purchase-orders/actions/auto-generate');
    return response.data;
  }
};

export interface ServerReportPayload {
  title: string;
  headers: string[];
  rows: (string | number)[][];
  colWidths?: string[];
  totals?: { label: string; value: string }[];
  count: number;
  periodLabel: string;
}

export const reportApi = {
  generate: async (type: string, params?: { startDate?: string; endDate?: string }) => {
    const response = await api.get<ServerReportPayload>(`/reports/${type}`, { params });
    return response.data;
  },
  // Row counts for every report type — powers the live preview on the cards.
  getCounts: async (params?: { startDate?: string; endDate?: string }) => {
    const response = await api.get<Record<string, number | null>>('/reports/summary/counts', { params });
    return response.data;
  }
};

export const stationApi = {
  getUniqueList: async (params?: { status?: number }) => {
    return getAllPages<Station>('/stations', params || {});
  },
  getDetails: async (params: { location?: string; station_id?: number | string }) => {
    const response = await api.get<StationDetailResponse>('/stations/details', { params });
    return response.data;
  },
  getAreas: async (stationId: number | string) => {
    if (stationId) { /* no-op */ }
    return [] as StationArea[];
  },
  createArea: async (stationId: number | string, name: string) => {
    return { id: 0, station_id: Number(stationId), name, status: 1 } as StationArea;
  },
  create: async (data: Omit<Station, 'id' | 'status' | 'code'> & { gps_coordinates?: string }) => {
    const response = await api.post<Station>('/stations', data);
    return response.data;
  },
  delete: async (stationId: number | string) => {
    const response = await api.delete<{ message: string }>(`/stations/${stationId}`);
    return response.data;
  },
  update: async (stationId: number | string, data: Omit<Station, 'id' | 'status' | 'code'> & { gps_coordinates?: string }) => {
    const response = await api.patch<Station>(`/stations/${stationId}`, data);
    return response.data;
  },
  verify: async (stationId: number | string) => {
    const response = await api.post<Station>(`/stations/${stationId}/actions/verify`);
    return response.data;
  },
  moveAsset: async (stationId: number | string, data: { inventory_id: number; instance_id?: number; quantity?: number; to_station_id: number; note?: string }) => {
    const response = await api.post(`/stations/${stationId}/asset-movements`, data);
    return response.data as { message: string; moved: Array<{ instance_id?: number; quantity: number }> };
  },
  setAssetStatus: async (
    stationId: number | string,
    inventoryId: number | string,
    body: { status: string; note?: string }
  ) => {
    const response = await api.patch<AssetManualStatus>(
      `/stations/${stationId}/assets/${inventoryId}`,
      body
    );
    return response.data;
  }
};

type ContractInput = {
  contract_no: string;
  name: string;
  year_be: number;
  company_id?: number;
  start_date?: string;
  end_date?: string;
  note?: string;
};

export const contractApi = {
  getAll: async (params?: { status?: number }) => {
    return getAllPages<Contract>('/contracts', params || {});
  },
  create: async (data: ContractInput) => {
    const response = await api.post<Contract>('/contracts', data);
    return response.data;
  },
  update: async (id: number | string, data: ContractInput) => {
    const response = await api.patch<Contract>(`/contracts/${id}`, data);
    return response.data;
  },
  delete: async (id: number | string) => {
    const response = await api.delete<{ message: string }>(`/contracts/${id}`);
    return response.data;
  }
};

export const settingsApi = {
  // Companies
  getCompanies: async () => {
    return getAllPages<Company>('/settings/companies');
  },
  getCompanyById: async (id: number) => {
    const response = await api.get<Company>(`/settings/companies/${id}`);
    return response.data;
  },
  createCompany: async (data: Partial<Company>) => {
    const response = await api.post<{ id: number; message: string }>('/settings/companies', data);
    return response.data;
  },
  updateCompany: async (id: number, data: Partial<Company>) => {
    const response = await api.patch<{ message: string }>(`/settings/companies/${id}`, data);
    return response.data;
  },
  deleteCompany: async (id: number) => {
    const response = await api.delete<{ message: string }>(`/settings/companies/${id}`);
    return response.data;
  },
  setDefaultCompany: async (id: number) => {
    const response = await api.post<{ message: string }>(`/settings/companies/${id}/actions/set-default`);
    return response.data;
  },

  // Logos
  getLogos: async (companyId?: number) => {
    return getAllPages<CompanyLogo>('/settings/logos', companyId ? { companyId } : {});
  },
  uploadLogo: async (formData: FormData) => {
    const response = await api.post<CompanyLogo>('/settings/logos', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  setDefaultLogo: async (id: number) => {
    const response = await api.post<{ message: string }>(`/settings/logos/${id}/actions/set-default`);
    return response.data;
  },
  deleteLogo: async (id: number) => {
    const response = await api.delete<{ message: string }>(`/settings/logos/${id}`);
    return response.data;
  },

  // System Settings
  getSystemSettings: async () => {
    const response = await api.get<SystemSettings>('/settings/system');
    return response.data;
  },
  updateSystemSettings: async (data: SystemSettings) => {
    const response = await api.patch<{ message: string }>('/settings/system', data);
    return response.data;
  },

  // Backups
  getBackups: async () => {
    const response = await api.get<Array<{ filename: string; size: number; created_at: string }>>('/settings/backups');
    return response.data;
  },
  downloadBackup: async (filename: string) => {
    const response = await api.get<Blob>(`/settings/backups/download/${encodeURIComponent(filename)}`, {
      responseType: 'blob',
    });
    return response.data;
  },
  createBackup: async () => {
    const response = await api.post<{ message: string; filename: string }>('/settings/backups');
    return response.data;
  },
  deleteBackup: async (filename: string) => {
    const response = await api.delete<{ message: string }>(`/settings/backups/${filename}`);
    return response.data;
  },
  restoreBackup: async (data: { filename: string; password?: string; confirm_text?: string }) => {
    const response = await api.post<{ message: string }>('/settings/backups/actions/restore', data);
    return response.data;
  },
};

export const authApi = {
  login: async (username: string, password: string) => {
    const response = await api.post<{ token: string; user: User }>('/auth/login', { username, password });
    return response.data;
  },
  me: async () => {
    const response = await api.get<{ user: User }>('/auth/me');
    return response.data;
  },
  changePassword: async (current_password: string, new_password: string) => {
    const response = await api.post<{ message: string; token: string }>('/auth/password', {
      current_password,
      new_password,
    });
    return response.data;
  },
};

export const userApi = {
  list: async () => {
    return getAllPages<User>('/users');
  },
  create: async (data: { username: string; password: string; full_name: string; is_full?: boolean; permissions?: object }) => {
    const response = await api.post<{ id: number; message: string }>('/users', data);
    return response.data;
  },
  update: async (id: number, data: Partial<{ full_name: string; password: string; is_full: boolean; permissions: object; is_active: boolean }>) => {
    const response = await api.patch<{ message: string }>(`/users/${id}`, data);
    return response.data;
  },
  remove: async (id: number) => {
    const response = await api.delete<{ message: string }>(`/users/${id}`);
    return response.data;
  },
  getAuditLogs: async (params?: { limit?: number; offset?: number; search?: string }) => {
    const limit = params?.limit || 50;
    const offset = params?.offset || 0;
    const response = await api.get<{ logs: AuditLog[]; total: number }>('/users/audit-logs', {
      params: {
        page: Math.floor(offset / limit) + 1,
        pageSize: limit,
        q: params?.search,
      },
    });
    return response.data;
  },
};

export const technicianApi = {
  list: async (params?: { active?: boolean }) => {
    return getAllPages<Technician>('/technicians', params || {});
  },
  create: async (data: { full_name: string; code?: string; phone?: string; user_id?: number | null }) => {
    const response = await api.post<{ id: number; message: string }>('/technicians', data);
    return response.data;
  },
  update: async (id: number | string, data: Partial<{ full_name: string; code: string; phone: string; user_id: number | null; is_active: boolean }>) => {
    const response = await api.patch<{ message: string }>(`/technicians/${id}`, data);
    return response.data;
  },
};

export const technicianStockApi = {
  // Summary per technician (no param) — for the master list page
  getKitSummary: async () => {
    return getAllPages<TechnicianKitSummary>('/technician-stock/holdings');
  },
  // One technician's on-hand items + serialized units
  getHoldings: async (technicianId: number | string) => {
    const response = await api.get<TechnicianHoldingsDetail>('/technician-stock/holdings', { params: { technicianId, pageSize: 100 } });
    return response.data;
  },
  getMovements: async (params?: { technician_id?: number | string; station_id?: number | string; type?: string; inventory_id?: number | string }) => {
    return getAllPages<TechnicianStockMovement>('/technician-stock/movements', params || {});
  },
  load: async (data: { technician_id: number; items: TechnicianStockItemInput[]; note?: string }) => {
    const response = await api.post<{ message: string }>('/technician-stock/actions/load', data);
    return response.data;
  },
  install: async (data: {
    technician_id: number;
    items: TechnicianStockItemInput[];
    station_id: number;
    station_area_id?: number;
    removed_serial?: string;
    removed_model?: string;
    note?: string;
  }) => {
    const response = await api.post<{ message: string }>('/technician-stock/actions/install', data);
    return response.data;
  },
  returnStock: async (data: { technician_id: number; items: TechnicianStockItemInput[]; note?: string }) => {
    const response = await api.post<{ message: string }>('/technician-stock/actions/return', data);
    return response.data;
  },
  deleteMovement: async (id: number | string) => {
    const response = await api.delete<{ message: string }>(`/technician-stock/movements/${id}`);
    return response.data;
  },
};

