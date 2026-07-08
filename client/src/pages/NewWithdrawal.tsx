import React, { useEffect, useState, useRef, Suspense } from 'react';
import { inventoryApi, withdrawalApi, stationApi, UPLOAD_URL } from '../api';
import { useNotification } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { PrintDialog } from '../components/PrintDialog';
import PrintWithdrawalTemplate from '../components/PrintWithdrawalTemplate';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { BackButton } from '../components/ui/BackButton';
import { Input, TextArea } from '../components/ui/Input';
import StationSelector from '../components/ui/StationSelector';
import ContractSelector from '../components/ui/ContractSelector';
import DatePicker from '../components/ui/DatePicker';
import { getApiErrorMessage } from '../utils/apiError';
import FormSection from '../components/ui/FormSection';
import type { InventoryItem } from '../types';
import {
  Package,
  ChevronDown,
  Download,
  CheckCircle2,
  Trash2,
  Search,
  X,
  Plus,
  Tag,
  MapPin,
  FileText,
  User,
  ScanLine
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

// โหลด scanner (กล้อง + บาร์โค้ด + OCR) เฉพาะตอนเปิดใช้ เพื่อไม่ถ่วง bundle หลัก
const SnScannerModal = React.lazy(() => import('../components/SnScannerModal'));

interface WithdrawalItem {
  inventory_id: number;
  name: string;
  model: string;
  quantity: number;
  max_quantity: number;
  image_path?: string;
  serial_numbers?: string[];
  available_serials?: string[];
  requires_sn?: number;
  track_sn?: boolean; // ผู้ใช้กดปุ่มเปิดติดตาม S/N เอง
}

interface LastWithdrawalData {
  recipient: string;
  project_name?: string;
  location: string;
  station_id: number;
  station_area_id?: number;
  type: string;
  note?: string;
  return_due_date?: string;
  id?: number;
  created_at: string;
  items: {
    inventory_id: number;
    quantity: number;
    serial_numbers: string[];
  }[];
  items_detail: WithdrawalItem[];
}

const NewWithdrawal: React.FC = () => {
  const { notify, playNotificationSound } = useNotification();
  const { user } = useAuth();
  const navigate = useNavigate();
  const locationSearch = useLocation();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<WithdrawalItem[]>([]);
  const recipient = user?.full_name || '';
  const [projectName, setProjectName] = useState('');
  const [location, setLocation] = useState('');
  const [stationId, setStationId] = useState<number | undefined>(undefined);
  const [contractId, setContractId] = useState<number | undefined>(undefined);
  const [subLocation, setSubLocation] = useState('');
  const [type, setType] = useState('ติดตั้งใหม่');
  const [selectedType, setSelectedType] = useState('ติดตั้งใหม่');
  const [customType, setCustomType] = useState('');
  const [note, setNote] = useState('');
  const [borrowDuration, setBorrowDuration] = useState<'7' | '15' | '30' | 'custom'>('7');
  const [customDueDate, setCustomDueDate] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [lastWithdrawalData, setLastWithdrawalData] = useState<LastWithdrawalData | null>(null);
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);

  // อุปกรณ์ที่กำลังเปิดกล้องสแกน S/N อยู่ (เก็บ inventory_id) — null = ปิด
  const [scanItemId, setScanItemId] = useState<number | null>(null);
  // snapshot S/N ที่มีอยู่ตอนเปิดกล้อง — คงที่ระหว่างเซสชันสแกน กันกล้องรีสตาร์ท
  const [scanKnownSns, setScanKnownSns] = useState<string[]>([]);

  // Custom Dropdown states
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const typeDropdownRef = useRef<HTMLDivElement>(null);

  const searchParams = new URLSearchParams(locationSearch.search);
  const stationIdParam = searchParams.get('station_id');

  useEffect(() => {
    if (stationIdParam) {
      const parsedId = parseInt(stationIdParam, 10);
      if (!isNaN(parsedId)) {
        stationApi.getUniqueList({ status: 1 }).then(list => {
          const matched = list.find(st => st.id === parsedId);
          if (matched) {
            setStationId(matched.id);
            setLocation(matched.name);
          }
        }).catch(err => {
          console.error('Failed to prefetch station for prefill in withdrawal:', err);
        });
      }
    }
  }, [stationIdParam]);

  useEffect(() => {
    const fetchInventory = async () => {
      try {
        const data = await inventoryApi.getAll({});
        setInventory(data.filter(item => item.quantity > 0));
      } catch {
        notify('ไม่สามารถโหลดข้อมูลอุปกรณ์ได้', 'error');
      }
    };
    fetchInventory();
  }, [notify]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(event.target as Node)) {
        setIsTypeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addItem = async (inventoryId: number) => {
    const item = inventory.find(i => i.id === inventoryId);
    if (!item) return;

    if (selectedItems.find(si => si.inventory_id === inventoryId)) {
      notify('อุปกรณ์นี้ถูกเลือกไปแล้ว', 'info');
      return;
    }

    let inStockSerials: string[] = [];
    try {
      const instances = await inventoryApi.getInstances(inventoryId);
      inStockSerials = instances.map(inst => inst.serial_number);
    } catch (err) {
      console.error('Failed to fetch available serial numbers', err);
    }

    setSelectedItems([...selectedItems, {
      inventory_id: item.id,
      name: item.name,
      model: item.model || '',
      quantity: 1,
      max_quantity: item.quantity,
      image_path: item.image_path,
      serial_numbers: [''],
      available_serials: inStockSerials,
      requires_sn: item.requires_sn
    }]);
    setIsDropdownOpen(false);
    setSearchTerm('');
  };

  const removeItem = (inventoryId: number) => {
    setSelectedItems(selectedItems.filter(si => si.inventory_id !== inventoryId));
  };

  const updateItemQuantity = (inventoryId: number, qty: number) => {
    setSelectedItems(selectedItems.map(si => {
      if (si.inventory_id === inventoryId) {
        const newQty = Math.max(1, qty);
        const newSn = [...(si.serial_numbers || [])];
        if (newSn.length < newQty) {
          while (newSn.length < newQty) newSn.push('');
        } else if (newSn.length > newQty) {
          newSn.length = newQty;
        }
        return { ...si, quantity: newQty, serial_numbers: newSn };
      }
      return si;
    }));
  };

  const updateItemSerial = (inventoryId: number, index: number, sn: string) => {
    setSelectedItems(selectedItems.map(si => {
      if (si.inventory_id === inventoryId) {
        const newSn = [...(si.serial_numbers || [])];
        newSn[index] = sn;
        return { ...si, serial_numbers: newSn };
      }
      return si;
    }));
  };

  // เปิด/ปิด การติดตามด้วย S/N สำหรับอุปกรณ์ที่ไม่ได้บังคับ
  const toggleTrackSn = (inventoryId: number) => {
    setSelectedItems(selectedItems.map(si => {
      if (si.inventory_id === inventoryId) {
        const enable = !si.track_sn;
        // ถ้าเปิดใช้งาน → เตรียม array S/N ให้พอดีกับ quantity
        // ถ้าปิด → ล้าง S/N ทิ้ง
        const newSn = enable
          ? Array.from({ length: si.quantity }, (_, i) => si.serial_numbers?.[i] || '')
          : [''];
        return { ...si, track_sn: enable, serial_numbers: newSn };
      }
      return si;
    }));
  };

  // รับค่า S/N ที่สแกน/พิมพ์ มาลงช่องว่างของอุปกรณ์ — คืน true ถ้ารับเข้า
  // ใช้ร่วมกันทั้งช่องพิมพ์ (เครื่องยิงบาร์โค้ด/มือ) และกล้องสแกน
  const applyScannedSn = (inventoryId: number, rawVal: string): boolean => {
    const scannedVal = rawVal.trim();
    if (!scannedVal) return false;
    const si = selectedItems.find(s => s.inventory_id === inventoryId);
    if (!si) return false;

    // กันซ้ำภายในอุปกรณ์เดียวกัน
    if ((si.serial_numbers || []).some(sn => sn.trim().toLowerCase() === scannedVal.toLowerCase())) {
      notify(`หมายเลข S/N ${scannedVal} ถูกกรอกไปแล้ว`, 'error');
      return false;
    }

    // หาช่อง S/N ว่างช่องแรก
    const emptyIndex = (si.serial_numbers || []).findIndex(sn => !sn.trim());
    if (emptyIndex !== -1) {
      updateItemSerial(inventoryId, emptyIndex, scannedVal);
      notify(`สแกน S/N: ${scannedVal} สำเร็จ`);
      return true;
    }

    // ไม่มีช่องว่าง → เพิ่มจำนวนถ้ายังไม่เกินคงเหลือ
    if (si.quantity < si.max_quantity) {
      const newQty = si.quantity + 1;
      const newSn = [...(si.serial_numbers || []), scannedVal];
      setSelectedItems(prevItems => prevItems.map(item =>
        item.inventory_id === inventoryId
          ? { ...item, quantity: newQty, serial_numbers: newSn }
          : item
      ));
      notify(`เพิ่มจำนวนและสแกน S/N: ${scannedVal} สำเร็จ`);
      return true;
    }

    notify(`ไม่สามารถสแกนเพิ่มได้เนื่องจากจำนวนพัสดุในคลังมีเพียง ${si.max_quantity} ชิ้น`, 'error');
    return false;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedRecipient = recipient.trim();
    const trimmedProjectName = projectName.trim();
    const trimmedLocation = location.trim();
    const trimmedType = type.trim();
    const trimmedNote = note.trim();

    if (selectedItems.length === 0) {
      notify('กรุณาเลือกอุปกรณ์อย่างน้อย 1 รายการ', 'error', 'ระบบคลังพัสดุ', 'inventory');
      return;
    }

    if (!trimmedRecipient) {
      notify('กรุณากรอกชื่อผู้เบิก / หน่วยงาน', 'error', 'ระบบคลังพัสดุ', 'inventory');
      return;
    }

    if (!trimmedProjectName) {
      notify('กรุณากรอกชื่อโครงการ / งาน', 'error', 'ระบบคลังพัสดุ', 'inventory');
      return;
    }

    if (trimmedRecipient.length > 100) {
      notify('ชื่อผู้เบิกยาวเกินไป (ไม่เกิน 100 ตัวอักษร)', 'error', 'ระบบคลังพัสดุ', 'inventory');
      return;
    }

    if (trimmedProjectName.length > 100) {
      notify('ชื่อโครงการยาวเกินไป (ไม่เกิน 100 ตัวอักษร)', 'error', 'ระบบคลังพัสดุ', 'inventory');
      return;
    }

    if (!stationId) {
      notify('กรุณาเลือกสถานที่/ด่านตรวจควบคุมน้ำหนัก', 'error', 'ระบบคลังพัสดุ', 'inventory');
      return;
    }

    const finalLocation = trimmedLocation + (subLocation.trim() ? ` - ${subLocation.trim()}` : '');
    if (finalLocation.length > 150) {
      notify('สถานที่และจุดติดตั้งย่อยรวมกันยาวเกินไป (ไม่เกิน 150 ตัวอักษร)', 'error', 'ระบบคลังพัสดุ', 'inventory');
      return;
    }

    if (trimmedType.length > 100) {
      notify('ประเภทการเบิกยาวเกินไป (ไม่เกิน 100 ตัวอักษร)', 'error', 'ระบบคลังพัสดุ', 'inventory');
      return;
    }

    if (trimmedNote.length > 1000) {
      notify('หมายเหตุยาวเกินไป (ไม่เกิน 1000 ตัวอักษร)', 'error', 'ระบบคลังพัสดุ', 'inventory');
      return;
    }

    if (selectedItems.some(si => si.quantity <= 0)) {
      notify('กรุณาระบุจำนวนอุปกรณ์ให้มากกว่า 0', 'error', 'ระบบคลังพัสดุ', 'inventory');
      return;
    }

    if (selectedItems.some(si => si.quantity > si.max_quantity)) {
      notify('จำนวนที่เบิกเกินจำนวนอุปกรณ์คงเหลือในคลัง', 'error', 'ระบบคลังพัสดุ', 'inventory');
      return;
    }

    setLoading(true);
    try {
      let calculatedDueDate: string | undefined = undefined;
      if (['สำรองใช้งาน', 'ทดสอบ', 'ยืมใช้งาน'].includes(trimmedType)) {
        if (borrowDuration === 'custom') {
          if (customDueDate) {
            calculatedDueDate = customDueDate;
          }
        } else {
          const d = new Date();
          d.setDate(d.getDate() + parseInt(borrowDuration, 10));
          calculatedDueDate = d.toISOString().split('T')[0];
        }
      }

      const payload = {
        recipient: trimmedRecipient,
        project_name: trimmedProjectName,
        location: finalLocation,
        station_id: stationId,
        station_area_id: undefined,
        contract_id: contractId,
        type: trimmedType,
        note: trimmedNote,
        return_due_date: calculatedDueDate,
        items: selectedItems.map(si => ({ 
          inventory_id: si.inventory_id, 
          quantity: si.quantity,
          serial_numbers: (si.serial_numbers || []).map(sn => sn.trim()).filter(sn => sn !== '')
        }))
      };
      const response = await withdrawalApi.create(payload);
      
      setLastWithdrawalData({
        ...payload,
        id: response.id,
        created_at: new Date().toISOString(),
        items_detail: selectedItems
      });
      setIsSubmitted(true);
      notify('บันทึกการเบิกอุปกรณ์เรียบร้อยแล้ว', 'success', 'ระบบคลังพัสดุ', 'inventory');
      playNotificationSound();
    } catch (error) {
      notify(getApiErrorMessage(error, 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'), 'error', 'ระบบคลังพัสดุ', 'inventory');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = () => {
    setIsPrintDialogOpen(true);
  };

  const handleBeforePrint = async (companyId: number) => {
    if (!lastWithdrawalData?.id) return;
    try {
      await withdrawalApi.updateCompany(lastWithdrawalData.id, companyId);
      setLastWithdrawalData(prev => prev ? { ...prev, company_id: companyId } : null);
    } catch (err) {
      console.error('Failed to update company_id:', err);
    }
  };

  const filteredInventory = inventory.filter(item => 
    (item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
     (item.model && item.model.toLowerCase().includes(searchTerm.toLowerCase()))) &&
    !selectedItems.some(si => si.inventory_id === item.id)
  );

  if (isSubmitted) {
    return (
      <div className="withdrawal-success-page" style={{ padding: '3rem 1rem', display: 'flex', justifyContent: 'center' }}>
        <Card className="glass-card success-card" style={{ maxWidth: '600px', width: '100%', textAlign: 'center', padding: '3rem 2rem' }}>
          <div className="success-icon" style={{ display: 'inline-flex', justifyContent: 'center', alignItems: 'center', width: '80px', height: '80px', borderRadius: '50%', background: 'var(--success-light)', color: 'var(--success)', marginBottom: '1.5rem' }}>
            <CheckCircle2 size={48} />
          </div>
          <h2 className="success-title" style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '1rem' }}>บันทึกการเบิกสำเร็จ!</h2>
          <p className="success-desc" style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: '1.6' }}>
            ระบบได้ทำการตัดสต็อกอัตโนมัติเรียบร้อยแล้ว <br />
            คุณสามารถดาวน์โหลดใบเบิกอุปกรณ์เพื่อเป็นหลักฐานได้ที่ปุ่มด้านล่าง
          </p>

          {lastWithdrawalData && lastWithdrawalData.items_detail && (
            <div style={{ textAlign: 'left', background: 'var(--bg-app)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '2rem' }}>
              <h4 style={{ fontWeight: 700, marginBottom: '1rem', color: 'var(--text-main)', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>รายละเอียดรายการที่เบิก:</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {lastWithdrawalData.items_detail.map((item: WithdrawalItem, idx: number) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ minWidth: '20px' }}>{idx + 1}.</span>
                      {item.image_path ? (
                        <img 
                          src={`${UPLOAD_URL}/uploads/${item.image_path}`} 
                          alt={item.name} 
                          style={{ width: '32px', height: '32px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border)' }} 
                        />
                      ) : (
                        <div style={{ width: '32px', height: '32px', background: 'var(--bg-card)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)' }}>
                          <Package size={16} style={{ opacity: 0.3 }} />
                        </div>
                      )}
                      <span><strong style={{ color: 'var(--text-main)' }}>{item.name}</strong> {item.model ? `(${item.model})` : ''}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, color: 'var(--primary)' }}>x{item.quantity}</div>
                      {item.serial_numbers && item.serial_numbers.some((sn: string) => sn.trim()) && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          S/N: {item.serial_numbers.filter((sn: string) => sn.trim()).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <strong>ผู้เบิก:</strong> {lastWithdrawalData.recipient} | <strong>โครงการ:</strong> {lastWithdrawalData.project_name || '-'} | <strong>สถานที่:</strong> {lastWithdrawalData.location || '-'}
                {lastWithdrawalData.return_due_date && (
                  <> | <strong style={{ color: 'var(--warning)' }}>กำหนดคืน:</strong> {lastWithdrawalData.return_due_date}</>
                )}
              </div>
            </div>
          )}
          
          <div className="success-actions">
            <div className="success-actions-row">
              <Button variant="primary" onClick={handleDownloadPDF} icon={<Download size={20} style={{ marginRight: '8px' }} />}>
                ดาวน์โหลดใบเบิกอุปกรณ์ (PDF)
              </Button>
              <Button variant="outline" onClick={() => navigate('/inventory')}>
                กลับไปยังหน้าคลังพัสดุ
              </Button>
            </div>
            <Button variant="text" onClick={() => {
              setIsSubmitted(false);
              setSelectedItems([]);
              setProjectName('');
              setLocation('');
              setStationId(undefined);
              setContractId(undefined);
              setNote('');
              setType('ติดตั้งใหม่');
              setSelectedType('ติดตั้งใหม่');
              setCustomType('');
              setBorrowDuration('7');
              setCustomDueDate('');
            }}>
              ทำการเบิกรายการใหม่
            </Button>
          </div>
        </Card>

        {/* Hidden template for PDF generation */}
        {lastWithdrawalData && (
          <PrintDialog
            open={isPrintDialogOpen}
            onClose={() => setIsPrintDialogOpen(false)}
            templateId="pdf-withdrawal-template"
            docTitle={`ใบเบิกอุปกรณ์ - WD-${lastWithdrawalData.id || 'XXXXXX'}`}
            onBeforePrint={handleBeforePrint}
            renderTemplate={(company, logo) => (
              <PrintWithdrawalTemplate
                withdrawal={lastWithdrawalData}
                company={company}
                logo={logo}
              />
            )}
          />
        )}
      </div>
    );
  }

  return (
    <div className="new-withdrawal-page">
      <BackButton />
      <div className="page-header" style={{ marginBottom: '2.5rem' }}>
        <div className="page-title">
          <h2>เบิกอุปกรณ์จากคลัง (หลายรายการ)</h2>
          <p>เลือกรายการอุปกรณ์ ระบุประเภทการใช้งาน และกรอกรายละเอียดเพื่อเบิกสินค้า</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="withdrawal-layout">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>
            {/* Item Selection Card */}
            <Card className="glass-card" title="รายการอุปกรณ์ที่ต้องการเบิก" icon={<Package size={20} />} style={{ padding: '2rem', overflow: 'visible' }}>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label>เลือกอุปกรณ์เพิ่ม <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 400 }}>(เลือกได้หลายอย่าง)</span></label>

                {/* Custom Searchable Dropdown */}
                <div ref={dropdownRef} style={{ position: 'relative', marginTop: '8px' }}>
                  <div 
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    style={{ 
                      padding: '12px 16px', 
                      background: 'var(--bg-card)', 
                      border: '1px solid var(--border)', 
                      borderRadius: '12px',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.95rem',
                      color: isDropdownOpen ? 'var(--text-main)' : 'var(--text-muted)'
                    }}
                  >
                    <span>{isDropdownOpen ? 'กำลังค้นหา...' : '-- คลิกเพื่อค้นหาและเลือกอุปกรณ์ --'}</span>
                    <ChevronDown size={18} style={{ transform: isDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                  </div>

                  {isDropdownOpen && (
                    <div style={{ 
                      position: 'absolute', 
                      top: '110%', 
                      left: 0, 
                      right: 0, 
                      background: 'var(--bg-card)', 
                      border: '1px solid var(--border)', 
                      borderRadius: '12px', 
                      boxShadow: '0 10px 25px rgba(0,0,0,0.15)', 
                      zIndex: 100,
                      overflow: 'hidden'
                    }}>
                      <div style={{ padding: '12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-app)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Search size={16} color="var(--text-muted)" />
                        <input 
                          autoFocus
                          placeholder="พิมพ์ชื่ออุปกรณ์ หรือ รุ่น..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', color: 'var(--text-main)', fontSize: '0.95rem' }}
                        />
                        {searchTerm && <X size={16} onClick={() => setSearchTerm('')} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} />}
                      </div>
                      
                      <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        {filteredInventory.length > 0 ? (
                          filteredInventory.map(item => (
                            <div 
                              key={item.id} 
                              onClick={() => addItem(item.id)}
                              style={{ 
                                padding: '10px 16px', 
                                borderBottom: '1px solid var(--border)', 
                                cursor: 'pointer', 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '12px',
                                transition: 'background 0.2s'
                              }}
                              className="dropdown-item-hover"
                            >
                              {item.image_path ? (
                                <img 
                                  src={`${UPLOAD_URL}/uploads/${item.image_path}`} 
                                  alt={item.name} 
                                  style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border)' }} 
                                />
                              ) : (
                                <div style={{ width: '40px', height: '40px', background: 'var(--bg-app)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)' }}>
                                  <Package size={18} style={{ opacity: 0.3 }} />
                                </div>
                              )}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.name}>{item.name}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.model || ''}>{item.model || '-'}</div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>คงเหลือ</div>
                                <div style={{ fontWeight: 700, color: item.quantity < 10 ? 'var(--danger)' : 'var(--primary)' }}>{item.quantity}</div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            ไม่พบอุปกรณ์ที่ค้นหา
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {selectedItems.length > 0 ? (
                <div className="data-table-container" style={{ marginTop: '1.5rem' }}>
                  <table className="data-table" style={{ minWidth: '750px' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '60px' }}>ลำดับ</th>
                        <th>รายการอุปกรณ์</th>
                        <th style={{ textAlign: 'center', width: '100px' }}>จำนวน</th>
                        <th style={{ width: '250px' }}>S/N (ถ้ามี)</th>
                        <th style={{ textAlign: 'center', width: '100px' }}>คงเหลือ</th>
                        <th style={{ textAlign: 'right', width: '60px' }}>ลบ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedItems.map((si, idx) => (
                        <tr key={si.inventory_id}>
                          <td style={{ verticalAlign: 'middle' }}>{idx + 1}</td>
                          <td style={{ verticalAlign: 'middle' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              {si.image_path ? (
                                <img 
                                  src={`${UPLOAD_URL}/uploads/${si.image_path}`} 
                                  alt={si.name} 
                                  style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border)' }} 
                                />
                              ) : (
                                <div style={{ width: '40px', height: '40px', background: 'var(--bg-app)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)' }}>
                                  <Package size={18} style={{ opacity: 0.3 }} />
                                </div>
                              )}
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={si.name}>{si.name}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={si.model}>{si.model}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                              <input 
                                type="number" 
                                value={si.quantity} 
                                min="1" 
                                onChange={(e) => updateItemQuantity(si.inventory_id, parseInt(e.target.value) || 0)}
                                style={{ 
                                  width: '70px', 
                                  textAlign: 'center', 
                                  padding: '6px', 
                                  background: 'var(--bg-card)', 
                                  border: si.quantity > si.max_quantity ? '1px solid var(--danger)' : '1px solid var(--border)', 
                                  borderRadius: '8px', 
                                  color: si.quantity > si.max_quantity ? 'var(--danger)' : 'var(--text-main)',
                                  outline: 'none'
                                }}
                              />
                              {si.quantity > si.max_quantity && (
                                <span style={{ color: 'var(--danger)', fontSize: '0.7rem', fontWeight: 600, display: 'block', whiteSpace: 'nowrap' }}>
                                  เกินคลัง ({si.max_quantity})
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ verticalAlign: 'middle' }}>
                            {(si.requires_sn === 1 || si.track_sn) ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <Tag size={11} /> ติดตามด้วย S/N ({si.quantity} ชิ้น)
                                  </span>
                                  {si.requires_sn !== 1 && (
                                    <button
                                      type="button"
                                      onClick={() => toggleTrackSn(si.inventory_id)}
                                      title="ยกเลิกการติดตามด้วย S/N"
                                      style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '2px 4px', fontSize: '0.7rem', fontWeight: 600 }}
                                    >
                                      <X size={12} /> ยกเลิก
                                    </button>
                                  )}
                                </div>

                                {/* Quick Scan Barcode/QR input + camera scan */}
                                <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                                  <input
                                    type="text"
                                    placeholder="พิมพ์ / ยิงบาร์โค้ด S/N ที่นี่..."
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        applyScannedSn(si.inventory_id, e.currentTarget.value);
                                        e.currentTarget.value = '';
                                      }
                                    }}
                                    style={{
                                      flex: 1,
                                      minWidth: 0,
                                      padding: '6px 10px',
                                      fontSize: '0.8rem',
                                      borderRadius: '8px',
                                      border: '1.5px dashed var(--primary)',
                                      background: 'var(--bg-card)',
                                      color: 'var(--text-main)',
                                      outline: 'none'
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setScanKnownSns((si.serial_numbers || []).filter(Boolean));
                                      setScanItemId(si.inventory_id);
                                    }}
                                    title="สแกน S/N ด้วยกล้อง (บาร์โค้ด/QR/OCR)"
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                                      padding: '6px 10px', fontSize: '0.75rem', fontWeight: 700,
                                      borderRadius: '8px', border: 'none', cursor: 'pointer',
                                      background: 'var(--primary)', color: '#fff', whiteSpace: 'nowrap'
                                    }}
                                  >
                                    <ScanLine size={14} /> กล้อง
                                  </button>
                                </div>

                                {Array.from({ length: si.quantity }).map((_, i) => {
                                  const listId = `serials-${si.inventory_id}-${i}`;
                                  const otherSelected = (si.serial_numbers || []).filter((_, idx) => idx !== i && _ !== '');
                                  const available = (si.available_serials || []).filter(sn => !otherSelected.includes(sn));

                                  return (
                                    <React.Fragment key={i}>
                                      <input
                                        type="text"
                                        list={listId}
                                        value={si.serial_numbers?.[i] || ''}
                                        placeholder={`ระบุหรือเลือก S/N ${si.quantity > 1 ? `ชิ้นที่ ${i+1}` : ''}...`}
                                        onChange={(e) => updateItemSerial(si.inventory_id, i, e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            e.preventDefault();
                                          }
                                        }}
                                        style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-main)', fontSize: '0.85rem' }}
                                      />
                                      {available.length > 0 && (
                                        <datalist id={listId}>
                                          {available.map(sn => (
                                            <option key={sn} value={sn} />
                                          ))}
                                        </datalist>
                                      )}
                                    </React.Fragment>
                                  );
                                })}
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => toggleTrackSn(si.inventory_id)}
                                style={{
                                  width: '100%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '6px',
                                  padding: '10px',
                                  background: 'var(--bg-app)',
                                  border: '1.5px dashed var(--primary)',
                                  borderRadius: '8px',
                                  color: 'var(--primary)',
                                  fontSize: '0.82rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  transition: 'all 0.2s'
                                }}
                                title={`เปิดใช้งานการติดตามด้วย S/N สำหรับอุปกรณ์นี้ (${si.quantity} ชิ้น)`}
                                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(59, 130, 246, 0.08)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-app)'; }}
                              >
                                <Plus size={14} /> เพิ่ม S/N เพื่อติดตาม
                              </button>
                            )}
                          </td>
                          <td style={{ textAlign: 'center', verticalAlign: 'middle', color: si.max_quantity < 5 ? 'var(--danger)' : 'inherit' }}>
                            {si.max_quantity}
                          </td>
                          <td style={{ textAlign: 'right', verticalAlign: 'middle' }}>
                            <button 
                              type="button" 
                              className="btn btn-text-danger"
                              style={{ padding: '6px' }}
                              onClick={() => removeItem(si.inventory_id)}
                              title="ลบรายการ"
                            >
                              <Trash2 size={18} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '3rem', border: '1.5px dashed var(--border)', borderRadius: '12px', background: 'var(--bg-app)' }}>
                  <Package size={40} style={{ opacity: 0.2, marginBottom: '1rem', color: 'var(--text-muted)' }} />
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>ยังไม่ได้เลือกอุปกรณ์ กรุณาเลือกจากดรอปดาวน์ด้านบน</p>
                </div>
              )}
            </Card>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>
            <Card className="glass-card" title="ข้อมูลการเบิก" style={{ padding: '2rem', overflow: 'visible' }}>
              <FormSection title="ผู้เบิก & โครงการ" icon={<User size={18} />} columns={1}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px', display: 'block' }}>ผู้เบิก</label>
                  <div style={{
                    padding: '10px 14px', background: 'var(--bg-app)',
                    border: '1px solid var(--border)', borderRadius: '10px',
                    fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: 600,
                  }}>
                    👤 {user?.full_name || '—'}
                    <span style={{ marginLeft: '8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                      (จากบัญชีที่เข้าสู่ระบบ)
                    </span>
                  </div>
                </div>

                <Input
                  label="โครงการ / งาน"
                  type="text"
                  required
                  maxLength={100}
                  placeholder="ระบุชื่อโครงการ..."
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  disabled={loading}
                />
              </FormSection>

              <FormSection title="สถานที่ & สัญญา" icon={<MapPin size={18} />} columns={1}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>
                    สถานที่ตั้งด่าน / จุดควบคุมน้ำหนักทางหลวง <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <StationSelector
                    selectedStationId={stationId}
                    showArea={false}
                    required={true}
                    onChange={(data) => {
                      setStationId(data.stationId);
                      setLocation(data.stationName);
                    }}
                  />
                </div>

                <Input
                  label="จุดติดตั้ง / บริเวณพื้นที่ย่อย"
                  maxLength={100}
                  placeholder="ระบุตำแหน่งติดตั้งย่อย เช่น ข้างเลนชั่ง, กล่องควบคุมฝั่งขาออก..."
                  value={subLocation}
                  onChange={(e) => setSubLocation(e.target.value)}
                  disabled={loading}
                />

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>
                    สัญญา / ปีสัญญา
                    <span style={{ marginLeft: '8px', fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>
                      (ใช้ติดตามว่าอุปกรณ์หน้างานเป็นของสัญญาปีไหน)
                    </span>
                  </label>
                  <ContractSelector
                    selectedContractId={contractId}
                    onChange={(id) => setContractId(id)}
                  />
                </div>
              </FormSection>

              <FormSection title="ประเภทการเบิก" icon={<Tag size={18} />} columns={1}>
                <div className="form-group" style={{ marginBottom: 0 }}>

                <div ref={typeDropdownRef} style={{ position: 'relative' }}>
                  <div 
                    onClick={() => !loading && setIsTypeDropdownOpen(!isTypeDropdownOpen)}
                    style={{ 
                      padding: '12px 16px', 
                      background: 'var(--bg-card)', 
                      border: '1px solid var(--border)', 
                      borderRadius: '12px',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.85rem',
                      color: 'var(--text-main)',
                      opacity: loading ? 0.6 : 1
                    }}
                  >
                    <span>{selectedType}</span>
                    <ChevronDown size={16} style={{ transform: isTypeDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                  </div>

                  {isTypeDropdownOpen && (
                    <div style={{ 
                      position: 'absolute', 
                      top: '110%', 
                      left: 0, 
                      right: 0, 
                      background: 'var(--bg-card)', 
                      border: '1px solid var(--border)', 
                      borderRadius: '12px', 
                      boxShadow: '0 10px 25px rgba(0,0,0,0.15)', 
                      zIndex: 100,
                      overflow: 'hidden'
                    }}>
                      {['ติดตั้งใหม่', 'ซ่อมแซม', 'สำรองใช้งาน', 'ทดสอบ', 'ยืมใช้งาน', 'อื่นๆ...'].map((opt) => (
                        <div 
                          key={opt}
                          onClick={() => {
                            setSelectedType(opt);
                            if (opt !== 'อื่นๆ...') {
                              setType(opt);
                            } else {
                              setType(customType);
                            }
                            setIsTypeDropdownOpen(false);
                          }}
                          style={{ 
                            padding: '10px 16px', 
                            cursor: 'pointer', 
                            fontSize: '0.85rem',
                            color: 'var(--text-main)',
                            borderBottom: opt === 'อื่นๆ...' ? 'none' : '1px solid var(--border)',
                            transition: 'background 0.2s'
                          }}
                          className="dropdown-item-hover"
                        >
                          {opt}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {selectedType === 'อื่นๆ...' && (
                <Input 
                  type="text" 
                  required 
                  maxLength={100}
                  placeholder="ระบุประเภทการเบิกอื่นๆ..."
                  value={customType}
                  onChange={e => {
                    setCustomType(e.target.value);
                    setType(e.target.value);
                  }}
                  disabled={loading}
                />
              )}

              {/* Due Date selection for returnable withdrawal types */}
              {['สำรองใช้งาน', 'ทดสอบ', 'ยืมใช้งาน'].includes(type) && (
                <div className="form-group" style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(217, 119, 6, 0.05)', borderRadius: '12px', border: '1px solid rgba(217, 119, 6, 0.15)' }}>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '0.85rem', marginBottom: '8px', color: 'var(--primary)' }}>
                    กำหนดวันส่งคืนอุปกรณ์
                  </label>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                    {[
                      { label: '7 วัน', value: '7' },
                      { label: '15 วัน', value: '15' },
                      { label: '30 วัน', value: '30' },
                      { label: 'กำหนดเอง', value: 'custom' }
                    ].map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setBorrowDuration(preset.value as '7' | '15' | '30' | 'custom')}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: '1px solid',
                          borderColor: borrowDuration === preset.value ? 'var(--primary)' : 'var(--border)',
                          background: borrowDuration === preset.value ? 'var(--primary)' : 'var(--bg-card)',
                          color: borrowDuration === preset.value ? '#fff' : 'var(--text-main)',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  {borrowDuration === 'custom' && (
                    <div style={{ marginTop: '8px' }}>
                      <DatePicker
                        value={customDueDate}
                        onChange={(val) => setCustomDueDate(val)}
                        placeholder="เลือกวันกำหนดส่งคืน"
                        style={{ width: '100%' }}
                      />
                    </div>
                  )}
                </div>
              )}
              </FormSection>

              <FormSection title="หมายเหตุ" icon={<FileText size={18} />} columns={1}>
                <TextArea
                  label="หมายเหตุเพิ่มเติม"
                  rows={4}
                  maxLength={1000}
                  placeholder="ระบุหมายเหตุ..."
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  disabled={loading}
                />
              </FormSection>

              <Button 
                type="submit" 
                variant="primary" 
                loading={loading} 
                disabled={loading} 
                style={{ width: '100%', marginTop: '1rem' }}
              >
                บันทึกการเบิก
              </Button>
            </Card>
          </div>
        </div>
      </form>

      {/* Camera S/N scanner (lazy) — เปิดต่ออุปกรณ์ */}
      {scanItemId !== null && (
        <Suspense fallback={null}>
          <SnScannerModal
            isOpen={scanItemId !== null}
            onClose={() => setScanItemId(null)}
            onDetected={(value) => applyScannedSn(scanItemId, value)}
            knownSns={scanKnownSns}
          />
        </Suspense>
      )}

      {/* Global CSS for dropdown hover */}
      <style>{`
        .dropdown-item-hover:hover {
          background: rgba(59, 130, 246, 0.08) !important;
        }
      `}</style>
    </div>
  );
};

export default NewWithdrawal;
