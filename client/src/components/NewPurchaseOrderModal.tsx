/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { inventoryApi, purchaseOrderApi } from '../api';
import { useNotification } from './Layout';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/Button';
import { Input, TextArea } from './ui/Input';
import FormSection from './ui/FormSection';
import AppDialog from './ui/AppDialog';
import type { InventoryItem, PurchaseOrder } from '../types';
import {
  ShoppingBag,
  X,
  Search,
  Plus,
  Trash2,
  Package,
  ChevronDown,
  Sparkles,
  CheckCircle2,
  UserCheck,
  User,
  FileText
} from 'lucide-react';

interface POItemRow {
  inventory_id: number;
  name: string;
  model: string;
  quantity: number;
  is_new?: boolean; // true ถ้าเพิ่งสร้างจาก modal นี้
}

interface NewPurchaseOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editingPo?: PurchaseOrder | null;
}

const NewPurchaseOrderModal: React.FC<NewPurchaseOrderModalProps> = ({ isOpen, onClose, onSuccess, editingPo }) => {
  const { notify } = useNotification();
  const { user } = useAuth();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);

  const [projectName, setProjectName] = useState('');
  const [buyerDepartment, setBuyerDepartment] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [note, setNote] = useState('');

  // Items list
  const [items, setItems] = useState<POItemRow[]>([]);

  // Inventory picker dropdown
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);

  // New-inventory inline form
  const [showNewItemForm, setShowNewItemForm] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemModel, setNewItemModel] = useState('');
  const [newItemQty, setNewItemQty] = useState(1);
  const [creatingNewItem, setCreatingNewItem] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      setLoadingInventory(true);
      try {
        const list = await inventoryApi.getAll({});
        setInventory(list);

        if (editingPo) {
          const fullPo = await purchaseOrderApi.getById(editingPo.id);
          setProjectName(fullPo.project_name || '');
          setBuyerDepartment(fullPo.buyer_department || '');
          setBuyerPhone(fullPo.buyer_phone || '');
          setBuyerEmail(fullPo.buyer_email || '');
          setNote(fullPo.note || '');
          
          const mappedItems: POItemRow[] = (fullPo.items || []).map(item => ({
            inventory_id: item.inventory_id,
            name: item.item_name || '',
            model: item.item_model || '',
            quantity: item.quantity
          }));
          setItems(mappedItems);
        }
      } catch {
        notify('ไม่สามารถโหลดข้อมูลพัสดุได้', 'error');
      } finally {
        setLoadingInventory(false);
      }
    };
    load();
  }, [isOpen, notify, editingPo]);

  // Reset state เมื่อปิด modal
  const handleClose = () => {
    setProjectName('');
    setBuyerDepartment('');
    setBuyerPhone('');
    setBuyerEmail('');
    setNote('');
    setItems([]);
    setSearchTerm('');
    setIsPickerOpen(false);
    setShowNewItemForm(false);
    setNewItemName('');
    setNewItemModel('');
    setNewItemQty(1);
    onClose();
  };

  // Click outside picker → close
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setIsPickerOpen(false);
      }
    };
    if (isPickerOpen) {
      document.addEventListener('mousedown', handle);
      return () => document.removeEventListener('mousedown', handle);
    }
  }, [isPickerOpen]);

  const filteredInventory = useMemo(() => {
    const s = searchTerm.toLowerCase();
    return inventory
      .filter(it => !items.some(p => p.inventory_id === it.id))
      .filter(it => !s || it.name.toLowerCase().includes(s) || (it.model || '').toLowerCase().includes(s));
  }, [inventory, items, searchTerm]);

  const addExistingItem = (it: InventoryItem) => {
    setItems(prev => [...prev, {
      inventory_id: it.id,
      name: it.name,
      model: it.model || '',
      quantity: 1
    }]);
    setIsPickerOpen(false);
    setSearchTerm('');
  };

  const removeItem = (inventoryId: number) => {
    setItems(prev => prev.filter(p => p.inventory_id !== inventoryId));
  };

  const updateQuantity = (inventoryId: number, qty: number) => {
    setItems(prev => prev.map(p =>
      p.inventory_id === inventoryId ? { ...p, quantity: Math.max(1, qty) } : p
    ));
  };

  const handleCreateNewInventory = async () => {
    const name = newItemName.trim();
    if (!name) {
      notify('กรุณากรอกชื่อพัสดุใหม่', 'error');
      return;
    }
    if (newItemQty <= 0) {
      notify('จำนวนต้องมากกว่า 0', 'error');
      return;
    }

    setCreatingNewItem(true);
    try {
      // สร้างพัสดุใหม่ในคลัง — quantity=0 เพราะยังไม่รับเข้าจริง
      // (จะถูกบวกเข้าตอนกด "ตรวจรับพัสดุ" หลังจากนั้น)
      const formData = new FormData();
      formData.append('name', name);
      formData.append('model', newItemModel.trim());
      formData.append('quantity', '0');
      formData.append('min_stock', '1');
      formData.append('requires_sn', '0');

      const created = await inventoryApi.create(formData);

      // เพิ่มเข้า items list พร้อม flag is_new
      setItems(prev => [...prev, {
        inventory_id: created.id,
        name: created.name,
        model: created.model || '',
        quantity: newItemQty,
        is_new: true
      }]);

      // เพิ่มเข้า inventory state ด้วย (เผื่อ user เพิ่มซ้ำในรอบเดียวกัน)
      setInventory(prev => [...prev, created]);

      notify('สร้างพัสดุใหม่และเพิ่มเข้าใบสั่งซื้อเรียบร้อย');
      setShowNewItemForm(false);
      setNewItemName('');
      setNewItemModel('');
      setNewItemQty(1);
    } catch (err: any) {
      notify(err?.response?.data?.message || err?.message || 'ไม่สามารถสร้างพัสดุใหม่ได้', 'error');
    } finally {
      setCreatingNewItem(false);
    }
  };

  const handleSave = async (submitStatus: 'Draft' | 'Pending') => {
    if (items.length === 0) {
      notify('กรุณาเลือกหรือเพิ่มพัสดุอย่างน้อย 1 รายการ', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const poData = {
        company_name: undefined,
        vendor_address: undefined,
        vendor_phone: undefined,
        vendor_contact_person: undefined,
        vendor_tax_id: undefined,
        buyer_department: buyerDepartment.trim() || undefined,
        buyer_phone: buyerPhone.trim() || undefined,
        buyer_email: buyerEmail.trim() || undefined,
        ordered_by: user?.full_name || 'System',
        project_name: projectName.trim() || undefined,
        note: note.trim() || undefined,
        status: submitStatus,
        created_by: user?.full_name || 'System',
        items: items.map(it => ({
          inventory_id: it.inventory_id,
          quantity: it.quantity
        }))
      };

      if (editingPo) {
        await purchaseOrderApi.update(editingPo.id, poData);
        notify(`อัปเดตใบสั่งซื้อ ${editingPo.po_no} เรียบร้อยแล้ว`);
      } else {
        const res = await purchaseOrderApi.create(poData);
        notify(`สร้างใบสั่งซื้อ ${res.po_no} เรียบร้อยแล้ว`);
      }
      onSuccess();
      handleClose();
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } }; message?: string };
      notify(error?.response?.data?.message || error?.message || 'เกิดข้อผิดพลาดในการบันทึกใบสั่งซื้อ', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AppDialog
      isOpen={isOpen}
      onClose={handleClose}
      title={editingPo ? `แก้ไขใบสั่งซื้อ ${editingPo.po_no}` : 'สร้างใบสั่งซื้อใหม่'}
      busy={submitting || creatingNewItem}
      closeOnBackdrop={false}
      className="modal-content"
      panelStyle={{ maxWidth: '800px', width: '100%', maxHeight: '92vh', overflow: 'auto' }}
    >
        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShoppingBag size={22} color="var(--primary)" /> {editingPo ? `แก้ไขใบสั่งซื้อ ${editingPo.po_no}` : 'สร้างใบสั่งซื้อใหม่ (PO)'}
          </h3>
          <button type="button" className="close-btn" onClick={handleClose} disabled={submitting || creatingNewItem} aria-label="ปิด"><X size={20} /></button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); }}>
          <FormSection title="ข้อมูลผู้สั่งซื้อ" icon={<User size={18} />} columns={1}>
          {/* PO Header — ผู้สั่งซื้อ & โครงการ */}
          <div className="responsive-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Input
              label="ผู้สั่งซื้อ"
              type="text"
              required
              value={user?.full_name || ''}
              disabled={true}
              style={{ backgroundColor: 'var(--bg-app)', cursor: 'not-allowed' }}
            />
            <Input
              label="โครงการ"
              type="text"
              maxLength={150}
              placeholder="ระบุโครงการที่เกี่ยวข้อง (ถ้ามี)"
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              disabled={submitting}
            />
          </div>

          {/* ═══ Buyer Details Section (กระชับ) ═══ */}
          <div style={{
            padding: '12px 14px',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            background: 'rgba(16, 185, 129, 0.04)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <UserCheck size={16} color="var(--success)" />
              <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-main)' }}>ข้อมูลผู้จัดซื้อ</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>(สำหรับติดต่อกลับจากผู้ขาย — ไม่บังคับ)</span>
            </div>
            <div className="responsive-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '10px' }}>
              <Input
                label="แผนก / ฝ่าย"
                type="text"
                maxLength={100}
                placeholder="เช่น ฝ่าย IT"
                value={buyerDepartment}
                onChange={e => setBuyerDepartment(e.target.value)}
                disabled={submitting}
              />
              <Input
                label="เบอร์ติดต่อ"
                type="text"
                maxLength={50}
                placeholder="08X-XXX-XXXX"
                value={buyerPhone}
                onChange={e => setBuyerPhone(e.target.value)}
                disabled={submitting}
              />
              <Input
                label="อีเมล"
                type="email"
                maxLength={150}
                placeholder="name@company.com"
                value={buyerEmail}
                onChange={e => setBuyerEmail(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>
          </FormSection>

          {/* Items section */}
          <FormSection
            title="รายการพัสดุที่ต้องการสั่งซื้อ"
            subtitle={`เลือกจากคลังหรือเพิ่มพัสดุใหม่ · ${items.length} รายการ`}
            icon={<Package size={18} />}
            columns={1}
          >
          <div>
            {/* Inventory picker dropdown */}
            <div ref={pickerRef} style={{ position: 'relative', marginBottom: '8px' }}>
              <div
                onClick={() => !submitting && setIsPickerOpen(!isPickerOpen)}
                style={{
                  padding: '11px 14px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.88rem',
                  color: isPickerOpen ? 'var(--text-main)' : 'var(--text-muted)',
                  opacity: submitting ? 0.6 : 1
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Search size={14} /> {isPickerOpen ? 'กำลังค้นหา...' : '-- เลือกพัสดุจากคลัง --'}
                </span>
                <ChevronDown size={16} style={{ transform: isPickerOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </div>

              {isPickerOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.15)', zIndex: 50, overflow: 'hidden'
                }}>
                  <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-app)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Search size={14} color="var(--text-muted)" />
                    <input
                      autoFocus
                      placeholder="พิมพ์ชื่อพัสดุหรือรุ่น..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', color: 'var(--text-main)', fontSize: '0.85rem' }}
                    />
                  </div>
                  <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                    {loadingInventory ? (
                      <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>กำลังโหลด...</div>
                    ) : filteredInventory.length > 0 ? (
                      filteredInventory.map(it => (
                        <div
                          key={it.id}
                          onClick={() => addExistingItem(it)}
                          style={{ padding: '9px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                          className="dropdown-item-hover"
                        >
                          <Package size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{it.model || '-'} · คงเหลือ {it.quantity}</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        {searchTerm ? 'ไม่พบพัสดุที่ค้นหา' : 'ไม่มีพัสดุให้เลือก'}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* "+ เพิ่มพัสดุใหม่" toggle */}
            {!showNewItemForm ? (
              <button
                type="button"
                onClick={() => setShowNewItemForm(true)}
                disabled={submitting}
                style={{
                  width: '100%', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  background: 'var(--primary-light)', border: '1.5px dashed color-mix(in srgb, var(--primary) 40%, transparent)', borderRadius: '10px',
                  color: 'var(--primary)', fontSize: '0.85rem', fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer'
                }}
              >
                <Sparkles size={15} /> เพิ่มพัสดุใหม่ที่ยังไม่มีในคลัง
              </button>
            ) : (
              <div style={{ padding: '14px', background: 'var(--primary-light)', border: '1.5px solid color-mix(in srgb, var(--primary) 30%, transparent)', borderRadius: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sparkles size={14} /> เพิ่มพัสดุใหม่
                  </span>
                  <button
                    type="button"
                    onClick={() => { setShowNewItemForm(false); setNewItemName(''); setNewItemModel(''); setNewItemQty(1); }}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="responsive-po-item-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px auto', gap: '8px', alignItems: 'end' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px' }}>ชื่อพัสดุ *</label>
                    <input
                      type="text"
                      maxLength={100}
                      placeholder="เช่น Switch 24-Port"
                      value={newItemName}
                      onChange={e => setNewItemName(e.target.value)}
                      style={{ width: '100%', padding: '7px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '0.85rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px' }}>รุ่น</label>
                    <input
                      type="text"
                      maxLength={100}
                      placeholder="(ถ้ามี)"
                      value={newItemModel}
                      onChange={e => setNewItemModel(e.target.value)}
                      style={{ width: '100%', padding: '7px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '0.85rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px' }}>จำนวน</label>
                    <input
                      type="number"
                      min={1}
                      value={newItemQty}
                      onChange={e => setNewItemQty(parseInt(e.target.value) || 0)}
                      style={{ width: '100%', padding: '7px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '0.85rem', textAlign: 'center' }}
                    />
                  </div>
                  <button
                    type="button"
                    className="pastel-primary-action"
                    onClick={handleCreateNewInventory}
                    disabled={creatingNewItem || !newItemName.trim()}
                    style={{
                      padding: '7px 12px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px',
                      fontSize: '0.78rem', fontWeight: 700, cursor: (creatingNewItem || !newItemName.trim()) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                      opacity: (creatingNewItem || !newItemName.trim()) ? 0.5 : 1
                    }}
                  >
                    <Plus size={13} /> {creatingNewItem ? '...' : 'เพิ่ม'}
                  </button>
                </div>
                <p style={{ marginTop: '6px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  💡 ระบบจะสร้างพัสดุใหม่ในคลัง (quantity = 0) แล้วเพิ่มเข้า PO นี้อัตโนมัติ จำนวนจริงจะถูกบวกเข้าตอนตรวจรับของ
                </p>
              </div>
            )}

            {/* Items table */}
            {items.length > 0 ? (
              <div className="responsive-table-scroll" style={{ marginTop: '14px', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-app)' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)' }}>ลำดับ</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)' }}>รายการพัสดุ</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', width: '110px' }}>จำนวน</th>
                      <th style={{ padding: '8px 10px', width: '40px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => (
                      <tr key={it.inventory_id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 10px', verticalAlign: 'middle' }}>{idx + 1}</td>
                        <td style={{ padding: '8px 10px', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Package size={14} color="var(--text-muted)" />
                            <div>
                              <div style={{ fontWeight: 700 }}>{it.name}</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                                <span>รุ่น: {it.model || '-'}</span>
                                {it.is_new ? (
                                  <span style={{ padding: '1px 6px', background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800 }}>
                                    ✨ ใหม่
                                  </span>
                                ) : (
                                  (() => {
                                    const invItem = inventory.find(inv => inv.id === it.inventory_id);
                                    if (!invItem) return null;
                                    const isLow = invItem.quantity < invItem.min_stock;
                                    const isOut = invItem.quantity === 0;
                                    
                                    return (
                                      <span style={{ 
                                        color: isOut ? 'var(--danger)' : isLow ? 'var(--warning)' : 'var(--success)',
                                        fontWeight: 600,
                                        fontSize: '0.7rem'
                                      }}>
                                        (คงคลัง: {invItem.quantity} / ขั้นต่ำ: {invItem.min_stock})
                                      </span>
                                    );
                                  })()
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', verticalAlign: 'middle' }}>
                          <input
                            type="number"
                            min={1}
                            value={it.quantity}
                            onChange={e => updateQuantity(it.inventory_id, parseInt(e.target.value) || 0)}
                            disabled={submitting}
                            style={{ width: '70px', padding: '5px', textAlign: 'center', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '0.85rem' }}
                          />
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', verticalAlign: 'middle' }}>
                          <button
                            type="button"
                            onClick={() => removeItem(it.inventory_id)}
                            disabled={submitting}
                            title="ลบรายการ"
                            style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px' }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ marginTop: '14px', padding: '24px', textAlign: 'center', border: '1.5px dashed var(--border)', borderRadius: '10px', background: 'var(--bg-app)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <Package size={28} style={{ opacity: 0.3, marginBottom: '6px' }} />
                <div>ยังไม่มีรายการ — เลือกจาก dropdown หรือเพิ่มพัสดุใหม่</div>
              </div>
            )}
          </div>
          </FormSection>

          <FormSection title="หมายเหตุ" icon={<FileText size={18} />} columns={1}>
            <TextArea
              label="หมายเหตุ"
              rows={3}
              maxLength={1000}
              placeholder="ระบุข้อมูลเพิ่มเติม (ถ้ามี)..."
              value={note}
              onChange={e => setNote(e.target.value)}
              disabled={submitting}
            />
          </FormSection>

          <div className="modal-actions" style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>ยกเลิก</Button>
            <Button type="button" variant="outline" loading={submitting} onClick={() => handleSave('Draft')}>
              บันทึกเป็นแบบร่าง
            </Button>
            <Button type="button" variant="primary" loading={submitting} icon={<CheckCircle2 size={16} />} onClick={() => handleSave('Pending')}>
              บันทึกและส่งขออนุมัติ
            </Button>
          </div>
        </form>

        <style>{`
          .dropdown-item-hover:hover { background: rgba(59, 130, 246, 0.06) !important; }
        `}</style>
    </AppDialog>
  );
};

export default NewPurchaseOrderModal;
