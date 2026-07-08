import React, { useEffect, useMemo, useCallback, useState } from 'react';
import { purchaseOrderApi } from '../api';
import { useApi } from '../hooks/useApi';
import { useNotification } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { BackButton } from '../components/ui/BackButton';
import { Card } from '../components/ui/Card';
import { formatDateTimeThai } from '../utils/formatDate';
import {
  Trash2,
  Check,
  PackageCheck,
  FileText,
  Sparkles,
  Info,
  Package,
  ScanEye,
  Loader2,
  ShoppingBag,
  Plus,
  Printer,
  Send,
  Clock,
  CheckSquare,
  FileSignature,
  X
} from 'lucide-react';
import NewPurchaseOrderModal from '../components/NewPurchaseOrderModal';
import PrintPurchaseOrderTemplate from '../components/PrintPurchaseOrderTemplate';
import { PrintDialog } from '../components/PrintDialog';
import type { PurchaseOrder } from '../types';
import type { TableColumn, TableAction } from '../types/table.types';
import BaseDataTable from '../components/tables/BaseDataTable';
import TableToolbar from '../components/tables/TableToolbar';
import TablePagination from '../components/tables/TablePagination';
import { useTableUrlState } from '../hooks/useTableUrlState';

const PurchaseOrderList: React.FC = () => {
  const { notify, confirm } = useNotification();
  const { hasPermission } = useAuth();
  const { urlState, setTableState } = useTableUrlState(20);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isNewPoModalOpen, setIsNewPoModalOpen] = useState(false);
  const [printPo, setPrintPo] = useState<PurchaseOrder | null>(null);
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  const [printingId, setPrintingId] = useState<number | string | null>(null);
  const [editingPo, setEditingPo] = useState<PurchaseOrder | null>(null);



  const { data: pos = [], loading, error, request: fetchPOs } = useApi(purchaseOrderApi.getAll);

  useEffect(() => {
    fetchPOs();
  }, [fetchPOs]);

  const handleAutoGenerate = async () => {
    setIsGenerating(true);
    try {
      await purchaseOrderApi.autoGenerate();
      notify('สแกนและสร้างใบสั่งซื้อสำหรับพัสดุสต็อกต่ำเรียบร้อยแล้ว');
      fetchPOs();
    } catch (err) {
      const error = err as Error;
      notify(error.message || 'เกิดข้อผิดพลาดในการสแกนสต็อก', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDelete = async (id: number | string) => {
    const isConfirmed = await confirm({
      title: 'ยืนยันการลบใบสั่งซื้อ',
      message: 'คุณต้องการลบใบสั่งซื้อนี้ใช่หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้',
      variant: 'danger'
    });
    if (isConfirmed) {
      try {
        await purchaseOrderApi.delete(id);
        notify('ลบใบสั่งซื้อเรียบร้อยแล้ว');
        fetchPOs();
      } catch (err) {
        const error = err as Error;
        notify(error.message || 'ไม่สามารถลบใบสั่งซื้อได้', 'error');
      }
    }
  };

  const handlePrint = async (id: number | string) => {
    if (printingId) return;
    setPrintingId(id);
    try {
      const detail = await purchaseOrderApi.getById(id);
      setPrintPo(detail);
      setIsPrintDialogOpen(true);
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } }; message?: string };
      notify(error?.response?.data?.message || error?.message || 'ไม่สามารถพิมพ์ใบสั่งซื้อได้', 'error');
      setPrintPo(null);
    } finally {
      setPrintingId(null);
    }
  };

  const handleBeforePrint = async (companyId: number) => {
    if (!printPo) return;
    try {
      await purchaseOrderApi.updateCompany(printPo.id, companyId);
    } catch (err) {
      console.error('Failed to update company_id:', err);
    }
  };

  const handleReceive = useCallback(async (id: number | string) => {
    const isConfirmed = await confirm({
      title: 'ยืนยันการตรวจรับสินค้า',
      message: 'ยืนยันการตรวจรับพัสดุเข้าคลังสำหรับใบสั่งซื้อนี้?\nระบบจะอัปเดตสต็อกตามรายการอัตโนมัติ',
      variant: 'primary'
    });
    if (isConfirmed) {
      try {
        await purchaseOrderApi.receive(id);
        notify('ตรวจรับพัสดุเข้าคลังเรียบร้อยแล้ว');
        fetchPOs();
      } catch (err) {
        const error = err as Error;
        notify(error.message || 'ไม่สามารถตรวจรับใบสั่งซื้อได้', 'error');
      }
    }
  }, [fetchPOs, notify, confirm]);

  const handleUpdateStatus = useCallback(async (id: number | string, newStatus: 'Draft' | 'Pending' | 'Approved' | 'Ordered' | 'Cancelled', successMsg: string) => {
    const isConfirmed = await confirm({
      title: 'ยืนยันการเปลี่ยนสถานะ',
      message: 'คุณต้องการเปลี่ยนสถานะของใบสั่งซื้อนี้ใช่หรือไม่?',
      variant: 'warning'
    });
    if (isConfirmed) {
      try {
        await purchaseOrderApi.update(id, { status: newStatus });
        notify(successMsg || 'อัปเดตสถานะเรียบร้อยแล้ว');
        fetchPOs();
      } catch (err) {
        const error = err as Error;
        notify(error.message || 'ไม่สามารถอัปเดตสถานะได้', 'error');
      }
    }
  }, [fetchPOs, notify, confirm]);

  const getAccentColor = (status: string): string => {
    switch (status) {
      case 'Draft': return 'var(--text-muted)';
      case 'Pending': return 'var(--warning)';
      case 'Approved': return 'var(--info)';
      case 'Ordered': return 'var(--primary)';
      case 'Received': return 'var(--success)';
      case 'Cancelled': return 'var(--danger)';
      default: return 'transparent';
    }
  };

  const filteredData = useMemo(() => {
    const list = pos || [];
    return list.filter(p => {
      if (urlState.search) {
        const s = urlState.search.toLowerCase();
        const matches = p.po_no.toLowerCase().includes(s) || (p.ordered_by && p.ordered_by.toLowerCase().includes(s));
        if (!matches) return false;
      }
      if (urlState.filters.status && urlState.filters.status !== 'All' && p.status !== urlState.filters.status) return false;
      return true;
    }).sort((a, b) => {
      const t = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return t !== 0 ? t : b.id - a.id;
    });
  }, [pos, urlState]);

  const indexOfLastItem = urlState.page * urlState.pageSize;
  const indexOfFirstItem = indexOfLastItem - urlState.pageSize;
  const paginatedData = filteredData.slice(indexOfFirstItem, indexOfLastItem);

  const getStatusBadge = useCallback((status: string) => {
    const badgeStyle = (bg: string, color: string, border: string): React.CSSProperties => ({
      backgroundColor: bg, color: color, border: `1px solid ${border}`, padding: '4px 10px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', width: '90px', justifyContent: 'center'
    });
    switch (status) {
      case 'Draft': return <span style={badgeStyle('var(--bg-app)', 'var(--text-muted)', 'var(--border)')}>แบบร่าง</span>;
      case 'Pending': return <span style={badgeStyle('var(--warning-light)', 'var(--warning)', 'var(--warning-border)')}>รออนุมัติ</span>;
      case 'Approved': return <span style={badgeStyle('var(--info-light)', 'var(--info)', 'var(--info-border)')}>อนุมัติแล้ว</span>;
      case 'Ordered': return <span style={badgeStyle('var(--primary-light)', 'var(--primary)', 'rgba(41, 182, 246, 0.4)')}>สั่งซื้อแล้ว</span>;
      case 'Received': return <span style={badgeStyle('var(--success-light)', 'var(--success)', 'var(--success-border)')}>รับของแล้ว</span>;
      case 'Cancelled': return <span style={badgeStyle('var(--danger-light)', 'var(--danger)', 'var(--danger-border)')}>ยกเลิก</span>;
      default: return null;
    }
  }, []);

  const columns: TableColumn<PurchaseOrder>[] = [
    {
      id: 'po_no', header: 'เลขที่ใบสั่งซื้อ', accessor: 'po_no', priority: 1, width: '160px',
      render: (val, row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, color: 'var(--primary)', fontSize: '0.92rem' }}>
            <FileText size={14} color="var(--primary)" style={{ opacity: 0.6, flexShrink: 0 }} />
            {val}
          </div>
          {row.created_by === 'System' && (
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg-app)', padding: '1px 6px', borderRadius: '4px', width: 'fit-content' }}>
              <Sparkles size={9} style={{ marginRight: 3, verticalAlign: 'middle' }} />ระบบสร้างอัตโนมัติ
            </span>
          )}
        </div>
      )
    },
    {
      id: 'requester', header: 'ผู้สั่งซื้อ', accessor: 'ordered_by', priority: 2, width: '150px',
      render: (val) => (
        val
          ? <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{val}</span>
          : <span className="cell-empty">—</span>
      )
    },
    {
      id: 'creator', header: 'ผู้สร้าง PO', accessor: 'created_by', priority: 3, width: '130px',
      render: (val) => {
        const isSystem = val === 'System';
        if (!val) return <span className="cell-empty">—</span>;
        return (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            padding: '3px 8px', borderRadius: '6px',
            background: isSystem ? 'var(--bg-app)' : 'var(--success-light)',
            color: isSystem ? 'var(--text-muted)' : 'var(--success)',
            fontSize: '0.72rem', fontWeight: 700
          }}>
            {isSystem ? <><Sparkles size={10} /> ระบบ</> : val}
          </span>
        );
      }
    },
    {
      id: 'items', header: 'จำนวนรายการ', accessor: 'item_count', priority: 1, width: '120px', align: 'center',
      render: (val) => (
        <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: '4px' }}>
          <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>{val || 0}</span>
          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>รายการ</span>
        </div>
      )
    },
    {
      id: 'status', header: 'สถานะ', accessor: 'status', priority: 1, width: '120px', align: 'center',
      render: (val) => getStatusBadge(val)
    },
    {
      id: 'created', header: 'วันที่สร้าง', accessor: 'created_at', priority: 2, width: '130px',
      render: (val) => {
        if (!val) return <span className="cell-empty">—</span>;
        const [date, time] = formatDateTimeThai(val).split(' เวลา ');
        return (
          <div className="cell-date-stack">
            <span className="cd-primary">{date}</span>
            {time && <span className="cd-secondary">{time}</span>}
          </div>
        );
      }
    },
    {
      id: 'date', header: 'วันที่อัปเดต', accessor: 'updated_at', priority: 1, width: '130px',
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

  const actions: TableAction<PurchaseOrder>[] = [
    { id: 'view', label: 'ดูรายละเอียด', icon: <ScanEye size={14} />, onClick: () => {}, inline: true },
    {
      id: 'edit',
      label: 'แก้ไขใบสั่งซื้อ',
      icon: <FileSignature size={14} />,
      onClick: (row) => {
        setEditingPo(row);
        setIsNewPoModalOpen(true);
      },
      hidden: (row) => row.status !== 'Draft',
      inline: true
    },
    {
      id: 'submit_approval',
      label: 'ส่งขออนุมัติ',
      icon: <Send size={14} />,
      variant: 'primary',
      onClick: (row) => handleUpdateStatus(row.id, 'Pending', 'ส่งขออนุมัติจัดซื้อเรียบร้อยแล้ว'),
      hidden: (row) => row.status !== 'Draft',
      inline: true
    },
    {
      id: 'approve',
      label: 'อนุมัติสั่งซื้อ',
      icon: <CheckSquare size={14} />,
      variant: 'success',
      onClick: (row) => handleUpdateStatus(row.id, 'Approved', 'อนุมัติใบสั่งซื้อเรียบร้อยแล้ว'),
      hidden: (row) => row.status !== 'Pending',
      inline: true
    },
    {
      id: 'mark_ordered',
      label: 'ยืนยันการส่งสั่งซื้อ',
      icon: <Send size={14} />,
      variant: 'primary',
      onClick: (row) => handleUpdateStatus(row.id, 'Ordered', 'บันทึกสถานะสั่งซื้อเรียบร้อยแล้ว'),
      hidden: (row) => row.status !== 'Approved',
      inline: true
    },
    {
      id: 'receive',
      label: 'ตรวจรับของ',
      icon: <PackageCheck size={14} />,
      variant: 'primary',
      onClick: (row) => handleReceive(row.id),
      hidden: (row) => row.status !== 'Ordered',
      inline: true
    },
    {
      id: 'print',
      label: 'พิมพ์ใบสั่งซื้อ',
      icon: <Printer size={14} />,
      onClick: (row) => handlePrint(row.id)
    },
    { id: 'delete', label: 'ลบใบสั่งซื้อ', icon: <Trash2 size={14} />, variant: 'danger', onClick: (row) => handleDelete(row.id), hidden: () => !hasPermission('delete.purchase_orders') }
  ];

  const renderDetailDrawer = useCallback((po: PurchaseOrder) => (
    <PurchaseOrderDetailDrawerContent
      po={po}
      handleReceive={handleReceive}
      handleUpdateStatus={handleUpdateStatus}
      getStatusBadge={getStatusBadge}
      handleEdit={(selectedPo) => {
        setEditingPo(selectedPo);
        setIsNewPoModalOpen(true);
      }}
    />
  ), [handleReceive, handleUpdateStatus, getStatusBadge]);

  return (
    <div className="po-page fade-in" style={{ padding: '0 0 4rem 0', backgroundColor: 'var(--bg-app)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 2.5rem' }}>
        <BackButton />
        <div className="page-header" style={{ marginBottom: '2rem' }}>
          <div className="page-title">
            <h2>การจัดซื้อพัสดุและอุปกรณ์ (PO)</h2>
            <p>จัดการใบสั่งซื้อ ตรวจรับพัสดุ และสแกนสต็อกต่ำเพื่อสั่งซื้ออัตโนมัติ</p>
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Button
              variant="outline"
              icon={isGenerating ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
              onClick={handleAutoGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? 'กำลังสแกน...' : 'สแกนสต็อกต่ำ'}
            </Button>
            <Button
              variant="primary"
              icon={<Plus size={16} />}
              onClick={() => setIsNewPoModalOpen(true)}
            >
              สร้างใบสั่งซื้อใหม่
            </Button>
          </div>
        </div>

      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
        {[
          { label: 'ทั้งหมด', val: pos?.length || 0, icon: ShoppingBag, status: 'All', color: 'var(--primary)' },
          { label: 'แบบร่าง', val: (pos || []).filter(p => p.status === 'Draft').length, icon: FileText, status: 'Draft', color: 'var(--text-muted)' },
          { label: 'รออนุมัติ', val: (pos || []).filter(p => p.status === 'Pending').length, icon: Clock, status: 'Pending', color: 'var(--warning)' },
          { label: 'อนุมัติแล้ว', val: (pos || []).filter(p => p.status === 'Approved').length, icon: CheckSquare, status: 'Approved', color: 'var(--info)' },
          { label: 'รับเข้าคลังแล้ว', val: (pos || []).filter(p => p.status === 'Received').length, icon: Check, status: 'Received', color: 'var(--success)' }
        ].map((s, i) => (
          <Card key={i} onClick={() => setTableState({ filters: { status: s.status }, page: 1 })} style={{ cursor: 'pointer', borderColor: urlState.filters.status === s.status ? 'var(--primary)' : undefined }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}><div className="stat-icon-wrapper" style={{ color: s.color }}><s.icon size={22} /></div><div><div className="stat-value">{s.val}</div><div className="stat-label">{s.label}</div></div></div>
          </Card>
        ))}
      </div>

      <TableToolbar
        searchValue={urlState.search}
        onSearchChange={(val) => setTableState({ search: val, page: 1 })}
        filters={[{ id: 'status', label: 'สถานะ', type: 'select', options: [{ label: 'แบบร่าง', value: 'Draft' }, { label: 'รออนุมัติ', value: 'Pending' }, { label: 'อนุมัติแล้ว', value: 'Approved' }, { label: 'รับของแล้ว', value: 'Received' }, { label: 'ยกเลิก', value: 'Cancelled' }] }]}
        activeFilters={urlState.filters}
        onFilterChange={(f) => setTableState({ filters: f, page: 1 })}
        onReset={() => setTableState({ search: '', filters: {}, page: 1 })}
        searchPlaceholder="ค้นหาเลข PO, บริษัท, หรือผู้ขอซื้อ..."
      />

      <BaseDataTable
        columns={columns}
        data={paginatedData}
        state={{ loading, error: error?.message || null, empty: !loading && paginatedData.length === 0 }}
        totalCount={pos?.length ?? 0}
        emptyState={{
          noData: { message: 'ยังไม่มีใบสั่งซื้อในระบบ', hint: 'ระบบจะสร้างใบสั่งซื้ออัตโนมัติเมื่อพัสดุต่ำกว่าเกณฑ์ หรือกด "สร้างใบสั่งซื้อ" เพื่อสร้างเอง' },
          noResults: { message: 'ไม่พบใบสั่งซื้อที่ตรงกับเงื่อนไข', hint: 'ลองปรับคำค้นหรือตัวกรองใหม่' }
        }}
        actions={actions}
        onRetry={fetchPOs}
        drawerTitle={(po) => `ใบสั่งซื้อ ${po.po_no}`}
        renderDetailDrawer={renderDetailDrawer}
        getRowAccent={(r) => getAccentColor(r.status)}
        mobileConfig={{
          title: (r) => r.po_no,
          subtitle: (r) => r.ordered_by || '',
          statusBadge: (r) => getStatusBadge(r.status)
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

      {/* Modal สร้าง PO ใหม่ด้วยตัวเอง */}
      <NewPurchaseOrderModal
        isOpen={isNewPoModalOpen}
        onClose={() => {
          setIsNewPoModalOpen(false);
          setEditingPo(null);
        }}
        onSuccess={() => {
          fetchPOs();
          setEditingPo(null);
        }}
        editingPo={editingPo}
      />

      {printPo && (
        <PrintDialog
          open={isPrintDialogOpen}
          onClose={() => {
            setIsPrintDialogOpen(false);
            setPrintPo(null);
          }}
          templateId="pdf-po-template"
          docTitle={`ใบสั่งซื้อ ${printPo.po_no}`}
          onBeforePrint={handleBeforePrint}
          renderTemplate={(company, logo) => (
            <PrintPurchaseOrderTemplate po={printPo} company={company} logo={logo} />
          )}
        />
      )}


    </div>
  );
};

export default PurchaseOrderList;

function PurchaseOrderStepper({ status }: { status: string }) {
  const steps = [
    { key: 'Draft', label: 'ร่างใบขอซื้อ' },
    { key: 'Pending', label: 'ส่งขออนุมัติ' },
    { key: 'Approved', label: 'อนุมัติสั่งซื้อ' },
    { key: 'Ordered', label: 'ส่งสั่งซื้อให้ผู้ขาย' },
    { key: 'Received', label: 'รับพัสดุเข้าคลัง' }
  ];

  const currentIdx = steps.findIndex(s => s.key === status);
  if (status === 'Cancelled') return null;

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: '16px',
      padding: '1.25rem 1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      marginBottom: '1rem'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', overflowX: 'auto' }}>
        {steps.map((step, idx) => {
          const isCompleted = idx < currentIdx;
          const isActive = idx === currentIdx;
          
          let color = 'var(--text-muted)';
          let bg = 'var(--bg-app)';
          let borderColor = 'var(--border)';
          
          if (isCompleted) {
            color = 'var(--success)';
            bg = 'var(--success-light)';
            borderColor = 'var(--success)';
          } else if (isActive) {
            if (status === 'Draft') { color = 'var(--text-main)'; bg = 'var(--bg-app)'; borderColor = 'var(--text-muted)'; }
            else if (status === 'Pending') { color = 'var(--warning)'; bg = 'var(--warning-light)'; borderColor = 'var(--warning)'; }
            else if (status === 'Approved') { color = 'var(--info)'; bg = 'var(--info-light)'; borderColor = 'var(--info)'; }
            else if (status === 'Ordered') { color = 'var(--primary)'; bg = 'var(--primary-light)'; borderColor = 'var(--primary)'; }
            else if (status === 'Received') { color = 'var(--success)'; bg = 'var(--success-light)'; borderColor = 'var(--success)'; }
          }

          return (
            <div key={idx} style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              flex: 1, 
              position: 'relative',
              zIndex: 2,
              minWidth: '70px'
            }}>
              {idx > 0 && (
                <div style={{
                  position: 'absolute',
                  right: '50%',
                  top: '15px',
                  width: '100%',
                  height: '2px',
                  background: idx <= currentIdx ? 'var(--success)' : 'var(--border)',
                  zIndex: -1
                }} />
              )}

              <div style={{
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                background: bg,
                border: `2px solid ${borderColor}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.8rem',
                fontWeight: 800,
                color: color
              }}>
                {isCompleted ? '✓' : idx + 1}
              </div>
              <span style={{ 
                fontSize: '0.7rem', 
                fontWeight: isActive ? 800 : 600, 
                color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                marginTop: '6px',
                textAlign: 'center',
                whiteSpace: 'nowrap'
              }}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {currentIdx !== -1 && (
        <div style={{ 
          padding: '10px 14px', 
          background: 'var(--bg-app)', 
          borderLeft: `3px solid ${
            status === 'Draft' ? 'var(--text-muted)' :
            status === 'Pending' ? 'var(--warning)' :
            status === 'Approved' ? 'var(--info)' :
            status === 'Ordered' ? 'var(--primary)' : 'var(--success)'
          }`, 
          borderRadius: '4px 8px 8px 4px',
          fontSize: '0.78rem',
          color: 'var(--text-muted)',
          lineHeight: '1.4'
        }}>
          💡 <strong>คำแนะนำ:</strong> {
            status === 'Draft' ? 'อยู่ระหว่างเตรียมข้อมูลพัสดุและผู้ขาย สามารถกดแก้ไขปรับจำนวนสั่งซื้อด้านล่างได้' :
            status === 'Pending' ? 'ส่งเสนอผู้บริหารตรวจสอบ อยู่ระหว่างรอการลงนามอนุมัติสั่งซื้อ' :
            status === 'Approved' ? 'อนุมัติเรียบร้อยแล้ว กรุณาพิมพ์ใบสั่งซื้อส่งให้ผู้ขาย (ร้านค้า) และกดยืนยันการส่งสั่งซื้อด้านล่าง' :
            status === 'Ordered' ? 'สั่งซื้อสินค้าเรียบร้อยแล้ว อยู่ระหว่างรอคู่ค้าจัดส่งสินค้า เมื่อได้รับสินค้าให้กดตรวจรับเข้าคลัง' :
            'ตรวจรับสินค้าเรียบร้อย สต็อกพัสดุได้รับการอัปเดตอัตโนมัติแล้ว'
          }
        </div>
      )}
    </div>
  );
}

function PurchaseOrderDetailDrawerContent({
  po,
  handleReceive,
  handleUpdateStatus,
  getStatusBadge,
  handleEdit
}: {
  po: PurchaseOrder;
  handleReceive: (id: number | string) => void;
  handleUpdateStatus: (id: number | string, newStatus: 'Draft' | 'Pending' | 'Approved' | 'Ordered' | 'Cancelled', successMsg: string) => Promise<void>;
  getStatusBadge: (status: string) => React.ReactNode;
  handleEdit: (po: PurchaseOrder) => void;
}) {
  const [poDetail, setPoDetail] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchDetail = async () => {
      setLoading(true);
      try {
        const detail = await purchaseOrderApi.getById(po.id);
        if (active) {
          setPoDetail(detail);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    fetchDetail();
    return () => {
      active = false;
    };
  }, [po.id]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '3rem', flexDirection: 'column', gap: '12px' }}>
        <Loader2 className="animate-spin" size={24} color="var(--primary)" />
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>กำลังโหลดรายการพัสดุ...</span>
      </div>
    );
  }

  const currentPo = poDetail || po;
  const items = currentPo.items || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} className="reveal-up">
      <PurchaseOrderStepper status={currentPo.status} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary)' }}>{currentPo.po_no}</h3>
        {getStatusBadge(currentPo.status)}
      </div>

      <section>
        <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', color: 'var(--primary)' }}><Info size={18} /> ข้อมูลใบสั่งซื้อ</h4>
        <Card style={{ padding: '1rem', backgroundColor: 'var(--bg-app)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.9rem' }}>
            <div><strong>ผู้สั่งซื้อ:</strong> {currentPo.ordered_by || '-'}</div>
            {currentPo.approved_by && (
              <div><strong>ผู้อนุมัติ:</strong> {currentPo.approved_by} {currentPo.approved_at && `(เมื่อ ${formatDateTimeThai(currentPo.approved_at)})`}</div>
            )}
            <div><strong>วันที่สร้าง:</strong> {formatDateTimeThai(currentPo.created_at)}</div>
            <div><strong>อัปเดตล่าสุด:</strong> {formatDateTimeThai(currentPo.updated_at)}</div>
          </div>
        </Card>
      </section>

      <section>
        <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', color: 'var(--primary)' }}><Package size={18} /> รายการพัสดุ ({currentPo.item_count || items.length} รายการ)</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {currentPo.status === 'Received' && (
            <div style={{ padding: '1rem', backgroundColor: 'rgba(16, 185, 129, 0.05)', borderRadius: '12px', color: 'var(--success)', fontSize: '0.85rem', fontWeight: 700, textAlign: 'center', border: '1px dashed var(--success)', marginBottom: '0.5rem' }}>
              ตรวจรับพัสดุเข้าคลังเรียบร้อยแล้ว
            </div>
          )}
          
          {items.length > 0 ? (
            <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', backgroundColor: 'var(--bg-app)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '10px 12px', fontWeight: 700 }}>รายการสินค้า</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', width: '80px', fontWeight: 700 }}>จำนวน</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: idx < items.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{item.item_name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', flexWrap: 'wrap' }}>
                          {item.item_model && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>รุ่น: {item.item_model}</span>}
                          {item.current_stock !== undefined && item.min_stock !== undefined && (
                            (() => {
                              const isLow = item.current_stock < item.min_stock;
                              const isOut = item.current_stock === 0;
                              return (
                                <span style={{
                                  fontSize: '0.7rem',
                                  fontWeight: 700,
                                  color: isOut ? 'var(--danger)' : isLow ? 'var(--warning)' : 'var(--success)',
                                  backgroundColor: isOut ? 'var(--danger-light)' : isLow ? 'var(--warning-light)' : 'var(--success-light)',
                                  padding: '1px 6px',
                                  borderRadius: '4px'
                                }}>
                                  คงคลัง: {item.current_stock} / เกณฑ์ขั้นต่ำ: {item.min_stock}
                                </span>
                              );
                            })()
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-main)' }}>
                        {item.quantity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: '1rem', backgroundColor: 'var(--bg-app)', borderRadius: '12px', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
              ไม่มีรายการพัสดุในใบสั่งซื้อนี้
            </div>
          )}
        </div>
      </section>

      {currentPo.status === 'Draft' && (
        <div style={{ marginTop: 'auto', paddingTop: '1rem', paddingBottom: '1.5rem', display: 'flex', justifyContent: 'center', gap: '10px' }}>
          <Button variant="outline" size="sm" icon={<FileSignature size={16} />} onClick={() => handleEdit(currentPo)}>
            แก้ไข
          </Button>
          <Button variant="primary" size="sm" icon={<Send size={16} />} onClick={() => handleUpdateStatus(currentPo.id, 'Pending', 'ส่งขออนุมัติจัดซื้อเรียบร้อยแล้ว')}>
            ส่งขออนุมัติ
          </Button>
        </div>
      )}
      {currentPo.status === 'Pending' && (
        <div style={{ marginTop: 'auto', paddingTop: '1rem', paddingBottom: '1.5rem', display: 'flex', justifyContent: 'center', gap: '10px' }}>
          <Button variant="danger" size="sm" icon={<X size={16} />} onClick={() => handleUpdateStatus(currentPo.id, 'Draft', 'ส่งกลับไปเป็นแบบร่างเรียบร้อยแล้ว')}>
            ส่งกลับเพื่อแก้ไข
          </Button>
          <Button variant="success" size="sm" icon={<CheckSquare size={16} />} onClick={() => handleUpdateStatus(currentPo.id, 'Approved', 'อนุมัติใบสั่งซื้อเรียบร้อยแล้ว')}>
            อนุมัติสั่งซื้อ
          </Button>
        </div>
      )}
      {currentPo.status === 'Approved' && (
        <div style={{ marginTop: 'auto', paddingTop: '1rem', paddingBottom: '1.5rem', display: 'flex', justifyContent: 'center' }}>
          <Button variant="primary" size="sm" icon={<Send size={16} />} onClick={() => handleUpdateStatus(currentPo.id, 'Ordered', 'บันทึกสถานะสั่งซื้อเรียบร้อยแล้ว (รอส่งของ)')}>
            ยืนยันการส่งสั่งซื้อ (สั่งซื้อแล้ว)
          </Button>
        </div>
      )}
      {currentPo.status === 'Ordered' && (
        <div style={{ marginTop: 'auto', paddingTop: '1rem', paddingBottom: '1.5rem', display: 'flex', justifyContent: 'center' }}>
          <Button variant="success" size="sm" icon={<PackageCheck size={16} />} onClick={() => handleReceive(currentPo.id)}>
            ตรวจรับพัสดุเข้าคลัง
          </Button>
        </div>
      )}
    </div>
  );
}
