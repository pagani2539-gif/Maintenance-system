import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseInventoryFile } from '../excelImporter';

// Helper to create a Mock File for testing XLSX parser
const createMockExcelFile = (headers: string[], dataRows: (string | number)[][]): File => {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  return new File([blob], 'test_inventory.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

describe('excelImporter Utility', () => {
  it('should parse valid Thai/English inventory excel files correctly', async () => {
    const headers = ['ชื่ออุปกรณ์', 'รุ่น/model', 'รายละเอียด', 'สถานที่เก็บ', 'จำนวนคงเหลือ', 'จุดเตือนสต็อกขั้นต่ำ', 'ต้องมี s/n'];
    const rows = [
      ['Router CISCO 2901', 'C2901-K9', 'Cisco Router 2901', 'Warehouse A', 5, 2, 'yes'],
      ['Switch TP-Link 8 Port', 'SG1008D', 'TP-Link Gigabit Switch', 'Rack B', 12, 5, 'no']
    ];

    const file = createMockExcelFile(headers, rows);
    const result = await parseInventoryFile(file);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(2);

    // Assert Router properties
    expect(result.rows[0].name).toBe('Router CISCO 2901');
    expect(result.rows[0].model).toBe('C2901-K9');
    expect(result.rows[0].description).toBe('Cisco Router 2901');
    expect(result.rows[0].storage_location).toBe('Warehouse A');
    expect(result.rows[0].quantity).toBe(5);
    expect(result.rows[0].min_stock).toBe(2);
    expect(result.rows[0].requires_sn).toBe(1); // 'yes' -> 1

    // Assert Switch properties
    expect(result.rows[1].name).toBe('Switch TP-Link 8 Port');
    expect(result.rows[1].model).toBe('SG1008D');
    expect(result.rows[1].requires_sn).toBe(0); // 'no' -> 0
  });

  it('should return error if name column is missing', async () => {
    const headers = ['รุ่น', 'จำนวน', 'ที่เก็บ'];
    const rows = [['Model X', 10, 'Loc Y']];
    const file = createMockExcelFile(headers, rows);
    const result = await parseInventoryFile(file);

    expect(result.rows).toHaveLength(0);
    expect(result.errors).toContain('ไม่พบคอลัมน์ "ชื่ออุปกรณ์" ในไฟล์ กรุณาใช้เทมเพลตที่กำหนด');
  });

  it('should skip rows with empty name', async () => {
    const headers = ['ชื่ออุปกรณ์', 'รุ่น', 'จำนวน'];
    const rows = [
      ['Device A', 'Model A', 3],
      ['', 'Model B', 4], // empty name row
      ['Device C', 'Model C', 5]
    ];
    const file = createMockExcelFile(headers, rows);
    const result = await parseInventoryFile(file);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].name).toBe('Device A');
    expect(result.rows[1].name).toBe('Device C');
    expect(result.errors[0]).toContain('แถวที่ 3: ไม่มีชื่ออุปกรณ์ (ข้าม)');
  });
});
