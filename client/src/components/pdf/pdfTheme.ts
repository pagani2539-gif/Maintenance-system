/**
 * PDF Design Tokens — Corporate Formal Style
 *
 * Unified visual language for all printable documents.
 * Each document type has the same base layout but a unique accent color
 * to make it instantly recognizable while maintaining brand consistency.
 */

export const pdfTheme = {
  // ─── Brand / Base ─────────────────────────────────────────
  colors: {
    primary: '#29b6f6',      // Sky blue operations
    text: '#0f172a',         // Near-black (body text)
    textMuted: '#475569',    // Slate gray (labels, secondary info)
    textLight: '#94a3b8',    // Light gray (footnotes)
    border: '#cbd5e1',       // Soft border for cells/dividers
    borderStrong: '#94a3b8', // Strong border for major separators
    bgPage: '#ffffff',       // Paper background
    bgSubtle: '#f8fafc',     // Subtle band (table headers, info strips)
    bgAccent: '#f1f5f9',     // Slightly stronger band
  },

  // ─── Per-doc accent stripes ──────────────────────────────
  accents: {
    withdrawal: '#0284c7',   // Sky (เบิก)
    return: '#7c3aed',       // Violet (คืน)
    claim: '#dc2626',         // Crimson (เคลม)
    repair: '#059669',        // Emerald (ซ่อม)
    purchase: '#ea580c',      // Tangerine (สั่งซื้อ)
  },

  // ─── Typography ──────────────────────────────────────────
  fonts: {
    body: "'Anuphan', 'Noto Sans Thai', -apple-system, sans-serif",
    mono: "'Anuphan', 'Noto Sans Thai', -apple-system, sans-serif",
  },

  // ─── Font sizes (px) ─────────────────────────────────────
  size: {
    docTitle: 20,    // "ใบเบิกอุปกรณ์"
    docSubtitle: 11, // "Withdrawal Slip"
    h2: 11,          // Section heading
    h3: 10,          // Sub-heading
    body: 10,        // Body text
    small: 9,        // Captions
    micro: 8,        // Footer / mini labels
    docNumber: 13,   // "WD-000019"
  },

  // ─── Spacing (px) ────────────────────────────────────────
  space: {
    pagePadding: 24, // ~8mm equivalent in 96dpi
    sectionGap: 12,
    blockGap: 8,
    cellGap: 5,
  },

  // ─── Border weights ──────────────────────────────────────
  border: {
    light: '1px solid #e2e8f0',
    base: '1px solid #cbd5e1',
    strong: '2px solid #475569',
    accent: '3px solid',
  },

  // ─── Border radius ───────────────────────────────────────
  radius: {
    sm: '3px',
    md: '5px',
    lg: '8px',
  },
} as const;

export type DocType = 'withdrawal' | 'return' | 'claim' | 'repair' | 'purchase';

export const docLabels: Record<DocType, { th: string; en: string; prefix: string }> = {
  withdrawal: { th: 'ใบเบิกอุปกรณ์', en: 'Equipment Withdrawal Slip', prefix: 'WD' },
  return:     { th: 'ใบคืนอุปกรณ์',  en: 'Equipment Return Slip',     prefix: 'RT' },
  claim:      { th: 'ใบแจ้งเคลม',     en: 'Claim / Warranty Notice',    prefix: 'CL' },
  repair:     { th: 'ใบแจ้งซ่อม',     en: 'Repair Request Order',       prefix: 'RP' },
  purchase:   { th: 'ใบสั่งซื้อ',       en: 'Purchase Order',             prefix: 'PO' },
};
