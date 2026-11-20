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
    <div className="mobile-card-list">
      {data.map((row, index) => (
        <Card 
          key={index}
          onClick={() => onRowClick?.(row)}
          className="mobile-data-card"
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
          <div className="mobile-data-card__header">
            <div className="mobile-data-card__identity">
              <div className="mobile-data-card__title">
                {config.title(row)}
              </div>
              {config.subtitle && (
                <div className="mobile-data-card__subtitle">
                  {config.subtitle(row)}
                </div>
              )}
            </div>
            {config.statusBadge && (
              <div className="mobile-data-card__status">
                {config.statusBadge(row)}
              </div>
            )}
          </div>

          <div className="mobile-card-actions">
            {actions.length > 0 ? (
              <div className="mobile-card-actions__menu" onClick={(event) => event.stopPropagation()}>
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
            <div className="mobile-card-actions__chevron" aria-hidden="true">
              <ChevronRight size={18} />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

export default React.memo(BaseCardList) as typeof BaseCardList;
