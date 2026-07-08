import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { stockCountApi } from '../api';
import { getApiErrorMessage } from '../utils/apiError';
import { useNotification } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { BackButton } from '../components/ui/BackButton';
import { formatDateTimeThai } from '../utils/formatDate';
import type { StockCountDetailResponse, StockCountItem, StockCountCompleteSummary } from '../types';
import {
  ClipboardCheck,
  ArrowLeft,
  Search,
  Save,
  X,
  CheckCircle2,
  Hourglass,
  Ban,
  AlertTriangle,
  Loader2,
  Boxes,
  ListChecks,
  Scale,
  FileCheck2,
} from 'lucide-react';

type FilterTab = 'all' | 'uncounted' | 'counted' | 'variance';

interface RowEdit {
  counted_qty: string;
  note: string;
}

const StockCountDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notify, confirm } = useNotification();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('manage.stock_counts');

  const [detail, setDetail] = useState<StockCountDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<number, RowEdit>>({});
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<FilterTab>('all');
  const [completeModal, setCompleteModal] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completeResult, setCompleteResult] = useState<StockCountCompleteSummary | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await stockCountApi.getById(id);
      setDetail(data);
      setEdits({});
    } catch (err) {
      notify(getApiErrorMessage(err, 'ไม่สามารถโหลดข้อมูลรอบตรวจนับได้'), 'error');
    } finally {
      setLoading(false);
    }
  }, [id, notify]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount pattern
    fetchDetail();
  }, [fetchDetail]);

  const isOpen = detail?.status === 'IN_PROGRESS';
  const items = useMemo(() => detail?.items || [], [detail]);

  const stats = useMemo(() => {
    const counted = items.filter(it => it.counted_qty !== null);
    const variance = counted.filter(it => it.counted_qty !== it.expected_qty);
    return {
      total: items.length,
      counted: counted.length,
      remaining: items.length - counted.length,
      variance: variance.length,
      pct: items.length > 0 ? Math.round((counted.length / items.length) * 100) : 0,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      if (search) {
        const s = search.toLowerCase();
        const match = it.name.toLowerCase().includes(s)
          || (it.model && it.model.toLowerCase().includes(s))
          || (it.storage_location && it.storage_location.toLowerCase().includes(s));
        if (!match) return false;
      }
      if (tab === 'uncounted') return it.counted_qty === null;
      if (tab === 'counted') return it.counted_qty !== null;
      if (tab === 'variance') return it.counted_qty !== null && it.counted_qty !== it.expected_qty;
      return true;
    });
  }, [items, search, tab]);

  const getEdit = (it: StockCountItem): RowEdit => {
    return edits[it.id] ?? {
      counted_qty: it.counted_qty === null ? '' : String(it.counted_qty),
      note: it.note || '',
    };
  };

  const isDirty = (it: StockCountItem): boolean => {
    const e = edits[it.id];
    if (!e) return false;
    const originalQty = it.counted_qty === null ? '' : String(it.counted_qty);
    return e.counted_qty !== originalQty || e.note !== (it.note || '');
  };

  const setEdit = (itemId: number, patch: Partial<RowEdit>, base: RowEdit) => {
    setEdits(prev => ({ ...prev, [itemId]: { ...base, ...(prev[itemId] || {}), ...patch } }));
  };

  const handleSaveRow = async (it: StockCountItem) => {
    if (!id) return;
    const e = getEdit(it);
    const qty = e.counted_qty.trim() === '' ? null : parseInt(e.counted_qty, 10);
    if (qty !== null && (!Number.isInteger(qty) || qty < 0)) {
      notify('จำนวนที่นับได้ต้องเป็นเลขจำนวนเต็มตั้งแต่ 0 ขึ้นไป', 'error');
      return;
    }

    setSavingIds(prev => new Set(prev).add(it.id));
    try {
      const updated = await stockCountApi.updateItem(id, it.id, { counted_qty: qty, note: e.note.trim() || undefined });
      setDetail(prev => prev ? {
        ...prev,
        items: prev.items.map(row => row.id === it.id ? { ...row, ...updated, name: row.name, model: row.model, storage_location: row.storage_location, image_path: row.image_path, requires_sn: row.requires_sn, current_qty: row.current_qty } : row)
      } : prev);
      setEdits(prev => {
        const next = { ...prev };
        delete next[it.id];
        return next;
      });
    } catch (err) {
      notify(getApiErrorMessage(err, 'บันทึกผลนับไม่สำเร็จ'), 'error');
    } finally {
      setSavingIds(prev => {
        const next = new Set(prev);
        next.delete(it.id);
        return next;
      });
    }
  };

  const pendingAdjustments = useMemo(() => {
    return items
      .filter(it => it.counted_qty !== null && it.counted_qty !== it.expected_qty)
      .map(it => ({ ...it, variance: (it.counted_qty as number) - it.expected_qty }));
  }, [items]);

  const handleComplete = async () => {
    if (!id) return;
    setCompleting(true);
    try {
      const result = await stockCountApi.complete(id);
      setCompleteResult(result);
      setCompleteModal(false);
      notify(result.message, 'success');
      fetchDetail();
    } catch (err) {
      notify(getApiErrorMessage(err, 'ปิดรอบตรวจนับไม่สำเร็จ'), 'error');
    } finally {
      setCompleting(false);
    }
  };

  const handleCancel = async () => {
    if (!id) return;
    const ok = await confirm({
      title: 'ยกเลิกรอบตรวจนับ',
      message: 'ผลการนับทั้งหมดในรอบนี้จะไม่ถูกนำไปปรับยอดคงคลัง ยืนยันการยกเลิกหรือไม่?',
      variant: 'danger',
      confirmText: 'ยืนยันยกเลิกรอบ',
      cancelText: 'กลับไปนับต่อ',
    });
    if (!ok) return;
    try {
      await stockCountApi.cancel(id);
      notify('ยกเลิกรอบตรวจนับเรียบร้อย', 'success');
      fetchDetail();
    } catch (err) {
      notify(getApiErrorMessage(err, 'ยกเลิกรอบตรวจนับไม่สำเร็จ'), 'error');
    }
  };

  if (loading && !detail) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} />
        <div style={{ marginTop: '1rem' }}>กำลังโหลดข้อมูลรอบตรวจนับ...</div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center' }}>
        <div style={{ fontWeight: 700 }}>ไม่พบรอบตรวจนับนี้</div>
        <Button variant="outline" style={{ marginTop: '1rem' }} onClick={() => navigate('/stock-counts')} icon={<ArrowLeft size={14} />}>
          กลับหน้ารายการ
        </Button>
      </div>
    );
  }

  const statusMeta = detail.status === 'IN_PROGRESS'
    ? { label: 'กำลังตรวจนับ', color: '#d97706', bg: 'var(--warning-light)', icon: <Hourglass size={13} /> }
    : detail.status === 'COMPLETED'
      ? { label: 'เสร็จสิ้น', color: 'var(--success)', bg: 'var(--success-light)', icon: <CheckCircle2 size={13} /> }
      : { label: 'ยกเลิก', color: 'var(--text-muted)', bg: 'var(--bg-app)', icon: <Ban size={13} /> };

  return (
    <div style={{ padding: '0 0 4rem 0', backgroundColor: 'var(--bg-app)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 2.5rem' }}>

        {/* Header */}
        <div className="page-header" style={{ marginBottom: '1.5rem' }}>
          <BackButton to="/stock-counts" label="กลับหน้ารายการรอบตรวจนับ" style={{ marginBottom: '0.75rem' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div className="page-title">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <ClipboardCheck size={26} color="var(--primary)" />
                รอบตรวจนับ {detail.count_no}
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  padding: '4px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800,
                  color: statusMeta.color, background: statusMeta.bg, border: `1px solid ${statusMeta.color}22`,
                }}>
                  {statusMeta.icon} {statusMeta.label}
                </span>
              </h2>
              <p>
                เปิดรอบโดย {detail.created_by || '—'} เมื่อ {formatDateTimeThai(detail.created_at)}
                {detail.completed_at && ` · ปิดรอบโดย ${detail.completed_by} เมื่อ ${formatDateTimeThai(detail.completed_at)}`}
                {detail.note && ` · ${detail.note}`}
              </p>
            </div>

            {isOpen && canManage && (
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <Button variant="outline" onClick={handleCancel} icon={<Ban size={15} />}>ยกเลิกรอบ</Button>
                <Button
                  variant="primary"
                  onClick={() => setCompleteModal(true)}
                  disabled={stats.counted === 0}
                  icon={<FileCheck2 size={15} />}
                >
                  ปิดรอบและปรับยอด
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* KPI */}
        <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
          {[
            { key: 'all' as FilterTab, label: 'รายการทั้งหมด', val: stats.total, icon: Boxes, color: 'var(--primary)', bg: 'var(--primary-light)' },
            { key: 'counted' as FilterTab, label: 'นับแล้ว', val: stats.counted, icon: ListChecks, color: 'var(--success)', bg: 'var(--success-light)' },
            { key: 'uncounted' as FilterTab, label: 'ยังไม่ได้นับ', val: stats.remaining, icon: Hourglass, color: '#d97706', bg: 'var(--warning-light)' },
            { key: 'variance' as FilterTab, label: 'พบยอดต่าง', val: stats.variance, icon: Scale, color: 'var(--danger)', bg: 'var(--danger-light)' },
          ].map((s, i) => (
            <Card
              key={i}
              onClick={() => setTab(s.key)}
              style={{ cursor: 'pointer', borderColor: tab === s.key ? 'var(--primary)' : undefined }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div className="stat-icon-wrapper" style={{ color: s.color, background: s.bg }}>
                  <s.icon size={22} />
                </div>
                <div>
                  <div className="stat-value" style={{ fontSize: '1.6rem', fontWeight: 800 }}>{s.val}</div>
                  <div className="stat-label" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>{s.label}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Progress bar */}
        <Card style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>ความคืบหน้าการนับ</span>
            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: stats.pct === 100 ? 'var(--success)' : 'var(--primary)' }}>{stats.pct}%</span>
          </div>
          <div style={{ height: '10px', background: 'var(--bg-app)', borderRadius: '5px', overflow: 'hidden', border: '1px solid var(--border)' }}>
            <div style={{ width: `${stats.pct}%`, height: '100%', background: stats.pct === 100 ? 'var(--success)' : 'var(--primary)', borderRadius: '5px', transition: 'width 0.4s ease' }} />
          </div>
        </Card>

        {/* Toolbar: search (filtering is done via the KPI cards above) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <div style={{ position: 'relative', minWidth: '260px' }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              className="form-control"
              style={{ paddingLeft: '36px', width: '100%' }}
              placeholder="ค้นหาชื่ออุปกรณ์, รุ่น, ที่จัดเก็บ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Counting sheet */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '980px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-app)' }}>
                  <th style={th}>อุปกรณ์</th>
                  <th style={th}>ที่จัดเก็บ</th>
                  <th style={{ ...th, textAlign: 'center' }}>ยอดในระบบ (ตอนเปิดรอบ)</th>
                  <th style={{ ...th, textAlign: 'center', width: '140px' }}>นับได้จริง</th>
                  <th style={{ ...th, textAlign: 'center' }}>ส่วนต่าง</th>
                  <th style={th}>หมายเหตุ</th>
                  <th style={th}>ผู้นับ</th>
                  {isOpen && <th style={{ ...th, width: '90px' }}></th>}
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={isOpen ? 8 : 7} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      ไม่พบรายการที่ตรงกับเงื่อนไข
                    </td>
                  </tr>
                )}
                {filteredItems.map((it) => {
                  const e = getEdit(it);
                  const dirty = isDirty(it);
                  const saving = savingIds.has(it.id);
                  const parsed = e.counted_qty.trim() === '' ? null : parseInt(e.counted_qty, 10);
                  const variance = parsed === null || Number.isNaN(parsed) ? null : parsed - it.expected_qty;
                  const savedVariance = it.counted_qty === null ? null : it.counted_qty - it.expected_qty;
                  const displayVariance = dirty ? variance : savedVariance;
                  return (
                    <tr key={it.id} style={{ borderBottom: '1px solid var(--border)', background: displayVariance !== null && displayVariance !== 0 ? 'var(--danger-light)' : undefined }}>
                      <td style={td}>
                        <div style={{ fontWeight: 700 }}>{it.name}</div>
                        {it.model && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{it.model}</div>}
                      </td>
                      <td style={{ ...td, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{it.storage_location || '—'}</td>
                      <td style={{ ...td, textAlign: 'center', fontWeight: 800, fontSize: '0.95rem' }}>{it.expected_qty}</td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        {isOpen ? (
                          <input
                            type="number"
                            min={0}
                            className="form-control"
                            style={{ width: '100px', textAlign: 'center', fontWeight: 800, margin: '0 auto' }}
                            value={e.counted_qty}
                            placeholder="—"
                            onChange={(ev) => setEdit(it.id, { counted_qty: ev.target.value }, e)}
                            onKeyDown={(ev) => { if (ev.key === 'Enter' && dirty && !saving) { ev.preventDefault(); handleSaveRow(it); } }}
                          />
                        ) : (
                          <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>{it.counted_qty === null ? '—' : it.counted_qty}</span>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        {displayVariance === null ? (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        ) : displayVariance === 0 ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--success)', fontWeight: 800, fontSize: '0.82rem' }}>
                            <CheckCircle2 size={13} /> ตรง
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--danger)', fontWeight: 800, fontSize: '0.85rem' }}>
                            <AlertTriangle size={13} /> {displayVariance > 0 ? `+${displayVariance}` : displayVariance}
                          </span>
                        )}
                      </td>
                      <td style={td}>
                        {isOpen ? (
                          <input
                            className="form-control"
                            style={{ width: '100%', minWidth: '140px', fontSize: '0.8rem' }}
                            value={e.note}
                            maxLength={200}
                            placeholder="เช่น พบของชำรุด 1 ชิ้น..."
                            onChange={(ev) => setEdit(it.id, { note: ev.target.value }, e)}
                          />
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{it.note || '—'}</span>
                        )}
                      </td>
                      <td style={{ ...td, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {it.counted_by || '—'}
                        {it.counted_at && <div style={{ fontSize: '0.7rem' }}>{formatDateTimeThai(it.counted_at)}</div>}
                      </td>
                      {isOpen && (
                        <td style={{ ...td, textAlign: 'center' }}>
                          <Button
                            variant={dirty ? 'primary' : 'outline'}
                            size="sm"
                            disabled={!dirty || saving}
                            loading={saving}
                            onClick={() => handleSaveRow(it)}
                            icon={<Save size={13} />}
                          >
                            บันทึก
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {isOpen && !canManage && (
          <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertTriangle size={14} /> การปิดรอบและปรับยอดคงคลังต้องใช้สิทธิ์ผู้ดูแลระบบหรือผู้ได้รับมอบหมาย
          </div>
        )}
      </div>

      {/* Complete confirmation modal */}
      {completeModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <h3><FileCheck2 size={22} color="var(--primary)" /> ยืนยันการปิดรอบตรวจนับ</h3>
              <button className="close-btn" onClick={() => setCompleteModal(false)}><X size={20} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {stats.remaining > 0 && (
                <Card style={{ padding: '0.9rem 1rem', backgroundColor: 'var(--warning-light)', border: '1px solid var(--warning-border)' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle size={16} color="#d97706" />
                    ยังมี {stats.remaining} รายการที่ไม่ได้นับ — รายการเหล่านี้จะถูกข้าม (ไม่ปรับยอด)
                  </div>
                </Card>
              )}

              {pendingAdjustments.length === 0 ? (
                <Card style={{ padding: '1rem', backgroundColor: 'var(--success-light)', border: '1px solid rgba(16,185,129,0.25)' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircle2 size={16} /> ยอดที่นับตรงกับระบบทั้งหมด ไม่มีรายการต้องปรับยอด
                  </div>
                </Card>
              ) : (
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px' }}>
                    รายการที่จะถูกปรับยอด ({pendingAdjustments.length} รายการ)
                  </div>
                  <div style={{ maxHeight: '260px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '10px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-app)', position: 'sticky', top: 0 }}>
                          <th style={{ ...th, padding: '8px 12px' }}>อุปกรณ์</th>
                          <th style={{ ...th, padding: '8px 12px', textAlign: 'center' }}>ระบบ</th>
                          <th style={{ ...th, padding: '8px 12px', textAlign: 'center' }}>นับได้</th>
                          <th style={{ ...th, padding: '8px 12px', textAlign: 'center' }}>ปรับ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingAdjustments.map(a => (
                          <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ ...td, padding: '8px 12px', fontSize: '0.82rem', fontWeight: 600 }}>{a.name}</td>
                            <td style={{ ...td, padding: '8px 12px', textAlign: 'center', fontSize: '0.82rem' }}>{a.expected_qty}</td>
                            <td style={{ ...td, padding: '8px 12px', textAlign: 'center', fontSize: '0.82rem', fontWeight: 700 }}>{a.counted_qty}</td>
                            <td style={{ ...td, padding: '8px 12px', textAlign: 'center', fontWeight: 800, fontSize: '0.82rem', color: a.variance > 0 ? 'var(--success)' : 'var(--danger)' }}>
                              {a.variance > 0 ? `+${a.variance}` : a.variance}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                เมื่อยืนยัน ระบบจะปรับยอดคงคลังตามส่วนต่าง บันทึกลงบัญชีคุมยอดพัสดุ (Ledger)
                พร้อมประวัติการใช้งาน (Audit) และแจ้งเตือนทีมทาง LINE โดยอัตโนมัติ — การกระทำนี้ย้อนกลับไม่ได้
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
              <Button type="button" variant="outline" onClick={() => setCompleteModal(false)} disabled={completing}>กลับไปตรวจสอบ</Button>
              <Button type="button" variant="primary" loading={completing} onClick={handleComplete} icon={<CheckCircle2 size={16} />}>
                ยืนยันปิดรอบและปรับยอด
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Post-completion summary modal */}
      {completeResult && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <h3><CheckCircle2 size={22} color="var(--success)" /> ปิดรอบตรวจนับเรียบร้อย</h3>
              <button className="close-btn" onClick={() => setCompleteResult(null)}><X size={20} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{completeResult.count_no}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                นับแล้ว {completeResult.counted_items}/{completeResult.total_items} รายการ
                {completeResult.uncounted_items > 0 && ` (ข้าม ${completeResult.uncounted_items} รายการที่ไม่ได้นับ)`}
              </div>
              {completeResult.adjustments.length > 0 ? (
                <div style={{ fontSize: '0.85rem' }}>
                  ปรับยอดทั้งหมด <strong>{completeResult.adjustments.length}</strong> รายการ — ตรวจสอบได้ในบัญชีคุมยอดพัสดุ (Ledger)
                </div>
              ) : (
                <div style={{ fontSize: '0.85rem', color: 'var(--success)', fontWeight: 700 }}>ยอดตรงทั้งหมด ไม่มีการปรับยอด</div>
              )}
            </div>
            <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
              <Button type="button" variant="outline" onClick={() => navigate('/transactions')}>ดูบัญชีคุมยอด</Button>
              <Button type="button" variant="primary" onClick={() => setCompleteResult(null)}>ปิดหน้าต่าง</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const th: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '10px 14px', fontSize: '0.85rem', verticalAlign: 'middle' };

export default StockCountDetail;
