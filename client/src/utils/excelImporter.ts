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

const HEADER_ALIASES: Record<string, keyof ParsedInventoryRow> = {
  'ชื่ออุปกรณ์': 'name', 'ชื่อ': 'name', 'name': 'name',
  'รุ่น/model': 'model', 'รุ่น / แบรนด์': 'model', 'รุ่น/แบรนด์': 'model', 'รุ่น': 'model', 'แบรนด์': 'model', 'model': 'model',
  'คำอธิบาย': 'description', 'รายละเอียด': 'description', 'รายละเอียดเพิ่มเติม': 'description', 'description': 'description',
  'ที่เก็บอุปกรณ์': 'storage_location', 'สถานที่เก็บอุปกรณ์': 'storage_location', 'สถานที่เก็บ': 'storage_location', 'ที่เก็บ': 'storage_location', 'storage_location': 'storage_location', 'location': 'storage_location',
  'จำนวนคงเหลือ': 'quantity', 'จำนวน': 'quantity', 'quantity': 'quantity', 'qty': 'quantity',
  'จุดเตือนสต็อกขั้นต่ำ': 'min_stock', 'จุดแจ้งเตือนขั้นต่ำ': 'min_stock', 'จุดแจ้งเตือน': 'min_stock', 'min_stock': 'min_stock',
  'ต้องมี s/n': 'requires_sn', 'ต้องระบุ s/n': 'requires_sn', 's/n': 'requires_sn', 'requires_sn': 'requires_sn',
};

const MAX_IMPORT_FILE_SIZE = 2 * 1024 * 1024;
const MAX_IMPORT_ROWS = 1000;
const MAX_IMPORT_COLUMNS = 32;
const MAX_FIELD_LENGTH = 500;

const normalizeHeader = (header: string): string => String(header || '').trim().toLowerCase().replace(/\s+/g, ' ');

const parseRequiresSn = (value: unknown): number => {
  if (value === undefined || value === null || value === '') return 1;
  return ['ไม่', 'ไม่ใช่', 'no', 'n', 'false', '0'].includes(String(value).trim().toLowerCase()) ? 0 : 1;
};

const parseIntSafe = (value: unknown, fallback: number): number => {
  const parsed = parseInt(String(value ?? '').replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
};

const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  const finishRow = () => {
    row.push(cell);
    rows.push(row);
    if (rows.length > MAX_IMPORT_ROWS + 1) {
      throw new Error(`นำเข้าได้สูงสุด ${MAX_IMPORT_ROWS} แถวต่อครั้ง`);
    }
    row = [];
    cell = '';
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inQuotes) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"') {
      inQuotes = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n') {
      finishRow();
    } else if (character !== '\r') {
      cell += character;
    }
  }

  if (inQuotes) throw new Error('ไฟล์ CSV มีเครื่องหมายอัญประกาศไม่ครบคู่');
  if (cell !== '' || row.length > 0) finishRow();
  return rows;
};

/** Parses a bounded UTF-8 CSV inventory file. */
export const parseInventoryFile = async (file: File): Promise<ParseResult> => {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    return { rows: [], errors: ['รองรับเฉพาะไฟล์ .csv เท่านั้น'] };
  }
  if (file.size === 0) return { rows: [], errors: ['ไฟล์ว่างเปล่า'] };
  if (file.size > MAX_IMPORT_FILE_SIZE) {
    return { rows: [], errors: ['ไฟล์มีขนาดเกิน 2MB กรุณาแบ่งไฟล์ก่อนนำเข้า'] };
  }

  let matrix: string[][];
  try {
    matrix = parseCsv((await file.text()).replace(/^\uFEFF/, ''));
  } catch (error) {
    return { rows: [], errors: [error instanceof Error ? error.message : 'ไม่สามารถอ่านไฟล์ CSV ได้'] };
  }

  if (matrix.length < 2) return { rows: [], errors: ['ไฟล์ไม่มีข้อมูล (ต้องมีหัวตารางและอย่างน้อย 1 แถว)'] };
  const headerRow = matrix[0];
  if (headerRow.length > MAX_IMPORT_COLUMNS) {
    return { rows: [], errors: [`ไฟล์มีจำนวนคอลัมน์เกิน ${MAX_IMPORT_COLUMNS} คอลัมน์`] };
  }

  const colMap: Record<number, keyof ParsedInventoryRow> = Object.create(null);
  headerRow.forEach((header, index) => {
    const field = HEADER_ALIASES[normalizeHeader(header)];
    if (field) colMap[index] = field;
  });
  if (!Object.values(colMap).includes('name')) {
    return { rows: [], errors: ['ไม่พบคอลัมน์ "ชื่ออุปกรณ์" ในไฟล์ กรุณาใช้เทมเพลตที่กำหนด'] };
  }

  const rows: ParsedInventoryRow[] = [];
  const errors: string[] = [];
  for (let index = 1; index < matrix.length; index += 1) {
    const cells = matrix[index];
    if (cells.every((cell) => cell.trim() === '')) continue;

    const record: Record<string, string> = Object.create(null);
    Object.entries(colMap).forEach(([columnIndex, field]) => {
      record[field] = cells[Number(columnIndex)] || '';
    });
    if (Object.values(record).some((value) => value.length > MAX_FIELD_LENGTH)) {
      errors.push(`แถวที่ ${index + 1}: ข้อมูลในช่องยาวเกิน ${MAX_FIELD_LENGTH} ตัวอักษร (ข้าม)`);
      continue;
    }

    const name = record.name.trim();
    if (!name) {
      errors.push(`แถวที่ ${index + 1}: ไม่มีชื่ออุปกรณ์ (ข้าม)`);
      continue;
    }
    rows.push({
      name,
      model: (record.model || '').trim(),
      description: (record.description || '').trim(),
      storage_location: (record.storage_location || '').trim(),
      quantity: parseIntSafe(record.quantity, 0),
      min_stock: parseIntSafe(record.min_stock, 10),
      requires_sn: parseRequiresSn(record.requires_sn),
    });
  }

  if (rows.length === 0 && errors.length === 0) errors.push('ไม่พบข้อมูลที่นำเข้าได้');
  return { rows, errors };
};
