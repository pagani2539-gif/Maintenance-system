import React, { useEffect, useState, useCallback } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { BackButton } from '../components/ui/BackButton';
import { Input } from '../components/ui/Input';
import { useNotification } from '../components/Layout';
import { userApi } from '../api';
import type { AuditLog } from '../types';
import { useBreakpoint } from '../hooks/useBreakpoint';
import {
  Activity,
  Search,
  Loader2,
  Calendar,
  User,
  AlertCircle,
  ArrowRight,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

const DESKTOP_ITEMS_PER_PAGE = 25;
const MOBILE_ITEMS_PER_PAGE = 10;

const AuditLogs: React.FC = () => {
  const { notify } = useNotification();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const breakpoint = useBreakpoint();
  const itemsPerPage = breakpoint === 'mobile' ? MOBILE_ITEMS_PER_PAGE : DESKTOP_ITEMS_PER_PAGE;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * itemsPerPage;
      const res = await userApi.getAuditLogs({
        limit: itemsPerPage,
        offset,
        search: search.trim() || undefined
      });
      setLogs(res.logs);
      setTotal(res.total);
    } catch {
      notify('ไม่สามารถโหลดข้อมูลประวัติการใช้งานระบบได้', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, search, notify, itemsPerPage]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchLogs();
    }, 150);
    return () => clearTimeout(timer);
  }, [fetchLogs]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1); // Reset to page 1 on new search
  };

  const totalPages = Math.ceil(total / itemsPerPage) || 1;

  const parseData = (data?: string | Record<string, unknown> | null): Record<string, unknown> => {
    if (!data) return {};
    if (typeof data === 'string') return JSON.parse(data) as Record<string, unknown>;
    return data;
  };

  const renderDiff = (oldData?: string | Record<string, unknown> | null, newData?: string | Record<string, unknown> | null) => {
    if (!oldData && !newData) return <span style={{ color: 'var(--text-muted)' }}>ไม่มีรายละเอียดข้อมูลเพิ่มเติม</span>;
    try {
      const oldObj = parseData(oldData);
      const newObj = parseData(newData);
      const keys = Array.from(new Set([...Object.keys(oldObj), ...Object.keys(newObj)]));
      
      const changes: Array<{ key: string; oldVal: unknown; newVal: unknown }> = [];
      keys.forEach(k => {
        // Skip metadata / password hashes / system fields to keep diff clean
        if (['updated_at', 'created_at', 'password_hash', 'password_changed_at', 'last_login', 'id'].includes(k)) return;
        if (JSON.stringify(oldObj[k]) !== JSON.stringify(newObj[k])) {
          changes.push({ key: k, oldVal: oldObj[k], newVal: newObj[k] });
        }
      });
      
      if (changes.length === 0) {
        return <span style={{ color: 'var(--text-muted)' }}>บันทึกสถานะเรียบร้อย (ไม่มีการแก้ไขฟิลด์ข้อมูลหลัก)</span>;
      }
      
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.78rem' }}>
          {changes.map(c => {
            const formatValue = (v: unknown) => {
              if (v === undefined || v === null) return 'null';
              if (typeof v === 'object') return JSON.stringify(v);
              return String(v);
            };

            return (
              <div key={c.key} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>• {c.key}:</span>
                <span style={{ textDecoration: 'line-through', color: 'var(--danger-on-tint)', background: 'var(--danger-light)', padding: '1px 6px', borderRadius: '4px', fontSize: '0.72rem' }}>
                  {formatValue(c.oldVal)}
                </span>
                <ArrowRight size={10} style={{ color: 'var(--text-muted)' }} />
                <span style={{ color: 'var(--success)', background: 'var(--success-light)', padding: '1px 6px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600 }}>
                  {formatValue(c.newVal)}
                </span>
              </div>
            );
          })}
        </div>
      );
    } catch {
      const fallback = newData || oldData;
      const fallbackText = typeof fallback === 'string' ? fallback : JSON.stringify(fallback, null, 2);
      return (
        <pre style={{ fontSize: '0.75rem', margin: 0, whiteSpace: 'pre-wrap', color: 'var(--text-muted)' }}>
          {fallbackText}
        </pre>
      );
    }
  };

  const getEntityBadgeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'repair': return { bg: 'var(--info-light)', fg: 'var(--info)' };
      case 'claim': return { bg: 'var(--warning-light)', fg: 'var(--warning)' };
      case 'inventory': return { bg: 'var(--primary-light)', fg: 'var(--primary)' };
      case 'withdrawal': return { bg: 'var(--success-light)', fg: 'var(--success)' };
      case 'station': return { bg: 'var(--bg-subtle)', fg: 'var(--text-muted)' };
      default: return { bg: 'var(--bg-subtle)', fg: 'var(--text-muted)' };
    }
  };

  const renderDiffDetails = (log: AuditLog) => (
    <details className="audit-diff">
      <summary>ดูรายละเอียดการเปลี่ยนแปลง</summary>
      <div className="audit-diff__content">{renderDiff(log.old_data, log.new_data)}</div>
    </details>
  );

  return (
    <div className="responsive-page-content audit-logs-page">
      <BackButton />
      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <div className="page-title">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Activity size={28} color="var(--primary)" />
            ประวัติการใช้งานระบบ (Audit Logs)
          </h2>
          <p>ตรวจสอบและติดตามกิจกรรมการแก้ไขข้อมูลทั้งหมดของเจ้าหน้าที่ เพื่อความปลอดภัยและโปร่งใสสูงสุด</p>
        </div>
      </div>

      {/* Search Bar Toolbar */}
      <Card style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <Search size={18} style={{ color: 'var(--text-muted)', marginLeft: '4px' }} />
          <Input
            value={search}
            onChange={handleSearchChange}
            placeholder="ค้นหาตามชื่อผู้ใช้งาน ประเภทโมเดล หรือหัวข้อการกระทำ..."
            style={{ flex: 1, border: 'none', background: 'transparent', boxShadow: 'none' }}
          />
        </div>
      </Card>

      {/* Main Logs Table */}
      <Card className="audit-logs-surface" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: '6rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Loader2 size={32} className="spinner" /> กำลังโหลดประวัติการใช้งาน...
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '6rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <AlertCircle size={40} style={{ opacity: 0.3, marginBottom: '8px' }} />
            <div>ไม่พบประวัติการใช้งานในระบบ</div>
          </div>
        ) : (
          <>
            {breakpoint === 'mobile' ? (
              <div className="audit-mobile-list">
                {logs.map((log) => {
                  const badge = getEntityBadgeColor(log.entity_type);
                  return (
                    <article className="audit-mobile-card" key={log.id}>
                      <div className="audit-mobile-card__topline">
                        <span className="audit-entity-badge" style={{ background: badge.bg, color: badge.fg }}>{log.entity_type}</span>
                        <span className="audit-mobile-card__date"><Calendar size={14} />{new Date(log.created_at).toLocaleString('th-TH')}</span>
                      </div>
                      <h3>{log.action}</h3>
                      <div className="audit-mobile-card__meta">
                        <span><User size={14} />{log.user_name || 'System/Cron'}</span>
                        <span className="audit-record-id">#{log.entity_id}</span>
                      </div>
                      {renderDiffDetails(log)}
                    </article>
                  );
                })}
              </div>
            ) : (
            <div className="audit-table-scroll">
              <table className="audit-table">
                <thead>
                  <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
                    <th style={th}>วันเวลาที่บันทึก</th>
                    <th style={th}>ผู้ดำเนินการ</th>
                    <th style={th}>หัวข้อการกระทำ</th>
                    <th style={th}>โมดูลระบบ</th>
                    <th style={th}>รหัสรายการ</th>
                    <th style={th}>รายละเอียดการเปลี่ยนแปลง</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const badge = getEntityBadgeColor(log.entity_type);
                    return (
                      <tr key={log.id} style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                        <td style={td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
                            <Calendar size={13} />
                            {new Date(log.created_at).toLocaleString('th-TH')}
                          </div>
                        </td>
                        <td style={td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: 'var(--text-main)' }}>
                            <User size={13} style={{ color: 'var(--primary)' }} />
                            {log.user_name || 'System/Cron'}
                          </div>
                        </td>
                        <td style={td}>
                          <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{log.action}</span>
                        </td>
                        <td style={td}>
                          <span style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            background: badge.bg,
                            color: badge.fg,
                            textTransform: 'capitalize'
                          }}>
                            {log.entity_type}
                          </span>
                        </td>
                        <td style={td}>
                          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', background: 'var(--bg-app)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.78rem' }}>
                            #{log.entity_id}
                          </span>
                        </td>
                        <td style={{ ...td, padding: '12px 16px' }}>
                          {renderDiffDetails(log)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1rem 1.5rem',
                borderTop: '1px solid var(--border)',
                background: 'var(--bg-card)'
              }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  แสดงผล {(page - 1) * itemsPerPage + 1} - {Math.min(page * itemsPerPage, total)} จากทั้งหมด {total} รายการ
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Button
                    variant="outline"
                    icon={<ChevronLeft size={16} />}
                    onClick={() => setPage(prev => Math.max(prev - 1, 1))}
                    disabled={page === 1}
                    aria-label="ไปหน้าก่อนหน้า"
                    title="หน้าก่อนหน้า"
                    style={{ padding: '8px' }}
                  />
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', padding: '0 8px' }}>
                    หน้า {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    icon={<ChevronRight size={16} />}
                    onClick={() => setPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={page === totalPages}
                    aria-label="ไปหน้าถัดไป"
                    title="หน้าถัดไป"
                    style={{ padding: '8px' }}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
};

const th: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: '0.75rem',
  fontWeight: 700,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em'
};

const td: React.CSSProperties = {
  padding: '14px 16px',
  fontSize: '0.82rem',
  verticalAlign: 'middle'
};

export default AuditLogs;
