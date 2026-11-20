import { describe, expect, it } from 'vitest';
import { normalizeDashboardData } from '../dashboardData';

describe('normalizeDashboardData', () => {
  it('normalizes a camelCase v2 payload and numeric database values', () => {
    const result = normalizeDashboardData({
      kpis: { total: '12', inProgress: '3', criticalStock: '2' },
      inventory: {
        topUsed: [{ name: 'Router', count: '4' }],
        criticalItems: [{ name: 'Cable', quantity: '1', minStock: '5' }],
      },
      analysis: {
        monthlyTrend: [{ month: '2026-09', count: '7' }],
      },
      stockMovements: [{ month: '2026-09', added: '4', withdrawn: '2', borrowed: '1', returned: '1' }],
      people: {
        pendingReturnsCount: '2',
        pendingReturns: [{ name: 'ช่าง A', productName: 'Router', daysOut: '5' }],
      },
      purchaseOrders: { totalPo: '8', pendingPo: '2', receivedPo: '6' },
      inventoryConditions: [{ condition: 'Good', count: '10' }],
    });

    expect(result.kpis).toMatchObject({ total: 12, in_progress: 3, critical_stock: 2 });
    expect(result.inventory.topUsed).toEqual([{ name: 'Router', count: 4 }]);
    expect(result.inventory.criticalItems).toEqual([{ name: 'Cable', quantity: 1, min_stock: 5 }]);
    expect(result.analysis.monthlyTrend).toEqual([{ month: '2026-09', count: 7 }]);
    expect(result.stockMovements).toEqual([{ month: '2026-09', added: 4, withdrawn: 2, borrowed: 1, returned: 1 }]);
    expect(result.people.pendingReturns).toEqual([{ name: 'ช่าง A', product_name: 'Router', transaction_type: '', days_out: 5 }]);
    expect(result.people.pendingReturnsCount).toBe(2);
    expect(result.purchaseOrders).toEqual({ total_po: 8, pending_po: 2, received_po: 6 });
  });

  it('accepts the snake_case payload returned by the client interceptor', () => {
    const result = normalizeDashboardData({
      kpis: { in_progress: 4, critical_stock: 1 },
      inventory: {
        top_used: [{ name: 'Switch', count: 6 }],
        recent_transactions: [{ id: 10, product_name: 'Switch', transaction_type: 'WITHDRAW' }],
      },
      stock_movements: [{ month: '2026-08', added: 1, withdrawn: 3, borrowed: 0, returned: 2 }],
      people: { pending_returns_count: 1 },
      purchase_orders: { pending_po: 3 },
      inventory_conditions: [{ condition: 'Broken', count: 2 }],
    });

    expect(result.kpis).toMatchObject({ in_progress: 4, critical_stock: 1 });
    expect(result.inventory.topUsed).toEqual([{ name: 'Switch', count: 6 }]);
    expect(result.inventory.recentTransactions[0]).toMatchObject({
      id: 10,
      product_name: 'Switch',
      transaction_type: 'WITHDRAW',
    });
    expect(result.stockMovements[0]).toEqual({ month: '2026-08', added: 1, withdrawn: 3, borrowed: 0, returned: 2 });
    expect(result.people.pendingReturnsCount).toBe(1);
    expect(result.purchaseOrders.pending_po).toBe(3);
    expect(result.inventoryConditions).toEqual([{ condition: 'Broken', count: 2 }]);
  });

  it('returns safe defaults for null, missing, and malformed collections', () => {
    const result = normalizeDashboardData({
      kpis: null,
      inventory: { topUsed: 'not-an-array', recentTransactions: null },
      analysis: { monthlyTrend: {} },
      stockMovements: null,
      people: { pendingReturns: null },
      purchaseOrders: { pendingPo: 'not-a-number' },
      inventoryConditions: 42,
    });

    expect(result.stockMovements).toEqual([]);
    expect(result.inventory.topUsed).toEqual([]);
    expect(result.inventory.recentTransactions).toEqual([]);
    expect(result.analysis.monthlyTrend).toEqual([]);
    expect(result.people.pendingReturns).toEqual([]);
    expect(result.people.pendingReturnsCount).toBe(0);
    expect(result.purchaseOrders.pending_po).toBe(0);
    expect(result.inventoryConditions).toEqual([]);
    expect(result.kpis.critical_stock).toBe(0);
  });

  it('never exposes undefined dashboard collections for an empty response', () => {
    const result = normalizeDashboardData(null);

    expect(result.recentJobs).toEqual([]);
    expect(result.recentLogs).toEqual([]);
    expect(result.technicians).toEqual([]);
    expect(result.inventory).toMatchObject({
      topUsed: [],
      leastUsed: [],
      criticalItems: [],
      recentTransactions: [],
      recentWithdrawals: [],
    });
    expect(result.analysis).toMatchObject({ mostBroken: [], overdue: [], monthlyTrend: [] });
    expect(result.withdrawalBreakdown).toEqual([]);
    expect(result.stockMovements).toEqual([]);
    expect(result.people).toMatchObject({ topRecipients: [], pendingReturns: [] });
    expect(result.supervisors).toEqual([]);
    expect(result.claimsKpis).toEqual({ total: 0, pending: 0, in_progress: 0, completed: 0 });
  });
});
