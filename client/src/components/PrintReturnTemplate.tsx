import React from 'react';
import type { InventoryTransaction, Company, CompanyLogo } from '../types';
import { UPLOAD_URL } from '../api';
import { pdfTheme } from './pdf/pdfTheme';
import PdfPage from './pdf/PdfPage';
import PdfHeader from './pdf/PdfHeader';
import PdfFooter from './pdf/PdfFooter';
import PdfInfoGrid from './pdf/PdfInfoGrid';
import PdfSignatureBlock from './pdf/PdfSignatureBlock';

interface Props {
  transaction: InventoryTransaction;
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

const conditionLabel = (condition?: string): string => {
  switch (condition) {
    case 'Good':         return 'ใช้งานได้ปกติ';
    case 'Minor Damage': return 'ชำรุดเล็กน้อย';
    case 'Damaged':      return 'ชำรุด';
    case 'Broken':       return 'เสีย / ใช้งานไม่ได้';
    default:             return condition || '-';
  }
};

const conditionTone = (condition?: string): 'success' | 'warning' | 'danger' | 'neutral' => {
  if (condition === 'Good') return 'success';
  if (condition === 'Minor Damage') return 'warning';
  if (condition === 'Damaged' || condition === 'Broken') return 'danger';
  return 'neutral';
};

const PrintReturnTemplate: React.FC<Props> = ({ transaction, isPreview, company = null, logo = null }) => {
  const docNumber = `RT-${String(transaction.id || 0).padStart(6, '0')}`;
  const docDate = formatDateThai(parseDate(transaction.created_at));
  const printedAt = formatDateTimeThai(new Date());
  const quantity = transaction.quantity_returned || 1;

  const sourceWithdrawalNo = transaction.withdrawal_id
    ? `WD-${String(transaction.withdrawal_id).padStart(6, '0')}`
    : '-';

  let derivedAreaName = transaction.station_area_name;
  if (!derivedAreaName && transaction.station_name && transaction.location_snapshot && transaction.location_snapshot.startsWith(transaction.station_name)) {
    const suffix = transaction.location_snapshot.slice(transaction.station_name.length).trim();
    if (suffix.startsWith('-')) {
      derivedAreaName = suffix.slice(1).trim();
    }
  }

  const locationText = transaction.station_name
    ? `${transaction.station_name}${derivedAreaName ? ' / ' + derivedAreaName : ''}`
    : (transaction.location || transaction.location_snapshot || '-');

  return (
    <div
      id="pdf-return-template"
      style={{
        position: isPreview ? 'relative' : 'absolute',
        left: isPreview ? 'auto' : '-99999px',
        top: isPreview ? 'auto' : 0,
      }}
    >
      <PdfPage isPreview={isPreview}>
        <PdfHeader
          docType="return"
          docNumber={docNumber}
          docDate={docDate}
          company={company}
          logo={logo}
          statusBadge={{ label: 'รับคืนเข้าคลังแล้ว', tone: 'success' }}
        />

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
          margin: 0,
        }}>
          {/* ─── Left Column: Return Info ─── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <PdfInfoGrid
              title="ข้อมูลการคืนอุปกรณ์"
              columns={1}
              docType="return"
              fields={[
                { label: 'ผู้คืนอุปกรณ์', value: transaction.user_name || '-' },
                { label: 'อ้างอิงใบเบิกเลขที่', value: (
                  <span style={{ fontFamily: pdfTheme.fonts.mono, fontWeight: 700, color: pdfTheme.accents.withdrawal }}>
                    {sourceWithdrawalNo}
                  </span>
                ) },
                { label: 'ชื่อโครงการ / งาน', value: transaction.project_name || '-' },
                { label: 'สถานที่ที่ใช้งาน', value: locationText },
                { label: 'หมายเหตุการคืน', value: transaction.note || '-' },
              ]}
            />
          </div>

          {/* ─── Right Column: Returned Item Details & Image ─── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <PdfInfoGrid
              title="รายการอุปกรณ์ที่คืน"
              columns={1}
              docType="return"
              fields={[
                { label: 'ชื่ออุปกรณ์ / รุ่น', value: `${transaction.product_name || '-'} (${transaction.product_model || '-'})` },
                { label: 'จำนวนที่คืน', value: (
                  <span style={{ fontFamily: pdfTheme.fonts.mono, fontWeight: 700, fontSize: pdfTheme.size.docNumber }}>
                    {quantity} ชิ้น
                  </span>
                ) },
                { label: 'หมายเลขเครื่อง (S/N)', value: transaction.serial_number ? (
                  <span style={{ fontFamily: pdfTheme.fonts.mono, fontWeight: 700 }}>{transaction.serial_number}</span>
                ) : '— ไม่ระบุ —' },
                { label: 'สภาพอุปกรณ์ที่คืน', value: (
                  <span style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: pdfTheme.radius.sm,
                    background: conditionTone(transaction.condition) === 'success' ? '#d1fae5'
                      : conditionTone(transaction.condition) === 'warning' ? '#fef3c7'
                      : conditionTone(transaction.condition) === 'danger' ? '#fee2e2'
                      : pdfTheme.colors.bgAccent,
                    color: conditionTone(transaction.condition) === 'success' ? '#065f46'
                      : conditionTone(transaction.condition) === 'warning' ? '#78350f'
                      : conditionTone(transaction.condition) === 'danger' ? '#7f1d1d'
                      : pdfTheme.colors.textMuted,
                    fontWeight: 700,
                    fontSize: pdfTheme.size.micro,
                  }}>
                    {conditionLabel(transaction.condition)}
                  </span>
                ) },
              ]}
            />
          </div>
        </div>

        {/* ─── Return Image: full-width, grows to fill available space ─── */}
        {transaction.return_image ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            flex: 1,
            minHeight: 0,
            marginTop: '12px',
          }}>
            <div style={{
              fontSize: `${pdfTheme.size.micro}px`,
              color: pdfTheme.colors.primary,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              margin: '0 0 2px 0',
              flexShrink: 0,
            }}>
              รูปสภาพอุปกรณ์ตอนคืน
            </div>
            <div style={{
              flex: 1,
              minHeight: '320px',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              background: pdfTheme.colors.bgSubtle,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
            }}>
              <img
                src={`${UPLOAD_URL}/uploads/${transaction.return_image}`}
                alt="หลักฐานสภาพตอนคืน"
                crossOrigin="anonymous"
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              />
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 'auto' }} />
        )}

        <PdfSignatureBlock
          slots={[
            { role: 'ผู้คืนอุปกรณ์', name: transaction.user_name || undefined },
            { role: 'ผู้ตรวจสอบสภาพ' },
            { role: 'ผู้รับเข้าคลัง' },
          ]}
        />

        <PdfFooter
          docType="return"
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

export default PrintReturnTemplate;
