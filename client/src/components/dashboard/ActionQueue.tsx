import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ShieldAlert, Hourglass, MapPin, Check, ChevronRight, ClipboardList } from 'lucide-react';
import Card from '../ui/Card';
import type { DashboardData } from '../../types';

type OverdueJob = DashboardData['analysis']['overdue'][number];
type CriticalItem = DashboardData['inventory']['criticalItems'][number];
type PendingReturn = NonNullable<DashboardData['people']>['pendingReturns'][number];

interface ActionItem {
  key: string;
  category: 'sla' | 'stock' | 'return';
  severity: 'danger' | 'warning';
  badge: string;
  title: string;
  meta?: string;
  metric: string;
  urgency: number;
  to: string;
  /** สัดส่วนสต็อกคงเหลือ 0-1 (เฉพาะรายการสต็อกวิกฤต) */
  progress?: number;
}

interface ActionQueueProps {
  overdue: OverdueJob[];
  criticalItems: CriticalItem[];
  pendingReturns: PendingReturn[];
  pendingReturnsCount: number;
  criticalStockCount: number;
  unassignedStationsCount: number;
}

const MAX_ROWS = 9;

const CATEGORY_LINKS: Record<ActionItem['category'], { label: string; to: string }> = {
  sla: { label: 'งานซ่อมทั้งหมด', to: '/repairs' },
  stock: { label: 'คลังพัสดุ', to: '/inventory' },
  return: { label: 'รายการค้างคืน', to: '/pending-returns' }
};

/** Zone 1 — "ต้องจัดการ": รวมงานเกิน SLA + สต็อกวิกฤต + ค้างคืน เป็นคิวเดียว
 *  ข้อมูลโซนนี้เป็นสถานะปัจจุบันเสมอ ไม่ขึ้นกับตัวกรองช่วงเวลา */
const ActionQueue: React.FC<ActionQueueProps> = ({
  overdue,
  criticalItems,
  pendingReturns,
  pendingReturnsCount,
  criticalStockCount,
  unassignedStationsCount
}) => {
  const items = useMemo<ActionItem[]>(() => {
    const list: ActionItem[] = [];
    (overdue || []).forEach((job, i) => list.push({
      key: `sla-${i}`,
      category: 'sla',
      severity: 'danger',
      badge: 'เกิน SLA',
      title: `${job.ticket_no} · ${job.device_name}`,
      meta: `โดย ${job.reporter}`,
      metric: `เกิน ${job.days_over} วัน`,
      urgency: job.days_over,
      to: job.id ? `/repairs/${job.id}` : '/repairs'
    }));
    (criticalItems || []).forEach((item, i) => list.push({
      key: `stock-${i}`,
      category: 'stock',
      severity: 'danger',
      badge: 'สต็อกวิกฤต',
      title: item.name,
      metric: `เหลือ ${item.quantity}/${item.min_stock}`,
      urgency: Math.max(0, item.min_stock - item.quantity),
      to: '/inventory',
      progress: item.min_stock > 0 ? Math.min(1, item.quantity / item.min_stock) : 1
    }));
    (pendingReturns || []).forEach((r, i) => list.push({
      key: `return-${i}`,
      category: 'return',
      severity: r.days_out >= 14 ? 'danger' : 'warning',
      badge: 'ค้างคืน',
      title: r.product_name,
      meta: `${r.name || 'ไม่ระบุ'}${r.serial_number ? ` · S/N ${r.serial_number}` : ''}`,
      metric: `${r.days_out} วัน`,
      urgency: r.days_out,
      to: '/pending-returns'
    }));
    // เรียง: danger ก่อน warning แล้วไล่ตามระดับความเร่งด่วนมาก→น้อย
    return list.sort((a, b) =>
      a.severity === b.severity
        ? b.urgency - a.urgency
        : a.severity === 'danger' ? -1 : 1
    );
  }, [overdue, criticalItems, pendingReturns]);

  const visible = items.slice(0, MAX_ROWS);

  // หมวดที่โดนตัดออกจากคิว (เกิน MAX_ROWS) → ลิงก์ "ดูทั้งหมด" ท้ายการ์ด
  const cutCategories = useMemo(() => {
    const shown = new Set(visible.map(i => i.category));
    const all = new Set(items.map(i => i.category));
    return [...all].filter(c => !shown.has(c) || items.filter(i => i.category === c).length > visible.filter(i => i.category === c).length);
  }, [items, visible]);

  const chips = [
    { label: 'งานเกิน SLA', count: overdue?.length || 0, severity: 'danger' as const, icon: <AlertCircle size={17} />, to: '/repairs' },
    { label: 'สต็อกวิกฤต', count: criticalStockCount, severity: 'danger' as const, icon: <ShieldAlert size={17} />, to: '/inventory' },
    { label: 'ค้างคืน', count: pendingReturnsCount, severity: 'warning' as const, icon: <Hourglass size={17} />, to: '/pending-returns' },
    { label: 'ด่านไม่มีผู้ดูแล', count: unassignedStationsCount, severity: 'warning' as const, icon: <MapPin size={17} />, to: '/stations' }
  ];

  const hiddenCount = items.length - visible.length;

  return (
    <Card className="dash-card boot-animate stagger-0 dash-span-12">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h3 className="dash-card-title" style={{ fontSize: '1.05rem' }}>
            <ClipboardList size={18} color="var(--primary)" /> ต้องจัดการ
          </h3>
          <p className="dash-card-subtitle">งานเกินกำหนด สต็อกวิกฤต และของค้างคืน · สถานะปัจจุบัน ไม่ขึ้นกับตัวกรองช่วงเวลา</p>
        </div>
      </div>

      {/* แถบสรุปจำนวน 4 หมวด */}
      <div className="dash-attn-strip">
        {chips.map((c, i) => (
          <Link key={i} to={c.to} className={`dash-attn-chip${c.count > 0 ? ` dash-attn-chip--${c.severity}` : ''}`}>
            <div className="chip-top">
              {c.icon}
              <span className="chip-count">{c.count}</span>
            </div>
            <div className="chip-label">{c.label}</div>
          </Link>
        ))}
      </div>

      {/* คิวรวมเรียงตามความเร่งด่วน */}
      {visible.length > 0 ? (
        <div className="dash-action-grid">
          {visible.map(item => (
            <Link key={item.key} to={item.to} className={`dash-row-link dash-action-row dash-action-row--${item.severity}`}>
              <span className={`dash-badge dash-badge--${item.severity}`}>{item.badge}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-main)' }}>
                  {item.title}
                </div>
                {item.meta && (
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.meta}
                  </div>
                )}
                {item.progress !== undefined && (
                  <div className="dash-bar-track" style={{ height: '4px', marginTop: '5px' }}>
                    <div className="dash-bar-fill" style={{ width: `${Math.round(item.progress * 100)}%`, background: 'var(--danger)' }} />
                  </div>
                )}
              </div>
              <span style={{ fontSize: '0.74rem', fontWeight: 800, color: item.severity === 'danger' ? 'var(--danger-on-tint)' : 'var(--warning)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {item.metric}
              </span>
              <ChevronRight size={14} className="dash-row-chevron" style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            </Link>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--success)', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <Check size={18} /> ไม่มีรายการต้องจัดการ ระบบเรียบร้อยดี
        </div>
      )}

      {hiddenCount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem', marginTop: '0.75rem', fontSize: '0.75rem', fontWeight: 700, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text-muted)' }}>ยังมีอีก {hiddenCount} รายการ:</span>
          {cutCategories.map(c => (
            <Link key={c} to={CATEGORY_LINKS[c].to} style={{ color: 'var(--primary)', textDecoration: 'none' }}>
              {CATEGORY_LINKS[c].label} →
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
};

export default ActionQueue;
