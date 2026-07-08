import React from 'react';
import { Link } from 'react-router-dom';
import { Sliders, Inbox, Wrench, Check, PackageCheck, FileSignature, ArrowUpRight } from 'lucide-react';
import Card from '../ui/Card';
import Counter from '../ui/Counter';
import type { DashboardData } from '../../types';

interface KpiStripProps {
  kpis: DashboardData['kpis'];
  totalWithdrawals: number;
  pendingPo: number;
}

/** Zone 3 — แถบ KPI 6 ตัว (ทุกตัวตอบสนองตัวกรองช่วงเวลา) */
const KpiStrip: React.FC<KpiStripProps> = ({ kpis, totalWithdrawals, pendingPo }) => {
  const tiles = [
    { label: 'งานแจ้งซ่อม', value: kpis.total, icon: Sliders, color: 'var(--primary)', bg: 'var(--primary-light)', to: '/repairs' },
    { label: 'รอดำเนินการ', value: kpis.pending, icon: Inbox, color: 'var(--danger)', bg: 'var(--danger-light)', to: '/repairs?status=รอดำเนินการ' },
    { label: 'กำลังซ่อม', value: kpis.in_progress, icon: Wrench, color: 'var(--warning)', bg: 'var(--warning-light)', to: '/repairs?status=กำลังซ่อม' },
    { label: 'เสร็จสิ้น', value: kpis.completed, icon: Check, color: 'var(--success)', bg: 'var(--success-light)', to: '/repairs?status=เสร็จสิ้น' },
    { label: 'ใบเบิกทั้งหมด', value: totalWithdrawals, icon: PackageCheck, color: 'var(--primary)', bg: 'var(--primary-light)', to: '/withdrawal-history' },
    { label: 'PO รอรับ', value: pendingPo, icon: FileSignature, color: 'var(--primary)', bg: 'var(--primary-light)', to: '/purchase-orders' }
  ];

  return (
    <>
      {tiles.map((k, i) => (
        <Link key={i} to={k.to} className="boot-animate stagger-1 dash-span-2" style={{ textDecoration: 'none' }}>
          <Card className="dash-card kpi-tile" style={{ height: '100%', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '8px' }}>
            <ArrowUpRight size={14} className="kpi-tile-arrow" style={{ position: 'absolute', top: '10px', right: '10px' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              <div style={{ width: 30, height: 30, background: k.bg, color: k.color, borderRadius: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <k.icon size={16} />
              </div>
              <div style={{ fontSize: '1.7rem', fontWeight: 800, lineHeight: 1, color: 'var(--text-main)', fontFamily: 'Outfit' }}>
                <Counter end={k.value} />
              </div>
            </div>
            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
              {k.label}
            </div>
          </Card>
        </Link>
      ))}
    </>
  );
};

export default KpiStrip;
