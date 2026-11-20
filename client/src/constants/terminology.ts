/**
 * Canonical user-facing terminology.
 *
 * Keep API fields, database values, and persisted status codes unchanged;
 * these values are only for labels, headings, exports, and notifications.
 */
export const UI_TERMS = {
  equipment: 'อุปกรณ์',
  equipmentWarehouse: 'คลังอุปกรณ์',
  equipmentList: 'รายการอุปกรณ์',
  equipmentBalance: 'ยอดคงเหลือ',
  minimumAlert: 'เกณฑ์แจ้งเตือนขั้นต่ำ',
  movement: 'รายการเคลื่อนไหว',
  movementHistory: 'ประวัติการเคลื่อนไหว',
  serialNumber: 'หมายเลขเครื่อง (S/N)',
  model: 'รุ่น (Model)',
  installedEquipment: 'อุปกรณ์ติดตั้ง',
  stationEquipment: 'อุปกรณ์ประจำสถานี',
  technicianEquipment: 'อุปกรณ์ประจำตัวช่าง',
  equipmentCondition: 'สภาพอุปกรณ์',
} as const;

/** Translate persisted repair/claim status values at the UI boundary only. */
export const getRepairStatusLabel = (status: string): string => (
  status === 'รออะไหล่' ? 'รออุปกรณ์' : status
);

export const translateRepairStatusText = (text: string): string => (
  String(text || '').replaceAll('รออะไหล่', 'รออุปกรณ์')
);
