import React, { useState, useRef, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface DatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}

const DatePicker: React.FC<DatePickerProps> = ({ value, onChange, placeholder = 'เลือกวันที่', style }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse value to Date object for the calendar view if it's a valid string
  useEffect(() => {
    if (value) {
      const dateValue = new Date(value);
      if (!isNaN(dateValue.getTime())) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCurrentMonth(new Date(dateValue.getFullYear(), dateValue.getMonth(), 1));
      }
    }
  }, [value]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const startDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const handleDateSelect = (day: number) => {
    const selected = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    const offset = selected.getTimezoneOffset() * 60000;
    const formatted = new Date(selected.getTime() - offset).toISOString().split('T')[0];
    onChange(formatted);
    setIsOpen(false);
  };

  const formatDateThai = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const monthsThai = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];

  const days = Array.from({ length: daysInMonth(currentMonth.getFullYear(), currentMonth.getMonth()) }, (_, i) => i + 1);
  const padding = Array.from({ length: startDayOfMonth(currentMonth.getFullYear(), currentMonth.getMonth()) }, (_, i) => i);

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block', ...style }}>
      {/* Trigger Button */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '8px 14px',
          background: 'var(--bg-card)',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          cursor: 'pointer',
          color: value ? 'var(--text-main)' : 'var(--text-muted)',
          fontSize: '0.85rem',
          fontWeight: 600,
          transition: 'all 0.2s',
          minWidth: '150px',
          userSelect: 'none'
        }}
      >
        <CalendarIcon size={16} color={value ? 'var(--primary)' : 'var(--text-muted)'} />
        <span style={{ flex: 1 }}>{value ? formatDateThai(value) : placeholder}</span>
        {value && (
          <X 
            size={14} 
            color="var(--text-muted)" 
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            style={{ cursor: 'pointer' }}
          />
        )}
      </div>

      {/* Calendar Dropdown */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          left: 0,
          zIndex: 9999,
          background: 'var(--bg-card)',
          borderRadius: '20px',
          padding: '1.25rem',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--border)',
          width: '280px',
          animation: 'revealUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) both'
        }}>
          {/* Calendar Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <button
              type="button"
              onClick={handlePrevMonth}
              style={{
                background: 'var(--bg-app)',
                border: 'none',
                borderRadius: '10px',
                padding: '6px',
                cursor: 'pointer',
                display: 'flex',
                color: 'var(--text-muted)'
              }}
            >
              <ChevronLeft size={18} />
            </button>
            <div style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '0.95rem' }}>
              {monthsThai[currentMonth.getMonth()]} {currentMonth.getFullYear() + 543}
            </div>
            <button
              type="button"
              onClick={handleNextMonth}
              style={{
                background: 'var(--bg-app)',
                border: 'none',
                borderRadius: '10px',
                padding: '6px',
                cursor: 'pointer',
                display: 'flex',
                color: 'var(--text-muted)'
              }}
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Days of Week */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '8px' }}>
            {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map(day => (
              <div key={day} style={{ textAlign: 'center', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', padding: '4px 0' }}>
                {day}
              </div>
            ))}
          </div>

          {/* Dates Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
            {padding.map(i => <div key={`pad-${i}`} />)}
            {days.map(day => {
              const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isSelected = value === dateStr;
              const isToday = new Date().toISOString().split('T')[0] === dateStr;

              return (
                <div 
                  key={day}
                  onClick={() => handleDateSelect(day)}
                  style={{
                    textAlign: 'center',
                    padding: '8px 0',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    borderRadius: '10px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    background: isSelected ? 'var(--primary)' : 'transparent',
                    color: isSelected ? '#ffffff' : isToday ? 'var(--primary)' : 'var(--text-main)',
                    border: isToday && !isSelected ? '1px solid var(--primary)' : '1px solid transparent',
                  }}
                  onMouseOver={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'var(--primary-light)';
                      e.currentTarget.style.color = 'var(--primary)';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = isToday ? 'var(--primary)' : 'var(--text-main)';
                    }
                  }}
                >
                  {day}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Animation Styles */}
      <style>{`
        @keyframes revealUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default DatePicker;
