import axios from 'axios';
import type { Repair, RepairDetail, RepairStatsResponse, InventoryItem, Withdrawal, InventoryStats, DashboardData, GlobalSearchResults, PurchaseOrder, StationDetailResponse, Station, StationArea, VendorContact, Company, CompanyLogo, User, SystemSettings, AuditLog, AssetLifecycleItem, Contract, AssetManualStatus, StockCount, StockCountItem, StockCountDetailResponse, StockCountCompleteSummary, AssetTimelineResponse, Technician, TechnicianKitSummary, TechnicianHoldingsDetail, TechnicianStockMovement, TechnicianStockItemInput } from './types';

const TOKEN_KEY = 'maintenance_auth_token';

export const tokenStorage = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

const API_URL = import.meta.env.DEV 
  ? 'http://localhost:5221/api' 
  : '/api';

export const UPLOAD_URL = import.meta.env.DEV 
  ? 'http://localhost:5221' 
  : window.location.origin;

const api = axios.create({
  baseURL: API_URL,
});

// Attach JWT to every request when available
api.interceptors.request.use((config) => {
  const token = tokenStorage.get();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, clear token + redirect to /login (skip if already on auth pages)
api.interceptors.response.use(
  (response) => {
    if (import.meta.env.DEV && response.config.url?.includes('/repairs/stats')) {
      console.log('--- STATS API RAW DATA ---');
      console.log(JSON.stringify(response.data, null, 2));
    }
    return response;
  },
  (error) => {
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
    const response = await api.get<Repair[]>('/repairs', { params });
    return response.data;
  },
  
  getStats: async () => {
    const response = await api.get<RepairStatsResponse>('/repairs/stats');
    return response.data;
  },
  
  getDashboardStats: async (params?: { startDate?: string; endDate?: string }) => {
    const response = await api.get<DashboardData>('/repairs/dashboard-stats', { params });
    return response.data;
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
    const response = await api.post<{ id: number; ticket_no: string }>('/repairs/claim', formData, {
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
    const response = await api.patch(`/repairs/${id}/status`, data);
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
    const response = await api.post(`/repairs/${id}/replace-device`, data);
    return response.data;
  },

  delete: async (id: number | string) => {
    const response = await api.delete(`/repairs/remove/${id}`);
    return response.data;
  },

  updateCompany: async (id: number | string, companyId: number) => {
    const response = await api.patch(`/repairs/${id}/company`, { company_id: companyId });
    return response.data;
  },

  markAsRead: async (id: number | string) => {
    const response = await api.patch(`/repairs/${id}/read`);
    return response.data;
  }
};

export const inventoryApi = {
  getAll: async (params?: { search?: string }) => {
    const response = await api.get<InventoryItem[]>('/inventory', { params });
    return response.data;
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
    const response = await api.post(`/inventory/${id}/serial-numbers`, {
      serial_numbers: serialNumbers
    });
    return response.data;
  },
  importBulk: async (items: Array<{ name: string; model?: string; description?: string; storage_location?: string; quantity?: number; min_stock?: number; requires_sn?: number }>) => {
    const response = await api.post<{ message: string; created: number; updated: number; total: number }>('/inventory/import', { items });
    return response.data;
  },
  updateInstanceCondition: async (instanceId: number | string, condition: string) => {
    const response = await api.patch(`/inventory/instances/${instanceId}/condition`, { condition });
    return response.data;
  },
  delete: async (id: number | string) => {
    const response = await api.delete(`/inventory/${id}`);
    return response.data;
  },
  getLifecycleReport: async () => {
    const response = await api.get<AssetLifecycleItem[]>('/inventory/lifecycle-report');
    return response.data;
  },
  getInstanceTimeline: async (instanceId: number | string) => {
    const response = await api.get<AssetTimelineResponse>(`/inventory/instances/${instanceId}/timeline`);
    return response.data;
  }
};

export const stockCountApi = {
  getAll: async () => {
    const response = await api.get<StockCount[]>('/stock-counts');
    return response.data;
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
    const response = await api.post<StockCountCompleteSummary>(`/stock-counts/${id}/complete`);
    return response.data;
  },
  cancel: async (id: number | string) => {
    const response = await api.post<{ message: string }>(`/stock-counts/${id}/cancel`);
    return response.data;
  }
};

export const withdrawalApi = {
  getAll: async () => {
    const response = await api.get<Withdrawal[]>('/withdrawals');
    return response.data;
  },
  getById: async (id: number | string) => {
    const response = await api.get<Withdrawal>(`/withdrawals/${id}`);
    return response.data;
  },
  updateItemSn: async (withdrawalId: number | string, itemId: number | string, serialNumbers: string[]) => {
    const response = await api.put(`/withdrawals/${withdrawalId}/items/${itemId}/serial-numbers`, {
      serial_numbers: serialNumbers
    });
    return response.data;
  },
  updateCompany: async (id: number | string, companyId: number) => {
    const response = await api.patch(`/withdrawals/${id}/company`, { company_id: companyId });
    return response.data;
  },
  create: async (data: {
    recipient: string;
    project_name?: string;
    location?: string;
    station_id?: number;
    station_area_id?: number;
    contract_id?: number;
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
    const response = await api.get('/transactions', { params });
    return response.data;
  },
  getLatest: async () => {
    const response = await api.get<{
      id: number;
      transaction_type: 'ADD_STOCK' | 'WITHDRAW' | 'BORROW' | 'RETURN';
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
    const response = await api.post('/transactions/return', data, {
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
    const response = await api.get<PurchaseOrder[]>('/purchase-orders', { params });
    return response.data;
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
    const response = await api.patch(`/purchase-orders/${id}/company`, { company_id: companyId });
    return response.data;
  },
  delete: async (id: number | string) => {
    const response = await api.delete(`/purchase-orders/${id}`);
    return response.data;
  },
  receive: async (id: number | string, data?: { items?: { inventory_id: number; received_quantity: number }[] }) => {
    const response = await api.post(`/purchase-orders/${id}/receive`, data);
    return response.data;
  },
  autoGenerate: async () => {
    const response = await api.post('/purchase-orders/auto-generate');
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
    const response = await api.get<Station[]>('/stations', { params });
    return response.data;
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
  create: async (data: Omit<Station, 'id' | 'status' | 'code'>) => {
    const response = await api.post<Station>('/stations', data);
    return response.data;
  },
  delete: async (stationId: number | string) => {
    const response = await api.delete<{ message: string }>(`/stations/${stationId}`);
    return response.data;
  },
  update: async (stationId: number | string, data: Omit<Station, 'id' | 'status' | 'code'>) => {
    const response = await api.patch<Station>(`/stations/${stationId}`, data);
    return response.data;
  },
  setAssetStatus: async (
    stationId: number | string,
    inventoryId: number | string,
    body: { status: string; note?: string }
  ) => {
    const response = await api.put<AssetManualStatus>(
      `/stations/${stationId}/assets/${inventoryId}/status`,
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
    const response = await api.get<Contract[]>('/contracts', { params });
    return response.data;
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
    const response = await api.get<Company[]>('/settings/companies');
    return response.data;
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
    const response = await api.put<{ message: string }>(`/settings/companies/${id}`, data);
    return response.data;
  },
  deleteCompany: async (id: number) => {
    const response = await api.delete<{ message: string }>(`/settings/companies/${id}`);
    return response.data;
  },
  setDefaultCompany: async (id: number) => {
    const response = await api.patch<{ message: string }>(`/settings/companies/${id}/default`);
    return response.data;
  },

  // Logos
  getLogos: async (companyId?: number) => {
    const response = await api.get<CompanyLogo[]>('/settings/logos', {
      params: companyId ? { company_id: companyId } : undefined,
    });
    return response.data;
  },
  uploadLogo: async (formData: FormData) => {
    const response = await api.post<CompanyLogo>('/settings/logos', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  setDefaultLogo: async (id: number) => {
    const response = await api.patch<{ message: string }>(`/settings/logos/${id}/default`);
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
    const response = await api.put<{ message: string }>('/settings/system', data);
    return response.data;
  },

  // Backups
  getBackups: async () => {
    const response = await api.get<Array<{ filename: string; size: number; created_at: string }>>('/settings/backups');
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
    const response = await api.post<{ message: string }>('/settings/backups/restore', data);
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
    const response = await api.post<{ message: string; token: string }>('/auth/change-password', {
      current_password,
      new_password,
    });
    return response.data;
  },
};

export const userApi = {
  list: async () => {
    const response = await api.get<User[]>('/users');
    return response.data;
  },
  create: async (data: { username: string; password: string; full_name: string; is_full?: boolean; permissions?: object }) => {
    const response = await api.post<{ id: number; message: string }>('/users', data);
    return response.data;
  },
  update: async (id: number, data: Partial<{ full_name: string; password: string; is_full: boolean; permissions: object; is_active: boolean }>) => {
    const response = await api.put<{ message: string }>(`/users/${id}`, data);
    return response.data;
  },
  remove: async (id: number) => {
    const response = await api.delete<{ message: string }>(`/users/${id}`);
    return response.data;
  },
  getAuditLogs: async (params?: { limit?: number; offset?: number; search?: string }) => {
    const response = await api.get<{ logs: AuditLog[]; total: number }>('/users/audit-logs', { params });
    return response.data;
  },
};

export const technicianApi = {
  list: async (params?: { active?: boolean }) => {
    const response = await api.get<Technician[]>('/technicians', { params });
    return response.data;
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
    const response = await api.get<TechnicianKitSummary[]>('/technician-stock/holdings');
    return response.data;
  },
  // One technician's on-hand items + serialized units
  getHoldings: async (technicianId: number | string) => {
    const response = await api.get<TechnicianHoldingsDetail>('/technician-stock/holdings', { params: { technician_id: technicianId } });
    return response.data;
  },
  getMovements: async (params?: { technician_id?: number | string; station_id?: number | string; type?: string; inventory_id?: number | string }) => {
    const response = await api.get<TechnicianStockMovement[]>('/technician-stock/movements', { params });
    return response.data;
  },
  load: async (data: { technician_id: number; items: TechnicianStockItemInput[]; note?: string }) => {
    const response = await api.post<{ message: string }>('/technician-stock/load', data);
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
    const response = await api.post<{ message: string }>('/technician-stock/install', data);
    return response.data;
  },
  returnStock: async (data: { technician_id: number; items: TechnicianStockItemInput[]; note?: string }) => {
    const response = await api.post<{ message: string }>('/technician-stock/return', data);
    return response.data;
  },
  deleteMovement: async (id: number | string) => {
    const response = await api.delete<{ message: string }>(`/technician-stock/movements/${id}`);
    return response.data;
  },
};

