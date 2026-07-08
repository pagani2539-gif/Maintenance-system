import React from 'react';

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
