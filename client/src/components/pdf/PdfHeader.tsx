import React from 'react';
import { UPLOAD_URL } from '../../api';
import type { Company, CompanyLogo } from '../../types';
import { pdfTheme, docLabels, type DocType } from './pdfTheme';
import { Wrench, ShieldCheck, Package, RotateCcw, ShoppingCart } from 'lucide-react';

interface Props {
  docType: DocType;
  docNumber: string;       // e.g. "WD-000019"
  docDate: string;         // formatted date string
  company: Company | null;
  logo: CompanyLogo | null;
  statusBadge?: { label: string; tone?: 'success' | 'warning' | 'danger' | 'neutral' };
  /** Show the corporate company block (logo + name + address). Default true. Set false for repair/claim/withdrawal forms. */
  showCompany?: boolean;
  titleTh?: string;
  titleEn?: string;
}

/**
 * Corporate document header.
 *
 *  ┌──────────────────────────────────────────────────────┐
 *  │ [LOGO]  COMPANY NAME (TH)         │  DOC TITLE        │
 *  │         Company Name (EN)          │  ──────────       │
 *  │         Address line 1             │  No.  WD-000019   │
 *  │         Tel · Email · Tax ID       │  Date 8 มิ.ย. 2569 │
 *  ├──────────────────────────────────────────────────────┤
 *  │       <<accent stripe>>                              │
 *  └──────────────────────────────────────────────────────┘
 */
export const PdfHeader: React.FC<Props> = ({ docType, docNumber, docDate, company, logo, statusBadge, showCompany, titleTh, titleEn }) => {
  const labels = docLabels[docType];
  const accentColor = pdfTheme.accents[docType];
  const shouldShowCompany = showCompany !== undefined ? showCompany : (company !== null);

  const getSoftTint = (type: DocType): string => {
    switch (type) {
      case 'withdrawal': return '#f0f9ff';
      case 'return':     return '#f5f3ff';
      case 'claim':      return '#fef2f2';
      case 'repair':     return '#ecfdf5';
      case 'purchase':   return '#fff7ed';
      default:           return '#f8fafc';
    }
  };

  const toneColors = {
    success: { bg: '#d1fae5', text: '#065f46' },
    warning: { bg: '#fef3c7', text: '#78350f' },
    danger:  { bg: '#fee2e2', text: '#7f1d1d' },
    neutral: { bg: pdfTheme.colors.bgAccent, text: pdfTheme.colors.textMuted },
  };
  const badgeColors = statusBadge ? toneColors[statusBadge.tone || 'neutral'] : null;

  return (
    <header style={{ marginBottom: pdfTheme.space.sectionGap }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.2fr 1fr',
        gap: `${pdfTheme.space.sectionGap}px`,
        alignItems: 'center',
      }}>
        {/* ─── Left Column: Company Info (Detailed or Mini) ─── */}
        {!shouldShowCompany ? (
          <div style={{ display: 'flex', gap: '11px', alignItems: 'center', fontFamily: pdfTheme.fonts.body }}>
            <div style={{
              width: '54px',
              height: '54px',
              flexShrink: 0,
              borderRadius: pdfTheme.radius.lg,
              background: `linear-gradient(135deg, ${accentColor} 0%, ${pdfTheme.colors.primary} 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {docType === 'repair' && <Wrench size={26} color="#ffffff" strokeWidth={2.2} />}
              {docType === 'claim' && <ShieldCheck size={26} color="#ffffff" strokeWidth={2.2} />}
              {docType === 'withdrawal' && <Package size={26} color="#ffffff" strokeWidth={2.2} />}
              {docType === 'return' && <RotateCcw size={26} color="#ffffff" strokeWidth={2.2} />}
              {docType === 'purchase' && <ShoppingCart size={26} color="#ffffff" strokeWidth={2.2} />}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{
                fontSize: `${pdfTheme.size.h2}px`,
                fontWeight: 800,
                color: pdfTheme.colors.primary,
                lineHeight: 1.15,
                letterSpacing: '0.01em',
              }}>
                ระบบบริหารจัดการงานซ่อมบำรุงและพัสดุอุปกรณ์
              </div>
              <div style={{
                fontSize: `${pdfTheme.size.micro}px`,
                color: pdfTheme.colors.textMuted,
                fontWeight: 600,
                marginTop: '2px',
                letterSpacing: '0.05em',
              }}>
                REPAIR & INVENTORY MANAGEMENT SYSTEM
              </div>
              <div style={{
                marginTop: '4px',
                paddingTop: '3px',
                borderTop: `1px solid ${pdfTheme.colors.border}`,
                fontSize: '7.5px',
                color: pdfTheme.colors.textLight,
                fontWeight: 600,
                letterSpacing: '0.04em',
              }}>
                เอกสารทางการของระบบ · OFFICIAL SYSTEM DOCUMENT
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            {logo && (
              <div style={{
                width: '56px',
                height: '56px',
                flexShrink: 0,
                border: pdfTheme.border.light,
                borderRadius: pdfTheme.radius.md,
                padding: '3px',
                background: pdfTheme.colors.bgPage,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <img
                  src={`${UPLOAD_URL}/uploads/${logo.file_path}`}
                  alt=""
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  crossOrigin="anonymous"
                />
              </div>
            )}

            <div style={{ flex: 1, fontFamily: pdfTheme.fonts.body, color: pdfTheme.colors.text }}>
              <div style={{
                fontSize: `${pdfTheme.size.h2}px`,
                fontWeight: 800,
                lineHeight: 1.2,
                letterSpacing: '-0.01em',
              }}>
                {company?.name_th || 'บริษัทของคุณ'}
              </div>
              {company?.name_en && (
                <div style={{
                  fontSize: `${pdfTheme.size.micro}px`,
                  color: pdfTheme.colors.textMuted,
                  fontWeight: 500,
                  marginTop: '1px',
                }}>
                  {company.name_en}
                </div>
              )}
              {company?.address && (
                <div style={{
                  fontSize: `${pdfTheme.size.micro}px`,
                  color: pdfTheme.colors.textMuted,
                  marginTop: '3px',
                  lineHeight: 1.3,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '300px',
                }}>
                  {company.address}
                </div>
              )}
              <div style={{
                fontSize: `${pdfTheme.size.micro}px`,
                color: pdfTheme.colors.textLight,
                marginTop: '2px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px',
              }}>
                {company?.phone && <span>โทร. {company.phone}</span>}
                {company?.email && <span>· {company.email}</span>}
                {company?.tax_id && <span>· เลขผู้เสียภาษี {company.tax_id}</span>}
              </div>
            </div>
          </div>
        )}

        {/* ─── Right Column: Document Metadata ─── */}
        <div style={{
          border: `1px solid ${accentColor}25`,
          borderRadius: pdfTheme.radius.md,
          padding: '8px 12px',
          background: getSoftTint(docType),
          fontFamily: pdfTheme.fonts.body,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
        }}>
          <div>
            <div style={{
              fontSize: `${pdfTheme.size.h2}px`,
              fontWeight: 800,
              color: pdfTheme.colors.text,
              lineHeight: 1.1,
            }}>
              {titleTh || labels.th}
            </div>
            <div style={{
              fontSize: `${pdfTheme.size.micro}px`,
              fontWeight: 500,
              color: pdfTheme.colors.textMuted,
              marginTop: '1px',
            }}>
              {titleEn || labels.en}
            </div>
            <div style={{
              marginTop: '4px',
              display: 'flex',
              gap: '10px',
              fontSize: `${pdfTheme.size.small}px`,
            }}>
              <span style={{ color: pdfTheme.colors.textMuted }}>
                เลขที่: <strong style={{ fontFamily: pdfTheme.fonts.mono, color: accentColor }}>{docNumber}</strong>
              </span>
              <span style={{ color: pdfTheme.colors.textMuted }}>
                วันที่: <strong style={{ color: pdfTheme.colors.text }}>{docDate}</strong>
              </span>
            </div>
          </div>

          {statusBadge && badgeColors && (
            <div style={{
              padding: '4px 8px',
              borderRadius: pdfTheme.radius.sm,
              background: badgeColors.bg,
              color: badgeColors.text,
              fontWeight: 700,
              fontSize: `${pdfTheme.size.micro}px`,
              textAlign: 'center',
              alignSelf: 'center',
            }}>
              {statusBadge.label}
            </div>
          )}
        </div>
      </div>

      {/* ─── Accent Stripe ─── */}
      <div style={{
        height: '3px',
        background: `linear-gradient(90deg, ${accentColor} 0%, ${accentColor} 70%, ${pdfTheme.colors.primary} 100%)`,
        marginTop: '8px',
        borderRadius: pdfTheme.radius.sm,
      }} />
    </header>
  );
};

export default PdfHeader;
