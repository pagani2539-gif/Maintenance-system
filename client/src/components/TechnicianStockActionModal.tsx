import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { inventoryApi, technicianStockApi } from '../api';
import { useNotification } from './Layout';
import { Button } from './ui/Button';
import AppDialog from './ui/AppDialog';
import StationSelector from './ui/StationSelector';
import Select from './ui/Select';
import { getApiErrorMessage } from '../utils/apiError';
import type { InventoryItem, Technician, TechnicianHoldingsDetail } from '../types';
import { Package, Plus, Trash2, X, Search, ChevronDown, Truck, MapPin, PackageOpen, Undo2 } from 'lucide-react';

export type TechnicianStockMode = 'load' | 'install' | 'return';

interface PickedItem {
  inventory_id: number;
  name: string;
  model: string;
  requires_sn: number;
  quantity: number;
  max_quantity: number;      // 0 = unlimited (unknown)
  serial_numbers: string[];  // one slot per unit when tracking S/N
  available_serials: string[];
  track_sn: boolean;
}

interface Props {
  mode: TechnicianStockMode;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  technicians: Technician[];
  presetTechnicianId?: number;
}

const MODE_META: Record<TechnicianStockMode, { title: string; icon: React.ReactNode; cta: string; accent: string }> = {
  load: { title: 'โหลดอะไหล่เข้าช่าง', icon: <Truck size={22} />, cta: 'บันทึกการโหลด', accent: 'var(--primary)' },
  install: { title: 'ติดตั้ง / เปลี่ยนอะไหล่ที่หน้างาน', icon: <PackageOpen size={22} />, cta: 'บันทึกการติดตั้ง', accent: 'var(--primary)' },
  return: { title: 'คืนอะไหล่เข้าคลัง', icon: <Undo2 size={22} />, cta: 'บันทึกการคืน', accent: 'var(--success)' },
};

const TechnicianStockActionModal: React.FC<Props> = ({ mode, isOpen, onClose, onSuccess, technicians, presetTechnicianId }) => {
  const { notify } = useNotification();
  const meta = MODE_META[mode];

  const [technicianId, setTechnicianId] = useState<number | undefined>(presetTechnicianId);
  const [items, setItems] = useState<PickedItem[]>([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  // Sources: LOAD picks from warehouse inventory; INSTALL/RETURN pick from what the tech holds.
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [holdings, setHoldings] = useState<TechnicianHoldingsDetail | null>(null);

  // INSTALL-only
  const [stationId, setStationId] = useState<number | undefined>(undefined);
  const [stationAreaId, setStationAreaId] = useState<number | undefined>(undefined);
  const [removedSerial, setRemovedSerial] = useState('');
  const [removedModel, setRemovedModel] = useState('');

  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  const resetAll = useCallback(() => {
    setTechnicianId(presetTechnicianId);
    setItems([]);
    setNote('');
    setStationId(undefined);
    setStationAreaId(undefined);
    setRemovedSerial('');
    setRemovedModel('');
    setSearch('');
    setPickerOpen(false);
  }, [presetTechnicianId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: clear form state when modal opens
    if (isOpen) resetAll();
  }, [isOpen, resetAll]);

  // Load warehouse inventory once (LOAD mode)
  useEffect(() => {
    if (!isOpen || mode !== 'load') return;
    inventoryApi.getAll({})
      .then((data) => setInventory(data.filter((i) => i.quantity > 0)))
      .catch(() => notify('ไม่สามารถโหลดข้อมูลอุปกรณ์ได้', 'error'));
  }, [isOpen, mode, notify]);

  // Load this technician's holdings (INSTALL / RETURN modes)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: clear stale holdings before refetch
    if (!isOpen || mode === 'load' || !technicianId) { setHoldings(null); return; }
    technicianStockApi.getHoldings(technicianId)
      .then(setHoldings)
      .catch(() => notify('ไม่สามารถโหลดรายการที่ช่างถืออยู่ได้', 'error'));
  }, [isOpen, mode, technicianId, notify]);

  // Options for the "add item" picker
  const pickableOptions = useMemo(() => {
    const chosen = new Set(items.map((it) => it.inventory_id));
    if (mode === 'load') {
      return inventory
        .filter((i) => !chosen.has(i.id))
        .filter((i) => !search || i.name.toLowerCase().includes(search.toLowerCase()) || (i.model || '').toLowerCase().includes(search.toLowerCase()))
        .map((i) => ({ inventory_id: i.id, name: i.name, model: i.model || '', requires_sn: i.requires_sn || 0, max: i.quantity }));
    }
    const hs = holdings?.holdings || [];
    return hs
      .filter((h) => !chosen.has(h.inventory_id) && h.on_hand_qty > 0)
      .filter((h) => !search || h.product_name.toLowerCase().includes(search.toLowerCase()) || (h.model || '').toLowerCase().includes(search.toLowerCase()))
      .map((h) => ({ inventory_id: h.inventory_id, name: h.product_name, model: h.model || '', requires_sn: h.requires_sn || 0, max: h.on_hand_qty }));
  }, [mode, inventory, holdings, items, search]);

  const serialsFor = useCallback((inventoryId: number): string[] => {
    if (mode === 'load') return [];
    return (holdings?.instances || []).filter((i) => i.inventory_id === inventoryId).map((i) => i.serial_number);
  }, [mode, holdings]);

  const addItem = (opt: { inventory_id: number; name: string; model: string; requires_sn: number; max: number }) => {
    setItems((prev) => [...prev, {
      inventory_id: opt.inventory_id,
      name: opt.name,
      model: opt.model,
      requires_sn: opt.requires_sn,
      quantity: 1,
      max_quantity: opt.max,
      serial_numbers: opt.requires_sn === 1 ? [''] : [],
      available_serials: serialsFor(opt.inventory_id),
      track_sn: opt.requires_sn === 1,
    }]);
    setPickerOpen(false);
    setSearch('');
  };

  const removeItem = (id: number) => setItems((prev) => prev.filter((it) => it.inventory_id !== id));

  const setQty = (id: number, qty: number) => {
    setItems((prev) => prev.map((it) => {
      if (it.inventory_id !== id) return it;
      const q = Math.max(1, qty || 1);
      let sns = it.serial_numbers;
      if (it.track_sn) {
        sns = Array.from({ length: q }, (_, i) => it.serial_numbers[i] || '');
      }
      return { ...it, quantity: q, serial_numbers: sns };
    }));
  };

  const setSerial = (id: number, idx: number, val: string) => {
    setItems((prev) => prev.map((it) => {
      if (it.inventory_id !== id) return it;
      const sns = [...it.serial_numbers];
      sns[idx] = val;
      return { ...it, serial_numbers: sns };
    }));
  };

  const toggleTrackSn = (id: number) => {
    setItems((prev) => prev.map((it) => {
      if (it.inventory_id !== id) return it;
      const enable = !it.track_sn;
      return { ...it, track_sn: enable, serial_numbers: enable ? Array.from({ length: it.quantity }, (_, i) => it.serial_numbers[i] || '') : [] };
    }));
  };

  const handleSubmit = async () => {
    if (!technicianId) { notify('กรุณาเลือกช่าง', 'error'); return; }
    if (items.length === 0) { notify('กรุณาเลือกอุปกรณ์อย่างน้อย 1 รายการ', 'error'); return; }
    if (mode === 'install' && !stationId) { notify('กรุณาเลือกสถานีที่ติดตั้ง', 'error'); return; }
    for (const it of items) {
      if (it.max_quantity && it.quantity > it.max_quantity) {
        notify(`"${it.name}" จำนวนเกินที่มี (สูงสุด ${it.max_quantity})`, 'error');
        return;
      }
    }

    const payloadItems = items.map((it) => ({
      inventory_id: it.inventory_id,
      quantity: it.quantity,
      serial_numbers: it.track_sn ? it.serial_numbers.map((s) => s.trim()).filter(Boolean) : [],
    }));

    setLoading(true);
    try {
      let res: { message: string };
      if (mode === 'load') {
        res = await technicianStockApi.load({ technician_id: technicianId, items: payloadItems, note: note.trim() || undefined });
      } else if (mode === 'install') {
        res = await technicianStockApi.install({
          technician_id: technicianId, items: payloadItems, station_id: stationId!,
          station_area_id: stationAreaId, removed_serial: removedSerial.trim() || undefined,
          removed_model: removedModel.trim() || undefined, note: note.trim() || undefined,
        });
      } else {
        res = await technicianStockApi.returnStock({ technician_id: technicianId, items: payloadItems, note: note.trim() || undefined });
      }
      notify(res.message || 'บันทึกเรียบร้อย', 'success');
      onSuccess();
      onClose();
    } catch (err) {
      notify(getApiErrorMessage(err, 'บันทึกไม่สำเร็จ กรุณาลองใหม่'), 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AppDialog
      isOpen={isOpen}
      onClose={onClose}
      title={meta.title}
      busy={loading}
      closeOnBackdrop={false}
      className="modal-content"
      panelStyle={{ maxWidth: '760px', width: '100%', maxHeight: '92vh', overflowY: 'auto' }}
    >
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', color: meta.accent }}>{meta.icon} {meta.title}</h3>
          <button type="button" className="close-btn" onClick={onClose} disabled={loading} aria-label="ปิด"><X size={20} /></button>
        </div>

        {/* Technician */}
        <div className="form-group" style={{ marginBottom: '1rem' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px', display: 'block' }}>ช่าง <span style={{ color: 'var(--danger)' }}>*</span></label>
          <Select
            value={technicianId ?? ''}
            options={[
              { value: '', label: '-- เลือกช่าง --' },
              ...technicians.filter((t) => t.is_active).map((t) => ({
                value: t.id,
                label: `${t.full_name}${t.code ? ` (${t.code})` : ''}`,
              })),
            ]}
            onChange={(value) => { setTechnicianId(value ? Number(value) : undefined); setItems([]); }}
            disabled={!!presetTechnicianId}
            style={{ width: '100%' }}
          />
        </div>

        {/* Item picker */}
        <div className="form-group" style={{ marginBottom: '1rem', position: 'relative' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px', display: 'block' }}>
            {mode === 'load' ? 'เลือกอะไหล่จากคลัง' : 'เลือกอะไหล่ที่ช่างถืออยู่'}
          </label>
          <div
            onClick={() => { if (mode !== 'load' && !technicianId) { notify('กรุณาเลือกช่างก่อน', 'info'); return; } setPickerOpen((v) => !v); }}
            style={{ padding: '12px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem', color: 'var(--text-muted)' }}
          >
            <span>-- คลิกเพื่อค้นหาและเพิ่มอุปกรณ์ --</span>
            <ChevronDown size={18} style={{ transform: pickerOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </div>
          {pickerOpen && (
            <div style={{ position: 'absolute', top: '110%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', zIndex: 100, overflow: 'hidden' }}>
              <div style={{ padding: '12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-app)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Search size={16} color="var(--text-muted)" />
                <input autoFocus placeholder="พิมพ์ชื่ออุปกรณ์ หรือ รุ่น..." value={search} onChange={(e) => setSearch(e.target.value)}
                  style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', color: 'var(--text-main)', fontSize: '0.9rem' }} />
                {search && <X size={16} onClick={() => setSearch('')} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} />}
              </div>
              <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                {pickableOptions.length > 0 ? pickableOptions.map((opt) => (
                  <div key={opt.inventory_id} onClick={() => addItem(opt)} className="dropdown-item-hover"
                    style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Package size={18} style={{ opacity: 0.4 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{opt.name}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{opt.model || '-'}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{mode === 'load' ? 'ในคลัง' : 'ช่างถือ'}</div>
                      <div style={{ fontWeight: 700, color: 'var(--primary)' }}>{opt.max}</div>
                    </div>
                  </div>
                )) : (
                  <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {mode === 'load' ? 'ไม่พบอุปกรณ์' : 'ช่างคนนี้ไม่มีอะไหล่ในมือ'}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Selected items */}
        {items.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '1rem' }}>
            {items.map((it) => (
              <div key={it.inventory_id} style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '12px', background: 'var(--bg-app)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Package size={18} color="var(--primary)" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{it.model || '-'}{it.max_quantity ? ` · มี ${it.max_quantity}` : ''}</div>
                  </div>
                  <input type="number" min={1} value={it.quantity} onChange={(e) => setQty(it.inventory_id, parseInt(e.target.value) || 1)}
                    style={{ width: '70px', textAlign: 'center', padding: '6px', borderRadius: '8px', background: 'var(--bg-card)', color: 'var(--text-main)',
                      border: it.max_quantity && it.quantity > it.max_quantity ? '1px solid var(--danger)' : '1px solid var(--border)' }} />
                  <button type="button" className="btn btn-text-danger" style={{ padding: '6px' }} onClick={() => removeItem(it.inventory_id)} title="ลบ"><Trash2 size={18} /></button>
                </div>

                {/* S/N tracking */}
                {it.track_sn ? (
                  <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--primary)' }}>S/N ({it.quantity} ชิ้น)</span>
                      {it.requires_sn !== 1 && (
                        <button type="button" onClick={() => toggleTrackSn(it.inventory_id)} style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600 }}>
                          <X size={12} /> ไม่ระบุ S/N
                        </button>
                      )}
                    </div>
                    {Array.from({ length: it.quantity }).map((_, i) => {
                      const listId = `tsn-${it.inventory_id}-${i}`;
                      const others = it.serial_numbers.filter((_, idx) => idx !== i && _);
                      const avail = it.available_serials.filter((sn) => !others.includes(sn));
                      return (
                        <React.Fragment key={i}>
                          <input type="text" list={listId} value={it.serial_numbers[i] || ''} placeholder={`ระบุ/เลือก S/N ${it.quantity > 1 ? `ชิ้นที่ ${i + 1}` : ''}...`}
                            onChange={(e) => setSerial(it.inventory_id, i, e.target.value)}
                            style={{ width: '100%', padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '0.85rem' }} />
                          {avail.length > 0 && <datalist id={listId}>{avail.map((sn) => <option key={sn} value={sn} />)}</datalist>}
                        </React.Fragment>
                      );
                    })}
                  </div>
                ) : it.requires_sn !== 1 && (
                  <button type="button" onClick={() => toggleTrackSn(it.inventory_id)}
                    style={{ marginTop: '8px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', background: 'var(--bg-card)', border: '1.5px dashed var(--primary)', borderRadius: '8px', color: 'var(--primary)', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                    <Plus size={14} /> ระบุ S/N (ถ้ามี)
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '2rem', border: '1.5px dashed var(--border)', borderRadius: '12px', background: 'var(--bg-app)', marginBottom: '1rem' }}>
            <Package size={36} style={{ opacity: 0.2, color: 'var(--text-muted)' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>ยังไม่ได้เลือกอุปกรณ์</p>
          </div>
        )}

        {/* INSTALL: station + removed unit */}
        {mode === 'install' && (
          <>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 700 }}>
                <MapPin size={14} style={{ verticalAlign: '-2px' }} /> สถานีที่ติดตั้ง <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <StationSelector selectedStationId={stationId} showArea required
                onChange={(data) => { setStationId(data.stationId); setStationAreaId(data.areaId); }} />
            </div>
            <div className="responsive-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px', display: 'block' }}>S/N ตัวเก่าที่ถอดออก <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(ถ้ามี)</span></label>
                <input value={removedSerial} onChange={(e) => setRemovedSerial(e.target.value)} placeholder="S/N ของเสีย..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '0.85rem' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px', display: 'block' }}>รุ่นตัวเก่า <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(ถ้ามี)</span></label>
                <input value={removedModel} onChange={(e) => setRemovedModel(e.target.value)} placeholder="รุ่น..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '0.85rem' }} />
              </div>
            </div>
          </>
        )}

        {/* Note */}
        <div className="form-group" style={{ marginBottom: '1.25rem' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px', display: 'block' }}>หมายเหตุ</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder="ระบุหมายเหตุ..."
            style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '0.85rem', resize: 'vertical' }} />
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <Button variant="outline" style={{ flex: 1 }} onClick={onClose} disabled={loading}>ยกเลิก</Button>
          <Button variant="primary" style={{ flex: 2 }} onClick={handleSubmit} loading={loading} disabled={loading}>{meta.cta}</Button>
        </div>
      <style>{`.dropdown-item-hover:hover { background: rgba(59,130,246,0.08) !important; }`}</style>
    </AppDialog>
  );
};

export default TechnicianStockActionModal;
