import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';


interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  className = '',
  id,
  required,
  ...props
}) => {
  const generatedId = React.useId();
  const inputId = id || generatedId;
  return (
    <div className="form-group">
      {label && (
        <label htmlFor={inputId}>
          {label} {required && <span style={{ color: 'var(--danger)' }}>*</span>}
        </label>
      )}
      <input id={inputId} className={`form-control ${className}`} required={required} {...props} />
      {error && <span style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '4px' }}>{error}</span>}
    </div>
  );
};

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const TextArea: React.FC<TextAreaProps> = ({
  label,
  error,
  className = '',
  id,
  required,
  ...props
}) => {
  const generatedId = React.useId();
  const inputId = id || generatedId;
  return (
    <div className="form-group">
      {label && (
        <label htmlFor={inputId}>
          {label} {required && <span style={{ color: 'var(--danger)' }}>*</span>}
        </label>
      )}
      <textarea id={inputId} className={`form-control ${className}`} required={required} {...props} />
      {error && <span style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '4px' }}>{error}</span>}
    </div>
  );
};

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options?: Array<{ value: string | number; label: string; disabled?: boolean }>;
  triggerStyle?: React.CSSProperties;
  isSearchable?: boolean;
  placeholder?: string;
}

export const Select: React.FC<SelectProps> = ({
  label,
  error,
  options = [],
  className = '',
  id,
  required,
  children,
  value,
  onChange,
  disabled,
  style,
  triggerStyle,
  isSearchable = false,
  placeholder,
  ...props
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const generatedId = React.useId();
  const inputId = id || generatedId;
  const labelId = `${inputId}-label`;
  const listboxId = `${inputId}-listbox`;
  const getOptionId = (index: number) => `${inputId}-option-${index}`;

  // Extract options from children if children are passed (e.g. <option>)
  const parsedOptions = React.useMemo(() => {
    if (options && options.length > 0) {
      return options;
    }
    const opts: Array<{ value: string | number; label: string; disabled?: boolean }> = [];
    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child) && child.type === 'option') {
        const optEl = child as React.ReactElement<{ value?: string | number; disabled?: boolean; children?: React.ReactNode }>;
        opts.push({
          value: optEl.props.value !== undefined ? optEl.props.value : (optEl.props.children?.toString() || ''),
          label: optEl.props.children?.toString() || '',
          disabled: optEl.props.disabled,
        });
      }
    });
    return opts;
  }, [options, children]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Find currently selected label
  const selectedOption = parsedOptions.find(opt => opt.value?.toString() === value?.toString());
  const displayLabel = selectedOption ? selectedOption.label : (value?.toString() || '');

  const handleOpen = () => {
    if (disabled) return;
    setIsOpen(true);
    setSearchText(selectedOption ? selectedOption.label : (value?.toString() || ''));
  };

  const handleSelect = (val: string | number, labelText: string) => {
    if (disabled) return;
    setSearchText(labelText);
    if (onChange) {
      const syntheticEvent = {
        target: {
          value: val.toString(),
          name: props.name || '',
          id: inputId,
        }
      } as React.ChangeEvent<HTMLSelectElement>;
      onChange(syntheticEvent);
    }
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchText(val);
    setIsOpen(true);
    
    // Trigger onChange with the typed value
    if (onChange) {
      const syntheticEvent = {
        target: {
          value: val,
          name: props.name || '',
          id: inputId,
        }
      } as React.ChangeEvent<HTMLSelectElement>;
      onChange(syntheticEvent);
    }
  };

  // Filter options based on typed text
  const filteredOptions = React.useMemo(() => {
    if (!isSearchable || !isOpen || !searchText) {
      return parsedOptions;
    }
    const query = searchText.toLowerCase();
    return parsedOptions.filter(opt =>
      opt.label.toLowerCase().includes(query) ||
      opt.value.toString().toLowerCase().includes(query)
    );
  }, [parsedOptions, searchText, isOpen, isSearchable]);

  // Keep the keyboard-highlighted row in range whenever the list changes
  // (opening the dropdown, typing a search query) so arrow keys always land
  // on a real option instead of a stale index. Adjusted during render rather
  // than in an effect (React's "adjusting state when a prop changes"
  // pattern) so it doesn't trigger an extra commit-then-effect render.
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [prevSearchText, setPrevSearchText] = useState(searchText);
  if (isOpen !== prevIsOpen || searchText !== prevSearchText) {
    setPrevIsOpen(isOpen);
    setPrevSearchText(searchText);
    if (isOpen) {
      const selectedIdx = filteredOptions.findIndex(opt => opt.value?.toString() === value?.toString());
      setActiveIndex(selectedIdx >= 0 ? selectedIdx : 0);
    }
  }

  const moveActive = (delta: number) => {
    if (filteredOptions.length === 0) return;
    setActiveIndex(prev => {
      let next = prev;
      for (let step = 0; step < filteredOptions.length; step++) {
        next = (next + delta + filteredOptions.length) % filteredOptions.length;
        if (!filteredOptions[next]?.disabled) break;
      }
      return next;
    });
  };

  // Full keyboard support for the combobox trigger: Enter/Space opens or
  // confirms, arrows move the highlight, Escape closes. Previously this
  // dropdown had no keyboard handling at all, so it could only be opened
  // and chosen from with a mouse.
  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!isOpen) {
          handleOpen();
        } else {
          const opt = filteredOptions[activeIndex];
          if (opt && !opt.disabled) handleSelect(opt.value, opt.label);
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) handleOpen(); else moveActive(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!isOpen) handleOpen(); else moveActive(-1);
        break;
      case 'Escape':
        if (isOpen) {
          e.preventDefault();
          setIsOpen(false);
        }
        break;
      case 'Tab':
        setIsOpen(false);
        break;
      default:
        break;
    }
  };

  return (
    <div className="form-group" style={{ ...style }}>
      {label && (
        <label id={labelId} htmlFor={inputId}>
          {label} {required && <span style={{ color: 'var(--danger)' }}>*</span>}
        </label>
      )}
      <div 
        ref={dropdownRef} 
        className={`custom-select-container ${className}`} 
        style={{ position: 'relative' }}
      >
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            width: '100%',
          }}
        >
          {isSearchable ? (
            <input
              ref={inputRef}
              type="text"
              id={inputId}
              disabled={disabled}
              value={isOpen ? searchText : (displayLabel === 'ทั้งหมด' ? 'ทั้งหมด' : displayLabel)}
              onChange={handleInputChange}
              onFocus={handleOpen}
              onKeyDown={handleTriggerKeyDown}
              role="combobox"
              aria-expanded={isOpen}
              aria-haspopup="listbox"
              aria-controls={listboxId}
              aria-activedescendant={isOpen && filteredOptions[activeIndex] ? getOptionId(activeIndex) : undefined}
              aria-labelledby={label ? labelId : undefined}
              autoComplete="off"
              placeholder={placeholder || 'เลือกหรือพิมพ์ค้นหา...'}
              className="select-trigger"
              style={{
                width: '100%',
                padding: '12px 36px 12px 16px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                cursor: disabled ? 'not-allowed' : 'text',
                fontSize: '0.95rem',
                lineHeight: 1.2,
                color: 'var(--text-main)',
                opacity: disabled ? 0.6 : 1,
                boxSizing: 'border-box',
                transition: 'border-color 0.2s',
                ...triggerStyle
              }}
            />
          ) : (
            <div
              ref={triggerRef}
              id={inputId}
              onClick={() => !disabled && setIsOpen(!isOpen)}
              onKeyDown={handleTriggerKeyDown}
              role="combobox"
              aria-expanded={isOpen}
              aria-haspopup="listbox"
              aria-controls={listboxId}
              aria-activedescendant={isOpen && filteredOptions[activeIndex] ? getOptionId(activeIndex) : undefined}
              aria-labelledby={label ? labelId : undefined}
              tabIndex={disabled ? -1 : 0}
              className="select-trigger"
              style={{
                padding: '12px 16px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                cursor: disabled ? 'not-allowed' : 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.95rem',
                lineHeight: 1.2,
                color: 'var(--text-main)',
                opacity: disabled ? 0.6 : 1,
                width: '100%',
                boxSizing: 'border-box',
                ...triggerStyle
              }}
            >
              <span>{displayLabel}</span>
            </div>
          )}
          <ChevronDown 
            size={16} 
            onClick={(e) => {
              if (disabled) return;
              e.stopPropagation();
              if (isOpen) {
                setIsOpen(false);
              } else {
                handleOpen();
                if (isSearchable) {
                  setTimeout(() => inputRef.current?.focus(), 50);
                } else {
                  setTimeout(() => triggerRef.current?.focus(), 50);
                }
              }
            }}
            style={{ 
              position: 'absolute',
              right: '16px',
              cursor: 'pointer',
              transform: isOpen ? 'rotate(180deg)' : 'none', 
              transition: 'transform 0.2s',
              color: 'var(--text-muted)'
            }} 
          />
        </div>

        {isOpen && (
          <div
            id={listboxId}
            role="listbox"
            aria-labelledby={label ? labelId : undefined}
            style={{
              position: 'absolute',
              top: '110%',
              left: 0,
              minWidth: '100%',
              width: 'max-content',
              maxWidth: '320px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
              zIndex: 1000,
              overflow: 'hidden',
              maxHeight: '250px',
              overflowY: 'auto',
            }}
          >
            {filteredOptions.length === 0 ? (
              <div style={{ padding: '10px 16px', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                ไม่พบข้อมูลตัวเลือก
              </div>
            ) : (
              filteredOptions.map((opt, index) => {
                const isSelected = opt.value?.toString() === value?.toString();
                const isActive = index === activeIndex;
                return (
                  <div
                    key={opt.value}
                    id={getOptionId(index)}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={opt.disabled || undefined}
                    onClick={() => !opt.disabled && handleSelect(opt.value, opt.label)}
                    onMouseEnter={() => setActiveIndex(index)}
                    style={{
                      padding: '10px 16px',
                      cursor: opt.disabled ? 'not-allowed' : 'pointer',
                      fontSize: '0.85rem',
                      color: opt.disabled ? 'var(--text-muted)' : (isSelected ? 'var(--primary)' : 'var(--text-main)'),
                      background: isActive ? 'var(--primary-light)' : 'transparent',
                      borderBottom: index === filteredOptions.length - 1 ? 'none' : '1px solid var(--border)',
                      transition: 'background 0.2s',
                      opacity: opt.disabled ? 0.5 : 1,
                      fontWeight: isSelected ? 700 : 'normal',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                      overflow: 'hidden',
                    }}
                    className="dropdown-item-hover"
                  >
                    {opt.label}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
      {error && <span style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '4px' }}>{error}</span>}
    </div>
  );
};


export default Input;
