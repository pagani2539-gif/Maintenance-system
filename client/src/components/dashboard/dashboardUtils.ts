import type React from 'react';

/** เวลาแบบ relative ภาษาไทย (ย้ายมาจาก Dashboard.tsx) */
export const timeAgo = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return '';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'เมื่อสักครู่';
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ชม.ที่แล้ว`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} วันที่แล้ว`;
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
};

/** Tooltip กราฟแบบ flat (แทน glass tooltip เดิม — ไม่มี backdrop-filter) */
export const chartTooltipStyle: React.CSSProperties = {
  borderRadius: '10px',
  border: '1px solid var(--border)',
  boxShadow: 'var(--elevation-2)',
  background: 'var(--bg-card)',
  color: 'var(--text-main)',
  padding: '10px 14px'
};
