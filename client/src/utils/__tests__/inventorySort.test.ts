import { describe, expect, it } from 'vitest';
import type { InventoryItem } from '../../types';
import { compareInventoryItems } from '../inventorySort';

const makeItem = (id: number, name: string, model = ''): InventoryItem => ({
  id,
  name,
  model,
  quantity: 1,
  min_stock: 1,
  requires_sn: 0,
  created_at: '',
  updated_at: '',
});

const sortItems = (items: InventoryItem[], direction: 'asc' | 'desc' = 'asc') => (
  [...items].sort((left, right) => compareInventoryItems(left, right, direction))
);

describe('compareInventoryItems', () => {
  it('sorts numbers, Latin names, and Thai names in the standard order', () => {
    const items = [
      makeItem(1, 'สาย LAN'),
      makeItem(2, 'คอมพิวเตอร์'),
      makeItem(3, 'กล้อง'),
      makeItem(4, 'Adapter'),
      makeItem(5, '2-Way Switch'),
    ];

    expect(sortItems(items).map(item => item.name)).toEqual([
      '2-Way Switch',
      'Adapter',
      'กล้อง',
      'คอมพิวเตอร์',
      'สาย LAN',
    ]);
  });

  it('sorts English names case-insensitively and numbers naturally', () => {
    const items = [
      makeItem(1, 'cable 10m'),
      makeItem(2, 'Cable 2m'),
      makeItem(3, 'BATTERY'),
      makeItem(4, 'adapter'),
    ];

    expect(sortItems(items).map(item => item.name)).toEqual([
      'adapter',
      'BATTERY',
      'Cable 2m',
      'cable 10m',
    ]);
  });

  it('puts special-character and blank names last', () => {
    const items = [
      makeItem(1, ''),
      makeItem(2, '# Spare'),
      makeItem(3, 'Monitor'),
      makeItem(4, 'สาย HDMI'),
    ];

    expect(sortItems(items).map(item => item.name)).toEqual([
      'Monitor',
      'สาย HDMI',
      '# Spare',
      '',
    ]);
  });

  it('uses model and then newest ID to break ties', () => {
    const items = [
      makeItem(10, 'Switch', 'Model B'),
      makeItem(12, 'Switch', 'Model A'),
      makeItem(11, 'Switch', 'Model A'),
    ];

    expect(sortItems(items).map(item => item.id)).toEqual([12, 11, 10]);
  });

  it('reverses the name and model order while keeping duplicate rows deterministic', () => {
    const items = [
      makeItem(10, 'Switch', 'Model A'),
      makeItem(12, 'Adapter', 'Model A'),
      makeItem(11, 'Switch', 'Model B'),
    ];

    expect(sortItems(items, 'desc').map(item => item.id)).toEqual([11, 10, 12]);
  });
});
