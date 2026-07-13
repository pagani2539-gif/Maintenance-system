import React, { useEffect, useMemo, useCallback, useState } from 'react';
import { transactionApi, UPLOAD_URL } from '../api';
import { useApi } from '../hooks/useApi';
import { useNotification } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { BackButton } from '../components/ui/BackButton';
import Select from '../components/ui/Select';
import { formatDateTimeThai } from '../utils/formatDate';
import {
  ArrowUpCircle,
  ArrowDownCircle,
  RefreshCcw,
  User,
  MapPin,
  Briefcase,
  Inbox,
  // Modern Icons
  Info,
  Trash2,
  ScanEye,
  Undo2,
  MessageSquare,
  Upload,
  X,
  CheckCircle2,
  Camera,
  Printer,
  Download
} from 'lucide-react';
import type { InventoryTransaction } from '../types';
import type { TableColumn, TableAction } from '../types/table.types';
import StationCell from '../components/shared/StationCell';
import BaseDataTable from '../components/tables/BaseDataTable';
import TableToolbar from '../components/tables/TableToolbar';
import TablePagination from '../components/tables/TablePagination';
import { useTableUrlState } from '../hooks/useTableUrlState';
import { exportToCsv } from '../utils/csvExporter';
import { getApiErrorMessage } from '../utils/apiError';
import PrintReturnTemplate from '../components/PrintReturnTemplate';
import { PrintDialog } from '../components/PrintDialog';
import { compressImage } from '../utils/imageCompressor';

const TransactionList: React.FC = () => {
  const { notify, confirm } = useNotification();
  const { hasPermission, user: currentUser } = useAuth();
  const { urlState, setTableState } = useTableUrlState(20);
  const [returnModal, setReturnModal] = useState<{ isOpen: boolean; transaction: InventoryTransaction | null }>({
    isOpen: false,
    transaction: null
  });
  const [returning, setReturning] = useState(false);
  const [returnCondition, setReturnCondition] = useState<string>('Good');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [printReturnTx, setPrintReturnTx] = useState<InventoryTransaction | null>(null);
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  const [activeLogTab, setActiveLogTab] = useState<'all' | 'inbound' | 'outbound'>('all');

  // สี + label สำหรับ condition badge
  const conditionStyle = (cond?: string): { label: string; bg: string; color: string } | null => {
    if (!cond) return null;
    const c = cond.toLowerCase();
    if (c.includes('good') || c === 'ปกติ') return { label: 'ปกติ', bg: 'var(--success-light)', color: 'var(--success)' };
    if (c.includes('minor')) return { label: 'ชำรุดเล็กน้อย', bg: 'var(--warning-light)', color: 'var(--warning)' };
    if (c.includes('damaged') || c === 'ชำรุด') return { label: 'ชำรุด', bg: 'var(--warning-light)', color: 'var(--warning)' };
    if (c.includes('broken') || c.includes('เสีย')) return { label: 'เสีย', bg: 'var(--danger-light)', color: 'var(--danger)' };
    return { label: cond, bg: 'var(--bg-app)', color: 'var(--text-muted)' };
  };

  const { data: transactions = [], loading, error, request: fetchTransactions } = useApi(transactionApi.getAll);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const handleDelete = async (id: number | string) => {
    const isConfirmed = await confirm({
      title: 'ยืนยันการลบรายการธุรกรรม',
      message: 'คุณต้องการลบรายการธุรกรรมนี้ใช่หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้',
      variant: 'danger'
    });
    if (!isConfirmed) return;
    try {
      await transactionApi.delete(id);
      notify('ลบรายการเรียบร้อยแล้ว');
      fetchTransactions();
    } catch (err) {
      const error = err as Error;
      notify(error.message || 'ไม่สามารถลบรายการได้', 'error');
    }
  };

  const stats = useMemo(() => {
    const list = transactions || [];
    return {
      total: list.length,
      activeLoans: list.filter((t: InventoryTransaction) => (t.transaction_type === 'BORROW' || (t.transaction_type === 'WITHDRAW' && (t.withdrawal_type === 'ทดสอบ' || t.withdrawal_type === 'สำรองใช้งาน'))) && t.status !== 'RETURNED').length,
      totalOutbound: list.reduce((acc: number, t: InventoryTransaction) => acc + (t.quantity_withdrawn || 0) + (t.quantity_borrowed || 0), 0),
      totalInbound: list.reduce((acc: number, t: InventoryTransaction) => acc + (t.quantity_added || 0) + (t.quantity_returned || 0), 0),
      totalInboundCount: list.filter((t: InventoryTransaction) => t.transaction_type === 'ADD_STOCK' || t.transaction_type === 'RETURN').length,
      totalOutboundCount: list.filter((t: InventoryTransaction) => t.transaction_type === 'WITHDRAW' || t.transaction_type === 'BORROW').length
    };
  }, [transactions]);

  const filteredData = useMemo(() => {
    const list = transactions || [];
    return list.filter((t: InventoryTransaction) => {
      if (urlState.search) {
        const s = urlState.search.toLowerCase();
        const matches = t.product_name.toLowerCase().includes(s) || (t.project_name && t.project_name.toLowerCase().includes(s)) || (t.user_name && t.user_name.toLowerCase().includes(s)) || (t.serial_number && t.serial_number.toLowerCase().includes(s));
        if (!matches) return false;
      }
      if (activeLogTab === 'inbound') {
        if (t.transaction_type !== 'ADD_STOCK' && t.transaction_type !== 'RETURN') return false;
      } else if (activeLogTab === 'outbound') {
        if (t.transaction_type !== 'WITHDRAW' && t.transaction_type !== 'BORROW') return false;
      }
      if (urlState.filters.type && urlState.filters.type !== 'All' && t.transaction_type !== urlState.filters.type) return false;
      if (urlState.filters.withdrawal_type && urlState.filters.withdrawal_type !== 'All' && t.withdrawal_type !== urlState.filters.withdrawal_type) return false;
      return true;
    }).sort((a: InventoryTransaction, b: InventoryTransaction) => {
      const t = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return t !== 0 ? t : b.id - a.id;
    });
  }, [transactions, urlState, activeLogTab]);

  // Dynamic withdrawal subtype options (auto-discovered from data)
  const withdrawalSubtypeOptions = useMemo(() => {
    const set = new Set<string>();
    (transactions || []).forEach((t: InventoryTransaction) => {
      if (t.transaction_type === 'WITHDRAW' && t.withdrawal_type) set.add(t.withdrawal_type);
    });
    const defaults = ['ติดตั้งใหม่', 'ซ่อมแซม', 'สำรองใช้งาน', 'ทดสอบ'];
    defaults.forEach(d => set.add(d));
    return Array.from(set).sort().map(v => ({ label: v, value: v }));
  }, [transactions]);

  const typeFilterOptions = useMemo(() => {
    const allOptions = [
      { label: 'นำเข้าสต็อก', value: 'ADD_STOCK' },
      { label: 'เบิกอุปกรณ์', value: 'WITHDRAW' },
      { label: 'คืนอุปกรณ์', value: 'RETURN' },
      { label: 'ยืมอุปกรณ์', value: 'BORROW' }
    ];
    if (activeLogTab === 'inbound') {
      return allOptions.filter(o => o.value === 'ADD_STOCK' || o.value === 'RETURN');
    }
    if (activeLogTab === 'outbound') {
      return allOptions.filter(o => o.value === 'WITHDRAW' || o.value === 'BORROW');
    }
    return allOptions;
  }, [activeLogTab]);

  const indexOfLastItem = urlState.page * urlState.pageSize;
  const indexOfFirstItem = indexOfLastItem - urlState.pageSize;
  const paginatedData = filteredData.slice(indexOfFirstItem, indexOfLastItem);

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'ADD_STOCK': return <ArrowUpCircle size={18} color="var(--success)" />;
      case 'WITHDRAW': return <ArrowDownCircle size={18} color="var(--danger)" />;
      case 'BORROW': return <RefreshCcw size={18} color="var(--warning)" />;
      case 'RETURN': return <ArrowUpCircle size={18} color="var(--primary)" />;
      default: return <Inbox size={18} />;
    }
  };

  const getAccentColor = (type: string): string => {
    switch (type) {
      case 'ADD_STOCK': return 'var(--success)';
      case 'WITHDRAW': return 'var(--danger)';
      case 'BORROW': return 'var(--warning)';
      case 'RETURN': return 'var(--primary)';
      default: return 'var(--text-muted)';
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
            letterSpacing: '0.3px',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>{val}</span>
        ) : (
          <span className="cell-empty">—</span>
        )
      )
    },
    {
      id: 'quantity', header: 'จำนวน', accessor: 'quantity_withdrawn', priority: 1, width: '110px', align: 'center',
      render: (_, row) => {
        const isIn = row.transaction_type === 'ADD_STOCK' || row.transaction_type === 'RETURN';
        const qty = row.quantity_added || row.quantity_withdrawn || row.quantity_borrowed || row.quantity_returned || 0;
        const color = isIn ? 'var(--success)' : 'var(--danger)';
        const Icon = isIn ? ArrowUpCircle : ArrowDownCircle;
        return (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 800, color }}>
            <Icon size={16} />
            <span style={{ fontSize: '1rem' }}>{isIn ? '+' : '−'}{qty}</span>
          </div>
        );
      }
    },
    {
      id: 'type', header: 'ประเภท', accessor: 'transaction_type', priority: 1, width: '140px',
      render: (val, row) => {
        const label = val === 'ADD_STOCK' ? 'นำเข้า' : val === 'WITHDRAW' ? 'เบิก' : val === 'BORROW' ? 'ยืม' : 'คืน';
        const sub = row.withdrawal_type;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span className={`badge badge-${val.toLowerCase()}`} style={{ minWidth: '70px', justifyContent: 'center', fontSize: '0.72rem' }}>{label}</span>
            {sub && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>{sub}</span>}
          </div>
        );
      }
    },
    {
      id: 'location', header: 'สถานที่ / พื้นที่ย่อย', accessor: 'location', priority: 2, width: 'auto',
      render: (_, row) => {
        const hasStation = row.station_name || row.location;
        const project = row.project_name;
        if (!hasStation && !project) return <span className="cell-empty">—</span>;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
            <StationCell
              stationName={row.station_name}
              areaName={row.station_area_name}
              province={row.station_province}
              fallbackLocation={row.location}
              locationSnapshot={row.location_snapshot}
              compact={true}
            />
            {project && (
              <span style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Briefcase size={10} /> {project}
              </span>
            )}
          </div>
        );
      }
    },
    {
      id: 'condition', header: 'สภาพ / หลักฐาน', accessor: 'condition', priority: 3, width: '140px',
      render: (_, row) => {
        const cs = conditionStyle(row.condition);
        const hasImage = !!row.return_image;
        if (!cs && !hasImage) return <span className="cell-empty">—</span>;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {cs && (
              <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 8px', background: cs.bg, color: cs.color, borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800 }}>
                {cs.label}
              </span>
            )}
            {hasImage && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewImage(`${UPLOAD_URL}/uploads/${row.return_image}`);
                }}
                title="ดูรูปหลักฐานการคืน"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  padding: '3px 8px', background: 'var(--primary-light)', color: 'var(--primary)',
                  border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 800
                }}
              >
                <Camera size={11} /> รูป
              </button>
            )}
          </div>
        );
      }
    },
    {
      id: 'user', header: 'ผู้ทำรายการ', accessor: 'user_name', priority: 1, width: '150px',
      render: (val, row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{val || <span className="cell-empty">—</span>}</span>
          {row.status === 'RETURNED' && (
            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--success)', background: 'var(--success-light)', padding: '1px 6px', borderRadius: '4px', width: 'fit-content' }}>คืนครบแล้ว</span>
          )}
        </div>
      )
    },
    {
      id: 'date', header: 'วันที่ / เวลา', accessor: 'created_at', priority: 1, width: '130px',
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

  const handlePrintReturn = (row: InventoryTransaction) => {
    setPrintReturnTx(row);
    setIsPrintDialogOpen(true);
  };

  const actions: TableAction<InventoryTransaction>[] = [
    { id: 'view', label: 'รายละเอียด', icon: <ScanEye size={14} />, onClick: () => {}, inline: true },
    {
      id: 'return',
      label: 'คืนอุปกรณ์',
      icon: <Undo2 size={14} />,
      variant: 'primary',
      onClick: (row) => setReturnModal({ isOpen: true, transaction: row }),
      hidden: (row) => {
        if (!hasPermission('manage.transactions')) return true;
        if (row.status === 'RETURNED') return true;
        if (row.transaction_type === 'BORROW') return false;
        if (row.transaction_type === 'WITHDRAW') {
          return row.withdrawal_type !== 'สำรองใช้งาน' && row.withdrawal_type !== 'ทดสอบ';
        }
        return true;
      },
      inline: true
    },
    {
      id: 'print-return',
      label: 'ปริ้นใบคืน',
      icon: <Printer size={14} />,
      onClick: handlePrintReturn,
      hidden: (row) => row.transaction_type !== 'RETURN'
    },
    { id: 'delete', label: 'ลบรายการ', icon: <Trash2 size={14} />, variant: 'danger', onClick: (row) => handleDelete(row.id), hidden: () => !hasPermission('delete.transactions') }
  ];

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

  const handleExportExcel = () => {
    const headers = [
      'วันเวลาทำรายการ', 'ประเภทธุรกรรม', 'ประเภทการเบิก', 'อุปกรณ์', 'รุ่น/Model', 'S/N', 'จำนวน', 'ผู้ทำรายการ', 'สถานที่/โครงการ', 'สถานะ/หมายเหตุ'
    ];
    const rows = filteredData.map((tx: InventoryTransaction) => {
      let typeText: string = tx.transaction_type;
      if (tx.transaction_type === 'ADD_STOCK') typeText = 'นำเข้าสต็อก';
      else if (tx.transaction_type === 'WITHDRAW') typeText = 'เบิกออก';
      else if (tx.transaction_type === 'BORROW') typeText = 'ยืมใช้งาน';
      else if (tx.transaction_type === 'RETURN') typeText = 'ส่งคืน';

      return [
        tx.created_at ? new Date(tx.created_at).toLocaleString('th-TH') : '-',
        typeText,
        tx.withdrawal_type || '-',
        tx.product_name,
        tx.product_model || '-',
        tx.serial_number || '-',
        tx.quantity_added || tx.quantity_withdrawn || tx.quantity_borrowed || tx.quantity_returned || 0,
        tx.user_name || '-',
        tx.location || tx.project_name || '-',
        tx.status === 'RETURNED' ? 'คืนแล้ว' : (tx.note || '-')
      ];
    });
    exportToCsv(`ledger_export_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`, headers, rows);
    notify('ส่งออกข้อมูล Excel เรียบร้อยแล้ว');
  };

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);

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

  const formatTxType = (type: string) => {
    switch (type) {
      case 'ADD_STOCK': return 'นำเข้าพัสดุ (ADD_STOCK)';
      case 'WITHDRAW': return 'เบิกจ่ายพัสดุ (WITHDRAW)';
      case 'BORROW': return 'ยืมพัสดุ (BORROW)';
      case 'RETURN': return 'คืนพัสดุ (RETURN)';
      default: return type;
    }
  };

  const renderDetailDrawer = useCallback((tx: InventoryTransaction) => (


    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {getTransactionIcon(tx.transaction_type)}
          <span style={{ fontWeight: 800 }}>TX-{tx.id.toString().padStart(6, '0')}</span>
        </div>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{formatDateTimeThai(tx.created_at)}</span>
      </div>

      <section>
        <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', color: 'var(--primary)' }}><Info size={18} /> ข้อมูลธุรกรรม</h4>
        <Card style={{ padding: '1rem', backgroundColor: 'var(--bg-app)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.9rem' }}>
            <div><strong>ประเภทรายการ:</strong> {formatTxType(tx.transaction_type)} {tx.withdrawal_type ? `(${tx.withdrawal_type})` : ''}</div>
            <div><strong>อุปกรณ์:</strong> {tx.product_name}</div>
            <div><strong>รุ่น:</strong> {tx.product_model || '-'}</div>
            <div><strong>S/N (หมายเลขเครื่อง):</strong> <code style={{ background: 'var(--bg-subtle)', color: 'var(--text-main)', padding: '2px 4px', borderRadius: '4px' }}>{tx.serial_number || 'ไม่ระบุ'}</code></div>
            <div><strong>จำนวน:</strong> {tx.quantity_added || tx.quantity_withdrawn || tx.quantity_borrowed || tx.quantity_returned} ชิ้น</div>
            <div><strong>สภาพ:</strong> {conditionStyle(tx.condition)?.label || tx.condition || '-'}</div>
          </div>
        </Card>
      </section>

      <section>
        <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', color: 'var(--primary)' }}><MapPin size={18} /> สถานที่ / โครงการ</h4>
        <Card style={{ padding: '1rem', backgroundColor: 'var(--bg-app)' }}>
           <StationCell stationName={tx.station_name} areaName={tx.station_area_name} province={tx.station_province} fallbackLocation={tx.location} locationSnapshot={tx.location_snapshot} compact={false} />
           <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
             <Briefcase size={14} color="var(--text-muted)" />
             <span style={{ fontSize: '0.9rem' }}>{tx.project_name || 'ไม่ระบุโครงการ'}</span>
           </div>
        </Card>
      </section>

      <section>
        <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', color: 'var(--primary)' }}><User size={18} /> ผู้ทำรายการ</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '1rem', backgroundColor: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <div style={{ background: 'var(--bg-app)', padding: '8px', borderRadius: '50%' }}><User size={20} /></div>
          <span style={{ fontWeight: 700 }}>{tx.user_name || 'ไม่ระบุชื่อ'}</span>
        </div>
      </section>

      {tx.note && (
        <section>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', color: 'var(--primary)' }}><MessageSquare size={18} /> หมายเหตุ</h4>
          <div style={{ padding: '1rem', backgroundColor: 'var(--bg-app)', borderRadius: '8px', fontSize: '0.9rem', fontStyle: 'italic' }}>{tx.note}</div>
        </section>
      )}
    </div>
  ), []);

  return (
    <div className="ledger-page" style={{ padding: '0 0 4rem 0', backgroundColor: 'var(--bg-app)', minHeight: '100vh' }}>
      <div className="responsive-page-content" style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 2.5rem' }}>
        <BackButton />
        <div className="page-header" style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="page-title"><h2>สมุดบัญชีสต็อก (Ledger)</h2><p>ติดตามความเคลื่อนไหวพัสดุและประวัติการเบิก/คืนทั้งหมด</p></div>
          <Button variant="outline" icon={<Download size={20} />} onClick={handleExportExcel}>ส่งออก Excel</Button>
        </div>

      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
        {[
          { id: 'all', label: 'ธุรกรรมทั้งหมด', count: stats.total, icon: RefreshCcw, color: 'var(--primary)' },
          { id: 'inbound', label: 'สต็อกขาเข้า (Inbound)', count: stats.totalInboundCount, icon: ArrowUpCircle, color: 'var(--success)' },
          { id: 'outbound', label: 'สต็อกขาออก (Outbound)', count: stats.totalOutboundCount, icon: ArrowDownCircle, color: 'var(--danger)' }
        ].map(tab => (
          <Card
            key={tab.id}
            onClick={() => {
              setActiveLogTab(tab.id as 'all' | 'inbound' | 'outbound');
              setTableState({ filters: {}, page: 1 });
            }}
            style={{ cursor: 'pointer', borderColor: activeLogTab === tab.id ? 'var(--primary)' : undefined }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div className="stat-icon-wrapper" style={{ color: tab.color }}><tab.icon size={24} /></div>
              <div><div className="stat-value">{tab.count}</div><div className="stat-label">{tab.label}</div></div>
            </div>
          </Card>
        ))}
      </div>

      <TableToolbar
        searchValue={urlState.search}
        onSearchChange={(val) => setTableState({ search: val, page: 1 })}
        filters={[
          {
            id: 'type',
            label: 'ประเภท',
            type: 'select',
            options: typeFilterOptions
          },
          {
            id: 'withdrawal_type',
            label: 'ประเภทการเบิก',
            type: 'select',
            options: withdrawalSubtypeOptions,
            disabled: urlState.filters.type !== 'WITHDRAW',
            disabledHint: 'เลือก "เบิกอุปกรณ์" ก่อน'
          }
        ]}
        activeFilters={urlState.filters}
        onFilterChange={(f) => {
          // Reset withdrawal_type when main type changes away from WITHDRAW
          const nextFilters = { ...f };
          if (nextFilters.type !== 'WITHDRAW') {
            nextFilters.withdrawal_type = 'All';
          }
          setTableState({ filters: nextFilters, page: 1 });
        }}
        onReset={() => setTableState({ search: '', filters: {}, page: 1 })}
        searchPlaceholder="ค้นหาชื่ออุปกรณ์, S/N, หรือผู้ทำรายการ..."
      />

      <BaseDataTable
        columns={columns}
        data={paginatedData}
        state={{ loading, error: error?.message || null, empty: !loading && paginatedData.length === 0 }}
        totalCount={transactions?.length ?? 0}
        emptyState={{
          noData: { message: 'ยังไม่มีความเคลื่อนไหวสต็อกในระบบ', hint: 'รายการจะปรากฏเมื่อมีการเบิก รับเข้า หรือคืนอุปกรณ์' },
          noResults: { message: 'ไม่พบรายการที่ตรงกับเงื่อนไข', hint: 'ลองปรับคำค้นหรือตัวกรองใหม่' }
        }}
        actions={actions}
        onRetry={fetchTransactions}
        drawerTitle={(tx) => `บันทึกเลขที่ TX-${tx.id.toString().padStart(6, '0')}`}
        renderDetailDrawer={renderDetailDrawer}
        getRowAccent={(r) => getAccentColor(r.transaction_type)}
        mobileConfig={{
          title: (r) => r.product_name,
          subtitle: (r) => {
            const label = r.transaction_type === 'ADD_STOCK' ? 'นำเข้าสต็อก' : r.transaction_type === 'WITHDRAW' ? 'เบิกอุปกรณ์' : r.transaction_type === 'BORROW' ? 'ยืมอุปกรณ์' : 'คืนอุปกรณ์';
            return `${label} · ${r.user_name || 'ระบบ'}`;
          },
          statusBadge: (r) => {
            const label = r.transaction_type === 'ADD_STOCK' ? 'นำเข้า' : r.transaction_type === 'WITHDRAW' ? 'เบิก' : r.transaction_type === 'BORROW' ? 'ยืม' : 'คืน';
            return <span className={`badge badge-${r.transaction_type.toLowerCase()}`}>{label}</span>;
          }
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

      {previewImage && (
        <div
          className="modal-overlay"
          style={{ zIndex: 1200, cursor: 'zoom-out', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
          onClick={() => setPreviewImage(null)}
        >
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setPreviewImage(null); }}
              style={{
                position: 'absolute', top: '-44px', right: 0,
                background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none',
                width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
            >
              <X size={20} />
            </button>
            <img
              src={previewImage}
              alt="หลักฐานการคืน"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', cursor: 'default' }}
            />
          </div>
        </div>
      )}

      {returnModal.isOpen && returnModal.transaction && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '550px' }}>
            <div className="modal-header">
              <h3><ArrowUpCircle size={22} color="var(--primary)" /> คืนอุปกรณ์เข้าคลัง</h3>
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

      {/* Offscreen print template */}
      {printReturnTx && (
        <PrintDialog
          open={isPrintDialogOpen}
          onClose={() => {
            setIsPrintDialogOpen(false);
            setPrintReturnTx(null);
          }}
          templateId="pdf-return-template"
          docTitle={`ใบคืนอุปกรณ์ - RT-${String(printReturnTx.id).padStart(6, '0')}`}
          renderTemplate={(company, logo) => (
            <PrintReturnTemplate
              transaction={printReturnTx}
              company={company}
              logo={logo}
            />
          )}
        />
      )}
    </div>
  );
};


export default TransactionList;
