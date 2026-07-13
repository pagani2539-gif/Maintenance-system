import React from 'react';

interface StationCellProps {
  stationName?: string | null;
  areaName?: string | null;
  province?: string | null;
  fallbackLocation?: string | null;
  locationSnapshot?: string | null;
  // compact = true สำหรับ table cell, false สำหรับ card (ขนาดใหญ่ขึ้นเล็กน้อย)
  compact?: boolean;
}

const StationCell: React.FC<StationCellProps> = ({
  stationName,
  areaName,
  province,
  fallbackLocation,
  locationSnapshot,
  compact = false,
}) => {
  const nameSize = compact ? 'var(--table-text-size)' : '0.9rem';
  const subSize = compact ? 'var(--table-secondary-size)' : '0.8rem';

  if (stationName) {
    const formattedProvince = province
      ? province.startsWith('จังหวัด') ? province : `จังหวัด${province}`
      : null;

    let displayAreaName = areaName;
    if (!displayAreaName && locationSnapshot && locationSnapshot.startsWith(stationName)) {
      const suffix = locationSnapshot.slice(stationName.length).trim();
      if (suffix.startsWith('-')) {
        displayAreaName = suffix.slice(1).trim();
      }
    }

    const secondaryText = [displayAreaName, formattedProvince].filter(Boolean).join(' - ');

    return (
      <div className="station-cell" style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
        <span
          className="station-cell-name line-clamp-1"
          title={stationName}
          style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: nameSize, lineHeight: 1.2 }}
        >
          {stationName}
        </span>
        {secondaryText && (
          <span
            className="station-cell-sub line-clamp-1"
            title={secondaryText}
            style={{ fontSize: subSize, fontWeight: compact ? 'var(--table-secondary-weight)' : 500, color: 'var(--text-muted)', lineHeight: 1.2 }}
          >
            {secondaryText}
          </span>
        )}
      </div>
    );
  }

  // fallback: ใช้ location text หรือ placeholder
  const displayText = fallbackLocation || '(ไม่ระบุสถานี)';
  return (
    <div className="station-cell" style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
      <span
        className="station-cell-name line-clamp-1"
        title={displayText}
        style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: nameSize, lineHeight: 1.2 }}
      >
        {displayText}
      </span>
    </div>
  );
};

export default StationCell;
