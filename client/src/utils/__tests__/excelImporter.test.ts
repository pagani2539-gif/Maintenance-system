import { describe, it, expect } from 'vitest';
import { parseInventoryFile } from '../excelImporter';

const escapeCell = (value: string | number) => {
  const text = String(value).replace(/"/g, '""');
  return /[",\n]/.test(text) ? `"${text}"` : text;
};

const createMockCsvFile = (headers: string[], dataRows: (string | number)[][]): File => {
  const csv = [headers, ...dataRows].map((row) => row.map(escapeCell).join(',')).join('\n');
  return new File([`\uFEFF${csv}`], 'test_inventory.csv', { type: 'text/csv' });
};

describe('excelImporter Utility', () => {
  it('should parse valid Thai/English inventory CSV files correctly', async () => {
    const file = createMockCsvFile(
      ['ชื่ออุปกรณ์', 'รุ่น/model', 'รายละเอียด', 'สถานที่เก็บ', 'จำนวนคงเหลือ', 'จุดเตือนสต็อกขั้นต่ำ', 'ต้องมี s/n'],
      [
        ['Router CISCO 2901', 'C2901-K9', 'Cisco Router, 2901', 'Warehouse A', 5, 2, 'yes'],
        ['Switch TP-Link 8 Port', 'SG1008D', 'TP-Link Gigabit Switch', 'Rack B', 12, 5, 'no'],
      ]
    );
    const result = await parseInventoryFile(file);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ name: 'Router CISCO 2901', description: 'Cisco Router, 2901', quantity: 5, min_stock: 2, requires_sn: 1 });
    expect(result.rows[1]).toMatchObject({ name: 'Switch TP-Link 8 Port', requires_sn: 0 });
  });

  it('should return an error if name column is missing', async () => {
    const result = await parseInventoryFile(createMockCsvFile(['รุ่น', 'จำนวน', 'ที่เก็บ'], [['Model X', 10, 'Loc Y']]));
    expect(result.rows).toHaveLength(0);
    expect(result.errors[0]).toContain('ไม่พบคอลัมน์ "ชื่ออุปกรณ์"');
  });

  it('should skip rows with an empty name', async () => {
    const result = await parseInventoryFile(createMockCsvFile(['ชื่ออุปกรณ์', 'รุ่น', 'จำนวน'], [['Device A', 'Model A', 3], ['', 'Model B', 4], ['Device C', 'Model C', 5]]));
    expect(result.rows).toHaveLength(2);
    expect(result.errors[0]).toContain('แถวที่ 3: ไม่มีชื่ออุปกรณ์');
  });

  it('should reject non-CSV and oversized files', async () => {
    const invalid = await parseInventoryFile(new File(['name'], 'inventory.xlsx'));
    const oversized = await parseInventoryFile(new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'too_large.csv'));
    expect(invalid.errors[0]).toContain('.csv');
    expect(oversized.errors[0]).toContain('เกิน 2MB');
  });

  it('should reject more than 1,000 inventory rows', async () => {
    const rows = Array.from({ length: 1001 }, (_, index) => [`Item ${index + 1}`, 1]);
    const result = await parseInventoryFile(createMockCsvFile(['ชื่ออุปกรณ์', 'จำนวน'], rows));
    expect(result.rows).toHaveLength(0);
    expect(result.errors[0]).toContain('สูงสุด 1000 แถว');
  });
});
