import * as XLSX from 'xlsx';

export interface ParsedInventoryRow {
  name: string;
  model: string;
  description: string;
  storage_location: string;
  quantity: number;
  min_stock: number;
  requires_sn: number;
}

export interface ParseResult {
  rows: ParsedInventoryRow[];
  errors: string[];
}

/** Maps a normalized (lowercased, trimmed) header to a logical field. */
const HEADER_ALIASES: Record<string, keyof ParsedInventoryRow> = {
  'ชื่ออุปกรณ์': 'name', 'ชื่อ': 'name', 'name': 'name',
  'รุ่น/model': 'model', 'รุ่น / แบรนด์': 'model', 'รุ่น/แบรนด์': 'model', 'รุ่น': 'model', 'แบรนด์': 'model', 'model': 'model',
  'คำอธิบาย': 'description', 'รายละเอียด': 'description', 'รายละเอียดเพิ่มเติม': 'description', 'description': 'description',
  'ที่เก็บอุปกรณ์': 'storage_location', 'สถานที่เก็บอุปกรณ์': 'storage_location', 'สถานที่เก็บ': 'storage_location', 'ที่เก็บ': 'storage_location', 'storage_location': 'storage_location', 'location': 'storage_location',
  'จำนวนคงเหลือ': 'quantity', 'จำนวน': 'quantity', 'quantity': 'quantity', 'qty': 'quantity',
  'จุดเตือนสต็อกขั้นต่ำ': 'min_stock', 'จุดแจ้งเตือนขั้นต่ำ': 'min_stock', 'จุดแจ้งเตือน': 'min_stock', 'min_stock': 'min_stock',
  'ต้องมี s/n': 'requires_sn', 'ต้องระบุ s/n': 'requires_sn', 's/n': 'requires_sn', 'requires_sn': 'requires_sn',
};

const normalizeHeader = (h: string): string => String(h || '').trim().toLowerCase().replace(/\s+/g, ' ');

const parseRequiresSn = (val: unknown): number => {
  if (val === undefined || val === null || val === '') return 1;
  const s = String(val).trim().toLowerCase();
  if (['ไม่', 'ไม่ใช่', 'no', 'n', 'false', '0'].includes(s)) return 0;
  return 1;
};

const parseIntSafe = (val: unknown, fallback: number): number => {
  const n = parseInt(String(val ?? '').replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
};

/**
 * Parses an uploaded .xlsx / .xls / .csv file into inventory rows.
 * Header matching is case/space-insensitive and supports Thai or English column names.
 */
export const parseInventoryFile = async (file: File): Promise<ParseResult> => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { rows: [], errors: ['ไม่พบชีตข้อมูลในไฟล์'] };

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
  if (matrix.length < 2) return { rows: [], errors: ['ไฟล์ไม่มีข้อมูล (ต้องมีหัวตารางและอย่างน้อย 1 แถว)'] };

  const headerRow = matrix[0] as unknown[];
  const colMap: Record<number, keyof ParsedInventoryRow> = {};
  headerRow.forEach((h, idx) => {
    const field = HEADER_ALIASES[normalizeHeader(String(h))];
    if (field) colMap[idx] = field;
  });

  const mappedFields = Object.values(colMap);
  if (!mappedFields.includes('name')) {
    return { rows: [], errors: ['ไม่พบคอลัมน์ "ชื่ออุปกรณ์" ในไฟล์ กรุณาใช้เทมเพลตที่กำหนด'] };
  }

  const rows: ParsedInventoryRow[] = [];
  const errors: string[] = [];

  for (let r = 1; r < matrix.length; r++) {
    const cells = matrix[r] as unknown[];
    if (!cells || cells.every(c => c === undefined || c === null || String(c).trim() === '')) continue;

    const record: Record<string, unknown> = {};
    Object.entries(colMap).forEach(([colIdx, field]) => {
      record[field] = cells[Number(colIdx)];
    });

    const name = String(record.name ?? '').trim();
    if (!name) {
      errors.push(`แถวที่ ${r + 1}: ไม่มีชื่ออุปกรณ์ (ข้าม)`);
      continue;
    }

    rows.push({
      name,
      model: String(record.model ?? '').trim(),
      description: String(record.description ?? '').trim(),
      storage_location: String(record.storage_location ?? '').trim(),
      quantity: parseIntSafe(record.quantity, 0),
      min_stock: parseIntSafe(record.min_stock, 10),
      requires_sn: parseRequiresSn(record.requires_sn),
    });
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push('ไม่พบข้อมูลที่นำเข้าได้');
  }

  return { rows, errors };
};
