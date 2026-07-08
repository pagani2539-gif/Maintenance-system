/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { UPLOAD_URL } from '../api';
import type { Company, CompanyLogo } from '../types';
import { pdfTheme } from './pdf/pdfTheme';
import PdfPage from './pdf/PdfPage';
import PdfHeader from './pdf/PdfHeader';
import PdfFooter from './pdf/PdfFooter';
import PdfInfoGrid from './pdf/PdfInfoGrid';
import PdfTable, { type PdfTableColumn } from './pdf/PdfTable';
import PdfSignatureBlock from './pdf/PdfSignatureBlock';

interface Props {
  withdrawal: any;
  isPreview?: boolean;
  company?: Company | null;
  logo?: CompanyLogo | null;
}

interface NormalizedItem {
  name: string;
  model: string;
  quantity: number;
  serial_numbers: string[];
  requires_sn: boolean;
  image: string;
}

const parseDate = (dateStr: string): Date => {
  if (!dateStr) return new Date();
  if (dateStr.includes(' ') && !dateStr.includes('T')) {
    return new Date(dateStr.replace(' ', 'T') + 'Z');
  }
  return new Date(dateStr);
};

const formatDateThai = (date: Date): string => {
  return date.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const formatDateTimeThai = (date: Date): string => {
  return date.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }) + ' ' + date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
};

const normalizeItems = (withdrawal: any): NormalizedItem[] => {
  const raw = withdrawal.items_detail || withdrawal.items || [];
  return raw.map((item: any) => {
    const snField = item.serial_numbers;
    const sns: string[] = Array.isArray(snField)
      ? snField
      : (typeof snField === 'string' && snField.trim() ? snField.split(',').map((s: string) => s.trim()).filter(Boolean) : []);
    return {
      name: item.item_name || item.name || '-',
      model: item.item_model || item.model || '',
      quantity: Number(item.quantity) || 0,
      serial_numbers: sns,
      requires_sn: item.requires_sn === 1 || sns.length > 0,
      image: item.item_image || item.image_path || '',
    };
  });
};

const getItemWeight = (item: NormalizedItem): number => {
  let weight = 1.0;
  
  // Estimate lines based on name length (assuming ~30 characters per line in the column)
  const nameLines = Math.ceil((item.name.length || 1) / 30);
  if (nameLines > 1) {
    weight += (nameLines - 1) * 0.35;
  }

  // Estimate lines based on serial numbers (assuming 3 serial numbers per line)
  if (item.serial_numbers && item.serial_numbers.length > 0) {
    const snLines = Math.ceil(item.serial_numbers.length / 3);
    weight += (snLines - 1) * 0.3; // each extra line of S/N adds 0.3 weight
  }
  
  return weight;
};

const chunkItems = (items: NormalizedItem[]): NormalizedItem[][] => {
  const pages: NormalizedItem[][] = [];
  const itemsWithWeights = items.map(item => ({
    item,
    weight: getItemWeight(item)
  }));

  const totalWeight = itemsWithWeights.reduce((sum, x) => sum + x.weight, 0);

  // If all items fit on a single page with the signature block
  if (totalWeight <= 11.0) {
    pages.push(items);
    return pages;
  }

  let index = 0;
  let isFirstPage = true;

  while (index < items.length) {
    const remaining = itemsWithWeights.slice(index);
    const remainingWeight = remaining.reduce((sum, x) => sum + x.weight, 0);

    // If we are on subsequent pages, and all remaining items can fit on the last page with the signature block
    if (!isFirstPage && remainingWeight <= 14.5) {
      pages.push(remaining.map(x => x.item));
      break;
    }

    // Otherwise, we need to fill the current page up to its limit
    const pageLimit = isFirstPage ? 13.5 : 16.5;
    const pageItems: NormalizedItem[] = [];
    let pageWeight = 0;

    while (index < items.length) {
      const nextItem = itemsWithWeights[index];
      // If adding the next item exceeds the page limit, and we already have at least 1 item on this page, we stop
      if (pageWeight + nextItem.weight > pageLimit && pageItems.length > 0) {
        break;
      }
      pageItems.push(nextItem.item);
      pageWeight += nextItem.weight;
      index++;
    }

    pages.push(pageItems);
    isFirstPage = false;
  }

  return pages;
};

const PrintWithdrawalTemplate: React.FC<Props> = ({ withdrawal, isPreview, company = null, logo = null }) => {
  const docNumber = `WD-${String(withdrawal.id || 0).padStart(6, '0')}`;
  const docDate = formatDateThai(parseDate(withdrawal.created_at));
  const printedAt = formatDateTimeThai(new Date());

  const items = normalizeItems(withdrawal);
  const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);

  let derivedAreaName = withdrawal.station_area_name;
  if (!derivedAreaName && withdrawal.station_name && withdrawal.location_snapshot && withdrawal.location_snapshot.startsWith(withdrawal.station_name)) {
    const suffix = withdrawal.location_snapshot.slice(withdrawal.station_name.length).trim();
    if (suffix.startsWith('-')) {
      derivedAreaName = suffix.slice(1).trim();
    }
  }

  const locationText = withdrawal.station_name
    ? `${withdrawal.station_name}${derivedAreaName ? ' / ' + derivedAreaName : ''}`
    : (withdrawal.location || withdrawal.location_snapshot || '-');

  const columns: PdfTableColumn<NormalizedItem>[] = [
    {
      key: 'name',
      header: 'รายการอุปกรณ์',
      render: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            flexShrink: 0,
            border: pdfTheme.border.light,
            borderRadius: pdfTheme.radius.sm,
            background: pdfTheme.colors.bgSubtle,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {row.image && (
              <img
                src={`${UPLOAD_URL}/uploads/${row.image}`}
                alt=""
                crossOrigin="anonymous"
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              />
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>{row.name}</div>
            {row.model && (
              <div style={{ fontSize: pdfTheme.size.small, color: pdfTheme.colors.textMuted, marginTop: '1px' }}>
                รุ่น: {row.model}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'sn',
      header: 'หมายเลขเครื่อง (S/N)',
      render: (row) => {
        if (!row.requires_sn || row.serial_numbers.length === 0) {
          return <span style={{ color: pdfTheme.colors.textLight, fontStyle: 'italic' }}>—</span>;
        }
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
            {row.serial_numbers.map((sn, i) => (
              <span
                key={i}
                style={{
                  padding: '1px 5px',
                  borderRadius: pdfTheme.radius.sm,
                  background: '#e0f2fe',
                  color: '#0369a1',
                  border: '1px solid #bae6fd',
                  fontFamily: pdfTheme.fonts.mono,
                  fontSize: pdfTheme.size.micro,
                  fontWeight: 700,
                  minWidth: 0,                // allow chip to shrink within the flex row
                  overflowWrap: 'anywhere',   // break an overly long single S/N instead of overflowing
                }}
              >
                {sn}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      key: 'qty',
      header: 'จำนวน',
      width: '80px',
      align: 'center',
      render: (row) => (
        <span style={{ fontFamily: pdfTheme.fonts.mono, fontWeight: 700, fontSize: pdfTheme.size.docNumber }}>
          {row.quantity}
        </span>
      ),
    },
    {
      key: 'check',
      header: 'ตรวจรับ',
      width: '60px',
      align: 'center',
      render: () => (
        <div style={{
          width: '16px',
          height: '16px',
          border: '1.5px solid #94a3b8',
          borderRadius: '3px',
          background: '#ffffff',
          margin: '2px auto 0 auto',
        }} />
      ),
    },
  ];

  const pages = chunkItems(items);

  return (
    <div
      id="pdf-withdrawal-template"
      style={{
        position: isPreview ? 'relative' : 'absolute',
        left: isPreview ? 'auto' : '-99999px',
        top: isPreview ? 'auto' : 0,
      }}
    >
      {pages.map((pageRows, pageIdx) => {
        // Calculate the cumulative start index for row numbering
        let startIndex = 0;
        for (let i = 0; i < pageIdx; i++) {
          startIndex += pages[i].length;
        }

        return (
          <PdfPage key={pageIdx} isPreview={isPreview}>
            <PdfHeader
              docType="withdrawal"
              docNumber={docNumber}
              docDate={docDate}
              company={company}
              logo={logo}
              statusBadge={{ label: 'จ่ายอุปกรณ์แล้ว', tone: 'success' }}
            />

            {pageIdx === 0 && (
              <PdfInfoGrid
                title="ข้อมูลการเบิก"
                columns={2}
                docType="withdrawal"
                fields={[
                  { label: 'ผู้เบิก / ผู้รับ', value: withdrawal.recipient || '-' },
                  { label: 'ประเภทการเบิก', value: withdrawal.type || '-' },
                  { label: 'ชื่อโครงการ / งาน', value: withdrawal.project_name || '-' },
                  { label: 'สถานที่ปลายทาง', value: locationText },
                  { label: 'จำนวนรายการรวม', value: `${items.length} รายการ (${totalQty} ชิ้นรวม)` },
                  { label: 'หมายเหตุ', value: withdrawal.note || '-', span: 2 },
                ]}
              />
            )}

            <PdfTable
              docType="withdrawal"
              title={pageIdx === 0 ? "รายการอุปกรณ์ที่เบิก" : "รายการอุปกรณ์ที่เบิก (ต่อ)"}
              columns={columns}
              rows={pageRows}
              emptyMessage="ไม่มีรายการอุปกรณ์"
              startIndex={startIndex}
            />

            {pageIdx === pages.length - 1 && (
              <>
                <div style={{ marginTop: 'auto' }} />
                <PdfSignatureBlock
                  slots={[
                    { role: 'ผู้เบิก', name: withdrawal.recipient || undefined },
                    { role: 'ผู้อนุมัติ' },
                    { role: 'ผู้จ่ายอุปกรณ์' },
                  ]}
                />
              </>
            )}

            <PdfFooter
              docType="withdrawal"
              docNumber={docNumber}
              company={company}
              pageNumber={pageIdx + 1}
              totalPages={pages.length}
              printedAt={printedAt}
            />
          </PdfPage>
        );
      })}
    </div>
  );
};

export default PrintWithdrawalTemplate;
