import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { inventoryApi, transactionApi, UPLOAD_URL } from '../api';
import { useNotification } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useApi } from '../hooks/useApi';
import { Button } from '../components/ui/Button';
import { BackButton } from '../components/ui/BackButton';
import { Card } from '../components/ui/Card';
import { Input, TextArea } from '../components/ui/Input';
import { StatusBadge } from '../components/ui/StatusBadge';
import { formatDateTimeThai } from '../utils/formatDate';
import type { InventoryItem, InventoryTransaction } from '../types';
import type { TableColumn, TableAction } from '../types/table.types';
import {
  Boxes,
  Plus,
  Trash2,
  SquarePen,
  Barcode,
  Pencil,
  Image as ImageIcon,
  XCircle,
  Zap,
  Upload,
  Check,
  History,
  Info,
  ArrowUpCircle,
  ArrowDownCircle,
  RefreshCcw,
  Download,
  Tag,
  Clock,
  FileSpreadsheet,
  AlertTriangle
} from 'lucide-react';
import { exportToCsv } from '../utils/csvExporter';
import { parseInventoryFile, type ParsedInventoryRow } from '../utils/excelImporter';
import { getApiErrorMessage } from '../utils/apiError';
import { compressImage } from '../utils/imageCompressor';
import { getStockStatus, STOCK_STATUS_OPTIONS } from '../utils/stockStatus';
import BaseDataTable from '../components/tables/BaseDataTable';
import TableToolbar from '../components/tables/TableToolbar';
import TablePagination from '../components/tables/TablePagination';
import { useTableUrlState } from '../hooks/useTableUrlState';
import { ProvideSnModal } from '../components/ProvideSnModal';

const InventoryList: React.FC = () => {
  const { notify, confirm, refreshUnreadCounts } = useNotification();
  const { hasPermission } = useAuth();
  const canManageInventory = hasPermission('manage.inventory');
  const { urlState, setTableState } = useTableUrlState(20);

  const [showModal, setShowModal] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [formData, setFormData] = useState({
    name: '', model: '', description: '', quantity: 0, min_stock: 10, requires_sn: 1, storage_location: ''
  });

  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const importInputRef = useRef<HTMLInputElement>(null);
  const [importModal, setImportModal] = useState<{ open: boolean; rows: ParsedInventoryRow[]; errors: string[]; importing: boolean }>({
    open: false, rows: [], errors: [], importing: false
  });

  const handleInventoryImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      setSelectedImage(compressed);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(compressed);
    } catch (err) {
      console.error('Image compression failed:', err);
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };
  const [snModal, setSnModal] = useState<{
    isOpen: boolean;
    item: InventoryItem | null;
    existingSns: string[];
    instances: Array<{ id: number; serial_number: string; condition: string }>;
  }>({
    isOpen: false,
    item: null,
    existingSns: [],
    instances: [],
  });

  // For Detail Drawer History
  const [historyData, setHistoryData] = useState<Record<number, InventoryTransaction[]>>({});
  const [loadingHistory, setLoadingHistory] = useState<Record<number, boolean>>({});
  const [selectedHistoryItemId, setSelectedHistoryItemId] = useState<number | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState<Record<number, boolean>>({});

  const HISTORY_PREVIEW_COUNT = 5;

  const { data: items = [], loading, error, request: fetchItems } = useApi(inventoryApi.getAll);
  const { data: stats, request: fetchStats } = useApi(inventoryApi.getStats);

  const fetchData = useCallback(async () => {
    try {
      await Promise.all([fetchItems(), fetchStats()]);
    } catch {
      notify('ไม่สามารถโหลดข้อมูลอุปกรณ์ได้', 'error');
    }
  }, [fetchItems, fetchStats, notify]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredData = useMemo(() => {
    const list = items || [];
    return list.filter(item => {
      if (urlState.search) {
        const s = urlState.search.toLowerCase();
        const matches = item.name.toLowerCase().includes(s) || (item.model && item.model.toLowerCase().includes(s)) || (item.description && item.description.toLowerCase().includes(s)) || (item.storage_location && item.storage_location.toLowerCase().includes(s));
        if (!matches) return false;
      }
      if (urlState.filters.stockStatus && urlState.filters.stockStatus !== 'All') {
        if (getStockStatus(item.quantity, item.min_stock) !== urlState.filters.stockStatus) return false;
      }
      return true;
    }).sort((a, b) => b.id - a.id);
  }, [items, urlState]);

  const indexOfLastItem = urlState.page * urlState.pageSize;
  const indexOfFirstItem = indexOfLastItem - urlState.pageSize;
  const paginatedData = filteredData.slice(indexOfFirstItem, indexOfLastItem);

  const handleOpenModal = (item?: InventoryItem) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        name: item.name,
        model: item.model || '',
        description: item.description || '',
        quantity: item.quantity,
        min_stock: item.min_stock,
        requires_sn: item.requires_sn,
        storage_location: item.storage_location || ''
      });
      setImagePreview(item.image_path ? `${UPLOAD_URL}/uploads/${item.image_path}` : null);
    } else {
      setEditingItem(null);
      setFormData({
        name: '',
        model: '',
        description: '',
        quantity: 0,
        min_stock: 10,
        requires_sn: 1,
        storage_location: ''
      });
      setImagePreview(null);
    }
    setSelectedImage(null);
    setShowModal(true);
  };

  const buildInventoryFormData = () => {
    const payload = new FormData();
    payload.append('name', formData.name.trim());
    payload.append('model', formData.model.trim());
    payload.append('description', formData.description.trim());
    payload.append('quantity', String(Math.max(0, Number(formData.quantity) || 0)));
    payload.append('min_stock', String(Math.max(0, Number(formData.min_stock) || 0)));
    payload.append('requires_sn', String(formData.requires_sn));
    payload.append('storage_location', formData.storage_location.trim());

    if (selectedImage) {
      payload.append('image', selectedImage);
    }

    return payload;
  };

  const handleSaveItem = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      notify('กรุณากรอกชื่ออุปกรณ์', 'error');
      return;
    }

    if ((Number(formData.quantity) || 0) < 0 || (Number(formData.min_stock) || 0) < 0) {
      notify('จำนวนคงเหลือและจุดแจ้งเตือนต้องไม่ติดลบ', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = buildInventoryFormData();

      if (editingItem) {
        await inventoryApi.update(editingItem.id, payload);
      } else {
        await inventoryApi.create(payload);
      }

      notify(editingItem ? 'แก้ไขข้อมูลอุปกรณ์เรียบร้อย' : 'เพิ่มอุปกรณ์ใหม่เรียบร้อย');
      setShowModal(false);
      await fetchData();
      refreshUnreadCounts();
    } catch (error) {
      notify(getApiErrorMessage(error, 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleExportExcel = () => {
    const headers = [
      'ชื่ออุปกรณ์', 'รุ่น/Model', 'คำอธิบาย', 'ที่เก็บอุปกรณ์', 'จำนวนคงเหลือ', 'จุดเตือนสต็อกขั้นต่ำ', 'ต้องมี S/N'
    ];
    const rows = filteredData.map(item => [
      item.name,
      item.model || '-',
      item.description || '-',
      item.storage_location || '-',
      item.quantity,
      item.min_stock,
      item.requires_sn === 1 ? 'ใช่' : 'ไม่'
    ]);
    exportToCsv(`inventory_export_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`, headers, rows);
    notify('ส่งออกข้อมูล CSV เรียบร้อยแล้ว');
  };

  const handleDownloadTemplate = () => {
    const headers = ['ชื่ออุปกรณ์', 'รุ่น/Model', 'คำอธิบาย', 'ที่เก็บอุปกรณ์', 'จำนวนคงเหลือ', 'จุดเตือนสต็อกขั้นต่ำ', 'ต้องมี S/N'];
    const sample = [
      ['Power Supply 24V', 'Omron S8VK-G', 'ใช้กับตู้ควบคุม', 'คลังกลาง / ชั้น A3', 10, 5, 'ใช่'],
      ['สาย LAN CAT6', '', 'สำรองหน้างาน', 'คลังกลาง / ชั้น B1', 50, 20, 'ไม่']
    ];
    exportToCsv('inventory_import_template', headers, sample);
    notify('ดาวน์โหลดเทมเพลตเรียบร้อย');
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    try {
      const { rows, errors } = await parseInventoryFile(file);
      if (rows.length === 0) {
        notify(errors[0] || 'ไม่พบข้อมูลที่นำเข้าได้', 'error');
        return;
      }
      setImportModal({ open: true, rows, errors, importing: false });
    } catch {
      notify('ไม่สามารถอ่านไฟล์ได้ กรุณาตรวจสอบรูปแบบไฟล์ CSV', 'error');
    }
  };

  const handleConfirmImport = async () => {
    setImportModal(prev => ({ ...prev, importing: true }));
    try {
      const res = await inventoryApi.importBulk(importModal.rows);
      notify(res.message);
      setImportModal({ open: false, rows: [], errors: [], importing: false });
      await fetchData();
      refreshUnreadCounts();
    } catch (error) {
      notify(getApiErrorMessage(error, 'นำเข้าไม่สำเร็จ กรุณาตรวจสอบไฟล์แล้วลองใหม่'), 'error');
      setImportModal(prev => ({ ...prev, importing: false }));
    }
  };

  const fetchItemHistory = async (itemId: number) => {
    if (historyData[itemId]) return;
    setLoadingHistory(prev => ({ ...prev, [itemId]: true }));
    try {
      const res = await transactionApi.getAll({ inventory_id: itemId });
      setHistoryData(prev => ({ ...prev, [itemId]: res || [] }));
    } catch {
      notify('ไม่สามารถดึงข้อมูลประวัติได้', 'error');
    } finally {
      setLoadingHistory(prev => ({ ...prev, [itemId]: false }));
    }
  };

  const handleOpenSnModal = async (item: InventoryItem) => {
    if (!item.requires_sn) {
      notify('อุปกรณ์นี้ไม่ได้ตั้งค่าให้ติดตาม Serial Number', 'error');
      return;
    }

    try {
      const instances = await inventoryApi.getInstances(item.id);
      const existingSns = instances.map(instance => instance.serial_number).filter((sn): sn is string => Boolean(sn));
      setSnModal({
        isOpen: true,
        item,
        existingSns,
        instances,
      });
    } catch {
      notify('ไม่สามารถดึงข้อมูล Serial Number ได้', 'error');
    }
  };

  useEffect(() => {
    if (selectedHistoryItemId !== null) {
      const timer = setTimeout(() => {
        fetchItemHistory(selectedHistoryItemId);
      }, 0);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHistoryItemId]);

  const handleDelete = async (id: number) => {
    const isConfirmed = await confirm({
      title: 'ยืนยันการลบอุปกรณ์',
      message: 'คุณต้องการลบอุปกรณ์นี้ออกจากระบบจริงหรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้',
      variant: 'danger'
    });
    if (isConfirmed) {
      try {
        await inventoryApi.delete(id);
        notify('ลบอุปกรณ์เรียบร้อยแล้ว');
        fetchData();
        refreshUnreadCounts();
      } catch {
        notify('ไม่สามารถลบอุปกรณ์ได้ อาจมีการใช้งานอยู่ในประวัติการเบิก', 'error');
      }
    }
  };

  const getStockStatusBadge = (quantity: number, minStock: number) => {
    const status = getStockStatus(quantity, minStock);
    switch (status) {
      case 'หมดสต๊อก':
      case 'วิกฤต':
        return <StatusBadge tone="danger" dot>{status}</StatusBadge>;
      case 'ใกล้หมด':
        return <StatusBadge tone="warning" dot>{status}</StatusBadge>;
      case 'พร้อมใช้งาน':
        return <StatusBadge tone="success" dot>{status}</StatusBadge>;
    }
  };

  const getStockAccent = (quantity: number, minStock: number): string => {
    const status = getStockStatus(quantity, minStock);
    if (status === 'หมดสต๊อก' || status === 'วิกฤต') return 'var(--danger)';
    if (status === 'ใกล้หมด') return 'var(--warning)';
    return 'var(--success)';
  };

  const columns: TableColumn<InventoryItem>[] = [
    {
      id: 'image', header: 'รูป', accessor: 'image_path', priority: 1, width: '64px', align: 'center',
      render: (val, row) => (
        <div style={{ width: '44px', height: '44px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
          {val ? <img src={`${UPLOAD_URL}/uploads/${val}`} alt={row.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <ImageIcon size={20} color="var(--border-hover)" />}
        </div>
      )
    },
    {
      id: 'name', header: 'ชื่ออุปกรณ์', accessor: 'name', priority: 1, width: 'auto',
      render: (val, row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
          <span style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span>
          {row.model && <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>{row.model}</span>}
        </div>
      )
    },
    {
      id: 'location', header: 'ที่เก็บ', accessor: 'storage_location', priority: 2, width: '160px',
      render: (val) => val
        ? <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{val}</span>
        : <span className="cell-empty">—</span>
    },
    {
      id: 'sn_required', header: 'การติดตาม', accessor: 'requires_sn', priority: 2, width: '110px', align: 'center',
      render: (val) => (
        val === 1 ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 800 }}>
            <Tag size={11} /> S/N
          </span>
        ) : (
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>ไม่ติดตาม</span>
        )
      )
    },
    {
      id: 'stock', header: 'คงเหลือ / ขั้นต่ำ', accessor: 'quantity', priority: 1, width: '180px',
      render: (val, row) => {
        const min = row.min_stock || 1;
        const ratio = Math.min(100, (val / Math.max(min * 2, 1)) * 100);
        const accent = getStockAccent(val, min);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ fontSize: '1.15rem', fontWeight: 800, color: accent, lineHeight: 1 }}>{val}</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>ชิ้น</span>
              </div>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>min: {min}</span>
            </div>
            <div className="qty-progress-track">
              <div className="qty-progress-fill" style={{ transform: `scaleX(${ratio / 100})`, background: accent }} />
            </div>
          </div>
        );
      }
    },
    {
      id: 'status', header: 'สถานะ', accessor: 'quantity', priority: 1, width: '130px', align: 'center',
      render: (val, row) => getStockStatusBadge(val, row.min_stock)
    },
    {
      id: 'updated', header: 'อัปเดตล่าสุด', accessor: 'updated_at', priority: 3, width: '130px',
      render: (val) => {
        if (!val) return <span className="cell-empty">—</span>;
        const [date, time] = formatDateTimeThai(val).split(' เวลา ');
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Clock size={11} color="var(--text-muted)" style={{ flexShrink: 0 }} />
            <div className="cell-date-stack">
              <span className="cd-primary">{date}</span>
              {time && <span className="cd-secondary">{time}</span>}
            </div>
          </div>
        );
      }
    }
  ];

  const actions: TableAction<InventoryItem>[] = [
    { id: 'edit', label: 'แก้ไขข้อมูล', icon: <SquarePen size={14} />, onClick: (row) => handleOpenModal(row), inline: true, hidden: () => !canManageInventory },
    { id: 'sn', label: 'จัดการ S/N', icon: <Barcode size={14} />, onClick: (row) => handleOpenSnModal(row), inline: true },
    { id: 'delete', label: 'ลบอุปกรณ์', icon: <Trash2 size={14} />, variant: 'danger', onClick: (row) => handleDelete(row.id), hidden: () => !hasPermission('delete.inventory') }
  ];

  const renderDetailDrawer = useCallback((item: InventoryItem) => {
    const history = historyData[item.id] || [];
    const isHistoryLoading = loadingHistory[item.id];
    const isExpanded = historyExpanded[item.id] || false;
    const visibleHistory = isExpanded ? history : history.slice(0, HISTORY_PREVIEW_COUNT);
    const hasMore = history.length > HISTORY_PREVIEW_COUNT;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          <div style={{ width: '100px', height: '100px', background: 'var(--bg-app)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
            {item.image_path ? <img src={`${UPLOAD_URL}/uploads/${item.image_path}`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <ImageIcon size={32} style={{ margin: '34px', opacity: 0.2 }} />}
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>{item.name}</h3>
            <p style={{ margin: '4px 0', color: 'var(--text-muted)' }}>{item.model || 'ไม่ระบุรุ่น'}</p>
            {getStockStatusBadge(item.quantity, item.min_stock)}
          </div>
        </div>

        <section>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', color: 'var(--primary)' }}><Info size={18} /> ข้อมูลทั่วไป</h4>
          <Card style={{ padding: '1rem', backgroundColor: 'var(--bg-app)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.9rem' }}>
              <div><strong>ที่เก็บ:</strong> {item.storage_location || '-'}</div>
              <div><strong>จำนวนคงเหลือ:</strong> {item.quantity} ชิ้น (แจ้งเตือนที่ {item.min_stock} ชิ้น)</div>
              <div><strong>ประเภทการติดตาม:</strong> {item.requires_sn ? 'ต้องระบุหมายเลขเครื่อง (S/N)' : 'ไม่ระบุหมายเลขเครื่อง (S/N)'}</div>
              <div><strong>คำอธิบาย:</strong> {item.description || '-'}</div>
            </div>
          </Card>
        </section>

        <section>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', color: 'var(--primary)' }}><History size={18} /> ประวัติความเคลื่อนไหวล่าสุด</h4>
          {isHistoryLoading ? (
            <div style={{ padding: '1rem', textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }}></div></div>
          ) : history.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: 'var(--bg-app)', borderRadius: '12px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>ยังไม่มีประวัติการทำรายการ</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {visibleHistory.map((tx) => (
                <div key={tx.id} style={{ padding: '0.75rem', backgroundColor: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 700 }}>
                      {tx.transaction_type === 'ADD_STOCK' ? <ArrowUpCircle size={12} color="var(--success)" /> : tx.transaction_type === 'WITHDRAW' ? <ArrowDownCircle size={12} color="var(--danger)" /> : <RefreshCcw size={12} color="var(--warning)" />}
                      {' '}{tx.transaction_type === 'ADD_STOCK' ? 'นำเข้า' : tx.transaction_type === 'WITHDRAW' ? 'เบิกจ่าย' : 'ยืม/คืน'}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{formatDateTimeThai(tx.created_at)}</span>
                  </div>
                  <div style={{ color: 'var(--text-muted)' }}>จำนวน: {tx.quantity_added || tx.quantity_withdrawn || tx.quantity_borrowed || tx.quantity_returned} ชิ้น</div>
                  <div style={{ color: 'var(--text-muted)' }}>โดย: {tx.user_name || '-'}</div>
                </div>
              ))}
              {hasMore && (
                <button
                  type="button"
                  onClick={() => setHistoryExpanded(prev => ({ ...prev, [item.id]: !isExpanded }))}
                  style={{
                    marginTop: '0.25rem',
                    padding: '0.6rem 1rem',
                    backgroundColor: 'var(--bg-app)',
                    border: '1px dashed var(--border)',
                    borderRadius: '8px',
                    color: 'var(--primary)',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  {isExpanded ? 'ย่อรายการ' : `ดูเพิ่มเติม (อีก ${history.length - HISTORY_PREVIEW_COUNT} รายการ)`}
                </button>
              )}
            </div>
          )}
        </section>

        <div style={{ marginTop: 'auto', paddingTop: '1rem', display: 'flex', gap: '1rem' }}>
          {canManageInventory && <Button variant="primary" style={{ flex: 1 }} onClick={() => handleOpenModal(item)} icon={<Pencil size={18} />}>แก้ไขอุปกรณ์</Button>}
        </div>
      </div>
    );
  }, [historyData, loadingHistory, historyExpanded, canManageInventory]);

  return (
    <div className="inventory-page" style={{ padding: '0 0 4rem 0', backgroundColor: 'var(--bg-app)', minHeight: '100vh' }}>
      <div className="responsive-page-content" style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 2.5rem' }}>
        <BackButton />
        <div className="page-header boot-animate stagger-0" style={{ marginBottom: '2rem' }}>
          <div className="page-title"><h2>จัดการอุปกรณ์และสต็อก</h2><p>เพิ่ม แก้ไข และติดตามจำนวนอุปกรณ์คงเหลือในระบบ</p></div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Button variant="outline" icon={<FileSpreadsheet size={20} />} onClick={handleDownloadTemplate}>เทมเพลต</Button>
            {canManageInventory && <Button variant="outline" icon={<Upload size={20} />} onClick={() => importInputRef.current?.click()}>นำเข้า CSV</Button>}
            <Button variant="outline" icon={<Download size={20} />} onClick={handleExportExcel}>ส่งออก CSV</Button>
            {canManageInventory && <Button variant="primary" icon={<Plus size={20} />} onClick={() => handleOpenModal()}>เพิ่มอุปกรณ์ใหม่</Button>}
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={handleImportFileChange}
            />
          </div>
        </div>

      <div className="stats-grid boot-animate stagger-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
        {stats && [
          { label: 'อุปกรณ์ทั้งหมด', val: stats.total_items, icon: Boxes, status: 'All', color: 'var(--primary)' },
          { label: 'หมดสต๊อก', val: stats.out_of_stock, icon: XCircle, status: 'หมดสต๊อก', color: 'var(--danger)' },
          { label: 'วิกฤต', val: stats.critical, icon: AlertTriangle, status: 'วิกฤต', color: 'var(--danger)' },
          { label: 'ใกล้หมด', val: stats.warning, icon: Zap, status: 'ใกล้หมด', color: 'var(--warning)' },
          { label: 'พร้อมใช้งาน', val: stats.optimal, icon: Check, status: 'พร้อมใช้งาน', color: 'var(--success)' }
        ].map((s, i) => {
          let breatheClass = '';
          if (s.val && s.val > 0) {
            if (s.status === 'หมดสต๊อก' || s.status === 'วิกฤต') breatheClass = 'led-breathe-danger';
            else if (s.status === 'ใกล้หมด') breatheClass = 'led-breathe-warning';
          }
          return (
            <Card key={i} className={breatheClass} onClick={() => setTableState({ filters: { stockStatus: s.status }, page: 1 })} style={{ cursor: 'pointer', borderColor: urlState.filters.stockStatus === s.status ? 'var(--primary)' : undefined }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}><div className="stat-icon-wrapper" style={{ color: s.color }}><s.icon size={22} /></div><div><div className="stat-value">{s.val || 0}</div><div className="stat-label">{s.label}</div></div></div>
            </Card>
          );
        })}
      </div>

      <div className="boot-animate stagger-2">
        <TableToolbar
          searchValue={urlState.search}
          onSearchChange={(val) => setTableState({ search: val, page: 1 })}
          filters={[{ id: 'stockStatus', label: 'สถานะ', type: 'select', options: STOCK_STATUS_OPTIONS.map(v => ({ label: v, value: v })) }]}
          activeFilters={urlState.filters}
          onFilterChange={(f) => setTableState({ filters: f, page: 1 })}
          onReset={() => setTableState({ search: '', filters: {}, page: 1 })}
          searchPlaceholder="ค้นหาชื่อ, รุ่น หรือสถานที่เก็บ..."
        />

        <BaseDataTable
          columns={columns}
          data={paginatedData}
          state={{ loading, error: error?.message || null, empty: !loading && paginatedData.length === 0 }}
          totalCount={items?.length ?? 0}
          emptyState={{
            noData: { message: 'ยังไม่มีอุปกรณ์ในคลัง', hint: 'กด "เพิ่มอุปกรณ์ใหม่" หรือ "นำเข้า CSV" เพื่อเริ่มต้น' },
            noResults: { message: 'ไม่พบอุปกรณ์ที่ตรงกับเงื่อนไข', hint: 'ลองปรับคำค้นหรือตัวกรองใหม่' }
          }}
          actions={actions}
          onRetry={fetchData}
          drawerTitle={(item) => item.name}
          renderDetailDrawer={renderDetailDrawer}
          getRowAccent={(r) => getStockAccent(r.quantity, r.min_stock || 1)}
          mobileConfig={{
            title: (r) => r.name,
            subtitle: (r) => `${r.model || '-'} · ${r.storage_location || 'ไม่ระบุที่เก็บ'}`,
            statusBadge: (r) => getStockStatusBadge(r.quantity, r.min_stock)
          }}
          onRowClick={(item) => setSelectedHistoryItemId(item.id)}
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

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '760px' }}>
            <h3>{editingItem ? 'แก้ไขข้อมูลอุปกรณ์' : 'เพิ่มอุปกรณ์ใหม่'}</h3>
            <form onSubmit={handleSaveItem}>
              <div className="responsive-form-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 200px', gap: '2rem', alignItems: 'start' }}>
                <div>
                  <Input
                    label="ชื่ออุปกรณ์"
                    required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    disabled={saving}
                    maxLength={100}
                    placeholder="เช่น Power Supply 24V"
                  />
                  <Input
                    label="รุ่น / แบรนด์"
                    value={formData.model}
                    onChange={e => setFormData({ ...formData, model: e.target.value })}
                    disabled={saving}
                    maxLength={100}
                    placeholder="เช่น Omron S8VK-G"
                  />
                  <Input
                    label="สถานที่เก็บอุปกรณ์"
                    value={formData.storage_location}
                    onChange={e => setFormData({ ...formData, storage_location: e.target.value })}
                    disabled={saving}
                    maxLength={100}
                    placeholder="เช่น คลังกลาง / ชั้น A3"
                  />
                </div>
                <div>
                  <label className="image-uploader-box" style={{ height: '140px', cursor: 'pointer', position: 'relative' }}>
                    {imagePreview ? (
                      <img src={imagePreview} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', color: 'var(--primary)', textAlign: 'center' }}>
                        <Upload size={24} />
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)' }}>
                          คลิกเพื่อเลือกรูปอุปกรณ์
                        </div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                          รองรับไฟล์ JPG, PNG
                        </div>
                      </div>
                    )}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleInventoryImageChange} />
                  </label>
                </div>
              </div>
              <div className="responsive-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                <Input
                  label="จำนวนคงเหลือ"
                  type="number"
                  min={0}
                  value={formData.quantity}
                  onChange={e => setFormData({ ...formData, quantity: Number(e.target.value) })}
                  disabled={saving}
                />
                <Input
                  label="จุดแจ้งเตือนขั้นต่ำ"
                  type="number"
                  min={0}
                  value={formData.min_stock}
                  onChange={e => setFormData({ ...formData, min_stock: Number(e.target.value) })}
                  disabled={saving}
                />
                <div className="form-group">
                  <label>การติดตามหมายเลขเครื่อง (S/N)</label>
                  <label
                    style={{
                      minHeight: '46px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '0 14px',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-card)',
                      color: 'var(--text-main)',
                      fontWeight: 700,
                      cursor: saving ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={formData.requires_sn === 1}
                      disabled={saving}
                      onChange={e => setFormData({ ...formData, requires_sn: e.target.checked ? 1 : 0 })}
                      style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                    />
                    ต้องระบุ S/N
                  </label>
                </div>
              </div>
              <TextArea
                label="รายละเอียดเพิ่มเติม"
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                disabled={saving}
                maxLength={1000}
                rows={3}
                placeholder="เช่น ใช้กับตู้ควบคุม, สเปกสำคัญ, อุปกรณ์ทดแทนที่ใช้ร่วมกันได้"
              />
              <div className="modal-actions">
                <Button type="button" variant="outline" onClick={() => setShowModal(false)}>ยกเลิก</Button>
                <Button type="submit" variant="primary" loading={saving}>บันทึก</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {importModal.open && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '860px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Upload size={22} color="var(--primary)" /> ตรวจสอบข้อมูลก่อนนำเข้า
            </h3>
            <p style={{ color: 'var(--text-muted)', marginTop: '-0.25rem', fontSize: '0.9rem' }}>
              พบ <strong style={{ color: 'var(--primary)' }}>{importModal.rows.length}</strong> รายการพร้อมนำเข้า
              {' · '}อุปกรณ์ชื่อซ้ำกับในคลังจะถูกอัปเดตข้อมูลและจำนวนให้อัตโนมัติ
            </p>

            {importModal.errors.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', padding: '0.75rem 1rem', background: 'var(--warning-light)', border: '1px solid var(--warning-border)', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.82rem', color: 'var(--warning)' }}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {importModal.errors.slice(0, 5).map((err, i) => <span key={i}>{err}</span>)}
                  {importModal.errors.length > 5 && <span>และอีก {importModal.errors.length - 5} แถวที่ถูกข้าม</span>}
                </div>
              </div>
            )}

            <div style={{ maxHeight: '360px', overflow: 'auto', border: '1px solid var(--border)', borderRadius: '10px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-app)', zIndex: 1 }}>
                  <tr>
                    {['ชื่ออุปกรณ์', 'รุ่น/แบรนด์', 'ที่เก็บ', 'จำนวน', 'ขั้นต่ำ', 'S/N'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 800, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {importModal.rows.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 700 }}>{row.name}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{row.model || '—'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{row.storage_location || '—'}</td>
                      <td style={{ padding: '8px 12px' }}>{row.quantity}</td>
                      <td style={{ padding: '8px 12px' }}>{row.min_stock}</td>
                      <td style={{ padding: '8px 12px' }}>{row.requires_sn ? 'ใช่' : 'ไม่'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="modal-actions">
              <Button type="button" variant="outline" disabled={importModal.importing} onClick={() => setImportModal({ open: false, rows: [], errors: [], importing: false })}>ยกเลิก</Button>
              <Button type="button" variant="primary" loading={importModal.importing} onClick={handleConfirmImport}>ยืนยันนำเข้า {importModal.rows.length} รายการ</Button>
            </div>
          </div>
        </div>
      )}

      <ProvideSnModal
        isOpen={snModal.isOpen}
        onClose={() => setSnModal({ isOpen: false, item: null, existingSns: [], instances: [] })}
        onSuccess={fetchData}
        title={`จัดการ Serial Number: ${snModal.item?.name || ''}`}
        totalQuantity={snModal.item?.quantity || 0}
        existingSns={snModal.existingSns}
        instances={snModal.instances}
        onUpdateCondition={async (instanceId, condition) => {
          await inventoryApi.updateInstanceCondition(instanceId, condition);
          setSnModal(prev => ({
            ...prev,
            instances: prev.instances.map(inst => inst.id === instanceId ? { ...inst, condition } : inst),
          }));
        }}
        onSubmit={async (newSns) => {
          if (!snModal.item) return;
          await inventoryApi.addSerialNumbers(snModal.item.id, newSns);
        }}
      />
    </div>
  );
};

export default InventoryList;
