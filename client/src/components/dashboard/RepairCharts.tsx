import React from 'react';
import { Inbox, HardDrive, Users, TrendingUp } from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import Card from '../ui/Card';
import Counter from '../ui/Counter';
import { ScopeBadge } from './common';
import { chartTooltipStyle } from './dashboardUtils';
import type { DashboardData } from '../../types';

interface RepairChartsProps {
  kpis: DashboardData['kpis'];
  monthlyTrend: DashboardData['analysis']['monthlyTrend'];
  claimsKpis: NonNullable<DashboardData['claimsKpis']>;
  mostBroken: DashboardData['analysis']['mostBroken'];
  technicians: DashboardData['technicians'];
  filterActive: boolean;
}

/** 'YYYY-MM' → ชื่อเดือนไทยแบบย่อ */
const formatMonth = (m: string): string => {
  const [y, mo] = (m || '').split('-').map(Number);
  if (!y || !mo) return m;
  return new Date(y, mo - 1, 1).toLocaleDateString('th-TH', { month: 'short' });
};

/** Zone 4 — งานซ่อมและการเคลม: donut สถานะ, แนวโน้มรายเดือน, สถิติเคลม, อุปกรณ์เสียบ่อย, ภาระงานช่าง */
const RepairCharts: React.FC<RepairChartsProps> = ({ kpis, monthlyTrend, claimsKpis, mostBroken, technicians, filterActive }) => {
  const statusPieData = [
    { name: 'รอดำเนินการ', value: kpis.pending, color: 'var(--danger)' },
    { name: 'กำลังซ่อม', value: kpis.in_progress, color: 'var(--warning)' },
    { name: 'เสร็จสิ้น', value: kpis.completed, color: 'var(--success)' }
  ];

  const trendData = (monthlyTrend || []).map(t => ({ ...t, label: formatMonth(t.month) }));
  const latestTrend = trendData.length > 0 ? trendData[trendData.length - 1].count : 0;

  return (
    <>
      {/* สัดส่วนสถานะงานซ่อม (donut) */}
      <Card className="dash-card boot-animate stagger-2 dash-span-4">
        <h3 className="dash-card-title" style={{ marginBottom: '1rem' }}>สัดส่วนสถานะงานซ่อม</h3>
        <div style={{ position: 'relative', height: '170px', width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={statusPieData} cx="50%" cy="50%" innerRadius={52} outerRadius={70} paddingAngle={2} dataKey="value" animationBegin={100} animationDuration={600}>
                {statusPieData.map((entry, index) => <Cell key={index} fill={entry.color} stroke="var(--bg-card)" strokeWidth={2} />)}
              </Pie>
              <Tooltip contentStyle={chartTooltipStyle} itemStyle={{ color: 'var(--text-main)' }} labelStyle={{ color: 'var(--text-muted)', fontWeight: 800 }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, fontFamily: 'Outfit', lineHeight: 1 }}>
              <Counter end={kpis.total} />
            </div>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', marginTop: '3px' }}>งานทั้งหมด</div>
          </div>
        </div>
        <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {statusPieData.map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--bg-app)', borderRadius: '8px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', fontWeight: 700 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />{item.name}
              </span>
              <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-main)' }}>{item.value}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* แนวโน้มงานแจ้งซ่อมรายเดือน (ใหม่ — เดิม server ส่งมาแต่ไม่ได้แสดง) */}
      <Card className="dash-card boot-animate stagger-2 dash-span-4">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', gap: '8px' }}>
          <div style={{ minWidth: 0 }}>
            <h3 className="dash-card-title"><TrendingUp size={16} color="var(--primary)" /> แนวโน้มงานแจ้งซ่อม</h3>
            <p className="dash-card-subtitle">จำนวนงานรายเดือน · 6 เดือนล่าสุด</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
            <ScopeBadge show={filterActive} label="6 เดือนล่าสุด" />
            <div style={{ fontSize: '1.2rem', fontWeight: 800, fontFamily: 'Outfit', color: 'var(--primary)', lineHeight: 1 }}>
              {latestTrend}
              <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', marginLeft: '4px' }}>เดือนนี้</span>
            </div>
          </div>
        </div>
        <div style={{ height: '210px', width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trendData}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 10, fontWeight: 700 }} dy={6} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 10, fontWeight: 700 }} width={26} allowDecimals={false} />
              <Tooltip cursor={{ fill: 'var(--primary-light)' }} contentStyle={chartTooltipStyle} itemStyle={{ color: 'var(--text-main)' }} labelStyle={{ color: 'var(--text-muted)', fontWeight: 800 }} />
              <Bar dataKey="count" name="งานแจ้งซ่อม" fill="var(--primary)" barSize={20} radius={[4, 4, 0, 0]} animationDuration={600} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* สถิติใบส่งเคลม */}
      <Card className="dash-card boot-animate stagger-2 dash-span-4">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div>
            <h3 className="dash-card-title">สถิติใบส่งเคลมอุปกรณ์</h3>
            <p className="dash-card-subtitle">ประกัน / เคลมภายนอก (Claim Tickets)</p>
          </div>
          <Inbox size={18} color="var(--primary)" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {[
            { name: 'ตั๋วส่งเคลมทั้งหมด', value: claimsKpis?.total || 0, color: 'var(--text-main)', bg: 'var(--bg-app)' },
            { name: 'รอดำเนินการ', value: claimsKpis?.pending || 0, color: 'var(--danger)', bg: 'var(--danger-light)' },
            { name: 'กำลังดำเนินการเคลม', value: claimsKpis?.in_progress || 0, color: 'var(--warning)', bg: 'var(--warning-light)' },
            { name: 'เคลมสำเร็จเสร็จสิ้น', value: claimsKpis?.completed || 0, color: 'var(--success)', bg: 'var(--success-light)' }
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: item.bg, borderRadius: '8px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: item.color }}>{item.name}</span>
              <span style={{ fontWeight: 800, fontSize: '0.95rem', color: item.color }}>{item.value}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* อุปกรณ์ส่งซ่อมบ่อย */}
      <Card className="dash-card boot-animate stagger-3 dash-span-6">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div>
            <h3 className="dash-card-title">สุขภาพอุปกรณ์</h3>
            <p className="dash-card-subtitle">ส่งซ่อมบ่อยที่สุด 5 อันดับ</p>
          </div>
          <HardDrive size={18} color="var(--primary)" />
        </div>
        <div style={{ height: '200px', width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={mostBroken} layout="vertical" margin={{ left: -20 }}>
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-main)', fontSize: 10, fontWeight: 700 }} width={90} />
              <Tooltip cursor={{ fill: 'var(--primary-light)' }} contentStyle={chartTooltipStyle} itemStyle={{ color: 'var(--text-main)' }} labelStyle={{ color: 'var(--text-muted)', fontWeight: 800 }} />
              <Bar dataKey="count" name="จำนวนครั้ง" radius={[0, 6, 6, 0]} barSize={16} animationDuration={600}>
                {(mostBroken || []).map((_entry, index) => (
                  <Cell key={index} fill={index === 0 ? 'var(--danger)' : 'var(--secondary)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* ภาระงานช่าง */}
      <Card className="dash-card boot-animate stagger-3 dash-span-6">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div>
            <h3 className="dash-card-title">ภาระงานช่าง</h3>
            <p className="dash-card-subtitle">การกระจายงานในทีมเทคนิค</p>
          </div>
          <Users size={18} color="var(--primary)" />
        </div>
        <div style={{ height: '200px', width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={technicians} layout="vertical" margin={{ left: -20 }}>
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-main)', fontSize: 10, fontWeight: 700 }} width={70} />
              <Tooltip cursor={{ fill: 'var(--primary-light)' }} contentStyle={chartTooltipStyle} itemStyle={{ color: 'var(--text-main)' }} labelStyle={{ color: 'var(--text-muted)', fontWeight: 800 }} />
              <Bar dataKey="active" stackId="a" fill="var(--warning)" name="กำลังทำ" barSize={14} animationDuration={600} />
              <Bar dataKey="completed" stackId="a" fill="var(--success)" name="เสร็จแล้ว" radius={[0, 6, 6, 0]} barSize={14} animationDuration={700} />
              <Legend iconType="circle" wrapperStyle={{ paddingTop: '12px', fontSize: '10px', fontWeight: 700 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </>
  );
};

export default RepairCharts;
