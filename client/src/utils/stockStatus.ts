// Single source of truth for inventory stock-status classification.
// Server-side SQL in server/controllers/inventory.js (getStats) must mirror this logic exactly:
//   qty = 0                    -> หมดสต๊อก
//   0 < qty <= min_stock        -> วิกฤต
//   min_stock < qty <= min*2    -> ใกล้หมด
//   qty > min_stock * 2         -> พร้อมใช้งาน
// If these thresholds ever change, update both places.

export type StockStatus = 'หมดสต๊อก' | 'วิกฤต' | 'ใกล้หมด' | 'พร้อมใช้งาน';

export const getStockStatus = (quantity: number, minStock: number): StockStatus => {
  const min = Math.max(1, minStock || 1); // guard against min_stock of 0/undefined
  if (quantity <= 0) return 'หมดสต๊อก';
  if (quantity <= min) return 'วิกฤต';
  if (quantity <= min * 2) return 'ใกล้หมด';
  return 'พร้อมใช้งาน';
};

export const STOCK_STATUS_OPTIONS: StockStatus[] = ['หมดสต๊อก', 'วิกฤต', 'ใกล้หมด', 'พร้อมใช้งาน'];
