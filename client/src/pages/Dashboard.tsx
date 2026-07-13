import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Bell,
  Boxes,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleCheck,
  PackageOpen,
  RefreshCw,
  ShieldAlert,
  Truck
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { repairApi } from '../api';
import { useNotification } from '../components/Layout';
import { useApi } from '../hooks/useApi';
import { Skeleton } from '../components/ui/Skeleton';
import ChartFrame from '../components/dashboard/ChartFrame';
import type { DashboardData } from '../types';
import Select from '../components/ui/Select';

const tooltipStyle = {
  background: '#0f2940',
  border: '1px solid rgba(129, 212, 250, 0.55)',
  borderRadius: '10px',
  color: '#fff',
  fontSize: 12
};

const formatMonth = (month: string) => {
  const [year, monthNumber] = (month || '').split('-').map(Number);
  if (!year || !monthNumber) return month;
  return new Date(year, monthNumber - 1, 1).toLocaleDateString('th-TH', { month: 'short' });
};

const formatDate = (value?: string) => {
  if (!value) return 'ไม่ระบุวันที่';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
};

const movementLabel = (type?: string) => ({
  ADD_STOCK: 'รับเข้าคลัง',
  WITHDRAW: 'เบิกออก',
  BORROW: 'ยืมอุปกรณ์',
  RETURN: 'รับคืน'
}[type || ''] || 'เคลื่อนไหวคลัง');

const Dashboard: React.FC = () => {
  const { notify } = useNotification();
  const { data, loading, request: fetchStats } = useApi(
    async (params?: { startDate?: string; endDate?: string }) => repairApi.getDashboardStats(params)
  );
  const [lastUpdated, setLastUpdated] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const [quickFilter, setQuickFilter] = useState(() => {
    try { return localStorage.getItem('dashboard_quick_filter') || 'all'; } catch { return 'all'; }
  });
  const [autoRefresh, setAutoRefresh] = useState(() => {
    try { return localStorage.getItem('dashboard_auto_refresh') === '1'; } catch { return false; }
  });

  const computeRange = (filter: string) => {
    if (filter === 'all') return { startDate: '', endDate: '' };
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - Number(filter.replace('_days', '')));
    const toDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { startDate: toDate(start), endDate: toDate(end) };
  };

  const [dateRange, setDateRange] = useState(() => computeRange(quickFilter));

  useEffect(() => {
    const load = async () => {
      try {
        await fetchStats(dateRange.startDate ? dateRange : undefined);
        setLastUpdated(new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }));
      } catch {
        notify('ไม่สามารถโหลดข้อมูล Dashboard ได้', 'error');
      }
    };
    load();
  }, [dateRange, fetchStats, notify, refreshTick]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => setRefreshTick(value => value + 1), 60000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const updateFilter = (value: string) => {
    setQuickFilter(value);
    setDateRange(computeRange(value));
    try { localStorage.setItem('dashboard_quick_filter', value); } catch { /* ignore */ }
  };

  const toggleAutoRefresh = () => {
    setAutoRefresh(value => {
      const next = !value;
      try { localStorage.setItem('dashboard_auto_refresh', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  const fallback: DashboardData = {
    kpis: { total: 0, pending: 0, in_progress: 0, completed: 0, critical_stock: 0 },
    recentJobs: [],
    recentLogs: [],
    technicians: [],
    inventory: { topUsed: [], leastUsed: [], criticalItems: [], recentTransactions: [], recentWithdrawals: [] },
    analysis: { mostBroken: [], overdue: [], monthlyTrend: [] },
    withdrawalBreakdown: [],
    stockMovements: [],
    people: { topRecipients: [], pendingReturns: [], pendingReturnsCount: 0 },
    purchaseOrders: { total_po: 0, pending_po: 0, received_po: 0 },
    claimsKpis: { total: 0, pending: 0, in_progress: 0, completed: 0 },
    inventoryConditions: []
  };
  const dashboard = data || fallback;
  const { kpis, inventory, stockMovements } = dashboard;
  const people = dashboard.people || fallback.people!;
  const purchaseOrders = dashboard.purchaseOrders || fallback.purchaseOrders!;

  const metrics = useMemo(() => {
    const conditionTotal = (dashboard.inventoryConditions || []).reduce((sum, item) => sum + item.count, 0);
    const usableStock = (dashboard.inventoryConditions || [])
      .filter(item => item.condition === 'New' || item.condition === 'Good')
      .reduce((sum, item) => sum + item.count, 0);
    const movementTotal = stockMovements.reduce((sum, item) => sum + item.added + item.withdrawn + item.borrowed + item.returned, 0);
    return {
      warehouseAttention: kpis.critical_stock + (people.pendingReturnsCount || 0) + (purchaseOrders.pending_po || 0),
      usableRate: conditionTotal ? Math.round((usableStock / conditionTotal) * 100) : 0,
      withdrawals: (dashboard.withdrawalBreakdown || []).reduce((sum, item) => sum + item.count, 0),
      movementTotal
    };
  }, [dashboard, kpis, people.pendingReturnsCount, purchaseOrders.pending_po, stockMovements]);

  const warehouseTrend = stockMovements.map(item => ({
    ...item,
    label: formatMonth(item.month),
    total: item.added + item.withdrawn + item.borrowed + item.returned
  }));
  const conditions = [
    { name: 'พร้อมใช้', value: (dashboard.inventoryConditions || []).filter(item => item.condition === 'New' || item.condition === 'Good').reduce((sum, item) => sum + item.count, 0), color: '#2ca878' },
    { name: 'ควรตรวจ', value: (dashboard.inventoryConditions || []).find(item => item.condition === 'Fair')?.count || 0, color: '#e6a23c' },
    { name: 'ชำรุด', value: (dashboard.inventoryConditions || []).find(item => item.condition === 'Broken')?.count || 0, color: '#d95d5d' }
  ];

  if (!data) {
    return (
      <div className="brief-dashboard brief-dashboard--loading">
        <Skeleton height="180px" variant="rect" />
        <Skeleton height="120px" variant="rect" />
        <Skeleton height="340px" variant="rect" />
      </div>
    );
  }

  return (
    <div className="brief-dashboard">
      <header className="brief-dashboard__header">
        <div>
          <div className="brief-dashboard__kicker"><span /> WAREHOUSE / DAILY BRIEF</div>
          <h1>ภาพรวมคลังที่ช่วยให้จัดการได้เร็วขึ้น</h1>
          <p>สรุปจากสต็อก การเบิกจ่าย และรายการค้าง · อัปเดตล่าสุด {lastUpdated || 'กำลังโหลด'} น.</p>
        </div>
        <div className="brief-dashboard__controls">
          <div className="brief-dashboard__select"><CalendarDays size={15} /><Select value={quickFilter} onChange={value => updateFilter(String(value))} ariaLabel="ช่วงเวลาข้อมูล" options={[{ value: 'all', label: 'ข้อมูลทั้งหมด' }, { value: '7_days', label: '7 วันล่าสุด' }, { value: '30_days', label: '30 วันล่าสุด' }, { value: '90_days', label: '90 วันล่าสุด' }]} /></div>
          <button className={`brief-dashboard__icon-button${autoRefresh ? ' is-active' : ''}`} onClick={toggleAutoRefresh} title="เปิดหรือปิดการอัปเดตอัตโนมัติ" aria-pressed={autoRefresh}><Activity size={16} /></button>
          <button className="brief-dashboard__icon-button" onClick={() => setRefreshTick(value => value + 1)} title="รีเฟรชข้อมูล"><RefreshCw size={16} className={loading ? 'brief-dashboard__spin' : ''} /></button>
        </div>
      </header>

      <section className="brief-hero">
        <div className="brief-hero__focus">
          <div className="brief-hero__eyebrow"><span /> WAREHOUSE FOCUS <b>{new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</b></div>
          <div className="brief-hero__headline">
            <div><small>รายการคลังที่ต้องติดตาม</small><strong>{metrics.warehouseAttention}</strong><p>รวมสต็อกวิกฤต ของค้างคืน และ PO ที่ยังรอตรวจรับ</p></div>
            <Link to="/inventory" className="brief-hero__action">เปิดคลัง <ArrowUpRight size={16} /></Link>
          </div>
          <div className="brief-hero__signals">
            <Signal label="สต็อกวิกฤต" value={kpis.critical_stock} tone="danger" to="/inventory" />
            <Signal label="ค้างคืน" value={people.pendingReturnsCount || 0} tone="info" to="/pending-returns" />
            <Signal label="PO รอรับ" value={purchaseOrders.pending_po} tone="neutral" to="/purchase-orders" />
            <Signal label="เบิกจ่าย" value={metrics.withdrawals} tone="warning" to="/withdrawal-history" />
          </div>
        </div>
        <div className="brief-hero__pulse">
          <div className="brief-card-heading brief-card-heading--light"><div><span>STOCK PULSE</span><p>การเคลื่อนไหว 6 เดือนล่าสุด</p></div><b>{warehouseTrend.at(-1)?.total || 0}<small>หน่วยล่าสุด</small></b></div>
          <ChartFrame height={116}>{({ width, height }) => <AreaChart width={width} height={height} data={warehouseTrend} margin={{ top: 12, right: 4, left: -28, bottom: 0 }}><defs><linearGradient id="briefPulse" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d8f3ff" stopOpacity={0.58} /><stop offset="100%" stopColor="#d8f3ff" stopOpacity={0} /></linearGradient></defs><XAxis dataKey="label" hide /><YAxis hide /><Tooltip contentStyle={tooltipStyle} /><Area type="monotone" dataKey="total" name="หน่วยเคลื่อนไหว" stroke="#e4f8ff" fill="url(#briefPulse)" strokeWidth={2.5} dot={false} /></AreaChart>}</ChartFrame>
          <div className="brief-pulse-footer"><span>หน่วยเคลื่อนไหวรวม</span><strong>{metrics.movementTotal}</strong><span className="brief-pulse-footer__hint">เบิกจ่าย {metrics.withdrawals} รายการ</span></div>
        </div>
      </section>

      <section className="brief-metric-grid" aria-label="ตัวชี้วัดหลัก">
        <MetricCard icon={<ShieldAlert size={17} />} label="สต็อกวิกฤต" value={kpis.critical_stock} note="รายการต่ำกว่าจุดสั่งซื้อ" to="/inventory" tone="amber" />
        <MetricCard icon={<Truck size={17} />} label="เบิกจ่าย" value={metrics.withdrawals} note="รายการเบิกในช่วงที่เลือก" to="/withdrawal-history" tone="blue" />
        <MetricCard icon={<PackageOpen size={17} />} label="รายการค้างคืน" value={people.pendingReturnsCount || 0} note="รอติดตามการรับคืน" to="/pending-returns" tone="violet" />
        <MetricCard icon={<Boxes size={17} />} label="สุขภาพคลัง" value={`${metrics.usableRate}%`} note="สัดส่วนพัสดุพร้อมใช้งาน" to="/inventory" tone="green" />
      </section>

      <SectionHeading eyebrow="WAREHOUSE SNAPSHOT" title="ภาพรวมคลังและการเคลื่อนไหว" />
      <section className="brief-grid brief-grid--primary">
        <article className="brief-card brief-card--trend">
          <PanelTitle icon={<BarChart3 size={16} />} title="การเคลื่อนไหวคลัง" note="รับเข้า เบิกออก ยืม และรับคืนรายเดือน" action={<Link to="/transactions">ดูรายการ <ChevronRight size={14} /></Link>} />
          <ChartFrame height={250}>{({ width, height }) => <BarChart width={width} height={height} data={stockMovements} barCategoryGap="24%" margin={{ top: 12, right: 8, left: -18, bottom: 0 }}><CartesianGrid vertical={false} stroke="var(--brief-line)" /><XAxis dataKey="month" tickFormatter={formatMonth} axisLine={false} tickLine={false} tick={{ fill: 'var(--brief-muted)', fontSize: 11, fontWeight: 700 }} dy={10} /><YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--brief-muted)', fontSize: 11 }} allowDecimals={false} width={28} /><Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(41,182,246,0.08)' }} /><Bar dataKey="added" name="รับเข้า" fill="#2ca878" radius={[5, 5, 0, 0]} /><Bar dataKey="withdrawn" name="เบิกออก" fill="#df7c52" radius={[5, 5, 0, 0]} /><Bar dataKey="borrowed" name="ยืม" fill="var(--primary)" radius={[5, 5, 0, 0]} /><Bar dataKey="returned" name="คืน" fill="#6aa9d8" radius={[5, 5, 0, 0]} /></BarChart>}</ChartFrame>
        </article>
        <article className="brief-card brief-card--priority">
          <PanelTitle icon={<Bell size={16} />} title="คิวงานคลัง" note="รายการที่ต้องจัดการก่อน" action={<Link to="/inventory">เปิดคลัง <ChevronRight size={14} /></Link>} />
          <div className="brief-priority-list">
            <PriorityRow icon={<ShieldAlert size={15} />} label="สต็อกวิกฤต" value={kpis.critical_stock} detail={inventory.criticalItems[0]?.name || 'ไม่มีรายการ'} tone="danger" to="/inventory" />
            <PriorityRow icon={<PackageOpen size={15} />} label="รายการค้างคืน" value={people.pendingReturnsCount || 0} detail={people.pendingReturns[0]?.product_name || 'ไม่มีรายการ'} tone="info" to="/pending-returns" />
            <PriorityRow icon={<Truck size={15} />} label="PO รอตรวจรับ" value={purchaseOrders.pending_po} detail="ติดตามการรับเข้าคลัง" tone="neutral" to="/purchase-orders" />
            <PriorityRow icon={<Boxes size={15} />} label="การเบิกจ่าย" value={metrics.withdrawals} detail={inventory.recentTransactions[0]?.product_name || 'ยังไม่มีรายการล่าสุด'} tone="warning" to="/withdrawal-history" />
          </div>
        </article>
      </section>

      <section className="brief-grid brief-grid--secondary">
        <article className="brief-card brief-card--stock">
          <PanelTitle icon={<Boxes size={16} />} title="วัสดุที่ถูกเบิกบ่อย" note="Top 5 จากรายการเบิกจ่าย" action={<Link to="/withdrawal-history">ดูประวัติ <ChevronRight size={14} /></Link>} />
          <div className="brief-ranking">{inventory.topUsed.slice(0, 5).map((item, index) => <div className="brief-ranking-row" key={item.name}><span>{String(index + 1).padStart(2, '0')}</span><b>{item.name}</b><strong>{item.count} ชิ้น</strong></div>)}{inventory.topUsed.length === 0 && <Empty text="ยังไม่มีข้อมูลการเบิกจ่าย" />}</div>
        </article>
        <article className="brief-card brief-card--condition">
          <PanelTitle icon={<CircleCheck size={16} />} title="สุขภาพสินทรัพย์" note={`พร้อมใช้งาน ${metrics.usableRate}%`} action={<Link to="/inventory">เปิดคลัง <ChevronRight size={14} /></Link>} />
          <div className="brief-condition"><div className="brief-condition__chart"><ChartFrame height={182}>{({ width, height }) => <PieChart width={width} height={height}><Pie data={conditions} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={72} paddingAngle={3} stroke="var(--brief-surface)" strokeWidth={3}>{conditions.map(item => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip contentStyle={tooltipStyle} /></PieChart>}</ChartFrame><div className="brief-condition__center"><strong>{metrics.usableRate}%</strong><span>พร้อมใช้</span></div></div><div className="brief-condition__legend">{conditions.map(item => <div key={item.name}><span><i style={{ background: item.color }} />{item.name}</span><b>{item.value}</b></div>)}</div></div>
          <div className="brief-condition__note"><CircleCheck size={14} /> สินทรัพย์ที่พร้อมใช้งานยังเป็นสัดส่วนหลักของคลัง</div>
        </article>
      </section>

      <SectionHeading eyebrow="WAREHOUSE ACTIVITY" title="รายการคลังล่าสุดและงานสนับสนุน" />
      <section className="brief-grid brief-grid--bottom">
        <article className="brief-card">
          <PanelTitle icon={<PackageOpen size={16} />} title="ธุรกรรมคลังล่าสุด" note="5 รายการล่าสุด" action={<Link to="/transactions">ดูทั้งหมด <ChevronRight size={14} /></Link>} />
          <div className="brief-list">{inventory.recentTransactions.slice(0, 5).map(item => <Link to="/transactions" className="brief-list-row" key={item.id}><span className="brief-list-row__icon"><PackageOpen size={14} /></span><span><b>{item.product_name}</b><small>{movementLabel(item.transaction_type)} · {formatDate(item.created_at)}</small></span><ChevronRight size={14} /></Link>)}{inventory.recentTransactions.length === 0 && <Empty text="ยังไม่มีธุรกรรมล่าสุด" />}</div>
        </article>
        <article className="brief-card">
          <PanelTitle icon={<Truck size={16} />} title="รายการเบิกจ่ายล่าสุด" note="ผู้รับ ประเภท และวันที่เบิก" action={<Link to="/withdrawal-history">ดูทั้งหมด <ChevronRight size={14} /></Link>} />
          <div className="brief-list">{inventory.recentWithdrawals.slice(0, 5).map(item => <Link to={`/withdrawal/${item.id}`} className="brief-list-row" key={item.id}><span className="brief-list-row__icon"><Truck size={14} /></span><span><b>{item.recipient || 'ไม่ระบุผู้รับ'}</b><small>{item.type} · {formatDate(item.created_at)}</small></span><ChevronRight size={14} /></Link>)}{inventory.recentWithdrawals.length === 0 && <Empty text="ยังไม่มีรายการเบิกจ่าย" />}</div>
        </article>
        <article className="brief-card brief-card--summary">
          <PanelTitle icon={<CheckCircle2 size={16} />} title="สรุปสถานะคลัง" note="ตัวเลขที่ควรเห็นในภาพเดียว" />
          <SummaryRow label="PO รับเข้าแล้ว" value={purchaseOrders.received_po} tone="green" />
          <SummaryRow label="PO รอตรวจรับ" value={purchaseOrders.pending_po} tone="amber" />
          <SummaryRow label="รายการค้างคืน" value={people.pendingReturnsCount || 0} tone="blue" />
          <SummaryRow label="สต็อกวิกฤต" value={kpis.critical_stock} tone="red" />
          <Link to="/inventory" className="brief-card-link">ดูภาพรวมคลัง <ArrowUpRight size={14} /></Link>
        </article>
      </section>
    </div>
  );
};

const Signal = ({ label, value, tone, to }: { label: string; value: number; tone: string; to: string }) => <Link to={to} className={`brief-signal is-${tone}`}><span>{label}</span><strong>{value}</strong><ChevronRight size={13} /></Link>;
const MetricCard = ({ icon, label, value, note, to, tone }: { icon: React.ReactNode; label: string; value: string | number; note: string; to: string; tone: string }) => <Link to={to} className={`brief-metric is-${tone}`}><span className="brief-metric__icon">{icon}</span><span className="brief-metric__label">{label}</span><strong>{value}</strong><small>{note}</small><ArrowUpRight className="brief-metric__arrow" size={15} /></Link>;
const SectionHeading = ({ eyebrow, title }: { eyebrow: string; title: string }) => <div className="brief-section-heading"><span>{eyebrow}</span><h2>{title}</h2><i /></div>;
const PanelTitle = ({ icon, title, note, action }: { icon: React.ReactNode; title: string; note: string; action?: React.ReactNode }) => <div className="brief-card-heading"><div><h3><span>{icon}</span>{title}</h3><p>{note}</p></div>{action}</div>;
const PriorityRow = ({ icon, label, value, detail, tone, to }: { icon: React.ReactNode; label: string; value: number; detail: string; tone: string; to: string }) => <Link to={to} className={`brief-priority-row is-${tone}`}><span className="brief-priority-row__icon">{icon}</span><span><b>{label}</b><small>{detail}</small></span><strong>{value}</strong><ChevronRight size={15} /></Link>;
const SummaryRow = ({ label, value, tone }: { label: string; value: number; tone: string }) => <div className="brief-summary-row"><i className={`is-${tone}`} /><b>{label}</b><strong>{value}</strong></div>;
const Empty = ({ text }: { text: string }) => <div className="brief-empty"><CheckCircle2 size={16} />{text}</div>;

export default Dashboard;
