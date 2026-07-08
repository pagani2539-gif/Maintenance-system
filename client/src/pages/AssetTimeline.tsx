import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { inventoryApi } from '../api';
import { getApiErrorMessage } from '../utils/apiError';
import { useNotification } from '../components/Layout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { BackButton } from '../components/ui/BackButton';
import { formatDateTimeThai } from '../utils/formatDate';
import type { AssetTimelineResponse, AssetTimelineEvent, AssetTimelineEventKind } from '../types';
import {
  ArrowLeft,
  Loader2,
  Cpu,
  MapPin,
  FileText,
  Wrench,
  ShieldAlert,
  PackagePlus,
  PackageMinus,
  Undo2,
  Repeat,
  AlertTriangle,
  Hash,
  Briefcase,
  User,
} from 'lucide-react';

// How many repairs before we flag the unit as a "problem device"
const PROBLEM_REPAIR_THRESHOLD = 3;

const KIND_META: Record<AssetTimelineEventKind, { color: string; bg: string; icon: React.ReactNode }> = {
  stock_in: { color: 'var(--success)', bg: 'var(--success-light)', icon: <PackagePlus size={16} /> },
  withdraw: { color: 'var(--danger)', bg: 'var(--danger-light)', icon: <PackageMinus size={16} /> },
  return: { color: 'var(--primary)', bg: 'var(--primary-light)', icon: <Undo2 size={16} /> },
  repair: { color: '#d97706', bg: 'var(--warning-light)', icon: <Wrench size={16} /> },
  claim: { color: '#7c3aed', bg: 'rgba(124,58,237,0.1)', icon: <ShieldAlert size={16} /> },
  device_swap: { color: '#0891b2', bg: 'rgba(8,145,178,0.1)', icon: <Repeat size={16} /> },
};

const STATUS_TINT: Record<string, { color: string; bg: string }> = {
  'In Stock': { color: 'var(--success)', bg: 'var(--success-light)' },
  'Withdrawn': { color: 'var(--primary)', bg: 'var(--primary-light)' },
  'Under Repair': { color: '#d97706', bg: 'var(--warning-light)' },
  'Claiming': { color: '#7c3aed', bg: 'rgba(124,58,237,0.1)' },
  'Damaged': { color: 'var(--danger)', bg: 'var(--danger-light)' },
};

const statusLabelTh = (s?: string): string => {
  switch (s) {
    case 'In Stock': return 'อยู่ในคลัง';
    case 'Withdrawn': return 'ติดตั้ง/เบิกออก';
    case 'Under Repair': return 'กำลังซ่อม';
    case 'Claiming': return 'อยู่ระหว่างเคลม';
    case 'Damaged': return 'ชำรุด';
    default: return s || 'ไม่ระบุ';
  }
};

const AssetTimeline: React.FC = () => {
  const { instanceId } = useParams<{ instanceId: string }>();
  const navigate = useNavigate();
  const { notify } = useNotification();

  const [data, setData] = useState<AssetTimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTimeline = useCallback(async () => {
    if (!instanceId) return;
    setLoading(true);
    try {
      const res = await inventoryApi.getInstanceTimeline(instanceId);
      setData(res);
    } catch (err) {
      notify(getApiErrorMessage(err, 'ไม่สามารถโหลดประวัติอุปกรณ์ได้'), 'error');
    } finally {
      setLoading(false);
    }
  }, [instanceId, notify]);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  if (loading && !data) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} />
        <div style={{ marginTop: '1rem' }}>กำลังโหลดพาสปอร์ตอุปกรณ์...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center' }}>
        <div style={{ fontWeight: 700 }}>ไม่พบข้อมูลอุปกรณ์นี้</div>
        <Button variant="outline" style={{ marginTop: '1rem' }} onClick={() => navigate(-1)} icon={<ArrowLeft size={14} />}>
          ย้อนกลับ
        </Button>
      </div>
    );
  }

  const { instance, events } = data;
  const tint = STATUS_TINT[instance.status || ''] || { color: 'var(--text-muted)', bg: 'var(--bg-app)' };
  const isProblem = instance.repair_count >= PROBLEM_REPAIR_THRESHOLD;

  // Prefill target for quick actions: current station if deployed, else the S/N-tagged forms
  const stationQuery = instance.station_id ? `?station_id=${instance.station_id}` : '';

  return (
    <div style={{ padding: '0 0 4rem 0', backgroundColor: 'var(--bg-app)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem 2.5rem' }}>

        <BackButton />

        {/* Passport header */}
        <Card style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.25rem', flexWrap: 'wrap' }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '14px', background: 'var(--primary-light)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--primary)'
            }}>
              <Cpu size={28} />
            </div>
            <div style={{ flex: 1, minWidth: '240px' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                พาสปอร์ตอุปกรณ์ (Asset Passport)
              </div>
              <h2 style={{ margin: '2px 0 6px', fontSize: '1.4rem' }}>{instance.device_name}</h2>
              <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {instance.model && <span style={{ fontWeight: 600 }}>{instance.model}</span>}
                {instance.serial_number && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700, color: 'var(--primary)', fontFamily: 'Outfit, monospace' }}>
                    <Hash size={13} /> {instance.serial_number}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '8px',
                fontSize: '0.78rem', fontWeight: 800, color: tint.color, background: tint.bg, border: `1px solid ${tint.color}22`,
              }}>
                {statusLabelTh(instance.status)}
              </span>
              {instance.station_name && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  <MapPin size={13} /> {instance.station_name}
                </span>
              )}
            </div>
          </div>

          {/* Meta strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border)' }}>
            <MetaCell label="จำนวนครั้งที่ซ่อม" value={`${instance.repair_count} ครั้ง`} danger={isProblem} />
            <MetaCell label="สภาพล่าสุด" value={instance.condition || '-'} />
            <MetaCell label="สัญญา" value={instance.contract_no || 'ไม่ระบุ'} sub={instance.contract_year ? `ปี ${instance.contract_year}` : undefined} />
            <MetaCell label="บันทึกเข้าระบบ" value={formatDateTimeThai(instance.created_at).split(' เวลา ')[0]} />
          </div>

          {isProblem && (
            <div style={{
              marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
              background: 'var(--danger-light)', border: '1px solid var(--danger-border)', borderRadius: '10px',
              color: 'var(--danger)', fontSize: '0.82rem', fontWeight: 700
            }}>
              <AlertTriangle size={18} />
              เครื่องเจ้าปัญหา — ซ่อมมาแล้ว {instance.repair_count} ครั้ง ควรพิจารณาเปลี่ยนทดแทน
            </div>
          )}

          {/* Quick actions */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '1.25rem', flexWrap: 'wrap' }}>
            <Button variant="warning" size="sm" icon={<Wrench size={14} />} onClick={() => navigate(`/new${stationQuery}`)}>
              แจ้งซ่อมเครื่องนี้
            </Button>
            <Button variant="outline" size="sm" icon={<ShieldAlert size={14} />} onClick={() => navigate(`/claim${stationQuery}`)}>
              แจ้งเคลม
            </Button>
            {instance.station_id && (
              <Button variant="outline" size="sm" icon={<MapPin size={14} />} onClick={() => navigate(`/stations?station_id=${instance.station_id}`)}>
                ดูสถานีที่ติดตั้ง
              </Button>
            )}
          </div>
        </Card>

        {/* Timeline */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} color="var(--primary)" /> ไทม์ไลน์ประวัติ ({events.length} เหตุการณ์)
          </h3>
        </div>

        {events.length === 0 ? (
          <Card>
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <FileText size={36} style={{ opacity: 0.35 }} />
              <div style={{ fontWeight: 700, marginTop: '0.75rem' }}>ยังไม่มีประวัติเหตุการณ์</div>
              <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>เมื่อมีการเบิก ซ่อม หรือเคลมเครื่องนี้ ประวัติจะแสดงที่นี่</div>
            </div>
          </Card>
        ) : (
          <div style={{ position: 'relative', paddingLeft: '8px' }}>
            {events.map((ev, i) => (
              <TimelineRow key={i} event={ev} isLast={i === events.length - 1} navigate={navigate} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const MetaCell: React.FC<{ label: string; value: string; sub?: string; danger?: boolean }> = ({ label, value, sub, danger }) => (
  <div>
    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: danger ? 'var(--danger)' : 'var(--text-main)', marginTop: '2px' }}>{value}</div>
    {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{sub}</div>}
  </div>
);

interface TimelineRowProps {
  event: AssetTimelineEvent;
  isLast: boolean;
  navigate: ReturnType<typeof useNavigate>;
}

const TimelineRow: React.FC<TimelineRowProps> = ({ event, isLast, navigate }) => {
  const meta = KIND_META[event.kind];
  const clickable = (event.ref_type === 'repair' || event.ref_type === 'claim') && event.ref_id;
  const target = event.ref_type === 'claim' ? `/claim-history/${event.ref_id}` : `/repairs/${event.ref_id}`;

  return (
    <div style={{ display: 'flex', gap: '14px', position: 'relative' }}>
      {/* Rail */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '50%', background: meta.bg, color: meta.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${meta.color}33`, zIndex: 1
        }}>
          {meta.icon}
        </div>
        {!isLast && <div style={{ width: '2px', flex: 1, minHeight: '20px', background: 'var(--border)' }} />}
      </div>

      {/* Content */}
      <div
        onClick={clickable ? () => navigate(target) : undefined}
        style={{
          flex: 1, marginBottom: '16px', padding: '12px 16px', background: 'var(--bg-card)',
          border: '1px solid var(--border)', borderRadius: '12px', cursor: clickable ? 'pointer' : 'default',
        }}
        className={clickable ? 'dash-row-link' : ''}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 800, fontSize: '0.92rem', color: meta.color }}>{event.title}</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>{formatDateTimeThai(event.timestamp)}</span>
        </div>

        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {event.quantity && event.quantity > 1 && <span style={{ fontWeight: 700 }}>จำนวน {event.quantity}</span>}
          {event.location && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><MapPin size={12} /> {event.location}</span>}
          {event.actor && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><User size={12} /> {event.actor}</span>}
          {event.project && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Briefcase size={12} /> {event.project}</span>}
          {event.status && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700, color: 'var(--text-main)' }}>
              สถานะ: {event.status}
            </span>
          )}
        </div>

        {event.note && (
          <div style={{ marginTop: '6px', fontSize: '0.82rem', color: 'var(--text-main)', lineHeight: 1.5 }}>
            {event.note}
          </div>
        )}
      </div>
    </div>
  );
};

export default AssetTimeline;
