import type { InventoryItem } from '../types';

export type InventorySortDirection = 'asc' | 'desc';

const latinCollator = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
});

const thaiCollator = new Intl.Collator('th', {
  numeric: true,
  sensitivity: 'base',
});

const getSortGroup = (value: string): number => {
  const firstCharacter = value.trim().normalize('NFKC').charAt(0);

  if (!firstCharacter) return 4;
  if (/^[0-9]$/.test(firstCharacter)) return 0;
  if (/^[A-Za-z]$/.test(firstCharacter)) return 1;
  if (/^[\u0E00-\u0E7F]$/.test(firstCharacter)) return 2;
  return 3;
};

const compareInventoryText = (leftValue: string | undefined, rightValue: string | undefined): number => {
  const left = (leftValue || '').trim().normalize('NFKC');
  const right = (rightValue || '').trim().normalize('NFKC');
  const groupDifference = getSortGroup(left) - getSortGroup(right);

  if (groupDifference !== 0) return groupDifference;

  const collator = getSortGroup(left) === 2 ? thaiCollator : latinCollator;
  return collator.compare(left, right);
};

export const compareInventoryItems = (
  left: InventoryItem,
  right: InventoryItem,
  direction: InventorySortDirection = 'asc',
): number => {
  const directionMultiplier = direction === 'asc' ? 1 : -1;
  const nameDifference = compareInventoryText(left.name, right.name);

  if (nameDifference !== 0) return nameDifference * directionMultiplier;

  const modelDifference = compareInventoryText(left.model, right.model);
  if (modelDifference !== 0) return modelDifference * directionMultiplier;

  // Keep duplicate name/model rows deterministic and show the newest record first.
  return right.id - left.id;
};
