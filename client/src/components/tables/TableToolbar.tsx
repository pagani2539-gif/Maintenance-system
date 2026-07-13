import React, { useState, useEffect } from 'react';
import { Search, X, Filter } from 'lucide-react';
import { Button } from '../ui/Button';
import Select from '../ui/Select';
import type { TableFilter } from '../../types/table.types';

interface TableToolbarProps {
  searchEnabled?: boolean;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange: (value: string) => void;
  filters?: TableFilter[];
  activeFilters?: Record<string, unknown>;
  onFilterChange: (filters: Record<string, unknown>) => void;
  onReset?: () => void;
}

const TableToolbar: React.FC<TableToolbarProps> = ({
  searchEnabled = true,
  searchPlaceholder = 'ค้นหา...',
  searchValue = '',
  onSearchChange,
  filters = [],
  activeFilters = {},
  onFilterChange,
  onReset
}) => {
  const [prevSearchValue, setPrevSearchValue] = useState(searchValue);
  const [localSearch, setLocalSearch] = useState(searchValue);

  if (searchValue !== prevSearchValue) {
    setPrevSearchValue(searchValue);
    setLocalSearch(searchValue);
  }

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== searchValue) {
        onSearchChange(localSearch);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch, onSearchChange, searchValue]);

  const filterCount = Object.values(activeFilters).filter(v => v !== undefined && v !== '' && v !== 'All').length;
  const activeFilterEntries = filters
    .map(filter => {
      const value = activeFilters[filter.id];
      if (value === undefined || value === '' || value === 'All') return null;
      const option = filter.options?.find(item => String(item.value) === String(value));
      return { filter, value: option?.label || String(value) };
    })
    .filter((entry): entry is { filter: TableFilter; value: string } => entry !== null);

  return (
    <div className="table-toolbar" style={{
      display: 'flex', 
      flexDirection: 'column', 
      gap: '1rem', 
      marginBottom: '1.5rem',
      padding: '1.25rem 1.5rem',
      backgroundColor: 'var(--bg-card)',
      borderRadius: 'var(--table-radius)',
      border: '1px solid var(--border)',
      boxShadow: 'var(--shadow-sm)',
      position: 'relative',
      zIndex: 30
    }}>
      <div className="table-toolbar__top" style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {searchEnabled && (
          <div className="table-toolbar__search" style={{ position: 'relative', flex: 1, minWidth: '280px' }}>
            <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              style={{
                width: '100%',
                height: '42px',
                padding: '0 1rem 0 2.75rem',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--bg-app)',
                fontSize: '0.95rem',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
            />
            {localSearch && (
              <button 
                type="button"
                onClick={() => setLocalSearch('')}
                aria-label="ล้างคำค้นหา"
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}

        <div className="table-toolbar__summary" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {filters.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', backgroundColor: 'var(--bg-app)', padding: '4px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <Filter size={16} color="var(--primary)" />
              <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>ตัวกรอง {filterCount > 0 && `(${filterCount})`}</span>
            </div>
          )}
          
          {filterCount > 0 && onReset && (
            <Button variant="outline" size="sm" onClick={onReset} style={{ fontSize: '0.8rem', height: '32px' }}>
              ล้างค่า
            </Button>
          )}
        </div>
      </div>

      {filters.length > 0 && (
        <div className="table-toolbar__filters" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          {filters.map(filter => (
            <div
              key={filter.id}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              title={filter.disabled ? filter.disabledHint : undefined}
            >
              <label htmlFor={`table-filter-${filter.id}`} style={{ fontSize: '0.8rem', fontWeight: 700, color: filter.disabled ? 'var(--border-hover)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {filter.label}:
              </label>
              {filter.type === 'select' && (
                <Select
                  value={(activeFilters[filter.id] as string) || 'All'}
                  options={[{ label: 'ทั้งหมด', value: 'All' }, ...(filter.options || [])]}
                  onChange={(val) => onFilterChange({ ...activeFilters, [filter.id]: val })}
                  disabled={filter.disabled}
                  id={`table-filter-${filter.id}`}
                  ariaLabel={filter.label}
                  style={{ minWidth: '130px' }}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {activeFilterEntries.length > 0 && (
        <div className="table-toolbar__active-filters" aria-label="ตัวกรองที่ใช้งาน">
          <span className="table-toolbar__active-label">กำลังกรอง:</span>
          {activeFilterEntries.map(({ filter, value }) => (
            <button
              key={filter.id}
              type="button"
              className="table-filter-chip"
              onClick={() => onFilterChange({ ...activeFilters, [filter.id]: 'All' })}
              aria-label={`ล้างตัวกรอง ${filter.label}`}
            >
              <span>{filter.label}: {value}</span>
              <X size={13} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default React.memo(TableToolbar);
