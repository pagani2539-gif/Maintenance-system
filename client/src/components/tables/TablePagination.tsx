import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '../ui/Button';
import Select from '../ui/Select';
import type { PaginationConfig } from '../../types/table.types';

interface TablePaginationProps {
  config: PaginationConfig;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}

const TablePagination: React.FC<TablePaginationProps> = ({
  config,
  onPageChange,
  onPageSizeChange
}) => {
  const { page, pageSize, totalItems, pageSizeOptions = [20, 50, 100] } = config;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  if (totalPages <= 1 && totalItems <= pageSizeOptions[0]) return null;

  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalItems);

  // Calculate visible page numbers
  const maxVisiblePages = 5;
  let startPage = Math.max(1, page - Math.floor(maxVisiblePages / 2));
  let endPage = startPage + maxVisiblePages - 1;

  if (endPage > totalPages) {
    endPage = totalPages;
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }

  const pages = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);

  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'space-between',
      gap: '1rem', 
      marginTop: '2rem', 
      paddingBottom: '1.5rem',
      flexWrap: 'wrap'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          แสดง <strong style={{ color: 'var(--text-main)' }}>{startItem}–{endItem}</strong> จาก <strong style={{ color: 'var(--text-main)' }}>{totalItems}</strong> รายการ
        </div>
        
        {onPageSizeChange && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ต่อหน้า:</span>
            <Select
              value={pageSize}
              options={pageSizeOptions.map(size => ({ label: String(size), value: size }))}
              onChange={(val) => onPageSizeChange(Number(val))}
              ariaLabel="รายการต่อหน้า"
              style={{ width: '80px' }}
            />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          icon={<ChevronsLeft size={16} />}
          style={{ width: '36px', padding: 0 }}
          title="หน้าแรก"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          icon={<ChevronLeft size={16} />}
          style={{ width: '36px', padding: 0 }}
          title="ก่อนหน้า"
        />

        <div style={{ display: 'flex', gap: '4px', margin: '0 8px' }}>
          {pages.map(p => (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              style={{
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '6px',
                border: p === page ? '1px solid var(--primary)' : '1px solid var(--border)',
                backgroundColor: p === page ? 'var(--primary)' : 'var(--bg-card)',
                color: p === page ? 'white' : 'var(--text-main)',
                fontWeight: p === page ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                outline: 'none'
              }}
            >
              {p}
            </button>
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          icon={<ChevronRight size={16} />}
          style={{ width: '36px', padding: 0 }}
          title="ถัดไป"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(totalPages)}
          disabled={page === totalPages}
          icon={<ChevronsRight size={16} />}
          style={{ width: '36px', padding: 0 }}
          title="หน้าสุดท้าย"
        />
      </div>
    </div>
  );
};

export default React.memo(TablePagination);
