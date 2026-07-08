import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Shield, ShoppingBag, AlertCircle, PackageCheck } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import Card from '../ui/Card';
import { chartTooltipStyle, ScopeBadge } from './common';
import type { DashboardData } from '../../types';

interface InventoryChartsProps {
  stockMovements: DashboardData['stockMovements'];
  inventoryConditions: NonNullable<DashboardData['inventoryConditions']>;
  withdrawalBreakdown: DashboardData['withdrawalBreakdown'];
  topUsed: DashboardData['inventory']['topUsed'];
  leastUsed: DashboardData['inventory']['leastUsed'];
  filterActive: boolean;
}

/** Zone 5 — คลังพัสดุ: ความเคลื่อนไหวสต็อก, สภาพอุปกรณ์, ประเภทการเบิก, ใช้บ่อย, dead stock */
const InventoryCharts: React.FC<InventoryChartsProps> = ({
  stockMovements,
  inventoryConditions,
  withdrawalBreakdown,
  topUsed,
  leastUsed,
  filterActive
}) => {
  const conditions = useMemo(() => {
    const find = (c: string) => (inventoryConditions || []).find(x => x.condition === c)?.count || 0;
    return [
      { name: 'สภาพใหม่ (New)', count: find('New'), color: 'var(--primary)' },
      { name: 'สภาพดี (Good)', count: find('Good'), color: 'var(--success)' },
      { name: 'สภาพพอใช้ (Fair)', count: find('Fair'), color: 'var(--warning)' },
      { name: 'ชำรุดชั่วคราว (Broken)', count: find('Broken'), color: 'var(--danger)' }
    ];
  }, [inventoryConditions]);

  const totalInstances = useMemo(() => conditions.reduce((a, b) => a + b.count, 0), [conditions]);

  const maxBreakdown = useMemo(
    () => Math.max(1, ...(withdrawalBreakdown || []).map(b => b.count || 0)),
    [withdrawalBreakdown]
  );

  return (
    <>
      {/* ความเคลื่อนไหวสต็อก — 4 เส้น (เพิ่ม ยืม/คืน ที่ server ส่งมาแต่เดิมไม่แสดง) */}
      <Card className="dash-card boot-animate stagger-2 dash-span-8">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ minWidth: 0 }}>
            <h3 className="dash-card-title">ความเคลื่อนไหวสต็อกพัสดุ</h3>
            <p className="dash-card-subtitle">นำเข้า · เบิกออก · ยืม · คืน ย้อนหลัง 6 เดือน</p>
          </div>
          <ScopeBadge show={filterActive} label="6 เดือนล่าสุด" />
        </div>
        <div style={{ height: '260px', width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stockMovements || []}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 11, fontWeight: 700 }} dy={8} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 11, fontWeight: 700 }} width={30} allowDecimals={false} />
              <Tooltip contentStyle={chartTooltipStyle} itemStyle={{ color: 'var(--text-main)' }} labelStyle={{ color: 'var(--text-muted)', fontWeight: 800 }} />
              <Legend iconType="plainline" wrapperStyle={{ paddingTop: '10px', fontSize: '11px', fontWeight: 700 }} />
              <Line type="monotone" dataKey="added" name="นำเข้า" stroke="var(--primary)" strokeWidth={2.5} dot={false} activeDot={{ r: 3 }} animationDuration={700} />
              <Line type="monotone" dataKey="withdrawn" name="เบิกออก" stroke="var(--secondary)" strokeWidth={2} dot={false} activeDot={{ r: 3 }} animationDuration={700} />
              <Line type="monotone" dataKey="borrowed" name="ยืม" stroke="var(--warning)" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} animationDuration={700} />
              <Line type="monotone" dataKey="returned" name="คืน" stroke="var(--success)" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} animationDuration={700} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* สภาพอุปกรณ์ในคลัง */}
      <Card className="dash-card boot-animate stagger-2 dash-span-4">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', gap: '8px' }}>
          <div style={{ minWidth: 0 }}>
            <h3 className="dash-card-title">สภาพอุปกรณ์ในคลัง</h3>
            <p className="dash-card-subtitle">คัดแยกตามคุณภาพสินค้า (Instances)</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <ScopeBadge show={filterActive} />
            <Shield size={18} color="var(--primary)" />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {conditions.map((item, i) => {
            const percent = totalInstances ? Math.round((item.count / totalInstances) * 100) : 0;
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 700 }}>
                  <span>{item.name}</span>
                  <span>{item.count} ชิ้น ({percent}%)</span>
                </div>
                <div className="dash-bar-track">
                  <div className="dash-bar-fill" style={{ width: `${percent}%`, background: item.color }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ประเภทการเบิก (ใหม่ — เดิมถูกรวมเป็นยอดเดียว) */}
      <Card className="dash-card boot-animate stagger-3 dash-span-4">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div>
            <h3 className="dash-card-title">ประเภทการเบิก</h3>
            <p className="dash-card-subtitle">สัดส่วนใบเบิกแยกตามประเภท</p>
          </div>
          <PackageCheck size={18} color="var(--primary)" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {(withdrawalBreakdown || []).length > 0 ? withdrawalBreakdown.map((item, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 700 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name || 'ไม่ระบุ'}</span>
                <span style={{ flexShrink: 0, marginLeft: '8px' }}>{item.count} รายการ</span>
              </div>
              <div className="dash-bar-track">
                <div className="dash-bar-fill" style={{ width: `${Math.round((item.count / maxBreakdown) * 100)}%`, background: 'var(--primary)' }} />
              </div>
            </div>
          )) : (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              ไม่มีข้อมูลการเบิกในช่วงเวลานี้
            </div>
          )}
        </div>
      </Card>

      {/* พัสดุที่ใช้บ่อย */}
      <Card className="dash-card boot-animate stagger-3 dash-span-4">
        <h3 className="dash-card-title" style={{ marginBottom: '0.85rem' }}>
          <ShoppingBag size={16} color="var(--primary)" /> พัสดุที่ใช้บ่อย Top 5
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {(topUsed || []).length > 0 ? topUsed.slice(0, 5).map((item, i) => (
            <Link key={i} to="/inventory" className="dash-row-link" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 9px', background: 'var(--bg-app)', borderRadius: '8px', textDecoration: 'none', color: 'inherit' }}>
              <div style={{ width: 24, height: 24, background: 'var(--bg-card)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.75rem', color: 'var(--primary)', boxShadow: 'var(--elevation-1)', flexShrink: 0 }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
              <div style={{ fontSize: '0.78rem', fontWeight: 800 }}>{item.count} <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>ชิ้น</span></div>
            </Link>
          )) : (
            <div style={{ textAlign: 'center', padding: '1.5rem 1rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}>ไม่มีข้อมูลการใช้งาน</div>
          )}
        </div>
      </Card>

      {/* Dead stock */}
      <Card className="dash-card boot-animate stagger-3 dash-span-4">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', gap: '8px' }}>
          <div style={{ minWidth: 0 }}>
            <h3 className="dash-card-title">พัสดุไม่มีการเคลื่อนไหว</h3>
            <p className="dash-card-subtitle">Dead Stock (นิ่งเกิน 90 วัน)</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <ScopeBadge show={filterActive} />
            <AlertCircle size={18} color="var(--text-muted)" />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {(leastUsed || []).length > 0 ? leastUsed.map((item, i) => (
            <Link key={i} to="/inventory" className="dash-row-link" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: 'var(--bg-app)', borderRadius: '10px', textDecoration: 'none', color: 'inherit' }}>
              <div style={{ width: 24, height: 24, background: 'var(--secondary)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.75rem', color: 'white', flexShrink: 0 }}>
                !
              </div>
              <div style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                {item.days_idle == null ? 'ไม่เคยเคลื่อนไหว' : `นิ่ง ${item.days_idle} วัน`}
              </div>
            </Link>
          )) : (
            <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--success)', fontWeight: 700, fontSize: '0.85rem' }}>
              ไม่มีสินค้าค้างสต็อก
            </div>
          )}
        </div>
      </Card>
    </>
  );
};

export default InventoryCharts;
