import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Wrench, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import Card from '../ui/Card';
import { ScopeBadge } from './common';
import { timeAgo } from './dashboardUtils';
import type { DashboardData, RepairLog, InventoryTransaction } from '../../types';

interface ActivityFeedProps {
  recentLogs: DashboardData['recentLogs'];
  recentTransactions: DashboardData['inventory']['recentTransactions'];
  filterActive: boolean;
}

interface PulseEvent {
  id: string;
  title: string;
  subtitle: string;
  user: string;
  time: string;
  icon: React.ReactNode;
  color: string;
}

const formatRepairAction = (action: string): string => {
  const normalized = String(action || '').trim();
  if (!normalized) return 'มีการอัปเดตงาน';
  // Some legacy log rows contain replacement characters instead of the Thai
  // status text. Keep the activity useful without exposing unreadable output.
  if (/\?{2,}/.test(normalized)) return 'อัปเดตสถานะงาน';
  return normalized;
};

/** Zone 7 — กิจกรรมล่าสุด: รวม log งานซ่อม + ธุรกรรมสต็อกเป็นฟีดเดียว */
const ActivityFeed: React.FC<ActivityFeedProps> = ({ recentLogs, recentTransactions, filterActive }) => {
  const operationalPulse = useMemo<PulseEvent[]>(() => {
    const repairEvents = (recentLogs || []).map((log: RepairLog & { ticket_no: string; device_name: string }) => ({
      id: `rep-${log.id}`,
      title: log.ticket_no,
      subtitle: `${log.device_name} · ${formatRepairAction(log.action)}`,
      user: log.user,
      time: log.created_at,
      icon: <Wrench size={14} />,
      color: 'var(--primary)'
    }));

    const stockEvents = (recentTransactions || []).map((tx: InventoryTransaction & { product_name: string }) => ({
      id: `stk-${tx.id}`,
      title: tx.product_name,
      subtitle: `${tx.transaction_type === 'ADD_STOCK' ? 'นำเข้า' : tx.transaction_type === 'WITHDRAW' ? 'เบิกจ่าย' : tx.transaction_type === 'RETURN' ? 'คืน' : 'ปรับปรุง'} · ${tx.quantity_added || tx.quantity_withdrawn || tx.quantity_returned || tx.quantity_borrowed} ชิ้น`,
      user: tx.user_name || 'ระบบ',
      time: tx.created_at,
      icon: tx.transaction_type === 'ADD_STOCK' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />,
      color: tx.transaction_type === 'ADD_STOCK' ? 'var(--success)' : 'var(--danger)'
    }));

    return [...repairEvents, ...stockEvents]
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 10);
  }, [recentLogs, recentTransactions]);

  return (
    <Card className="dash-card boot-animate stagger-4 dash-span-12">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '8px', flexWrap: 'wrap' }}>
        <h3 className="dash-card-title">
          <Clock size={18} color="var(--primary)" /> กิจกรรมล่าสุด
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ScopeBadge show={filterActive} label="10 รายการล่าสุด" />
          <Link to="/transactions" style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--primary)', textDecoration: 'none', background: 'var(--primary-light)', padding: '4px 10px', borderRadius: '8px' }}>ดูทั้งหมด →</Link>
        </div>
      </div>
      {operationalPulse.length > 0 ? (
        <div className="dash-activity-grid">
          {operationalPulse.map((event) => (
            <div key={event.id} className="dashboard-list-row" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.7rem', background: 'var(--bg-app)', borderRadius: '8px', border: '1px solid var(--border)', minWidth: 0 }}>
              <div style={{ width: 26, height: 26, borderRadius: '8px', backgroundColor: 'var(--bg-card)', color: event.color, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)' }}>{event.icon}</div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                <span style={{ fontWeight: 700, fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1, minWidth: 0 }}>{event.title}</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>· {event.subtitle}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>{event.user}</span>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: '999px', whiteSpace: 'nowrap' }}>
                  {timeAgo(event.time)}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          ยังไม่มีกิจกรรมล่าสุด
        </div>
      )}
    </Card>
  );
};

export default ActivityFeed;
