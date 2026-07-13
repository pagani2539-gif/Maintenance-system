import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { contractApi } from '../../api';
import type { Contract } from '../../types';
import { FileText, X } from 'lucide-react';
import { useNotification } from '../Layout';
import DatePicker from './DatePicker';

interface ContractSelectorProps {
  selectedContractId?: number;
  onChange: (contractId: number | undefined) => void;
  required?: boolean;
  asOfDate?: string;
}

const formatContract = (c: Contract) => `${c.contract_no} — ${c.name} (ปี ${c.year_be})`;
const formatDate = (value?: string) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
const isEffectiveOn = (contract: Contract, asOfDate?: string) => {
  if (!asOfDate) return contract.status === 1;
  const date = new Date(`${asOfDate}T00:00:00`).getTime();
  const start = contract.start_date ? new Date(`${contract.start_date}T00:00:00`).getTime() : -Infinity;
  const end = contract.end_date ? new Date(`${contract.end_date}T23:59:59`).getTime() : Infinity;
  return contract.status === 1 && date >= start && date <= end;
};

const ContractSelector: React.FC<ContractSelectorProps> = ({ selectedContractId, onChange, required = false, asOfDate }) => {
  const { notify } = useNotification();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  // Add Contract Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addNo, setAddNo] = useState('');
  const [addName, setAddName] = useState('');
  const [addYear, setAddYear] = useState<string>(String(new Date().getFullYear() + 543)); // default current B.E. year
  const [addStartDate, setAddStartDate] = useState('');
  const [addEndDate, setAddEndDate] = useState('');
  const [addNote, setAddNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        // Keep inactive contracts available for historical/backdated withdrawals.
        // The selector ranks currently effective contracts first instead of
        // hiding the references needed for audit history.
        const list = await contractApi.getAll();
        setContracts(list);
        setError(null);
      } catch (err) {
        console.error('Failed to load contracts:', err);
        setError('ไม่สามารถโหลดรายการสัญญาได้');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Sync search text with the selected contract
  useEffect(() => {
    if (selectedContractId && contracts.length > 0) {
      const matched = contracts.find(c => c.id === selectedContractId);
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      if (matched) setSearchQuery(formatContract(matched));
    } else if (!selectedContractId) {
      setSearchQuery('');
    }
  }, [selectedContractId, contracts]);

  const filtered = useMemo(() => {
    const selected = contracts.find(c => c.id === selectedContractId);
    const sortContracts = (list: Contract[]) => [...list].sort((a, b) => {
      const aEffective = isEffectiveOn(a, asOfDate) ? 1 : 0;
      const bEffective = isEffectiveOn(b, asOfDate) ? 1 : 0;
      if (aEffective !== bEffective) return bEffective - aEffective;
      if (a.year_be !== b.year_be) return b.year_be - a.year_be;
      return a.contract_no.localeCompare(b.contract_no, 'th');
    });
    if (selected && formatContract(selected) === searchQuery) return sortContracts(contracts);
    if (!searchQuery) return sortContracts(contracts);
    const q = searchQuery.toLowerCase();
    return sortContracts(contracts.filter(c =>
      c.contract_no.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      String(c.year_be).includes(q)
    ));
  }, [contracts, searchQuery, selectedContractId, asOfDate]);

  const openAddModal = () => {
    setAddNo('');
    setAddName('');
    setAddYear(String(new Date().getFullYear() + 543));
    setAddStartDate('');
    setAddEndDate('');
    setAddNote('');
    setFieldErrors({});
    setIsAddModalOpen(true);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    const noTrim = addNo.trim();
    const nameTrim = addName.trim();
    const yearNum = parseInt(addYear, 10);
    if (!noTrim) errors.contract_no = 'กรุณากรอกเลขที่สัญญา';
    if (!nameTrim) errors.name = 'กรุณากรอกชื่อสัญญา';
    if (!addYear || isNaN(yearNum)) errors.year_be = 'กรุณากรอกปี พ.ศ.';
    else if (yearNum < 2500 || yearNum > 2700) errors.year_be = 'ปี พ.ศ. ไม่ถูกต้อง (เช่น 2567)';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);
    setFieldErrors({});
    try {
      const created = await contractApi.create({
        contract_no: noTrim,
        name: nameTrim,
        year_be: yearNum,
        start_date: addStartDate || undefined,
        end_date: addEndDate || undefined,
        note: addNote.trim() || undefined
      });
      notify('เพิ่มสัญญาใหม่เรียบร้อยแล้ว');
      setContracts(prev => [created, ...prev]);
      onChange(created.id);
      setIsAddModalOpen(false);
    } catch (err: unknown) {
      const errorObj = err as { response?: { data?: { error?: string } }; message?: string };
      const errMsg = errorObj.response?.data?.error || errorObj.message || 'เกิดข้อผิดพลาดในการสร้างสัญญา';
      notify(errMsg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
      {error && <div style={{ color: 'var(--danger)', fontSize: '0.8rem', fontWeight: 600 }}>{error}</div>}

      <div style={{ position: 'relative', width: '100%' }}>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder={`พิมพ์ค้นหาสัญญา (เลขที่ / ชื่อ / ปี)... ${required ? '*' : ''}`}
            value={searchQuery}
            disabled={loading}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowDropdown(true);
              if (e.target.value === '') onChange(undefined);
            }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => {
              setTimeout(() => {
                setShowDropdown(false);
                const matched = contracts.find(c => c.id === selectedContractId);
                if (matched) setSearchQuery(formatContract(matched));
                else if (!selectedContractId) setSearchQuery('');
              }, 200);
            }}
            style={{
              width: '100%',
              padding: selectedContractId ? '10px 36px 10px 36px' : '10px 14px 10px 36px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'var(--bg-app)',
              color: 'var(--text-main)',
              fontSize: '0.9rem'
            }}
          />
          <FileText size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: selectedContractId ? 'var(--primary)' : 'var(--text-muted)' }} />
          {selectedContractId && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(undefined);
                setSearchQuery('');
                setShowDropdown(false);
              }}
              style={{
                position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                color: 'var(--text-muted)', display: 'flex', alignItems: 'center'
              }}
              title="ล้างการเลือก"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {showDropdown && filtered.length > 0 && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 1050,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            marginTop: '4px',
            maxHeight: '220px',
            overflowY: 'auto'
          }}>
            {filtered.map((c) => (
              <div
                key={c.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(c.id);
                  setSearchQuery(formatContract(c));
                  setShowDropdown(false);
                }}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                  fontSize: '0.85rem',
                  color: 'var(--text-main)'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = 'var(--primary-light)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'none'}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ fontWeight: 700 }}>{c.contract_no} — {c.name}</div>
                  <span style={{
                    flexShrink: 0,
                    padding: '2px 6px',
                    borderRadius: '999px',
                    fontSize: '0.62rem',
                    fontWeight: 800,
                    color: isEffectiveOn(c, asOfDate) ? '#15803d' : 'var(--text-muted)',
                    background: isEffectiveOn(c, asOfDate) ? '#dcfce7' : 'var(--bg-app)'
                  }}>
                    {isEffectiveOn(c, asOfDate) ? 'มีผล ณ วันที่เลือก' : c.status === 1 ? 'นอกช่วงวันที่' : 'ปิดใช้งาน'}
                  </span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                  📅 ปี พ.ศ. {c.year_be}
                  {(c.start_date || c.end_date) && ` · ${formatDate(c.start_date) || 'ไม่ระบุ'} - ${formatDate(c.end_date) || 'ไม่ระบุ'}`}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', width: '100%', marginTop: '-2px' }}>
        <button
          type="button"
          onClick={openAddModal}
          style={{
            background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.75rem',
            fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
            padding: '2px 6px', borderRadius: '4px'
          }}
          onMouseOver={(e) => e.currentTarget.style.background = 'var(--primary-light)'}
          onMouseOut={(e) => e.currentTarget.style.background = 'none'}
        >
          ➕ ไม่พบสัญญา? คลิกเพื่อเพิ่มสัญญาใหม่
        </button>
      </div>

      {isAddModalOpen && createPortal(
        <div className="modal-overlay" style={{ zIndex: 1100, display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', padding: '1rem' }}>
          <div className="modal-content" style={{ maxWidth: '480px', width: '100%', maxHeight: '92vh', overflowY: 'auto', background: 'var(--bg-card)', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)', border: '1px solid var(--border)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '0.5rem', color: 'var(--text-main)', fontSize: '1.1rem', fontWeight: 800 }}>
              ➕ เพิ่มสัญญาใหม่
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              สัญญาใช้ผูกกับการเบิกอุปกรณ์ เพื่อติดตามว่าอุปกรณ์หน้างานเป็นของสัญญาปีไหน
            </p>

            <form onSubmit={handleAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                  เลขที่สัญญา <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  maxLength={100}
                  placeholder="เช่น WIM-67/01"
                  value={addNo}
                  onChange={(e) => setAddNo(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: fieldErrors.contract_no ? '1.5px solid var(--danger)' : '1px solid var(--border)', background: 'var(--bg-app)', color: 'var(--text-main)', fontSize: '0.9rem' }}
                />
                {fieldErrors.contract_no && <p style={{ marginTop: '4px', fontSize: '0.72rem', color: 'var(--danger)', fontWeight: 600 }}>⚠ {fieldErrors.contract_no}</p>}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                  ชื่อ / รายละเอียดสัญญา <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="text"
                  maxLength={200}
                  placeholder="เช่น งานบำรุงรักษาระบบ WIM ภาคเหนือ"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: fieldErrors.name ? '1.5px solid var(--danger)' : '1px solid var(--border)', background: 'var(--bg-app)', color: 'var(--text-main)', fontSize: '0.9rem' }}
                />
                {fieldErrors.name && <p style={{ marginTop: '4px', fontSize: '0.72rem', color: 'var(--danger)', fontWeight: 600 }}>⚠ {fieldErrors.name}</p>}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                  ปี พ.ศ. <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="number"
                  placeholder="เช่น 2567"
                  value={addYear}
                  onChange={(e) => setAddYear(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: fieldErrors.year_be ? '1.5px solid var(--danger)' : '1px solid var(--border)', background: 'var(--bg-app)', color: 'var(--text-main)', fontSize: '0.9rem' }}
                />
                {fieldErrors.year_be && <p style={{ marginTop: '4px', fontSize: '0.72rem', color: 'var(--danger)', fontWeight: 600 }}>⚠ {fieldErrors.year_be}</p>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                    เริ่มมีผล
                  </label>
                  <DatePicker value={addStartDate} onChange={setAddStartDate} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                    สิ้นสุด
                  </label>
                  <DatePicker value={addEndDate} onChange={setAddEndDate} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                  หมายเหตุ (ถ้ามี)
                </label>
                <input
                  type="text"
                  maxLength={300}
                  value={addNote}
                  onChange={(e) => setAddNote(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-app)', color: 'var(--text-main)', fontSize: '0.9rem' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setIsAddModalOpen(false)} disabled={isSubmitting}
                  style={{ padding: '10px 16px', borderRadius: '10px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-main)', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>
                  ยกเลิก
                </button>
                <button type="submit" className="pastel-primary-action" disabled={isSubmitting}
                  style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: 'var(--primary)', color: '#fff', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', opacity: isSubmitting ? 0.7 : 1 }}>
                  {isSubmitting ? 'กำลังบันทึก...' : 'บันทึกสัญญา'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ContractSelector;
