import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { stockCountApi } from '../api';
import { getApiErrorMessage } from '../utils/apiError';
import { useNotification } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { BackButton } from '../components/ui/BackButton';
import { formatDateTimeThai } from '../utils/formatDate';
import type { StockCount } from '../types';
import {
  ClipboardCheck,
  PlusCircle,
  X,
  Loader2,
  CheckCircle2,
  Hourglass,
  Ban,
  AlertTriangle,
  ChevronRight,
  User,
} from 'lucide-react';

const STATUS_META: Record<StockCount['status'], { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  IN_PROGRESS: { label: 'กำลังตรวจนับ', color: 'var(--warning)', bg: 'var(--warning-light)', icon: <Hourglass size={12} /> },
  COMPLETED: { label: 'เสร็จสิ้น', color: 'var(--success)', bg: 'var(--success-light)', icon: <CheckCircle2 size={12} /> },
  CANCELLED: { label: 'ยกเลิก', color: 'var(--text-muted)', bg: 'var(--bg-app)', icon: <Ban size={12} /> },
};

const StockCountList: React.FC = () => {
  const navigate = useNavigate();
  const { notify } = useNotification();
  const { hasPermission } = useAuth();
  const canManageStockCounts = hasPermission('manage.stock_counts');

  const [counts, setCounts] = useState<StockCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'All' | StockCount['status']>('All');

  const fetchCounts = async () => {
    setLoading(true);
    try {
      const list = await stockCountApi.getAll();
      setCounts(list);
    } catch (err) {
      notify(getApiErrorMessage(err, 'ไม่สามารถโหลดรายการรอบตรวจนับได้'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount pattern
    fetchCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => ({
    total: counts.length,
    inProgress: counts.filter(c => c.status === 'IN_PROGRESS').length,
    completed: counts.filter(c => c.status === 'COMPLETED').length,
  }), [counts]);

  const activeCount = counts.find(c => c.status === 'IN_PROGRESS');

  const filteredCounts = useMemo(() => {
    return statusFilter === 'All' ? counts : counts.filter(c => c.status === statusFilter);
  }, [counts, statusFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageStockCounts) return;
    setCreating(true);
    try {
      const created = await stockCountApi.create({ note: note.trim() || undefined });
      notify(`เปิดรอบตรวจนับ ${created.count_no} เรียบร้อย`, 'success');
      setModalOpen(false);
      setNote('');
      navigate(`/stock-counts/${created.id}`);
    } catch (err) {
      notify(getApiErrorMessage(err, 'เปิดรอบตรวจนับไม่สำเร็จ'), 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ padding: '0 0 4rem 0', backgroundColor: 'var(--bg-app)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 2.5rem' }}>

        {/* Header */}
        <BackButton />
        <div className="page-header" style={{ marginBottom: '2rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div className="page-title">
            <h2>ตรวจนับสต็อก (Stocktaking)</h2>
            <p>เปิดรอบตรวจนับ เทียบยอดของจริงกับยอดในระบบ และปรับยอดส่วนต่างพร้อมบันทึกประวัติ</p>
          </div>
          {canManageStockCounts && activeCount ? (
            <Button variant="warning" icon={<Hourglass size={16} />} onClick={() => navigate(`/stock-counts/${activeCount.id}`)}>
              นับต่อรอบ {activeCount.count_no}
            </Button>
          ) : canManageStockCounts ? (
            <Button variant="primary" icon={<PlusCircle size={16} />} onClick={() => setModalOpen(true)}>
              เปิดรอบตรวจนับใหม่
            </Button>
          ) : null}
        </div>

        {/* Stats */}
        <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
          {[
            { key: 'All' as const, label: 'รอบตรวจนับทั้งหมด', val: stats.total, icon: ClipboardCheck, color: 'var(--primary)', bg: 'var(--primary-light)' },
            { key: 'IN_PROGRESS' as const, label: 'กำลังดำเนินการ', val: stats.inProgress, icon: Hourglass, color: 'var(--warning)', bg: 'var(--warning-light)' },
            { key: 'COMPLETED' as const, label: 'เสร็จสิ้นแล้ว', val: stats.completed, icon: CheckCircle2, color: 'var(--success)', bg: 'var(--success-light)' },
          ].map((s, i) => (
            <Card
              key={i}
              onClick={() => setStatusFilter(s.key)}
              style={{ cursor: 'pointer', borderColor: statusFilter === s.key ? 'var(--primary)' : undefined }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                <div className="stat-icon-wrapper" style={{ color: s.color, background: s.bg }}>
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

        {/* Sessions table */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Loader2 size={28} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
              <div style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>กำลังโหลดข้อมูล...</div>
            </div>
          ) : filteredCounts.length === 0 ? (
            <div style={{ padding: '3.5rem 2rem', textAlign: 'center' }}>
              <ClipboardCheck size={40} color="var(--text-muted)" style={{ opacity: 0.4 }} />
              <div style={{ fontWeight: 700, marginTop: '0.75rem' }}>
                {counts.length === 0 ? 'ยังไม่มีรอบตรวจนับ' : 'ไม่พบรอบตรวจนับตามเงื่อนไขที่เลือก'}
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                {counts.length === 0
                  ? 'กดปุ่ม "เปิดรอบตรวจนับใหม่" ระบบจะบันทึกยอดคงคลังปัจจุบันไว้เป็นฐานเปรียบเทียบ'
                  : 'ลองกดการ์ด "รอบตรวจนับทั้งหมด" ด้านบนเพื่อล้างตัวกรอง'}
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-app)' }}>
                    <th style={th}>เลขที่รอบ</th>
                    <th style={th}>สถานะ</th>
                    <th style={th}>ความคืบหน้า</th>
                    <th style={th}>ยอดต่าง</th>
                    <th style={th}>ผู้เปิดรอบ</th>
                    <th style={th}>วันที่เปิดรอบ</th>
                    <th style={th}>ปิดรอบโดย</th>
                    <th style={{ ...th, width: '48px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCounts.map((c) => {
                    const meta = STATUS_META[c.status];
                    const total = c.total_items || 0;
                    const counted = c.counted_items || 0;
                    const pct = total > 0 ? Math.round((counted / total) * 100) : 0;
                    const variance = c.variance_items || 0;
                    return (
                      <tr
                        key={c.id}
                        onClick={() => navigate(`/stock-counts/${c.id}`)}
                        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                        className="dash-row-link"
                      >
                        <td style={td}>
                          <span style={{ fontWeight: 800, color: 'var(--primary)', fontFamily: '"Bai Jamjuree", monospace' }}>{c.count_no}</span>
                          {c.note && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>{c.note}</div>}
                        </td>
                        <td style={td}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            padding: '3px 10px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800,
                            color: meta.color, background: meta.bg, border: `1px solid ${meta.color}22`,
                          }}>
                            {meta.icon} {meta.label}
                          </span>
                        </td>
                        <td style={td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ flex: 1, maxWidth: '120px', height: '6px', background: 'var(--bg-app)', borderRadius: '3px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? 'var(--success)' : 'var(--primary)', borderRadius: '3px' }} />
                            </div>
                            <span style={{ fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{counted}/{total}</span>
                          </div>
                        </td>
                        <td style={td}>
                          {variance > 0 ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--danger)', fontWeight: 800, fontSize: '0.82rem' }}>
                              <AlertTriangle size={13} /> {variance} รายการ
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>—</span>
                          )}
                        </td>
                        <td style={td}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.82rem', fontWeight: 600 }}>
                            <User size={13} color="var(--text-muted)" /> {c.created_by || '—'}
                          </span>
                        </td>
                        <td style={{ ...td, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatDateTimeThai(c.created_at)}</td>
                        <td style={{ ...td, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {c.completed_by ? `${c.completed_by}` : '—'}
                          {c.completed_at && <div style={{ fontSize: '0.72rem' }}>{formatDateTimeThai(c.completed_at)}</div>}
                        </td>
                        <td style={td}><ChevronRight size={16} color="var(--text-muted)" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Create modal */}
      {modalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h3><ClipboardCheck size={22} color="var(--primary)" /> เปิดรอบตรวจนับสต็อกใหม่</h3>
              <button className="close-btn" onClick={() => setModalOpen(false)}><X size={20} /></button>
            </div>

            <form onSubmit={handleCreate}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <Card style={{ padding: '1rem', backgroundColor: 'var(--warning-light)', border: '1px solid var(--warning-border)' }}>
                  <div style={{ fontSize: '0.82rem', lineHeight: 1.6, color: 'var(--text-main)' }}>
                    <strong>ระบบจะบันทึกยอดคงคลังปัจจุบันของทุกรายการ</strong> ไว้เป็นฐานเปรียบเทียบ
                    จากนั้นทีมงานเดินนับของจริงและกรอกจำนวนที่นับได้ เมื่อปิดรอบ
                    ระบบจะปรับยอดส่วนต่างเข้าบัญชีคุมยอดพัสดุพร้อมบันทึกประวัติอัตโนมัติ
                  </div>
                </Card>

                <div className="form-group">
                  <label>หมายเหตุรอบตรวจนับ (ถ้ามี)</label>
                  <textarea
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={300}
                    placeholder="เช่น ตรวจนับประจำไตรมาส 3/2569..."
                  />
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
                <Button type="button" variant="outline" onClick={() => setModalOpen(false)} disabled={creating}>ยกเลิก</Button>
                <Button type="submit" variant="primary" loading={creating} icon={<PlusCircle size={16} />}>
                  เปิดรอบตรวจนับ
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const th: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '12px 14px', fontSize: '0.85rem', verticalAlign: 'middle' };

export default StockCountList;
