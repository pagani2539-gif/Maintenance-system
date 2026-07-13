import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, X } from 'lucide-react';

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  includeTime?: boolean;
}

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];
const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

const pad = (value: number) => String(value).padStart(2, '0');
const dateToValue = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseDate = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  placeholder = 'เลือกวันที่',
  className = '',
  style,
  disabled = false,
  includeTime = false,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const initialDate = parseDate(value) || new Date();
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
  const [timeValue, setTimeValue] = useState(value.includes('T') ? value.slice(11, 16) : '08:00');

  const selectedDate = parseDate(value);
  const todayValue = dateToValue(new Date());
  const selectedValue = selectedDate ? dateToValue(selectedDate) : '';

  useEffect(() => {
    const nextDate = parseDate(value);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- keep the visible month aligned with externally controlled form values
    if (nextDate) setCurrentMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1));
    if (value.includes('T')) setTimeValue(value.slice(11, 16));
  }, [value]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [isOpen]);

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const padding: Array<{ key: string; day?: number }> = Array.from({ length: new Date(year, month, 1).getDay() }, (_, index) => ({ key: `empty-${index}` }));
    const days: Array<{ key: string; day?: number }> = Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, index) => ({
      key: `${year}-${month}-${index + 1}`,
      day: index + 1,
    }));
    return [...padding, ...days];
  }, [currentMonth]);

  const emitValue = (dateValue: string, nextTime = timeValue) => {
    onChange(includeTime ? `${dateValue}T${nextTime || '00:00'}` : dateValue);
  };

  const handleDateSelect = (day: number) => {
    const dateValue = `${currentMonth.getFullYear()}-${pad(currentMonth.getMonth() + 1)}-${pad(day)}`;
    emitValue(dateValue);
    if (!includeTime) setIsOpen(false);
  };

  const handleTimeChange = (nextTime: string) => {
    setTimeValue(nextTime);
    if (/^\d{2}:\d{2}$/.test(nextTime) && selectedValue) emitValue(selectedValue, nextTime);
  };

  const formatTriggerValue = () => {
    if (!selectedDate) return placeholder;
    const dateText = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }).format(selectedDate);
    return includeTime && value.includes('T') ? `${dateText} · ${value.slice(11, 16)}` : dateText;
  };

  const changeMonth = (offset: number) => {
    setCurrentMonth((month) => new Date(month.getFullYear(), month.getMonth() + offset, 1));
  };

  const setToday = () => {
    const today = new Date();
    const nextValue = dateToValue(today);
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    emitValue(nextValue);
  };

  return (
    <div ref={rootRef} className={`custom-date-picker ${className}`} style={style}>
      <button
        ref={triggerRef}
        type="button"
        className="custom-date-picker__trigger"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <CalendarDays size={17} aria-hidden="true" />
        <span className={!selectedDate ? 'is-placeholder' : undefined}>{formatTriggerValue()}</span>
        {value && (
          <span
            className="custom-date-picker__clear"
            role="button"
            tabIndex={0}
            aria-label="ล้างวันที่"
            onClick={(event) => { event.stopPropagation(); onChange(''); }}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onChange(''); } }}
          >
            <X size={14} aria-hidden="true" />
          </span>
        )}
        <ChevronRight className={`custom-date-picker__caret${isOpen ? ' is-open' : ''}`} size={15} aria-hidden="true" />
      </button>

      {isOpen && (
        <div className="custom-date-picker__popover" role="dialog" aria-label="เลือกวันที่">
          <div className="custom-date-picker__header">
            <button type="button" className="custom-date-picker__nav" aria-label="เดือนก่อนหน้า" onClick={() => changeMonth(-1)}><ChevronLeft size={17} /></button>
            <div>
              <strong>{THAI_MONTHS[currentMonth.getMonth()]}</strong>
              <span>{currentMonth.getFullYear() + 543}</span>
            </div>
            <button type="button" className="custom-date-picker__nav" aria-label="เดือนถัดไป" onClick={() => changeMonth(1)}><ChevronRight size={17} /></button>
          </div>

          <div className="custom-date-picker__weekdays">
            {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="custom-date-picker__grid">
            {calendarDays.map((entry) => entry.day ? (
              <button
                key={entry.key}
                type="button"
                className={`custom-date-picker__day${selectedValue === `${currentMonth.getFullYear()}-${pad(currentMonth.getMonth() + 1)}-${pad(entry.day)}` ? ' is-selected' : ''}${todayValue === `${currentMonth.getFullYear()}-${pad(currentMonth.getMonth() + 1)}-${pad(entry.day)}` ? ' is-today' : ''}`}
                onClick={() => handleDateSelect(entry.day!)}
              >
                {entry.day}
              </button>
            ) : <span key={entry.key} aria-hidden="true" />)}
          </div>

          {includeTime && (
            <div className="custom-date-picker__time">
              <label htmlFor={`${selectTimeId(value)}-time`}><Clock3 size={15} /> เวลา</label>
              <input
                id={`${selectTimeId(value)}-time`}
                type="text"
                inputMode="numeric"
                value={timeValue}
                maxLength={5}
                placeholder="08:00"
                onChange={(event) => handleTimeChange(event.target.value.replace(/[^0-9:]/g, '').slice(0, 5))}
                onBlur={() => {
                  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(timeValue)) setTimeValue('08:00');
                }}
              />
            </div>
          )}

          <div className="custom-date-picker__footer">
            <button type="button" onClick={() => onChange('')} disabled={!value}>ล้าง</button>
            <button type="button" onClick={setToday}><Check size={14} /> วันนี้</button>
          </div>
        </div>
      )}
    </div>
  );
};

const selectTimeId = (value: string) => `date-time-${value.replace(/[^0-9]/g, '') || 'picker'}`;

export default DatePicker;
