import React from 'react';

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

/** หัวข้อโซนของ dashboard — รองรับ action ฝั่งขวา (เช่น ตัวกรองช่วงเวลา)
 *  เส้นคั่น ::after มี order 0 — action ใช้ order 1 เพื่อไปอยู่ท้ายสุด */
export const DashSectionHeader: React.FC<{
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}> = ({ icon, title, subtitle, action }) => (
  <div className="dash-section-title boot-animate">
    <span className="dash-section-icon">{icon}</span>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-main)', lineHeight: 1.3 }}>{title}</div>
      {subtitle && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>{subtitle}</div>}
    </div>
    {action && <div style={{ order: 1, flexShrink: 0 }}>{action}</div>}
  </div>
);

/** ป้ายบอกขอบเขตข้อมูล — แสดงบนการ์ดที่ "ไม่" ตอบสนองตัวกรองช่วงเวลา
 *  เฉพาะตอนที่ผู้ใช้เลือกกรองช่วงเวลาอยู่ เพื่อไม่ให้เข้าใจผิดว่าถูกกรองแล้ว */
export const ScopeBadge: React.FC<{ show: boolean; label?: string }> = ({ show, label = 'ข้อมูลทั้งหมด' }) => {
  if (!show) return null;
  return <span className="dash-scope-badge">{label}</span>;
};
