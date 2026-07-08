import React from 'react';
import type { PurchaseOrder, PurchaseOrderItem, Company, CompanyLogo } from '../types';
import { pdfTheme } from './pdf/pdfTheme';
import PdfPage from './pdf/PdfPage';
import PdfHeader from './pdf/PdfHeader';
import PdfFooter from './pdf/PdfFooter';
import PdfInfoGrid from './pdf/PdfInfoGrid';
import PdfTable, { type PdfTableColumn } from './pdf/PdfTable';
import PdfSignatureBlock from './pdf/PdfSignatureBlock';

interface Props {
  po: PurchaseOrder;
  isPreview?: boolean;
  company?: Company | null;
  logo?: CompanyLogo | null;
}

const parseDate = (dateStr?: string): Date => {
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

const statusInfo = (status: string): { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' } => {
  switch (status) {
    case 'Draft':     return { label: 'แบบร่าง', tone: 'neutral' };
    case 'Pending':   return { label: 'รออนุมัติ', tone: 'warning' };
    case 'Approved':  return { label: 'อนุมัติแล้ว', tone: 'success' };
    case 'Ordered':   return { label: 'สั่งซื้อแล้ว', tone: 'success' };
    case 'Received':  return { label: 'รับของเข้าคลังแล้ว', tone: 'success' };
    case 'Cancelled': return { label: 'ยกเลิก', tone: 'danger' };
    default:          return { label: status || '-', tone: 'neutral' };
  }
};

const getItemWeight = (item: PurchaseOrderItem): number => {
  let weight = 1.0;
  
  // Estimate lines based on name length (assuming ~30 characters per line in the column)
  const nameLines = Math.ceil((item.item_name?.length || 1) / 30);
  if (nameLines > 1) {
    weight += (nameLines - 1) * 0.35;
  }
  
  return weight;
};

const chunkItems = (items: PurchaseOrderItem[]): PurchaseOrderItem[][] => {
  const pages: PurchaseOrderItem[][] = [];
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
    const pageItems: PurchaseOrderItem[] = [];
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

const PrintPurchaseOrderTemplate: React.FC<Props> = ({ po, isPreview, company = null, logo = null }) => {
  const docNumber = po.po_no || `PO-${String(po.id || 0).padStart(6, '0')}`;
  const docDate = formatDateThai(parseDate(po.created_at));
  const printedAt = formatDateTimeThai(new Date());
  const status = statusInfo(po.status);

  let titleTh = 'ใบสั่งซื้อ';
  let titleEn = 'Purchase Order';

  if (po.status === 'Draft') {
    titleTh = 'ใบขอเสนอซื้อ (ร่างใบสั่งซื้อ)';
    titleEn = 'Purchase Requisition (Draft)';
  } else if (po.status === 'Pending') {
    titleTh = 'ใบขอเสนอซื้อ (รออนุมัติ)';
    titleEn = 'Purchase Requisition (Pending Approval)';
  }

  const items: PurchaseOrderItem[] = po.items || [];

  const itemColumns: PdfTableColumn<PurchaseOrderItem>[] = [
    {
      key: 'name',
      header: 'รายการสินค้า',
      render: (row) => (
        <>
          <div style={{ fontWeight: 700 }}>{row.item_name || '-'}</div>
          {row.item_model && (
            <div style={{ fontSize: pdfTheme.size.small, color: pdfTheme.colors.textMuted, marginTop: '2px' }}>
              รุ่น: {row.item_model}
            </div>
          )}
        </>
      ),
    },
    {
      key: 'qty',
      header: 'จำนวนที่สั่ง',
      width: '90px',
      align: 'center',
      render: (row) => (
        <span style={{ fontFamily: pdfTheme.fonts.mono, fontWeight: 700, fontSize: pdfTheme.size.docNumber }}>
          {row.quantity}
        </span>
      ),
    },
    {
      key: 'received',
      header: 'รับแล้ว',
      width: '80px',
      align: 'center',
      render: (row) => {
        const received = row.received_quantity || 0;
        const isComplete = received >= row.quantity;
        return (
          <span style={{
            fontFamily: pdfTheme.fonts.mono,
            fontWeight: 700,
            color: isComplete ? pdfTheme.accents.repair : pdfTheme.colors.textMuted,
          }}>
            {received}
          </span>
        );
      },
    },
  ];

  const pages = chunkItems(items);

  return (
    <div
      id="pdf-po-template"
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
              docType="purchase"
              docNumber={docNumber}
              docDate={docDate}
              company={company}
              logo={logo}
              statusBadge={status}
              titleTh={titleTh}
              titleEn={titleEn}
            />

            {pageIdx === 0 && (
              <PdfInfoGrid
                title="ข้อมูลการสั่งซื้อ"
                columns={2}
                docType="purchase"
                fields={[
                  { label: 'ผู้สั่งซื้อ', value: po.ordered_by || po.created_by || '-' },
                  { label: 'แผนก / หน่วยงาน', value: po.buyer_department || '-' },
                  { label: 'เบอร์ติดต่อ / อีเมล', value: `${po.buyer_phone || '-'} / ${po.buyer_email || '-'}` },
                  { label: 'ชื่อโครงการ / งาน', value: po.project_name || '-' },
                  { label: 'หมายเหตุ', value: po.note || '-', span: 2 },
                ]}
              />
            )}

            <PdfTable
              docType="purchase"
              title={pageIdx === 0 ? "รายการสินค้าที่สั่งซื้อ" : "รายการสินค้าที่สั่งซื้อ (ต่อ)"}
              columns={itemColumns}
              rows={pageRows}
              emptyMessage="ไม่มีรายการสั่งซื้อ"
              startIndex={startIndex}
            />

            {pageIdx === pages.length - 1 && (
              <>
                <div style={{ marginTop: 'auto' }} />
                <PdfSignatureBlock
                  slots={[
                    { role: 'ผู้สั่งซื้อ', name: po.ordered_by || po.created_by || undefined },
                    { 
                      role: 'ผู้อนุมัติสั่งซื้อ', 
                      name: po.approved_by || undefined, 
                      date: po.approved_at ? formatDateThai(parseDate(po.approved_at)) : undefined 
                    },
                    { role: 'ผู้รับสินค้า' },
                  ]}
                />
              </>
            )}

            <PdfFooter
              docType="purchase"
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

export default PrintPurchaseOrderTemplate;
