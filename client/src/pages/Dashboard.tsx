import React, { useEffect, useState, useMemo } from 'react';
import { repairApi } from '../api';
import { useNotification } from '../components/Layout';
import { useApi } from '../hooks/useApi';
import { Skeleton } from '../components/ui/Skeleton';
import { Activity, RefreshCw, Calendar, BarChart3, Sliders, Boxes, Users } from 'lucide-react';
import { DashSectionHeader } from '../components/dashboard/common';
import ActionQueue from '../components/dashboard/ActionQueue';
import KpiStrip from '../components/dashboard/KpiStrip';
import RepairCharts from '../components/dashboard/RepairCharts';
import InventoryCharts from '../components/dashboard/InventoryCharts';
import PeopleSection from '../components/dashboard/PeopleSection';
import ActivityFeed from '../components/dashboard/ActivityFeed';

/**
 * Dashboard — Command Center layout (flat & clean)
 * โซน 1 "ต้องจัดการ" (real-time, ไม่ขึ้นกับตัวกรอง) → โซนวิเคราะห์ (มีตัวกรองช่วงเวลา)
 * ส่วนแสดงผลแยกอยู่ใน components/dashboard/* — ไฟล์นี้ถือ state + จัดวางโซน
 */
const Dashboard: React.FC = () => {
  const { notify } = useNotification();
  const { data, loading, request: fetchStats } = useApi(
    async (params?: { startDate?: string; endDate?: string }) =>
      await repairApi.getDashboardStats(params)
  );
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [showFilterDropdown, setShowFilterDropdown] = useState<boolean>(false);
  const [refreshTick, setRefreshTick] = useState<number>(0);
  // จำตัวกรองช่วงเวลาไว้ใน localStorage (กลับมาหน้าเดิมแล้วยังอยู่)
  const [quickFilter, setQuickFilter] = useState<string>(() => {
    try { return localStorage.getItem('dashboard_quick_filter') || 'all'; } catch { return 'all'; }
  });
  const [autoRefresh, setAutoRefresh] = useState<boolean>(() => {
    try { return localStorage.getItem('dashboard_auto_refresh') === '1'; } catch { return false; }
  });

  const computeRange = (filterType: string): { startDate: string; endDate: string } => {
    const end = new Date();
    if (filterType === 'all') return { startDate: '', endDate: '' };
    const start = new Date();
    if (filterType === '7_days') start.setDate(end.getDate() - 7);
    else if (filterType === '30_days') start.setDate(end.getDate() - 30);
    else if (filterType === '90_days') start.setDate(end.getDate() - 90);
    const toYYYYMMDD = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    return { startDate: toYYYYMMDD(start), endDate: toYYYYMMDD(end) };
  };

  const [dateRange, setDateRange] = useState<{ startDate: string; endDate: string }>(() => computeRange(quickFilter));

  useEffect(() => {
    const load = async () => {
      try {
        const params: { startDate?: string; endDate?: string } = {};
        if (dateRange.startDate) params.startDate = dateRange.startDate;
        if (dateRange.endDate) params.endDate = dateRange.endDate;
        await fetchStats(params);
        setLastUpdated(new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }));
      } catch {
        notify('ไม่สามารถโหลดข้อมูลสถิติได้', 'error');
      }
    };
    load();
  }, [fetchStats, notify, dateRange, refreshTick]);

  // Auto-refresh ทุก 60 วินาที (เปิด/ปิดได้)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => setRefreshTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const handleQuickFilterChange = (filterType: string) => {
    setQuickFilter(filterType);
    try { localStorage.setItem('dashboard_quick_filter', filterType); } catch { /* ignore */ }
    setDateRange(computeRange(filterType));
  };

  const toggleAutoRefresh = () => {
    setAutoRefresh(prev => {
      const next = !prev;
      try { localStorage.setItem('dashboard_auto_refresh', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  const {
    kpis = { total: 0, pending: 0, in_progress: 0, completed: 0, critical_stock: 0 },
    purchaseOrders = { total_po: 0, pending_po: 0, received_po: 0 },
    analysis = { mostBroken: [], overdue: [], monthlyTrend: [] },
    technicians = [],
    stockMovements = [],
    withdrawalBreakdown = [],
    people = { topRecipients: [], pendingReturns: [], pendingReturnsCount: 0 },
    supervisors = [],
    unassignedStationsCount = 0,
    claimsKpis = { total: 0, pending: 0, in_progress: 0, completed: 0 },
    inventoryConditions = [],
    recentLogs = []
  } = data || {};
  const inventory = data?.inventory || { topUsed: [], leastUsed: [], criticalItems: [], recentTransactions: [], recentWithdrawals: [] };

  const totalWithdrawals = useMemo(
    () => (withdrawalBreakdown || []).reduce((a: number, b: { name: string; count: number }) => a + (b.count || 0), 0),
    [withdrawalBreakdown]
  );

  const filterActive = quickFilter !== 'all';

  // Skeleton เฉพาะโหลดครั้งแรก — refetch คงข้อมูลเดิมไว้ ไม่กระพริบ
  if (!data) {
    return (
      <div style={{ padding: 'var(--main-padding)', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div className="bento-grid" style={{ gap: '1.25rem' }}>
          <Skeleton height="220px" variant="rect" className="dash-span-12" />
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height="110px" variant="rect" className="dash-span-2" />)}
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i + 6} height="280px" variant="rect" className="dash-span-4" />)}
          <Skeleton height="300px" variant="rect" className="dash-span-8" />
          <Skeleton height="300px" variant="rect" className="dash-span-4" />
        </div>
      </div>
    );
  }

  // ตัวกรองช่วงเวลา — วางไว้ที่หัวข้อโซนวิเคราะห์ (โซน "ต้องจัดการ" ไม่ขึ้นกับตัวกรองนี้)
  const filterControl = (
    <div style={{ position: 'relative', zIndex: 50 }}>
      <button
        className="btn btn-outline"
        onClick={() => setShowFilterDropdown(!showFilterDropdown)}
        style={{ borderRadius: '10px', padding: '7px 14px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
      >
        <Calendar size={15} />
        <span>
          {quickFilter === 'all' ? 'ข้อมูลทั้งหมด' :
           quickFilter === '7_days' ? 'ย้อนหลัง 7 วัน' :
           quickFilter === '30_days' ? 'ย้อนหลัง 30 วัน' :
           quickFilter === '90_days' ? 'ย้อนหลัง 90 วัน' : 'ช่วงเวลาที่เลือก'}
        </span>
      </button>

      {showFilterDropdown && (
        <>
          <div
            onClick={() => setShowFilterDropdown(false)}
            style={{ position: 'fixed', inset: 0, zIndex: -1, cursor: 'default' }}
          />
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '180px',
            borderRadius: '12px',
            padding: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            boxShadow: 'var(--elevation-2)'
          }}>
            {[
              { label: 'ข้อมูลทั้งหมด', value: 'all' },
              { label: 'ย้อนหลัง 7 วัน', value: '7_days' },
              { label: 'ย้อนหลัง 30 วัน', value: '30_days' },
              { label: 'ย้อนหลัง 90 วัน', value: '90_days' }
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => {
                  handleQuickFilterChange(opt.value);
                  setShowFilterDropdown(false);
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  background: quickFilter === opt.value ? 'var(--primary-light)' : 'transparent',
                  color: quickFilter === opt.value ? 'var(--primary)' : 'var(--text-main)',
                  fontSize: '0.82rem',
                  fontWeight: quickFilter === opt.value ? 800 : 600,
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  width: '100%'
                }}
                className="dropdown-item-hover"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="dashboard-page" style={{ padding: '0 0 3rem 0', minHeight: '100vh', backgroundColor: 'var(--bg-app)' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: 'var(--main-padding)', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Header */}
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem', marginBottom: 0 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', marginBottom: '2px' }}>
              <Activity size={16} />
              <span style={{ fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.7rem' }}>ศูนย์ปฏิบัติการหลัก</span>
            </div>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>แผงควบคุมการบริหารจัดการ</h2>
            <p style={{ color: 'var(--text-muted)', marginTop: '2px', fontSize: '0.85rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span>สรุปคลังพัสดุและศูนย์ซ่อมบำรุง · อัปเดต {lastUpdated} น.</span>
              {autoRefresh && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.7rem', fontWeight: 800, color: 'var(--success)', background: 'var(--success-light)', border: '1px solid var(--success-border)', padding: '1px 8px', borderRadius: '999px' }}>
                  <span className="live-dot" /> LIVE
                </span>
              )}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="btn btn-outline"
              onClick={toggleAutoRefresh}
              title={autoRefresh ? 'ปิดอัปเดตอัตโนมัติ' : 'เปิดอัปเดตอัตโนมัติ (ทุก 60 วินาที)'}
              aria-label="สลับอัปเดตอัตโนมัติ"
              aria-pressed={autoRefresh}
              style={{
                borderRadius: '10px',
                padding: '8px 14px',
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                ...(autoRefresh ? { borderColor: 'var(--success)', color: 'var(--success)', background: 'var(--success-light)' } : {})
              }}
            >
              <Activity size={15} /> <span>อัตโนมัติ</span>
            </button>
            <button
              className="btn btn-outline"
              onClick={() => setRefreshTick(t => t + 1)}
              title="รีเฟรชข้อมูล"
              aria-label="รีเฟรชข้อมูล"
              style={{ borderRadius: '10px', padding: '8px 12px', fontSize: '0.85rem' }}
            >
              <RefreshCw size={16} style={loading ? { animation: 'spin 0.8s linear infinite' } : undefined} />
            </button>
          </div>
        </div>

        <div className="bento-grid" style={{ gap: '1.25rem' }}>
          {/* ============ Zone 1: ต้องจัดการ (real-time) ============ */}
          <ActionQueue
            overdue={analysis.overdue || []}
            criticalItems={inventory.criticalItems || []}
            pendingReturns={people.pendingReturns || []}
            pendingReturnsCount={people.pendingReturnsCount || 0}
            criticalStockCount={kpis.critical_stock || 0}
            unassignedStationsCount={unassignedStationsCount || 0}
          />

          {/* ============ Zone 2: หัวข้อโซนวิเคราะห์ + ตัวกรองช่วงเวลา ============ */}
          <DashSectionHeader
            icon={<BarChart3 size={17} />}
            title="สถิติและการวิเคราะห์"
            subtitle="ตัวกรองช่วงเวลามีผลกับข้อมูลส่วนนี้ · การ์ดที่แสดงข้อมูลทั้งหมดจะมีป้ายกำกับ"
            action={filterControl}
          />

          {/* ============ Zone 3: KPI strip ============ */}
          <KpiStrip
            kpis={kpis}
            totalWithdrawals={totalWithdrawals}
            pendingPo={purchaseOrders.pending_po || 0}
            pendingReturns={people.pendingReturnsCount || 0}
            criticalStock={kpis.critical_stock || 0}
          />

          {/* Inventory is the primary operating domain. */}
          <DashSectionHeader icon={<Boxes size={17} />} title="ศูนย์ควบคุมคลังพัสดุ" subtitle="ความเคลื่อนไหว สภาพอุปกรณ์ และรายการที่ต้องจับตา" />
          <InventoryCharts
            stockMovements={stockMovements || []}
            inventoryConditions={inventoryConditions || []}
            withdrawalBreakdown={withdrawalBreakdown || []}
            topUsed={inventory.topUsed || []}
            leastUsed={inventory.leastUsed || []}
            filterActive={filterActive}
          />

          <details className="dashboard-disclosure">
            <summary>ข้อมูลวิเคราะห์งานซ่อมและบุคลากร</summary>
            <div className="dashboard-disclosure-content">
              <div className="bento-grid" style={{ gap: '1rem' }}>
                <DashSectionHeader icon={<Sliders size={17} />} title="งานซ่อมและการเคลม" subtitle="สถานะงานซ่อม แนวโน้ม และตั๋วเคลม" />
                <RepairCharts
                  kpis={kpis}
                  monthlyTrend={analysis.monthlyTrend || []}
                  claimsKpis={claimsKpis}
                  mostBroken={analysis.mostBroken || []}
                  technicians={technicians || []}
                  filterActive={filterActive}
                />
                <DashSectionHeader icon={<Users size={17} />} title="บุคลากรและการเบิกจ่าย" subtitle="ผู้รับผิดชอบด่านและผู้เบิกบ่อย" />
                <PeopleSection
                  supervisors={supervisors || []}
                  topRecipients={people.topRecipients || []}
                  unassignedStationsCount={unassignedStationsCount || 0}
                />
              </div>
            </div>
          </details>

          {/* ============ Zone 7: กิจกรรมล่าสุด ============ */}
          <ActivityFeed
            recentLogs={recentLogs || []}
            recentTransactions={inventory.recentTransactions || []}
            filterActive={filterActive}
          />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
