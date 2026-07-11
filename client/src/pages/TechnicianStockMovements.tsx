import React, { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { technicianStockApi } from '../api';
import { useApi } from '../hooks/useApi';
import { formatDateTimeThai } from '../utils/formatDate';
import { Truck, PackageOpen, Undo2, SlidersHorizontal, Package, Tag, MapPin, User, FileClock, X } from 'lucide-react';
import type { TechnicianStockMovement, TechnicianMovementType } from '../types';
import type { TableColumn } from '../types/table.types';
import BaseDataTable from '../components/tables/BaseDataTable';
import TableToolbar from '../components/tables/TableToolbar';
import TablePagination from '../components/tables/TablePagination';
import { useTableUrlState } from '../hooks/useTableUrlState';
import StationCell from '../components/shared/StationCell';
import { BackButton } from '../components/ui/BackButton';

const TYPE_META: Record<TechnicianMovementType, { label: string; icon: React.ReactNode; bg: string; color: string }> = {
  LOAD: { label: 'โหลดเข้าช่าง', icon: <Truck size={12} />, bg: 'var(--primary-light)', color: 'var(--primary)' },
  INSTALL: { label: 'ติดตั้ง/เปลี่ยน', icon: <PackageOpen size={12} />, bg: 'var(--primary-light)', color: 'var(--primary)' },
  RETURN: { label: 'คืนคลัง', icon: <Undo2 size={12} />, bg: 'var(--success-light)', color: 'var(--success)' },
  ADJUST: { label: 'ปรับยอด', icon: <SlidersHorizontal size={12} />, bg: 'var(--bg-app)', color: 'var(--text-muted)' },
};

const TechnicianStockMovements: React.FC = () => {
  const { urlState, setTableState } = useTableUrlState(20);
  const [searchParams, setSearchParams] = useSearchParams();
  const technicianId = searchParams.get('technician_id') || undefined;

  const { data: movements = [], loading, error, request: fetchMovements } = useApi(technicianStockApi.getMovements);

  useEffect(() => {
    fetchMovements({ technician_id: technicianId });
  }, [fetchMovements, technicianId]);

  const technicianName = useMemo(() => {
    if (!technicianId) return null;
    const m = (movements || []).find((x) => String(x.technician_id) === String(technicianId));
    return m?.technician_name || null;
  }, [movements, technicianId]);

  const columns: TableColumn<TechnicianStockMovement>[] = [
    {
      id: 'movement_no', header: 'เลขที่', accessor: 'movement_no', priority: 2, width: '130px',
      render: (val) => <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '0.8rem' }}>{val}</span>,
    },
    {
      id: 'date', header: 'วันที่', accessor: 'created_at', priority: 1, width: '120px',
      render: (val) => {
        const [d, t] = formatDateTimeThai(val).split(' เวลา ');
        return <div className="cell-date-stack"><span className="cd-primary">{d}</span>{t && <span className="cd-secondary">{t}</span>}</div>;
      },
    },
    {
      id: 'type', header: 'ประเภท', accessor: 'movement_type', priority: 1, width: '140px', align: 'center',
      render: (val) => {
        const m = TYPE_META[val as TechnicianMovementType] || TYPE_META.ADJUST;
        return <span className="badge" style={{ background: m.bg, color: m.color, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>{m.icon} {m.label}</span>;
      },
    },
    {
      id: 'technician', header: 'ช่าง', accessor: 'technician_name', priority: 2, width: '150px',
      render: (val) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.85rem' }}><User size={13} color="var(--text-muted)" /> {val}</span>,
    },
    {
      id: 'product', header: 'อะไหล่', accessor: 'product_name', priority: 1, width: 'auto',
      render: (_, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <Package size={15} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.product_name}</div>
            {row.serial_number && <div style={{ fontSize: '0.72rem', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}><Tag size={10} /> {row.serial_number}</div>}
            {row.removed_serial && <div style={{ fontSize: '0.7rem', color: 'var(--danger)' }}>ถอดออก: {row.removed_serial}{row.removed_model ? ` (${row.removed_model})` : ''}</div>}
          </div>
        </div>
      ),
    },
    {
      id: 'qty', header: 'จำนวน', accessor: 'quantity', priority: 1, width: '90px', align: 'center',
      render: (val) => {
        const n = Number(val) || 0;
        const positive = n > 0;
        return <span style={{ fontWeight: 800, color: positive ? 'var(--success)' : 'var(--danger)' }}>{positive ? '+' : ''}{n}</span>;
      },
    },
    {
      id: 'station', header: 'สถานที่ (เปลี่ยนที่ไหน)', accessor: 'station_name', priority: 2, width: 'auto',
      render: (_, row) => row.station_name
        ? <StationCell stationName={row.station_name} areaName={row.station_area_name || undefined} compact />
        : <span className="cell-empty">—</span>,
    },
  ];

  const filteredData = useMemo(() => {
    return (movements || []).filter((m) => {
      if (urlState.filters.type && m.movement_type !== urlState.filters.type) return false;
      if (urlState.search) {
        const s = urlState.search.toLowerCase();
        const hit = m.product_name.toLowerCase().includes(s)
          || (m.technician_name || '').toLowerCase().includes(s)
          || (m.serial_number || '').toLowerCase().includes(s)
          || (m.station_name || '').toLowerCase().includes(s)
          || (m.movement_no || '').toLowerCase().includes(s);
        if (!hit) return false;
      }
      return true;
    });
  }, [movements, urlState.search, urlState.filters]);

  const indexOfLast = urlState.page * urlState.pageSize;
  const paginated = filteredData.slice(indexOfLast - urlState.pageSize, indexOfLast);

  return (
    <div style={{ padding: '0 0 4rem 0', backgroundColor: 'var(--bg-app)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 2.5rem' }}>
        <BackButton />
        <div className="page-header" style={{ marginBottom: '2rem' }}>
          <div className="page-title">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><FileClock size={24} /> ประวัติการใช้อะไหล่สำรอง</h2>
            <p>บันทึกว่าใครโหลด/เอาอะไหล่ไปเปลี่ยนที่สถานีไหน และคืนคลังเมื่อไหร่</p>
          </div>
        </div>

        {technicianId && (
          <div style={{ marginBottom: '1rem', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderRadius: '999px', background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 700, fontSize: '0.85rem' }}>
            <MapPin size={14} /> กรองเฉพาะช่าง: {technicianName || `#${technicianId}`}
            <button onClick={() => { const p = new URLSearchParams(searchParams); p.delete('technician_id'); setSearchParams(p); }}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--primary)', display: 'inline-flex' }}><X size={14} /></button>
          </div>
        )}

        <TableToolbar
          searchValue={urlState.search}
          onSearchChange={(val) => setTableState({ search: val, page: 1 })}
          filters={[{ id: 'type', label: 'ประเภท', type: 'select', options: [
            { label: 'โหลดเข้าช่าง', value: 'LOAD' },
            { label: 'ติดตั้ง/เปลี่ยน', value: 'INSTALL' },
            { label: 'คืนคลัง', value: 'RETURN' },
            { label: 'ปรับยอด', value: 'ADJUST' },
          ] }]}
          activeFilters={urlState.filters}
          onFilterChange={(f) => setTableState({ filters: f, page: 1 })}
          onReset={() => setTableState({ search: '', filters: {}, page: 1 })}
          searchPlaceholder="ค้นหาอะไหล่, ช่าง, S/N, สถานี..."
        />

        <BaseDataTable
          columns={columns}
          data={paginated}
          state={{ loading, error: error?.message || null, empty: !loading && paginated.length === 0 }}
          totalCount={movements?.length ?? 0}
          emptyState={{
            noData: { message: 'ยังไม่มีประวัติการใช้อะไหล่สำรอง', hint: 'เริ่มด้วยการโหลดอะไหล่เข้าช่าง' },
            noResults: { message: 'ไม่พบรายการที่ตรงกับเงื่อนไข', hint: 'ลองปรับคำค้นหรือตัวกรอง' },
          }}
          onRetry={() => fetchMovements({ technician_id: technicianId })}
          mobileConfig={{
            title: (row) => row.product_name,
            subtitle: (row) => `${TYPE_META[row.movement_type]?.label || ''} · ${row.technician_name}`,
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
    </div>
  );
};

export default TechnicianStockMovements;
