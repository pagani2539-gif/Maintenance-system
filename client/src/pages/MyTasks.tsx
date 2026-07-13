import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { repairApi, transactionApi } from '../api';
import { getApiErrorMessage } from '../utils/apiError';
import { useNotification } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { BackButton } from '../components/ui/BackButton';
import { formatDateTimeThai } from '../utils/formatDate';
import type { Repair, InventoryTransaction } from '../types';
import {
  ListChecks,
  Inbox,
  AlertTriangle,
  Hourglass,
  CheckCircle2,
  Handshake,
  Undo2,
  ArrowRight,
  Loader2,
  ClipboardList,
  MapPin,
  Calendar,
} from 'lucide-react';

const SLA_DAYS = 3;
const PRIORITY_WEIGHT: Record<string, number> = { 'วิกฤต': 4, 'ด่วนมาก': 3, 'ด่วน': 2, 'ปกติ': 1 };

const daysWaiting = (r: Repair): number => {
  const start = new Date(r.received_at || r.created_at).getTime();
  return Math.floor((Date.now() - start) / (1000 * 60 * 60 * 24));
};

const isReturnOverdue = (t: InventoryTransaction): boolean => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (!t.return_due_date) {
    const daysOut = Math.floor((today.getTime() - new Date(t.created_at).getTime()) / (1000 * 60 * 60 * 24));
    return daysOut >= 14;
  }
  const due = new Date(t.return_due_date);
  due.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
};

const nextStatusFor = (status: string): string | null => {
  if (status === 'รอดำเนินการ') return 'กำลังซ่อม';
  if (status === 'กำลังซ่อม') return 'เสร็จสิ้น';
  if (status === 'รออะไหล่') return 'กำลังซ่อม';
  return null;
};

const nextStatusLabel = (status: string): string => {
  if (status === 'กำลังซ่อม') return 'ทำเครื่องหมายเสร็จสิ้น';
  if (status === 'รออะไหล่') return 'ดำเนินการต่อ';
  return 'เริ่มดำเนินการ';
};

const MyTasks: React.FC = () => {
  const { notify } = useNotification();
  const { user } = useAuth();
  const myName = user?.full_name || '';

  const [mine, setMine] = useState<Repair[]>([]);
  const [unassigned, setUnassigned] = useState<Repair[]>([]);
  const [myReturns, setMyReturns] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<number | null>(null);

  const fetchAll = useCallback(async () => {
    if (!myName) return;
    setLoading(true);
    try {
      const [mineData, unassignedData, returnsData] = await Promise.all([
        repairApi.getAll({ technician: myName }),
        repairApi.getAll({ unassigned: true, status: 'รอดำเนินการ' }),
        transactionApi.getAll({ pending_only: true }),
      ]);
      setMine((mineData || []).filter(r => r.status !== 'เสร็จสิ้น'));
      setUnassigned(unassignedData || []);
      const list: InventoryTransaction[] = Array.isArray(returnsData) ? returnsData : [];
      setMyReturns(list.filter(t => t.user_name === myName));
    } catch (err) {
      notify(getApiErrorMessage(err, 'ไม่สามารถโหลดข้อมูลงานของฉันได้'), 'error');
    } finally {
      setLoading(false);
    }
  }, [myName, notify]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount pattern
    fetchAll();
  }, [fetchAll]);

  const sortedMine = useMemo(() => {
    return [...mine].sort((a, b) => {
      const p = (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0);
      if (p !== 0) return p;
      return daysWaiting(b) - daysWaiting(a);
    });
  }, [mine]);

  const sortedUnassigned = useMemo(() => {
    return [...unassigned].sort((a, b) => {
      const p = (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0);
      if (p !== 0) return p;
      return daysWaiting(b) - daysWaiting(a);
    });
  }, [unassigned]);

  const stats = useMemo(() => ({
    mineCount: mine.length,
    overdueCount: mine.filter(r => daysWaiting(r) >= SLA_DAYS).length,
    unassignedCount: unassigned.length,
    returnsCount: myReturns.length,
    returnsOverdue: myReturns.filter(isReturnOverdue).length,
  }), [mine, unassigned, myReturns]);

  const handleAdvance = async (row: Repair) => {
    const next = nextStatusFor(row.status);
    if (!next) return;
    setActingId(row.id);
    try {
      await repairApi.updateStatus(row.id, { status: next, user: myName, note: '' });
      notify(`อัปเดตสถานะ ${row.ticket_no} เป็น "${next}" เรียบร้อย`, 'success');
      fetchAll();
    } catch (err) {
      notify(getApiErrorMessage(err, 'อัปเดตสถานะไม่สำเร็จ'), 'error');
    } finally {
      setActingId(null);
    }
  };

  const handleClaim = async (row: Repair) => {
    setActingId(row.id);
    try {
      await repairApi.updateStatus(row.id, { status: 'กำลังซ่อม', user: myName, note: 'รับงานจากหน้า "งานของฉัน"' });
      notify(`รับงาน ${row.ticket_no} เรียบร้อย`, 'success');
      fetchAll();
    } catch (err) {
      notify(getApiErrorMessage(err, 'รับงานไม่สำเร็จ'), 'error');
    } finally {
      setActingId(null);
    }
  };

  const detailPath = (r: Repair) => (r.type === 'claim' ? `/claim-history/${r.id}` : `/repairs/${r.id}`);

  const scrollToSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading && mine.length === 0 && unassigned.length === 0) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} />
        <div style={{ marginTop: '1rem' }}>กำลังโหลดงานของฉัน...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 0 4rem 0', backgroundColor: 'var(--bg-app)', minHeight: '100vh' }}>
      <div className="responsive-page-content" style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 2.5rem' }}>

        {/* Header */}
        <BackButton />
        <div className="page-header" style={{ marginBottom: '2rem' }}>
          <div className="page-title">
            <h2>งานของฉัน</h2>
            <p>งานซ่อม/เคลมที่คุณดูแลอยู่ งานที่ยังไม่มีคนรับ และอุปกรณ์ที่คุณยืมค้างคืน</p>
          </div>
        </div>

        {/* Stats */}
        <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
          {[
            { label: 'งานที่ฉันดูแลอยู่', val: stats.mineCount, icon: ListChecks, color: 'var(--primary)', bg: 'var(--primary-light)', section: 'task-section-mine' },
            { label: 'เกิน SLA (3 วัน)', val: stats.overdueCount, icon: AlertTriangle, color: 'var(--danger)', bg: 'var(--danger-light)', glow: stats.overdueCount > 0, section: 'task-section-mine' },
            { label: 'ยังไม่มีคนรับ', val: stats.unassignedCount, icon: Inbox, color: 'var(--warning)', bg: 'var(--warning-light)', section: 'task-section-unassigned' },
            { label: 'ของค้างคืน (ของฉัน)', val: stats.returnsCount, icon: Undo2, color: 'var(--success)', bg: 'var(--success-light)', section: 'task-section-returns' },
          ].map((s, i) => (
            <Card key={i} className={s.glow ? 'led-breathe-danger' : ''} onClick={() => scrollToSection(s.section)} style={{ cursor: 'pointer' }}>
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

        {/* Section: mine */}
        <div id="task-section-mine" style={{ marginBottom: '2rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', fontWeight: 800, marginBottom: '1rem' }}>
            <ClipboardList size={18} color="var(--primary)" /> งานที่ฉันดูแลอยู่ ({sortedMine.length})
          </h3>
          {sortedMine.length === 0 ? (
            <Card style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              ยังไม่มีงานที่คุณดูแลอยู่ตอนนี้ — ลองรับงานจากรายการด้านล่าง
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {sortedMine.map(r => {
                const overdue = daysWaiting(r) >= SLA_DAYS;
                const next = nextStatusFor(r.status);
                return (
                  <Card key={r.id} style={{ padding: '1rem 1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                          <Link to={detailPath(r)} style={{ fontWeight: 800, color: 'var(--primary)', textDecoration: 'none', fontFamily: 'var(--font-mono)' }}>{r.ticket_no}</Link>
                          <span className={`badge badge-priority-${r.priority === 'วิกฤต' ? 'critical' : r.priority === 'ด่วนมาก' ? 'urgent' : r.priority === 'ด่วน' ? 'high' : 'normal'}`}>{r.priority}</span>
                          <span className={`badge badge-${r.status}`}>{r.status}</span>
                          {overdue && (
                            <span className="led-breathe-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', background: 'var(--danger-light)', color: 'var(--danger)', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800, border: '1px solid var(--danger-border)' }}>
                              <AlertTriangle size={11} /> เกิน SLA {daysWaiting(r)} วัน
                            </span>
                          )}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{r.device_name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                          <MapPin size={12} /> {r.station_name || r.location || 'ไม่ระบุสถานที่'}
                          <span style={{ marginLeft: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Calendar size={12} /> รอมาแล้ว {daysWaiting(r)} วัน
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        <Link to={detailPath(r)} className="btn btn-outline btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          รายละเอียด <ArrowRight size={13} />
                        </Link>
                        {next && (
                          <Button
                            variant={next === 'เสร็จสิ้น' ? 'success' : 'primary'}
                            size="sm"
                            loading={actingId === r.id}
                            disabled={actingId !== null && actingId !== r.id}
                            onClick={() => handleAdvance(r)}
                            icon={<CheckCircle2 size={13} />}
                          >
                            {nextStatusLabel(r.status)}
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Section: unassigned */}
        <div id="task-section-unassigned" style={{ marginBottom: '2rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', fontWeight: 800, marginBottom: '1rem' }}>
            <Inbox size={18} color="var(--warning)" /> งานที่ยังไม่มีคนรับ ({sortedUnassigned.length})
          </h3>
          {sortedUnassigned.length === 0 ? (
            <Card style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              ไม่มีงานที่ค้างรอคนรับตอนนี้
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {sortedUnassigned.map(r => (
                <Card key={r.id} style={{ padding: '1rem 1.25rem', border: '1px dashed var(--warning-border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                        <Link to={detailPath(r)} style={{ fontWeight: 800, color: 'var(--primary)', textDecoration: 'none', fontFamily: 'var(--font-mono)' }}>{r.ticket_no}</Link>
                        <span className={`badge badge-priority-${r.priority === 'วิกฤต' ? 'critical' : r.priority === 'ด่วนมาก' ? 'urgent' : r.priority === 'ด่วน' ? 'high' : 'normal'}`}>{r.priority}</span>
                        {r.type === 'claim' && <span className="badge badge-info">เคลม</span>}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{r.device_name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                        <MapPin size={12} /> {r.station_name || r.location || 'ไม่ระบุสถานที่'}
                        <span style={{ marginLeft: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Hourglass size={12} /> รอมาแล้ว {daysWaiting(r)} วัน
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="warning"
                      size="sm"
                      loading={actingId === r.id}
                      disabled={actingId !== null && actingId !== r.id}
                      onClick={() => handleClaim(r)}
                      icon={<Handshake size={13} />}
                    >
                      รับงานนี้
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Section: my pending returns */}
        <div id="task-section-returns">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', fontWeight: 800, marginBottom: '1rem' }}>
            <Undo2 size={18} color="var(--success)" /> อุปกรณ์ที่ฉันยืม/ค้างคืน ({myReturns.length})
          </h3>
          {myReturns.length === 0 ? (
            <Card style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              ไม่มีอุปกรณ์ที่คุณยืมค้างคืนอยู่ตอนนี้
            </Card>
          ) : (
            <Card style={{ padding: '0.75rem 1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {myReturns.map(t => {
                  const overdue = isReturnOverdue(t);
                  return (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '8px 4px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{t.product_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {t.serial_number ? `S/N: ${t.serial_number}` : t.withdrawal_type || 'ยืมใช้งาน'}
                          {t.return_due_date && ` · กำหนดคืน ${formatDateTimeThai(t.return_due_date).split(' เวลา ')[0]}`}
                        </div>
                      </div>
                      {overdue && (
                        <span className="led-breathe-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', background: 'var(--danger-light)', color: 'var(--danger)', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 800, border: '1px solid var(--danger-border)', flexShrink: 0 }}>
                          <AlertTriangle size={11} /> เลยกำหนด
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: '10px', textAlign: 'right' }}>
                <Link to={`/pending-returns?search=${encodeURIComponent(myName)}`} className="btn btn-outline btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  ไปหน้าคืนอุปกรณ์ <ArrowRight size={13} />
                </Link>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default MyTasks;
