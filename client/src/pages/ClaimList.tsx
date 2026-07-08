import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { repairApi } from '../api';
import { useNotification } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useApi } from '../hooks/useApi';
import { Button } from '../components/ui/Button';
import { BackButton } from '../components/ui/BackButton';
import { Card } from '../components/ui/Card';
import { Input, TextArea } from '../components/ui/Input';
import { formatDateTimeThai, parseDate } from '../utils/formatDate';
import type { Repair } from '../types';
import type { TableColumn, TableAction } from '../types/table.types';
import {
  Plus,
  Trash2,
  ScanEye,
  CirclePlay,
  UserCheck,
  Hourglass,
  CheckCircle2,
  MapPin,
  PauseCircle,
  FileText,
  Package,
  AlertCircle,
  MessageSquare,
  Download,
  // Modern Icons
  ShieldAlert,
  FileWarning
} from 'lucide-react';
import { Link } from 'react-router-dom';
import StationCell from '../components/shared/StationCell';
import BaseDataTable from '../components/tables/BaseDataTable';
import TableToolbar from '../components/tables/TableToolbar';
import TablePagination from '../components/tables/TablePagination';
import { useTableUrlState } from '../hooks/useTableUrlState';
import { exportToCsv } from '../utils/csvExporter';
import { getApiErrorMessage } from '../utils/apiError';

const ClaimList: React.FC = () => {
  const { notify, confirm } = useNotification();
  const { hasPermission } = useAuth();
  const { urlState, setTableState } = useTableUrlState(20);
  
  const [showModal, setShowModal] = useState<{ id: number, type: 'receive' | 'complete' | 'hold' } | null>(null);
  const [modalData, setModalData] = useState({ technician: '', note: '' });

  const { data: claims = [], loading, error, request: fetchClaims } = useApi(
    async (params?: Record<string, unknown>) => await repairApi.getAll({ ...params, type: 'claim' })
  );

  const { data: stats, request: fetchStats } = useApi(repairApi.getStats);

  const fetchData = useCallback(async () => {
    try {
      await Promise.all([
        fetchClaims({}), 
        fetchStats()
      ]);
    } catch {
      notify('ไม่สามารถโหลดข้อมูลรายการเคลมได้', 'error');
    }
  }, [fetchClaims, fetchStats, notify]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const locations = useMemo(() => {
    const locSet = new Set<string>();
    (claims || []).forEach(c => { if (c.location) locSet.add(c.location); });
    return Array.from(locSet).sort().map(l => ({ label: l, value: l }));
  }, [claims]);

  const filteredData = useMemo(() => {
    const list = claims || [];
    return list.filter(c => {
      if (urlState.search) {
        const s = urlState.search.toLowerCase();
        const matches = 
          c.ticket_no.toLowerCase().includes(s) || 
          c.device_name.toLowerCase().includes(s) || 
          c.reporter.toLowerCase().includes(s) || 
          (c.location && c.location.toLowerCase().includes(s)) ||
          (c.problem && c.problem.toLowerCase().includes(s));
        if (!matches) return false;
      }
      if (urlState.filters.status && urlState.filters.status !== 'All' && c.status !== urlState.filters.status) return false;
      if (urlState.filters.priority && urlState.filters.priority !== 'All' && c.priority !== urlState.filters.priority) return false;
      if (urlState.filters.location && urlState.filters.location !== 'All' && c.location !== urlState.filters.location) return false;
      return true;
    }).sort((a, b) => {
      if (urlState.sortBy === 'priority') {
        const pMap: Record<string, number> = { 'วิกฤต': 4, 'ด่วนมาก': 3, 'ด่วน': 2, 'ปกติ': 1 };
        const p = (pMap[b.priority] || 0) - (pMap[a.priority] || 0);
        if (p !== 0) return p;
      }
      const t = parseDate(b.received_at || b.created_at).getTime() - parseDate(a.received_at || a.created_at).getTime();
      return t !== 0 ? t : b.id - a.id;
    });
  }, [claims, urlState]);

  const indexOfLastItem = urlState.page * urlState.pageSize;
  const indexOfFirstItem = indexOfLastItem - urlState.pageSize;
  const paginatedData = filteredData.slice(indexOfFirstItem, indexOfLastItem);

  const handleExportExcel = () => {
    const headers = [
      'เลขที่ใบงาน', 'อุปกรณ์', 'อาการเสีย/ปัญหา', 'ผู้แจ้ง', 'สถานที่', 'ช่างผู้รับผิดชอบ', 'ความสำคัญ', 'สถานะ', 'วันที่รับเข้า', 'วันที่แจ้ง'
    ];
    const rows = filteredData.map(r => [
      r.ticket_no,
      r.device_name,
      r.problem,
      r.reporter,
      r.location,
      r.technician || '-',
      r.priority,
      r.status,
      r.received_at ? new Date(r.received_at).toLocaleDateString('th-TH') : '-',
      r.created_at ? new Date(r.created_at).toLocaleDateString('th-TH') : '-'
    ]);
    exportToCsv(`claims_export_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`, headers, rows);
    notify('ส่งออกข้อมูล Excel เรียบร้อยแล้ว');
  };

  const handleWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showModal) return;
    const status = showModal.type === 'receive' ? 'กำลังซ่อม' : showModal.type === 'complete' ? 'เสร็จสิ้น' : 'รออะไหล่';
    try {
      await repairApi.updateStatus(showModal.id, {
        status,
        user: modalData.technician || 'ช่างเทคนิค',
        technician: modalData.technician,
        repair_note: modalData.note,
        note: modalData.note
      });
      notify(status === 'เสร็จสิ้น' ? 'บันทึกการเคลมเสร็จสิ้นเรียบร้อยแล้ว' : `เปลี่ยนสถานะเป็น "${status}" เรียบร้อยแล้ว`);
      setShowModal(null);
      setModalData({ technician: '', note: '' });
      fetchData();
    } catch (err) {
      notify(getApiErrorMessage(err, 'อัปเดตสถานะไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'), 'error');
    }
  };

  const handleDelete = async (id: number) => {
    const isConfirmed = await confirm({
      title: 'ยืนยันการลบรายการเคลม',
      message: 'คุณต้องการลบรายการเคลมนี้จริงหรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้',
      variant: 'danger'
    });
    if (isConfirmed) {
      try {
        await repairApi.delete(id);
        notify('ลบรายการสำเร็จ');
        fetchData();
      } catch (err) {
        notify(getApiErrorMessage(err, 'ลบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'), 'error');
      }
    }
  };

  const getAccentColor = (status: string, priority: string): string => {
    if (status === 'เสร็จสิ้น') return 'var(--success)';
    if (priority === 'วิกฤต' || priority === 'ด่วนมาก') return 'var(--danger)';
    if (status === 'รออะไหล่') return 'var(--warning)';
    if (status === 'กำลังซ่อม') return 'var(--primary)';
    return 'var(--text-muted)';
  };

  const getDaysWaiting = (row: Repair): number => {
    if (row.status === 'เสร็จสิ้น') return 0;
    const start = parseDate(row.received_at || row.created_at).getTime();
    const now = Date.now();
    return Math.floor((now - start) / (1000 * 60 * 60 * 24));
  };

  const columns: TableColumn<Repair>[] = [
    {
      id: 'ticket', header: 'เลขที่ใบเคลม', accessor: 'ticket_no', priority: 1, width: '170px',
      render: (val, row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, color: 'var(--primary)', fontSize: '0.9rem' }}>
            <FileText size={14} color="var(--primary)" style={{ opacity: 0.6, flexShrink: 0 }} />
            {val}
          </div>
          {row.is_read === 0 && (
            <span style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--danger)', background: 'var(--danger-light)', padding: '1px 6px', borderRadius: '4px', width: 'fit-content', letterSpacing: '0.05em' }}>
              ● ใหม่
            </span>
          )}
        </div>
      )
    },
    {
      id: 'device', header: 'อุปกรณ์', accessor: 'device_name', priority: 1, width: '200px',
      render: (val) => <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{val}</span>
    },
    {
      id: 'reporter', header: 'ผู้ประสานงาน', accessor: 'reporter', priority: 1, width: '150px',
      render: (val) => <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{val}</span>
    },
    {
      id: 'technician', header: 'ผู้ประสานเคลม', accessor: 'technician', priority: 2, width: '140px',
      render: (val) => (
        val ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <UserCheck size={13} color="var(--primary)" />
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)' }}>{val}</span>
          </div>
        ) : (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>ยังไม่มอบหมาย</span>
        )
      )
    },
    {
      id: 'location', header: 'สถานที่', accessor: 'location', priority: 1, width: 'auto',
      render: (_, row) => {
        const hasLocation = row.station_name || row.location;
        if (!hasLocation) return <span className="cell-empty">— ไม่ระบุสถานี —</span>;
        return <StationCell stationName={row.station_name} areaName={row.station_area_name} province={row.station_province} fallbackLocation={row.location} locationSnapshot={row.location_snapshot} compact={true} />;
      }
    },
    {
      id: 'status', header: 'สถานะ', accessor: 'status', priority: 1, width: '120px', align: 'center',
      render: (val) => <span className={`badge badge-${val}`} style={{ minWidth: '90px', justifyContent: 'center' }}>{val === 'กำลังซ่อม' ? 'กำลังเคลม' : val}</span>
    },
    {
      id: 'sla', header: 'รอ', accessor: 'received_at', priority: 1, width: '90px', align: 'center',
      render: (_, row) => {
        const days = getDaysWaiting(row);
        if (row.status === 'เสร็จสิ้น') {
          return <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 700 }}>✓ เสร็จ</span>;
        }
        const isOverdue = days > 7;
        const color = isOverdue ? 'var(--danger)' : days > 3 ? 'var(--warning)' : 'var(--text-muted)';
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
            <span style={{ fontSize: '1.05rem', fontWeight: 800, color, lineHeight: 1 }}>{days}</span>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)' }}>วัน</span>
            {isOverdue && <span style={{ fontSize: '0.58rem', fontWeight: 800, color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>ค้างนาน</span>}
          </div>
        );
      }
    },
    {
      id: 'date', header: 'วันที่แจ้ง', accessor: 'received_at', priority: 2, width: '120px',
      render: (val) => {
        const [date, time] = formatDateTimeThai(val).split(' เวลา ');
        return (
          <div className="cell-date-stack">
            <span className="cd-primary">{date}</span>
            {time && <span className="cd-secondary">{time}</span>}
          </div>
        );
      }
    }
  ];

  const actions: TableAction<Repair>[] = [
    {
      id: 'workflow',
      label: 'ดำเนินการ',
      icon: <CirclePlay size={14} />,
      onClick: (row) => setShowModal({ id: row.id, type: row.status === 'รอดำเนินการ' || row.status === 'รออะไหล่' ? 'receive' : 'complete' }),
      hidden: (row) => row.status === 'เสร็จสิ้น',
      variant: 'primary',
      inline: true
    },
    {
      id: 'view', label: 'รายละเอียด', icon: <ScanEye size={14} />,
      onClick: (row) => window.location.href = `/claim-history/${row.id}`,
      inline: true
    },
    {
      id: 'delete', label: 'ลบรายการ', icon: <Trash2 size={14} />, variant: 'danger',
      onClick: (row) => handleDelete(row.id),
      hidden: () => !hasPermission('delete.claims')
    }
  ];

  const renderDetailDrawer = useCallback((row: Repair) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className={`badge badge-${row.status}`}>{row.status === 'กำลังซ่อม' ? 'กำลังเคลม' : row.status}</span>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{formatDateTimeThai(row.received_at)}</span>
      </div>

      <section>
        <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', color: 'var(--primary)' }}>
          <AlertCircle size={18} /> ข้อมูลเบื้องต้น
        </h4>
        <Card style={{ padding: '1rem', backgroundColor: 'var(--bg-app)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div><strong>ผู้แจ้ง/ประสานงาน:</strong> {row.reporter}</div>
            <div><strong>ความสำคัญ:</strong> 
              <span className={`badge badge-priority-${row.priority === 'วิกฤต' ? 'critical' : row.priority === 'ด่วนมาก' ? 'urgent' : row.priority === 'ด่วน' ? 'high' : 'normal'}`} style={{ marginLeft: '8px' }}>
                {row.priority}
              </span>
            </div>
            <div><strong>โครงการ:</strong> {row.project_name || '-'}</div>
          </div>
        </Card>
      </section>

      <section>
        <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', color: 'var(--primary)' }}>
          <MapPin size={18} /> สถานที่แจ้งเคลม
        </h4>
        <Card style={{ padding: '1rem', backgroundColor: 'var(--bg-app)' }}>
          <StationCell stationName={row.station_name} province={row.station_province} fallbackLocation={row.location} locationSnapshot={row.location_snapshot} compact={false} />
        </Card>
      </section>

      <section>
        <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', color: 'var(--primary)' }}>
          <Package size={18} /> อุปกรณ์ที่แจ้งเคลม
        </h4>
        <div style={{ padding: '1rem', backgroundColor: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '4px' }}>{row.device_name}</div>
        </div>
      </section>

      <section>
        <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', color: 'var(--primary)' }}>
          <MessageSquare size={18} /> อาการชำรุด / ปัญหา
        </h4>
        <div style={{ padding: '1.25rem', backgroundColor: 'var(--bg-app)', borderRadius: '12px', border: '1px solid var(--border)', fontSize: '0.95rem', lineHeight: '1.6' }}>
          {row.problem}
        </div>
      </section>

      {row.repair_note && (
        <section>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', color: 'var(--success)' }}>
            <CheckCircle2 size={18} /> บันทึกการเคลม
          </h4>
          <div style={{ padding: '1.25rem', backgroundColor: 'rgba(16, 185, 129, 0.05)', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.2)', color: 'var(--success)', fontWeight: 500 }}>
            {row.repair_note}
          </div>
        </section>
      )}

      <div style={{ marginTop: 'auto', paddingTop: '2rem', display: 'flex', gap: '1rem' }}>
        <Link to={`/claim-history/${row.id}`} style={{ flex: 1 }}><Button variant="primary" style={{ width: '100%' }}>เปิดหน้างานเคลม</Button></Link>
        {row.status !== 'เสร็จสิ้น' && (
          <Button variant="outline" style={{ flex: 1 }} onClick={() => setShowModal({ id: row.id, type: row.status === 'รอดำเนินการ' || row.status === 'รออะไหล่' ? 'receive' : 'complete' })}>อัปเดตสถานะ</Button>
        )}
      </div>
    </div>
  ), []);

  return (
    <div className="repair-board" style={{ padding: '2rem 2.5rem', backgroundColor: 'var(--bg-app)', minHeight: '100vh' }}>
      <BackButton />
      <div className="page-header" style={{ marginBottom: '2.5rem' }}>
        <div className="page-title">
          <h2>กระดานติดตามสถานะงานเคลม</h2>
          <p>ติดตามและจัดการรายการเคลมอุปกรณ์ที่ส่งเข้าศูนย์บริการ</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Button variant="outline" icon={<Download size={20} />} onClick={handleExportExcel}>ส่งออก Excel</Button>
          <Link to="/claim"><Button variant="primary" icon={<Plus size={20} />}>แจ้งเคลมใหม่</Button></Link>
          <Link to="/new"><Button variant="outline" icon={<Plus size={20} />}>แจ้งซ่อมใหม่</Button></Link>
        </div>
      </div>

      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
        {stats?.claim && [
          { label: 'งานทั้งหมด', val: stats.claim.total, icon: ShieldAlert, status: 'All' },
          { label: 'รอดำเนินการ', val: stats.claim.pending, icon: ShieldAlert, status: 'รอดำเนินการ' },
          { label: 'กำลังเคลม', val: stats.claim.in_progress, icon: FileWarning, status: 'กำลังซ่อม' },
          { label: 'รออะไหล่/ศูนย์', val: stats.claim.on_hold, icon: Hourglass, status: 'รออะไหล่' },
          { label: 'เคลมเสร็จสิ้น', val: stats.claim.completed, icon: CheckCircle2, status: 'เสร็จสิ้น' }
        ].map((s, i) => (
          <Card key={i} onClick={() => setTableState({ filters: { ...urlState.filters, status: s.status }, page: 1 })} style={{ cursor: 'pointer', borderColor: urlState.filters.status === s.status ? 'var(--primary)' : undefined }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div className="stat-icon-wrapper" style={{ color: i === 0 ? 'var(--primary)' : i === 1 ? 'var(--danger)' : i === 2 ? 'var(--warning)' : i === 3 ? 'var(--info)' : i === 4 ? 'var(--success)' : undefined }}><s.icon size={24} /></div>
              <div><div className="stat-value">{s.val}</div><div className="stat-label">{s.label}</div></div>
            </div>
          </Card>
        ))}
      </div>

      <TableToolbar
        searchValue={urlState.search}
        onSearchChange={(val) => setTableState({ search: val, page: 1 })}
        filters={[
          { id: 'status', label: 'สถานะ', type: 'select', options: [{ label: 'รอดำเนินการ', value: 'รอดำเนินการ' }, { label: 'กำลังเคลม', value: 'กำลังซ่อม' }, { label: 'รออะไหล่', value: 'รออะไหล่' }, { label: 'เสร็จสิ้น', value: 'เสร็จสิ้น' }] },
          { id: 'priority', label: 'ความสำคัญ', type: 'select', options: [{ label: 'ปกติ', value: 'ปกติ' }, { label: 'ด่วน', value: 'ด่วน' }, { label: 'ด่วนมาก', value: 'ด่วนมาก' }, { label: 'วิกฤต', value: 'วิกฤต' }] },
          { id: 'location', label: 'สถานที่', type: 'select', options: locations }
        ]}
        activeFilters={urlState.filters}
        onFilterChange={(f) => setTableState({ filters: f, page: 1 })}
        onReset={() => setTableState({ search: '', filters: {}, page: 1 })}
        searchPlaceholder="ค้นหาเลขใบงาน, อุปกรณ์, หรือผู้แจ้ง..."
      />

      <BaseDataTable
        columns={columns}
        data={paginatedData}
        state={{ loading, error: error?.message || null, empty: !loading && paginatedData.length === 0 }}
        totalCount={claims?.length ?? 0}
        emptyState={{
          noData: { message: 'ยังไม่มีรายการเคลมในระบบ', hint: 'กด "แจ้งเคลมใหม่" เพื่อสร้างใบเคลมแรก' },
          noResults: { message: 'ไม่พบงานเคลมที่ตรงกับเงื่อนไข', hint: 'ลองปรับคำค้นหรือตัวกรองใหม่' }
        }}
        actions={actions}
        onRetry={fetchData}
        drawerTitle={(row) => `ใบงานเคลม ${row.ticket_no}`}
        renderDetailDrawer={renderDetailDrawer}
        getRowAccent={(r) => getAccentColor(r.status, r.priority)}
        mobileConfig={{
          title: (r) => r.device_name,
          subtitle: (r) => `ใบเคลม: ${r.ticket_no} · ${r.reporter}`,
          statusBadge: (r) => <span className={`badge badge-${r.status}`}>{r.status === 'กำลังซ่อม' ? 'กำลังเคลม' : r.status}</span>
        }}
      />

      {!loading && filteredData.length > 0 && (
        <TablePagination
          config={{ page: urlState.page, pageSize: urlState.pageSize, totalItems: filteredData.length }}
          onPageChange={(p) => setTableState({ page: p })}
          onPageSizeChange={(s) => setTableState({ pageSize: s, page: 1 })}
        />
      )}

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {showModal.type === 'receive' ? <UserCheck color="var(--primary)" /> : 
               showModal.type === 'complete' ? <CheckCircle2 color="var(--success)" /> : <PauseCircle color="var(--warning)" />}
              {showModal.type === 'receive' ? 'รับมอบหมายงานเคลม' : 
               showModal.type === 'complete' ? 'ปิดงาน / เคลมเสร็จสิ้น' : 'ระงับงานชั่วคราว'}
            </h3>
            <form onSubmit={handleWorkflow}>
              {(showModal.type === 'receive' || !(claims || []).find(r => r.id === showModal.id)?.technician) && (
                <Input label="ชื่อช่างผู้ประสานงาน" required placeholder="กรอกชื่อช่าง..." value={modalData.technician} onChange={e => setModalData({...modalData, technician: e.target.value})} />
              )}
              {showModal.type === 'complete' ? (
                <TextArea label="บันทึกการเคลม (Claim Note)" required rows={3} placeholder="สรุปผลการส่งเคลม..." value={modalData.note} onChange={e => setModalData({...modalData, note: e.target.value})} />
              ) : showModal.type === 'hold' ? (
                <TextArea label="เหตุผลที่ระงับงาน" required rows={2} placeholder="เช่น รออะไหล่จากบริษัท..." value={modalData.note} onChange={e => setModalData({...modalData, note: e.target.value})} />
              ) : null}
              <div className="modal-actions">
                <Button type="button" variant="outline" onClick={() => setShowModal(null)}>ยกเลิก</Button>
                <Button type="submit" variant="primary">บันทึกข้อมูล</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClaimList;
