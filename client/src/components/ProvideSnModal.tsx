import React, { useState, useEffect, useRef, Suspense } from 'react';
import { ScanLine } from 'lucide-react';
import { Button } from './ui/Button';
import { useNotification } from './Layout';
import { getApiErrorMessage } from '../utils/apiError';
import Select from './ui/Select';
import AppDialog from './ui/AppDialog';

// โหลด scanner (กล้อง + บาร์โค้ด + OCR) เฉพาะตอนเปิดใช้ เพื่อไม่ถ่วง bundle หลัก
const SnScannerModal = React.lazy(() => import('./SnScannerModal'));

interface InstanceInfo {
  id: number;
  serial_number: string;
  condition: string;
}

interface ProvideSnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  title: string;
  totalQuantity: number;
  existingSns: string[];
  onSubmit: (newSns: string[]) => Promise<void>;
  /** ชิ้นงานที่ลงทะเบียนแล้ว (มี id + condition) สำหรับเปลี่ยนสภาพ */
  instances?: InstanceInfo[];
  /** เรียกเมื่อผู้ใช้เปลี่ยนสภาพชิ้นงาน */
  onUpdateCondition?: (instanceId: number, condition: string) => Promise<void>;
}

const CONDITION_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: 'New', label: 'ใหม่', color: 'var(--primary)' },
  { value: 'Good', label: 'ดี', color: 'var(--success)' },
  { value: 'Fair', label: 'พอใช้', color: 'var(--warning)' },
  { value: 'Broken', label: 'ชำรุด', color: 'var(--danger)' },
];

export const ProvideSnModal: React.FC<ProvideSnModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  title,
  totalQuantity,
  existingSns,
  onSubmit,
  instances = [],
  onUpdateCondition
}) => {
  const { notify } = useNotification();
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const handleConditionChange = async (instanceId: number, condition: string) => {
    if (!onUpdateCondition) return;
    setUpdatingId(instanceId);
    try {
      await onUpdateCondition(instanceId, condition);
      notify('อัปเดตสภาพชิ้นงานแล้ว');
    } catch {
      notify('ไม่สามารถอัปเดตสภาพชิ้นงานได้', 'error');
    } finally {
      setUpdatingId(null);
    }
  };
  const [loading, setLoading] = useState(false);
  const [newSns, setNewSns] = useState<string[]>([]);
  const [snInputMode, setSnInputMode] = useState<'individual' | 'bulk'>('individual');
  const [scannerOpen, setScannerOpen] = useState(false);
  const newSnsRef = useRef<string[]>([]);

  const missingCount = totalQuantity - existingSns.length;

  useEffect(() => { newSnsRef.current = newSns; }, [newSns]);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        setNewSns([]);
        setSnInputMode(missingCount > 10 ? 'bulk' : 'individual');
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen, missingCount]);

  // รับค่าจากเครื่องสแกน — คืน true ถ้ายังมีที่ว่างและไม่ซ้ำ
  const handleScanDetected = (value: string): boolean => {
    const current = newSnsRef.current.map(s => s.trim()).filter(Boolean);
    if (current.length >= missingCount) return false;
    if (current.includes(value) || existingSns.includes(value)) return false;
    const next = [...current, value];
    newSnsRef.current = next;
    setNewSns(next);
    return true;
  };

  if (!isOpen) return null;

  const handleSnChange = (index: number, value: string) => {
    setNewSns(prev => {
      const next = [...prev];
      while (next.length <= index) next.push('');
      next[index] = value;
      return next;
    });
  };

  const handleBulkSnChange = (text: string) => {
    const lines = text.split('\n').map(line => line.trim().replace(/\r/g, '')).filter(line => line !== '');
    setNewSns(lines.slice(0, missingCount));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validSns = newSns.map(sn => sn.trim().replace(/\r/g, '')).filter(sn => sn !== '');
    if (validSns.length === 0) {
      notify('กรุณาระบุ Serial Number อย่างน้อย 1 รายการ', 'error');
      return;
    }

    // Check for duplicates in the current list
    const uniqueSns = new Set(validSns);
    if (uniqueSns.size !== validSns.length) {
      notify('ตรวจพบหมายเลข Serial Number ซ้ำกันในรายการที่กรอก', 'error');
      return;
    }

    // Validate length limit
    if (validSns.some(sn => sn.length > 100)) {
      notify('หมายเลข Serial Number บางรายการยาวเกินไป (จำกัดไม่เกิน 100 ตัวอักษร)', 'error');
      return;
    }

    setLoading(true);
    try {
      await onSubmit(validSns);
      notify('บันทึก Serial Numbers เรียบร้อยแล้ว');
      onSuccess();
      onClose();
    } catch (err: unknown) {
      notify(getApiErrorMessage(err, 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <AppDialog
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        busy={loading}
        closeOnBackdrop={false}
        className="modal-content"
        panelStyle={{ maxWidth: '600px' }}
      >
        <h3>{title}</h3>
        
        <div style={{ marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div style={{ padding: '12px', background: 'var(--bg-app)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>จำนวนทั้งหมด</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>{totalQuantity}</div>
          </div>
          <div style={{ padding: '12px', background: 'var(--primary-light)', borderRadius: '8px', border: '1px solid var(--primary-light)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600 }}>ยังขาดอีก</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary)' }}>{missingCount}</div>
          </div>
        </div>

        {instances.length > 0 ? (
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
              ชิ้นงานที่ลงทะเบียนแล้ว ({instances.length}) — แตะเพื่อเปลี่ยนสภาพ:
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto', padding: '8px', background: 'var(--bg-app)', borderRadius: '8px' }}>
              {instances.map((inst) => {
                const cond = CONDITION_OPTIONS.find(c => c.value === (inst.condition || 'New')) || CONDITION_OPTIONS[0];
                return (
                  <div key={inst.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inst.serial_number}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: cond.color }} />
                      {onUpdateCondition ? (
                        <Select
                          value={inst.condition || 'New'}
                          disabled={updatingId === inst.id}
                          options={CONDITION_OPTIONS.map(opt => ({ label: opt.label, value: opt.value }))}
                          onChange={(val) => handleConditionChange(inst.id, String(val))}
                          style={{ width: '130px' }}
                        />
                      ) : (
                        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: cond.color }}>{cond.label}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : existingSns.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
              S/N ที่ระบุไปแล้ว:
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '80px', overflowY: 'auto', padding: '8px', background: 'var(--bg-app)', borderRadius: '6px' }}>
              {existingSns.map((sn, i) => (
                <span key={i} style={{ fontSize: '0.7rem', background: 'var(--bg-card)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', color: 'var(--text-main)' }}>
                  {sn}
                </span>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--bg-app)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <label style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                เพิ่ม S/N ใหม่ ({newSns.filter(s => s.trim()).length}/{missingCount})
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  disabled={loading || missingCount <= 0}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                    padding: '5px 10px', fontSize: '0.72rem', fontWeight: 800, cursor: missingCount <= 0 ? 'not-allowed' : 'pointer',
                    border: '1px solid var(--primary)', borderRadius: '6px',
                    background: 'var(--primary-light)', color: 'var(--primary)',
                    opacity: missingCount <= 0 ? 0.5 : 1
                  }}
                >
                  <ScanLine size={14} /> สแกน S/N
                </button>
                <div style={{ display: 'flex', background: 'var(--border)', padding: '2px', borderRadius: '6px' }}>
                <button 
                  type="button"
                  onClick={() => setSnInputMode('individual')}
                  style={{ 
                    padding: '4px 8px', fontSize: '0.7rem', border: 'none', borderRadius: '4px', cursor: 'pointer',
                    background: snInputMode === 'individual' ? 'var(--bg-card)' : 'transparent',
                    color: 'var(--text-main)',
                    fontWeight: snInputMode === 'individual' ? 700 : 500,
                  }}
                >
                  กรอกแยกช่อง
                </button>
                <button 
                  type="button"
                  onClick={() => setSnInputMode('bulk')}
                  style={{ 
                    padding: '4px 8px', fontSize: '0.7rem', border: 'none', borderRadius: '4px', cursor: 'pointer',
                    background: snInputMode === 'bulk' ? 'var(--bg-card)' : 'transparent',
                    color: 'var(--text-main)',
                    fontWeight: snInputMode === 'bulk' ? 700 : 500,
                  }}
                >
                  วางข้อความ
                </button>
                </div>
              </div>
            </div>

            {snInputMode === 'individual' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', maxHeight: '250px', overflowY: 'auto', paddingRight: '4px' }}>
                {Array.from({ length: missingCount }).map((_, idx) => (
                  <input 
                    key={idx}
                    type="text"
                    placeholder={`S/N #${idx + 1}`}
                    maxLength={100}
                    value={newSns[idx] || ''}
                    onChange={(e) => handleSnChange(idx, e.target.value)}
                    disabled={loading}
                    style={{ 
                      width: '100%', padding: '8px 12px', fontSize: '0.85rem', border: '1px solid var(--border)', 
                      background: 'var(--bg-card)', color: 'var(--text-main)',
                      borderRadius: '6px', outline: 'none'
                    }}
                  />
                ))}
              </div>
            ) : (
              <div>
                <textarea 
                  placeholder="วาง Serial Numbers ที่นี่ (1 หมายเลขต่อ 1 บรรทัด)"
                  value={newSns.join('\n')}
                  onChange={(e) => handleBulkSnChange(e.target.value)}
                  rows={8}
                  disabled={loading}
                  style={{ 
                    width: '100%', padding: '10px', fontSize: '0.9rem', border: '1px solid var(--border)', 
                    background: 'var(--bg-card)', color: 'var(--text-main)',
                    borderRadius: '6px', outline: 'none', fontFamily: 'var(--font-mono)'
                  }}
                />
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  * ระบบจะรับข้อมูลสูงสุด {missingCount} บรรทัด
                </p>
              </div>
            )}
          </div>

          <div className="modal-actions">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>ยกเลิก</Button>
            <Button type="submit" variant="primary" loading={loading} disabled={loading}>
              บันทึกข้อมูล
            </Button>
          </div>
        </form>
      </AppDialog>

      {scannerOpen && (
        <Suspense fallback={null}>
          <SnScannerModal
            isOpen={scannerOpen}
            onClose={() => setScannerOpen(false)}
            onDetected={handleScanDetected}
            knownSns={existingSns}
          />
        </Suspense>
      )}
    </>
  );
};
