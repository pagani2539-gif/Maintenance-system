import React, { useMemo, useState } from 'react';
import type { 
  TableColumn, 
  TableAction, 
  TableState, 
  SortConfig, 
  SelectionConfig,
  MobileCardConfig
} from '../../types/table.types';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import BaseCardList from './BaseCardList';
import TableSkeleton from './TableSkeleton';
import TableEmptyState from './TableEmptyState';
import TableErrorState from './TableErrorState';
import ActionMenu from './ActionMenu';
import TableDetailDrawer from './TableDetailDrawer';
import { ChevronUp, ChevronDown, MoreHorizontal } from 'lucide-react';

interface BaseDataTableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  state: TableState;
  actions?: TableAction<T>[];
  sort?: SortConfig;
  onSort?: (config: SortConfig) => void;
  selection?: SelectionConfig<T>;
  mobileConfig: MobileCardConfig<T>;
  onRowClick?: (row: T) => void;
  onRetry?: () => void;
  minWidth?: string;
  drawerTitle?: string | ((row: T) => string);
  renderDetailDrawer?: (row: T) => React.ReactNode;
  getRowAccent?: (row: T) => string | undefined;
  /**
   * Context-aware empty state. When provided, the table distinguishes between
   * "no data exists yet" (noData — nudge the user to create the first record) and
   * "data exists but the current search/filter matched nothing" (noResults).
   * Pass `totalCount` (unfiltered row count) so the table can pick the right variant.
   */
  emptyState?: {
    noData: { message: string; hint?: string };
    noResults: { message: string; hint?: string };
  };
  totalCount?: number;
}

function BaseDataTable<T>({
  columns,
  data,
  state,
  actions = [],
  sort,
  onSort,
  selection,
  mobileConfig,
  onRowClick,
  onRetry,
  minWidth = '1100px',
  drawerTitle = 'รายละเอียด',
  renderDetailDrawer,
  getRowAccent,
  emptyState,
  totalCount
}: BaseDataTableProps<T>) {
  const breakpoint = useBreakpoint();
  const [selectedRow, setSelectedRow] = useState<T | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const renderEmptyState = () => {
    if (!emptyState) return <TableEmptyState />;
    const cfg = (totalCount ?? 0) === 0 ? emptyState.noData : emptyState.noResults;
    return <TableEmptyState message={cfg.message} hint={cfg.hint} />;
  };

  const visibleColumns = useMemo(() => {
    return columns.filter(col => {
      if (breakpoint === 'desktop') return col.priority <= 2;
      if (breakpoint === 'tablet') return col.priority === 1;
      return true; // Mobile uses CardList
    });
  }, [columns, breakpoint]);

  // Estimate action column width: inline buttons (32px each) + overflow trigger (32px) + gaps/padding.
  // Static `hidden: true` actions are excluded; per-row hidden functions are counted (upper bound).
  const actionsCellWidth = useMemo(() => {
    if (actions.length === 0) return 0;
    const renderable = actions.filter(a => a.hidden !== true);
    const inlineCount = renderable.filter(a => a.inline).length;
    const hasOverflow = renderable.some(a => !a.inline);
    return inlineCount * 34 + (hasOverflow ? 36 : 0) + 16;
  }, [actions]);

  const handleRowClick = (row: T) => {
    if (renderDetailDrawer) {
      setSelectedRow(row);
      setIsDrawerOpen(true);
    }
    onRowClick?.(row);
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
    // Use timeout to prevent content flicker during slide-out
    setTimeout(() => setSelectedRow(null), 300);
  };

  if (breakpoint === 'mobile') {
    if (state.loading) return <TableSkeleton columns={1} rows={4} />;
    if (state.error) return <TableErrorState message={state.error} onRetry={onRetry} />;
    if (state.empty) return renderEmptyState();
    return (
      <>
        <BaseCardList
          data={data} 
          config={mobileConfig} 
          actions={actions} 
          onRowClick={handleRowClick} 
        />
        {renderDetailDrawer && selectedRow && (
          <TableDetailDrawer
            isOpen={isDrawerOpen}
            onClose={closeDrawer}
            title={typeof drawerTitle === 'function' ? drawerTitle(selectedRow) : drawerTitle}
          >
            {renderDetailDrawer(selectedRow)}
          </TableDetailDrawer>
        )}
      </>
    );
  }

  if (state.loading) return <TableSkeleton columns={visibleColumns.length} rows={6} />;
  if (state.error) return <TableErrorState message={state.error} onRetry={onRetry} />;
  if (state.empty) return renderEmptyState();

  const handleSort = (colId: string) => {
    if (!onSort) return;
    const direction = sort?.key === colId && sort.direction === 'asc' ? 'desc' : 'asc';
    onSort({ key: colId, direction });
  };

  return (
    <>
      <div className="w-full overflow-x-auto" style={{ borderRadius: 'var(--table-radius)', border: '1px solid var(--border)' }}>
        <table className="w-full data-table" style={{ tableLayout: 'fixed', minWidth }}>
          <colgroup>
            {selection?.enabled && <col style={{ width: '48px' }} />}
            {visibleColumns.map(col => (
              <col key={col.id} style={{ width: col.width || 'auto', minWidth: col.minWidth, maxWidth: col.maxWidth }} />
            ))}
            {actions.length > 0 && <col style={{ width: `${actionsCellWidth}px` }} />}
          </colgroup>
          
          <thead style={{ height: 'var(--table-header-height)', backgroundColor: 'var(--bg-app)' }}>
            <tr>
              {selection?.enabled && (
                <th style={{ textAlign: 'center' }}>
                  <input 
                    type="checkbox" 
                    aria-label="Select all rows"
                    checked={data.length > 0 && data.every(row => selection.selectedIds.includes(selection.getRowId(row)))}
                    onChange={(e) => {
                      if (e.target.checked) selection.onSelectionChange(data.map(selection.getRowId));
                      else selection.onSelectionChange([]);
                    }}
                  />
                </th>
              )}
              {visibleColumns.map(col => {
                const isSorted = sort?.key === col.id;
                const sortDirection = isSorted ? sort.direction : undefined;
                return (
                  <th
                    key={col.id}
                    aria-sort={col.sortable ? (sortDirection === 'asc' ? 'ascending' : sortDirection === 'desc' ? 'descending' : 'none') : undefined}
                    style={{
                      textAlign: col.align || 'left',
                      position: 'sticky',
                      top: 0,
                      zIndex: 20,
                    }}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        className="data-table__sort-button"
                        onClick={() => handleSort(col.id)}
                      >
                        <span>{col.header}</span>
                        {isSorted && (sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                      </button>
                    ) : (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>{col.header}</div>
                    )}
                  </th>
                );
              })}
              {actions.length > 0 && (
                <th
                  title="จัดการ"
                  aria-label="จัดการ"
                  className="sticky-actions-col-th"
                  style={{ textAlign: 'center', position: 'sticky', right: 0, zIndex: 21, width: `${actionsCellWidth}px`, color: 'var(--text-muted)' }}
                >
                  <MoreHorizontal size={16} style={{ verticalAlign: 'middle' }} />
                </th>
              )}
            </tr>
          </thead>

          <tbody>
            {data.map((row, rowIndex) => {
              const selectionId = selection?.getRowId(row);
              const rowId = selectionId ?? (row as Record<string, unknown>).id ?? rowIndex;
              const isSelected = selectionId !== undefined && selection?.selectedIds.includes(selectionId);

              const accent = getRowAccent?.(row);
              const isInteractiveRow = Boolean(renderDetailDrawer || onRowClick);
              return (
                <tr
                  key={rowId as string | number}
                  onClick={isInteractiveRow ? () => handleRowClick(row) : undefined}
                  onKeyDown={isInteractiveRow ? (event) => {
                    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
                    event.preventDefault();
                    handleRowClick(row);
                  } : undefined}
                  tabIndex={isInteractiveRow ? 0 : undefined}
                  className={`data-table-row ${isSelected ? 'is-selected' : ''}`}
                  style={{
                    height: 'var(--table-row-height)',
                    cursor: isInteractiveRow ? 'pointer' : 'default',
                    backgroundColor: isSelected ? 'var(--primary-light)' : undefined,
                    transition: 'background-color 0.2s, transform 0.15s',
                    '--row-accent': accent || 'transparent'
                  } as React.CSSProperties}
                >
                  {selection?.enabled && (
                    <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      <input 
                        type="checkbox" 
                        aria-label={`Select row ${rowIndex + 1}`}
                        checked={isSelected}
                        onChange={() => {
                          if (isSelected) selection.onSelectionChange(selection.selectedIds.filter(id => id !== selectionId));
                          else selection.onSelectionChange([...selection.selectedIds, selectionId!]);
                        }}
                      />
                    </td>
                  )}
                  {visibleColumns.map(col => {
                    const value = typeof col.accessor === 'function' 
                      ? col.accessor(row) 
                      : (col.accessor ? (row as Record<string, unknown>)[col.accessor as string] : undefined);
                    
                    return (
                      <td 
                        key={col.id} 
                        style={{ textAlign: col.align || 'left', verticalAlign: 'middle' }}
                        title={typeof value === 'string' ? value : undefined}
                      >
                        <div className="truncate">
                          {col.render ? col.render(value, row) : (value ?? '-')}
                        </div>
                      </td>
                    );
                  })}
                  {actions.length > 0 && (
                    <td className="sticky-actions-col-td" style={{ textAlign: 'center', position: 'sticky', right: 0, zIndex: 10, width: `${actionsCellWidth}px` }} onClick={e => e.stopPropagation()}>
                      <ActionMenu
                        row={row}
                        actions={actions.map(a => a.id === 'view' ? { ...a, onClick: () => handleRowClick(row) } : a)}
                      />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {renderDetailDrawer && selectedRow && (
        <TableDetailDrawer
          isOpen={isDrawerOpen}
          onClose={closeDrawer}
          title={typeof drawerTitle === 'function' ? drawerTitle(selectedRow) : drawerTitle}
        >
          {renderDetailDrawer(selectedRow)}
        </TableDetailDrawer>
      )}
    </>
  );
}

export default React.memo(BaseDataTable) as typeof BaseDataTable;
