import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { inventoryApi } from '../../api';
import type { AssetLifecycleItem } from '../../types';

interface StatusMeta {
  label: string;
  color: string;
  bg: string;
}

const STATUS_META: Record<string, StatusMeta> = {
  'Withdrawn': { label: 'ใช้งานอยู่', color: '#15803d', bg: '#dcfce7' },
  'Under Repair': { label: 'ส่งซ่อม', color: '#b45309', bg: '#fef3c7' },
  'Claiming': { label: 'กำลังเคลม', color: 'var(--primary)', bg: 'var(--primary-light)' },
  'Damaged': { label: 'เสียหาย/ปลดระวาง', color: '#b91c1c', bg: '#fee2e2' },
  'In Stock': { label: 'ในคลัง', color: '#475569', bg: '#f1f5f9' },
  'New': { label: 'ในคลัง', color: '#475569', bg: '#f1f5f9' },
};

const getStatusMeta = (status: string): StatusMeta =>
  STATUS_META[status] || { label: status || 'ไม่ทราบสถานะ', color: '#475569', bg: '#f1f5f9' };

const formatInstalledDate = (isoDate: string) => {
  if (!isoDate) return '-';
  try {
    return new Date(isoDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '-';
  }
};

interface StationAssetPickerProps {
  stationId?: number;
  selectedInstanceId?: number;
  selectedInventoryId?: number;
  onSelect: (item: AssetLifecycleItem) => void;
  onClear: () => void;
  label?: string;
}

const StationAssetPicker: React.FC<StationAssetPickerProps> = ({
  stationId,
  selectedInstanceId,
  selectedInventoryId,
  onSelect,
  onClear,
  label = 'อุปกรณ์ที่ติดตั้ง ณ ด่านนี้ (เลือกจากคลังจริง)'
}) => {
  const [instances, setInstances] = useState<AssetLifecycleItem[]>([]);
  const [query, setQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inputId = React.useId();

  useEffect(() => {
    inventoryApi.getLifecycleReport().then(setInstances).catch((err: unknown) => {
      console.error('Failed to load station assets:', err);
    });
    return () => {
      if (blurTimeout.current) clearTimeout(blurTimeout.current);
    };
  }, []);

  const stationItems = useMemo(
    () => (stationId ? instances.filter(item => item.station_id === stationId) : []),
    [instances, stationId]
  );

  const filteredItems = useMemo(() => {
    if (!query) return stationItems;
    const q = query.toLowerCase();
    return stationItems.filter(item =>
      (item.device_name && item.device_name.toLowerCase().includes(q)) ||
      (item.serial_number && item.serial_number.toLowerCase().includes(q)) ||
      (item.model && item.model.toLowerCase().includes(q))
    );
  }, [stationItems, query]);

  const selectedItem = useMemo(
    () => {
      if (selectedInstanceId) return instances.find(item => item.instance_id === selectedInstanceId);
      if (selectedInventoryId) {
        return instances.find(item => item.asset_kind === 'station_stock' && item.inventory_id === selectedInventoryId);
      }
      return undefined;
    },
    [instances, selectedInstanceId, selectedInventoryId]
  );

  const handleSelect = (item: AssetLifecycleItem) => {
    onSelect(item);
    setQuery('');
    setShowDropdown(false);
  };

  const handleClear = () => {
    onClear();
    setQuery('');
  };

  if (!stationId) {
    return (
      <div className="form-group" style={{ gridColumn: '1 / -1' }}>
        <label style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px', display: 'block' }}>{label}</label>
        <div style={{
          padding: '10px 14px', background: 'var(--bg-app)',
          border: '1px dashed var(--border)', borderRadius: '10px',
          fontSize: '0.82rem', color: 'var(--text-muted)'
        }}>
          กรุณาเลือกสถานที่ตั้งด่านก่อน เพื่อแสดงรายการอุปกรณ์ที่ติดตั้งอยู่จริง
        </div>
      </div>
    );
  }

  if (selectedItem) {
    const meta = getStatusMeta(selectedItem.status);
    const isUntracked = selectedItem.asset_kind === 'station_stock';
    const serialLabel = selectedItem.serial_number
      ? selectedItem.serial_number
      : selectedItem.requires_sn
        ? `ยังไม่ระบุ S/N (${selectedItem.untracked_quantity} ชิ้น)`
        : `ไม่มี S/N (${selectedItem.untracked_quantity} ชิ้น)`;
    return (
      <div className="form-group" style={{ gridColumn: '1 / -1' }}>
        <label style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px', display: 'block' }}>{label}</label>
        <div style={{
          padding: '12px 14px', background: 'var(--bg-app)',
          border: '1px solid var(--border)', borderRadius: '10px',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap'
        }}>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.9rem' }}>
              {selectedItem.device_name} {selectedItem.model && `(${selectedItem.model})`}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              {isUntracked ? 'รายการประจำสถานี: ' : 'S/N: '}
              <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{serialLabel}</span>
              {selectedItem.contract_no && <> · 📄 {selectedItem.contract_no} (ปี {selectedItem.contract_year})</>}
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
              <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 700, color: meta.color, background: meta.bg }}>
                {meta.label}
              </span>
              {isUntracked && (
                <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--info)', background: 'var(--info-light)' }}>
                  อยู่ประจำสถานี {selectedItem.quantity} ชิ้น
                </span>
              )}
              <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                ติดตั้งเมื่อ {formatInstalledDate(selectedItem.installed_at)} ({selectedItem.age_months} เดือน)
              </span>
              <span style={{
                padding: '2px 8px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 700,
                color: selectedItem.repair_count > 0 ? '#b45309' : 'var(--text-muted)',
                background: selectedItem.repair_count > 0 ? '#fef3c7' : 'var(--bg-card)',
                border: selectedItem.repair_count > 0 ? 'none' : '1px solid var(--border)'
              }}>
                ซ่อมมาแล้ว {selectedItem.repair_count} ครั้ง
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClear}
            style={{
              padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)',
              background: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '0.78rem',
              fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap'
            }}
          >
            เปลี่ยนอุปกรณ์
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="form-group" style={{ gridColumn: '1 / -1', position: 'relative' }}>
      <label htmlFor={inputId} style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px', display: 'block' }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          id={inputId}
          type="text"
          placeholder={stationItems.length ? 'คลิกหรือพิมพ์ S/N / ชื่ออุปกรณ์เพื่อค้นหาและเลือก...' : 'ไม่พบอุปกรณ์ที่ติดตั้งอยู่ที่ด่านนี้'}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setShowDropdown(true); }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => { blurTimeout.current = setTimeout(() => setShowDropdown(false), 200); }}
          style={{
            width: '100%', padding: '10px 36px 10px 14px', borderRadius: '10px',
            border: '1px solid var(--border)', background: 'var(--bg-app)',
            color: 'var(--text-main)', fontSize: '0.9rem', cursor: stationItems.length ? 'text' : 'default'
          }}
        />
        {stationItems.length > 0 && (
          <ChevronDown
            size={16}
            style={{
              position: 'absolute', right: '12px', top: '50%', transform: `translateY(-50%) ${showDropdown ? 'rotate(180deg)' : ''}`,
              color: 'var(--text-muted)', pointerEvents: 'none', transition: 'transform 0.2s'
            }}
          />
        )}
      </div>
      {stationItems.length > 0 && !showDropdown && !query && (
        <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          คลิกเพื่อดูรายการอุปกรณ์ที่ติดตั้งในด่านนี้ ({stationItems.length} รายการ)
        </p>
      )}
      {showDropdown && filteredItems.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)', marginTop: '4px', maxHeight: '260px', overflowY: 'auto'
        }}>
          {filteredItems.map(item => {
            const meta = getStatusMeta(item.status);
            const itemKey = item.instance_id
              ? `instance-${item.instance_id}`
              : `station-${item.station_id}-inventory-${item.inventory_id}`;
            return (
              <div
                key={itemKey}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(item);
                }}
                style={{
                  padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                  fontSize: '0.85rem', transition: 'background 0.2s', color: 'var(--text-main)'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = 'var(--primary-light)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'none'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <span>
                    <span style={{ fontWeight: 700, color: 'var(--primary)' }}>
                      {item.serial_number || (item.requires_sn ? `ยังไม่ระบุ S/N ${item.untracked_quantity} ชิ้น` : `ไม่มี S/N ${item.untracked_quantity} ชิ้น`)}
                    </span> - {item.device_name} {item.model && `(${item.model})`}
                  </span>
                  <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '0.68rem', fontWeight: 700, color: meta.color, background: meta.bg, whiteSpace: 'nowrap' }}>
                    {meta.label}
                  </span>
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  ติดตั้งเมื่อ {formatInstalledDate(item.installed_at)} · ซ่อมมาแล้ว {item.repair_count} ครั้ง
                  {item.contract_no && <> · 📄 {item.contract_no} (ปี {item.contract_year})</>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {showDropdown && query && filteredItems.length === 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px',
          marginTop: '4px', padding: '10px 14px', fontSize: '0.8rem', color: 'var(--text-muted)'
        }}>
          ไม่พบอุปกรณ์ที่ตรงกับคำค้นหาในด่านนี้
        </div>
      )}
    </div>
  );
};

export default StationAssetPicker;
