import React from 'react';
import { Camera } from 'lucide-react';
import type { RepairDetail, Company, CompanyLogo } from '../types';
import { UPLOAD_URL } from '../api';
import { pdfTheme, docLabels } from './pdf/pdfTheme';
import PdfPage from './pdf/PdfPage';
import PdfHeader from './pdf/PdfHeader';
import PdfFooter from './pdf/PdfFooter';
import PdfInfoGrid from './pdf/PdfInfoGrid';
import PdfTable, { type PdfTableColumn } from './pdf/PdfTable';
import PdfSignatureBlock from './pdf/PdfSignatureBlock';

interface Props {
  repair: RepairDetail;
  isPreview?: boolean;
  company?: Company | null;
  logo?: CompanyLogo | null;
}

const parseDate = (dateStr: string): Date => {
  if (!dateStr) return new Date();
  if (dateStr.includes(' ') && !dateStr.includes('T')) {
    return new Date(dateStr.replace(' ', 'T') + 'Z');
  }
  return new Date(dateStr);
};

const formatDateThai = (date: Date): string => {
  return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
};

const formatDateTimeThai = (date: Date): string => {
  return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
    + ' ' + date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
};

const formatDuration = (fromStr: string, toStr: string): string => {
  if (!fromStr || !toStr) return '-';
  const from = parseDate(fromStr).getTime();
  const to = parseDate(toStr).getTime();
  if (isNaN(from) || isNaN(to) || to < from) return '-';
  const diffMs = to - from;
  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} วัน`);
  if (hours > 0) parts.push(`${hours} ชม.`);
  if (days === 0 && minutes > 0) parts.push(`${minutes} นาที`);
  return parts.length > 0 ? parts.join(' ') : 'น้อยกว่า 1 นาที';
};

const statusToTone = (status: string): 'success' | 'warning' | 'danger' | 'neutral' => {
  if (status === 'เสร็จสิ้น') return 'success';
  if (status === 'รอดำเนินการ') return 'warning';
  if (status === 'รออะไหล่') return 'danger';
  return 'neutral';
};

const PrintTemplate: React.FC<Props> = ({ repair, isPreview, company = null, logo = null }) => {
  const isClaim = repair.type === 'claim';
  const docType = isClaim ? 'claim' : 'repair';
  const prefix = docLabels[docType].prefix;
  const docNumber = repair.ticket_no || `${prefix}-${String(repair.id || 0).padStart(6, '0')}`;
  const docDate = formatDateThai(parseDate(repair.created_at));
  const printedAt = formatDateTimeThai(new Date());

  let derivedAreaName = repair.station_area_name;
  if (!derivedAreaName && repair.station_name && repair.location_snapshot && repair.location_snapshot.startsWith(repair.station_name)) {
    const suffix = repair.location_snapshot.slice(repair.station_name.length).trim();
    if (suffix.startsWith('-')) {
      derivedAreaName = suffix.slice(1).trim();
    }
  }

  const locationText = repair.station_name
    ? `${repair.station_name}${derivedAreaName ? ' / ' + derivedAreaName : ''}`
    : (repair.location || repair.location_snapshot || '-');

  const devices = repair.devices || [];
  const logs = repair.logs || [];

  const isClosed = repair.status === 'เสร็จสิ้น';
  const closedAtText = isClosed && repair.updated_at
    ? formatDateThai(parseDate(repair.updated_at))
    : '— ยังไม่ปิดงาน —';
  const durationEnd = isClosed && repair.updated_at ? repair.updated_at : new Date().toISOString();
  const durationText = formatDuration(repair.received_at || repair.created_at, durationEnd);
  const durationLabel = isClosed ? 'ระยะเวลาดำเนินการ' : 'ดำเนินการมาแล้ว';

  const deviceColumns: PdfTableColumn<typeof devices[0]>[] = [
    {
      key: 'old',
      header: 'อุปกรณ์เดิม',
      render: (row) => (
        <>
          <div style={{ fontWeight: 700 }}>{row.old_model || '-'}</div>
          {row.old_serial && (
            <div style={{ fontFamily: pdfTheme.fonts.mono, fontSize: pdfTheme.size.small, color: pdfTheme.colors.textMuted, marginTop: '2px' }}>
              S/N: {row.old_serial}
            </div>
          )}
        </>
      ),
    },
    {
      key: 'new',
      header: 'อุปกรณ์ใหม่',
      render: (row) => (
        <>
          <div style={{ fontWeight: 700 }}>{row.new_model || '-'}</div>
          {row.new_serial && (
            <div style={{ fontFamily: pdfTheme.fonts.mono, fontSize: pdfTheme.size.small, color: pdfTheme.colors.textMuted, marginTop: '2px' }}>
              S/N: {row.new_serial}
            </div>
          )}
        </>
      ),
    },
    {
      key: 'changed_by',
      header: 'ผู้เปลี่ยน',
      width: '110px',
      render: (row) => row.changed_by || '-',
    },
    {
      key: 'changed_at',
      header: 'วันที่เปลี่ยน',
      width: '120px',
      align: 'center',
      render: (row) => row.changed_at ? formatDateThai(parseDate(row.changed_at)) : '-',
    },
  ];

  const priorityTone: Record<string, { bg: string; text: string }> = {
    'ปกติ':    { bg: '#dbeafe', text: '#1e40af' },
    'ด่วน':    { bg: '#fef3c7', text: '#78350f' },
    'ด่วนมาก': { bg: '#fee2e2', text: '#7f1d1d' },
    'วิกฤต':   { bg: '#fecaca', text: '#7f1d1d' },
  };
  const priorityColors = priorityTone[repair.priority] || priorityTone['ปกติ'];

  return (
    <div
      id="pdf-print-template"
      style={{
        position: isPreview ? 'relative' : 'absolute',
        left: isPreview ? 'auto' : '-99999px',
        top: isPreview ? 'auto' : 0,
      }}
    >
      <PdfPage isPreview={isPreview}>
        <PdfHeader
          docType={docType}
          docNumber={docNumber}
          docDate={docDate}
          company={company}
          logo={logo}
          statusBadge={{ label: repair.status, tone: statusToTone(repair.status) }}
        />

        {/* 1. Operational Info Grid (3 columns) */}
        <PdfInfoGrid
          title={isClaim ? 'ข้อมูลการเคลม' : 'ข้อมูลการแจ้งซ่อม'}
          columns={3}
          docType={docType}
          fields={[
            { label: 'ผู้แจ้ง', value: repair.reporter || '-' },
            { label: 'วันที่รับเรื่อง', value: repair.received_at ? formatDateThai(parseDate(repair.received_at)) : '-' },
            {
              label: 'ความเร่งด่วน',
              value: (
                <span style={{
                  display: 'inline-block',
                  padding: '1px 6px',
                  borderRadius: pdfTheme.radius.sm,
                  background: priorityColors.bg,
                  color: priorityColors.text,
                  fontWeight: 700,
                  fontSize: pdfTheme.size.micro,
                }}>
                  {repair.priority}
                </span>
              ),
            },
            { label: 'ผู้รับผิดชอบ / ช่าง', value: repair.technician || '— ยังไม่ได้มอบหมาย —' },
            { label: 'วันที่ปิดงาน', value: closedAtText },
            { label: durationLabel, value: durationText },
            { label: 'ชื่อโครงการ / งาน', value: repair.project_name || '-', span: 2 },
            { label: 'อุปกรณ์ที่แจ้ง', value: repair.device_name || '-' },
            { label: 'สถานที่ / หน้างาน', value: locationText, span: 2 },
            { label: 'อาการ / รายละเอียดปัญหา', value: repair.problem || '-', span: 3 },
            { label: 'หมายเหตุการซ่อม / ผลการดำเนินการ', value: repair.repair_note || '— ยังไม่มีบันทึก —', span: 3 },
          ]}
        />

        {/* 2. Replaced Devices Table (S/N Table) */}
        {devices.length > 0 && (
          <div style={{ marginBottom: `${pdfTheme.space.sectionGap}px` }}>
            <PdfTable
              docType={docType}
              title="ประวัติการเปลี่ยนอุปกรณ์ (รายการ S/N)"
              columns={deviceColumns}
              rows={devices.slice(0, 3)}
              emptyMessage="ไม่มีการเปลี่ยนอุปกรณ์"
              showRowNumber
            />
          </div>
        )}

        {/* 3. Evidence Images Grid (Always 4 frames) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: `${pdfTheme.space.sectionGap}px` }}>
          <h2 style={{
            fontSize: `${pdfTheme.size.h2}px`,
            fontWeight: 800,
            color: pdfTheme.colors.primary,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            margin: '4px 0 6px 0',
            paddingBottom: '2px',
          }}>
            รูปภาพหลักฐานการดำเนินงาน
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '8px',
          }}>
            {[0, 1, 2, 3].map((index) => {
              const img = repair.images && repair.images[index];
              return (
                <div key={index} style={{
                  height: '140px',
                  border: img ? '1px solid #cbd5e1' : '1px dashed #94a3b8',
                  borderRadius: pdfTheme.radius.md,
                  background: img ? pdfTheme.colors.bgPage : '#f8fafc',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                }}>
                  {img ? (
                    <img
                      src={`${UPLOAD_URL}/uploads/${img.file_path}`}
                      alt={`หลักฐาน ${index + 1}`}
                      crossOrigin="anonymous"
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    />
                  ) : (
                    <div style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      gap: '4px',
                      color: '#94a3b8',
                    }}>
                      <Camera size={24} style={{ opacity: 0.5 }} />
                      <span style={{ fontSize: '8px', fontWeight: 600 }}>ไม่มีรูปภาพ {index + 1}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 4. Activity Timeline */}
        {logs.length > 0 && (
          <PdfTable
            docType={docType}
            title="ประวัติการดำเนินงาน"
            columns={[
              {
                key: 'created_at',
                header: 'วัน-เวลา',
                width: '110px',
                render: (row) => (
                  <span style={{ fontFamily: pdfTheme.fonts.mono, fontSize: pdfTheme.size.small }}>
                    {formatDateTimeThai(parseDate(row.created_at))}
                  </span>
                ),
              },
              {
                key: 'user',
                header: 'ผู้ดำเนินการ',
                width: '120px',
                render: (row) => row.user || '-',
              },
              {
                key: 'action',
                header: 'การกระทำ',
                width: '120px',
                render: (row) => <span style={{ fontWeight: 700 }}>{row.action || '-'}</span>,
              },
              {
                key: 'note',
                header: 'หมายเหตุ',
                render: (row) => row.note || '-',
              },
            ]}
            rows={logs.slice(0, 6)}
            emptyMessage="ไม่มีบันทึก"
            showRowNumber
          />
        )}

        <div style={{ marginTop: 'auto' }} />

        <PdfSignatureBlock
          slots={[
            { role: 'ผู้แจ้งซ่อม', name: repair.reporter || undefined },
            { role: isClaim ? 'ผู้อนุมัติเคลม' : 'ผู้อนุมัติซ่อม' },
            { role: isClaim ? 'ผู้ดำเนินการเคลม' : 'ช่างผู้ดำเนินการ', name: repair.technician || undefined },
          ]}
        />

        <PdfFooter
          docType={docType}
          docNumber={docNumber}
          company={company}
          pageNumber={1}
          totalPages={1}
          printedAt={printedAt}
        />
      </PdfPage>
    </div>
  );
};

export default PrintTemplate;
