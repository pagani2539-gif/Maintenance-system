import React from 'react';
import type { MobileCardConfig, TableAction } from '../../types/table.types';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { ChevronRight, Eye } from 'lucide-react';
import ActionMenu from './ActionMenu';

interface BaseCardListProps<T> {
  data: T[];
  config: MobileCardConfig<T>;
  actions?: TableAction<T>[];
  onRowClick?: (row: T) => void;
}

function BaseCardList<T>({
  data,
  config,
  actions = [],
  onRowClick
}: BaseCardListProps<T>) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
      {data.map((row, index) => (
        <Card 
          key={index}
          onClick={() => onRowClick?.(row)}
          style={{ 
            cursor: 'pointer',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            transition: 'transform 0.1s ease',
            position: 'relative'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                {config.title(row)}
              </div>
              {config.subtitle && (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {config.subtitle(row)}
                </div>
              )}
            </div>
            {config.statusBadge && (
              <div style={{ flexShrink: 0 }}>
                {config.statusBadge(row)}
              </div>
            )}
          </div>

          <div className="mobile-card-actions" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.5rem', 
            borderTop: '1px solid var(--border)', 
            paddingTop: '0.75rem' 
          }}>
            {actions.length > 0 ? (
              <div onClick={(event) => event.stopPropagation()}>
                <ActionMenu row={row} actions={actions} />
              </div>
            ) : <span />}
            <Button
              variant="text"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onRowClick?.(row);
              }}
              icon={<Eye size={16} />}
              style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)', minHeight: '44px' }}
            >
              ดูรายละเอียด
            </Button>
            <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}>
              <ChevronRight size={18} />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

export default React.memo(BaseCardList) as typeof BaseCardList;
