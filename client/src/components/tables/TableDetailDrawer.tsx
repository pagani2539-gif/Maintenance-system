import React from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/Button';
import AppDialog from '../ui/AppDialog';

interface TableDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const TableDetailDrawer: React.FC<TableDetailDrawerProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  children 
}) => {
  return (
    <AppDialog isOpen={isOpen} onClose={onClose} title={title} variant="drawer">
      <div
        style={{
          width: '100%', 
          backgroundColor: 'var(--bg-app)', 
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        }}
      >
        <div style={{ 
          padding: '1.25rem 1.5rem', 
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'var(--bg-card)'
        }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>{title}</h3>
          <Button variant="outline" size="sm" onClick={onClose} icon={<X size={18} />} aria-label="ปิดรายละเอียด" style={{ border: 'none' }} />
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {children}
        </div>
      </div>
    </AppDialog>
  );
};

export default React.memo(TableDetailDrawer);
