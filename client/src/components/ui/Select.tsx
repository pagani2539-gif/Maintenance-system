import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption {
  label: string;
  value: string | number;
  disabled?: boolean;
}

interface SelectProps {
  value: string | number;
  options: SelectOption[];
  placeholder?: string;
  onChange: (value: string | number) => void;
  icon?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  ariaLabel?: string;
}

/**
 * Project-wide custom select.
 *
 * Keep this component independent from the browser's native <select> popup so
 * filters, forms and table controls share the same visual language everywhere.
 */
export const Select: React.FC<SelectProps> = ({
  value,
  options,
  placeholder = 'เลือกตัวเลือก',
  onChange,
  icon,
  style,
  className = '',
  disabled = false,
  id,
  name,
  ariaLabel,
}) => {
  const generatedId = useId();
  const selectId = id || generatedId;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedIndex = useMemo(
    () => options.findIndex((option) => String(option.value) === String(value)),
    [options, value],
  );
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const enabledIndexes = useMemo(
    () => options.map((option, index) => option.disabled ? -1 : index).filter((index) => index >= 0),
    [options],
  );
  const rootStyle: React.CSSProperties = {
    width: style?.width,
    minWidth: style?.minWidth,
    maxWidth: style?.maxWidth,
    flex: style?.flex,
    flexGrow: style?.flexGrow,
  };

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const moveActive = (direction: 1 | -1) => {
    if (enabledIndexes.length === 0) return;
    const currentPosition = Math.max(0, enabledIndexes.indexOf(activeIndex));
    const nextPosition = (currentPosition + direction + enabledIndexes.length) % enabledIndexes.length;
    setActiveIndex(enabledIndexes[nextPosition]);
  };

  const selectOption = (option: SelectOption) => {
    if (disabled || option.disabled) return;
    onChange(option.value);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen) setIsOpen(true);
      moveActive(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!isOpen) setIsOpen(true);
      else if (options[activeIndex]) selectOption(options[activeIndex]);
    }
  };

  return (
    <div ref={rootRef} className={`app-select app-select--custom ${className}`} style={rootStyle}>
      {name && <input type="hidden" name={name} value={String(value)} />}
      <button
        ref={triggerRef}
        id={selectId}
        type="button"
        className="app-select__trigger"
        style={style}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => {
          if (!isOpen && selectedIndex >= 0) setActiveIndex(selectedIndex);
          setIsOpen((open) => !open);
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        {icon && <span className="app-select__icon" aria-hidden="true">{icon}</span>}
        <span className={!selectedOption ? 'app-select__placeholder' : undefined}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown className={`app-select__chevron${isOpen ? ' is-open' : ''}`} size={16} aria-hidden="true" />
      </button>

      {isOpen && (
        <div className="app-select__menu" role="listbox" aria-labelledby={selectId}>
          {options.length === 0 ? (
            <div className="app-select__empty">ไม่พบตัวเลือก</div>
          ) : options.map((option, index) => {
            const isSelected = selectedIndex === index;
            const isActive = activeIndex === index;
            return (
              <button
                key={`${String(option.value)}-${index}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                className={`app-select__option${isActive ? ' is-active' : ''}${isSelected ? ' is-selected' : ''}`}
                disabled={option.disabled}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectOption(option)}
              >
                <span>{option.label}</span>
                {isSelected && <Check size={15} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Select;
