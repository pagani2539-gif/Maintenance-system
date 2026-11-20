/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';

export type ColumnPriority = 1 | 2 | 3 | 4;

export interface TableColumn<T> {
  id: string;
  header: string;
  accessor?: keyof T | ((row: T) => any);
  render?: (value: any, row: T) => React.ReactNode;
  priority: ColumnPriority; // 1=Always, 2=Hide Tablet, 3=Hide Mobile, 4=Drawer
  width?: string;
  minWidth?: string;
  maxWidth?: string;
  cellMode?: 'nowrap' | 'wrap-2' | 'wrap';
  getCellText?: (row: T) => string;
  sortable?: boolean;
  searchable?: boolean;
  exportable?: boolean;
  copyable?: boolean;
  mobileHidden?: boolean;
  align?: 'left' | 'center' | 'right';
}

export interface TableAction<T> {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: (row: T) => void;
  variant?: 'primary' | 'outline' | 'danger' | 'ghost' | 'success';
  permission?: string;
  disabled?: boolean | ((row: T) => boolean);
  hidden?: boolean | ((row: T) => boolean);
  /**
   * Pin this action outside the overflow menu as a directly-clickable icon button.
   * Use for frequently-used, non-destructive actions. Never set true for destructive actions.
   */
  inline?: boolean;
}

export interface BulkAction<T> {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onAction: (selectedRows: T[]) => Promise<void>;
  permission?: string;
}

export interface TableFilter {
  id: string;
  label: string;
  type: 'select' | 'date-range' | 'text' | 'checkbox';
  options?: { label: string; value: any }[];
  defaultValue?: any;
  disabled?: boolean;
  disabledHint?: string;
}

export interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

export interface PaginationConfig {
  page: number;
  pageSize: number;
  totalItems: number;
  pageSizeOptions?: number[];
}

export interface TableState {
  loading: boolean;
  error: string | null;
  empty: boolean;
}

export interface SelectionConfig<T> {
  enabled: boolean;
  selectedIds: (string | number)[];
  onSelectionChange: (ids: (string | number)[]) => void;
  getRowId: (row: T) => string | number;
}

export interface DetailDrawerProps<T> {
  isOpen: boolean;
  onClose: () => void;
  row: T | null;
  title: string;
  renderDetails: (row: T) => React.ReactNode;
}

export interface TableToolbarConfig {
  searchEnabled: boolean;
  searchPlaceholder?: string;
  filters: TableFilter[];
  bulkActions?: BulkAction<any>[];
}

export interface MobileCardConfig<T> {
  title: (row: T) => React.ReactNode;
  subtitle?: (row: T) => React.ReactNode;
  statusBadge?: (row: T) => React.ReactNode;
}

export interface TableUrlState {
  page: number;
  pageSize: number;
  search: string;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  filters: Record<string, any>;
}
