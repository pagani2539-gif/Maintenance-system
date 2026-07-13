import React from 'react';
import DatePicker from './DatePicker';
import CustomSelect from './Select';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, className = '', id, required, ...props }) => {
  const generatedId = React.useId();
  const inputId = id || generatedId;
  const isCustomDateInput = props.type === 'date' || props.type === 'datetime-local';

  if (isCustomDateInput) {
    const dateValue = props.value == null ? '' : String(props.value);
    return (
      <div className="form-group">
        {label && <label htmlFor={inputId}>{label} {required && <span style={{ color: 'var(--danger)' }}>*</span>}</label>}
        <DatePicker
          value={dateValue}
          includeTime={props.type === 'datetime-local'}
          disabled={props.disabled}
          className={className}
          style={{ width: '100%', ...(props.style || {}) }}
          onChange={(nextValue) => {
            if (!props.onChange) return;
            const syntheticEvent = { target: { value: nextValue, name: props.name || '', id: inputId } } as React.ChangeEvent<HTMLInputElement>;
            props.onChange(syntheticEvent);
          }}
        />
        {error && <span id={`${inputId}-error`} className="form-field-error" role="alert">{error}</span>}
      </div>
    );
  }

  return (
    <div className="form-group">
      {label && <label htmlFor={inputId}>{label} {required && <span style={{ color: 'var(--danger)' }}>*</span>}</label>}
      <input id={inputId} className={`form-control${error ? ' form-control--error' : ''} ${className}`} required={required} {...props} aria-invalid={error ? true : undefined} aria-describedby={error ? `${inputId}-error` : undefined} />
      {error && <span id={`${inputId}-error`} className="form-field-error" role="alert">{error}</span>}
    </div>
  );
};

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const TextArea: React.FC<TextAreaProps> = ({ label, error, className = '', id, required, ...props }) => {
  const generatedId = React.useId();
  const inputId = id || generatedId;
  return (
    <div className="form-group">
      {label && <label htmlFor={inputId}>{label} {required && <span style={{ color: 'var(--danger)' }}>*</span>}</label>}
      <textarea id={inputId} className={`form-control${error ? ' form-control--error' : ''} ${className}`} required={required} {...props} aria-invalid={error ? true : undefined} aria-describedby={error ? `${inputId}-error` : undefined} />
      {error && <span id={`${inputId}-error`} className="form-field-error" role="alert">{error}</span>}
    </div>
  );
};

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label?: string;
  error?: string;
  options?: Array<{ value: string | number; label: string; disabled?: boolean }>;
  triggerStyle?: React.CSSProperties;
  isSearchable?: boolean;
  placeholder?: string;
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
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
  placeholder = 'เลือกตัวเลือก',
  name,
  'aria-label': ariaLabel,
}) => {
  const generatedId = React.useId();
  const inputId = id || generatedId;
  const parsedOptions = React.useMemo(() => {
    if (options.length > 0) return options;
    const parsed: Array<{ value: string | number; label: string; disabled?: boolean }> = [];
    React.Children.forEach(children, (child) => {
      if (!React.isValidElement(child) || child.type !== 'option') return;
      const option = child as React.ReactElement<{ value?: string | number; disabled?: boolean; children?: React.ReactNode }>;
      parsed.push({
        value: option.props.value ?? String(option.props.children ?? ''),
        label: String(option.props.children ?? ''),
        disabled: option.props.disabled,
      });
    });
    return parsed;
  }, [children, options]);

  return (
    <div className="form-group" style={style}>
      {label && <label htmlFor={inputId}>{label} {required && <span style={{ color: 'var(--danger)' }}>*</span>}</label>}
      <CustomSelect
        value={value == null ? '' : String(value)}
        options={parsedOptions}
        placeholder={placeholder}
        disabled={disabled}
        id={inputId}
        name={name}
        ariaLabel={ariaLabel}
        className={className}
        style={triggerStyle}
        onChange={(nextValue) => {
          if (!onChange) return;
          const syntheticEvent = { target: { value: String(nextValue), name: name || '', id: inputId } } as React.ChangeEvent<HTMLSelectElement>;
          onChange(syntheticEvent);
        }}
      />
      {error && <span className="form-field-error" role="alert">{error}</span>}
    </div>
  );
};

export default Input;
