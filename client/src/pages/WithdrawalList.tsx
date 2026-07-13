import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { withdrawalApi } from '../api';
import { useNotification } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useApi } from '../hooks/useApi';
import { Button } from '../components/ui/Button';
import { BackButton } from '../components/ui/BackButton';
import { Card } from '../components/ui/Card';
import { formatDateTimeThai } from '../utils/formatDate';
import {
  User,
  Trash2,
  Plus,
  Boxes,
  Printer,
  MapPin,
  FileText,
  ExternalLink,
  MessageSquare,
  Package,
  Tag,
  AlertTriangle,
  Wrench,
  X,
  Download
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { exportToCsv } from '../utils/csvExporter';
import PrintWithdrawalTemplate from '../components/PrintWithdrawalTemplate';
import { PrintDialog } from '../components/PrintDialog';
import { ProvideSnModal } from '../components/ProvideSnModal';
import type { Withdrawal, WithdrawalItem } from '../types';
import type { TableColumn, TableAction, TableFilter } from '../types/table.types';
import StationCell from '../components/shared/StationCell';
import BaseDataTable from '../components/tables/BaseDataTable';
import TableToolbar from '../components/tables/TableToolbar';
import TablePagination from '../components/tables/TablePagination';
import { useTableUrlState } from '../hooks/useTableUrlState';
import { getApiErrorMessage } from '../utils/apiError';

const WithdrawalList: React.FC = () => {
  const { notify, confirm } = useNotification();
  const { hasPermission } = useAuth();
  const { urlState, setTableState } = useTableUrlState(20);
  
  const [printingWithdrawal, setPrintingWithdrawal] = useState<Withdrawal | null>(null);
  const [isPrintLoading, setIsPrintLoading] = useState<number | null>(null);
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);

  // === S/N Provision Flow ===
  // 1) picker: เลือกรายการอุปกรณ์ที่ขาด S/N (กรณีในใบเบิกมีหลายรายการ)
  const [snPicker, setSnPicker] = useState<{ isOpen: boolean; withdrawalId: number | null; items: WithdrawalItem[] }>({
    isOpen: false,
    withdrawalId: null,
    items: []
  });
  const [loadingPicker, setLoadingPicker] = useState<number | null>(null);
  // 2) modal กรอก S/N สำหรับ item ที่เลือก
  const [snModal, setSnModal] = useState<{
    isOpen: boolean;
    withdrawalId: number | null;
    itemId: number | null;
    itemName: string;
    totalQty: number;
    existingSns: string[];
  }>({
    isOpen: false,
    withdrawalId: null,
    itemId: null,
    itemName: '',
    totalQty: 0,
    existingSns: []
  });

  const { data: withdrawals = [], loading, error, request: fetchWithdrawals } = useApi(withdrawalApi.getAll);

  // เปิด picker: โหลด detail ของ withdrawal แล้ว filter เฉพาะ item ที่ขาด S/N
  const openSnPicker = async (withdrawalId: number) => {
    setLoadingPicker(withdrawalId);
    try {
      const detail = await withdrawalApi.getById(withdrawalId);
      const itemsMissing = (detail.items || []).filter((it: WithdrawalItem) => {
        if (it.requires_sn !== 1) return false;
        const currentSns = it.serial_numbers ? it.serial_numbers.split(', ').filter(s => s.trim()) : [];
        return currentSns.length < it.quantity;
      });
      if (itemsMissing.length === 0) {
        notify('รายการนี้ระบุ S/N ครบแล้ว', 'success');
        fetchWithdrawals();
        return;
      }
      // ถ้ามีรายการเดียว → เปิด modal กรอกเลย ไม่ต้อง picker
      if (itemsMissing.length === 1) {
        const it = itemsMissing[0];
        const currentSns = it.serial_numbers ? it.serial_numbers.split(', ').filter(s => s.trim()) : [];
        setSnModal({
          isOpen: true,
          withdrawalId,
          itemId: it.id,
          itemName: it.item_name,
          totalQty: it.quantity,
          existingSns: currentSns
        });
      } else {
        setSnPicker({ isOpen: true, withdrawalId, items: itemsMissing });
      }
    } catch {
      notify('ไม่สามารถโหลดข้อมูลรายการเบิกได้', 'error');
    } finally {
      setLoadingPicker(null);
    }
  };

  // กดเลือกรายการใน picker → เปิด modal กรอก S/N
  const handlePickItem = (item: WithdrawalItem) => {
    const currentSns = item.serial_numbers ? item.serial_numbers.split(', ').filter(s => s.trim()) : [];
    setSnModal({
      isOpen: true,
      withdrawalId: snPicker.withdrawalId,
      itemId: item.id,
      itemName: item.item_name,
      totalQty: item.quantity,
      existingSns: currentSns
    });
    setSnPicker({ ...snPicker, isOpen: false });
  };

  useEffect(() => {
    fetchWithdrawals();
  }, [fetchWithdrawals]);

  const uniqueTypes = useMemo(() => {
    const types = new Set<string>();
    (withdrawals || []).forEach(w => {
      if (w.type) types.add(w.type);
    });
    return Array.from(types).map(t => ({ label: t, value: t }));
  }, [withdrawals]);

  const stats = useMemo(() => {
    const list = withdrawals || [];
    return {
      total: list.length,
      install: list.filter(w => w.type === 'ติดตั้งใหม่').length,
      repair: list.filter(w => w.type === 'ซ่อมแซม').length,
      missingSn: list.filter(w => (w.items_missing_sn || 0) > 0).length
    };
  }, [withdrawals]);

  const handlePrint = useCallback(async (wId: number) => {
    setIsPrintLoading(wId);
    try {
      const detail = await withdrawalApi.getById(wId);
      setPrintingWithdrawal(detail);
      setIsPrintDialogOpen(true);
    } catch {
      notify('ไม่สามารถดึงข้อมูลเพื่อพิมพ์ใบเบิกได้', 'error');
    } finally {
      setIsPrintLoading(null);
    }
  }, [notify]);

  const handleBeforePrint = async (companyId: number) => {
    if (!printingWithdrawal) return;
    try {
      await withdrawalApi.updateCompany(printingWithdrawal.id, companyId);
    } catch (err) {
      console.error('Failed to update company_id:', err);
    }
  };

  const handleDelete = async (id: number) => {
    const isConfirmed = await confirm({
      title: 'ยืนยันการลบประวัติการเบิก',
      message: 'คุณต้องการลบประวัติการเบิกนี้ใช่หรือไม่? ระบบจะทำการคืนสต็อกอุปกรณ์ทั้งหมดในรายการนี้ให้โดยอัตโนมัติ\nการลบประวัตินี้ไม่สามารถย้อนกลับได้',
      variant: 'danger'
    });
    if (!isConfirmed) return;
    try {
      await withdrawalApi.delete(id);
      notify('ลบประวัติและคืนสต็อกเรียบร้อยแล้ว');
      fetchWithdrawals();
    } catch (err) {
      notify(getApiErrorMessage(err, 'ลบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'), 'error');
    }
  };

  const getBadgeClass = (type: string) => {
    switch (type) {
      case 'ติดตั้งใหม่': return 'badge-withdrawal-install';
      case 'ซ่อมแซม': return 'badge-withdrawal-repair';
      case 'สำรองใช้งาน': return 'badge-withdrawal-backup';
      case 'ทดสอบ': return 'badge-withdrawal-test';
      default: return 'badge-withdrawal-custom';
    }
  };

  const getAccentColor = (type: string): string => {
    switch (type) {
      case 'ติดตั้งใหม่': return 'var(--primary)';
      case 'ซ่อมแซม': return 'var(--warning)';
      case 'สำรองใช้งาน': return 'var(--warning)';
      case 'ทดสอบ': return 'var(--success)';
      default: return 'var(--text-muted)';
    }
  };

  const columns: TableColumn<Withdrawal>[] = [
    {
      id: 'wd_no',
      header: 'เลขที่ใบเบิก',
      accessor: (row) => `WD-${row.id.toString().padStart(6, '0')}`,
      priority: 1,
      width: '140px',
      render: (val) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: 'var(--primary)', fontSize: 'var(--table-text-size)' }}>
          <FileText size={14} color="var(--primary)" style={{ flexShrink: 0, opacity: 0.6 }} />
          {val}
        </div>
      )
    },
    {
      id: 'date',
      header: 'วันที่เบิก',
      accessor: (row) => row.withdrawal_date || row.created_at,
      priority: 1,
      width: '120px',
      render: (val) => {
        const [datePart, timePart] = formatDateTimeThai(val).split(' เวลา ');
        return (
          <div className="cell-date-stack">
            <span className="cd-primary">{datePart}</span>
            {timePart && <span className="cd-secondary">{timePart}</span>}
          </div>
        );
      }
    },
    {
      id: 'recipient',
      header: 'ผู้เบิก / หน่วยงาน',
      accessor: 'recipient',
      priority: 1,
      width: '180px',
      render: (val) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
          <div style={{ width: 26, height: 26, background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <User size={13} />
          </div>
          <span style={{ fontWeight: 'var(--table-text-weight)', fontSize: 'var(--table-text-size)', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={val as string}>{val}</span>
        </div>
      )
    },
    {
      id: 'items_count',
      header: 'จำนวน',
      accessor: 'items_summary',
      priority: 1,
      width: '120px',
      align: 'center',
      render: (_, row) => {
        // นับจาก items[] (จาก backend ส่งมา) ถ้าไม่มีใช้ items_summary
        let itemCount = 0;
        let totalQty = 0;
        if (Array.isArray(row.items) && row.items.length > 0) {
          itemCount = row.items.length;
          totalQty = row.items.reduce((sum, it) => sum + (it.quantity || 0), 0);
        } else if (row.items_summary) {
          // items_summary format: "Cable RJ45 x5, Switch x2" — แยกด้วย comma แล้วนับ
          const parts = row.items_summary.split(',').map(s => s.trim()).filter(Boolean);
          itemCount = parts.length;
          // ดึงตัวเลข qty จาก "ชื่อ xN" pattern
          totalQty = parts.reduce((sum, p) => {
            const m = p.match(/x\s*(\d+)\s*$/i);
            return sum + (m ? parseInt(m[1], 10) : 1);
          }, 0);
        }
        if (itemCount === 0) return <span className="cell-empty">—</span>;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center', lineHeight: 1.15 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 'var(--table-text-weight)', fontSize: 'var(--table-text-size)', color: 'var(--primary)' }}>
              <Boxes size={13} /> {itemCount} <span style={{ fontWeight: 'var(--table-secondary-weight)', fontSize: 'var(--table-secondary-size)', color: 'var(--text-muted)' }}>รายการ</span>
            </span>
            <span style={{ fontSize: 'var(--table-secondary-size)', color: 'var(--text-muted)', fontWeight: 'var(--table-secondary-weight)' }}>
              รวม {totalQty} ชิ้น
            </span>
          </div>
        );
      }
    },
    {
      id: 'project',
      header: 'โครงการ / งาน',
      accessor: 'project_name',
      priority: 2,
      width: 'auto',
      render: (val) => (
        val
          ? <span style={{ fontSize: 'var(--table-text-size)', fontWeight: 'var(--table-text-weight)' }}>{val}</span>
          : <span className="cell-empty">—</span>
      )
    },
    {
      id: 'contract',
      header: 'สัญญา / ปี',
      accessor: 'contract_no',
      priority: 3,
      width: 'auto',
      render: (_, row) => (
        row.contract_no
          ? (
            <span style={{ fontSize: 'var(--table-text-size)', fontWeight: 'var(--table-text-weight)' }}>
              {row.contract_no}
              <span style={{ color: 'var(--text-muted)', fontWeight: 'var(--table-secondary-weight)' }}> · ปี {row.contract_year}</span>
            </span>
          )
          : row.contract_reference_type === 'none'
            ? <span style={{ fontSize: 'var(--table-secondary-size)', color: 'var(--text-muted)' }}>ไม่มีสัญญา</span>
            : <span className="cell-empty">—</span>
      )
    },
    {
      id: 'location',
      header: 'สถานที่',
      accessor: 'station_name',
      priority: 2,
      width: 'auto',
      render: (_, row) => {
        const hasStation = row.station_name || row.location;
        if (!hasStation) return <span className="cell-empty">— ไม่ระบุสถานี —</span>;
        return (
          <StationCell
            stationName={row.station_name}
            areaName={row.station_area_name}
            province={row.station_province}
            fallbackLocation={row.location}
            locationSnapshot={row.location_snapshot}
            compact={true}
          />
        );
      }
    },
    {
      id: 'status',
      header: 'ประเภทการเบิก',
      accessor: 'type',
      priority: 1,
      width: '140px',
      align: 'center',
      render: (val) => (
        <span className={`badge ${getBadgeClass(val)}`} style={{ minWidth: '100px', justifyContent: 'center' }}>
          {val}
        </span>
      )
    },
    {
      id: 'sn_alert',
      header: 'S/N',
      accessor: 'items_missing_sn',
      priority: 1,
      width: '130px',
      align: 'center',
      render: (val, row) => {
        const missing = (val as number) || 0;
        if (missing <= 0) {
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--success)' }}>
              <Tag size={12} /> ครบแล้ว
            </span>
          );
        }
        const isLoading = loadingPicker === row.id;
        return (
          <button
            type="button"
            disabled={isLoading}
            onClick={(e) => {
              e.stopPropagation();
              openSnPicker(row.id);
            }}
            className="sn-alert-btn-blink"
            title={`มีอุปกรณ์ที่ยังไม่ระบุ S/N จำนวน ${missing} เครื่อง — คลิกเพื่อกรอก`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: 'var(--danger)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.75rem',
              fontWeight: 800,
              cursor: isLoading ? 'wait' : 'pointer',
              boxShadow: '0 0 0 0 rgba(239, 68, 68, 0.5)',
              whiteSpace: 'nowrap'
            }}
          >
            <AlertTriangle size={13} />
            {isLoading ? 'กำลังโหลด...' : `ขาด ${missing} S/N`}
          </button>
        );
      }
    }
  ];

  const actions: TableAction<Withdrawal>[] = [
    {
      id: 'view_page',
      label: 'ดูหน้าหลัก',
      icon: <ExternalLink size={14} />,
      onClick: (row) => window.location.href = `/withdrawal/${row.id}`,
      inline: true
    },
    {
      id: 'print',
      label: 'พิมพ์ใบเบิก (PDF)',
      icon: <Printer size={14} />,
      onClick: (row) => handlePrint(row.id),
      disabled: (row) => isPrintLoading === row.id,
      inline: true
    },
    {
      id: 'delete',
      label: 'ลบรายการ',
      icon: <Trash2 size={14} />,
      variant: 'danger',
      onClick: (row) => handleDelete(row.id),
      hidden: () => !hasPermission('delete.withdrawals')
    }
  ];

  const filtersConfig: TableFilter[] = [
    { id: 'type', label: 'ประเภท', type: 'select', options: uniqueTypes },
    {
      id: 'sn_status',
      label: 'สถานะ S/N',
      type: 'select',
      options: [
        { label: 'ยังไม่ครบ (ขาด S/N)', value: 'missing' },
        { label: 'ระบุครบถ้วน', value: 'complete' }
      ]
    }
  ];

  const filteredData = useMemo(() => {
    return (withdrawals || []).filter(w => {
      if (urlState.search) {
        const s = urlState.search.toLowerCase();
        const matchesSearch = 
          w.recipient.toLowerCase().includes(s) ||
          (w.items_summary && w.items_summary.toLowerCase().includes(s)) ||
          w.type.toLowerCase().includes(s) ||
          (w.project_name && w.project_name.toLowerCase().includes(s)) ||
          (w.location && w.location.toLowerCase().includes(s)) ||
          `WD-${w.id.toString().padStart(6, '0')}`.toLowerCase().includes(s);
        if (!matchesSearch) return false;
      }

      if (urlState.filters.type && w.type !== urlState.filters.type) return false;
      
      if (urlState.filters.sn_status) {
        const missingCount = w.items_missing_sn || 0;
        if (urlState.filters.sn_status === 'missing' && missingCount === 0) return false;
        if (urlState.filters.sn_status === 'complete' && missingCount > 0) return false;
      }

      return true;
    }).sort((a, b) => {
      const t = new Date(b.withdrawal_date || b.created_at).getTime() - new Date(a.withdrawal_date || a.created_at).getTime();
      return t !== 0 ? t : b.id - a.id;
    });
  }, [withdrawals, urlState.search, urlState.filters]);

  const indexOfLastItem = urlState.page * urlState.pageSize;
  const indexOfFirstItem = indexOfLastItem - urlState.pageSize;
  const paginatedData = filteredData.slice(indexOfFirstItem, indexOfLastItem);

  const handleExportExcel = () => {
    const headers = [
      'เลขที่ใบเบิก', 'ประเภทการเบิก', 'โครงการ/งาน', 'สถานที่', 'ผู้เบิก/หน่วยงาน', 'รายการอุปกรณ์', 'เอกสารอ้างอิง', 'หมายเหตุ', 'วันที่เบิกจริง', 'วันที่บันทึกระบบ'
    ];
    const rows = filteredData.map(w => [
      `WD-${String(w.id).padStart(5, '0')}`,
      w.type,
      w.project_name || '-',
      w.location || '-',
      w.recipient,
      w.items_summary || '-',
      w.contract_no ? `${w.contract_no} (ปี ${w.contract_year || '-'})` : (w.contract_reference_type === 'none' ? `ไม่มีสัญญา — ${w.contract_reference_note || '-'}` : '-'),
      w.note || '-',
      w.withdrawal_date ? new Date(`${w.withdrawal_date}T00:00:00`).toLocaleDateString('th-TH') : '-',
      w.created_at ? new Date(w.created_at).toLocaleDateString('th-TH') : '-'
    ]);
    exportToCsv(`withdrawals_export_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`, headers, rows);
    notify('ส่งออกข้อมูล Excel เรียบร้อยแล้ว');
  };

  const renderDetailDrawer = useCallback((row: Withdrawal) => {
    const itemCount = row.items_summary ? row.items_summary.split(',').length : 0;
    
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className={`badge ${getBadgeClass(row.type)}`}>{row.type}</span>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{row.withdrawal_date ? new Date(`${row.withdrawal_date}T00:00:00`).toLocaleDateString('th-TH') : formatDateTimeThai(row.created_at)}</span>
        </div>

        <section>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', color: 'var(--primary)' }}>
            <User size={18} /> ข้อมูลผู้เบิก
          </h4>
          <Card style={{ padding: '1rem', backgroundColor: 'var(--bg-app)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div><strong>ผู้เบิก:</strong> {row.recipient}</div>
              <div><strong>หน่วยงาน:</strong> {row.project_name || '-'}</div>
              <div><strong>โครงการ:</strong> {row.project_name || '-'}</div>
            </div>
          </Card>
        </section>

        <section>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', color: 'var(--primary)' }}>
            <MapPin size={18} /> สถานที่ใช้งาน
          </h4>
          <Card style={{ padding: '1rem', backgroundColor: 'var(--bg-app)' }}>
            <StationCell 
              stationName={row.station_name} 
              areaName={row.station_area_name}
              province={row.station_province}
              fallbackLocation={row.location}
              locationSnapshot={row.location_snapshot}
              compact={false}
            />
          </Card>
        </section>

        <section>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', color: 'var(--primary)' }}>
            <Boxes size={18} /> รายการอุปกรณ์ ({itemCount} รายการ)
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {row.items_summary?.split(',').map((item, idx) => (
              <div key={idx} style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                padding: '0.75rem',
                backgroundColor: 'var(--bg-card)',
                borderRadius: '8px',
                border: '1px solid var(--border)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Package size={16} color="var(--text-muted)" />
                  <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{item.trim()}</span>
                </div>
              </div>
            ))}
          </div>
          {row.items_missing_sn !== undefined && row.items_missing_sn > 0 && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: 'var(--danger-light)', borderRadius: '8px', color: 'var(--danger)', fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Tag size={16} /> มีอุปกรณ์ที่ยังไม่ระบุหมายเลขเครื่อง (S/N) ({row.items_missing_sn} เครื่อง)
            </div>
          )}
        </section>

        <section>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', color: 'var(--primary)' }}>
            <MessageSquare size={18} /> หมายเหตุ
          </h4>
          <div style={{ padding: '1rem', backgroundColor: 'var(--bg-app)', borderRadius: '8px', fontSize: '0.9rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            {row.note || 'ไม่มีหมายเหตุ'}
          </div>
        </section>

        <div style={{ marginTop: 'auto', paddingTop: '2rem', display: 'flex', gap: '1rem' }}>
          <Button variant="primary" style={{ flex: 1 }} onClick={() => handlePrint(row.id)} icon={<Printer size={18} />}>พิมพ์ใบเบิก</Button>
          <Link to={`/withdrawal/${row.id}`} style={{ flex: 1 }}><Button variant="outline" style={{ width: '100%' }}>เปิดหน้าหลัก</Button></Link>
        </div>
      </div>
    );
  }, [handlePrint]);

  return (
    <div className="withdrawal-list-page" style={{ padding: '0 0 4rem 0', backgroundColor: 'var(--bg-app)', minHeight: '100vh' }}>
      <div className="responsive-page-content" style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 2.5rem' }}>
        <BackButton />
        <div className="page-header boot-animate stagger-0" style={{ marginBottom: '2.5rem' }}>
          <div className="page-title">
            <h2>ประวัติการเบิกอุปกรณ์</h2>
            <p>ตรวจสอบรายการเบิกอุปกรณ์ย้อนหลังทั้งหมดในระบบคลังพัสดุ</p>
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Button variant="outline" icon={<Download size={20} />} onClick={handleExportExcel}>ส่งออก Excel</Button>
            <Link to="/withdrawal">
              <Button variant="primary" icon={<Plus size={20} />}>
                ทำการเบิกใหม่
              </Button>
            </Link>
          </div>
        </div>

        <div className="stats-grid boot-animate stagger-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
          {[
            { id: 'all', label: 'ใบเบิกทั้งหมด', val: stats.total, icon: Boxes, color: 'var(--primary)', type: undefined, snStatus: undefined },
            { id: 'install', label: 'ติดตั้งใหม่', val: stats.install, icon: Tag, color: 'var(--primary)', type: 'ติดตั้งใหม่', snStatus: undefined },
            { id: 'repair', label: 'ซ่อมแซม', val: stats.repair, icon: Wrench, color: 'var(--warning)', type: 'ซ่อมแซม', snStatus: undefined },
            { id: 'missing_sn', label: 'รอระบุ S/N', val: stats.missingSn, icon: AlertTriangle, color: 'var(--danger)', type: undefined, snStatus: 'missing' }
          ].map((s) => (
            <Card
              key={s.id}
              className={s.id === 'missing_sn' && s.val > 0 ? 'led-breathe-danger' : ''}
              onClick={() => setTableState({ filters: s.id === 'all' ? {} : { type: s.type, sn_status: s.snStatus }, page: 1 })}
              style={{
                cursor: 'pointer',
                borderColor: (s.id === 'all' && !urlState.filters.type && !urlState.filters.sn_status)
                  || urlState.filters.type === s.type
                  || (s.snStatus && urlState.filters.sn_status === s.snStatus)
                  ? 'var(--primary)' : undefined
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div className="stat-icon-wrapper" style={{ color: s.color }}><s.icon size={24} /></div>
                <div><div className="stat-value">{s.val}</div><div className="stat-label">{s.label}</div></div>
              </div>
            </Card>
          ))}
        </div>

        <div className="boot-animate stagger-1">
          <TableToolbar
            searchValue={urlState.search}
            onSearchChange={(val) => setTableState({ search: val, page: 1 })}
            filters={filtersConfig}
            activeFilters={urlState.filters}
            onFilterChange={(f) => setTableState({ filters: f, page: 1 })}
            onReset={() => setTableState({ search: '', filters: {}, page: 1 })}
            searchPlaceholder="ค้นหาเลขใบเบิก, ผู้เบิก, หรือโครงการ..."
          />

          <BaseDataTable
            columns={columns}
            data={paginatedData}
            state={{
              loading,
              error: error?.message || null,
              empty: !loading && paginatedData.length === 0
            }}
            totalCount={withdrawals?.length ?? 0}
            emptyState={{
              noData: { message: 'ยังไม่มีรายการเบิกในระบบ', hint: 'กด "ทำการเบิกใหม่" เพื่อสร้างใบเบิกแรก' },
              noResults: { message: 'ไม่พบใบเบิกที่ตรงกับเงื่อนไข', hint: 'ลองปรับคำค้นหรือตัวกรองใหม่' }
            }}
            actions={actions}
            onRetry={fetchWithdrawals}
            drawerTitle={(row) => `รายละเอียดใบเบิก WD-${row.id.toString().padStart(6, '0')}`}
            renderDetailDrawer={renderDetailDrawer}
            getRowAccent={(r) => getAccentColor(r.type)}
            mobileConfig={{
              title: (row) => row.recipient,
              subtitle: (row) => `WD-${row.id.toString().padStart(6, '0')} · ${row.project_name || 'ไม่ระบุโครงการ'}`,
              statusBadge: (row) => <span className={`badge ${getBadgeClass(row.type)}`} style={{ width: '80px', textAlign: 'center' }}>{row.type}</span>
            }}
          />

          {!loading && filteredData.length > 0 && (
            <TablePagination
              config={{
                page: urlState.page,
                pageSize: urlState.pageSize,
                totalItems: filteredData.length
              }}
              onPageChange={(p) => setTableState({ page: p })}
              onPageSizeChange={(s) => setTableState({ pageSize: s, page: 1 })}
            />
          )}
        </div>
      </div>

      {printingWithdrawal && (
        <PrintDialog
          open={isPrintDialogOpen}
          onClose={() => {
            setIsPrintDialogOpen(false);
            setPrintingWithdrawal(null);
          }}
          templateId="pdf-withdrawal-template"
          docTitle={`ใบเบิกอุปกรณ์ - WD-${printingWithdrawal.id.toString().padStart(6, '0')}`}
          onBeforePrint={handleBeforePrint}
          renderTemplate={(company, logo) => (
            <PrintWithdrawalTemplate
              withdrawal={printingWithdrawal}
              company={company}
              logo={logo}
            />
          )}
        />
      )}

      {/* Picker Modal: เลือก item ที่ขาด S/N (กรณีในใบเบิกมีหลายรายการ) */}
      {snPicker.isOpen && (
        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={() => setSnPicker({ ...snPicker, isOpen: false })}>
          <div className="modal-content" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertTriangle size={22} color="var(--danger)" /> เลือกอุปกรณ์ที่ต้องการระบุ S/N
              </h3>
              <button className="close-btn" onClick={() => setSnPicker({ ...snPicker, isOpen: false })}><X size={20} /></button>
            </div>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              ใบเบิก <strong style={{ color: 'var(--primary)' }}>WD-{(snPicker.withdrawalId || 0).toString().padStart(6, '0')}</strong> มีอุปกรณ์ <strong>{snPicker.items.length}</strong> รายการที่ยังระบุ S/N ไม่ครบ — เลือกรายการที่ต้องการกรอก:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '420px', overflowY: 'auto' }}>
              {snPicker.items.map((it) => {
                const currentSns = it.serial_numbers ? it.serial_numbers.split(', ').filter(s => s.trim()) : [];
                const missing = it.quantity - currentSns.length;
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => handlePickItem(it)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 16px',
                      background: 'var(--bg-app)',
                      border: '1.5px solid var(--border)',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--danger)';
                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.04)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.background = 'var(--bg-app)';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                      <Package size={20} color="var(--primary)" style={{ flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.item_name}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                          {it.item_model || '-'} · กรอกแล้ว {currentSns.length}/{it.quantity}
                        </div>
                      </div>
                    </div>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 10px',
                      background: 'var(--danger)',
                      color: '#fff',
                      borderRadius: '6px',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      whiteSpace: 'nowrap',
                      flexShrink: 0
                    }}>
                      <AlertTriangle size={11} /> ขาด {missing}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modal กรอก S/N สำหรับ item ที่เลือก */}
      <ProvideSnModal
        isOpen={snModal.isOpen}
        onClose={() => setSnModal({ ...snModal, isOpen: false })}
        onSuccess={() => fetchWithdrawals()}
        title={`ระบุ S/N ย้อนหลัง: ${snModal.itemName}`}
        totalQuantity={snModal.totalQty}
        existingSns={snModal.existingSns}
        onSubmit={async (newSns) => {
          if (snModal.withdrawalId && snModal.itemId) {
            await withdrawalApi.updateItemSn(snModal.withdrawalId, snModal.itemId, newSns);
          }
        }}
      />

      {/* Blinking animation สำหรับปุ่มแดงเตือน S/N */}
      <style>{`
        @keyframes snAlertPulse {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 0 6px rgba(239, 68, 68, 0);
            transform: scale(1.04);
          }
        }
        @keyframes snAlertGlow {
          0%, 100% { background: var(--danger); }
          50% { background: #f87171; }
        }
        .sn-alert-btn-blink {
          animation: snAlertPulse 1.4s ease-in-out infinite, snAlertGlow 1.4s ease-in-out infinite;
        }
        .sn-alert-btn-blink:hover {
          animation-play-state: paused;
          background: #dc2626 !important;
          transform: scale(1.06) !important;
        }
        .sn-alert-btn-blink:disabled {
          animation: none;
          opacity: 0.7;
        }
      `}</style>
    </div>
  );
};

export default WithdrawalList;
