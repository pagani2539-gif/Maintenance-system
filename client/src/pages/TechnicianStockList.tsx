import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { technicianApi, technicianStockApi } from '../api';
import { useNotification } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useApi } from '../hooks/useApi';
import { Button } from '../components/ui/Button';
import { BackButton } from '../components/ui/BackButton';
import { Card } from '../components/ui/Card';
import { Link } from 'react-router-dom';
import {
  Truck, PackageOpen, Undo2, User, Boxes, Wrench, Package, Tag, FileClock, Plus,
} from 'lucide-react';
import type { TechnicianKitSummary, Technician, TechnicianHoldingsDetail } from '../types';
import type { TableColumn, TableAction } from '../types/table.types';
import BaseDataTable from '../components/tables/BaseDataTable';
import TableToolbar from '../components/tables/TableToolbar';
import TablePagination from '../components/tables/TablePagination';
import { useTableUrlState } from '../hooks/useTableUrlState';
import TechnicianStockActionModal, { type TechnicianStockMode } from '../components/TechnicianStockActionModal';

// Drawer body — fetches the selected technician's current kit on open.
const KitDrawer: React.FC<{ technicianId: number; fullName: string }> = ({ technicianId, fullName }) => {
  const [detail, setDetail] = useState<TechnicianHoldingsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    technicianStockApi.getHoldings(technicianId)
      .then((d) => { if (alive) setDetail(d); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [technicianId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <section>
        <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', color: 'var(--primary)' }}>
          <Boxes size={18} /> อะไหล่ในมือช่าง
        </h4>
        {loading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>กำลังโหลด...</p>
        ) : (detail?.holdings.length ?? 0) === 0 ? (
          <div style={{ padding: '1rem', background: 'var(--bg-app)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            ช่างคนนี้ยังไม่มีอะไหล่สำรองในมือ
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {detail!.holdings.map((h) => {
              const serials = detail!.instances.filter((i) => i.inventory_id === h.inventory_id);
              return (
                <div key={h.inventory_id} style={{ padding: '0.75rem', background: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <Package size={16} color="var(--text-muted)" />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{h.product_name}</div>
                        {h.model && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{h.model}</div>}
                      </div>
                    </div>
                    <span style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '0.95rem' }}>x{h.on_hand_qty}</span>
                  </div>
                  {serials.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                      {serials.map((s) => (
                        <span key={s.instance_id} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.7rem', fontWeight: 600, padding: '2px 6px', borderRadius: '6px', background: 'var(--primary-light)', color: 'var(--primary)' }}>
                          <Tag size={10} /> {s.serial_number}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Link to={`/technician-stock/movements?technician_id=${technicianId}`} style={{ width: '100%' }}>
        <Button variant="outline" style={{ width: '100%' }} icon={<FileClock size={18} />}>
          ดูประวัติการใช้อะไหล่ของ {fullName}
        </Button>
      </Link>
    </div>
  );
};

const TechnicianStockList: React.FC = () => {
  const { notify } = useNotification();
  const { hasPermission } = useAuth();
  const canManageTechnicianStock = hasPermission('manage.technicianStock');
  const { urlState, setTableState } = useTableUrlState(20);

  const { data: summary = [], loading, error, request: fetchSummary } = useApi(technicianStockApi.getKitSummary);
  const [technicians, setTechnicians] = useState<Technician[]>([]);

  const [modal, setModal] = useState<{ mode: TechnicianStockMode; technicianId?: number } | null>(null);
  const [holdingFilter, setHoldingFilter] = useState<'all' | 'withItems'>('all');

  const loadTechnicians = useCallback(() => {
    technicianApi.list().then(setTechnicians).catch(() => notify('ไม่สามารถโหลดรายชื่อช่างได้', 'error'));
  }, [notify]);

  useEffect(() => { fetchSummary(); loadTechnicians(); }, [fetchSummary, loadTechnicians]);

  const refreshAll = () => { fetchSummary(); loadTechnicians(); };

  const columns: TableColumn<TechnicianKitSummary>[] = [
    {
      id: 'name', header: 'ช่าง', accessor: 'full_name', priority: 1, width: 'auto',
      render: (val, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <div style={{ width: 30, height: 30, background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <User size={15} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</div>
            {row.code && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{row.code}</div>}
          </div>
        </div>
      ),
    },
    {
      id: 'items', header: 'อะไหล่ในมือ', accessor: 'item_count', priority: 1, width: '160px', align: 'center',
      render: (_, row) => row.item_count > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center', lineHeight: 1.15 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 800, fontSize: '0.85rem', color: 'var(--primary)' }}>
            <Boxes size={13} /> {row.item_count} <span style={{ fontWeight: 600, fontSize: '0.7rem', color: 'var(--text-muted)' }}>รายการ</span>
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>รวม {row.total_qty} ชิ้น</span>
        </div>
      ) : <span className="cell-empty">— ว่าง —</span>,
    },
    {
      id: 'status', header: 'สถานะ', accessor: 'is_active', priority: 2, width: '110px', align: 'center',
      render: (val) => val
        ? <span className="badge" style={{ background: 'var(--success-light)', color: 'var(--success)' }}>ใช้งาน</span>
        : <span className="badge" style={{ background: 'var(--bg-app)', color: 'var(--text-muted)' }}>ปิดใช้งาน</span>,
    },
  ];

  const actions: TableAction<TechnicianKitSummary>[] = [
    { id: 'load', label: 'โหลดอะไหล่', icon: <Truck size={14} />, inline: true, onClick: (row) => setModal({ mode: 'load', technicianId: row.technician_id }), hidden: () => !canManageTechnicianStock },
    { id: 'install', label: 'ติดตั้ง/เปลี่ยน', icon: <PackageOpen size={14} />, inline: true, onClick: (row) => setModal({ mode: 'install', technicianId: row.technician_id }), hidden: () => !canManageTechnicianStock },
    { id: 'return', label: 'คืนคลัง', icon: <Undo2 size={14} />, inline: true, onClick: (row) => setModal({ mode: 'return', technicianId: row.technician_id }), hidden: () => !canManageTechnicianStock },
  ];

  const filteredData = useMemo(() => {
    const s = (urlState.search || '').toLowerCase();
    return (summary || []).filter((t) => {
      if (s && !t.full_name.toLowerCase().includes(s) && !(t.code || '').toLowerCase().includes(s)) return false;
      if (holdingFilter === 'withItems' && t.item_count === 0) return false;
      return true;
    });
  }, [summary, urlState.search, holdingFilter]);

  const indexOfLast = urlState.page * urlState.pageSize;
  const paginated = filteredData.slice(indexOfLast - urlState.pageSize, indexOfLast);

  const totals = useMemo(() => {
    const withItems = (summary || []).filter((t) => t.item_count > 0).length;
    const units = (summary || []).reduce((sum, t) => sum + (Number(t.total_qty) || 0), 0);
    return { techCount: summary?.length ?? 0, withItems, units };
  }, [summary]);

  const renderDrawer = useCallback((row: TechnicianKitSummary) => (
    <KitDrawer technicianId={row.technician_id} fullName={row.full_name} />
  ), []);

  return (
    <div style={{ padding: '0 0 4rem 0', backgroundColor: 'var(--bg-app)', minHeight: '100vh' }}>
      <div className="responsive-page-content" style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 2.5rem' }}>
        <BackButton />
        <div className="page-header" style={{ marginBottom: '2rem' }}>
          <div className="page-title">
            <h2>อะไหล่สำรองประจำตัวช่าง</h2>
            <p>ติดตามว่าช่างแต่ละคนถืออะไหล่สำรองอะไร เอาไปเปลี่ยนที่ไหนบ้าง</p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {canManageTechnicianStock && <>
              <Button variant="outline" icon={<Truck size={18} />} onClick={() => setModal({ mode: 'load' })}>โหลดอะไหล่เข้าช่าง</Button>
              <Button variant="primary" icon={<PackageOpen size={18} />} onClick={() => setModal({ mode: 'install' })}>ติดตั้ง / เปลี่ยน</Button>
              <Button variant="outline" icon={<Undo2 size={18} />} onClick={() => setModal({ mode: 'return' })}>คืนคลัง</Button>
            </>}
          </div>
        </div>

        <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
          {[
            { key: 'all' as const, label: 'ช่างทั้งหมด', val: totals.techCount, icon: Wrench, color: 'var(--primary)' },
            { key: 'withItems' as const, label: 'ช่างที่ถืออะไหล่', val: totals.withItems, icon: User, color: 'var(--success)' },
            { key: 'withItems' as const, label: 'ชิ้นที่อยู่ในมือช่าง', val: totals.units, icon: Boxes, color: 'var(--primary)' },
          ].map((s, i) => (
            <Card
              key={i}
              onClick={() => setHoldingFilter(s.key)}
              style={{ cursor: 'pointer', borderColor: holdingFilter === s.key ? 'var(--primary)' : undefined }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div className="stat-icon-wrapper" style={{ color: s.color }}><s.icon size={24} /></div>
                <div><div className="stat-value">{s.val}</div><div className="stat-label">{s.label}</div></div>
              </div>
            </Card>
          ))}
        </div>

        <div>
          <TableToolbar
            searchValue={urlState.search}
            onSearchChange={(val) => setTableState({ search: val, page: 1 })}
            filters={[]}
            activeFilters={urlState.filters}
            onFilterChange={(f) => setTableState({ filters: f, page: 1 })}
            onReset={() => setTableState({ search: '', filters: {}, page: 1 })}
            searchPlaceholder="ค้นหาชื่อช่าง หรือรหัส..."
          />

          <BaseDataTable
            columns={columns}
            data={paginated}
            state={{ loading, error: error?.message || null, empty: !loading && paginated.length === 0 }}
            totalCount={summary?.length ?? 0}
            emptyState={{
              noData: { message: 'ยังไม่มีช่างในระบบ', hint: 'เพิ่มช่างได้ที่เมนู "จัดการรายชื่อช่าง"' },
              noResults: {
                message: 'ไม่พบช่างที่ค้นหา',
                hint: holdingFilter === 'withItems' ? 'ลองกดการ์ด "ช่างทั้งหมด" ด้านบนเพื่อล้างตัวกรอง' : 'ลองปรับคำค้นใหม่'
              },
            }}
            actions={actions}
            onRetry={fetchSummary}
            drawerTitle={(row) => `อะไหล่ในมือของ ${row.full_name}`}
            renderDetailDrawer={renderDrawer}
            mobileConfig={{
              title: (row) => row.full_name,
              subtitle: (row) => `ถืออะไหล่ ${row.item_count} รายการ (${row.total_qty} ชิ้น)`,
            }}
          />

          {!loading && filteredData.length > 0 && (
            <TablePagination
              config={{ page: urlState.page, pageSize: urlState.pageSize, totalItems: filteredData.length }}
              onPageChange={(p) => setTableState({ page: p })}
              onPageSizeChange={(s) => setTableState({ pageSize: s, page: 1 })}
            />
          )}
        </div>

        <div style={{ marginTop: '1rem', textAlign: 'right' }}>
          <Link to="/technicians"><Button variant="text" icon={<Plus size={16} />}>จัดการรายชื่อช่าง</Button></Link>
        </div>
      </div>

      {modal && (
        <TechnicianStockActionModal
          mode={modal.mode}
          isOpen={!!modal}
          onClose={() => setModal(null)}
          onSuccess={refreshAll}
          technicians={technicians}
          presetTechnicianId={modal.technicianId}
        />
      )}
    </div>
  );
};

export default TechnicianStockList;
