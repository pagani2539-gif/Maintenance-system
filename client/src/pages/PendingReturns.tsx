import React, { useEffect, useMemo, useCallback, useState } from 'react';
import { transactionApi } from '../api';
import { getApiErrorMessage } from '../utils/apiError';
import { useApi } from '../hooks/useApi';
import { useNotification } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { BackButton } from '../components/ui/BackButton';
import Select from '../components/ui/Select';
import { formatDateTimeThai } from '../utils/formatDate';
import {
  Timer,
  AlertTriangle,
  User,
  Briefcase,
  X,
  CheckCircle2,
  Upload,
  Undo2,
  Calendar,
  AlertCircle
} from 'lucide-react';
import type { InventoryTransaction } from '../types';
import type { TableColumn, TableAction } from '../types/table.types';
import StationCell from '../components/shared/StationCell';
import BaseDataTable from '../components/tables/BaseDataTable';
import { compressImage } from '../utils/imageCompressor';
import TableToolbar from '../components/tables/TableToolbar';
import TablePagination from '../components/tables/TablePagination';
import { useTableUrlState } from '../hooks/useTableUrlState';

const PendingReturns: React.FC = () => {
  const { notify } = useNotification();
  const { user: currentUser, hasPermission } = useAuth();
  const { urlState, setTableState } = useTableUrlState(20);
  const [returnModal, setReturnModal] = useState<{ isOpen: boolean; transaction: InventoryTransaction | null }>({
    isOpen: false,
    transaction: null
  });
  const [returning, setReturning] = useState(false);
  const [returnCondition, setReturnCondition] = useState<string>('Good');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);

  const fetchPending = useCallback(() => transactionApi.getAll({ pending_only: true }), []);
  const { data: transactions = [], loading, error, request: fetchTransactions } = useApi(fetchPending);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const isOverdueTx = useCallback((t: InventoryTransaction): boolean => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!t.return_due_date) {
      const daysOut = Math.floor((today.getTime() - new Date(t.created_at).getTime()) / (1000 * 60 * 60 * 24));
      return daysOut >= 14;
    }
    const dueDate = new Date(t.return_due_date);
    dueDate.setHours(0, 0, 0, 0);
    return dueDate.getTime() < today.getTime();
  }, []);

  const stats = useMemo(() => {
    const list = transactions || [];
    const overdueList = list.filter(isOverdueTx);

    return {
      total: list.length,
      overdue: overdueList.length,
      normal: list.length - overdueList.length
    };
  }, [transactions, isOverdueTx]);

  const filteredData = useMemo(() => {
    const list = transactions || [];
    return list.filter((t: InventoryTransaction) => {
      if (urlState.search) {
        const s = urlState.search.toLowerCase();
        const matches =
          t.product_name.toLowerCase().includes(s) ||
          (t.project_name && t.project_name.toLowerCase().includes(s)) ||
          (t.user_name && t.user_name.toLowerCase().includes(s)) ||
          (t.serial_number && t.serial_number.toLowerCase().includes(s)) ||
          (t.location && t.location.toLowerCase().includes(s));
        if (!matches) return false;
      }
      if (urlState.filters.type && urlState.filters.type !== 'All' && t.withdrawal_type !== urlState.filters.type) return false;
      if (urlState.filters.overdue === 'yes' && !isOverdueTx(t)) return false;
      return true;
    });
  }, [transactions, urlState, isOverdueTx]);

  const indexOfLastItem = urlState.page * urlState.pageSize;
  const indexOfFirstItem = indexOfLastItem - urlState.pageSize;
  const paginatedData = filteredData.slice(indexOfFirstItem, indexOfLastItem);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file);
        setImageFile(compressed);
        const reader = new FileReader();
        reader.onloadend = () => {
          setImagePreview(reader.result as string);
        };
        reader.readAsDataURL(compressed);
      } catch (err) {
        console.error('Image compression failed:', err);
        setImageFile(file);
        const reader = new FileReader();
        reader.onloadend = () => {
          setImagePreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    } else {
      setImageFile(null);
      setImagePreview(null);
    }
  };

  const closeReturnModal = () => {
    setReturnModal({ isOpen: false, transaction: null });
    setImagePreview(null);
    setImageFile(null);
    setReturnCondition('Good');
  };

  const handleReturn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!returnModal.transaction) return;

    const formDataObj = new FormData(e.currentTarget);
    const condition = formDataObj.get('condition') as string;
    const note = (formDataObj.get('note') as string || '').trim();

    setReturning(true);
    try {
      const formData = new FormData();
      formData.append('transaction_id', String(returnModal.transaction.id));
      formData.append('inventory_id', String(returnModal.transaction.inventory_id));
      if (returnModal.transaction.instance_id) {
        formData.append('instance_id', String(returnModal.transaction.instance_id));
      }
      formData.append('quantity', String(returnModal.transaction.quantity_borrowed || returnModal.transaction.quantity_withdrawn || 1));
      formData.append('condition', condition);
      formData.append('note', note);
      if (imageFile) {
        formData.append('image', imageFile);
      }

      await transactionApi.return(formData);
      notify('บันทึกการคืนอุปกรณ์เรียบร้อยแล้ว');
      closeReturnModal();
      fetchTransactions();
    } catch (err) {
      notify(getApiErrorMessage(err, 'บันทึกการคืนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'), 'error');
    } finally {
      setReturning(false);
    }
  };

  const columns: TableColumn<InventoryTransaction>[] = [
    {
      id: 'equipment', header: 'อุปกรณ์', accessor: 'product_name', priority: 1, width: 'auto',
      render: (val, row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span>
          {row.product_model && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>{row.product_model}</span>}
        </div>
      )
    },
    {
      id: 'serial_number', header: 'S/N (หมายเลขเครื่อง)', accessor: 'serial_number', priority: 1, width: '160px',
      render: (val) => (
        val ? (
          <span style={{
            display: 'inline-block',
            padding: '3px 8px',
            background: 'var(--bg-app)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            fontSize: '0.78rem',
            fontWeight: 700,
            color: 'var(--primary)',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.3px'
          }}>{val}</span>
        ) : (
          <span className="cell-empty">—</span>
        )
      )
    },
    {
      id: 'quantity', header: 'จำนวน', accessor: 'quantity_withdrawn', priority: 1, width: '90px', align: 'center',
      render: (_, row) => {
        const qty = row.quantity_withdrawn || row.quantity_borrowed || 1;
        return <span style={{ fontSize: '1rem', fontWeight: 800 }}>{qty} ชิ้น</span>;
      }
    },
    {
      id: 'type', header: 'ประเภทการยืม', accessor: 'withdrawal_type', priority: 2, width: '120px',
      render: (val) => {
        const label = val || 'ยืมใช้งาน';
        let badgeClass = 'badge-borrow';
        if (val === 'ทดสอบ') badgeClass = 'badge-info';
        if (val === 'สำรองใช้งาน') badgeClass = 'badge-withdraw';
        return <span className={`badge ${badgeClass}`} style={{ fontSize: '0.72rem', fontWeight: 800 }}>{label}</span>;
      }
    },
    {
      id: 'borrower_location', header: 'ผู้เบิก / สถานที่ติดตั้ง', accessor: 'user_name', priority: 1, width: 'auto',
      render: (val, row) => {
        const project = row.project_name;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <User size={12} color="var(--text-muted)" /> {val || 'ไม่ระบุผู้เบิก'}
            </span>
            <StationCell
              stationName={row.station_name}
              areaName={row.station_area_name}
              province={row.station_province}
              fallbackLocation={row.location}
              locationSnapshot={row.location_snapshot}
              compact={true}
            />
            {project && (
              <span style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Briefcase size={10} /> {project}
              </span>
            )}
          </div>
        );
      }
    },
    {
      id: 'due_status', header: 'กำหนดส่งคืน / สภาพยืม', accessor: 'return_due_date', priority: 1, width: '190px',
      render: (val, row) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const createdDate = new Date(row.created_at);
        
        if (val) {
          const dueDate = new Date(val);
          dueDate.setHours(0, 0, 0, 0);
          const diffTime = dueDate.getTime() - today.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          const [dateFormatted] = formatDateTimeThai(val).split(' เวลา ');

          if (diffDays < 0) {
            // Overdue
            const daysOver = Math.abs(diffDays);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Calendar size={12} /> {dateFormatted}
                </span>
                <span 
                  className="led-breathe-danger"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    padding: '3px 8px', background: 'var(--danger-light)', color: 'var(--danger)',
                    borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800, width: 'fit-content',
                    border: '1px solid var(--danger-border)'
                  }}
                >
                  <AlertTriangle size={11} /> เลยกำหนด {daysOver} วัน
                </span>
              </div>
            );
          } else if (diffDays === 0) {
            // Due today
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Calendar size={12} /> {dateFormatted}
                </span>
                <span 
                  className="led-breathe-warning"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    padding: '3px 8px', background: 'var(--warning-light)', color: 'var(--warning)',
                    borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800, width: 'fit-content',
                    border: '1px solid var(--warning-border)'
                  }}
                >
                  <AlertCircle size={11} /> ครบกำหนดวันนี้
                </span>
              </div>
            );
          } else {
            // Safe
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Calendar size={12} /> {dateFormatted}
                </span>
                <span 
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    padding: '3px 8px', background: 'var(--success-light)', color: 'var(--success)',
                    borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800, width: 'fit-content',
                    border: '1px solid var(--success-border)'
                  }}
                >
                  เหลืออีก {diffDays} วัน
                </span>
              </div>
            );
          }
        } else {
          // No return date set, show duration since created
          const diffTime = today.getTime() - createdDate.getTime();
          const daysOut = Math.floor(diffTime / (1000 * 60 * 60 * 24));
          const isUrgent = daysOut >= 14;

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                ยืมเมื่อ: {formatDateTimeThai(row.created_at).split(' เวลา ')[0]}
              </span>
              <span 
                className={isUrgent ? 'led-breathe-warning' : ''}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  padding: '3px 8px',
                  background: isUrgent ? 'var(--warning-light)' : 'var(--bg-app)',
                  color: isUrgent ? 'var(--warning)' : 'var(--text-muted)',
                  borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800, width: 'fit-content',
                  border: isUrgent ? '1px solid var(--warning-border)' : '1px solid var(--border)'
                }}
              >
                ยืมไปแล้ว {daysOut} วัน
              </span>
            </div>
          );
        }
      }
    }
  ];

  const actions: TableAction<InventoryTransaction>[] = [
    {
      id: 'return',
      label: 'คืนอุปกรณ์',
      icon: <Undo2 size={14} />,
      variant: 'primary',
      onClick: (row) => setReturnModal({ isOpen: true, transaction: row }),
      hidden: () => !hasPermission('manage.transactions'),
      inline: true
    }
  ];

  return (
    <div className="pending-returns-page" style={{ padding: '0 0 4rem 0', backgroundColor: 'var(--bg-app)', minHeight: '100vh' }}>
      <div className="responsive-page-content" style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 2.5rem' }}>
        
        {/* Header */}
        <BackButton />
        <div className="page-header" style={{ marginBottom: '2rem' }}>
          <div className="page-title">
            <h2>อุปกรณ์ค้างส่งคืน</h2>
            <p>ติดตามพัสดุประเภทการยืม ทดสอบ หรือสำรองใช้งาน ที่ยังไม่ได้ส่งคืนกลับเข้าคลังพัสดุ</p>
          </div>
        </div>

        {/* Bento Stats */}
        <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
          {[
            { label: 'อุปกรณ์ค้างคืนทั้งหมด', val: stats.total, icon: Timer, color: 'var(--primary)', glow: false, overdue: undefined },
            { label: 'เลยกำหนด / ค้างนานผิดปกติ', val: stats.overdue, icon: AlertTriangle, color: 'var(--danger)', glow: stats.overdue > 0, overdue: 'yes' }
          ].map((s, i) => (
            <Card
              key={i}
              className={s.glow ? 'led-breathe-danger' : ''}
              onClick={() => setTableState({ filters: { ...urlState.filters, overdue: s.overdue }, page: 1 })}
              style={{ cursor: 'pointer', borderColor: (urlState.filters.overdue || undefined) === s.overdue ? 'var(--primary)' : undefined }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                <div 
                  className="stat-icon-wrapper" 
                  style={{ 
                    color: s.color,
                    background: s.color === 'var(--danger)' ? 'var(--danger-light)' : 'var(--primary-light)' 
                  }}
                >
                  <s.icon size={24} />
                </div>
                <div>
                  <div className="stat-value" style={{ fontSize: '1.75rem', fontWeight: 800 }}>{s.val}</div>
                  <div className="stat-label" style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 600 }}>{s.label}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Toolbar */}
        <TableToolbar
          searchValue={urlState.search}
          onSearchChange={(val) => setTableState({ search: val, page: 1 })}
          filters={[
            {
              id: 'type',
              label: 'ประเภทการยืม',
              type: 'select',
              options: [
                { label: 'ยืมใช้งาน', value: 'ยืมใช้งาน' },
                { label: 'ทดสอบ', value: 'ทดสอบ' },
                { label: 'สำรองใช้งาน', value: 'สำรองใช้งาน' }
              ]
            }
          ]}
          activeFilters={urlState.filters}
          onFilterChange={(f) => setTableState({ filters: f, page: 1 })}
          onReset={() => setTableState({ search: '', filters: {}, page: 1 })}
          searchPlaceholder="ค้นหาชื่ออุปกรณ์, S/N, ผู้เบิก, หรือโครงการ..."
        />

        {/* Data Table */}
        <BaseDataTable
          columns={columns}
          data={paginatedData}
          state={{ loading, error: error?.message || null, empty: !loading && paginatedData.length === 0 }}
          totalCount={transactions?.length ?? 0}
          emptyState={{
            noData: { message: 'ไม่มีอุปกรณ์ค้างส่งคืน', hint: 'อุปกรณ์ที่เบิกแบบยืม/ทดสอบ/สำรอง และยังไม่ได้คืนจะแสดงที่นี่' },
            noResults: { message: 'ไม่พบรายการที่ตรงกับเงื่อนไข', hint: 'ลองปรับคำค้นหรือตัวกรองใหม่' }
          }}
          actions={actions}
          onRetry={fetchTransactions}
          getRowAccent={(r) => {
            const today = new Date();
            today.setHours(0,0,0,0);
            if (r.return_due_date) {
              const dueDate = new Date(r.return_due_date);
              dueDate.setHours(0,0,0,0);
              if (dueDate.getTime() < today.getTime()) return 'var(--danger)';
              if (dueDate.getTime() === today.getTime()) return 'var(--warning)';
            } else {
              const createdDate = new Date(r.created_at);
              const days = Math.floor((today.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
              if (days >= 14) return 'var(--warning)';
            }
            return 'var(--text-muted)';
          }}
          drawerTitle={(tx) => `บันทึกเลขที่ TX-${tx.id.toString().padStart(6, '0')}`}
          mobileConfig={{
            title: (r) => r.product_name,
            subtitle: (r) => `${r.user_name || 'ระบบ'} · ${r.withdrawal_type || 'ยืม'}`,
            statusBadge: (r) => {
              const label = r.withdrawal_type || 'ยืม';
              return <span className="badge badge-borrow">{label}</span>;
            }
          }}
        />

        {/* Pagination */}
        {!loading && filteredData.length > 0 && (
          <TablePagination
            config={{ page: urlState.page, pageSize: urlState.pageSize, totalItems: filteredData.length }}
            onPageChange={(p) => setTableState({ page: p })}
            onPageSizeChange={(s) => setTableState({ pageSize: s, page: 1 })}
          />
        )}
      </div>

      {/* Return Confirmation Modal */}
      {returnModal.isOpen && returnModal.transaction && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '550px' }}>
            <div className="modal-header">
              <h3><Undo2 size={22} color="var(--primary)" /> คืนอุปกรณ์เข้าคลัง</h3>
              <button className="close-btn" onClick={closeReturnModal}><X size={20} /></button>
            </div>

            <form onSubmit={handleReturn}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <Card style={{ padding: '1rem', backgroundColor: 'var(--bg-app)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px' }}>รายการที่จะคืน</div>
                  <div style={{ fontWeight: 800, fontSize: '1rem' }}>{returnModal.transaction.product_name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>S/N: {returnModal.transaction.serial_number || 'ไม่ระบุ'}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>จำนวน: {returnModal.transaction.quantity_borrowed || returnModal.transaction.quantity_withdrawn || 1} ชิ้น</div>
                </Card>

                <div className="form-group">
                  <label>ผู้คืนอุปกรณ์</label>
                  <div style={{
                    padding: '10px 14px', background: 'var(--bg-app)',
                    border: '1px solid var(--border)', borderRadius: '10px',
                    fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: '8px',
                  }}>
                    <User size={16} color="var(--text-muted)" />
                    {currentUser?.full_name || '—'}
                    <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                      (ดึงจากบัญชี)
                    </span>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label>สภาพอุปกรณ์</label>
                    <Select
                      value={returnCondition}
                      options={[
                        { label: 'ใช้งานได้ปกติ', value: 'Good' },
                        { label: 'ชำรุดเล็กน้อย', value: 'Minor Damage' },
                        { label: 'ชำรุด', value: 'Damaged' },
                        { label: 'เสีย/ใช้งานไม่ได้', value: 'Broken' }
                      ]}
                      onChange={(val) => setReturnCondition(String(val))}
                    />
                    <input type="hidden" name="condition" value={returnCondition} />
                  </div>
                </div>

                <div className="form-group">
                  <label>หมายเหตุ</label>
                  <textarea name="note" rows={2} placeholder="ระบุรายละเอียดเพิ่มเติม (ถ้ามี)..."></textarea>
                </div>

                <div className="form-group">
                  <label>รูปภาพหลักฐานการคืน (ถ้ามี)</label>
                  <div className="image-uploader-grid">
                    {imagePreview ? (
                      <div className="image-preview-card" style={{ width: '100%', height: '180px' }}>
                        <img src={imagePreview} alt="Return preview" style={{ objectFit: 'contain' }} />
                        <button type="button" className="remove-btn" onClick={() => { setImagePreview(null); setImageFile(null); }}>
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <label className="image-uploader-box" style={{ height: '120px', background: 'var(--bg-app)' }}>
                        <Upload size={24} style={{ marginBottom: '8px' }} />
                        <span style={{ fontSize: '0.85rem' }}>คลิกเพื่ออัปโหลดรูปภาพ</span>
                        <input 
                          type="file" 
                          name="return_image" 
                          accept="image/*" 
                          style={{ display: 'none' }} 
                          onChange={handleImageChange}
                        />
                      </label>
                    )}
                  </div>
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: '2rem' }}>
                <Button type="button" variant="outline" onClick={closeReturnModal} disabled={returning}>ยกเลิก</Button>
                <Button type="submit" variant="primary" loading={returning} icon={<CheckCircle2 size={18} />}>
                  ยืนยันการคืนอุปกรณ์
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PendingReturns;
